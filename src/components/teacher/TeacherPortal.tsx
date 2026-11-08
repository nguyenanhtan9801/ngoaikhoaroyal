import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import { AppUser, TeacherCheckin } from '../../types';
import { supabase } from '../../supabaseClient';

interface TeacherPortalProps {
  currentUser: AppUser;
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

function formatCheckinTime(iso?: string | null): string {
  if (!iso) return '--:--';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '--:--';
  return formatVnTimeHms(parsed);
}

export const TeacherPortal: React.FC<TeacherPortalProps> = ({
  currentUser,
  onLogout,
  onOpenChangePassword,
}) => {
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
      const refreshInSec =
        Number(body.refresh_in) > 5 ? Number(body.refresh_in) : 60;
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

  // Tải danh sách check-in hôm nay của giáo viên từ bảng teacher_checkins
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

        const linkedTeacherId = qrData?.teacher?.id || currentUser.linked_teacher_id;
        if (linkedTeacherId) {
          query = query.eq('teacher_id', linkedTeacherId);
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
    [currentUser.linked_teacher_id, qrData?.teacher?.id]
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
      const teacherFilterId = qrData?.teacher?.id || currentUser.linked_teacher_id;
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

  const teacherName = qrData?.teacher?.name || currentUser.full_name || 'Giáo viên';
  const teacherCode =
    qrData?.teacher?.code || currentUser.linked_teacher_id || currentUser.username;

  // Thông số vòng tròn đếm ngược SVG
  const circleRadius = 22;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const progressRatio = Math.min(1, Math.max(0, remainingSec / totalTtlSec));
  const strokeDashoffset = circleCircumference * (1 - progressRatio);

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col justify-between font-sans tracking-[-0.011em] antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* Hiệu ứng ánh sáng nền */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.10),transparent_65%)]" />

      <div className="relative z-10 w-full max-w-md mx-auto px-4 pt-4 pb-8 space-y-4">
        {/* Header Cổng Giáo Viên */}
        <header className="flex items-center justify-between gap-3 rounded-2xl bg-[#111827]/90 border border-slate-800/90 px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                  ROYAL SCHOOL • CỔNG GIÁO VIÊN
                </span>
              </div>
              <h1 className="text-sm font-extrabold text-white truncate">
                Thẻ QR Check-in Ca Dạy
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenChangePassword && (
              <button
                type="button"
                onClick={onOpenChangePassword}
                title="Đổi mật khẩu"
                className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/70 transition-colors"
              >
                <KeyRound className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-extrabold transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </header>

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
          {/* Thông tin Giáo viên & Đồng hồ Server chạy từng giây */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3.5">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                GIÁO VIÊN ĐỨNG LỚP
              </div>
              <div className="text-base sm:text-lg font-black text-slate-900 truncate">
                {teacherName}
              </div>
              <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-300 text-xs font-mono font-extrabold text-slate-800">
                <span>Mã GV:</span>
                <span className="text-amber-700">{teacherCode}</span>
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
                        Hiệu lực còn lại: <strong className="text-slate-800">{remainingSec} giây</strong>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchCheckinQr()}
                    disabled={isLoadingQr}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-extrabold transition-all shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingQr ? 'animate-spin' : ''}`} />
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
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-black transition-all shadow-md"
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
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/70 transition-colors"
              title="Làm mới danh sách check-in"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingCheckins ? 'animate-spin' : ''}`} />
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

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-white truncate">
                          {isNoClass
                            ? 'Check-in tại cơ sở (Không có lịch lớp)'
                            : `Lớp: ${item.class_id || 'Đã ghi nhận'}`}
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

        {/* Nút Đăng xuất cỡ lớn cho điện thoại */}
        <button
          type="button"
          onClick={onLogout}
          className="w-full py-3.5 px-5 rounded-2xl bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-500/40 text-slate-300 hover:text-rose-200 text-sm font-extrabold flex items-center justify-center gap-2 transition-all shadow-lg"
        >
          <LogOut className="w-4 h-4" />
          <span>Đăng xuất khỏi Cổng Giáo Viên</span>
        </button>
      </div>
    </div>
  );
};
