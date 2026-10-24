import { SupabaseClient } from '@supabase/supabase-js';
import { AppStore } from '../types';
import {
  getSupabaseClient,
  getResolvedSupabaseConfig,
  sanitizeSupabaseBaseUrl,
  sanitizeSupabaseTableName,
  supabase,
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
    fetchTable('app_users'),
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
 * Cơ chế Khởi Động & Tải Dữ Liệu An Toàn (Safe Data Loader) cho AppStore
 * - Sử dụng Promise.allSettled nạp song song độc lập tất cả các bảng.
 * - Từng bảng được xử lý riêng biệt trong try/catch: nếu một bảng bị lỗi RLS, rỗng,
 *   hoặc timeout trên iOS/macOS WebKit, các bảng còn lại vẫn nạp thành công bình thường.
 * - Giữ nguyên cấu trúc dữ liệu Local / Mặc định cho những bảng không lấy được từ Cloud.
 * - Tuyệt đối không để màn hình trắng (White Screen) hay treo ứng dụng.
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

  try {
    const nextStore: AppStore = { ...fallbackStore };
    let totalRecordsLoaded = 0;

    // Danh sách toàn bộ các bảng cần nạp từ Supabase
    const allTableDefinitions: Array<{ tableName: string; storeKey: keyof AppStore }> = [
      ...ROYAL_STANDARDIZED_10_TABLES.map(t => ({
        tableName: sanitizeSupabaseTableName(t.tableName),
        storeKey: t.storeKey,
      })),
      { tableName: 'credit_notes', storeKey: 'makeupCredits' },
      { tableName: 'app_users', storeKey: 'users' },
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
          return { tableName: item.tableName, storeKey: item.storeKey, data: [] };
        }
        return {
          tableName: item.tableName,
          storeKey: item.storeKey,
          data: Array.isArray(data) ? data : [],
        };
      } catch (err: any) {
        console.warn(`[SafeLoader] Exception khi đọc bảng ${item.tableName}:`, err?.message || err);
        return { tableName: item.tableName, storeKey: item.storeKey, data: [] };
      }
    });

    const settledResults = await Promise.allSettled(fetchPromises);

    settledResults.forEach(res => {
      if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.data) && res.value.data.length > 0) {
        const { tableName, storeKey, data } = res.value;
        const mappedRows = data
          .map(row => mapSupabaseRowToStoreEntity(tableName, row))
          .filter(Boolean);

        if (mappedRows.length > 0) {
          (nextStore as any)[storeKey] = mappedRows;
          totalRecordsLoaded += mappedRows.length;
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
