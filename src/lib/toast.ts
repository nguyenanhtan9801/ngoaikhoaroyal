export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title?: string;
  duration?: number;
  id?: string;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration: number;
  timestamp: number;
}

type ToastSubscriber = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const subscribers: Set<ToastSubscriber> = new Set();

function notifySubscribers() {
  subscribers.forEach((callback) => {
    try {
      callback([...toasts]);
    } catch {
      // noop
    }
  });
}

export function showToast(
  message: string,
  type: ToastType = 'info',
  options?: ToastOptions
): string {
  const id = options?.id || `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const duration = options?.duration ?? (type === 'error' ? 5000 : 3500);

  const newToast: ToastItem = {
    id,
    type,
    message,
    title: options?.title,
    duration,
    timestamp: Date.now(),
  };

  // Giữ tối đa 5 toast cùng lúc trên màn hình
  toasts = [newToast, ...toasts.slice(0, 4)];
  notifySubscribers();

  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notifySubscribers();
}

export function subscribeToast(callback: ToastSubscriber): () => void {
  subscribers.add(callback);
  callback([...toasts]);
  return () => {
    subscribers.delete(callback);
  };
}
