export interface ApiFetchJsonResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string;
}

const MISSING_EXPRESS_SERVER_404_MESSAGE =
  'Không tìm thấy máy chủ API (/api). Ứng dụng đang chạy mà không có máy chủ Express (server.ts) hoặc đang dùng bản cũ. Hãy mở /api/health để kiểm tra và chạy ứng dụng bằng npm run dev (hoặc npm run build rồi npm start).';

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

  if (status === 404 && !isJson) {
    return {
      ok: false,
      status,
      data: null,
      errorMessage: MISSING_EXPRESS_SERVER_404_MESSAGE,
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
