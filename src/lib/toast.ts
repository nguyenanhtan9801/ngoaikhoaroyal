export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  createdAt: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

let toastsState: ToastItem[] = [];
const listeners: Set<ToastListener> = new Set();

const notifyListeners = () => {
  const snapshot = [...toastsState];
  queueMicrotask(() => {
    listeners.forEach(listener => listener(snapshot));
  });
};

export const dismissToast = (id: string) => {
  toastsState = toastsState.filter(t => t.id !== id);
  notifyListeners();
};

export interface ToastOptionsObject {
  title?: string;
  message: string;
  type?: ToastType;
  duration?: number;
}

export const showToast = (
  messageOrOptions: string | ToastOptionsObject,
  typeArg: ToastType = 'success',
  options?: { title?: string; duration?: number }
) => {
  const isObj = typeof messageOrOptions === 'object' && messageOrOptions !== null;
  const message = isObj ? messageOrOptions.message : messageOrOptions;
  const type: ToastType = isObj ? (messageOrOptions.type || 'success') : typeArg;
  const titleOpt = isObj ? messageOrOptions.title : options?.title;
  const duration = (isObj ? messageOrOptions.duration : options?.duration) ?? 3800;

  const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Auto-detect title if not provided
  const defaultTitles: Record<ToastType, string> = {
    success: 'Thao tác thành công',
    warning: 'Lưu ý hệ thống',
    error: 'Không thể thực hiện',
    info: 'Thông báo hệ thống',
  };

  const newToast: ToastItem = {
    id,
    type,
    title: titleOpt || defaultTitles[type],
    message,
    duration,
    createdAt: Date.now(),
  };

  // Keep max 4 visible toasts at once in bottom-right stack
  toastsState = [...toastsState.slice(-3), newToast];
  notifyListeners();

  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  return id;
};

export const subscribeToasts = (listener: ToastListener): (() => void) => {
  listeners.add(listener);
  queueMicrotask(() => {
    listener([...toastsState]);
  });
  return () => {
    listeners.delete(listener);
  };
};
