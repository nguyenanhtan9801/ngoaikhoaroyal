import React, { useState } from 'react';
import { 
  Receipt, 
  QrCode, 
  CheckCircle2, 
  DollarSign, 
  UserCheck, 
  ArrowRightLeft, 
  Printer, 
  Clock, 
  AlertTriangle,
  Upload,
  Calendar,
  Building2,
  ExternalLink
} from 'lucide-react';
import { AppStore, formatVND } from '../../lib/storage';
import { generateVietQRUrl } from '../../lib/vietqr';
import { TuitionInvoice, Teacher, ExtracurricularClass, UserRole } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface FinancePayrollTabProps {
  store: AppStore;
  currentRole: UserRole;
  selectedCampusId: string;
  selectedTermId: string;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onPrintReceipt: (invoice: TuitionInvoice) => void;
  initialSection?: 'invoices' | 'payroll' | 'transfer';
}

export const FinancePayrollTab: React.FC<FinancePayrollTabProps> = ({
  store,
  currentRole,
  selectedCampusId,
  selectedTermId,
  onUpdateStore,
  onPrintReceipt,
  initialSection = 'invoices',
}) => {
  const [activeSection, setActiveSection] = useState<'invoices' | 'payroll' | 'transfer'>(initialSection);
  const [invoiceViewMode, setInvoiceViewMode] = useState<ViewMode>('cards');
  const [payrollViewMode, setPayrollViewMode] = useState<ViewMode>('cards');
  const [transferViewMode, setTransferViewMode] = useState<ViewMode>('cards');

  React.useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);
  const [viewingQrInvoice, setViewingQrInvoice] = useState<TuitionInvoice | null>(null);
  const [verifyingInvoice, setVerifyingInvoice] = useState<TuitionInvoice | null>(null);
  const [paymentRefInput, setPaymentRefInput] = useState('');

  // Class Transfer Calculator State
  const [transferState, setTransferState] = useState({
    student_id: store.students[0]?.id || '',
    from_class_id: store.classes[0]?.id || '',
    to_class_id: store.classes[1]?.id || '',
    remaining_sessions: 10,
  });

  // Filter invoices
  const filteredInvoices = store.invoices.filter(i => {
    const cls = store.classes.find(c => c.id === i.class_id);
    if (!cls) return true;
    const matchCampus = selectedCampusId === 'all' || cls.campus_id === selectedCampusId;
    const matchTerm = cls.term_id === selectedTermId;
    return matchCampus && matchTerm;
  });

  // Manual Verification of Payment
  const handleConfirmPayment = () => {
    if (!verifyingInvoice) return;

    onUpdateStore(prev => ({
      ...prev,
      invoices: prev.invoices.map(inv => {
        if (inv.id === verifyingInvoice.id) {
          return {
            ...inv,
            paid_amount: inv.net_payable,
            outstanding_amount: 0,
            payment_status: 'paid',
            payment_reference: paymentRefInput || `VCB-${Date.now().toString().slice(-8)}`,
            verified_by: 'Kế toán viên (Manual Check)',
            verified_at: new Date().toISOString(),
          };
        }
        return inv;
      }),
    }));

    setVerifyingInvoice(null);
    setPaymentRefInput('');
  };

  // Settle Payroll for a Teacher & Class
  const handleSettlePayroll = (teacher: Teacher, cls: ExtracurricularClass) => {
    // Count taught sessions
    const sessions = store.sessions.filter(
      s => s.class_id === cls.id && s.actual_teacher_id === teacher.id && s.status === 'completed'
    );
    const taughtCount = sessions.length;

    // Calculate payroll
    let totalPayroll = 0;
    if (teacher.teacher_type === 'permanent') {
      totalPayroll = taughtCount * teacher.fixed_rate_per_session;
    } else {
      // Visiting: % of class revenue (after discounts)
      const classEnrollments = store.enrollments.filter(e => e.class_id === cls.id && e.status === 'active');
      const grossRevenue = classEnrollments.length * cls.full_course_fee;
      totalPayroll = (grossRevenue * teacher.percentage_rate) / 100;
    }

    onUpdateStore(prev => ({
      ...prev,
      payrollSettlements: [
        {
          id: `pay_${Date.now()}`,
          teacher_id: teacher.id,
          class_id: cls.id,
          term_id: cls.term_id,
          taught_sessions: taughtCount,
          substitute_sessions: 0,
          class_revenue: cls.full_course_fee * store.enrollments.filter(e => e.class_id === cls.id).length,
          calculation_type: teacher.teacher_type === 'permanent' ? 'fixed' : 'percentage',
          total_payroll: totalPayroll,
          settled_date: new Date().toISOString().split('T')[0],
          is_settled: true,
        },
        ...prev.payrollSettlements,
      ],
    }));

    alert(`Đã quyết toán thù lao cho ${teacher.name} thành công: ${formatVND(totalPayroll)}!`);
  };

  // Class Transfer Calculation
  const fromClass = store.classes.find(c => c.id === transferState.from_class_id);
  const toClass = store.classes.find(c => c.id === transferState.to_class_id);
  const oldRate = fromClass?.price_per_session || 0;
  const newRate = toClass?.price_per_session || 0;
  const surcharge = Math.max(0, (newRate - oldRate) * transferState.remaining_sessions);

  const handleExecuteTransfer = () => {
    const student = store.students.find(s => s.id === transferState.student_id);
    if (!student || !fromClass || !toClass) return;

    onUpdateStore(prev => {
      // 1. Update old enrollment to transferred
      const updatedEnrollments = prev.enrollments.map(e => {
        if (e.student_id === student.id && e.class_id === fromClass.id) {
          return { ...e, status: 'transferred' as const };
        }
        return e;
      });

      // 2. Add new enrollment
      updatedEnrollments.push({
        id: `enr_${Date.now()}`,
        student_id: student.id,
        class_id: toClass.id,
        registered_sessions: transferState.remaining_sessions,
        joined_date: new Date().toISOString().split('T')[0],
        status: 'active',
      });

      // 3. If surcharge, add invoice for surcharge
      let updatedInvoices = [...prev.invoices];
      if (surcharge > 0) {
        updatedInvoices.unshift({
          id: `inv_surcharge_${Date.now()}`,
          invoice_code: `INV-CHUYENLOP-${String(prev.invoices.length + 1).padStart(4, '0')}`,
          student_id: student.id,
          class_id: toClass.id,
          gross_amount: surcharge,
          credit_deducted: 0,
          net_payable: surcharge,
          paid_amount: 0,
          outstanding_amount: surcharge,
          payment_status: 'unpaid',
          due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          created_at: new Date().toISOString().split('T')[0],
        });
      }

      return {
        ...prev,
        enrollments: updatedEnrollments,
        invoices: updatedInvoices,
      };
    });

    alert(`Chuyển lớp thành công cho ${student.name}! ${surcharge > 0 ? `Đã phát hành hóa đơn phụ thu: ${formatVND(surcharge)}` : 'Không phát sinh phụ thu.'}`);
  };

  return (
    <div className="space-y-6">
      
      {/* Sub navigation pills */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSection('invoices')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSection === 'invoices'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Hóa Đơn & Thanh Toán VietQR ({filteredInvoices.length})
        </button>
        <button
          onClick={() => setActiveSection('payroll')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSection === 'payroll'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Quyết Toán Thù Lao Giáo Viên
        </button>
        <button
          onClick={() => setActiveSection('transfer')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSection === 'transfer'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Biên Bản & Tính Phụ Thu Chuyển Lớp
        </button>
      </div>

      {/* SECTION 1: INVOICES & VIETQR */}
      {activeSection === 'invoices' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" />
                <span>Hóa Đơn Học Phí Ngoại Khóa & Đối Soát Sao Kê Ngân Hàng ({filteredInvoices.length} hóa đơn)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Mỗi lớp/môn học có hóa đơn và mã VietQR Napas247 riêng biệt. Kế toán xác nhận gạch nợ thủ công.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <ViewToggle viewMode={invoiceViewMode} onViewModeChange={setInvoiceViewMode} />
            </div>
          </div>

          {/* VIEW 1: INVOICES CARDS VIEW */}
          {invoiceViewMode === 'cards' && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredInvoices.map(invoice => {
                const student = store.students.find(s => s.id === invoice.student_id);
                const cls = store.classes.find(c => c.id === invoice.class_id);

                return (
                  <div 
                    key={invoice.id}
                    className="rounded-2xl p-4 bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col justify-between shadow-lg shadow-black/20"
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <span className="font-mono text-xs font-extrabold text-amber-400">
                            {invoice.invoice_code}
                          </span>
                          <h4 className="font-bold text-white text-sm mt-0.5">{student?.name}</h4>
                          <span className="text-[10px] text-slate-500 font-mono">{student?.code}</span>
                        </div>

                        {invoice.payment_status === 'paid' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            Đã thanh toán
                          </span>
                        ) : invoice.payment_status === 'partial' ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            Nộp một phần
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                            Chưa nộp
                          </span>
                        )}
                      </div>

                      {/* Class */}
                      <div className="text-xs text-slate-300 font-semibold mb-2 flex items-center justify-between">
                        <span className="truncate">{cls?.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">Hạn: {invoice.due_date}</span>
                      </div>

                      {/* Financial breakdown */}
                      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Học phí gốc:</span>
                          <span className="font-mono text-slate-200">{formatVND(invoice.gross_amount)}</span>
                        </div>
                        {invoice.credit_deducted > 0 && (
                          <div className="flex justify-between text-cyan-400">
                            <span>Khấu trừ bảo lưu:</span>
                            <span className="font-mono">-{formatVND(invoice.credit_deducted)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-white font-bold pt-1 border-t border-slate-800">
                          <span>Phải nộp:</span>
                          <span className="font-mono">{formatVND(invoice.net_payable)}</span>
                        </div>
                        <div className="flex justify-between text-xs pt-1">
                          <span className="text-slate-400">Còn nợ:</span>
                          <span className={`font-mono font-bold ${invoice.outstanding_amount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {formatVND(invoice.outstanding_amount)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setViewingQrInvoice(invoice)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-colors"
                          title="Tạo mã VietQR Napas247"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Mã QR</span>
                        </button>

                        <button
                          onClick={() => onPrintReceipt(invoice)}
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          title="In Biên Lai Thu Tiền"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {invoice.payment_status !== 'paid' && (
                        <button
                          onClick={() => setVerifyingInvoice(invoice)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm shadow-emerald-600/20"
                        >
                          Gạch nợ
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 2: INVOICES TABLE VIEW */}
          {invoiceViewMode === 'table' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Mã HĐ</th>
                    <th className="py-3 px-4">Học Viên</th>
                    <th className="py-3 px-4">Lớp Học & Môn</th>
                    <th className="py-3 px-4">Học Phí Gốc</th>
                    <th className="py-3 px-4">Trừ Bảo Lưu</th>
                    <th className="py-3 px-4">Phải Đóng</th>
                    <th className="py-3 px-4">Còn Nợ</th>
                    <th className="py-3 px-4">Hạn Nộp</th>
                    <th className="py-3 px-4 text-center">Trạng Thái</th>
                    <th className="py-3 px-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredInvoices.map(invoice => {
                    const student = store.students.find(s => s.id === invoice.student_id);
                    const cls = store.classes.find(c => c.id === invoice.class_id);

                    return (
                      <tr key={invoice.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">
                          {invoice.invoice_code}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{student?.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{student?.code}</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200">{cls?.name}</div>
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-300">
                          {formatVND(invoice.gross_amount)}
                        </td>

                        <td className="py-3 px-4 font-mono text-cyan-400">
                          {invoice.credit_deducted > 0 ? `-${formatVND(invoice.credit_deducted)}` : '0 đ'}
                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-white">
                          {formatVND(invoice.net_payable)}
                        </td>

                        <td className="py-3 px-4 font-mono font-bold">
                          {invoice.outstanding_amount > 0 ? (
                            <span className="text-rose-400">{formatVND(invoice.outstanding_amount)}</span>
                          ) : (
                            <span className="text-emerald-400">0 đ</span>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-400">
                          {invoice.due_date}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {invoice.payment_status === 'paid' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              Đã thanh toán
                            </span>
                          ) : invoice.payment_status === 'partial' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                              Nộp một phần
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                              Chưa nộp
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setViewingQrInvoice(invoice)}
                              className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors"
                              title="Tạo mã VietQR Napas247"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => onPrintReceipt(invoice)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                              title="In Biên Lai Thu Tiền"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>

                            {invoice.payment_status !== 'paid' && (
                              <button
                                onClick={() => setVerifyingInvoice(invoice)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors"
                              >
                                Gạch nợ
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: TEACHER PAYROLL SETTLEMENT */}
      {activeSection === 'payroll' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-400" />
                <span>Quyết Toán Thù Lao Giáo Viên Trọn Gói Cuối Khóa ({store.teachers.length} giáo viên)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                &bull; <strong>Giáo viên cơ hữu:</strong> Mức cố định trên từng buổi dạy thực tế (chấm công qua sổ điểm danh).<br />
                &bull; <strong>Giáo viên thỉnh giảng / Đối tác:</strong> % Doanh thu thực tế của lớp (Nhà trường tạm ứng chi trả đủ).
              </p>
            </div>

            <ViewToggle viewMode={payrollViewMode} onViewModeChange={setPayrollViewMode} />
          </div>

          {/* VIEW 1: PAYROLL CARDS VIEW */}
          {payrollViewMode === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {store.teachers.map(teacher => {
                const assignedClasses = store.classes.filter(c => c.primary_teacher_id === teacher.id);

                return (
                  <div key={teacher.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{teacher.name}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                        teacher.teacher_type === 'permanent'
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {teacher.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 space-y-1">
                      <div>
                        Công thức tính:{' '}
                        <strong className="text-slate-200">
                          {teacher.teacher_type === 'permanent'
                            ? `${formatVND(teacher.fixed_rate_per_session)} / buổi thực dạy`
                            : `${teacher.percentage_rate}% Tổng doanh thu lớp`}
                        </strong>
                      </div>
                      <div>Phụ trách: {assignedClasses.length} lớp học</div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      {assignedClasses.map(cls => {
                        const sessionsTaught = store.sessions.filter(
                          s => s.class_id === cls.id && s.actual_teacher_id === teacher.id && s.status === 'completed'
                        ).length;

                        return (
                          <div key={cls.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs">
                            <div>
                              <div className="font-semibold text-white">{cls.name}</div>
                              <div className="text-[10px] text-slate-500">Đã dạy: {sessionsTaught} / {cls.total_sessions} buổi</div>
                            </div>
                            <button
                              onClick={() => handleSettlePayroll(teacher, cls)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] transition-colors"
                            >
                              Quyết toán
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 2: PAYROLL TABLE VIEW */}
          {payrollViewMode === 'table' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Giáo Viên</th>
                    <th className="py-3 px-4">Loại Hợp Đồng</th>
                    <th className="py-3 px-4">Định Mức Thù Lao</th>
                    <th className="py-3 px-4">Số Lớp Phụ Trách</th>
                    <th className="py-3 px-4">Chi Tiết Lớp & Tiến Độ Dạy</th>
                    <th className="py-3 px-4 text-right">Quyết Toán Nhanh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {store.teachers.map(teacher => {
                    const assignedClasses = store.classes.filter(c => c.primary_teacher_id === teacher.id);
                    return (
                      <tr key={teacher.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white text-sm">{teacher.name}</div>
                          <div className="text-[10px] text-slate-500">{teacher.phone}</div>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                            teacher.teacher_type === 'permanent'
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {teacher.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-slate-200">
                          {teacher.teacher_type === 'permanent'
                            ? `${formatVND(teacher.fixed_rate_per_session)}/buổi`
                            : `${teacher.percentage_rate}% Doanh thu`}
                        </td>

                        <td className="py-3 px-4 font-mono text-center">
                          {assignedClasses.length} lớp
                        </td>

                        <td className="py-3 px-4 space-y-1">
                          {assignedClasses.map(cls => {
                            const sessionsTaught = store.sessions.filter(
                              s => s.class_id === cls.id && s.actual_teacher_id === teacher.id && s.status === 'completed'
                            ).length;
                            return (
                              <div key={cls.id} className="text-[11px] text-slate-300 flex items-center justify-between gap-2">
                                <span>{cls.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">({sessionsTaught}/{cls.total_sessions}b)</span>
                              </div>
                            );
                          })}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {assignedClasses.length > 0 ? (
                            <button
                              onClick={() => handleSettlePayroll(teacher, assignedClasses[0])}
                              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] transition-colors"
                            >
                              Quyết toán ({assignedClasses[0]?.name})
                            </button>
                          ) : (
                            <span className="text-slate-500 text-[10px]">Chưa có lớp</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: CLASS TRANSFER */}
      {activeSection === 'transfer' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-md shadow-xl max-w-2xl mx-auto space-y-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">Biên Bản & Công Cụ Phụ Thu Chuyển Lớp</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Học sinh được chuyển khác lớp, khác cơ sở và khác bộ môn. Tính trên các buổi còn lại chưa học:<br />
            &bull; <em>Đơn giá mới &gt; Đơn giá cũ:</em> Phụ huynh nộp thêm chênh lệch: <code>(Đơn giá mới - Đơn giá cũ) × Số buổi còn lại</code>.<br />
            &bull; <em>Đơn giá mới ≤ Đơn giá cũ:</em> Chuyển ngang, không hoàn trả tiền chênh lệch thừa.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Chọn Học sinh cần chuyển lớp</label>
              <select
                value={transferState.student_id}
                onChange={(e) => setTransferState({ ...transferState, student_id: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
              >
                {store.students.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Lớp học hiện tại</label>
                <select
                  value={transferState.from_class_id}
                  onChange={(e) => setTransferState({ ...transferState, from_class_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                >
                  {store.classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({formatVND(c.price_per_session)}/buổi)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Lớp học chuyển đến</label>
                <select
                  value={transferState.to_class_id}
                  onChange={(e) => setTransferState({ ...transferState, to_class_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                >
                  {store.classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({formatVND(c.price_per_session)}/buổi)</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Số buổi còn lại chưa học cần chuyển</label>
              <input
                type="number"
                min={1}
                max={30}
                value={transferState.remaining_sessions}
                onChange={(e) => setTransferState({ ...transferState, remaining_sessions: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {/* Live Calculation Preview */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Đơn giá lớp cũ:</span>
                <span className="font-mono text-white">{formatVND(oldRate)} / buổi</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Đơn giá lớp mới:</span>
                <span className="font-mono text-white">{formatVND(newRate)} / buổi</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Số buổi chuyển:</span>
                <span className="font-mono text-white">{transferState.remaining_sessions} buổi</span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                <span className="font-bold text-white text-sm">Tiền phụ thu chênh lệch:</span>
                <span className={`text-base font-extrabold font-mono ${surcharge > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {surcharge > 0 ? formatVND(surcharge) : '0 đ (Chuyển ngang)'}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleExecuteTransfer}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
              >
                Xác Nhận Biên Bản Chuyển Lớp
              </button>
            </div>
          </div>

          {/* TRANSFER HISTORY LIST WITH VIEW TOGGLE */}
          <div className="pt-6 border-t border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
                <span>Lịch Sử Biên Bản Chuyển Lớp ({store.transfers.length} biên bản)</span>
              </div>
              <ViewToggle viewMode={transferViewMode} onViewModeChange={setTransferViewMode} />
            </div>

            {store.transfers.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 rounded-2xl bg-slate-900/60 border border-slate-800">
                Chưa có biên bản chuyển lớp nào được tạo trong kỳ học này.
              </div>
            ) : transferViewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {store.transfers.map(tr => {
                  const student = store.students.find(s => s.id === tr.student_id);
                  const fromClass = store.classes.find(c => c.id === tr.from_class_id);
                  const toClass = store.classes.find(c => c.id === tr.to_class_id);

                  return (
                    <div key={tr.id} className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white">{student?.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{tr.transfer_date}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                        <span className="text-slate-400">Từ:</span> <strong>{fromClass?.name}</strong>
                        <span>&rarr;</span>
                        <span className="text-slate-400">Sang:</span> <strong className="text-amber-400">{toClass?.name}</strong>
                      </div>
                      <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800/80">
                        <span className="text-slate-400">Buổi chuyển: {tr.remaining_sessions}b</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {tr.surcharge_amount > 0 ? `+${formatVND(tr.surcharge_amount)}` : 'Chuyển ngang'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Ngày Lập</th>
                      <th className="py-2.5 px-3">Học Sinh</th>
                      <th className="py-2.5 px-3">Lớp Cũ</th>
                      <th className="py-2.5 px-3">Lớp Mới</th>
                      <th className="py-2.5 px-3 text-center">Số Buổi</th>
                      <th className="py-2.5 px-3 text-right">Phụ Thu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {store.transfers.map(tr => {
                      const student = store.students.find(s => s.id === tr.student_id);
                      const fromClass = store.classes.find(c => c.id === tr.from_class_id);
                      const toClass = store.classes.find(c => c.id === tr.to_class_id);

                      return (
                        <tr key={tr.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-mono text-slate-400">{tr.transfer_date}</td>
                          <td className="py-2.5 px-3 font-bold text-white">{student?.name}</td>
                          <td className="py-2.5 px-3 text-slate-300">{fromClass?.name}</td>
                          <td className="py-2.5 px-3 text-amber-400 font-semibold">{toClass?.name}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold">{tr.remaining_sessions}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                            {tr.surcharge_amount > 0 ? formatVND(tr.surcharge_amount) : '0 đ'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VietQR View Modal */}
      {viewingQrInvoice && (() => {
        const student = store.students.find(s => s.id === viewingQrInvoice.student_id);
        const cls = store.classes.find(c => c.id === viewingQrInvoice.class_id);
        const campus = store.campuses.find(c => c.id === cls?.campus_id) || store.campuses[0];

        const qrUrl = generateVietQRUrl({
          bankName: campus.bank_name,
          bankAccount: campus.bank_account,
          bankOwner: campus.bank_owner,
          amount: viewingQrInvoice.outstanding_amount || viewingQrInvoice.net_payable,
          studentCode: student?.code || 'STUDENT',
          className: cls?.name || 'CLASS',
          invoiceCode: viewingQrInvoice.invoice_code,
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl text-center space-y-4">
              <div className="flex items-center justify-between text-xs text-amber-400 font-bold uppercase tracking-wider">
                <span>VietQR Napas247 Hoàng Gia</span>
                <button onClick={() => setViewingQrInvoice(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="bg-white p-3 rounded-2xl inline-block shadow-md">
                <img
                  src={qrUrl}
                  alt="VietQR"
                  className="w-64 h-64 mx-auto object-contain"
                />
              </div>

              <div className="text-left bg-slate-900 p-3 rounded-2xl text-xs space-y-1">
                <div className="text-slate-400">Ngân hàng: <strong className="text-white">{campus.bank_name}</strong></div>
                <div className="text-slate-400">Số tài khoản: <strong className="text-amber-400 font-mono">{campus.bank_account}</strong></div>
                <div className="text-slate-400">Chủ tài khoản: <strong className="text-white">{campus.bank_owner}</strong></div>
                <div className="text-slate-400">Số tiền: <strong className="text-emerald-400 font-mono">{formatVND(viewingQrInvoice.outstanding_amount || viewingQrInvoice.net_payable)}</strong></div>
                <div className="text-slate-400">Nội dung CK: <strong className="text-cyan-300 font-mono">HP {student?.code} {cls?.name.split('-')[0].trim()}</strong></div>
              </div>

              <button
                onClick={() => setViewingQrInvoice(null)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs"
              >
                Đóng Mã QR
              </button>
            </div>
          </div>
        );
      })()}

      {/* Manual Verification Modal */}
      {verifyingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-emerald-500/40 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Đối Soát Gạch Nợ Thủ Công</span>
            </h3>

            <p className="text-xs text-slate-300">
              Xác nhận phụ huynh đã thanh toán số tiền <strong className="text-emerald-400 font-mono">{formatVND(verifyingInvoice.outstanding_amount)}</strong> cho hóa đơn <span className="font-mono text-amber-400">{verifyingInvoice.invoice_code}</span>.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Mã tham chiếu ngân hàng / Số GD sao kê *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: VCB-FT262458921"
                  value={paymentRefInput}
                  onChange={(e) => setPaymentRefInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setVerifyingInvoice(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmPayment}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                Xác Nhận Đã Thu Tiền
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
