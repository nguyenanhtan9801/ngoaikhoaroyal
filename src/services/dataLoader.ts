import { AppStore } from '../types';
import { getSupabaseClient, getResolvedSupabaseConfig } from '../supabaseClient';
import {
  ROYAL_STANDARDIZED_10_TABLES,
  mapSupabaseRowToStoreEntity,
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

let hasShownOfflineFallbackToast = false;

/**
 * Cơ chế Khởi Động & Tải Dữ Liệu An Toàn (Safe Data Loader)
 * - Bọc toàn bộ lời gọi API supabase.from(...).select('*') trong khối try...catch.
 * - Nếu Supabase chưa khởi tạo bảng, sai khóa hoặc mất kết nối:
 *   + Tuyệt đối không để màn hình trắng (White Screen).
 *   + Hiển thị thông báo Toast nhẹ: "Đang hoạt động ở chế độ ngoại tuyến/cơ sở dữ liệu mẫu do chưa kết nối được máy chủ."
 *   + Giữ nguyên cấu trúc dữ liệu Local / Mặc định để giao diện vận hành bình thường.
 */
export async function loadInitialDataSafely(
  currentStore?: AppStore
): Promise<SafeDataLoadResult> {
  const fallbackStore: AppStore = currentStore || loadStore();
  const { url, anonKey } = getResolvedSupabaseConfig(
    fallbackStore.supabaseConfig?.url,
    fallbackStore.supabaseConfig?.anonKey
  );

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

  const supabase = getSupabaseClient(url, anonKey);
  if (!supabase) {
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
    let reachableTablesCount = 0;
    let encounteredFatalError = false;

    for (const tbl of ROYAL_STANDARDIZED_10_TABLES) {
      try {
        const { data, error } = await supabase.from(tbl.tableName).select('*');
        if (error) {
          // Nếu lỗi xác thực (401/403) hoặc mất kết nối mạng, dừng truy vấn các bảng tiếp theo
          const msg = String(error.message || '').toLowerCase();
          if (
            error.code === 'PGRST301' ||
            msg.includes('jwt') ||
            msg.includes('invalid api key') ||
            msg.includes('failed to fetch')
          ) {
            encounteredFatalError = true;
            break;
          }
          continue;
        }

        reachableTablesCount += 1;
        if (Array.isArray(data) && data.length > 0) {
          const mappedRows = data
            .map(row => mapSupabaseRowToStoreEntity(tbl.tableName, row))
            .filter(Boolean);
          if (mappedRows.length > 0) {
            (nextStore as any)[tbl.storeKey] = mappedRows;
            totalRecordsLoaded += mappedRows.length;
          }
        }
      } catch {
        encounteredFatalError = true;
        break;
      }
    }

    // Thử tải thêm 3 bảng bổ trợ (credit_notes, app_users, parent_registrations) trong khối try...catch an toàn
    if (!encounteredFatalError && reachableTablesCount > 0) {
      const extraTables: Array<{ table: string; storeKey: keyof AppStore }> = [
        { table: 'credit_notes', storeKey: 'makeupCredits' },
        { table: 'app_users', storeKey: 'users' },
        { table: 'parent_registrations', storeKey: 'parentRegistrations' },
      ];

      for (const extra of extraTables) {
        try {
          const { data, error } = await supabase.from(extra.table).select('*');
          if (!error && Array.isArray(data) && data.length > 0) {
            const mapped = data
              .map(row => mapSupabaseRowToStoreEntity(extra.table, row))
              .filter(Boolean);
            if (mapped.length > 0) {
              (nextStore as any)[extra.storeKey] = mapped;
              totalRecordsLoaded += mapped.length;
            }
          }
        } catch {
          // Bỏ qua lỗi bảng bổ trợ để không ảnh hưởng toàn hệ thống
        }
      }
    }

    if (encounteredFatalError || reachableTablesCount === 0) {
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

    if (totalRecordsLoaded > 0) {
      saveStore(nextStore);
    }

    return {
      store: nextStore,
      isOfflineFallback: false,
      loadedFromCloud: true,
      totalRecordsLoaded,
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
