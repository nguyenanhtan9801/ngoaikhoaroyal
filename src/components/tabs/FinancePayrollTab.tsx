import React, { useState, useMemo, useEffect } from 'react';
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
  ExternalLink,
  Sparkles,
  Coins,
  History,
  X,
  CreditCard,
  Check,
  AlertCircle
} from 'lucide-react';
import { AppStore, formatVND, createAuditRecord, appendAuditLog, formatCapitalizeWords } from '../../lib/storage';
import { generateVietQRUrl } from '../../lib/vietqr';
import { TuitionInvoice, Teacher, ExtracurricularClass, UserRole, AppUser, InvoicePaymentRecord } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface FinancePayrollTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  selectedCampusId: string;
  selectedTermId: string;
  searchQuery?: string;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onPrintReceipt: (invoice: TuitionInvoice) => void;
  initialSection?: 'invoices' | 'payroll' | 'transfer';
}

export const FinancePayrollTab: React.FC<FinancePayrollTabProps> = ({
  store,
  currentRole,
  currentUser,
  selectedCampusId,
  selectedTermId,
  searchQuery = '',
  onUpdateStore,
  onPrintReceipt,
  initialSection = 'invoices',
}) => {
  const [activeSection, setActiveSection] = useState<'invoices' | 'payroll' | 'transfer'>(initialSection);
  const [invoiceViewMode, setInvoiceViewMode] = useState<ViewMode>('table');
  const [payrollViewMode, setPayrollViewMode] = useState<ViewMode>('table');
  const [transferViewMode, setTransferViewMode] = useState<ViewMode>('table');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid' | 'trial_pending' | 'cancelled'>('all');

  React.useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  const [viewingQrInvoice, setViewingQrInvoice] = useState<TuitionInvoice | null>(null);
  const [verifyingInvoice, setVerifyingInvoice] = useState<TuitionInvoice | null>(null);

  // Partial payment form states
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full');
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'cash'>('bank_transfer');
  const [paymentRefInput, setPaymentRefInput] = useState('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentNotesInput, setPaymentNotesInput] = useState('');
  const [verifiedByInput, setVerifiedByInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Class Transfer Calculator State
  const [transferState, setTransferState] = useState({
    student_id: store.students[0]?.id || '',
    from_class_id: '',
    to_class_id: '',
    remaining_sessions: 10,
  });

  // 1. Lấy danh sách ghi danh đang hoạt động của học sinh được chọn
  const activeEnrollments = useMemo(() => {
    return store.enrollments.filter(
      e => e.student_id === transferState.student_id && e.status === 'active'
    );
  }, [store.enrollments, transferState.student_id]);

  // 2. Lấy chi tiết các lớp học sinh đang học thực tế (chỉ lớp active)
  const currentStudentClasses = useMemo(() => {
    return activeEnrollments
      .map(e => store.classes.find(c => c.id === e.class_id))
      .filter((c): c is ExtracurricularClass => Boolean(c));
  }, [activeEnrollments, store.classes]);

  // 3. Tự động đồng bộ lớp hiện tại (from_class_id) khi người dùng đổi học sinh
  useEffect(() => {
    if (currentStudentClasses.length > 0) {
      // Nếu lớp hiện tại không nằm trong danh sách lớp đang học của học sinh mới, chọn lớp đầu tiên
      const isCurrentValid = currentStudentClasses.some(c => c.id === transferState.from_class_id);
      if (!isCurrentValid) {
        const defaultFromId = currentStudentClasses[0].id;
        const availableToClasses = store.classes.filter(c => c.id !== defaultFromId);
        setTransferState(prev => ({
          ...prev,
          from_class_id: defaultFromId,
          to_class_id: prev.to_class_id === defaultFromId 
            ? (availableToClasses[0]?.id || '') 
            : (prev.to_class_id || availableToClasses[0]?.id || '')
        }));
      }
    } else {
      setTransferState(prev => ({
        ...prev,
        from_class_id: ''
      }));
    }
  }, [transferState.student_id, currentStudentClasses, store.classes]);

  // 4. Đảm bảo to_class_id luôn loại trừ from_class_id (không chuyển vào cùng một lớp)
  useEffect(() => {
    if (transferState.from_class_id && transferState.to_class_id === transferState.from_class_id) {
      const availableToClasses = store.classes.filter(c => c.id !== transferState.from_class_id);
      if (availableToClasses.length > 0) {
        setTransferState(prev => ({
          ...prev,
          to_class_id: availableToClasses[0].id
        }));
      }
    }
  }, [transferState.from_class_id, transferState.to_class_id, store.classes]);

  // Open Verify Modal & Initialize with invoice data
  const openVerifyModal = (invoice: TuitionInvoice) => {
    setVerifyingInvoice(invoice);
    const outstanding = invoice.outstanding_amount > 0 ? invoice.outstanding_amount : invoice.net_payable;
    setPaymentMode('full');
    setPaymentAmountInput(outstanding.toString());
    setPaymentMethod('bank_transfer');
    setPaymentRefInput(`VCB-FT${Date.now().toString().slice(-8)}`);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    const histCount = invoice.payment_history?.length || 0;
    setPaymentNotesInput(histCount > 0 ? `Đóng đợt ${histCount + 1}` : 'Đóng đợt 1');
    setVerifiedByInput(currentUser?.full_name ? formatCapitalizeWords(currentUser.full_name) : 'Kế toán Lê Minh Thư');
    setValidationError(null);
  };

  const handleAmountChange = (valStr: string) => {
    const cleanDigits = valStr.replace(/\D/g, '');
    setPaymentAmountInput(cleanDigits);

    if (!cleanDigits) {
      setValidationError('Vui lòng nhập số tiền thanh toán đợt này (> 0 đ)');
      return;
    }

    const num = parseInt(cleanDigits, 10);
    if (num <= 0) {
      setValidationError('Số tiền thu phải lớn hơn 0 đ');
    } else if (verifyingInvoice && num > verifyingInvoice.outstanding_amount) {
      setValidationError(`Số tiền thu (${formatVND(num)}) không được vượt quá số tiền còn nợ (${formatVND(verifyingInvoice.outstanding_amount)})!`);
    } else {
      setValidationError(null);
    }
  };

  const handleSelectFullPayment = () => {
    if (!verifyingInvoice) return;
    setPaymentMode('full');
    setPaymentAmountInput(verifyingInvoice.outstanding_amount.toString());
    const histCount = verifyingInvoice.payment_history?.length || 0;
    setPaymentNotesInput(histCount > 0 ? `Đóng đợt ${histCount + 1} - Tất toán 100% công nợ` : 'Đóng 100% học phí toàn khóa');
    setValidationError(null);
  };

  const handleSelectPartialPayment = () => {
    if (!verifyingInvoice) return;
    setPaymentMode('partial');
    const suggested = Math.min(1000000, verifyingInvoice.outstanding_amount);
    setPaymentAmountInput(suggested.toString());
    const histCount = verifyingInvoice.payment_history?.length || 0;
    setPaymentNotesInput(histCount > 0 ? `Đóng đợt ${histCount + 1}` : 'Đóng đợt 1 (Một phần)');
    setValidationError(null);
  };

  const handleSetQuickAmount = (amount: number) => {
    if (!verifyingInvoice) return;
    setPaymentMode(amount >= verifyingInvoice.outstanding_amount ? 'full' : 'partial');
    const safeAmount = Math.max(0, Math.min(amount, verifyingInvoice.outstanding_amount));
    setPaymentAmountInput(safeAmount.toString());
    if (safeAmount <= 0) {
      setValidationError('Số tiền thu phải lớn hơn 0 đ');
    } else if (safeAmount > verifyingInvoice.outstanding_amount) {
      setValidationError(`Số tiền thu vượt quá số tiền còn nợ!`);
    } else {
      setValidationError(null);
    }
  };

  const handleSelectPaymentMethod = (method: 'bank_transfer' | 'cash') => {
    setPaymentMethod(method);
    if (method === 'cash') {
      if (!paymentRefInput || paymentRefInput.startsWith('VCB-')) {
        setPaymentRefInput(`TM-${Date.now().toString().slice(-6)}`);
      }
    } else {
      if (!paymentRefInput || paymentRefInput.startsWith('TM-')) {
        setPaymentRefInput(`VCB-FT${Date.now().toString().slice(-8)}`);
      }
    }
  };

  const handleRegenerateRef = () => {
    if (paymentMethod === 'cash') {
      setPaymentRefInput(`TM-${Date.now().toString().slice(-6)}`);
    } else {
      setPaymentRefInput(`VCB-FT${Date.now().toString().slice(-8)}`);
    }
  };

  // 1. Base filtered invoices by Campus, Term, and Search Query
  const baseFilteredInvoices = useMemo(() => {
    return store.invoices.filter(inv => {
      const cls = store.classes.find(c => c.id === inv.class_id);
      const student = store.students.find(s => s.id === inv.student_id);

      // 1. Lọc theo Cơ sở
      const matchCampus = selectedCampusId === 'all' || cls?.campus_id === selectedCampusId;

      // 2. Lọc theo Niên khóa
      const matchTerm = selectedTermId === 'all' || cls?.term_id === selectedTermId;

      // 3. Lọc theo từ khóa tìm kiếm
      const query = (searchQuery || '').trim().toLowerCase();
      const matchQuery = !query || 
        inv.invoice_code.toLowerCase().includes(query) ||
        (student?.name && student.name.toLowerCase().includes(query)) ||
        (student?.code && student.code.toLowerCase().includes(query)) ||
        (cls?.name && cls.name.toLowerCase().includes(query));

      return Boolean(matchCampus && matchTerm && matchQuery);
    });
  }, [store.invoices, store.classes, store.students, selectedCampusId, selectedTermId, searchQuery]);

  // 2. Filtered invoices by status sub-filter
  const filteredInvoices = useMemo(() => {
    return baseFilteredInvoices.filter(i => {
      if (invoiceStatusFilter === 'paid') return i.payment_status === 'paid';
      if (invoiceStatusFilter === 'partial') return i.payment_status === 'partial';
      if (invoiceStatusFilter === 'unpaid') return i.payment_status === 'unpaid' && !i.is_trial_pending;
      if (invoiceStatusFilter === 'trial_pending') return !!i.is_trial_pending;
      if (invoiceStatusFilter === 'cancelled') return i.payment_status === 'cancelled';
      return true;
    });
  }, [baseFilteredInvoices, invoiceStatusFilter]);

  // Manual Verification of Payment (Whole or Partial)
  const handleConfirmPayment = () => {
    if (!verifyingInvoice) return;
    const numAmount = parseInt(paymentAmountInput.replace(/\D/g, '') || '0', 10);

    if (numAmount <= 0) {
      setValidationError('Số tiền thu phải lớn hơn 0 đ');
      return;
    }

    if (numAmount > verifyingInvoice.outstanding_amount) {
      setValidationError('Số tiền thu không được vượt quá số tiền còn nợ!');
      return;
    }

    const effectiveRef = paymentRefInput.trim() || (paymentMethod === 'cash' ? `TM-${Date.now().toString().slice(-6)}` : `VCB-FT${Date.now().toString().slice(-8)}`);
    const effectiveStaff = formatCapitalizeWords(verifiedByInput.trim() || currentUser?.full_name || 'Kế toán Lê Minh Thư');

    const currentPaid = verifyingInvoice.paid_amount || 0;
    const newPaid = currentPaid + numAmount;
    const newOutstanding = Math.max(0, verifyingInvoice.net_payable - newPaid);
    const newStatus: 'paid' | 'partial' = newOutstanding === 0 ? 'paid' : 'partial';

    const newPaymentRecord: InvoicePaymentRecord = {
      id: `pay_rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      payment_date: paymentDate || new Date().toISOString().split('T')[0],
      amount: numAmount,
      payment_method: paymentMethod,
      payment_reference: effectiveRef,
      verified_by: effectiveStaff,
      notes: paymentNotesInput.trim() || (newOutstanding === 0 ? 'Hoàn tất thanh toán 100%' : `Nộp đợt ${(verifyingInvoice.payment_history?.length || 0) + 1}`),
    };

    const updatedHistory = [...(verifyingInvoice.payment_history || []), newPaymentRecord];

    const auditDescription = `Kế toán ${effectiveStaff} đã gạch nợ đợt ${updatedHistory.length} số tiền ${formatVND(numAmount)} cho hóa đơn ${verifyingInvoice.invoice_code || verifyingInvoice.id}, còn nợ ${formatVND(newOutstanding)}`;

    const paymentLog = createAuditRecord(
      'INVOICE_PAYMENT_COLLECT',
      'FINANCE',
      'Hóa đơn Học phí',
      auditDescription,
      currentUser,
      {
        target_id: verifyingInvoice.invoice_code || verifyingInvoice.id,
        details: {
          status: 'success',
          before: {
            payment_status: verifyingInvoice.payment_status,
            paid_amount: verifyingInvoice.paid_amount,
            outstanding_amount: verifyingInvoice.outstanding_amount
          },
          after: {
            payment_status: newStatus,
            paid_amount: newPaid,
            outstanding_amount: newOutstanding,
            installment_amount: numAmount,
            installment_count: updatedHistory.length,
            payment_reference: effectiveRef,
            verified_by: effectiveStaff
          }
        }
      }
    );

    onUpdateStore(prev => ({
      ...prev,
      invoices: prev.invoices.map(inv => {
        if (inv.id === verifyingInvoice.id) {
          return {
            ...inv,
            paid_amount: newPaid,
            outstanding_amount: newOutstanding,
            payment_status: newStatus,
            payment_reference: effectiveRef,
            verified_by: effectiveStaff,
            verified_at: new Date().toISOString(),
            payment_history: updatedHistory,
          };
        }
        return inv;
      }),
      auditLogs: [paymentLog, ...(prev.auditLogs || [])],
    }));

    setVerifyingInvoice(null);
    setPaymentAmountInput('');
    setPaymentRefInput('');
    setPaymentNotesInput('');
    setValidationError(null);
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
  const fromClass = currentStudentClasses.find(c => c.id === transferState.from_class_id);
  const toClass = store.classes.find(c => c.id === transferState.to_class_id);
  const oldRate = fromClass?.price_per_session || 0;
  const newRate = toClass?.price_per_session || 0;
  const surcharge = (fromClass && toClass && currentStudentClasses.length > 0)
    ? Math.max(0, (newRate - oldRate) * transferState.remaining_sessions)
    : 0;

  const handleExecuteTransfer = () => {
    const student = store.students.find(s => s.id === transferState.student_id);
    if (!student || !fromClass || !toClass || currentStudentClasses.length === 0 || fromClass.id === toClass.id) {
      alert('Vui lòng chọn học sinh có lớp đang học và lớp chuyển đến hợp lệ!');
      return;
    }

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

      const transferLog = createAuditRecord(
        'CLASS_TRANSFER',
        'ACADEMIC',
        'Biến động Chuyển lớp',
        `Thực hiện chuyển lớp cho học sinh ${student.name} từ ${fromClass.name} sang ${toClass.name} (Phụ thu: ${formatVND(surcharge)})`,
        null,
        {
          target_id: student.code || student.id,
          details: {
            status: 'success',
            before: { class_id: fromClass.id, class_name: fromClass.name },
            after: {
              class_id: toClass.id,
              class_name: toClass.name,
              remaining_sessions: transferState.remaining_sessions,
              surcharge
            }
          }
        }
      );

      return {
        ...prev,
        enrollments: updatedEnrollments,
        invoices: updatedInvoices,
        auditLogs: [transferLog, ...(prev.auditLogs || [])],
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
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Phạm vi đối soát:</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  Khóa: {store.terms.find(t => t.id === selectedTermId)?.name || 'Tất cả niên khóa'}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                  Cơ sở: {store.campuses.find(c => c.id === selectedCampusId)?.name || 'Tất cả cơ sở'}
                </span>
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    Từ khóa: &quot;{searchQuery}&quot;
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ViewToggle viewMode={invoiceViewMode} onViewModeChange={setInvoiceViewMode} />
            </div>
          </div>

          {/* Quick Invoice Financial Metrics Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 border-b border-slate-800 bg-slate-950/40">
            <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Tổng Phải Thu (Gross/Net)</span>
              <div className="text-sm font-extrabold font-mono text-white mt-1">
                {formatVND(baseFilteredInvoices.reduce((sum, i) => sum + (i.net_payable || i.gross_amount || 0), 0))}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30">
              <span className="text-[10px] uppercase font-bold text-emerald-400">Đã Thu Lũy Kế</span>
              <div className="text-sm font-extrabold font-mono text-emerald-400 mt-1">
                {formatVND(baseFilteredInvoices.reduce((sum, i) => sum + (i.paid_amount || 0), 0))}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-rose-950/30 border border-rose-500/30">
              <span className="text-[10px] uppercase font-bold text-rose-400">Công Nợ Cần Thu</span>
              <div className="text-sm font-extrabold font-mono text-rose-400 mt-1">
                {formatVND(baseFilteredInvoices.reduce((sum, i) => sum + (i.outstanding_amount || 0), 0))}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30">
              <span className="text-[10px] uppercase font-bold text-amber-400">Đang Nợ Một Phần</span>
              <div className="text-sm font-extrabold font-mono text-amber-300 mt-1">
                {baseFilteredInvoices.filter(i => i.payment_status === 'partial').length} Hóa Đơn
              </div>
            </div>
          </div>

          {/* Invoice Filter Bar & Trial Policy Note */}
          <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setInvoiceStatusFilter('all')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  invoiceStatusFilter === 'all'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Tất cả ({baseFilteredInvoices.length})
              </button>
              <button
                onClick={() => setInvoiceStatusFilter('trial_pending')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 ${
                  invoiceStatusFilter === 'trial_pending'
                    ? 'bg-purple-500 text-white font-bold shadow-md shadow-purple-500/20'
                    : 'bg-slate-800 text-purple-300 hover:text-white border border-purple-500/30'
                }`}
              >
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span>Chờ học thử ({baseFilteredInvoices.filter(i => i.is_trial_pending).length})</span>
              </button>
              <button
                onClick={() => setInvoiceStatusFilter('paid')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  invoiceStatusFilter === 'paid'
                    ? 'bg-emerald-500 text-white font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Đã thanh toán ({baseFilteredInvoices.filter(i => i.payment_status === 'paid').length})
              </button>
              <button
                onClick={() => setInvoiceStatusFilter('partial')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 ${
                  invoiceStatusFilter === 'partial'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'bg-slate-800 text-amber-300 hover:text-white border border-amber-500/30'
                }`}
              >
                <Coins className="w-3 h-3 text-amber-400" />
                <span>Nợ một phần ({baseFilteredInvoices.filter(i => i.payment_status === 'partial').length})</span>
              </button>
              <button
                onClick={() => setInvoiceStatusFilter('unpaid')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  invoiceStatusFilter === 'unpaid'
                    ? 'bg-rose-500 text-white font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Chưa nộp ({baseFilteredInvoices.filter(i => i.payment_status === 'unpaid' && !i.is_trial_pending).length})
              </button>
              <button
                onClick={() => setInvoiceStatusFilter('cancelled')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  invoiceStatusFilter === 'cancelled'
                    ? 'bg-slate-700 text-white font-bold'
                    : 'bg-slate-800 text-slate-500 hover:text-white'
                }`}
              >
                Đã hủy ({baseFilteredInvoices.filter(i => i.payment_status === 'cancelled').length})
              </button>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 bg-slate-950/60 px-3 py-1 rounded-xl border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
              <span>Hóa đơn <strong>"Chờ hoàn thành học thử"</strong> tự động loại trừ khỏi thông báo nhắc nợ (Zalo/SMS).</span>
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

                        {invoice.is_trial_pending ? (
                          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1 shadow-sm" title="Học sinh đang học thử buổi 1 - Hóa đơn tạm hoãn chờ kích hoạt (không nhắc nợ)">
                            <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                            Chờ hoàn thành học thử
                          </span>
                        ) : invoice.payment_status === 'cancelled' ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-medium" title="Học sinh dừng sau buổi học thử - miễn phí 100%">
                            Đã hủy (Miễn phí thử)
                          </span>
                        ) : invoice.payment_status === 'paid' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            Đã thanh toán
                          </span>
                        ) : invoice.payment_status === 'partial' ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            Nợ một phần
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
                        <div className="flex justify-between text-xs pt-1 text-emerald-400">
                          <span>Đã nộp lũy kế:</span>
                          <span className="font-mono font-bold">{formatVND(invoice.paid_amount || 0)}</span>
                        </div>
                        <div className="flex justify-between text-xs pt-1 border-t border-slate-800/60">
                          <span className="text-slate-400">Còn nợ:</span>
                          <span className={`font-mono font-bold ${invoice.outstanding_amount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {formatVND(invoice.outstanding_amount)}
                          </span>
                        </div>

                        {invoice.payment_history && invoice.payment_history.length > 0 && (
                          <div className="pt-1.5 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/50">
                            <span className="flex items-center gap-1 text-cyan-400">
                              <History className="w-3 h-3" />
                              <span>{invoice.payment_history.length} đợt đã nộp</span>
                            </span>
                            <span className="font-mono text-slate-500">Gần nhất: {invoice.payment_history[invoice.payment_history.length - 1].payment_date}</span>
                          </div>
                        )}
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

                      {invoice.payment_status !== 'paid' && invoice.outstanding_amount > 0 && (
                        <button
                          onClick={() => openVerifyModal(invoice)}
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
                    <th className="py-3 px-4">Đã Nộp</th>
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

                        <td className="py-3 px-4 font-mono text-emerald-400 font-bold">
                          <div>{formatVND(invoice.paid_amount || 0)}</div>
                          {invoice.payment_history && invoice.payment_history.length > 0 && (
                            <div className="text-[9px] text-slate-500 font-sans">({invoice.payment_history.length} đợt)</div>
                          )}
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
                          {invoice.is_trial_pending ? (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold inline-flex items-center gap-1 shadow-sm" title="Học sinh đang học thử buổi 1 - Tạm hoãn thu toàn khóa, không gửi nhắc nợ">
                              <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                              Chờ hoàn thành học thử
                            </span>
                          ) : invoice.payment_status === 'cancelled' ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-medium" title="Học sinh dừng sau buổi học thử - miễn phí 100%">
                              Đã hủy (Miễn phí thử)
                            </span>
                          ) : invoice.payment_status === 'paid' ? (
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

                            {invoice.payment_status !== 'paid' && invoice.outstanding_amount > 0 && (
                              <button
                                onClick={() => openVerifyModal(invoice)}
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
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Phạm vi quyết toán:</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  Khóa: {store.terms.find(t => t.id === selectedTermId)?.name || 'Tất cả niên khóa'}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                  Cơ sở: {store.campuses.find(c => c.id === selectedCampusId)?.name || 'Tất cả cơ sở'}
                </span>
              </div>
            </div>

            <ViewToggle viewMode={payrollViewMode} onViewModeChange={setPayrollViewMode} />
          </div>

          {/* VIEW 1: PAYROLL CARDS VIEW */}
          {payrollViewMode === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {store.teachers.map(teacher => {
                const assignedClasses = store.classes.filter(c => {
                  const matchTeacher = c.primary_teacher_id === teacher.id;
                  const matchCampus = selectedCampusId === 'all' || c.campus_id === selectedCampusId;
                  const matchTerm = selectedTermId === 'all' || c.term_id === selectedTermId;
                  return matchTeacher && matchCampus && matchTerm;
                });

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
                    const assignedClasses = store.classes.filter(c => {
                      const matchTeacher = c.primary_teacher_id === teacher.id;
                      const matchCampus = selectedCampusId === 'all' || c.campus_id === selectedCampusId;
                      const matchTerm = selectedTermId === 'all' || c.term_id === selectedTermId;
                      return matchTeacher && matchCampus && matchTerm;
                    });
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
                {store.students.map(s => {
                  const activeCount = store.enrollments.filter(e => e.student_id === s.id && e.status === 'active').length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) {activeCount > 0 ? `• [${activeCount} lớp đang học]` : '• [Chưa có lớp]'}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Lớp học hiện tại {currentStudentClasses.length > 0 && (
                    <span className="text-amber-400 font-normal">({currentStudentClasses.length} lớp đang học)</span>
                  )}
                </label>
                <select
                  value={transferState.from_class_id}
                  onChange={(e) => setTransferState({ ...transferState, from_class_id: e.target.value })}
                  disabled={currentStudentClasses.length === 0}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {currentStudentClasses.length === 0 ? (
                    <option value="">[ Học sinh chưa có lớp đang học ]</option>
                  ) : (
                    currentStudentClasses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({formatVND(c.price_per_session)}/buổi)
                      </option>
                    ))
                  )}
                </select>
                {currentStudentClasses.length === 0 && (
                  <p className="text-[11px] text-amber-400/90 mt-1 italic">
                    * Học sinh này chưa tham gia lớp học nào đang hoạt động. Không thể chuyển lớp.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Lớp học chuyển đến</label>
                <select
                  value={transferState.to_class_id}
                  onChange={(e) => setTransferState({ ...transferState, to_class_id: e.target.value })}
                  disabled={currentStudentClasses.length === 0}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {store.classes
                    .filter(c => c.id !== transferState.from_class_id)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({formatVND(c.price_per_session)}/buổi)
                      </option>
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
                disabled={currentStudentClasses.length === 0}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Live Calculation Preview */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Đơn giá lớp cũ:</span>
                <span className="font-mono text-white">
                  {fromClass ? `${formatVND(oldRate)} / buổi` : (currentStudentClasses.length === 0 ? 'Không có lớp' : 'Chưa chọn')}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Đơn giá lớp mới:</span>
                <span className="font-mono text-white">
                  {toClass ? `${formatVND(newRate)} / buổi` : 'Chưa chọn'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Số buổi chuyển:</span>
                <span className="font-mono text-white">{transferState.remaining_sessions} buổi</span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                <span className="font-bold text-white text-sm">Tiền phụ thu chênh lệch:</span>
                <span className={`text-base font-extrabold font-mono ${surcharge > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {currentStudentClasses.length === 0 
                    ? '0 đ (Không khả dụng)' 
                    : surcharge > 0 
                    ? formatVND(surcharge) 
                    : '0 đ (Chuyển ngang)'}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleExecuteTransfer}
                disabled={currentStudentClasses.length === 0 || !transferState.from_class_id || !transferState.to_class_id || transferState.from_class_id === transferState.to_class_id}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
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
        const outstanding = viewingQrInvoice.outstanding_amount;
        const netPayable = viewingQrInvoice.net_payable;
        const paidAmount = viewingQrInvoice.paid_amount || 0;

        const qrUrl = generateVietQRUrl({
          bankName: campus.bank_name,
          bankAccount: campus.bank_account,
          bankOwner: campus.bank_owner,
          amount: outstanding > 0 ? outstanding : netPayable,
          studentCode: student?.code || 'STUDENT',
          className: cls?.name || 'CLASS',
          invoiceCode: viewingQrInvoice.invoice_code,
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl text-center space-y-4">
              <div className="flex items-center justify-between text-xs text-amber-400 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <QrCode className="w-4 h-4" />
                  <span>VietQR Napas247 Hoàng Gia</span>
                </span>
                <button onClick={() => setViewingQrInvoice(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">✕</button>
              </div>

              {paidAmount > 0 && outstanding > 0 && (
                <div className="bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs py-1.5 px-3 rounded-xl text-left">
                  <span className="font-bold">Mã QR Thu Công Nợ Đợt Tiếp Theo:</span> Đã thu lũy kế <strong>{formatVND(paidAmount)}</strong>. Mã QR tự động sinh đúng theo số tiền còn nợ <strong>{formatVND(outstanding)}</strong>.
                </div>
              )}

              <div className="bg-white p-3 rounded-2xl inline-block shadow-md">
                <img
                  src={qrUrl}
                  alt="VietQR"
                  className="w-64 h-64 mx-auto object-contain"
                />
              </div>

              <div className="text-left bg-slate-900 p-3.5 rounded-2xl text-xs space-y-1.5 border border-slate-800">
                <div className="text-slate-400 flex justify-between">
                  <span>Ngân hàng:</span>
                  <strong className="text-white">{campus.bank_name}</strong>
                </div>
                <div className="text-slate-400 flex justify-between">
                  <span>Số tài khoản:</span>
                  <strong className="text-amber-400 font-mono text-sm">{campus.bank_account}</strong>
                </div>
                <div className="text-slate-400 flex justify-between">
                  <span>Chủ tài khoản:</span>
                  <strong className="text-white">{campus.bank_owner}</strong>
                </div>
                <div className="text-slate-400 flex justify-between pt-1 border-t border-slate-800">
                  <span>Số tiền quét mã QR:</span>
                  <strong className="text-emerald-400 font-mono text-sm font-extrabold">{formatVND(outstanding > 0 ? outstanding : netPayable)}</strong>
                </div>
                <div className="text-slate-400 flex justify-between">
                  <span>Nội dung CK:</span>
                  <strong className="text-cyan-300 font-mono">HP {student?.code} {cls?.name.split('-')[0].trim()}</strong>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setViewingQrInvoice(null)}
                  className="w-1/2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
                >
                  Đóng Mã QR
                </button>
                {viewingQrInvoice.payment_status !== 'paid' && viewingQrInvoice.outstanding_amount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const inv = viewingQrInvoice;
                      setViewingQrInvoice(null);
                      openVerifyModal(inv);
                    }}
                    className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Gạch nợ ngay</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* VerifyPaymentModal - Partial Payment & Debt Reconciliation */}
      {verifyingInvoice && (() => {
        const student = store.students.find(s => s.id === verifyingInvoice.student_id);
        const cls = store.classes.find(c => c.id === verifyingInvoice.class_id);
        const currentPaid = verifyingInvoice.paid_amount || 0;
        const netPayable = verifyingInvoice.net_payable;
        const outstanding = verifyingInvoice.outstanding_amount;
        const rawDigits = paymentAmountInput.replace(/\D/g, '');
        const numAmount = parseInt(rawDigits || '0', 10);
        const projectedPaid = currentPaid + numAmount;
        const projectedOutstanding = Math.max(0, netPayable - projectedPaid);
        const isProjectedComplete = projectedOutstanding === 0 && numAmount > 0;
        const isInvalid = numAmount <= 0 || numAmount > outstanding || !!validationError;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-3xl rounded-3xl bg-[#0F172A] border border-emerald-500/30 p-5 sm:p-7 shadow-2xl space-y-5 my-6 text-slate-100 max-h-[92vh] overflow-y-auto custom-scrollbar">
              
              {/* Modal Top Bar */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/10">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                      <span>Xác Nhận Thu Học Phí & Gạch Nợ</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {verifyingInvoice.invoice_code}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Hỗ trợ thanh toán từng phần (Partial Payment) & tự động điều chỉnh công nợ VietQR
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setVerifyingInvoice(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* KHỐI 1: TÓM TẮT THÔNG TIN HÓA ĐƠN (INVOICE OVERVIEW) */}
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                  <div className="space-y-0.5">
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <span>Học viên:</span>
                      <strong className="text-white text-sm">{student?.name}</strong>
                      <span className="font-mono text-amber-400 text-xs">({student?.code})</span>
                      {student?.regular_class && (
                        <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                          Lớp {student.regular_class}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-300">
                      Lớp ngoại khóa: <strong className="text-cyan-300">{cls?.name}</strong>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-400 font-mono">
                    Hạn nộp: <span className="text-amber-300">{verifyingInvoice.due_date}</span>
                  </div>
                </div>

                {/* 3 Metric Pillars */}
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Phải đóng ban đầu</div>
                    <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">{formatVND(netPayable)}</div>
                    {verifyingInvoice.credit_deducted > 0 && (
                      <div className="text-[10px] text-cyan-400 font-mono mt-0.5">Đã trừ bảo lưu {formatVND(verifyingInvoice.credit_deducted)}</div>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                    <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Đã đóng lũy kế</div>
                    <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">{formatVND(currentPaid)}</div>
                    <div className="text-[10px] text-emerald-300/80 font-mono mt-0.5">
                      {verifyingInvoice.payment_history?.length || 0} đợt đã nộp
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/40">
                    <div className="text-[10px] font-semibold text-rose-400 uppercase tracking-wide">Công nợ hiện tại</div>
                    <div className="text-base font-extrabold font-mono text-rose-400 mt-0.5">{formatVND(outstanding)}</div>
                    <div className="text-[10px] text-rose-300/80 font-mono mt-0.5">Cần thu hồi</div>
                  </div>
                </div>
              </div>

              {/* KHỐI 2: KHU VỰC NHẬP LIỆU ĐỢT THU MỚI (PAYMENT INPUT) */}
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-amber-400" />
                    <span>Thiết Lập Đợt Thu Tiền Này</span>
                  </span>

                  {/* Mode selector: Full vs Partial */}
                  <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={handleSelectFullPayment}
                      className={`px-3 py-1 rounded-lg font-bold transition-all ${
                        paymentMode === 'full'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Đóng toàn bộ ({formatVND(outstanding)})
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectPartialPayment}
                      className={`px-3 py-1 rounded-lg font-bold transition-all ${
                        paymentMode === 'partial'
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Đóng một phần
                    </button>
                  </div>
                </div>

                {/* Amount input & quick amount chips */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="text-slate-300 font-semibold flex items-center gap-1">
                      <span>Số tiền thu đợt này (VND)</span>
                      <span className="text-rose-400">*</span>
                    </label>
                    {rawDigits && (
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        = {formatVND(numAmount)}
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold font-mono text-base">
                      ₫
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={paymentAmountInput ? parseInt(paymentAmountInput, 10).toLocaleString('vi-VN') : ''}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      placeholder="Nhập số tiền nộp (VD: 1,500,000)"
                      className={`w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-950 border font-mono text-lg font-bold text-white focus:outline-none transition-all ${
                        validationError
                          ? 'border-rose-500 focus:border-rose-400 bg-rose-950/20'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                  </div>

                  {/* Validation Error Message */}
                  {validationError && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold bg-rose-950/40 p-2.5 rounded-xl border border-rose-500/30">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{validationError}</span>
                    </div>
                  )}

                  {/* Quick suggestion chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
                    <span className="text-slate-400 font-medium">Gợi ý nhanh:</span>
                    <button
                      type="button"
                      onClick={() => handleSetQuickAmount(500000)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors border border-slate-700"
                    >
                      500.000 đ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickAmount(1000000)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors border border-slate-700"
                    >
                      1.000.000 đ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickAmount(2000000)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors border border-slate-700"
                    >
                      2.000.000 đ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickAmount(Math.round(outstanding / 2))}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono transition-colors border border-slate-700"
                    >
                      50% nợ ({formatVND(Math.round(outstanding / 2))})
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectFullPayment}
                      className="px-2.5 py-1 rounded-lg bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-300 font-mono font-bold transition-colors border border-emerald-500/30"
                    >
                      Tất toán ({formatVND(outstanding)})
                    </button>
                  </div>
                </div>

                {/* Payment Method Tabs & Reference input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Hình thức thanh toán *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectPaymentMethod('bank_transfer')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                          paymentMethod === 'bank_transfer'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-md shadow-cyan-500/10'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Chuyển khoản (VietQR)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectPaymentMethod('cash')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                          paymentMethod === 'cash'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/10'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Tiền mặt (Phiếu thu)</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        {paymentMethod === 'bank_transfer' ? 'Mã GD ngân hàng / Sao kê *' : 'Mã phiếu thu tiền mặt *'}
                      </label>
                      <button
                        type="button"
                        onClick={handleRegenerateRef}
                        className="text-[10px] text-amber-400 hover:text-amber-300 font-mono"
                        title="Tạo mã giao dịch ngẫu nhiên mới"
                      >
                        Tạo mã mới
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={paymentRefInput}
                        onChange={(e) => setPaymentRefInput(e.target.value)}
                        placeholder={paymentMethod === 'bank_transfer' ? 'VD: VCB-FT262458921' : 'VD: TM-123456'}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Date & Cashier input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Ngày nộp tiền *
                    </label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Kế toán / Nhân sự thu tiền *
                    </label>
                    <input
                      type="text"
                      value={verifiedByInput}
                      onChange={(e) => setVerifiedByInput(formatCapitalizeWords(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500 capitalize"
                    />
                  </div>
                </div>

                {/* Notes input & Quick suggestions */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Ghi chú đợt đóng tiền
                  </label>
                  <input
                    type="text"
                    value={paymentNotesInput}
                    onChange={(e) => setPaymentNotesInput(e.target.value)}
                    placeholder="VD: Đóng đợt 1 - 1.500.000 đ, hẹn tuần sau đóng nốt"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400">
                    <span>Mẫu ghi chú:</span>
                    {['Đóng đợt 1', 'Đóng đợt 2', 'Nộp tiền cọc giữ chỗ', 'Tất toán hoàn tất học phí', 'Nộp theo thỏa thuận phụ huynh'].map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPaymentNotesInput(chip)}
                        className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* KHỐI 3: XEM TRƯỚC KẾT QUẢ SAU KHI GẠCH NỢ (REAL-TIME PREVIEW CALCULATION) */}
              <div className="rounded-2xl p-4 bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-white flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Sparkles className="w-4 h-4" />
                    <span>Xem Trước Kết Quả Sau Đợt Thu Này</span>
                  </span>
                  <div>
                    {isProjectedComplete ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Trạng thái mới: Đã hoàn tất 100% (Paid)</span>
                      </span>
                    ) : numAmount > 0 && !validationError ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5" />
                        <span>Trạng thái mới: Nợ một phần (Partial)</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Chưa nhập số tiền</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Lũy kế đã nộp sau đợt:</div>
                    <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                      {formatVND(projectedPaid)}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Công nợ còn lại sau đợt:</div>
                    <div className={`text-sm font-bold font-mono mt-0.5 ${projectedOutstanding > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {formatVND(projectedOutstanding)}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 col-span-2 sm:col-span-1">
                    <div className="text-[10px] text-slate-400">VietQR đợt tiếp theo:</div>
                    <div className="text-xs font-mono text-cyan-300 font-semibold mt-0.5">
                      {projectedOutstanding > 0 ? `Tự động tạo QR ${formatVND(projectedOutstanding)}` : 'Hết nợ (Không cần sinh QR)'}
                    </div>
                  </div>
                </div>
              </div>

              {/* KHỐI 4: LỊCH SỬ CÁC ĐỢT ĐÓNG TIỀN TRƯỚC ĐÓ (PAYMENT HISTORY TABLE) */}
              <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <History className="w-4 h-4 text-cyan-400" />
                    <span>Lịch Sử Các Đợt Đã Đóng Tiền ({verifyingInvoice.payment_history?.length || 0} đợt)</span>
                  </h4>
                </div>

                {!verifyingInvoice.payment_history || verifyingInvoice.payment_history.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-500 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    Chưa có giao dịch thanh toán nào trước đó (Hóa đơn mới, chưa thu lần nào).
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3 text-center">Đợt</th>
                          <th className="py-2 px-3">Ngày Nộp</th>
                          <th className="py-2 px-3 text-right">Số Tiền Nộp</th>
                          <th className="py-2 px-3">Hình Thức & Mã GD</th>
                          <th className="py-2 px-3">Kế Toán Xác Nhận</th>
                          <th className="py-2 px-3">Ghi Chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {verifyingInvoice.payment_history.map((record, idx) => (
                          <tr key={record.id || idx} className="hover:bg-slate-800/30">
                            <td className="py-2 px-3 text-center font-bold font-mono text-amber-400">
                              Đợt {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-300">
                              {record.payment_date}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                              {formatVND(record.amount)}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-300">
                              <span className="font-semibold text-white">
                                {record.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                              </span>
                              <div className="text-[10px] text-slate-400">{record.payment_reference}</div>
                            </td>
                            <td className="py-2 px-3 text-slate-300 font-medium">
                              {record.verified_by}
                            </td>
                            <td className="py-2 px-3 text-slate-400 italic text-[11px]">
                              {record.notes || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* KHỐI 5: NÚT BẤM HÀNH ĐỘNG (MODAL FOOTER ACTIONS) */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setVerifyingInvoice(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Đóng / Hủy bỏ
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmPayment}
                    disabled={isInvalid}
                    className={`px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg ${
                      isInvalid
                        ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 active:scale-95'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {numAmount > 0 ? `Xác Nhận Gạch Nợ ${formatVND(numAmount)}` : 'Xác Nhận Gạch Nợ'}
                    </span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};
