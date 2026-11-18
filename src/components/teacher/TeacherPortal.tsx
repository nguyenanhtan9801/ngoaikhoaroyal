import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode,
  RefreshCw,
  LogOut,
  WifiOff,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sun,
  ShieldCheck,
  KeyRound,
  CalendarCheck,
  Sparkles,
  ClipboardCheck,
  Users,
  Search,
  MapPin,
  User,
  Phone,
  AlertCircle,
  CheckCheck,
  Save,
  ChevronLeft,
  ChevronRight,
  Calendar,
  XCircle,
  Coffee,
  Filter,
  BookOpen,
} from 'lucide-react';
import {
  AppStore,
  AppUser,
  AttendanceRecord,
  ClassSession,
  ExtracurricularClass,
  Student,
  TeacherCheckin,
} from '../../types';
import {
  createAuditRecord,
  appendAuditLog,
  formatDateVN,
  getCampusLabelVN,
  getClassDaysOfWeek,
  getClassEffectiveBounds,
  getClassPhase,
  isStudentScheduledForDate,
  loadStore,
  normalizeCampusScope,
} from '../../lib/storage';
import {
  ClassroomStaffKind,
  getClassroomStaffKind,
  getClassroomStaffRoleLabel,
} from '../../lib/permissions';
import { supabase } from '../../supabaseClient';
import { showToast } from '../../lib/toast';
import { DatePickerVN } from '../common/DatePickerVN';
import { sortByLabelVi } from '../../utils/sortVi';

interface TeacherPortalProps {
  currentUser: AppUser;
  store?: AppStore;
  onUpdateStore?: (updater: (prev: AppStore) => AppStore) => void;
  onLogout: () => void;
  onOpenChangePassword?: () => void;
}

interface QrTokenResponse {
  token: string;
  issued_at: string;
  expires_at: string;
  refresh_in: number;
  server_time: string;
  teacher: {
    id: string;
    name: string;
    code: string;
  };
}

interface SessionStaffOverrideRow {
  class_id: string;
  session_date: string;
  primary_teacher_id?: string | null;
  assistant_teacher_ids?: string[] | null;
}

type PortalAttendanceStatus = 'present' | 'absent_excused' | 'absent_unexcused';

function formatVnTimeHms(ms: number): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(ms));
  } catch {
    const d = new Date(ms);
    return d.toTimeString().slice(0, 8);
  }
}

function formatVnDateYmd(ms: number): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(ms));
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    return `${map.year}-${map.month}-${map.day}`;
  } catch {
    return new Date(ms).toISOString().split('T')[0];
  }
}

function formatVnDateDisplay(ms: number): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(ms));
  } catch {
    return formatVnDateYmd(ms);
  }
}

function formatDateYmdToVnShort(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

function formatCheckinTime(iso?: string | null): string {
  if (!iso) return '--:--';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '--:--';
  return formatVnTimeHms(parsed);
}

function parseDayTokenToWeekdayIndex(token: string): number | null {
  const clean = String(token || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!clean) return null;
  if (clean === 'CN' || clean === 'SUN' || clean === 'SUNDAY' || clean === 'T8' || clean === 'CHỦNHẬT') return 0;
  if (clean === 'T2' || clean === 'MON' || clean === 'MONDAY' || clean === '2' || clean === 'THỨ2') return 1;
  if (clean === 'T3' || clean === 'TUE' || clean === 'TUESDAY' || clean === '3' || clean === 'THỨ3') return 2;
  if (clean === 'T4' || clean === 'WED' || clean === 'WEDNESDAY' || clean === '4' || clean === 'THỨ4') return 3;
  if (clean === 'T5' || clean === 'THU' || clean === 'THURSDAY' || clean === '5' || clean === 'THỨ5') return 4;
  if (clean === 'T6' || clean === 'FRI' || clean === 'FRIDAY' || clean === '6' || clean === 'THỨ6') return 5;
  if (clean === 'T7' || clean === 'SAT' || clean === 'SATURDAY' || clean === '7' || clean === 'THỨ7') return 6;
  return null;
}

function getWeekdayIndexFromYmd(ymd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return new Date().getDay();
  const utcMidday = new Date(`${ymd}T12:00:00Z`);
  return utcMidday.getUTCDay();
}

function getWeekdayLabelVN(ymd: string): string {
  const idx = getWeekdayIndexFromYmd(ymd);
  const map: Record<number, string> = {
    0: 'Chủ Nhật',
    1: 'Thứ Hai',
    2: 'Thứ Ba',
    3: 'Thứ Tư',
    4: 'Thứ Năm',
    5: 'Thứ Sáu',
    6: 'Thứ Bảy',
  };
  return map[idx] || '';
}

export const TeacherPortal: React.FC<TeacherPortalProps> = ({
  currentUser,
  store: propStore,
  onUpdateStore,
  onLogout,
  onOpenChangePassword,
}) => {
  const [fallbackLocalStore, setFallbackLocalStore] = useState<AppStore>(() => loadStore());
  const activeStore = propStore || fallbackLocalStore;

  const handleStoreUpdate = useCallback(
    (updater: (prev: AppStore) => AppStore) => {
      if (onUpdateStore) {
        onUpdateStore(updater);
      } else {
        setFallbackLocalStore(prev => updater(prev));
      }
    },
    [onUpdateStore]
  );

  // Tab điều hướng: 'qr' (Mặc định mở ngay khi đăng nhập) | 'attendance' (Điểm Danh Lớp Học)
  const [activeTab, setActiveTab] = useState<'qr' | 'attendance'>('qr');

  // State QR Check-in
  const [qrData, setQrData] = useState<QrTokenResponse | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  const [nowLocalMs, setNowLocalMs] = useState<number>(() => Date.now());
  const [isLoadingQr, setIsLoadingQr] = useState<boolean>(true);
  const [qrError, setQrError] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  const [todayCheckins, setTodayCheckins] = useState<TeacherCheckin[]>([]);
  const [isLoadingCheckins, setIsLoadingCheckins] = useState<boolean>(false);

  const isFetchingQrRef = useRef<boolean>(false);
  const refreshTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const wakeLockSentinelRef = useRef<any>(null);

  const nowServerMs = nowLocalMs + serverOffsetMs;
  const todayStr = formatVnDateYmd(nowServerMs);

  // Xác định nhóm nhân sự lớp học: 'teacher' | 'nanny' | 'supervisor'
  const staffKind: ClassroomStaffKind = useMemo(
    () => getClassroomStaffKind(currentUser, activeStore.teachers) || 'teacher',
    [currentUser, activeStore.teachers]
  );

  const isSupervisorOrNanny = staffKind === 'supervisor' || staffKind === 'nanny';
  const roleBadgeLabel = getClassroomStaffRoleLabel(staffKind);

  const resolvedTeacherId = useMemo(() => {
    if (qrData?.teacher?.id) return qrData.teacher.id;
    if (currentUser.linked_teacher_id) return currentUser.linked_teacher_id;
    if (currentUser.teacher_id) return currentUser.teacher_id;
    const byCodeOrName = (activeStore.teachers || []).find(
      t =>
        (t.code && t.code.toLowerCase() === currentUser.username.toLowerCase()) ||
        (t.name && t.name.toLowerCase() === currentUser.full_name.toLowerCase())
    );
    return byCodeOrName?.id || '';
  }, [
    qrData?.teacher?.id,
    currentUser.linked_teacher_id,
    currentUser.teacher_id,
    currentUser.username,
    currentUser.full_name,
    activeStore.teachers,
  ]);

  const linkedTeacherObj = useMemo(
    () => (activeStore.teachers || []).find(t => t.id === resolvedTeacherId),
    [activeStore.teachers, resolvedTeacherId]
  );

  const staffDisplayName =
    qrData?.teacher?.name || linkedTeacherObj?.name || currentUser.full_name || 'Nhân sự Lớp học';
  const staffDisplayCode =
    qrData?.teacher?.code ||
    linkedTeacherObj?.code ||
    currentUser.linked_teacher_id ||
    currentUser.username.toUpperCase();

  const effectiveCampusScope = useMemo(
    () => normalizeCampusScope(currentUser.campus_id || linkedTeacherObj?.campus_id),
    [currentUser.campus_id, linkedTeacherObj?.campus_id]
  );

  const campusDisplayLabel = useMemo(
    () => getCampusLabelVN(effectiveCampusScope),
    [effectiveCampusScope]
  );

  const expiresAtMs = qrData?.expires_at ? Date.parse(qrData.expires_at) : 0;
  const issuedAtMs = qrData?.issued_at ? Date.parse(qrData.issued_at) : 0;
  const totalTtlSec =
    expiresAtMs > issuedAtMs ? Math.max(1, Math.round((expiresAtMs - issuedAtMs) / 1000)) : 90;
  const remainingSec =
    expiresAtMs > 0 ? Math.max(0, Math.ceil((expiresAtMs - nowServerMs) / 1000)) : 0;
  const isQrValidAndUnexpired = Boolean(qrData?.token && remainingSec > 0);

  // Hàm lấy mã QR mới từ GET /api/teacher/checkin-qr
  const fetchCheckinQr = useCallback(async () => {
    if (isFetchingQrRef.current) return;
    isFetchingQrRef.current = true;
    setIsLoadingQr(true);

    try {
      if (!supabase?.auth) {
        throw new Error('Chưa kết nối dịch vụ xác thực.');
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Phiên đăng nhập đã hết hạn.');
      }

      const res = await fetch('/api/teacher/checkin-qr', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.token) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }

      const serverTimeMs = Date.parse(body.server_time);
      const localNow = Date.now();
      if (Number.isFinite(serverTimeMs)) {
        setServerOffsetMs(serverTimeMs - localNow);
      }
      setNowLocalMs(localNow);
      setQrData(body as QrTokenResponse);
      setQrError(null);

      // Lên lịch tự động làm mới theo refresh_in (mặc định 60 giây)
      const refreshInSec = Number(body.refresh_in) > 5 ? Number(body.refresh_in) : 60;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        fetchCheckinQr();
      }, refreshInSec * 1000);
    } catch (err: any) {
      setQrError(err?.message || 'Mất kết nối, đang thử lại');
    } finally {
      isFetchingQrRef.current = false;
      setIsLoadingQr(false);
    }
  }, []);

  // Tải danh sách check-in hôm nay của nhân sự từ bảng teacher_checkins
  const fetchTodayCheckins = useCallback(
    async (targetDateStr: string) => {
      if (!supabase) return;
      setIsLoadingCheckins(true);
      try {
        let query = supabase
          .from('teacher_checkins')
          .select(
            'id,teacher_id,campus_id,class_id,session_date,checked_in_at,scheduled_start,late_minutes,status,method,scanned_by,scanner_name,token_jti,note,created_at'
          )
          .eq('session_date', targetDateStr)
          .order('checked_in_at', { ascending: false });

        const targetStaffId =
          qrData?.teacher?.id || currentUser.linked_teacher_id || currentUser.id;
        if (targetStaffId) {
          query = query.eq('teacher_id', targetStaffId);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          setTodayCheckins(data as TeacherCheckin[]);
        }
      } catch {
        // ignore transient network errors
      } finally {
        setIsLoadingCheckins(false);
      }
    },
    [currentUser.id, currentUser.linked_teacher_id, qrData?.teacher?.id]
  );

  // Đồng hồ chạy từng giây theo giờ server
  useEffect(() => {
    const clockInterval = window.setInterval(() => {
      setNowLocalMs(Date.now());
    }, 1000);
    return () => window.clearInterval(clockInterval);
  }, []);

  // Tự động thử lại mỗi 5 giây khi mất kết nối hoặc khi mã QR đã hết hạn mà chưa lấy được mã mới
  useEffect(() => {
    if (retryTimerRef.current) {
      window.clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!isQrValidAndUnexpired) {
      retryTimerRef.current = window.setInterval(() => {
        fetchCheckinQr();
      }, 5000);
    }

    return () => {
      if (retryTimerRef.current) {
        window.clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [isQrValidAndUnexpired, fetchCheckinQr]);

  // Lấy mã QR ngay khi mở, khi tab hiện lại (visibilitychange) và khi mạng phục hồi (online)
  useEffect(() => {
    fetchCheckinQr();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCheckinQr();
        fetchTodayCheckins(formatVnDateYmd(Date.now() + serverOffsetMs));
      }
    };

    const handleOnline = () => {
      fetchCheckinQr();
      fetchTodayCheckins(formatVnDateYmd(Date.now() + serverOffsetMs));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, [fetchCheckinQr, fetchTodayCheckins, serverOffsetMs]);

  // Giữ màn hình luôn sáng bằng navigator.wakeLock khi trình duyệt hỗ trợ
  useEffect(() => {
    let isMounted = true;

    const requestWakeLock = async () => {
      try {
        const nav = navigator as any;
        if (nav?.wakeLock?.request && document.visibilityState === 'visible') {
          const sentinel = await nav.wakeLock.request('screen');
          if (!isMounted) {
            sentinel?.release?.().catch(() => {});
            return;
          }
          wakeLockSentinelRef.current = sentinel;
          setWakeLockActive(true);
          sentinel.addEventListener?.('release', () => {
            if (isMounted) setWakeLockActive(false);
          });
        }
      } catch {
        if (isMounted) setWakeLockActive(false);
      }
    };

    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLockSentinelRef.current) {
        wakeLockSentinelRef.current.release?.().catch(() => {});
        wakeLockSentinelRef.current = null;
      }
    };
  }, []);

  // Nạp danh sách "Hôm nay bạn đã check in" + cập nhật định kỳ 20 giây/lần + lắng nghe Realtime bảng teacher_checkins
  useEffect(() => {
    fetchTodayCheckins(todayStr);

    const pollInterval = window.setInterval(() => {
      fetchTodayCheckins(todayStr);
    }, 20_000);

    let channel: any = null;
    if (supabase) {
      const teacherFilterId =
        qrData?.teacher?.id || currentUser.linked_teacher_id || currentUser.id;
      channel = supabase
        .channel(`teacher_portal_checkins_${currentUser.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'teacher_checkins',
            ...(teacherFilterId ? { filter: `teacher_id=eq.${teacherFilterId}` } : {}),
          },
          () => {
            fetchTodayCheckins(todayStr);
          }
        )
        .subscribe();
    }

    return () => {
      window.clearInterval(pollInterval);
      if (channel && supabase) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, [todayStr, fetchTodayCheckins, currentUser.id, currentUser.linked_teacher_id, qrData?.teacher?.id]);

  // ============================================================================
  // TAB 2: ĐIỂM DANH LỚP HỌC (ATTENDANCE STATE & LOGIC)
  // ============================================================================
  const [sessionDate, setSessionDate] = useState<string>(() => formatVnDateYmd(Date.now()));
  const [timeSlotFilter, setTimeSlotFilter] = useState<string>('all');
  const [classSearchQuery, setClassSearchQuery] = useState<string>('');
  const [onlyScheduledForDate, setOnlyScheduledForDate] = useState<boolean>(true);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [sessionStaffOverrides, setSessionStaffOverrides] = useState<SessionStaffOverrideRow[]>([]);

  const [attendanceState, setAttendanceState] = useState<
    Record<string, { status: PortalAttendanceStatus; note: string }>
  >({});
  const [sessionGeneralNote, setSessionGeneralNote] = useState<string>('');
  const [isSavingAttendance, setIsSavingAttendance] = useState<boolean>(false);
  const [lastSavedAtText, setLastSavedAtText] = useState<string | null>(null);

  // Nạp lịch phân công dạy thay (class_session_staff) trong ngày đang chọn (nếu có trên Supabase)
  useEffect(() => {
    let isCancelled = false;
    if (!supabase || !sessionDate) return;

    Promise.resolve(
      supabase
        .from('class_session_staff')
        .select('class_id, session_date, primary_teacher_id, assistant_teacher_ids')
        .eq('session_date', sessionDate)
    )
      .then(({ data, error }) => {
        if (!isCancelled && !error && Array.isArray(data)) {
          setSessionStaffOverrides(data as SessionStaffOverrideRow[]);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [sessionDate]);

  // Kiểm tra lớp học có lịch vào ngày targetDate hay không
  const isClassScheduledOnDate = useCallback(
    (cls: ExtracurricularClass, targetDate: string): boolean => {
      if (!cls || cls.status !== 'active') return false;
      const { startDate, endDate } = getClassEffectiveBounds(cls, activeStore.terms);
      if (startDate && startDate > targetDate) return false;
      if (endDate && endDate < targetDate) return false;

      // Kiểm tra ngày nghỉ lễ
      const normClassCampus = normalizeCampusScope(cls.campus_id);
      const isHoliday = (activeStore.holidays || []).some(h => {
        if (h.status !== 'active') return false;
        if (h.start_date > targetDate || h.end_date < targetDate) return false;
        const normHolidayCampus = normalizeCampusScope(h.campus_id || 'all');
        return normHolidayCampus === 'all' || normHolidayCampus === normClassCampus;
      });
      if (isHoliday) return false;

      const classDays = getClassDaysOfWeek(cls, activeStore.timeSlots);
      if (!classDays || classDays.length === 0) return true;
      const targetWeekday = getWeekdayIndexFromYmd(targetDate);
      return classDays.some(d => parseDayTokenToWeekdayIndex(d) === targetWeekday);
    },
    [activeStore.holidays, activeStore.timeSlots]
  );

  // Kiểm tra Giáo viên có phụ trách chính / trợ giảng / dạy thay lớp này trong ngày sessionDate hay không
  const isTeacherAssignedToClass = useCallback(
    (cls: ExtracurricularClass, targetDate: string): boolean => {
      if (!cls) return false;
      const teacherId = resolvedTeacherId;
      const td = cls.term_distribution || ({} as any);

      // 1. Kiểm tra lịch phân công dạy thay trong ngày từ class_session_staff
      const override = sessionStaffOverrides.find(
        row => String(row.class_id) === String(cls.id) && row.session_date === targetDate
      );
      if (override && teacherId) {
        if (String(override.primary_teacher_id || '') === teacherId) return true;
        if (
          Array.isArray(override.assistant_teacher_ids) &&
          override.assistant_teacher_ids.map(String).includes(teacherId)
        ) {
          return true;
        }
      }

      // 2. Kiểm tra buổi dạy thực tế trong store.sessions hoặc store.teacherAttendance
      if (teacherId) {
        const hasSessionAsSubstitute = (activeStore.sessions || []).some(
          s =>
            s.class_id === cls.id &&
            s.session_date === targetDate &&
            s.actual_teacher_id === teacherId
        );
        if (hasSessionAsSubstitute) return true;

        const hasWorkSession = (activeStore.teacherAttendance || []).some(
          ta =>
            ta.class_id === cls.id &&
            ta.session_date === targetDate &&
            (ta.actual_teacher_id === teacherId || ta.assigned_teacher_id === teacherId)
        );
        if (hasWorkSession) return true;
      }

      // 3. Kiểm tra giáo viên chính & giáo viên phụ / trợ giảng 1, 2, 3
      if (teacherId) {
        if (
          cls.primary_teacher_id === teacherId ||
          cls.secondary_teacher_1 === teacherId ||
          cls.secondary_teacher_2 === teacherId ||
          cls.secondary_teacher_3 === teacherId ||
          td.secondary_teacher_1 === teacherId ||
          td.secondary_teacher_2 === teacherId ||
          td.secondary_teacher_3 === teacherId
        ) {
          return true;
        }
      }

      return false;
    },
    [resolvedTeacherId, sessionStaffOverrides, activeStore.sessions, activeStore.teacherAttendance]
  );

  // Danh sách lớp học được phép nhìn thấy theo vai trò (Giáo viên vs Quản sinh / Bảo mẫu)
  const roleScopedClasses = useMemo(() => {
    const activeClasses = (activeStore.classes || []).filter(c => c.status === 'active');

    if (!isSupervisorOrNanny) {
      // Đối với Giáo viên: chỉ hiển thị các lớp mà giáo viên đó phụ trách
      return activeClasses.filter(cls => isTeacherAssignedToClass(cls, sessionDate));
    }

    // Đối với Quản sinh & Bảo mẫu: hiển thị TẤT CẢ các lớp active thuộc phạm vi cơ sở của tài khoản
    return activeClasses.filter(cls => {
      if (effectiveCampusScope === 'all') return true;
      return normalizeCampusScope(cls.campus_id) === effectiveCampusScope;
    });
  }, [
    activeStore.classes,
    isSupervisorOrNanny,
    isTeacherAssignedToClass,
    sessionDate,
    effectiveCampusScope,
  ]);

  // Danh sách lớp học sau khi áp dụng bộ lọc Ngày / Ca học / Từ khóa tìm kiếm
  const filteredClasses = useMemo(() => {
    const q = classSearchQuery.trim().toLowerCase();

    const list = roleScopedClasses.filter(cls => {
      const scheduledToday = isClassScheduledOnDate(cls, sessionDate);
      if (isSupervisorOrNanny && onlyScheduledForDate && !scheduledToday) {
        return false;
      }

      const slot = (activeStore.timeSlots || []).find(ts => ts.id === cls.time_slot_id);
      const startTime = slot?.start_time || '';
      const endTime = slot?.end_time || '';
      const slotRange = `${startTime}-${endTime}`;
      const classDays = getClassDaysOfWeek(cls, activeStore.timeSlots);
      const isWeekendClass =
        Boolean((slot as any)?.is_weekend) ||
        slot?.slot_type === 'weekend' ||
        classDays.some(d => {
          const idx = parseDayTokenToWeekdayIndex(d);
          return idx === 0 || idx === 6;
        });

      // Lọc theo Ca học / Khung giờ
      if (timeSlotFilter !== 'all') {
        if (timeSlotFilter === 'slot_1615_1715') {
          if (!startTime.startsWith('16:15') && !slotRange.includes('16:15-17:15')) return false;
        } else if (timeSlotFilter === 'slot_1715_1815') {
          if (!startTime.startsWith('17:15') && !slotRange.includes('17:15-18:15')) return false;
        } else if (timeSlotFilter === 'weekend') {
          if (!isWeekendClass) return false;
        } else if (cls.time_slot_id !== timeSlotFilter) {
          return false;
        }
      }

      // Lọc theo từ khóa: Tên lớp, Mã lớp, Môn học hoặc Tên giáo viên đứng lớp
      if (q) {
        const subject = (activeStore.subjects || []).find(s => s.id === cls.subject_id);
        const primaryTeacher = (activeStore.teachers || []).find(
          t => t.id === cls.primary_teacher_id
        );
        const room = (activeStore.facilities || []).find(
          f => f.id === (cls.facility_id || cls.room_id)
        );
        const haystack = [
          cls.name,
          cls.code || '',
          subject?.name || '',
          subject?.code || '',
          primaryTeacher?.name || '',
          room?.name || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    // Sắp xếp: ưu tiên các lớp có lịch học trong ngày sessionDate lên đầu, sau đó theo giờ bắt đầu
    return [...list].sort((a, b) => {
      const aSched = isClassScheduledOnDate(a, sessionDate) ? 1 : 0;
      const bSched = isClassScheduledOnDate(b, sessionDate) ? 1 : 0;
      if (aSched !== bSched) return bSched - aSched;

      const slotA = (activeStore.timeSlots || []).find(ts => ts.id === a.time_slot_id);
      const slotB = (activeStore.timeSlots || []).find(ts => ts.id === b.time_slot_id);
      const timeCmp = String(slotA?.start_time || '16:15').localeCompare(
        String(slotB?.start_time || '16:15')
      );
      if (timeCmp !== 0) return timeCmp;
      return a.name.localeCompare(b.name, 'vi');
    });
  }, [
    roleScopedClasses,
    classSearchQuery,
    isClassScheduledOnDate,
    sessionDate,
    isSupervisorOrNanny,
    onlyScheduledForDate,
    activeStore.timeSlots,
    activeStore.subjects,
    activeStore.teachers,
    activeStore.facilities,
    timeSlotFilter,
  ]);

  // Tự động mở sẵn danh sách học sinh nếu Giáo viên chỉ có 1 lớp trong buổi/ngày đó (hoặc chỉ phụ trách 1 lớp)
  useEffect(() => {
    if (isSupervisorOrNanny) return;
    const classesScheduledToday = roleScopedClasses.filter(c =>
      isClassScheduledOnDate(c, sessionDate)
    );
    if (classesScheduledToday.length === 1) {
      setSelectedClassId(classesScheduledToday[0].id);
    } else if (roleScopedClasses.length === 1) {
      setSelectedClassId(roleScopedClasses[0].id);
    }
  }, [isSupervisorOrNanny, roleScopedClasses, isClassScheduledOnDate, sessionDate]);

  const selectedClass = useMemo(
    () => (activeStore.classes || []).find(c => c.id === selectedClassId) || null,
    [activeStore.classes, selectedClassId]
  );

  const selectedClassPhase = useMemo(
    () => (selectedClass ? getClassPhase(selectedClass, todayStr, activeStore.terms) : 'active'),
    [selectedClass, todayStr, activeStore.terms]
  );
  const selectedClassBounds = useMemo(
    () => (selectedClass ? getClassEffectiveBounds(selectedClass, activeStore.terms) : null),
    [selectedClass, activeStore.terms]
  );
  const isSelectedClassUpcoming = selectedClassPhase === 'upcoming';
  const isSelectedClassEnded = selectedClassPhase === 'ended';
  const isSelectedFutureDate = sessionDate > todayStr;
  const isAttendanceLocked = isSelectedClassUpcoming || isSelectedClassEnded || isSelectedFutureDate;

  // Lấy danh sách học sinh đang học (active / trial) của một lớp trong ngày sessionDate
  // Nếu lớp sắp bắt đầu (chưa tới start_date): trả về danh sách chỉ xem để nhân sự kiểm tra sĩ số
  const getClassEnrolledStudentsForDate = useCallback(
    (cls: ExtracurricularClass | null, targetDate: string): Student[] => {
      if (!cls) return [];
      const classDays = getClassDaysOfWeek(cls, activeStore.timeSlots);
      const clsPhase = getClassPhase(cls, todayStr, activeStore.terms);
      const enrollments = (activeStore.enrollments || []).filter(
        e =>
          e.class_id === cls.id &&
          (e.status === 'active' || e.status === 'trial') &&
          (clsPhase === 'upcoming' ||
            isStudentScheduledForDate(e, targetDate, classDays, cls, activeStore.terms))
      );
      const studentMap = new Map((activeStore.students || []).map(s => [s.id, s]));
      const result: Student[] = [];
      const seen = new Set<string>();
      for (const enr of enrollments) {
        if (seen.has(enr.student_id)) continue;
        const st = studentMap.get(enr.student_id);
        if (st && st.status !== 'dropped') {
          seen.add(st.id);
          result.push(st);
        }
      }
      return sortByLabelVi(result, s => s.name);
    },
    [activeStore.enrollments, activeStore.students, activeStore.timeSlots, activeStore.terms, todayStr]
  );

  const selectedClassStudents = useMemo(
    () => getClassEnrolledStudentsForDate(selectedClass, sessionDate),
    [getClassEnrolledStudentsForDate, selectedClass, sessionDate]
  );

  const allAttendanceRecords = useMemo(
    () => activeStore.attendance || activeStore.attendanceRecords || [],
    [activeStore.attendance, activeStore.attendanceRecords]
  );

  // Khởi tạo / đồng bộ trạng thái điểm danh khi chọn lớp hoặc đổi ngày
  useEffect(() => {
    if (!selectedClass) return;
    const nextMap: Record<string, { status: PortalAttendanceStatus; note: string }> = {};
    for (const st of selectedClassStudents) {
      const existing = allAttendanceRecords.find(
        a =>
          a.class_id === selectedClass.id &&
          a.session_date === sessionDate &&
          a.student_id === st.id
      );
      if (existing) {
        const rawStatus = String(existing.status || 'present');
        const normalizedStatus: PortalAttendanceStatus =
          rawStatus === 'absent_excused' || rawStatus === 'excused'
            ? 'absent_excused'
            : rawStatus === 'absent_unexcused' || rawStatus === 'absent'
            ? 'absent_unexcused'
            : 'present';
        nextMap[st.id] = {
          status: normalizedStatus,
          note: existing.note || '',
        };
      } else {
        nextMap[st.id] = {
          status: 'present',
          note: '',
        };
      }
    }
    setAttendanceState(nextMap);

    const existingSession = (activeStore.sessions || []).find(
      s => s.class_id === selectedClass.id && s.session_date === sessionDate
    );
    setSessionGeneralNote(existingSession?.session_note || '');
    setLastSavedAtText(null);
  }, [selectedClass?.id, sessionDate, selectedClassStudents.length]);

  const handleSetStudentStatus = (studentId: string, status: PortalAttendanceStatus) => {
    if (isAttendanceLocked) return;
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        note: prev[studentId]?.note || '',
        status,
      },
    }));
  };

  const handleSetStudentNote = (studentId: string, note: string) => {
    if (isAttendanceLocked) return;
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        status: prev[studentId]?.status || 'present',
        note,
      },
    }));
  };

  const handleMarkAllPresent = () => {
    if (isAttendanceLocked) return;
    const nextMap: Record<string, { status: PortalAttendanceStatus; note: string }> = {};
    for (const st of selectedClassStudents) {
      nextMap[st.id] = {
        status: 'present',
        note: attendanceState[st.id]?.note || '',
      };
    }
    setAttendanceState(nextMap);
    showToast(`✓ Đã đánh dấu Có mặt toàn bộ ${selectedClassStudents.length} học sinh!`, 'info');
  };

  const attendanceCounts = useMemo(() => {
    let present = 0;
    let excused = 0;
    let absent = 0;
    for (const st of selectedClassStudents) {
      const status = attendanceState[st.id]?.status || 'present';
      if (status === 'present') present += 1;
      else if (status === 'absent_excused') excused += 1;
      else absent += 1;
    }
    return {
      total: selectedClassStudents.length,
      present,
      excused,
      absent,
    };
  }, [selectedClassStudents, attendanceState]);

  // Lưu Điểm Danh: Cập nhật store.attendance, store.attendanceRecords, store.sessions, audit_logs & Supabase
  const handleSaveAttendance = async () => {
    if (!selectedClass) return;
    if (isSelectedClassUpcoming) {
      showToast(
        `Lớp bắt đầu từ ${formatDateVN(selectedClassBounds?.startDate)}, chưa thể điểm danh.`,
        'warning'
      );
      return;
    }
    if (isSelectedClassEnded) {
      showToast(
        `Lớp đã kết thúc (${formatDateVN(selectedClassBounds?.endDate)}), chỉ xem lịch sử.`,
        'warning'
      );
      return;
    }
    if (isSelectedFutureDate) {
      showToast('Không thể lưu điểm danh cho ngày trong tương lai.', 'warning');
      return;
    }
    if (selectedClassStudents.length === 0) {
      showToast('Lớp học chưa có học sinh đang học để lưu điểm danh.', 'warning');
      return;
    }

    setIsSavingAttendance(true);
    const nowIso = new Date().toISOString();

    try {
      const existingSession = (activeStore.sessions || []).find(
        s => s.class_id === selectedClass.id && s.session_date === sessionDate
      );
      const classExistingSessionsCount = (activeStore.sessions || []).filter(
        s => s.class_id === selectedClass.id && s.session_date !== sessionDate
      ).length;

      const sessionId =
        existingSession?.id || `ses_${selectedClass.id}_${sessionDate.replace(/-/g, '')}`;

      // Tính suất bánh sữa cho học sinh Royal
      const royalStudents = selectedClassStudents.filter(s => s.is_royal_student);
      let consumed = 0;
      let returned = 0;
      for (const s of royalStudents) {
        const st = attendanceState[s.id]?.status || 'present';
        if (st === 'absent_excused') returned += 1;
        else consumed += 1;
      }

      const newSessionRecord: ClassSession = {
        ...(existingSession || {}),
        id: sessionId,
        class_id: selectedClass.id,
        term_id: selectedClass.term_id,
        session_date: sessionDate,
        session_number: existingSession?.session_number || classExistingSessionsCount + 1,
        actual_teacher_id:
          (!isSupervisorOrNanny && resolvedTeacherId) ||
          existingSession?.actual_teacher_id ||
          selectedClass.primary_teacher_id,
        is_substitute: Boolean(
          !isSupervisorOrNanny &&
            resolvedTeacherId &&
            resolvedTeacherId !== selectedClass.primary_teacher_id
        ),
        snacks_allocated: royalStudents.length,
        snacks_consumed: consumed,
        snacks_returned: returned,
        status: 'completed',
        recorded_by: currentUser.id,
        recorded_by_role: staffKind,
        session_note: sessionGeneralNote.trim() || undefined,
      };

      const newAttendanceRows: AttendanceRecord[] = selectedClassStudents.map((st, idx) => {
        const prevRow = allAttendanceRecords.find(
          a =>
            a.class_id === selectedClass.id &&
            a.session_date === sessionDate &&
            a.student_id === st.id
        );
        const studentNote = (attendanceState[st.id]?.note || '').trim();
        const combinedNote =
          studentNote && sessionGeneralNote.trim()
            ? `${studentNote} (${sessionGeneralNote.trim()})`
            : studentNote || sessionGeneralNote.trim() || '';

        return {
          ...(prevRow || {}),
          id:
            prevRow?.id ||
            `att_${selectedClass.id}_${sessionDate.replace(/-/g, '')}_${st.id}_${idx}`,
          session_id: sessionId,
          class_id: selectedClass.id,
          student_id: st.id,
          session_date: sessionDate,
          status: attendanceState[st.id]?.status || 'present',
          note: combinedNote,
          uploaded_by: `${currentUser.full_name} (${roleBadgeLabel})`,
          uploaded_at: nowIso,
          recorded_by: currentUser.id,
          recorded_by_role: staffKind,
        };
      });

      const auditLog = createAuditRecord(
        'ATTENDANCE_SAVE',
        'ACADEMIC',
        `Điểm Danh Lớp Học (${roleBadgeLabel})`,
        `${currentUser.full_name} (${roleBadgeLabel}) đã điểm danh lớp ${selectedClass.name} ngày ${formatDateYmdToVnShort(
          sessionDate
        )}: Có mặt ${attendanceCounts.present}/${attendanceCounts.total} HS (Có phép: ${
          attendanceCounts.excused
        }, Không phép: ${attendanceCounts.absent}).`,
        currentUser,
        {
          target_id: selectedClass.code || selectedClass.id,
          details: {
            status: 'success',
            class_id: selectedClass.id,
            class_name: selectedClass.name,
            session_date: sessionDate,
            recorded_by: currentUser.id,
            recorded_by_role: staffKind,
            summary: attendanceCounts,
            session_note: sessionGeneralNote.trim() || undefined,
          },
        }
      );

      handleStoreUpdate(prev => {
        const prevAtt = prev.attendance || prev.attendanceRecords || [];
        const remainingAtt = prevAtt.filter(
          a => !(a.class_id === selectedClass.id && a.session_date === sessionDate)
        );
        const updatedAtt = [...remainingAtt, ...newAttendanceRows];

        const remainingSessions = (prev.sessions || []).filter(
          s => !(s.class_id === selectedClass.id && s.session_date === sessionDate)
        );
        const updatedSessions = [...remainingSessions, newSessionRecord];

        const nextWithAudit = appendAuditLog(
          {
            ...prev,
            sessions: updatedSessions,
            attendance: updatedAtt,
            attendanceRecords: updatedAtt,
          },
          auditLog
        );
        return nextWithAudit;
      });

      // Đồng bộ trực tiếp lên bảng attendance_records trên Supabase để đảm bảo lưu tức thì
      if (supabase) {
        const dbPayload = newAttendanceRows.map(a => ({
          id: a.id,
          session_id: a.session_id || '',
          class_id: a.class_id,
          student_id: a.student_id,
          session_date: a.session_date,
          status: a.status,
          note: a.note || '',
          uploaded_by: a.uploaded_by || a.recorded_by || currentUser.id,
          uploaded_at: a.uploaded_at || nowIso,
        }));
        await supabase.from('attendance_records').upsert(dbPayload, { onConflict: 'id' });
      }

      setLastSavedAtText(formatVnTimeHms(Date.now() + serverOffsetMs));
      showToast(
        `✓ Đã lưu điểm danh lớp ${selectedClass.name} (${attendanceCounts.present}/${attendanceCounts.total} có mặt)!`,
        'success'
      );
    } catch (err: any) {
      showToast(
        `Đã lưu điểm danh cục bộ. Đồng bộ đám mây sẽ tự động thử lại (${err?.message || 'Offline'}).`,
        'info'
      );
    } finally {
      setIsSavingAttendance(false);
    }
  };

  // Thông số vòng tròn đếm ngược SVG
  const circleRadius = 22;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const progressRatio = Math.min(1, Math.max(0, remainingSec / totalTtlSec));
  const strokeDashoffset = circleCircumference * (1 - progressRatio);

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col justify-between font-sans tracking-[-0.011em] antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* Hiệu ứng ánh sáng nền */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.10),transparent_65%)]" />

      <div
        className={`relative z-10 w-full mx-auto px-3.5 sm:px-4 pt-3.5 pb-8 space-y-3.5 transition-all ${
          activeTab === 'attendance' ? 'max-w-2xl' : 'max-w-md'
        }`}
      >
        {/* Header Cổng Nhân Sự Lớp Học */}
        <header className="flex items-center justify-between gap-2.5 rounded-2xl bg-[#111827]/95 border border-slate-800/90 px-3.5 py-3 shadow-lg">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              {activeTab === 'qr' ? (
                <QrCode className="w-5 h-5" />
              ) : (
                <ClipboardCheck className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                  ROYAL SCHOOL • {roleBadgeLabel}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-bold text-cyan-300">
                  {campusDisplayLabel}
                </span>
              </div>
              <h1 className="text-sm font-extrabold text-white truncate">
                {staffDisplayName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenChangePassword && (
              <button
                type="button"
                onClick={onOpenChangePassword}
                title="Đổi mật khẩu"
                className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/70 transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-extrabold transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </header>

        {/* Thanh Chuyển Tab (2 Chức năng chính: Thẻ QR Check-in & Điểm Danh Lớp Học) */}
        <nav
          aria-label="Điều hướng Cổng Nhân Sự Lớp Học"
          className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[#111827]/95 border border-slate-800 shadow-md"
        >
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'qr'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span>Thẻ QR Check-in</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'attendance'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span>Điểm Danh Lớp Học</span>
            {roleScopedClasses.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-black ${
                  activeTab === 'attendance'
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {roleScopedClasses.filter(c => isClassScheduledOnDate(c, sessionDate)).length ||
                  roleScopedClasses.length}
              </span>
            )}
          </button>
        </nav>

        {/* ==========================================================================
            TAB 1: THẺ QR CHECK-IN CA DẠY / CA TRỰC
           ========================================================================== */}
        {activeTab === 'qr' && (
          <>
            {/* Banner hướng dẫn */}
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-300 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-amber-200 leading-snug">
                Đưa mã này cho nhân viên Học vụ quét tại cơ sở
              </p>
            </div>

            {/* Khung Thẻ QR Check-in (Nền trắng sáng giúp máy quét đọc nhanh & chống chụp màn hình) */}
            <section className="rounded-3xl bg-white text-slate-900 p-5 sm:p-6 shadow-2xl border-4 border-amber-400/90 space-y-4">
              {/* Thông tin Nhân sự & Đồng hồ Server chạy từng giây */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3.5">
                <div className="min-w-0 space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-[10px] font-black uppercase tracking-wider text-amber-900">
                    <span>{roleBadgeLabel}</span>
                  </div>
                  <div className="text-base sm:text-lg font-black text-slate-900 truncate">
                    {staffDisplayName}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-300 text-[11px] font-mono font-extrabold text-slate-800">
                      <span>{staffKind === 'teacher' ? 'Mã GV:' : 'Mã NS:'}</span>
                      <span className="text-amber-700">{staffDisplayCode}</span>
                    </div>
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 border border-sky-200 text-[11px] font-bold text-sky-800">
                      <MapPin className="w-3 h-3 text-sky-600" />
                      <span>{campusDisplayLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Đồng hồ Server (HH:mm:ss) chạy từng giây để phát hiện ảnh chụp màn hình */}
                <div className="text-right shrink-0 bg-slate-900 text-white px-3 py-2 rounded-2xl shadow-inner">
                  <div className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    <Clock className="w-3 h-3 animate-pulse" />
                    <span>Giờ máy chủ</span>
                  </div>
                  <div className="text-base sm:text-lg font-mono font-black tracking-wider text-white">
                    {formatVnTimeHms(nowServerMs)}
                  </div>
                  <div className="text-[10px] text-slate-300 font-medium">
                    {formatVnDateYmd(nowServerMs)}
                  </div>
                </div>
              </div>

              {/* Vùng hiển thị mã QR hoặc thông báo Mất kết nối khi hết hạn */}
              <div className="flex flex-col items-center justify-center py-2">
                {isQrValidAndUnexpired && qrData ? (
                  <div className="flex flex-col items-center space-y-4 w-full">
                    {/* Khung QR nền trắng, viền trắng rộng, kích thước >= 260px, mức sửa lỗi M */}
                    <div className="p-4 sm:p-5 bg-white rounded-3xl border-2 border-slate-200 shadow-sm flex items-center justify-center">
                      <QRCodeSVG
                        value={qrData.token}
                        size={268}
                        level="M"
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                        includeMargin={true}
                      />
                    </div>

                    {/* Vòng đếm ngược theo đồng hồ server & nút làm mới */}
                    <div className="w-full flex items-center justify-between gap-3 bg-slate-100 rounded-2xl px-4 py-2.5 border border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="relative w-13 h-13 flex items-center justify-center shrink-0">
                          <svg className="w-13 h-13 -rotate-90" viewBox="0 0 52 52">
                            <circle
                              cx="26"
                              cy="26"
                              r={circleRadius}
                              fill="none"
                              stroke="#E2E8F0"
                              strokeWidth="4.5"
                            />
                            <circle
                              cx="26"
                              cy="26"
                              r={circleRadius}
                              fill="none"
                              stroke={remainingSec <= 15 ? '#F43F5E' : '#F59E0B'}
                              strokeWidth="4.5"
                              strokeLinecap="round"
                              strokeDasharray={circleCircumference}
                              strokeDashoffset={strokeDashoffset}
                              className="transition-all duration-500"
                            />
                          </svg>
                          <span
                            className={`absolute text-xs font-mono font-black ${
                              remainingSec <= 15 ? 'text-rose-600' : 'text-slate-900'
                            }`}
                          >
                            {remainingSec}s
                          </span>
                        </div>
                        <div>
                          <div className="text-xs font-extrabold text-slate-800">
                            Mã QR tự động đổi mới
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Hiệu lực còn lại:{' '}
                            <strong className="text-slate-800">{remainingSec} giây</strong>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => fetchCheckinQr()}
                        disabled={isLoadingQr}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-extrabold transition-all shrink-0 cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isLoadingQr ? 'animate-spin' : ''}`}
                        />
                        <span>Làm mới</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Khi mã hết hạn mà chưa lấy được mã mới: ẨN QR tuyệt đối, hiện "Mất kết nối, đang thử lại" */
                  <div className="w-full min-h-[288px] rounded-3xl bg-slate-100 border-2 border-dashed border-rose-300 p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                      <WifiOff className="w-7 h-7 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-base font-black text-slate-900">
                        Mất kết nối, đang thử lại
                      </h2>
                      <p className="text-xs text-slate-600 max-w-xs">
                        {qrError ||
                          'Mã QR phiên trước đã hết hạn. Hệ thống đang tự động lấy mã QR mới từ máy chủ...'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fetchCheckinQr()}
                      disabled={isLoadingQr}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-black transition-all shadow-md cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingQr ? 'animate-spin' : ''}`} />
                      <span>{isLoadingQr ? 'Đang kết nối...' : 'Thử lại ngay'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Gợi ý tăng độ sáng màn hình & trạng thái giữ sáng */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 text-[11px] text-slate-600 font-semibold">
                <div className="flex items-center gap-1.5">
                  <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Gợi ý: Tăng độ sáng màn hình tối đa khi quét</span>
                </div>
                {wakeLockActive && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold shrink-0">
                    <Sparkles className="w-3 h-3" />
                    Giữ sáng màn hình
                  </span>
                )}
              </div>
            </section>

            {/* Nút chuyển nhanh sang Tab Điểm Danh Lớp Học */}
            <button
              type="button"
              onClick={() => setActiveTab('attendance')}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-500/15 to-emerald-500/15 hover:from-amber-500/30 hover:to-emerald-500/25 border border-amber-500/40 text-amber-200 text-xs font-extrabold flex items-center justify-between gap-3 transition-all shadow-lg cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                  <ClipboardCheck className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-extrabold text-white">
                    Chuyển sang Điểm Danh Lớp Học
                  </div>
                  <div className="text-[11px] text-amber-300/90 font-medium">
                    {isSupervisorOrNanny
                      ? `Theo dõi & điểm danh toàn bộ lớp tại ${campusDisplayLabel}`
                      : `Điểm danh các lớp bạn phụ trách trong ngày`}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
            </button>

            {/* Danh sách: "Hôm nay bạn đã check in" */}
            <section className="rounded-3xl bg-[#111827]/95 border border-slate-800 p-4 sm:p-5 space-y-3 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <CalendarCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-white">
                      Hôm nay bạn đã check in
                    </h2>
                    <p className="text-[11px] text-slate-400 capitalize">
                      {formatVnDateDisplay(nowServerMs)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fetchTodayCheckins(todayStr)}
                  disabled={isLoadingCheckins}
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/70 transition-colors cursor-pointer"
                  title="Làm mới danh sách check-in"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isLoadingCheckins ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>

              {todayCheckins.length === 0 ? (
                <div className="rounded-2xl bg-slate-900/80 border border-slate-800/90 p-5 text-center space-y-1.5">
                  <Clock className="w-6 h-6 text-slate-500 mx-auto" />
                  <div className="text-xs font-bold text-slate-300">
                    Chưa có lượt check-in nào trong ngày hôm nay
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Sau khi nhân viên Học vụ quét mã QR, trạng thái vào lớp sẽ hiển thị tức thì tại đây.
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {todayCheckins.map(item => {
                    const isLate = item.status === 'late';
                    const isNoClass = item.status === 'no_class';
                    const lateMin = Number(item.late_minutes || 0);
                    const matchedCls = (activeStore.classes || []).find(
                      c => c.id === item.class_id
                    );

                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-white truncate">
                              {isNoClass
                                ? 'Check-in tại cơ sở (Ca trực / Không có lịch lớp)'
                                : `Lớp: ${matchedCls?.name || item.class_id || 'Đã ghi nhận'}`}
                            </span>
                            {item.scheduled_start && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px] font-bold">
                                Ca {item.scheduled_start}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span>
                              Giờ vào:{' '}
                              <strong className="font-mono text-slate-200">
                                {formatCheckinTime(item.checked_in_at)}
                              </strong>
                            </span>
                            {item.scanner_name && (
                              <span>• Xác nhận: {item.scanner_name}</span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isNoClass ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-extrabold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Đã ghi nhận</span>
                            </span>
                          ) : isLate ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-extrabold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Trễ {lateMin} phút</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-extrabold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Đúng giờ</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* ==========================================================================
            TAB 2: ĐIỂM DANH LỚP HỌC (THEO VAI TRÒ GIÁO VIÊN / BẢO MẪU / QUẢN SINH)
           ========================================================================== */}
        {activeTab === 'attendance' && (
          <div className="space-y-3.5">
            {/* Thanh chọn ngày & thông tin phạm vi phân quyền */}
            <section className="rounded-3xl bg-[#111827]/95 border border-slate-800 p-4 space-y-3 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-extrabold text-white">
                        Sổ Điểm Danh Lớp Học
                      </h2>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-extrabold text-amber-300">
                        {getWeekdayLabelVN(sessionDate)} • {formatDateYmdToVnShort(sessionDate)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {isSupervisorOrNanny
                        ? `Quản sinh / Bảo mẫu (${campusDisplayLabel}): Xem & điểm danh tất cả lớp hoạt động trong ca`
                        : `Giáo viên (${staffDisplayName}): Chỉ hiển thị các lớp thầy/cô phụ trách`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-40">
                    <DatePickerVN
                      value={sessionDate}
                      onChange={val => setSessionDate(val)}
                      className="bg-slate-950 font-bold text-xs"
                      placeholder="DD/MM/YYYY"
                    />
                  </div>
                  {sessionDate !== todayStr && (
                    <button
                      type="button"
                      onClick={() => setSessionDate(todayStr)}
                      className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-extrabold shrink-0 cursor-pointer"
                    >
                      Hôm nay
                    </button>
                  )}
                </div>
              </div>

              {/* Bộ lọc nhanh dành cho Quản sinh / Bảo mẫu (hoặc Giáo viên có nhiều lớp) */}
              {(isSupervisorOrNanny || roleScopedClasses.length > 1) && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    {/* Lọc theo Ca học / Khung giờ */}
                    <div className="sm:col-span-5 relative">
                      <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        value={timeSlotFilter}
                        onChange={e => setTimeSlotFilter(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="all">Tất cả ca hôm nay</option>
                        {sortByLabelVi(
                          [
                            { value: 'slot_1615_1715', label: 'Ca chiều 16:15 - 17:15' },
                            { value: 'slot_1715_1815', label: 'Ca chiều 17:15 - 18:15' },
                            { value: 'weekend', label: 'Ca cuối tuần (T7 / CN)' },
                            ...(activeStore.timeSlots || []).map(ts => ({
                              value: ts.id,
                              label: `${ts.name} (${ts.start_time} - ${ts.end_time})`,
                            })),
                          ],
                          x => x.label
                        ).map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Tìm kiếm theo Tên lớp, Môn học hoặc Tên GV đứng lớp */}
                    <div className="sm:col-span-7 relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={classSearchQuery}
                        onChange={e => setClassSearchQuery(e.target.value)}
                        placeholder="Tìm theo tên lớp, môn học hoặc tên giáo viên..."
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {isSupervisorOrNanny && (
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-400">
                        Hiển thị <strong className="text-amber-300">{filteredClasses.length}</strong> lớp
                        {onlyScheduledForDate ? ' có lịch học ngày này' : ' đang hoạt động'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOnlyScheduledForDate(prev => !prev)}
                        className={`px-2.5 py-1 rounded-lg border font-bold transition-colors cursor-pointer ${
                          onlyScheduledForDate
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        {onlyScheduledForDate
                          ? '✓ Chỉ lớp có lịch ngày này'
                          : 'Xem tất cả lớp đang mở'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* NẾU CHƯA CHỌN LỚP -> HIỂN THỊ DANH SÁCH THẺ LỚP HỌC */}
            {!selectedClass ? (
              <section className="space-y-2.5">
                {filteredClasses.length === 0 ? (
                  <div className="rounded-3xl bg-[#111827]/95 border border-slate-800 p-6 text-center space-y-2 shadow-xl">
                    <BookOpen className="w-8 h-8 text-slate-500 mx-auto" />
                    <div className="text-sm font-extrabold text-white">
                      {isSupervisorOrNanny
                        ? 'Không có lớp học nào khớp bộ lọc trong ngày này'
                        : 'Bạn chưa có lớp học nào được phân công'}
                    </div>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      {isSupervisorOrNanny
                        ? 'Hãy thử chuyển bộ lọc sang "Xem tất cả lớp đang mở" hoặc chọn ngày học khác.'
                        : 'Nếu bạn dạy thay hoặc mới được phân công lớp, vui lòng liên hệ bộ phận Học vụ để cập nhật phân công.'}
                    </p>
                    {isSupervisorOrNanny && onlyScheduledForDate && (
                      <button
                        type="button"
                        onClick={() => setOnlyScheduledForDate(false)}
                        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold cursor-pointer"
                      >
                        <span>Xem toàn bộ lớp đang hoạt động</span>
                      </button>
                    )}
                  </div>
                ) : (
                  filteredClasses.map(cls => {
                    const subject = (activeStore.subjects || []).find(
                      s => s.id === cls.subject_id
                    );
                    const slot = (activeStore.timeSlots || []).find(
                      ts => ts.id === cls.time_slot_id
                    );
                    const facility = (activeStore.facilities || []).find(
                      f => f.id === (cls.facility_id || cls.room_id)
                    );
                    const primaryTeacher = (activeStore.teachers || []).find(
                      t => t.id === cls.primary_teacher_id
                    );
                    const classStudents = getClassEnrolledStudentsForDate(cls, sessionDate);
                    const totalCount = classStudents.length;
                    const recordedForClass = allAttendanceRecords.filter(
                      a => a.class_id === cls.id && a.session_date === sessionDate
                    );
                    const recordedStudentIds = new Set(
                      recordedForClass.map(a => a.student_id)
                    );
                    const attendedCount = classStudents.filter(s =>
                      recordedStudentIds.has(s.id)
                    ).length;
                    const isCompleted =
                      totalCount > 0 && attendedCount >= totalCount;
                    const isScheduledToday = isClassScheduledOnDate(cls, sessionDate);
                    const classDays = getClassDaysOfWeek(cls, activeStore.timeSlots);
                    const clsPhase = getClassPhase(cls, todayStr, activeStore.terms);

                    return (
                      <div
                        key={cls.id}
                        onClick={() => setSelectedClassId(cls.id)}
                        className="rounded-3xl bg-[#111827]/95 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 p-4 transition-all shadow-lg cursor-pointer space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono font-extrabold text-amber-300">
                                {cls.code || cls.id}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                clsPhase === 'upcoming'
                                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                  : clsPhase === 'ended'
                                  ? 'bg-slate-800 text-slate-400 border-slate-700'
                                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}>
                                {clsPhase === 'upcoming' ? 'Sắp bắt đầu' : clsPhase === 'ended' ? 'Đã kết thúc' : 'Đang học'}
                              </span>
                              {subject && (
                                <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-[10px] font-bold text-sky-300">
                                  {subject.name}
                                </span>
                              )}
                              {isScheduledToday && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                                  Có lịch hôm nay
                                </span>
                              )}
                            </div>

                            <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                              {cls.name}
                            </h3>
                          </div>

                          <div className="shrink-0 text-right">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-extrabold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Hoàn thành</span>
                              </span>
                            ) : attendedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[11px] font-extrabold">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Đang điểm danh</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-extrabold">
                                <ClipboardCheck className="w-3.5 h-3.5" />
                                <span>Chưa điểm danh</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300 bg-slate-950/70 rounded-2xl p-3 border border-slate-800/80">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">
                              {slot
                                ? `${slot.start_time} - ${slot.end_time}`
                                : '16:15 - 17:15'}{' '}
                              {classDays.length > 0 ? `(${classDays.join(', ')})` : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="truncate">
                              {facility?.name || 'Chưa xếp phòng'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate">
                              GV: <strong>{primaryTeacher?.name || 'Chưa phân công'}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <div className="flex items-center gap-2 text-xs">
                            <Users className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-300 font-semibold">
                              Đã điểm danh:{' '}
                              <strong className="text-white font-mono">
                                {attendedCount}/{totalCount}
                              </strong>{' '}
                              HS
                            </span>
                          </div>

                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-amber-400">
                            <span>Mở sổ điểm danh</span>
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </section>
            ) : (
              /* ==========================================================================
                 MÀN HÌNH CHI TIẾT ĐIỂM DANH HỌC SINH CỦA LỚP ĐANG CHỌN
                 ========================================================================== */
              <section className="rounded-3xl bg-[#111827]/95 border border-slate-800 p-4 sm:p-5 space-y-4 shadow-2xl">
                {/* Thanh tiêu đề lớp & nút quay lại danh sách lớp */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(isSupervisorOrNanny || roleScopedClasses.length > 1) && (
                        <button
                          type="button"
                          onClick={() => setSelectedClassId(null)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-extrabold border border-slate-700 transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>Danh sách lớp ({filteredClasses.length})</span>
                        </button>
                      )}
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono font-extrabold text-amber-300">
                        {selectedClass.code || selectedClass.id}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
                      {selectedClass.name}
                    </h3>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400">
                      <span>
                        GV chính:{' '}
                        <strong className="text-slate-200">
                          {(activeStore.teachers || []).find(
                            t => t.id === selectedClass.primary_teacher_id
                          )?.name || 'Chưa phân công'}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Phòng:{' '}
                        <strong className="text-slate-200">
                          {(activeStore.facilities || []).find(
                            f => f.id === (selectedClass.facility_id || selectedClass.room_id)
                          )?.name || 'Chưa xếp phòng'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Nút Điểm danh tất cả Có mặt */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleMarkAllPresent}
                      disabled={isAttendanceLocked || selectedClassStudents.length === 0}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/30 text-emerald-300 text-xs font-extrabold transition-all cursor-pointer"
                    >
                      <CheckCheck className="w-4 h-4" />
                      <span>Điểm danh tất cả Có mặt</span>
                    </button>
                  </div>
                </div>

                {isSelectedClassUpcoming && (
                  <div className="p-3 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-200 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-sky-300 shrink-0" />
                    <span>
                      Lớp bắt đầu từ {formatDateVN(selectedClassBounds?.startDate)}, chưa thể điểm danh. Danh sách bên dưới chỉ hiển thị để kiểm tra sĩ số.
                    </span>
                  </div>
                )}

                {!isSelectedClassUpcoming && isSelectedClassEnded && (
                  <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-slate-300 shrink-0" />
                    <span>
                      Lớp đã kết thúc ({formatDateVN(selectedClassBounds?.endDate)}) — chỉ xem lịch sử điểm danh.
                    </span>
                  </div>
                )}

                {!isSelectedClassUpcoming && !isSelectedClassEnded && isSelectedFutureDate && (
                  <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      Không thể điểm danh cho ngày trong tương lai ({formatDateVN(sessionDate)}).
                    </span>
                  </div>
                )}

                {/* Thống kê nhanh sĩ số buổi học */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Sĩ số</div>
                    <div className="text-sm sm:text-base font-mono font-black text-white">
                      {attendanceCounts.total}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <div className="text-[10px] text-emerald-300 font-bold uppercase">Có mặt</div>
                    <div className="text-sm sm:text-base font-mono font-black text-emerald-400">
                      {attendanceCounts.present}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <div className="text-[10px] text-amber-300 font-bold uppercase">Có phép</div>
                    <div className="text-sm sm:text-base font-mono font-black text-amber-400">
                      {attendanceCounts.excused}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                    <div className="text-[10px] text-rose-300 font-bold uppercase">Không phép</div>
                    <div className="text-sm sm:text-base font-mono font-black text-rose-400">
                      {attendanceCounts.absent}
                    </div>
                  </div>
                </div>

                {lastSavedAtText && (
                  <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Đã lưu điểm danh lúc {lastSavedAtText} — Người thực hiện:{' '}
                      {currentUser.full_name} ({roleBadgeLabel})
                    </span>
                  </div>
                )}

                {/* Danh sách học sinh trong lớp */}
                {selectedClassStudents.length === 0 ? (
                  <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 text-center space-y-1.5">
                    <Users className="w-7 h-7 text-slate-500 mx-auto" />
                    <div className="text-xs font-bold text-slate-300">
                      Chưa có học sinh đang học trong lớp này vào ngày đã chọn
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedClassStudents.map((student, idx) => {
                      const st = attendanceState[student.id]?.status || 'present';
                      const note = attendanceState[student.id]?.note || '';
                      const enr = (activeStore.enrollments || []).find(
                        e => e.student_id === student.id && e.class_id === selectedClass.id
                      );
                      const isTrial = enr?.status === 'trial';

                      return (
                        <div
                          key={student.id}
                          className="p-3.5 rounded-2xl bg-slate-900/95 border border-slate-800 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs text-slate-400 font-bold">
                                  {idx + 1}.
                                </span>
                                <span className="font-extrabold text-white text-sm">
                                  {student.name}
                                </span>
                                <span className="font-mono text-[11px] text-amber-400 font-bold">
                                  ({student.code})
                                </span>

                                {student.is_royal_student ? (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                                    <Coffee className="w-3 h-3" />
                                    <span>Royal</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold">
                                    Ngoài trường
                                  </span>
                                )}

                                {isSelectedClassUpcoming && (
                                  <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                                    Sắp bắt đầu – {formatDateVN(enr?.joined_date || selectedClassBounds?.startDate)}
                                  </span>
                                )}
                                {isTrial && (
                                  <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold inline-flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" />
                                    <span>Học thử</span>
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-400">
                                {(student.regular_class || student.grade) && (
                                  <span>
                                    Lớp chính khóa:{' '}
                                    <strong className="text-slate-200">
                                      {student.regular_class || student.grade}
                                    </strong>
                                  </span>
                                )}
                                {student.parent_phone && (
                                  <a
                                    href={`tel:${student.parent_phone}`}
                                    className="inline-flex items-center gap-1 text-amber-300 hover:underline font-semibold"
                                  >
                                    <Phone className="w-3 h-3" />
                                    <span>
                                      PH: {student.parent_phone}
                                      {student.parent_name ? ` (${student.parent_name})` : ''}
                                    </span>
                                  </a>
                                )}
                              </div>

                              {/* Cảnh báo Y tế / Dị ứng */}
                              {student.medical_notes && (
                                <div className="mt-1.5 p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-start gap-1.5 text-xs text-rose-300">
                                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                  <div>
                                    <strong>Cảnh báo Y tế / Dị ứng: </strong>
                                    <span>{student.medical_notes}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 3 Nút Trạng Thái Điểm Danh tối ưu chạm trên di động */}
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled={isAttendanceLocked}
                              onClick={() => handleSetStudentStatus(student.id, 'present')}
                              className={`py-2.5 px-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                                st === 'present'
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Có mặt</span>
                            </button>

                            <button
                              type="button"
                              disabled={isAttendanceLocked}
                              onClick={() => handleSetStudentStatus(student.id, 'absent_excused')}
                              className={`py-2.5 px-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                                st === 'absent_excused'
                                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>Vắng có phép</span>
                            </button>

                            <button
                              type="button"
                              disabled={isAttendanceLocked}
                              onClick={() =>
                                handleSetStudentStatus(student.id, 'absent_unexcused')
                              }
                              className={`py-2.5 px-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                                st === 'absent_unexcused'
                                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>Không phép</span>
                            </button>
                          </div>

                          {/* Ghi chú từng học sinh */}
                          <input
                            type="text"
                            disabled={isAttendanceLocked}
                            value={note}
                            onChange={e => handleSetStudentNote(student.id, e.target.value)}
                            placeholder="Ghi chú học sinh (VD: Phụ huynh xin nghỉ ốm, đón muộn...)"
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-40"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Ghi chú chung buổi học & Nút Lưu Điểm Danh */}
                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Ghi chú chung buổi học (tùy chọn):
                    </label>
                    <input
                      type="text"
                      disabled={isAttendanceLocked}
                      value={sessionGeneralNote}
                      onChange={e => setSessionGeneralNote(e.target.value)}
                      placeholder="Nhập nhận xét buổi học, tình hình lớp hoặc bàn giao ca..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-40"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveAttendance}
                    disabled={isAttendanceLocked || isSavingAttendance || selectedClassStudents.length === 0}
                    className="w-full py-3.5 px-5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-sm font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-amber-500/20 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>
                      {isSelectedClassUpcoming
                        ? `Chưa thể điểm danh (Bắt đầu ${formatDateVN(selectedClassBounds?.startDate)})`
                        : isSelectedClassEnded
                        ? 'Đã kết thúc (Chỉ xem)'
                        : isSelectedFutureDate
                        ? 'Khóa điểm danh ngày tương lai'
                        : isSavingAttendance
                        ? 'Đang lưu & đồng bộ điểm danh...'
                        : `Lưu Điểm Danh (${attendanceCounts.present}/${attendanceCounts.total} Có mặt)`}
                    </span>
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Nút Đăng xuất cỡ lớn cho điện thoại */}
        <button
          type="button"
          onClick={onLogout}
          className="w-full py-3.5 px-5 rounded-2xl bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-500/40 text-slate-300 hover:text-rose-200 text-sm font-extrabold flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Đăng xuất khỏi Cổng Nhân Sự Lớp Học</span>
        </button>
      </div>
    </div>
  );
};
