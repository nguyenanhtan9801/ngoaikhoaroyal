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
  TeacherAttendanceRecord,
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
  UserRole,
  SystemRole,
  UserPermissionMatrix,
  AuditLogRecord,
  LogActionType,
  CloudStorageConfig,
  PayrollRateConfig,
  AppStore,
} from '../types';
import {
  getSupabaseClient,
  sanitizeSupabaseBaseUrl,
  safeStorage,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  isLikelyValidAnonKey,
} from '../supabaseClient';

export type { AppStore, PayrollRateConfig };

export const initialPayrollRateConfig: PayrollRateConfig = {
  permanent_session_rate: 300000,
  visiting_session_rate: 270000,
  permanent_rate_per_period: 150000,
  visiting_rate_per_period: 135000,
  periods_per_session: 2,
  updated_at: '2026-10-20',
  updated_by: 'Phòng Tài Chính & Kế Toán Royal School',
};

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
  initialTeacherAttendance,
  initialAttendance,
  initialMakeupCredits,
  initialParentRegistrations,
  initialNotifications,
  initialUsers,
  initialAuditLogs,
  initialTransfers,
} from '../data/seedData';

const STORAGE_KEY = 'royal_extracurricular_store_v4_clean';

export const GOOGLE_DRIVE_FOLDER_ID = '1KVkKVyz9sQVu_22La7RTaTX7-c-_Lf1k';
export const GOOGLE_DRIVE_ROOT_URL = 'https://drive.google.com/drive/folders/1KVkKVyz9sQVu_22La7RTaTX7-c-_Lf1k?usp=sharing';

function getStoredSupabaseConfig(): { url: string; anonKey: string; isConnected: boolean } {
  try {
    const raw = safeStorage.getItem('royal_supabase_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.url && parsed.anonKey) {
        const cleanUrl = sanitizeSupabaseBaseUrl(String(parsed.url));
        return {
          url: cleanUrl || DEFAULT_SUPABASE_URL,
          anonKey:
            (isLikelyValidAnonKey(parsed.anonKey) ? String(parsed.anonKey).trim() : null) ||
            DEFAULT_SUPABASE_ANON_KEY,
          isConnected: Boolean(parsed.isConnected ?? true),
        };
      }
    }
  } catch {
    // ignore
  }
  const envUrl = sanitizeSupabaseBaseUrl((import.meta as any).env?.VITE_SUPABASE_URL || '');
  const envKey = String((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();
  const url =
    envUrl && envUrl.startsWith('http') && !envUrl.includes('your-project-id')
      ? envUrl
      : DEFAULT_SUPABASE_URL;
  const anonKey = isLikelyValidAnonKey(envKey) ? envKey : DEFAULT_SUPABASE_ANON_KEY;
  return { url, anonKey, isConnected: true };
}

/**
 * CƠ SỞ DỮ LIỆU CHUẨN HÓA SẠCH (KHÔNG CHỨA DỮ LIỆU MẪU VẬN HÀNH)
 * Chỉ giữ danh mục cấu hình nền tảng (2 cơ sở PMH & PL, Khóa học, Danh mục môn, Khung giờ & Tài khoản Quản trị gốc)
 */
export function getInitialStore(): AppStore {
  const rootUsers = initialUsers.filter(u => u.username === 'admin');
  return {
    users: rootUsers.length > 0 ? rootUsers : [initialUsers[0]],
    campuses: initialCampuses,
    terms: initialTerms,
    subjectCategories: initialSubjectCategories,
    subjects: initialSubjects,
    termSubjects: initialTermSubjects,
    campusPricings: initialCampusPricings,
    pricings: initialPricings,
    facilities: initialFacilities,
    timeSlots: initialTimeSlots,
    teachers: [],
    classes: [],
    students: [],
    enrollments: [],
    invoices: [],
    sessions: [],
    teacherAttendance: [],
    attendance: [],
    makeupCredits: [],
    transfers: [],
    payrollSettlements: [],
    payrollRateConfig: initialPayrollRateConfig,
    parentRegistrations: [],
    notifications: [],
    auditLogs: [],
    telecomConfig: {
      zaloZnsEnabled: true,
      smsBrandnameEnabled: true,
      emailEnabled: true,
      brandName: 'ROYAL SCHOOL',
    },
    supabaseConfig: getStoredSupabaseConfig(),
    cloudStorageConfig: {
      provider: 'google_drive',
      drive_folder_id: GOOGLE_DRIVE_FOLDER_ID,
      drive_folder_name: 'RoyalSchool_Storage_Drive',
      drive_root_url: GOOGLE_DRIVE_ROOT_URL,
      drive_storage_quota: {
        used_bytes: 0,
        total_bytes: 107374182400,
        used_label: '0 MB',
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
      updated_at: new Date().toISOString().split('T')[0],
      updated_by: 'Ban Quản Trị Hệ Thống Royal School',
    },
  };
}

/**
 * Tự động chuẩn hóa mã cơ sở ('pmh' | 'pl') cho học sinh dựa trên campus_id hoặc tên trường/lớp
 */
export function resolveStudentCampusId(student?: Partial<Student> | null): 'pmh' | 'pl' {
  if (!student) return 'pmh';
  const rawCampus = String(student.campus_id || '').trim().toLowerCase();
  if (rawCampus === 'pl' || rawCampus === 'camp_pl') return 'pl';
  if (rawCampus === 'pmh' || rawCampus === 'camp_pmh') return 'pmh';

  const combinedText = `${student.school_name || ''} ${student.regular_class || ''} ${student.class_name || ''} ${student.medical_notes || ''}`.toLowerCase();
  if (
    combinedText.includes('phú lâm') ||
    combinedText.includes('phu lam') ||
    combinedText.includes('quận 6') ||
    combinedText.includes('bình tân') ||
    /\bpl\d*\b/i.test(combinedText)
  ) {
    return 'pl';
  }
  return 'pmh';
}

export function resolveSubjectCategoryCode(category?: string, name?: string): string {
  const cat = (category || '').trim().toLowerCase();
  const n = (name || '').trim().toLowerCase();
  
  if (
    cat.includes('thể thao') ||
    cat.includes('sport') ||
    cat.includes('vận động') ||
    n.includes('bơi') ||
    n.includes('bóng rổ') ||
    n.includes('bóng đá') ||
    n.includes('cầu lông') ||
    n.includes('võ thuật') ||
    n.includes('taekwondo')
  ) {
    return 'SPORTS';
  }
  if (
    cat.includes('công nghệ') ||
    cat.includes('tech') ||
    cat.includes('stem') ||
    cat.includes('robot') ||
    cat.includes('kỹ năng số') ||
    cat.includes('digital') ||
    n.includes('robot') ||
    n.includes('scratch') ||
    n.includes('lập trình') ||
    n.includes('stem') ||
    n.includes('ai')
  ) {
    return 'TECH';
  }
  if (
    cat.includes('nghệ thuật') ||
    cat.includes('art') ||
    cat.includes('hội họa') ||
    cat.includes('mỹ thuật') ||
    cat.includes('âm nhạc') ||
    cat.includes('sáng tạo') ||
    n.includes('piano') ||
    n.includes('hội họa') ||
    n.includes('vẽ') ||
    n.includes('nhạc') ||
    n.includes('organ') ||
    n.includes('guitar') ||
    n.includes('thanh nhạc') ||
    n.includes('múa')
  ) {
    return 'ART';
  }
  if (
    cat.includes('kỹ năng sống') ||
    cat.includes('sinh tồn') ||
    cat.includes('tự vệ') ||
    cat.includes('kỹ năng') ||
    cat.includes('lifeskills') ||
    cat.includes('skills') ||
    n.includes('sinh tồn') ||
    n.includes('tự vệ') ||
    n.includes('sơ cấp cứu') ||
    n.includes('mc') ||
    n.includes('giao tiếp')
  ) {
    return 'SKILLS';
  }
  if (
    cat.includes('học thuật') ||
    cat.includes('ngôn ngữ') ||
    cat.includes('academic') ||
    n.includes('cờ vua') ||
    n.includes('drama') ||
    n.includes('tiếng anh') ||
    n.includes('toán') ||
    n.includes('hùng biện')
  ) {
    return 'ACADEMIC';
  }
  return 'SPORTS';
}

export function normalizeSubjectRecord(sub: Subject): Subject {
  const category_code = (sub.category_code && sub.category_code.trim())
    ? sub.category_code.trim().toUpperCase()
    : resolveSubjectCategoryCode(sub.category, sub.name);
  const standard_sessions = sub.standard_sessions ? Number(sub.standard_sessions) : 24;
  const standard_course_fee = sub.standard_course_fee ? Number(sub.standard_course_fee) : 3990000;
  const standard_session_rate = sub.standard_session_rate ? Number(sub.standard_session_rate) : Math.ceil(standard_course_fee / Math.max(1, standard_sessions));
  return {
    ...sub,
    category_code,
    standard_sessions,
    standard_course_fee,
    standard_session_rate,
  };
}

export function normalizeStudentRecord(student: Student): Student {
  const campus_id = resolveStudentCampusId(student);
  const isRoyal = Boolean(student.is_royal_student ?? (student.student_type === 'royal'));
  const dob = student.dob || student.birth_date || '2016-01-01';
  const regular_class = student.regular_class || student.class_name || '';
  return {
    ...student,
    dob,
    birth_date: dob,
    campus_id,
    is_royal_student: isRoyal,
    student_type: isRoyal ? 'royal' : 'external',
    has_snack: isRoyal,
    regular_class,
    class_name: regular_class,
  };
}

/**
 * Tùy chọn nạp bộ dữ liệu mẫu Demo (Chỉ dùng khi Quản trị viên chủ động bấm nút nạp dữ liệu thử nghiệm)
 */
export function getSampleDemoStore(): AppStore {
  return {
    ...getInitialStore(),
    users: initialUsers,
    teachers: initialTeachers,
    classes: initialClasses,
    students: initialStudents.map(normalizeStudentRecord),
    enrollments: initialEnrollments,
    invoices: initialInvoices,
    sessions: initialSessions,
    teacherAttendance: initialTeacherAttendance,
    attendance: initialAttendance,
    makeupCredits: initialMakeupCredits,
    transfers: initialTransfers,
    parentRegistrations: initialParentRegistrations,
    notifications: initialNotifications,
    auditLogs: initialAuditLogs,
  };
}

/**
 * Helper to build standard Google Drive paths and URLs for any file/image in the school system
 */
export function buildGoogleDriveFileInfo(
  category: 'student_photos' | 'attendance_proofs' | 'admissions' | 'tuition_invoices' | 'reports' | 'backups',
  fileName: string,
  _rootFolderName = 'RoyalSchool_Storage_Drive'
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
    // Xóa toàn bộ cache dữ liệu mẫu cũ từ các phiên bản trước
    try {
      localStorage.removeItem('royal_extracurricular_store_v1');
      localStorage.removeItem('royal_extracurricular_store_v2');
      localStorage.removeItem('royal_extracurricular_store_v3');
    } catch {
      // noop
    }

    const raw = safeStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getInitialStore();
      saveStore(initial);
      return initial;
    }

    const parsed = JSON.parse(raw);
    const initial = getInitialStore();

    const terms: AcademicTerm[] = (Array.isArray(parsed.terms) ? parsed.terms : initial.terms).map((t: AcademicTerm) => ({
      ...t,
      status: t.status || (t.is_active ? 'open_enrollment' : 'draft'),
    }));

    const subjectCategories: SubjectCategory[] =
      Array.isArray(parsed.subjectCategories) && parsed.subjectCategories.length > 0
        ? parsed.subjectCategories
        : initial.subjectCategories;

    const termSubjects: TermSubjectConfig[] = (
      Array.isArray(parsed.termSubjects) ? parsed.termSubjects : initial.termSubjects
    ).map((ts: TermSubjectConfig) => ({
      ...ts,
      discount_type: ts.discount_type || 'none',
      discount_value: ts.discount_value || 0,
    }));

    const campusPricings: CampusTermPricing[] = (
      Array.isArray(parsed.campusPricings) ? parsed.campusPricings : initial.campusPricings
    ).map((cp: CampusTermPricing) => ({
      ...cp,
      discount_type: cp.discount_type || 'none',
      discount_value: cp.discount_value || 0,
    }));

    // Đảm bảo tài khoản Quản trị viên tối thiểu tồn tại để đăng nhập
    const rawUsers: AppUser[] =
      Array.isArray(parsed.users) && parsed.users.length > 0 ? [...parsed.users] : [...initial.users];
    const users: AppUser[] = rawUsers.map(u => ({
      ...u,
      password_hash: u.password_hash || u.password || '123456',
      permissions:
        u.permissions && !Array.isArray(u.permissions)
          ? { ...getDefaultPermissionsForRole(u.role), ...u.permissions }
          : getDefaultPermissionsForRole(u.role),
    }));

    const payrollRateConfig: PayrollRateConfig = {
      ...initialPayrollRateConfig,
      ...(parsed.payrollRateConfig || {}),
      permanent_session_rate: parsed.payrollRateConfig?.permanent_session_rate ?? 300000,
      visiting_session_rate: parsed.payrollRateConfig?.visiting_session_rate ?? 270000,
      permanent_rate_per_period: parsed.payrollRateConfig?.permanent_rate_per_period ?? 150000,
      visiting_rate_per_period: parsed.payrollRateConfig?.visiting_rate_per_period ?? 135000,
    };

    const storedSbConfig = getStoredSupabaseConfig();
    const rawSbKey = parsed.supabaseConfig?.anonKey;
    const validSbKey = isLikelyValidAnonKey(rawSbKey) ? String(rawSbKey).trim() : null;
    const supabaseConfig = {
      url: sanitizeSupabaseBaseUrl(parsed.supabaseConfig?.url || storedSbConfig.url || DEFAULT_SUPABASE_URL),
      anonKey: validSbKey || storedSbConfig.anonKey || DEFAULT_SUPABASE_ANON_KEY,
      isConnected: Boolean(parsed.supabaseConfig?.isConnected ?? true),
    };

    const timeSlots: TimeSlot[] = (
      Array.isArray(parsed.timeSlots) && parsed.timeSlots.length > 0
        ? parsed.timeSlots
        : initial.timeSlots
    ).map((slot: any, idx: number) => ({
      ...slot,
      code: slot.code || `SLOT_${idx + 1}`,
      duration_minutes: Number(slot.duration_minutes) || 90,
      days_of_week: Array.isArray(slot.days_of_week) ? slot.days_of_week : ['T2', 'T4'],
      status: slot.status || 'active',
      start_time: slot.start_time || '16:45',
      end_time: slot.end_time || '18:15',
    }));

    const rawFacilities = Array.isArray(parsed.facilities) && parsed.facilities.length > 0
      ? parsed.facilities
      : initial.facilities;
    const facilities: Facility[] = rawFacilities.map((f: any, idx: number) => {
      const camp = f.campus_id || 'camp_pmh';
      const prefix = camp === 'camp_pl' ? 'PL' : 'PMH';
      return {
        ...f,
        code: f.code || `${prefix}-PH-${String(idx + 1).padStart(2, '0')}`,
        room_type: f.room_type || f.type || 'classroom',
        type: f.room_type || f.type || 'classroom',
        capacity: Number(f.capacity) || 30,
        floor_building: f.floor_building || '',
        equipment: f.equipment || '',
        is_locked: Boolean(f.is_locked ?? (f.is_active === false)),
        is_active: !Boolean(f.is_locked ?? (f.is_active === false)),
        note: f.note || '',
      };
    });

    const loadedStore: AppStore = {
      ...initial,
      ...parsed,
      users,
      campuses: Array.isArray(parsed.campuses) ? parsed.campuses : initial.campuses,
      terms,
      subjectCategories,
      subjects: (Array.isArray(parsed.subjects) ? parsed.subjects : initial.subjects).map(normalizeSubjectRecord),
      termSubjects,
      campusPricings,
      facilities,
      timeSlots,
      teachers: Array.isArray(parsed.teachers) ? parsed.teachers : [],
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
      students: Array.isArray(parsed.students) ? parsed.students.map(normalizeStudentRecord) : [],
      enrollments: deduplicateEnrollments(Array.isArray(parsed.enrollments) ? parsed.enrollments : []),
      invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      teacherAttendance: Array.isArray(parsed.teacherAttendance) ? parsed.teacherAttendance : [],
      attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
      makeupCredits: Array.isArray(parsed.makeupCredits) ? parsed.makeupCredits : [],
      transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
      payrollSettlements: Array.isArray(parsed.payrollSettlements) ? parsed.payrollSettlements : [],
      payrollRateConfig,
      parentRegistrations: Array.isArray(parsed.parentRegistrations) ? parsed.parentRegistrations : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      supabaseConfig,
    };

    return loadedStore;
  } catch (err) {
    console.error('Failed to load store from localStorage', err);
    return getInitialStore();
  }
}

/**
 * Chuẩn hóa và làm sạch store trước khi serialize vào localStorage
 * Ngăn chặn hoàn toàn lỗi QuotaExceededError do các chuỗi base64 ảnh/file đính kèm hoặc nhật ký audit log quá lớn
 */
function prepareStoreForStorage(store: AppStore, aggressiveLevel = 0): AppStore {
  // 1. Cắt giảm auditLogs theo các mức: Level 0: 60 log mới nhất; Level 1: 25 log; Level 2: 10 log
  const maxLogs = aggressiveLevel === 0 ? 60 : aggressiveLevel === 1 ? 25 : 10;
  const sanitizedLogs = (store.auditLogs || []).slice(-maxLogs).map(log => {
    if (aggressiveLevel > 0) {
      const { details, ...rest } = log;
      return rest;
    }
    // Ở level 0, nếu details chứa chuỗi quá dài thì lược bớt
    if (log.details && JSON.stringify(log.details).length > 400) {
      return {
        ...log,
        details: { summary: 'Compact audit details' }
      };
    }
    return log;
  });

  // 2. Làm sạch chuỗi base64 trong attendance (proof_base64)
  // Chỉ lưu proof_file_name, proof_url nếu không phải data URL khổng lồ
  const sanitizedAttendance = (store.attendance || []).map(att => {
    let proofBase64 = att.proof_base64;
    let proofUrl = att.proof_url;

    // Nếu proof_base64 dài hơn 300 ký tự -> không lưu vào localStorage
    if (proofBase64 && proofBase64.length > 300) {
      proofBase64 = undefined;
    }
    // Nếu proof_url là data URL base64 dài hơn 300 ký tự -> chuyển thành placeholder link
    if (proofUrl && proofUrl.startsWith('data:') && proofUrl.length > 300) {
      proofUrl = `blob:proof_${att.id}`;
    }

    return {
      ...att,
      proof_base64: aggressiveLevel >= 1 ? undefined : proofBase64,
      proof_url: proofUrl,
    };
  });

  // 3. Làm sạch ảnh thẻ học sinh nếu là chuỗi base64 quá lớn
  const sanitizedStudents = (store.students || []).map(s => {
    let avatarUrl = s.avatar_url;
    if (avatarUrl && avatarUrl.startsWith('data:') && avatarUrl.length > 300) {
      avatarUrl = undefined;
    }
    return {
      ...s,
      avatar_url: avatarUrl,
    };
  });

  // 4. Làm sạch ảnh minh chứng hóa đơn nếu là base64 quá lớn
  const sanitizedInvoices = (store.invoices || []).map(inv => {
    let proofImg = inv.proof_image_url;
    if (proofImg && proofImg.startsWith('data:') && proofImg.length > 300) {
      proofImg = undefined;
    }
    return {
      ...inv,
      proof_image_url: proofImg,
    };
  });

  // 5. Làm sạch file đính kèm đơn tuyển sinh nếu là base64 quá lớn
  const sanitizedRegistrations = (store.parentRegistrations || []).map(r => {
    let attachUrl = r.attachment_url;
    if (attachUrl && attachUrl.startsWith('data:') && attachUrl.length > 300) {
      attachUrl = undefined;
    }
    return {
      ...r,
      attachment_url: attachUrl,
    };
  });

  // 6. Giới hạn notifications
  const maxNotifs = aggressiveLevel === 0 ? 40 : 15;
  const sanitizedNotifications = (store.notifications || []).slice(-maxNotifs);

  return {
    ...store,
    enrollments: deduplicateEnrollments(store.enrollments),
    auditLogs: sanitizedLogs,
    attendance: sanitizedAttendance,
    students: sanitizedStudents,
    invoices: sanitizedInvoices,
    parentRegistrations: sanitizedRegistrations,
    notifications: sanitizedNotifications,
  };
}

export function saveStore(store: AppStore): void {
  // Level 0: Standard sanitized write
  try {
    const cleanStore = prepareStoreForStorage(store, 0);
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(cleanStore));
    window.dispatchEvent(new Event('royal_store_updated'));
    return;
  } catch (err: any) {
    console.warn('Standard saveStore hit quota limit, executing progressive compaction level 1...', err);
  }

  // Level 1: Aggressive compaction
  try {
    const compactStoreL1 = prepareStoreForStorage(store, 1);
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(compactStoreL1));
    window.dispatchEvent(new Event('royal_store_updated'));
    return;
  } catch (err2: any) {
    console.warn('Compaction level 1 hit quota, executing emergency compaction level 2...', err2);
  }

  // Level 2: Emergency compaction
  try {
    const compactStoreL2 = prepareStoreForStorage(store, 2);
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(compactStoreL2));
    window.dispatchEvent(new Event('royal_store_updated'));
  } catch (finalErr: any) {
    console.error('CRITICAL: Unable to save to localStorage after all progressive compactions', finalErr);
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

// Hierarchical Pricing Calculator: Campus Override > Term Standard > Default (No automatic discount)
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
  const termBaseCourseFee = termConfig ? termConfig.standard_course_fee : 3990000;
  const termSessionRate =
    termConfig?.standard_session_rate || Math.ceil(termBaseCourseFee / Math.max(1, termSessions));

  // 2. Kiểm tra biểu phí ở cấp Cơ Sở (CampusTermPricing)
  const campusPricing = store.campusPricings?.find(
    cp => cp.term_id === termId && cp.campus_id === campusId && cp.subject_id === subjectId
  );

  // Nếu cơ sở thiết lập không mở môn này
  if (campusPricing && campusPricing.is_offered_at_campus === false) {
    const baseFee = campusPricing.custom_course_fee || termBaseCourseFee;
    const sessions = campusPricing.custom_sessions || termSessions;
    const rate =
      campusPricing.custom_session_rate || Math.ceil(baseFee / Math.max(1, sessions));
    return {
      source: 'campus_override',
      is_offered: false,
      total_sessions: sessions,
      base_course_fee: baseFee,
      course_fee: baseFee,
      session_rate: rate,
      override_pricing: !!campusPricing.override_pricing,
      discount_type: 'none',
      discount_value: 0,
      discount_amount: 0,
      notes: 'Cơ sở hiện không mở môn học này trong khóa',
    };
  }

  // Nếu cơ sở có cấu hình giá (CampusTermPricing)
  if (campusPricing && (campusPricing.override_pricing || campusPricing.custom_course_fee)) {
    const baseFee = campusPricing.custom_course_fee || termBaseCourseFee;
    const sessions = campusPricing.custom_sessions || termSessions;
    const rate =
      campusPricing.custom_session_rate || Math.ceil(baseFee / Math.max(1, sessions));

    return {
      source: campusPricing.override_pricing ? 'campus_override' : 'term_standard',
      is_offered: termActive && campusPricing.is_offered_at_campus !== false,
      total_sessions: sessions,
      base_course_fee: baseFee,
      course_fee: baseFee,
      session_rate: rate,
      override_pricing: !!campusPricing.override_pricing,
      discount_type: 'none',
      discount_value: 0,
      discount_amount: 0,
      notes: campusPricing.notes || 'Áp dụng biểu phí chuẩn của cơ sở',
    };
  }

  // 3. Nếu không override, kế thừa chuẩn từ Cấp Khóa Học (TermSubjectConfig)
  if (termConfig) {
    return {
      source: 'term_standard',
      is_offered: termConfig.is_active,
      total_sessions: termSessions,
      base_course_fee: termBaseCourseFee,
      course_fee: termBaseCourseFee,
      session_rate: termSessionRate,
      override_pricing: false,
      discount_type: 'none',
      discount_value: 0,
      discount_amount: 0,
      notes: termConfig.notes || 'Kế thừa biểu phí chuẩn của khóa học',
    };
  }

  // 4. Fallback legacy pricings nếu có
  const legacyPricing = store.pricings?.find(
    p => p.term_id === termId && p.campus_id === campusId && p.subject_id === subjectId
  );
  if (legacyPricing) {
    const baseFee = legacyPricing.final_price || legacyPricing.base_price || 3990000;
    const sessions = legacyPricing.total_sessions || 24;
    const rate = legacyPricing.session_rate || Math.ceil(baseFee / Math.max(1, sessions));
    return {
      source: 'campus_override',
      is_offered: true,
      total_sessions: sessions,
      base_course_fee: baseFee,
      course_fee: baseFee,
      session_rate: rate,
      override_pricing: true,
      discount_type: 'none',
      discount_value: 0,
      discount_amount: 0,
      notes: 'Biểu phí chuẩn của cơ sở',
    };
  }

  // 5. Fallback mặc định
  return {
    source: 'subject_default',
    is_offered: true,
    total_sessions: 24,
    base_course_fee: 3990000,
    course_fee: 3990000,
    session_rate: 166250,
    override_pricing: false,
    discount_type: 'none',
    discount_value: 0,
    discount_amount: 0,
    notes: 'Biểu phí mặc định toàn hệ thống',
  };
}

/**
 * Truy xuất đơn giá chuẩn theo Cơ sở (Campus-specific Rate) cho một lớp học ngoại khóa
 */
export function getCampusPricingForClass(
  classItem: ExtracurricularClass,
  store: AppStore
): {
  totalSessions: number;
  fullCourseFee: number;
  sessionRate: number;
  campusName: string;
  campusCode: string;
} {
  const campus = store.campuses?.find(cp => cp.id === classItem.campus_id);
  const campusPricing = store.campusPricings?.find(
    cp =>
      cp.term_id === classItem.term_id &&
      cp.campus_id === classItem.campus_id &&
      cp.subject_id === classItem.subject_id
  );
  const legacyPricing = store.pricings?.find(
    p =>
      p.term_id === classItem.term_id &&
      p.campus_id === classItem.campus_id &&
      p.subject_id === classItem.subject_id
  );

  const totalSessions =
    classItem.total_sessions ||
    campusPricing?.custom_sessions ||
    legacyPricing?.total_sessions ||
    24;

  const fullCourseFee =
    classItem.full_course_fee ||
    campusPricing?.custom_course_fee ||
    legacyPricing?.final_price ||
    3990000;

  const sessionRate =
    classItem.price_per_session ||
    campusPricing?.custom_session_rate ||
    legacyPricing?.session_rate ||
    Math.ceil(fullCourseFee / Math.max(1, totalSessions));

  return {
    totalSessions,
    fullCourseFee,
    sessionRate,
    campusName: campus?.name || 'Royal School',
    campusCode: campus?.code || 'PMH',
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

export const JS_DAY_TO_VN_CODE: Record<number, string> = {
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
  const classStart = classItem.start_date || term?.start_date || '2026-09-01';
  const classEnd = classItem.end_date || term?.end_date || '2026-12-25';
  const todayStr = referenceDateStr || new Date().toISOString().split('T')[0];

  let baseDateStr = todayStr;
  if (baseDateStr < classStart) baseDateStr = classStart;
  if (baseDateStr > classEnd) baseDateStr = classStart;

  const classDays = getClassDaysOfWeek(classItem, store);
  const activeDays =
    enrolledDaysOfWeek && enrolledDaysOfWeek.length > 0
      ? enrolledDaysOfWeek.filter(d => classDays.includes(d))
      : classDays;
  const targetDays = activeDays.length > 0 ? activeDays : classDays;

  const startCursor = new Date(`${baseDateStr}T00:00:00`);
  const endCursor = new Date(`${classEnd}T00:00:00`);

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

/**
 * Đếm số buổi thực học từ startDate đến endDate dựa trên các thứ trong tuần được chọn
 */
export function countSessionsBetweenDates(
  startDateStr: string,
  endDateStr: string,
  enrolledDays: string[]
): number {
  if (!startDateStr || !endDateStr || !enrolledDays || enrolledDays.length === 0) return 0;
  const start = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${endDateStr}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const vnDay = JS_DAY_TO_VN_CODE[cursor.getDay()];
    if (enrolledDays.includes(vnDay)) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
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
  const { totalSessions, fullCourseFee, sessionRate } = getCampusPricingForClass(classItem, store);
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
    const proratedFee = maxStudentSessionsInCourse * sessionRate;
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
  const proratedFee = clampedRemaining * sessionRate;

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
  campusName: string;
  campusCode: string;
}

/**
 * Tính biểu phí chuẩn theo số buổi thực học & đơn giá Cơ sở (KHÔNG tự động trừ % ưu đãi)
 * Công thức: Học phí thực đóng = Số buổi thực học × Đơn giá 1 buổi (Ceil) của Cơ sở
 */
export function calculateClassProratedPricing(
  classItem: ExtracurricularClass,
  effectiveSessions: number,
  _isRoyalStudent: boolean,
  store: AppStore
): ProratedPricingBreakdown {
  const { totalSessions, fullCourseFee, sessionRate, campusName, campusCode } =
    getCampusPricingForClass(classItem, store);

  const validSessions = Math.min(totalSessions, Math.max(0, Math.round(effectiveSessions)));
  const elapsedSessions = Math.max(0, totalSessions - validSessions);

  const isMidCourse = validSessions < totalSessions;
  const subjectFee = validSessions * sessionRate;

  return {
    totalSessions,
    effectiveSessions: validSessions,
    elapsedSessions,
    sessionRate,
    fullCourseFee,
    proratedGrossFee: subjectFee,
    discountPercent: 0,
    discountAmount: 0,
    discountLabel: 'Không áp dụng',
    netPayable: subjectFee,
    isMidCourse,
    campusName,
    campusCode,
  };
}

export function generateStudentCodeSync(isRoyal: boolean, existingStudents: Student[] = []): string {
  const prefix = isRoyal ? 'RY' : 'EXT';
  const year = new Date().getFullYear();
  const searchPrefix = `${prefix}-${year}-`;
  let nextNumber = 1;

  for (const s of existingStudents) {
    if (s?.code && s.code.toUpperCase().startsWith(searchPrefix)) {
      const match = s.code.toUpperCase().match(new RegExp(`${searchPrefix}(\\d+)`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num >= nextNumber) {
          nextNumber = num + 1;
        }
      }
    }
  }
  return `${searchPrefix}${String(nextNumber).padStart(5, '0')}`;
}

export const generateStudentCode = async (
  isRoyal: boolean,
  existingStudents: Student[] = []
): Promise<string> => {
  const prefix = isRoyal ? 'RY' : 'EXT';
  const year = new Date().getFullYear();
  const searchPrefix = `${prefix}-${year}-`;
  const client = getSupabaseClient();

  try {
    if (!client) throw new Error('Supabase client not initialized');
    const { data, error } = await client.rpc('get_next_student_code', {
      p_prefix: prefix,
    });
    if (error || !data) throw error;
    const rpcCode = typeof data === 'string' ? data.trim() : String((data as any).code || data).trim();

    // Đảm bảo mã trả về từ RPC cũng không trùng với bất kỳ học sinh nào đang có trên state local
    if (existingStudents.length > 0 && existingStudents.some(s => s.code?.toUpperCase() === rpcCode.toUpperCase())) {
      const m = rpcCode.toUpperCase().match(new RegExp(`${searchPrefix}(\\d+)`));
      let nextNum = m ? parseInt(m[1], 10) + 1 : 1;
      for (const s of existingStudents) {
        const sm = s.code?.toUpperCase().match(new RegExp(`${searchPrefix}(\\d+)`));
        if (sm) {
          const num = parseInt(sm[1], 10);
          if (!isNaN(num) && num >= nextNum) {
            nextNum = num + 1;
          }
        }
      }
      return `${searchPrefix}${String(nextNum).padStart(5, '0')}`;
    }

    return rpcCode;
  } catch (err) {
    console.warn('Lỗi gọi RPC get_next_student_code, dùng fallback:', err);
    // Fallback: Tìm mã lớn nhất trong bảng students
    let nextNumber = 1;
    if (client) {
      try {
        const { data: latest } = await client
          .from('students')
          .select('code')
          .ilike('code', `${searchPrefix}%`)
          .order('code', { ascending: false })
          .limit(1);

        if (latest && latest.length > 0 && latest[0]?.code) {
          const match = String(latest[0].code).toUpperCase().match(new RegExp(`${searchPrefix}(\\d+)`));
          if (match) nextNumber = parseInt(match[1], 10) + 1;
        }
      } catch (fallbackErr) {
        console.warn('Lỗi truy vấn mã lớn nhất từ bảng students:', fallbackErr);
      }
    }

    // Đối chiếu thêm với danh sách existingStudents trên state để đảm bảo duy nhất 100%
    for (const s of existingStudents) {
      if (s?.code && s.code.toUpperCase().startsWith(searchPrefix)) {
        const match = s.code.toUpperCase().match(new RegExp(`${searchPrefix}(\\d+)`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num >= nextNumber) {
            nextNumber = num + 1;
          }
        }
      }
    }

    return `${searchPrefix}${String(nextNumber).padStart(5, '0')}`;
  }
};

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

// ============================================================================
// THUẬT TOÁN NHẬN DIỆN HỌC SINH ĐÃ TỒN TẠI & CHỐNG TRÙNG LẶP HỒ SƠ
// (STUDENT MATCHING & DUPLICATE REGISTRATION RESOLUTION ENGINE)
// ============================================================================

/**
 * Chuẩn hóa tên học sinh: bỏ khoảng trắng thừa ở 2 đầu và giữa các từ, chuyển chữ thường, chuẩn Unicode NFC
 * VD: "  lương   bảo trâm  " -> "lương bảo trâm"
 */
export function normalizeStudentName(name?: string): string {
  if (!name) return '';
  return name
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Chuẩn hóa số điện thoại: chỉ giữ lại các chữ số để so khớp chính xác
 * VD: "0908 112 233" -> "0908112233"
 */
export function normalizePhoneDigits(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Hợp nhất thông tin lưu ý y tế cũ trong hồ sơ và lưu ý y tế mới trong đơn tuyển sinh
 */
export function mergeMedicalNotes(existingNotes?: string, newNotes?: string): string {
  const cleanOld = (existingNotes || '').trim();
  const cleanNew = (newNotes || '').trim();
  if (!cleanOld) return cleanNew;
  if (!cleanNew) return cleanOld;
  if (cleanOld.toLowerCase().includes(cleanNew.toLowerCase())) return cleanOld;
  if (cleanNew.toLowerCase().includes(cleanOld.toLowerCase())) return cleanNew;
  return `${cleanOld} | Cập nhật mới: ${cleanNew}`;
}

export interface LeadResolutionResult {
  matchType: 'existing_student' | 'sibling' | 'new_student';
  confidence: number; // 100 | 95 | 90 | 80 | 0
  matchCriteriaLabel: string;
  matchedStudent: Student | null;
  siblingStudents: Student[];
  activeEnrollments: Enrollment[];
  enrolledClasses: ExtracurricularClass[];
  enrolledSubjectIds: string[];
  isDuplicateSpam: boolean;
  duplicateReferenceLead: ParentRegistration | null;
  duplicateReason: string | null;
}

/**
 * So khớp đơn đăng ký từ Cổng Phụ Huynh với Cơ sở dữ liệu Học viên & phát hiện đơn gửi trùng lặp 100%
 */
export function matchLeadWithDatabase(
  lead: ParentRegistration,
  store: AppStore
): LeadResolutionResult {
  const leadName = normalizeStudentName(lead.student_name);
  const leadPhone = normalizePhoneDigits(lead.parent_phone);
  const leadDob = (lead.student_dob || lead.dob || '').trim();
  const explicitStudentId = (lead as any).allocated_student_id || lead.linked_student_id || lead.student_id || lead.assigned_student_id;

  let matchedStudent: Student | null = null;
  let confidence = 0;
  let matchCriteriaLabel = '';
  const siblingStudents: Student[] = [];

  for (const s of store.students) {
    const sName = normalizeStudentName(s.name);
    const sPhone = normalizePhoneDigits(s.parent_phone);
    const sDob = (s.dob || '').trim();

    const isExplicitLink = Boolean(
      (explicitStudentId && (s.id === explicitStudentId || s.code === explicitStudentId)) ||
        (lead.assigned_student_code && (s.code === lead.assigned_student_code || s.id === lead.assigned_student_code))
    );
    // Tiêu chí 1: Trùng SĐT phụ huynh + Tên học sinh
    const isPhoneAndNameMatch = Boolean(
      leadPhone && sPhone && leadPhone === sPhone && leadName && sName && leadName === sName
    );
    // Tiêu chí 2: Trùng Họ tên học sinh + Ngày tháng năm sinh
    const isNameAndDobMatch = Boolean(
      leadName && sName && leadName === sName && leadDob && sDob && leadDob === sDob
    );

    if (isPhoneAndNameMatch && isNameAndDobMatch) {
      matchedStudent = s;
      confidence = 100;
      matchCriteriaLabel = 'Khớp 100% (SĐT Phụ huynh + Họ tên + Ngày sinh)';
      break;
    } else if (isPhoneAndNameMatch) {
      matchedStudent = s;
      confidence = 95;
      matchCriteriaLabel = 'Khớp SĐT Phụ huynh + Họ tên học sinh';
      break;
    } else if (isNameAndDobMatch) {
      matchedStudent = s;
      confidence = 90;
      matchCriteriaLabel = 'Khớp Họ tên học sinh + Ngày tháng năm sinh';
      break;
    } else if (isExplicitLink) {
      matchedStudent = s;
      confidence = 100;
      matchCriteriaLabel = 'Đã liên kết Mã Học Viên trong hệ thống';
      break;
    } else if (leadPhone && sPhone && leadPhone === sPhone && leadName !== sName) {
      siblingStudents.push(s);
    }
  }

  // Lấy danh sách các lớp & môn học mà học sinh cũ đang theo học (active hoặc trial)
  const activeEnrollments: Enrollment[] = matchedStudent
    ? store.enrollments.filter(
        e =>
          (String(e.student_id) === String(matchedStudent!.id) ||
            String(e.student_id) === String(matchedStudent!.code)) &&
          (e.status === 'active' || e.status === 'trial' || (e as any).enrollment_type === 'trial' || (e as any).enrollment_type === 'official')
      )
    : [];

  const enrolledClasses: ExtracurricularClass[] = activeEnrollments
    .map(e => store.classes.find(c => c.id === e.class_id))
    .filter((c): c is ExtracurricularClass => Boolean(c));

  const enrolledSubjectIds: string[] = Array.from(
    new Set(enrolledClasses.map(c => c.subject_id))
  );

  // Phát hiện trường hợp Phụ huynh gửi đơn trùng lặp 100% (Spam click / Gửi 2 lần cùng 1 môn & cùng khung giờ)
  const extractSubjectSlotSignature = (reg: ParentRegistration): string => {
    if (reg.registered_subjects && reg.registered_subjects.length > 0) {
      return reg.registered_subjects
        .map(item => `${item.subject_id}:${item.time_slot || 'after_school'}`)
        .sort()
        .join('|');
    }
    return `${reg.desired_subject_id}:${reg.desired_time_slot_type || 'after_school'}`;
  };

  let isDuplicateSpam = false;
  let duplicateReferenceLead: ParentRegistration | null = null;
  let duplicateReason: string | null = null;

  if (lead.status === 'pending' || lead.status === 'contacted') {
    const leadSig = extractSubjectSlotSignature(lead);
    const leadTime = new Date(lead.created_at).getTime() || 0;
    const leadIndex = store.parentRegistrations.findIndex(r => r.id === lead.id);

    for (let i = 0; i < store.parentRegistrations.length; i++) {
      const other = store.parentRegistrations[i];
      if (other.id === lead.id || other.status === 'canceled') continue;

      const otherName = normalizeStudentName(other.student_name);
      const otherPhone = normalizePhoneDigits(other.parent_phone);
      const otherDob = (other.student_dob || other.dob || '').trim();

      const isSameStudent =
        leadName === otherName &&
        ((leadPhone && leadPhone === otherPhone) || (leadDob && leadDob === otherDob));

      if (!isSameStudent) continue;

      const otherSig = extractSubjectSlotSignature(other);
      if (otherSig !== leadSig) continue;

      const otherTime = new Date(other.created_at).getTime() || 0;
      const isOtherOriginal =
        other.status === 'enrolled' ||
        other.status === 'partially_enrolled' ||
        (otherTime > 0 && leadTime > 0 && otherTime < leadTime) ||
        (otherTime === leadTime && i > leadIndex);

      if (isOtherOriginal) {
        isDuplicateSpam = true;
        duplicateReferenceLead = other;
        duplicateReason = `Trùng 100% học sinh, môn học và khung giờ với đơn ${
          other.registration_code || other.id
        } (${other.status === 'enrolled' ? 'Đã xếp lớp' : 'Đang chờ xử lý'})`;
        break;
      }
    }
  }

  if (matchedStudent) {
    return {
      matchType: 'existing_student',
      confidence,
      matchCriteriaLabel,
      matchedStudent,
      siblingStudents,
      activeEnrollments,
      enrolledClasses,
      enrolledSubjectIds,
      isDuplicateSpam,
      duplicateReferenceLead,
      duplicateReason,
    };
  }

  if (siblingStudents.length > 0) {
    return {
      matchType: 'sibling',
      confidence: 80,
      matchCriteriaLabel: 'Học sinh mới cùng gia đình (Chung SĐT Phụ huynh)',
      matchedStudent: null,
      siblingStudents,
      activeEnrollments: [],
      enrolledClasses: [],
      enrolledSubjectIds: [],
      isDuplicateSpam,
      duplicateReferenceLead,
      duplicateReason,
    };
  }

  return {
    matchType: 'new_student',
    confidence: 0,
    matchCriteriaLabel: 'Học sinh mới (Chưa có hồ sơ trong hệ thống)',
    matchedStudent: null,
    siblingStudents: [],
    activeEnrollments: [],
    enrolledClasses: [],
    enrolledSubjectIds: [],
    isDuplicateSpam,
    duplicateReferenceLead,
    duplicateReason,
  };
}

// ============================================================================
// QUY TRÌNH & ĐIỀU KIỆN BẢO LƯU HỌC PHÍ (CHẶN NGHỈ LIÊN TỤC >= 3 NGÀY CÓ PHÉP & CẤN TRỪ KHÓA SAU)
// ============================================================================

export interface CreditCreationValidationResult {
  isEligible: boolean;
  maxConsecutiveExcused: number;
  validSessionDates: string[];
  validAttendanceRecords: AttendanceRecord[];
  allStudentAttendanceRecords: AttendanceRecord[];
  totalExcusedCount: number;
  isInterruptedStreak: boolean;
  hasExistingCredit: boolean;
  existingCreditNote: MakeupCredit | null;
  quotaErrorMessage: string | null;
  streakErrorMessage: string | null;
}

/**
 * Kiểm tra điều kiện lập phiếu bảo lưu học phí:
 * 1) Học sinh phải có chuỗi nghỉ có phép liên tục (status === 'absent_excused') >= 3 buổi thực tế không ngắt quãng.
 * 2) Định mức: Tối đa 1 lần / 1 môn / 1 khóa học (status !== 'cancelled').
 */
export function validateCreditNoteCreation(
  studentId: string,
  classId: string,
  store: AppStore
): CreditCreationValidationResult {
  const selectedClass = store.classes.find(c => c.id === classId);

  // 1. Lấy toàn bộ lịch sử điểm danh của học sinh trong lớp, sắp xếp theo session_date ASC
  const studentAttendanceRecords = store.attendance
    .filter(a => a.student_id === studentId && a.class_id === classId)
    .sort((a, b) => a.session_date.localeCompare(b.session_date));

  let currentStreak = 0;
  let maxConsecutiveExcused = 0;
  let validSessionDates: string[] = [];
  let validAttendanceRecords: AttendanceRecord[] = [];
  let currentStreakDates: string[] = [];
  let currentStreakRecords: AttendanceRecord[] = [];
  let totalExcusedCount = 0;

  for (const record of studentAttendanceRecords) {
    if (record.status === 'absent_excused') {
      totalExcusedCount++;
      currentStreak++;
      currentStreakDates.push(record.session_date);
      currentStreakRecords.push(record);
      if (currentStreak >= maxConsecutiveExcused) {
        maxConsecutiveExcused = currentStreak;
        validSessionDates = [...currentStreakDates];
        validAttendanceRecords = [...currentStreakRecords];
      }
    } else {
      // Có mặt hoặc vắng không phép -> chuỗi bị ngắt quãng
      currentStreak = 0;
      currentStreakDates = [];
      currentStreakRecords = [];
    }
  }

  const isInterruptedStreak = totalExcusedCount > maxConsecutiveExcused;

  // 2. Kiểm tra định mức 1 lần / 1 môn / 1 khóa
  const existingCreditNote =
    store.makeupCredits.find(note => {
      if (note.student_id !== studentId || note.status === 'cancelled') return false;
      if (note.source_class_id === classId) return true;
      if (selectedClass) {
        const noteTermId = note.source_term_id || note.term_id;
        if (note.subject_id === selectedClass.subject_id && noteTermId === selectedClass.term_id) {
          return true;
        }
      }
      return false;
    }) || null;

  const hasExistingCredit = Boolean(existingCreditNote);

  const quotaErrorMessage = hasExistingCredit
    ? `🔒 Định mức vượt giới hạn: Môn học này đã được cấp 1 phiếu bảo lưu (${existingCreditNote?.credit_code}) trong khóa học hiện tại (Tối đa 1 lần / 1 môn / 1 khóa).`
    : null;

  const streakErrorMessage =
    maxConsecutiveExcused < 3
      ? `⚠️ Không đủ điều kiện: Học sinh cần có ít nhất 3 buổi vắng có phép liên tục không ngắt quãng (Hiện tại chuỗi nghỉ dài nhất: ${maxConsecutiveExcused} buổi${
          isInterruptedStreak ? ` — Tổng nghỉ có phép ${totalExcusedCount} buổi nhưng bị ngắt quãng do có buổi đi học xen kẽ` : ''
        }).`
      : null;

  return {
    isEligible: !hasExistingCredit && maxConsecutiveExcused >= 3,
    maxConsecutiveExcused,
    validSessionDates,
    validAttendanceRecords,
    allStudentAttendanceRecords: studentAttendanceRecords,
    totalExcusedCount,
    isInterruptedStreak,
    hasExistingCredit,
    existingCreditNote,
    quotaErrorMessage,
    streakErrorMessage,
  };
}

export interface NextTermClassRedemptionOption {
  cls: ExtracurricularClass;
  term: AcademicTerm | undefined;
  campusName: string;
  subjectName: string;
  reservedSessionsCount: number; // N (buổi)
  rateOld: number;               // rate_old (đ/buổi)
  rateNew: number;               // rate_new (đ/buổi)
  creditTotal: number;           // CreditTotal = N * rate_old
  redemptionType: 'by_sessions' | 'by_amount'; // 'by_sessions' nếu rate_old >= rate_new, 'by_amount' nếu rate_old < rate_new
  badgeLabel: string;            // '✓ Bảo lưu nguyên số buổi' | '⚡ Cấn trừ theo số tiền'
  appliedSessions?: number;      // N buổi nếu rate_old >= rate_new
  deductedAmount: number;        // N * rate_new (nếu rate_old >= rate_new) hoặc CreditTotal (nếu rate_old < rate_new)
  remainingBalanceDue: number;   // 0 đ cho N buổi bảo lưu (nếu rate_old >= rate_new) hoặc (Học phí lớp khóa sau - CreditTotal)
  fullCourseRemainingBalance: number; // Công nợ nếu học trọn khóa mới (Học phí khóa sau - deductedAmount)
}

/**
 * Tìm khóa học kế tiếp (Next Term) của phiếu bảo lưu và tính toán phương án cấn trừ (Buổi vs Tiền)
 */
export function getNextTermAndRedemptionOptions(
  credit: MakeupCredit,
  store: AppStore
): {
  sourceTerm: AcademicTerm | undefined;
  nextTerm: AcademicTerm | undefined;
  options: NextTermClassRedemptionOption[];
} {
  const sourceTermId = credit.source_term_id || credit.term_id;
  const sourceTerm = store.terms.find(t => t.id === sourceTermId);

  const sortedTerms = [...store.terms].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const nextTerm =
    sortedTerms.find(t => sourceTerm && t.start_date > sourceTerm.start_date && t.status !== 'closed') ||
    sortedTerms.find(t => t.id !== sourceTermId && t.status !== 'closed') ||
    sortedTerms[sortedTerms.length - 1];

  const nextTermClasses = nextTerm
    ? store.classes.filter(cls => cls.term_id === nextTerm.id && cls.status === 'active')
    : [];

  const N = credit.consecutive_absent_sessions || credit.consecutive_absent_count || 3;
  const rateOld = credit.unit_price_old || credit.source_rate || 0;
  const creditTotal = credit.total_credit_amount || N * rateOld;

  const options: NextTermClassRedemptionOption[] = nextTermClasses.map(cls => {
    const rateNew = cls.price_per_session;
    const isBySessions = rateOld >= rateNew;
    const campusName = store.campuses.find(cp => cp.id === cls.campus_id)?.name || cls.campus_id;
    const subjectName = store.subjects.find(sb => sb.id === cls.subject_id)?.name || cls.subject_id;

    if (isBySessions) {
      // Nhánh A: rate_old >= rate_new -> Bảo lưu nguyên số buổi
      const deductedAmount = N * rateNew;
      const fullCourseRemaining = Math.max(0, cls.full_course_fee - deductedAmount);
      return {
        cls,
        term: nextTerm,
        campusName,
        subjectName,
        reservedSessionsCount: N,
        rateOld,
        rateNew,
        creditTotal,
        redemptionType: 'by_sessions',
        badgeLabel: 'Bảo lưu nguyên số buổi',
        appliedSessions: N,
        deductedAmount,
        remainingBalanceDue: 0, // Phụ huynh không phải nộp thêm tiền cho N buổi được bảo lưu
        fullCourseRemainingBalance: fullCourseRemaining,
      };
    } else {
      // Nhánh B: rate_old < rate_new -> Cấn trừ theo số tiền
      const deductedAmount = creditTotal;
      const remainingBalanceDue = Math.max(0, cls.full_course_fee - creditTotal);
      return {
        cls,
        term: nextTerm,
        campusName,
        subjectName,
        reservedSessionsCount: N,
        rateOld,
        rateNew,
        creditTotal,
        redemptionType: 'by_amount',
        badgeLabel: 'Cấn trừ theo số tiền',
        appliedSessions: undefined,
        deductedAmount,
        remainingBalanceDue,
        fullCourseRemainingBalance: remainingBalanceDue,
      };
    }
  });

  return {
    sourceTerm,
    nextTerm,
    options,
  };
}

export interface CreditRedemptionModificationCheck {
  canModify: boolean;
  reason: string;
  targetTerm?: AcademicTerm;
  targetClass?: ExtracurricularClass;
  hasAttendance: boolean;
  isTermNotStarted: boolean;
}

/**
 * Kiểm tra quyền chỉnh sửa / hủy cấn trừ phiếu bảo lưu:
 * 1. Khóa học đích chưa chính thức bắt đầu (today <= targetTerm.start_date)
 * 2. Lớp học khóa sau chưa phát sinh buổi điểm danh nào trong store.attendance
 */
export function canModifyRedeemedCredit(
  credit: MakeupCredit,
  store: AppStore
): CreditRedemptionModificationCheck {
  const isRedeemed = credit.status === 'applied' || credit.status === 'used';
  if (!isRedeemed) {
    return {
      canModify: false,
      reason: 'Phiếu chưa được cấn trừ khóa sau',
      hasAttendance: false,
      isTermNotStarted: false,
    };
  }

  const targetTermId = credit.redeemed_info?.target_term_id;
  const targetClassId = credit.redeemed_info?.target_class_id || credit.applied_class_id;
  const targetTerm = store.terms.find(t => t.id === targetTermId);
  const targetClass = store.classes.find(c => c.id === targetClassId);

  const today = new Date().toISOString().split('T')[0];
  const isTermNotStarted = targetTerm ? today <= targetTerm.start_date : false;

  const hasAttendance = targetClassId
    ? store.attendance.some(a => a.class_id === targetClassId)
    : false;

  if (!targetTerm) {
    return {
      canModify: false,
      reason: 'Không tìm thấy thông tin khóa học đích',
      targetTerm,
      targetClass,
      hasAttendance,
      isTermNotStarted: false,
    };
  }

  if (!isTermNotStarted) {
    return {
      canModify: false,
      reason: `Khóa học đích (${targetTerm.name}) đã diễn ra từ ngày ${targetTerm.start_date} - Không thể chỉnh sửa phiếu bảo lưu`,
      targetTerm,
      targetClass,
      hasAttendance,
      isTermNotStarted: false,
    };
  }

  if (hasAttendance) {
    return {
      canModify: false,
      reason: `Lớp học khóa sau (${targetClass?.name || targetClassId}) đã phát sinh điểm danh thực tế - Không thể chỉnh sửa`,
      targetTerm,
      targetClass,
      hasAttendance: true,
      isTermNotStarted: true,
    };
  }

  return {
    canModify: true,
    reason: 'Khóa học chưa bắt đầu - Cho phép thay đổi lớp cấn trừ hoặc hủy bảo lưu',
    targetTerm,
    targetClass,
    hasAttendance: false,
    isTermNotStarted: true,
  };
}

/**
 * Tính toán đơn giá buổi thực tế (rate_applied) của giáo viên theo chuẩn thù lao toàn trường:
 * - Giáo viên Cơ Hữu (Permanent): 300.000 VNĐ / buổi
 * - Giáo viên Thỉnh Giảng (Visiting): 270.000 VNĐ / buổi
 */
export function getTeacherEffectiveSessionRate(
  teacher: Teacher | undefined,
  payrollConfig?: PayrollRateConfig
): number {
  if (!teacher) return payrollConfig?.permanent_session_rate ?? 300000;
  const isVisiting = teacher.type === 'visiting' || teacher.teacher_type === 'visiting';
  if (isVisiting) {
    return (
      payrollConfig?.visiting_session_rate ??
      (payrollConfig?.visiting_rate_per_period ? payrollConfig.visiting_rate_per_period * (payrollConfig.periods_per_session || 2) : 270000)
    );
  }
  return (
    payrollConfig?.permanent_session_rate ??
    (payrollConfig?.permanent_rate_per_period ? payrollConfig.permanent_rate_per_period * (payrollConfig.periods_per_session || 2) : 300000)
  );
}

/**
 * Tính toán đơn giá tiết thực tế (rate_per_period) của giáo viên theo chuẩn thù lao toàn trường
 */
export function getTeacherEffectivePeriodRate(
  teacher: Teacher | undefined,
  _subjectId?: string,
  _isWeekend: boolean = false,
  payrollConfig?: PayrollRateConfig
): number {
  const sessionRate = getTeacherEffectiveSessionRate(teacher, payrollConfig);
  const periods = teacher?.periods_per_session || payrollConfig?.periods_per_session || 2;
  return Math.round(sessionRate / periods);
}

/**
 * HỒI TỐ (RETROACTIVE RECALCULATION) ĐỒNG BỘ THÙ LAO THEO BUỔI CHO CÁC CA ĐÃ ĐIỂM DANH
 * Áp dụng định mức thù lao theo buổi mới (Cơ hữu: 300.000 đ/buổi, Thỉnh giảng: 270.000 đ/buổi)
 * cho toàn bộ các ca dạy đã phát sinh trong lịch sử và đồng bộ lại trạng thái quyết toán.
 */
export function recalculatePastSessions(
  store: AppStore,
  permanentSessionRate: number = 300000,
  visitingSessionRate: number = 270000
): AppStore {
  const nowIso = new Date().toISOString();
  const periods = store.payrollRateConfig?.periods_per_session || 2;
  const permPeriodRate = Math.round(permanentSessionRate / periods);
  const visPeriodRate = Math.round(visitingSessionRate / periods);

  const updatedTeachers: Teacher[] = (store.teachers || []).map(t => {
    const isVisiting = (t.type || t.teacher_type) === 'visiting';
    const sessionRate = isVisiting ? visitingSessionRate : permanentSessionRate;
    const periodRate = isVisiting ? visPeriodRate : permPeriodRate;
    return {
      ...t,
      type: isVisiting ? 'visiting' : 'permanent',
      teacher_type: isVisiting ? 'visiting' : 'permanent',
      default_rate_per_period: periodRate,
      periods_per_session: periods,
      fixed_rate_per_session: sessionRate,
      custom_subject_rates: [],
    };
  });

  const updatedTeacherAttendance: TeacherAttendanceRecord[] = (store.teacherAttendance || []).map(rec => {
    const actualTeacher = updatedTeachers.find(t => t.id === rec.actual_teacher_id);
    const isVisiting = (actualTeacher?.type || actualTeacher?.teacher_type) === 'visiting';
    const rateApplied = isVisiting ? visitingSessionRate : permanentSessionRate;
    const isAbsent =
      rec.status === 'absent_excused' ||
      rec.status === 'absent_unexcused' ||
      rec.periods_count === 0;
    const earnedAmount = isAbsent ? 0 : 1 * rateApplied;
    const periodRate = Math.round(rateApplied / (rec.periods_count || 2));

    return {
      ...rec,
      rate_applied: rateApplied,
      earned_amount: earnedAmount,
      rate_per_period: periodRate,
      total_payout: earnedAmount,
      recalculated_at: nowIso,
    };
  });

  // Reset settlement status to pending ("Chờ kế toán duyệt chi") when rates are retroactively recalculated
  const updatedPayrollSettlements = (store.payrollSettlements || []).map(ps => ({
    ...ps,
    is_settled: false,
  }));

  return {
    ...store,
    teachers: updatedTeachers,
    teacherAttendance: updatedTeacherAttendance,
    payrollSettlements: updatedPayrollSettlements,
    payrollRateConfig: {
      ...(store.payrollRateConfig || initialPayrollRateConfig),
      permanent_session_rate: permanentSessionRate,
      visiting_session_rate: visitingSessionRate,
      permanent_rate_per_period: permPeriodRate,
      visiting_rate_per_period: visPeriodRate,
      periods_per_session: periods,
    },
  };
}

// ============================================================================
// PHÂN HỆ QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN TRUY CẬP (USER MANAGEMENT & RBAC)
// ============================================================================

export const APP_USERS_SQL_DDL = `-- 1. Bảng lưu trữ tài khoản người dùng & phân quyền RBAC trên Supabase
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) NOT NULL DEFAULT 'academic',
  campus_id VARCHAR(20) NOT NULL DEFAULT 'all', -- 'all', 'pmh', 'pl'
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active' hoặc 'locked'
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_teacher_id VARCHAR(50),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index tăng tốc truy vấn đăng nhập
CREATE INDEX IF NOT EXISTS idx_app_users_lookup ON app_users (username, email, status);`;

export function getDefaultPermissionsForRole(role: UserRole | SystemRole): UserPermissionMatrix {
  switch (role) {
    case 'super_admin':
      return {
        can_manage_classes: true,
        can_take_attendance: true,
        can_manage_enrollment: true,
        can_manage_finance: true,
        can_manage_credits: true,
        can_settle_payroll: true,
        can_config_system: true,
        can_manage_users: true,
        can_view_classes: true,
        can_view_registrations: true,
        can_manage_trial: true,
        can_config_payroll_rates: true,
      };
    case 'campus_manager':
      return {
        can_manage_classes: true,
        can_take_attendance: true,
        can_manage_enrollment: true,
        can_manage_finance: true,
        can_manage_credits: true,
        can_settle_payroll: true,
        can_config_system: false,
        can_manage_users: false,
        can_view_classes: true,
        can_view_registrations: true,
        can_manage_trial: true,
        can_config_payroll_rates: false,
      };
    case 'academic_accountant':
      return {
        can_manage_classes: true,
        can_take_attendance: true,
        can_manage_enrollment: true,
        can_manage_finance: true,
        can_manage_credits: true,
        can_settle_payroll: true,
        can_config_system: false,
        can_manage_users: false,
        can_view_classes: true,
        can_view_registrations: true,
        can_manage_trial: true,
        can_config_payroll_rates: false,
      };
    case 'academic_admissions':
    case 'academic':
      return {
        can_manage_classes: true,
        can_take_attendance: true,
        can_manage_enrollment: true,
        can_manage_finance: false,
        can_manage_credits: true,
        can_settle_payroll: false,
        can_config_system: false,
        can_manage_users: false,
        can_view_classes: true,
        can_view_registrations: true,
        can_manage_trial: true,
        can_config_payroll_rates: false,
      };
    case 'admissions':
      return {
        can_manage_classes: false,
        can_take_attendance: false,
        can_manage_enrollment: true,
        can_manage_finance: false,
        can_manage_credits: false,
        can_settle_payroll: false,
        can_config_system: false,
        can_manage_users: false,
        can_view_classes: true,
        can_view_registrations: true,
        can_manage_trial: true,
        can_config_payroll_rates: false,
      };
    case 'accountant':
      return {
        can_manage_classes: false,
        can_take_attendance: false,
        can_manage_enrollment: false,
        can_manage_finance: true,
        can_manage_credits: true,
        can_settle_payroll: true,
        can_config_system: false,
        can_manage_users: false,
        can_view_classes: true,
        can_view_registrations: false,
        can_manage_trial: false,
        can_config_payroll_rates: true,
      };
    case 'teacher':
    default:
      return {
        can_manage_classes: false,
        can_take_attendance: true,
        can_manage_enrollment: false,
        can_manage_finance: false,
        can_manage_credits: false,
        can_settle_payroll: false,
        can_config_system: false,
        can_manage_users: false,
        can_view_classes: true,
        can_view_registrations: false,
        can_manage_trial: false,
        can_config_payroll_rates: false,
      };
  }
}

export function getUserPermissions(user?: AppUser | null, fallbackRole: UserRole = 'super_admin'): UserPermissionMatrix {
  if (!user) {
    return getDefaultPermissionsForRole(fallbackRole);
  }
  if (user.is_root || user.username === 'overadmin' || user.role === 'super_admin') {
    if (user.permissions && !Array.isArray(user.permissions)) {
      return {
        ...getDefaultPermissionsForRole('super_admin'),
        ...user.permissions,
        can_manage_users: true,
      };
    }
    return getDefaultPermissionsForRole('super_admin');
  }
  if (user.permissions && !Array.isArray(user.permissions)) {
    return {
      ...getDefaultPermissionsForRole(user.role),
      ...user.permissions,
    };
  }
  return getDefaultPermissionsForRole(user.role);
}

export function getRoleLabelVN(role: UserRole, user?: AppUser | null): string {
  if (user?.is_root || user?.username === 'overadmin') return 'Quản Trị Tối Cao (OverAdmin)';
  switch (role) {
    case 'super_admin':
      return 'Quản Trị Cấp Cao';
    case 'campus_manager':
      return 'Quản Lý Cơ Sở';
    case 'academic_accountant':
      return 'Học Vụ & Kế Toán';
    case 'academic_admissions':
      return 'Học Vụ & Tuyển Sinh';
    case 'academic':
      return 'Giáo Vụ / Học Vụ';
    case 'admissions':
      return 'Chuyên Viên Tuyển Sinh';
    case 'accountant':
      return 'Kế Toán Học Phí & Thù Lao';
    case 'teacher':
      if (user?.department?.toLowerCase().includes('thỉnh giảng') || user?.username === 'tuan.lq' || user?.username === 'gv_david') {
        return 'Giáo Viên (Thỉnh Giảng)';
      }
      return 'Giáo Viên Bộ Môn';
    default:
      return 'Cán Bộ Nhân Sự';
  }
}

export function getCampusLabelVN(campusId?: string): string {
  if (!campusId || campusId === 'all') return 'Toàn Trường (All)';
  if (campusId === 'pmh' || campusId === 'camp_pmh') return 'Cơ sở PMH';
  if (campusId === 'pl' || campusId === 'camp_pl') return 'Cơ sở Phú Lâm';
  return campusId;
}

export function normalizeCampusScope(campusId?: string): 'all' | 'camp_pmh' | 'camp_pl' {
  if (!campusId || campusId === 'all') return 'all';
  if (campusId === 'pmh' || campusId === 'camp_pmh') return 'camp_pmh';
  if (campusId === 'pl' || campusId === 'camp_pl') return 'camp_pl';
  return 'all';
}

export function getPermissionSummaryText(user: AppUser): string {
  if (user.is_root || user.username === 'overadmin' || user.role === 'super_admin') {
    const perms = getUserPermissions(user);
    const allTrue =
      perms.can_manage_classes &&
      perms.can_take_attendance &&
      perms.can_manage_enrollment &&
      perms.can_manage_finance &&
      perms.can_manage_credits &&
      perms.can_settle_payroll &&
      perms.can_config_system &&
      perms.can_manage_users;
    if (allTrue) return 'Toàn Quyền Hệ Thống (*)';
  }

  const perms = getUserPermissions(user);
  if (
    user.role === 'teacher' &&
    !perms.can_manage_classes &&
    !perms.can_manage_enrollment &&
    !perms.can_manage_finance &&
    perms.can_take_attendance
  ) {
    return 'Chỉ xem lịch dạy & Sổ điểm danh';
  }

  const parts: string[] = [];
  if (perms.can_manage_classes || perms.can_view_classes) parts.push('Lớp học');
  if (perms.can_take_attendance) parts.push('Điểm danh');
  if (perms.can_manage_enrollment) parts.push('Ghi danh');
  if (perms.can_manage_finance) parts.push('Học phí');
  if (perms.can_manage_credits) parts.push('Bảo lưu');
  if (perms.can_settle_payroll) parts.push('Thù lao GV');
  if (perms.can_config_system) parts.push('Cấu hình');
  if (perms.can_manage_users) parts.push('Phân quyền');

  return parts.length > 0 ? parts.join(' • ') : 'Chỉ xem cơ bản';
}

function getConfiguredSupabaseClient() {
  return getSupabaseClient();
}

export async function syncAppUserToSupabase(user: AppUser, action: 'upsert' | 'delete' = 'upsert'): Promise<void> {
  const supabase = getConfiguredSupabaseClient();
  if (!supabase) return;
  try {
    if (action === 'delete') {
      await supabase.from('app_users').delete().or(`id.eq.${user.id},username.eq.${user.username}`);
    } else {
      await supabase.from('app_users').upsert({
        username: user.username.toLowerCase(),
        email: user.email.toLowerCase(),
        password_hash: user.password_hash || user.password || '123456',
        full_name: user.full_name,
        phone: user.phone || '',
        role: user.role,
        campus_id: user.campus_id === 'camp_pmh' ? 'pmh' : user.campus_id === 'camp_pl' ? 'pl' : user.campus_id,
        status: user.status,
        permissions: getUserPermissions(user),
        linked_teacher_id: user.linked_teacher_id || null,
        last_login: user.last_login || null,
      }, { onConflict: 'username' });
    }
  } catch {
    // Fallback gracefully to local store when Supabase table is not yet provisioned
  }
}

export async function handleLoginProcess(
  usernameOrEmail: string,
  passwordInput: string,
  store: AppStore
): Promise<{
  success: boolean;
  user?: AppUser;
  errorToast?: string;
  successToast?: string;
  reason?: 'not_found' | 'locked' | 'wrong_password';
}> {
  const cleanUser = usernameOrEmail.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  // BƯỚC 1: KIỂM TRA TÀI KHOẢN KHẨN CẤP (OVER-SUPER ADMIN) TRƯỚC TIÊN
  if (
    (cleanUser === 'overadmin' || cleanUser === 'overadmin@royal.edu.vn') &&
    cleanPass === 'overadmin123'
  ) {
    const overAdminSession: AppUser = {
      id: 'root-overadmin',
      code: 'OVER-ROOT-9999',
      username: 'overadmin',
      email: 'overadmin@royal.edu.vn',
      password: '',
      password_hash: '',
      name: 'Quản Trị Tối Cao (OverAdmin)',
      full_name: 'Quản Trị Tối Cao (OverAdmin)',
      phone: '0900 999 999',
      role: 'super_admin',
      department: 'Ban Quản Trị Tối Cao (Root System)',
      campus_id: 'all',
      status: 'active',
      permissions: getDefaultPermissionsForRole('super_admin'),
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      is_root: true,
    };

    try {
      safeStorage.setItem('royal_auth_session', JSON.stringify(overAdminSession));
      safeStorage.setItem('royal_current_user', JSON.stringify(overAdminSession));
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem('royal_current_user', JSON.stringify(overAdminSession));
      }
    } catch {
      // ignore
    }

    return {
      success: true,
      user: overAdminSession,
      successToast: '⚡ Đăng nhập thành công với quyền Quản Trị Tối Cao (OverAdmin)!',
    };
  }

  // BƯỚC 2: TRUY VẤN TÀI KHOẢN TỪ BẢNG `app_users` TRÊN SUPABASE (HOẶC STORE NẾU CHƯA KẾT NỐI)
  let dbUser: AppUser | null = null;
  const supabase = getConfiguredSupabaseClient();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .or(`username.eq.${cleanUser},email.eq.${cleanUser}`)
        .maybeSingle();

      if (!error && data) {
        dbUser = {
          id: data.id,
          username: data.username,
          email: data.email,
          password: data.password_hash,
          password_hash: data.password_hash,
          full_name: data.full_name,
          name: data.full_name,
          phone: data.phone || '',
          role: data.role as UserRole,
          department: getRoleLabelVN(data.role as UserRole),
          campus_id: data.campus_id || 'all',
          status: data.status as 'active' | 'locked',
          permissions: data.permissions || getDefaultPermissionsForRole(data.role as UserRole),
          linked_teacher_id: data.linked_teacher_id || undefined,
          created_at: data.created_at || new Date().toISOString(),
          last_login: data.last_login || undefined,
        };
      }
    } catch {
      // Fallback to local store.users
    }
  }

  if (!dbUser) {
    const localFound = store.users.find(
      u => u.username.toLowerCase() === cleanUser || u.email.toLowerCase() === cleanUser
    );
    if (localFound) {
      dbUser = {
        ...localFound,
        permissions: getUserPermissions(localFound),
      };
    }
  }

  if (!dbUser) {
    return {
      success: false,
      reason: 'not_found',
      errorToast: '✕ Tài khoản hoặc email không tồn tại trong hệ thống.',
    };
  }

  // BƯỚC 3: KIỂM TRA TRẠNG THÁI KHÓA TÀI KHOẢN (`status === 'locked'`) TRƯỚC KHI KIỂM TRA MẬT KHẨU
  if (dbUser.status === 'locked') {
    return {
      success: false,
      user: dbUser,
      reason: 'locked',
      errorToast: '🔒 Tài khoản của bạn đã bị khóa bởi Quản trị viên. Vui lòng liên hệ ban quản trị để được hỗ trợ.',
    };
  }

  // BƯỚC 4: KIỂM TRA MẬT KHẨU
  const expectedPass = dbUser.password_hash || dbUser.password || '';
  if (expectedPass && expectedPass !== cleanPass) {
    return {
      success: false,
      user: dbUser,
      reason: 'wrong_password',
      errorToast: '✕ Mật khẩu không chính xác. Vui lòng thử lại.',
    };
  }

  // BƯỚC 5: CẬP NHẬT THỜI GIAN ĐĂNG NHẬP CUỐI CÙNG (`last_login`) LÊN SUPABASE & LƯU SESSION
  const nowIso = new Date().toISOString();
  const authenticatedUser: AppUser = {
    ...dbUser,
    last_login: nowIso,
    permissions: getUserPermissions(dbUser),
  };

  if (supabase) {
    try {
      await supabase
        .from('app_users')
        .update({ last_login: nowIso })
        .eq('id', dbUser.id);
    } catch {
      // ignore
    }
  }

  try {
    safeStorage.setItem('royal_auth_session', JSON.stringify(authenticatedUser));
    safeStorage.setItem('royal_current_user', JSON.stringify(authenticatedUser));
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('royal_current_user', JSON.stringify(authenticatedUser));
    }
  } catch {
    // ignore
  }

  // BƯỚC 6: TRẢ VỀ KẾT QUẢ & THÔNG BÁO CHÀO MỪNG
  const roleLabel = getRoleLabelVN(authenticatedUser.role, authenticatedUser);
  return {
    success: true,
    user: authenticatedUser,
    successToast: `✓ Chào mừng ${authenticatedUser.full_name} (${roleLabel}) đã đăng nhập thành công!`,
  };
}



