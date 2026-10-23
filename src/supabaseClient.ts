import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://wobszxqzlalzcjcfbzhq.supabase.co';

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
 * Đọc thông tin kết nối Supabase từ biến môi trường (.env) hoặc cấu hình đã lưu trong localStorage
 */
export function getResolvedSupabaseConfig(
  customUrl?: string,
  customAnonKey?: string
): { url: string; anonKey: string } {
  const cleanCustomUrl = (customUrl || '').trim().replace(/\/+$/, '');
  const cleanCustomKey = (customAnonKey || '').trim();
  if (cleanCustomUrl && cleanCustomKey && cleanCustomUrl.startsWith('http')) {
    return { url: cleanCustomUrl, anonKey: cleanCustomKey };
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedRaw = window.localStorage.getItem('royal_supabase_config');
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        const savedUrl = String(parsed?.url || '').trim().replace(/\/+$/, '');
        const savedKey = String(parsed?.anonKey || '').trim();
        if (savedUrl && savedKey && savedUrl.startsWith('http')) {
          return { url: savedUrl, anonKey: savedKey };
        }
      }
    }
  } catch {
    // Bỏ qua lỗi đọc localStorage
  }

  const envUrl = String((import.meta as any).env?.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
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
let hasWarnedMissingCredentials = false;

/**
 * Khởi tạo hoặc trả về Singleton SupabaseClient duy nhất.
 * Ngăn chặn triệt để cảnh báo "Multiple GoTrueClient instances detected in the same browser context".
 */
export const getSupabaseClient = (
  customUrl?: string,
  customAnonKey?: string
): SupabaseClient | null => {
  const { url: supabaseUrl, anonKey: supabaseAnonKey } = getResolvedSupabaseConfig(
    customUrl,
    customAnonKey
  );

  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith('http')) {
    if (!hasWarnedMissingCredentials) {
      console.warn('⚠️ Supabase URL hoặc Anon Key chưa được thiết lập đầy đủ! Hệ thống hoạt động ở chế độ Local/Offline.');
      hasWarnedMissingCredentials = true;
    }
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
