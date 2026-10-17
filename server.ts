import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI SDK Server-Side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const ROYAL_POLICY_SYSTEM_PROMPT = `
Bạn là Cố Vấn Nghiệp Vụ Cấp Cao (Senior Academic & Financial Advisor) của Hệ thống Trường Song ngữ Quốc tế Hoàng Gia (Royal School - Extracurricular Department).
Bạn am hiểu sâu sắc và TUÂN THỦ TUYỆT ĐỐI các quy chế ngoại khóa sau đây:

1. QUY ĐỊNH BÁNH SỮA (Milk & Snack Ration):
   - CHỈ cấp phát khẩu phần bánh sữa chiều cho: Học sinh Royal chính khóa HỌC CA CHIỀU THỨ 2 ĐẾN THỨ 6 (khung giờ sau 16h15).
   - KHÔNG cấp phát bánh sữa cho:
     + Các lớp học vào Thứ Bảy (T7) và Chủ Nhật (CN) (bất kể học sinh Royal hay học sinh ngoài).
     + Học sinh ngoài (học sinh từ trường khác đến học ngoại khóa).
     + Các lớp ca sáng trong tuần (nếu có).

2. QUY ĐỊNH CHUYỂN LỚP GIỮA KHÓA (Mid-Term Class Transfer):
   - Giá trị còn lại của môn cũ = (Số buổi chưa học của môn cũ) x (Đơn giá 1 buổi của môn cũ).
   - TRƯỜNG HỢP A: Đơn giá môn mới <= Đơn giá môn cũ:
     + Chuyển ngang số buổi tương ứng sang lớp mới.
     + Nếu có giá trị chênh lệch dôi dư (do đơn giá rẻ hơn), số tiền chênh lệch được bảo lưu vào tài khoản học sinh trên hệ thống.
   - TRƯỜNG HỢP B: Đơn giá môn mới > Đơn giá môn cũ:
     + Quy đổi toàn bộ số tiền còn lại của môn cũ để cấn trừ vào môn mới.
     + Phụ thu học phí = (Số buổi đăng ký ở môn mới x Đơn giá môn mới) - (Giá trị còn lại môn cũ).
     + Công thức chuẩn phụ thu số buổi dôi dư = (Số buổi mới - Số buổi cũ) x Đơn giá mới (hoặc chênh lệch đơn giá x số buổi thực học).

3. QUY ĐỊNH BẢO LƯU HỌC PHÍ (Tuition Freezing / Reservation Policy):
   - ĐIỀU KIỆN TỰ ĐỘNG BẢO LƯU: Học sinh có phép nghỉ liên tiếp từ 3 buổi trở lên (kèm đơn/báo phép hợp lệ).
   - NGUYÊN TẮC TÀI CHÍNH: ĐÓNG BĂNG SỐ DƯ - TUYỆT ĐỐI KHÔNG HOÀN TIỀN MẶT trong mọi trường hợp.
   - THỜI HẠN BẢO LƯU: Đúng 1 năm (365 ngày) kể từ ngày quyết định bảo lưu có hiệu lực.
   - HƯỚNG XỬ LÝ SỐ DƯ:
     + Học sinh Royal chính khóa: Được cấn trừ số dư bảo lưu sang tiền học phí chính khóa hoặc đăng ký khóa ngoại khóa tiếp theo.
     + Học sinh ngoài: Chỉ được dùng để học tiếp các khóa ngoại khóa tại Royal School trong vòng 1 năm. Quá 1 năm số dư tự động tất toán hết hiệu lực.

4. QUY TRÌNH ĐỐI SOÁT GẠCH NỢ VIETQR:
   - Cú pháp chuẩn chuyển khoản: ROYAL [MÃ_HỌC_SINH] [MÃ_PHIẾU_HOẶC_LỚP] (Ví dụ: ROYAL RS-1002 LOP-SWIM01).
   - Quy trình: Quét mã VietQR động -> Khớp số tiền và mã học sinh trên sao kê ngân hàng -> Kế toán xác nhận gạch nợ thủ công 1-click -> Tự động cập nhật trạng thái "Đã thanh toán" & sinh biên lai/phiếu thu.

Hãy trả lời chuyên nghiệp, chuẩn mực ngôn phong sư phạm quốc tế của Royal School, rõ ràng, có căn cứ số liệu và trích dẫn điều khoản chính xác. Nếu người dùng hỏi bài toán tính tiền, hãy trình bày từng bước phép tính (Step-by-step breakdown).
`;

// Multi-turn Gemini Chat Endpoint
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { history = [], message, enableHighThinking = false, role = 'general' } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Nội dung tin nhắn không hợp lệ.' });
      return;
    }

    let roleSpecificPrompt = ROYAL_POLICY_SYSTEM_PROMPT;
    if (role === 'accountant') {
      roleSpecificPrompt += `\n[VAI TRÒ HIỆN TẠI]: Bạn đang trao đổi với tư cách Trưởng Ban Kế toán Tài chính Royal School, tập trung cao độ vào tính toán cấn trừ, đối soát VietQR, công thức phụ thu và nguyên tắc đóng băng số dư không hoàn tiền mặt.`;
    } else if (role === 'kitchen') {
      roleSpecificPrompt += `\n[VAI TRÒ HIỆN TẠI]: Bạn đang trao đổi với tư cách Chuyên viên Điều phối Hậu cần & Bánh sữa, nhấn mạnh điều kiện cấp phát (chỉ T2-T6 ca chiều cho học sinh Royal) và kiểm soát số suất ăn chuẩn xác.`;
    } else if (role === 'academic') {
      roleSpecificPrompt += `\n[VAI TRÒ HIỆN TẠI]: Bạn đang trao đổi với tư cách Trưởng Phòng Học vụ Ngoại khóa, phụ trách mở lớp T2-CN, điều kiện bảo lưu nghỉ phép >= 3 buổi và quy trình chuyển lớp.`;
    }

    // Build contents for generateContent
    const formattedContents = [
      ...history.map((msg: { role: string; text: string }) => ({
        role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }],
      })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    let responseText = '';

    // If High Thinking is requested, use gemini-4-argon with thinkingLevel: HIGH as required
    if (enableHighThinking) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-argon',
          contents: formattedContents,
          config: {
            systemInstruction: roleSpecificPrompt,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
          },
        });
        responseText = response.text || '';
      } catch (argonErr) {
        console.warn('Fallback to gemini-3.8-flash for High Thinking due to error:', argonErr);
        // Fallback to gemini-3.8-flash with HIGH thinking
        const fallbackResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: formattedContents,
          config: {
            systemInstruction: roleSpecificPrompt,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
          },
        });
        responseText = fallbackResponse.text || '';
      }
    } else {
      // General task using gemini-3.8-flash
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: formattedContents,
        config: {
          systemInstruction: roleSpecificPrompt,
        },
      });
      responseText = response.text || '';
    }

    res.json({ reply: responseText });
  } catch (error: any) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({
      error: 'Không thể kết nối với dịch vụ AI: ' + (error?.message || 'Lỗi chưa xác định'),
    });
  }
});

// Endpoint to analyze and generate official memorandum / receipt text
app.post('/api/ai-analyze', async (req: Request, res: Response) => {
  try {
    const { actionType, payload } = req.body;
    const prompt = `
Dựa trên quy chế của Royal School Extracurricular System:
Loại yêu cầu: ${actionType}
Dữ liệu chi tiết: ${JSON.stringify(payload, null, 2)}

Hãy xuất ra bản phân tích hoặc văn bản dự thảo chuẩn xác (nếu là tính chuyển lớp thì có bảng tính chi tiết từng dòng, nếu là hồ sơ bảo lưu thì có lý do, thời hạn bảo lưu 1 năm, phương án cấn trừ học phí chính khóa, nếu là đối soát thì có nhận xét khớp lệnh).
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: ROYAL_POLICY_SYSTEM_PROMPT,
      },
    });

    res.json({ result: response.text || '' });
  } catch (err: any) {
    console.error('AI analyze error:', err);
    res.status(500).json({ error: err?.message || 'Lỗi phân tích AI' });
  }
});

// Dev vs Prod Vite handling
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Royal School Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
