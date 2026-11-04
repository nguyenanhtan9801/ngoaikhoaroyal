import React from 'react';
import { Printer, X, GraduationCap, CheckCircle } from 'lucide-react';
import { TuitionInvoice, MakeupCredit, ClassSession, ClassItem, Student } from '../../types';
import { AppState } from '../../services/storage';

export type PrintDocumentType = 'invoice' | 'credit' | 'snack' | 'attendance_sheet';

interface PrintModalProps {
  type: PrintDocumentType;
  data: any;
  state: AppState;
  onClose: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  type,
  data,
  state,
  onClose
}) => {
  const handlePrint = () => {
    window.print();
  };

  const todayStr = '14/10/2026';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      
      {/* Outer Modal Container */}
      <div className="w-full max-w-3xl bg-[#111827] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4 my-8">
        
        {/* Top Control Bar (Hidden during print) */}
        <div className="no-print flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-extrabold text-white">Xem Trước & In Biểu Mẫu Chuẩn Hoàng Gia</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>In Ngay / Xuất PDF</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* The Printable Area (Styled clean white on paper) */}
        <div 
          id="printable-content"
          className="print-card bg-white text-black p-8 sm:p-10 rounded-2xl shadow-xl font-sans text-xs space-y-6"
        >
          
          {/* Header of Official Royal Document */}
          <div className="flex items-start justify-between border-b-2 border-amber-600 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-wider text-amber-800">ROYAL SCHOOL</span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-600">
                  HỆ THỐNG NGOẠI KHÓA HOÀNG GIA
                </span>
              </div>
              <p className="text-[11px] text-gray-600">
                Trường Song Ngữ Quốc Tế Hoàng Gia &bull; Hotline: 028 7100 7878
              </p>
              <p className="text-[10px] text-gray-500">
                08 Đặng Đại Độ, P. Tân Phong, Quận 7, TP.HCM &bull; Cơ sở Nam Sài Gòn, Bình Chánh
              </p>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-gray-500 font-mono">BM-ROYAL-EXT-2026</div>
              <div className="text-[11px] font-bold text-gray-700 mt-1">Ngày lập: {todayStr}</div>
            </div>
          </div>

          {/* DOCUMENT BODY: TYPE 1 - INVOICE */}
          {type === 'invoice' && (() => {
            const inv = data as TuitionInvoice;
            const stu = state.students.find(s => s.id === inv.student_id);
            const cl = state.classes.find(c => c.id === inv.class_id);

            return (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-black uppercase tracking-wide text-gray-900">
                    BIÊN LAI THU HỌC PHÍ NGOẠI KHÓA
                  </h2>
                  <p className="text-[11px] font-mono text-amber-800 font-bold">
                    Mã Hóa Đơn: {inv.invoice_code}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <div>
                    <div><strong>Họ và tên học sinh:</strong> {stu?.name}</div>
                    <div><strong>Mã học sinh:</strong> <span className="font-mono">{stu?.code}</span></div>
                    <div><strong>Phân loại:</strong> {stu?.is_royal_student ? 'Học sinh Royal' : 'Học sinh ngoài'}</div>
                  </div>
                  <div>
                    <div><strong>Lớp ngoại khóa:</strong> {cl?.name}</div>
                    <div><strong>Phụ huynh nộp:</strong> {stu?.parent_name}</div>
                    <div><strong>Số điện thoại:</strong> {stu?.parent_phone}</div>
                  </div>
                </div>

                <table className="w-full text-left border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100 font-bold">
                      <th className="p-2 border border-gray-300">Nội dung thanh toán</th>
                      <th className="p-2 border border-gray-300 text-right">Học phí gốc</th>
                      <th className="p-2 border border-gray-300 text-right">Bảo lưu khấu trừ</th>
                      <th className="p-2 border border-gray-300 text-right">Thực thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-2 border border-gray-300">
                        {cl?.name} (Khóa 30 buổi chuẩn)
                      </td>
                      <td className="p-2 border border-gray-300 text-right font-mono">
                        {inv.gross_amount.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="p-2 border border-gray-300 text-right font-mono text-red-600">
                        {inv.credit_deducted > 0 ? `-${inv.credit_deducted.toLocaleString('vi-VN')} đ` : '0 đ'}
                      </td>
                      <td className="p-2 border border-gray-300 text-right font-mono font-bold text-emerald-700">
                        {inv.paid_amount.toLocaleString('vi-VN')} đ
                      </td>
                    </tr>
                  </tbody>
                </table>

                {inv.payment_reference && (
                  <div className="text-[11px] text-gray-600">
                    Mã giao dịch ngân hàng / Ủy nhiệm chi: <strong>{inv.payment_reference}</strong>
                  </div>
                )}
              </div>
            );
          })()}

          {/* DOCUMENT BODY: TYPE 2 - CREDIT VOUCHER */}
          {type === 'credit' && (() => {
            const cred = data as MakeupCredit;
            const stu = state.students.find(s => s.id === cred.student_id);
            const cl = state.classes.find(c => c.id === cred.source_class_id);

            return (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-black uppercase tracking-wide text-gray-900">
                    PHIẾU BẢO LƯU HỌC PHÍ NGOẠI KHÓA (CHUYỂN KHÓA SAU)
                  </h2>
                  <p className="text-[11px] font-mono text-amber-800 font-bold">
                    Số Phiếu: {cred.credit_code}
                  </p>
                </div>

                <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div><strong>Học sinh:</strong> {stu?.name}</div>
                      <div><strong>Mã định danh:</strong> <span className="font-mono">{stu?.code}</span></div>
                    </div>
                    <div>
                      <div><strong>Lớp học nguồn:</strong> {cl?.name}</div>
                      <div><strong>Số buổi vắng có phép liên tiếp:</strong> {cred.consecutive_absent_count} buổi</div>
                    </div>
                  </div>
                  <div>
                    <strong>Ngày các buổi nghỉ:</strong> {cred.consecutive_dates.join(', ')}
                  </div>
                </div>

                <div className="border border-gray-300 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span>Quy tắc cấn trừ khóa sau:</span>
                    <strong className="text-amber-800">
                      {cred.credit_rule === 'monetary' ? 'Bảo lưu theo số tiền thực tế' : 'Bảo lưu theo số buổi học'}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-base font-bold">
                    <span>Giá trị bảo lưu được cấn trừ:</span>
                    <span className="font-mono text-emerald-700 text-lg">
                      {cred.total_credit_amount.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-red-600 font-semibold pt-1 border-t border-gray-200">
                    <span>Hạn sử dụng hiệu lực (365 ngày):</span>
                    <span>Đến ngày {cred.expiry_date}</span>
                  </div>
                </div>

                <p className="text-[10px] text-gray-500 italic">
                  * Ghi chú: Phiếu có giá trị cấn trừ vào các khóa học kế tiếp tại Royal School. Hết thời hạn 1 năm phiếu sẽ tự động hủy theo quy chế tài chính.
                </p>
              </div>
            );
          })()}

          {/* DOCUMENT BODY: TYPE 3 - SNACK PANTRY SLIP */}
          {type === 'snack' && (() => {
            const dateStr = data as string || '2026-10-14';
            const sessionsOnDate = state.sessions.filter(s => s.session_date === dateStr);
            const totalAllocated = sessionsOnDate.reduce((sum, s) => sum + s.snacks_allocated, 0);
            const totalConsumed = sessionsOnDate.reduce((sum, s) => sum + s.snacks_consumed, 0);
            const totalReturned = sessionsOnDate.reduce((sum, s) => sum + s.snacks_returned, 0);

            return (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-black uppercase tracking-wide text-gray-900">
                    PHIẾU ĐỐI SOÁT SUẤT BÁNH SỮA VỚI BẾP ĂN
                  </h2>
                  <p className="text-[11px] text-gray-600">
                    Ngày điểm danh & đối soát: <strong>{dateStr}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200 text-center">
                  <div>
                    <span className="text-[10px] text-gray-500 block">Cấp Ban Đầu</span>
                    <strong className="text-lg text-gray-900">{totalAllocated} suất</strong>
                    <span className="text-[9px] text-gray-400 block">(Sĩ số Royal)</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-600 block">Đã Tiêu Thụ</span>
                    <strong className="text-lg text-emerald-700">{totalConsumed} suất</strong>
                    <span className="text-[9px] text-gray-400 block">(Có mặt + Vắng KP)</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-600 block">Hoàn Trả Kho Bếp</span>
                    <strong className="text-lg text-amber-700">{totalReturned} suất</strong>
                    <span className="text-[9px] text-gray-400 block">(Vắng có phép)</span>
                  </div>
                </div>

                <table className="w-full text-left border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100 font-bold">
                      <th className="p-2 border border-gray-300">Lớp ngoại khóa</th>
                      <th className="p-2 border border-gray-300 text-center">Cấp</th>
                      <th className="p-2 border border-gray-300 text-center">Tiêu thụ</th>
                      <th className="p-2 border border-gray-300 text-center">Hoàn trả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionsOnDate.map((s, i) => {
                      const cl = state.classes.find(c => c.id === s.class_id);
                      return (
                        <tr key={i}>
                          <td className="p-2 border border-gray-300 font-semibold">{cl?.name}</td>
                          <td className="p-2 border border-gray-300 text-center font-mono">{s.snacks_allocated}</td>
                          <td className="p-2 border border-gray-300 text-center font-mono text-emerald-700 font-bold">{s.snacks_consumed}</td>
                          <td className="p-2 border border-gray-300 text-center font-mono text-amber-700 font-bold">{s.snacks_returned}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* OFFICIAL SIGNATURE BOXES (BẮT BUỘC THEO QUY CHUẨN) */}
          <div className="pt-8 grid grid-cols-3 gap-6 text-center text-xs">
            <div className="space-y-12">
              <span className="font-bold text-gray-800 uppercase block">Người Lập Biểu / GV</span>
              <span className="text-gray-400 italic block">(Ký và ghi rõ họ tên)</span>
            </div>

            <div className="space-y-12">
              <span className="font-bold text-gray-800 uppercase block">Bộ Phận Học Vụ / Kế Toán</span>
              <span className="text-gray-400 italic block">(Ký và đóng dấu xác nhận)</span>
            </div>

            <div className="space-y-12">
              <span className="font-bold text-gray-800 uppercase block">Phụ Huynh / Người Nhận</span>
              <span className="text-gray-400 italic block">(Ký và ghi rõ họ tên)</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
