// Hàm serverless của Vercel: chạy toàn bộ máy chủ Express (server.ts) cho mọi đường dẫn /api/*.
// vercel.json chuyển tiếp /api/* về hàm này; Express vẫn thấy đường dẫn gốc (ví dụ /api/admin/create-user).
import app from '../server';

export default function handler(req: any, res: any) {
  // Vercel đã đọc và parse sẵn body. Đánh dấu để express.json()/urlencoded() bỏ qua,
  // tránh đọc lại luồng dữ liệu đã cạn (gây treo yêu cầu).
  if (req.body !== undefined && req.body !== null) {
    req._body = true;
  }
  return (app as any)(req, res);
}
