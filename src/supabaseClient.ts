import { createClient, SupabaseClient, SupportedStorage } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://wobszxqzlalzcjcfbzhq.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYnN6eHF6bGFsemNqY2ZiemhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0Nzg3MDQsImV4cCI6MjEwODA1NDcwNH0.fACSgo3mpzdBS-of_fFkMF14NYL3J3P_5WM2k6FtEcA';

export interface SafeSyncStorage extends SupportedStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * Kiểm tra tính hợp lệ của Key (hỗ trợ cả dạng JWT cũ eyJ... và chuẩn mới sb_publishable_... / sb_secret_...)
 */
export const isLikelyValidSupabaseKey = (key: string): boolean => {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim();
  if (
    !clean ||
    clean === 'wobszxqzlalzcjcfbzhq' ||
    clean.includes('your-anon-public-key') ||
    clean.includes('DÁN_CHUỖI')
  ) {
    return false;
  }
  // Chấp nhận key JWT cũ (bắt đầu bằng eyJ) hoặc key định dạng mới của Supabase (sb_publishable_ hoặc sb_secret_)
  return (
    clean.startsWith('eyJ') ||
    clean.startsWith('sb_publishable_') ||
    clean.startsWith('sb_secret_')
  );
};

/**
 * Kiểm tra xem một chuỗi có phải là API Key hợp lệ không (tương thích ngược với các module gọi isLikelyValidAnonKey)
 */
export function isLikelyValidAnonKey(key?: string | null): boolean {
  if (!key || typeof key !== 'string') return false;
  return isLikelyValidSupabaseKey(key);
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
  const markdownMatch =
    cleaned.match(/\((https?:\/\/[^)]+)\)/) || cleaned.match(/\[(https?:\/\/[^\]]+)\]/);
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

// 1. Trích xuất URL và Key từ biến môi trường với thứ tự ưu tiên (fallback) chuẩn:
// - Supabase URL: import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://wobszxqzlalzcjcfbzhq.supabase.co'
// - Public / Publishable Key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const rawEnvSupabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : '') ||
  DEFAULT_SUPABASE_URL;

const rawEnvSupabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' ? process.env?.SUPABASE_ANON_KEY : '') ||
  DEFAULT_SUPABASE_ANON_KEY;

export const SUPABASE_URL = sanitizeSupabaseBaseUrl(rawEnvSupabaseUrl) || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = isLikelyValidSupabaseKey(String(rawEnvSupabaseKey || ''))
  ? String(rawEnvSupabaseKey).trim()
  : DEFAULT_SUPABASE_ANON_KEY;

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
  const { url } = getResolvedSupabaseConfig();
  return `${url || SUPABASE_URL}/rest/v1/${cleanTable}`;
}

/**
 * Custom Fetch Interceptor cho Supabase Client & WebKit iOS/macOS
 */
export const safeSupabaseFetch: typeof fetch = async (input, init = {}) => {
  let targetUrl =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  const activeConfig = getResolvedSupabaseConfig();
  const baseUrl = activeConfig.url || SUPABASE_URL;
  const activeKey = activeConfig.anonKey || SUPABASE_ANON_KEY;

  // 1. Tự động chuẩn hóa REST API URL: nếu gọi relative table path (VD: 'campuses' hoặc '/rest/v1/campuses')
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    const cleanPath = targetUrl.replace(/^\/+/, '').replace(/^rest\/v1\/?/, '');
    targetUrl = `${baseUrl}/rest/v1/${cleanPath}`;
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

  // 5. Đảm bảo luôn có apikey; chỉ gắn Authorization mặc định nếu request chưa có Bearer token của phiên đăng nhập
  if (!headers.has('apikey') && activeKey) {
    headers.set('apikey', activeKey);
  }
  if (!headers.has('Authorization') && activeKey) {
    headers.set('Authorization', `Bearer ${activeKey}`);
  }

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
 * Kiểm tra cờ môi trường VITE_LEGACY_LOGIN (mặc định 'false').
 * Khi VITE_LEGACY_LOGIN='false', hệ thống tắt hoàn toàn nhánh đăng nhập cũ và chỉ chấp nhận phiên từ Supabase Auth + bảng profiles.
 */
export function isLegacyLoginEnabled(): boolean {
  const raw = import.meta.env?.VITE_LEGACY_LOGIN;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return false;
  }
  return String(raw).trim().toLowerCase() === 'true';
}

/**
 * Kiểm tra xem khóa Supabase Key có hợp lệ để kết nối (hỗ trợ cả chuẩn JWT eyJ... và chuẩn mới sb_publishable_... / sb_secret_...)
 */
export function isValidSupabaseAnonJwt(key?: string | null): boolean {
  if (!key || typeof key !== 'string') return false;
  return isLikelyValidSupabaseKey(key);
}

/**
 * Đọc thông tin kết nối Supabase từ tham số truyền vào, cấu hình đã lưu trong safeStorage hoặc biến môi trường (.env)
 * Thứ tự ưu tiên:
 * - URL: customUrl -> safeStorage -> import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://wobszxqzlalzcjcfbzhq.supabase.co'
 * - Key: customAnonKey -> safeStorage -> import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
 */
export function getResolvedSupabaseConfig(
  customUrl?: string,
  customAnonKey?: string
): { url: string; anonKey: string } {
  const cleanCustomUrl = sanitizeSupabaseBaseUrl(customUrl);
  const cleanCustomKey = (customAnonKey || '').trim();

  if (
    cleanCustomUrl &&
    isLikelyValidSupabaseKey(cleanCustomKey) &&
    cleanCustomUrl.startsWith('http')
  ) {
    return { url: cleanCustomUrl, anonKey: cleanCustomKey };
  }

  try {
    const savedRaw = safeStorage.getItem('royal_supabase_config');
    if (savedRaw) {
      const parsed = JSON.parse(savedRaw);
      const rawSavedUrl = String(parsed?.url || '').trim();
      const savedUrl = sanitizeSupabaseBaseUrl(rawSavedUrl);
      const savedKey = String(parsed?.anonKey || '').trim();

      if (savedUrl && isLikelyValidSupabaseKey(savedKey) && savedUrl.startsWith('http')) {
        return { url: savedUrl, anonKey: savedKey };
      }
    }
  } catch {
    // Bỏ qua lỗi đọc safeStorage
  }

  const envUrl = sanitizeSupabaseBaseUrl(
    import.meta.env.VITE_SUPABASE_URL ||
      (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : '') ||
      DEFAULT_SUPABASE_URL
  );
  const envKey = String(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      (typeof process !== 'undefined' ? process.env?.SUPABASE_ANON_KEY : '') ||
      ''
  ).trim();

  const resolvedUrl =
    cleanCustomUrl ||
    (envUrl && envUrl.startsWith('http') && !envUrl.includes('your-project-id')
      ? envUrl
      : DEFAULT_SUPABASE_URL);

  const resolvedKey =
    (isLikelyValidSupabaseKey(cleanCustomKey) ? cleanCustomKey : null) ||
    (isLikelyValidSupabaseKey(envKey) ? envKey : null) ||
    DEFAULT_SUPABASE_ANON_KEY;

  return {
    url: resolvedUrl,
    anonKey: resolvedKey,
  };
}

/**
 * Kiểm tra xem Supabase đã được cấu hình với URL và Key hợp lệ chưa
 */
export function isSupabaseConfigured(url?: string, anonKey?: string): boolean {
  const resolved = getResolvedSupabaseConfig(url, anonKey);
  return Boolean(
    resolved.url &&
      resolved.anonKey &&
      resolved.url.startsWith('http') &&
      !resolved.url.includes('your-project-id') &&
      isLikelyValidSupabaseKey(resolved.anonKey)
  );
}

// Biến singleton giữ instance duy nhất trong toàn bộ vòng đời trình duyệt
let supabaseInstance: SupabaseClient | null = null;
let currentInstanceSignature = '';

/**
 * Khởi tạo hoặc trả về Singleton SupabaseClient duy nhất cho cả Auth và Data.
 * Hỗ trợ cả key dạng JWT cũ (eyJ...) và key chuẩn mới (sb_publishable_... / sb_secret_...).
 */
export const getSupabaseClient = (
  customUrl?: string,
  customAnonKey?: string
): SupabaseClient | null => {
  const { url: rawResolvedUrl, anonKey: supabaseKey } = getResolvedSupabaseConfig(
    customUrl,
    customAnonKey
  );
  const supabaseUrl = sanitizeSupabaseBaseUrl(rawResolvedUrl);

  if (!supabaseUrl || !isLikelyValidSupabaseKey(supabaseKey) || !supabaseUrl.startsWith('http')) {
    return null;
  }

  const signature = `${supabaseUrl}::${supabaseKey}`;
  if (supabaseInstance && currentInstanceSignature === signature) {
    return supabaseInstance;
  }

  try {
    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: safeStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'royal_school_supabase_auth',
      },
      global: {
        headers: {
          apikey: supabaseKey,
          'x-client-info': 'royal-school-hub-ios',
        },
        fetch: safeSupabaseFetch,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
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

export const supabase = (SUPABASE_URL && isLikelyValidSupabaseKey(SUPABASE_ANON_KEY))
  ? getSupabaseClient()
  : null;
