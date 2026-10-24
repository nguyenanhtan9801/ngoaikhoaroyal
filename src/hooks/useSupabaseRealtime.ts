import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { AppStore, ParentRegistration, AppUser } from '../types';

export interface UseSupabaseRealtimeOptions {
  store: AppStore;
  setStore: React.Dispatch<React.SetStateAction<AppStore>>;
  currentUser: AppUser | null;
  onCurrentUserLocked?: () => void;
  onNewParentRegistration?: (reg: ParentRegistration) => void;
}

export interface UseSupabaseRealtimeReturn {
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  reconnectNow: () => void;
  lastSyncTime: Date | null;
}

/**
 * Hook lắng nghe thời gian thực qua Supabase Realtime WebSocket với cơ chế
 * ngắt kết nối an toàn (prevent infinite error retry loops) và fallback polling âm thầm.
 */
export function useSupabaseRealtime({
  setStore,
  currentUser,
  onCurrentUserLocked,
  onNewParentRegistration,
}: UseSupabaseRealtimeOptions): UseSupabaseRealtimeReturn {
  const [connectionState, setConnectionState] = useState<
    'connected' | 'reconnecting' | 'disconnected'
  >('connected');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(new Date());

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fallback Polling chạy âm thầm qua REST API, tuyệt đối không bắn lỗi exception đỏ
  const pollSilent = useCallback(async () => {
    try {
      const { data: regData, error: regErr } = await supabase
        .from('parent_registrations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);

      if (!regErr && Array.isArray(regData) && regData.length > 0) {
        setStore((prev) => {
          const currentList = prev.parentRegistrations || [];
          const existingIds = new Set(currentList.map((r) => r.id));
          const newItems = (regData as ParentRegistration[]).filter((r) => !existingIds.has(r.id));

          if (newItems.length > 0) {
            newItems.forEach((r) => {
              if (onNewParentRegistration) onNewParentRegistration(r);
            });
            return {
              ...prev,
              parentRegistrations: [...newItems, ...currentList],
            };
          }
          return prev;
        });
      }
      setLastSyncTime(new Date());
    } catch {
      // Nuốt lỗi âm thầm, không ghi log đỏ ra console
    }
  }, [setStore, onNewParentRegistration]);

  // Khởi tạo kênh Realtime với cơ chế chống retry spam
  const subscribeChannel = useCallback(() => {
    // Nếu đang có channel cũ, tháo dỡ sạch trước
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch {
        // noop
      }
      channelRef.current = null;
    }

    try {
      const channel = supabase.channel('royal_hub_realtime', {
        config: {
          broadcast: { self: false },
        },
      });

      // Lắng nghe đăng ký tuyển sinh mới từ Cổng Phụ Huynh
      channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'parent_registrations' },
          (payload: any) => {
            const newReg = payload.new as ParentRegistration;
            if (newReg && newReg.id) {
              setStore((prev) => {
                const list = prev.parentRegistrations || [];
                if (list.some((r) => r.id === newReg.id)) return prev;
                if (onNewParentRegistration) {
                  onNewParentRegistration(newReg);
                }
                return {
                  ...prev,
                  parentRegistrations: [newReg, ...list],
                };
              });
            }
          }
        )
        // Lắng nghe thay đổi tài khoản người dùng (khóa khẩn cấp)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_users' },
          (payload: any) => {
            const updated = payload.new as AppUser;
            if (
              currentUser &&
              updated &&
              (updated.id === currentUser.id ||
                updated.username?.toLowerCase() === currentUser.username?.toLowerCase())
            ) {
              if (updated.status === 'locked' && onCurrentUserLocked) {
                onCurrentUserLocked();
              }
            }
          }
        )
        // Quản lý trạng thái kết nối
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            setConnectionState('connected');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // QUAN TRỌNG: GỠ NGAY LẬP TỨC CHANNEL ĐỂ NGĂN WEBSOCKET LIÊN TỤC RETRY GÂY SPAM LỖI ĐỎ
            try {
              supabase.removeChannel(channel);
            } catch {
              // noop
            }
            channelRef.current = null;
            setConnectionState('disconnected');

            // Kích hoạt Fallback Polling âm thầm
            if (!pollingIntervalRef.current) {
              pollingIntervalRef.current = setInterval(pollSilent, 30000);
            }
          } else if (status === 'CLOSED') {
            setConnectionState('disconnected');
          }
        });

      channelRef.current = channel;
    } catch {
      // Khi môi trường sandbox không cho phép WebSocket
      setConnectionState('disconnected');
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(pollSilent, 30000);
      }
    }
  }, [setStore, currentUser, onCurrentUserLocked, onNewParentRegistration, pollSilent]);

  const reconnectNow = useCallback(() => {
    setConnectionState('reconnecting');
    subscribeChannel();
  }, [subscribeChannel]);

  useEffect(() => {
    subscribeChannel();

    // Polling định kỳ mỗi 60s để đảm bảo dữ liệu luôn tươi mới
    pollingIntervalRef.current = setInterval(pollSilent, 60000);

    return () => {
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch {
          // noop
        }
        channelRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [subscribeChannel, pollSilent]);

  return {
    connectionState,
    reconnectNow,
    lastSyncTime,
  };
}
