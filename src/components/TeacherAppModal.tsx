import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Calendar, 
  Phone, 
  AlertCircle, 
  Save, 
  ShieldCheck,
  UserCheck,
  Lock,
  Coffee
} from 'lucide-react';
import { AppStore, isStudentScheduledForDate, getClassDaysOfWeek } from '../lib/storage';
import { Teacher, ExtracurricularClass, Student, AttendanceRecord, ClassSession } from '../types';
import { RoyalLogo } from './RoyalLogo';

interface TeacherAppModalProps {
  store: AppStore;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

export const TeacherAppModal: React.FC<TeacherAppModalProps> = ({
  store,
  isOpen,
  onClose,
  onUpdateStore,
}) => {
  // Selected teacher
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(store.teachers[0]?.id || '');
  const teacher = store.teachers.find(t => t.id === selectedTeacherId) || store.teachers[0];

  // Classes taught by this teacher
  const teacherClasses = store.classes.filter(c => c.primary_teacher_id === teacher?.id);
  const [selectedClassId, setSelectedClassId] = useState<string>(teacherClasses[0]?.id || store.classes[0]?.id || '');
  const currentClass = store.classes.find(c => c.id === selectedClassId) || store.classes[0];

  // Date selection (default today or realistic demo date '2026-09-23')
  const [sessionDate, setSessionDate] = useState<string>('2026-09-23');
  const [savedBanner, setSavedBanner] = useState(false);

  const classDays = getClassDaysOfWeek(currentClass, store.timeSlots);

  // Enrolled students in this class scheduled for sessionDate (including trial enrollments)
  const classEnrollments = store.enrollments.filter(
    e =>
      e.class_id === currentClass?.id &&
      (e.status === 'active' || e.status === 'trial') &&
      isStudentScheduledForDate(e, sessionDate, classDays)
  );
  const enrolledStudents = classEnrollments
    .map(e => store.students.find(s => s.id === e.student_id))
    .filter(Boolean) as Student[];

  // Existing attendance map for this date: student_id -> status
  const existingAttendance = store.attendance.filter(
    a => a.class_id === currentClass?.id && a.session_date === sessionDate
  );

  const [attendanceState, setAttendanceState] = useState<Record<string, { status: 'present' | 'absent_excused' | 'absent_unexcused'; note: string }>>({});

  React.useEffect(() => {
    if (!isOpen) return;
    const map: Record<string, { status: 'present' | 'absent_excused' | 'absent_unexcused'; note: string }> = {};
    enrolledStudents.forEach(s => {
      const match = store.attendance.find(
        a => a.class_id === currentClass?.id && a.session_date === sessionDate && a.student_id === s.id
      );
      if (match) {
        map[s.id] = { status: match.status, note: match.note || '' };
      } else {
        map[s.id] = { status: 'present', note: '' };
      }
    });
    setAttendanceState(map);
  }, [selectedClassId, sessionDate, isOpen]);

  if (!isOpen) return null;

  // Is future date check (> 2026-10-14)
  const isFutureDate = sessionDate > '2026-10-14';

  const handleStatusChange = (studentId: string, status: 'present' | 'absent_excused' | 'absent_unexcused') => {
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
      },
    }));
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        note,
      },
    }));
  };

  const handleSaveTeacherAttendance = () => {
    if (isFutureDate) {
      alert('Không thể điểm danh cho ngày trong tương lai!');
      return;
    }

    if (!currentClass) return;

    // Calculate snacks
    const royalStudents = enrolledStudents.filter(s => s.is_royal_student);
    let consumed = 0;
    let returned = 0;
    royalStudents.forEach(s => {
      const st = attendanceState[s.id]?.status || 'present';
      if (st === 'present' || st === 'absent_unexcused') consumed++;
      else if (st === 'absent_excused') returned++;
    });

    onUpdateStore(prev => {
      // Session
      const updatedSessions = prev.sessions.filter(
        s => !(s.class_id === currentClass.id && s.session_date === sessionDate)
      );
      const newSession: ClassSession = {
        id: `ses_tch_${Date.now()}`,
        class_id: currentClass.id,
        session_date: sessionDate,
        session_number: updatedSessions.length + 1,
        actual_teacher_id: teacher.id,
        is_substitute: false,
        snacks_allocated: royalStudents.length,
        snacks_consumed: consumed,
        snacks_returned: returned,
        status: 'completed',
      };
      updatedSessions.push(newSession);

      // Attendance records
      const remainingAttendance = prev.attendance.filter(
        a => !(a.class_id === currentClass.id && a.session_date === sessionDate)
      );
      const newRecords: AttendanceRecord[] = enrolledStudents.map((s, idx) => ({
        id: `att_tch_${Date.now()}_${idx}`,
        session_id: newSession.id,
        class_id: currentClass.id,
        student_id: s.id,
        session_date: sessionDate,
        status: attendanceState[s.id]?.status || 'present',
        note: attendanceState[s.id]?.note || '',
      }));

      // Trial Session Policy: Auto-promote to Active upon attending Session 2 with present
      let updatedEnrollments = [...prev.enrollments];
      let updatedInvoices = [...prev.invoices];
      const newlyPromoted: string[] = [];

      enrolledStudents.forEach(s => {
        const enr = updatedEnrollments.find(e => e.student_id === s.id && e.class_id === currentClass.id);
        if (enr && enr.status === 'trial') {
          const currentStatus = attendanceState[s.id]?.status || 'present';
          if (currentStatus === 'present') {
            const priorPresentRecords = prev.attendance.filter(
              a => a.student_id === s.id && a.class_id === currentClass.id && a.session_date !== sessionDate && a.status === 'present'
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

      const newNotifications = [...prev.notifications];
      if (newlyPromoted.length > 0) {
        newNotifications.unshift({
          id: `notif_trial_tch_${Date.now()}`,
          type: 'enrollment_over_quota',
          title: `Tự động lên Chính thức sau Buổi 2: ${newlyPromoted.join(', ')}`,
          message: `Giáo viên ${teacher.name} đã điểm danh buổi 2 cho ${newlyPromoted.join(', ')} lớp ${currentClass.name}. Hệ thống đã tự động chuyển sang CHÍNH THỨC và kích hoạt hóa đơn học phí toàn khóa.`,
          date: sessionDate,
          severity: 'low',
          read: false,
        });
      }

      return {
        ...prev,
        sessions: updatedSessions,
        attendance: [...remainingAttendance, ...newRecords],
        enrollments: updatedEnrollments,
        invoices: updatedInvoices,
        notifications: newNotifications,
      };
    });

    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-3xl bg-[#0B0F19] border border-amber-500/40 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-3.5 sm:p-5 bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/10 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RoyalLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-extrabold text-white">ROYAL SCHOOL TEACHER APP</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                  Bảo mật tài chính
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Giao diện điểm danh & y tế độc lập cho Giáo viên (Khóa hoàn toàn thông tin học phí, hóa đơn và công nợ)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="p-4 bg-slate-900/60 border-b border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Giáo viên đăng nhập:</label>
            <select
              value={selectedTeacherId}
              onChange={(e) => {
                setSelectedTeacherId(e.target.value);
                const firstCls = store.classes.find(c => c.primary_teacher_id === e.target.value);
                if (firstCls) setSelectedClassId(firstCls.id);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold focus:outline-none focus:border-amber-500"
            >
              {store.teachers.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Lớp phụ trách:</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold focus:outline-none focus:border-amber-500"
            >
              {teacherClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Ngày buổi dạy:</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Notification Banner */}
        {savedBanner && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Thầy/Cô đã hoàn thành điểm danh buổi học thành công! Dữ liệu đã chuyển sang bộ phận Học vụ.</span>
          </div>
        )}

        {isFutureDate && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <Lock className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Khóa điểm danh: Ngày này trong tương lai! Vui lòng chọn buổi học hôm nay hoặc trước đó.</span>
          </div>
        )}

        {/* Student Attendance List */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-bold text-white uppercase tracking-wider">
              Danh sách học viên ({enrolledStudents.length} em)
            </span>
            <span className="text-amber-400 flex items-center gap-1 font-semibold">
              <AlertCircle className="w-3.5 h-3.5" />
              Lưu ý dị ứng & SĐT phụ huynh khẩn cấp
            </span>
          </div>

          {enrolledStudents.map((student, idx) => {
            const st = attendanceState[student.id]?.status || 'present';
            const note = attendanceState[student.id]?.note || '';
            const enr = store.enrollments.find(e => e.student_id === student.id && e.class_id === currentClass?.id);
            const isTrial = enr?.status === 'trial';

            return (
              <div
                key={student.id}
                className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-400 font-bold">{idx + 1}.</span>
                    <span className="font-bold text-white text-sm">{student.name}</span>
                    <span className="font-mono text-xs text-amber-400 font-semibold">({student.code})</span>

                    {isTrial && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                        <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                        [Học Thử Buổi 1]
                      </span>
                    )}

                    {student.is_royal_student ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                        <Coffee className="w-3 h-3" />
                        Có suất bánh sữa
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">
                        Không suất
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                    <div className="flex items-center gap-1 text-slate-300">
                      <Phone className="w-3 h-3 text-amber-400" />
                      <span>PH: {student.parent_phone} ({student.parent_name})</span>
                    </div>
                  </div>

                  {/* Medical Note Highlight */}
                  {student.medical_notes && (
                    <div className="mt-2 p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-start gap-1.5 text-xs text-rose-300">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Y tế/Dị ứng: </strong>
                        <span>{student.medical_notes}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status Toggle & Note */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'present')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                        st === 'present'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Có mặt</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'absent_excused')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                        st === 'absent_excused'
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Có phép</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'absent_unexcused')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                        st === 'absent_unexcused'
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Không phép</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Ghi chú nhanh..."
                    value={note}
                    onChange={(e) => handleNoteChange(student.id, e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs placeholder-slate-600 w-36 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400 hidden sm:block">
            * Dữ liệu điểm danh được đồng bộ thời gian thực tới Bảng điều khiển Học vụ.
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Đóng
            </button>
            <button
              onClick={handleSaveTeacherAttendance}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/25 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4 text-slate-950" />
              <span>Lưu Buổi Điểm Danh</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
