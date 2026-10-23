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
  AuditLogRecord,
  LogActionType,
  CloudStorageConfig,
  PayrollRateConfig,
  AppStore,
} from '../types';

export type { AppStore, PayrollRateConfig };

export const initialPayrollRateConfig: PayrollRateConfig = {
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
    teacherAttendance: initialTeacherAttendance,
    attendance: initialAttendance,
    makeupCredits: initialMakeupCredits,
    transfers: initialTransfers,
    payrollSettlements: [],
    payrollRateConfig: initialPayrollRateConfig,
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

    // If cached store is from old schema/count, reset to initial
    if (!parsed.students || parsed.students.length < 10 || !parsed.classes || parsed.classes.length < 5) {
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

    const termSubjects: TermSubjectConfig[] = (
      parsed.termSubjects && parsed.termSubjects.length > 0
        ? parsed.termSubjects
        : initial.termSubjects
    ).map((ts: TermSubjectConfig) => ({
      ...ts,
      discount_type: 'none',
      discount_value: 0,
      discount_reason: undefined,
    }));

    const campusPricings: CampusTermPricing[] = (
      parsed.campusPricings && parsed.campusPricings.length > 0
        ? parsed.campusPricings
        : initial.campusPricings
    ).map((cp: CampusTermPricing) => ({
      ...cp,
      discount_type: 'none',
      discount_value: 0,
      discount_reason: undefined,
    }));

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

    const rawRegistrations: ParentRegistration[] =
      parsed.parentRegistrations && parsed.parentRegistrations.length > 0
        ? [...parsed.parentRegistrations]
        : [...initial.parentRegistrations];

    // Ensure new demonstration leads (preg_05, preg_06, preg_07) exist in store
    initial.parentRegistrations.forEach(seedReg => {
      if (!rawRegistrations.some(r => r.id === seedReg.id)) {
        rawRegistrations.unshift(seedReg);
      }
    });

    const parentRegistrations: ParentRegistration[] = rawRegistrations.map((reg: ParentRegistration) => {
      const fixFee = (val?: number) => {
        if (val === 3790500) return 3990000;
        if (val === 4275000) return 4500000;
        if (val === 2945000) return 3100000;
        if (val === 3078000) return 3240000;
        if (val === 3610000) return 3800000;
        return val;
      };
      // Sync preg_01 and preg_02 parent phone with Royal DB if still on old placeholder phone
      const syncedParentPhone =
        reg.id === 'preg_01' && reg.parent_phone === '0903 888 777'
          ? '0935 443 322'
          : reg.id === 'preg_02' && reg.parent_phone === '0918 222 333'
          ? '0904 556 688'
          : reg.parent_phone;
      const syncedParentName =
        reg.id === 'preg_01' && reg.parent_name === 'Nguyễn Thị Bích Ngọc'
          ? 'Lương Minh Trí'
          : reg.id === 'preg_02' && reg.parent_name === 'Trần Văn Mạnh'
          ? 'Trương Quốc Hùng'
          : reg.parent_name;

      return {
        ...reg,
        parent_phone: syncedParentPhone,
        parent_name: syncedParentName,
        estimated_fee: fixFee(reg.estimated_fee),
        discount_policy:
          reg.discount_policy && reg.discount_policy.includes('5%')
            ? 'Áp dụng đơn giá chuẩn của Cơ sở'
            : reg.discount_policy,
        registered_subjects: reg.registered_subjects?.map(sub => ({
          ...sub,
          estimated_fee: fixFee(sub.estimated_fee) || sub.estimated_fee,
        })),
      };
    });

    // Ensure Next-Term and Cross-Term classes exist in store.classes
    const rawClasses: ExtracurricularClass[] =
      parsed.classes && parsed.classes.length > 0 ? [...parsed.classes] : [...initial.classes];
    initial.classes.forEach(seedCls => {
      const existingIdx = rawClasses.findIndex(c => c.id === seedCls.id);
      if (existingIdx === -1) {
        rawClasses.push(seedCls);
      } else if (seedCls.is_cross_term && !rawClasses[existingIdx].is_cross_term) {
        rawClasses[existingIdx] = { ...rawClasses[existingIdx], ...seedCls };
      }
    });

    // Ensure seeded sessions & attendance records exist and term_id is backfilled
    const rawSessions: ClassSession[] =
      (parsed.sessions && parsed.sessions.length > 0 ? [...parsed.sessions] : [...initial.sessions]).map(ses => {
        if (!ses.term_id) {
          const cls = rawClasses.find(c => c.id === ses.class_id);
          if (cls) {
            if (cls.is_cross_term && cls.spanning_term_id && cls.term_distribution) {
              const termId = ses.session_number > cls.term_distribution.primary_term_sessions ? cls.spanning_term_id : cls.term_id;
              return { ...ses, term_id: termId };
            }
            return { ...ses, term_id: cls.term_id };
          }
        }
        return ses;
      });
    initial.sessions.forEach(seedSes => {
      const existingIdx = rawSessions.findIndex(s => s.id === seedSes.id);
      if (existingIdx === -1) {
        rawSessions.push(seedSes);
      } else if (seedSes.id === 'ses_swim_pmh_03' && rawSessions[existingIdx].status === 'scheduled') {
        rawSessions[existingIdx] = seedSes;
      }
    });

    const rawAttendance: AttendanceRecord[] =
      parsed.attendance && parsed.attendance.length > 0 ? [...parsed.attendance] : [...initial.attendance];
    initial.attendance.forEach(seedAtt => {
      if (!rawAttendance.some(a => a.id === seedAtt.id)) {
        rawAttendance.push(seedAtt);
      }
    });

    // Sanitize makeupCredits so CRE-2026-0001 (and any legacy credit) strictly conforms to >= 3 consecutive sessions rule
    const rawMakeupCredits: MakeupCredit[] =
      parsed.makeupCredits && parsed.makeupCredits.length > 0
        ? [...parsed.makeupCredits]
        : [...initial.makeupCredits];
    const makeupCredits: MakeupCredit[] = rawMakeupCredits.map(cred => {
      const count = Math.max(3, cred.consecutive_absent_sessions || cred.consecutive_absent_count || 3);
      const dates =
        (cred.absent_dates && cred.absent_dates.length >= 3)
          ? cred.absent_dates
          : (cred.consecutive_dates && cred.consecutive_dates.length >= 3)
          ? cred.consecutive_dates
          : ['2026-09-07', '2026-09-09', '2026-09-14'];
      const rateOld = cred.unit_price_old || cred.source_rate || 166250;
      const totalAmount = count * rateOld;
      const studentObj = (parsed.students || initial.students).find((s: Student) => s.id === cred.student_id);
      return {
        ...cred,
        student_name: cred.student_name || studentObj?.name || '',
        source_term_id: cred.source_term_id || cred.term_id || 'term_fall_2026',
        consecutive_absent_sessions: count,
        consecutive_absent_count: count,
        absent_dates: dates,
        consecutive_dates: dates,
        unit_price_old: rateOld,
        source_rate: rateOld,
        total_credit_amount: totalAmount,
        transferred_sessions: count,
        expires_at: cred.expires_at || cred.expiry_date,
        note:
          cred.id === 'cred_01' && (!cred.note || cred.note.includes('2 buổi'))
            ? 'Bảo lưu 3 buổi nghỉ sốt siêu vi liên tiếp có giấy khám & toa thuốc BV Nhi Đồng'
            : cred.note,
      };
    });

    // Migrate teachers with default_rate_per_period, periods_per_session, code, campus_id, bank_account
    const rawTeachers: Teacher[] =
      parsed.teachers && parsed.teachers.length > 0 ? [...parsed.teachers] : [...initial.teachers];
    const teachers: Teacher[] = rawTeachers.map((tc, idx) => {
      const seedMatch = initial.teachers.find(st => st.id === tc.id);
      const periodsPerSession = tc.periods_per_session || seedMatch?.periods_per_session || 2;
      const defaultRatePerPeriod =
        tc.default_rate_per_period ||
        seedMatch?.default_rate_per_period ||
        Math.round((tc.fixed_rate_per_session || 300000) / periodsPerSession);
      return {
        ...seedMatch,
        ...tc,
        code: tc.code || seedMatch?.code || `GV-PMH-00${idx + 1}`,
        campus_id: tc.campus_id || seedMatch?.campus_id || 'camp_pmh',
        type: tc.type || tc.teacher_type || seedMatch?.type || 'permanent',
        teacher_type: tc.teacher_type || tc.type || seedMatch?.teacher_type || 'permanent',
        default_rate_per_period: defaultRatePerPeriod,
        periods_per_session: periodsPerSession,
        weekend_multiplier: tc.weekend_multiplier ?? seedMatch?.weekend_multiplier ?? 1.0,
        custom_subject_rates: tc.custom_subject_rates || seedMatch?.custom_subject_rates || [],
        bank_account: tc.bank_account || seedMatch?.bank_account || {
          bank_name: 'Vietcombank',
          account_number: `018100998877${idx}`,
          account_holder: tc.name.toUpperCase(),
        },
        fixed_rate_per_session: defaultRatePerPeriod * periodsPerSession,
      };
    });

    // Migrate or initialize teacherAttendance
    const rawTeacherAttendance: TeacherAttendanceRecord[] =
      parsed.teacherAttendance && parsed.teacherAttendance.length > 0
        ? [...parsed.teacherAttendance]
        : [...initialTeacherAttendance];
    initialTeacherAttendance.forEach(seedTatt => {
      if (!rawTeacherAttendance.some(ta => ta.id === seedTatt.id || (ta.class_id === seedTatt.class_id && ta.session_date === seedTatt.session_date))) {
        rawTeacherAttendance.push(seedTatt);
      }
    });

    const rawInvoices: TuitionInvoice[] =
      parsed.invoices && parsed.invoices.length > 0 ? [...parsed.invoices] : [...initial.invoices];
    initial.invoices.forEach(seedInv => {
      if (!rawInvoices.some(i => i.id === seedInv.id)) {
        rawInvoices.push(seedInv);
      }
    });

    return {
      ...initial,
      ...parsed,
      users,
      terms,
      subjectCategories,
      termSubjects,
      campusPricings,
      teachers,
      classes: rawClasses,
      sessions: rawSessions,
      invoices: rawInvoices,
      teacherAttendance: rawTeacherAttendance,
      attendance: rawAttendance,
      makeupCredits,
      enrollments,
      transfers: parsed.transfers && parsed.transfers.length > 0 ? parsed.transfers : initialTransfers,
      payrollRateConfig: parsed.payrollRateConfig || initialPayrollRateConfig,
      parentRegistrations,
      auditLogs,
      cloudStorageConfig,
    };
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanStore));
    window.dispatchEvent(new Event('royal_store_updated'));
    return;
  } catch (err: any) {
    console.warn('Standard saveStore hit quota limit, executing progressive compaction level 1...', err);
  }

  // Level 1: Aggressive compaction
  try {
    const compactStoreL1 = prepareStoreForStorage(store, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compactStoreL1));
    window.dispatchEvent(new Event('royal_store_updated'));
    return;
  } catch (err2: any) {
    console.warn('Compaction level 1 hit quota, executing emergency compaction level 2...', err2);
  }

  // Level 2: Emergency compaction
  try {
    const compactStoreL2 = prepareStoreForStorage(store, 2);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compactStoreL2));
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
  const explicitStudentId = lead.linked_student_id || lead.student_id || lead.assigned_student_id;

  let matchedStudent: Student | null = null;
  let confidence = 0;
  let matchCriteriaLabel = '';
  const siblingStudents: Student[] = [];

  for (const s of store.students) {
    const sName = normalizeStudentName(s.name);
    const sPhone = normalizePhoneDigits(s.parent_phone);
    const sDob = (s.dob || '').trim();

    const isExplicitLink = Boolean(
      (explicitStudentId && s.id === explicitStudentId) ||
        (lead.assigned_student_code && s.code === lead.assigned_student_code)
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
        e => e.student_id === matchedStudent!.id && (e.status === 'active' || e.status === 'trial')
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
 * Tính toán đơn giá tiết thực tế (rate_per_period) của giáo viên theo chuẩn thù lao toàn trường
 * Giáo viên Cơ Hữu (Permanent): 150.000 VNĐ / tiết (300.000 VNĐ / buổi 2 tiết)
 * Giáo viên Thỉnh Giảng (Visiting): 135.000 VNĐ / tiết (270.000 VNĐ / buổi 2 tiết)
 */
export function getTeacherEffectivePeriodRate(
  teacher: Teacher | undefined,
  subjectId?: string,
  isWeekend: boolean = false,
  payrollConfig?: PayrollRateConfig
): number {
  if (!teacher) return 150000;
  
  const isVisiting = teacher.type === 'visiting' || teacher.teacher_type === 'visiting';
  const permanentRate = payrollConfig?.permanent_rate_per_period ?? 150000;
  const visitingRate = payrollConfig?.visiting_rate_per_period ?? 135000;

  let basePeriodRate = isVisiting ? visitingRate : permanentRate;

  // Nếu giáo viên có cấu hình thù lao cụ thể và chưa có payrollConfig ghi đè
  if (!payrollConfig && teacher.default_rate_per_period) {
    basePeriodRate = teacher.default_rate_per_period;
  }

  if (subjectId && teacher.custom_subject_rates && teacher.custom_subject_rates.length > 0) {
    const customMatch = teacher.custom_subject_rates.find(cr => cr.subject_id === subjectId);
    if (customMatch && customMatch.rate_per_period > 0) {
      basePeriodRate = customMatch.rate_per_period;
    }
  }

  if (isWeekend && teacher.weekend_multiplier && teacher.weekend_multiplier > 1) {
    return Math.round(basePeriodRate * teacher.weekend_multiplier);
  }

  return basePeriodRate;
}

// Re-export Database Integrity Manager & 3NF validation services
export {
  DatabaseIntegrityManager,
  normalizeVietnameseName,
  normalizePhoneNumber,
} from './schemaValidator';
export type {
  StudentMatchResult,
  CreditEligibilityResult,
  TransferCalculationResult,
  IntegrityCheckResult,
} from './schemaValidator';
