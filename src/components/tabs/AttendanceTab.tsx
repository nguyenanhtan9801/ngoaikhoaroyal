import React, { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Calendar, 
  UserCheck, 
  Coffee, 
  ShieldAlert, 
  Clock, 
  Printer, 
  ChevronLeft, 
  Save, 
  FileText,
  AlertCircle,
  HelpCircle,
  Lock
} from 'lucide-react';
import { AppStore, formatVND } from '../../lib/storage';
import { ExtracurricularClass, Student, ClassSession, AttendanceRecord, UserRole } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface AttendanceTabProps {
  store: AppStore;
  currentRole: UserRole;
  selectedClass: ExtracurricularClass | null;
  onSelectClass: (cls: ExtracurricularClass) => void;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onPrintAttendanceBook: (cls: ExtracurricularClass, sessionDate: string) => void;
  onIssueCreditForStudent: (student: Student, cls: ExtracurricularClass, dates: string[]) => void;
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({
  store,
  currentRole,
  selectedClass,
  onSelectClass,
  onUpdateStore,
  onPrintAttendanceBook,
  onIssueCreditForStudent,
}) => {
  const currentClass = selectedClass || store.classes[0];
  const [selectedDate, setSelectedDate] = useState<string>('2026-09-21');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    currentClass?.primary_teacher_id || store.teachers[0]?.id || ''
  );
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [isSubstitute, setIsSubstitute] = useState<boolean>(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  if (!currentClass) {
    return (
      <div className="p-8 text-center rounded-3xl bg-[#111827]/80 border border-slate-800 text-slate-400">
        Chưa có lớp học nào trong hệ thống.
      </div>
    );
  }

  // Enrolled students in this class
  const classEnrollments = store.enrollments.filter(
    e => e.class_id === currentClass.id && e.status === 'active'
  );
  const enrolledStudents = classEnrollments
    .map(e => store.students.find(s => s.id === e.student_id))
    .filter(Boolean) as Student[];

  // Time slot of this class
  const timeSlot = store.timeSlots.find(t => t.id === currentClass.time_slot_id);

  // Existing session for this date
  const currentSession = store.sessions.find(
    s => s.class_id === currentClass.id && s.session_date === selectedDate
  );

  // Existing attendance map for this date: student_id -> { status, note }
  const existingAttendance = store.attendance.filter(
    a => a.class_id === currentClass.id && a.session_date === selectedDate
  );

  const initialStatusMap: Record<string, { status: 'present' | 'absent_excused' | 'absent_unexcused'; note: string }> = {};
  enrolledStudents.forEach(s => {
    const existing = existingAttendance.find(a => a.student_id === s.id);
    if (existing) {
      initialStatusMap[s.id] = { status: existing.status, note: existing.note || '' };
    } else {
      initialStatusMap[s.id] = { status: 'present', note: '' };
    }
  });

  const [attendanceState, setAttendanceState] = useState(initialStatusMap);

  // Update teacher selection when class changes
  React.useEffect(() => {
    if (currentClass) {
      setSelectedTeacherId(currentClass.primary_teacher_id);
      setIsSubstitute(false);
    }
  }, [currentClass?.id]);

  // Update attendance state when selectedDate changes
  React.useEffect(() => {
    const newMap: Record<string, { status: 'present' | 'absent_excused' | 'absent_unexcused'; note: string }> = {};
    enrolledStudents.forEach(s => {
      const existing = store.attendance.find(
        a => a.class_id === currentClass.id && a.session_date === selectedDate && a.student_id === s.id
      );
      if (existing) {
        newMap[s.id] = { status: existing.status, note: existing.note || '' };
      } else {
        newMap[s.id] = { status: 'present', note: '' };
      }
    });
    setAttendanceState(newMap);
  }, [selectedDate, currentClass?.id]);

  // Constraint: check if date is in future (> 2026-10-14)
  const isFutureDate = selectedDate > '2026-10-14';

  // Constraint: check if date matches time slot day of week
  const getDayCode = (dateStr: string) => {
    const d = new Date(dateStr).getDay();
    // 0: CN, 1: T2, 2: T3, 3: T4, 4: T5, 5: T6, 6: T7
    const map = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return map[d];
  };

  const currentDayCode = getDayCode(selectedDate);
  const isScheduledDay = timeSlot?.days_of_week.includes(currentDayCode);

  // Royal Snacks live calculation for this session
  // Rule: only Royal students get snacks
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

  // Handle Status Change
  const setStatus = (studentId: string, status: 'present' | 'absent_excused' | 'absent_unexcused') => {
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
      },
    }));
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

  // Save Attendance Session
  const handleSaveAttendance = () => {
    if (isFutureDate) {
      alert('Ràng buộc hệ thống: Không thể điểm danh cho ngày trong tương lai!');
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

      // 2. Attendance records
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
      }));

      const finalAttendance = [...remainingAttendance, ...newRecords];

      // 3. Consecutive Absence Check (>= 3 excused absences)
      const newNotifications = [...prev.notifications];
      enrolledStudents.forEach(s => {
        const studentHistory = finalAttendance
          .filter(a => a.student_id === s.id && a.class_id === currentClass.id)
          .sort((a, b) => a.session_date.localeCompare(b.session_date));

        // Count trailing consecutive excused absences
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

      return {
        ...prev,
        sessions: updatedSessions,
        attendance: finalAttendance,
        notifications: newNotifications,
      };
    });

    setSuccessBanner('Đã lưu dữ liệu điểm danh và tự động kết toán suất bánh sữa thành công!');
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
                  className="bg-slate-900 border border-slate-700 text-white text-base font-bold rounded-xl px-3 py-1.5 focus:outline-none focus:border-amber-500"
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02]"
            >
              <Save className="w-4 h-4 text-slate-950" />
              <span>Lưu Buổi Điểm Danh</span>
            </button>
          </div>

        </div>

        {/* Date Selector & Teacher Assignment Sub-bar */}
        <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          
          {/* Ngày Buổi Học */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
            <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Ngày buổi học:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-transparent text-white font-bold text-xs focus:outline-none"
              />
            </div>
          </div>

          {/* Giáo viên đứng lớp thực tế */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
            <UserCheck className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="flex-1">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Giáo viên đứng lớp:</span>
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
                    {t.name} {t.id === currentClass.primary_teacher_id ? '(Chính)' : '(Dạy thay)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dạy thay tag */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-slate-400 font-medium">Trạng thái phân công:</span>
            {isSubstitute ? (
              <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 text-[11px]">
                Giáo viên Dạy Thay
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 text-[11px]">
                Giáo viên Chính thức
              </span>
            )}
          </div>

        </div>

        {/* Date Validation Warnings */}
        {isFutureDate && (
          <div className="mt-3 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs font-semibold">
            <Lock className="w-4 h-4 shrink-0 text-rose-400" />
            <span>KHÓA ĐIỂM DANH: Ngày được chọn ({selectedDate}) là ngày trong tương lai. Chỉ được phép điểm danh cho hôm nay hoặc ngày trong quá khứ!</span>
          </div>
        )}

        {!isScheduledDay && (
          <div className="mt-3 p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center gap-2 text-amber-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>LƯU Ý: Ngày được chọn là {currentDayCode}, không trùng với lịch chuẩn của lớp ({timeSlot?.days_of_week.join(', ')}).</span>
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
              Công thức: Tiêu thụ = Có mặt + Vắng Không phép | Hoàn trả = Vắng Có phép
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
              <span>Danh Sách Học Sinh Lớp ({enrolledStudents.length} học viên)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              * Học sinh nợ học phí vẫn được điểm danh học bình thường theo quy chế
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          </div>
        </div>

        {/* VIEW 1: CARDS VIEW */}
        {viewMode === 'cards' && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrolledStudents.map((student, idx) => {
              const currentStatus = attendanceState[student.id]?.status || 'present';
              const currentNote = attendanceState[student.id]?.note || '';
              const invoice = store.invoices.find(
                i => i.student_id === student.id && i.class_id === currentClass.id
              );

              return (
                <div 
                  key={student.id}
                  className={`rounded-2xl p-4 border transition-all ${
                    currentStatus === 'present'
                      ? 'bg-slate-900/90 border-emerald-500/30 shadow-lg shadow-emerald-500/5'
                      : currentStatus === 'absent_excused'
                      ? 'bg-slate-900/90 border-amber-500/30 shadow-lg shadow-amber-500/5'
                      : 'bg-slate-900/90 border-rose-500/30 shadow-lg shadow-rose-500/5'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-700 flex items-center justify-center font-extrabold text-white text-sm shadow-md shadow-amber-500/10">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-1.5">
                          <span>{student.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-2 py-0.2 rounded font-mono font-bold text-[10px] ${
                            student.is_royal_student
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {student.code}
                          </span>
                          <span className="text-[11px] text-slate-400">PH: {student.parent_phone}</span>
                        </div>
                      </div>
                    </div>

                    {/* Snack Badge */}
                    {student.is_royal_student ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1 shrink-0">
                        <Coffee className="w-3 h-3 text-amber-400" />
                        Bánh sữa
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[10px] shrink-0">
                        Ngoài trường
                      </span>
                    )}
                  </div>

                  {/* Medical Note Alert */}
                  {student.medical_notes ? (
                    <div className="mb-3 p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-start gap-1.5 text-xs text-rose-300">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <span className="font-semibold">{student.medical_notes}</span>
                    </div>
                  ) : null}

                  {/* Tuition Status */}
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-slate-950/60 border border-slate-800 mb-3 text-xs">
                    <span className="text-slate-400 text-[11px]">Học phí:</span>
                    {invoice ? (
                      invoice.payment_status === 'paid' ? (
                        <span className="px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                          Đã hoàn tất
                        </span>
                      ) : invoice.payment_status === 'partial' ? (
                        <span className="px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                          Còn nợ {formatVND(invoice.outstanding_amount)}
                        </span>
                      ) : (
                        <span className="px-2 py-0.2 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                          Chưa nộp {formatVND(invoice.outstanding_amount)}
                        </span>
                      )
                    ) : (
                      <span className="text-slate-500 text-[10px]">Chưa lập HĐ</span>
                    )}
                  </div>

                  {/* Attendance 3-State Buttons */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Điểm danh chuyên cần:
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setStatus(student.id, 'present')}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
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
                        onClick={() => setStatus(student.id, 'absent_excused')}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
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
                        onClick={() => setStatus(student.id, 'absent_unexcused')}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
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
                      placeholder="Lý do nghỉ hoặc ghi chú..."
                      value={currentNote}
                      onChange={(e) => setNote(student.id, e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-amber-500"
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
                  <th className="py-3 px-4">Lưu Ý Y Tế & Dị Ứng</th>
                  <th className="py-3 px-4">Tình Trạng Học Phí</th>
                  <th className="py-3 px-4 text-center">Chuyên Cần</th>
                  <th className="py-3 px-4">Ghi Chú Lý Do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {enrolledStudents.map((student, idx) => {
                  const currentStatus = attendanceState[student.id]?.status || 'present';
                  const currentNote = attendanceState[student.id]?.note || '';
                  const invoice = store.invoices.find(
                    i => i.student_id === student.id && i.class_id === currentClass.id
                  );

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
                        <div className="font-bold text-white">{student.name}</div>
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

                      <td className="py-3 px-4 max-w-xs">
                        {student.medical_notes ? (
                          <div className="flex items-start gap-1.5 p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <span>{student.medical_notes}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Bình thường</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {invoice ? (
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
                            onClick={() => setStatus(student.id, 'present')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              currentStatus === 'present'
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-extrabold'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Có mặt</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStatus(student.id, 'absent_excused')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              currentStatus === 'absent_excused'
                                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-extrabold'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>Vắng CP</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStatus(student.id, 'absent_unexcused')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              currentStatus === 'absent_unexcused'
                                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 font-extrabold'
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
                          placeholder="Nhập lý do nghỉ nếu có..."
                          value={currentNote}
                          onChange={(e) => setNote(student.id, e.target.value)}
                          className="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-amber-500"
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

    </div>
  );
};
