import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { ToastItem, subscribeToast, dismissToast } from '../lib/toast';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToast((items) => {
      setToasts(items);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[999999] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none px-3"
    >
      {toasts.map((toast) => {
        let borderClass = 'border-slate-700/60';
        let bgClass = 'bg-slate-900/95';
        let iconColor = 'text-blue-400';
        let Icon = Info;

        if (toast.type === 'success') {
          borderClass = 'border-emerald-500/40';
          bgClass = 'bg-emerald-950/90';
          iconColor = 'text-emerald-400';
          Icon = CheckCircle2;
        } else if (toast.type === 'error') {
          borderClass = 'border-rose-500/40';
          bgClass = 'bg-rose-950/90';
          iconColor = 'text-rose-400';
          Icon = AlertCircle;
        } else if (toast.type === 'warning') {
          borderClass = 'border-amber-500/40';
          bgClass = 'bg-amber-950/90';
          iconColor = 'text-amber-400';
          Icon = AlertTriangle;
        }

        return (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border ${borderClass} ${bgClass} backdrop-blur-md shadow-2xl text-slate-100 transition-all duration-200 transform translate-y-0 opacity-100 animate-in fade-in slide-in-from-bottom-2`}
          >
            <div className={`mt-0.5 shrink-0 ${iconColor}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 pr-1">
              {toast.title && (
                <div className="font-semibold text-xs tracking-wide uppercase text-slate-200 mb-0.5">
                  {toast.title}
                </div>
              )}
              <div className="text-xs font-normal text-slate-200 leading-relaxed break-words">
                {toast.message}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors"
              title="Đóng thông báo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
