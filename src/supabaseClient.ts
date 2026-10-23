import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://wobszxqzlalzcjcfbzhq.supabase.co';

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

const rawEnvUrl = String((import.meta as any).env?.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL);
export const SUPABASE_URL = sanitizeSupabaseBaseUrl(rawEnvUrl) || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = String((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();

/**
 * Custom Fetch Interceptor cho Supabase Client:
 * - Tự động khử trùng lặp '/rest/v1/rest/v1/' thành '/rest/v1/' trong mọi tình huống
 * - Tự động sửa tên bảng bị mã hóa khoảng trắng '%20' thành '_' (VD: '/rest/v1/academic%20terms' -> '/rest/v1/academic_terms')
 */
const safeSupabaseFetch: typeof fetch = async (input, init) => {
  let targetUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // Khử trùng lặp '/rest/v1/rest/v1' (kể cả lặp nhiều lần)
  targetUrl = targetUrl.replace(/(\/rest\/v1)+/gi, '/rest/v1');

  // Chuẩn hóa tên bảng có khoảng trắng hoặc %20 ngay sau '/rest/v1/'
  targetUrl = targetUrl.replace(/\/rest\/v1\/([^?/#]+)/i, (_match, tableSegment: string) => {
    const cleanTable = decodeURIComponent(tableSegment).trim().replace(/\s+/g, '_');
    return `/rest/v1/${cleanTable}`;
  });

  if (typeof input === 'string' || input instanceof URL) {
    return fetch(targetUrl, init);
  }
  const clonedRequest = new Request(targetUrl, input);
  return fetch(clonedRequest, init);
};

/**
 * Kiểm tra xem khóa Anon Key có phải định dạng JWT hợp lệ (eyJ...) hỗ trợ Realtime WebSocket hay không.
 * Nếu khóa rỗng hoặc là khóa publishable mới ('sb_publishable_...'), không mở kết nối WebSocket để tránh lỗi đỏ Console.
 */
export function isValidSupabaseAnonJwt(key?: string | null): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (!trimmed || trimmed.startsWith('sb_publishable_') || trimmed.includes('your-anon-public-key')) {
    return false;
  }
  const parts = trimmed.split('.');
  return parts.length === 3 && trimmed.startsWith('eyJ');
}

/**
 * Đọc thông tin kết nối Supabase từ tham số truyền vào, cấu hình đã lưu trong localStorage hoặc biến môi trường (.env)
 * Đồng thời tự động làm sạch URL bị dính '/rest/v1' đã lưu trước đó trong localStorage.
 */
export function getResolvedSupabaseConfig(
  customUrl?: string,
  customAnonKey?: string
): { url: string; anonKey: string } {
  const cleanCustomUrl = sanitizeSupabaseBaseUrl(customUrl);
  const cleanCustomKey = (customAnonKey || '').trim();
  if (cleanCustomUrl && cleanCustomKey && cleanCustomUrl.startsWith('http')) {
    return { url: cleanCustomUrl, anonKey: cleanCustomKey };
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedRaw = window.localStorage.getItem('royal_supabase_config');
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        const rawSavedUrl = String(parsed?.url || '').trim();
        const savedUrl = sanitizeSupabaseBaseUrl(rawSavedUrl);
        const savedKey = String(parsed?.anonKey || '').trim();

        // Tự động sửa lại localStorage nếu trước đó người dùng lưu URL có chứa '/rest/v1'
        if (savedUrl && rawSavedUrl !== savedUrl) {
          window.localStorage.setItem(
            'royal_supabase_config',
            JSON.stringify({ ...parsed, url: savedUrl })
          );
        }

        if (savedUrl && savedKey && savedUrl.startsWith('http')) {
          return { url: savedUrl, anonKey: savedKey };
        }
      }
    }
  } catch {
    // Bỏ qua lỗi đọc localStorage
  }

  const envUrl = sanitizeSupabaseBaseUrl((import.meta as any).env?.VITE_SUPABASE_URL);
  const envKey = String((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();

  const resolvedUrl =
    envUrl && envUrl.startsWith('http') && !envUrl.includes('your-project-id')
      ? envUrl
      : cleanCustomUrl || DEFAULT_SUPABASE_URL;

  const resolvedKey =
    envKey && !envKey.includes('your-anon-public-key') ? envKey : cleanCustomKey;

  return {
    url: resolvedUrl,
    anonKey: resolvedKey,
  };
}

// Biến singleton giữ instance duy nhất trong toàn bộ vòng đời trình duyệt
let supabaseInstance: SupabaseClient | null = null;
let currentInstanceSignature = '';

/**
 * Khởi tạo hoặc trả về Singleton SupabaseClient duy nhất.
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
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'royal_school_supabase_auth',
      },
      global: {
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
