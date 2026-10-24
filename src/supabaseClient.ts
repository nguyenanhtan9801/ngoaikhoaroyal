import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://wobszxqzlalzcjcfbzhq.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYnN6eHF6bGFsemNqY2ZiemhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0Nzg3MDQsImV4cCI6MjEwODA1NDcwNH0.fACSgo3mpzdBS-of_fFkMF14NYL3J3P_5WM2k6FtEcA';

export const DEFAULT_SUPABASE_URL = SUPABASE_URL;
export const DEFAULT_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

// Đảm bảo chỉ có một instance duy nhất (Singleton) trong toàn bộ ứng dụng
const globalForSupabase = globalThis as unknown as {
  supabaseInstance?: any;
};

export const supabase: any =
  globalForSupabase.supabaseInstance ||
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
    realtime: {
      params: {
        eventsPerSecond: 2,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabaseInstance = supabase;
}

/**
 * Lấy client Supabase singleton
 */
export function getSupabaseClient(): any {
  return supabase;
}

export function getConfiguredSupabaseClient(): any {
  return supabase;
}

/**
 * Kiểm tra định dạng khóa JWT Anon Key
 */
export function isLikelyValidAnonKey(key?: string | null): boolean {
  if (!key || typeof key !== 'string') return false;
  const parts = key.trim().split('.');
  return parts.length === 3 && parts[0].length > 10;
}

/**
 * Chuẩn hóa URL Supabase
 */
export function sanitizeSupabaseBaseUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return DEFAULT_SUPABASE_URL;
  let cleaned = rawUrl.trim();
  if (!cleaned) return DEFAULT_SUPABASE_URL;
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'https://' + cleaned;
  }
  return cleaned.replace(/\/+$/, '');
}

/**
 * Safe Storage wrapper tương thích an toàn với SSR / Iframe cookie sandbox
 */
const inMemoryFallback: Record<string, string> = {};

export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // In-memory fallback
    }
    return inMemoryFallback[key] ?? null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // In-memory fallback
    }
    inMemoryFallback[key] = value;
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // In-memory fallback
    }
    delete inMemoryFallback[key];
  },
};
