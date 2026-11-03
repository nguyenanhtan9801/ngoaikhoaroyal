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
  AlertCircle,
  FileText,
  ShieldCheck,
  Layers,
  Info,
  SlidersHorizontal,
  BookmarkCheck,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  RefreshCw,
  Search
} from 'lucide-react';
import { AppStore, formatVND, createAuditRecord, appendAuditLog, formatCapitalizeWords, formatDaysListLabel, getClassDaysOfWeek, getTeacherEffectivePeriodRate, formatDateVN } from '../../lib/storage';
import { generateVietQRUrl, getBankCode } from '../../lib/vietqr';
import { exportTeacherPayrollWorkbook, TeacherPayrollSummaryExcelRow } from '../../lib/excel';
import { TuitionInvoice, Teacher, TeacherAttendanceRecord, ExtracurricularClass, UserRole, AppUser, InvoicePaymentRecord, ClassTransfer, CreditNote } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { StudentSearchCombobox } from '../StudentSearchCombobox';
import { showToast } from '../../lib/toast';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { mapSupabaseRowToStoreEntity } from '../../lib/supabase';

interface FinancePayrollTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  selectedCampusId: string;
  selectedTermId: string;
  searchQuery?: string;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onPrintReceipt: (invoice: TuitionInvoice) => void;
  onPrintTransferAgreement?: (transfer: ClassTransfer) => void;
  initialSection?: 'invoices' | 'payroll' | 'transfer';
}

export const FinancePayrollTab: React.FC<FinancePayrollTabProps> = ({
  store,
  currentRole,
  currentUser,
  selectedCampusId,
  selectedTermId,
  searchQuery: externalSearchQuery = '',
  onUpdateStore,
  onPrintReceipt,
  onPrintTransferAgreement,
  initialSection = 'invoices',
}) => {
  const [activeSection, setActiveSection] = useState<'invoices' | 'payroll' | 'transfer'>(initialSection);
  const [invoiceViewMode, setInvoiceViewMode] = useState<ViewMode>('table');
  const [payrollViewMode, setPayrollViewMode] = useState<ViewMode>('table');
  const [transferViewMode, setTransferViewMode] = useState<ViewMode>('table');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid' | 'trial_pending' | 'cancelled'>('all');
  // Invoices Scope Filters: default to 'all' to ensure newly created invoices in any term are visible
  const [invoiceTermFilter, setInvoiceTermFilter] = useState<string>('all');
  const [invoiceCampusFilter, setInvoiceCampusFilter] = useState<string>(selectedCampusId || 'all');
  const [searchQuery, setSearchQuery] = useState<string>(externalSearchQuery || '');
  const [isRefreshingInvoices, setIsRefreshingInvoices] = useState(false);

  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchQuery(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  // Hàm loại bỏ dấu tiếng Việt để tìm kiếm chính xác
  const removeAccents = (str: string) => {
    return (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .toLowerCase();
  };

  // Fetch invoices directly from Supabase to guarantee real-time sync
  const fetchInvoicesFromSupabase = async () => {
    const client = getSupabaseClient() || supabase;
    if (!client) return;
    try {
      setIsRefreshingInvoices(true);
      let { data, error } = await client
        .from('tuition_invoices')
        .select(`
          *,
          students (
            id,
            code,
            name,
            parent_phone
          ),
          extracurricular_classes (
            id,
            name,
            code
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        const fallbackRes = await client
          .from('tuition_invoices')
          .select('*')
          .order('created_at', { ascending: false });
        data = fallbackRes.data as any;
        error = fallbackRes.error;
      }

      if (error) {
        console.warn('Lỗi fetch tuition_invoices từ Supabase:', error);
        return;
      }

      if (Array.isArray(data)) {
        const mappedInvoices = data.map((r: any) => mapSupabaseRowToStoreEntity('tuition_invoices', r));
        onUpdateStore((prev) => ({
          ...prev,
          invoices: mappedInvoices,
        }));
      }
    } catch (err: any) {
      console.warn('Exception khi fetch tuition_invoices:', err);
    } finally {
      setIsRefreshingInvoices(false);
    }
  };

  useEffect(() => {
    fetchInvoicesFromSupabase();
  }, []);

  React.useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  const [viewingQrInvoice, setViewingQrInvoice] = useState<TuitionInvoice | null>(null);
  const [verifyingInvoice, setVerifyingInvoice] = useState<TuitionInvoice | null>(null);

  // Teacher Payroll & Workload BI Dashboard Filter & Modal States
  const [payrollTermFilter, setPayrollTermFilter] = useState<string>(() => {
    if (selectedTermId && selectedTermId !== 'all') return selectedTermId;
    return store.terms.find(t => t.is_active)?.id || store.terms[0]?.id || 'term_fall_2026';
  });
  const [payrollCampusFilter, setPayrollCampusFilter] = useState<string>(selectedCampusId || 'all');
  const [detailLogTeacher, setDetailLogTeacher] = useState<Teacher | null>(null);
  const [printingPayslipTeacher, setPrintingPayslipTeacher] = useState<Teacher | null>(null);

  useEffect(() => {
    if (selectedTermId && selectedTermId !== 'all') {
      setPayrollTermFilter(selectedTermId);
    }
  }, [selectedTermId]);

  useEffect(() => {
    if (selectedCampusId) {
      setPayrollCampusFilter(selectedCampusId);
    }
  }, [selectedCampusId]);

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

  const [targetCampusId, setTargetCampusId] = useState<string>(selectedCampusId || store.campuses[0]?.id || '');
  const [targetSubjectId, setTargetSubjectId] = useState<string>('all');
  const [surplusHandling, setSurplusHandling] = useState<'standard_no_refund' | 'issue_credit_note' | 'convert_sessions'>('standard_no_refund');
  const [transferReason, setTransferReason] = useState<string>('Phụ huynh đăng ký chuyển đổi môn học / cơ sở theo nguyện vọng');
  const [managerOverrideQuota, setManagerOverrideQuota] = useState<boolean>(false);
  const [viewingTransferQr, setViewingTransferQr] = useState<boolean>(false);

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

  const fromClass = useMemo(() => {
    return currentStudentClasses.find(c => c.id === transferState.from_class_id);
  }, [currentStudentClasses, transferState.from_class_id]);

  // Tự động tính "Số buổi còn lại chưa học" theo sổ điểm danh hoặc lịch khóa
  const autoRemainingInfo = useMemo(() => {
    if (!fromClass || !transferState.student_id) return { elapsed: 0, total: 20, remaining: 10 };
    const total = fromClass.total_sessions || 20;
    // Điểm danh thực tế của học sinh trong lớp này
    const attendedCount = store.attendance.filter(
      a => a.class_id === fromClass.id && a.student_id === transferState.student_id
    ).length;

    const today = new Date().toISOString().split('T')[0];
    const completedSessions = store.sessions.filter(
      s => s.class_id === fromClass.id && (s.status === 'completed' || s.session_date <= today)
    ).length;

    const elapsed = attendedCount > 0 ? attendedCount : completedSessions;
    const remaining = Math.max(1, total - elapsed);
    return { elapsed, total, remaining };
  }, [fromClass, transferState.student_id, store.attendance, store.sessions]);

  // Tự động đồng bộ số buổi còn lại khi chuyển lớp hoặc đổi học sinh
  useEffect(() => {
    if (autoRemainingInfo.remaining > 0) {
      setTransferState(prev => ({
        ...prev,
        remaining_sessions: autoRemainingInfo.remaining,
      }));
    }
  }, [autoRemainingInfo.remaining, transferState.from_class_id, transferState.student_id]);

  // 3. Tự động đồng bộ lớp hiện tại (from_class_id) khi người dùng đổi học sinh
  useEffect(() => {
    if (currentStudentClasses.length > 0) {
      const isCurrentValid = currentStudentClasses.some(c => c.id === transferState.from_class_id);
      if (!isCurrentValid) {
        const defaultFrom = currentStudentClasses[0];
        setTransferState(prev => ({
          ...prev,
          from_class_id: defaultFrom.id,
        }));
        if (defaultFrom.campus_id) {
          setTargetCampusId(defaultFrom.campus_id);
        }
      }
    } else {
      setTransferState(prev => ({
        ...prev,
        from_class_id: ''
      }));
    }
  }, [transferState.student_id, currentStudentClasses]);

  // Đồng bộ cơ sở đích khi lớp hiện tại thay đổi
  useEffect(() => {
    if (fromClass?.campus_id && !targetCampusId) {
      setTargetCampusId(fromClass.campus_id);
    }
  }, [fromClass?.campus_id]);

  // 4. Lọc lớp học chuyển đến theo Cơ sở đích & Môn học đích (loại trừ lớp cũ)
  const filteredTargetClasses = useMemo(() => {
    return store.classes.filter(c => {
      if (c.id === transferState.from_class_id) return false;
      if (targetCampusId && c.campus_id !== targetCampusId) return false;
      if (targetSubjectId && targetSubjectId !== 'all' && c.subject_id !== targetSubjectId) return false;
      return true;
    });
  }, [store.classes, transferState.from_class_id, targetCampusId, targetSubjectId]);

  // 5. Đảm bảo to_class_id luôn hợp lệ trong filteredTargetClasses
  useEffect(() => {
    if (filteredTargetClasses.length > 0) {
      const isValid = filteredTargetClasses.some(c => c.id === transferState.to_class_id);
      if (!isValid) {
        setTransferState(prev => ({
          ...prev,
          to_class_id: filteredTargetClasses[0].id
        }));
      }
    } else {
      setTransferState(prev => ({
        ...prev,
        to_class_id: ''
      }));
    }
  }, [filteredTargetClasses, transferState.to_class_id]);

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

  // 1. Base filtered invoices by Campus, Term, and Search Query (Tên, Mã HV, Mã HĐ, SĐT)
  const baseFilteredInvoices = useMemo(() => {
    return store.invoices.filter((inv: any) => {
      const cls = store.classes.find(c => c.id === inv.class_id);
      const student = store.students.find(s => s.id === inv.student_id || s.code === inv.student_id);

      // 1. Lọc theo Khóa & Cơ sở đang chọn
      const invCampusId = cls?.campus_id || inv.campus_id;
      const invTermId = cls?.term_id || inv.term_id;
      if (invoiceTermFilter !== 'all' && invTermId && invTermId !== invoiceTermFilter) return false;
      if (invoiceCampusFilter !== 'all' && invCampusId && invCampusId !== invoiceCampusFilter) return false;

      // 2. Lọc theo Từ khóa tìm kiếm (Tên, Mã HV, Mã HĐ, SĐT)
      if (!searchQuery.trim()) return true;

      const query = removeAccents(searchQuery.trim());
      const studentName = removeAccents(inv.students?.name || inv.student_name || student?.name || '');
      const studentCode = (inv.students?.code || inv.student_code || student?.code || inv.student_id || '').toLowerCase();
      const invoiceCode = (inv.invoice_code || inv.id || '').toLowerCase();
      const parentPhone = (inv.students?.parent_phone || inv.parent_phone || student?.parent_phone || '').replace(/\s+/g, '');
      const className = removeAccents(inv.extracurricular_classes?.name || cls?.name || '');

      return (
        studentName.includes(query) ||
        studentCode.includes(query) ||
        invoiceCode.includes(query) ||
        parentPhone.includes(query.replace(/\s+/g, '')) ||
        className.includes(query)
      );
    });
  }, [store.invoices, store.classes, store.students, invoiceCampusFilter, invoiceTermFilter, searchQuery]);

  // 2. Filtered invoices by status sub-filter
  const filteredInvoices = useMemo(() => {
    return baseFilteredInvoices.filter(inv => {
      if (invoiceStatusFilter !== 'all') {
        if (invoiceStatusFilter === 'paid' && inv.payment_status !== 'paid') return false;
        if (invoiceStatusFilter === 'partial' && inv.payment_status !== 'partial') return false;
        if (invoiceStatusFilter === 'unpaid' && (inv.payment_status !== 'unpaid' || inv.is_trial_pending)) return false;
        if (invoiceStatusFilter === 'trial_pending' && !inv.is_trial_pending) return false;
        if (invoiceStatusFilter === 'cancelled' && inv.payment_status !== 'cancelled') return false;
      }
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
            is_trial_pending: false,
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
      enrollments: prev.enrollments.map(enr => {
        if (
          enr.student_id === verifyingInvoice.student_id &&
          enr.class_id === verifyingInvoice.class_id &&
          enr.status === 'trial'
        ) {
          return {
            ...enr,
            status: 'active',
            trial_completed_action: 'promoted',
          };
        }
        return enr;
      }),
      auditLogs: [paymentLog, ...(prev.auditLogs || [])],
    }));

    setVerifyingInvoice(null);
    setPaymentAmountInput('');
    setPaymentRefInput('');
    setPaymentNotesInput('');
    setValidationError(null);
    showToast(
      `Đã gạch nợ đợt ${updatedHistory.length} số tiền ${formatVND(numAmount)} cho hóa đơn ${verifyingInvoice.invoice_code}!`,
      'success',
      { title: 'Gạch nợ học phí thành công' }
    );
  };

  // Activate a trial-pending invoice to official unpaid status & promote student enrollment
  const handleActivateTrialInvoice = (invoice: TuitionInvoice) => {
    const student = store.students.find(s => s.id === invoice.student_id);
    const cls = store.classes.find(c => c.id === invoice.class_id);
    onUpdateStore(prev => {
      const updatedEnrollments = prev.enrollments.map(e =>
        e.student_id === invoice.student_id && e.class_id === invoice.class_id && e.status === 'trial'
          ? { ...e, status: 'active' as const, trial_completed_action: 'promoted' as const }
          : e
      );
      const updatedInvoices = prev.invoices.map(inv =>
        inv.id === invoice.id
          ? { ...inv, is_trial_pending: false, payment_status: 'unpaid' as const }
          : inv
      );
      const promoAudit = createAuditRecord(
        'CLASS_ASSIGN',
        'FINANCE',
        cls?.name || invoice.invoice_code,
        `Kích hoạt thu phí chính thức toàn khóa từ hóa đơn học thử ${invoice.invoice_code} của học viên "${student?.name || invoice.student_id}". Mở mã VietQR thu học phí.`,
        currentUser,
        {
          target_id: invoice.id,
          details: { status: 'success', after: { status: 'active', is_trial_pending: false } },
        }
      );
      return appendAuditLog(
        {
          ...prev,
          enrollments: updatedEnrollments,
          invoices: updatedInvoices,
        },
        promoAudit
      );
    });
    showToast(
      `Đã kích hoạt thu phí chính thức cho học viên ${student?.name || invoice.student_id} (${invoice.invoice_code})!`,
      'success',
      { title: 'Kích hoạt hóa đơn chính thức' }
    );
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

    showToast(
      `Đã quyết toán thù lao cho ${teacher.name} thành công: ${formatVND(totalPayroll)}!`,
      'success',
      { title: 'Quyết toán thù lao GV' }
    );
  };

  // Class Transfer Calculation
  const toClass = store.classes.find(c => c.id === transferState.to_class_id);
  const oldRate = fromClass?.price_per_session || 0;
  const newRate = toClass?.price_per_session || 0;
  const rateDiff = newRate - oldRate;
  const isHigherRate = rateDiff > 0;
  const surcharge = (fromClass && toClass && currentStudentClasses.length > 0 && isHigherRate)
    ? rateDiff * transferState.remaining_sessions
    : 0;
  const surplus = (fromClass && toClass && currentStudentClasses.length > 0 && !isHigherRate)
    ? Math.abs(rateDiff) * transferState.remaining_sessions
    : 0;
  const convertedSessions = useMemo(() => {
    if (newRate <= 0 || surplus <= 0) return 0;
    return Math.floor(surplus / newRate);
  }, [surplus, newRate]);

  // Kiểm tra trùng lịch học với các môn khác mà học sinh đang theo học
  const conflictingClasses = useMemo(() => {
    if (!toClass || !transferState.student_id) return [];
    const otherEnrs = store.enrollments.filter(
      e => e.student_id === transferState.student_id && e.status === 'active' && e.class_id !== transferState.from_class_id
    );
    const toDays = toClass.days_of_week || [];
    return otherEnrs
      .map(e => store.classes.find(c => c.id === e.class_id))
      .filter((otherCls): otherCls is ExtracurricularClass => {
        if (!otherCls) return false;
        const otherDays = otherCls.days_of_week || [];
        const hasCommonDay = toDays.some(d => otherDays.includes(d));
        const isSameSlot = otherCls.time_slot_id === toClass.time_slot_id;
        return hasCommonDay && isSameSlot;
      });
  }, [toClass, transferState.student_id, transferState.from_class_id, store.enrollments, store.classes]);

  // Kiểm tra sĩ số lớp mới
  const targetEnrollmentCount = useMemo(() => {
    if (!toClass) return 0;
    return store.enrollments.filter(e => e.class_id === toClass.id && (e.status === 'active' || e.status === 'trial')).length;
  }, [toClass, store.enrollments]);

  const isTargetClassFull = useMemo(() => {
    if (!toClass) return false;
    return targetEnrollmentCount >= toClass.max_students;
  }, [toClass, targetEnrollmentCount]);

  const handleExecuteTransfer = () => {
    const student = store.students.find(s => s.id === transferState.student_id);
    if (!student || !fromClass || !toClass || currentStudentClasses.length === 0 || fromClass.id === toClass.id) {
      showToast('Vui lòng chọn học sinh có lớp đang học và lớp chuyển đến hợp lệ!', 'warning', {
        title: 'Chưa đủ điều kiện chuyển lớp',
      });
      return;
    }

    if (isTargetClassFull && !managerOverrideQuota) {
      showToast(`Lớp đích đã đủ sĩ số (${targetEnrollmentCount}/${toClass.max_students}). Vui lòng phê duyệt ngoại lệ của Quản lý để tiếp nhận!`, 'warning', {
        title: 'Lớp đích đã đầy sĩ số',
      });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const expiryDate = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
    const transferCode = `TRF-2026-${String((store.transfers?.length || 0) + 1).padStart(5, '0')}`;
    const invoiceCode = surcharge > 0 ? `INV-CHUYENLOP-${String(store.invoices.length + 1).padStart(4, '0')}` : undefined;
    const creditCode = (surplusHandling === 'issue_credit_note' && surplus > 0)
      ? `CRE-2026-${String((store.makeupCredits?.length || 0) + 1).padStart(4, '0')}`
      : undefined;

    const extraSessions = surplusHandling === 'convert_sessions' ? convertedSessions : 0;
    const totalNewSessions = transferState.remaining_sessions + extraSessions;

    let createdCreditNote: CreditNote | undefined = undefined;
    if (creditCode && surplus > 0) {
      createdCreditNote = {
        id: `cr_${Date.now()}`,
        credit_code: creditCode,
        student_id: student.id,
        student_name: student.name,
        source_class_id: fromClass.id,
        term_id: fromClass.term_id,
        subject_id: fromClass.subject_id,
        consecutive_absent_count: 0,
        consecutive_dates: [],
        source_rate: oldRate,
        credit_rule: 'monetary',
        total_credit_amount: surplus,
        transferred_sessions: Math.round(surplus / newRate),
        issue_date: today,
        expiry_date: expiryDate,
        expires_at: expiryDate,
        status: 'available',
        note: `Bảo lưu số tiền thặng dư chuyển môn từ lớp ${fromClass.name} sang ${toClass.name} (Biên bản ${transferCode})`,
      };
    }

    const newTransferRecord: ClassTransfer = {
      id: `tr_${Date.now()}`,
      transfer_code: transferCode,
      student_id: student.id,
      from_class_id: fromClass.id,
      to_class_id: toClass.id,
      remaining_sessions: transferState.remaining_sessions,
      old_session_rate: oldRate,
      new_session_rate: newRate,
      surcharge_amount: surcharge,
      surplus_amount: surplus,
      surplus_handling: surplusHandling,
      converted_sessions: extraSessions,
      credit_note_id: createdCreditNote?.id,
      invoice_id: invoiceCode ? `inv_surcharge_${Date.now()}` : undefined,
      reason: transferReason || 'Chuyển môn / lớp theo nguyện vọng của học sinh',
      transfer_date: today,
      created_by: currentUser?.full_name ? formatCapitalizeWords(currentUser.full_name) : 'Học vụ Royal School',
    };

    onUpdateStore(prev => {
      // 1. Cập nhật trạng thái lớp cũ thành transferred (giải phóng chỗ)
      const updatedEnrollments = prev.enrollments.map(e => {
        if (e.student_id === student.id && e.class_id === fromClass.id && e.status === 'active') {
          return { ...e, status: 'transferred' as const };
        }
        return e;
      });

      // 2. Tạo bản ghi ghi danh mới ở lớp chuyển đến (kèm số buổi quy đổi nếu có)
      updatedEnrollments.push({
        id: `enr_${Date.now()}`,
        student_id: student.id,
        class_id: toClass.id,
        registered_sessions: totalNewSessions,
        joined_date: today,
        status: 'active',
      });

      // 3. Nếu phát sinh phụ thu chênh lệch, lập hóa đơn phụ thu
      let updatedInvoices = [...prev.invoices];
      if (surcharge > 0 && newTransferRecord.invoice_id) {
        updatedInvoices.unshift({
          id: newTransferRecord.invoice_id,
          invoice_code: invoiceCode!,
          student_id: student.id,
          class_id: toClass.id,
          gross_amount: surcharge,
          credit_deducted: 0,
          net_payable: surcharge,
          paid_amount: 0,
          outstanding_amount: surcharge,
          payment_status: 'unpaid',
          due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          created_at: today,
        });
      }

      // 4. Nếu chọn cấp phiếu bảo lưu thặng dư, thêm vào makeupCredits
      let updatedCredits = [...(prev.makeupCredits || [])];
      if (createdCreditNote) {
        updatedCredits.unshift(createdCreditNote);
      }

      // 5. Ghi nhật ký kiểm toán (Audit Trail)
      const auditDetailsText = surcharge > 0
        ? `Phụ thu phát sinh: ${formatVND(surcharge)} (Mã HĐ: ${invoiceCode})`
        : surplus > 0 && surplusHandling === 'issue_credit_note'
        ? `Cấp phiếu bảo lưu thặng dư ${creditCode}: ${formatVND(surplus)}`
        : surplus > 0 && surplusHandling === 'convert_sessions'
        ? `Quy đổi thặng dư thành +${extraSessions} buổi học tại lớp mới`
        : 'Chuyển ngang theo quy chế (Không hoàn tiền chênh lệch)';

      const transferLog = createAuditRecord(
        'CLASS_TRANSFER',
        'ACADEMIC',
        `Biên bản chuyển lớp ${transferCode}`,
        `Chuyển lớp cho học sinh ${student.name} (${student.code}) từ "${fromClass.name}" sang "${toClass.name}". ${auditDetailsText}. Định mức bánh sữa chuyển sang lớp mới.`,
        currentUser,
        {
          target_id: transferCode,
          details: {
            status: 'success',
            before: { class_id: fromClass.id, class_name: fromClass.name, rate: oldRate },
            after: {
              class_id: toClass.id,
              class_name: toClass.name,
              rate: newRate,
              remaining_sessions: transferState.remaining_sessions,
              surcharge,
              surplus,
              surplus_handling: surplusHandling,
              converted_sessions: extraSessions,
              transfer_code: transferCode,
            }
          }
        }
      );

      return {
        ...prev,
        enrollments: updatedEnrollments,
        invoices: updatedInvoices,
        makeupCredits: updatedCredits,
        transfers: [newTransferRecord, ...(prev.transfers || [])],
        auditLogs: [transferLog, ...(prev.auditLogs || [])],
      };
    });

    showToast(
      `✓ Đã lập biên bản ${transferCode} chuyển học sinh ${student.name} sang lớp ${toClass.name} thành công! ${
        surcharge > 0
          ? `Hóa đơn phụ thu: ${formatVND(surcharge)}.`
          : surplus > 0 && surplusHandling === 'issue_credit_note'
          ? `Đã cấp phiếu bảo lưu thặng dư ${creditCode} (${formatVND(surplus)}).`
          : surplus > 0 && surplusHandling === 'convert_sessions'
          ? `Đã quy đổi thêm +${extraSessions} buổi học lớp mới.`
          : 'Không phát sinh phụ thu (Chuyển ngang).'
      }`,
      'success',
      { title: 'Chuyển môn & Lớp học thành công' }
    );

    // Mở ngay mẫu in biên bản song ngữ nếu có handler
    if (onPrintTransferAgreement) {
      onPrintTransferAgreement(newTransferRecord);
    }
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
        <>
          {/* 2. CỤM 4 THẺ KPI TÀI CHÍNH ĐƯỢC ĐƯA LÊN TRÊN */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Thẻ 1: Tổng phải thu chính thức */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between shadow-lg shadow-black/20">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                TỔNG PHẢI THU CHÍNH THỨC
              </span>
              <div className="mt-2 text-xl font-bold font-mono text-white">
                {new Intl.NumberFormat('vi-VN').format(
                  baseFilteredInvoices
                    .filter(i => i.payment_status !== 'cancelled' && !i.is_trial_pending)
                    .reduce((sum, i) => sum + (i.net_payable || i.gross_amount || 0), 0)
                )} đ
              </div>
            </div>

            {/* Thẻ 2: Đã thu lũy kế */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/30 flex flex-col justify-between shadow-lg shadow-black/20">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                ĐÃ THU LŨY KẾ
              </span>
              <div className="mt-2 text-xl font-bold font-mono text-emerald-400">
                {new Intl.NumberFormat('vi-VN').format(
                  baseFilteredInvoices.reduce((sum, i) => sum + (i.paid_amount || 0), 0)
                )} đ
              </div>
            </div>

            {/* Thẻ 3: Công nợ cần thu */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-rose-500/30 flex flex-col justify-between shadow-lg shadow-black/20">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
                CÔNG NỢ CẦN THU
              </span>
              <div className="mt-2 text-xl font-bold font-mono text-rose-400">
                {new Intl.NumberFormat('vi-VN').format(
                  baseFilteredInvoices
                    .filter(i => i.payment_status !== 'cancelled' && !i.is_trial_pending)
                    .reduce((sum, i) => sum + (i.outstanding_amount || 0), 0)
                )} đ
              </div>
            </div>

            {/* Thẻ 4: Tạm hoãn (Đang học thử) */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-purple-500/30 flex flex-col justify-between shadow-lg shadow-black/20">
              <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">
                TẠM HOÃN (ĐANG HỌC THỬ)
              </span>
              <div className="mt-2 text-xl font-bold font-mono text-purple-300">
                {baseFilteredInvoices.filter(i => i.is_trial_pending).length} Hóa Đơn
              </div>
            </div>
          </div>

          {/* 3. KHỐI TIÊU ĐỀ, BỘ LỌC ĐỐI SOÁT & DANH SÁCH BẢNG HÓA ĐƠN */}
          <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
            <div className="p-4 border-b border-slate-800 space-y-3">
              {/* Header khối đối soát */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 tracking-wide">
                    <Receipt className="w-4 h-4 text-amber-400" />
                    <span>Hóa Đơn Học Phí Ngoại Khóa & Đối Soát Sao Kê Ngân Hàng ({filteredInvoices.length} hóa đơn)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Mỗi lớp/môn học có hóa đơn và mã VietQR Napas247 riêng biệt. Kế toán xác nhận gạch nợ thủ công.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <ViewToggle viewMode={invoiceViewMode} onViewModeChange={setInvoiceViewMode} />
                </div>
              </div>

              {/* Thanh lọc: Khóa, Cơ sở, Tìm kiếm, Nạp CSDL */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  PHẠM VI ĐỐI SOÁT:
                </span>
                
                {/* Dropdown Bộ lọc Khóa học */}
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-amber-500/30">
                  <span className="text-xs text-amber-400 font-bold whitespace-nowrap">Khóa:</span>
                  <select
                    value={invoiceTermFilter}
                    onChange={(e) => setInvoiceTermFilter(e.target.value)}
                    className="bg-transparent text-amber-300 text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-slate-900 text-amber-300">— Tất cả các khóa ({store.terms.length}) —</option>
                    {store.terms.map(t => (
                      <option key={t.id} value={t.id} className="bg-slate-900 text-white font-medium">
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dropdown Bộ lọc Cơ sở */}
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-sky-500/30">
                  <span className="text-xs text-sky-400 font-bold whitespace-nowrap">Cơ sở:</span>
                  <select
                    value={invoiceCampusFilter}
                    onChange={(e) => setInvoiceCampusFilter(e.target.value)}
                    className="bg-transparent text-sky-300 text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-slate-900 text-sky-300">— Tất cả cơ sở —</option>
                    {store.campuses.map(c => (
                      <option key={c.id} value={c.id} className="bg-slate-900 text-white font-medium">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ô Tìm Kiếm Hồ Sơ Hóa Đơn Theo Tên, Mã HV, Mã HĐ, SĐT Phụ Huynh */}
                <div className="relative flex items-center min-w-[280px] sm:min-w-[320px] max-w-sm">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="🔍 Tìm theo tên bé, mã HV, mã HĐ, SĐT phụ huynh..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 text-slate-400 hover:text-white cursor-pointer"
                      title="Xóa nhanh từ khóa"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Nút Làm Mới từ Supabase */}
                <button
                  type="button"
                  onClick={fetchInvoicesFromSupabase}
                  disabled={isRefreshingInvoices}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                  title="Nạp lại danh sách hóa đơn mới nhất từ CSDL Supabase"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isRefreshingInvoices ? 'animate-spin' : ''}`} />
                  <span>{isRefreshingInvoices ? 'Đang nạp...' : 'Nạp CSDL'}</span>
                </button>
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
              {filteredInvoices.map((invoice: any) => {
                const student = store.students.find(s => s.id === invoice.student_id || s.code === invoice.student_id);
                const cls = store.classes.find(c => c.id === invoice.class_id);
                const displayStudentName = invoice.students?.name || invoice.student_name || student?.name || invoice.student_id;
                const displayStudentCode = invoice.students?.code || invoice.student_code || student?.code || invoice.student_id;
                const displayParentPhone = invoice.students?.parent_phone || invoice.parent_phone || student?.parent_phone || '';

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
                          <h4 className="font-bold text-white text-sm mt-0.5">{displayStudentName}</h4>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                            <span>{displayStudentCode}</span>
                            {displayParentPhone && <span>• SĐT: {displayParentPhone}</span>}
                          </div>
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

                      {/* Class & Session Count Badge */}
                      {(() => {
                        const enr = store.enrollments.find(
                          e => e.student_id === invoice.student_id && e.class_id === invoice.class_id && e.status !== 'trial_dropped'
                        );
                        const regSessions = invoice.registered_sessions || enr?.registered_sessions || cls?.total_sessions || 24;
                        const totalSessions = invoice.total_class_sessions || cls?.total_sessions || 24;
                        const isMidCourse = invoice.is_prorated ?? (regSessions < totalSessions);
                        const clsDays = getClassDaysOfWeek(cls, store.timeSlots);
                        const studentDays = invoice.enrolled_days_of_week || enr?.enrolled_days_of_week || clsDays;
                        const isPartialWeek =
                          invoice.is_partial_schedule ??
                          enr?.is_partial_schedule ??
                          (studentDays.length > 0 && studentDays.length < clsDays.length);

                        return (
                          <div className="mb-2 space-y-1">
                            <div className="text-xs text-slate-300 font-semibold flex items-center justify-between gap-2">
                              <span className="truncate">{cls?.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono shrink-0">Hạn: {invoice.due_date}</span>
                            </div>
                            <div className="flex items-center justify-between gap-1.5 flex-wrap">
                              {isPartialWeek ? (
                                <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono font-bold text-[10px]">
                                  🗓️ Chỉ học {formatDaysListLabel(studentDays)} ({regSessions}/{totalSessions} buổi)
                                </span>
                              ) : isMidCourse ? (
                                <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono font-bold text-[10px]">
                                  ⚡ {regSessions}/{totalSessions} buổi - Vào giữa khóa
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-300 border border-slate-700 font-mono text-[10px]">
                                  {regSessions}/{totalSessions} buổi ({formatDaysListLabel(clsDays)})
                                </span>
                              )}
                              {invoice.start_date && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Từ: {invoice.start_date.split('-').reverse().join('/')}
                                </span>
                              )}
                            </div>
                            {invoice.prorated_note && (isMidCourse || isPartialWeek) && (
                              <div className="text-[10px] text-cyan-300/80 italic">
                                {invoice.prorated_note}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Financial breakdown */}
                      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Học phí tính theo số buổi:</span>
                          <span className="font-mono text-slate-200">{formatVND(invoice.gross_amount)}</span>
                        </div>
                        {(invoice.discount_amount ?? 0) > 0 && (
                          <div className="flex justify-between text-amber-400">
                            <span>Ưu đãi học phí:</span>
                            <span className="font-mono">-{formatVND(invoice.discount_amount || 0)}</span>
                          </div>
                        )}
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
                          {invoice.is_trial_pending ? (
                            <span className="font-mono font-bold text-purple-300 text-[11px]">
                              Chưa phát sinh (Đang học thử)
                            </span>
                          ) : (
                            <span className={`font-mono font-bold ${invoice.outstanding_amount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {formatVND(invoice.outstanding_amount)}
                            </span>
                          )}
                        </div>

                        {cls?.is_cross_term && cls.term_distribution && (
                          <div className="pt-2 mt-1 border-t border-indigo-500/30 space-y-1 text-[11px]">
                            <div className="font-bold text-indigo-300 flex items-center gap-1">
                              <span>🌐 Phân bổ doanh thu liên khóa ({cls.total_sessions} buổi):</span>
                            </div>
                            <div className="flex justify-between text-slate-300">
                              <span>• Doanh thu thực hiện kỳ này ({cls.term_distribution.primary_term_sessions}b):</span>
                              <span className="font-mono font-bold text-emerald-300">
                                {formatVND(cls.term_distribution.primary_term_sessions * cls.price_per_session)}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                              <span>• Doanh thu chưa thực hiện kết chuyển kỳ sau ({cls.term_distribution.spanning_term_sessions}b):</span>
                              <span className="font-mono font-bold text-indigo-300">
                                {formatVND(cls.term_distribution.spanning_term_sessions * cls.price_per_session)}
                              </span>
                            </div>
                          </div>
                        )}

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
                      {invoice.is_trial_pending ? (
                        <div className="w-full flex items-center justify-between gap-2">
                          <span className="text-[10px] text-purple-300/90 italic">
                            Tạm hoãn mã QR chờ kết quả buổi thử
                          </span>
                          <button
                            onClick={() => handleActivateTrialInvoice(invoice)}
                            className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] transition-colors flex items-center gap-1 shrink-0 shadow-sm shadow-purple-600/20"
                            title="Chuyển học sinh lên Chính thức và mở mã VietQR thu học phí"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Lên chính thức & Mở QR</span>
                          </button>
                        </div>
                      ) : invoice.payment_status === 'cancelled' ? (
                        <span className="text-[11px] text-slate-500 italic">
                          Hóa đơn đã hủy (Học sinh dừng sau buổi học thử)
                        </span>
                      ) : (
                        <>
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
                        </>
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
                  {filteredInvoices.map((invoice: any) => {
                    const student = store.students.find(s => s.id === invoice.student_id || s.code === invoice.student_id);
                    const cls = store.classes.find(c => c.id === invoice.class_id);
                    const displayStudentName = invoice.students?.name || invoice.student_name || student?.name || invoice.student_id;
                    const displayStudentCode = invoice.students?.code || invoice.student_code || student?.code || invoice.student_id;
                    const displayParentPhone = invoice.students?.parent_phone || invoice.parent_phone || student?.parent_phone || '';
                    const displayClassName = invoice.extracurricular_classes?.name || cls?.name || invoice.class_id;

                    return (
                      <tr key={invoice.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">
                          {invoice.invoice_code}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{displayStudentName}</div>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
                            <span>{displayStudentCode}</span>
                            {displayParentPhone && <span className="text-slate-400">• {displayParentPhone}</span>}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200">{displayClassName}</div>
                          {(() => {
                            const enr = store.enrollments.find(
                              e => e.student_id === invoice.student_id && e.class_id === invoice.class_id && e.status !== 'trial_dropped'
                            );
                            const regSessions = invoice.registered_sessions || enr?.registered_sessions || cls?.total_sessions || 24;
                            const totalSessions = invoice.total_class_sessions || cls?.total_sessions || 24;
                            const isMidCourse = invoice.is_prorated ?? (regSessions < totalSessions);
                            const clsDays = getClassDaysOfWeek(cls, store.timeSlots);
                            const studentDays = invoice.enrolled_days_of_week || enr?.enrolled_days_of_week || clsDays;
                            const isPartialWeek =
                              invoice.is_partial_schedule ??
                              enr?.is_partial_schedule ??
                              (studentDays.length > 0 && studentDays.length < clsDays.length);

                            return (
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {isPartialWeek ? (
                                  <span
                                    className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono font-bold text-[10px]"
                                    title={invoice.prorated_note || `Lịch riêng: Chỉ học ${formatDaysListLabel(studentDays)} (${regSessions}/${totalSessions} buổi)`}
                                  >
                                    🗓️ Chỉ học {formatDaysListLabel(studentDays)} ({regSessions}/{totalSessions}b)
                                  </span>
                                ) : isMidCourse ? (
                                  <span
                                    className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono font-bold text-[10px]"
                                    title={invoice.prorated_note || `Tính học phí giữa khóa: ${regSessions}/${totalSessions} buổi`}
                                  >
                                    {regSessions}/{totalSessions} buổi - Vào giữa khóa
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">
                                    {regSessions}/{totalSessions} buổi ({formatDaysListLabel(clsDays)})
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-300">
                          <div>{formatVND(invoice.gross_amount)}</div>
                          {(invoice.discount_amount ?? 0) > 0 && (
                            <div className="text-[10px] text-amber-400">-ƯĐ: {formatVND(invoice.discount_amount || 0)}</div>
                          )}
                          {cls?.is_cross_term && cls.term_distribution && (
                            <div className="mt-1 space-y-0.5 text-[10px] font-sans">
                              <div className="text-emerald-300">
                                Thực hiện: <strong className="font-mono">{formatVND(cls.term_distribution.primary_term_sessions * cls.price_per_session)}</strong> ({cls.term_distribution.primary_term_sessions}b)
                              </div>
                              <div className="text-indigo-300">
                                Chưa TH (kỳ sau): <strong className="font-mono">{formatVND(cls.term_distribution.spanning_term_sessions * cls.price_per_session)}</strong> ({cls.term_distribution.spanning_term_sessions}b)
                              </div>
                            </div>
                          )}
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
                          {invoice.is_trial_pending ? (
                            <span className="text-purple-300 text-[11px]" title="Chưa phát sinh công nợ - Đang chờ hoàn thành buổi học thử">
                              0 đ (Chờ thử)
                            </span>
                          ) : invoice.outstanding_amount > 0 ? (
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
                            {invoice.is_trial_pending ? (
                              <button
                                onClick={() => handleActivateTrialInvoice(invoice)}
                                className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] transition-colors inline-flex items-center gap-1"
                                title="Kích hoạt thu học phí chính thức và mở mã VietQR"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Lên chính thức</span>
                              </button>
                            ) : invoice.payment_status === 'cancelled' ? (
                              <span className="text-[10px] text-slate-500 italic">Đã hủy</span>
                            ) : (
                              <>
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
                              </>
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
        </>
      )}

      {/* SECTION 2: TEACHER PAYROLL & WORKLOAD BI DASHBOARD */}
      {activeSection === 'payroll' && (() => {
        // Synthesize teacher attendance records from store.teacherAttendance + fallback from completed store.sessions
        const effectiveTeacherRecords: TeacherAttendanceRecord[] = (() => {
          const baseList = [...(store.teacherAttendance || [])];
          store.sessions.forEach(ses => {
            if (ses.status !== 'completed') return;
            const alreadyRecorded = baseList.some(
              ta => ta.class_id === ses.class_id && ta.session_date === ses.session_date
            );
            if (!alreadyRecorded) {
              const cls = store.classes.find(c => c.id === ses.class_id);
              if (!cls) return;
              const actualTeacher = store.teachers.find(t => t.id === (ses.actual_teacher_id || cls.primary_teacher_id));
              const isPerm = (actualTeacher?.type || actualTeacher?.teacher_type) === 'permanent';
              const sessionRate = isPerm
                ? (store.payrollRateConfig?.permanent_session_rate ?? 300000)
                : (store.payrollRateConfig?.visiting_session_rate ?? 270000);
              const periods = actualTeacher?.periods_per_session || store.payrollRateConfig?.periods_per_session || 2;
              baseList.push({
                id: `synth_${ses.id}`,
                class_id: cls.id,
                term_id: ses.term_id || cls.term_id,
                campus_id: cls.campus_id,
                session_date: ses.session_date,
                session_number: ses.session_number,
                periods_count: periods,
                assigned_teacher_id: cls.primary_teacher_id,
                actual_teacher_id: ses.actual_teacher_id || cls.primary_teacher_id,
                is_substitute: Boolean(ses.is_substitute || (ses.actual_teacher_id && ses.actual_teacher_id !== cls.primary_teacher_id)),
                status: 'present',
                check_in_time: '16:40',
                rate_per_period: Math.round(sessionRate / periods),
                rate_applied: sessionRate,
                earned_amount: sessionRate,
                total_payout: sessionRate,
                verified_by: 'Hệ thống đồng bộ Sổ điểm danh',
                notes: 'Đồng bộ tự động từ ca học hoàn thành',
              });
            }
          });
          return baseList.filter(rec => {
            const matchTerm = payrollTermFilter === 'all' || rec.term_id === payrollTermFilter;
            const matchCampus = payrollCampusFilter === 'all' || rec.campus_id === payrollCampusFilter;
            return matchTerm && matchCampus;
          });
        })();

        // Compute per-teacher workload & payroll summary rows (Per-Session Model: 300K Cơ hữu / 270K Thỉnh giảng)
        const teacherPayrollRows = store.teachers
          .filter(teacher => {
            if (payrollCampusFilter === 'all') return true;
            const teacherPrimaryCampus = teacher.campus_id || 'camp_pmh';
            const hasSessionInCampus = effectiveTeacherRecords.some(
              r => r.actual_teacher_id === teacher.id || r.assigned_teacher_id === teacher.id
            );
            const hasClassInCampus = store.classes.some(
              c => c.primary_teacher_id === teacher.id && c.campus_id === payrollCampusFilter
            );
            return teacherPrimaryCampus === payrollCampusFilter || hasSessionInCampus || hasClassInCampus;
          })
          .map((teacher, idx) => {
            const isPermanent = (teacher.type || teacher.teacher_type) === 'permanent';
            const periodsPerSession = teacher.periods_per_session || store.payrollRateConfig?.periods_per_session || 2;
            const defaultSessionRate = isPermanent
              ? (store.payrollRateConfig?.permanent_session_rate ?? 300000)
              : (store.payrollRateConfig?.visiting_session_rate ?? 270000);
            const defaultRatePerPeriod = Math.round(defaultSessionRate / periodsPerSession);

            // Sessions actually taught by this teacher (main + substitute) where status is present or late
            const taughtRecords = effectiveTeacherRecords.filter(
              r =>
                r.actual_teacher_id === teacher.id &&
                r.status !== 'absent_excused' &&
                r.status !== 'absent_unexcused' &&
                r.periods_count > 0
            );

            // Substitute sessions where this teacher stepped in for another teacher
            const substituteAddedRecords = taughtRecords.filter(
              r => r.is_substitute || r.assigned_teacher_id !== teacher.id
            );

            // Sessions where this teacher was the assigned primary teacher, but was absent or replaced by a substitute
            const absentOrTransferredRecords = effectiveTeacherRecords.filter(
              r =>
                r.assigned_teacher_id === teacher.id &&
                (r.actual_teacher_id !== teacher.id ||
                  r.status === 'absent_excused' ||
                  r.status === 'absent_unexcused' ||
                  r.periods_count === 0)
            );

            const taughtSessionsCount = taughtRecords.length;
            const totalPeriodsTaught = taughtRecords.reduce((sum, r) => sum + (r.periods_count || 0), 0);
            const substituteSessionsAdded = substituteAddedRecords.length;
            const absentSessionsDeducted = absentOrTransferredRecords.length;
            const substitutePeriodsAdded = substituteAddedRecords.reduce((sum, r) => sum + (r.periods_count || 0), 0);
            const absentPeriodsDeducted = absentOrTransferredRecords.reduce(
              (sum, r) => sum + (r.periods_count > 0 ? r.periods_count : periodsPerSession),
              0
            );
            // Calculate total payout strictly per the required per-session formula: taughtSessionsCount * defaultSessionRate
            const totalPayout = taughtSessionsCount * defaultSessionRate;

            const settlementRecord = (store.payrollSettlements || []).find(
              ps =>
                ps.teacher_id === teacher.id &&
                (payrollTermFilter === 'all' || ps.term_id === payrollTermFilter) &&
                ps.is_settled
            );

            const campusObj = store.campuses.find(c => c.id === (teacher.campus_id || 'camp_pmh'));

            return {
              teacher,
              code: teacher.code || `GV-PMH-00${idx + 1}`,
              isPermanent,
              typeLabel: isPermanent ? 'Cơ Hữu' : 'Thỉnh Giảng',
              campusCode: campusObj?.code || 'PMH',
              campusName: campusObj?.name || 'Cơ sở Phú Mỹ Hưng',
              defaultRatePerPeriod,
              defaultSessionRate,
              periodsPerSession,
              taughtSessionsCount,
              totalPeriodsTaught,
              substituteSessionsAdded,
              absentSessionsDeducted,
              substitutePeriodsAdded,
              absentPeriodsDeducted,
              totalPayout,
              isSettled: Boolean(settlementRecord),
              settlementRecord,
              taughtRecords,
              absentOrTransferredRecords,
            };
          });

        // 4 Top KPI Metrics
        const totalTermPayout = teacherPayrollRows.reduce((sum, r) => sum + r.totalPayout, 0);
        const totalTermSessions = teacherPayrollRows.reduce((sum, r) => sum + r.taughtSessionsCount, 0);
        const totalSubstituteSessions = effectiveTeacherRecords.filter(r => r.is_substitute).length;
        const settledTeachersCount = teacherPayrollRows.filter(r => r.isSettled).length;
        const pendingTeachersCount = Math.max(0, teacherPayrollRows.length - settledTeachersCount);

        const handleConfirmTeacherTermSettlement = (row: typeof teacherPayrollRows[number]) => {
          if (row.totalPayout <= 0) {
            showToast(`Giáo viên ${row.teacher.name} chưa phát sinh buổi dạy thực tế nào trong phạm vi lọc!`, 'info');
            return;
          }

          const settledDate = new Date().toISOString().split('T')[0];
          const bankRef = `PAY-${row.code}-${Date.now().toString().slice(-5)}`;

          onUpdateStore(prev => {
            const otherSettlements = (prev.payrollSettlements || []).filter(
              ps => !(ps.teacher_id === row.teacher.id && ps.term_id === payrollTermFilter)
            );

            const newSettlement = {
              id: `pay_${Date.now()}`,
              teacher_id: row.teacher.id,
              class_id: 'all',
              term_id: payrollTermFilter,
              campus_id: payrollCampusFilter,
              taught_sessions: row.taughtSessionsCount,
              substitute_sessions: row.substituteSessionsAdded,
              total_periods: row.totalPeriodsTaught,
              substitute_periods_added: row.substitutePeriodsAdded,
              absent_periods_deducted: row.absentPeriodsDeducted,
              class_revenue: 0,
              calculation_type: 'session_rate' as const,
              total_payroll: row.totalPayout,
              settled_date: settledDate,
              is_settled: true,
              verified_by: currentUser?.full_name || 'Kế Toán Trưởng',
              bank_reference: bankRef,
              notes: `Quyết toán ${row.taughtSessionsCount} buổi dạy thực tế khóa ${payrollTermFilter}`,
            };

            const log = createAuditRecord(
              'TEACHER_PAYROLL_SETTLE',
              'FINANCE',
              `Quyết toán thù lao ${row.teacher.name} (${row.code})`,
              `Xác nhận chi trả thù lao giảng dạy cho ${row.teacher.name}: ${row.taughtSessionsCount} buổi (Dạy thay +${row.substituteSessionsAdded} buổi) = ${formatVND(row.totalPayout)} (Mã UNC: ${bankRef})`,
              currentUser,
              {
                target_id: row.code,
                details: {
                  status: 'success',
                  after: {
                    teacher_name: row.teacher.name,
                    term_id: payrollTermFilter,
                    taught_sessions: row.taughtSessionsCount,
                    substitute_sessions: row.substituteSessionsAdded,
                    absent_sessions: row.absentSessionsDeducted,
                    total_payroll: row.totalPayout,
                    bank_reference: bankRef,
                  },
                },
              }
            );

            return {
              ...prev,
              payrollSettlements: [newSettlement, ...otherSettlements],
              auditLogs: [log, ...(prev.auditLogs || [])],
            };
          });

          showToast(
            `Đã xác nhận tất toán thù lao khóa học cho ${row.teacher.name}: ${formatVND(row.totalPayout)} (${row.taughtSessionsCount} buổi)!`,
            'success',
            { title: 'Quyết toán thù lao giáo viên' }
          );
        };

        const handleExportPayrollExcel = () => {
          const excelRows: TeacherPayrollSummaryExcelRow[] = teacherPayrollRows.map(r => ({
            code: r.code,
            name: r.teacher.name,
            typeLabel: r.typeLabel,
            campusLabel: `${r.campusCode} - ${r.campusName}`,
            ratePerPeriod: r.defaultRatePerPeriod,
            ratePerSession: r.defaultSessionRate,
            taughtSessions: r.taughtSessionsCount,
            totalPeriods: r.totalPeriodsTaught,
            substitutePeriodsAdded: r.substitutePeriodsAdded,
            absentPeriodsDeducted: r.absentPeriodsDeducted,
            totalPayout: r.totalPayout,
            isSettled: r.isSettled,
            bankInfo: r.teacher.bank_account
              ? `${r.teacher.bank_account.bank_name} - ${r.teacher.bank_account.account_number} (${r.teacher.bank_account.account_holder})`
              : 'Chưa cập nhật',
          }));

          exportTeacherPayrollWorkbook(store, payrollTermFilter, payrollCampusFilter, excelRows);
          showToast(
            'Đã xuất tệp Excel Quyết Toán Thù Lao Giáo Viên (2 Sheets: Tổng hợp thù lao & Chi tiết ca dạy) thành công!',
            'success',
            { title: 'Xuất Báo Cáo Quyết Toán Excel' }
          );
        };

        return (
          <div className="space-y-5">
            {/* 1. BỘ LỌC PHÂN CẤP ĐẦU TRANG (TWO-TIER FILTER BAR) & NÚT XUẤT EXCEL */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Dropdown 1: Khóa học */}
                <div className="flex items-center gap-2 bg-slate-950/90 border border-slate-800 rounded-xl px-3.5 py-2 focus-within:border-amber-500/50">
                  <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-400">Khóa học:</span>
                  <select
                    value={payrollTermFilter}
                    onChange={(e) => setPayrollTermFilter(e.target.value)}
                    className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer pr-1"
                  >
                    <option value="all" className="bg-slate-900 text-white">Tất cả các khóa học</option>
                    {store.terms.map(term => (
                      <option key={term.id} value={term.id} className="bg-slate-900 text-white">
                        {term.name} {term.is_active ? '(Đang diễn ra)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dropdown 2: Cơ sở */}
                <div className="flex items-center gap-2 bg-slate-950/90 border border-slate-800 rounded-xl px-3.5 py-2 focus-within:border-cyan-500/50">
                  <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-400">Cơ sở:</span>
                  <select
                    value={payrollCampusFilter}
                    onChange={(e) => setPayrollCampusFilter(e.target.value)}
                    className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer pr-1"
                  >
                    <option value="all" className="bg-slate-900 text-white">Tất cả cơ sở (PMH &amp; PL)</option>
                    <option value="camp_pmh" className="bg-slate-900 text-white">Phú Mỹ Hưng (PMH)</option>
                    <option value="camp_pl" className="bg-slate-900 text-white">Phú Lâm (PL)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleExportPayrollExcel}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Xuất Báo Cáo Quyết Toán (Excel 2 Sheets)</span>
                </button>
                <ViewToggle viewMode={payrollViewMode} onViewModeChange={setPayrollViewMode} />
              </div>
            </div>

            {/* 2. 4 THẺ CHỈ SỐ TỔNG QUAN (TEACHER PAYROLL KPIs - PER SESSION) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* KPI 1: Tổng Thù Lao Khóa Học */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-900 border border-emerald-500/30 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    1. Tổng Thù Lao Khóa Học
                  </span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-extrabold font-mono text-emerald-400 mt-1.5">
                  {formatVND(totalTermPayout)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Tổng chi trả cho {teacherPayrollRows.length} giáo viên trong kỳ
                </div>
              </div>

              {/* KPI 2: Tổng Số Buổi Đã Giảng Dạy */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    2. Tổng Số Buổi Đã Giảng Dạy
                  </span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-xl font-extrabold font-mono text-white mt-1.5">
                  {totalTermSessions} Buổi
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Đã qua chấm công &amp; đối soát sổ điểm danh
                </div>
              </div>

              {/* KPI 3: Số Ca Dạy Thay Phát Sinh */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/30 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-300">
                    3. Số Ca Dạy Thay Phát Sinh
                  </span>
                  <RefreshCw className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-xl font-extrabold font-mono text-purple-300 mt-1.5">
                  {totalSubstituteSessions} Buổi
                </div>
                <div className="text-[11px] text-purple-300/80 mt-1">
                  {totalSubstituteSessions > 0
                    ? `Tự động khấu trừ ${totalSubstituteSessions} buổi của GV vắng và cộng ${totalSubstituteSessions} buổi cho GV dạy thay`
                    : 'Không có ca dạy thay phát sinh'}
                </div>
              </div>

              {/* KPI 4: Tình Trạng Quyết Toán */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/30 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                    4. Tình Trạng Quyết Toán
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-xl font-extrabold font-mono text-white mt-1.5">
                  <span className="text-emerald-400">{settledTeachersCount} Đã chi</span>
                  <span className="text-slate-500 mx-1.5">/</span>
                  <span className="text-amber-400">{pendingTeachersCount} Chờ duyệt</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Đối soát công nợ lương giáo viên cuối kỳ
                </div>
              </div>
            </div>

            {/* 3. BẢNG CHI TIẾT QUYẾT TOÁN THÙ LAO GIÁO VIÊN (DETAILED PAYROLL TABLE / CARDS) */}
            <div className="rounded-3xl bg-[#111827]/90 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
              <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-amber-400" />
                    <span>Bảng Tổng Hợp Chấm Công &amp; Quyết Toán Thù Lao Theo Buổi ({teacherPayrollRows.length} giáo viên)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Công thức chuẩn: <strong>Tổng Thù Lao Thực Nhận = Tổng Số Buổi Thực Dạy × Đơn Giá / Buổi (Cơ hữu: 300.000 đ/buổi • Thỉnh giảng: 270.000 đ/buổi)</strong>. Tự động cộng buổi dạy thay (+) và trừ buổi vắng chuyển giao (-).
                  </p>
                </div>
              </div>

              {payrollViewMode === 'cards' ? (
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teacherPayrollRows.map(row => (
                    <div key={row.teacher.id} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col justify-between space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-[10px] font-bold text-amber-400">{row.code}</span>
                            <h4 className="font-bold text-white text-sm">{row.teacher.name}</h4>
                            <span className="text-[10px] text-slate-400">{row.campusCode} - {row.campusName}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                            row.isPermanent
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}>
                            {row.typeLabel}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                          <div className="flex justify-between text-slate-400">
                            <span>Đơn giá / buổi:</span>
                            <strong className="font-mono text-amber-300">{formatVND(row.defaultSessionRate)}/buổi</strong>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Số buổi đã dạy:</span>
                            <strong className="font-mono text-white">{row.taughtSessionsCount} buổi</strong>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Buổi dạy thay (+) / Vắng (-):</span>
                            <span className="font-mono">
                              <strong className="text-purple-300">
                                {row.substituteSessionsAdded > 0 ? `+${row.substituteSessionsAdded} buổi` : '0 buổi'}
                              </strong>
                              {' / '}
                              <strong className="text-rose-400">
                                {row.absentSessionsDeducted > 0 ? `-${row.absentSessionsDeducted} buổi` : '0 buổi'}
                              </strong>
                            </span>
                          </div>
                          <div className="flex justify-between pt-1.5 border-t border-slate-800 text-sm">
                            <span className="font-bold text-white">Thực nhận:</span>
                            <strong className="font-mono font-extrabold text-emerald-400">{formatVND(row.totalPayout)}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailLogTeacher(row.teacher)}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Bảng kê</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrintingPayslipTeacher(row.teacher)}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-bold flex items-center gap-1"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Phiếu lương</span>
                          </button>
                        </div>

                        {row.isSettled ? (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Đã chi trả</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleConfirmTeacherTermSettlement(row)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                          >
                            Xác nhận chi
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3.5 px-4">1. Mã GV &amp; Họ Tên</th>
                        <th className="py-3.5 px-3">2. Phân Loại</th>
                        <th className="py-3.5 px-3">3. Cơ Sở</th>
                        <th className="py-3.5 px-3">4. Đơn Giá / Buổi</th>
                        <th className="py-3.5 px-3 text-center">5. Số Buổi Đã Dạy</th>
                        <th className="py-3.5 px-3 text-center">6. Buổi Dạy Thay (+)</th>
                        <th className="py-3.5 px-3 text-center">7. Buổi Vắng / Chuyển (-)</th>
                        <th className="py-3.5 px-4 text-right">8. Tổng Thù Lao Thực Nhận</th>
                        <th className="py-3.5 px-4 text-right">9. Thao Tác Quyết Toán</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {teacherPayrollRows.map(row => (
                        <tr key={row.teacher.id} className="hover:bg-slate-800/30 transition-colors">
                          {/* 1. Mã GV & Họ Tên */}
                          <td className="py-3.5 px-4">
                            <div className="font-mono text-[10px] font-bold text-amber-400">{row.code}</div>
                            <div className="font-bold text-white text-sm">{row.teacher.name}</div>
                            <div className="text-[10px] text-slate-500">{row.teacher.phone}</div>
                          </td>

                          {/* 2. Phân loại */}
                          <td className="py-3.5 px-3">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                              row.isPermanent
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {row.typeLabel}
                            </span>
                          </td>

                          {/* 3. Cơ sở */}
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 font-mono font-bold text-slate-200 text-[11px]">
                              {row.campusCode}
                            </span>
                          </td>

                          {/* 4. Đơn giá / Buổi */}
                          <td className="py-3.5 px-3 font-mono">
                            <div className="font-bold text-amber-300">{formatVND(row.defaultSessionRate)}/buổi</div>
                          </td>

                          {/* 5. Số buổi đã dạy */}
                          <td className="py-3.5 px-3 text-center font-mono">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-bold text-white">
                              {row.taughtSessionsCount} buổi
                            </span>
                          </td>

                          {/* 6. Buổi dạy thay nhận thêm (+) */}
                          <td className="py-3.5 px-3 text-center font-mono">
                            {row.substituteSessionsAdded > 0 ? (
                              <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 font-extrabold">
                                +{row.substituteSessionsAdded} buổi
                              </span>
                            ) : (
                              <span className="text-slate-500">0 buổi</span>
                            )}
                          </td>

                          {/* 7. Buổi vắng / chuyển giao (-) */}
                          <td className="py-3.5 px-3 text-center font-mono">
                            {row.absentSessionsDeducted > 0 ? (
                              <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-400 font-extrabold">
                                -{row.absentSessionsDeducted} buổi
                              </span>
                            ) : (
                              <span className="text-slate-500">0 buổi</span>
                            )}
                          </td>

                          {/* 8. Tổng thù lao thực nhận */}
                          <td className="py-3.5 px-4 text-right font-mono">
                            <div className="text-sm font-extrabold text-emerald-400">
                              {formatVND(row.totalPayout)}
                            </div>
                            {row.isSettled ? (
                              <span className="text-[10px] text-emerald-300 font-sans font-semibold flex items-center justify-end gap-1">
                                <Check className="w-3 h-3" />
                                Đã quyết toán ({row.settlementRecord?.settled_date})
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-400/90 font-sans">Chờ kế toán duyệt chi</span>
                            )}
                          </td>

                          {/* 9. Thao tác */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setDetailLogTeacher(row.teacher)}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-bold text-[11px] flex items-center gap-1 transition-colors"
                                title="Xem Bảng Kê Chi Tiết từng ca dạy & thù lao buổi"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Bảng kê</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setPrintingPayslipTeacher(row.teacher)}
                                className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-[11px] flex items-center gap-1 transition-colors"
                                title="In Phiếu Lương / Quyết Toán chuẩn A4 kèm mã VietQR"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>In Phiếu</span>
                              </button>

                              {row.isSettled ? (
                                <span
                                  className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[11px] inline-flex items-center gap-1"
                                  title={`Đã chi trả bởi ${row.settlementRecord?.verified_by || 'Kế toán'}`}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Đã Chi</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleConfirmTeacherTermSettlement(row)}
                                  className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm shadow-emerald-600/20 transition-colors"
                                  title="Xác nhận đã chi trả quyết toán thù lao khóa học"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Xác Nhận Chi</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* MODAL 1: BẢNG KÊ CHI TIẾT CA DẠY & THÙ LAO THEO BUỔI */}
            {detailLogTeacher && (() => {
              const targetRow = teacherPayrollRows.find(r => r.teacher.id === detailLogTeacher.id);
              const allRelatedRecords = effectiveTeacherRecords
                .filter(
                  r =>
                    r.actual_teacher_id === detailLogTeacher.id ||
                    r.assigned_teacher_id === detailLogTeacher.id
                )
                .sort((a, b) => a.session_date.localeCompare(b.session_date));

              return (
                <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
                  <div className="bg-[#111827] border border-slate-800 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="p-5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono text-xs font-bold">
                            {targetRow?.code || detailLogTeacher.code || detailLogTeacher.id}
                          </span>
                          <h3 className="text-base font-extrabold text-white">
                            Bảng Kê Chi Tiết Ca Dạy &amp; Thù Lao Theo Buổi — {detailLogTeacher.name}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Khóa học: <strong className="text-amber-300">{store.terms.find(t => t.id === payrollTermFilter)?.name || 'Tất cả khóa học'}</strong>
                          {' • '}
                          Cơ sở: <strong className="text-cyan-300">{payrollCampusFilter === 'all' ? 'Tất cả cơ sở' : store.campuses.find(c => c.id === payrollCampusFilter)?.name}</strong>
                          {' • '}
                          Đơn giá chuẩn: <strong className="text-emerald-400 font-mono">{formatVND(targetRow?.defaultSessionRate || 300000)}/buổi</strong>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailLogTeacher(null)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick Summary Strip */}
                    {targetRow && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-950/60 border-b border-slate-800">
                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-[10px] font-bold uppercase text-slate-400">Tổng Buổi Đã Dạy</div>
                          <div className="text-sm font-extrabold font-mono text-white mt-0.5">
                            {targetRow.taughtSessionsCount} buổi
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-purple-950/25 border border-purple-500/30">
                          <div className="text-[10px] font-bold uppercase text-purple-300">Buổi Dạy Thay (+)</div>
                          <div className="text-sm font-extrabold font-mono text-purple-300 mt-0.5">
                            {targetRow.substituteSessionsAdded > 0 ? `+${targetRow.substituteSessionsAdded} buổi` : '0 buổi'}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-rose-950/25 border border-rose-500/30">
                          <div className="text-[10px] font-bold uppercase text-rose-300">Buổi Nghỉ / Nhờ Thay (-)</div>
                          <div className="text-sm font-extrabold font-mono text-rose-400 mt-0.5">
                            {targetRow.absentSessionsDeducted > 0 ? `-${targetRow.absentSessionsDeducted} buổi` : '0 buổi'}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                          <div className="text-[10px] font-bold uppercase text-emerald-400">Tổng Thực Lĩnh</div>
                          <div className="text-base font-black font-mono text-emerald-400 mt-0.5">
                            {formatVND(targetRow.totalPayout)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Detailed Table */}
                    <div className="flex-1 overflow-y-auto p-4">
                      {allRelatedRecords.length === 0 ? (
                        <div className="p-10 text-center text-slate-400 text-xs">
                          Chưa có bản ghi chấm công ca dạy nào cho giáo viên này trong phạm vi lọc.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-800">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                                <th className="py-2.5 px-3">Ngày học / Buổi</th>
                                <th className="py-2.5 px-3">Lớp &amp; Môn Ngoại Khóa</th>
                                <th className="py-2.5 px-3">Vai trò ca dạy</th>
                                <th className="py-2.5 px-3 text-center">Trạng thái chấm công</th>
                                <th className="py-2.5 px-3 text-center">Số buổi tính lương</th>
                                <th className="py-2.5 px-3 text-right">Đơn giá / buổi</th>
                                <th className="py-2.5 px-3 text-right">Thành tiền ca dạy</th>
                                <th className="py-2.5 px-3">Ghi chú / Đối ứng</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/70 text-xs">
                              {allRelatedRecords.map(rec => {
                                const cls = store.classes.find(c => c.id === rec.class_id);
                                const subject = store.subjects.find(s => s.id === cls?.subject_id);
                                const assignedTeacher = store.teachers.find(t => t.id === rec.assigned_teacher_id);
                                const isTaughtByThisTeacher =
                                  rec.actual_teacher_id === detailLogTeacher.id &&
                                  rec.status !== 'absent_excused' &&
                                  rec.status !== 'absent_unexcused' &&
                                  rec.periods_count > 0;
                                const isSubIn = isTaughtByThisTeacher && (rec.is_substitute || rec.assigned_teacher_id !== detailLogTeacher.id);
                                const appliedSessionRate = rec.rate_applied || targetRow?.defaultSessionRate || 300000;
                                const sessionEarned = isTaughtByThisTeacher ? (rec.earned_amount || rec.total_payout || appliedSessionRate) : 0;
                                const actualTeacher = store.teachers.find(t => t.id === rec.actual_teacher_id);

                                return (
                                  <tr
                                    key={rec.id}
                                    className={`hover:bg-slate-900/50 ${
                                      !isTaughtByThisTeacher ? 'bg-rose-950/10 opacity-75' : isSubIn ? 'bg-purple-950/15' : ''
                                    }`}
                                  >
                                    <td className="py-2.5 px-3 font-mono">
                                      <div className="font-bold text-white">{formatDateVN(rec.session_date)}</div>
                                      <div className="text-[10px] text-slate-400">
                                        Buổi #{rec.session_number} {rec.check_in_time ? `• Check-in ${rec.check_in_time}` : ''}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <div className="font-bold text-amber-300">{cls?.name || rec.class_id}</div>
                                      <div className="text-[10px] text-slate-400">
                                        {subject?.name || 'Môn NK'} • {rec.campus_id === 'camp_pl' ? 'Cơ sở Phú Lâm' : 'Cơ sở Phú Mỹ Hưng'}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {isSubIn ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                                          🔄 Dạy thay GV {assignedTeacher?.name || ''}
                                        </span>
                                      ) : isTaughtByThisTeacher ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                          ✓ Giáo viên chính
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                                          ✕ Nghỉ / Đã chuyển ca
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      {rec.status === 'present' && isTaughtByThisTeacher && (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                                          ✓ Đúng giờ
                                        </span>
                                      )}
                                      {rec.status === 'late' && isTaughtByThisTeacher && (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold">
                                          ⏱ Đi muộn
                                        </span>
                                      )}
                                      {rec.status === 'substitute' && isTaughtByThisTeacher && (
                                        <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 text-[10px] font-bold">
                                          🔄 Ca dạy thay
                                        </span>
                                      )}
                                      {!isTaughtByThisTeacher && (
                                        <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold">
                                          Không tính buổi
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-mono font-bold">
                                      {isTaughtByThisTeacher ? (
                                        <span className="text-emerald-400">+1 buổi</span>
                                      ) : (
                                        <span className="text-rose-400">0 buổi (-1)</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                                      {formatVND(appliedSessionRate)}/buổi
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-extrabold">
                                      {isTaughtByThisTeacher ? (
                                        <span className="text-emerald-400">{formatVND(sessionEarned)}</span>
                                      ) : (
                                        <span className="text-slate-500">0 ₫</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-[11px] text-slate-400">
                                      {!isTaughtByThisTeacher && rec.actual_teacher_id !== detailLogTeacher.id
                                        ? `GV ${actualTeacher?.name || 'khác'} dạy thay (${rec.substitute_reason || 'Có phép'})`
                                        : rec.notes || rec.substitute_reason || '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-400">
                        Người kiểm soát dữ liệu: <strong className="text-white">{currentUser?.full_name || 'Ban Học Vụ & Kế Toán'}</strong>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const teacherToPrint = detailLogTeacher;
                            setDetailLogTeacher(null);
                            setPrintingPayslipTeacher(teacherToPrint);
                          }}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Chuyển Sang In Phiếu Quyết Toán A4</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailLogTeacher(null)}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
                        >
                          Đóng
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* MODAL 2: IN PHIẾU QUYẾT TOÁN THÙ LAO GIẢNG DẠY CÁ NHÂN (CHUẨN A4 KÈM VIETQR) */}
            {printingPayslipTeacher && (() => {
              const targetRow = teacherPayrollRows.find(r => r.teacher.id === printingPayslipTeacher.id);
              if (!targetRow) return null;

              const termObj = store.terms.find(t => t.id === payrollTermFilter);
              const bankAcc = printingPayslipTeacher.bank_account;
              const bankCode = bankAcc ? getBankCode(bankAcc.bank_name) : 'VCB';
              const cleanAccNumber = bankAcc?.account_number ? bankAcc.account_number.replace(/\s+/g, '') : '0071000888999';
              const holderName = bankAcc?.account_holder || printingPayslipTeacher.name.toUpperCase();
              const transferMemo = `THULAO ${targetRow.code} ${termObj?.name || 'HK2026'}`.substring(0, 50);
              const teacherQrUrl = `https://img.vietqr.io/image/${bankCode}-${cleanAccNumber}-compact2.png?amount=${Math.max(
                0,
                Math.round(targetRow.totalPayout)
              )}&addInfo=${encodeURIComponent(transferMemo)}&accountName=${encodeURIComponent(holderName)}`;

              return (
                <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-[#111827] border border-slate-700 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden my-6">
                    {/* Top Action Bar */}
                    <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Printer className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                          Phiếu Quyết Toán Thù Lao Giảng Dạy Cá Nhân (Chuẩn A4 + VietQR)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>In Phiếu Quyết Toán (A4)</span>
                        </button>
                        {!targetRow.isSettled && targetRow.totalPayout > 0 && (
                          <button
                            type="button"
                            onClick={() => handleConfirmTeacherTermSettlement(targetRow)}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Xác Nhận Đã Chi Trả</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPrintingPayslipTeacher(null)}
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* A4 Printable Sheet Content */}
                    <div className="p-6 sm:p-8 bg-slate-950 text-slate-100 space-y-6">
                      {/* Header Royal School */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-800 pb-5">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                            HỆ THỐNG TRƯỜNG SONG NGỮ QUỐC TẾ HOÀNG GIA — ROYAL SCHOOL
                          </div>
                          <h2 className="text-lg font-black text-white mt-1">
                            PHIẾU QUYẾT TOÁN THÙ LAO GIẢNG DẠY NGOẠI KHÓA
                          </h2>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Kỳ quyết toán: <strong className="text-slate-200">{termObj?.name || 'Tất cả khóa học'}</strong>
                            {' • '}
                            Phạm vi: <strong className="text-slate-200">{targetRow.campusName}</strong>
                          </p>
                        </div>
                        <div className="text-left sm:text-right font-mono text-xs">
                          <div className="text-amber-400 font-bold">
                            Số phiếu: PAY-{targetRow.code}-{new Date().getFullYear()}
                          </div>
                          <div className="text-slate-400 text-[11px] mt-0.5">
                            Ngày lập: {formatDateVN(new Date().toISOString().split('T')[0])}
                          </div>
                          <div className="mt-1">
                            {targetRow.isSettled ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                                ✓ ĐÃ QUYẾT TOÁN ({targetRow.settlementRecord?.settled_date})
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                ⏳ CHỜ KẾ TOÁN CHI TRẢ
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Teacher Profile & Bank Account Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            1. Thông Tin Nhân Sự Giảng Dạy
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Họ và tên giáo viên:</span>
                            <strong className="text-white">{printingPayslipTeacher.name}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Mã định danh nhân sự:</span>
                            <strong className="text-amber-400 font-mono">{targetRow.code}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Phân loại hợp đồng:</span>
                            <strong className="text-slate-200">{targetRow.typeLabel} ({targetRow.campusCode})</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Định mức thù lao chuẩn:</span>
                            <strong className="text-emerald-400 font-mono">
                              {formatVND(targetRow.defaultRatePerPeriod)}/tiết ({formatVND(targetRow.defaultSessionRate)}/buổi)
                            </strong>
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                            2. Tài Khoản Thụ Hưởng &amp; Thống Kê Tiết Dạy
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Ngân hàng thụ hưởng:</span>
                            <strong className="text-white">{bankAcc?.bank_name || 'Vietcombank (VCB)'}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Số tài khoản:</span>
                            <strong className="text-cyan-400 font-mono">{cleanAccNumber}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Chủ tài khoản:</span>
                            <strong className="text-white">{holderName}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Tổng khối lượng thực dạy:</span>
                            <strong className="text-amber-300 font-mono">
                              {targetRow.taughtSessionsCount} buổi = {targetRow.totalPeriodsTaught} tiết (Dạy thay +{targetRow.substitutePeriodsAdded})
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Summary Calculation & VietQR Transfer Box */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-4 rounded-2xl bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/30">
                        <div className="md:col-span-2 space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                            3. Tổng Hợp Quyết Toán Thù Lao Thực Lĩnh
                          </div>
                          <div className="text-2xl font-black font-mono text-emerald-400">
                            {formatVND(targetRow.totalPayout)}
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            Công thức quyết toán: Tổng cộng <strong>{targetRow.totalPeriodsTaught} tiết thực dạy</strong> (bao gồm{' '}
                            <strong className="text-purple-300">+{targetRow.substitutePeriodsAdded} tiết dạy thay</strong> và đã trừ{' '}
                            <strong className="text-rose-400">{targetRow.absentPeriodsDeducted} tiết vắng/nhờ dạy thay</strong>).
                          </p>
                          <div className="text-[11px] font-mono text-slate-400 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 inline-block">
                            Nội dung CK tự động: <strong className="text-amber-300">{transferMemo}</strong>
                          </div>
                        </div>

                        <div className="flex flex-col items-center justify-center bg-white p-3 rounded-2xl shadow-lg">
                          <img
                            src={teacherQrUrl}
                            alt="VietQR Chi Trả Thù Lao Giáo Viên"
                            className="w-36 h-36 object-contain"
                          />
                          <span className="text-[10px] font-bold text-slate-800 mt-1">
                            Quét VietQR Chuyển Khoản Thù Lao
                          </span>
                        </div>
                      </div>

                      {/* Signatures */}
                      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-center text-xs">
                        <div>
                          <div className="font-bold text-slate-300">Giáo Viên Xác Nhận</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">(Ký &amp; ghi rõ họ tên)</div>
                          <div className="h-14" />
                          <div className="font-bold text-white">{printingPayslipTeacher.name}</div>
                        </div>
                        <div>
                          <div className="font-bold text-slate-300">Ban Học Vụ Đối Soát</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">(Xác nhận số tiết thực tế)</div>
                          <div className="h-14" />
                          <div className="font-bold text-white">Phòng Học Vụ Ngoại Khóa</div>
                        </div>
                        <div>
                          <div className="font-bold text-slate-300">Kế Toán Thanh Toán</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">(Duyệt chi &amp; lưu chứng từ)</div>
                          <div className="h-14" />
                          <div className="font-bold text-white">{currentUser?.full_name || 'Phòng Kế Toán Royal School'}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* SECTION 3: CLASS TRANSFER */}
      {activeSection === 'transfer' && (
        <div className="rounded-3xl bg-[#111827]/90 border border-slate-800/80 p-6 backdrop-blur-md shadow-2xl max-w-4xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">Biên Bản & Công Cụ Phụ Thu Chuyển Lớp</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Royal Protocol v2.6
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Điều chuyển học sinh giữa các môn học, ca học hoặc khác cơ sở đào tạo trong hệ thống Royal School
                </p>
              </div>
            </div>
            
            <div className="text-xs text-slate-400 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800">
              Cơ sở hiện hành: <strong className="text-amber-400">{store.campuses.find(c => c.id === selectedCampusId)?.name || 'Toàn trường'}</strong>
            </div>
          </div>

          {/* Quy định chênh lệch học phí */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80">
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <div className="text-slate-300">
                <strong className="text-amber-300">Đơn giá mới &gt; Đơn giá cũ:</strong> Phụ thu chênh lệch = <code className="text-white bg-slate-900 px-1.5 py-0.5 rounded font-mono">(Đơn giá mới - Đơn giá cũ) × Số buổi</code>. Sinh mã VietQR phụ thu ngay.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
              <div className="text-slate-300">
                <strong className="text-emerald-300">Đơn giá mới &le; Đơn giá cũ:</strong> Chuyển ngang, không hoàn tiền thừa theo quy chế. Hỗ trợ tùy chọn <em>Cấp phiếu bảo lưu phụ</em> hoặc <em>Quy đổi số buổi học bổ sung</em>.
              </div>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {/* 1. CHỌN HỌC SINH */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-slate-300 font-bold flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>1. Chọn Học sinh cần điều chuyển môn / lớp</span>
                </label>
                {currentStudentClasses.length > 0 && (
                  <span className="text-[11px] text-emerald-400 font-medium">
                    Học sinh đang có {currentStudentClasses.length} lớp học hoạt động
                  </span>
                )}
              </div>
              <StudentSearchCombobox
                students={store.students}
                enrollments={store.enrollments}
                classes={store.classes}
                selectedStudentId={transferState.student_id}
                onSelectStudent={(studentId) =>
                  setTransferState(prev => ({ ...prev, student_id: studentId }))
                }
                placeholder="Gõ tên, mã học sinh (RY-..., EXT-...), SĐT phụ huynh để tìm..."
                prioritizeActiveEnrollments={true}
              />
            </div>

            {/* 2. LỚP HIỆN TẠI VÀ SỐ BUỔI CÒN LẠI (TỰ ĐỘNG TÍNH) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  2. Lớp học hiện tại đang theo học
                </label>
                <select
                  value={transferState.from_class_id}
                  onChange={(e) => setTransferState(prev => ({ ...prev, from_class_id: e.target.value }))}
                  disabled={currentStudentClasses.length === 0}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs"
                >
                  {currentStudentClasses.length === 0 ? (
                    <option value="">[ Học sinh chưa có lớp đang học hoạt động ]</option>
                  ) : (
                    currentStudentClasses.map(c => {
                      const campus = store.campuses.find(cp => cp.id === c.campus_id);
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} ({campus?.code || 'PMH'}) — {formatVND(c.price_per_session)}/buổi
                        </option>
                      );
                    })
                  )}
                </select>
                {currentStudentClasses.length === 0 ? (
                  <p className="text-[11px] text-amber-400 mt-1.5 italic">
                    * Học sinh này chưa có lớp ngoại khóa nào đang hoạt động. Không thể thực hiện chuyển lớp.
                  </p>
                ) : fromClass && (
                  <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Đơn giá buổi cũ: <strong className="text-white font-mono">{formatVND(oldRate)}/buổi</strong></span>
                    <span>Cơ sở: <strong className="text-slate-300">{store.campuses.find(cp => cp.id === fromClass.campus_id)?.name}</strong></span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  3. Số buổi còn lại chưa học cần chuyển
                </label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={transferState.remaining_sessions}
                  onChange={(e) => setTransferState(prev => ({ ...prev, remaining_sessions: Math.max(1, Number(e.target.value)) }))}
                  disabled={currentStudentClasses.length === 0}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {fromClass && (
                  <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span>
                      Đã học: <strong>{autoRemainingInfo.elapsed}/{autoRemainingInfo.total} buổi</strong> &bull; Còn lại: <strong>{autoRemainingInfo.remaining} buổi</strong> (Tự động tính từ sổ điểm danh)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. BỘ LỌC 2 CẤP TRƯỚC KHI CHỌN LỚP ĐÍCH */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="text-slate-300 font-bold flex items-center gap-1.5 text-xs">
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                <span>4. Bộ lọc chọn Lớp học đích (Target Class Filters)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* CẤP 1: CƠ SỞ CHUYỂN ĐẾN */}
                <div>
                  <label className="block text-slate-400 text-[11px] font-medium mb-1 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-cyan-400" />
                    <span>Cơ sở chuyển đến (Target Campus)</span>
                  </label>
                  <select
                    value={targetCampusId}
                    onChange={(e) => setTargetCampusId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 text-xs"
                  >
                    {store.campuses.map(cp => (
                      <option key={cp.id} value={cp.id}>
                        {cp.name} ({cp.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* CẤP 2: BỘ MÔN CHUYỂN ĐẾN */}
                <div>
                  <label className="block text-slate-400 text-[11px] font-medium mb-1 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-400" />
                    <span>Bộ môn chuyển đến (Target Subject)</span>
                  </label>
                  <select
                    value={targetSubjectId}
                    onChange={(e) => setTargetSubjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500 text-xs"
                  >
                    <option value="all">-- Tất cả các bộ môn ngoại khóa --</option>
                    {store.subjects.map(sb => (
                      <option key={sb.id} value={sb.id}>
                        {sb.name} ({sb.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* CHỌN LỚP ĐÍCH TỪ KẾT QUẢ ĐÃ LỌC */}
              <div className="pt-2">
                <label className="block text-slate-300 font-semibold mb-1">
                  Lớp học chuyển đến ({filteredTargetClasses.length} lớp phù hợp)
                </label>
                <select
                  value={transferState.to_class_id}
                  onChange={(e) => setTransferState(prev => ({ ...prev, to_class_id: e.target.value }))}
                  disabled={currentStudentClasses.length === 0 || filteredTargetClasses.length === 0}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs"
                >
                  {filteredTargetClasses.length === 0 ? (
                    <option value="">[ Không có lớp nào phù hợp với bộ môn và cơ sở đã chọn ]</option>
                  ) : (
                    filteredTargetClasses.map(c => {
                      const count = store.enrollments.filter(e => e.class_id === c.id && (e.status === 'active' || e.status === 'trial')).length;
                      const emptySeats = c.max_students - count;
                      const daysText = c.days_of_week?.join('-') || '';
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} • {daysText} • Sĩ số: {count}/{c.max_students} ({emptySeats > 0 ? `Còn ${emptySeats} chỗ` : 'ĐÃ ĐẦY SĨ SỐ'}) • {formatVND(c.price_per_session)}/buổi
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              {/* METADATA CHI TIẾT CỦA LỚP ĐÍCH */}
              {toClass && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Đơn giá buổi mới:</span>
                    <strong className="text-amber-400 font-mono">{formatVND(newRate)}/b</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Lịch học & Ca:</span>
                    <strong className="text-white">{toClass.days_of_week?.join(' & ') || 'Lịch mở rộng'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Sĩ số hiện tại:</span>
                    <span className={`font-bold ${isTargetClassFull ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {targetEnrollmentCount} / {toClass.max_students} ({toClass.max_students - targetEnrollmentCount > 0 ? `Còn ${toClass.max_students - targetEnrollmentCount} chỗ` : 'Hết chỗ'})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Giáo viên phụ trách:</span>
                    <strong className="text-slate-300">
                      {store.teachers.find(t => t.id === toClass.primary_teacher_id)?.name || 'Học vụ phân công'}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* CẢNH BÁO RÀNG BUỘC: TRÙNG LỊCH HỌC */}
            {conflictingClasses.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 space-y-1">
                <div className="flex items-center gap-2 font-bold text-xs text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Cảnh Báo Trùng Lịch Học Thực Tế!</span>
                </div>
                <p className="text-[11px] leading-relaxed text-rose-200/90 pl-6">
                  Lớp đích <strong>{toClass?.name}</strong> ({toClass?.days_of_week?.join('-')}) bị trùng khung giờ ca học với lớp{' '}
                  <strong>{conflictingClasses[0].name}</strong> ({conflictingClasses[0].days_of_week?.join('-')}) mà học sinh đang theo học song song!
                </p>
              </div>
            )}

            {/* CẢNH BÁO RÀNG BUỘC: QUÁ SĨ SỐ (OVER QUOTA) & MANAGER OVERRIDE */}
            {isTargetClassFull && (
              <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Lớp đích đã đạt sĩ số tối đa ({targetEnrollmentCount}/{toClass?.max_students} học sinh)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-200/90">
                  Theo quy định chuẩn Royal School, lớp đã hết chỗ trống. Nếu cần thêm học sinh, phải được sự phê duyệt của Cấp Quản lý / BGH.
                </p>
                <label className="flex items-center gap-2 pt-1 text-xs text-white font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={managerOverrideQuota}
                    onChange={(e) => setManagerOverrideQuota(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-500 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Xác nhận Phê duyệt Ngoại lệ Sĩ số (Manager Override - Ban Giám Hiệu đã ký duyệt tiếp nhận)</span>
                </label>
              </div>
            )}

            {/* 4. ĐỐI SOÁT TÀI CHÍNH 2 CHIỀU & TÙY CHỌN THẶNG DƯ */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span>Quyết toán chênh lệch tài chính</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {fromClass?.name || 'Lớp cũ'} &rarr; {toClass?.name || 'Lớp mới'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Đơn giá lớp cũ:</span>
                  <span className="font-mono text-white font-bold">{formatVND(oldRate)}/b</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Đơn giá lớp mới:</span>
                  <span className="font-mono text-amber-400 font-bold">{formatVND(newRate)}/b</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Số buổi chuyển:</span>
                  <span className="font-mono text-white font-bold">{transferState.remaining_sessions} buổi</span>
                </div>
              </div>

              {/* KẾT QUẢ TÍNH TOÁN */}
              {isHigherRate ? (
                /* TRƯỜNG HỢP 1: LỚP MỚI GIÁ CAO HƠN -> PHỤ THU CHÊNH LỆCH */
                <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-amber-400 text-sm block">Tiền phụ thu chênh lệch phát sinh:</span>
                    <span className="text-[11px] text-slate-400">
                      = ({formatVND(newRate)} - {formatVND(oldRate)}) × {transferState.remaining_sessions} buổi
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-extrabold font-mono text-amber-400">
                      +{formatVND(surcharge)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewingTransferQr(true)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Xem mã VietQR</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* TRƯỜNG HỢP 2: LỚP MỚI GIÁ THẤP HƠN HOẶC BẰNG -> CHUYỂN NGANG + TÙY CHỌN THẶNG DƯ */
                <div className="pt-2 border-t border-slate-800/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-emerald-400 text-sm block">Quyết toán chuyển ngang:</span>
                      <span className="text-[11px] text-slate-400">
                        {surplus > 0
                          ? `Đơn giá lớp mới thấp hơn (${formatVND(oldRate)} > ${formatVND(newRate)}). Thặng dư: ${formatVND(surplus)}.`
                          : 'Đơn giá 2 lớp bằng nhau. Không phát sinh phụ thu.'}
                      </span>
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs font-mono">
                      0 đ (Chuyển ngang)
                    </span>
                  </div>

                  {/* TÙY CHỌN THẶNG DƯ NÂNG CAO (NẾU SURPLUS > 0) */}
                  {surplus > 0 && (
                    <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-200 flex items-center gap-1.5">
                          <BookmarkCheck className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Tùy chọn xử lý thặng dư tài chính ({formatVND(surplus)}):</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Chính sách linh hoạt</span>
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        {/* Option 1: Chuyển ngang tiêu chuẩn */}
                        <label className={`p-2.5 rounded-xl border text-xs flex items-center gap-2.5 cursor-pointer transition-all ${
                          surplusHandling === 'standard_no_refund'
                            ? 'bg-slate-900 border-emerald-500/60 text-white'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}>
                          <input
                            type="radio"
                            name="surplusHandling"
                            value="standard_no_refund"
                            checked={surplusHandling === 'standard_no_refund'}
                            onChange={() => setSurplusHandling('standard_no_refund')}
                            className="text-emerald-500 focus:ring-emerald-500"
                          />
                          <div className="flex-1 flex justify-between items-center">
                            <span><strong>Chuyển ngang tiêu chuẩn:</strong> Không hoàn trả tiền chênh lệch theo quy chế trường</span>
                            <span className="font-mono text-emerald-400 font-bold">0 đ</span>
                          </div>
                        </label>

                        {/* Option 2: Cấp phiếu bảo lưu phụ */}
                        <label className={`p-2.5 rounded-xl border text-xs flex items-center gap-2.5 cursor-pointer transition-all ${
                          surplusHandling === 'issue_credit_note'
                            ? 'bg-slate-900 border-cyan-500/60 text-white'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}>
                          <input
                            type="radio"
                            name="surplusHandling"
                            value="issue_credit_note"
                            checked={surplusHandling === 'issue_credit_note'}
                            onChange={() => setSurplusHandling('issue_credit_note')}
                            className="text-cyan-500 focus:ring-cyan-500"
                          />
                          <div className="flex-1 flex justify-between items-center">
                            <span><strong>Cấp Phiếu bảo lưu học phí phụ:</strong> Lưu vào tài khoản học sinh, hạn sử dụng 365 ngày</span>
                            <span className="font-mono text-cyan-400 font-bold">+{formatVND(surplus)}</span>
                          </div>
                        </label>

                        {/* Option 3: Quy đổi số buổi */}
                        <label className={`p-2.5 rounded-xl border text-xs flex items-center gap-2.5 cursor-pointer transition-all ${
                          surplusHandling === 'convert_sessions'
                            ? 'bg-slate-900 border-amber-500/60 text-white'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}>
                          <input
                            type="radio"
                            name="surplusHandling"
                            value="convert_sessions"
                            checked={surplusHandling === 'convert_sessions'}
                            onChange={() => setSurplusHandling('convert_sessions')}
                            className="text-amber-500 focus:ring-amber-500"
                          />
                          <div className="flex-1 flex justify-between items-center">
                            <span>
                              <strong>Quy đổi thêm số buổi học:</strong> Thêm <strong>+{convertedSessions} buổi</strong> ở lớp mới (Tổng {transferState.remaining_sessions + convertedSessions}b)
                            </span>
                            <span className="font-mono text-amber-400 font-bold">+{convertedSessions} buổi</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 5. LÝ DO CHUYỂN LỚP */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Lý do chuyển môn / lớp (Ghi vào Biên bản chính thức)
              </label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="VD: Phụ huynh xin chuyển sang môn Bơi lội để rèn luyện thể lực, đổi giờ học ca chiều..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500 text-xs"
              />
            </div>

            {/* BUTTON XÁC NHẬN */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                * Khi xác nhận, hệ thống sẽ tự động cập nhật ghi danh, định mức bánh sữa, và lập biên bản song ngữ A4.
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {surcharge > 0 && (
                  <button
                    type="button"
                    onClick={() => setViewingTransferQr(true)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Mã VietQR</span>
                  </button>
                )}
                <button
                  onClick={handleExecuteTransfer}
                  disabled={
                    currentStudentClasses.length === 0 || 
                    !transferState.from_class_id || 
                    !transferState.to_class_id || 
                    transferState.from_class_id === transferState.to_class_id ||
                    (isTargetClassFull && !managerOverrideQuota)
                  }
                  className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Xác Nhận Biên Bản Chuyển Lớp</span>
                </button>
              </div>
            </div>
          </div>

          {/* TRANSFER HISTORY LIST WITH VIEW TOGGLE & PRINT ACTION */}
          <div className="pt-6 border-t border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-cyan-400" />
                <span>Lịch Sử Biên Bản Chuyển Lớp ({store.transfers.length} biên bản đã lập)</span>
              </div>
              <ViewToggle viewMode={transferViewMode} onViewModeChange={setTransferViewMode} />
            </div>

            {store.transfers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 rounded-2xl bg-slate-900/60 border border-slate-800">
                Chưa có biên bản chuyển lớp nào được tạo trong kỳ học này.
              </div>
            ) : transferViewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {store.transfers.map(tr => {
                  const student = store.students.find(s => s.id === tr.student_id);
                  const fClass = store.classes.find(c => c.id === tr.from_class_id);
                  const tClass = store.classes.find(c => c.id === tr.to_class_id);

                  return (
                    <div key={tr.id} className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs space-y-2.5 hover:border-slate-700 transition-colors">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white text-sm block">{student?.name}</span>
                          <span className="text-[10px] text-amber-500/90 font-mono">{tr.transfer_code || tr.id}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                          {tr.transfer_date}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-300 space-y-1 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Từ lớp:</span>
                          <span className="text-slate-200 font-medium">{fClass?.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Sang lớp:</span>
                          <span className="text-amber-400 font-bold">{tClass?.name}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[11px] pt-1">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Quyết toán:</span>
                          <span className="font-mono font-bold text-emerald-400">
                            {tr.surcharge_amount > 0 
                              ? `Phụ thu: +${formatVND(tr.surcharge_amount)}`
                              : tr.surplus_handling === 'issue_credit_note'
                              ? `Bảo lưu: ${formatVND(tr.surplus_amount || 0)}`
                              : tr.surplus_handling === 'convert_sessions'
                              ? `Quy đổi: +${tr.converted_sessions}b`
                              : 'Chuyển ngang (0 đ)'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {onPrintTransferAgreement && (
                            <button
                              onClick={() => onPrintTransferAgreement(tr)}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                              title="In biên bản chuyển lớp A4 song ngữ"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>In Biên Bản</span>
                            </button>
                          )}
                        </div>
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
                      <th className="py-2.5 px-3">Mã Biên Bản</th>
                      <th className="py-2.5 px-3">Ngày Lập</th>
                      <th className="py-2.5 px-3">Học Sinh</th>
                      <th className="py-2.5 px-3">Lớp Cũ</th>
                      <th className="py-2.5 px-3">Lớp Mới</th>
                      <th className="py-2.5 px-3 text-center">Số Buổi</th>
                      <th className="py-2.5 px-3 text-right">Quyết Toán</th>
                      <th className="py-2.5 px-3 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {store.transfers.map(tr => {
                      const student = store.students.find(s => s.id === tr.student_id);
                      const fClass = store.classes.find(c => c.id === tr.from_class_id);
                      const tClass = store.classes.find(c => c.id === tr.to_class_id);

                      return (
                        <tr key={tr.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                            {tr.transfer_code || tr.id}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">{tr.transfer_date}</td>
                          <td className="py-2.5 px-3 font-bold text-white">
                            <div>{student?.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{student?.code}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{fClass?.name}</td>
                          <td className="py-2.5 px-3 text-amber-400 font-semibold">{tClass?.name}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold">
                            {tr.remaining_sessions}b
                            {tr.converted_sessions ? <span className="text-cyan-400 text-[10px]"> (+{tr.converted_sessions}b)</span> : null}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            {tr.surcharge_amount > 0 ? (
                              <span className="text-amber-400">+{formatVND(tr.surcharge_amount)}</span>
                            ) : tr.surplus_handling === 'issue_credit_note' ? (
                              <span className="text-cyan-400">BL: {formatVND(tr.surplus_amount || 0)}</span>
                            ) : tr.surplus_handling === 'convert_sessions' ? (
                              <span className="text-amber-300">Quy đổi</span>
                            ) : (
                              <span className="text-emerald-400">0 đ</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {onPrintTransferAgreement && (
                              <button
                                onClick={() => onPrintTransferAgreement(tr)}
                                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
                                title="In biên bản chuyển lớp A4 song ngữ"
                              >
                                <Printer className="w-3 h-3" />
                                <span>In</span>
                              </button>
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
                {viewingQrInvoice.prorated_note && (
                  <div className="text-slate-400 flex justify-between">
                    <span>Đối chiếu buổi học:</span>
                    <strong className="text-cyan-300 font-mono text-[11px]">{viewingQrInvoice.prorated_note}</strong>
                  </div>
                )}
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

      {/* Transfer VietQR Modal */}
      {viewingTransferQr && toClass && surcharge > 0 && (() => {
        const student = store.students.find(s => s.id === transferState.student_id);
        const targetCampus = store.campuses.find(c => c.id === toClass.campus_id) || store.campuses[0];
        const studentCode = student?.code || 'STUDENT';
        const transferQrUrl = generateVietQRUrl({
          bankName: targetCampus.bank_name,
          bankAccount: targetCampus.bank_account,
          bankOwner: targetCampus.bank_owner,
          amount: surcharge,
          studentCode: studentCode,
          className: toClass.name,
          invoiceCode: `PHU-THU-CHUYEN-LOP`,
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl text-center space-y-4">
              <div className="flex items-center justify-between text-xs text-amber-400 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <QrCode className="w-4 h-4" />
                  <span>VietQR Phụ Thu Chuyển Lớp</span>
                </span>
                <button
                  onClick={() => setViewingTransferQr(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <div className="bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs py-2 px-3 rounded-xl text-left">
                Chênh lệch học phí khi chuyển sang lớp <strong>{toClass.name}</strong> ({transferState.remaining_sessions} buổi × chênh lệch {formatVND(newRate - oldRate)}/b).
              </div>

              <div className="bg-white p-3 rounded-2xl inline-block shadow-md">
                <img
                  src={transferQrUrl}
                  alt="VietQR Phụ Thu"
                  className="w-64 h-64 mx-auto object-contain"
                />
              </div>

              <div className="text-left bg-slate-900 p-3.5 rounded-2xl text-xs space-y-1.5 border border-slate-800">
                <div className="text-slate-400 flex justify-between">
                  <span>Học sinh:</span>
                  <strong className="text-white">{student?.name} ({student?.code})</strong>
                </div>
                <div className="text-slate-400 flex justify-between">
                  <span>Tài khoản tiếp nhận:</span>
                  <strong className="text-amber-400 font-mono">{targetCampus.bank_account}</strong>
                </div>
                <div className="text-slate-400 flex justify-between">
                  <span>Ngân hàng:</span>
                  <strong className="text-white">{targetCampus.bank_name} ({targetCampus.bank_owner})</strong>
                </div>
                <div className="text-slate-400 flex justify-between pt-1 border-t border-slate-800">
                  <span>Số tiền phụ thu cần quét:</span>
                  <strong className="text-amber-400 font-mono text-base font-extrabold">{formatVND(surcharge)}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingTransferQr(false)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Đóng Mã VietQR
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
