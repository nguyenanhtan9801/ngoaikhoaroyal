import { SupabaseClient } from '@supabase/supabase-js';
import { AppStore, AppUser } from '../types';
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
  SUPABASE_TABLE_SELECT_COLUMNS,
} from '../lib/supabase';
import { loadStore, saveStore, syncTeachersCurrentFieldsFromContracts } from '../lib/storage';
import { fetchOnce } from '../lib/fetchOnce';
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
      const cols = SUPABASE_TABLE_SELECT_COLUMNS[tableName] || '*';
      let query = client.from(tableName).select(cols);
      if (tableName === 'academic_terms') {
        query = query.order('start_date', { ascending: true });
      } else if (tableName === 'students') {
        query = query.limit(200);
      }
      const { data, error } = await query;
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
    ? catalog!.terms
        .map((t: any) => ({
          id: String(t.id || ''),
          code: String(t.code || t.id || ''),
          name: String(t.name || ''),
          academic_year: String(t.academic_year || '2026-2027'),
          start_date: String(t.start_date || ''),
          end_date: String(t.end_date || ''),
          registration_deadline: String(t.end_date || ''),
          total_weeks: Number(t.total_weeks) || 12,
          status: (t.status && t.status !== 'open' ? t.status : 'open_enrollment') as any,
          is_active: t.is_active ?? (t.status === 'open' || t.status === 'open_enrollment' || t.status === 'in_progress'),
          description: String(t.description || ''),
        }))
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
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
    teacherContracts: [],
    teacherCheckins: [],
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
  currentStore?: AppStore,
  activeUser?: AppUser | null
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
      if (!hasSavedToken && !activeUser?.id) {
        return loadPublicCatalogSafely(currentStore);
      }
      if (!activeUser?.id) {
        const { data: sessionData } = await client.auth.getSession();
        if (!sessionData?.session?.user) {
          return loadPublicCatalogSafely(currentStore);
        }
      }
    } catch {
      return loadPublicCatalogSafely(currentStore);
    }
  }

  try {
    const nextStore: AppStore = { ...fallbackStore };
    let totalRecordsLoaded = 0;

    const userRole = activeUser?.role || 'super_admin';
    if (userRole === 'teacher') {
      return {
        store: fallbackStore,
        isOfflineFallback: false,
        loadedFromCloud: false,
        totalRecordsLoaded: 0,
      };
    }

    const rawCampus = String(activeUser?.campus_id || 'all').toLowerCase().trim();
    const scopedCampusCode =
      rawCampus === 'pmh' || rawCampus === 'camp_pmh'
        ? 'pmh'
        : rawCampus === 'pl' || rawCampus === 'camp_pl'
        ? 'pl'
        : 'all';

    // Danh sách các bảng cần nạp từ Supabase được lọc theo vai trò người dùng
    // - Chỉ nạp bảng profiles toàn cục nếu user là super_admin (đã có syncProfilesListForSuperAdmin dùng fetchOnce)
    // - Nếu là teacher: bỏ qua các bảng tài chính/tuyển sinh không cần thiết (tuition_invoices, credit_notes, parent_registrations)
    const baseTableDefinitions: Array<{ tableName: string; storeKey: keyof AppStore }> = [
      ...ROYAL_STANDARDIZED_10_TABLES.map(t => ({
        tableName: sanitizeSupabaseTableName(t.tableName),
        storeKey: t.storeKey,
      })),
      { tableName: 'credit_notes', storeKey: 'makeupCredits' },
      ...(userRole === 'super_admin'
        ? [{ tableName: isLegacyLoginEnabled() ? 'app_users' : 'profiles', storeKey: 'users' as keyof AppStore }]
        : []),
      { tableName: 'parent_registrations', storeKey: 'parentRegistrations' },
      { tableName: 'subject_categories', storeKey: 'subjectCategories' },
      { tableName: 'time_slots', storeKey: 'timeSlots' },
      { tableName: 'term_subjects', storeKey: 'termSubjects' },
      { tableName: 'teacher_contracts', storeKey: 'teacherContracts' },
      { tableName: 'teacher_checkins', storeKey: 'teacherCheckins' },
    ];

    const allTableDefinitions = baseTableDefinitions;

    // Nạp song song độc lập từng bảng với Promise.allSettled + fetchOnce (TTL 60s)
    const fetchPromises = allTableDefinitions.map(async item => {
      try {
        const cols = SUPABASE_TABLE_SELECT_COLUMNS[item.tableName] || '*';
        const cacheKey = `init_load:${item.tableName}:${scopedCampusCode}:${userRole}`;

        const { data, error } = await fetchOnce(
          cacheKey,
          async () => {
            let query = client.from(item.tableName).select(cols);

            if (item.tableName === 'academic_terms') {
              query = query.order('start_date', { ascending: true });
            }

            // Lọc theo cơ sở (campus_id) cho các bảng có campus_id khi nhân sự chỉ phụ trách 1 cơ sở
            if (scopedCampusCode !== 'all') {
              const campusVariants =
                scopedCampusCode === 'pmh'
                  ? ['pmh', 'camp_pmh', 'PMH']
                  : ['pl', 'camp_pl', 'PL'];
              if (
                item.tableName === 'extracurricular_classes' ||
                item.tableName === 'teachers' ||
                item.tableName === 'teacher_work_sessions' ||
                item.tableName === 'teacher_checkins' ||
                item.tableName === 'students'
              ) {
                query = query.in('campus_id', campusVariants);
              }
            }

            // Giới hạn tải danh sách học sinh ban đầu (StudentsTab đã phân trang server-side 100 dòng/trang)
            if (item.tableName === 'students') {
              query = query.limit(200);
            }

            return await query;
          },
          60_000
        );

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
        if (tableName === 'academic_terms' && Array.isArray(data) && data.length > 0) {
          // Chuẩn hóa và nạp toàn bộ khóa học từ bảng academic_terms vào store.terms
          const mappedTerms = data.map((t: any) => ({
            id: t.id,
            code: t.code,
            name: t.name,
            academic_year: t.academic_year || '2026-2027',
            start_date: t.start_date,
            end_date: t.end_date,
            is_active: t.is_active ?? (t.status === 'open_enrollment' || t.status === 'in_progress'),
            status: t.status || 'open_enrollment',
            description: t.description || '',
          }));
          nextStore.terms = mappedTerms;
          totalRecordsLoaded += mappedTerms.length;
          return;
        }

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

    // Đảm bảo chắc chắn store.terms được ghi đè từ bảng academic_terms trên Supabase
    if (
      !Array.isArray(nextStore.terms) ||
      nextStore.terms.length <= 1 ||
      nextStore.terms.some(t => t.code === 'HK2-2526' || t.id === 'term_hk2_2025_2026')
    ) {
      const { data: termsData, error: termsErr } = await client
        .from('academic_terms')
        .select('*')
        .order('start_date', { ascending: true });

      if (!termsErr && Array.isArray(termsData) && termsData.length > 0) {
        const mappedTerms = termsData.map((t: any) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          academic_year: t.academic_year || '2026-2027',
          start_date: t.start_date,
          end_date: t.end_date,
          is_active: t.is_active ?? (t.status === 'open_enrollment' || t.status === 'in_progress'),
          status: t.status || 'open_enrollment',
          description: t.description || '',
        }));
        nextStore.terms = mappedTerms;
        totalRecordsLoaded += mappedTerms.length;
      }
    }

    if (totalRecordsLoaded > 0) {
      const syncedStore = syncTeachersCurrentFieldsFromContracts(nextStore);
      saveStore(syncedStore);
      return {
        store: syncedStore,
        isOfflineFallback: false,
        loadedFromCloud: true,
        totalRecordsLoaded,
      };
    }

    // Nếu toàn bộ bảng trên Cloud đều rỗng hoặc chưa nạp được bản ghi nào
    return {
      store: syncTeachersCurrentFieldsFromContracts(fallbackStore),
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

/**
 * Truy vấn trực tiếp bảng academic_terms từ Supabase (sắp xếp theo start_date tăng dần)
 * và ghi đè vào store.terms.
 */
export async function syncAcademicTermsFromSupabase(
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void
): Promise<void> {
  const client = getSupabaseClient() || supabase;
  if (!client) return;

  try {
    const { data: termsData, error: termsErr } = await fetchOnce(
      'academic_terms:ordered',
      async () =>
        await client
          .from('academic_terms')
          .select('*')
          .order('start_date', { ascending: true }),
      60_000
    );

    if (!termsErr && Array.isArray(termsData) && termsData.length > 0) {
      // Chuẩn hóa và nạp 7 khóa học vào store
      const mappedTerms = termsData.map((t: any) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        academic_year: t.academic_year || '2026-2027',
        start_date: t.start_date,
        end_date: t.end_date,
        is_active: t.is_active ?? (t.status === 'open_enrollment' || t.status === 'in_progress'),
        status: t.status || 'open_enrollment',
        description: t.description || '',
      }));

      onUpdateStore(prev => {
        if (JSON.stringify(prev.terms) === JSON.stringify(mappedTerms)) {
          return prev;
        }
        const next = {
          ...prev,
          terms: mappedTerms,
        };
        saveStore(next);
        return next;
      });
    }
  } catch (err) {
    console.warn('[syncAcademicTermsFromSupabase] Lỗi nạp academic_terms:', err);
  }
}
