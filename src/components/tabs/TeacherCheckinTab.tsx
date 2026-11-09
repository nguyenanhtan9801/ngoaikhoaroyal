import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Building2,
  RefreshCw,
  UserCheck,
  Edit3,
  ShieldAlert,
  Volume2,
  X,
  Loader2,
  Calendar,
} from 'lucide-react';
import { AppUser, Teacher, ExtracurricularClass, TeacherCheckin } from '../../types';
import { AppStore, normalizeCampusScope } from '../../lib/storage';
import { supabase } from '../../supabaseClient';
import { showToast } from '../../lib/toast';

interface TeacherCheckinTabProps {
  store: AppStore;
  currentUser: AppUser | null;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

interface ScanResultCard {
  variant: 'on_time' | 'late' | 'no_class' | 'error';
  title: string;
  subtitle: string;
  teacherName?: string;
  teacherCode?: string;
  classesList?: Array<{
    className: string;
    campusCode: string;
    scheduledStart: string;
    status: 'on_time' | 'late' | 'no_class';
    lateMinutes: number;
  }>;
  checkedInTimeStr?: string;
  lateMinutesMax?: number;
}

interface TodayTeacherClassEntry {
  key: string;
  teacher: Teacher;
  cls: ExtracurricularClass | null;
  campusId: string;
  campusName: string;
  campusCode: string;
  scheduledStart: string; // HH:mm
  endTime: string; // HH:mm
  checkin: TeacherCheckin | null;
  isOverdue: boolean;
}

const DEFAULT_GRACE_MINUTES = 5;

function getVietnamNowParts(now: Date = new Date()): {
  dateStr: string;
  dayOfWeek: number;
  timeStr: string;
  minutesOfDay: number;
} {
  const vnStr = now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  const vnDate = new Date(vnStr);
  const year = vnDate.getFullYear();
  const month = String(vnDate.getMonth() + 1).padStart(2, '0');
  const day = String(vnDate.getDate()).padStart(2, '0');
  const hours = vnDate.getHours();
  const minutes = vnDate.getMinutes();
  return {
    dateStr: `${year}-${month}-${day}`,
    dayOfWeek: vnDate.getDay(),
    timeStr: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    minutesOfDay: hours * 60 + minutes,
  };
}

function formatVietnamTimeFromIso(isoStr?: string | null): string {
  if (!isoStr) return '--:--';
  try {
    const dt = new Date(isoStr);
    if (Number.isNaN(dt.getTime())) return '--:--';
    return dt.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--';
  }
}

function parseHhMmToMinutes(hhmm?: string | null): number {
  if (!hhmm) return 16 * 60 + 45;
  const parts = String(hhmm).trim().split(':');
  const h = parseInt(parts[0] || '16', 10);
  const m = parseInt(parts[1] || '45', 10);
  return (Number.isFinite(h) ? h : 16) * 60 + (Number.isFinite(m) ? m : 45);
}

function playFeedbackBeep(type: 'success' | 'warning' | 'error') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } else if (type === 'warning') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.28);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.32);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 450);
  } catch {
    // Ignore audio context errors
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      if (type === 'success') {
        navigator.vibrate(120);
      } else if (type === 'warning') {
        navigator.vibrate([100, 60, 100]);
      } else {
        navigator.vibrate([180, 80, 180]);
      }
    }
  } catch {
    // Ignore vibration errors
  }
}

export const TeacherCheckinTab: React.FC<TeacherCheckinTabProps> = ({
  store,
  currentUser,
  onUpdateStore,
}) => {
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const userScopedCampus = useMemo(() => {
    if (isSuperAdmin) return 'all';
    return normalizeCampusScope(currentUser?.campus_id);
  }, [currentUser?.campus_id, isSuperAdmin]);

  const [campusFilter, setCampusFilter] = useState<string>(() =>
    userScopedCampus !== 'all' ? userScopedCampus : 'all'
  );

  useEffect(() => {
    if (userScopedCampus !== 'all') {
      setCampusFilter(userScopedCampus);
    }
  }, [userScopedCampus]);

  // Camera & Scanner State
  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState<boolean>(false);
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [isScanningPaused, setIsScanningPaused] = useState<boolean>(false);
  const [isSubmittingScan, setIsSubmittingScan] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ScanResultCard | null>(null);

  // Clock tick every 15s to update overdue status in real time
  const [vnNow, setVnNow] = useState(() => getVietnamNowParts());
  useEffect(() => {
    const interval = setInterval(() => {
      setVnNow(getVietnamNowParts());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Manual Check-in Modal State
  const [manualModalTarget, setManualModalTarget] = useState<TodayTeacherClassEntry | null>(null);
  const [manualSessionDate, setManualSessionDate] = useState<string>(() => getVietnamNowParts().dateStr);
  const [manualNote, setManualNote] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pauseUntilRef = useRef<number>(0);
  const pauseTimeoutRef = useRef<number | null>(null);
  const submittedTokensRef = useRef<Map<string, number>>(new Map());
  const succeededTokensRef = useRef<Set<string>>(new Set());
  const isSubmittingScanRef = useRef<boolean>(false);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = useCallback(async (deviceIdToUse?: string) => {
    stopCameraStream();
    setCameraPermissionDenied(false);
    setCameraErrorMsg(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraErrorMsg('Trình duyệt hoặc thiết bị hiện tại không hỗ trợ truy cập Camera (yêu cầu HTTPS hoặc localhost).');
      return;
    }

    try {
      const videoConstraints: MediaTrackConstraints = deviceIdToUse
        ? { deviceId: { exact: deviceIdToUse }, width: { ideal: 640 }, height: { ideal: 480 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Enumerate video input devices after permission is granted
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput');
        setVideoDevices(cams);
        if (!deviceIdToUse && cams.length > 0) {
          const activeTrack = stream.getVideoTracks()[0];
          const activeDeviceId = activeTrack?.getSettings()?.deviceId;
          if (activeDeviceId) {
            setSelectedDeviceId(activeDeviceId);
          }
        }
      } catch {
        // ignore device enumeration errors
      }
    } catch (err: any) {
      const errName = String(err?.name || '');
      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errName === 'SecurityError'
      ) {
        setCameraPermissionDenied(true);
        setCameraErrorMsg('Quyền truy cập Camera đã bị từ chối.');
      } else {
        setCameraErrorMsg(err?.message || 'Không thể khởi động Camera. Vui lòng kiểm tra thiết bị.');
      }
    }
  }, [stopCameraStream]);

  // Start/stop camera based on isCameraActive and selectedDeviceId
  useEffect(() => {
    if (isCameraActive) {
      startCameraStream(selectedDeviceId || undefined);
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [isCameraActive, selectedDeviceId, startCameraStream, stopCameraStream]);

  // Stop camera when tab/page is hidden, resume if camera was active when visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopCameraStream();
      } else if (document.visibilityState === 'visible' && isCameraActive) {
        startCameraStream(selectedDeviceId || undefined);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (pauseTimeoutRef.current) {
        window.clearTimeout(pauseTimeoutRef.current);
      }
    };
  }, [isCameraActive, selectedDeviceId, startCameraStream, stopCameraStream]);

  const handleQrDetected = useCallback(
    async (qrToken: string) => {
      const nowMs = Date.now();
      const FIVE_MINUTES_MS = 5 * 60 * 1000;

      // Dọn các token cũ hơn 5 phút khỏi Map để tránh phình bộ nhớ
      submittedTokensRef.current.forEach((sentAt, tokenKey) => {
        if (nowMs - sentAt > FIVE_MINUTES_MS) {
          submittedTokensRef.current.delete(tokenKey);
          succeededTokensRef.current.delete(tokenKey);
        }
      });

      // Nếu qrToken đã có trong submittedTokensRef thì dừng ngay: không gửi, không đổi UI, không phát tiếng
      if (submittedTokensRef.current.has(qrToken)) {
        return;
      }

      if (nowMs < pauseUntilRef.current || isSubmittingScanRef.current || isSubmittingScan) return;

      // Pause scanning for 3 seconds
      pauseUntilRef.current = nowMs + 3000;
      isSubmittingScanRef.current = true;
      setIsScanningPaused(true);
      setIsSubmittingScan(true);
      if (pauseTimeoutRef.current) {
        window.clearTimeout(pauseTimeoutRef.current);
      }
      pauseTimeoutRef.current = window.setTimeout(() => {
        setIsScanningPaused(false);
      }, 3000);

      try {
        const sessionRes = supabase ? await supabase.auth.getSession() : null;
        const accessToken = sessionRes?.data?.session?.access_token;

        // Ghi qrToken vào submittedTokensRef ngay trước khi gọi fetch('/api/checkin/scan')
        submittedTokensRef.current.set(qrToken, Date.now());

        let response: Response;
        try {
          response = await fetch('/api/checkin/scan', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({ qr: qrToken }),
          });
        } catch (networkErr: any) {
          // Chỉ xóa qrToken khỏi submittedTokensRef khi lỗi là lỗi mạng (fetch bị throw) để cho phép thử lại
          submittedTokensRef.current.delete(qrToken);
          throw networkErr;
        }

        const payload = await response.json().catch(() => ({}));

        // Nếu máy chủ trả 409 "Mã QR này đã được dùng" cho một token mà phiên làm việc này vừa gửi thành công trước đó:
        // tuyệt đối không hiển thị thẻ lỗi và không xóa thẻ kết quả thành công đang hiển thị
        if (response.status === 409 && succeededTokensRef.current.has(qrToken)) {
          return;
        }

        if (!response.ok || payload.ok === false) {
          playFeedbackBeep('error');
          setScanResult({
            variant: 'error',
            title: 'Check in không thành công',
            subtitle: payload?.error || `Lỗi máy chủ (${response.status})`,
          });
          return;
        }

        succeededTokensRef.current.add(qrToken);

        const checkins: TeacherCheckin[] = Array.isArray(payload.checkins) ? payload.checkins : [];
        const rawResults: Array<Record<string, any>> = Array.isArray(payload.results)
          ? payload.results
          : [];
        const teacherInfo = payload.teacher || {};
        const teacherObj = store.teachers.find(t => t.id === teacherInfo.id);
        const teacherName = teacherInfo.name || teacherObj?.name || 'Giáo viên';
        const teacherCode = teacherInfo.code || teacherObj?.code || teacherInfo.id || '';

        // Merge into store.teacherCheckins immediately
        if (checkins.length > 0) {
          onUpdateStore(prev => {
            const map = new Map<string, TeacherCheckin>();
            (prev.teacherCheckins || []).forEach(c => map.set(c.id, c));
            checkins.forEach(c => map.set(c.id, c));
            const merged = Array.from(map.values()).sort((a, b) =>
              String(b.checked_in_at || '').localeCompare(String(a.checked_in_at || ''))
            );
            return {
              ...prev,
              teacherCheckins: merged,
            };
          });
        }

        // Kiểm tra trường hợp giáo viên không có lịch dạy hôm nay (status = 'no_class' hoặc không có class_id)
        const hasNoClassOnly =
          (checkins.length > 0 && checkins.every(c => c.status === 'no_class' || !c.class_id)) ||
          (rawResults.length > 0 &&
            rawResults.every(r => r.status === 'no_class' || !r.class_id));

        if (hasNoClassOnly) {
          playFeedbackBeep('warning');
          const reasonMsg =
            payload.skipped_reason ||
            'Giáo viên không có lịch dạy lớp ngoại khóa nào tại cơ sở này trong ngày hôm nay.';
          const checkedInTimeStr = formatVietnamTimeFromIso(
            checkins[0]?.checked_in_at ||
              rawResults[0]?.checked_in_at ||
              payload.checked_in_at ||
              payload.server_time
          );
          const isAlreadyNoClass = Boolean(
            payload.already_checked_in || rawResults[0]?.already
          );
          setScanResult({
            variant: 'no_class',
            title: isAlreadyNoClass
              ? `Đã check-in lúc ${checkedInTimeStr}`
              : 'Đã ghi nhận — không có lịch dạy hôm nay',
            subtitle: reasonMsg,
            teacherName,
            teacherCode,
            checkedInTimeStr,
          });
          return;
        }

        if (checkins.length === 0) {
          playFeedbackBeep('error');
          const skippedReason =
            payload.skipped_reason ||
            rawResults.find(r => r.skipped_reason)?.skipped_reason ||
            'Không thể ghi nhận check-in cho ca dạy hôm nay.';
          setScanResult({
            variant: 'error',
            title: 'Check in không thành công',
            subtitle: skippedReason,
            teacherName,
            teacherCode,
          });
          return;
        }

        const classItems = checkins
          .filter(c => c.class_id)
          .map(c => {
            const cls = store.classes.find(cl => cl.id === c.class_id);
            const campus = store.campuses.find(cp => cp.id === (c.campus_id || cls?.campus_id));
            return {
              className: cls?.name || c.class_id || 'Lớp NK',
              campusCode: campus?.code || (c.campus_id === 'camp_pl' ? 'PL' : 'PMH'),
              scheduledStart: c.scheduled_start ? String(c.scheduled_start).slice(0, 5) : '16:45',
              status: c.status,
              lateMinutes: Number(c.late_minutes || 0),
            };
          });

        const anyLate = classItems.some(item => item.status === 'late' || item.lateMinutes > 0);
        const maxLate = classItems.reduce((max, item) => Math.max(max, item.lateMinutes), 0);
        const checkedInTimeStr = formatVietnamTimeFromIso(
          checkins[0]?.checked_in_at || payload.checked_in_at || payload.server_time
        );

        if (anyLate) {
          playFeedbackBeep('warning');
          setScanResult({
            variant: 'late',
            title: `Trễ ${maxLate} phút`,
            subtitle: `Đã ghi nhận check-in lúc ${checkedInTimeStr}`,
            teacherName,
            teacherCode,
            classesList: classItems,
            checkedInTimeStr,
            lateMinutesMax: maxLate,
          });
        } else {
          playFeedbackBeep('success');
          setScanResult({
            variant: 'on_time',
            title: 'Đúng giờ',
            subtitle: `Đã ghi nhận check-in lúc ${checkedInTimeStr}`,
            teacherName,
            teacherCode,
            classesList: classItems,
            checkedInTimeStr,
            lateMinutesMax: 0,
          });
        }
      } catch (err: any) {
        playFeedbackBeep('error');
        setScanResult({
          variant: 'error',
          title: 'Lỗi kết nối khi quét QR',
          subtitle: err?.message || 'Không thể gửi yêu cầu xác thực QR tới máy chủ.',
        });
      } finally {
        isSubmittingScanRef.current = false;
        setIsSubmittingScan(false);
      }
    },
    [isSubmittingScan, onUpdateStore, store.campuses, store.classes, store.teachers]
  );

  // Continuous scanning loop (~8 frames/sec = every 125ms) on downscaled canvas
  useEffect(() => {
    if (!isCameraActive) return;

    const intervalId = window.setInterval(() => {
      if (Date.now() < pauseUntilRef.current || isSubmittingScan) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      // Downscale to max 360px width for fast jsQR decoding
      const targetWidth = Math.min(360, vw);
      const scale = targetWidth / vw;
      const targetHeight = Math.max(1, Math.round(vh * scale));

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data && code.data.trim().startsWith('RSC1.')) {
        handleQrDetected(code.data.trim());
      }
    }, 125);

    return () => window.clearInterval(intervalId);
  }, [handleQrDetected, isCameraActive, isSubmittingScan]);

  // Build "Hôm nay" list of teachers and classes scheduled today
  const todayEntries = useMemo<TodayTeacherClassEntry[]>(() => {
    const todayStr = vnNow.dateStr;
    const todayDow = vnNow.dayOfWeek;

    // Check holidays
    const isHolidayForCampus = (campusId: string) =>
      (store.holidays || []).some(h => {
        if (h.status && h.status !== 'active') return false;
        const start = h.start_date;
        const end = h.end_date || h.start_date;
        if (todayStr < start || todayStr > end) return false;
        return !h.campus_id || h.campus_id === 'all' || h.campus_id === campusId;
      });

    const todayCheckins = (store.teacherCheckins || []).filter(
      c => c.session_date === todayStr
    );

    const entriesMap = new Map<string, TodayTeacherClassEntry>();

    // 1. Scheduled classes today
    (store.classes || []).forEach(cls => {
      if (cls.status && cls.status !== 'active') return;
      if (isHolidayForCampus(cls.campus_id)) return;

      // Check term date range if term exists
      const term = (store.terms || []).find(t => t.id === cls.term_id);
      if (term && term.start_date && term.end_date) {
        if (todayStr < term.start_date || todayStr > term.end_date) {
          // Also check spanning term if cross-term
          const spanTerm = cls.spanning_term_id
            ? (store.terms || []).find(t => t.id === cls.spanning_term_id)
            : null;
          const inSpan =
            spanTerm &&
            spanTerm.start_date &&
            spanTerm.end_date &&
            todayStr >= spanTerm.start_date &&
            todayStr <= spanTerm.end_date;
          if (!inSpan) return;
        }
      }

      const days = Array.isArray(cls.days_of_week) ? cls.days_of_week : [];
      if (!days.map(Number).includes(todayDow)) return;

      // Apply campus scope
      if (userScopedCampus !== 'all' && cls.campus_id !== userScopedCampus) return;
      if (campusFilter !== 'all' && cls.campus_id !== campusFilter) return;

      const timeSlot = (store.timeSlots || []).find(ts => ts.id === cls.time_slot_id);
      const scheduledStart = timeSlot?.start_time ? timeSlot.start_time.slice(0, 5) : '16:45';
      const endTime = timeSlot?.end_time ? timeSlot.end_time.slice(0, 5) : '18:15';
      const campusObj = (store.campuses || []).find(cp => cp.id === cls.campus_id);
      const campusCode = campusObj?.code || (cls.campus_id === 'camp_pl' ? 'PL' : 'PMH');
      const campusName =
        campusObj?.name ||
        (cls.campus_id === 'camp_pl' ? 'Cơ sở Phú Lâm (PL)' : 'Cơ sở Phú Mỹ Hưng (PMH)');

      const teacherIds = new Set<string>();
      if (cls.primary_teacher_id) teacherIds.add(cls.primary_teacher_id);
      if (cls.secondary_teacher_1) teacherIds.add(cls.secondary_teacher_1);
      if (cls.secondary_teacher_2) teacherIds.add(cls.secondary_teacher_2);
      if (cls.secondary_teacher_3) teacherIds.add(cls.secondary_teacher_3);
      if (cls.term_distribution?.secondary_teacher_1) teacherIds.add(cls.term_distribution.secondary_teacher_1);
      if (cls.term_distribution?.secondary_teacher_2) teacherIds.add(cls.term_distribution.secondary_teacher_2);
      if (cls.term_distribution?.secondary_teacher_3) teacherIds.add(cls.term_distribution.secondary_teacher_3);

      teacherIds.forEach(tId => {
        const teacher = (store.teachers || []).find(t => t.id === tId);
        if (!teacher) return;

        const matchedCheckin =
          todayCheckins.find(c => c.teacher_id === tId && c.class_id === cls.id) || null;

        const startMin = parseHhMmToMinutes(scheduledStart);
        const isOverdue =
          !matchedCheckin && vnNow.minutesOfDay > startMin + DEFAULT_GRACE_MINUTES;

        const key = `${tId}__${cls.id}`;
        entriesMap.set(key, {
          key,
          teacher,
          cls,
          campusId: cls.campus_id,
          campusName,
          campusCode,
          scheduledStart,
          endTime,
          checkin: matchedCheckin,
          isOverdue,
        });
      });
    });

    // 2. Any check-in records today that weren't in scheduled classes (e.g., substitute or no_class)
    todayCheckins.forEach(chk => {
      const campusId = chk.campus_id || 'camp_pmh';
      if (userScopedCampus !== 'all' && campusId !== userScopedCampus) return;
      if (campusFilter !== 'all' && campusId !== campusFilter) return;

      const key = `${chk.teacher_id}__${chk.class_id || 'no_class'}`;
      if (entriesMap.has(key)) return;

      const teacher = (store.teachers || []).find(t => t.id === chk.teacher_id);
      if (!teacher) return;
      const cls = chk.class_id
        ? (store.classes || []).find(c => c.id === chk.class_id) || null
        : null;
      const timeSlot = cls
        ? (store.timeSlots || []).find(ts => ts.id === cls.time_slot_id)
        : null;
      const scheduledStart = chk.scheduled_start
        ? String(chk.scheduled_start).slice(0, 5)
        : timeSlot?.start_time?.slice(0, 5) || '--:--';
      const endTime = timeSlot?.end_time?.slice(0, 5) || '--:--';
      const campusObj = (store.campuses || []).find(cp => cp.id === campusId);
      const campusCode = campusObj?.code || (campusId === 'camp_pl' ? 'PL' : 'PMH');
      const campusName =
        campusObj?.name ||
        (campusId === 'camp_pl' ? 'Cơ sở Phú Lâm (PL)' : 'Cơ sở Phú Mỹ Hưng (PMH)');

      entriesMap.set(key, {
        key,
        teacher,
        cls,
        campusId,
        campusName,
        campusCode,
        scheduledStart,
        endTime,
        checkin: chk,
        isOverdue: false,
      });
    });

    return Array.from(entriesMap.values()).sort((a, b) => {
      if (a.campusId !== b.campusId) return a.campusId.localeCompare(b.campusId);
      return a.scheduledStart.localeCompare(b.scheduledStart);
    });
  }, [
    campusFilter,
    store.campuses,
    store.classes,
    store.holidays,
    store.teacherCheckins,
    store.teachers,
    store.terms,
    store.timeSlots,
    userScopedCampus,
    vnNow.dateStr,
    vnNow.dayOfWeek,
    vnNow.minutesOfDay,
  ]);

  const groupedByCampus = useMemo(() => {
    const groups: Record<string, { campusName: string; campusCode: string; items: TodayTeacherClassEntry[] }> = {};
    todayEntries.forEach(item => {
      if (!groups[item.campusId]) {
        groups[item.campusId] = {
          campusName: item.campusName,
          campusCode: item.campusCode,
          items: [],
        };
      }
      groups[item.campusId].items.push(item);
    });
    return groups;
  }, [todayEntries]);

  const statsSummary = useMemo(() => {
    const scheduled = todayEntries.filter(e => e.cls !== null);
    const checkedIn = scheduled.filter(e => e.checkin !== null);
    const onTime = checkedIn.filter(e => e.checkin?.status === 'on_time');
    const late = checkedIn.filter(e => e.checkin?.status === 'late');
    const notCheckedIn = scheduled.filter(e => !e.checkin);
    const overdue = notCheckedIn.filter(e => e.isOverdue);
    return {
      totalScheduled: scheduled.length,
      checkedInCount: checkedIn.length,
      onTimeCount: onTime.length,
      lateCount: late.length,
      notCheckedInCount: notCheckedIn.length,
      overdueCount: overdue.length,
    };
  }, [todayEntries]);

  const openManualCheckinModal = (entry: TodayTeacherClassEntry) => {
    setManualModalTarget(entry);
    setManualSessionDate(vnNow.dateStr);
    setManualNote('');
    setManualError(null);
  };

  const handleManualCheckinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualModalTarget || !manualModalTarget.cls) return;

    const trimmedNote = manualNote.trim();
    if (trimmedNote.length < 5) {
      setManualError('Vui lòng nhập lý do check-in thủ công tối thiểu 5 ký tự.');
      return;
    }

    setIsSubmittingManual(true);
    setManualError(null);

    try {
      const sessionRes = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionRes?.data?.session?.access_token;

      const response = await fetch('/api/checkin/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          teacher_id: manualModalTarget.teacher.id,
          class_id: manualModalTarget.cls.id,
          session_date: manualSessionDate,
          note: trimmedNote,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setManualError(payload?.error || `Không thể check-in thủ công (${response.status})`);
        return;
      }

      const newCheckin: TeacherCheckin | undefined = payload.checkin;
      if (newCheckin) {
        onUpdateStore(prev => {
          const map = new Map<string, TeacherCheckin>();
          (prev.teacherCheckins || []).forEach(c => map.set(c.id, c));
          map.set(newCheckin.id, newCheckin);
          const merged = Array.from(map.values()).sort((a, b) =>
            String(b.checked_in_at || '').localeCompare(String(a.checked_in_at || ''))
          );
          return {
            ...prev,
            teacherCheckins: merged,
          };
        });
      }

      playFeedbackBeep('success');
      showToast(
        `Đã check-in thủ công cho GV ${manualModalTarget.teacher.name} (${manualModalTarget.cls.name}).`,
        'success'
      );
      setManualModalTarget(null);
    } catch (err: any) {
      setManualError(err?.message || 'Lỗi kết nối máy chủ khi check-in thủ công.');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const canSelectPastDateInManual =
    currentUser?.role === 'super_admin' || currentUser?.role === 'campus_manager';

  const minManualDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }, []);

  return (
    <div className="space-y-4">
      {/* Top Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Tổng ca dạy hôm nay
            </div>
            <div className="text-xl font-black font-mono text-white mt-0.5">
              {statsSummary.totalScheduled} ca
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Đã check in đúng giờ
            </div>
            <div className="text-xl font-black font-mono text-emerald-400 mt-0.5">
              {statsSummary.onTimeCount} ca
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Check in trễ giờ
            </div>
            <div className="text-xl font-black font-mono text-amber-300 mt-0.5">
              {statsSummary.lateCount} ca
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
              Chưa check in (Quá giờ: {statsSummary.overdueCount})
            </div>
            <div className="text-xl font-black font-mono text-rose-400 mt-0.5">
              {statsSummary.notCheckedInCount} ca
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* CỘT TRÁI: KHUNG CAMERA QUÉT QR & THẺ KẾT QUẢ */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-3xl bg-[#111827]/95 border border-slate-800 shadow-xl overflow-hidden">
            {/* Header Camera */}
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-900/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Trạm Quét QR Check-in Giáo Viên</h3>
                  <p className="text-[11px] text-slate-400">
                    Đưa mã QR trên Cổng Giáo Viên vào khung hình (~8 fps)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCameraActive(prev => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer ${
                  isCameraActive
                    ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/40'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                }`}
              >
                {isCameraActive ? (
                  <>
                    <CameraOff className="w-3.5 h-3.5" />
                    <span>Tắt camera</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    <span>Bật camera</span>
                  </>
                )}
              </button>
            </div>

            {/* Camera Device Selector (when multiple cameras available) */}
            {videoDevices.length > 1 && isCameraActive && (
              <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400 font-semibold shrink-0">Chọn ống kính:</span>
                <select
                  value={selectedDeviceId}
                  onChange={e => setSelectedDeviceId(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-bold text-xs focus:outline-none focus:border-amber-500"
                >
                  {videoDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Camera #${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Viewport */}
            <div className="p-4">
              <div className="relative aspect-[4/3] w-full rounded-2xl bg-slate-950 border-2 border-slate-800 overflow-hidden flex items-center justify-center">
                {isCameraActive && !cameraPermissionDenied && !cameraErrorMsg ? (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Scanning guide frame */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                      <div
                        className={`w-52 h-52 sm:w-60 sm:h-60 rounded-3xl border-2 transition-colors relative ${
                          isScanningPaused
                            ? 'border-amber-400 bg-amber-500/10'
                            : 'border-emerald-400/80 shadow-[0_0_0_9999px_rgba(7,9,14,0.45)]'
                        }`}
                      >
                        <div className="absolute top-2 left-2 w-6 h-6 border-t-4 border-l-4 border-amber-400 rounded-tl-xl" />
                        <div className="absolute top-2 right-2 w-6 h-6 border-t-4 border-r-4 border-amber-400 rounded-tr-xl" />
                        <div className="absolute bottom-2 left-2 w-6 h-6 border-b-4 border-l-4 border-amber-400 rounded-bl-xl" />
                        <div className="absolute bottom-2 right-2 w-6 h-6 border-b-4 border-r-4 border-amber-400 rounded-br-xl" />
                      </div>
                    </div>

                    {/* Status Pill inside video */}
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950/85 border border-slate-800 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isScanningPaused
                              ? 'bg-amber-400 animate-ping'
                              : 'bg-emerald-400 animate-pulse'
                          }`}
                        />
                        <span className="font-bold text-slate-200">
                          {isSubmittingScan
                            ? 'Đang xác thực mã QR với máy chủ...'
                            : isScanningPaused
                            ? 'Tạm dừng quét 3 giây...'
                            : 'Đang quét tự động (RSC1.*)'}
                        </span>
                      </div>
                      <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </>
                ) : cameraPermissionDenied ? (
                  <div className="p-6 text-center space-y-3 max-w-sm">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-extrabold text-white">
                      Trình duyệt đã chặn quyền truy cập Camera
                    </h4>
                    <div className="text-xs text-slate-300 space-y-1.5 text-left bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                      <p className="font-bold text-amber-300">Hướng dẫn cấp lại quyền Camera:</p>
                      <p>1. Nhấn vào biểu tượng ổ khóa / cài đặt trang web trên thanh địa chỉ trình duyệt.</p>
                      <p>2. Chuyển mục <strong>Camera (Máy ảnh)</strong> sang trạng thái <strong>Cho phép (Allow)</strong>.</p>
                      <p>3. Nhấn nút <strong>Thử kết nối lại Camera</strong> bên dưới.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startCameraStream(selectedDeviceId || undefined)}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Thử kết nối lại Camera</span>
                    </button>
                  </div>
                ) : cameraErrorMsg ? (
                  <div className="p-6 text-center space-y-3 max-w-sm">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-semibold text-amber-300">{cameraErrorMsg}</p>
                    <button
                      type="button"
                      onClick={() => startCameraStream(selectedDeviceId || undefined)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Thử lại</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
                      <CameraOff className="w-6 h-6" />
                    </div>
                    <p className="text-xs text-slate-400">Camera đang tắt.</p>
                    <button
                      type="button"
                      onClick={() => setIsCameraActive(true)}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Bật Camera Quét QR</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* THẺ KẾT QUẢ QUÉT LỚN (GREEN / AMBER / RED) */}
          {scanResult && (
            <div
              className={`rounded-3xl p-5 border-2 shadow-2xl transition-all ${
                scanResult.variant === 'on_time'
                  ? 'bg-emerald-950/60 border-emerald-400 text-emerald-100 shadow-emerald-500/15'
                  : scanResult.variant === 'late' || scanResult.variant === 'no_class'
                  ? 'bg-amber-950/60 border-amber-400 text-amber-100 shadow-amber-500/15'
                  : 'bg-rose-950/60 border-rose-500 text-rose-100 shadow-rose-500/15'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      scanResult.variant === 'on_time'
                        ? 'bg-emerald-500 text-slate-950'
                        : scanResult.variant === 'late' || scanResult.variant === 'no_class'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-rose-500 text-white'
                    }`}
                  >
                    {scanResult.variant === 'on_time' ? (
                      <CheckCircle2 className="w-7 h-7" />
                    ) : scanResult.variant === 'late' ? (
                      <Clock className="w-7 h-7" />
                    ) : scanResult.variant === 'no_class' ? (
                      <AlertTriangle className="w-7 h-7" />
                    ) : (
                      <XCircle className="w-7 h-7" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider opacity-85">
                      Kết quả xác thực Check-in
                    </div>
                    <h4 className="text-xl font-black tracking-tight mt-0.5">
                      {scanResult.title}
                    </h4>
                    <p className="text-xs opacity-90 mt-0.5">{scanResult.subtitle}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScanResult(null)}
                  className="p-1.5 rounded-xl bg-black/25 hover:bg-black/40 text-white/80"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(scanResult.teacherName || (scanResult.classesList && scanResult.classesList.length > 0)) && (
                <div className="mt-4 pt-3.5 border-t border-white/15 space-y-2.5 text-xs">
                  {scanResult.teacherName && (
                    <div className="flex items-center justify-between">
                      <span className="opacity-80">Giáo viên:</span>
                      <span className="font-extrabold text-sm text-white">
                        {scanResult.teacherName}{' '}
                        {scanResult.teacherCode ? (
                          <span className="font-mono text-xs text-amber-300">
                            ({scanResult.teacherCode})
                          </span>
                        ) : null}
                      </span>
                    </div>
                  )}

                  {scanResult.checkedInTimeStr && (
                    <div className="flex items-center justify-between">
                      <span className="opacity-80">Giờ check-in ghi nhận:</span>
                      <span className="font-mono font-extrabold text-white">
                        {scanResult.checkedInTimeStr}
                      </span>
                    </div>
                  )}

                  {scanResult.classesList && scanResult.classesList.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                        Danh sách lớp ghi nhận ({scanResult.classesList.length} lớp):
                      </div>
                      {scanResult.classesList.map((cl, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-extrabold text-white">{cl.className}</div>
                            <div className="text-[11px] opacity-80 font-mono">
                              Cơ sở {cl.campusCode} • Giờ bắt đầu: {cl.scheduledStart}
                            </div>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${
                              cl.status === 'late'
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-emerald-400 text-slate-950'
                            }`}
                          >
                            {cl.status === 'late' ? `Trễ ${cl.lateMinutes} phút` : 'Đúng giờ'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* CỘT PHẢI: DANH SÁCH "HÔM NAY" THEO CƠ SỞ */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-3xl bg-[#111827]/95 border border-slate-800 shadow-xl overflow-hidden">
            {/* Header Hôm nay */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-white">
                      Hôm nay ({vnNow.dateStr})
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-mono text-[11px] text-amber-300 font-bold">
                      {vnNow.timeStr}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Theo dõi thời gian thực trạng thái check-in của giáo viên có lịch dạy hôm nay
                  </p>
                </div>
              </div>

              {/* Bộ lọc cơ sở (Chỉ mở cho super_admin hoặc tài khoản đa cơ sở) */}
              {userScopedCampus === 'all' ? (
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {[
                    { id: 'all', label: 'Tất cả CS' },
                    { id: 'camp_pmh', label: 'Phú Mỹ Hưng' },
                    { id: 'camp_pl', label: 'Phú Lâm' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCampusFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        campusFilter === tab.id
                          ? 'bg-amber-500 text-slate-950 font-extrabold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-bold inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>
                    {userScopedCampus === 'camp_pl' ? 'Cơ sở Phú Lâm (PL)' : 'Cơ sở Phú Mỹ Hưng (PMH)'}
                  </span>
                </span>
              )}
            </div>

            {/* Body danh sách theo cơ sở */}
            <div className="p-4 space-y-5">
              {Object.keys(groupedByCampus).length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
                  <div className="text-sm font-bold text-slate-300">
                    Không có lịch dạy ngoại khóa nào trong ngày hôm nay ({vnNow.dateStr})
                  </div>
                  <p className="text-xs text-slate-500">
                    Các lượt quét QR phát sinh ngoài lịch sẽ vẫn tự động hiển thị tại đây.
                  </p>
                </div>
              ) : (
                Object.entries(groupedByCampus).map(([campId, group]) => (
                  <div key={campId} className="space-y-2.5">
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                          {group.campusName}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        {group.items.filter(i => i.checkin).length}/{group.items.length} ca đã check in
                      </span>
                    </div>

                    <div className="divide-y divide-slate-800/80 rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden">
                      {group.items.map(entry => {
                        const chk = entry.checkin;
                        const isNoClass = chk?.status === 'no_class' || !entry.cls;
                        const checkedInHhMm = chk ? formatVietnamTimeFromIso(chk.checked_in_at) : null;

                        return (
                          <div
                            key={entry.key}
                            className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                              entry.isOverdue
                                ? 'bg-rose-950/35 border-l-4 border-l-rose-500'
                                : chk?.status === 'late'
                                ? 'bg-amber-950/15'
                                : chk?.status === 'on_time'
                                ? 'bg-emerald-950/10'
                                : ''
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                                  {entry.teacher.code || entry.teacher.id}
                                </span>
                                <span className="text-sm font-extrabold text-white">
                                  {entry.teacher.name}
                                </span>
                                {entry.cls ? (
                                  <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-xs font-bold text-cyan-300">
                                    {entry.cls.name}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-xs font-semibold text-slate-400">
                                    Không có lớp hôm nay
                                  </span>
                                )}
                              </div>

                              <div className="text-xs text-slate-400 flex items-center gap-3 flex-wrap font-mono">
                                {entry.cls && (
                                  <span>
                                    Ca dạy: <strong className="text-slate-200">{entry.scheduledStart} - {entry.endTime}</strong>
                                  </span>
                                )}
                                {chk?.note && (
                                  <span className="font-sans text-[11px] text-slate-300 italic">
                                    • Ghi chú: "{chk.note}"
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Status & Action */}
                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              {chk ? (
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                  {/* Method Badge: QR or Thủ công */}
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border ${
                                      chk.method === 'manual'
                                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                    }`}
                                  >
                                    {chk.method === 'manual' ? 'Thủ công' : 'QR'}
                                  </span>

                                  {isNoClass ? (
                                    <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold">
                                      Không có lớp ({checkedInHhMm})
                                    </span>
                                  ) : chk.status === 'late' ? (
                                    <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-extrabold flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5" />
                                      <span>
                                        Đã check in {checkedInHhMm} • Trễ {chk.late_minutes || 0} phút
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-extrabold flex items-center gap-1.5">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Đã check in {checkedInHhMm} • Đúng giờ</span>
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2.5 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border ${
                                      entry.isOverdue
                                        ? 'bg-rose-500/25 text-rose-300 border-rose-500/50 animate-pulse'
                                        : 'bg-slate-900 text-slate-400 border-slate-800'
                                    }`}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>
                                      {entry.isOverdue ? 'Chưa check in (Quá giờ)' : 'Chưa check in'}
                                    </span>
                                  </span>

                                  {entry.cls && (
                                    <button
                                      type="button"
                                      onClick={() => openManualCheckinModal(entry)}
                                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5 shadow-md shadow-amber-500/15 cursor-pointer transition-all"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      <span>Check in thủ công</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL CHECK IN THỦ CÔNG */}
      {manualModalTarget && manualModalTarget.cls && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-slate-800 shadow-2xl overflow-hidden text-slate-100">
            <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Check in Thủ Công Giáo Viên</h3>
                  <p className="text-[11px] text-slate-400">
                    Dành cho trường hợp thiết bị giáo viên hết pin hoặc mất kết nối
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManualModalTarget(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualCheckinSubmit} className="p-5 space-y-4 text-xs">
              {manualError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-semibold">
                  {manualError}
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Giáo viên:</span>
                  <strong className="text-white">
                    {manualModalTarget.teacher.name} ({manualModalTarget.teacher.code})
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Lớp ngoại khóa:</span>
                  <strong className="text-amber-300">{manualModalTarget.cls.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Khung giờ ca dạy:</span>
                  <strong className="font-mono text-cyan-300">
                    {manualModalTarget.scheduledStart} - {manualModalTarget.endTime}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1.5">
                  Ngày buổi dạy *
                </label>
                <input
                  type="date"
                  value={manualSessionDate}
                  min={canSelectPastDateInManual ? minManualDate : vnNow.dateStr}
                  max={vnNow.dateStr}
                  disabled={!canSelectPastDateInManual}
                  onChange={e => setManualSessionDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500 disabled:opacity-60"
                />
                {!canSelectPastDateInManual && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    * Vai trò Học vụ chỉ được phép check-in thủ công cho ca dạy trong ngày hôm nay.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1.5">
                  Lý do check-in thủ công (bắt buộc tối thiểu 5 ký tự) *
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  value={manualNote}
                  onChange={e => {
                    setManualNote(e.target.value);
                    setManualError(null);
                  }}
                  placeholder="Nhập rõ lý do (VD: Điện thoại giáo viên hỏng camera / hết pin, đã có mặt tại lớp lúc 16:40)..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManualModalTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmittingManual ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Xác nhận Check in Thủ công</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
