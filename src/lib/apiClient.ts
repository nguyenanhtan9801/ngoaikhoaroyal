export interface ApiFetchJsonResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string;
}

export interface ServerHealthReport {
  ok: boolean;
  build?: string;
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

export const NO_EXPRESS_SERVER_MESSAGE =
  'Trang này đang chạy KHÔNG có máy chủ Express, cần phát hành bằng npm run build rồi npm start';

export const SERVICE_ROLE_MISSING_MESSAGE =
  'Máy chủ thiếu hoặc sai SUPABASE_SERVICE_ROLE_KEY của project mới';

async function diagnoseNonJson404(path: string, method: string): Promise<string> {
  try {
    const healthRes = await fetch('/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const healthText = await healthRes.text();
    let healthData: ServerHealthReport | null = null;
    try {
      const parsed = JSON.parse(healthText.trim());
      if (parsed && typeof parsed === 'object') {
        healthData = parsed as ServerHealthReport;
      }
    } catch {
      healthData = null;
    }

    if (healthRes.status === 404 || !healthData || !healthData.ok) {
      return NO_EXPRESS_SERVER_MESSAGE;
    }

    const cleanPath = String(path || '').split('?')[0].trim();
    const upperMethod = String(method || 'GET').trim().toUpperCase();
    const expectedRoute = `${upperMethod} ${cleanPath}`.toUpperCase();
    const routes = Array.isArray(healthData.routes) ? healthData.routes : [];
    const hasRoute = routes.some(r => {
      const norm = String(r || '').trim().toUpperCase();
      return norm === expectedRoute || norm.endsWith(` ${cleanPath.toUpperCase()}`);
    });

    if (!hasRoute) {
      return `Máy chủ đang chạy bản cũ (build ${healthData.build || 'unknown'}), hãy phát hành lại`;
    }

    if (!healthData.serviceRole?.configured || !healthData.serviceRole?.valid) {
      return SERVICE_ROLE_MISSING_MESSAGE;
    }

    return `Máy chủ đang chạy bản cũ (build ${healthData.build || 'unknown'}), hãy phát hành lại`;
  } catch {
    return NO_EXPRESS_SERVER_MESSAGE;
  }
}

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
      errorMessage: `Không kết nối được máy chủ quản trị: ${detail}`,
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

  if (isJson && parsedData?.code === 'SERVICE_ROLE_MISSING') {
    return {
      ok: false,
      status,
      data: parsedData as T | null,
      errorMessage: SERVICE_ROLE_MISSING_MESSAGE,
    };
  }

  if (status === 404 && !isJson) {
    const diagnosedMessage = await diagnoseNonJson404(path, init?.method || 'GET');
    return {
      ok: false,
      status,
      data: null,
      errorMessage: diagnosedMessage,
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

