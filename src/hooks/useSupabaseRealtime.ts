import { useEffect, useRef, useState, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AppStore, AppUser, ParentRegistration } from '../types';
import {
  createSupabaseClientInstance,
  mapSupabaseRowToStoreEntity,
  SUPABASE_TABLE_TO_STORE_KEY,
  syncStoreDeltaToSupabase,
  RealtimeMutationEvent,
} from '../lib/supabase';
import { saveStore } from '../lib/storage';

export type RealtimeConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export interface UseSupabaseRealtimeOptions {
  store: AppStore;
  setStore: React.Dispatch<React.SetStateAction<AppStore>>;
  currentUser: AppUser | null;
  onCurrentUserLocked?: (lockedUser: AppUser) => void;
  onNewParentRegistration?: (registration: ParentRegistration) => void;
  onRealtimeToast?: (message: string, type?: 'info' | 'warning' | 'emerald') => void;
}

export interface UseSupabaseRealtimeResult {
  connectionState: RealtimeConnectionState;
  isSupabaseCloudActive: boolean;
  lastEventAt: string | null;
  lastEventSummary: string | null;
  eventCount: number;
  reconnectAttempt: number;
  reconnectNow: () => void;
}

/**
 * Tự động tính toán lại các chỉ số phụ thuộc (Derived State) ngay khi có sự kiện Realtime:
 * 1. Sĩ số lớp học (current_students) từ bảng enrollments
 * 2. Số suất ăn nhẹ (snacks_allocated, snacks_consumed, snacks_returned) từ bảng attendance_records
 * 3. Định mức thù lao theo buổi cho giáo viên (Cơ hữu: 300.000đ/buổi, Thỉnh giảng: 270.000đ/buổi)
 */
export function recomputeDerivedRealtimeState(store: AppStore): AppStore {
  const activeCountByClass = new Map<string, number>();
  for (const enr of store.enrollments || []) {
    if (enr.status === 'active' || enr.status === 'trial') {
      activeCountByClass.set(enr.class_id, (activeCountByClass.get(enr.class_id) || 0) + 1);
    }
  }

  let classesChanged = false;
  const updatedClasses = (store.classes || []).map(cls => {
    const computedCount = activeCountByClass.get(cls.id) || 0;
    if (cls.current_students !== computedCount) {
      classesChanged = true;
      return { ...cls, current_students: computedCount };
    }
    return cls;
  });

  // Cập nhật định mức thù lao chuẩn trên teacher_work_sessions (Cơ hữu 300k / Thỉnh giảng 270k)
  const permanentRate = store.payrollRateConfig?.permanent_session_rate || 300000;
  const visitingRate = store.payrollRateConfig?.visiting_session_rate || 270000;
  const teacherMap = new Map((store.teachers || []).map(t => [t.id, t]));

  let teacherSessionsChanged = false;
  const updatedTeacherAttendance = (store.teacherAttendance || []).map(ta => {
    const actualId = ta.actual_teacher_id || ta.assigned_teacher_id;
    const teacher = teacherMap.get(actualId);
    const isVisiting =
      teacher?.type === 'visiting' || teacher?.teacher_type === 'visiting';
    const expectedRate = isVisiting ? visitingRate : permanentRate;
    const isAbsent =
      ta.status === 'absent_excused' || ta.status === 'absent_unexcused';
    const expectedEarned = isAbsent && !ta.actual_teacher_id ? 0 : expectedRate;

    if (
      ta.rate_applied !== expectedRate ||
      ta.earned_amount !== expectedEarned ||
      ta.total_payout !== expectedEarned
    ) {
      teacherSessionsChanged = true;
      return {
        ...ta,
        rate_applied: expectedRate,
        earned_amount: expectedEarned,
        total_payout: expectedEarned,
      };
    }
    return ta;
  });

  // Cập nhật bộ đếm suất ăn nhẹ (Snack Counter) trên các buổi học
  const studentMap = new Map((store.students || []).map(s => [s.id, s]));
  let sessionsChanged = false;
  const updatedSessions = (store.sessions || []).map(sess => {
    const sessionAtt = (store.attendance || []).filter(
      a =>
        a.session_id === sess.id ||
        (a.class_id === sess.class_id && a.session_date === sess.session_date)
    );
    if (sessionAtt.length === 0) return sess;

    let allocated = 0;
    let consumed = 0;
    let returned = 0;

    for (const att of sessionAtt) {
      const stu = studentMap.get(att.student_id);
      if (stu?.is_royal_student) {
        allocated += 1;
        if (att.status === 'absent_excused') {
          returned += 1;
        } else {
          consumed += 1;
        }
      }
    }

    if (
      allocated > 0 &&
      (sess.snacks_allocated !== allocated ||
        sess.snacks_consumed !== consumed ||
        sess.snacks_returned !== returned)
    ) {
      sessionsChanged = true;
      return {
        ...sess,
        snacks_allocated: allocated,
        snacks_consumed: consumed,
        snacks_returned: returned,
      };
    }
    return sess;
  });

  if (!classesChanged && !teacherSessionsChanged && !sessionsChanged) {
    return store;
  }

  return {
    ...store,
    classes: classesChanged ? updatedClasses : store.classes,
    teacherAttendance: teacherSessionsChanged
      ? updatedTeacherAttendance
      : store.teacherAttendance,
    sessions: sessionsChanged ? updatedSessions : store.sessions,
  };
}

/**
 * Hook trung tâm quản lý kết nối Supabase Realtime WebSockets ('royal_hub_realtime')
 * kết hợp kênh đồng bộ đa cửa sổ tức thì & cơ chế Exponential Backoff Reconnect
 */
export function useSupabaseRealtime({
  store,
  setStore,
  currentUser,
  onCurrentUserLocked,
  onNewParentRegistration,
  onRealtimeToast,
}: UseSupabaseRealtimeOptions): UseSupabaseRealtimeResult {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'reconnecting' : 'connected'
  );
  const [isSupabaseCloudActive, setIsSupabaseCloudActive] = useState<boolean>(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [lastEventSummary, setLastEventSummary] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState<number>(0);
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const [reconnectTrigger, setReconnectTrigger] = useState<number>(0);

  const clientIdRef = useRef<string>(
    `royal_client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  );
  const prevStoreRef = useRef<AppStore>(store);
  const isApplyingRemoteUpdateRef = useRef<boolean>(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const backoffTimerRef = useRef<number | null>(null);

  const currentUserRef = useRef<AppUser | null>(currentUser);
  currentUserRef.current = currentUser;

  const callbacksRef = useRef({
    onCurrentUserLocked,
    onNewParentRegistration,
    onRealtimeToast,
  });
  callbacksRef.current = {
    onCurrentUserLocked,
    onNewParentRegistration,
    onRealtimeToast,
  };

  /**
   * Bộ xử lý sự kiện (Event Handler) cho 3 thao tác cốt lõi: INSERT, UPDATE, DELETE
   * Đảm bảo tính Idempotent (chống nhân đôi bản ghi) và tính toán lại ngay các trường phụ thuộc
   */
  const handleRealtimePayload = useCallback(
    (payload: {
      table: string;
      eventType: 'INSERT' | 'UPDATE' | 'DELETE';
      new: any;
      old: any;
      originClientId?: string;
    }) => {
      if (!payload || !payload.table) return;
      if (payload.originClientId && payload.originClientId === clientIdRef.current) {
        return;
      }

      const { table, eventType, new: newRecordRaw, old: oldRecordRaw } = payload;
      const storeKey = SUPABASE_TABLE_TO_STORE_KEY[table];
      if (!storeKey) return;

      const mappedNew =
        eventType !== 'DELETE' ? mapSupabaseRowToStoreEntity(table, newRecordRaw) : null;
      const oldId = oldRecordRaw?.id ? String(oldRecordRaw.id) : null;

      setLastEventAt(new Date().toISOString());
      setEventCount(c => c + 1);
      setLastEventSummary(`${eventType} on ${table}`);

      // Kiểm tra bảo mật tức thì nếu bảng app_users bị khóa hoặc xóa tài khoản đang đăng nhập
      if (table === 'app_users' && currentUserRef.current) {
        const activeUid = currentUserRef.current.id;
        const activeUsername = currentUserRef.current.username;
        if (
          eventType === 'UPDATE' &&
          mappedNew &&
          (mappedNew.id === activeUid || mappedNew.username === activeUsername) &&
          mappedNew.status === 'locked'
        ) {
          callbacksRef.current.onCurrentUserLocked?.(mappedNew as AppUser);
        } else if (eventType === 'DELETE' && oldId && oldId === activeUid) {
          callbacksRef.current.onCurrentUserLocked?.({
            ...currentUserRef.current,
            status: 'locked',
          });
        }
      }

      isApplyingRemoteUpdateRef.current = true;

      setStore(prevStore => {
        const currentList = Array.isArray(prevStore[storeKey])
          ? ([...(prevStore[storeKey] as any[])] as any[])
          : [];

        let updatedList = currentList;
        let didMutate = false;

        if (eventType === 'INSERT' && mappedNew && mappedNew.id) {
          // 1. Khi có bản ghi MỚI (INSERT): Kiểm tra nếu newRecord.id chưa tồn tại trong mảng thì thêm mới
          const exists = currentList.some(item => String(item.id) === String(mappedNew.id));
          if (!exists) {
            updatedList = [mappedNew, ...currentList];
            didMutate = true;

            // Nếu là bảng parent_registrations -> Phát âm báo / tăng số đếm huy hiệu (Badge) và tạo thông báo
            if (table === 'parent_registrations') {
              callbacksRef.current.onNewParentRegistration?.(
                mappedNew as ParentRegistration
              );
            }
          }
        } else if (eventType === 'UPDATE' && mappedNew && mappedNew.id) {
          // 2. Khi có bản ghi CẬP NHẬT (UPDATE): Tìm phần tử có item.id === newRecord.id và hợp nhất
          const idx = currentList.findIndex(item => String(item.id) === String(mappedNew.id));
          if (idx !== -1) {
            const mergedItem = { ...currentList[idx], ...mappedNew };
            if (JSON.stringify(currentList[idx]) !== JSON.stringify(mergedItem)) {
              updatedList = [...currentList];
              updatedList[idx] = mergedItem;
              didMutate = true;
            }
          } else {
            updatedList = [mappedNew, ...currentList];
            didMutate = true;
          }
        } else if (eventType === 'DELETE' && oldId) {
          // 3. Khi có bản ghi BỊ XÓA (DELETE): Lọc bỏ phần tử có item.id === oldRecord.id
          const filtered = currentList.filter(item => String(item.id) !== oldId);
          if (filtered.length !== currentList.length) {
            updatedList = filtered;
            didMutate = true;
          }
        }

        if (!didMutate) {
          isApplyingRemoteUpdateRef.current = false;
          return prevStore;
        }

        let nextStore: AppStore = {
          ...prevStore,
          [storeKey]: updatedList,
        };

        // Nếu có đơn đăng ký phụ huynh mới từ Realtime, tự động thêm thông báo vào chuông hệ thống
        if (table === 'parent_registrations' && eventType === 'INSERT' && mappedNew) {
          const notifId = `notif_rt_lead_${mappedNew.id}`;
          const alreadyHasNotif = (nextStore.notifications || []).some(n => n.id === notifId);
          if (!alreadyHasNotif) {
            nextStore = {
              ...nextStore,
              notifications: [
                {
                  id: notifId,
                  type: 'new_lead_registration',
                  title: 'Đơn đăng ký tuyển sinh mới (Realtime)',
                  message: `Phụ huynh ${mappedNew.parent_name} vừa đăng ký cho bé ${mappedNew.student_name} (${mappedNew.parent_phone}).`,
                  date: new Date().toISOString().split('T')[0],
                  severity: 'high',
                  read: false,
                },
                ...(nextStore.notifications || []),
              ],
            };
          }
        }

        // Tính toán lại ngay lập tức các chỉ số phụ thuộc (Sĩ số lớp, Suất ăn nhẹ, Thù lao GV)
        const recomputed = recomputeDerivedRealtimeState(nextStore);
        prevStoreRef.current = recomputed;
        saveStore(recomputed);
        isApplyingRemoteUpdateRef.current = false;
        return recomputed;
      });
    },
    [setStore]
  );

  // Theo dõi thay đổi trên store cục bộ để tự động đẩy (Upsert/Delete) lên Supabase & phát qua BroadcastChannel
  useEffect(() => {
    const recomputed = recomputeDerivedRealtimeState(store);
    if (recomputed !== store) {
      prevStoreRef.current = recomputed;
      setStore(recomputed);
      return;
    }

    if (isApplyingRemoteUpdateRef.current) {
      prevStoreRef.current = store;
      return;
    }

    const prevStore = prevStoreRef.current;
    if (prevStore === store) return;
    prevStoreRef.current = store;

    syncStoreDeltaToSupabase(prevStore, store, clientIdRef.current)
      .then((events: RealtimeMutationEvent[]) => {
        if (events.length > 0) {
          setLastEventAt(new Date().toISOString());
          setEventCount(c => c + events.length);
          setLastEventSummary(`${events[0].eventType} on ${events[0].table}`);
          if (broadcastChannelRef.current) {
            for (const ev of events) {
              try {
                broadcastChannelRef.current.postMessage(ev);
              } catch {
                // ignore
              }
            }
          }
        }
      })
      .catch(() => {});
  }, [store, setStore]);

  // Thiết lập kênh BroadcastChannel đồng bộ đa tab/cửa sổ và lắng nghe sự kiện mạng Online/Offline
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('royal_hub_realtime');
        bc.onmessage = event => {
          if (event?.data && event.data.table && event.data.eventType) {
            handleRealtimePayload(event.data);
          }
        };
        broadcastChannelRef.current = bc;
      } catch {
        // ignore
      }
    }

    const handleOnline = () => {
      setReconnectAttempt(0);
      setConnectionState('connected');
      setReconnectTrigger(t => t + 1);
    };

    const handleOffline = () => {
      setConnectionState('reconnecting');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.close();
        } catch {
          // ignore
        }
        broadcastChannelRef.current = null;
      }
    };
  }, [handleRealtimePayload]);

  // Khởi tạo kênh đăng ký Supabase Realtime ('royal_hub_realtime') kèm Exponential Backoff Reconnect
  useEffect(() => {
    if (backoffTimerRef.current) {
      window.clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }

    const sbUrl = store.supabaseConfig?.url;
    const sbKey = store.supabaseConfig?.anonKey;
    const client = createSupabaseClientInstance(sbUrl, sbKey);

    if (!client) {
      setIsSupabaseCloudActive(false);
      setConnectionState(
        typeof navigator !== 'undefined' && !navigator.onLine ? 'reconnecting' : 'connected'
      );
      return;
    }

    let isUnmounted = false;

    const channel = client
      .channel('royal_hub_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload: any) => {
          if (isUnmounted) return;
          handleRealtimePayload({
            table: payload.table,
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
          });
        }
      )
      .subscribe((status: string) => {
        if (isUnmounted) return;

        if (status === 'SUBSCRIBED') {
          setIsSupabaseCloudActive(true);
          setConnectionState('connected');
          setReconnectAttempt(0);
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setIsSupabaseCloudActive(false);
          setConnectionState('reconnecting');

          // Cơ chế Exponential Backoff Reconnect (1s -> 2s -> 4s -> 8s -> tối đa 30s)
          setReconnectAttempt(prevAttempt => {
            const nextAttempt = prevAttempt + 1;
            const delayMs = Math.min(30000, 1000 * Math.pow(2, Math.min(nextAttempt - 1, 5)));
            if (backoffTimerRef.current) {
              window.clearTimeout(backoffTimerRef.current);
            }
            backoffTimerRef.current = window.setTimeout(() => {
              if (!isUnmounted) {
                setReconnectTrigger(t => t + 1);
              }
            }, delayMs);
            return nextAttempt;
          });
        }
      });

    channelRef.current = channel;

    return () => {
      isUnmounted = true;
      if (backoffTimerRef.current) {
        window.clearTimeout(backoffTimerRef.current);
        backoffTimerRef.current = null;
      }
      if (channelRef.current) {
        try {
          channelRef.current.unsubscribe();
          client.removeChannel(channelRef.current);
        } catch {
          // ignore
        }
        channelRef.current = null;
      }
    };
  }, [
    store.supabaseConfig?.url,
    store.supabaseConfig?.anonKey,
    reconnectTrigger,
    handleRealtimePayload,
  ]);

  const reconnectNow = useCallback(() => {
    setConnectionState('reconnecting');
    setReconnectAttempt(0);
    setReconnectTrigger(t => t + 1);
  }, []);

  return {
    connectionState,
    isSupabaseCloudActive,
    lastEventAt,
    lastEventSummary,
    eventCount,
    reconnectAttempt,
    reconnectNow,
  };
}
