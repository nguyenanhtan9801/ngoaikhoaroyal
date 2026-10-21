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
  LogActionType,
  CloudStorageConfig
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
  cloudStorageConfig?: CloudStorageConfig;
}

const STORAGE_KEY = 'royal_extracurricular_store_v3';

export const GOOGLE_DRIVE_FOLDER_ID = '1KVkKVyz9sQVu_22La7RTaTX7-c-_Lf1k';
export const GOOGLE_DRIVE_ROOT_URL = 'https://drive.google.com/drive/folders/1KVkKVyz9sQVu_22La7RTaTX7-c-_Lf1k?usp=sharing';

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
    cloudStorageConfig: {
      provider: 'google_drive',
      drive_folder_id: GOOGLE_DRIVE_FOLDER_ID,
      drive_folder_name: 'RoyalSchool_Storage_Drive',
      drive_root_url: GOOGLE_DRIVE_ROOT_URL,
      drive_storage_quota: {
        used_bytes: 5153960755,
        total_bytes: 107374182400,
        used_label: '4.8 GB',
        total_label: '100 GB (Google Workspace for Education)',
      },
      subfolders: {
        student_photos: '01_HinhHocSinh',
        attendance_proofs: '02_DonNghiPhep',
        admissions: '03_DonTuyenSinh',
        tuition_invoices: '04_HoaDonHocPhi',
        reports: '05_BaoCaoThongKe',
        backups: '06_SaoLuuHeThong',
      },
      auto_create_subfolders: true,
      updated_at: '2026-10-20',
      updated_by: 'ThS. Nguyễn Hoàng Long (Phòng Quản Trị & Đào Tạo)',
    },
  };
}

/**
 * Helper to build standard Google Drive paths and URLs for any file/image in the school system
 */
export function buildGoogleDriveFileInfo(
  category: 'student_photos' | 'attendance_proofs' | 'admissions' | 'tuition_invoices' | 'reports' | 'backups',
  fileName: string,
  rootFolderName = 'RoyalSchool_Storage_Drive'
) {
  const subfolderMap: Record<string, string> = {
    student_photos: '01_HinhHocSinh',
    attendance_proofs: '02_DonNghiPhep',
    admissions: '03_DonTuyenSinh',
    tuition_invoices: '04_HoaDonHocPhi',
    reports: '05_BaoCaoThongKe',
    backups: '06_SaoLuuHeThong',
  };
  const subfolder = subfolderMap[category] || '02_DonNghiPhep';
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileId = `1KVk_${category.slice(0, 4)}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const storedAt = `Google Drive: ${GOOGLE_DRIVE_FOLDER_ID}/${subfolder}/${sanitized}`;
  const driveUrl = GOOGLE_DRIVE_ROOT_URL;

  return {
    subfolder,
    storedAt,
    driveUrl,
    fileId,
    sanitizedName: sanitized,
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
    // Clear out deprecated store caches
    try {
      localStorage.removeItem('royal_extracurricular_store_v1');
      localStorage.removeItem('royal_extracurricular_store_v2');
    } catch {
      // noop
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getInitialStore();
      saveStore(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    const initial = getInitialStore();

    // If cached store is from old schema/count (not 50 students or not 5 classes), reset to initial
    if (!parsed.students || parsed.students.length !== 50 || !parsed.classes || parsed.classes.length !== 5) {
      saveStore(initial);
      return initial;
    }

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

    const cloudStorageConfig: CloudStorageConfig = {
      ...(initial.cloudStorageConfig || {
        provider: 'google_drive',
        drive_folder_id: GOOGLE_DRIVE_FOLDER_ID,
        drive_folder_name: 'RoyalSchool_Storage_Drive',
        drive_root_url: GOOGLE_DRIVE_ROOT_URL,
        subfolders: {
          student_photos: '01_HinhHocSinh',
          attendance_proofs: '02_DonNghiPhep',
          admissions: '03_DonTuyenSinh',
          tuition_invoices: '04_HoaDonHocPhi',
          reports: '05_BaoCaoThongKe',
          backups: '06_SaoLuuHeThong',
        },
        auto_create_subfolders: true,
      }),
      ...(parsed.cloudStorageConfig || {}),
      provider: 'google_drive',
      drive_folder_id: (parsed.cloudStorageConfig?.drive_folder_id && parsed.cloudStorageConfig.drive_folder_id !== '1RoyalSchool_Drive_Storage_PMH_PL_2026' && parsed.cloudStorageConfig.drive_folder_id !== '1A9xK_RoyalSchool_Extracurricular_Proof_2026')
        ? parsed.cloudStorageConfig.drive_folder_id
        : GOOGLE_DRIVE_FOLDER_ID,
      drive_root_url: (parsed.cloudStorageConfig?.drive_root_url && !parsed.cloudStorageConfig.drive_root_url.includes('1RoyalSchool_Drive_Storage_PMH_PL_2026'))
        ? parsed.cloudStorageConfig.drive_root_url
        : GOOGLE_DRIVE_ROOT_URL,
      subfolders: {
        ...(initial.cloudStorageConfig?.subfolders || {
          student_photos: '01_HinhHocSinh',
          attendance_proofs: '02_DonNghiPhep',
          admissions: '03_DonTuyenSinh',
          tuition_invoices: '04_HoaDonHocPhi',
          reports: '05_BaoCaoThongKe',
          backups: '06_SaoLuuHeThong',
        }),
        ...(parsed.cloudStorageConfig?.subfolders || {}),
      },
    };

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
      cloudStorageConfig,
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

const JS_DAY_TO_VN_CODE: Record<number, string> = {
  0: 'CN',
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
};

export const VN_DAY_NAME_MAP: Record<string, string> = {
  'T2': 'Thứ 2',
  'T3': 'Thứ 3',
  'T4': 'Thứ 4',
  'T5': 'Thứ 5',
  'T6': 'Thứ 6',
  'T7': 'Thứ 7',
  'CN': 'Chủ Nhật',
};

export function getDayLabel(dayCode: string): string {
  return VN_DAY_NAME_MAP[dayCode] || dayCode;
}

export function getDayCodeFromDate(dateStr: string): string {
  if (!dateStr) return 'T2';
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return 'T2';
  return JS_DAY_TO_VN_CODE[d.getDay()] || 'T2';
}

export const getDateDayCode = getDayCodeFromDate;

export function formatDaysListLabel(days: string[]): string {
  if (!days || days.length === 0) return '';
  return days.map(d => getDayLabel(d)).join(' & ');
}

export function formatStudentScheduleLabel(enrolledDays?: string[], classDays?: string[]): string {
  const effectiveClassDays = classDays && classDays.length > 0 ? classDays : ['T2', 'T4'];
  const effectiveEnrolled =
    enrolledDays && enrolledDays.length > 0
      ? enrolledDays.filter(d => effectiveClassDays.includes(d))
      : effectiveClassDays;

  if (effectiveEnrolled.length < effectiveClassDays.length && effectiveEnrolled.length > 0) {
    return `Chỉ học ${formatDaysListLabel(effectiveEnrolled)}`;
  }
  return formatDaysListLabel(effectiveClassDays);
}

/**
 * Kiểm tra học sinh có lịch học vào buổi/ngày điểm danh hay không
 */
export function shouldStudentAttendSession(
  enrollment: Enrollment | undefined,
  sessionDateOrDayCode: string
): boolean {
  if (!enrollment) return true;
  if (!enrollment.enrolled_days_of_week || enrollment.enrolled_days_of_week.length === 0) {
    return true;
  }
  const dayCode = sessionDateOrDayCode.includes('-')
    ? getDayCodeFromDate(sessionDateOrDayCode)
    : sessionDateOrDayCode;
  return enrollment.enrolled_days_of_week.includes(dayCode);
}

export function isStudentScheduledForDate(
  enrollment: Enrollment | undefined,
  sessionDate: string,
  classDays?: string[]
): boolean {
  if (!enrollment) return true;
  if (enrollment.joined_date && sessionDate < enrollment.joined_date) {
    return false;
  }
  const effectiveStudentDays =
    enrollment.enrolled_days_of_week && enrollment.enrolled_days_of_week.length > 0
      ? enrollment.enrolled_days_of_week
      : classDays && classDays.length > 0
      ? classDays
      : [];
  if (effectiveStudentDays.length === 0) return true;
  const dayCode = getDayCodeFromDate(sessionDate);
  return effectiveStudentDays.includes(dayCode);
}

export function formatDateVN(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function getClassDaysOfWeek(
  classItem: ExtracurricularClass | undefined,
  storeOrTimeSlots?: AppStore | { id: string; days_of_week?: string[] }[]
): string[] {
  if (!classItem) return ['T2', 'T4'];
  if (classItem.days_of_week && classItem.days_of_week.length > 0) {
    return classItem.days_of_week;
  }
  const timeSlots = Array.isArray(storeOrTimeSlots)
    ? storeOrTimeSlots
    : storeOrTimeSlots?.timeSlots;
  const slot = timeSlots?.find(ts => ts.id === classItem.time_slot_id);
  if (slot && slot.days_of_week && slot.days_of_week.length > 0) {
    return slot.days_of_week;
  }
  return ['T2', 'T4'];
}

export function getDefaultClassStartDate(
  classItem: ExtracurricularClass,
  store: AppStore,
  referenceDateStr?: string,
  enrolledDaysOfWeek?: string[]
): string {
  const term = store.terms?.find(t => t.id === classItem.term_id);
  const termStart = term?.start_date || '2026-09-01';
  const termEnd = term?.end_date || '2026-12-25';
  const todayStr = referenceDateStr || new Date().toISOString().split('T')[0];

  let baseDateStr = todayStr;
  if (baseDateStr < termStart) baseDateStr = termStart;
  if (baseDateStr > termEnd) baseDateStr = termStart;

  const classDays = getClassDaysOfWeek(classItem, store);
  const activeDays =
    enrolledDaysOfWeek && enrolledDaysOfWeek.length > 0
      ? enrolledDaysOfWeek.filter(d => classDays.includes(d))
      : classDays;
  const targetDays = activeDays.length > 0 ? activeDays : classDays;

  const startCursor = new Date(`${baseDateStr}T00:00:00`);
  const endCursor = new Date(`${termEnd}T00:00:00`);

  if (!isNaN(startCursor.getTime()) && !isNaN(endCursor.getTime())) {
    const cursor = new Date(startCursor);
    while (cursor <= endCursor) {
      const vnDay = JS_DAY_TO_VN_CODE[cursor.getDay()];
      if (targetDays.includes(vnDay)) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, '0');
        const d = String(cursor.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return baseDateStr;
}

export interface RemainingSessionsResult {
  totalSessions: number;
  maxStudentSessionsInCourse: number;
  remainingSessions: number;
  elapsedSessions: number;
  termStartDate: string;
  termEndDate: string;
  daysOfWeek: string[];
  enrolledDaysOfWeek: string[];
  isPartialSchedule: boolean;
  sessionRate: number;
  fullCourseFee: number;
  proratedFee: number;
  isMidCourse: boolean;
}

/**
 * Thuật toán đếm số buổi còn lại theo lịch học của lớp + các thứ học sinh thực học từ startDate đến hết khóa (endDate)
 */
export function calculateRemainingSessions(
  classItem: ExtracurricularClass,
  startDate: string,
  store: AppStore,
  enrolledDaysOfWeek?: string[]
): RemainingSessionsResult {
  const term = store.terms?.find(t => t.id === classItem.term_id);
  const termStartDate = term?.start_date || '2026-09-01';
  const termEndDate = term?.end_date || '2026-12-25';
  const totalSessions = classItem.total_sessions || 24;
  const fullCourseFee = classItem.full_course_fee || 3600000;
  const sessionRate =
    classItem.price_per_session || calculateCeilSessionRate(fullCourseFee, totalSessions);
  const daysOfWeek = getClassDaysOfWeek(classItem, store);

  const validEnrolledDays =
    enrolledDaysOfWeek && enrolledDaysOfWeek.length > 0
      ? enrolledDaysOfWeek.filter(d => daysOfWeek.includes(d))
      : daysOfWeek;
  const finalEnrolledDays = validEnrolledDays.length > 0 ? validEnrolledDays : [daysOfWeek[0] || 'T2'];
  const isPartialSchedule = finalEnrolledDays.length < daysOfWeek.length;

  // Tổng số buổi chuẩn của cả khóa ứng với các thứ học sinh đăng ký (VD: Lớp 24 buổi [T2, T4], chọn [T2] -> 12 buổi)
  const maxStudentSessionsInCourse = isPartialSchedule
    ? Math.max(1, Math.round((totalSessions * finalEnrolledDays.length) / Math.max(1, daysOfWeek.length)))
    : totalSessions;

  const effectiveStartStr = startDate || termStartDate;

  // Nếu chọn ngày bắt đầu từ đầu khóa trở về trước
  if (effectiveStartStr <= termStartDate) {
    const proratedFee = isPartialSchedule ? maxStudentSessionsInCourse * sessionRate : fullCourseFee;
    return {
      totalSessions,
      maxStudentSessionsInCourse,
      remainingSessions: maxStudentSessionsInCourse,
      elapsedSessions: 0,
      termStartDate,
      termEndDate,
      daysOfWeek,
      enrolledDaysOfWeek: finalEnrolledDays,
      isPartialSchedule,
      sessionRate,
      fullCourseFee,
      proratedFee,
      isMidCourse: false,
    };
  }

  // Duyệt từ startDate đến endDate để đếm số buổi học rơi vào đúng các thứ mà học sinh đã chọn
  let remainingCount = 0;
  const startObj = new Date(`${effectiveStartStr}T00:00:00`);
  const endObj = new Date(`${termEndDate}T00:00:00`);

  if (!isNaN(startObj.getTime()) && !isNaN(endObj.getTime()) && startObj <= endObj) {
    const cursor = new Date(startObj);
    while (cursor <= endObj) {
      const vnDay = JS_DAY_TO_VN_CODE[cursor.getDay()];
      if (finalEnrolledDays.includes(vnDay)) {
        remainingCount += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Giới hạn tối đa không vượt quá maxStudentSessionsInCourse
  const clampedRemaining = Math.min(maxStudentSessionsInCourse, Math.max(0, remainingCount));
  const elapsedSessions = Math.max(0, maxStudentSessionsInCourse - clampedRemaining);
  const isMidCourse = clampedRemaining < maxStudentSessionsInCourse;
  const proratedFee =
    isMidCourse || isPartialSchedule ? clampedRemaining * sessionRate : fullCourseFee;

  return {
    totalSessions,
    maxStudentSessionsInCourse,
    remainingSessions: clampedRemaining,
    elapsedSessions,
    termStartDate,
    termEndDate,
    daysOfWeek,
    enrolledDaysOfWeek: finalEnrolledDays,
    isPartialSchedule,
    sessionRate,
    fullCourseFee,
    proratedFee,
    isMidCourse,
  };
}

export interface ProratedPricingBreakdown {
  totalSessions: number;
  effectiveSessions: number;
  elapsedSessions: number;
  sessionRate: number;
  fullCourseFee: number;
  proratedGrossFee: number;
  discountPercent: number;
  discountAmount: number;
  discountLabel: string;
  netPayable: number;
  isMidCourse: boolean;
}

/**
 * Tính biểu phí chi tiết theo số buổi thực tế (hỗ trợ lịch bán phần theo thứ, vào giữa khóa & ưu đãi học sinh Royal / chính sách cơ sở)
 */
export function calculateClassProratedPricing(
  classItem: ExtracurricularClass,
  effectiveSessions: number,
  isRoyalStudent: boolean,
  store: AppStore
): ProratedPricingBreakdown {
  const totalSessions = classItem.total_sessions || 24;
  const validSessions = Math.min(totalSessions, Math.max(0, Math.round(effectiveSessions)));
  const elapsedSessions = Math.max(0, totalSessions - validSessions);
  const fullCourseFee = classItem.full_course_fee || 3600000;
  const sessionRate =
    classItem.price_per_session || calculateCeilSessionRate(fullCourseFee, totalSessions);

  const isMidCourse = validSessions < totalSessions;
  const proratedGrossFee = isMidCourse ? validSessions * sessionRate : fullCourseFee;

  // Kiểm tra chính sách ưu đãi
  const effectivePrice = getEffectivePrice(
    classItem.term_id,
    classItem.campus_id,
    classItem.subject_id,
    store
  );

  let discountPercent = 0;
  let discountAmount = 0;
  let discountLabel = 'Không áp dụng';

  if (isRoyalStudent) {
    discountPercent =
      effectivePrice.discount_type === 'percentage' && effectivePrice.discount_value > 5
        ? effectivePrice.discount_value
        : 5;
    discountAmount = Math.round((proratedGrossFee * discountPercent) / 100);
    discountLabel = `Ưu đãi HS Royal (${discountPercent}%)`;
  } else if (
    effectivePrice.discount_type === 'percentage' &&
    effectivePrice.discount_value > 0 &&
    !effectivePrice.discount_reason?.toLowerCase().includes('royal')
  ) {
    discountPercent = effectivePrice.discount_value;
    discountAmount = Math.round((proratedGrossFee * discountPercent) / 100);
    discountLabel = effectivePrice.discount_reason || `Ưu đãi khóa học (${discountPercent}%)`;
  } else if (
    effectivePrice.discount_type === 'fixed_amount' &&
    effectivePrice.discount_value > 0 &&
    !effectivePrice.discount_reason?.toLowerCase().includes('royal')
  ) {
    const ratio = totalSessions > 0 ? validSessions / totalSessions : 1;
    discountAmount = Math.min(proratedGrossFee, Math.round(effectivePrice.discount_value * ratio));
    discountLabel = effectivePrice.discount_reason || 'Ưu đãi giảm trực tiếp';
  }

  const netPayable = Math.max(0, proratedGrossFee - discountAmount);

  return {
    totalSessions,
    effectiveSessions: validSessions,
    elapsedSessions,
    sessionRate,
    fullCourseFee,
    proratedGrossFee,
    discountPercent,
    discountAmount,
    discountLabel,
    netPayable,
    isMidCourse,
  };
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

import { formatCapitalizedName } from './formatters';

/**
 * Capitalize the first letter of each word in a string (e.g., "nguyễn văn a" -> "Nguyễn Văn A")
 */
export function formatCapitalizeWords(input: string): string {
  return formatCapitalizedName(input);
}
export { formatCapitalizedName };

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
      [key: string]: any;
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

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function compressAndConvertToBase64(file: File): Promise<{
  base64: string;
  fileName: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatio: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp tin'));
    reader.onload = (e) => {
      const dataUrl = (e.target?.result as string) || '';
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      resolve({
        base64: dataUrl,
        fileName: sanitizedName,
        originalSizeBytes: file.size,
        compressedSizeBytes: Math.round(file.size * 0.75),
        compressionRatio: '25%',
      });
    };
    reader.readAsDataURL(file);
  });
}

export function triggerFileDownload(fileName: string, urlOrBase64: string): void {
  if (!urlOrBase64) return;
  const link = document.createElement('a');
  link.href = urlOrBase64;
  link.download = fileName || 'download';
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function uploadFileToServer(
  base64Data: string,
  fileName: string,
  folder: 'students' | 'proofs' | 'admissions' = 'students'
): Promise<{
  success: boolean;
  url: string;
  driveUrl: string;
  storedAt: string;
  fileName: string;
}> {
  const category =
    folder === 'students'
      ? 'student_photos'
      : folder === 'proofs'
      ? 'attendance_proofs'
      : 'admissions';
  const info = buildGoogleDriveFileInfo(category, fileName);
  return {
    success: true,
    url: base64Data || info.driveUrl,
    driveUrl: GOOGLE_DRIVE_ROOT_URL,
    storedAt: info.storedAt,
    fileName: info.sanitizedName,
  };
}

export async function uploadToSupabaseBucket(
  file: File,
  bucketName = 'royal-storage'
): Promise<{ success: boolean; url: string }> {
  const res = await compressAndConvertToBase64(file);
  return {
    success: true,
    url: res.base64,
  };
}

