import { createClient, SupabaseClient, SupportedStorage } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://wobszxqzlalzcjcfbzhq.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYnN6eHF6bGFsemNqY2ZiemhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0Nzg3MDQsImV4cCI6MjEwODA1NDcwNH0.fACSgo3mpzdBS-of_fFkMF14NYL3J3P_5WM2k6FtEcA';

export const DEFAULT_SUPABASE_URL = SUPABASE_URL;
export const DEFAULT_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

export interface SafeSyncStorage extends SupportedStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * Kiểm tra xem một chuỗi có phải là API Key hợp lệ không (loại bỏ trường hợp chuỗi chỉ là project ref 'wobszxqzlalzcjcfbzhq')
 */
export function isLikelyValidAnonKey(key?: string | null): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (
    !trimmed ||
    trimmed === 'wobszxqzlalzcjcfbzhq' ||
    trimmed.includes('your-anon-public-key') ||
    trimmed.includes('DÁN_CHUỖI') ||
    trimmed.length < 30
  ) {
    return false;
  }
  return (trimmed.startsWith('eyJ') && trimmed.split('.').length === 3) || trimmed.startsWith('sb_');
}

/**
 * Khởi tạo bộ lưu trữ an toàn tránh lỗi Storage trên iOS/WebKit (SecurityError, ITP, Private Browsing)
 */
export const createSafeStorage = (): SafeSyncStorage => {
  const memoryStore: Record<string, string> = {};

  const isLocalStorageAvailable = () => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const testKey = '__test_ios_storage__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  };

  const useLocal = isLocalStorageAvailable();

  return {
    getItem: (key: string): string | null => {
      if (useLocal) {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return memoryStore[key] || null;
        }
      }
      return memoryStore[key] || null;
    },
    setItem: (key: string, value: string): void => {
      if (useLocal) {
        try {
          window.localStorage.setItem(key, value);
          return;
        } catch {
          // Bị chặn quota hoặc incognito/ITP trên iOS WebKit
        }
      }
      memoryStore[key] = value;
    },
    removeItem: (key: string): void => {
      if (useLocal) {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // Bỏ qua lỗi
        }
      }
      delete memoryStore[key];
    },
  };
};

export const safeStorage = createSafeStorage();

/**
 * Làm sạch Base URL của Supabase:
 * - Gỡ bỏ cú pháp Markdown link nếu người dùng copy-paste nhầm: [https://...](https://...)
 * - Loại bỏ hoàn toàn hậu tố '/rest/v1', '/rest/v1/', '/realtime/v1', hoặc dấu '/' thừa ở cuối chuỗi
 * - Ngăn chặn triệt để lỗi 404 do lặp đường dẫn '/rest/v1/rest/v1/'
 */
export function sanitizeSupabaseBaseUrl(rawInput?: string | null): string {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let cleaned = rawInput.trim();

  // Nếu chuỗi có dạng markdown [https://...](https://...) thì trích xuất URL thực
  const markdownMatch = cleaned.match(/\((https?:\/\/[^)]+)\)/) || cleaned.match(/\[(https?:\/\/[^\]]+)\]/);
  if (markdownMatch && markdownMatch[1]) {
    cleaned = markdownMatch[1].trim();
  }

  // Loại bỏ khoảng trắng, dấu ngoặc kép/đơn bao ngoài
  cleaned = cleaned.replace(/^['"`]+|['"`]+$/g, '').trim();

  // Liên tục gỡ bỏ dấu '/' ở cuối và các hậu tố '/rest/v1', '/realtime/v1', '/auth/v1'
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/\/+$/, '')
      .replace(/\/rest\/v1(\/.*)?$/i, '')
      .replace(/\/realtime\/v1(\/.*)?$/i, '')
      .replace(/\/auth\/v1(\/.*)?$/i, '')
      .replace(/\/+$/, '');
  }

  return cleaned;
}

/**
 * Chuẩn hóa tên bảng Supabase PostgreSQL:
 * - Chuyển khoảng trắng hoặc '%20' thành dấu gạch dưới '_' (VD: 'academic terms' -> 'academic_terms')
 */
export function sanitizeSupabaseTableName(tableName?: string | null): string {
  if (!tableName || typeof tableName !== 'string') return '';
  return decodeURIComponent(tableName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * Helper hàm ghép URL chuẩn cho REST API: ${SUPABASE_URL}/rest/v1/${tableName}
 * Đảm bảo không bao giờ bị lỗi lặp kép '/rest/v1/rest/v1/'
 */
export function getSupabaseRestUrl(tableName: string): string {
  const cleanTable = sanitizeSupabaseTableName(tableName);
  return `${SUPABASE_URL}/rest/v1/${cleanTable}`;
}

/**
 * Custom Fetch Interceptor cho Supabase Client & WebKit iOS/macOS:
 * - Xử lý dứt điểm lỗi 401 Unauthorized:
 *   + Tự động ghép ${SUPABASE_URL}/rest/v1/${tableName} nếu đường dẫn tương đối.
 *   + Khử trùng lặp '/rest/v1/rest/v1/' thành '/rest/v1/'.
 *   + Sao chép toàn bộ headers gốc từ Request/Headers instance mà không bị mất.
 *   + Gắn BẮT BUỘC header 'apikey' và 'Authorization: Bearer <ANON_KEY>' vào MỌI request.
 * - Tự động thêm 'cache: no-store' để WebKit/Safari luôn nạp dữ liệu mới nhất (chống cache cứng).
 * - Gửi header nhận diện 'x-client-info': 'royal-school-hub-ios'.
 */
export const safeSupabaseFetch: typeof fetch = async (input, init = {}) => {
  let targetUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // 1. Tự động chuẩn hóa REST API URL: nếu gọi relative table path (VD: 'campuses' hoặc '/rest/v1/campuses')
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    const cleanPath = targetUrl.replace(/^\/+/, '').replace(/^rest\/v1\/?/, '');
    targetUrl = `${SUPABASE_URL}/rest/v1/${cleanPath}`;
  }

  // 2. Khử trùng lặp '/rest/v1/rest/v1' (kể cả lặp nhiều lần)
  targetUrl = targetUrl.replace(/(\/rest\/v1)+/gi, '/rest/v1');

  // 3. Chuẩn hóa tên bảng có khoảng trắng hoặc %20 ngay sau '/rest/v1/'
  targetUrl = targetUrl.replace(/\/rest\/v1\/([^?/#]+)/i, (_match, tableSegment: string) => {
    const cleanTable = decodeURIComponent(tableSegment).trim().replace(/\s+/g, '_');
    return `/rest/v1/${cleanTable}`;
  });

  // 4. Sao chép an toàn headers từ cả input (nếu là Request) và init.headers
  const headers = new Headers();
  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers.set(key, value);
      });
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers.set(key, value);
      });
    } else if (typeof init.headers === 'object') {
      Object.entries(init.headers).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          headers.set(key, String(value));
        }
      });
    }
  }

  // Header nhận diện client
  headers.set('x-client-info', 'royal-school-hub-ios');

  // 5. GẮN BẮT BUỘC apikey VÀ Authorization: Bearer <ANON_KEY> VÀO MỌI REQUEST
  headers.set('apikey', SUPABASE_ANON_KEY);
  headers.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);

  const mergedInit: RequestInit = {
    ...init,
    cache: 'no-store', // WebKit/Safari cache fix
    headers,
  };

  if (typeof input === 'string' || input instanceof URL) {
    return fetch(targetUrl, mergedInit);
  }
  return fetch(targetUrl, {
    method: input.method,
    headers,
    body: input.body,
    cache: 'no-store',
    ...init,
  });
};

/**
 * Kiểm tra xem khóa Anon Key có phải định dạng JWT hợp lệ (eyJ...) hỗ trợ Realtime WebSocket hay không.
 * Nếu khóa rỗng hoặc là chuỗi project ref 'wobszxqzlalzcjcfbzhq' hoặc 'sb_publishable_...', từ chối mở WebSocket.
 */
export function isValidSupabaseAnonJwt(key?: string | null): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (
    !trimmed ||
    trimmed === 'wobszxqzlalzcjcfbzhq' ||
    trimmed.startsWith('sb_publishable_') ||
    trimmed.includes('your-anon-public-key') ||
    trimmed.includes('DÁN_CHUỖI')
  ) {
    return false;
  }
  const parts = trimmed.split('.');
  return parts.length === 3 && trimmed.startsWith('eyJ');
}

/**
 * Đọc thông tin kết nối Supabase từ tham số truyền vào, cấu hình đã lưu trong safeStorage hoặc biến môi trường (.env)
 * Luôn fallback an toàn về DEFAULT_SUPABASE_URL và DEFAULT_SUPABASE_ANON_KEY nếu env chỉ chứa project ID đơn thuần.
 */
export function getResolvedSupabaseConfig(
  customUrl?: string,
  customAnonKey?: string
): { url: string; anonKey: string } {
  const cleanCustomUrl = sanitizeSupabaseBaseUrl(customUrl);
  const cleanCustomKey = (customAnonKey || '').trim();

  if (cleanCustomUrl && isLikelyValidAnonKey(cleanCustomKey) && cleanCustomUrl.startsWith('http')) {
    return { url: cleanCustomUrl, anonKey: cleanCustomKey };
  }

  try {
    const savedRaw = safeStorage.getItem('royal_supabase_config');
    if (savedRaw) {
      const parsed = JSON.parse(savedRaw);
      const rawSavedUrl = String(parsed?.url || '').trim();
      const savedUrl = sanitizeSupabaseBaseUrl(rawSavedUrl);
      const savedKey = String(parsed?.anonKey || '').trim();

      if (savedUrl && isLikelyValidAnonKey(savedKey) && savedUrl.startsWith('http')) {
        return { url: savedUrl, anonKey: savedKey };
      }
    }
  } catch {
    // Bỏ qua lỗi đọc safeStorage
  }

  const envUrl = sanitizeSupabaseBaseUrl((import.meta as any).env?.VITE_SUPABASE_URL);
  const envKey = String((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();

  const resolvedUrl =
    cleanCustomUrl ||
    (envUrl && envUrl.startsWith('http') && !envUrl.includes('your-project-id')
      ? envUrl
      : DEFAULT_SUPABASE_URL);

  const resolvedKey =
    (isLikelyValidAnonKey(cleanCustomKey) ? cleanCustomKey : null) ||
    (isLikelyValidAnonKey(envKey) ? envKey : null) ||
    DEFAULT_SUPABASE_ANON_KEY;

  return {
    url: resolvedUrl,
    anonKey: resolvedKey,
  };
}

/**
 * Kiểm tra xem Supabase đã được cấu hình với URL và Anon Key hợp lệ chưa
 */
export function isSupabaseConfigured(url?: string, anonKey?: string): boolean {
  const resolved = getResolvedSupabaseConfig(url, anonKey);
  return Boolean(
    resolved.url &&
    resolved.anonKey &&
    resolved.url.startsWith('http') &&
    !resolved.url.includes('your-project-id') &&
    isLikelyValidAnonKey(resolved.anonKey)
  );
}

// Biến singleton giữ instance duy nhất trong toàn bộ vòng đời trình duyệt
let supabaseInstance: SupabaseClient | null = null;
let currentInstanceSignature = '';

/**
 * Khởi tạo hoặc trả về Singleton SupabaseClient an toàn với WebKit iOS & macOS.
 * - Đính kèm apikey trong global.headers để thư viện postgrest và realtime luôn có credentials hợp lệ.
 * - Sử dụng SafeStorage tránh SecurityError trên iOS Safari/Chrome Incognito & ITP.
 * - Tự động thêm 'cache: no-store' vào fetch để tránh WebKit cache REST API requests.
 * - Ngăn chặn triệt để cảnh báo "Multiple GoTrueClient instances detected in the same browser context".
 * - Đảm bảo Base URL luôn sạch (không bị lặp '/rest/v1/rest/v1/').
 */
export const getSupabaseClient = (
  customUrl?: string,
  customAnonKey?: string
): SupabaseClient | null => {
  const { url: rawResolvedUrl, anonKey: supabaseAnonKey } = getResolvedSupabaseConfig(
    customUrl,
    customAnonKey
  );
  const supabaseUrl = sanitizeSupabaseBaseUrl(rawResolvedUrl);

  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith('http')) {
    return null;
  }

  const signature = `${supabaseUrl}::${supabaseAnonKey}`;
  if (supabaseInstance && currentInstanceSignature === signature) {
    return supabaseInstance;
  }

  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: safeStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'royal_school_supabase_auth',
      },
      global: {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          'x-client-info': 'royal-school-hub-ios',
        },
        fetch: safeSupabaseFetch,
      },
      realtime: {
        params: {
          eventsPerSecond: 5,
        },
      },
    });
    currentInstanceSignature = signature;
    return supabaseInstance;
  } catch (err) {
    console.warn('⚠️ Không thể khởi tạo SupabaseClient, chuyển sang chế độ Local:', err);
    return null;
  }
};

export const supabase = getSupabaseClient();
