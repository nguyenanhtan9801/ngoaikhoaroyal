import React from 'react';
import { X, Printer, QrCode } from 'lucide-react';
import { TuitionInvoice, MakeupCredit, Student, ExtracurricularClass } from '../types';
import { formatVND } from '../lib/storage';
import { RoyalLogo } from './RoyalLogo';

export type PrintDocumentType = 
  | { type: 'receipt'; invoice: TuitionInvoice; student?: Student; cls?: ExtracurricularClass }
  | { type: 'attendance_book'; cls: ExtracurricularClass; sessionDate: string; students: Student[] }
  | { type: 'credit_slip'; credit: MakeupCredit; student?: Student; cls?: ExtracurricularClass }
  | { type: 'snack_slip'; campusName: string; termName: string; totalAllocated: number; totalConsumed: number; totalReturned: number }
  | { type: 'student_card'; student: Student };

interface PrintModalProps {
  document: PrintDocumentType | null;
  onClose: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({ document, onClose }) => {
  if (!document) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-3xl bg-white text-slate-900 shadow-2xl overflow-hidden border border-slate-300">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="no-print p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-bold">Xem Trước Bản In (Print Preview / Print to PDF)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4 text-slate-950" />
              <span>In Ngay (Ctrl + P)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet Container */}
        <div className="p-8 sm:p-12 overflow-y-auto flex-1 font-sans text-slate-900 bg-white">
          
          {/* Header of School */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase font-extrabold tracking-widest text-amber-600">
                ROYAL INTERNATIONAL BILINGUAL SCHOOL
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                TRƯỜNG SONG NGỮ QUỐC TẾ HOÀNG GIA
              </h1>
              <p className="text-xs text-slate-600 mt-0.5">
                Trung tâm Ngoại khóa & Phát triển Tài năng Hoàng Gia
              </p>
            </div>

            <RoyalLogo size="xl" />
          </div>

          {/* DOCUMENT 1: TUITION RECEIPT */}
          {document.type === 'receipt' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-extrabold uppercase tracking-wide">
                  BIÊN LAI THU TIỀN HỌC PHÍ NGOẠI KHÓA
                </h2>
                <div className="text-xs text-slate-500 mt-1 font-mono">
                  Số phiếu: <strong>{document.invoice.invoice_code}</strong> &bull; Ngày lập: {document.invoice.created_at}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <div>
                  <div className="text-slate-500">Học viên:</div>
                  <div className="font-bold text-sm text-slate-900">{document.student?.name}</div>
                  <div className="font-mono text-slate-600">Mã HV: {document.student?.code}</div>
                  <div className="text-slate-600">Lớp chính khóa: {document.student?.regular_class || 'N/A'}</div>
                </div>

                <div>
                  <div className="text-slate-500">Phụ huynh nộp:</div>
                  <div className="font-bold text-sm text-slate-900">{document.student?.parent_name}</div>
                  <div className="font-mono text-slate-600">SĐT: {document.student?.parent_phone}</div>
                  <div className="text-slate-600">Mã GD ngân hàng: {document.invoice.payment_reference || 'TIỀN MẶT / CHUYỂN KHOẢN'}</div>
                </div>
              </div>

              <table className="w-full text-xs border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="p-3 text-left">Nội Dung Thu</th>
                    <th className="p-3 text-center">Số Buổi</th>
                    <th className="p-3 text-right">Đơn Giá / Buổi</th>
                    <th className="p-3 text-right">Thành Tiền</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="p-3">
                      <div className="font-bold">{document.cls?.name}</div>
                      <div className="text-[11px] text-slate-500">Khóa Ngoại Khóa Hoàng Gia</div>
                    </td>
                    <td className="p-3 text-center font-mono">{document.cls?.total_sessions}</td>
                    <td className="p-3 text-right font-mono">{formatVND(document.cls?.price_per_session || 0)}</td>
                    <td className="p-3 text-right font-mono font-bold">{formatVND(document.invoice.gross_amount)}</td>
                  </tr>

                  {document.invoice.credit_deducted > 0 && (
                    <tr className="border-b border-slate-200 bg-amber-50">
                      <td colSpan={3} className="p-3 text-amber-800 font-semibold italic">
                        Cấn trừ từ Phiếu Bảo Lưu Học Phí
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-800">
                        -{formatVND(document.invoice.credit_deducted)}
                      </td>
                    </tr>
                  )}

                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={3} className="p-3 text-right text-slate-800">TỔNG TIỀN ĐÃ THU (VND):</td>
                    <td className="p-3 text-right font-mono text-base text-slate-950 font-black">
                      {formatVND(document.invoice.paid_amount || document.invoice.net_payable)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Sign-off Boxes */}
              <div className="grid grid-cols-3 gap-6 pt-8 text-center text-xs">
                <div>
                  <div className="font-bold uppercase">Người Nộp Tiền</div>
                  <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký và ghi rõ họ tên)</div>
                  <div className="h-20"></div>
                  <div className="font-semibold text-slate-700">{document.student?.parent_name}</div>
                </div>

                <div>
                  <div className="font-bold uppercase">Người Thu Tiền / Học Vụ</div>
                  <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký và ghi rõ họ tên)</div>
                  <div className="h-20"></div>
                  <div className="font-semibold text-slate-700">{document.invoice.verified_by || 'Kế toán Trường'}</div>
                </div>

                <div>
                  <div className="font-bold uppercase">Hiệu Trưởng / Phê Duyệt</div>
                  <div className="text-[10px] text-slate-500 italic mt-0.5">(Đóng dấu & ký tên)</div>
                  <div className="h-20"></div>
                  <div className="font-semibold text-slate-700">BAN GIÁM HIỆU ROYAL</div>
                </div>
              </div>
            </div>
          )}

          {/* DOCUMENT 2: ATTENDANCE BOOK */}
          {document.type === 'attendance_book' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-extrabold uppercase tracking-wide">
                  SỔ ĐIỂM DANH & THEO DÕI CHUYÊN CẦN
                </h2>
                <div className="text-xs text-slate-600 mt-1">
                  Lớp: <strong className="text-slate-900">{document.cls.name}</strong> &bull; Ngày: <strong className="font-mono">{document.sessionDate}</strong>
                </div>
              </div>

              <table className="w-full text-xs border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="p-2.5 text-center">STT</th>
                    <th className="p-2.5 text-left">Mã HV</th>
                    <th className="p-2.5 text-left">Họ và Tên Học Viên</th>
                    <th className="p-2.5 text-center">Diện Học Sinh</th>
                    <th className="p-2.5 text-center">Điểm Danh</th>
                    <th className="p-2.5 text-left">Chữ Ký Học Viên / Ghi Chú</th>
                  </tr>
                </thead>
                <tbody>
                  {document.students.map((st, idx) => (
                    <tr key={st.id} className="border-b border-slate-200">
                      <td className="p-2.5 text-center font-mono">{idx + 1}</td>
                      <td className="p-2.5 font-mono font-bold">{st.code}</td>
                      <td className="p-2.5 font-bold">{st.name}</td>
                      <td className="p-2.5 text-center">
                        {st.is_royal_student ? 'Royal (Suất bánh sữa)' : 'Ngoài trường'}
                      </td>
                      <td className="p-2.5 text-center font-bold">
                        [ &nbsp; ] Có mặt &nbsp;&nbsp; [ &nbsp; ] Vắng CP &nbsp;&nbsp; [ &nbsp; ] Vắng KP
                      </td>
                      <td className="p-2.5 text-slate-400">................................................</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs">
                <div>
                  <div className="font-bold uppercase">Giáo Viên Bộ Môn</div>
                  <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký và ghi rõ họ tên)</div>
                  <div className="h-20"></div>
                </div>

                <div>
                  <div className="font-bold uppercase">Bộ Phận Học Vụ Kiểm Soát</div>
                  <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký và đóng dấu)</div>
                  <div className="h-20"></div>
                </div>
              </div>
            </div>
          )}

          {/* DOCUMENT 3: MAKEUP CREDIT SLIP */}
          {document.type === 'credit_slip' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-extrabold uppercase tracking-wide">
                  PHIẾU XÁC NHẬN BẢO LƯU HỌC PHÍ NGOẠI KHÓA
                </h2>
                <div className="text-xs text-slate-500 mt-1 font-mono">
                  Mã phiếu: <strong>{document.credit.credit_code}</strong> &bull; Ngày cấp: {document.credit.issue_date}
                </div>
              </div>

              <div className="border border-slate-300 rounded-2xl p-4 bg-slate-50 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Họ tên học viên:</span>
                  <span className="font-bold text-slate-900">{document.student?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Mã học viên:</span>
                  <span className="font-mono font-bold text-slate-900">{document.student?.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Lớp học phát sinh vắng có phép:</span>
                  <span className="font-bold text-slate-900">{document.cls?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Số buổi vắng liên tiếp (≥ 3 buổi):</span>
                  <span className="font-bold text-amber-700">{document.credit.consecutive_absent_count} buổi</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Các ngày vắng học:</span>
                  <span className="font-mono text-slate-900">{document.credit.consecutive_dates.join(', ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Đơn giá buổi cũ:</span>
                  <span className="font-mono font-bold text-slate-900">{formatVND(document.credit.source_rate)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-300 pt-2 text-sm">
                  <span className="font-bold text-slate-900">Tổng tiền bảo lưu cấn trừ khóa sau:</span>
                  <span className="font-mono font-extrabold text-amber-700">{formatVND(document.credit.total_credit_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Thời hạn hiệu lực (365 ngày):</span>
                  <span className="font-mono font-bold text-slate-900">Đến hết ngày {document.credit.expiry_date}</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 italic leading-relaxed">
                * Quy định bảo lưu: Phiếu bảo lưu chỉ áp dụng cấn trừ vào môn học ở khóa học sau, không hoàn trả tiền mặt. Hết thời hạn 1 năm kể từ ngày cấp, phiếu tự động hết giá trị sử dụng.
              </div>

              <div className="grid grid-cols-3 gap-4 pt-6 text-center text-xs">
                <div>
                  <div className="font-bold uppercase">Phụ Huynh Học Sinh</div>
                  <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký xác nhận)</div>
                  <div className="h-20"></div>
                </div>

                <div>
                  <div className="font-bold uppercase">Nhân Viên Học Vụ Lập Phiếu</div>
                  <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký và ghi họ tên)</div>
                  <div className="h-20"></div>
                </div>

                <div>
                  <div className="font-bold uppercase">Ban Giám Hiệu Phê Duyệt</div>
                  <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký và đóng dấu)</div>
                  <div className="h-20"></div>
                </div>
              </div>
            </div>
          )}

          {/* DOCUMENT 4: SNACKS SLIP */}
          {document.type === 'snack_slip' && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-extrabold uppercase tracking-wide">
                  BIÊN BẢN ĐỐI SOÁT SUẤT BÁNH SỮA BẾP TRUNG TÂM
                </h2>
                <div className="text-xs text-slate-600 mt-1">
                  Cơ sở: <strong>{document.campusName}</strong> &bull; Niên khóa: <strong>{document.termName}</strong>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center text-xs">
                <div className="p-4 border rounded-2xl bg-slate-50">
                  <div className="text-slate-500">Tổng Suất Cấp (Học Sinh Royal):</div>
                  <div className="text-2xl font-black font-mono mt-1">{document.totalAllocated}</div>
                </div>
                <div className="p-4 border rounded-2xl bg-emerald-50">
                  <div className="text-emerald-700">Thực Tế Tiêu Thụ:</div>
                  <div className="text-2xl font-black font-mono text-emerald-800 mt-1">{document.totalConsumed}</div>
                </div>
                <div className="p-4 border rounded-2xl bg-amber-50">
                  <div className="text-amber-700">Hoàn Trả Kho/Bếp:</div>
                  <div className="text-2xl font-black font-mono text-amber-800 mt-1">{document.totalReturned}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-8 text-center text-xs">
                <div>
                  <div className="font-bold uppercase">Bếp Trưởng / Thủ Kho</div>
                  <div className="h-20"></div>
                </div>
                <div>
                  <div className="font-bold uppercase">Học Vụ Ngoại Khóa</div>
                  <div className="h-20"></div>
                </div>
                <div>
                  <div className="font-bold uppercase">Kế Toán Kiểm Soát</div>
                  <div className="h-20"></div>
                </div>
              </div>
            </div>
          )}

          {/* DOCUMENT 5: STUDENT CARD */}
          {document.type === 'student_card' && (
            <div className="max-w-md mx-auto border-2 border-amber-600 rounded-3xl p-6 bg-gradient-to-br from-amber-50 via-white to-amber-50 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-amber-200 pb-3">
                <div>
                  <div className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">ROYAL SCHOOL</div>
                  <div className="font-black text-sm text-slate-900">THẺ HỌC VIÊN NGOẠI KHÓA</div>
                </div>
                <RoyalLogo size="sm" />
              </div>

              <div className="flex items-center gap-4">
                <div className="w-24 h-28 rounded-2xl bg-slate-200 border-2 border-slate-300 flex items-center justify-center font-bold text-slate-400 text-xs">
                  Ảnh 3x4
                </div>

                <div className="space-y-1 text-xs">
                  <div className="font-black text-base text-slate-900">{document.student.name}</div>
                  <div className="font-mono font-bold text-amber-700">{document.student.code}</div>
                  <div className="text-slate-600">Lớp: {document.student.regular_class || 'Royal School'}</div>
                  <div className="text-slate-600">PH: {document.student.parent_phone}</div>
                  {document.student.is_royal_student ? (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                      Học sinh Royal (Có suất bánh sữa)
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px]">
                      Học sinh ngoài trường
                    </span>
                  )}
                </div>
              </div>

              {document.student.medical_notes && (
                <div className="p-2 rounded-xl bg-rose-100 text-rose-800 text-[10px] font-semibold">
                  Lưu ý sức khỏe: {document.student.medical_notes}
                </div>
              )}

              <div className="pt-2 border-t border-amber-200 text-center text-[10px] text-slate-500 font-mono">
                Thẻ có giá trị vào lớp và nhận suất ăn nhẹ sau giờ học
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
