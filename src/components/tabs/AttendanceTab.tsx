import React, { useState, useMemo, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Calendar, 
  UserCheck, 
  Coffee, 
  Clock, 
  Printer, 
  ChevronLeft, 
  ChevronRight,
  Save, 
  FileText,
  AlertCircle,
  Lock,
  Sparkles,
  ExternalLink,
  Upload,
  X,
  Paperclip,
  Check,
  Eye,
  Download,
  Trash2,
  Edit2,
  ShieldCheck,
  Image as ImageIcon,
  RefreshCw,
  Server,
  Building2,
  FolderOpen,
  PlusCircle
} from 'lucide-react';
import { 
  AppStore, 
  formatVND, 
  createAuditRecord, 
  appendAuditLog,
  compressAndConvertToBase64, 
  triggerFileDownload, 
  uploadToSupabaseBucket, 
  uploadFileToServer,
  formatFileSize,
  GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_DRIVE_ROOT_URL,
  getDateDayCode,
  getDayLabel,
  formatDaysListLabel,
  isStudentScheduledForDate,
  formatStudentScheduleLabel,
  formatDateVN,
  getTeacherEffectivePeriodRate,
  getTeacherEffectiveSessionRate,
} from '../../lib/storage';
import { ExtracurricularClass, Student, ClassSession, AttendanceRecord, TeacherAttendanceRecord, UserRole, AppUser, Enrollment } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { showToast } from '../../lib/toast';

interface AttendanceTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  selectedClass: ExtracurricularClass | null;
  onSelectClass: (cls: ExtracurricularClass) => void;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onPrintAttendanceBook: (cls: ExtracurricularClass, sessionDate: string) => void;
  onIssueCreditForStudent: (student: Student, cls: ExtracurricularClass, dates: string[]) => void;
  onNavigateTab?: (tab: string) => void;
}

interface WeekOption {
  weekNumber: number;
  startDate: string; // YYYY-MM-DD (Monday)
  endDate: string;   // YYYY-MM-DD (Sunday)
  label: string;
  isCurrent: boolean;
}

const buildTermWeeks = (termStartDateStr?: string, totalWeeks = 16): WeekOption[] => {
  const weeks: WeekOption[] = [];
  const baseDateStr = termStartDateStr || '2026-08-31';
  const baseMonday = new Date(`${baseDateStr}T00:00:00`);
  // Align to Monday if start_date isn't Monday
  const dayOfWeek = baseMonday.getDay(); // 0=Sun, 1=Mon
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  baseMonday.setDate(baseMonday.getDate() + diffToMonday);

  const today = new Date().toISOString().split('T')[0];

  for (let i = 1; i <= totalWeeks; i++) {
    const monday = new Date(baseMonday);
    monday.setDate(monday.getDate() + (i - 1) * 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const startStr = monday.toISOString().split('T')[0];
    const endStr = sunday.toISOString().split('T')[0];

    const startFormatted = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`;
    const endFormatted = `${String(sunday.getDate()).padStart(2, '0')}/${String(sunday.getMonth() + 1).padStart(2, '0')}/${sunday.getFullYear()}`;

    const isCurrent = today >= startStr && today <= endStr;

    weeks.push({
      weekNumber: i,
      startDate: startStr,
      endDate: endStr,
      label: `Tuần ${i} (${startFormatted} - ${endFormatted})${isCurrent ? ' • [Hiện Tại]' : ''}`,
      isCurrent,
    });
  }
  return weeks;
};

const DAY_OFFSET_MAP: Record<string, { offset: number; name: string }> = {
  'T2': { offset: 0, name: 'Thứ 2' },
  'T3': { offset: 1, name: 'Thứ 3' },
  'T4': { offset: 2, name: 'Thứ 4' },
  'T5': { offset: 3, name: 'Thứ 5' },
  'T6': { offset: 4, name: 'Thứ 6' },
  'T7': { offset: 5, name: 'Thứ 7' },
  'CN': { offset: 6, name: 'Chủ Nhật' },
};

interface StudentAttendanceLocal {
  status: 'present' | 'absent_excused' | 'absent_unexcused';
  note: string;
  proof_url?: string;
  proof_file_name?: string;
  proof_base64?: string;
  uploaded_at?: string;
  uploaded_by?: string;
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({
  store,
  currentRole,
  currentUser,
  selectedClass,
  onSelectClass,
  onUpdateStore,
  onPrintAttendanceBook,
  onIssueCreditForStudent,
  onNavigateTab,
}) => {
  // 1. Khởi tạo state cho Bộ lọc 2 cấp: Khóa Học & Cơ Sở
  const defaultActiveTerm = useMemo(
    () => store.terms.find(t => t.is_active) || store.terms[0],
    [store.terms]
  );

  const defaultUserCampusId = useMemo(() => {
    if (selectedClass?.campus_id) return selectedClass.campus_id;
    if (currentUser?.campus_id && currentUser.campus_id !== 'all') {
      return currentUser.campus_id === 'pmh' ? 'camp_pmh' : currentUser.campus_id === 'pl' ? 'camp_pl' : currentUser.campus_id;
    }
    return 'camp_pmh'; // Mặc định Cơ sở Phú Mỹ Hưng (PMH) nếu là Super Admin
  }, [currentUser, selectedClass?.campus_id]);

  const [selectedTermId, setSelectedTermId] = useState<string>(
    selectedClass?.term_id || defaultActiveTerm?.id || 'term_fall_2026'
  );
  const [selectedCampusId, setSelectedCampusId] = useState<string>(defaultUserCampusId);

  // Đồng bộ bộ lọc nếu người dùng chọn lớp từ màn hình khác chuyển sang
  useEffect(() => {
    if (selectedClass) {
      if (selectedClass.term_id && selectedClass.term_id !== selectedTermId) {
        setSelectedTermId(selectedClass.term_id);
      }
      if (selectedClass.campus_id && selectedClass.campus_id !== selectedCampusId) {
        setSelectedCampusId(selectedClass.campus_id);
      }
    }
  }, [selectedClass?.id]);

  // 2. Lọc danh sách lớp học khả dụng theo Khóa Học & Cơ Sở (Bao gồm lớp liên khóa vắt sang khóa sau)
  const availableClasses = useMemo(() => {
    return store.classes.filter(cls => {
      const matchTerm =
        cls.term_id === selectedTermId ||
        (cls.is_cross_term && cls.spanning_term_id === selectedTermId);
      const normalizedCampus =
        selectedCampusId === 'pmh' ? 'camp_pmh' : selectedCampusId === 'pl' ? 'camp_pl' : selectedCampusId;
      const matchCampus = cls.campus_id === normalizedCampus || cls.campus_id === selectedCampusId;
      return matchTerm && matchCampus;
    });
  }, [store.classes, selectedTermId, selectedCampusId]);

  // 3. State lớp học đang chọn trong phạm vi bộ lọc
  const [selectedClassId, setSelectedClassId] = useState<string>(
    selectedClass?.id || availableClasses[0]?.id || ''
  );

  // Tự động chọn lớp đầu tiên khi đổi Khóa học hoặc Cơ sở
  useEffect(() => {
    if (availableClasses.length > 0) {
      const existsInAvailable = availableClasses.some(c => c.id === selectedClassId);
      if (!existsInAvailable) {
        const firstClass = availableClasses[0];
        setSelectedClassId(firstClass.id);
        onSelectClass(firstClass);
      }
    } else {
      setSelectedClassId('');
    }
  }, [selectedTermId, selectedCampusId, availableClasses]);

  const currentClass = useMemo(() => {
    if (availableClasses.length === 0) return null;
    return availableClasses.find(c => c.id === selectedClassId) || availableClasses[0] || null;
  }, [availableClasses, selectedClassId]);

  const activeFilterTerm = useMemo(
    () => store.terms.find(t => t.id === selectedTermId) || defaultActiveTerm,
    [store.terms, selectedTermId, defaultActiveTerm]
  );

  const termWeeks = useMemo(
    () => buildTermWeeks(activeFilterTerm?.start_date, activeFilterTerm?.total_weeks || 16),
    [activeFilterTerm]
  );

  const timeSlot = store.timeSlots.find(t => t.id === currentClass?.time_slot_id);

  // Class scheduled days of week (Default: T2, T4)
  const classDays = useMemo(() => {
    if (!currentClass) return ['T2', 'T4'];
    return (currentClass.days_of_week && currentClass.days_of_week.length > 0)
      ? currentClass.days_of_week
      : (timeSlot?.days_of_week || ['T2', 'T4']);
  }, [currentClass, timeSlot]);

  // Current real-world date
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Selected week (Default: current week or week 8 for active term, week 1 for other terms)
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(() => {
    const idx = termWeeks.findIndex(w => w.isCurrent);
    return idx >= 0 ? idx : 7; // Tuần 8 mặc định
  });

  useEffect(() => {
    const idx = termWeeks.findIndex(w => w.isCurrent);
    if (idx >= 0) {
      setSelectedWeekIndex(idx);
    } else if (selectedTermId === 'term_fall_2026') {
      setSelectedWeekIndex(7);
    } else {
      setSelectedWeekIndex(0);
    }
  }, [selectedTermId, termWeeks]);

  const currentWeek = termWeeks[selectedWeekIndex] || termWeeks[0];

  // Calculate actual valid dates for the selected week based on class scheduled days
  const scheduledSessionsForWeek = useMemo(() => {
    const monday = new Date(`${currentWeek.startDate}T00:00:00`);
    return classDays.map(dayCode => {
      const config = DAY_OFFSET_MAP[dayCode] || { offset: 0, name: dayCode };
      const dateObj = new Date(monday);
      dateObj.setDate(dateObj.getDate() + config.offset);
      const dateStr = dateObj.toISOString().split('T')[0];
      const formatted = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
      const isFuture = dateStr > today;
      const isToday = dateStr === today;

      return {
        dayCode,
        dayName: config.name,
        dateStr,
        formatted,
        isFuture,
        isToday,
      };
    });
  }, [currentWeek, classDays, today]);

  // Selected session date (Must be one of the scheduled sessions)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return scheduledSessionsForWeek[0]?.dateStr || '2026-09-02';
  });

  // Keep selectedDate in sync when week or class changes
  useEffect(() => {
    if (scheduledSessionsForWeek.length > 0) {
      const isSelectedInWeek = scheduledSessionsForWeek.some(s => s.dateStr === selectedDate);
      if (!isSelectedInWeek) {
        const todaySession = scheduledSessionsForWeek.find(s => s.isToday);
        if (todaySession) {
          setSelectedDate(todaySession.dateStr);
        } else {
          const pastSessions = scheduledSessionsForWeek.filter(s => !s.isFuture);
          if (pastSessions.length > 0) {
            setSelectedDate(pastSessions[pastSessions.length - 1].dateStr);
          } else {
            setSelectedDate(scheduledSessionsForWeek[0].dateStr);
          }
        }
      }
    }
  }, [scheduledSessionsForWeek, selectedDate]);

  // Check strict future constraint
  const isFutureDate = selectedDate > today;

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    currentClass?.primary_teacher_id || store.teachers[0]?.id || ''
  );
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [isSubstitute, setIsSubstitute] = useState<boolean>(false);

  // Teacher Attendance & Work Session Tracking State
  const [teacherMode, setTeacherMode] = useState<'present' | 'late' | 'substitute' | 'absent'>('present');
  const [teacherPeriodsCount, setTeacherPeriodsCount] = useState<number>(2);
  const [teacherCheckInTime, setTeacherCheckInTime] = useState<string>('16:40');
  const [teacherLateMinutes, setTeacherLateMinutes] = useState<number>(10);
  const [teacherSessionNote, setTeacherSessionNote] = useState<string>('');

  // Modal proof attachment state (Upload & Compression)
  const [proofModalStudent, setProofModalStudent] = useState<Student | null>(null);
  const [proofUrlInput, setProofUrlInput] = useState<string>('');
  const [proofBase64Input, setProofBase64Input] = useState<string>('');
  const [proofFileNameInput, setProofFileNameInput] = useState<string>('');
  const [proofNoteInput, setProofNoteInput] = useState<string>('');
  const [proofUploadActive, setProofUploadActive] = useState<boolean>(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [compressionStats, setCompressionStats] = useState<{
    originalSize: string;
    compressedSize: string;
    ratio: number | string;
  } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Modal proof preview state (In-App Lightbox View - Zero Google Drive auth needed)
  const [previewProofModal, setPreviewProofModal] = useState<{
    student: Student;
    record: StudentAttendanceLocal;
  } | null>(null);

  const [showOffScheduleStudents, setShowOffScheduleStudents] = useState<boolean>(false);

  const selectedDayCode = useMemo(() => getDateDayCode(selectedDate), [selectedDate]);
  const selectedDayLabel = useMemo(() => getDayLabel(selectedDayCode), [selectedDayCode]);

  // All active/trial enrollments in this class
  const allClassEnrollments = currentClass
    ? store.enrollments.filter(
        e => e.class_id === currentClass.id && (e.status === 'active' || e.status === 'trial')
      )
    : [];

  // Split enrollments into:
  // 1) Scheduled for selectedDate (matches student's enrolled_days_of_week AND selectedDate >= joined_date)
  // 2) Off-schedule for selectedDate (partial weekly schedule not matching selectedDayCode, or before joined_date)
  const classEnrollments = allClassEnrollments.filter(e =>
    isStudentScheduledForDate(e, selectedDate, classDays)
  );

  const offScheduleEnrollments = allClassEnrollments.filter(
    e => !isStudentScheduledForDate(e, selectedDate, classDays)
  );

  const enrolledStudents = classEnrollments
    .map(e => store.students.find(s => s.id === e.student_id))
    .filter(Boolean) as Student[];

  const offScheduleStudents = offScheduleEnrollments
    .map(e => {
      const student = store.students.find(s => s.id === e.student_id);
      return student ? { student, enrollment: e } : null;
    })
    .filter(Boolean) as { student: Student; enrollment: Enrollment }[];

  // Existing session for this date
  const currentSession = currentClass
    ? store.sessions.find(
        s => s.class_id === currentClass.id && s.session_date === selectedDate
      )
    : undefined;

  // Existing attendance map for this date
  const existingAttendance = currentClass
    ? store.attendance.filter(
        a => a.class_id === currentClass.id && a.session_date === selectedDate
      )
    : [];

  const initialStatusMap: Record<string, StudentAttendanceLocal> = {};
  enrolledStudents.forEach(s => {
    const existing = existingAttendance.find(a => a.student_id === s.id);
    if (existing) {
      initialStatusMap[s.id] = {
        status: existing.status,
        note: existing.note || '',
        proof_url: existing.proof_url || '',
        proof_file_name: existing.proof_file_name || '',
        proof_base64: existing.proof_base64 || '',
        uploaded_at: existing.uploaded_at,
        uploaded_by: existing.uploaded_by,
      };
    } else {
      initialStatusMap[s.id] = { status: 'present', note: '' };
    }
  });

  const [attendanceState, setAttendanceState] = useState<Record<string, StudentAttendanceLocal>>(initialStatusMap);

  // Update teacher selection and load existing TeacherAttendanceRecord when class or selectedDate changes
  useEffect(() => {
    if (!currentClass) return;
    const existingTeacherAtt = (store.teacherAttendance || []).find(
      ta => ta.class_id === currentClass.id && ta.session_date === selectedDate
    );
    const assignedTeacher = store.teachers.find(t => t.id === currentClass.primary_teacher_id);
    const defaultPeriods = assignedTeacher?.periods_per_session || 2;
    const defaultStartTime = timeSlot?.start_time || '16:45';

    if (existingTeacherAtt) {
      setSelectedTeacherId(existingTeacherAtt.actual_teacher_id);
      setIsSubstitute(existingTeacherAtt.is_substitute);
      setTeacherPeriodsCount(existingTeacherAtt.periods_count || defaultPeriods);
      setTeacherCheckInTime(existingTeacherAtt.check_in_time || defaultStartTime);
      setTeacherLateMinutes(existingTeacherAtt.late_minutes || 10);
      setTeacherSessionNote(existingTeacherAtt.notes || '');
      if (existingTeacherAtt.status === 'absent_excused' || existingTeacherAtt.status === 'absent_unexcused') {
        setTeacherMode('absent');
      } else if (existingTeacherAtt.is_substitute) {
        setTeacherMode('substitute');
      } else if (existingTeacherAtt.status === 'late') {
        setTeacherMode('late');
      } else {
        setTeacherMode('present');
      }
    } else if (currentSession) {
      setSelectedTeacherId(currentSession.actual_teacher_id || currentClass.primary_teacher_id);
      const isSub = Boolean(currentSession.is_substitute || (currentSession.actual_teacher_id && currentSession.actual_teacher_id !== currentClass.primary_teacher_id));
      setIsSubstitute(isSub);
      setTeacherMode(isSub ? 'substitute' : 'present');
      setTeacherPeriodsCount(defaultPeriods);
      setTeacherCheckInTime(defaultStartTime);
      setTeacherLateMinutes(10);
      setTeacherSessionNote('');
    } else {
      setSelectedTeacherId(currentClass.primary_teacher_id);
      setIsSubstitute(false);
      setTeacherMode('present');
      setTeacherPeriodsCount(defaultPeriods);
      setTeacherCheckInTime(defaultStartTime);
      setTeacherLateMinutes(10);
      setTeacherSessionNote('');
    }
  }, [currentClass?.id, selectedDate, store.teacherAttendance]);

  // Live Teacher Rate & Payout Calculation for Current Session (Per-Session Model: 300K Cơ hữu / 270K Thỉnh giảng)
  const assignedTeacherObj = currentClass
    ? store.teachers.find(t => t.id === currentClass.primary_teacher_id)
    : undefined;
  const actualTeacherObj = store.teachers.find(t => t.id === selectedTeacherId) || assignedTeacherObj;
  const isWeekendSlot = timeSlot?.slot_type === 'weekend' || selectedDayCode === 'T7' || selectedDayCode === 'CN';
  const liveTeacherPeriodRate = getTeacherEffectivePeriodRate(
    actualTeacherObj,
    currentClass?.subject_id,
    isWeekendSlot,
    store.payrollRateConfig
  );
  const liveTeacherSessionRate = getTeacherEffectiveSessionRate(
    actualTeacherObj,
    store.payrollRateConfig
  );
  const liveTeacherEffectivePeriods = teacherMode === 'absent' ? 0 : teacherPeriodsCount;
  const liveTeacherTotalPayout = teacherMode === 'absent' ? 0 : liveTeacherSessionRate;

  // Update attendance state when selectedDate or store.attendance changes (Guaranteed Persistence)
  useEffect(() => {
    if (!currentClass) return;
    const newMap: Record<string, StudentAttendanceLocal> = {};
    enrolledStudents.forEach(s => {
      const existing = store.attendance.find(
        a => a.class_id === currentClass.id && a.session_date === selectedDate && a.student_id === s.id
      );
      if (existing) {
        newMap[s.id] = {
          status: existing.status,
          note: existing.note || '',
          proof_url: existing.proof_url || '',
          proof_file_name: existing.proof_file_name || '',
          proof_base64: existing.proof_base64 || '',
          uploaded_at: existing.uploaded_at,
          uploaded_by: existing.uploaded_by,
        };
      } else {
        newMap[s.id] = { status: 'present', note: '' };
      }
    });
    setAttendanceState(newMap);
  }, [selectedDate, currentClass?.id, store.attendance]);

  // Royal Snacks live calculation for this session
  const royalStudents = enrolledStudents.filter(s => s.is_royal_student);
  const totalRoyalCount = royalStudents.length;

  let liveConsumed = 0;
  let liveReturned = 0;

  royalStudents.forEach(s => {
    const st = attendanceState[s.id]?.status || 'present';
    if (st === 'present' || st === 'absent_unexcused') {
      liveConsumed += 1;
    } else if (st === 'absent_excused') {
      liveReturned += 1;
    }
  });

  // Handle Status Change: 1-click status change (Proof is OPTIONAL)
  const handleSetStatus = (student: Student, targetStatus: 'present' | 'absent_excused' | 'absent_unexcused') => {
    if (isFutureDate) return;

    setAttendanceState(prev => {
      const existing = prev[student.id];
      return {
        ...prev,
        [student.id]: {
          ...existing,
          status: targetStatus,
          note: existing?.note || (targetStatus === 'absent_excused' ? 'Phụ huynh xin phép' : ''),
        },
      };
    });
  };

  // Explicitly open the Proof Modal to upload/edit proof file or detailed note (Optional)
  const handleOpenProofModal = (student: Student) => {
    const existing = attendanceState[student.id];
    setProofModalStudent(student);
    setProofUrlInput(existing?.proof_url || '');
    setProofBase64Input(existing?.proof_base64 || '');
    setProofFileNameInput(existing?.proof_file_name || '');
    setProofNoteInput(existing?.note || 'Phụ huynh xin phép qua Zalo / SĐT');
    setProofError(null);
    setProofUploadActive(false);
    setCompressionStats(null);
  };

  const setNote = (studentId: string, note: string) => {
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        note,
      },
    }));
  };

  // Process selected file with client-side compression and Upload to Server (/api/upload)
  const processSelectedFile = async (file: File) => {
    if (!file) return;
    setProofUploadActive(true);
    setProofError(null);

    try {
      // 1. Client-side compression & base64 conversion (< 500KB)
      const result = await compressAndConvertToBase64(file);
      setProofBase64Input(result.base64);
      setProofFileNameInput(result.fileName);
      setCompressionStats({
        originalSize: formatFileSize(result.originalSizeBytes),
        compressedSize: formatFileSize(result.compressedSizeBytes),
        ratio: result.compressionRatio,
      });

      // 2. Upload file to Supabase Storage Bucket 'attendance-proofs' if configured
      let uploadedUrl: string | undefined = undefined;
      if (proofModalStudent && currentClass) {
        const sbRes = await uploadToSupabaseBucket(
          file,
          `${selectedDate}_${proofModalStudent.code}_${result.fileName}`,
          store.supabaseConfig
        );
        if (sbRes.success && sbRes.url) {
          uploadedUrl = sbRes.url;
        }
      }

      if (uploadedUrl) {
        setProofUrlInput(uploadedUrl);
      } else {
        // Fallback to local server route /api/upload
        const serverRes = await uploadFileToServer(result.base64, result.fileName, 'proofs');
        if (serverRes.success && serverRes.url) {
          setProofUrlInput(serverRes.url);
          if (serverRes.fileName) setProofFileNameInput(serverRes.fileName);
        } else {
          // Fallback to local Base64/link if server offline
          setProofUrlInput(result.base64);
        }
      }
    } catch (err: any) {
      setProofError(err?.message || 'Lỗi khi xử lý và lưu tệp lên server!');
    } finally {
      setProofUploadActive(false);
    }
  };

  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  // Remove proof from student while keeping excused absence status
  const handleRemoveProof = (studentId: string) => {
    if (confirm('Bạn có chắc muốn gỡ bỏ tệp minh chứng của học sinh này? Trạng thái vắng có phép vẫn sẽ được giữ nguyên.')) {
      setAttendanceState(prev => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          proof_url: undefined,
          proof_file_name: undefined,
          proof_base64: undefined,
          uploaded_at: undefined,
          uploaded_by: undefined,
        },
      }));
    }
  };

  // Confirm Excused Absence Proof Modal (Proof file is OPTIONAL)
  const handleConfirmProof = () => {
    if (!proofModalStudent) return;

    setAttendanceState(prev => ({
      ...prev,
      [proofModalStudent.id]: {
        ...prev[proofModalStudent.id],
        status: 'absent_excused',
        note: proofNoteInput.trim() || 'Nghỉ có phép',
        proof_url: proofUrlInput.trim() || proofBase64Input.trim() || undefined,
        proof_file_name: proofFileNameInput.trim() || undefined,
        proof_base64: proofBase64Input.trim() || undefined,
        uploaded_at: (proofUrlInput || proofBase64Input) ? new Date().toISOString() : undefined,
        uploaded_by: (proofUrlInput || proofBase64Input) ? (currentUser?.full_name || 'Giáo viên') : undefined,
      },
    }));

    setProofModalStudent(null);
    setProofError(null);
    setProofBase64Input('');
    setProofUrlInput('');
    setProofFileNameInput('');
    setCompressionStats(null);
  };

  // Save Attendance Session with Strict Validations
  const handleSaveAttendance = () => {
    if (!currentClass) return;
    if (isFutureDate) {
      showToast(
        `RÀNG BUỘC THỜI GIAN: Ngày ${selectedDate} là ngày trong tương lai. Hệ thống chỉ cho phép điểm danh cho ngày hôm nay hoặc quá khứ!`,
        'error',
        { title: 'Khóa điểm danh ngày tương lai' }
      );
      return;
    }

    onUpdateStore(prev => {
      // 1. Session record
      const sessionNumber = prev.sessions.filter(s => s.class_id === currentClass.id).length + 1;
      const updatedSessions = prev.sessions.filter(
        s => !(s.class_id === currentClass.id && s.session_date === selectedDate)
      );

      const newSession: ClassSession = {
        id: currentSession?.id || `ses_${Date.now()}`,
        class_id: currentClass.id,
        term_id: selectedTermId || currentClass.term_id,
        session_date: selectedDate,
        session_number: currentSession?.session_number || sessionNumber,
        actual_teacher_id: selectedTeacherId,
        is_substitute: isSubstitute,
        snacks_allocated: totalRoyalCount,
        snacks_consumed: liveConsumed,
        snacks_returned: liveReturned,
        status: 'completed',
      };
      updatedSessions.push(newSession);

      // 2. Attendance records with guaranteed Base64 & URL permanence
      const remainingAttendance = prev.attendance.filter(
        a => !(a.class_id === currentClass.id && a.session_date === selectedDate)
      );

      const newRecords: AttendanceRecord[] = enrolledStudents.map((s, idx) => ({
        id: `att_${Date.now()}_${idx}`,
        session_id: newSession.id,
        class_id: currentClass.id,
        student_id: s.id,
        session_date: selectedDate,
        status: attendanceState[s.id]?.status || 'present',
        note: attendanceState[s.id]?.note || '',
        proof_url: attendanceState[s.id]?.proof_url,
        proof_file_name: attendanceState[s.id]?.proof_file_name,
        proof_base64: attendanceState[s.id]?.proof_base64,
        uploaded_at: attendanceState[s.id]?.uploaded_at || new Date().toISOString(),
        uploaded_by: attendanceState[s.id]?.uploaded_by || currentUser?.full_name || 'Giáo viên',
      }));

      const finalAttendance = [...remainingAttendance, ...newRecords];

      // 3. Consecutive Absence Check (>= 3 excused absences)
      const newNotifications = [...prev.notifications];
      enrolledStudents.forEach(s => {
        const studentHistory = finalAttendance
          .filter(a => a.student_id === s.id && a.class_id === currentClass.id)
          .sort((a, b) => a.session_date.localeCompare(b.session_date));

        let consecutive = 0;
        const streakDates: string[] = [];
        for (let i = studentHistory.length - 1; i >= 0; i--) {
          if (studentHistory[i].status === 'absent_excused') {
            consecutive++;
            streakDates.unshift(studentHistory[i].session_date);
          } else {
            break;
          }
        }

        if (consecutive >= 3) {
          const alreadyNotified = newNotifications.some(
            n => n.type === 'consecutive_absence' && n.metadata?.student_id === s.id && n.metadata?.date === selectedDate
          );
          if (!alreadyNotified) {
            newNotifications.unshift({
              id: `notif_streak_${Date.now()}_${s.id}`,
              type: 'consecutive_absence',
              title: `Cảnh báo vắng ≥ 3 buổi: ${s.name}`,
              message: `Học sinh ${s.name} đã vắng có phép liên tiếp ${consecutive} buổi (${streakDates.join(', ')}). Đủ điều kiện lập Phiếu bảo lưu khóa sau.`,
              date: selectedDate,
              severity: 'high',
              read: false,
              metadata: { student_id: s.id, class_id: currentClass.id, date: selectedDate },
            });
          }
        }
      });

      // 4. Trial Session Policy: Track Session 1 & Auto-promote to Active upon attending Session 2
      let updatedEnrollments = [...prev.enrollments];
      let updatedInvoices = [...prev.invoices];
      const newlyPromoted: string[] = [];

      enrolledStudents.forEach(s => {
        const enr = updatedEnrollments.find(e => e.student_id === s.id && e.class_id === currentClass.id);
        if (enr && enr.status === 'trial') {
          const currentStatus = attendanceState[s.id]?.status || 'present';
          const priorPresentRecords = prev.attendance.filter(
            a => a.student_id === s.id && a.class_id === currentClass.id && a.session_date !== selectedDate && a.status === 'present'
          );

          if (currentStatus === 'present') {
            const hasCompletedFirstTrialSession =
              priorPresentRecords.length >= 1 ||
              Boolean(enr.trial_attended && enr.trial_session_date && enr.trial_session_date !== selectedDate);

            if (hasCompletedFirstTrialSession) {
              // Kịch bản 1: Học tiếp tục buổi thứ 2 -> Tự động chuyển sang Chính thức (Active) & kích hoạt hóa đơn toàn khóa
              updatedEnrollments = updatedEnrollments.map(e => 
                e.id === enr.id 
                  ? { 
                      ...e, 
                      status: 'active', 
                      trial_attended: true,
                      trial_completed_action: 'promoted',
                      trial_outcome: 'promoted', 
                      trial_notes: `Tự động chuyển sang Chính thức (Active) khi tham gia buổi học thứ ${priorPresentRecords.length + 1} (Buổi học thử đầu tiên được tính là buổi chính thức số 1)` 
                    }
                  : e
              );
              updatedInvoices = updatedInvoices.map(inv => 
                inv.student_id === s.id && inv.class_id === currentClass.id && inv.is_trial_pending
                  ? { ...inv, is_trial_pending: false, payment_status: 'unpaid' }
                  : inv
              );
              newNotifications.unshift({
                id: `notif_trial_promote_${Date.now()}_${s.id}`,
                type: 'enrollment_over_quota',
                title: `Tự động lên Chính thức sau học thử: ${s.name}`,
                message: `Học sinh ${s.name} tiếp tục tham gia buổi học thứ 2 lớp ${currentClass.name}. Hệ thống tự động tính buổi học thử là buổi số 1 và kích hoạt thu học phí trọn khóa!`,
                date: selectedDate,
                severity: 'low',
                read: false,
              });
              newlyPromoted.push(s.name);
            } else {
              // Ghi nhận đã tham gia buổi học thử đầu tiên (Buổi 1)
              updatedEnrollments = updatedEnrollments.map(e =>
                e.id === enr.id
                  ? {
                      ...e,
                      trial_attended: true,
                      trial_session_date: e.trial_session_date || selectedDate,
                    }
                  : e
              );
            }
          }
        }
      });

      // 5. Audit Logging for attendance save and proofs
      const newAuditLogs = [...(prev.auditLogs || [])];
      
      const attendanceLog = createAuditRecord(
        'ATTENDANCE_SAVE',
        'ACADEMIC',
        `Sổ Điểm danh Lớp ${currentClass.name}`,
        `Lưu điểm danh ngày ${selectedDate} lớp ${currentClass.name} (Có mặt: ${enrolledStudents.filter(s => attendanceState[s.id]?.status === 'present').length}, Vắng CP: ${liveReturned}, Suất bánh sữa hoàn: ${liveReturned}${newlyPromoted.length > 0 ? `, Tự động lên chính thức: ${newlyPromoted.join(', ')}` : ''})`,
        currentUser,
        {
          details: {
            session_date: selectedDate,
            class_id: currentClass.id,
            snacks_allocated: totalRoyalCount,
            snacks_consumed: liveConsumed,
            snacks_returned: liveReturned,
            newly_promoted_trials: newlyPromoted,
            status: 'success',
          }
        }
      );
      newAuditLogs.unshift(attendanceLog);

      // Explicit audit log for excused absences with Drive proof
      enrolledStudents.forEach(s => {
        const rec = attendanceState[s.id];
        if (rec?.status === 'absent_excused' && rec.proof_url) {
          newAuditLogs.unshift(createAuditRecord(
            'ATTENDANCE_SAVE',
            'ACADEMIC',
            `Học sinh ${s.name} (${s.code})`,
            `Ghi nhận vắng có phép kèm minh chứng Drive cho học sinh ${s.name} ngày ${selectedDate}`,
            currentUser,
            {
              details: {
                proof_url: rec.proof_url,
                proof_file_name: rec.proof_file_name,
                note: rec.note,
                session_date: selectedDate,
                class_id: currentClass.id,
              }
            }
          ));
        }
      });

      // 1B. TeacherAttendanceRecord persistence (Chấm công giáo viên buổi học)
      const existingTeacherAtt = (prev.teacherAttendance || []).find(
        ta => ta.class_id === currentClass.id && ta.session_date === selectedDate
      );
      const remainingTeacherAttendance = (prev.teacherAttendance || []).filter(
        ta => !(ta.class_id === currentClass.id && ta.session_date === selectedDate)
      );

      const resolvedStatus: TeacherAttendanceRecord['status'] =
        teacherMode === 'absent'
          ? 'absent_excused'
          : teacherMode === 'late'
          ? 'late'
          : 'present';

      const newTeacherAttendanceRecord: TeacherAttendanceRecord = {
        id: existingTeacherAtt?.id || `tatt_${currentClass.id}_${selectedDate}`,
        class_id: currentClass.id,
        term_id: selectedTermId || currentClass.term_id,
        campus_id: currentClass.campus_id,
        session_date: selectedDate,
        session_number: newSession.session_number,
        periods_count: teacherMode === 'absent' ? 0 : teacherPeriodsCount,
        assigned_teacher_id: currentClass.primary_teacher_id,
        actual_teacher_id: teacherMode === 'absent' ? currentClass.primary_teacher_id : selectedTeacherId,
        is_substitute: teacherMode === 'substitute' || (selectedTeacherId !== currentClass.primary_teacher_id && teacherMode !== 'absent'),
        status: resolvedStatus,
        late_minutes: teacherMode === 'late' ? teacherLateMinutes : undefined,
        check_in_time: teacherMode === 'absent' ? undefined : teacherCheckInTime,
        rate_per_period: liveTeacherPeriodRate,
        rate_applied: liveTeacherSessionRate,
        earned_amount: liveTeacherTotalPayout,
        total_payout: liveTeacherTotalPayout,
        verified_by: currentUser?.full_name || 'Ban Học Vụ',
        notes:
          teacherSessionNote.trim() ||
          (teacherMode === 'substitute'
            ? `${assignedTeacherObj?.name || 'GV chính'} nghỉ phép, ${actualTeacherObj?.name || 'GV dạy thay'} dạy thay 1 buổi (${formatVND(liveTeacherTotalPayout)})`
            : teacherMode === 'late'
            ? `Vào lớp lúc ${teacherCheckInTime} (muộn ${teacherLateMinutes} phút)`
            : teacherMode === 'absent'
            ? `Giáo viên ${assignedTeacherObj?.name || ''} vắng mặt buổi này (0 buổi - chờ bố trí học bù)`
            : 'Giáo viên chính thức đứng lớp đúng giờ'),
      };

      const finalTeacherAttendance = [...remainingTeacherAttendance, newTeacherAttendanceRecord];

      return {
        ...prev,
        sessions: updatedSessions,
        teacherAttendance: finalTeacherAttendance,
        attendance: finalAttendance,
        enrollments: updatedEnrollments,
        invoices: updatedInvoices,
        notifications: newNotifications,
        auditLogs: newAuditLogs,
      };
    });

    showToast(
      `Đã lưu sổ điểm danh học sinh, chấm công giáo viên (${teacherMode === 'absent' ? '0 buổi' : '1 buổi'} = ${formatVND(liveTeacherTotalPayout)}) và đối soát bánh sữa ngày ${selectedDate}!`,
      'success',
      { title: 'Lưu điểm danh & Chấm công GV thành công' }
    );
  };

  // Quick manual promote / drop trial student directly from Attendance Sheet
  const handleQuickTrialAction = (student: Student, action: 'promote' | 'drop') => {
    if (!currentClass) return;
    onUpdateStore(prev => {
      const enr = prev.enrollments.find(e => e.student_id === student.id && e.class_id === currentClass.id && e.status === 'trial');
      if (!enr) return prev;

      if (action === 'promote') {
        return {
          ...prev,
          enrollments: prev.enrollments.map(e =>
            e.id === enr.id
              ? {
                  ...e,
                  status: 'active',
                  trial_attended: true,
                  trial_completed_action: 'promoted',
                  trial_outcome: 'promoted',
                  trial_notes: 'Xác nhận chuyển lên Chính thức (Active) từ Sổ Điểm Danh (Buổi thử tính là buổi 1)',
                }
              : e
          ),
          invoices: prev.invoices.map(inv =>
            inv.student_id === student.id && inv.class_id === currentClass.id && inv.is_trial_pending
              ? { ...inv, is_trial_pending: false, payment_status: 'unpaid' }
              : inv
          ),
          notifications: [
            {
              id: `notif_${Date.now()}`,
              type: 'enrollment_over_quota',
              title: 'Chuyển lên học chính thức sau buổi thử',
              message: `Học sinh ${student.name} đã chuyển lên học CHÍNH THỨC lớp ${currentClass.name}. Hóa đơn học phí trọn khóa đã kích hoạt thu phí.`,
              date: selectedDate,
              severity: 'low',
              read: false,
            },
            ...prev.notifications,
          ],
        };
      } else {
        return {
          ...prev,
          enrollments: prev.enrollments.map(e =>
            e.id === enr.id
              ? {
                  ...e,
                  status: 'trial_dropped',
                  trial_attended: true,
                  trial_completed_action: 'dropped',
                  trial_outcome: 'dropped',
                  trial_notes: 'Dừng không học tiếp sau buổi học thử đầu tiên (Trial Dropped)',
                }
              : e
          ),
          invoices: prev.invoices.map(inv =>
            inv.student_id === student.id && inv.class_id === currentClass.id
              ? {
                  ...inv,
                  is_trial_pending: false,
                  payment_status: 'cancelled',
                  outstanding_amount: 0,
                  net_payable: 0,
                  payment_reference: 'MIỄN PHÍ BUỔI HỌC THỬ (DỪNG HỌC)',
                }
              : inv
          ),
          notifications: [
            {
              id: `notif_${Date.now()}`,
              type: 'drop_alert',
              title: 'Dừng sau buổi học thử (Trial Dropped)',
              message: `Học sinh ${student.name} dừng học sau buổi thử lớp ${currentClass.name}. Đã hủy hóa đơn học phí khóa học và giải phóng 1 chỉ tiêu sĩ số lớp.`,
              date: selectedDate,
              severity: 'medium',
              read: false,
            },
            ...prev.notifications,
          ],
        };
      }
    });
    showToast(
      action === 'promote'
        ? `Đã chuyển học sinh ${student.name} sang Chính thức (Active) & kích hoạt hóa đơn toàn khóa!`
        : `Đã chốt dừng học sau buổi thử cho ${student.name} (Trial Dropped) — Hủy hóa đơn & giải phóng sĩ số lớp!`,
      action === 'promote' ? 'success' : 'info',
      { title: action === 'promote' ? 'Chuyển lên học chính thức' : 'Chốt dừng sau buổi học thử' }
    );
  };

  const canSaveAttendance = Boolean(currentClass) && !isFutureDate;

  return (
    <div className="space-y-4">
      
      {/* THANH BỘ LỌC KHÓA & CƠ SỞ TRÊN ĐẦU TRANG (TWO-TIER FILTER BAR) */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          {/* Chọn Khóa Học */}
          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 focus-within:border-amber-500/50 transition-colors">
            <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-400">Khóa học:</span>
            <select
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer pr-1"
            >
              {store.terms.map(term => (
                <option key={term.id} value={term.id} className="bg-slate-900 text-white">
                  {term.name} {term.is_active ? '(Đang diễn ra)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Chọn Cơ Sở */}
          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 focus-within:border-cyan-500/50 transition-colors">
            <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-400">Cơ sở:</span>
            <select
              value={selectedCampusId}
              onChange={(e) => setSelectedCampusId(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer pr-1"
            >
              <option value="camp_pmh" className="bg-slate-900 text-white">Cơ sở Phú Mỹ Hưng (PMH)</option>
              <option value="camp_pl" className="bg-slate-900 text-white">Cơ sở Phú Lâm (PL)</option>
            </select>
          </div>
        </div>

        {/* Badge hiển thị số lượng lớp tìm thấy */}
        <div className={`text-xs font-medium px-3 py-1.5 rounded-xl border ${
          availableClasses.length > 0
            ? 'text-slate-300 bg-slate-950/60 border-slate-800'
            : 'text-amber-300 bg-amber-500/10 border-amber-500/30'
        }`}>
          Tìm thấy: <strong className={availableClasses.length > 0 ? 'text-amber-400 font-extrabold' : 'text-rose-400 font-extrabold'}>{availableClasses.length}</strong> lớp học khả dụng
        </div>
      </div>

      {/* Top Class Switcher & Meta Header */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-5 backdrop-blur-md shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={currentClass?.id || ''}
                  disabled={availableClasses.length === 0}
                  onChange={(e) => {
                    const c = availableClasses.find(cl => cl.id === e.target.value);
                    if (c) {
                      setSelectedClassId(c.id);
                      onSelectClass(c);
                    }
                  }}
                  className={`bg-slate-900 border text-base font-bold rounded-xl px-3 py-1.5 focus:outline-none transition-colors ${
                    availableClasses.length === 0
                      ? 'border-amber-500/40 text-amber-300 cursor-not-allowed'
                      : 'border-slate-700 text-white focus:border-amber-500 cursor-pointer'
                  }`}
                >
                  {availableClasses.length === 0 ? (
                    <option value="">[ Không có lớp học nào trong khóa & cơ sở này ]</option>
                  ) : (
                    availableClasses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))
                  )}
                </select>
                {currentClass && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold">
                    {currentClass.status === 'active' ? 'Đang hoạt động' : 'Tạm dừng'}
                  </span>
                )}
                {currentClass?.is_cross_term && currentClass.spanning_term_id === selectedTermId && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-extrabold flex items-center gap-1">
                    <span>🌐 [Lớp vắt từ khóa trước]</span>
                  </span>
                )}
                {currentClass?.is_cross_term && currentClass.term_id === selectedTermId && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold">
                    🌐 Lớp liên khóa ({currentClass.term_distribution?.primary_term_sessions || 16}b + {currentClass.term_distribution?.spanning_term_sessions || 8}b)
                  </span>
                )}
              </div>
              {currentClass ? (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                  <span>{timeSlot?.name}</span>
                  <span>&bull;</span>
                  <span>Lịch học: {classDays.join(' & ')}</span>
                  <span>&bull;</span>
                  <span>{store.facilities.find(f => f.id === currentClass.facility_id)?.name}</span>
                </p>
              ) : (
                <p className="text-xs text-amber-400/90 mt-1">
                  Chưa có lớp học nào thuộc {activeFilterTerm?.name} tại {selectedCampusId === 'camp_pl' ? 'Cơ sở Phú Lâm (PL)' : 'Cơ sở Phú Mỹ Hưng (PMH)'}.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => currentClass && onPrintAttendanceBook(currentClass, selectedDate)}
              disabled={!currentClass}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              <span>In Sổ Điểm Danh</span>
            </button>

            <button
              onClick={handleSaveAttendance}
              disabled={!canSaveAttendance}
              title={
                !currentClass
                  ? 'Không có lớp học nào khả dụng để lưu điểm danh'
                  : isFutureDate
                  ? 'Không thể lưu điểm danh cho ngày trong tương lai'
                  : 'Lưu dữ liệu điểm danh'
              }
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                !canSaveAttendance
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'
                  : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-lg shadow-amber-500/20 hover:scale-[1.02]'
              }`}
            >
              {!canSaveAttendance ? <Lock className="w-4 h-4 text-slate-500" /> : <Save className="w-4 h-4 text-slate-950" />}
              <span>
                {!currentClass
                  ? 'Đã Khóa (Chưa Có Lớp)'
                  : isFutureDate
                  ? 'Bị Khóa (Ngày Tương Lai)'
                  : 'Lưu Buổi Điểm Danh'}
              </span>
            </button>
          </div>

        </div>

        {/* WEEK & SCHEDULE SELECTOR BAR (Only shown when a class is available) */}
        {currentClass && (
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              
              {/* Bộ chọn Tuần học */}
              <div className="lg:col-span-5 flex items-center gap-2 p-2.5 rounded-2xl bg-slate-900 border border-slate-800">
                <Calendar className="w-4 h-4 text-amber-400 shrink-0 ml-1" />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">
                    Chọn Tuần Học ({activeFilterTerm?.name || 'Khóa Thu 2026'}):
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <button
                      onClick={() => setSelectedWeekIndex(prev => Math.max(0, prev - 1))}
                      disabled={selectedWeekIndex === 0}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors"
                      title="Tuần trước"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <select
                      value={selectedWeekIndex}
                      onChange={(e) => setSelectedWeekIndex(parseInt(e.target.value, 10))}
                      className="flex-1 bg-slate-950 text-white font-bold text-xs rounded-lg px-2.5 py-1 border border-slate-700/80 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      {termWeeks.map((w, idx) => (
                        <option key={w.weekNumber} value={idx}>
                          {w.label}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => setSelectedWeekIndex(prev => Math.min(termWeeks.length - 1, prev + 1))}
                      disabled={selectedWeekIndex === termWeeks.length - 1}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors"
                      title="Tuần sau"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Thanh chọn Ngày học thực tế của lớp (Chỉ cho phép 2 ngày/tuần theo cấu hình lớp) */}
              <div className="lg:col-span-7 flex flex-col justify-center p-2.5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Chọn Ngày Buổi Học Thực Tế ({classDays.join(' & ')}):</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    * Không thể chọn các ngày ngoài lịch
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {scheduledSessionsForWeek.map((sessionDay) => {
                    const isSelected = sessionDay.dateStr === selectedDate;

                    return (
                      <button
                        key={sessionDay.dateStr}
                        onClick={() => setSelectedDate(sessionDay.dateStr)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                          isSelected
                            ? sessionDay.isFuture
                              ? 'bg-rose-500/20 text-rose-300 border-2 border-rose-500 ring-2 ring-rose-500/20'
                              : 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 ring-2 ring-amber-400 font-extrabold'
                            : sessionDay.isFuture
                            ? 'bg-slate-950/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                            : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-700/80'
                        }`}
                      >
                        <span className="font-extrabold">{sessionDay.dayName}</span>
                        <span>({sessionDay.formatted})</span>

                        {sessionDay.isToday && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-black ${
                            isSelected ? 'bg-slate-950 text-amber-400' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            Hôm Nay
                          </span>
                        )}

                        {sessionDay.isFuture && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            <Lock className="w-2.5 h-2.5" />
                            <span>Tương Lai</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* KHỐI CHẤM CÔNG GIÁO VIÊN BUỔI HỌC (TEACHER ATTENDANCE & PAYOUT BAR) */}
            <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3 mt-1">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-white uppercase tracking-wide">
                        Chấm Công Giáo Viên &amp; Định Mức Tiết Dạy Buổi Học
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">
                        GV Phân công: <strong className="text-amber-300">{assignedTeacherObj?.name || 'Chưa gán'} (Chính thức)</strong>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Ca học: <strong>{timeSlot?.start_time || '16:45'} - {timeSlot?.end_time || '18:15'} (90 phút = 2 tiết chuẩn)</strong> &bull; Ghi nhận trực tiếp vào bảng quyết toán thù lao khóa học
                    </p>
                  </div>
                </div>

                {/* Live Payout Formula Display */}
                <div className="px-3.5 py-2 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/90">
                      Thù lao buổi ({actualTeacherObj?.name}):
                    </div>
                    <div className="text-xs font-mono text-slate-300 mt-0.5">
                      <strong className="text-white">{teacherMode === 'absent' ? '0 buổi' : '1 buổi'}</strong> &times;{' '}
                      <strong className="text-amber-300">{formatVND(liveTeacherSessionRate)}/buổi</strong> ={' '}
                      <strong className="text-sm font-extrabold text-emerald-400">{formatVND(liveTeacherTotalPayout)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Teacher Status 4-Button Toggle & Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                {/* 4 Nút trạng thái chấm công GV */}
                <div className="lg:col-span-7 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isFutureDate}
                    onClick={() => {
                      setTeacherMode('present');
                      setSelectedTeacherId(currentClass.primary_teacher_id);
                      setIsSubstitute(false);
                      setTeacherPeriodsCount(assignedTeacherObj?.periods_per_session || 2);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                      teacherMode === 'present'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20 font-extrabold'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-emerald-500/40'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>✓ Đúng Giờ</span>
                  </button>

                  <button
                    type="button"
                    disabled={isFutureDate}
                    onClick={() => {
                      setTeacherMode('late');
                      setSelectedTeacherId(currentClass.primary_teacher_id);
                      setIsSubstitute(false);
                      setTeacherCheckInTime('16:55');
                      setTeacherLateMinutes(10);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                      teacherMode === 'late'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20 font-extrabold'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-amber-500/40'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>⏱ Đi Muộn</span>
                  </button>

                  <button
                    type="button"
                    disabled={isFutureDate}
                    onClick={() => {
                      setTeacherMode('substitute');
                      setIsSubstitute(true);
                      const fallbackSub = store.teachers.find(t => t.id !== currentClass.primary_teacher_id) || store.teachers[0];
                      if (fallbackSub && selectedTeacherId === currentClass.primary_teacher_id) {
                        setSelectedTeacherId(fallbackSub.id);
                      }
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                      teacherMode === 'substitute'
                        ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-500/20 font-extrabold'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-purple-500/40'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>🔄 Dạy Thay</span>
                  </button>

                  <button
                    type="button"
                    disabled={isFutureDate}
                    onClick={() => {
                      setTeacherMode('absent');
                      setSelectedTeacherId(currentClass.primary_teacher_id);
                      setIsSubstitute(false);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                      teacherMode === 'absent'
                        ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-500/20 font-extrabold'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-rose-500/40'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>✕ Vắng Mặt</span>
                  </button>
                </div>

                {/* Số tiết thực dạy & Giờ vào lớp */}
                <div className="lg:col-span-5 flex flex-wrap items-center justify-end gap-2.5 text-xs">
                  <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                    <span className="text-[11px] text-slate-400 font-semibold">Số tiết dạy:</span>
                    <select
                      value={teacherMode === 'absent' ? 0 : teacherPeriodsCount}
                      disabled={isFutureDate || teacherMode === 'absent'}
                      onChange={(e) => setTeacherPeriodsCount(Number(e.target.value))}
                      className="bg-slate-950 text-amber-400 font-mono font-extrabold text-xs px-2 py-0.5 rounded border border-slate-700 focus:outline-none"
                    >
                      {teacherMode === 'absent' ? (
                        <option value={0}>0 tiết (Vắng)</option>
                      ) : (
                        <>
                          <option value={1}>1 tiết (45p)</option>
                          <option value={2}>2 tiết (90p chuẩn)</option>
                          <option value={3}>3 tiết (135p)</option>
                          <option value={4}>4 tiết (180p)</option>
                        </>
                      )}
                    </select>
                  </div>

                  {teacherMode !== 'absent' && (
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                      <span className="text-[11px] text-slate-400 font-semibold">Giờ vào lớp:</span>
                      <input
                        type="time"
                        value={teacherCheckInTime}
                        disabled={isFutureDate}
                        onChange={(e) => setTeacherCheckInTime(e.target.value)}
                        className="bg-slate-950 text-white font-mono text-xs px-2 py-0.5 rounded border border-slate-700 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Conditional Sub-Panels for Substitute / Late / Absent / Note */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1 text-xs">
                {teacherMode === 'substitute' && (
                  <div className="md:col-span-6 p-3 rounded-xl bg-purple-950/30 border border-purple-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="font-bold text-purple-200 text-xs">Chọn Giáo viên dạy thay:</span>
                    </div>
                    <select
                      value={selectedTeacherId}
                      onChange={(e) => {
                        setSelectedTeacherId(e.target.value);
                        setIsSubstitute(e.target.value !== currentClass.primary_teacher_id);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-950 border border-purple-500/50 text-white font-bold text-xs focus:outline-none"
                    >
                      {store.teachers.map(t => {
                        const subRate = getTeacherEffectivePeriodRate(t, currentClass.subject_id, isWeekendSlot, store.payrollRateConfig);
                        return (
                          <option key={t.id} value={t.id} className="bg-slate-900">
                            {t.name} ({t.id === currentClass.primary_teacher_id ? 'GV Chính' : 'Dạy Thay'}) — {formatVND(subRate)}/tiết
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {teacherMode === 'late' && (
                  <div className="md:col-span-6 p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-center justify-between gap-2">
                    <span className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Số phút vào lớp trễ:</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={teacherLateMinutes}
                        onChange={(e) => setTeacherLateMinutes(Math.max(1, Number(e.target.value)))}
                        className="w-20 px-2.5 py-1 rounded-lg bg-slate-950 border border-amber-500/50 text-amber-300 font-mono font-bold text-xs text-center"
                      />
                      <span className="text-slate-400 text-[11px]">phút</span>
                    </div>
                  </div>
                )}

                {teacherMode === 'absent' && (
                  <div className="md:col-span-6 p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 flex items-center gap-2 text-rose-200 text-[11px]">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      Giáo viên <strong>{assignedTeacherObj?.name}</strong> vắng mặt không có người dạy thay: Thù lao buổi này = <strong>0 đ</strong>. Vui lòng chọn <strong>[🔄 Dạy Thay]</strong> nếu có giáo viên đứng lớp thay.
                    </span>
                  </div>
                )}

                <div className={teacherMode === 'present' ? 'md:col-span-12' : 'md:col-span-6'}>
                  <input
                    type="text"
                    value={teacherSessionNote}
                    disabled={isFutureDate}
                    onChange={(e) => setTeacherSessionNote(e.target.value)}
                    placeholder={
                      teacherMode === 'substitute'
                        ? `Ghi chú dạy thay (VD: Cô Hương nghỉ ốm có phép, ${actualTeacherObj?.name} dạy thay ${teacherPeriodsCount} tiết)...`
                        : teacherMode === 'late'
                        ? 'Ghi chú lý do đi muộn & phương án dạy bù giờ...'
                        : 'Ghi chú chấm công giáo viên buổi học này (không bắt buộc)...'
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500/60"
                  />
                </div>
              </div>
            </div>

          </div>
        )}

        {/* FUTURE DATE STRICT LOCK WARNING BANNER */}
        {currentClass && isFutureDate && (
          <div className="mt-3 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-center gap-3 text-rose-200 text-xs font-semibold backdrop-blur-md animate-pulse">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0 text-rose-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-rose-300 text-sm">🔒 KHÓA ĐIỂM DANH: Buổi học diễn ra trong tương lai ({selectedDate})</div>
              <div className="text-[11px] text-rose-400/90 mt-0.5">
                Chưa đến ngày diễn ra lớp học. Quy chế nghiêm ngặt chỉ cho phép thực hiện điểm danh cho ngày hôm nay ({today}) hoặc các ngày trong quá khứ. Toàn bộ thao tác điểm danh và nút Lưu tạm thời bị vô hiệu hóa.
              </div>
            </div>
          </div>
        )}

      </div>

      {/* EMPTY STATE: Khi Khóa học & Cơ sở đang chọn chưa có lớp học nào */}
      {!currentClass ? (
        <div className="rounded-3xl bg-[#111827]/80 border border-amber-500/30 p-10 text-center backdrop-blur-md shadow-xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
            <FolderOpen className="w-8 h-8" />
          </div>
          <div className="space-y-1.5 max-w-xl mx-auto">
            <h3 className="text-base font-extrabold text-white">
              Không có lớp học nào trong khóa & cơ sở này
            </h3>
            <p className="text-sm text-slate-300 font-medium">
              Vui lòng mở thêm lớp mới trong tab <strong className="text-amber-400">Lớp Học Ngoại Khóa</strong> hoặc chọn cơ sở khác.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedCampusId(selectedCampusId === 'camp_pmh' ? 'camp_pl' : 'camp_pmh')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors flex items-center gap-2"
            >
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span>Chuyển sang {selectedCampusId === 'camp_pmh' ? 'Cơ sở Phú Lâm (PL)' : 'Cơ sở Phú Mỹ Hưng (PMH)'}</span>
            </button>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('sub_classes')}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-colors flex items-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Mở thêm lớp trong Lớp Học Ngoại Khóa</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Royal Snack Live Summary Bar */}
          <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-emerald-500/10 border border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Coffee className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-xs font-bold text-white">Đối Soát Bánh Sữa Buổi Này (Dành riêng cho HS Royal)</div>
                <div className="text-[11px] text-slate-400">
                  Công thức: Tiêu thụ = Có mặt + Vắng KP | Hoàn trả bếp = Vắng CP (Bắt buộc kèm minh chứng Drive)
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono font-bold">
              <div className="text-slate-300">
                <span className="text-[10px] text-slate-500 block uppercase">Định mức Royal:</span>
                <span>{totalRoyalCount} suất</span>
              </div>
              <div className="text-emerald-400">
                <span className="text-[10px] text-slate-500 block uppercase">Tiêu thụ:</span>
                <span>{liveConsumed} suất</span>
              </div>
              <div className="text-amber-400">
                <span className="text-[10px] text-slate-500 block uppercase">Hoàn trả bếp:</span>
                <span>{liveReturned} suất</span>
              </div>
            </div>
          </div>

          {/* Attendance List Container (Cards or Table) */}
          <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                  <span>Sổ Điểm Danh Học Viên Ca {selectedDayLabel} ({enrolledStudents.length}/{allClassEnrollments.length} học sinh có lịch học)</span>
                  {offScheduleStudents.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold">
                      Đã lọc {offScheduleStudents.length} HV không thuộc lịch {selectedDayLabel}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  * Hệ thống tự động hiển thị đúng học sinh có đăng ký học vào <strong>{selectedDayLabel} ({formatDateVN(selectedDate)})</strong>. Học sinh học lệch thứ/bán phần sẽ không bị tính vắng sai và không phát sinh suất bánh sữa dư.
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                {offScheduleStudents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowOffScheduleStudents(prev => !prev)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                      showOffScheduleStudents
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-cyan-500/40 hover:text-cyan-300'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      {showOffScheduleStudents
                        ? `Ẩn HV khác lịch (${offScheduleStudents.length})`
                        : `Xem HV nghỉ theo lịch riêng (${offScheduleStudents.length})`}
                    </span>
                  </button>
                )}
                <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
              </div>
            </div>

            {/* Off-Schedule Students Info Drawer (When toggled or when partial-schedule students are hidden today) */}
            {offScheduleStudents.length > 0 && showOffScheduleStudents && (
              <div className="mx-4 mt-4 p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      Danh sách học viên của lớp KHÔNG thuộc ca học {selectedDayLabel} ({formatDateVN(selectedDate)}) — Tự động miễn điểm danh & không tính bánh sữa:
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                    {offScheduleStudents.length} học viên
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {offScheduleStudents.map(({ student, enrollment }) => {
                    const isBeforeJoin = enrollment.joined_date && selectedDate < enrollment.joined_date;
                    const studentDaysText =
                      enrollment.enrolled_days_of_week && enrollment.enrolled_days_of_week.length > 0
                        ? formatDaysListLabel(enrollment.enrolled_days_of_week)
                        : formatDaysListLabel(classDays);

                    return (
                      <div
                        key={student.id}
                        className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 opacity-85"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-200 text-xs truncate flex items-center gap-1.5">
                            <span>{student.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">({student.code})</span>
                          </div>
                          <div className="text-[10px] text-cyan-300 font-semibold mt-0.5">
                            {isBeforeJoin
                              ? `⏳ Bắt đầu học từ: ${formatDateVN(enrollment.joined_date)}`
                              : `🗓️ Lịch cố định: Chỉ học ${studentDaysText} (${enrollment.registered_sessions} buổi)`}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold shrink-0">
                      Không thuộc ca
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 1: CARDS VIEW */}
        {viewMode === 'cards' && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrolledStudents.map((student, idx) => {
              const currentStatus = attendanceState[student.id]?.status || 'present';
              const currentNote = attendanceState[student.id]?.note || '';
              const proofUrl = attendanceState[student.id]?.proof_url;
              const proofFileName = attendanceState[student.id]?.proof_file_name;
              const invoice = store.invoices.find(
                i => i.student_id === student.id && i.class_id === currentClass.id
              );
              const enr = store.enrollments.find(
                e => e.student_id === student.id && e.class_id === currentClass.id
              );
              const isTrial = enr?.status === 'trial';

              return (
                <div 
                  key={student.id}
                  className={`rounded-2xl p-4 border transition-all ${
                    currentStatus === 'present'
                      ? 'bg-slate-900/90 border-emerald-500/30 shadow-lg shadow-emerald-500/5'
                      : currentStatus === 'absent_excused'
                      ? 'bg-slate-900/90 border-amber-500/40 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-900/90 border-rose-500/30 shadow-lg shadow-rose-500/5'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-white text-sm">{student.name}</span>
                        {isTrial && (
                          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1">
                            <span>[ 🧪 Học Thử Buổi 1 ]</span>
                          </span>
                        )}
                        {enr && (enr.is_partial_schedule || (enr.enrolled_days_of_week && enr.enrolled_days_of_week.length < classDays.length)) && (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold">
                            🗓️ Chỉ học {formatDaysListLabel(enr.enrolled_days_of_week || classDays)} ({enr.registered_sessions}b)
                          </span>
                        )}
                      </div>
                      {isTrial && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button
                            type="button"
                            onClick={() => handleQuickTrialAction(student, 'promote')}
                            className="px-2 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[9.5px] font-bold flex items-center gap-1 transition-colors"
                            title="Chuyển Lên Chính Thức (Kích hoạt thu học phí trọn khóa)"
                          >
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Chuyển Lên Chính Thức</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickTrialAction(student, 'drop')}
                            className="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[9.5px] font-bold flex items-center gap-1 transition-colors"
                            title="Dừng Sau Buổi Thử (Hủy hóa đơn, giải phóng sĩ số lớp)"
                          >
                            <XCircle className="w-2.5 h-2.5 text-rose-400" />
                            <span>Dừng Sau Buổi Thử</span>
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                          student.is_royal_student
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          {student.code}
                        </span>
                        <span className="text-[11px] text-slate-400">PH: {student.parent_phone}</span>
                      </div>
                    </div>

                    {student.is_royal_student && (
                      <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400" title="Có suất bánh sữa">
                        <Coffee className="w-4 h-4" />
                      </span>
                    )}
                  </div>

                  {/* Medical Note */}
                  {student.medical_notes && (
                    <div className="mb-3 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <span>{student.medical_notes}</span>
                    </div>
                  )}

                  {/* Proof Attachment Badge if Vắng CP */}
                  {currentStatus === 'absent_excused' && (
                    <div className="mb-3 p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-300 flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5 text-amber-400" />
                          <span>Đơn xin nghỉ & minh chứng:</span>
                        </span>
                        <div className="flex items-center gap-1">
                          {!isFutureDate && (
                            <button
                              type="button"
                              onClick={() => handleOpenProofModal(student)}
                              className="text-[10px] text-amber-400 hover:text-amber-300 underline font-semibold px-1 py-0.5 rounded hover:bg-amber-500/10"
                              title="Thay đổi hoặc nạp lại tệp minh chứng"
                            >
                              Đổi tệp
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveProof(student.id)}
                            className="text-[10px] text-rose-400 hover:text-rose-300 p-0.5 rounded hover:bg-rose-500/10"
                            title="Gỡ tệp minh chứng"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {(proofUrl || attendanceState[student.id]?.proof_base64) ? (
                        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <a
                              href={GOOGLE_DRIVE_ROOT_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[9px] font-bold shrink-0 flex items-center gap-1"
                              title="Mở thư mục Google Drive lưu đơn nghỉ phép"
                            >
                              <ExternalLink className="w-2.5 h-2.5 text-emerald-400" />
                              <span>Google Drive</span>
                            </a>
                            <span className="text-[11px] text-slate-200 font-mono truncate" title={proofFileName || 'don_nghi_phep.jpg'}>
                              {proofFileName || 'don_nghi_phep.jpg'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPreviewProofModal({ student, record: attendanceState[student.id] })}
                              className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-bold flex items-center gap-1 transition-colors"
                              title="Xem đơn trực tiếp trong ứng dụng"
                            >
                              <Eye className="w-3 h-3 text-cyan-400" />
                              <span>Xem đơn</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => triggerFileDownload(proofFileName || 'don_xin_nghi_phep.jpg', attendanceState[student.id]?.proof_base64 || proofUrl || '')}
                              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                              title="Tải tệp xuống máy"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 text-[11px]">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>Chưa đính kèm file (Tùy chọn)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenProofModal(student)}
                            className="px-2 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[10px] transition-colors"
                          >
                            + Nạp file
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3-State Buttons */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Điểm danh chuyên cần:
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        disabled={isFutureDate}
                        onClick={() => handleSetStatus(student, 'present')}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                          isFutureDate ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500' :
                          currentStatus === 'present'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-extrabold ring-1 ring-emerald-400'
                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Có mặt</span>
                      </button>

                      <button
                        type="button"
                        disabled={isFutureDate}
                        onClick={() => handleSetStatus(student, 'absent_excused')}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                          isFutureDate ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500' :
                          currentStatus === 'absent_excused'
                            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-extrabold ring-1 ring-amber-300'
                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Vắng CP</span>
                      </button>

                      <button
                        type="button"
                        disabled={isFutureDate}
                        onClick={() => handleSetStatus(student, 'absent_unexcused')}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                          isFutureDate ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500' :
                          currentStatus === 'absent_unexcused'
                            ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 font-extrabold ring-1 ring-rose-400'
                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Vắng KP</span>
                      </button>
                    </div>
                  </div>

                  {/* Note Input */}
                  <div className="mt-3">
                    <input
                      type="text"
                      disabled={isFutureDate}
                      placeholder="Lý do nghỉ hoặc ghi chú..."
                      value={currentNote}
                      onChange={(e) => setNote(student.id, e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-40"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 2: TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">STT</th>
                  <th className="py-3 px-4">Mã HV</th>
                  <th className="py-3 px-4">Họ và Tên</th>
                  <th className="py-3 px-4">Phân Loại / Bánh Sữa</th>
                  <th className="py-3 px-4">Lưu Ý Y Tế & Minh Chứng</th>
                  <th className="py-3 px-4">Tình Trạng Học Phí</th>
                  <th className="py-3 px-4 text-center">Chuyên Cần</th>
                  <th className="py-3 px-4">Ghi Chú Lý Do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {enrolledStudents.map((student, idx) => {
                  const currentStatus = attendanceState[student.id]?.status || 'present';
                  const currentNote = attendanceState[student.id]?.note || '';
                  const proofUrl = attendanceState[student.id]?.proof_url;
                  const proofFileName = attendanceState[student.id]?.proof_file_name;
                  const invoice = store.invoices.find(
                    i => i.student_id === student.id && i.class_id === currentClass.id
                  );
                  const enr = store.enrollments.find(
                    e => e.student_id === student.id && e.class_id === currentClass.id
                  );
                  const isTrial = enr?.status === 'trial';

                  return (
                    <tr key={student.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                      
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                          student.is_royal_student
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          {student.code}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                          <span>{student.name}</span>
                          {isTrial && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1">
                              <span>[ 🧪 Học Thử Buổi 1 ]</span>
                            </span>
                          )}
                          {enr && (enr.is_partial_schedule || (enr.enrolled_days_of_week && enr.enrolled_days_of_week.length < classDays.length)) && (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold">
                              🗓️ Chỉ học {formatDaysListLabel(enr.enrolled_days_of_week || classDays)} ({enr.registered_sessions}b)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">PH: {student.parent_phone}</div>
                        {isTrial && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleQuickTrialAction(student, 'promote')}
                              className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold flex items-center gap-0.5 transition-colors"
                              title="Chuyển Lên Chính Thức"
                            >
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                              <span>Lên chính thức</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickTrialAction(student, 'drop')}
                              className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[9px] font-bold flex items-center gap-0.5 transition-colors"
                              title="Dừng Sau Buổi Thử"
                            >
                              <XCircle className="w-2.5 h-2.5 text-rose-400" />
                              <span>Dừng sau buổi thử</span>
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {student.is_royal_student ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                            <Coffee className="w-3 h-3 text-amber-400" />
                            Có suất bánh sữa
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-medium">
                            Học sinh ngoài (Không suất)
                          </span>
                        )}
                      </td>

                      {/* Lưu ý y tế & Minh chứng Drive */}
                      <td className="py-3 px-4 max-w-xs space-y-1">
                        {student.medical_notes ? (
                          <div className="flex items-start gap-1 p-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300">
                            <AlertCircle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                            <span>{student.medical_notes}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Bình thường</span>
                        )}

                        {currentStatus === 'absent_excused' && (
                          <div className="pt-1.5">
                            {(proofUrl || attendanceState[student.id]?.proof_base64) ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-emerald-500/30 text-[11px]">
                                <a
                                  href={GOOGLE_DRIVE_ROOT_URL}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-emerald-400 font-bold text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 shrink-0"
                                  title="Mở thư mục Google Drive lưu đơn nghỉ phép"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  <span>Drive</span>
                                </a>
                                <span className="font-mono text-slate-200 max-w-[110px] truncate" title={proofFileName || 'don_nghi_phep.jpg'}>
                                  {proofFileName || 'don_nghi_phep.jpg'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPreviewProofModal({ student, record: attendanceState[student.id] })}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-[10px] transition-colors"
                                  title="Xem đơn trực tiếp trong ứng dụng"
                                >
                                  <Eye className="w-3 h-3 text-cyan-400" />
                                  <span>Xem</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => triggerFileDownload(proofFileName || 'don_xin_nghi_phep.jpg', attendanceState[student.id]?.proof_base64 || proofUrl || '')}
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                                  title="Tải tệp xuống"
                                >
                                  <Download className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProof(student.id)}
                                  className="p-1 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                                  title="Gỡ bỏ tệp (vẫn giữ trạng thái Vắng CP)"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenProofModal(student)}
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors"
                                  title="Đổi hoặc nạp lại đơn khác"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenProofModal(student)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-amber-500/40 text-slate-300 hover:text-white text-[10px] font-semibold transition-colors"
                                title="Đính kèm file minh chứng lên server (tùy chọn)"
                              >
                                <Paperclip className="w-3 h-3 text-amber-400" />
                                <span>+ Đính kèm file (Tùy chọn)</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {invoice?.is_trial_pending ? (
                          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                            Chờ hoàn thành thử
                          </span>
                        ) : invoice ? (
                          invoice.payment_status === 'paid' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              Đã nộp đủ
                            </span>
                          ) : invoice.payment_status === 'partial' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                              Còn nợ: {formatVND(invoice.outstanding_amount)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                              Chưa đóng: {formatVND(invoice.outstanding_amount)}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-500 text-[11px]">Chưa tạo HĐ</span>
                        )}
                      </td>

                      {/* Attendance Radio Button Group */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={isFutureDate}
                            onClick={() => handleSetStatus(student, 'present')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              isFutureDate ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500' :
                              currentStatus === 'present'
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-extrabold ring-1 ring-emerald-400'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Có mặt</span>
                          </button>

                          <button
                            type="button"
                            disabled={isFutureDate}
                            onClick={() => handleSetStatus(student, 'absent_excused')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              isFutureDate ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500' :
                              currentStatus === 'absent_excused'
                                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-extrabold ring-1 ring-amber-300'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>Vắng CP</span>
                          </button>

                          <button
                            type="button"
                            disabled={isFutureDate}
                            onClick={() => handleSetStatus(student, 'absent_unexcused')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              isFutureDate ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500' :
                              currentStatus === 'absent_unexcused'
                                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 font-extrabold ring-1 ring-rose-400'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Vắng KP</span>
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <input
                          type="text"
                          disabled={isFutureDate}
                          placeholder="Nhập lý do nghỉ nếu có..."
                          value={currentNote}
                          onChange={(e) => setNote(student.id, e.target.value)}
                          className="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-40"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

          </div>
        </>
      )}

      {/* MODAL: ĐÍNH KÈM MINH CHỨNG VẮNG CÓ PHÉP (EXCUSED ABSENCE PROOF MODAL) */}
      {proofModalStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-[#111827] border border-amber-500/30 p-6 shadow-2xl shadow-amber-500/10 space-y-4">
            
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Paperclip className="w-5 h-5 text-amber-400" />
                  <span>Cập Nhật Minh Chứng & Lý Do Vắng Có Phép</span>
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Học sinh: <strong className="text-white">{proofModalStudent.name}</strong> ({proofModalStudent.code})
                </p>
                <p className="text-[11px] text-slate-400">
                  Lớp: <strong className="text-slate-200">{currentClass?.name}</strong> • Ngày: <strong className="text-amber-400">{selectedDate}</strong>
                </p>
              </div>

              <button
                onClick={() => setProofModalStudent(null)}
                className="p-1 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notice about optional proof */}
            <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Minh chứng là <strong>không bắt buộc</strong>. Tệp tải lên sẽ được đồng bộ vào Google Drive nhà trường.</span>
              </div>
              <a
                href={GOOGLE_DRIVE_ROOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold shrink-0 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Mở Drive</span>
              </a>
            </div>

            {/* Error Message */}
            {proofError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{proofError}</span>
              </div>
            )}

            {/* Tùy chọn tải tệp minh chứng lên Google Drive */}
            <div className="space-y-1.5 p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tải đơn nghỉ phép / giấy khám lên Google Drive</span>
                </label>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-medium">Tùy chọn</span>
              </div>
              <p className="text-[10px] text-slate-400">
                Tệp tải lên sẽ lưu trực tiếp vào thư mục Google Drive: <span className="text-emerald-400 font-mono">{GOOGLE_DRIVE_FOLDER_ID}/02_DonNghiPhep</span>
              </p>
              
              <div className="mt-2">
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-700 hover:border-amber-500 rounded-xl cursor-pointer bg-slate-950/60 hover:bg-slate-950 transition-colors">
                  <Upload className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-xs text-slate-300 font-semibold">
                    {proofUploadActive ? 'Đang tải tệp lên Google Drive...' : 'Nhấn để chọn file ảnh hoặc PDF'}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">JPG, PNG, PDF tối đa 15MB</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleSimulateUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {proofFileNameInput && (
                <div className="mt-2 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <ExternalLink className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-mono text-[11px] truncate">{proofFileNameInput}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-emerald-400 font-bold">✓ Đã lưu Google Drive</span>
                    <button
                      type="button"
                      onClick={() => {
                        setProofFileNameInput('');
                        setProofUrlInput('');
                        setProofBase64Input('');
                      }}
                      className="text-[10px] text-rose-400 hover:text-rose-300 underline font-semibold"
                    >
                      Gỡ file
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Note / Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Lý do nghỉ phép & Ghi chú của phụ huynh:
              </label>
              <input
                type="text"
                placeholder="VD: Phụ huynh gọi điện báo con sốt phát ban"
                value={proofNoteInput}
                onChange={(e) => setProofNoteInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />

              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {[
                  'Phụ huynh gọi điện xin phép',
                  'Sốt siêu vi có toa thuốc bác sĩ',
                  'Đơn xin phép của phụ huynh qua Zalo',
                  'Trùng lịch thi chính khóa trường Royal',
                  'Chấn thương cần nghỉ hồi phục',
                ].map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setProofNoteInput(tag)}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-400 hover:text-white transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setProofModalStudent(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmProof}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 text-slate-950" />
                <span>{proofFileNameInput ? 'Lưu Minh Chứng & Xác Nhận Vắng CP' : 'Xác Nhận Vắng Có Phép (Không File)'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: XEM MINH CHỨNG ĐƠN NGHỈ PHÉP (LIGHTBOX PREVIEW) */}
      {previewProofModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-3xl bg-[#111827] border border-cyan-500/30 p-6 shadow-2xl shadow-cyan-500/10 space-y-4">
            
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400" />
                  <span>Minh Chứng Đơn Xin Nghỉ Phép</span>
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Học sinh: <strong className="text-white">{previewProofModal.student.name}</strong> ({previewProofModal.student.code}) • Lớp: <strong className="text-amber-400">{currentClass?.name}</strong>
                </p>
                <p className="text-[11px] text-slate-400">
                  Ngày nghỉ: <span className="text-slate-200 font-semibold">{selectedDate}</span> • Lý do: <span className="text-amber-300 font-medium">{previewProofModal.record.note || 'Nghỉ có phép'}</span>
                </p>
              </div>

              <button
                onClick={() => setPreviewProofModal(null)}
                className="p-1 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image / Document Preview Area */}
            <div className="max-h-[60vh] overflow-auto flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-950 border border-slate-800">
              {previewProofModal.record.proof_base64 || (previewProofModal.record.proof_url && (previewProofModal.record.proof_url.startsWith('data:') || previewProofModal.record.proof_url.startsWith('/uploads/'))) ? (
                previewProofModal.record.proof_file_name?.toLowerCase().endsWith('.pdf') ? (
                  <div className="w-full h-[50vh] flex flex-col items-center justify-center p-4 text-center space-y-3">
                    <Paperclip className="w-12 h-12 text-amber-400" />
                    <div className="text-sm font-bold text-white">{previewProofModal.record.proof_file_name}</div>
                    <a
                      href={previewProofModal.record.proof_url || previewProofModal.record.proof_base64}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-slate-950 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Mở xem tệp PDF</span>
                    </a>
                  </div>
                ) : (
                  <img
                    src={previewProofModal.record.proof_base64 || previewProofModal.record.proof_url}
                    alt="Minh chứng nghỉ phép"
                    className="max-h-[50vh] max-w-full object-contain rounded-xl shadow-lg border border-slate-700"
                  />
                )
              ) : previewProofModal.record.proof_url?.startsWith('http') ? (
                <div className="p-6 text-center space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Paperclip className="w-8 h-8" />
                  </div>
                  <div className="text-xs text-slate-300 font-mono break-all max-w-md mx-auto">
                    {previewProofModal.record.proof_file_name || 'Đơn nghỉ phép Google Drive'}
                  </div>
                  <a
                    href={previewProofModal.record.proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Mở Tệp Trực Tiếp Trong Google Drive</span>
                  </a>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 text-xs">
                  <span>Không tìm thấy bản xem trước trực quan. Vui lòng mở qua Google Drive hoặc tải về.</span>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate mr-2">
                <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-mono truncate">{previewProofModal.record.proof_file_name || 'don_xin_nghi_phep.jpg'}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => triggerFileDownload(
                    previewProofModal.record.proof_file_name || 'don_xin_nghi_phep.jpg',
                    previewProofModal.record.proof_base64 || previewProofModal.record.proof_url || ''
                  )}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải Về</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewProofModal(null)}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-colors"
                >
                  Đóng
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
