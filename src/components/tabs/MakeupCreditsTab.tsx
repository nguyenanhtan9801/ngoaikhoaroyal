import React, { useState, useMemo, useEffect } from 'react';
import {
  BookmarkCheck,
  Plus,
  Printer,
  Clock,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  ArrowRight,
  Calendar,
  FileText,
  User,
  ShieldCheck,
  Lock,
  Sparkles,
  Check,
  X,
  Info,
  Zap,
  Building2,
  RotateCcw,
  Edit3,
  Trash2,
  ArrowRightLeft,
} from 'lucide-react';
import {
  AppStore,
  formatVND,
  createAuditRecord,
  validateCreditNoteCreation,
  getNextTermAndRedemptionOptions,
  NextTermClassRedemptionOption,
  canModifyRedeemedCredit,
} from '../../lib/storage';
import { MakeupCredit, Student, ExtracurricularClass, UserRole, TuitionInvoice, Enrollment, AppUser } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { StudentSearchCombobox } from '../StudentSearchCombobox';
import { showToast } from '../../lib/toast';

interface MakeupCreditsTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onPrintCreditSlip: (credit: MakeupCredit) => void;
}

export const MakeupCreditsTab: React.FC<MakeupCreditsTabProps> = ({
  store,
  currentRole,
  currentUser,
  onUpdateStore,
  onPrintCreditSlip,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [applyingCredit, setApplyingCredit] = useState<MakeupCredit | null>(null);
  const [selectedNextTermClassId, setSelectedNextTermClassId] = useState<string>('');
  const [sessionRedemptionMode, setSessionRedemptionMode] = useState<'only_reserved_sessions' | 'full_next_course'>('full_next_course');

  // Edit Redeemed Credit Modal states (Sửa / Hủy cấn trừ bảo lưu)
  const [editingCredit, setEditingCredit] = useState<MakeupCredit | null>(null);
  const [editActiveAction, setEditActiveAction] = useState<'change_class' | 'revert'>('change_class');
  const [editSelectedClassId, setEditSelectedClassId] = useState<string>('');
  const [editSessionMode, setEditSessionMode] = useState<'only_reserved_sessions' | 'full_next_course'>('full_next_course');
  const [showRevertConfirm, setShowRevertConfirm] = useState<boolean>(false);

  // Default to std_03 (Lê Minh Khôi - 3 buổi vắng có phép liên tiếp, đủ điều kiện lập phiếu mới)
  const defaultEligibleStudentId = useMemo(() => {
    const std03 = store.students.find(s => s.id === 'std_03');
    return std03?.id || store.students[0]?.id || '';
  }, [store.students]);

  const [issueForm, setIssueForm] = useState({
    student_id: defaultEligibleStudentId,
    source_class_id: 'cls_swim_pmh_01',
    note: '',
  });

  // Classes in current active term (Fall 2026) that the selected student is enrolled in (or all active term classes)
  const studentEnrolledClassIds = useMemo(() => {
    return new Set(
      store.enrollments
        .filter(e => e.student_id === issueForm.student_id && e.status !== 'trial_dropped')
        .map(e => e.class_id)
    );
  }, [store.enrollments, issueForm.student_id]);

  const currentTermClasses = useMemo(() => {
    const activeTerm = store.terms.find(t => t.is_active) || store.terms[0];
    return store.classes.filter(c => !activeTerm || c.term_id === activeTerm.id);
  }, [store.classes, store.terms]);

  // Auto-select the student's enrolled class when student changes
  useEffect(() => {
    const enrolledClasses = currentTermClasses.filter(c => studentEnrolledClassIds.has(c.id));
    if (enrolledClasses.length > 0) {
      const isCurrentInEnrolled = enrolledClasses.some(c => c.id === issueForm.source_class_id);
      if (!isCurrentInEnrolled) {
        setIssueForm(prev => ({ ...prev, source_class_id: enrolledClasses[0].id }));
      }
    }
  }, [issueForm.student_id, currentTermClasses, studentEnrolledClassIds, issueForm.source_class_id]);

  const selectedStudent = store.students.find(s => s.id === issueForm.student_id);
  const selectedClass = store.classes.find(c => c.id === issueForm.source_class_id);

  // PHẦN 1: Real-time Validation (Kiểm tra >= 3 buổi vắng có phép liên tục & Định mức 1 lần/1 môn/1 khóa)
  const creationValidation = useMemo(() => {
    if (!issueForm.student_id || !issueForm.source_class_id) {
      return null;
    }
    return validateCreditNoteCreation(issueForm.student_id, issueForm.source_class_id, store);
  }, [issueForm.student_id, issueForm.source_class_id, store]);

  const validConsecutiveCount = creationValidation?.maxConsecutiveExcused || 0;
  const validAbsentDates = creationValidation?.validSessionDates || [];
  const unitPriceOld = selectedClass?.price_per_session || 0;
  const calculatedCreditAmount = validConsecutiveCount >= 3 ? unitPriceOld * validConsecutiveCount : 0;

  // PHẦN 2: Next-Term Redemption Options when applyingCredit is open
  const redemptionData = useMemo(() => {
    if (!applyingCredit) return null;
    return getNextTermAndRedemptionOptions(applyingCredit, store);
  }, [applyingCredit, store]);

  useEffect(() => {
    if (redemptionData && redemptionData.options.length > 0) {
      // Default to same subject in Next Term if available, else first option
      const sameSubjectOpt = redemptionData.options.find(
        opt => opt.cls.subject_id === applyingCredit?.subject_id && opt.cls.campus_id === store.classes.find(c => c.id === applyingCredit?.source_class_id)?.campus_id
      ) || redemptionData.options.find(opt => opt.cls.subject_id === applyingCredit?.subject_id) || redemptionData.options[0];
      setSelectedNextTermClassId(sameSubjectOpt.cls.id);
      setSessionRedemptionMode('full_next_course');
    } else {
      setSelectedNextTermClassId('');
    }
  }, [applyingCredit, redemptionData, store.classes]);

  const selectedRedemptionOption: NextTermClassRedemptionOption | undefined = useMemo(() => {
    if (!redemptionData) return undefined;
    return redemptionData.options.find(o => o.cls.id === selectedNextTermClassId) || redemptionData.options[0];
  }, [redemptionData, selectedNextTermClassId]);

  // Handle Create Credit Note (with strict Creation Validation)
  const handleCreateCredit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedClass || !creationValidation) return;

    if (creationValidation.hasExistingCredit) {
      showToast(
        creationValidation.quotaErrorMessage ||
          '🔒 Định mức vượt giới hạn: Môn học này đã được cấp 1 phiếu bảo lưu trong khóa học hiện tại (Tối đa 1 lần / 1 môn / 1 khóa).',
        'error',
        { title: 'Vượt định mức bảo lưu' }
      );
      return;
    }

    if (creationValidation.maxConsecutiveExcused < 3) {
      showToast(
        creationValidation.streakErrorMessage ||
          `⚠️ Không đủ điều kiện: Học sinh cần có ít nhất 3 buổi vắng có phép liên tục không ngắt quãng (Hiện tại chuỗi nghỉ dài nhất: ${creationValidation.maxConsecutiveExcused} buổi).`,
        'error',
        { title: 'Không đủ điều kiện lập phiếu' }
      );
      return;
    }

    const today = new Date();
    const expiry = new Date(today);
    expiry.setFullYear(today.getFullYear() + 1); // 365 ngày
    const expiryStr = expiry.toISOString().split('T')[0];

    const newCredit: MakeupCredit = {
      id: `cred_${Date.now()}`,
      credit_code: `CRE-${today.getFullYear()}-${String(store.makeupCredits.length + 1).padStart(4, '0')}`,
      student_id: selectedStudent.id,
      student_name: selectedStudent.name,
      source_class_id: selectedClass.id,
      source_term_id: selectedClass.term_id,
      subject_id: selectedClass.subject_id,
      term_id: selectedClass.term_id,
      consecutive_absent_sessions: validConsecutiveCount,
      consecutive_absent_count: validConsecutiveCount,
      absent_dates: validAbsentDates,
      consecutive_dates: validAbsentDates,
      unit_price_old: unitPriceOld,
      source_rate: unitPriceOld,
      credit_rule: 'monetary',
      total_credit_amount: calculatedCreditAmount,
      transferred_sessions: validConsecutiveCount,
      issue_date: today.toISOString().split('T')[0],
      expiry_date: expiryStr,
      expires_at: expiryStr,
      status: 'issued',
      note:
        issueForm.note.trim() ||
        `Bảo lưu ${validConsecutiveCount} buổi vắng có phép liên tiếp (${validAbsentDates.join(', ')}) có minh chứng hợp lệ`,
    };

    const creditLog = createAuditRecord(
      'CREDIT_ISSUE',
      'FINANCE',
      'Phiếu Bảo Lưu Học Phí',
      `Lập phiếu bảo lưu ${newCredit.credit_code} cho học sinh ${selectedStudent.name} (Vắng có phép liên tiếp ${newCredit.consecutive_absent_count} buổi: ${validAbsentDates.join(', ')}, Giá trị: ${formatVND(newCredit.total_credit_amount)})`,
      null,
      {
        target_id: newCredit.credit_code,
        details: {
          status: 'success',
          after: {
            credit_code: newCredit.credit_code,
            student_name: selectedStudent.name,
            class_name: selectedClass.name,
            amount: newCredit.total_credit_amount,
            absent_count: newCredit.consecutive_absent_count,
            absent_dates: validAbsentDates,
            expiry_date: newCredit.expiry_date,
          },
        },
      }
    );

    onUpdateStore(prev => ({
      ...prev,
      makeupCredits: [newCredit, ...prev.makeupCredits],
      auditLogs: [creditLog, ...(prev.auditLogs || [])],
    }));

    setShowIssueModal(false);
    showToast(
      `Đã lập phiếu bảo lưu ${newCredit.credit_code} cho học sinh ${selectedStudent.name} (${validConsecutiveCount} buổi liên tiếp • ${formatVND(newCredit.total_credit_amount)})!`,
      'success',
      { title: 'Lập phiếu bảo lưu thành công' }
    );
  };

  // Handle Apply Credit to Next Term Class (PHẦN 2: Buổi vs Tiền)
  const handleConfirmRedeemToNextTerm = (option: NextTermClassRedemptionOption) => {
    if (!applyingCredit) return;
    const targetClass = option.cls;
    const student = store.students.find(s => s.id === applyingCredit.student_id);
    const todayStr = new Date().toISOString().split('T')[0];

    const isBySessions = option.redemptionType === 'by_sessions'; // rate_old >= rate_new
    const reservedSessions = option.reservedSessionsCount;

    // Tính toán số tiền giảm trừ & công nợ còn lại:
    // - Nhánh A (rate_old >= rate_new):
    //   + Nếu chọn học đúng N buổi bảo lưu: Học phí N buổi = N * rate_new, Giảm trừ = N * rate_new -> Phụ huynh đóng thêm = 0 đ
    //   + Nếu chọn đăng ký trọn khóa mới (total_sessions buổi) và trừ N buổi bảo lưu: Giảm trừ = N * rate_new -> Phụ huynh đóng phần buổi còn lại
    // - Nhánh B (rate_old < rate_new):
    //   + Cấn trừ theo số tiền: Lấy toàn bộ CreditTotal trừ thẳng vào hóa đơn lớp khóa sau -> Công nợ còn lại = Học phí khóa sau - CreditTotal
    const deductedAmount = option.deductedAmount;
    const isOnlyReservedSessions = isBySessions && sessionRedemptionMode === 'only_reserved_sessions';

    const targetGrossAmount = isOnlyReservedSessions
      ? reservedSessions * option.rateNew
      : targetClass.full_course_fee;

    const remainingBalanceDue = isOnlyReservedSessions
      ? 0
      : Math.max(0, targetGrossAmount - deductedAmount);

    const registeredSessionsForNextClass = isOnlyReservedSessions
      ? reservedSessions
      : targetClass.total_sessions;

    onUpdateStore(prev => {
      // 1. Check if invoice already exists for (student_id, targetClass.id)
      const existingInvoice = prev.invoices.find(
        inv =>
          inv.student_id === applyingCredit.student_id &&
          inv.class_id === targetClass.id &&
          inv.payment_status !== 'cancelled'
      );

      let targetInvoiceId = existingInvoice?.id || `inv_next_${Date.now()}`;
      let targetInvoiceCode =
        existingInvoice?.invoice_code ||
        `INV-2027-${String(prev.invoices.length + 1).padStart(4, '0')}`;

      let updatedInvoices: TuitionInvoice[];
      if (existingInvoice) {
        updatedInvoices = prev.invoices.map(inv => {
          if (inv.id === existingInvoice.id) {
            const newNet = Math.max(0, inv.gross_amount - deductedAmount);
            const newOutstanding = Math.max(0, newNet - inv.paid_amount);
            return {
              ...inv,
              credit_deducted: deductedAmount,
              net_payable: newNet,
              outstanding_amount: newOutstanding,
              payment_status: (newOutstanding === 0 ? 'paid' : inv.paid_amount > 0 ? 'partial' : 'unpaid') as TuitionInvoice['payment_status'],
              prorated_note: isBySessions
                ? `Cấn trừ phiếu ${applyingCredit.credit_code} [Bảo lưu nguyên ${reservedSessions} buổi × ${formatVND(option.rateNew)}/b = -${formatVND(deductedAmount)}]`
                : `Cấn trừ phiếu ${applyingCredit.credit_code} [Cấn trừ theo số tiền = -${formatVND(deductedAmount)}, đóng bổ sung ${formatVND(newOutstanding)}]`,
            };
          }
          return inv;
        });
      } else {
        const newNextTermInvoice: TuitionInvoice = {
          id: targetInvoiceId,
          invoice_code: targetInvoiceCode,
          student_id: applyingCredit.student_id,
          class_id: targetClass.id,
          gross_amount: targetGrossAmount,
          credit_deducted: deductedAmount,
          discount_amount: 0,
          net_payable: remainingBalanceDue,
          paid_amount: 0,
          outstanding_amount: remainingBalanceDue,
          payment_status: remainingBalanceDue === 0 ? 'paid' : 'unpaid',
          due_date: option.term?.start_date || '2027-01-15',
          created_at: todayStr,
          registered_sessions: registeredSessionsForNextClass,
          total_class_sessions: targetClass.total_sessions,
          session_rate: option.rateNew,
          is_prorated: true,
          prorated_note: isBySessions
            ? isOnlyReservedSessions
              ? `Bảo lưu nguyên ${reservedSessions} buổi từ phiếu ${applyingCredit.credit_code} (Đơn giá cũ ${formatVND(option.rateOld)} ≥ Đơn giá mới ${formatVND(option.rateNew)}) — Phụ huynh không phải bù thêm tiền`
              : `Đăng ký khóa sau (${targetClass.total_sessions} buổi) • Khấu trừ nguyên ${reservedSessions} buổi bảo lưu từ phiếu ${applyingCredit.credit_code} (-${formatVND(deductedAmount)})`
            : `Cấn trừ theo số tiền từ phiếu ${applyingCredit.credit_code} (-${formatVND(deductedAmount)}) • Đơn giá cũ ${formatVND(option.rateOld)} < Đơn giá mới ${formatVND(option.rateNew)}`,
        };
        updatedInvoices = [newNextTermInvoice, ...prev.invoices];
      }

      // 2. Ensure student is enrolled in targetClass (Next Term)
      const hasEnrollment = prev.enrollments.some(
        e => e.student_id === applyingCredit.student_id && e.class_id === targetClass.id && e.status !== 'trial_dropped'
      );
      const updatedEnrollments: Enrollment[] = hasEnrollment
        ? prev.enrollments
        : [
            ...prev.enrollments,
            {
              id: `enr_redeem_${Date.now()}`,
              student_id: applyingCredit.student_id,
              class_id: targetClass.id,
              registered_sessions: registeredSessionsForNextClass,
              joined_date: option.term?.start_date || '2027-01-10',
              enrolled_days_of_week: targetClass.days_of_week,
              status: 'active',
            },
          ];

      // 3. Update CreditNote with redeemed_info
      const updatedCredits: MakeupCredit[] = prev.makeupCredits.map(c => {
        if (c.id === applyingCredit.id) {
          return {
            ...c,
            status: 'applied',
            applied_class_id: targetClass.id,
            applied_at: new Date().toISOString(),
            redeemed_info: {
              target_term_id: targetClass.term_id,
              target_class_id: targetClass.id,
              redemption_type: option.redemptionType,
              applied_sessions: isBySessions ? reservedSessions : undefined,
              deducted_amount: deductedAmount,
              remaining_balance_due: remainingBalanceDue,
              redeemed_at: todayStr,
              invoice_id: targetInvoiceId,
              invoice_code: targetInvoiceCode,
            },
          };
        }
        return c;
      });

      const redeemAudit = createAuditRecord(
        'CREDIT_ISSUE',
        'FINANCE',
        'Cấn Trừ Bảo Lưu Khóa Sau',
        `Cấn trừ phiếu ${applyingCredit.credit_code} của học sinh ${student?.name || applyingCredit.student_id} vào lớp khóa sau "${targetClass.name}" (${
          isBySessions
            ? `Bảo lưu nguyên ${reservedSessions} buổi • Giảm trừ ${formatVND(deductedAmount)}`
            : `Cấn trừ theo số tiền • Giảm trừ ${formatVND(deductedAmount)} • Cần đóng thêm ${formatVND(remainingBalanceDue)}`
        })`,
        null,
        {
          target_id: applyingCredit.credit_code,
          details: {
            status: 'success',
            after: {
              target_class: targetClass.name,
              redemption_type: option.redemptionType,
              deducted_amount: deductedAmount,
              remaining_balance_due: remainingBalanceDue,
              invoice_code: targetInvoiceCode,
            },
          },
        }
      );

      return {
        ...prev,
        makeupCredits: updatedCredits,
        invoices: updatedInvoices,
        enrollments: updatedEnrollments,
        auditLogs: [redeemAudit, ...(prev.auditLogs || [])],
      };
    });

    setApplyingCredit(null);

    if (isBySessions) {
      showToast(
        `Đã bảo lưu nguyên ${reservedSessions} buổi (Phiếu ${applyingCredit.credit_code}) vào lớp ${targetClass.name} (${option.term?.name}). Giảm trừ: ${formatVND(deductedAmount)}!`,
        'success',
        { title: '✓ Bảo lưu nguyên số buổi thành công' }
      );
    } else {
      showToast(
        `Đã cấn trừ theo số tiền ${formatVND(deductedAmount)} (Phiếu ${applyingCredit.credit_code}) vào lớp ${targetClass.name}. Công nợ chênh lệch cần đóng thêm: ${formatVND(remainingBalanceDue)}!`,
        'success',
        { title: '⚡ Cấn trừ theo số tiền thành công' }
      );
    }
  };

  // PHẦN 3: Chỉnh Sửa / Hủy Cấn Trừ Phiếu Bảo Lưu
  const editRedemptionData = useMemo(() => {
    if (!editingCredit) return null;
    return getNextTermAndRedemptionOptions(editingCredit, store);
  }, [editingCredit, store]);

  useEffect(() => {
    if (editingCredit && editRedemptionData && editRedemptionData.options.length > 0) {
      const currentTargetId = editingCredit.redeemed_info?.target_class_id || editingCredit.applied_class_id;
      const matchCurrent = editRedemptionData.options.find(opt => opt.cls.id === currentTargetId);
      if (matchCurrent) {
        setEditSelectedClassId(matchCurrent.cls.id);
      } else {
        setEditSelectedClassId(editRedemptionData.options[0].cls.id);
      }
      setEditSessionMode(
        editingCredit.redeemed_info?.redemption_type === 'by_sessions' &&
        editingCredit.redeemed_info?.applied_sessions === (editingCredit.consecutive_absent_sessions || editingCredit.consecutive_absent_count || 3)
          ? 'only_reserved_sessions'
          : 'full_next_course'
      );
      setEditActiveAction('change_class');
      setShowRevertConfirm(false);
    }
  }, [editingCredit, editRedemptionData]);

  const selectedEditOption: NextTermClassRedemptionOption | undefined = useMemo(() => {
    if (!editRedemptionData) return undefined;
    return editRedemptionData.options.find(o => o.cls.id === editSelectedClassId) || editRedemptionData.options[0];
  }, [editRedemptionData, editSelectedClassId]);

  // Handle Save Edited Redemption (Change Target Class)
  const handleSaveEditedRedemption = (newOption: NextTermClassRedemptionOption) => {
    if (!editingCredit) return;
    const oldClassId = editingCredit.redeemed_info?.target_class_id || editingCredit.applied_class_id;
    const oldInvoiceId = editingCredit.redeemed_info?.invoice_id;
    const oldClass = store.classes.find(c => c.id === oldClassId);
    const newClass = newOption.cls;
    const student = store.students.find(s => s.id === editingCredit.student_id);
    const todayStr = new Date().toISOString().split('T')[0];

    const isBySessions = newOption.redemptionType === 'by_sessions';
    const reservedSessions = newOption.reservedSessionsCount;
    const isOnlyReservedSessions = isBySessions && editSessionMode === 'only_reserved_sessions';
    const deductedAmount = newOption.deductedAmount;

    const targetGrossAmount = isOnlyReservedSessions
      ? reservedSessions * newOption.rateNew
      : newClass.full_course_fee;

    const remainingBalanceDue = isOnlyReservedSessions
      ? 0
      : Math.max(0, targetGrossAmount - deductedAmount);

    const registeredSessionsForNextClass = isOnlyReservedSessions
      ? reservedSessions
      : newClass.total_sessions;

    onUpdateStore(prev => {
      // 1. Rollback old invoice deduction
      let updatedInvoices = prev.invoices.map(inv => {
        const isOldInvoice =
          (oldInvoiceId && inv.id === oldInvoiceId) ||
          (!oldInvoiceId && inv.student_id === editingCredit.student_id && inv.class_id === oldClassId);

        if (isOldInvoice) {
          const restoredGross = inv.gross_amount;
          const restoredNet = restoredGross;
          const restoredOutstanding = Math.max(0, restoredNet - inv.paid_amount);
          return {
            ...inv,
            credit_deducted: 0,
            net_payable: restoredNet,
            outstanding_amount: restoredOutstanding,
            payment_status: (restoredOutstanding === 0 ? 'paid' : inv.paid_amount > 0 ? 'partial' : 'unpaid') as TuitionInvoice['payment_status'],
            prorated_note: `Đã thu hồi cấn trừ bảo lưu ${editingCredit.credit_code} chuyển sang lớp ${newClass.name}`,
          };
        }
        return inv;
      });

      // If old invoice was auto-generated next term invoice and has zero payments, and class changed, remove it
      if (oldClassId !== newClass.id) {
        updatedInvoices = updatedInvoices.filter(inv => {
          if (oldInvoiceId && inv.id === oldInvoiceId && inv.paid_amount === 0 && inv.id.startsWith('inv_next_')) {
            return false;
          }
          return true;
        });
      }

      // 2. Apply deduction to new class invoice
      const existingNewInvoice = updatedInvoices.find(
        inv =>
          inv.student_id === editingCredit.student_id &&
          inv.class_id === newClass.id &&
          inv.payment_status !== 'cancelled'
      );

      let targetInvoiceId = existingNewInvoice?.id || `inv_next_${Date.now()}`;
      let targetInvoiceCode =
        existingNewInvoice?.invoice_code ||
        `INV-2027-${String(updatedInvoices.length + 1).padStart(4, '0')}`;

      if (existingNewInvoice) {
        updatedInvoices = updatedInvoices.map(inv => {
          if (inv.id === existingNewInvoice.id) {
            const newNet = Math.max(0, inv.gross_amount - deductedAmount);
            const newOutstanding = Math.max(0, newNet - inv.paid_amount);
            return {
              ...inv,
              credit_deducted: deductedAmount,
              net_payable: newNet,
              outstanding_amount: newOutstanding,
              payment_status: (newOutstanding === 0 ? 'paid' : inv.paid_amount > 0 ? 'partial' : 'unpaid') as TuitionInvoice['payment_status'],
              prorated_note: isBySessions
                ? `Cấn trừ phiếu ${editingCredit.credit_code} [Bảo lưu nguyên ${reservedSessions} buổi × ${formatVND(newOption.rateNew)}/b = -${formatVND(deductedAmount)}]`
                : `Cấn trừ phiếu ${editingCredit.credit_code} [Cấn trừ theo số tiền = -${formatVND(deductedAmount)}, đóng bổ sung ${formatVND(newOutstanding)}]`,
            };
          }
          return inv;
        });
      } else {
        const newInvoice: TuitionInvoice = {
          id: targetInvoiceId,
          invoice_code: targetInvoiceCode,
          student_id: editingCredit.student_id,
          class_id: newClass.id,
          gross_amount: targetGrossAmount,
          credit_deducted: deductedAmount,
          discount_amount: 0,
          net_payable: remainingBalanceDue,
          paid_amount: 0,
          outstanding_amount: remainingBalanceDue,
          payment_status: remainingBalanceDue === 0 ? 'paid' : 'unpaid',
          due_date: newOption.term?.start_date || '2027-01-15',
          created_at: todayStr,
          registered_sessions: registeredSessionsForNextClass,
          total_class_sessions: newClass.total_sessions,
          session_rate: newOption.rateNew,
          is_prorated: true,
          prorated_note: isBySessions
            ? isOnlyReservedSessions
              ? `Bảo lưu nguyên ${reservedSessions} buổi từ phiếu ${editingCredit.credit_code} (Đơn giá cũ ${formatVND(newOption.rateOld)} ≥ Đơn giá mới ${formatVND(newOption.rateNew)}) — Phụ huynh không phải bù thêm tiền`
              : `Đăng ký khóa sau (${newClass.total_sessions} buổi) • Khấu trừ nguyên ${reservedSessions} buổi bảo lưu từ phiếu ${editingCredit.credit_code} (-${formatVND(deductedAmount)})`
            : `Cấn trừ theo số tiền từ phiếu ${editingCredit.credit_code} (-${formatVND(deductedAmount)}) • Đơn giá cũ ${formatVND(newOption.rateOld)} < Đơn giá mới ${formatVND(newOption.rateNew)}`,
        };
        updatedInvoices = [newInvoice, ...updatedInvoices];
      }

      // 3. Update Enrollments
      let updatedEnrollments = prev.enrollments;
      if (oldClassId && oldClassId !== newClass.id) {
        updatedEnrollments = updatedEnrollments.filter(
          e => !(e.student_id === editingCredit.student_id && e.class_id === oldClassId && e.id.startsWith('enr_redeem_'))
        );
      }
      const hasNewEnrollment = updatedEnrollments.some(
        e => e.student_id === editingCredit.student_id && e.class_id === newClass.id && e.status !== 'trial_dropped'
      );
      if (!hasNewEnrollment) {
        updatedEnrollments = [
          ...updatedEnrollments,
          {
            id: `enr_redeem_${Date.now()}`,
            student_id: editingCredit.student_id,
            class_id: newClass.id,
            registered_sessions: registeredSessionsForNextClass,
            joined_date: newOption.term?.start_date || '2027-01-10',
            enrolled_days_of_week: newClass.days_of_week,
            status: 'active',
          },
        ];
      }

      // 4. Update Credit Note
      const updatedCredits: MakeupCredit[] = prev.makeupCredits.map(c => {
        if (c.id === editingCredit.id) {
          return {
            ...c,
            status: 'applied',
            applied_class_id: newClass.id,
            applied_at: new Date().toISOString(),
            redeemed_info: {
              target_term_id: newClass.term_id,
              target_class_id: newClass.id,
              redemption_type: newOption.redemptionType,
              applied_sessions: isBySessions ? reservedSessions : undefined,
              deducted_amount: deductedAmount,
              remaining_balance_due: remainingBalanceDue,
              redeemed_at: todayStr,
              invoice_id: targetInvoiceId,
              invoice_code: targetInvoiceCode,
            },
          };
        }
        return c;
      });

      // 5. Audit Log
      const auditLog = createAuditRecord(
        'CREDIT_ISSUE',
        'FINANCE',
        'Chỉnh Sửa Cấn Trừ Bảo Lưu',
        `Học vụ ${currentUser?.full_name || 'Học vụ'} đã chỉnh sửa cấn trừ phiếu bảo lưu ${editingCredit.credit_code} từ lớp "${oldClass?.name || oldClassId}" sang "${newClass.name}" (Khóa học chưa bắt đầu)`,
        currentUser,
        {
          target_id: editingCredit.credit_code,
          details: {
            status: 'success',
            after: {
              target_class: newClass.name,
              redemption_type: newOption.redemptionType,
              deducted_amount: deductedAmount,
              remaining_balance_due: remainingBalanceDue,
              invoice_code: targetInvoiceCode,
            },
          },
        }
      );

      return {
        ...prev,
        makeupCredits: updatedCredits,
        invoices: updatedInvoices,
        enrollments: updatedEnrollments,
        auditLogs: [auditLog, ...(prev.auditLogs || [])],
      };
    });

    setEditingCredit(null);
    showToast(
      `✓ Đã cập nhật lại thông tin cấn trừ phiếu bảo lưu ${editingCredit.credit_code} thành công!`,
      'success',
      { title: 'Cập nhật cấn trừ' }
    );
  };

  // Handle Revert Redemption (Hủy cấn trừ, trả về phiếu bảo lưu gốc)
  const handleRevertRedemption = () => {
    if (!editingCredit) return;
    const targetClassId = editingCredit.redeemed_info?.target_class_id || editingCredit.applied_class_id;
    const targetInvoiceId = editingCredit.redeemed_info?.invoice_id;
    const targetClass = store.classes.find(c => c.id === targetClassId);
    const student = store.students.find(s => s.id === editingCredit.student_id);

    onUpdateStore(prev => {
      // 1. Rollback invoice: clear deduction
      let updatedInvoices = prev.invoices.map(inv => {
        const isTargetInvoice =
          (targetInvoiceId && inv.id === targetInvoiceId) ||
          (!targetInvoiceId && inv.student_id === editingCredit.student_id && inv.class_id === targetClassId);

        if (isTargetInvoice) {
          const restoredGross = inv.gross_amount;
          const restoredNet = restoredGross;
          const restoredOutstanding = Math.max(0, restoredNet - inv.paid_amount);
          return {
            ...inv,
            credit_deducted: 0,
            net_payable: restoredNet,
            outstanding_amount: restoredOutstanding,
            payment_status: (restoredOutstanding === 0 ? 'paid' : inv.paid_amount > 0 ? 'partial' : 'unpaid') as TuitionInvoice['payment_status'],
            prorated_note: `Đã hủy cấn trừ phiếu bảo lưu ${editingCredit.credit_code}, khôi phục công nợ gốc`,
          };
        }
        return inv;
      });

      // If this invoice was created purely for redemption and unpaid, filter it out
      updatedInvoices = updatedInvoices.filter(inv => {
        if (targetInvoiceId && inv.id === targetInvoiceId && inv.paid_amount === 0 && inv.id.startsWith('inv_next_')) {
          return false;
        }
        return true;
      });

      // 2. Unenroll student from target class if enrollment was from redemption or unpaid
      const updatedEnrollments = prev.enrollments.filter(
        e => !(e.student_id === editingCredit.student_id && e.class_id === targetClassId && (e.id.startsWith('enr_redeem_') || e.status === 'active'))
      );

      // 3. Revert CreditNote to available
      const updatedCredits: MakeupCredit[] = prev.makeupCredits.map(c => {
        if (c.id === editingCredit.id) {
          return {
            ...c,
            status: 'available',
            applied_class_id: undefined,
            applied_at: undefined,
            redeemed_info: undefined,
          };
        }
        return c;
      });

      // 4. Audit Log
      const revertAudit = createAuditRecord(
        'CREDIT_ISSUE',
        'FINANCE',
        'Hủy Cấn Trừ Bảo Lưu Khóa Sau',
        `Học vụ ${currentUser?.full_name || 'Học vụ'} đã hủy cấn trừ phiếu bảo lưu ${editingCredit.credit_code} của học sinh ${student?.name || editingCredit.student_name} tại lớp "${targetClass?.name || targetClassId}" (Khóa học chưa bắt đầu) - Hoàn trả trạng thái Chưa sử dụng`,
        currentUser,
        {
          target_id: editingCredit.credit_code,
          details: {
            status: 'success',
            after: {
              status: 'available',
              reverted_class: targetClass?.name,
              reverted_invoice: targetInvoiceId,
            },
          },
        }
      );

      return {
        ...prev,
        makeupCredits: updatedCredits,
        invoices: updatedInvoices,
        enrollments: updatedEnrollments,
        auditLogs: [revertAudit, ...(prev.auditLogs || [])],
      };
    });

    setEditingCredit(null);
    showToast(
      `✓ Đã cập nhật lại thông tin cấn trừ phiếu bảo lưu ${editingCredit.credit_code} thành công!`,
      'success',
      { title: 'Hủy cấn trừ thành công' }
    );
  };

  return (
    <div className="space-y-6">
      {/* Policy Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-[#111827]/90 via-[#131d31]/80 to-[#111827]/90 border border-slate-800/80 p-6 backdrop-blur-md shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <BookmarkCheck className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">
              Chính Sách Bảo Lưu Học Phí (Chặn Nghỉ Liên Tiếp ≥ 3 Buổi Có Phép &amp; Cấn Trừ Khóa Sau)
            </h2>
          </div>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Nhà trường bãi bỏ học bù đơn lẻ, chỉ cấp Phiếu bảo lưu học phí khi học sinh{' '}
            <strong className="text-slate-200">nghỉ có phép liên tục từ 3 buổi thực tế trở lên không ngắt quãng</strong>{' '}
            (kèm minh chứng hợp lệ). Phiếu có hiệu lực cấn trừ sang lớp thuộc{' '}
            <strong className="text-amber-300">Khóa học kế tiếp (Next Term)</strong> theo quy tắc so sánh đơn giá buổi cũ và mới.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-emerald-300 font-semibold">
              &bull; Điều kiện bắt buộc: Nghỉ có phép liên tục ≥ 3 buổi (không ngắt quãng)
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-amber-300 font-semibold">
              &bull; Định mức: Tối đa 1 lần / 1 môn / 1 khóa học
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-cyan-300 font-semibold">
              &bull; Đơn giá cũ ≥ Đơn giá mới: Bảo lưu nguyên số buổi
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-purple-300 font-semibold">
              &bull; Đơn giá cũ &lt; Đơn giá mới: Cấn trừ theo số tiền
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowIssueModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-slate-950" />
          <span>Lập Phiếu Bảo Lưu Mới</span>
        </button>
      </div>

      {/* Credits List Container (Cards or Table) */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BookmarkCheck className="w-4 h-4 text-amber-400" />
              <span>Sổ Theo Dõi Phiếu Bảo Lưu Học Phí Toàn Trường ({store.makeupCredits.length} phiếu)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Thời hạn bảo lưu chính xác 365 ngày kể từ ngày cấp, chỉ áp dụng cấn trừ vào lớp thuộc khóa học tiếp theo
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          </div>
        </div>

        {/* VIEW 1: CARDS VIEW (VOUCHER STYLE) */}
        {viewMode === 'cards' && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {store.makeupCredits.map(credit => {
              const student = store.students.find(s => s.id === credit.student_id);
              const cls = store.classes.find(c => c.id === credit.source_class_id);
              const subject = store.subjects.find(s => s.id === credit.subject_id);
              const sourceTerm = store.terms.find(t => t.id === (credit.source_term_id || credit.term_id));
              const absentCount = credit.consecutive_absent_sessions || credit.consecutive_absent_count || 3;
              const absentDates = credit.absent_dates || credit.consecutive_dates || [];
              const unitPriceOld = credit.unit_price_old || credit.source_rate || 0;
              const isUnused = credit.status === 'issued' || credit.status === 'available';
              const isRedeemed = credit.status === 'applied' || credit.status === 'used';
              const targetClass = credit.redeemed_info
                ? store.classes.find(c => c.id === credit.redeemed_info?.target_class_id)
                : credit.applied_class_id
                ? store.classes.find(c => c.id === credit.applied_class_id)
                : undefined;

              return (
                <div
                  key={credit.id}
                  className="rounded-2xl p-4 bg-gradient-to-br from-[#111827] via-slate-900 to-[#0B0F19] border border-amber-500/30 hover:border-amber-500/60 shadow-lg shadow-amber-500/5 transition-all flex flex-col justify-between relative overflow-hidden"
                >
                  {/* Watermark */}
                  <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none text-white">
                    <BookmarkCheck className="w-28 h-28" />
                  </div>

                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div>
                        <span className="font-mono text-xs font-extrabold text-amber-400 tracking-wider">
                          {credit.credit_code}
                        </span>
                        <div className="text-white font-bold text-sm mt-0.5">
                          {student?.name || credit.student_name}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">{student?.code}</span>
                      </div>

                      {isUnused ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                          Chưa sử dụng
                        </span>
                      ) : isRedeemed ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                          Đã cấn trừ khóa sau
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[10px] font-bold">
                          Hết hiệu lực
                        </span>
                      )}
                    </div>

                    {/* Class Details */}
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs mb-3 space-y-1.5">
                      <div className="text-slate-200 font-semibold">{cls?.name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center justify-between">
                        <span>{subject?.name}</span>
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[10px]">
                          Vắng {absentCount} buổi liên tiếp
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Ngày nghỉ liên tiếp: <span className="text-slate-300">{absentDates.join(', ')}</span>
                      </div>
                      {sourceTerm && (
                        <div className="text-[10px] text-slate-500">
                          Khóa nguồn: <span className="text-slate-300">{sourceTerm.name}</span>
                        </div>
                      )}
                    </div>

                    {/* Amount & Rate */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-3">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                          Tổng tiền bảo lưu ({absentCount} buổi)
                        </span>
                        <span className="text-base font-extrabold text-emerald-400 font-mono">
                          {formatVND(credit.total_credit_amount)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">Đơn giá buổi cũ</span>
                        <span className="text-xs font-bold text-slate-200 font-mono">
                          {formatVND(unitPriceOld)}/b
                        </span>
                      </div>
                    </div>

                    {/* Redeemed Info Box if already applied */}
                    {isRedeemed && credit.redeemed_info && (
                      <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 mb-3 space-y-1 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-300 font-bold">Đã cấn trừ vào khóa sau:</span>
                          {credit.redeemed_info.redemption_type === 'by_sessions' ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px]">
                              ✓ Bảo lưu nguyên {credit.redeemed_info.applied_sessions} buổi
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-[10px]">
                              ⚡ Cấn trừ theo số tiền
                            </span>
                          )}
                        </div>
                        <div className="text-slate-200 font-semibold truncate">{targetClass?.name}</div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-0.5">
                          <span>Giảm trừ HĐ: -{formatVND(credit.redeemed_info.deducted_amount)}</span>
                          <span>Đóng thêm: {formatVND(credit.redeemed_info.remaining_balance_due)}</span>
                        </div>
                      </div>
                    )}

                    {/* Validity */}
                    <div className="text-[11px] text-slate-400 flex items-center justify-between mb-3">
                      <span>Hiệu lực đến (365 ngày):</span>
                      <span className="font-mono text-white font-bold">
                        {credit.expires_at || credit.expiry_date}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onPrintCreditSlip(credit)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                      title="In Phiếu Bảo Lưu Học Phí"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-400" />
                      <span>In Phiếu</span>
                    </button>

                    {isUnused && (
                      <button
                        onClick={() => setApplyingCredit(credit)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all hover:scale-[1.02] cursor-pointer"
                      >
                        <span>Cấn trừ khóa sau</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isRedeemed && (() => {
                      const modCheck = canModifyRedeemedCredit(credit, store);
                      if (modCheck.canModify) {
                        return (
                          <button
                            onClick={() => setEditingCredit(credit)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-bold transition-all cursor-pointer shadow-sm shadow-sky-500/10"
                            title="Khóa học chưa bắt đầu - Cho phép thay đổi lớp cấn trừ hoặc hủy bảo lưu"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-sky-300" />
                            <span>Sửa cấn trừ</span>
                          </button>
                        );
                      }
                      return (
                        <div
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/60 text-slate-500 border border-slate-700/60 text-xs cursor-not-allowed select-none"
                          title="Khóa học đích đã diễn ra - Không thể chỉnh sửa phiếu bảo lưu"
                        >
                          <Lock className="w-3.5 h-3.5 text-slate-500" />
                          <span>Đã khóa</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 2: TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Mã Phiếu</th>
                  <th className="py-3 px-4">Học Viên</th>
                  <th className="py-3 px-4">Môn &amp; Lớp Nguồn</th>
                  <th className="py-3 px-4 text-center">Số Buổi Vắng Liên Tiếp</th>
                  <th className="py-3 px-4">Đơn Giá Buổi Cũ</th>
                  <th className="py-3 px-4">Tổng Tiền Bảo Lưu</th>
                  <th className="py-3 px-4">Hạn Hiệu Lực (1 Năm)</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {store.makeupCredits.map(credit => {
                  const student = store.students.find(s => s.id === credit.student_id);
                  const cls = store.classes.find(c => c.id === credit.source_class_id);
                  const subject = store.subjects.find(s => s.id === credit.subject_id);
                  const absentCount = credit.consecutive_absent_sessions || credit.consecutive_absent_count || 3;
                  const absentDates = credit.absent_dates || credit.consecutive_dates || [];
                  const unitPriceOld = credit.unit_price_old || credit.source_rate || 0;
                  const isUnused = credit.status === 'issued' || credit.status === 'available';
                  const isRedeemed = credit.status === 'applied' || credit.status === 'used';
                  const targetClass = credit.redeemed_info
                    ? store.classes.find(c => c.id === credit.redeemed_info?.target_class_id)
                    : credit.applied_class_id
                    ? store.classes.find(c => c.id === credit.applied_class_id)
                    : undefined;

                  return (
                    <tr key={credit.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-amber-400">{credit.credit_code}</span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{student?.name || credit.student_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{student?.code}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{cls?.name}</div>
                        <div className="text-[10px] text-slate-400">{subject?.name}</div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 font-mono">
                          {absentCount} buổi
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1 font-mono">
                          {absentDates.join(', ')}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-300">
                        {formatVND(unitPriceOld)}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        {formatVND(credit.total_credit_amount)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-white font-mono">{credit.expires_at || credit.expiry_date}</div>
                        <div className="text-[10px] text-slate-500">Cấp: {credit.issue_date}</div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isUnused ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            Chưa sử dụng
                          </span>
                        ) : isRedeemed ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              Đã cấn trừ khóa sau
                            </span>
                            {credit.redeemed_info && (
                              <span
                                className={`text-[10px] font-semibold ${
                                  credit.redeemed_info.redemption_type === 'by_sessions'
                                    ? 'text-emerald-300'
                                    : 'text-amber-300'
                                }`}
                              >
                                {credit.redeemed_info.redemption_type === 'by_sessions'
                                  ? `✓ Bảo lưu ${credit.redeemed_info.applied_sessions} buổi`
                                  : `⚡ Trừ ${formatVND(credit.redeemed_info.deducted_amount)}`}
                              </span>
                            )}
                            {targetClass && (
                              <span className="text-[9px] text-slate-400 max-w-[160px] truncate" title={targetClass.name}>
                                → {targetClass.name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[10px] font-bold">
                            Hết hiệu lực
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onPrintCreditSlip(credit)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title="In Phiếu Bảo Lưu Học Phí"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {isUnused && (
                            <button
                              onClick={() => setApplyingCredit(credit)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-bold shadow-sm shadow-amber-500/20 cursor-pointer transition-all"
                            >
                              Cấn trừ khóa sau
                            </button>
                          )}

                          {isRedeemed && (() => {
                            const modCheck = canModifyRedeemedCredit(credit, store);
                            if (modCheck.canModify) {
                              return (
                                <button
                                  onClick={() => setEditingCredit(credit)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-[11px] font-bold transition-all cursor-pointer shadow-sm shadow-sky-500/10"
                                  title="Khóa học chưa bắt đầu - Cho phép thay đổi lớp cấn trừ hoặc hủy bảo lưu"
                                >
                                  <RotateCcw className="w-3 h-3 text-sky-300" />
                                  <span>Sửa cấn trừ</span>
                                </button>
                              );
                            }
                            return (
                              <div
                                className="p-1.5 rounded-lg bg-slate-800/40 text-slate-600 border border-slate-800/60 cursor-not-allowed flex items-center justify-center select-none"
                                title="Khóa học đích đã diễn ra - Không thể chỉnh sửa phiếu bảo lưu"
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-600" />
                              </div>
                            );
                          })()}
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

      {/* ===================================================================== */}
      {/* MODAL 1: LẬP PHIẾU BẢO LƯU HỌC PHÍ KHÓA HỌC (PHẦN 1: VALIDATION)     */}
      {/* ===================================================================== */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BookmarkCheck className="w-5 h-5 text-amber-400" />
                <span>Lập Phiếu Bảo Lưu Học Phí Khóa Học</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowIssueModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Scenario Switcher for fast verification of the 3 business rules */}
            <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Chọn nhanh kịch bản kiểm tra điều kiện bảo lưu (Dữ liệu điểm danh thực tế):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    setIssueForm(prev => ({
                      ...prev,
                      student_id: 'std_03',
                      source_class_id: 'cls_swim_pmh_01',
                    }))
                  }
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    issueForm.student_id === 'std_03'
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-emerald-400">✓ Đủ 3 buổi liên tiếp</div>
                  <div className="text-[10px] text-slate-300 mt-0.5 truncate">Lê Minh Khôi (RY-2026-00003)</div>
                  <div className="text-[9px] text-slate-400 font-mono">Nghỉ CP: 07/09, 09/09, 14/09</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setIssueForm(prev => ({
                      ...prev,
                      student_id: 'std_01',
                      source_class_id: 'cls_swim_pmh_01',
                    }))
                  }
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    issueForm.student_id === 'std_01'
                      ? 'bg-rose-500/15 border-rose-500/50 text-rose-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-rose-400">⚠️ Nghỉ ngắt quãng (Chặn)</div>
                  <div className="text-[10px] text-slate-300 mt-0.5 truncate">Nguyễn Hoàng Bảo Long</div>
                  <div className="text-[9px] text-slate-400 font-mono">Nghỉ T2, T4 đi học, T2 nghỉ</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setIssueForm(prev => ({
                      ...prev,
                      student_id: 'std_02',
                      source_class_id: 'cls_swim_pmh_01',
                    }))
                  }
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    issueForm.student_id === 'std_02'
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-amber-400">🔒 Đã cấp 1 lần (Chặn)</div>
                  <div className="text-[10px] text-slate-300 mt-0.5 truncate">Trần Ngọc Minh Châu</div>
                  <div className="text-[9px] text-slate-400 font-mono">Đã có phiếu CRE-2026-0001</div>
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateCredit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Chọn Học sinh *</label>
                <StudentSearchCombobox
                  students={store.students}
                  enrollments={store.enrollments}
                  classes={store.classes}
                  selectedStudentId={issueForm.student_id}
                  onSelectStudent={studentId => setIssueForm(prev => ({ ...prev, student_id: studentId }))}
                  placeholder="Gõ tên, mã học sinh (RY-...), SĐT phụ huynh để tìm nhanh..."
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Lớp học phát sinh vắng có phép (Khóa hiện tại) *
                </label>
                <select
                  value={issueForm.source_class_id}
                  onChange={e => setIssueForm(prev => ({ ...prev, source_class_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                >
                  {currentTermClasses.map(c => {
                    const isEnrolled = studentEnrolledClassIds.has(c.id);
                    return (
                      <option key={c.id} value={c.id}>
                        {isEnrolled ? '★ [Đang theo học] ' : ''}
                        {c.name} — Đơn giá: {formatVND(c.price_per_session)}/buổi
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* PHẦN 1: KẾT QUẢ QUÉT LỊCH SỬ ĐIỂM DANH & CHUỖI NGHỈ CÓ PHÉP LIÊN TỤC */}
              {creationValidation && (
                <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      <span>Đối Soát Chuỗi Điểm Danh Thực Tế Trong Lớp</span>
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        creationValidation.maxConsecutiveExcused >= 3
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      Chuỗi vắng CP liên tiếp dài nhất: {creationValidation.maxConsecutiveExcused} buổi
                    </span>
                  </div>

                  {/* Attendance Records Sequence */}
                  {creationValidation.allStudentAttendanceRecords.length > 0 ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {creationValidation.allStudentAttendanceRecords.map((rec, idx) => {
                        const isInValidStreak = creationValidation.validSessionDates.includes(rec.session_date);
                        const isExcused = rec.status === 'absent_excused';
                        const isPresent = rec.status === 'present';
                        return (
                          <div
                            key={rec.id || idx}
                            className={`px-2.5 py-1.5 rounded-xl border text-[10px] flex flex-col gap-0.5 ${
                              isInValidStreak && creationValidation.maxConsecutiveExcused >= 3
                                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                                : isExcused
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                : isPresent
                                ? 'bg-slate-900 border-slate-800 text-slate-400'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            }`}
                          >
                            <span className="font-mono font-bold">{rec.session_date}</span>
                            <span className="font-semibold">
                              {isExcused
                                ? '● Vắng có phép'
                                : isPresent
                                ? '✓ Đi học (Ngắt chuỗi)'
                                : '✕ Vắng KP'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">
                      Chưa có bản ghi điểm danh vắng có phép của học sinh trong lớp này.
                    </div>
                  )}

                  {/* Alert Box 1: Quota Constraint (1 lần / 1 môn / 1 khóa) */}
                  {creationValidation.hasExistingCredit && (
                    <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/50 text-amber-200 flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-[11px] leading-relaxed">
                        <div className="font-bold text-amber-300">
                          {creationValidation.quotaErrorMessage}
                        </div>
                        <div className="text-amber-200/80">
                          Hệ thống tự động khóa chức năng cấp thêm phiếu bảo lưu thứ 2 cho cùng môn học trong khóa này.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Alert Box 2: Consecutive Excused < 3 */}
                  {creationValidation.maxConsecutiveExcused < 3 && (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/50 text-rose-200 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-[11px] leading-relaxed">
                        <div className="font-bold text-rose-300">
                          {creationValidation.streakErrorMessage}
                        </div>
                        <div className="text-rose-200/80">
                          Quy định: Nếu học sinh chỉ nghỉ 1–2 buổi hoặc nghỉ ngắt quãng (VD: nghỉ Thứ 2, Thứ 4 đi học, Thứ 2 tuần sau nghỉ) thì không đủ điều kiện lập phiếu bảo lưu.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Eligible Banner when >= 3 consecutive and no existing credit */}
                  {creationValidation.isEligible && (
                    <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-[11px] leading-relaxed">
                        <div className="font-bold text-emerald-300">
                          ✓ Đủ điều kiện cấp Phiếu bảo lưu học phí ({validConsecutiveCount} buổi vắng có phép liên tiếp)
                        </div>
                        <div className="text-emerald-200/90 font-mono text-[10px]">
                          Chuỗi ngày nghỉ hợp lệ: {validAbsentDates.join(', ')}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Số buổi nghỉ có phép liên tiếp (Bắt buộc ≥ 3) *
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={
                      validConsecutiveCount >= 3
                        ? `${validConsecutiveCount} buổi liên tiếp (Hợp lệ)`
                        : `${validConsecutiveCount} buổi (Chưa đủ ≥ 3 buổi)`
                    }
                    className={`w-full px-3 py-2 rounded-xl border font-mono font-bold ${
                      validConsecutiveCount >= 3
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Thời hạn hiệu lực</label>
                  <input
                    type="text"
                    disabled
                    value="1 Năm (365 ngày - Áp dụng Khóa sau)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Danh sách ngày vắng có phép liên tiếp (Tự động trích xuất từ Sổ điểm danh)
                </label>
                <input
                  type="text"
                  readOnly
                  value={
                    validAbsentDates.length > 0
                      ? validAbsentDates.join(', ')
                      : 'Không có chuỗi ngày nghỉ có phép liên tiếp'
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200 font-mono"
                />
              </div>

              {/* Live Computation */}
              <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Đơn giá buổi cũ (rate_old):</span>
                  <span className="font-mono font-bold text-white">{formatVND(unitPriceOld)}/buổi</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Số buổi đủ điều kiện bảo lưu:</span>
                  <span className="font-mono font-bold text-white">
                    {validConsecutiveCount >= 3 ? `${validConsecutiveCount} buổi` : '0 buổi (Chưa đủ điều kiện)'}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold border-t border-slate-800 pt-1.5 text-sm">
                  <span>Tổng tiền bảo lưu gốc (CreditTotal):</span>
                  <span className="font-mono">{formatVND(calculatedCreditAmount)}</span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!creationValidation?.isEligible}
                  className={`px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                    creationValidation?.isEligible
                      ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-lg shadow-amber-500/20 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-70'
                  }`}
                >
                  {creationValidation?.isEligible ? (
                    <>
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>Xác Nhận Cấp Phiếu ({validConsecutiveCount} Buổi)</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Đã Khóa Lập Phiếu (Chưa Đủ Điều Kiện)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: CẤN TRỪ BẢO LƯU VÀO LỚP KHÓA SAU (PHẦN 2: BUỔI VS TIỀN)      */}
      {/* ===================================================================== */}
      {applyingCredit && redemptionData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Cấn Trừ Bảo Lưu Vào Lớp Khóa Sau
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Chỉ áp dụng cho các lớp thuộc khóa học kế tiếp:{' '}
                    <strong className="text-amber-300">{redemptionData.nextTerm?.name}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setApplyingCredit(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Source Credit Summary Box */}
            <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-amber-500/30 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-slate-400">Phiếu bảo lưu: </span>
                  <strong className="text-amber-400 font-mono">{applyingCredit.credit_code}</strong>
                  <span className="mx-2 text-slate-600">&bull;</span>
                  <span className="text-slate-400">Học sinh: </span>
                  <strong className="text-white">
                    {store.students.find(s => s.id === applyingCredit.student_id)?.name ||
                      applyingCredit.student_name}
                  </strong>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">
                  Khóa nguồn: {redemptionData.sourceTerm?.code || 'FALL-2026'} → Khóa đích:{' '}
                  <strong className="text-emerald-400">{redemptionData.nextTerm?.code || 'SPRING-2027'}</strong>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Số buổi bảo lưu (N):</span>
                  <span className="font-mono font-bold text-rose-300 text-sm">
                    {applyingCredit.consecutive_absent_sessions || applyingCredit.consecutive_absent_count} buổi
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Đơn giá buổi môn cũ (rate_old):</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatVND(applyingCredit.unit_price_old || applyingCredit.source_rate)}/b
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Tổng tiền bảo lưu (CreditTotal):</span>
                  <span className="font-mono font-extrabold text-emerald-400 text-sm">
                    {formatVND(applyingCredit.total_credit_amount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Next-Term Class List with 2 Business Branches (Buổi vs Tiền) */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <label className="block text-slate-300 font-semibold">
                  Chọn lớp thuộc {redemptionData.nextTerm?.name} cần cấn trừ:
                </label>
                <span className="text-[10px] text-slate-400">
                  Đã lọc {redemptionData.options.length} lớp thuộc khóa sau
                </span>
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {redemptionData.options.map(opt => {
                  const isSelected = selectedRedemptionOption?.cls.id === opt.cls.id;
                  const isBySessions = opt.redemptionType === 'by_sessions'; // rate_old >= rate_new

                  return (
                    <div
                      key={opt.cls.id}
                      onClick={() => setSelectedNextTermClassId(opt.cls.id)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? isBySessions
                            ? 'bg-emerald-950/30 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                            : 'bg-amber-950/30 border-amber-500/60 shadow-lg shadow-amber-500/10'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-white text-xs flex items-center gap-2">
                            <span>{opt.cls.name}</span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px]">
                              {opt.term?.code}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                            <span>
                              Đơn giá mới (rate_new):{' '}
                              <strong className="text-white font-mono">{formatVND(opt.rateNew)}/buổi</strong>
                            </span>
                            <span>&bull;</span>
                            <span>
                              Học phí khóa ({opt.cls.total_sessions}b):{' '}
                              <strong className="text-slate-200 font-mono">{formatVND(opt.cls.full_course_fee)}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Nhãn phân nhánh nghiệp vụ theo chuẩn Thiết kế Hình 2 */}
                        {isBySessions ? (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold shrink-0 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                            <span>Bảo lưu nguyên số buổi</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold shrink-0 flex items-center gap-1">
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            <span>Cấn trừ theo số tiền</span>
                          </span>
                        )}
                      </div>

                      {/* Sub-explanation row */}
                      <div className="mt-2 pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">
                          So sánh: rate_old ({formatVND(opt.rateOld)}) {isBySessions ? '≥' : '<'} rate_new ({formatVND(opt.rateNew)})
                        </span>
                        {isBySessions ? (
                          <span className="text-emerald-400 font-semibold">
                            Được học trọn {opt.reservedSessionsCount} buổi (Giảm trừ {formatVND(opt.deductedAmount)} • Không bù tiền {opt.reservedSessionsCount} buổi này)
                          </span>
                        ) : (
                          <span className="text-amber-300 font-semibold">
                            Trừ thẳng {formatVND(opt.deductedAmount)} vào HĐ • Đóng bổ sung: {formatVND(opt.remainingBalanceDue)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detailed Calculation Preview for Selected Next-Term Class */}
            {selectedRedemptionOption && (
              <div
                className={`p-4 rounded-2xl border space-y-2.5 text-xs ${
                  selectedRedemptionOption.redemptionType === 'by_sessions'
                    ? 'bg-emerald-950/20 border-emerald-500/40'
                    : 'bg-amber-950/20 border-amber-500/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                    Chi Tiết Phương Án Cấn Trừ Đã Chọn
                  </span>
                  {selectedRedemptionOption.redemptionType === 'by_sessions' ? (
                    <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[11px]">
                      [ ✓ Bảo lưu nguyên {selectedRedemptionOption.reservedSessionsCount} buổi ]
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-[11px]">
                      [ ⚡ Cấn trừ theo số tiền ]
                    </span>
                  )}
                </div>

                {selectedRedemptionOption.redemptionType === 'by_sessions' ? (
                  <>
                    {/* Optional toggle when rate_old >= rate_new: register full next course vs only N reserved sessions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSessionRedemptionMode('full_next_course')}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          sessionRedemptionMode === 'full_next_course'
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
                            : 'bg-slate-900/80 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="font-bold text-[11px] text-emerald-300">
                          1. Học trọn khóa sau ({selectedRedemptionOption.cls.total_sessions} buổi)
                        </div>
                        <div className="text-[10px] text-slate-300 mt-0.5">
                          Khấu trừ {selectedRedemptionOption.reservedSessionsCount} buổi đã bảo lưu (-{formatVND(selectedRedemptionOption.deductedAmount)})
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSessionRedemptionMode('only_reserved_sessions')}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          sessionRedemptionMode === 'only_reserved_sessions'
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-white'
                            : 'bg-slate-900/80 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="font-bold text-[11px] text-emerald-300">
                          2. Chỉ học đúng {selectedRedemptionOption.reservedSessionsCount} buổi bảo lưu
                        </div>
                        <div className="text-[10px] text-slate-300 mt-0.5">
                          Học trọn vẹn {selectedRedemptionOption.reservedSessionsCount} buổi — Không nộp thêm (0 đ)
                        </div>
                      </button>
                    </div>

                    <div className="space-y-1 pt-2 border-t border-slate-800/80 text-[11px]">
                      <div className="flex justify-between text-slate-300">
                        <span>Số buổi được bảo lưu nguyên vẹn:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {selectedRedemptionOption.reservedSessionsCount} buổi (Đã thanh toán hoàn chỉnh)
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>
                          Số tiền giảm trừ trên hóa đơn ({selectedRedemptionOption.reservedSessionsCount} ×{' '}
                          {formatVND(selectedRedemptionOption.rateNew)}):
                        </span>
                        <span className="font-mono font-bold text-emerald-400">
                          -{formatVND(selectedRedemptionOption.deductedAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-white font-bold pt-1 border-t border-slate-800/60">
                        <span>
                          {sessionRedemptionMode === 'only_reserved_sessions'
                            ? `Số tiền phụ huynh cần đóng thêm (cho ${selectedRedemptionOption.reservedSessionsCount} buổi bảo lưu):`
                            : `Công nợ còn lại cho ${
                                selectedRedemptionOption.cls.total_sessions -
                                selectedRedemptionOption.reservedSessionsCount
                              } buổi mới khóa sau:`}
                        </span>
                        <span className="font-mono text-sm text-emerald-300">
                          {sessionRedemptionMode === 'only_reserved_sessions'
                            ? '0 đ (Không phải bù tiền)'
                            : formatVND(selectedRedemptionOption.fullCourseRemainingBalance)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5 pt-1 text-[11px]">
                    <div className="flex justify-between text-slate-300">
                      <span>Học phí lớp khóa sau ({selectedRedemptionOption.cls.total_sessions} buổi):</span>
                      <span className="font-mono font-bold text-white">
                        {formatVND(selectedRedemptionOption.cls.full_course_fee)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Số tiền cấn trừ từ phiếu bảo lưu cũ (CreditTotal):</span>
                      <span className="font-mono font-bold text-amber-400">
                        -{formatVND(selectedRedemptionOption.deductedAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-white font-bold pt-1.5 border-t border-slate-800">
                      <span>Công nợ chênh lệch phụ huynh cần đóng bổ sung (VietQR):</span>
                      <span className="font-mono text-sm text-amber-300">
                        {formatVND(selectedRedemptionOption.remainingBalanceDue)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-800">
              <button
                onClick={() => setApplyingCredit(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Đóng
              </button>

              {selectedRedemptionOption && (
                <button
                  onClick={() => handleConfirmRedeemToNextTerm(selectedRedemptionOption)}
                  className={`px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
                    selectedRedemptionOption.redemptionType === 'by_sessions'
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>
                    {selectedRedemptionOption.redemptionType === 'by_sessions'
                      ? `Xác Nhận Bảo Lưu Nguyên ${selectedRedemptionOption.reservedSessionsCount} Buổi Vào Khóa Sau`
                      : `Xác Nhận Cấn Trừ ${formatVND(selectedRedemptionOption.deductedAmount)} Vào Khóa Sau`}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: CHỈNH SỬA / HỦY CẤN TRỪ PHIẾU BẢO LƯU (EditCreditModal)     */}
      {/* ===================================================================== */}
      {editingCredit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#111827] border border-slate-700/80 p-6 shadow-2xl space-y-5 text-slate-200">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Chỉnh Sửa / Hủy Cấn Trừ Phiếu Bảo Lưu</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      {editingCredit.credit_code}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Học viên: <strong className="text-slate-200">{editingCredit.student_name}</strong> • Giá trị: <strong className="text-emerald-400 font-mono">{formatVND(editingCredit.total_credit_amount)}</strong> ({editingCredit.consecutive_absent_sessions || editingCredit.consecutive_absent_count} buổi liên tiếp)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCredit(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Course Status Validation Banner */}
            {(() => {
              const modCheck = canModifyRedeemedCredit(editingCredit, store);
              const targetTerm = modCheck.targetTerm;
              const targetClass = modCheck.targetClass || store.classes.find(c => c.id === editingCredit.redeemed_info?.target_class_id);

              return (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <div className="font-bold text-emerald-300 flex items-center gap-2">
                        <span>Đủ điều kiện can thiệp phiếu bảo lưu (Khóa học đích chưa bắt đầu)</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                          Khai giảng: {targetTerm?.start_date || 'Chưa diễn ra'}
                        </span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        Lớp cấn trừ hiện tại: <strong className="text-white">{targetClass?.name || 'Lớp khóa sau'}</strong>. Chưa có bất kỳ buổi học nào phát sinh điểm danh trong hệ thống. Bộ phận Học vụ / Tuyển sinh có toàn quyền thay đổi lớp cấn trừ hoặc hủy cấn trừ khôi phục công nợ gốc.
                      </p>
                    </div>
                  </div>

                  {/* Mode Tabs */}
                  <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditActiveAction('change_class')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        editActiveAction === 'change_class'
                          ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>1. Đổi Sang Lớp Khác Khóa Sau</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditActiveAction('revert')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        editActiveAction === 'revert'
                          ? 'bg-rose-500/90 text-white shadow-md shadow-rose-500/20'
                          : 'text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>2. Hủy Cấn Trừ (Về Chưa Sử Dụng)</span>
                    </button>
                  </div>

                  {/* ACTION 1: CHANGE TARGET CLASS */}
                  {editActiveAction === 'change_class' && (
                    <div className="space-y-4">
                      {/* Current Redeemed Info */}
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="text-slate-400 text-[11px] block">Lớp cấn trừ đang áp dụng:</span>
                          <span className="font-semibold text-white">{targetClass?.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 text-[11px] block">Đã khấu trừ hóa đơn:</span>
                          <span className="font-mono font-bold text-amber-400">
                            -{formatVND(editingCredit.redeemed_info?.deducted_amount || 0)}
                          </span>
                        </div>
                      </div>

                      {/* Select New Target Class */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                          <span>Chọn lớp mới ở khóa sau ({editRedemptionData?.nextTerm?.name}):</span>
                          <span className="text-[11px] text-sky-400 font-normal">Hệ thống tự động so khớp đơn giá</span>
                        </label>

                        <div className="grid grid-cols-1 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                          {editRedemptionData?.options.map(option => {
                            const isSelected = selectedEditOption?.cls.id === option.cls.id;
                            const isCurrent = option.cls.id === editingCredit.redeemed_info?.target_class_id;

                            return (
                              <div
                                key={option.cls.id}
                                onClick={() => setEditSelectedClassId(option.cls.id)}
                                className={`p-3 rounded-2xl border transition-all cursor-pointer relative ${
                                  isSelected
                                    ? 'bg-sky-950/40 border-sky-500/80 shadow-md ring-1 ring-sky-500/30'
                                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-white">{option.cls.name}</span>
                                      {isCurrent && (
                                        <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] text-slate-400 font-semibold">
                                          Hiện tại
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                      {option.campusName} • Lịch học: {option.cls.days_of_week?.join(', ')} • {option.cls.total_sessions} buổi
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <div className="text-xs font-mono font-bold text-slate-200">
                                      {formatVND(option.cls.full_course_fee)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      Đơn giá mới: {formatVND(option.rateNew)}/b
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                                  {option.redemptionType === 'by_sessions' ? (
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold text-[10px]">
                                      ✓ Đơn giá cũ ({formatVND(option.rateOld)}) &ge; Đơn giá mới ({formatVND(option.rateNew)}) &rarr; Bảo lưu nguyên {option.reservedSessionsCount} buổi
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold text-[10px]">
                                      ⚡ Đơn giá cũ ({formatVND(option.rateOld)}) &lt; Đơn giá mới ({formatVND(option.rateNew)}) &rarr; Cấn trừ theo số tiền
                                    </span>
                                  )}

                                  <span className="font-mono font-bold text-emerald-400 text-[11px]">
                                    Giảm trừ: -{formatVND(option.deductedAmount)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* If option is by_sessions, let user choose mode */}
                      {selectedEditOption && selectedEditOption.redemptionType === 'by_sessions' && (
                        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                          <label className="text-xs font-bold text-slate-300">
                            Phương thức học viên tham gia lớp mới:
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setEditSessionMode('only_reserved_sessions')}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                editSessionMode === 'only_reserved_sessions'
                                  ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow-sm'
                                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-300'
                              }`}
                            >
                              <div className="font-bold flex items-center justify-between">
                                <span>Chỉ học đúng {selectedEditOption.reservedSessionsCount} buổi bảo lưu</span>
                                {editSessionMode === 'only_reserved_sessions' && (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Phụ huynh không phải đóng thêm tiền (0 đ).
                              </p>
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditSessionMode('full_next_course')}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                editSessionMode === 'full_next_course'
                                  ? 'bg-sky-950/40 border-sky-500/60 text-white shadow-sm'
                                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-300'
                              }`}
                            >
                              <div className="font-bold flex items-center justify-between">
                                <span>Học trọn khóa ({selectedEditOption.cls.total_sessions} buổi)</span>
                                {editSessionMode === 'full_next_course' && (
                                  <Check className="w-3.5 h-3.5 text-sky-400" />
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Trừ {selectedEditOption.reservedSessionsCount} buổi bảo lưu, chỉ đóng số buổi còn lại.
                              </p>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Financial Calculation Breakdown */}
                      {selectedEditOption && (
                        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 space-y-2 text-xs">
                          <div className="font-bold text-slate-200 flex items-center justify-between">
                            <span>Chi tiết công nợ điều chỉnh mới:</span>
                            <span className="font-mono text-slate-400">
                              Lớp: {selectedEditOption.cls.name}
                            </span>
                          </div>

                          <div className="space-y-1 text-[11px] pt-1">
                            <div className="flex justify-between text-slate-300">
                              <span>Học phí lớp mới ({editSessionMode === 'only_reserved_sessions' && selectedEditOption.redemptionType === 'by_sessions' ? selectedEditOption.reservedSessionsCount : selectedEditOption.cls.total_sessions} buổi):</span>
                              <span className="font-mono font-bold text-white">
                                {formatVND(
                                  editSessionMode === 'only_reserved_sessions' && selectedEditOption.redemptionType === 'by_sessions'
                                    ? selectedEditOption.reservedSessionsCount * selectedEditOption.rateNew
                                    : selectedEditOption.cls.full_course_fee
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between text-emerald-400 font-semibold">
                              <span>Khoản cấn trừ từ phiếu bảo lưu:</span>
                              <span className="font-mono font-bold">
                                -{formatVND(selectedEditOption.deductedAmount)}
                              </span>
                            </div>
                            <div className="flex justify-between text-white font-bold pt-1.5 border-t border-slate-800 text-xs">
                              <span>Công nợ phụ huynh cần nộp bổ sung:</span>
                              <span className="font-mono text-amber-300">
                                {formatVND(
                                  editSessionMode === 'only_reserved_sessions' && selectedEditOption.redemptionType === 'by_sessions'
                                    ? 0
                                    : Math.max(0, selectedEditOption.cls.full_course_fee - selectedEditOption.deductedAmount)
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Confirm Change Button */}
                      <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setEditingCredit(null)}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                        >
                          Đóng
                        </button>
                        {selectedEditOption && (
                          <button
                            type="button"
                            onClick={() => handleSaveEditedRedemption(selectedEditOption)}
                            className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-sky-500/20 cursor-pointer transition-all"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>Xác Nhận Lưu Thay Đổi Lớp Cấn Trừ</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACTION 2: REVERT REDEMPTION */}
                  {editActiveAction === 'revert' && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/40 space-y-3">
                        <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                          <AlertTriangle className="w-4 h-4" />
                          <span>Cảnh báo: Hành động hủy cấn trừ phiếu bảo lưu</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Khi xác nhận hủy cấn trừ, hệ thống sẽ thực hiện các thao tác hoàn nguyên (Rollback) tự động sau:
                        </p>
                        <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                          <li>
                            Đưa phiếu bảo lưu <strong className="text-amber-400 font-mono">{editingCredit.credit_code}</strong> quay về trạng thái <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold text-[10px]">Chưa sử dụng</span>.
                          </li>
                          <li>
                            Xóa bỏ khoản giảm trừ <strong className="text-white font-mono">-{formatVND(editingCredit.redeemed_info?.deducted_amount || 0)}</strong> trên hóa đơn lớp <strong className="text-white">{targetClass?.name}</strong>, khôi phục lại công nợ gốc ban đầu.
                          </li>
                          <li>
                            Hủy ghi danh học sinh tại lớp khóa sau nếu học sinh chưa đóng thêm khoản tiền nào khác.
                          </li>
                          <li>
                            Ghi nhận nhật ký kiểm toán (Audit Trail) để đối soát kế toán và học vụ.
                          </li>
                        </ul>
                      </div>

                      <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                        <span className="text-[11px] text-slate-400">
                          Thao tác này chỉ thực hiện được khi khóa học đích chưa bắt đầu.
                        </span>
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => setEditingCredit(null)}
                            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                          >
                            Hủy Bỏ
                          </button>
                          <button
                            type="button"
                            onClick={handleRevertRedemption}
                            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/20 cursor-pointer transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Xác Nhận Hủy Cấn Trừ &amp; Khôi Phục Phiếu</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
