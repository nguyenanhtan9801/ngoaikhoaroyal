import {
  Campus,
  AcademicTerm,
  TermStatus,
  Subject,
  SubjectCategory,
  DiscountType,
  TermSubjectConfig,
  CampusTermPricing,
  EffectivePricingResult,
  TermCampusSubjectPricing,
  Facility,
  TimeSlot,
  Teacher,
  ExtracurricularClass,
  Student,
  Enrollment,
  TuitionInvoice,
  ClassSession,
  AttendanceRecord,
  MakeupCredit,
  ClassTransfer,
  TeacherPayrollSettlement,
  ParentRegistration,
  SystemNotification,
  AppUser,
  AuditLogRecord,
  LogActionType
} from '../types';

import {
  initialCampuses,
  initialTerms,
  initialSubjects,
  initialSubjectCategories,
  initialTermSubjects,
  initialCampusPricings,
  initialPricings,
  initialFacilities,
  initialTimeSlots,
  initialTeachers,
  initialClasses,
  initialStudents,
  initialEnrollments,
  initialInvoices,
  initialSessions,
  initialAttendance,
  initialMakeupCredits,
  initialParentRegistrations,
  initialNotifications,
  initialUsers,
  initialAuditLogs,
} from '../data/seedData';

export interface AppStore {
  users: AppUser[];
  campuses: Campus[];
  terms: AcademicTerm[];
  subjectCategories: SubjectCategory[];
  subjects: Subject[];
  termSubjects: TermSubjectConfig[];
  campusPricings: CampusTermPricing[];
  pricings: TermCampusSubjectPricing[];
  facilities: Facility[];
  timeSlots: TimeSlot[];
  teachers: Teacher[];
  classes: ExtracurricularClass[];
  students: Student[];
  enrollments: Enrollment[];
  invoices: TuitionInvoice[];
  sessions: ClassSession[];
  attendance: AttendanceRecord[];
  makeupCredits: MakeupCredit[];
  transfers: ClassTransfer[];
  payrollSettlements: TeacherPayrollSettlement[];
  parentRegistrations: ParentRegistration[];
  notifications: SystemNotification[];
  auditLogs: AuditLogRecord[];
  telecomConfig: {
    zaloZnsEnabled: boolean;
    smsBrandnameEnabled: boolean;
    emailEnabled: boolean;
    brandName: string;
  };
  supabaseConfig: {
    url: string;
    anonKey: string;
    isConnected: boolean;
  };
}

const STORAGE_KEY = 'royal_extracurricular_store_v1';

export function getInitialStore(): AppStore {
  return {
    users: initialUsers,
    campuses: initialCampuses,
    terms: initialTerms,
    subjectCategories: initialSubjectCategories,
    subjects: initialSubjects,
    termSubjects: initialTermSubjects,
    campusPricings: initialCampusPricings,
    pricings: initialPricings,
    facilities: initialFacilities,
    timeSlots: initialTimeSlots,
    teachers: initialTeachers,
    classes: initialClasses,
    students: initialStudents,
    enrollments: initialEnrollments,
    invoices: initialInvoices,
    sessions: initialSessions,
    attendance: initialAttendance,
    makeupCredits: initialMakeupCredits,
    transfers: [],
    payrollSettlements: [],
    parentRegistrations: initialParentRegistrations,
    notifications: initialNotifications,
    auditLogs: initialAuditLogs,
    telecomConfig: {
      zaloZnsEnabled: true,
      smsBrandnameEnabled: true,
      emailEnabled: true,
      brandName: 'ROYAL SCHOOL',
    },
    supabaseConfig: {
      url: '',
      anonKey: '',
      isConnected: false,
    },
  };
}

/**
 * Deduplicate enrollments to strictly enforce unique constraint: (student_id, class_id)
 * Keeps the first active enrollment and removes any duplicate active records.
 */
export function deduplicateEnrollments(enrollments: Enrollment[] = []): Enrollment[] {
  const seenActive = new Set<string>();
  const cleanList: Enrollment[] = [];

  for (const enr of enrollments) {
    if (enr.status === 'active' || enr.status === 'trial') {
      const key = `${enr.student_id}_${enr.class_id}`;
      if (!seenActive.has(key)) {
        seenActive.add(key);
        cleanList.push(enr);
      }
    } else {
      cleanList.push(enr);
    }
  }

  return cleanList;
}

export function loadStore(): AppStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getInitialStore();
      saveStore(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    const initial = getInitialStore();

    // Migration and backward compatibility
    const terms: AcademicTerm[] = (parsed.terms || initial.terms).map((t: AcademicTerm) => ({
      ...t,
      status: t.status || (t.is_active ? 'open_enrollment' : 'draft'),
    }));

    const subjectCategories: SubjectCategory[] = 
      parsed.subjectCategories && parsed.subjectCategories.length > 0
        ? parsed.subjectCategories
        : initial.subjectCategories;

    const termSubjects: TermSubjectConfig[] = 
      parsed.termSubjects && parsed.termSubjects.length > 0
        ? parsed.termSubjects
        : initial.termSubjects;

    const campusPricings: CampusTermPricing[] = 
      parsed.campusPricings && parsed.campusPricings.length > 0
        ? parsed.campusPricings
        : initial.campusPricings;

    // Ensure users array exists and admin user is populated with requested password '123456'
    let users = parsed.users && parsed.users.length > 0 ? parsed.users : initialUsers;
    const adminUser = users.find((u: any) => u.username === 'admin');
    if (!adminUser) {
      users = [initialUsers[0], ...users];
    } else if (adminUser.password !== '123456') {
      users = users.map((u: any) => u.username === 'admin' ? { ...u, password: '123456', role: 'super_admin', status: 'active' } : u);
    }

    // Auto-clean any duplicated enrollments from stored localStorage
    const rawEnrollments: Enrollment[] = parsed.enrollments || initial.enrollments;
    const enrollments = deduplicateEnrollments(rawEnrollments);

    const auditLogs: AuditLogRecord[] = 
      parsed.auditLogs && parsed.auditLogs.length > 0
        ? parsed.auditLogs
        : initialAuditLogs;

    return {
      ...initial,
      ...parsed,
      users,
      terms,
      subjectCategories,
      termSubjects,
      campusPricings,
      enrollments,
      auditLogs,
    };
  } catch (err) {
    console.error('Failed to load store from localStorage', err);
    return getInitialStore();
  }
}

export function saveStore(store: AppStore): void {
  try {
    const cleanStore: AppStore = {
      ...store,
      enrollments: deduplicateEnrollments(store.enrollments),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanStore));
    window.dispatchEvent(new Event('royal_store_updated'));
  } catch (err) {
    console.error('Failed to save store to localStorage', err);
  }
}

// Check if term is closed (read-only mode)
export function isTermClosed(termId: string, store: AppStore): boolean {
  const term = store.terms.find(t => t.id === termId);
  return term ? term.status === 'closed' : false;
}

// Helper tính toán ưu đãi và học phí sau giảm
export function computeDiscountedFee(
  baseFee: number,
  discountType: DiscountType = 'none',
  discountValue: number = 0
): { netFee: number; discountAmount: number } {
  if (discountType === 'percentage' && discountValue > 0) {
    const validPercent = Math.min(100, Math.max(0, discountValue));
    const discountAmount = Math.round((baseFee * validPercent) / 100);
    const netFee = Math.max(0, baseFee - discountAmount);
    return { netFee, discountAmount };
  }
  if (discountType === 'fixed_amount' && discountValue > 0) {
    const discountAmount = Math.min(baseFee, Math.max(0, discountValue));
    const netFee = Math.max(0, baseFee - discountAmount);
    return { netFee, discountAmount };
  }
  return { netFee: baseFee, discountAmount: 0 };
}

// Hierarchical Pricing Calculator: Campus Override > Term Standard > Default
export function getEffectivePrice(
  termId: string,
  campusId: string,
  subjectId: string,
  store: AppStore
): EffectivePricingResult {
  // 1. Kiểm tra cấu hình Môn ở cấp Khóa trước (TermSubjectConfig)
  const termConfig = store.termSubjects?.find(
    ts => ts.term_id === termId && ts.subject_id === subjectId
  );

  const termActive = termConfig ? termConfig.is_active : true;
  const termSessions = termConfig ? termConfig.standard_sessions : 24;
  const termBaseCourseFee = termConfig ? termConfig.standard_course_fee : 3600000;
  const termDiscountType = termConfig?.discount_type || 'none';
  const termDiscountValue = termConfig?.discount_value || 0;
  const termDiscountReason = termConfig?.discount_reason || termConfig?.notes;

  // 2. Kiểm tra biểu phí ở cấp Cơ Sở (CampusTermPricing)
  const campusPricing = store.campusPricings?.find(
    cp => cp.term_id === termId && cp.campus_id === campusId && cp.subject_id === subjectId
  );

  // Nếu cơ sở thiết lập không mở môn này
  if (campusPricing && campusPricing.is_offered_at_campus === false) {
    const baseFee = campusPricing.custom_course_fee || termBaseCourseFee;
    const sessions = campusPricing.custom_sessions || termSessions;
    const { netFee, discountAmount } = computeDiscountedFee(
      baseFee,
      campusPricing.discount_type || 'none',
      campusPricing.discount_value || 0
    );
    return {
      source: 'campus_override',
      is_offered: false,
      total_sessions: sessions,
      base_course_fee: baseFee,
      course_fee: netFee,
      session_rate: calculateCeilSessionRate(netFee, sessions),
      override_pricing: !!campusPricing.override_pricing,
      discount_type: campusPricing.discount_type || 'none',
      discount_value: campusPricing.discount_value || 0,
      discount_amount: discountAmount,
      discount_reason: campusPricing.discount_reason,
      notes: 'Cơ sở hiện không mở môn học này trong khóa',
    };
  }

  // Nếu cơ sở có cấu hình Ghi Đè (Override)
  if (campusPricing && campusPricing.override_pricing && campusPricing.custom_course_fee) {
    const baseFee = campusPricing.custom_course_fee;
    const sessions = campusPricing.custom_sessions || termSessions;
    const discType = campusPricing.discount_type || 'none';
    const discVal = campusPricing.discount_value || 0;
    const discReason = campusPricing.discount_reason || campusPricing.notes;

    const { netFee, discountAmount } = computeDiscountedFee(baseFee, discType, discVal);
    const rate = calculateCeilSessionRate(netFee, sessions);

    return {
      source: 'campus_override',
      is_offered: termActive && campusPricing.is_offered_at_campus !== false,
      total_sessions: sessions,
      base_course_fee: baseFee,
      course_fee: netFee,
      session_rate: rate,
      override_pricing: true,
      discount_type: discType,
      discount_value: discVal,
      discount_amount: discountAmount,
      discount_reason: discReason,
      notes: discReason || 'Áp dụng biểu phí riêng của cơ sở',
    };
  }

  // 3. Nếu không override, kế thừa chuẩn từ Cấp Khóa Học (TermSubjectConfig)
  if (termConfig) {
    const { netFee, discountAmount } = computeDiscountedFee(
      termBaseCourseFee,
      termDiscountType,
      termDiscountValue
    );
    const rate = calculateCeilSessionRate(netFee, termSessions);

    return {
      source: 'term_standard',
      is_offered: termConfig.is_active,
      total_sessions: termSessions,
      base_course_fee: termBaseCourseFee,
      course_fee: netFee,
      session_rate: rate,
      override_pricing: false,
      discount_type: termDiscountType,
      discount_value: termDiscountValue,
      discount_amount: discountAmount,
      discount_reason: termDiscountReason,
      notes: termDiscountReason || termConfig.notes || 'Kế thừa biểu phí chuẩn của khóa học',
    };
  }

  // 4. Fallback legacy pricings nếu có
  const legacyPricing = store.pricings?.find(
    p => p.term_id === termId && p.campus_id === campusId && p.subject_id === subjectId
  );
  if (legacyPricing) {
    return {
      source: 'campus_override',
      is_offered: true,
      total_sessions: legacyPricing.total_sessions,
      base_course_fee: legacyPricing.base_price || legacyPricing.final_price,
      course_fee: legacyPricing.final_price,
      session_rate: legacyPricing.session_rate,
      override_pricing: true,
      discount_type: legacyPricing.discount_type || 'none',
      discount_value: legacyPricing.discount_value || 0,
      discount_amount: (legacyPricing.base_price || legacyPricing.final_price) - legacyPricing.final_price,
      notes: 'Biểu phí kế thừa hệ thống',
    };
  }

  // 5. Fallback mặc định
  return {
    source: 'subject_default',
    is_offered: true,
    total_sessions: 24,
    base_course_fee: 3600000,
    course_fee: 3600000,
    session_rate: 150000,
    override_pricing: false,
    discount_type: 'none',
    discount_value: 0,
    discount_amount: 0,
    notes: 'Biểu phí mặc định toàn hệ thống',
  };
}

// Clone cấu hình Khóa cũ sang Khóa mới
export function cloneTermConfiguration(
  fromTermId: string,
  newTermData: {
    code: string;
    name: string;
    academic_year: string;
    start_date: string;
    end_date: string;
    status?: TermStatus;
    description?: string;
  },
  store: AppStore
): { updatedStore: AppStore; newTermId: string } {
  const newTermId = `term_${Date.now()}`;
  const newTerm: AcademicTerm = {
    id: newTermId,
    code: newTermData.code,
    name: newTermData.name,
    academic_year: newTermData.academic_year,
    start_date: newTermData.start_date,
    end_date: newTermData.end_date,
    is_active: newTermData.status === 'open_enrollment' || newTermData.status === 'in_progress',
    status: newTermData.status || 'draft',
    description: newTermData.description || `Nhân bản từ khóa ${fromTermId}`,
  };

  // Sao chép cấu hình môn học (TermSubjectConfig)
  const sourceTermSubjects = store.termSubjects.filter(ts => ts.term_id === fromTermId);
  const newTermSubjects: TermSubjectConfig[] = sourceTermSubjects.map(ts => ({
    ...ts,
    id: `ts_${newTermId}_${ts.subject_id}_${Date.now()}`,
    term_id: newTermId,
  }));

  // Sao chép biểu phí cơ sở (CampusTermPricing)
  const sourceCampusPricings = store.campusPricings.filter(cp => cp.term_id === fromTermId);
  const newCampusPricings: CampusTermPricing[] = sourceCampusPricings.map(cp => ({
    ...cp,
    id: `cp_${newTermId}_${cp.campus_id}_${cp.subject_id}_${Date.now()}`,
    term_id: newTermId,
  }));

  const updatedStore: AppStore = {
    ...store,
    terms: [...store.terms, newTerm],
    termSubjects: [...store.termSubjects, ...newTermSubjects],
    campusPricings: [...store.campusPricings, ...newCampusPricings],
  };

  return { updatedStore, newTermId };
}

// Business Calculations
export function calculateCeilSessionRate(finalPrice: number, totalSessions: number): number {
  if (!totalSessions || totalSessions <= 0) return 0;
  return Math.ceil(finalPrice / totalSessions / 1000) * 1000;
}

export function generateStudentCode(isRoyal: boolean, existingStudents: Student[]): string {
  const currentYear = new Date().getFullYear();
  const prefix = isRoyal ? `RY-${currentYear}-` : `EXT-${currentYear}-`;
  const relevant = existingStudents.filter(s => s.code.startsWith(prefix));
  const nextNum = relevant.length + 101;
  return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

/**
 * Capitalize the first letter of each word in a string (e.g., "nguyễn văn a" -> "Nguyễn Văn A")
 */
export function formatCapitalizeWords(input: string): string {
  if (!input) return '';
  return input
    .split(' ')
    .map(word => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

// Audit Trail & Activity Logging Helper Functions
export function createAuditRecord(
  action: LogActionType,
  category: 'AUTH' | 'ACADEMIC' | 'FINANCE' | 'SYSTEM',
  target_entity: string,
  description: string,
  user?: Partial<AppUser> | null,
  options?: {
    target_id?: string;
    details?: {
      before?: any;
      after?: any;
      ip_address?: string;
      status?: 'success' | 'failed';
    };
    timestamp?: string;
  }
): AuditLogRecord {
  const ts = options?.timestamp || new Date().toISOString();

  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    academic_accountant: 'Học vụ kiêm Kế toán',
    academic_admissions: 'Học vụ kiêm Tuyển sinh',
    admissions: 'Tuyển sinh',
    teacher: 'Giáo viên bộ môn',
  };

  const roleName = user?.role ? (roleLabels[user.role] || user.role) : 'Hệ thống';

  return {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    timestamp: ts,
    user_id: user?.id || 'system',
    username: user?.username || 'system',
    user_role: roleName,
    full_name: user?.full_name || 'Hệ thống Royal School',
    action,
    category,
    target_entity,
    target_id: options?.target_id,
    description,
    details: options?.details || { status: 'success' },
  };
}

export function appendAuditLog(store: AppStore, log: AuditLogRecord): AppStore {
  const currentLogs = store.auditLogs || [];
  // Keep latest first, cap at 1000 records to prevent memory overflow
  const updatedLogs = [log, ...currentLogs].slice(0, 1000);
  return {
    ...store,
    auditLogs: updatedLogs,
  };
}
