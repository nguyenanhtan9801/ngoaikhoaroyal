import { createNewUserAccount } from './storage';

export { createNewUserAccount };

export interface ApiFetchJsonResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string;
}

export interface ServerHealthReport {
  ok: boolean;
  build?: string;
  startedAt?: string;
  node?: string;
  env?: string;
  supabaseProjectRef?: string;
  serviceRole?: {
    configured: boolean;
    valid: boolean;
  };
  secrets?: {
    parentSession: boolean;
    checkinQr: boolean;
  };
  routes?: string[];
  legacyLogin?: boolean;
}

export const SERVICE_ROLE_MISSING_MESSAGE =
  'Máy chủ thiếu hoặc sai SUPABASE_SERVICE_ROLE_KEY của project mới';

export const API_NOT_RUNNING_HTML_MESSAGE =
  'Máy chủ API (/api) chưa hoạt động: nhận được trang HTML thay vì JSON. Kiểm tra api/index.ts và vercel.json đã được triển khai, rồi mở /api/health.';

export async function apiFetchJson<T = any>(
  path: string,
  init?: RequestInit
): Promise<ApiFetchJsonResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (err: any) {
    const detail = err?.message || 'lỗi mạng';
    return {
      ok: false,
      status: 0,
      data: null,
      errorMessage: `Không kết nối được máy chủ: ${detail}`,
    };
  }

  const status = response.status;
  let rawText = '';
  try {
    rawText = await response.text();
  } catch {
    rawText = '';
  }

  let parsedData: any = null;
  let isJson = false;
  const trimmed = rawText.trim();
  if (trimmed.length > 0) {
    try {
      parsedData = JSON.parse(trimmed);
      isJson = parsedData !== null && typeof parsedData === 'object';
    } catch {
      parsedData = null;
      isJson = false;
    }
  }

  if (path.startsWith('/api/') && !isJson) {
    return {
      ok: false,
      status,
      data: null,
      errorMessage: API_NOT_RUNNING_HTML_MESSAGE,
    };
  }

  if (!response.ok) {
    const serverError =
      isJson && typeof parsedData?.error === 'string' && parsedData.error.trim()
        ? parsedData.error.trim()
        : `Lỗi máy chủ HTTP ${status}`;
    return {
      ok: false,
      status,
      data: parsedData as T | null,
      errorMessage: serverError,
    };
  }

  const fallbackError =
    isJson && typeof parsedData?.error === 'string' && parsedData.error.trim()
      ? parsedData.error.trim()
      : '';

  return {
    ok: true,
    status,
    data: parsedData as T | null,
    errorMessage: fallbackError,
  };
}

export async function apiFetchJsonOrThrow<T = any>(
  path: string,
  init?: RequestInit
): Promise<ApiFetchJsonResult<T>> {
  const result = await apiFetchJson<T>(path, init);
  if (!result.ok) {
    throw new Error(result.errorMessage || `Lỗi máy chủ HTTP ${result.status}`);
  }
  return result;
}
