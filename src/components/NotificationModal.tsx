import React from 'react';
import { X, Bell, AlertTriangle, ShieldAlert, CheckCircle2, DollarSign, BookmarkCheck } from 'lucide-react';
import { SystemNotification } from '../types';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: SystemNotification[];
  onMarkAllAsRead: () => void;
  onNavigateAction?: (notif: SystemNotification) => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onNavigateAction,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Trung Tâm Thông Báo & Cảnh Báo</h3>
              <p className="text-[11px] text-slate-400">Theo dõi công nợ, bảo lưu & chuyên cần bất thường</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAllAsRead}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold"
            >
              Đánh dấu đã đọc
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Không có thông báo nào cần xử lý.
            </div>
          ) : (
            notifications.map(n => {
              const isHigh = n.severity === 'high';
              const isMedium = n.severity === 'medium';

              return (
                <div
                  key={n.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    !n.read 
                      ? 'bg-slate-900 border-amber-500/40' 
                      : 'bg-slate-900/60 border-slate-800 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {n.type === 'consecutive_absence' ? (
                        <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      ) : n.type === 'debt_warning' ? (
                        <DollarSign className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : (
                        <BookmarkCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                      )}
                      <h4 className="text-xs font-bold text-white">{n.title}</h4>
                    </div>

                    <span className="text-[10px] text-slate-500 font-mono shrink-0">{n.date}</span>
                  </div>

                  <p className="mt-1 text-xs text-slate-300 pl-6 leading-relaxed">
                    {n.message}
                  </p>

                  {onNavigateAction && (
                    <div className="mt-2 pl-6">
                      <button
                        onClick={() => {
                          onNavigateAction(n);
                          onClose();
                        }}
                        className="text-[11px] font-bold text-amber-400 hover:text-amber-300"
                      >
                        Xử lý ngay &rarr;
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900/90 border-t border-slate-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
