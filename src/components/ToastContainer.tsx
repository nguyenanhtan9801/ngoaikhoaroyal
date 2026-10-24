import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Sparkles, X } from 'lucide-react';
import { ToastItem, ToastType, subscribeToasts, dismissToast } from '../lib/toast';

const TOAST_STYLES: Record<
  ToastType,
  {
    border: string;
    bgGlow: string;
    iconBg: string;
    iconColor: string;
    titleColor: string;
    progressBar: string;
    Icon: React.FC<{ className?: string }>;
  }
> = {
  success: {
    border: 'border-emerald-500/40',
    bgGlow: 'from-emerald-500/15 via-[#111827]/95 to-[#0F172A]/95',
    iconBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
    iconColor: 'text-emerald-400',
    titleColor: 'text-emerald-300',
    progressBar: 'bg-emerald-400',
    Icon: CheckCircle2,
  },
  warning: {
    border: 'border-amber-500/40',
    bgGlow: 'from-amber-500/15 via-[#111827]/95 to-[#0F172A]/95',
    iconBg: 'bg-amber-500/20 border-amber-500/40 text-amber-400',
    iconColor: 'text-amber-400',
    titleColor: 'text-amber-300',
    progressBar: 'bg-amber-400',
    Icon: AlertTriangle,
  },
  error: {
    border: 'border-rose-500/40',
    bgGlow: 'from-rose-500/15 via-[#111827]/95 to-[#0F172A]/95',
    iconBg: 'bg-rose-500/20 border-rose-500/40 text-rose-400',
    iconColor: 'text-rose-400',
    titleColor: 'text-rose-300',
    progressBar: 'bg-rose-400',
    Icon: XCircle,
  },
  info: {
    border: 'border-cyan-500/40',
    bgGlow: 'from-cyan-500/15 via-[#111827]/95 to-[#0F172A]/95',
    iconBg: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400',
    iconColor: 'text-cyan-400',
    titleColor: 'text-cyan-300',
    progressBar: 'bg-cyan-400',
    Icon: Sparkles,
  },
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-md w-[calc(100vw-2.5rem)] sm:w-[400px] pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.type] || TOAST_STYLES.success;
        const IconComp = style.Icon;

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto relative overflow-hidden rounded-2xl bg-gradient-to-r ${style.bgGlow} border ${style.border} p-3.5 shadow-2xl shadow-black/70 backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 shadow-inner ${style.iconBg}`}
              >
                <IconComp className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0 pr-1">
                {toast.title && (
                  <div className={`text-xs font-extrabold tracking-wide ${style.titleColor}`}>
                    {toast.title}
                  </div>
                )}
                <div className="text-xs text-slate-100 font-medium leading-relaxed mt-0.5 break-words">
                  {toast.message}
                </div>
              </div>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors shrink-0"
                title="Đóng thông báo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Subtle bottom progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800/60 overflow-hidden">
              <div
                className={`h-full ${style.progressBar} opacity-80`}
                style={{
                  animation: `toastProgress ${toast.duration || 3800}ms linear forwards`,
                }}
              />
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes toastProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};
