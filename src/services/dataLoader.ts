import { SupabaseClient } from '@supabase/supabase-js';
import { AppStore } from '../types';
import {
  getSupabaseClient,
  getResolvedSupabaseConfig,
  sanitizeSupabaseBaseUrl,
  sanitizeSupabaseTableName,
  supabase,
  isLegacyLoginEnabled,
} from '../supabaseClient';
import {
  ROYAL_STANDARDIZED_10_TABLES,
  mapSupabaseRowToStoreEntity,
  SUPABASE_TABLE_TO_STORE_KEY,
} from '../lib/supabase';
import { loadStore, saveStore } from '../lib/storage';
import { showToast } from '../lib/toast';

export interface SafeDataLoadResult {
  store: AppStore;
  isOfflineFallback: boolean;
  loadedFromCloud: boolean;
  totalRecordsLoaded: number;
  errorMessage?: string;
}

export interface AppDataSafeResult {
  students: any[];
  classes: any[];
  terms: any[];
  campuses: any[];
  teachers: any[];
  campusSubjectFees: any[];
  enrollments: any[];
  attendanceRecords: any[];
  tuitionInvoices: any[];
  appUsers: any[];
  parentRegistrations: any[];
  subjectCategories: any[];
  timeSlots: any[];
  isLoading: boolean;
}

let hasShownOfflineFallbackToast = false;

/**
 * Nạp độc lập từng bảng dữ liệu từ Supabase sử dụng Promise.allSettled.
 * Bảng nào có dữ liệu thì nạp, bảng nào lỗi hoặc rỗng thì trả về mảng [],
 * không để sập giao diện hoặc treo màn hình trên macOS / iOS Safari & Chrome.
 */
export async function loadAppDataSafe(customClient?: SupabaseClient | null): Promise<AppDataSafeResult> {
  const client = customClient || getSupabaseClient() || supabase;

  const fetchTable = async (tableName: string): Promise<any[]> => {
    if (!client) return [];
    try {
      const { data, error } = await client.from(tableName).select('*');
      if (error) {
        console.warn(`Lỗi khi đọc bảng ${tableName}:`, error.message);
        return [];
      }
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn(`Exception bảng ${tableName}:`, e);
      return [];
    }
  };

  const results = await Promise.allSettled([
    fetchTable('students'),
    fetchTable('extracurricular_classes'),
    fetchTable('academic_terms'),
    fetchTable('campuses'),
    fetchTable('teachers'),
    fetchTable('campus_subject_fees'),
    fetchTable('enrollments'),
    fetchTable('attendance_records'),
    fetchTable('tuition_invoices'),
    fetchTable(isLegacyLoginEnabled() ? 'app_users' : 'profiles'),
    fetchTable('parent_registrations'),
    fetchTable('subject_categories'),
    fetchTable('time_slots'),
  ]);

  const getData = (index: number): any[] => {
    const item = results[index];
    return item.status === 'fulfilled' && Array.isArray(item.value) ? item.value : [];
  };

  const [
    students,
    classes,
    terms,
    campuses,
    teachers,
    fees,
    enrollments,
    attendance,
    invoices,
    users,
    registrations,
    subjectCategories,
    timeSlots,
  ] = [
    getData(0),
    getData(1),
    getData(2),
    getData(3),
    getData(4),
    getData(5),
    getData(6),
    getData(7),
    getData(8),
    getData(9),
    getData(10),
    getData(11),
    getData(12),
  ];

  return {
    students,
    classes,
    terms,
    campuses,
    teachers,
    campusSubjectFees: fees,
    enrollments,
    attendanceRecords: attendance,
    tuitionInvoices: invoices,
    appUsers: users,
    parentRegistrations: registrations,
    subjectCategories,
    timeSlots,
    isLoading: false,
  };
}

/**
 * Tạo Store an toàn dành riêng cho khách / phụ huynh chưa đăng nhập nhân sự:
 * Chỉ chứa dữ liệu danh mục từ GET /api/public/catalog, không chứa bất kỳ dữ liệu cá nhân hay bảng nội bộ nào.
 */
export function buildGuestCatalogStore(
  baseStore?: AppStore,
  catalog?: {
    campuses?: any[];
    terms?: any[];
    subjects?: any[];
    time_slots?: any[];
  }
): AppStore {
  const fallback = baseStore || loadStore();
  const mappedCampuses = Array.isArray(catalog?.campuses)
    ? catalog!.campuses.map((c: any) => ({
        id: String(c.id || ''),
        code: String(c.code || c.id || '').toUpperCase(),
        name: String(c.name || ''),
        address: '',
        phone: '',
        bank_name: '',
        bank_account: '',
        bank_owner: '',
        status: 'active' as const,
      }))
    : [];

  const mappedTerms = Array.isArray(catalog?.terms)
    ? catalog!.terms.map((t: any) => ({
        id: String(t.id || ''),
        code: String(t.code || t.id || ''),
        name: String(t.name || ''),
        academic_year: '2025-2026',
        start_date: String(t.start_date || ''),
        end_date: String(t.end_date || ''),
        registration_deadline: String(t.end_date || ''),
        total_weeks: Number(t.total_weeks) || 12,
        status: 'open_enrollment' as const,
        is_active: true,
      }))
    : [];

  const mappedSubjects = Array.isArray(catalog?.subjects)
    ? catalog!.subjects.map((s: any) => ({
        id: String(s.id || ''),
        code: String(s.code || s.id || ''),
        name: String(s.name || ''),
        category: (s.category || 'Sports') as any,
        campus_id: String(s.campus_id || 'pmh'),
        fee_per_session: Number(s.fee_per_session || 0),
        total_sessions: Number(s.total_sessions || 24),
        package_fee: Number(s.package_fee || 0),
        sessions_per_week: 2,
        duration_weeks: 12,
        description: '',
        time_slot_ids: Array.isArray(s.time_slot_ids) ? s.time_slot_ids.map(String) : [],
        default_time_slot_id: String(s.default_time_slot_id || ''),
        is_active: true,
        status: 'active' as const,
      }))
    : [];

  const mappedTimeSlots = Array.isArray(catalog?.time_slots)
    ? catalog!.time_slots.map((ts: any) => ({
        id: String(ts.id || ''),
        code: String(ts.code || ts.id || ''),
        name: String(ts.name || ''),
        start_time: String(ts.start_time || '16:15'),
        end_time: String(ts.end_time || '17:15'),
        duration_minutes: 60,
        days_of_week: Array.isArray(ts.days_of_week) ? ts.days_of_week : ['Mon', 'Wed'],
        is_weekend: Boolean(ts.is_weekend),
        is_afternoon_weekday:
          ts.is_afternoon_weekday !== undefined ? Boolean(ts.is_afternoon_weekday) : !ts.is_weekend,
        campus_id: String(ts.campus_id || 'all'),
        status: 'active' as const,
        is_active: true,
      }))
    : [];

  return {
    ...fallback,
    campuses: mappedCampuses,
    terms: mappedTerms,
    subjects: mappedSubjects,
    timeSlots: mappedTimeSlots,
    subjectCategories: [],
    termSubjects: [],
    teachers: [],
    students: [],
    classes: [],
    enrollments: [],
    attendance: [],
    makeupCredits: [],
    transfers: [],
    invoices: [],
    notifications: [],
    parentRegistrations: [],
    users: [],
    auditLogs: [],
  };
}

/**
 * Tải danh mục công khai từ GET /api/public/catalog cho khách / phụ huynh chưa đăng nhập.
 * Tuyệt đối KHÔNG gọi *.supabase.co trực tiếp.
 */
export async function loadPublicCatalogSafely(
  currentStore?: AppStore
): Promise<SafeDataLoadResult> {
  try {
    const res = await fetch('/api/public/catalog', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const catalog = await res.json();
    const guestStore = buildGuestCatalogStore(currentStore, catalog);
    const totalCount =
      guestStore.campuses.length +
      guestStore.terms.length +
      guestStore.subjects.length +
      (guestStore.timeSlots?.length || 0);
    return {
      store: guestStore,
      isOfflineFallback: false,
      loadedFromCloud: false,
      totalRecordsLoaded: totalCount,
    };
  } catch (err: any) {
    return {
      store: buildGuestCatalogStore(currentStore),
      isOfflineFallback: true,
      loadedFromCloud: false,
      totalRecordsLoaded: 0,
      errorMessage: err?.message || 'Failed to load public catalog',
    };
  }
}

/**
 * Cơ chế Khởi Động & Tải Dữ Liệu An Toàn (Safe Data Loader) cho AppStore (CHỈ dành cho nhân sự đã đăng nhập)
 */
export async function loadInitialDataSafely(
  currentStore?: AppStore
): Promise<SafeDataLoadResult> {
  const fallbackStore: AppStore = currentStore || loadStore();
  const { url: rawUrl, anonKey } = getResolvedSupabaseConfig(
    fallbackStore.supabaseConfig?.url,
    fallbackStore.supabaseConfig?.anonKey
  );
  const url = sanitizeSupabaseBaseUrl(rawUrl);

  // Nếu chưa cấu hình URL hoặc Anon Key, chuyển sang chế độ ngoại tuyến an toàn
  if (!url || !anonKey) {
    if (!hasShownOfflineFallbackToast) {
      hasShownOfflineFallbackToast = true;
      showToast(
        'Đang hoạt động ở chế độ ngoại tuyến/cơ sở dữ liệu mẫu do chưa kết nối được máy chủ.',
        'info'
      );
    }
    return {
      store: fallbackStore,
      isOfflineFallback: true,
      loadedFromCloud: false,
      totalRecordsLoaded: 0,
    };
  }

  const client = getSupabaseClient(url, anonKey) || supabase;
  if (!client) {
    if (!hasShownOfflineFallbackToast) {
      hasShownOfflineFallbackToast = true;
      showToast(
        'Đang hoạt động ở chế độ ngoại tuyến/cơ sở dữ liệu mẫu do chưa kết nối được máy chủ.',
        'info'
      );
    }
    return {
      store: fallbackStore,
      isOfflineFallback: true,
      loadedFromCloud: false,
      totalRecordsLoaded: 0,
    };
  }

  // Bảo vệ nghiêm ngặt: nếu chưa có phiên đăng nhập nhân sự hợp lệ thì tuyệt đối không gọi *.supabase.co
  if (!isLegacyLoginEnabled()) {
    try {
      const hasSavedToken =
        typeof window !== 'undefined' &&
        Boolean(window.localStorage.getItem('royal_school_supabase_auth'));
      if (!hasSavedToken) {
        return loadPublicCatalogSafely(currentStore);
      }
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData?.session?.user) {
        return loadPublicCatalogSafely(currentStore);
      }
    } catch {
      return loadPublicCatalogSafely(currentStore);
    }
  }

  try {
    const nextStore: AppStore = { ...fallbackStore };
    let totalRecordsLoaded = 0;

    // Danh sách toàn bộ các bảng cần nạp từ Supabase (khi VITE_LEGACY_LOGIN='false', chỉ lấy người dùng từ profiles)
    const allTableDefinitions: Array<{ tableName: string; storeKey: keyof AppStore }> = [
      ...ROYAL_STANDARDIZED_10_TABLES.map(t => ({
        tableName: sanitizeSupabaseTableName(t.tableName),
        storeKey: t.storeKey,
      })),
      { tableName: 'credit_notes', storeKey: 'makeupCredits' },
      { tableName: isLegacyLoginEnabled() ? 'app_users' : 'profiles', storeKey: 'users' },
      { tableName: 'parent_registrations', storeKey: 'parentRegistrations' },
      { tableName: 'subject_categories', storeKey: 'subjectCategories' },
      { tableName: 'time_slots', storeKey: 'timeSlots' },
      { tableName: 'term_subjects', storeKey: 'termSubjects' },
    ];

    // Nạp song song độc lập từng bảng với Promise.allSettled
    const fetchPromises = allTableDefinitions.map(async item => {
      try {
        const { data, error } = await client.from(item.tableName).select('*');
        if (error) {
          console.warn(`[SafeLoader] Bảng ${item.tableName} không nạp được (${error.message}), giữ dữ liệu cục bộ.`);
          return { tableName: item.tableName, storeKey: item.storeKey, data: [], success: false };
        }
        return {
          tableName: item.tableName,
          storeKey: item.storeKey,
          data: Array.isArray(data) ? data : [],
          success: true,
        };
      } catch (err: any) {
        console.warn(`[SafeLoader] Exception khi đọc bảng ${item.tableName}:`, err?.message || err);
        return { tableName: item.tableName, storeKey: item.storeKey, data: [], success: false };
      }
    });

    const settledResults = await Promise.allSettled(fetchPromises);

    settledResults.forEach(res => {
      if (res.status === 'fulfilled' && res.value && res.value.success) {
        const { tableName, storeKey, data } = res.value;
        const mapperKey = tableName === 'app_users' ? 'profiles' : tableName;
        const mappedRows = data
          .map(row => mapSupabaseRowToStoreEntity(mapperKey, row))
          .filter(Boolean);

        if (mappedRows.length > 0) {
          (nextStore as any)[storeKey] = mappedRows;
          totalRecordsLoaded += mappedRows.length;
        } else if (storeKey === 'users' && !isLegacyLoginEnabled()) {
          nextStore.users = [];
        } else if (Array.isArray((fallbackStore as any)[storeKey]) && (fallbackStore as any)[storeKey].length > 0) {
          (nextStore as any)[storeKey] = (fallbackStore as any)[storeKey];
        }
      }
    });

    if (totalRecordsLoaded > 0) {
      saveStore(nextStore);
      return {
        store: nextStore,
        isOfflineFallback: false,
        loadedFromCloud: true,
        totalRecordsLoaded,
      };
    }

    // Nếu toàn bộ bảng trên Cloud đều rỗng hoặc chưa nạp được bản ghi nào
    return {
      store: fallbackStore,
      isOfflineFallback: false,
      loadedFromCloud: false,
      totalRecordsLoaded: 0,
    };
  } catch (err: any) {
    console.warn('⚠️ Lỗi tải dữ liệu ban đầu từ Supabase, chuyển sang chế độ ngoại tuyến:', err);
    if (!hasShownOfflineFallbackToast) {
      hasShownOfflineFallbackToast = true;
      showToast(
        'Đang hoạt động ở chế độ ngoại tuyến/cơ sở dữ liệu mẫu do chưa kết nối được máy chủ.',
        'info'
      );
    }
    return {
      store: fallbackStore,
      isOfflineFallback: true,
      loadedFromCloud: false,
      totalRecordsLoaded: 0,
      errorMessage: err?.message || 'Offline fallback',
    };
  }
}
