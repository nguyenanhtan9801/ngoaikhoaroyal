import React from 'react';
import { X, Printer, QrCode, User } from 'lucide-react';
import { TuitionInvoice, MakeupCredit, Student, ExtracurricularClass, ClassTransfer } from '../types';
import { formatVND } from '../lib/storage';
import { RoyalLogo } from './RoyalLogo';

export type PrintDocumentType = 
  | { type: 'receipt'; invoice: TuitionInvoice; student?: Student; cls?: ExtracurricularClass }
  | { type: 'attendance_book'; cls: ExtracurricularClass; sessionDate: string; students: Student[] }
  | { type: 'credit_slip'; credit: MakeupCredit; student?: Student; cls?: ExtracurricularClass }
  | { type: 'snack_slip'; campusName: string; termName: string; totalAllocated: number; totalConsumed: number; totalReturned: number }
  | { type: 'student_card'; student: Student }
  | {
      type: 'transfer_agreement';
      transfer: ClassTransfer;
      student?: Student;
      fromClass?: ExtracurricularClass;
      toClass?: ExtracurricularClass;
      fromCampusName?: string;
      toCampusName?: string;
      fromSubjectName?: string;
      toSubjectName?: string;
    };

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
                      <div className="text-[11px] text-slate-600">
                        {document.invoice.prorated_note || 'Khóa Ngoại Khóa Hoàng Gia'}
                      </div>
                    </td>
                    <td className="p-3 text-center font-mono font-bold">
                      {document.invoice.registered_sessions
                        ? `${document.invoice.registered_sessions}/${document.invoice.total_class_sessions || document.cls?.total_sessions || 24}`
                        : document.cls?.total_sessions}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatVND(document.invoice.session_rate || document.cls?.price_per_session || 0)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">{formatVND(document.invoice.gross_amount)}</td>
                  </tr>

                  {(document.invoice.discount_amount ?? 0) > 0 && (
                    <tr className="border-b border-slate-200 bg-amber-50/60">
                      <td colSpan={3} className="p-3 text-amber-900 font-semibold italic">
                        Ưu đãi học phí theo chính sách trường (Giảm trên số buổi thực học)
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-900">
                        -{formatVND(document.invoice.discount_amount || 0)}
                      </td>
                    </tr>
                  )}

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

                  <tr className="bg-slate-50 font-bold border-b border-slate-200">
                    <td colSpan={3} className="p-3 text-right text-slate-800">SỐ TIỀN PHẢI NỘP BAN ĐẦU:</td>
                    <td className="p-3 text-right font-mono text-sm text-slate-950 font-black">
                      {formatVND(document.invoice.net_payable)}
                    </td>
                  </tr>

                  <tr className="bg-emerald-50 font-bold border-b border-slate-200">
                    <td colSpan={3} className="p-3 text-right text-emerald-800">TỔNG LŨY KẾ ĐÃ THU:</td>
                    <td className="p-3 text-right font-mono text-base text-emerald-700 font-black">
                      {formatVND(document.invoice.paid_amount || 0)}
                    </td>
                  </tr>

                  <tr className="bg-slate-50 font-bold">
                    <td colSpan={3} className="p-3 text-right text-slate-800">CÔNG NỢ CÒN LẠI:</td>
                    <td className={`p-3 text-right font-mono text-base font-black ${document.invoice.outstanding_amount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatVND(document.invoice.outstanding_amount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Chi tiết các đợt đã đóng nếu có */}
              {document.invoice.payment_history && document.invoice.payment_history.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Chi Tiết Lịch Sử Các Đợt Đã Nộp Tiền ({document.invoice.payment_history.length} đợt)
                  </div>
                  <table className="w-full text-[11px] border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold">
                        <th className="p-2 border border-slate-300 text-center">Đợt</th>
                        <th className="p-2 border border-slate-300">Ngày nộp</th>
                        <th className="p-2 border border-slate-300 text-right">Số tiền nộp</th>
                        <th className="p-2 border border-slate-300">Hình thức</th>
                        <th className="p-2 border border-slate-300">Mã GD / Sao kê</th>
                        <th className="p-2 border border-slate-300">Kế toán xác nhận</th>
                        <th className="p-2 border border-slate-300">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {document.invoice.payment_history.map((record, idx) => (
                        <tr key={record.id || idx} className="border-b border-slate-200">
                          <td className="p-2 border border-slate-300 text-center font-bold">Đợt {idx + 1}</td>
                          <td className="p-2 border border-slate-300 font-mono">{record.payment_date}</td>
                          <td className="p-2 border border-slate-300 text-right font-mono font-bold text-emerald-700">
                            {formatVND(record.amount)}
                          </td>
                          <td className="p-2 border border-slate-300">
                            {record.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản (VietQR)'}
                          </td>
                          <td className="p-2 border border-slate-300 font-mono text-slate-700">
                            {record.payment_reference}
                          </td>
                          <td className="p-2 border border-slate-300 font-medium">{record.verified_by}</td>
                          <td className="p-2 border border-slate-300 text-slate-600 italic">{record.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

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
                {document.student.avatar_url ? (
                  <img
                    src={document.student.avatar_url}
                    alt={document.student.name}
                    className="w-24 h-28 rounded-2xl object-cover border-2 border-amber-600 shadow-sm"
                  />
                ) : (
                  <div className="w-24 h-28 rounded-2xl bg-slate-200 border-2 border-slate-300 flex flex-col items-center justify-center font-bold text-slate-400 text-xs text-center p-1">
                    <User className="w-6 h-6 text-slate-400 mb-1" />
                    <span>Ảnh 3x4</span>
                    <span className="text-[9px] font-normal text-slate-500">(Chưa tải)</span>
                  </div>
                )}

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

          {/* DOCUMENT 6: TRANSFER AGREEMENT (BIÊN BẢN CHUYỂN MÔN & LỚP NGOẠI KHÓA) */}
          {document.type === 'transfer_agreement' && (
            <div className="space-y-6 text-slate-900 text-xs leading-relaxed">
              <div className="text-center space-y-1">
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wide text-slate-900">
                  BIÊN BẢN CHUYỂN MÔN & LỚP NGOẠI KHÓA
                </h2>
                <div className="text-xs uppercase font-bold text-amber-700 tracking-wider">
                  COURSE &amp; CLASS TRANSFER AGREEMENT
                </div>
                <div className="text-[11px] text-slate-500 font-mono pt-1">
                  Số / No: <strong className="text-slate-900">{document.transfer.transfer_code || document.transfer.id}</strong> &bull; Ngày lập / Date: {document.transfer.transfer_date}
                </div>
              </div>

              {/* I. THÔNG TIN HỌC VIÊN */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/80 space-y-2">
                <div className="font-bold text-slate-900 uppercase text-[11px] border-b border-slate-200 pb-1 flex items-center justify-between">
                  <span>I. THÔNG TIN HỌC VIÊN / STUDENT INFORMATION</span>
                  <span className="font-mono text-slate-500 font-normal">Hệ Ngoại Khóa Royal School</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Họ và tên học sinh:</span>
                    <strong className="text-sm text-slate-900">{document.student?.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Mã học sinh:</span>
                    <span className="font-mono font-bold text-amber-700">{document.student?.code}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Lớp chính khóa:</span>
                    <span className="font-semibold text-slate-800">{document.student?.regular_class || 'Royal School'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Họ tên phụ huynh:</span>
                    <span className="font-semibold text-slate-800">{document.student?.parent_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Số điện thoại liên hệ:</span>
                    <span className="font-mono font-bold text-slate-800">{document.student?.parent_phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Đối tượng học sinh:</span>
                    <span className="font-semibold text-slate-800">
                      {document.student?.is_royal_student ? 'Học sinh chính khóa Royal School' : 'Học sinh ngoài trường'}
                    </span>
                  </div>
                </div>
              </div>

              {/* II. CHI TIẾT CHUYỂN LỚP */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden space-y-0">
                <div className="bg-slate-100 p-2.5 font-bold text-slate-900 uppercase text-[11px] border-b border-slate-200">
                  II. CHI TIẾT ĐIỀU CHUYỂN LỚP HỌC / TRANSFER DETAILS
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                  {/* From Class */}
                  <div className="p-4 space-y-2 bg-white">
                    <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-1">
                      <span className="font-bold text-slate-600 uppercase text-[10px]">LỚP CHUYỂN ĐI (FROM CLASS)</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">Lớp cũ</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Tên lớp học:</span>
                      <strong className="text-slate-900">{document.fromClass?.name}</strong>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Cơ sở đào tạo:</span>
                        <span>{document.fromCampusName || 'Royal School PMH'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Đơn giá buổi cũ:</span>
                        <span className="font-mono font-bold text-slate-900">{formatVND(document.transfer.old_session_rate)}/b</span>
                      </div>
                    </div>
                    <div className="pt-1 text-[11px] text-slate-600">
                      Số buổi chuyển đi: <strong className="font-mono text-slate-900">{document.transfer.remaining_sessions} buổi</strong>
                    </div>
                  </div>

                  {/* To Class */}
                  <div className="p-4 space-y-2 bg-amber-50/30">
                    <div className="flex items-center justify-between border-b border-dashed border-amber-200 pb-1">
                      <span className="font-bold text-amber-800 uppercase text-[10px]">LỚP CHUYỂN ĐẾN (TO CLASS)</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">Lớp mới</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Tên lớp học:</span>
                      <strong className="text-slate-900">{document.toClass?.name}</strong>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Cơ sở tiếp nhận:</span>
                        <span className="font-bold text-amber-900">{document.toCampusName || 'Royal School'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Đơn giá buổi mới:</span>
                        <span className="font-mono font-bold text-slate-900">{formatVND(document.transfer.new_session_rate)}/b</span>
                      </div>
                    </div>
                    <div className="pt-1 text-[11px] text-slate-700">
                      Lịch học tiếp nhận: <strong className="text-slate-900">{document.toClass?.days_of_week?.join(' & ') || 'Theo lịch lớp'}</strong> &bull; Số buổi học tại lớp mới:{' '}
                      <strong className="font-mono text-amber-800">
                        {document.transfer.remaining_sessions + (document.transfer.converted_sessions || 0)} buổi
                        {document.transfer.converted_sessions ? ` (+${document.transfer.converted_sessions} buổi quy đổi)` : ''}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* III. ĐỐI SOÁT TÀI CHÍNH */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/80 space-y-2">
                <div className="font-bold text-slate-900 uppercase text-[11px] border-b border-slate-200 pb-1 flex items-center justify-between">
                  <span>III. QUYẾT TOÁN CHÊNH LỆCH HỌC PHÍ / FINANCIAL SETTLEMENT</span>
                  <span className="text-[10px] font-mono text-slate-500">Quy chế chuyển môn ngoại khóa</span>
                </div>

                {document.transfer.surcharge_amount > 0 ? (
                  <div className="p-3 rounded-xl bg-amber-100/70 border border-amber-300 text-amber-950 space-y-1">
                    <div className="flex justify-between items-center text-sm font-bold">
                      <span>Phụ thu chênh lệch đơn giá (Đơn giá mới &gt; Đơn giá cũ):</span>
                      <span className="font-mono text-base text-amber-800">+{formatVND(document.transfer.surcharge_amount)}</span>
                    </div>
                    <div className="text-[11px] text-amber-900">
                      Công thức: ({formatVND(document.transfer.new_session_rate)} - {formatVND(document.transfer.old_session_rate)}) &times; {document.transfer.remaining_sessions} buổi = {formatVND(document.transfer.surcharge_amount)}
                    </div>
                    {document.transfer.invoice_id && (
                      <div className="text-[10px] text-slate-600 pt-0.5">
                        Mã hóa đơn phụ thu: <strong>{document.transfer.invoice_id}</strong> &bull; Phương thức: Quét mã VietQR / Chuyển khoản ngân hàng.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1">
                    <div className="flex justify-between items-center text-sm font-bold">
                      <span>Chuyển ngang học phí (Đơn giá mới &le; Đơn giá cũ):</span>
                      <span className="font-mono text-base text-emerald-700">0 đ</span>
                    </div>
                    {document.transfer.surplus_handling === 'issue_credit_note' ? (
                      <div className="text-[11px] text-emerald-800">
                        &bull; <strong>Chính sách linh hoạt:</strong> Nhà trường cấp <strong>Phiếu bảo lưu phần dư trị giá {formatVND(document.transfer.surplus_amount || 0)}</strong> (Thời hạn 365 ngày) cho học sinh sử dụng cho các khóa học kế tiếp.
                      </div>
                    ) : document.transfer.surplus_handling === 'convert_sessions' ? (
                      <div className="text-[11px] text-emerald-800">
                        &bull; <strong>Chính sách quy đổi:</strong> Số tiền thặng dư {formatVND(document.transfer.surplus_amount || 0)} được quy đổi thành <strong>+{document.transfer.converted_sessions} buổi học thêm</strong> tại lớp mới.
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-600">
                        &bull; Theo quy chế vận hành Royal School: Chuyển ngang số buổi chưa học, không hoàn trả chênh lệch tiền thừa khi chuyển sang môn có đơn giá thấp hơn.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* IV. ĐIỀU KHOẢN VẬN HÀNH & BÁNH SỮA */}
              <div className="border border-slate-200 rounded-2xl p-3 bg-white text-[11px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-800 uppercase text-[10px]">
                  IV. ĐIỀU KHOẢN VẬN HÀNH &amp; CHẾ ĐỘ DINH DƯỠNG / TERMS &amp; NUTRITION
                </div>
                <p>
                  1. Học sinh được kích hoạt ghi danh tại lớp mới kể từ ngày <strong>{document.transfer.transfer_date}</strong>, sĩ số và danh sách điểm danh được tự động đồng bộ trên hệ thống.
                </p>
                <p>
                  2. Đối với học sinh chính khóa Royal School, định mức suất ăn xế / bánh sữa được tự động chuyển giao và phục vụ tại phòng học của lớp mới bắt đầu từ buổi học kế tiếp.
                </p>
                <p>
                  3. Biên bản này được lập thành 03 bản có giá trị pháp lý như nhau: 01 bản giao Phụ huynh, 01 bản lưu tại Phòng Học vụ, 01 bản chuyển Phòng Kế toán đối soát.
                </p>
              </div>

              {/* V. CHỮ KÝ XÁC NHẬN */}
              <div className="grid grid-cols-3 gap-4 pt-4 text-center text-xs">
                <div>
                  <div className="font-bold uppercase text-slate-900">Đại Diện Phụ Huynh</div>
                  <div className="text-[10px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
                  <div className="h-20 flex items-end justify-center font-semibold text-slate-800">
                    {document.student?.parent_name}
                  </div>
                </div>

                <div>
                  <div className="font-bold uppercase text-slate-900">Chuyên Viên Học Vụ</div>
                  <div className="text-[10px] text-slate-500 italic">(Ký và ghi rõ họ tên)</div>
                  <div className="h-20 flex items-end justify-center font-semibold text-slate-800">
                    {document.transfer.created_by || 'Ban Học Vụ Ngoại Khóa'}
                  </div>
                </div>

                <div>
                  <div className="font-bold uppercase text-slate-900">Bộ Phận Kế Toán</div>
                  <div className="text-[10px] text-slate-500 italic">(Ký, đóng dấu xác nhận)</div>
                  <div className="h-20 flex items-end justify-center font-semibold text-slate-800">
                    Phòng Kế Toán Royal School
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
