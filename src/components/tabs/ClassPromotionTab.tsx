import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  Users,
  DollarSign,
  BookmarkCheck,
  Receipt,
  History,
  FileCode2,
  Search,
  Edit3,
  RotateCcw,
  ShieldAlert,
  Check,
  X,
  Clock,
  Info,
  Sparkles,
  Copy,
  Eye,
  UserCheck,
  UserMinus,
  Loader2,
} from 'lucide-react';
import {
  AppStore,
  AppUser,
  ExtracurricularClass,
  Student,
  Enrollment,
  TuitionInvoice,
  MakeupCredit,
  ClassPromotionHistoryRecord,
  ClassPromotionStudentItem,
  AuditLogRecord,
} from '../../types';
import {
  formatVND,
  formatDateVN,
  getEffectivePrice,
  getCampusPricingForClass,
  computeDiscountedFee,
  getCurrentTerm,
  getTodayStrHoChiMinh,
  normalizeCampusScope,
  createAuditRecord,
  getRoleLabelVN,
} from '../../lib/storage';
import {
  calculateActualSessions,
} from '../modals/EnrollmentModal';
import { supabase } from '../../supabaseClient';
import { showToast } from '../../lib/toast';
import { sortByLabelVi } from '../../utils/sortVi';
import {
  createOfflineInvoiceCodeAllocator,
  insertInvoicesToSupabaseWithRetry,
  isInvoiceCodeDuplicateError,
} from '../../lib/invoiceCode';

interface ClassPromotionTabProps {
  store: AppStore;
  currentUser: AppUser | null;
  selectedCampusId: string;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onNavigateTab?: (routeId: string) => void;
}

interface StudentDraftRow {
  student: Student;
  sourceEnrollment: Enrollment;
  alreadyInTarget: boolean;
  actionStatus: 'promote' | 'pending' | 'dropped' | 'already_enrolled';
  selectedDays: string[];
  startDate: string;
  isManualOverride: boolean;
  manualSessions: number;
  manualGrossAmount: number;
  manualOverrideReason: string;
  applyCreditNote: boolean;
  selectedCreditNoteId: string;
  prepaidDeducted: number;
}

const WEEKDAY_ORDER = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const WEEKDAY_LABELS: Record<string, string> = {
  T2: 'Thứ 2',
  T3: 'Thứ 3',
  T4: 'Thứ 4',
  T5: 'Thứ 5',
  T6: 'Thứ 6',
  T7: 'Thứ 7',
  CN: 'Chủ nhật',
};

function parseClassWeekdays(cls?: ExtracurricularClass | null): string[] {
  if (!cls) return ['T2', 'T4'];
  if (Array.isArray(cls.days_of_week) && cls.days_of_week.length > 0) {
    return [...cls.days_of_week].sort(
      (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b)
    );
  }
  const raw = String((cls as any).schedule_days || '').toUpperCase();
  const matched: string[] = [];
  for (const code of WEEKDAY_ORDER) {
    if (raw.includes(code)) matched.push(code);
  }
  return matched.length > 0 ? matched : ['T2', 'T4'];
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const ClassPromotionTab: React.FC<ClassPromotionTabProps> = ({
  store,
  currentUser,
  selectedCampusId,
  onUpdateStore,
  onNavigateTab,
}) => {
  // Phạm vi cơ sở của người dùng
  const userCampusScope = useMemo(() => {
    if (!currentUser) return 'all';
    if (currentUser.role === 'super_admin') return 'all';
    return normalizeCampusScope(currentUser.campus_id);
  }, [currentUser]);

  const [activeSubTab, setActiveSubTab] = useState<'wizard' | 'history'>('wizard');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Bộ lọc Bước 1 (Lớp nguồn)
  const [campusFilter, setCampusFilter] = useState<string>(() => {
    if (userCampusScope !== 'all') return userCampusScope;
    if (selectedCampusId && selectedCampusId !== 'all') return normalizeCampusScope(selectedCampusId);
    return 'camp_pmh';
  });
  const [sourceTermFilter, setSourceTermFilter] = useState<string>('all');
  const [sourceSubjectFilter, setSourceSubjectFilter] = useState<string>('all');
  const [sourceSearch, setSourceSearch] = useState<string>('');
  const [showAllActiveSourceClasses, setShowAllActiveSourceClasses] = useState<boolean>(false);
  const [sourceClassId, setSourceClassId] = useState<string>('');

  // Bộ lọc Bước 2 (Lớp đích)
  const [targetTermFilter, setTargetTermFilter] = useState<string>('all');
  const [targetSubjectFilter, setTargetSubjectFilter] = useState<string>('same_subject');
  const [targetSearch, setTargetSearch] = useState<string>('');
  const [targetClassId, setTargetClassId] = useState<string>('');

  // Bước 3: Danh sách cấu hình từng học sinh
  const [studentDrafts, setStudentDrafts] = useState<Record<string, StudentDraftRow>>({});

  // Bước 4 & Lịch sử
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [viewingHistory, setViewingHistory] = useState<ClassPromotionHistoryRecord | null>(null);
  const [showSqlModal, setShowSqlModal] = useState<boolean>(false);

  // Đồng bộ campusFilter khi user bị giới hạn cơ sở
  useEffect(() => {
    if (userCampusScope !== 'all' && campusFilter !== userCampusScope) {
      setCampusFilter(userCampusScope);
    }
  }, [userCampusScope, campusFilter]);

  // Tải lịch sử lên lớp từ Supabase (nếu bảng đã được tạo)
  useEffect(() => {
    let mounted = true;
    const fetchRemoteHistories = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('class_promotion_histories')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (!error && Array.isArray(data) && data.length > 0 && mounted) {
          onUpdateStore(prev => {
            const existingIds = new Set((prev.promotionHistories || []).map(h => h.id));
            const merged = [...(prev.promotionHistories || [])];
            for (const row of data) {
              if (!existingIds.has(row.id)) {
                merged.push({
                  id: row.id,
                  batch_code: row.batch_code,
                  campus_id: row.campus_id,
                  source_term_id: row.source_term_id,
                  source_class_id: row.source_class_id,
                  source_class_name: row.source_class_name,
                  target_term_id: row.target_term_id,
                  target_class_id: row.target_class_id,
                  target_class_name: row.target_class_name,
                  subject_id: row.subject_id,
                  promoted_count: Number(row.promoted_count) || 0,
                  dropped_count: Number(row.dropped_count) || 0,
                  skipped_count: Number(row.skipped_count) || 0,
                  total_gross_amount: Number(row.total_gross_amount) || 0,
                  total_discount_amount: Number(row.total_discount_amount) || 0,
                  total_credit_deducted: Number(row.total_credit_deducted) || 0,
                  total_prepaid_deducted: Number(row.total_prepaid_deducted) || 0,
                  total_net_payable: Number(row.total_net_payable) || 0,
                  items: Array.isArray(row.items) ? row.items : [],
                  created_by: row.created_by || 'system',
                  created_by_name: row.created_by_name || 'Hệ thống',
                  created_by_role: row.created_by_role || undefined,
                  created_at: row.created_at || new Date().toISOString(),
                });
              }
            }
            merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
            return {
              ...prev,
              promotionHistories: merged,
            };
          });
        }
      } catch {
        // Bảng có thể chưa chạy migration, vẫn dùng dữ liệu trong store bình thường
      }
    };
    fetchRemoteHistories();
    return () => {
      mounted = false;
    };
  }, [onUpdateStore]);

  const todayStr = useMemo(() => getTodayStrHoChiMinh(), []);
  const soonEndThresholdStr = useMemo(() => addDaysStr(todayStr, 21), [todayStr]);
  const currentTerm = useMemo(() => getCurrentTerm(store.terms), [store.terms]);

  // Kiểm tra 1 lớp có phải đã kết thúc hoặc sắp kết thúc hay không
  const checkClassEndedOrEndingSoon = (cls: ExtracurricularClass): {
    isEligibleByDateOrStatus: boolean;
    statusBadge: string;
    statusTone: 'ended' | 'ending_soon' | 'active';
    effectiveEndDate: string;
  } => {
    const term = store.terms.find(t => t.id === cls.term_id);
    const effectiveEndDate = cls.end_date || term?.end_date || '';

    if (cls.status === 'completed' || term?.status === 'closed' || (effectiveEndDate && effectiveEndDate < todayStr)) {
      return {
        isEligibleByDateOrStatus: true,
        statusBadge: 'Đã kết thúc',
        statusTone: 'ended',
        effectiveEndDate,
      };
    }

    if (effectiveEndDate && effectiveEndDate <= soonEndThresholdStr) {
      return {
        isEligibleByDateOrStatus: true,
        statusBadge: 'Sắp kết thúc',
        statusTone: 'ending_soon',
        effectiveEndDate,
      };
    }

    return {
      isEligibleByDateOrStatus: false,
      statusBadge: 'Đang diễn ra',
      statusTone: 'active',
      effectiveEndDate,
    };
  };

  // Danh sách lớp nguồn (Bước 1)
  const sourceClassesList = useMemo(() => {
    return store.classes
      .filter(cls => {
        if (campusFilter !== 'all' && normalizeCampusScope(cls.campus_id) !== campusFilter) {
          return false;
        }
        if (sourceTermFilter !== 'all' && cls.term_id !== sourceTermFilter) {
          return false;
        }
        if (sourceSubjectFilter !== 'all' && cls.subject_id !== sourceSubjectFilter) {
          return false;
        }
        if (sourceSearch.trim()) {
          const q = sourceSearch.trim().toLowerCase();
          const subj = store.subjects.find(s => s.id === cls.subject_id);
          const match =
            cls.name.toLowerCase().includes(q) ||
            (cls.code || '').toLowerCase().includes(q) ||
            (subj?.name || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        const check = checkClassEndedOrEndingSoon(cls);
        if (!showAllActiveSourceClasses && !check.isEligibleByDateOrStatus) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const termA = store.terms.find(t => t.id === a.term_id);
        const termB = store.terms.find(t => t.id === b.term_id);
        const endA = a.end_date || termA?.end_date || '';
        const endB = b.end_date || termB?.end_date || '';
        return endB.localeCompare(endA) || (a.code || '').localeCompare(b.code || '');
      });
  }, [
    store.classes,
    store.terms,
    store.subjects,
    campusFilter,
    sourceTermFilter,
    sourceSubjectFilter,
    sourceSearch,
    showAllActiveSourceClasses,
    todayStr,
    soonEndThresholdStr,
  ]);

  const selectedSourceClass = useMemo(
    () => store.classes.find(c => c.id === sourceClassId) || null,
    [store.classes, sourceClassId]
  );

  const selectedSourceTerm = useMemo(
    () => store.terms.find(t => t.id === selectedSourceClass?.term_id) || null,
    [store.terms, selectedSourceClass]
  );

  // Học sinh thuộc lớp nguồn (lấy cả active và completed nếu xem lại)
  const sourceEnrollments = useMemo(() => {
    if (!selectedSourceClass) return [];
    return store.enrollments.filter(
      e =>
        e.class_id === selectedSourceClass.id &&
        (e.status === 'active' || e.status === 'trial')
    );
  }, [store.enrollments, selectedSourceClass]);

  // Danh sách lớp đích (Bước 2)
  const targetClassesList = useMemo(() => {
    if (!selectedSourceClass) return [];
    return store.classes
      .filter(cls => {
        if (cls.id === selectedSourceClass.id) return false;
        if (normalizeCampusScope(cls.campus_id) !== normalizeCampusScope(selectedSourceClass.campus_id)) {
          return false;
        }
        if (cls.status === 'completed') return false;
        if (targetTermFilter !== 'all' && cls.term_id !== targetTermFilter) {
          return false;
        }
        if (targetSubjectFilter === 'same_subject') {
          if (cls.subject_id !== selectedSourceClass.subject_id) return false;
        } else if (targetSubjectFilter !== 'all') {
          if (cls.subject_id !== targetSubjectFilter) return false;
        }
        if (targetSearch.trim()) {
          const q = targetSearch.trim().toLowerCase();
          const subj = store.subjects.find(s => s.id === cls.subject_id);
          const match =
            cls.name.toLowerCase().includes(q) ||
            (cls.code || '').toLowerCase().includes(q) ||
            (subj?.name || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const sameSubjA = a.subject_id === selectedSourceClass.subject_id ? 0 : 1;
        const sameSubjB = b.subject_id === selectedSourceClass.subject_id ? 0 : 1;
        if (sameSubjA !== sameSubjB) return sameSubjA - sameSubjB;
        const termA = store.terms.find(t => t.id === a.term_id);
        const termB = store.terms.find(t => t.id === b.term_id);
        return (termB?.start_date || '').localeCompare(termA?.start_date || '');
      });
  }, [
    store.classes,
    store.terms,
    store.subjects,
    selectedSourceClass,
    targetTermFilter,
    targetSubjectFilter,
    targetSearch,
  ]);

  const selectedTargetClass = useMemo(
    () => store.classes.find(c => c.id === targetClassId) || null,
    [store.classes, targetClassId]
  );

  const selectedTargetTerm = useMemo(
    () => store.terms.find(t => t.id === selectedTargetClass?.term_id) || null,
    [store.terms, selectedTargetClass]
  );

  // Kiểm tra Biểu phí của lớp đích (Tái sử dụng getEffectivePrice và getCampusPricingForClass)
  const targetPricingInfo = useMemo(() => {
    if (!selectedTargetClass) {
      return {
        hasConfiguredPrice: false,
        courseFee: 0,
        sessionRate: 0,
        totalSessions: 16,
        standardSessions: 16,
        discountType: 'none' as const,
        discountValue: 0,
        discountReason: '',
        sourceLabel: '',
      };
    }

    const termId =
      selectedTargetClass.term_id ||
      (selectedTargetClass as any).primary_term_id ||
      '';
    const campusPricingRecord = getCampusPricingForClass(selectedTargetClass, store);
    const effective = getEffectivePrice(
      termId,
      selectedTargetClass.campus_id,
      selectedTargetClass.subject_id,
      store
    );
    const subjectInfo = (store.subjects || []).find(
      s =>
        String(s.id) === String(selectedTargetClass.subject_id) ||
        s.code === String(selectedTargetClass.subject_id)
    );

    // SỐ BUỔI QUY ĐỊNH CHUẨN CỦA MÔN HỌC (Biểu phí cơ sở -> Danh mục môn -> mặc định 16)
    // Tuyệt đối không dùng số buổi đếm từ lịch ngày của lớp (selectedTargetClass.total_sessions) làm số buổi chuẩn môn
    const standardSessions = Number(
      effective.total_sessions ||
        subjectInfo?.standard_sessions ||
        (subjectInfo as any)?.default_sessions ||
        (subjectInfo as any)?.sessions_count ||
        16
    );

    const fullCourseFee = Number(
      effective.course_fee ||
        effective.base_course_fee ||
        selectedTargetClass.full_course_fee ||
        0
    );

    const sessionRate = Number(
      effective.session_rate ||
        (standardSessions > 0 ? Math.round(fullCourseFee / standardSessions) : 0)
    );

    const hasExplicitOrValidPrice =
      Boolean(campusPricingRecord) ||
      (fullCourseFee > 0 && sessionRate > 0);

    return {
      hasConfiguredPrice: hasExplicitOrValidPrice && fullCourseFee > 0 && sessionRate > 0,
      courseFee: fullCourseFee,
      sessionRate,
      totalSessions: standardSessions,
      standardSessions,
      discountType: effective.discount_type || 'none',
      discountValue: effective.discount_value || 0,
      discountReason: effective.discount_reason || '',
      sourceLabel: effective.source,
    };
  }, [selectedTargetClass, store]);

  const targetClassWeekdays = useMemo(
    () => parseClassWeekdays(selectedTargetClass),
    [selectedTargetClass]
  );

  const targetClassStartDate = useMemo(() => {
    if (!selectedTargetClass) return todayStr;
    return selectedTargetClass.start_date || selectedTargetTerm?.start_date || todayStr;
  }, [selectedTargetClass, selectedTargetTerm, todayStr]);

  const targetClassEndDate = useMemo(() => {
    if (!selectedTargetClass) return todayStr;
    return selectedTargetClass.end_date || selectedTargetTerm?.end_date || addDaysStr(targetClassStartDate, 90);
  }, [selectedTargetClass, selectedTargetTerm, targetClassStartDate, todayStr]);

  // Khởi tạo danh sách học sinh ở Bước 3 khi chọn xong Lớp nguồn và Lớp đích
  useEffect(() => {
    if (!selectedSourceClass || !selectedTargetClass) return;

    const defaultDays = parseClassWeekdays(selectedTargetClass);
    const defaultStart =
      selectedTargetClass.start_date ||
      selectedTargetTerm?.start_date ||
      todayStr;

    const targetActiveStudentIds = new Set(
      store.enrollments
        .filter(
          e =>
            e.class_id === selectedTargetClass.id &&
            (e.status === 'active' || e.status === 'trial')
        )
        .map(e => e.student_id)
    );

    const nextDrafts: Record<string, StudentDraftRow> = {};

    for (const enr of sourceEnrollments) {
      const student = store.students.find(s => s.id === enr.student_id);
      if (!student) continue;

      const alreadyInTarget = targetActiveStudentIds.has(student.id);

      // Tìm phiếu bảo lưu khả dụng của học sinh
      const availableCredit = (store.makeupCredits || []).find(
        c =>
          c.student_id === student.id &&
          (c.status === 'available' || c.status === 'issued') &&
          (!c.expiry_date || c.expiry_date >= todayStr)
      );

      // Giữ các thứ học sinh từng chọn nếu khớp với lịch lớp mới, mặc định chọn toàn bộ thứ của lớp mới
      const prevDays = Array.isArray(enr.enrolled_days_of_week)
        ? enr.enrolled_days_of_week.filter(d => defaultDays.includes(d))
        : [];
      const initialSelectedDays =
        enr.is_partial_schedule && prevDays.length > 0 && prevDays.length < defaultDays.length
          ? prevDays
          : [...defaultDays];

      nextDrafts[student.id] = {
        student,
        sourceEnrollment: enr,
        alreadyInTarget,
        actionStatus: alreadyInTarget ? 'already_enrolled' : 'promote',
        selectedDays: initialSelectedDays,
        startDate: defaultStart,
        isManualOverride: false,
        manualSessions: targetPricingInfo.totalSessions,
        manualGrossAmount: targetPricingInfo.courseFee,
        manualOverrideReason: '',
        applyCreditNote: Boolean(availableCredit),
        selectedCreditNoteId: availableCredit?.id || '',
        prepaidDeducted: 0,
      };
    }

    setStudentDrafts(nextDrafts);
  }, [
    selectedSourceClass?.id,
    selectedTargetClass?.id,
    sourceEnrollments.length,
    targetPricingInfo.courseFee,
    targetPricingInfo.totalSessions,
  ]);

  // Tính toán chi tiết cho từng học sinh ở Bước 3 & Bước 4
  const computedRows = useMemo(() => {
    if (!selectedSourceClass || !selectedTargetClass) return [];

    const holidays = store.holidays || [];

    // Số buổi chuẩn trọn khóa thực tế theo lịch lớp đích (trừ lễ)
    const fullScheduleActualSessions = calculateActualSessions(
      targetClassStartDate,
      targetClassEndDate,
      targetClassWeekdays,
      holidays,
      selectedTargetClass.campus_id
    );

    return Object.values(studentDrafts).map((draft: StudentDraftRow) => {
      const { student, sourceEnrollment, alreadyInTarget, actionStatus } = draft;

      // 1. Đếm số buổi thực học theo thứ đã chọn & khoảng ngày (trừ ngày lễ active trong holidays)
      const calculatedSessions = calculateActualSessions(
        draft.startDate,
        targetClassEndDate,
        draft.selectedDays,
        holidays,
        selectedTargetClass.campus_id
      );

      // 2. So sánh số buổi thực học với số buổi quy định chuẩn của môn học (không so theo lịch ngày của lớp):
      // - Nếu actualSessions >= standardSubjectSessions: tính học phí trọn khóa (courseFee)
      // - Nếu actualSessions < standardSubjectSessions: tính theo đơn giá lẻ × số buổi thực học
      const standardSubjectSessions = targetPricingInfo.standardSessions;
      const sessionRate = targetPricingInfo.sessionRate;
      const courseFee = targetPricingInfo.courseFee;

      const validSessions = Math.max(0, Number(calculatedSessions || 0));
      const isFullCourseAttendance =
        validSessions > 0 && validSessions >= standardSubjectSessions;

      const calculatedGrossAmount =
        validSessions === 0
          ? 0
          : isFullCourseAttendance
          ? courseFee
          : Math.round(validSessions * sessionRate);

      const finalSessions = draft.isManualOverride
        ? Math.max(0, Number(draft.manualSessions) || 0)
        : validSessions;

      const finalGrossAmount = draft.isManualOverride
        ? Math.max(0, Number(draft.manualGrossAmount) || 0)
        : calculatedGrossAmount;

      const formulaLabel = draft.isManualOverride
        ? `Chỉnh tay: ${finalSessions} buổi = ${formatVND(finalGrossAmount)} (Mặc định: ${validSessions} buổi = ${formatVND(calculatedGrossAmount)})`
        : isFullCourseAttendance
        ? `Học đủ trọn khóa (${validSessions}/${standardSubjectSessions} buổi): ${formatVND(courseFee)}`
        : `Học thiếu buổi chuẩn (${validSessions}/${standardSubjectSessions} buổi) • ${validSessions} buổi × ${formatVND(sessionRate)}/buổi = ${formatVND(calculatedGrossAmount)}`;

      // 3. Khấu trừ 1: Ưu đãi biểu phí (nếu có cấu hình trong Biểu Phí Theo Cơ Sở)
      const discountCalc = computeDiscountedFee(
        finalGrossAmount,
        targetPricingInfo.discountType,
        targetPricingInfo.discountValue
      );
      const discountAmount = discountCalc.discountAmount;

      // 4. Khấu trừ 2: Phiếu bảo lưu / Học bù (credit_notes)
      const studentCredits = (store.makeupCredits || []).filter(
        c =>
          c.student_id === student.id &&
          (c.status === 'available' || c.status === 'issued') &&
          (!c.expiry_date || c.expiry_date >= todayStr)
      );
      const selectedCredit =
        studentCredits.find(c => c.id === draft.selectedCreditNoteId) ||
        studentCredits[0] ||
        null;

      let creditDeducted = 0;
      if (draft.applyCreditNote && selectedCredit) {
        const nSessions =
          selectedCredit.consecutive_absent_sessions ||
          selectedCredit.consecutive_absent_count ||
          3;
        const rateOld = selectedCredit.unit_price_old || selectedCredit.source_rate || 0;
        const creditTotal = selectedCredit.total_credit_amount || nSessions * rateOld;
        // Nếu đơn giá cũ >= đơn giá mới -> bảo lưu nguyên N buổi (N * sessionRate), ngược lại cấn trừ theo số tiền
        const rawCreditValue =
          rateOld >= sessionRate && sessionRate > 0 ? nSessions * sessionRate : creditTotal;
        creditDeducted = Math.min(
          Math.max(0, finalGrossAmount - discountAmount),
          rawCreditValue
        );
      }

      // 5. Khấu trừ 3: Trả trước / Số dư đã nộp trước
      const maxRemainingAfterCredit = Math.max(
        0,
        finalGrossAmount - discountAmount - creditDeducted
      );
      const prepaidDeducted = Math.min(
        maxRemainingAfterCredit,
        Math.max(0, Number(draft.prepaidDeducted) || 0)
      );

      // Số tiền còn phải đóng
      const netPayable = Math.max(
        0,
        finalGrossAmount - discountAmount - creditDeducted - prepaidDeducted
      );

      // 6. Kiểm tra nợ học phí từ khóa cũ
      const oldDebtInvoices = (store.invoices || []).filter(
        inv =>
          inv.student_id === student.id &&
          inv.outstanding_amount > 0 &&
          inv.payment_status !== 'paid'
      );
      const oldTermDebtAmount = oldDebtInvoices.reduce(
        (sum, inv) => sum + (Number(inv.outstanding_amount) || 0),
        0
      );

      // 7. Kiểm tra trùng lịch với các lớp active khác mà học sinh đang học
      const conflictingClasses = store.enrollments
        .filter(
          e =>
            e.student_id === student.id &&
            e.status === 'active' &&
            e.class_id !== selectedSourceClass.id &&
            e.class_id !== selectedTargetClass.id
        )
        .map(e => store.classes.find(c => c.id === e.class_id))
        .filter((otherCls): otherCls is ExtracurricularClass => {
          if (!otherCls || otherCls.status !== 'active') return false;
          // Cùng khóa đích hoặc khoảng ngày giao nhau
          const otherStart = otherCls.start_date || '0000-01-01';
          const otherEnd = otherCls.end_date || '9999-12-31';
          const datesOverlap =
            draft.startDate <= otherEnd && otherStart <= targetClassEndDate;
          if (!datesOverlap) return false;

          const otherDays = parseClassWeekdays(otherCls);
          const daysOverlap = draft.selectedDays.some(d => otherDays.includes(d));
          if (!daysOverlap) return false;

          // Kiểm tra trùng khung giờ
          const sameSlot =
            (otherCls.time_slot_id &&
              selectedTargetClass.time_slot_id &&
              otherCls.time_slot_id === selectedTargetClass.time_slot_id) ||
            (otherCls.time_slot &&
              selectedTargetClass.time_slot &&
              otherCls.time_slot === selectedTargetClass.time_slot);
          return Boolean(sameSlot);
        });

      return {
        draft,
        student,
        sourceEnrollment,
        alreadyInTarget,
        actionStatus,
        isFullCourseAttendance,
        fullScheduleActualSessions,
        calculatedSessions,
        sessionRate,
        calculatedGrossAmount,
        finalSessions,
        finalGrossAmount,
        formulaLabel,
        discountAmount,
        studentCredits,
        selectedCredit,
        creditDeducted,
        prepaidDeducted,
        netPayable,
        oldTermDebtAmount,
        conflictingClasses,
      };
    });
  }, [
    studentDrafts,
    selectedSourceClass,
    selectedTargetClass,
    targetClassWeekdays,
    targetClassStartDate,
    targetClassEndDate,
    targetPricingInfo,
    store.holidays,
    store.makeupCredits,
    store.invoices,
    store.enrollments,
    store.classes,
    todayStr,
  ]);

  // Đếm các ngày lễ thực tế nằm trong khoảng khóa mới để hiển thị minh bạch cho Giáo vụ
  const activeHolidaysInTargetRange = useMemo(() => {
    if (!selectedTargetClass) return [];
    const list = (store.holidays || []).filter(h => {
      if (h.status !== 'active') return false;
      const cScope = normalizeCampusScope(selectedTargetClass.campus_id);
      const hScope = !h.campus_id || h.campus_id === 'all' ? 'all' : normalizeCampusScope(h.campus_id);
      if (hScope !== 'all' && hScope !== cScope) return false;
      return h.start_date <= targetClassEndDate && h.end_date >= targetClassStartDate;
    });
    return list;
  }, [store.holidays, selectedTargetClass, targetClassStartDate, targetClassEndDate]);

  // Tổng hợp số liệu & cảnh báo cho Bước 3 và Bước 4
  const summaryStats = useMemo(() => {
    const promoteRows = computedRows.filter(r => r.actionStatus === 'promote');
    const droppedRows = computedRows.filter(r => r.actionStatus === 'dropped');
    const skippedRows = computedRows.filter(
      r => r.actionStatus === 'pending' || r.actionStatus === 'already_enrolled'
    );

    const totalGross = promoteRows.reduce((s, r) => s + r.finalGrossAmount, 0);
    const totalDiscount = promoteRows.reduce((s, r) => s + r.discountAmount, 0);
    const totalCredit = promoteRows.reduce((s, r) => s + r.creditDeducted, 0);
    const totalPrepaid = promoteRows.reduce((s, r) => s + r.prepaidDeducted, 0);
    const totalNetPayable = promoteRows.reduce((s, r) => s + r.netPayable, 0);

    const existingTargetActiveCount = selectedTargetClass
      ? store.enrollments.filter(
          e =>
            e.class_id === selectedTargetClass.id &&
            (e.status === 'active' || e.status === 'trial')
        ).length
      : 0;
    const maxStudents = selectedTargetClass?.max_students || 30;
    const projectedTotalStudents = existingTargetActiveCount + promoteRows.length;
    const isOverCapacity = projectedTotalStudents > maxStudents;

    const scheduleConflicts = promoteRows.filter(r => r.conflictingClasses.length > 0);
    const oldDebtStudents = promoteRows.filter(r => r.oldTermDebtAmount > 0);
    const reserveNoteStudents = promoteRows.filter(r => r.studentCredits.length > 0);
    const manualOverrideStudents = promoteRows.filter(r => r.draft.isManualOverride);
    const missingOverrideReasonStudents = manualOverrideStudents.filter(
      r => !r.draft.manualOverrideReason.trim()
    );
    const zeroSessionStudents = promoteRows.filter(
      r => r.draft.selectedDays.length === 0 || r.finalSessions <= 0
    );

    return {
      promoteRows,
      droppedRows,
      skippedRows,
      totalGross,
      totalDiscount,
      totalCredit,
      totalPrepaid,
      totalNetPayable,
      existingTargetActiveCount,
      maxStudents,
      projectedTotalStudents,
      isOverCapacity,
      scheduleConflicts,
      oldDebtStudents,
      reserveNoteStudents,
      manualOverrideStudents,
      missingOverrideReasonStudents,
      zeroSessionStudents,
    };
  }, [computedRows, selectedTargetClass, store.enrollments]);

  // Hàm cập nhật từng dòng học sinh ở Bước 3
  const updateStudentDraft = (
    studentId: string,
    patch: Partial<StudentDraftRow>
  ) => {
    setStudentDrafts(prev => {
      const existing = prev[studentId];
      if (!existing) return prev;
      return {
        ...prev,
        [studentId]: {
          ...existing,
          ...patch,
        },
      };
    });
  };

  const toggleStudentWeekday = (studentId: string, dayCode: string) => {
    setStudentDrafts(prev => {
      const existing = prev[studentId];
      if (!existing) return prev;
      const hasDay = existing.selectedDays.includes(dayCode);
      const nextDays = hasDay
        ? existing.selectedDays.filter(d => d !== dayCode)
        : [...existing.selectedDays, dayCode].sort(
            (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b)
          );
      return {
        ...prev,
        [studentId]: {
          ...existing,
          selectedDays: nextDays,
        },
      };
    });
  };

  // Kiểm tra điều kiện chuyển sang Bước 4
  const handleProceedToStep4 = () => {
    if (
      summaryStats.promoteRows.length === 0 &&
      summaryStats.droppedRows.length === 0
    ) {
      showToast(
        'Vui lòng chọn ít nhất 1 học sinh để Lên lớp hoặc đánh dấu Nghỉ hẳn.',
        'warning',
        { title: 'Chưa chọn học sinh xử lý' }
      );
      return;
    }

    if (summaryStats.zeroSessionStudents.length > 0) {
      const names = summaryStats.zeroSessionStudents
        .map(r => r.student.name)
        .join(', ');
      showToast(
        `Học sinh (${names}) chưa chọn thứ học hoặc số buổi thực học bằng 0. Vui lòng kiểm tra lại!`,
        'error',
        { title: 'Số buổi học không hợp lệ' }
      );
      return;
    }

    if (summaryStats.missingOverrideReasonStudents.length > 0) {
      const names = summaryStats.missingOverrideReasonStudents
        .map(r => r.student.name)
        .join(', ');
      showToast(
        `Bắt buộc nhập lý do chỉnh tay học phí/số buổi cho học sinh: ${names}`,
        'error',
        { title: 'Thiếu lý do chỉnh tay bắt buộc' }
      );
      return;
    }

    setStep(4);
  };

  // Xử lý XÁC NHẬN LÊN LỚP (Atomic Execution + Rollback nếu lỗi)
  const handleConfirmPromotion = async () => {
    if (!selectedSourceClass || !selectedTargetClass) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    const snapshotStore = store;
    const nowIso = new Date().toISOString();
    const todayDate = getTodayStrHoChiMinh();
    const sourceEndDate = selectedSourceClass.end_date || selectedSourceTerm?.end_date || '';
    const isSourceClassEnded = Boolean(sourceEndDate && todayDate > sourceEndDate);
    const batchId = `prom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const batchCode = `LENLOP-${todayDate.replace(/-/g, '')}-${String(
      (store.promotionHistories?.length || 0) + 1
    ).padStart(3, '0')}`;

    try {
      const newEnrollments: Enrollment[] = [];
      const newInvoices: TuitionInvoice[] = [];
      const updatedOldEnrollmentMap = new Map<string, 'completed' | 'dropped'>();
      const updatedCreditsMap = new Map<
        string,
        {
          id: string;
          applied_to_class_id: string;
          applied_to_term_id: string;
          redemption_type: 'by_sessions' | 'by_amount';
          deducted_amount: number;
          remaining_balance_due: number;
          applied_date: string;
        }
      >();
      const historyItems: ClassPromotionStudentItem[] = [];
      const auditLogsToCreate: AuditLogRecord[] = [];

      const allocateOfflineInvoiceCode = createOfflineInvoiceCodeAllocator(store.invoices);

      for (const row of computedRows) {
        const {
          draft,
          student,
          sourceEnrollment,
          actionStatus,
          calculatedSessions,
          sessionRate,
          calculatedGrossAmount,
          finalSessions,
          finalGrossAmount,
          formulaLabel,
          discountAmount,
          selectedCredit,
          creditDeducted,
          prepaidDeducted,
          netPayable,
          oldTermDebtAmount,
        } = row;

        if (actionStatus === 'promote') {
          const newEnrollmentId = `enr_prom_${Date.now()}_${student.id}_${Math.random()
            .toString(36)
            .substring(2, 6)}`;
          const isPartial =
            draft.selectedDays.length < targetClassWeekdays.length;

          const newEnrollment: Enrollment = {
            id: newEnrollmentId,
            student_id: student.id,
            class_id: selectedTargetClass.id,
            registered_sessions: finalSessions,
            joined_date: draft.startDate,
            enrolled_days_of_week: draft.selectedDays,
            is_partial_schedule: isPartial,
            is_trial: false,
            enrollment_type: 'official',
            status: 'active',
            promoted_from_enrollment_id: sourceEnrollment.id,
            promoted_from_class_id: selectedSourceClass.id,
            promotion_batch_id: batchId,
          };
          newEnrollments.push(newEnrollment);

          // Chỉ đánh dấu enrollment ở lớp cũ thành 'completed' khi lớp cũ đã thực sự quá ngày kết thúc (end_date < today)
          if (isSourceClassEnded) {
            updatedOldEnrollmentMap.set(sourceEnrollment.id, 'completed');
          }

          // Tạo hóa đơn học phí mới liên kết với màn Thu Học Phí & Mã Chuyển Khoản
          // Khi có Supabase: để DB tự sinh invoice_code bằng DEFAULT next_invoice_code()
          const invoiceId = `inv_prom_${Date.now()}_${student.id}_${Math.random()
            .toString(36)
            .substring(2, 6)}`;
          const invoiceCode = supabase ? '' : allocateOfflineInvoiceCode();
          const cleanStudentCode = (student.code || student.id).replace(
            /[^a-zA-Z0-9]/g,
            ''
          );
          const cleanClassCode = (selectedTargetClass.code || selectedTargetClass.id).replace(
            /[^a-zA-Z0-9]/g,
            ''
          );
          const paymentRef = `RS ${cleanStudentCode} ${cleanClassCode}`;
          const dueDate = addDaysStr(draft.startDate, 7);

          const newInvoice: TuitionInvoice = {
            id: invoiceId,
            invoice_code: invoiceCode,
            student_id: student.id,
            class_id: selectedTargetClass.id,
            registered_sessions: finalSessions,
            total_class_sessions:
              targetPricingInfo.totalSessions ||
              selectedTargetClass.total_sessions ||
              24,
            session_rate: sessionRate,
            gross_amount: finalGrossAmount,
            credit_deducted: creditDeducted,
            discount_amount: discountAmount,
            prepaid_deducted: prepaidDeducted,
            net_payable: netPayable,
            paid_amount: netPayable === 0 ? finalGrossAmount : 0,
            outstanding_amount: netPayable,
            payment_status: netPayable === 0 ? 'paid' : 'unpaid',
            due_date: dueDate,
            payment_reference: paymentRef,
            is_manual_override: draft.isManualOverride,
            manual_override_reason: draft.isManualOverride
              ? draft.manualOverrideReason.trim()
              : undefined,
            promotion_batch_id: batchId,
            created_at: todayDate,
          };
          newInvoices.push(newInvoice);

          // Nếu có áp dụng phiếu bảo lưu -> cập nhật phiếu sang 'applied'
          if (draft.applyCreditNote && selectedCredit && creditDeducted > 0) {
            const rateOld =
              selectedCredit.unit_price_old || selectedCredit.source_rate || 0;
            updatedCreditsMap.set(selectedCredit.id, {
              id: selectedCredit.id,
              applied_to_class_id: selectedTargetClass.id,
              applied_to_term_id: selectedTargetClass.term_id,
              redemption_type:
                rateOld >= sessionRate ? 'by_sessions' : 'by_amount',
              deducted_amount: creditDeducted,
              remaining_balance_due: netPayable,
              applied_date: todayDate,
            });
          }

          // Nếu có chỉnh tay học phí / số buổi -> ghi log kiểm toán riêng có lý do bắt buộc
          if (draft.isManualOverride) {
            auditLogsToCreate.push(
              createAuditRecord(
                'TUITION_MANUAL_OVERRIDE',
                'FINANCE',
                `Hóa đơn ${invoiceCode || invoiceId} - HS ${student.name} (${student.code})`,
                `Chỉnh tay học phí khi lên lớp ${selectedTargetClass.code}: ${finalSessions} buổi / ${formatVND(
                  finalGrossAmount
                )}. Lý do: ${draft.manualOverrideReason.trim()}`,
                currentUser,
                {
                  target_id: invoiceId,
                  details: {
                    before: {
                      calculated_sessions: calculatedSessions,
                      calculated_gross_amount: calculatedGrossAmount,
                    },
                    after: {
                      final_sessions: finalSessions,
                      final_gross_amount: finalGrossAmount,
                      manual_override_reason: draft.manualOverrideReason.trim(),
                    },
                  },
                }
              )
            );
          }

          historyItems.push({
            student_id: student.id,
            student_code: student.code,
            student_name: student.name,
            source_enrollment_id: sourceEnrollment.id,
            new_enrollment_id: newEnrollmentId,
            invoice_id: invoiceId,
            invoice_code: invoiceCode,
            action_status: 'promoted',
            selected_days: draft.selectedDays,
            is_partial_schedule: isPartial,
            start_date: draft.startDate,
            end_date: targetClassEndDate,
            calculated_sessions: calculatedSessions,
            final_sessions: finalSessions,
            session_rate: sessionRate,
            is_full_course_fee: row.isFullCourseAttendance,
            calculated_gross_amount: calculatedGrossAmount,
            final_gross_amount: finalGrossAmount,
            discount_amount: discountAmount,
            credit_deducted: creditDeducted,
            applied_credit_note_id:
              draft.applyCreditNote && selectedCredit && creditDeducted > 0
                ? selectedCredit.id
                : undefined,
            prepaid_deducted: prepaidDeducted,
            net_payable: netPayable,
            is_manual_override: draft.isManualOverride,
            manual_override_reason: draft.isManualOverride
              ? draft.manualOverrideReason.trim()
              : undefined,
            old_term_debt_amount: oldTermDebtAmount,
            has_active_reserve: row.studentCredits.length > 0,
            formula_label: formulaLabel,
          });
        } else if (actionStatus === 'dropped') {
          updatedOldEnrollmentMap.set(sourceEnrollment.id, 'dropped');
          historyItems.push({
            student_id: student.id,
            student_code: student.code,
            student_name: student.name,
            source_enrollment_id: sourceEnrollment.id,
            action_status: 'dropped',
            selected_days: [],
            is_partial_schedule: false,
            start_date: draft.startDate,
            end_date: targetClassEndDate,
            calculated_sessions: 0,
            final_sessions: 0,
            session_rate: sessionRate,
            is_full_course_fee: false,
            calculated_gross_amount: 0,
            final_gross_amount: 0,
            discount_amount: 0,
            credit_deducted: 0,
            prepaid_deducted: 0,
            net_payable: 0,
            is_manual_override: false,
            old_term_debt_amount: oldTermDebtAmount,
            has_active_reserve: row.studentCredits.length > 0,
            formula_label: 'Nghỉ hẳn sau khi kết thúc khóa cũ',
          });
        } else {
          historyItems.push({
            student_id: student.id,
            student_code: student.code,
            student_name: student.name,
            source_enrollment_id: sourceEnrollment.id,
            action_status:
              actionStatus === 'already_enrolled'
                ? 'skipped_already_enrolled'
                : 'pending',
            selected_days: draft.selectedDays,
            is_partial_schedule: false,
            start_date: draft.startDate,
            end_date: targetClassEndDate,
            calculated_sessions: calculatedSessions,
            final_sessions: 0,
            session_rate: sessionRate,
            is_full_course_fee: false,
            calculated_gross_amount: 0,
            final_gross_amount: 0,
            discount_amount: 0,
            credit_deducted: 0,
            prepaid_deducted: 0,
            net_payable: 0,
            is_manual_override: false,
            old_term_debt_amount: oldTermDebtAmount,
            has_active_reserve: row.studentCredits.length > 0,
            formula_label:
              actionStatus === 'already_enrolled'
                ? 'Đã có tên trong lớp đích (Bỏ qua)'
                : 'Chưa lên lớp (Tạm hoãn)',
          });
        }
      }

      const historyRecord: ClassPromotionHistoryRecord = {
        id: batchId,
        batch_code: batchCode,
        campus_id: selectedTargetClass.campus_id,
        source_term_id: selectedSourceClass.term_id,
        source_class_id: selectedSourceClass.id,
        source_class_name: `${selectedSourceClass.code} - ${selectedSourceClass.name}`,
        target_term_id: selectedTargetClass.term_id,
        target_class_id: selectedTargetClass.id,
        target_class_name: `${selectedTargetClass.code} - ${selectedTargetClass.name}`,
        subject_id: selectedTargetClass.subject_id,
        promoted_count: summaryStats.promoteRows.length,
        dropped_count: summaryStats.droppedRows.length,
        skipped_count: summaryStats.skippedRows.length,
        total_gross_amount: summaryStats.totalGross,
        total_discount_amount: summaryStats.totalDiscount,
        total_credit_deducted: summaryStats.totalCredit,
        total_prepaid_deducted: summaryStats.totalPrepaid,
        total_net_payable: summaryStats.totalNetPayable,
        items: historyItems,
        created_by: currentUser?.username || currentUser?.id || 'system',
        created_by_name: currentUser?.full_name || 'Hệ thống Royal School',
        created_by_role: currentUser
          ? getRoleLabelVN(currentUser.role, currentUser)
          : 'Hệ thống',
        created_at: nowIso,
      };

      const mainAuditLog = createAuditRecord(
        'CLASS_PROMOTION',
        'ACADEMIC',
        `${selectedSourceClass.code} -> ${selectedTargetClass.code}`,
        `Thực hiện Lên Lớp (${batchCode}) từ lớp ${selectedSourceClass.code} sang ${selectedTargetClass.code}: ${summaryStats.promoteRows.length} HS lên lớp, ${summaryStats.droppedRows.length} HS nghỉ hẳn. Tổng phải thu: ${formatVND(
          summaryStats.totalNetPayable
        )}.`,
        currentUser,
        {
          target_id: batchId,
          details: {
            batch_code: batchCode,
            source_class_id: selectedSourceClass.id,
            target_class_id: selectedTargetClass.id,
            promoted_count: summaryStats.promoteRows.length,
            dropped_count: summaryStats.droppedRows.length,
            total_net_payable: summaryStats.totalNetPayable,
          },
        }
      );

      const allAuditLogs = [mainAuditLog, ...auditLogsToCreate];

      const applyDbInvoiceCodes = (codeById: Map<string, string>) => {
        if (codeById.size === 0) return;
        for (const inv of newInvoices) {
          const dbCode = codeById.get(inv.id);
          if (dbCode) {
            inv.invoice_code = dbCode;
          }
        }
        for (const item of historyRecord.items) {
          if (item.invoice_id) {
            const dbCode = codeById.get(item.invoice_id);
            if (dbCode) {
              item.invoice_code = dbCode;
            }
          }
        }
        for (const log of allAuditLogs) {
          if (log.target_id) {
            const dbCode = codeById.get(log.target_id);
            if (dbCode && log.target_entity) {
              log.target_entity = log.target_entity.replace(
                `Hóa đơn ${log.target_id}`,
                `Hóa đơn ${dbCode}`
              );
            }
          }
        }
      };

      // 1. Thực thi đồng bộ nguyên tử lên Supabase (nếu có kết nối)
      if (supabase) {
        const rpcPayload = {
          history: historyRecord,
          new_enrollments: newEnrollments.map(e => ({
            ...e,
            promoted_from_class_id: selectedSourceClass.id,
          })),
          updated_old_enrollments: Array.from(
            updatedOldEnrollmentMap.entries()
          ).map(([id, status]) => ({ id, status })),
          // KHÔNG gửi invoice_code để Postgres DEFAULT next_invoice_code() tự cấp phát
          new_invoices: newInvoices.map(({ invoice_code: _omit, ...invRest }) => invRest),
          updated_credits: Array.from(updatedCreditsMap.values()),
          audit_logs: allAuditLogs,
        };

        let rpcData: any = null;
        let rpcError: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          const res = await supabase.rpc('promote_students_to_new_class', {
            p_payload: rpcPayload,
          });
          rpcData = res.data;
          rpcError = res.error;
          if (!rpcError) break;
          if (!isInvoiceCodeDuplicateError(rpcError) || attempt >= 3) break;
        }

        if (!rpcError) {
          const codeById = new Map<string, string>();
          if (Array.isArray(rpcData?.created_invoices)) {
            for (const row of rpcData.created_invoices) {
              if (row?.id && row?.invoice_code) {
                codeById.set(String(row.id), String(row.invoice_code));
              }
            }
          }
          if (newInvoices.length > 0 && codeById.size < newInvoices.length) {
            const { data: fetchedInvs } = await supabase
              .from('tuition_invoices')
              .select('id, invoice_code')
              .in('id', newInvoices.map(i => i.id));
            if (Array.isArray(fetchedInvs)) {
              for (const row of fetchedInvs) {
                if (row?.id && row?.invoice_code) {
                  codeById.set(String(row.id), String(row.invoice_code));
                }
              }
            }
          }
          applyDbInvoiceCodes(codeById);
        }

        // Nếu DB chưa chạy migration tạo hàm RPC, thực hiện tuần tự kèm cơ chế Rollback nguyên tử
        if (rpcError) {
          if (isInvoiceCodeDuplicateError(rpcError)) {
            throw new Error(
              `Lỗi tạo hóa đơn học phí khóa mới trên CSDL: ${rpcError.message}`
            );
          }

          const insertedEnrollmentIds: string[] = [];
          const insertedInvoiceIds: string[] = [];
          const previousOldEnrollments = store.enrollments.filter(e =>
            updatedOldEnrollmentMap.has(e.id)
          );
          const previousCredits = store.makeupCredits.filter(c =>
            updatedCreditsMap.has(c.id)
          );

          try {
            // Bước A: Insert enrollments mới
            if (newEnrollments.length > 0) {
              const cleanEnrRows = newEnrollments.map(e => ({
                id: e.id,
                student_id: e.student_id,
                class_id: e.class_id,
                registered_sessions: e.registered_sessions,
                joined_date: e.joined_date,
                enrolled_days_of_week: e.enrolled_days_of_week || [],
                is_partial_schedule: Boolean(e.is_partial_schedule),
                is_trial: false,
                enrollment_type: 'official',
                status: 'active',
              }));
              const { error: enrErr } = await supabase
                .from('enrollments')
                .upsert(cleanEnrRows, { onConflict: 'student_id,class_id' });
              if (enrErr) {
                throw new Error(
                  `Lỗi tạo ghi danh lớp mới trên CSDL: ${enrErr.message}`
                );
              }
              insertedEnrollmentIds.push(...newEnrollments.map(e => e.id));
            }

            // Bước B: Insert hóa đơn học phí mới (KHÔNG gửi invoice_code, nhận từ DB, retry tối đa 3 lần nếu trùng)
            if (newInvoices.length > 0) {
              const cleanInvRows = newInvoices.map(inv => ({
                id: inv.id,
                student_id: inv.student_id,
                class_id: inv.class_id,
                registered_sessions: inv.registered_sessions,
                total_class_sessions: inv.total_class_sessions,
                session_rate: inv.session_rate,
                gross_amount: inv.gross_amount,
                credit_deducted: inv.credit_deducted,
                discount_amount: inv.discount_amount,
                net_payable: inv.net_payable,
                paid_amount: inv.paid_amount,
                outstanding_amount: inv.outstanding_amount,
                payment_status: inv.payment_status,
                due_date: inv.due_date || null,
                payment_reference: inv.payment_reference || null,
                created_at: inv.created_at,
              }));
              try {
                const { codeById } = await insertInvoicesToSupabaseWithRetry(
                  supabase,
                  cleanInvRows,
                  { maxRetries: 3 }
                );
                insertedInvoiceIds.push(...newInvoices.map(i => i.id));
                applyDbInvoiceCodes(codeById);
              } catch (invErr: any) {
                throw new Error(
                  `Lỗi tạo hóa đơn học phí khóa mới trên CSDL: ${invErr?.message || String(invErr)}`
                );
              }
            }

            // Bước C: Cập nhật trạng thái enrollments ở lớp cũ
            for (const [oldId, nextStatus] of updatedOldEnrollmentMap.entries()) {
              const { error: oldUpdErr } = await supabase
                .from('enrollments')
                .update({ status: nextStatus })
                .eq('id', oldId);
              if (oldUpdErr) {
                throw new Error(
                  `Lỗi cập nhật trạng thái lớp cũ trên CSDL: ${oldUpdErr.message}`
                );
              }
            }

            // Bước D: Cập nhật phiếu bảo lưu
            for (const credUpd of updatedCreditsMap.values()) {
              const { error: credErr } = await supabase
                .from('credit_notes')
                .update({
                  status: 'applied',
                  applied_to_class_id: credUpd.applied_to_class_id,
                  applied_to_term_id: credUpd.applied_to_term_id,
                  redemption_type: credUpd.redemption_type,
                  deducted_amount: credUpd.deducted_amount,
                  remaining_balance_due: credUpd.remaining_balance_due,
                  applied_date: credUpd.applied_date,
                })
                .eq('id', credUpd.id);
              if (credErr) {
                throw new Error(
                  `Lỗi cập nhật phiếu bảo lưu trên CSDL: ${credErr.message}`
                );
              }
            }

            // Bước E: Lưu lịch sử lên lớp (nếu bảng đã được tạo)
            await supabase.from('class_promotion_histories').insert(historyRecord);
          } catch (fallbackErr: any) {
            // ROLLBACK TOÀN BỘ TRÊN SUPABASE ĐỂ KHÔNG BỊ DỮ LIỆU DỞ DANG
            if (insertedInvoiceIds.length > 0) {
              await supabase
                .from('tuition_invoices')
                .delete()
                .in('id', insertedInvoiceIds);
            }
            if (insertedEnrollmentIds.length > 0) {
              await supabase
                .from('enrollments')
                .delete()
                .in('id', insertedEnrollmentIds);
            }
            for (const prevEnr of previousOldEnrollments) {
              await supabase
                .from('enrollments')
                .update({ status: prevEnr.status })
                .eq('id', prevEnr.id);
            }
            for (const prevCred of previousCredits) {
              await supabase
                .from('credit_notes')
                .update({
                  status: prevCred.status,
                  applied_to_class_id: prevCred.applied_class_id || null,
                })
                .eq('id', prevCred.id);
            }
            throw fallbackErr;
          }
        }
      }

      // 2. Cập nhật nguyên tử vào AppStore cục bộ
      onUpdateStore(prev => {
        const updatedEnrollments = prev.enrollments.map(e => {
          const nextStatus = updatedOldEnrollmentMap.get(e.id);
          if (nextStatus) {
            return { ...e, status: nextStatus };
          }
          return e;
        });

        // Kiểm tra nếu toàn bộ học sinh lớp cũ đã được xử lý thì cập nhật trạng thái lớp cũ sang 'completed'
        const remainingActiveInSource = updatedEnrollments.filter(
          e =>
            e.class_id === selectedSourceClass.id &&
            (e.status === 'active' || e.status === 'trial')
        ).length;

        const updatedClasses = prev.classes.map(cls => {
          if (cls.id === selectedSourceClass.id && remainingActiveInSource === 0 && isSourceClassEnded) {
            return { ...cls, status: 'completed' as const };
          }
          if (cls.id === selectedTargetClass.id) {
            const newActiveCount =
              updatedEnrollments.filter(
                e =>
                  e.class_id === selectedTargetClass.id &&
                  (e.status === 'active' || e.status === 'trial')
              ).length + newEnrollments.length;
            return {
              ...cls,
              current_students: newActiveCount,
              enrolled_count: newActiveCount,
            };
          }
          return cls;
        });

        const updatedCredits = (prev.makeupCredits || []).map(c => {
          const credUpd = updatedCreditsMap.get(c.id);
          if (!credUpd) return c;
          return {
            ...c,
            status: 'applied' as const,
            applied_class_id: credUpd.applied_to_class_id,
            applied_at: credUpd.applied_date,
          };
        });

        const nextPromotionHistories = [
          historyRecord,
          ...(prev.promotionHistories || []),
        ];

        const nextAuditLogs = [
          ...allAuditLogs,
          ...(prev.auditLogs || []),
        ].slice(0, 1000);

        return {
          ...prev,
          classes: updatedClasses,
          enrollments: [...updatedEnrollments, ...newEnrollments],
          invoices: [...newInvoices, ...(prev.invoices || [])],
          makeupCredits: updatedCredits,
          promotionHistories: nextPromotionHistories,
          auditLogs: nextAuditLogs,
        };
      });

      showToast(
        `Đã lên lớp thành công ${summaryStats.promoteRows.length} học sinh sang lớp ${selectedTargetClass.code} và tạo ${newInvoices.length} hóa đơn học phí!`,
        'success',
        { title: `Hoàn tất Lên Lớp (${batchCode})` }
      );

      setViewingHistory(historyRecord);
      setActiveSubTab('history');
      setStep(1);
      setSourceClassId('');
      setTargetClassId('');
    } catch (err: any) {
      // Rollback AppStore về trạng thái ban đầu nếu có bất kỳ lỗi nào
      onUpdateStore(() => snapshotStore);
      showToast(
        err?.message ||
          'Đã xảy ra lỗi trong quá trình lên lớp. Hệ thống đã hoàn tác (rollback) toàn bộ dữ liệu để tránh dở dang.',
        'error',
        { title: 'Lỗi thực thi — Đã Rollback an toàn' }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Lọc lịch sử lên lớp theo phạm vi cơ sở của người dùng
  const visibleHistories = useMemo(() => {
    const list = store.promotionHistories || [];
    return list.filter(h => {
      if (userCampusScope !== 'all') {
        return normalizeCampusScope(h.campus_id) === userCampusScope;
      }
      return true;
    });
  }, [store.promotionHistories, userCampusScope]);

  return (
    <div className="space-y-4">
      {/* Header Banner & Sub-navigation */}
      <div className="rounded-3xl bg-[#111827]/90 border border-slate-800/90 p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <ArrowUpRight className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Lên Lớp & Chuyển Khóa Học Sinh
                </h2>
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[11px] font-bold">
                  Tính học phí theo số buổi thực học
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Chuyển học sinh từ lớp đã kết thúc sang khóa mới và tính học phí theo số buổi thực học (tự động trừ ngày nghỉ lễ và cấn trừ bảo lưu).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-2xl bg-slate-900/90 border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveSubTab('wizard')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all ${
                  activeSubTab === 'wizard'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Quy Trình Lên Lớp (4 Bước)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('history')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all ${
                  activeSubTab === 'history'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Lịch Sử Lên Lớp ({visibleHistories.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowSqlModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700 text-xs font-bold transition-all"
              title="Xem câu lệnh SQL Migration & RLS cho Supabase"
            >
              <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">SQL Migration & RLS</span>
            </button>
          </div>
        </div>

        {/* Stepper 4 bước khi ở tab Wizard */}
        {activeSubTab === 'wizard' && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-slate-800/80">
            {[
              {
                num: 1,
                title: 'Bước 1: Chọn Lớp Nguồn',
                sub: selectedSourceClass
                  ? `${selectedSourceClass.code} (${sourceEnrollments.length} HS)`
                  : 'Lớp đã / sắp kết thúc',
              },
              {
                num: 2,
                title: 'Bước 2: Chọn Lớp Đích',
                sub: selectedTargetClass
                  ? `${selectedTargetClass.code} (${formatVND(targetPricingInfo.courseFee)})`
                  : 'Lớp ở khóa mới & Biểu phí',
              },
              {
                num: 3,
                title: 'Bước 3: Học Sinh & Học Phí',
                sub:
                  step >= 3
                    ? `Lên lớp: ${summaryStats.promoteRows.length} HS • Nghỉ: ${summaryStats.droppedRows.length}`
                    : 'Chọn thứ học, tính buổi & khấu trừ',
              },
              {
                num: 4,
                title: 'Bước 4: Xem Lại & Xác Nhận',
                sub:
                  step === 4
                    ? `Thực thu: ${formatVND(summaryStats.totalNetPayable)}`
                    : 'Tạo ghi danh & hóa đơn nguyên tử',
              },
            ].map(item => {
              const isCurrent = step === item.num;
              const isDone = step > item.num;
              return (
                <button
                  key={item.num}
                  type="button"
                  disabled={
                    (item.num === 2 && !selectedSourceClass) ||
                    (item.num === 3 &&
                      (!selectedTargetClass || !targetPricingInfo.hasConfiguredPrice)) ||
                    (item.num === 4 &&
                      (!selectedTargetClass ||
                        !targetPricingInfo.hasConfiguredPrice ||
                        step < 3))
                  }
                  onClick={() => {
                    if (item.num === 4) {
                      handleProceedToStep4();
                    } else {
                      setStep(item.num as 1 | 2 | 3 | 4);
                    }
                  }}
                  className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                    isCurrent
                      ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-md'
                      : isDone
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-slate-200 hover:border-emerald-500/50'
                      : 'bg-slate-900/60 border-slate-800/80 text-slate-400 disabled:opacity-50'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-extrabold shrink-0 ${
                      isCurrent
                        ? 'bg-amber-500 text-slate-950'
                        : isDone
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : item.num}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold truncate">{item.title}</div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {item.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* TAB 1: WIZARD 4 BƯỚC */}
      {activeSubTab === 'wizard' && (
        <>
          {/* ================= BƯỚC 1: CHỌN CƠ SỞ & LỚP NGUỒN ================= */}
          {step === 1 && (
            <div className="rounded-3xl bg-[#111827]/90 border border-slate-800 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center">
                      1
                    </span>
                    <span>Chọn Cơ Sở & Lớp Nguồn (Lớp Cũ Đã / Sắp Kết Thúc)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Hệ thống tự động lọc các lớp đã hoàn thành hoặc sắp kết thúc khóa. Bạn có thể lọc theo khóa học và môn học.
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    checked={showAllActiveSourceClasses}
                    onChange={e => setShowAllActiveSourceClasses(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Hiển thị cả lớp đang học khác (chuẩn bị lên lớp sớm)</span>
                </label>
              </div>

              {/* Bộ lọc Cơ sở, Khóa học, Môn học, Tìm kiếm */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Cơ sở đào tạo
                  </label>
                  <select
                    value={campusFilter}
                    disabled={userCampusScope !== 'all'}
                    onChange={e => {
                      setCampusFilter(e.target.value);
                      setSourceClassId('');
                      setTargetClassId('');
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white focus:outline-none focus:border-amber-500 disabled:opacity-60"
                  >
                    {userCampusScope === 'all' && (
                      <option value="all">Toàn Trường (PMH & Phú Lâm)</option>
                    )}
                    {sortByLabelVi(
                      [
                        ...((userCampusScope === 'all' || userCampusScope === 'camp_pl')
                          ? [{ id: 'camp_pl', label: 'Cơ sở Phú Lâm (PL)' }]
                          : []),
                        ...((userCampusScope === 'all' || userCampusScope === 'camp_pmh')
                          ? [{ id: 'camp_pmh', label: 'Cơ sở Phú Mỹ Hưng (PMH)' }]
                          : []),
                      ],
                      c => c.label
                    ).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Lọc theo Khóa học (Lớp cũ)
                  </label>
                  <select
                    value={sourceTermFilter}
                    onChange={e => setSourceTermFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">Tất cả khóa học</option>
                    {store.terms.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.name} ({formatDateVN(t.start_date)} → {formatDateVN(t.end_date)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Lọc theo Môn học
                  </label>
                  <select
                    value={sourceSubjectFilter}
                    onChange={e => setSourceSubjectFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">Tất cả môn ngoại khóa</option>
                    {sortByLabelVi(store.subjects, s => (s.name || '').trim()).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Tìm kiếm mã / tên lớp
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={sourceSearch}
                      onChange={e => setSourceSearch(e.target.value)}
                      placeholder="Nhập mã hoặc tên lớp cũ..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Danh sách thẻ Lớp nguồn */}
              {sourceClassesList.length === 0 ? (
                <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-8 text-center space-y-2">
                  <Calendar className="w-8 h-8 text-amber-400 mx-auto opacity-80" />
                  <div className="text-sm font-bold text-white">
                    Không tìm thấy lớp đã kết thúc hoặc sắp kết thúc phù hợp bộ lọc
                  </div>
                  <p className="text-xs text-slate-400 max-w-lg mx-auto">
                    Bạn có thể bật tùy chọn &ldquo;Hiển thị cả lớp đang học khác&rdquo; ở góc phải phía trên nếu muốn chuẩn bị lên lớp sớm cho các lớp đang diễn ra.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {sourceClassesList.map(cls => {
                    const isSelected = cls.id === sourceClassId;
                    const term = store.terms.find(t => t.id === cls.term_id);
                    const subj = store.subjects.find(s => s.id === cls.subject_id);
                    const teacher = store.teachers.find(t => t.id === cls.primary_teacher_id);
                    const activeEnrCount = store.enrollments.filter(
                      e =>
                        e.class_id === cls.id &&
                        (e.status === 'active' || e.status === 'trial')
                    ).length;
                    const endCheck = checkClassEndedOrEndingSoon(cls);

                    return (
                      <div
                        key={cls.id}
                        onClick={() => {
                          setSourceClassId(cls.id);
                          setTargetClassId('');
                        }}
                        className={`rounded-2xl p-4 border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500 shadow-lg shadow-amber-500/10'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-amber-300 font-mono text-[11px] font-bold">
                              {cls.code}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                endCheck.statusTone === 'ended'
                                  ? 'bg-slate-800 text-slate-300 border-slate-700'
                                  : endCheck.statusTone === 'ending_soon'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              {endCheck.statusBadge}
                            </span>
                          </div>

                          <div className="text-sm font-extrabold text-white">
                            {cls.name}
                          </div>

                          <div className="text-[11px] text-slate-400 space-y-1">
                            <div className="flex items-center justify-between">
                              <span>Cơ sở / Môn:</span>
                              <span className="text-slate-200 font-semibold">
                                {normalizeCampusScope(cls.campus_id) === 'camp_pl'
                                  ? 'Phú Lâm'
                                  : 'PMH'}{' '}
                                • {subj?.name || cls.subject_id}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Khóa học:</span>
                              <span className="text-slate-200 font-semibold">
                                {term?.name || cls.term_id}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Lịch học & GV:</span>
                              <span className="text-slate-200 font-semibold">
                                {parseClassWeekdays(cls).join('-')} ({cls.time_slot}) •{' '}
                                {teacher?.name || 'Chưa phân GV'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Kết thúc khóa:</span>
                              <span className="text-amber-300 font-mono font-bold">
                                {formatDateVN(
                                  cls.end_date || term?.end_date || ''
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                            <Users className="w-3.5 h-3.5" />
                            <span>{activeEnrCount} học sinh đang học</span>
                          </div>

                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setSourceClassId(cls.id);
                              setTargetClassId('');
                              setStep(2);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-all"
                          >
                            <span>Chọn lớp này</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= BƯỚC 2: CHỌN LỚP ĐÍCH Ở KHÓA MỚI ================= */}
          {step === 2 && selectedSourceClass && (
            <div className="rounded-3xl bg-[#111827]/90 border border-slate-800 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center">
                      2
                    </span>
                    <span>Chọn Lớp Đích Ở Khóa Mới</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Lớp nguồn đang chọn:{' '}
                    <strong className="text-amber-300">
                      {selectedSourceClass.code} — {selectedSourceClass.name}
                    </strong>{' '}
                    ({sourceEnrollments.length} học sinh • Khóa:{' '}
                    {selectedSourceTerm?.name || selectedSourceClass.term_id})
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold self-start"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Đổi lớp nguồn</span>
                </button>
              </div>

              {/* Bộ lọc Lớp đích */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Khóa học đích (Khóa mới)
                  </label>
                  <select
                    value={targetTermFilter}
                    onChange={e => setTargetTermFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">
                      Tất cả khóa học (Ưu tiên khóa hiện tại:{' '}
                      {currentTerm?.code || 'Mới nhất'})
                    </option>
                    {store.terms.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.name} ({formatDateVN(t.start_date)} →{' '}
                        {formatDateVN(t.end_date)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Môn học lớp đích
                  </label>
                  <select
                    value={targetSubjectFilter}
                    onChange={e => setTargetSubjectFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="same_subject">
                      Cùng môn với lớp cũ (
                      {store.subjects.find(
                        s => s.id === selectedSourceClass.subject_id
                      )?.name || selectedSourceClass.subject_id}
                      )
                    </option>
                    <option value="all">Tất cả môn học (Cho phép lên lớp khác môn)</option>
                    {sortByLabelVi(store.subjects, s => (s.name || '').trim()).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Tìm kiếm lớp đích
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={targetSearch}
                      onChange={e => setTargetSearch(e.target.value)}
                      placeholder="Nhập mã hoặc tên lớp khóa mới..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Cảnh báo nếu lớp đích đang chọn chưa có biểu phí */}
              {selectedTargetClass && !targetPricingInfo.hasConfiguredPrice && (
                <div className="rounded-2xl bg-rose-500/15 border border-rose-500/40 p-4 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <div className="font-extrabold text-rose-300">
                      Chặn tính tiền: Lớp đích ({selectedTargetClass.code}) chưa được cấu hình biểu phí hợp lệ!
                    </div>
                    <p className="text-slate-300">
                      Vui lòng vào mục <strong>Biểu Phí Theo Cơ Sở</strong> để cấu hình học phí khóa và đơn giá buổi cho môn học này ở khóa mới trước khi thực hiện lên lớp.
                    </p>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab('sub_pricing')}
                        className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-extrabold text-xs"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Mở cấu hình Biểu Phí Theo Cơ Sở</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Danh sách lớp đích */}
              {targetClassesList.length === 0 ? (
                <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-8 text-center space-y-2">
                  <Calendar className="w-8 h-8 text-amber-400 mx-auto opacity-80" />
                  <div className="text-sm font-bold text-white">
                    Không tìm thấy lớp đích phù hợp ở cơ sở này
                  </div>
                  <p className="text-xs text-slate-400">
                    Hãy thử đổi bộ lọc &ldquo;Môn học lớp đích&rdquo; sang &ldquo;Tất cả môn học&rdquo; hoặc kiểm tra danh mục Lớp Học Ngoại Khóa.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {targetClassesList.map(cls => {
                    const isSelected = cls.id === targetClassId;
                    const term = store.terms.find(t => t.id === cls.term_id);
                    const subj = store.subjects.find(s => s.id === cls.subject_id);
                    const teacher = store.teachers.find(t => t.id === cls.primary_teacher_id);
                    const currentActive = store.enrollments.filter(
                      e =>
                        e.class_id === cls.id &&
                        (e.status === 'active' || e.status === 'trial')
                    ).length;
                    const maxCap = cls.max_students || 30;
                    const remainingSeats = maxCap - currentActive;
                    const wouldExceed =
                      currentActive + sourceEnrollments.length > maxCap;

                    const effPrice = getEffectivePrice(
                      cls.term_id,
                      cls.campus_id,
                      cls.subject_id,
                      store
                    );

                    return (
                      <div
                        key={cls.id}
                        onClick={() => setTargetClassId(cls.id)}
                        className={`rounded-2xl p-4 border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500 shadow-lg shadow-amber-500/10'
                            : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-amber-300 font-mono text-[11px] font-bold">
                              {cls.code}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                remainingSeats <= 0
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                  : wouldExceed
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              Sĩ số: {currentActive}/{maxCap} (Còn{' '}
                              {Math.max(0, remainingSeats)} chỗ)
                            </span>
                          </div>

                          <div className="text-sm font-extrabold text-white">
                            {cls.name}
                          </div>

                          <div className="text-[11px] text-slate-400 space-y-1">
                            <div className="flex items-center justify-between">
                              <span>Khóa mới:</span>
                              <span className="text-amber-300 font-bold">
                                {term?.name || cls.term_id}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Môn học:</span>
                              <span className="text-slate-200 font-semibold">
                                {subj?.name || cls.subject_id}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Lịch học:</span>
                              <span className="text-slate-200 font-semibold">
                                {parseClassWeekdays(cls).join(' - ')} ({cls.time_slot})
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Giáo viên:</span>
                              <span className="text-slate-200 font-semibold">
                                {teacher?.name || 'Chưa phân công'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Thời gian khóa:</span>
                              <span className="text-slate-300 font-mono">
                                {formatDateVN(
                                  cls.start_date || term?.start_date || ''
                                )}{' '}
                                →{' '}
                                {formatDateVN(
                                  cls.end_date || term?.end_date || ''
                                )}
                              </span>
                            </div>
                          </div>

                          {wouldExceed && (
                            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                Cảnh báo: Nếu chuyển toàn bộ {sourceEnrollments.length} HS sẽ vượt sĩ số tối đa ({currentActive + sourceEnrollments.length}/{maxCap}).
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-[10px] text-slate-400">
                              Học phí khóa / Đơn giá buổi
                            </div>
                            <div className="text-xs font-extrabold text-emerald-400 font-mono">
                              {formatVND(effPrice.course_fee)} •{' '}
                              {formatVND(effPrice.session_rate)}/b
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setTargetClassId(cls.id);
                              if (effPrice.course_fee > 0 && effPrice.session_rate > 0) {
                                setStep(3);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-all"
                          >
                            <span>Chọn lớp đích</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= BƯỚC 3: DANH SÁCH HỌC SINH & TÍNH HỌC PHÍ THỰC HỌC ================= */}
          {step === 3 && selectedSourceClass && selectedTargetClass && (
            <div className="space-y-4">
              {/* Tóm tắt Lớp nguồn -> Lớp đích & Biểu phí áp dụng */}
              <div className="rounded-3xl bg-[#111827]/90 border border-slate-800 p-4 sm:p-5 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-slate-200 font-bold">
                      Lớp cũ: <strong className="text-amber-300">{selectedSourceClass.code}</strong> ({selectedSourceClass.name})
                    </span>
                    <ChevronRight className="w-4 h-4 text-amber-400" />
                    <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                      Lớp mới: <strong>{selectedTargetClass.code}</strong> ({selectedTargetClass.name}) • Lịch:{' '}
                      {targetClassWeekdays.join('-')}
                    </span>
                    <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-bold">
                      Trọn khóa ({targetPricingInfo.standardSessions} buổi): {formatVND(targetPricingInfo.courseFee)} | Đơn giá lẻ:{' '}
                      {formatVND(targetPricingInfo.sessionRate)}/buổi
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Đổi lớp đích</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleProceedToStep4}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-lg shadow-amber-500/20"
                    >
                      <span>Tiếp tục Xem lại & Xác nhận</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Thông tin ngày khóa mới & các ngày lễ được trừ tự động */}
                <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-slate-300">
                    <span>
                      Khoảng thời gian khóa mới:{' '}
                      <strong className="text-white font-mono">
                        {formatDateVN(targetClassStartDate)} →{' '}
                        {formatDateVN(targetClassEndDate)}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Ngày lễ trừ tự động:{' '}
                      <strong className="text-amber-300">
                        {activeHolidaysInTargetRange.length > 0
                          ? activeHolidaysInTargetRange
                              .map(
                                h =>
                                  `${h.title} (${formatDateVN(h.start_date)})`
                              )
                              .join(', ')
                          : 'Không có ngày lễ trùng trong khóa'}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStudentDrafts(prev => {
                          const next = { ...prev };
                          for (const k of Object.keys(next)) {
                            if (!next[k].alreadyInTarget) {
                              next[k] = { ...next[k], actionStatus: 'promote' };
                            }
                          }
                          return next;
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-emerald-300"
                    >
                      Chọn tất cả Lên lớp
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStudentDrafts(prev => {
                          const next = { ...prev };
                          for (const k of Object.keys(next)) {
                            if (!next[k].alreadyInTarget) {
                              next[k] = { ...next[k], actionStatus: 'pending' };
                            }
                          }
                          return next;
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300"
                    >
                      Bỏ chọn tất cả
                    </button>
                  </div>
                </div>

                {/* Cảnh báo tổng quát (quá sĩ số, trùng lịch) */}
                {(summaryStats.isOverCapacity ||
                  summaryStats.scheduleConflicts.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {summaryStats.isOverCapacity && (
                      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <strong>Cảnh báo vượt sĩ số tối đa:</strong> Lớp đích{' '}
                          {selectedTargetClass.code} hiện có{' '}
                          {summaryStats.existingTargetActiveCount} HS, cộng thêm{' '}
                          {summaryStats.promoteRows.length} HS lên lớp ={' '}
                          <strong>
                            {summaryStats.projectedTotalStudents}/
                            {summaryStats.maxStudents} học sinh
                          </strong>
                          .
                        </div>
                      </div>
                    )}

                    {summaryStats.scheduleConflicts.length > 0 && (
                      <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <strong>
                            Cảnh báo trùng lịch học ({summaryStats.scheduleConflicts.length} HS):
                          </strong>{' '}
                          {summaryStats.scheduleConflicts
                            .map(
                              r =>
                                `${r.student.name} (trùng ${r.conflictingClasses
                                  .map(c => c.code)
                                  .join(', ')})`
                            )
                            .join('; ')}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Danh sách từng học sinh */}
              <div className="space-y-3">
                {computedRows.map((row, idx) => {
                  const {
                    draft,
                    student,
                    alreadyInTarget,
                    actionStatus,
                    isFullCourseAttendance,
                    calculatedSessions,
                    sessionRate,
                    calculatedGrossAmount,
                    finalSessions,
                    finalGrossAmount,
                    formulaLabel,
                    discountAmount,
                    studentCredits,
                    selectedCredit,
                    creditDeducted,
                    prepaidDeducted,
                    netPayable,
                    oldTermDebtAmount,
                    conflictingClasses,
                  } = row;

                  const isPromoting = actionStatus === 'promote';

                  return (
                    <div
                      key={student.id}
                      className={`rounded-3xl border p-4 transition-all ${
                        alreadyInTarget
                          ? 'bg-slate-900/40 border-slate-800/70 opacity-75'
                          : isPromoting
                          ? 'bg-[#111827]/95 border-amber-500/40 shadow-lg'
                          : actionStatus === 'dropped'
                          ? 'bg-rose-950/15 border-rose-500/30'
                          : 'bg-slate-900/50 border-slate-800'
                      }`}
                    >
                      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                        {/* Cột 1 (4 cols): Thông tin học sinh, Checkbox & Trạng thái, Cảnh báo nợ cũ / bảo lưu */}
                        <div className="xl:col-span-4 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <label className="flex items-start gap-2.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                disabled={alreadyInTarget}
                                checked={isPromoting}
                                onChange={e =>
                                  updateStudentDraft(student.id, {
                                    actionStatus: e.target.checked
                                      ? 'promote'
                                      : 'pending',
                                  })
                                }
                                className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500 disabled:opacity-40"
                              />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-mono text-slate-400">
                                    #{idx + 1}
                                  </span>
                                  <span className="text-sm font-extrabold text-white">
                                    {student.name}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-mono text-[10px] font-bold">
                                    {student.code}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  Lớp chính khóa:{' '}
                                  <strong className="text-slate-300">
                                    {student.regular_class || 'Ngoại trường'}
                                  </strong>{' '}
                                  • PH: {student.parent_name} ({student.parent_phone})
                                </div>
                              </div>
                            </label>
                          </div>

                          {/* Nút chuyển trạng thái: Đã lên lớp / Lên lớp / Chưa lên lớp / Nghỉ hẳn */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {alreadyInTarget ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-extrabold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Đã lên lớp (Đã có trong lớp đích — Bỏ qua)</span>
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateStudentDraft(student.id, {
                                      actionStatus: 'promote',
                                    })
                                  }
                                  className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition-all ${
                                    actionStatus === 'promote'
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                                  }`}
                                >
                                  ✓ Lên lớp khóa mới
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateStudentDraft(student.id, {
                                      actionStatus: 'pending',
                                    })
                                  }
                                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                                    actionStatus === 'pending'
                                      ? 'bg-slate-700 text-white border-slate-600'
                                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                                  }`}
                                >
                                  Chưa lên lớp
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateStudentDraft(student.id, {
                                      actionStatus: 'dropped',
                                    })
                                  }
                                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                                    actionStatus === 'dropped'
                                      ? 'bg-rose-500 text-white border-rose-400'
                                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-rose-300'
                                  }`}
                                >
                                  Nghỉ hẳn
                                </button>
                              </>
                            )}
                          </div>

                          {/* Nhãn cảnh báo: Nợ cũ, Có bảo lưu, Trùng lịch */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {oldTermDebtAmount > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[11px] font-bold">
                                <AlertTriangle className="w-3 h-3" />
                                <span>
                                  Còn nợ khóa cũ: {formatVND(oldTermDebtAmount)}
                                </span>
                              </span>
                            )}

                            {studentCredits.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold">
                                <BookmarkCheck className="w-3 h-3" />
                                <span>
                                  Có phiếu bảo lưu ({selectedCredit?.credit_code})
                                </span>
                              </span>
                            )}

                            {conflictingClasses.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold">
                                <Clock className="w-3 h-3" />
                                <span>
                                  Trùng lịch: {conflictingClasses.map(c => c.code).join(', ')}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Cột 2 (4 cols): Chọn Thứ học ở lớp mới, Ngày bắt đầu & Công thức tính số buổi */}
                        <div className="xl:col-span-4 space-y-2.5">
                          {isPromoting ? (
                            <>
                              <div>
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5">
                                  <span>Chọn thứ học trong tuần ở lớp mới:</span>
                                  <span
                                    className={
                                      isFullCourseAttendance
                                        ? 'text-emerald-400'
                                        : 'text-amber-400'
                                    }
                                  >
                                    {isFullCourseAttendance
                                      ? `Học đủ trọn khóa (${calculatedSessions}/${targetPricingInfo.standardSessions} buổi)`
                                      : `Học thiếu buổi chuẩn (${calculatedSessions}/${targetPricingInfo.standardSessions} buổi) • Tính theo đơn giá lẻ`}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {targetClassWeekdays.map(dayCode => {
                                    const active =
                                      draft.selectedDays.includes(dayCode);
                                    return (
                                      <button
                                        key={dayCode}
                                        type="button"
                                        onClick={() =>
                                          toggleStudentWeekday(
                                            student.id,
                                            dayCode
                                          )
                                        }
                                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                                          active
                                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                                        }`}
                                      >
                                        {WEEKDAY_LABELS[dayCode] || dayCode} (
                                        {dayCode})
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                                    Ngày bắt đầu học
                                  </label>
                                  <input
                                    type="date"
                                    value={draft.startDate}
                                    min={targetClassStartDate}
                                    max={targetClassEndDate}
                                    onChange={e =>
                                      updateStudentDraft(student.id, {
                                        startDate:
                                          e.target.value || targetClassStartDate,
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                                    Số buổi thực học (trừ lễ)
                                  </label>
                                  <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-extrabold text-amber-300 flex items-center justify-between">
                                    <span>{finalSessions} buổi</span>
                                    <span className="text-[10px] text-slate-400 font-sans">
                                      → {formatDateVN(targetClassEndDate)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Công thức tính minh bạch */}
                              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px]">
                                <div className="text-slate-400 font-semibold">
                                  Công thức tính học phí:
                                </div>
                                <div className="text-amber-300 font-mono font-bold mt-0.5">
                                  {formulaLabel}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400">
                              {alreadyInTarget
                                ? 'Học sinh này đã có bản ghi ghi danh đang hoạt động trong lớp đích. Hệ thống sẽ tự động bỏ qua để không tạo trùng.'
                                : actionStatus === 'dropped'
                                ? 'Học sinh được đánh dấu Nghỉ hẳn. Khi xác nhận, trạng thái ở lớp cũ sẽ chuyển sang "dropped" và không tạo hóa đơn khóa mới.'
                                : 'Học sinh đang ở trạng thái Chưa lên lớp (Tạm hoãn). Tick chọn nếu muốn đưa vào đợt lên lớp này.'}
                            </div>
                          )}
                        </div>

                        {/* Cột 3 (4 cols): Các dòng khấu trừ riêng biệt, Chỉnh tay & Số tiền còn phải đóng */}
                        <div className="xl:col-span-4 space-y-2">
                          {isPromoting && (
                            <div className="rounded-2xl bg-slate-950/90 border border-slate-800 p-3 space-y-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 font-semibold">
                                  1. Học phí tính theo buổi:
                                </span>
                                <span className="font-mono font-bold text-white">
                                  {formatVND(finalGrossAmount)}
                                </span>
                              </div>

                              {/* Dòng khấu trừ 1: Ưu đãi biểu phí */}
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">
                                  2. Trừ ưu đãi biểu phí:
                                </span>
                                <span className="font-mono font-semibold text-emerald-400">
                                  -{formatVND(discountAmount)}
                                </span>
                              </div>

                              {/* Dòng khấu trừ 2: Phiếu bảo lưu / Học bù */}
                              <div className="flex items-center justify-between gap-2">
                                <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    disabled={studentCredits.length === 0}
                                    checked={
                                      draft.applyCreditNote &&
                                      studentCredits.length > 0
                                    }
                                    onChange={e =>
                                      updateStudentDraft(student.id, {
                                        applyCreditNote: e.target.checked,
                                      })
                                    }
                                    className="rounded border-slate-700 bg-slate-900 text-amber-500"
                                  />
                                  <span>
                                    3. Trừ bảo lưu / học bù
                                    {selectedCredit
                                      ? ` (${selectedCredit.credit_code})`
                                      : ':'}
                                  </span>
                                </label>
                                <span className="font-mono font-semibold text-cyan-400">
                                  -{formatVND(creditDeducted)}
                                </span>
                              </div>

                              {/* Dòng khấu trừ 3: Trả trước / Số dư đã nộp */}
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-400">
                                  4. Trừ số dư trả trước:
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step={10000}
                                  value={draft.prepaidDeducted || ''}
                                  onChange={e =>
                                    updateStudentDraft(student.id, {
                                      prepaidDeducted: Math.max(
                                        0,
                                        Number(e.target.value) || 0
                                      ),
                                    })
                                  }
                                  placeholder="0"
                                  className="w-28 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-right font-mono text-xs text-amber-300 focus:outline-none focus:border-amber-500"
                                />
                              </div>

                              {/* Tổng thực thu còn phải đóng */}
                              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                                <span className="font-extrabold text-white">
                                  Còn phải đóng:
                                </span>
                                <span className="text-sm font-mono font-black text-amber-400">
                                  {formatVND(netPayable)}
                                </span>
                              </div>

                              {/* Nút bật/tắt Chỉnh tay số buổi & số tiền */}
                              <div className="pt-1.5 border-t border-slate-800/80">
                                {!draft.isManualOverride ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateStudentDraft(student.id, {
                                        isManualOverride: true,
                                        manualSessions: calculatedSessions,
                                        manualGrossAmount: calculatedGrossAmount,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Chỉnh tay số buổi / học phí</span>
                                  </button>
                                ) : (
                                  <div className="space-y-2 pt-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-extrabold text-amber-400">
                                        Chế độ chỉnh tay (Bắt buộc nhập lý do)
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateStudentDraft(student.id, {
                                            isManualOverride: false,
                                            manualOverrideReason: '',
                                          })
                                        }
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>Khôi phục tự tính</span>
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="block text-[10px] text-slate-400 mb-0.5">
                                          Số buổi chỉnh tay
                                        </label>
                                        <input
                                          type="number"
                                          min={1}
                                          value={draft.manualSessions}
                                          onChange={e =>
                                            updateStudentDraft(student.id, {
                                              manualSessions: Math.max(
                                                0,
                                                Number(e.target.value) || 0
                                              ),
                                            })
                                          }
                                          className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-amber-500/40 font-mono text-xs text-white"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] text-slate-400 mb-0.5">
                                          Thành tiền gốc (VNĐ)
                                        </label>
                                        <input
                                          type="number"
                                          min={0}
                                          step={10000}
                                          value={draft.manualGrossAmount}
                                          onChange={e =>
                                            updateStudentDraft(student.id, {
                                              manualGrossAmount: Math.max(
                                                0,
                                                Number(e.target.value) || 0
                                              ),
                                            })
                                          }
                                          className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-amber-500/40 font-mono text-xs text-white"
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <input
                                        type="text"
                                        required
                                        value={draft.manualOverrideReason}
                                        onChange={e =>
                                          updateStudentDraft(student.id, {
                                            manualOverrideReason: e.target.value,
                                          })
                                        }
                                        placeholder="Nhập lý do chỉnh tay (bắt buộc lưu audit_logs)..."
                                        className={`w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border text-xs text-white focus:outline-none ${
                                          !draft.manualOverrideReason.trim()
                                            ? 'border-rose-500'
                                            : 'border-amber-500/40'
                                        }`}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Thanh tổng kết cuối Bước 3 */}
              <div className="rounded-3xl bg-[#111827]/95 border border-amber-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-400">Học sinh lên lớp:</span>{' '}
                    <strong className="text-emerald-400 text-sm">
                      {summaryStats.promoteRows.length} HS
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Nghỉ hẳn:</span>{' '}
                    <strong className="text-rose-400">
                      {summaryStats.droppedRows.length} HS
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Tổng học phí gốc:</span>{' '}
                    <strong className="text-white font-mono">
                      {formatVND(summaryStats.totalGross)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Tổng thực thu:</span>{' '}
                    <strong className="text-amber-400 text-sm font-mono">
                      {formatVND(summaryStats.totalNetPayable)}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleProceedToStep4}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-lg shadow-amber-500/20"
                >
                  <span>Sang Bước 4: Xem Lại & Xác Nhận</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ================= BƯỚC 4: XEM LẠI & XÁC NHẬN LÊN LỚP ================= */}
          {step === 4 && selectedSourceClass && selectedTargetClass && (
            <div className="rounded-3xl bg-[#111827]/95 border border-slate-800 p-4 sm:p-6 space-y-5 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center">
                      4
                    </span>
                    <span>Xem Lại Tổng Thể & Xác Nhận Lên Lớp</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Kiểm tra kỹ danh sách học sinh, công thức tính phí, các khoản khấu trừ và các cảnh báo trước khi xác nhận.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold self-start"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Quay lại chỉnh sửa (Bước 3)</span>
                </button>
              </div>

              {/* 4 Thẻ KPI Tổng hợp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[11px] font-bold text-slate-400">
                    Số học sinh xử lý
                  </div>
                  <div className="text-lg font-black text-white mt-1">
                    {summaryStats.promoteRows.length} HS lên lớp
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Nghỉ hẳn: {summaryStats.droppedRows.length} HS • Bỏ qua/Hoãn:{' '}
                    {summaryStats.skippedRows.length} HS
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[11px] font-bold text-slate-400">
                    Tổng học phí dự kiến (Gross)
                  </div>
                  <div className="text-lg font-black text-white font-mono mt-1">
                    {formatVND(summaryStats.totalGross)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Lớp đích: {selectedTargetClass.code}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 text-xs">
                  <div className="text-[11px] font-bold text-slate-400">
                    Chi tiết từng khoản khấu trừ
                  </div>
                  <div className="flex justify-between text-emerald-400">
                    <span>Ưu đãi biểu phí:</span>
                    <span className="font-mono font-bold">
                      -{formatVND(summaryStats.totalDiscount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-cyan-400">
                    <span>Bảo lưu / học bù:</span>
                    <span className="font-mono font-bold">
                      -{formatVND(summaryStats.totalCredit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-amber-300">
                    <span>Số dư trả trước:</span>
                    <span className="font-mono font-bold">
                      -{formatVND(summaryStats.totalPrepaid)}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40">
                  <div className="text-[11px] font-bold text-amber-300">
                    Tổng còn phải thu (Net Payable)
                  </div>
                  <div className="text-xl font-black text-amber-400 font-mono mt-1">
                    {formatVND(summaryStats.totalNetPayable)}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    Tự động phát hành {summaryStats.promoteRows.length} hóa đơn VietQR
                  </div>
                </div>
              </div>

              {/* Khối hiển thị tất cả cảnh báo (nếu có) */}
              {(summaryStats.isOverCapacity ||
                summaryStats.scheduleConflicts.length > 0 ||
                summaryStats.oldDebtStudents.length > 0 ||
                summaryStats.manualOverrideStudents.length > 0) && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-2 text-xs">
                  <div className="font-extrabold text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Các lưu ý & cảnh báo cần xác nhận trước khi thực thi:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-200">
                    {summaryStats.isOverCapacity && (
                      <li>
                        Lớp đích <strong>{selectedTargetClass.code}</strong> sẽ vượt sĩ số tối đa ({summaryStats.projectedTotalStudents}/{summaryStats.maxStudents} học sinh).
                      </li>
                    )}
                    {summaryStats.scheduleConflicts.length > 0 && (
                      <li>
                        Có <strong>{summaryStats.scheduleConflicts.length} học sinh</strong> trùng khung giờ với lớp khác đang học:{' '}
                        {summaryStats.scheduleConflicts
                          .map(r => r.student.name)
                          .join(', ')}
                        .
                      </li>
                    )}
                    {summaryStats.oldDebtStudents.length > 0 && (
                      <li>
                        Có <strong>{summaryStats.oldDebtStudents.length} học sinh</strong> còn nợ học phí khóa cũ (vẫn được phép lên lớp):{' '}
                        {summaryStats.oldDebtStudents
                          .map(
                            r =>
                              `${r.student.name} (${formatVND(
                                r.oldTermDebtAmount
                              )})`
                          )
                          .join(', ')}
                        .
                      </li>
                    )}
                    {summaryStats.manualOverrideStudents.length > 0 && (
                      <li>
                        Có <strong>{summaryStats.manualOverrideStudents.length} học sinh</strong> chỉnh tay học phí/số buổi (sẽ ghi nhận vào <code>audit_logs</code>):{' '}
                        {summaryStats.manualOverrideStudents
                          .map(
                            r =>
                              `${r.student.name} [Lý do: ${r.draft.manualOverrideReason}]`
                          )
                          .join('; ')}
                        .
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Bảng danh sách học sinh xác nhận */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/95 text-slate-400 border-b border-slate-800">
                      <th className="py-3 px-3 font-bold">Học sinh</th>
                      <th className="py-3 px-3 font-bold">Trạng thái xử lý</th>
                      <th className="py-3 px-3 font-bold">Thứ học & Ngày BĐ</th>
                      <th className="py-3 px-3 font-bold">Công thức tính học phí</th>
                      <th className="py-3 px-3 font-bold text-right">Khấu trừ</th>
                      <th className="py-3 px-3 font-bold text-right">Còn phải đóng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {computedRows.map(row => (
                      <tr
                        key={row.student.id}
                        className="hover:bg-slate-900/40 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="font-bold text-white">
                            {row.student.name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {row.student.code}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {row.actionStatus === 'promote' ? (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                              Lên lớp mới
                            </span>
                          ) : row.actionStatus === 'dropped' ? (
                            <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px] font-bold">
                              Nghỉ hẳn (Dropped)
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 text-[11px] font-bold">
                              {row.alreadyInTarget
                                ? 'Đã có trong lớp đích'
                                : 'Tạm hoãn'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {row.actionStatus === 'promote' ? (
                            <div>
                              <div className="font-bold text-amber-300">
                                {row.draft.selectedDays.join(' - ')} (
                                {row.finalSessions} buổi)
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                BĐ: {formatDateVN(row.draft.startDate)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-slate-200">
                            {row.formulaLabel}
                          </div>
                          {row.draft.isManualOverride && (
                            <div className="text-[11px] text-amber-400 mt-0.5">
                              Lý do chỉnh tay: {row.draft.manualOverrideReason}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {row.actionStatus === 'promote' ? (
                            <div className="space-y-0.5 text-[11px]">
                              {row.discountAmount > 0 && (
                                <div className="text-emerald-400">
                                  Ưu đãi: -{formatVND(row.discountAmount)}
                                </div>
                              )}
                              {row.creditDeducted > 0 && (
                                <div className="text-cyan-400">
                                  Bảo lưu: -{formatVND(row.creditDeducted)}
                                </div>
                              )}
                              {row.prepaidDeducted > 0 && (
                                <div className="text-amber-300">
                                  Trả trước: -{formatVND(row.prepaidDeducted)}
                                </div>
                              )}
                              {row.discountAmount === 0 &&
                                row.creditDeducted === 0 &&
                                row.prepaidDeducted === 0 && (
                                  <span className="text-slate-500">0 ₫</span>
                                )}
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-extrabold text-amber-400">
                          {row.actionStatus === 'promote'
                            ? formatVND(row.netPayable)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Nút Xác nhận lên lớp */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Hệ thống sẽ thực thi trong một giao dịch nguyên tử (Atomic). Nếu có bất kỳ lỗi nào, toàn bộ thao tác sẽ tự động hoàn tác (Rollback).
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmPromotion}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-sm font-black shadow-xl shadow-amber-500/25 transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang thực thi Lên Lớp...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Xác nhận lên lớp ({summaryStats.promoteRows.length} HS)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: LỊCH SỬ LÊN LỚP (CHỈ XEM, KHÔNG TỰ ĐỘNG XÓA) */}
      {activeSubTab === 'history' && (
        <div className="rounded-3xl bg-[#111827]/90 border border-slate-800 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <span>Lịch Sử Các Đợt Lên Lớp Đã Thực Hiện</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Lưu trữ vĩnh viễn lịch sử các đợt chuyển khóa (ai thực hiện, lúc nào, từ lớp nào sang lớp nào, danh sách học sinh và hóa đơn phát sinh).
              </p>
            </div>

            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('sub_finance_invoices')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/30 text-xs font-extrabold transition-all"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Mở Thu Học Phí & Mã Chuyển Khoản</span>
              </button>
            )}
          </div>

          {visibleHistories.length === 0 ? (
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-10 text-center space-y-2">
              <History className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="text-sm font-bold text-white">
                Chưa có đợt lên lớp nào được ghi nhận
              </div>
              <p className="text-xs text-slate-400">
                Các đợt xác nhận lên lớp sẽ được lưu tự động tại đây để phục vụ đối soát học vụ và tài chính.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900/95 text-slate-400 border-b border-slate-800">
                    <th className="py-3 px-3 font-bold">Mã đợt & Thời gian</th>
                    <th className="py-3 px-3 font-bold">Cơ sở</th>
                    <th className="py-3 px-3 font-bold">Lớp nguồn (Cũ)</th>
                    <th className="py-3 px-3 font-bold">Lớp đích (Mới)</th>
                    <th className="py-3 px-3 font-bold text-center">Số lượng HS</th>
                    <th className="py-3 px-3 font-bold text-right">Tổng phải thu</th>
                    <th className="py-3 px-3 font-bold">Người thực hiện</th>
                    <th className="py-3 px-3 font-bold text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {visibleHistories.map(h => (
                    <tr
                      key={h.id}
                      className="hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-amber-300">
                          {h.batch_code}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(h.created_at).toLocaleString('vi-VN')}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-200">
                        {normalizeCampusScope(h.campus_id) === 'camp_pl'
                          ? 'Phú Lâm'
                          : 'PMH'}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-300">
                        {h.source_class_name}
                      </td>
                      <td className="py-3 px-3 font-bold text-emerald-300">
                        {h.target_class_name}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 font-bold">
                          {h.promoted_count} lên lớp
                        </span>
                        {h.dropped_count > 0 && (
                          <span className="ml-1 px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-300 font-bold">
                            {h.dropped_count} nghỉ
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-amber-400">
                        {formatVND(h.total_net_payable)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">
                          {h.created_by_name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          @{h.created_by}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setViewingHistory(h)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Xem DS</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL XEM CHI TIẾT ĐỢT LÊN LỚP */}
      {viewingHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-3xl bg-[#0B0F19] border border-slate-800 shadow-2xl overflow-hidden text-slate-100">
            <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                  <span>Chi Tiết Đợt Lên Lớp:</span>
                  <span className="text-amber-400 font-mono">
                    {viewingHistory.batch_code}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Thực hiện bởi <strong>{viewingHistory.created_by_name}</strong> lúc{' '}
                  {new Date(viewingHistory.created_at).toLocaleString('vi-VN')} •{' '}
                  {viewingHistory.source_class_name} →{' '}
                  {viewingHistory.target_class_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingHistory(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">Số HS lên lớp</div>
                  <div className="text-base font-black text-emerald-400 mt-0.5">
                    {viewingHistory.promoted_count} học sinh
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">Tổng học phí gốc</div>
                  <div className="text-base font-black text-white font-mono mt-0.5">
                    {formatVND(viewingHistory.total_gross_amount)}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">Tổng khấu trừ</div>
                  <div className="text-base font-black text-cyan-400 font-mono mt-0.5">
                    -
                    {formatVND(
                      viewingHistory.total_discount_amount +
                        viewingHistory.total_credit_deducted +
                        viewingHistory.total_prepaid_deducted
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30">
                  <div className="text-amber-300">Tổng thực thu</div>
                  <div className="text-base font-black text-amber-400 font-mono mt-0.5">
                    {formatVND(viewingHistory.total_net_payable)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <th className="py-2.5 px-3 font-bold">Học sinh</th>
                      <th className="py-2.5 px-3 font-bold">Trạng thái</th>
                      <th className="py-2.5 px-3 font-bold">Lịch học mới</th>
                      <th className="py-2.5 px-3 font-bold">Công thức tính</th>
                      <th className="py-2.5 px-3 font-bold">Mã hóa đơn</th>
                      <th className="py-2.5 px-3 font-bold text-right">Thực thu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {viewingHistory.items.map((item, idx) => (
                      <tr key={`${item.student_id}_${idx}`}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-white">
                            {item.student_name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {item.student_code}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {item.action_status === 'promoted' ? (
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 font-bold text-[11px]">
                              Đã lên lớp
                            </span>
                          ) : item.action_status === 'dropped' ? (
                            <span className="px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-300 font-bold text-[11px]">
                              Nghỉ hẳn
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 font-bold text-[11px]">
                              Bỏ qua / Hoãn
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-amber-300">
                          {item.selected_days?.length > 0
                            ? `${item.selected_days.join('-')} (${item.final_sessions}b)`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono text-slate-200">
                            {item.formula_label}
                          </div>
                          {item.is_manual_override && (
                            <div className="text-[11px] text-amber-400">
                              Lý do chỉnh tay: {item.manual_override_reason}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-cyan-300">
                          {item.invoice_code || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400">
                          {item.action_status === 'promoted'
                            ? formatVND(item.net_payable)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM SQL MIGRATION & RLS */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-3xl bg-[#0B0F19] border border-slate-800 shadow-2xl overflow-hidden text-slate-100">
            <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileCode2 className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    Script SQL Migration & RLS (supabase_migration_class_promotion.sql)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Bổ sung bảng lịch sử lên lớp, RLS theo cơ sở và hàm RPC chạy trong 1 transaction nguyên tử
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 text-xs">
              <p className="text-slate-300">
                File migration đầy đủ đã được lưu tại{' '}
                <code className="text-amber-300 font-mono">
                  supabase_migration_class_promotion.sql
                </code>
                . Bạn có thể chạy trực tiếp trên Supabase SQL Editor (hoàn toàn không làm ảnh hưởng cấu trúc các bảng đang chạy).
              </p>
              <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed">
{`-- Tạo bảng lịch sử lên lớp (chỉ xem, không tự động xóa)
CREATE TABLE IF NOT EXISTS public.class_promotion_histories (
  id TEXT PRIMARY KEY,
  batch_code TEXT NOT NULL,
  campus_id TEXT NOT NULL,
  source_term_id TEXT NOT NULL,
  source_class_id TEXT NOT NULL,
  source_class_name TEXT NOT NULL,
  target_term_id TEXT NOT NULL,
  target_class_id TEXT NOT NULL,
  target_class_name TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  promoted_count INTEGER NOT NULL DEFAULT 0,
  dropped_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  total_gross_amount NUMERIC NOT NULL DEFAULT 0,
  total_discount_amount NUMERIC NOT NULL DEFAULT 0,
  total_credit_deducted NUMERIC NOT NULL DEFAULT 0,
  total_prepaid_deducted NUMERIC NOT NULL DEFAULT 0,
  total_net_payable NUMERIC NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.class_promotion_histories ENABLE ROW LEVEL SECURITY;
-- Chi tiết đầy đủ RLS & RPC promote_students_to_new_class(p_payload JSONB)
-- nằm trong file /supabase_migration_class_promotion.sql`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
