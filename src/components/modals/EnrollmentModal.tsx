import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  GraduationCap, 
  BookOpen, 
  Calendar, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { Student, ExtracurricularClass, Enrollment, TuitionInvoice, AppStore, Holiday, AcademicTerm } from '../../types';
import { 
  formatVND, 
  deduplicateEnrollments, 
  getClassDaysOfWeek, 
  getDayLabel, 
  formatDaysListLabel, 
  formatStudentScheduleLabel, 
  getDefaultClassStartDate, 
  formatDateVN 
} from '../../lib/storage';
import { showToast } from '../../lib/toast';
import { getSupabaseClient, supabase } from '../../supabaseClient';
import { DatePickerVN } from '../common/DatePickerVN';

// Ánh xạ thứ sang chỉ số ngày trong JavaScript Date (0 = Chủ Nhật, 1 = Thứ 2, ..., 6 = Thứ 7)
export const DAY_MAP: Record<string, number> = {
  'CN': 0,
  'T2': 1,
  'T3': 2,
  'T4': 3,
  'T5': 4,
  'T6': 5,
  'T7': 6,
};

/**
 * Kiểm tra xem một ngày cụ thể có rơi vào kỳ nghỉ lễ đang active (thuộc cơ sở tương ứng hoặc toàn trường) hay không
 */
export function isDateInHoliday(
  dateObj: Date,
  holidays: Holiday[] = [],
  campusId?: string | null
): boolean {
  if (!holidays || holidays.length === 0) return false;
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;
  const monthDay = `${m}-${d}`;

  const normalizedCampus = campusId
    ? (campusId.startsWith('camp_') ? campusId : `camp_${campusId}`)
    : null;

  return holidays.some((h) => {
    if (h.status && h.status !== 'active') return false;
    // Nếu kỳ nghỉ lễ chỉ định cơ sở cụ thể, kiểm tra khớp cơ sở của lớp học
    if (h.campus_id && normalizedCampus && h.campus_id !== normalizedCampus) {
      return false;
    }
    if (!h.start_date || !h.end_date) return false;

    if (dateStr >= h.start_date && dateStr <= h.end_date) {
      return true;
    }
    // Hỗ trợ ngày nghỉ lễ lặp lại hàng năm (is_recurring)
    if (h.is_recurring) {
      const startMD = h.start_date.slice(5);
      const endMD = h.end_date.slice(5);
      if (startMD <= endMD && monthDay >= startMD && monthDay <= endMD) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Hàm thuật toán đếm số buổi học thực tế theo lịch (Calendar Exact Count)
 * Tự động loại trừ các ngày nghỉ lễ đang active (thuộc cơ sở tương ứng hoặc toàn trường)
 */
export function calculateActualSessions(
  startDateStr: string,
  endDateStr: string,
  selectedDayCodes: string[], // ví dụ: ['T2', 'T4']
  holidays: Holiday[] = [],
  campusId?: string | null
): number {
  if (!startDateStr || !endDateStr || selectedDayCodes.length === 0) return 0;

  const targetDayIndices = selectedDayCodes.map((code) => DAY_MAP[code]).filter((v) => v !== undefined);
  
  const cur = new Date(startDateStr);
  const end = new Date(endDateStr);
  
  // Chuẩn hóa giờ về 00:00:00 để so sánh chuẩn xác
  cur.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (cur > end) return 0;

  let sessionCount = 0;
  while (cur <= end) {
    if (
      targetDayIndices.includes(cur.getDay()) &&
      !isDateInHoliday(cur, holidays, campusId)
    ) {
      sessionCount++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return sessionCount;
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export interface EnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollingStudent: Student | null;
  store: AppStore;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onSuccess?: (enrollment: Enrollment) => void;
}

export const EnrollmentModal: React.FC<EnrollmentModalProps> = ({
  isOpen,
  onClose,
  enrollingStudent,
  store,
  onUpdateStore,
  onSuccess,
}) => {
  // Lọc danh sách các lớp học sinh đã ghi danh đang active
  const enrolledClassIds = useMemo(() => {
    if (!enrollingStudent) return [];
    return store.enrollments
      .filter((e) => String(e.student_id) === String(enrollingStudent.id) && e.status === 'active')
      .map((e) => String(e.class_id));
  }, [store.enrollments, enrollingStudent?.id]);

  // Danh sách Khóa học (Academic Terms) & Khóa học đang chọn
  const [terms, setTerms] = useState<AcademicTerm[]>(store.terms || []);
  const [selectedTermId, setSelectedTermId] = useState<string>(() => {
    const activeTerm = (store.terms || []).find(
      (t: any) => t.is_active || t.status === 'active' || t.status === 'recruiting' || t.status === 'open_enrollment' || t.status === 'in_progress'
    ) || store.terms?.[0];
    return activeTerm?.id || '';
  });

  // Lọc các lớp thuộc khóa học đang chọn
  const termClasses = useMemo(() => {
    if (!selectedTermId) return store.classes;
    return store.classes.filter(
      (cls) => cls.term_id === selectedTermId || (cls as any).primary_term_id === selectedTermId
    );
  }, [store.classes, selectedTermId]);

  const availableClasses = useMemo(() => {
    return termClasses.filter((cls) => !enrolledClassIds.includes(String(cls.id)));
  }, [termClasses, enrolledClassIds]);

  // Lọc danh sách môn học mở trong khóa học đang chọn
  const activeTermSubjects = useMemo(() => {
    if (!selectedTermId) return store.subjects;

    const termSubjectIds = new Set(
      (store.termSubjects || [])
        .filter((ts) => ts.term_id === selectedTermId && (ts.is_active === undefined || ts.is_active))
        .map((ts) => ts.subject_id)
    );

    const subjectsWithClasses = new Set(termClasses.map((c) => String(c.subject_id)));

    if (termSubjectIds.size > 0 || subjectsWithClasses.size > 0) {
      return store.subjects.filter(
        (s) => termSubjectIds.has(s.id) || subjectsWithClasses.has(String(s.id)) || termSubjectIds.has(s.code)
      );
    }

    return store.subjects;
  }, [store.subjects, store.termSubjects, selectedTermId, termClasses]);

  // Form State
  const [selectedEnrollSubjectId, setSelectedEnrollSubjectId] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    return availableClasses[0]?.id || termClasses[0]?.id || store.classes[0]?.id || '';
  });

  // Nạp danh sách Khóa học từ Supabase (bảng academic_terms)
  useEffect(() => {
    let isMounted = true;
    const fetchTerms = async () => {
      const client = getSupabaseClient() || supabase;
      if (!client) {
        if (store.terms && store.terms.length > 0 && isMounted) {
          setTerms(store.terms);
          const activeTerm = store.terms.find(
            (t: any) => t.is_active || t.status === 'active' || t.status === 'recruiting' || t.status === 'open_enrollment' || t.status === 'in_progress'
          ) || store.terms[0];
          if (activeTerm && !selectedTermId) {
            setSelectedTermId(activeTerm.id);
          }
        }
        return;
      }

      try {
        const { data, error } = await client
          .from('academic_terms')
          .select('*')
          .order('start_date', { ascending: false });

        if (isMounted) {
          const termsData = (!error && data && data.length > 0) ? (data as AcademicTerm[]) : store.terms;
          if (termsData && termsData.length > 0) {
            setTerms(termsData);
            const activeTerm = termsData.find(
              (t: any) => t.is_active || t.status === 'active' || t.status === 'recruiting' || t.status === 'open_enrollment' || t.status === 'in_progress'
            ) || termsData[0];
            if (activeTerm && !selectedTermId) {
              setSelectedTermId(activeTerm.id);
            }
          }
        }
      } catch (err) {
        console.warn('Lỗi tải academic_terms từ supabase:', err);
      }
    };

    fetchTerms();
    return () => { isMounted = false; };
  }, [store.terms]);

  // Xử lý khi thay đổi Khóa học (Academic Term)
  const handleTermChange = (newTermId: string) => {
    setSelectedTermId(newTermId);
    setSelectedEnrollSubjectId('all');

    const newTermClasses = store.classes.filter(
      (c) => (c.term_id === newTermId || (c as any).primary_term_id === newTermId) && !enrolledClassIds.includes(String(c.id))
    );
    if (newTermClasses.length > 0) {
      setSelectedClassId(newTermClasses[0].id);
    } else {
      const anyInTerm = store.classes.filter(
        (c) => c.term_id === newTermId || (c as any).primary_term_id === newTermId
      );
      setSelectedClassId(anyInTerm[0]?.id || '');
    }
  };

  // Đồng bộ selectedClassId khi termClasses thay đổi
  useEffect(() => {
    if (!selectedTermId) return;
    const isCurrentValid = termClasses.some((c) => String(c.id) === String(selectedClassId));
    if (!isCurrentValid && termClasses.length > 0) {
      const openClass = termClasses.find((c) => !enrolledClassIds.includes(String(c.id))) || termClasses[0];
      setSelectedClassId(openClass?.id || '');
    }
  }, [selectedTermId, termClasses, selectedClassId, enrolledClassIds]);

  const [isTrialMode, setIsTrialMode] = useState<boolean>(false);
  const [trialSessionDate, setTrialSessionDate] = useState<string>('');

  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>('');

  const [calculatedSessions, setCalculatedSessions] = useState<number>(16);
  const [manualSessions, setManualSessions] = useState<number>(16);
  const [isManualOverride, setIsManualOverride] = useState<boolean>(false);
  const [totalTuition, setTotalTuition] = useState<number>(0);

  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeHolidays, setActiveHolidays] = useState<Holiday[]>(
    (store.holidays || []).filter((h) => h.status !== 'inactive')
  );

  // Nạp danh sách ngày nghỉ lễ đang active từ Supabase để loại trừ khi đếm buổi thực học
  useEffect(() => {
    const fetchActiveHolidays = async () => {
      const client = getSupabaseClient() || supabase;
      if (!client) return;
      try {
        const { data, error } = await client
          .from('holidays')
          .select('*')
          .eq('status', 'active')
          .order('start_date', { ascending: true });
        if (!error && Array.isArray(data)) {
          setActiveHolidays(data as Holiday[]);
          onUpdateStore((prev) => ({
            ...prev,
            holidays: data as Holiday[],
          }));
        }
      } catch (err) {
        console.warn('Lỗi tải holidays khi xếp lớp:', err);
      }
    };
    fetchActiveHolidays();
  }, []);

  // Selected Class & Subject
  const selectedClass = useMemo(() => {
    return store.classes.find(c => String(c.id) === String(selectedClassId));
  }, [store.classes, selectedClassId]);

  const selectedSubject = useMemo(() => {
    if (!selectedClass) return undefined;
    return store.subjects.find(
      s => String(s.id) === String(selectedClass.subject_id) || s.code === (selectedClass as any).subject_code
    );
  }, [store.subjects, selectedClass]);

  // Total schedule days of the selected class
  const totalClassDays: string[] = useMemo(() => {
    if (!selectedClass) return [];
    return Array.isArray(selectedClass.days_of_week) && selectedClass.days_of_week.length > 0
      ? selectedClass.days_of_week
      : (Array.isArray((selectedClass as any).schedule_days) && (selectedClass as any).schedule_days.length > 0
          ? (selectedClass as any).schedule_days
          : getClassDaysOfWeek(selectedClass, store));
  }, [selectedClass, store]);

  const classDaysCount = Math.max(1, totalClassDays.length);

  // When selectedClass changes: initialize selectedDays and startDate
  useEffect(() => {
    if (!selectedClass) return;

    const initialDays = totalClassDays.length > 0 ? totalClassDays : ['T2', 'T4'];
    setSelectedDays(initialDays);

    const term = store.terms?.find(t => t.id === selectedClass.term_id);
    const classStart = selectedClass.start_date || term?.start_date || '2026-09-01';
    const classEnd = selectedClass.end_date || term?.end_date || '2026-12-25';
    const todayStr = new Date().toISOString().split('T')[0];

    let initialStart = classStart;
    if (todayStr >= classStart && todayStr <= classEnd) {
      initialStart = getDefaultClassStartDate(selectedClass, store, todayStr, initialDays);
      if (initialStart < classStart) initialStart = classStart;
      if (initialStart > classEnd) initialStart = classEnd;
    }

    setStartDate(initialStart);
    setTrialSessionDate(initialStart);
    setIsManualOverride(false);
    setEnrollmentError(null);
  }, [selectedClassId]);

  // Reactive Calculation: Each time startDate, selectedDays, selectedClass, or activeHolidays changes
  useEffect(() => {
    if (!selectedClass || !startDate) return;

    const term = store.terms?.find(t => t.id === selectedClass.term_id);
    const classEnd = selectedClass.end_date || term?.end_date || '2026-12-25';

    // 1. Tính số buổi thực tế từ ngày bắt đầu đến ngày kết thúc lớp (đã trừ ngày nghỉ lễ active)
    const actualSessions = isTrialMode ? 1 : calculateActualSessions(
      startDate,
      classEnd,
      selectedDays,
      activeHolidays,
      selectedClass.campus_id
    );

    // 2. Cập nhật vào state hiển thị và ô điều chỉnh thủ công
    setCalculatedSessions(actualSessions);
    if (!isManualOverride) {
      setManualSessions(actualSessions);
    }

    // 3. Tính tổng học phí
    const effectiveSessionsToCharge = isManualOverride ? manualSessions : actualSessions;
    const rate = Number(
      selectedClass.price_per_session || 
      (selectedClass as any)?.session_rate || 
      selectedSubject?.standard_session_rate || 
      (selectedSubject?.standard_course_fee && selectedClass.total_sessions 
        ? Math.ceil(selectedSubject.standard_course_fee / selectedClass.total_sessions) 
        : 250000)
    );
    const totalFee = isTrialMode ? 0 : (effectiveSessionsToCharge * rate);
    setTotalTuition(totalFee);
  }, [startDate, selectedDays, selectedClassId, isTrialMode, isManualOverride, manualSessions, activeHolidays]);

  // Ràng buộc triệt để thuộc tính min và max cho ô Input Date
  const handleStartDateInputChange = (val: string) => {
    if (!selectedClass) {
      setStartDate(val);
      return;
    }

    const term = store.terms?.find(t => t.id === selectedClass.term_id);
    const minDate = selectedClass.start_date || term?.start_date || '';
    const maxDate = selectedClass.end_date || term?.end_date || '';

    let clamped = val;
    // Khi người dùng gõ đủ chuỗi ngày tháng YYYY-MM-DD (10 ký tự)
    if (val && val.length === 10) {
      if (minDate && val < minDate) {
        clamped = minDate;
      } else if (maxDate && val > maxDate) {
        clamped = maxDate;
      }
    }
    setStartDate(clamped);
    setTrialSessionDate(clamped);
    setIsManualOverride(false);
  };

  const handleStartDateBlur = () => {
    if (!selectedClass || !startDate) return;
    const term = store.terms?.find(t => t.id === selectedClass.term_id);
    const minDate = selectedClass.start_date || term?.start_date || '';
    const maxDate = selectedClass.end_date || term?.end_date || '';

    let clamped = startDate;
    if (minDate && startDate < minDate) {
      clamped = minDate;
    } else if (maxDate && startDate > maxDate) {
      clamped = maxDate;
    }
    setStartDate(clamped);
    setTrialSessionDate(clamped);
  };

  // Switch to next session button
  const handleNextSessionClick = () => {
    if (!selectedClass) return;
    const term = store.terms?.find(t => t.id === selectedClass.term_id);
    const classStart = selectedClass.start_date || term?.start_date || '2026-09-01';
    const classEnd = selectedClass.end_date || term?.end_date || '2026-12-25';
    const todayStr = new Date().toISOString().split('T')[0];

    const baseRef = todayStr < classStart ? classStart : todayStr;
    let nextDate = getDefaultClassStartDate(selectedClass, store, baseRef, selectedDays);

    if (nextDate < classStart) nextDate = classStart;
    if (nextDate > classEnd) nextDate = classEnd;

    handleStartDateInputChange(nextDate);
  };

  const isCurrentClassAlreadyEnrolled = Boolean(selectedClassId && enrolledClassIds.includes(String(selectedClassId)));

  const filteredClassesToDisplay = useMemo(() => {
    if (selectedEnrollSubjectId === 'all') return termClasses;
    return termClasses.filter(
      c => String(c.subject_id) === String(selectedEnrollSubjectId) || (c as any).subject_code === String(selectedEnrollSubjectId)
    );
  }, [termClasses, selectedEnrollSubjectId]);

  const rate = Number(
    selectedClass?.price_per_session || 
    (selectedClass as any)?.session_rate || 
    selectedSubject?.standard_session_rate || 
    250000
  );

  const effectiveSessions = isTrialMode ? 1 : (isManualOverride ? manualSessions : calculatedSessions);

  if (!isOpen || !enrollingStudent) return null;

  // Form submission
  const handleConfirmEnrollment = async () => {
    if (!enrollingStudent) return;
    if (!selectedClassId || !selectedClass) {
      setEnrollmentError('Vui lòng chọn lớp học để ghi danh!');
      return;
    }

    if (isCurrentClassAlreadyEnrolled) {
      setEnrollmentError(`Học viên này đã được ghi danh vào lớp "${selectedClass.name}". Không thể đăng ký trùng lặp!`);
      return;
    }

    if (!startDate) {
      setEnrollmentError('Vui lòng chọn ngày bắt đầu học chính thức!');
      return;
    }

    const term = store.terms?.find(t => t.id === selectedClass.term_id);
    const minDate = selectedClass.start_date || term?.start_date;
    const maxDate = selectedClass.end_date || term?.end_date;

    if (minDate && startDate < minDate) {
      setEnrollmentError(`Ngày bắt đầu học không hợp lệ! Lớp học này chỉ mở từ ngày ${formatDateVN(minDate)}.`);
      return;
    }
    if (maxDate && startDate > maxDate) {
      setEnrollmentError(`Ngày bắt đầu học không hợp lệ! Lớp học này kết thúc vào ngày ${formatDateVN(maxDate)}.`);
      return;
    }

    setEnrollmentError(null);
    setIsSubmitting(true);

    try {
      // Luôn ưu tiên student.id trước, nếu không có mới dùng student.code
      const resolvedStudentId = enrollingStudent.id || enrollingStudent.code;
      const resolvedStudentCode = enrollingStudent.code || enrollingStudent.id;

      const isPartial = selectedDays.length < classDaysCount;
      const existingLocalEnr = store.enrollments.find(
        e =>
          (String(e.student_id) === String(resolvedStudentId) || String(e.student_id) === String(resolvedStudentCode)) &&
          String(e.class_id) === String(selectedClass.id)
      );
      let enrollmentId = existingLocalEnr?.id || `ENR-${Date.now()}`;
      const trialDateVal = trialSessionDate || startDate;

      let invoiceId = `inv_${Date.now()}`;
      let invoiceCode = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const grossAmount = isTrialMode ? 0 : totalTuition;
      const todayStr = new Date().toISOString().split('T')[0];
      const subShortName = (selectedSubject?.name || selectedClass.name).split('(')[0].trim();
      const totalStd = selectedClass.standard_sessions || selectedSubject?.standard_sessions || selectedClass.total_sessions || 24;
      const scheduleLabel = formatStudentScheduleLabel(selectedDays, totalClassDays);
      const proratedNote = isPartial
        ? `Học phí môn ${subShortName} - Lịch học riêng: [${scheduleLabel}] (${effectiveSessions} buổi x ${formatVND(rate)}/buổi)`
        : `Học phí môn ${subShortName}: ${effectiveSessions}/${totalStd} buổi (${formatDaysListLabel(totalClassDays)})`;
      const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      let finalStudentId = resolvedStudentId;

      const client = getSupabaseClient() || supabase;
      if (client) {
        // 1. Gọi hàm RPC create_enrollment_with_invoice (đảm bảo toàn vẹn khóa ngoại trong 1 giao dịch)
        const { data: rpcRes, error: rpcErr } = await client.rpc('create_enrollment_with_invoice', {
          p_student_id: resolvedStudentId,
          p_student_code: resolvedStudentCode,
          p_student_name: enrollingStudent.name,
          p_class_id: selectedClass.id,
          p_is_trial: isTrialMode,
          p_start_date: isTrialMode ? trialDateVal : startDate,
          p_sessions: isTrialMode ? 1 : effectiveSessions,
          p_session_rate: isTrialMode ? 0 : rate,
          p_total_amount: grossAmount,
          p_campus_id: enrollingStudent.campus_id || selectedClass.campus_id || 'pmh',
          p_is_royal: Boolean(enrollingStudent.is_royal_student),
          p_parent_name: enrollingStudent.parent_name || 'Phụ huynh',
          p_parent_phone: enrollingStudent.parent_phone || ''
        });

        if (!rpcErr && (!rpcRes || rpcRes.success !== false)) {
          if (rpcRes?.student_id) finalStudentId = rpcRes.student_id;
          if (rpcRes?.enrollment_id) enrollmentId = rpcRes.enrollment_id;
          if (rpcRes?.invoice_id) invoiceId = rpcRes.invoice_id;
          if (rpcRes?.invoice_code) invoiceCode = rpcRes.invoice_code;

          // Đồng bộ bổ sung lịch học riêng (enrolled_days_of_week, is_partial_schedule) nếu có
          await client
            .from('enrollments')
            .update({
              enrolled_days_of_week: isTrialMode ? [] : selectedDays,
              is_partial_schedule: isTrialMode ? false : isPartial,
            })
            .eq('student_id', finalStudentId)
            .eq('class_id', selectedClass.id);
        } else {
          console.warn('RPC create_enrollment_with_invoice thông báo, chuyển sang đồng bộ bảo đảm khóa ngoại:', rpcErr || rpcRes?.error);

          // Đảm bảo học sinh tồn tại trong bảng students và lấy đúng id khóa chính
          const { data: remoteStu } = await client
            .from('students')
            .select('id, code')
            .or(`id.eq.${resolvedStudentId},code.eq.${resolvedStudentCode}`)
            .maybeSingle();

          if (remoteStu?.id) {
            finalStudentId = remoteStu.id;
          } else {
            const studentPayload: any = {
              id: resolvedStudentId,
              code: resolvedStudentCode,
              name: enrollingStudent.name,
              dob: enrollingStudent.dob || '2016-01-01',
              gender: enrollingStudent.gender || 'Nam',
              is_royal_student: Boolean(enrollingStudent.is_royal_student),
              campus_id: enrollingStudent.campus_id === 'pl' ? 'pl' : 'pmh',
              school_name: enrollingStudent.school_name || 'Royal School',
              regular_class: enrollingStudent.regular_class || '',
              parent_name: enrollingStudent.parent_name || 'Phụ huynh',
              parent_phone: enrollingStudent.parent_phone || '',
              medical_notes: enrollingStudent.medical_notes || '',
              status: 'active',
            };
            await client.from('students').upsert([studentPayload], { onConflict: 'id' });
          }

          const { data: existingRemoteEnr } = await client
            .from('enrollments')
            .select('id')
            .eq('student_id', finalStudentId)
            .eq('class_id', selectedClass.id)
            .maybeSingle();

          if (existingRemoteEnr?.id) {
            enrollmentId = existingRemoteEnr.id;
          }

          const payload: any = {
            id: enrollmentId,
            student_id: finalStudentId,
            class_id: selectedClass.id,
            registered_sessions: isTrialMode ? 1 : effectiveSessions,
            enrolled_days_of_week: isTrialMode ? [] : selectedDays,
            is_partial_schedule: isTrialMode ? false : isPartial,
            is_trial: isTrialMode,
            enrollment_type: isTrialMode ? 'trial' : 'official',
            trial_session_date: isTrialMode ? trialDateVal : null,
            trial_attended: false,
            status: isTrialMode ? 'trial' : 'active',
            joined_date: startDate,
          };

          const { error: enrErr } = await client
            .from('enrollments')
            .upsert([payload], { onConflict: 'student_id,class_id' });

          if (enrErr) {
            delete payload.enrollment_type;
            const { error: fbErr } = await client
              .from('enrollments')
              .upsert([payload], { onConflict: 'student_id,class_id' });
            if (fbErr) {
              throw new Error(fbErr.message);
            }
          }

          const invoicePayload = {
            id: invoiceId,
            invoice_code: invoiceCode,
            student_id: finalStudentId,
            class_id: selectedClass.id,
            registered_sessions: isTrialMode ? 1 : effectiveSessions,
            total_class_sessions: totalStd,
            session_rate: isTrialMode ? 0 : rate,
            gross_amount: grossAmount,
            credit_deducted: 0,
            discount_amount: 0,
            net_payable: grossAmount,
            paid_amount: 0,
            outstanding_amount: grossAmount,
            payment_status: isTrialMode ? 'trial_pending' : 'unpaid',
            due_date: dueDate,
            payment_history: [],
            created_at: todayStr,
            updated_at: new Date().toISOString()
          };

          const { error: invError } = await client
            .from('tuition_invoices')
            .upsert([invoicePayload], { onConflict: 'id' });

          if (invError) {
            throw new Error(invError.message);
          }
        }
      }

      // 3. Tạo đối tượng Enrollment & TuitionInvoice cho Local Store
      const newEnrollment: Enrollment = {
        id: enrollmentId,
        student_id: finalStudentId,
        class_id: selectedClass.id,
        registered_sessions: isTrialMode ? 1 : effectiveSessions,
        joined_date: startDate,
        enrolled_days_of_week: isTrialMode ? [] : selectedDays,
        is_partial_schedule: isTrialMode ? false : isPartial,
        status: isTrialMode ? 'trial' : 'active',
        is_trial: isTrialMode,
        trial_session_date: isTrialMode ? trialDateVal : undefined,
        trial_attended: false,
        trial_notes: isTrialMode
          ? `Học sinh đăng ký học thử 1 buổi đầu tiên từ ngày ${formatDateVN(trialDateVal)} (${scheduleLabel})`
          : undefined,
        ...({ enrollment_type: isTrialMode ? 'trial' : 'official' } as any),
      };

      const newInvoice: TuitionInvoice = {
        id: invoiceId,
        invoice_code: invoiceCode,
        student_id: finalStudentId,
        class_id: selectedClass.id,
        gross_amount: grossAmount,
        discount_amount: 0,
        credit_deducted: 0,
        net_payable: grossAmount,
        paid_amount: 0,
        outstanding_amount: grossAmount,
        payment_status: isTrialMode ? 'trial_pending' : 'unpaid',
        due_date: dueDate,
        is_trial_pending: isTrialMode,
        trial_fee: 0,
        registered_sessions: isTrialMode ? 1 : effectiveSessions,
        total_class_sessions: totalStd,
        session_rate: isTrialMode ? 0 : rate,
        start_date: startDate,
        enrolled_days_of_week: isTrialMode ? [] : selectedDays,
        is_partial_schedule: isPartial,
        is_prorated: isPartial,
        prorated_note: proratedNote,
        payment_history: [],
        created_at: todayStr,
      };

      onUpdateStore((prev) => {
        const cleanExisting = prev.enrollments.filter(
          (e) =>
            !(
              (e.student_id === finalStudentId || e.student_id === resolvedStudentId || e.student_id === resolvedStudentCode) &&
              e.class_id === selectedClass.id
            )
        );
        const cleanEnrollments = deduplicateEnrollments([...cleanExisting, newEnrollment]);
        return {
          ...prev,
          enrollments: cleanEnrollments,
          invoices: [newInvoice, ...(prev.invoices || []).filter(i => i.id !== invoiceId)],
        };
      });

      showToast(
        isTrialMode
          ? `Ghi danh thành công! Đã đăng ký học thử 1 buổi (Mã HĐ: ${invoiceCode})`
          : `Ghi danh thành công! Đã tạo hóa đơn: ${invoiceCode} (${formatVND(grossAmount)})`,
        'success',
        { title: isTrialMode ? 'Đăng ký học thử thành công' : 'Ghi danh & Tạo hóa đơn thành công' }
      );

      onSuccess?.(newEnrollment);
      onClose();
    } catch (err: any) {
      console.error('Lỗi khi ghi danh học sinh:', err);
      alert('Không thể lưu ghi danh: ' + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4 animate-fadeIn max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-amber-400" />
            <span>Ghi Danh Lớp &amp; Tạo Hóa Đơn Tách Biệt</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-slate-400 flex items-center justify-between pb-2 border-b border-slate-800">
          <span>
            Học sinh: <strong className="text-white">{enrollingStudent.name}</strong> ({enrollingStudent.code})
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px]">
            Đang học {enrolledClassIds.length} lớp
          </span>
        </div>

        {/* Lỗi chọn trùng lớp đã ghi danh */}
        {isCurrentClassAlreadyEnrolled && selectedClass && (
          <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">
              Học viên này đã được ghi danh vào lớp "{selectedClass.name}". Không thể đăng ký trùng lặp!
            </span>
          </div>
        )}

        {/* Thông báo lỗi thao tác nếu có */}
        {enrollmentError && (
          <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{enrollmentError}</span>
          </div>
        )}

        <div className="space-y-3.5 text-xs">
          {/* 0. Chọn Khóa học */}
          <div className="space-y-1.5 pb-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>0. Chọn Khóa học (Academic Term) <span className="text-rose-400">*</span>:</span>
              </label>
              {selectedTermId && (
                <span className="text-[11px] text-slate-400 font-medium">
                  {terms.find(t => t.id === selectedTermId)?.name}
                </span>
              )}
            </div>

            <select
              value={selectedTermId}
              onChange={(e) => handleTermChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-amber-500 transition-colors"
            >
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name} {term.is_active ? '★ (Đang tuyển sinh / Diễn ra)' : ''} [{term.start_date ? formatDateVN(term.start_date) : ''} - {term.end_date ? formatDateVN(term.end_date) : ''}]
                </option>
              ))}
            </select>
          </div>

          {/* 1. Chọn Môn Học */}
          <div>
            <label className="block text-slate-400 font-medium mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>1. Chọn môn học:</span>
              </span>
              {selectedEnrollSubjectId !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedEnrollSubjectId('all')}
                  className="text-[10px] text-amber-300 hover:underline cursor-pointer"
                >
                  Xem tất cả môn ({activeTermSubjects.length})
                </button>
              )}
            </label>
            <select
              value={selectedEnrollSubjectId}
              onChange={(e) => {
                const subId = e.target.value;
                setSelectedEnrollSubjectId(subId);
                const matching = subId === 'all'
                  ? availableClasses
                  : availableClasses.filter(c => String(c.subject_id) === String(subId) || (c as any).subject_code === String(subId));
                if (matching.length > 0) {
                  setSelectedClassId(matching[0].id);
                } else {
                  const anyMatching = subId === 'all'
                    ? termClasses
                    : termClasses.filter(c => String(c.subject_id) === String(subId) || (c as any).subject_code === String(subId));
                  if (anyMatching.length > 0) {
                    setSelectedClassId(anyMatching[0].id);
                  }
                }
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="all">-- Tất cả môn học ({activeTermSubjects.length} môn) --</option>
              {activeTermSubjects.map((s) => {
                const openCount = termClasses.filter(
                  (c) => (String(c.subject_id) === String(s.id) || (c as any).subject_code === String(s.code)) &&
                         !enrolledClassIds.includes(String(c.id))
                ).length;
                return (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code}) - Chuẩn {s.standard_sessions || 24}b &bull; {s.standard_duration || '90p'} [{openCount} lớp mở]
                  </option>
                );
              })}
            </select>
          </div>

          {/* 2. Chọn Lớp Học Cụ Thể */}
          <div>
            <label className="block text-slate-400 font-medium mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-cyan-400" />
                <span>2. Chọn lớp học cụ thể <span className="text-rose-400">*</span>:</span>
              </span>
              <span className="text-[10px] text-slate-500">
                ({filteredClassesToDisplay.length} lớp{selectedEnrollSubjectId !== 'all' ? ' theo môn' : ''})
              </span>
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl bg-slate-900 border text-white font-semibold focus:outline-none transition-colors ${
                isCurrentClassAlreadyEnrolled
                  ? 'border-rose-500/60 focus:border-rose-500' 
                  : 'border-slate-700 focus:border-amber-500'
              }`}
            >
              <option value="" disabled>-- Chọn lớp học cần ghi danh --</option>
              {filteredClassesToDisplay.map((c) => {
                const isEnrolled = enrolledClassIds.includes(String(c.id));
                const campus = store.campuses.find((cp) => cp.id === c.campus_id);
                const teacher = store.teachers.find((t) => t.id === c.primary_teacher_id);
                const clsDays = Array.isArray(c.days_of_week) && c.days_of_week.length > 0
                  ? c.days_of_week
                  : (Array.isArray((c as any).schedule_days) && (c as any).schedule_days.length > 0
                      ? (c as any).schedule_days
                      : getClassDaysOfWeek(c, store));
                const campusLabel = campus ? campus.name.split('-')[0].trim() : (c.campus_id || '').toUpperCase();
                const teacherLabel = teacher ? teacher.name : 'Chưa phân công GV';
                const daysLabel = clsDays.join(', ');

                return (
                  <option 
                    key={c.id} 
                    value={c.id} 
                    disabled={isEnrolled}
                    className={isEnrolled ? 'text-slate-500 bg-slate-900 font-normal italic' : 'text-white bg-slate-900 font-semibold'}
                  >
                    {c.name} &bull; [{campusLabel}] &bull; Thứ: [{daysLabel}] &bull; GV: {teacherLabel} {isEnrolled ? '⛔ [ĐÃ GHI DANH]' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 3. Hiển Thị Chi Tiết Môn & Đơn Giá Chuẩn */}
          {selectedClass && (
            <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs animate-fadeIn">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-400 block font-medium">Tên môn học</span>
                <span className="font-bold text-white truncate block">{selectedSubject?.name || selectedClass.name}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-400 block font-medium">Thời lượng chuẩn</span>
                <span className="font-semibold text-cyan-300 block">{selectedSubject?.standard_duration || '90 phút'}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-400 block font-medium">Số buổi chuẩn lớp</span>
                <span className="font-mono font-bold text-amber-400 block">{selectedClass.total_sessions || 24} buổi</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-400 block font-medium">Đơn giá buổi (R)</span>
                <span className="font-mono font-bold text-emerald-400 block">{new Intl.NumberFormat('vi-VN').format(rate)} đ/b</span>
              </div>
            </div>
          )}

          {/* 4. Hình thức: Học chính thức vs Học thử 1 buổi */}
          <div className="space-y-1.5">
            <label className="block text-slate-400 font-medium">
              4. Hình thức: Học chính thức vs Học thử 1 buổi <span className="text-rose-400">*</span>:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsTrialMode(false)}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                  !isTrialMode
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/60 shadow-sm ring-1 ring-emerald-500/30'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${!isTrialMode ? 'border-emerald-400 bg-emerald-400' : 'border-slate-600'}`}>
                  {!isTrialMode && <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                </span>
                <span>🎓 Học Chính Thức</span>
              </button>
              <button
                type="button"
                onClick={() => setIsTrialMode(true)}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                  isTrialMode
                    ? 'bg-purple-500/25 text-purple-200 border-purple-500/60 shadow-sm ring-1 ring-purple-500/30'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isTrialMode ? 'border-purple-400 bg-purple-400' : 'border-slate-600'}`}>
                  {isTrialMode && <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                </span>
                <span>🧪 Học Thử 1 Buổi Đầu</span>
              </button>
            </div>
          </div>

          {/* 5. Cấu hình chi tiết */}
          {selectedClass && (
            <div className="space-y-3">
              {isTrialMode ? (
                /* KHU VỰC HỌC THỬ 1 BUỔI */
                <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/40 space-y-3 animate-fadeIn">
                  <div className="flex items-center gap-2 text-purple-200 font-bold text-xs">
                    <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Chế độ: Đăng Ký Học Thử 1 Buổi Đầu Tiên</span>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-purple-400" />
                        <span>Chọn ngày học thử <span className="text-rose-400">*</span>:</span>
                      </span>
                      <span className="text-[10px] text-purple-300 font-mono">Ca gần nhất: {formatDate(startDate)}</span>
                    </label>
                    <DatePickerVN
                      value={trialSessionDate || startDate}
                      min={selectedClass.start_date}
                      max={selectedClass.end_date}
                      onChange={(newDate) => {
                        handleStartDateInputChange(newDate);
                      }}
                      disabled={isCurrentClassAlreadyEnrolled}
                      placeholder="DD/MM/YYYY"
                      required
                      className="py-2.5 font-bold"
                    />
                    {(selectedClass.start_date || selectedClass.end_date) && (
                      <p className="text-xs text-amber-400/80 mt-1">
                        Thời gian lớp mở: {formatDate(selectedClass.start_date)} đến {formatDate(selectedClass.end_date)}
                      </p>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-purple-500/20 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>Lớp học thử:</span>
                      <strong className="text-white">{selectedClass.name}</strong>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Số buổi đăng ký:</span>
                      <span className="font-mono font-bold text-purple-300">1 buổi (is_trial = true)</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-800">
                      <span className="font-semibold text-emerald-400">Học phí học thử:</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">0 đ</span>
                    </div>
                    <div className="text-[11px] text-purple-200/90 italic pt-1">
                      ✨ Học thử miễn phí 1 buổi. Sau khi học xong ca này, học vụ có thể xác nhận lên chính thức hoặc hoàn tất đăng ký.
                    </div>
                  </div>
                </div>
              ) : (
                /* KHU VỰC HỌC CHÍNH THỨC */
                <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3 animate-fadeIn">
                  {/* Checkbox chọn lịch học theo thứ */}
                  <div className="space-y-1.5 pb-2.5 border-b border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-white flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-400" />
                        <span>Chọn ngày học trong tuần của bé <span className="text-rose-400">*</span>:</span>
                      </label>
                      {selectedDays.length < classDaysCount && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDays([...totalClassDays]);
                            setIsManualOverride(false);
                          }}
                          className="text-[10px] text-amber-300 underline font-semibold cursor-pointer"
                        >
                          Tích đủ {totalClassDays.length} buổi/tuần
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      {totalClassDays.map((dayCode: string) => {
                        const isChecked = selectedDays.includes(dayCode);
                        return (
                          <label
                            key={dayCode}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all border ${
                              isChecked
                                ? 'bg-amber-500/20 border-amber-500/70 text-amber-300 shadow-sm'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                let nextDays: string[];
                                if (isChecked) {
                                  if (selectedDays.length <= 1) {
                                    showToast('Học sinh phải đăng ký ít nhất 1 buổi học trong tuần!', 'warning');
                                    return;
                                  }
                                  nextDays = selectedDays.filter((d: string) => d !== dayCode);
                                } else {
                                  nextDays = totalClassDays.filter((d: string) => d === dayCode || selectedDays.includes(d));
                                }
                                setSelectedDays(nextDays);
                                setIsManualOverride(false);
                              }}
                              className="rounded border-slate-700 text-amber-500 focus:ring-0 focus:ring-offset-0 bg-slate-800"
                            />
                            <span>{getDayLabel(dayCode)} ({dayCode})</span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between text-[10px] pt-1 text-slate-400">
                      <span className="text-amber-300 font-semibold">
                        Lịch học: [{selectedDays.join(', ')}] ({selectedDays.length}/{classDaysCount} buổi/tuần)
                      </span>
                      {selectedDays.length < classDaysCount ? (
                        <span className="text-amber-400 font-medium">Bán phần: is_partial_schedule = true</span>
                      ) : (
                        <span className="text-emerald-400 font-medium">Đầy đủ lịch lớp (Toàn phần)</span>
                      )}
                    </div>
                  </div>

                  {/* 1. Ràng Buộc Triệt Để Thuộc Tính min và max Cho Ô Input Date */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                        <span>📅 Ngày bắt đầu học chính thức (Ngày/Tháng/Năm) *:</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleNextSessionClick}
                        className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold cursor-pointer"
                      >
                        Ca kế tiếp
                      </button>
                    </div>

                    <DatePickerVN
                      value={startDate}
                      min={selectedClass.start_date}
                      max={selectedClass.end_date}
                      onChange={(newDate) => handleStartDateInputChange(newDate)}
                      disabled={isCurrentClassAlreadyEnrolled}
                      placeholder="30/09/2026"
                      required
                      className="py-2.5 font-bold"
                    />
                    {(selectedClass.start_date || selectedClass.end_date) && (
                      <p className="text-xs text-amber-400/80 mt-1">
                        Thời gian lớp mở: {formatDate(selectedClass.start_date)} đến {formatDate(selectedClass.end_date)}
                      </p>
                    )}
                  </div>

                  {/* Bảng tính toán buổi theo lịch thực tế */}
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-[9px] text-slate-400 uppercase font-semibold">Chuẩn lớp</div>
                      <div className="font-mono font-bold text-white text-xs mt-0.5">{selectedClass.total_sessions || 24} buổi</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-[9px] text-slate-400 uppercase font-semibold">Lịch tuần</div>
                      <div className="font-mono font-bold text-xs mt-0.5 text-amber-300">
                        {selectedDays.length}/{classDaysCount} ngày
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/40">
                      <div className="text-[9px] text-emerald-300 uppercase font-bold">Số buổi tính toán</div>
                      <div className="font-mono font-black text-emerald-400 text-xs mt-0.5">{calculatedSessions} buổi</div>
                    </div>
                  </div>

                  {/* Điều chỉnh thủ công nếu cần */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400">
                      Số buổi thực học (tùy chỉnh nếu vào trễ / học bù):
                      {isManualOverride && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsManualOverride(false);
                            setManualSessions(calculatedSessions);
                          }}
                          className="ml-1.5 text-[10px] text-amber-300 underline cursor-pointer"
                        >
                          Về tự động tính ({calculatedSessions}b)
                        </button>
                      )}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={isManualOverride ? manualSessions : calculatedSessions}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setManualSessions(val);
                        setIsManualOverride(true);
                      }}
                      disabled={isCurrentClassAlreadyEnrolled}
                      className="w-20 px-2.5 py-1 rounded-lg bg-slate-900 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs text-center focus:outline-none"
                    />
                  </div>

                  {/* 4. Cập Nhật Khung Tóm Tắt & Nút Xác Nhận */}
                  <div className="p-3 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Lịch học của lớp:</span>
                      <span className="font-mono text-slate-200">[{totalClassDays.join(', ')}] ({selectedClass.total_sessions || 24} buổi)</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Đơn giá buổi (standard_session_rate):</span>
                      <span className="font-mono font-bold text-white">{new Intl.NumberFormat('vi-VN').format(rate)} đ/buổi</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Dòng công thức tính số buổi:</span>
                      <span className="font-mono text-amber-300 text-right">
                        Số buổi thực tế từ {formatDate(startDate)} đến {formatDate(selectedClass.end_date)}: {calculatedSessions} buổi
                        {isManualOverride ? ` (Tùy chỉnh: ${manualSessions}b)` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-800">
                      <span className="font-semibold text-slate-300">Dòng công thức tính học phí:</span>
                      <span className="font-mono font-bold text-amber-300">
                        {effectiveSessions} buổi × {new Intl.NumberFormat('vi-VN').format(rate)} đ = {new Intl.NumberFormat('vi-VN').format(totalTuition)} đ
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-emerald-400 font-bold border-t border-slate-800 pt-1.5 text-sm">
                      <span>Tổng tiền học phí:</span>
                      <span className="font-mono font-black text-base">
                        {new Intl.NumberFormat('vi-VN').format(totalTuition)} đ
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirmEnrollment}
            disabled={
              !selectedClassId || 
              isCurrentClassAlreadyEnrolled || 
              (store.classes.length > 0 && availableClasses.length === 0) || 
              store.classes.length === 0 || 
              !!enrollmentError || 
              isSubmitting
            }
            className={`px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isTrialMode
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20'
                : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/20'
            }`}
          >
            {isSubmitting ? (
              <span>Đang lưu CSDL...</span>
            ) : isTrialMode ? (
              <span>Xác Nhận Đăng Ký Học Thử (1 buổi - Miễn phí)</span>
            ) : (
              <span>Xác Nhận Ghi Danh ({effectiveSessions} buổi - {new Intl.NumberFormat('vi-VN').format(totalTuition)} đ)</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
