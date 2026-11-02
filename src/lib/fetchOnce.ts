/**
 * Tiện ích dùng chung `fetchOnce(key, fn, ttlMs = 60000)`:
 * - Gộp các lời gọi trùng đồng thời (in-flight request deduplication), kể cả khi React StrictMode chạy effect 2 lần.
 * - Lưu bộ nhớ đệm kết quả trong thời gian `ttlMs` (mặc định 60.000ms = 60 giây).
 * - Hỗ trợ xóa bộ nhớ đệm theo key hoặc tiền tố khi người dùng bấm "Làm mới" hoặc sau khi vừa ghi dữ liệu.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const inFlightMap = new Map<string, Promise<unknown>>();
const cacheMap = new Map<string, CacheEntry<unknown>>();

export interface FetchOnceOptions {
  /** Bỏ qua kết quả lưu đệm và buộc tải lại từ nguồn (vẫn gộp các lời gọi in-flight trùng nhau) */
  force?: boolean;
}

export async function fetchOnce<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = 60000,
  options?: FetchOnceOptions
): Promise<T> {
  const now = Date.now();
  const force = Boolean(options?.force);

  if (!force && ttlMs > 0) {
    const cached = cacheMap.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }
  }

  const existingInFlight = inFlightMap.get(key);
  if (existingInFlight) {
    return existingInFlight as Promise<T>;
  }

  const promise = (async () => {
    try {
      const result = await fn();
      if (ttlMs > 0) {
        cacheMap.set(key, {
          value: result,
          expiresAt: Date.now() + ttlMs,
        });
      }
      return result;
    } finally {
      inFlightMap.delete(key);
    }
  })();

  inFlightMap.set(key, promise);
  return promise;
}

/**
 * Xóa kết quả lưu đệm theo đúng key hoặc theo tiền tố (prefix).
 * Nếu không truyền tham số thì xóa toàn bộ bộ nhớ đệm.
 */
export function invalidateFetchOnce(keyOrPrefix?: string): void {
  if (!keyOrPrefix) {
    cacheMap.clear();
    return;
  }
  for (const key of Array.from(cacheMap.keys())) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      cacheMap.delete(key);
    }
  }
}

/**
 * Tạo hàm tải lại có debounce (mặc định 2000ms = 2 giây) để tránh tải dồn dập.
 */
export function createDebouncedReload<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void | Promise<void>,
  delayMs: number = 2000
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: TArgs) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      void fn(...args);
    }, delayMs);
  };
}
