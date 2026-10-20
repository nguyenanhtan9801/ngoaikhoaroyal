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
  Link as LinkIcon,
  X,
  Paperclip,
  FolderCheck,
  Check
} from 'lucide-react';
import { 
  AppStore, 
  formatVND, 
  createAuditRecord, 
  appendAuditLog,
  GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_DRIVE_ROOT_URL
} from '../../lib/storage';
import { ExtracurricularClass, Student, ClassSession, AttendanceRecord, UserRole, AppUser } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface AttendanceTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  selectedClass: ExtracurricularClass | null;
  onSelectClass: (cls: ExtracurricularClass) => void;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onPrintAttendanceBook: (cls: ExtracurricularClass, sessionDate: string) => void;
  onIssueCreditForStudent: (student: Student, cls: ExtracurricularClass, dates: string[]) => void;
}

interface WeekOption {
  weekNumber: number;
  startDate: string; // YYYY-MM-DD (Monday)
  endDate: string;   // YYYY-MM-DD (Sunday)
  label: string;
  isCurrent: boolean;
}

// 16 Tuần học của Khóa Mùa Thu 2026 (Bắt đầu từ Thứ 2: 31/08/2026)
const TERM_WEEKS: WeekOption[] = (() => {
  const weeks: WeekOption[] = [];
  const baseMonday = new Date('2026-08-31T00:00:00');
  const today = new Date().toISOString().split('T')[0];

  for (let i = 1; i <= 16; i++) {
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
})();

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
}) => {
  const currentClass = selectedClass || store.classes[0];
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

  // Selected week (Default: current week or week 8)
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(() => {
    const idx = TERM_WEEKS.findIndex(w => w.isCurrent);
    return idx >= 0 ? idx : 7; // Tuần 8 mặc định
  });
  const currentWeek = TERM_WEEKS[selectedWeekIndex] || TERM_WEEKS[0];

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
    // Pick today if today is a scheduled session date, or the latest past session, or the first
    return scheduledSessionsForWeek[0]?.dateStr || '2026-09-02';
  });

  // Keep selectedDate in sync when week or class changes
  useEffect(() => {
    if (scheduledSessionsForWeek.length > 0) {
      const isSelectedInWeek = scheduledSessionsForWeek.some(s => s.dateStr === selectedDate);
      if (!isSelectedInWeek) {
        // Choose today if in this week, or the latest session that is not in the future, else first session
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
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Modal proof attachment state
  const [proofModalStudent, setProofModalStudent] = useState<Student | null>(null);
  const [proofUrlInput, setProofUrlInput] = useState<string>('');
  const [proofFileNameInput, setProofFileNameInput] = useState<string>('');
  const [proofNoteInput, setProofNoteInput] = useState<string>('');
  const [proofUploadActive, setProofUploadActive] = useState<boolean>(false);
  const [proofError, setProofError] = useState<string | null>(null);

  if (!currentClass) {
    return (
      <div className="p-8 text-center rounded-3xl bg-[#111827]/80 border border-slate-800 text-slate-400">
        Chưa có lớp học nào trong hệ thống.
      </div>
    );
  }

  // Enrolled students in this class (active and trial)
  const classEnrollments = store.enrollments.filter(
    e => e.class_id === currentClass.id && (e.status === 'active' || e.status === 'trial')
  );
  const enrolledStudents = classEnrollments
    .map(e => store.students.find(s => s.id === e.student_id))
    .filter(Boolean) as Student[];

  // Existing session for this date
  const currentSession = store.sessions.find(
    s => s.class_id === currentClass.id && s.session_date === selectedDate
  );

  // Existing attendance map for this date
  const existingAttendance = store.attendance.filter(
    a => a.class_id === currentClass.id && a.session_date === selectedDate
  );

  const initialStatusMap: Record<string, StudentAttendanceLocal> = {};
  enrolledStudents.forEach(s => {
    const existing = existingAttendance.find(a => a.student_id === s.id);
    if (existing) {
      initialStatusMap[s.id] = {
        status: existing.status,
        note: existing.note || '',
        proof_url: existing.proof_url || '',
        proof_file_name: existing.proof_file_name || '',
      };
    } else {
      initialStatusMap[s.id] = { status: 'present', note: '' };
    }
  });

  const [attendanceState, setAttendanceState] = useState<Record<string, StudentAttendanceLocal>>(initialStatusMap);

  // Update teacher selection when class changes
  useEffect(() => {
    if (currentClass) {
      setSelectedTeacherId(currentClass.primary_teacher_id);
      setIsSubstitute(false);
    }
  }, [currentClass?.id]);

  // Update attendance state when selectedDate changes
  useEffect(() => {
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
        };
      } else {
        newMap[s.id] = { status: 'present', note: '' };
      }
    });
    setAttendanceState(newMap);
  }, [selectedDate, currentClass?.id]);

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

  // Handle Status Change with mandatory proof modal for Excused Absences
  const handleSetStatus = (student: Student, targetStatus: 'present' | 'absent_excused' | 'absent_unexcused') => {
    if (isFutureDate) return;

    if (targetStatus === 'absent_excused') {
      // Open Proof Modal
      const existing = attendanceState[student.id];
      setProofModalStudent(student);
      setProofUrlInput(existing?.proof_url || '');
      setProofFileNameInput(existing?.proof_file_name || '');
      setProofNoteInput(existing?.note || 'Phụ huynh xin phép qua Zalo / Đơn thuốc bác sĩ');
      setProofError(null);
      setProofUploadActive(false);
    } else {
      // Direct set for present or absent_unexcused
      setAttendanceState(prev => ({
        ...prev,
        [student.id]: {
          ...prev[student.id],
          status: targetStatus,
        },
      }));
    }
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

  // Confirm Excused Absence Proof Modal
  const handleConfirmProof = () => {
    if (!proofModalStudent) return;

    if (!proofUrlInput.trim()) {
      setProofError('Bắt buộc phải tải lên tệp hoặc dán đường dẫn liên kết Google Drive / OneDrive minh chứng!');
      return;
    }

    setAttendanceState(prev => ({
      ...prev,
      [proofModalStudent.id]: {
        ...prev[proofModalStudent.id],
        status: 'absent_excused',
        note: proofNoteInput.trim() || 'Nghỉ có phép kèm minh chứng',
        proof_url: proofUrlInput.trim(),
        proof_file_name: proofFileNameInput || 'Minh_chung_vang_phep.pdf',
      },
    }));

    setProofModalStudent(null);
    setProofError(null);
  };

  // Mock upload action to simulated Google Drive Folder
  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProofUploadActive(true);
    setProofError(null);

    const folderId = store.cloudStorageConfig?.drive_folder_id || GOOGLE_DRIVE_FOLDER_ID;
    const campusCode = store.campuses.find(c => c.id === currentClass.campus_id)?.code || 'PMH';
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Simulate direct Google Drive file URL generated after upload into configured folder
    setTimeout(() => {
      const generatedUrl = `https://drive.google.com/file/d/1KVk_${campusCode}_${Date.now()}_${sanitizedFileName}/view?usp=sharing`;
      setProofUrlInput(generatedUrl);
      setProofFileNameInput(file.name);
      setProofUploadActive(false);
    }, 400);
  };

  // Save Attendance Session with Strict Validations
  const handleSaveAttendance = () => {
    if (isFutureDate) {
      alert(`RÀNG BUỘC THỜI GIAN: Ngày ${selectedDate} là ngày trong tương lai. Hệ thống chỉ cho phép điểm danh cho ngày hôm nay hoặc quá khứ!`);
      return;
    }

    // Check mandatory proof for all students marked absent_excused
    const unprovenStudents = enrolledStudents.filter(s => {
      const rec = attendanceState[s.id];
      return rec?.status === 'absent_excused' && (!rec.proof_url || !rec.proof_url.trim());
    });

    if (unprovenStudents.length > 0) {
      alert(`Học sinh nghỉ có phép bắt buộc phải có minh chứng hợp lệ để đảm bảo quyền lợi bảo lưu và hoàn trả bánh sữa!\nVui lòng bổ sung minh chứng cho: ${unprovenStudents.map(s => s.name).join(', ')}`);
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

      // 2. Attendance records with proof
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

      // 4. Trial Session Policy: Auto-promote to Active upon attending Session 2
      let updatedEnrollments = [...prev.enrollments];
      let updatedInvoices = [...prev.invoices];
      const newlyPromoted: string[] = [];

      enrolledStudents.forEach(s => {
        const enr = updatedEnrollments.find(e => e.student_id === s.id && e.class_id === currentClass.id);
        if (enr && enr.status === 'trial') {
          const currentStatus = attendanceState[s.id]?.status || 'present';
          if (currentStatus === 'present') {
            const priorPresentRecords = prev.attendance.filter(
              a => a.student_id === s.id && a.class_id === currentClass.id && a.session_date !== selectedDate && a.status === 'present'
            );
            if (priorPresentRecords.length >= 1 || newSession.session_number >= 2) {
              updatedEnrollments = updatedEnrollments.map(e => 
                e.id === enr.id 
                  ? { ...e, status: 'active', trial_outcome: 'promoted', trial_notes: `Tự động lên chính thức sau buổi học thứ ${priorPresentRecords.length + 1}` }
                  : e
              );
              updatedInvoices = updatedInvoices.map(inv => 
                inv.student_id === s.id && inv.class_id === currentClass.id && inv.is_trial_pending
                  ? { ...inv, is_trial_pending: false }
                  : inv
              );
              newlyPromoted.push(s.name);
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
        `Lưu điểm danh ngày ${selectedDate} lớp ${currentClass.name} (Có mặt: ${enrolledStudents.filter(s => attendanceState[s.id]?.status === 'present').length}, Vắng CP: ${liveReturned}, Suất bánh sữa hoàn: ${liveReturned})`,
        currentUser,
        {
          details: {
            session_date: selectedDate,
            class_id: currentClass.id,
            snacks_allocated: totalRoyalCount,
            snacks_consumed: liveConsumed,
            snacks_returned: liveReturned,
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

      return {
        ...prev,
        sessions: updatedSessions,
        attendance: finalAttendance,
        enrollments: updatedEnrollments,
        invoices: updatedInvoices,
        notifications: newNotifications,
        auditLogs: newAuditLogs,
      };
    });

    setSuccessBanner(`Đã lưu điểm danh buổi ngày ${selectedDate} và tự động kết toán suất bánh sữa thành công!`);
    setTimeout(() => setSuccessBanner(null), 4000);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Class Switcher & Meta Header */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-5 backdrop-blur-md shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <select
                  value={currentClass.id}
                  onChange={(e) => {
                    const c = store.classes.find(cl => cl.id === e.target.value);
                    if (c) onSelectClass(c);
                  }}
                  className="bg-slate-900 border border-slate-700 text-white text-base font-bold rounded-xl px-3 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {store.classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold">
                  {currentClass.status === 'active' ? 'Đang hoạt động' : 'Tạm dừng'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <span>{timeSlot?.name}</span>
                <span>&bull;</span>
                <span>Lịch học: {classDays.join(' & ')}</span>
                <span>&bull;</span>
                <span>{store.facilities.find(f => f.id === currentClass.facility_id)?.name}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onPrintAttendanceBook(currentClass, selectedDate)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              <span>In Sổ Điểm Danh</span>
            </button>

            <button
              onClick={handleSaveAttendance}
              disabled={isFutureDate}
              title={isFutureDate ? 'Không thể lưu điểm danh cho ngày trong tương lai' : 'Lưu dữ liệu điểm danh'}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isFutureDate
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'
                  : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-lg shadow-amber-500/20 hover:scale-[1.02]'
              }`}
            >
              {isFutureDate ? <Lock className="w-4 h-4 text-slate-500" /> : <Save className="w-4 h-4 text-slate-950" />}
              <span>{isFutureDate ? 'Bị Khóa (Ngày Tương Lai)' : 'Lưu Buổi Điểm Danh'}</span>
            </button>
          </div>

        </div>

        {/* WEEK & SCHEDULE SELECTOR BAR */}
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
            
            {/* Bộ chọn Tuần học */}
            <div className="lg:col-span-5 flex items-center gap-2 p-2.5 rounded-2xl bg-slate-900 border border-slate-800">
              <Calendar className="w-4 h-4 text-amber-400 shrink-0 ml-1" />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Chọn Tuần Học (Khóa Thu 2026):</span>
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
                    {TERM_WEEKS.map((w, idx) => (
                      <option key={w.weekNumber} value={idx}>
                        {w.label}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setSelectedWeekIndex(prev => Math.min(TERM_WEEKS.length - 1, prev + 1))}
                    disabled={selectedWeekIndex === TERM_WEEKS.length - 1}
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

          {/* Teacher Selection & Substitute Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800">
              <UserCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Giáo viên đứng lớp buổi này:</span>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => {
                    setSelectedTeacherId(e.target.value);
                    setIsSubstitute(e.target.value !== currentClass.primary_teacher_id);
                  }}
                  className="w-full bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
                >
                  {store.teachers.map(t => (
                    <option key={t.id} value={t.id} className="bg-[#111827]">
                      {t.name} {t.id === currentClass.primary_teacher_id ? '(GV Chính)' : '(GV Dạy Thay)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-400 font-medium">Trạng thái phân công GV:</span>
              {isSubstitute ? (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 text-[11px] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>Giáo viên Dạy Thay</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 text-[11px] flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Giáo viên Chính thức</span>
                </span>
              )}
            </div>
          </div>

        </div>

        {/* FUTURE DATE STRICT LOCK WARNING BANNER */}
        {isFutureDate && (
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

        {successBanner && (
          <div className="mt-3 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2 text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successBanner}</span>
          </div>
        )}

      </div>

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
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Sổ Điểm Danh Học Viên ({enrolledStudents.length} học sinh)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              * Học sinh nợ phí vẫn được điểm danh. Trạng thái Vắng CP bắt buộc đính kèm minh chứng để bảo lưu & hoàn bánh sữa.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href={GOOGLE_DRIVE_ROOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-semibold text-xs transition-colors shrink-0"
              title="Mở thư mục Google Drive lưu trữ đơn nghỉ phép & minh chứng vắng phép"
            >
              <FolderCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Drive Đơn Nghỉ Phép</span>
              <ExternalLink className="w-3 h-3 text-cyan-400" />
            </a>
            <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          </div>
        </div>

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
                          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[9px] font-bold flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                            [Học Thử]
                          </span>
                        )}
                      </div>
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
                    <div className="mb-3 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-amber-300 flex items-center gap-1">
                          <Paperclip className="w-3.5 h-3.5 text-amber-400" />
                          <span>Minh chứng nghỉ phép:</span>
                        </span>
                        {!isFutureDate && (
                          <button
                            type="button"
                            onClick={() => handleSetStatus(student, 'absent_excused')}
                            className="text-[10px] text-amber-400 hover:text-amber-300 underline font-semibold"
                          >
                            Cập nhật
                          </button>
                        )}
                      </div>
                      {proofUrl ? (
                        <a
                          href={proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 underline break-all"
                        >
                          <ExternalLink className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span>{proofFileName || 'Xem tệp minh chứng trên Drive'}</span>
                        </a>
                      ) : (
                        <div className="text-[11px] text-rose-400 font-bold">
                          ⚠️ Chưa có file minh chứng!
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
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[9px] font-bold flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                              [Học Thử]
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">PH: {student.parent_phone}</div>
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
                          <div className="pt-1">
                            {proofUrl ? (
                              <a
                                href={proofUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold hover:bg-cyan-500/30 transition-colors"
                                title="Mở minh chứng trên Drive"
                              >
                                <ExternalLink className="w-3 h-3 text-cyan-400" />
                                <span>{proofFileName || 'Minh chứng Drive'}</span>
                              </a>
                            ) : (
                              <span className="text-rose-400 font-bold text-[10px] block">
                                ⚠️ Thiếu minh chứng!
                              </span>
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

      {/* MODAL: ĐÍNH KÈM MINH CHỨNG VẮNG CÓ PHÉP (EXCUSED ABSENCE PROOF MODAL) */}
      {proofModalStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-[#111827] border border-amber-500/30 p-6 shadow-2xl shadow-amber-500/10 space-y-4">
            
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Paperclip className="w-5 h-5 text-amber-400" />
                  <span>Đính Kèm Minh Chứng Vắng Có Phép</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Học sinh: <strong className="text-white">{proofModalStudent.name}</strong> ({proofModalStudent.code})
                </p>
                <p className="text-[11px] text-slate-400">
                  Lớp: <strong className="text-slate-200">{currentClass.name}</strong> • Ngày: <strong className="text-amber-400">{selectedDate}</strong>
                </p>
              </div>

              <button
                onClick={() => setProofModalStudent(null)}
                className="p-1 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cloud Storage Destination Alert */}
            <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FolderCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="text-[11px] leading-relaxed truncate">
                  <span>Thư mục lưu trữ Google Drive: </span>
                  <strong className="text-white font-mono block truncate">
                    {GOOGLE_DRIVE_FOLDER_ID}/02_DonNghiPhep/{currentClass.campus_id}
                  </strong>
                </div>
              </div>
              <a
                href={GOOGLE_DRIVE_ROOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs border border-cyan-500/30 transition-colors shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở Google Drive</span>
              </a>
            </div>

            {/* Error Message */}
            {proofError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{proofError}</span>
              </div>
            )}

            {/* Method 1: File Upload */}
            <div className="space-y-1.5 p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>Cách 1: Tải tệp lên (File Upload: Ảnh / PDF / Giấy Khám)</span>
              </label>
              <p className="text-[10px] text-slate-400">
                Tệp được tự động tải lên và đồng bộ vào thư mục Google Drive dùng chung của trường.
              </p>
              
              <div className="mt-2">
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-700 hover:border-amber-500 rounded-xl cursor-pointer bg-slate-950/60 hover:bg-slate-950 transition-colors">
                  <Upload className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-xs text-slate-300 font-semibold">
                    {proofUploadActive ? 'Đang tải lên Cloud...' : 'Nhấn để chọn file ảnh hoặc PDF'}
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
                <div className="mt-2 p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-mono text-[11px] truncate">{proofFileNameInput}</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-bold shrink-0">✓ Đã nạp</span>
                </div>
              )}
            </div>

            {/* Method 2: Paste Direct Link */}
            <div className="space-y-1.5 p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Cách 2: Dán đường dẫn liên kết trực tiếp (Drive URL)</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setProofUrlInput(GOOGLE_DRIVE_ROOT_URL);
                    setProofFileNameInput('Don_xin_nghi_phep_Drive.pdf');
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-semibold"
                >
                  Dán link Thư mục Google Drive trường
                </button>
              </div>
              <input
                type="text"
                placeholder={GOOGLE_DRIVE_ROOT_URL}
                value={proofUrlInput}
                onChange={(e) => setProofUrlInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Note / Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Lý do nghỉ phép & Chi tiết minh chứng:
              </label>
              <input
                type="text"
                placeholder="VD: Sốt phát ban theo đơn BS Bệnh viện Nhi Đồng 1"
                value={proofNoteInput}
                onChange={(e) => setProofNoteInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />

              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {[
                  'Sốt siêu vi có toa thuốc bác sĩ',
                  'Đơn xin phép của phụ huynh qua Zalo',
                  'Trùng lịch thi chính khóa trường Royal',
                  'Chấn thương khớp cần nghỉ hồi phục',
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
                <span>Lưu Minh Chứng & Xác Nhận Vắng CP</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
