import { createClient, SupabaseClient, SupportedStorage } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://deuuzrjpfcabfclwaqph.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_SHwnK37LokxsP9zVNFSf9Q_qCMxjlat';

// Dự án cũ đã hết hạn mức băng thông (HTTP 402 exceed_egress_quota) — tự động loại bỏ nếu còn lưu trong localStorage
const DEPRECATED_PROJECT_REF = 'wobszxqzlalzcjcfbzhq';

export interface SafeSyncStorage extends SupportedStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * Trích xuất mã dự án (project ref) từ Supabase URL (VD: https://deuuzrjpfcabfclwaqph.supabase.co -> deuuzrjpfcabfclwaqph)
 */
export function extractSupabaseProjectRef(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const match = url.trim().match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match && match[1] ? match[1].toLowerCase() : '';
}

/**
 * Trích xuất mã dự án (ref) bên trong payload của khóa JWT (eyJ...) nếu có
 */
export function extractJwtProjectRef(key?: string | null): string {
  if (!key || typeof key !== 'string') return '';
  const clean = key.trim();
  if (!clean.startsWith('eyJ')) return '';
  try {
    const parts = clean.split('.');
    if (parts.length < 2) return '';
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const jsonStr =
      typeof atob === 'function'
        ? atob(padded)
        : typeof Buffer !== 'undefined'
        ? Buffer.from(padded, 'base64').toString('utf8')
        : '';
    if (!jsonStr) return '';
    const payload = JSON.parse(jsonStr);
    return typeof payload?.ref === 'string' ? payload.ref.toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * Kiểm tra xem URL có phải của dự án cũ đã ngưng hoạt động hay không
 */
export function isDeprecatedSupabaseUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.toLowerCase().includes(DEPRECATED_PROJECT_REF);
}

/**
 * Kiểm tra xem Key có phải của dự án cũ đã ngưng hoạt động hay không
 */
export function isDeprecatedSupabaseKey(key?: string | null): boolean {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim();
  if (clean.includes(DEPRECATED_PROJECT_REF)) return true;
  const jwtRef = extractJwtProjectRef(clean);
  return jwtRef === DEPRECATED_PROJECT_REF;
}

/**
 * Kiểm tra tính hợp lệ của Key (hỗ trợ cả dạng JWT cũ eyJ... và chuẩn mới sb_publishable_... / sb_secret_...)
 */
export const isLikelyValidSupabaseKey = (key: string): boolean => {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim();
  if (
    !clean ||
    clean === DEPRECATED_PROJECT_REF ||
    clean.includes('your-anon-public-key') ||
    clean.includes('DÁN_CHUỖI') ||
    isDeprecatedSupabaseKey(clean)
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
 * Kiểm tra xem cặp URL và Key có khớp cùng một dự án Supabase hay không (ngăn chặn lỗi 401 "Invalid API key... owned by another Supabase project")
 */
export function areUrlAndKeyCompatible(url?: string | null, key?: string | null): boolean {
  const cleanUrl = sanitizeSupabaseBaseUrl(url);
  const cleanKey = String(key || '').trim();
  if (!cleanUrl || !cleanUrl.startsWith('http') || cleanUrl.includes('your-project-id')) {
    return false;
  }
  if (isDeprecatedSupabaseUrl(cleanUrl) || !isLikelyValidSupabaseKey(cleanKey)) {
    return false;
  }

  const urlRef = extractSupabaseProjectRef(cleanUrl);
  const defaultRef = extractSupabaseProjectRef(DEFAULT_SUPABASE_URL);
  const jwtRef = extractJwtProjectRef(cleanKey);

  // Nếu key là JWT có chứa claim `ref`, `ref` bắt buộc phải trùng với project ref trên URL
  if (jwtRef && urlRef && jwtRef !== urlRef) {
    return false;
  }

  // Nếu đang dùng key mặc định của dự án chính nhưng URL lại trỏ sang dự án khác -> không tương thích
  if (cleanKey === DEFAULT_SUPABASE_ANON_KEY && urlRef && defaultRef && urlRef !== defaultRef) {
    return false;
  }

  return true;
}

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
// - Supabase URL: import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL
// - Public / Publishable Key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY
const rawEnvSupabaseUrl = sanitizeSupabaseBaseUrl(
  import.meta.env.VITE_SUPABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : '') ||
    DEFAULT_SUPABASE_URL
);

const rawEnvSupabaseKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_PUBLISHABLE_KEY : '') ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_ANON_KEY : '') ||
    DEFAULT_SUPABASE_ANON_KEY
).trim();

const initialValidPair = areUrlAndKeyCompatible(rawEnvSupabaseUrl, rawEnvSupabaseKey);

export const SUPABASE_URL = initialValidPair ? rawEnvSupabaseUrl : DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = initialValidPair ? rawEnvSupabaseKey : DEFAULT_SUPABASE_ANON_KEY;

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
  } else if (isDeprecatedSupabaseUrl(targetUrl)) {
    // Nếu URL request vẫn trỏ vào dự án cũ đã ngưng hoạt động, tự động chuyển hướng sang baseUrl hiện hành
    targetUrl = targetUrl.replace(/https?:\/\/[^/]+/i, baseUrl);
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

  // 5. Đảm bảo apikey và Authorization tương thích với targetUrl
  const currentApiKey = headers.get('apikey');
  if (!currentApiKey || !areUrlAndKeyCompatible(targetUrl, currentApiKey)) {
    if (activeKey) {
      headers.set('apikey', activeKey);
    }
  }

  const currentAuth = headers.get('Authorization');
  if (!currentAuth) {
    if (activeKey) {
      headers.set('Authorization', `Bearer ${activeKey}`);
    }
  } else if (currentAuth.toLowerCase().startsWith('bearer ')) {
    const bearerToken = currentAuth.slice(7).trim();
    // Nếu Bearer token là một API key cũ/không khớp dự án (không phải user access token hợp lệ của dự án hiện tại)
    if (
      isDeprecatedSupabaseKey(bearerToken) ||
      (bearerToken.startsWith('sb_publishable_') && !areUrlAndKeyCompatible(targetUrl, bearerToken))
    ) {
      headers.set('Authorization', `Bearer ${activeKey}`);
    }
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
 * Tự động loại bỏ và đồng bộ lại nếu phát hiện cấu hình cũ (wobszxqzlalzcjcfbzhq) hoặc cặp URL/Key lệch dự án.
 */
export function getResolvedSupabaseConfig(
  customUrl?: string,
  customAnonKey?: string
): { url: string; anonKey: string } {
  const cleanCustomUrl = sanitizeSupabaseBaseUrl(customUrl);
  const cleanCustomKey = (customAnonKey || '').trim();

  if (areUrlAndKeyCompatible(cleanCustomUrl, cleanCustomKey)) {
    return { url: cleanCustomUrl, anonKey: cleanCustomKey };
  }

  try {
    const savedRaw = safeStorage.getItem('royal_supabase_config');
    if (savedRaw) {
      const parsed = JSON.parse(savedRaw);
      const savedUrl = sanitizeSupabaseBaseUrl(String(parsed?.url || '').trim());
      const savedKey = String(parsed?.anonKey || '').trim();

      if (areUrlAndKeyCompatible(savedUrl, savedKey)) {
        return { url: savedUrl, anonKey: savedKey };
      } else {
        // Tự động làm sạch cấu hình cũ/lệch dự án trong localStorage để tránh lỗi 401 Invalid API key
        safeStorage.setItem(
          'royal_supabase_config',
          JSON.stringify({
            url: SUPABASE_URL,
            anonKey: SUPABASE_ANON_KEY,
            isConnected: true,
            updatedAt: new Date().toISOString(),
          })
        );
      }
    }
  } catch {
    // Bỏ qua lỗi đọc safeStorage
  }

  return {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  };
}

/**
 * Kiểm tra xem Supabase đã được cấu hình với URL và Key hợp lệ chưa
 */
export function isSupabaseConfigured(url?: string, anonKey?: string): boolean {
  const resolved = getResolvedSupabaseConfig(url, anonKey);
  return areUrlAndKeyCompatible(resolved.url, resolved.anonKey);
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

  if (!areUrlAndKeyCompatible(supabaseUrl, supabaseKey)) {
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

export const supabase =
  SUPABASE_URL && isLikelyValidSupabaseKey(SUPABASE_ANON_KEY) ? getSupabaseClient() : null;
