import {
  AcademicTerm,
  Enrollment,
  ExtracurricularClass,
} from '../types';

export type ClassLifecyclePhase = 'upcoming' | 'active' | 'ended';

export type SessionExclusionReason =
  | 'weekday_mismatch'
  | 'not_started'
  | 'dropped'
  | 'out_of_class_bounds'
  | 'cancelled';

export interface StudentSessionEligibilityResult {
  eligible: boolean;
  reason?: SessionExclusionReason;
  startDate?: string;
}

export const JS_DAY_TO_VN_CODE: Record<number, string> = {
  0: 'CN',
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
};

export const VN_DAY_NAME_MAP: Record<string, string> = {
  T2: 'Thứ 2',
  T3: 'Thứ 3',
  T4: 'Thứ 4',
  T5: 'Thứ 5',
  T6: 'Thứ 6',
  T7: 'Thứ 7',
  CN: 'Chủ Nhật',
};

export function getDayLabel(dayCode: string): string {
  return VN_DAY_NAME_MAP[dayCode] || dayCode;
}

export function getDayCodeFromDate(dateStr: string): string {
  if (!dateStr) return 'T2';
  const clean = normalizeDateStr(dateStr);
  const d = new Date(`${clean}T12:00:00`);
  if (isNaN(d.getTime())) return 'T2';
  return JS_DAY_TO_VN_CODE[d.getDay()] || 'T2';
}

export const getDateDayCode = getDayCodeFromDate;

export function normalizeDateStr(value?: string | null): string {
  if (!value) return '';
  const clean = String(value).trim();
  if (!clean) return '';
  return clean.split('T')[0].split(' ')[0];
}

export function getTodayStrHoChiMinh(today: Date | string = new Date()): string {
  if (typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today.trim())) {
    return today.trim();
  }
  const d = typeof today === 'string' ? new Date(today) : today;
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(validDate);
}

/**
 * Lấy khoảng ngày hiệu lực [startDate, endDate] của lớp học (ưu tiên ngày riêng của lớp, fallback sang AcademicTerm)
 */
export function getClassEffectiveBounds(
  cls: Pick<ExtracurricularClass, 'start_date' | 'end_date' | 'term_id'> | undefined,
  terms: AcademicTerm[] = []
): { startDate: string; endDate: string } {
  if (!cls) return { startDate: '', endDate: '' };
  const term = terms.find(t => t.id === cls.term_id);
  const startDate = normalizeDateStr(cls.start_date || term?.start_date || '');
  const endDate = normalizeDateStr(cls.end_date || term?.end_date || '');
  return { startDate, endDate };
}

/**
 * Xác định giai đoạn hiệu lực của lớp CHỈ dựa trên start_date / end_date theo múi giờ Asia/Ho_Chi_Minh
 * (KHÔNG phụ thuộc vào extracurricular_classes.status):
 * - 'upcoming': chưa tới startDate
 * - 'ended': đã qua endDate
 * - 'active': trong khoảng [startDate, endDate]
 */
export function getClassPhase(
  cls: Pick<ExtracurricularClass, 'start_date' | 'end_date' | 'term_id'> | undefined,
  todayStr?: string,
  terms: AcademicTerm[] = []
): ClassLifecyclePhase {
  if (!cls) return 'active';
  const refDate = getTodayStrHoChiMinh(todayStr || new Date());
  const { startDate, endDate } = getClassEffectiveBounds(cls, terms);
  if (startDate && refDate < startDate) {
    return 'upcoming';
  }
  if (endDate && refDate > endDate) {
    return 'ended';
  }
  return 'active';
}

/**
 * Ngày bắt đầu học thực tế của enrollment:
 * ưu tiên enr.start_date -> enr.joined_date -> cls.start_date
 */
export function getEnrollmentStartDate(
  enr?: Pick<Enrollment, 'start_date' | 'joined_date'> | null,
  cls?: Pick<ExtracurricularClass, 'start_date'> | null
): string {
  return (
    normalizeDateStr(enr?.start_date) ||
    normalizeDateStr(enr?.joined_date) ||
    normalizeDateStr(cls?.start_date) ||
    ''
  );
}

/**
 * Ngày nghỉ / chuyển lớp thực tế của enrollment (nếu có)
 */
export function getEnrollmentDropDate(enr?: Enrollment | null): string {
  if (!enr) return '';
  const raw =
    (enr as any).dropped_date ||
    (enr as any).left_date ||
    (enr as any).withdrawn_date ||
    (enr as any).end_date;
  return normalizeDateStr(raw);
}

/**
 * Xác định giai đoạn hiệu lực của một enrollment theo lớp và ngày bắt đầu học thực tế
 */
export function getEnrollmentPhase(
  enr: Pick<Enrollment, 'joined_date' | 'start_date' | 'status'> | undefined,
  cls: Pick<ExtracurricularClass, 'start_date' | 'end_date' | 'term_id' | 'status'> | undefined,
  todayStr?: string,
  terms: AcademicTerm[] = []
): ClassLifecyclePhase {
  const refDate = getTodayStrHoChiMinh(todayStr || new Date());
  const classPhase = getClassPhase(cls, refDate, terms);
  if (classPhase === 'upcoming') return 'upcoming';
  const startDate = getEnrollmentStartDate(enr, cls);
  if (startDate && refDate < startDate) return 'upcoming';
  if (enr?.status === 'completed' || classPhase === 'ended') return 'ended';
  return 'active';
}

/**
 * Kiểm tra ghi danh có đang thực sự diễn ra (effective active) tại todayStr không
 */
export function isEnrollmentEffectiveActive(
  enr: Pick<Enrollment, 'status' | 'joined_date' | 'start_date'> | undefined,
  cls: Pick<ExtracurricularClass, 'start_date' | 'end_date' | 'term_id' | 'status'> | undefined,
  todayStr?: string,
  terms: AcademicTerm[] = []
): boolean {
  if (!enr) return false;
  if (enr.status !== 'active' && enr.status !== 'trial') return false;
  return getEnrollmentPhase(enr, cls, todayStr, terms) === 'active';
}

/**
 * Đánh giá học viên có hợp lệ tham gia buổi học ngày `sessionDate` hay không:
 * - Học viên đã có bản ghi điểm danh ở `sessionDate` LUÔN được giữ hiển thị (`hasSavedAttendance = true`).
 * - Bao gồm `active`, `trial`, `completed` (completed KHÔNG phải nghỉ học).
 * - `dropped` / `trial_dropped` / `transferred`: chỉ hiện ở các buổi TRƯỚC ngày nghỉ (`sessionDate < dropDate`), hoặc đã có điểm danh.
 * - `sessionDate` nằm trong `[C.start_date, C.end_date]` và `sessionDate >= getEnrollmentStartDate(enr, C)`.
 * - Khớp thứ trong tuần theo `enrolled_days_of_week` (hoặc `classDays` nếu rỗng).
 */
export function evaluateStudentSessionEligibility(
  enrollment: Enrollment | undefined,
  sessionDate: string,
  classDays?: string[],
  cls?: ExtracurricularClass,
  terms: AcademicTerm[] = [],
  hasSavedAttendance = false
): StudentSessionEligibilityResult {
  const cleanSessionDate = normalizeDateStr(sessionDate);
  if (hasSavedAttendance) {
    return { eligible: true, startDate: getEnrollmentStartDate(enrollment, cls) };
  }
  if (!enrollment) {
    return { eligible: true };
  }
  const statusStr = String(enrollment.status || '');
  if (statusStr === 'cancelled' || statusStr === 'canceled') {
    return { eligible: false, reason: 'cancelled' };
  }
  if (
    statusStr === 'dropped' ||
    statusStr === 'trial_dropped' ||
    statusStr === 'transferred'
  ) {
    const dropDate = getEnrollmentDropDate(enrollment);
    if (!dropDate || cleanSessionDate >= dropDate) {
      return { eligible: false, reason: 'dropped' };
    }
  }
  if (cls) {
    const { startDate, endDate } = getClassEffectiveBounds(cls, terms);
    if ((startDate && cleanSessionDate < startDate) || (endDate && cleanSessionDate > endDate)) {
      return { eligible: false, reason: 'out_of_class_bounds' };
    }
  }
  const enrStartDate = getEnrollmentStartDate(enrollment, cls);
  if (enrStartDate && cleanSessionDate < enrStartDate) {
    return { eligible: false, reason: 'not_started', startDate: enrStartDate };
  }
  const effectiveStudentDays =
    enrollment.enrolled_days_of_week && enrollment.enrolled_days_of_week.length > 0
      ? enrollment.enrolled_days_of_week
      : classDays && classDays.length > 0
      ? classDays
      : [];
  if (effectiveStudentDays.length > 0) {
    const dayCode = getDayCodeFromDate(cleanSessionDate);
    if (!effectiveStudentDays.includes(dayCode)) {
      return { eligible: false, reason: 'weekday_mismatch', startDate: enrStartDate };
    }
  }
  return { eligible: true, startDate: enrStartDate };
}

export function isStudentScheduledForDate(
  enrollment: Enrollment | undefined,
  sessionDate: string,
  classDays?: string[],
  cls?: ExtracurricularClass,
  terms: AcademicTerm[] = [],
  hasSavedAttendance = false
): boolean {
  return evaluateStudentSessionEligibility(
    enrollment,
    sessionDate,
    classDays,
    cls,
    terms,
    hasSavedAttendance
  ).eligible;
}
