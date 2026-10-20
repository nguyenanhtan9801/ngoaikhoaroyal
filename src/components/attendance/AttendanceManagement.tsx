import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Check, 
  X, 
  AlertCircle, 
  HeartHandshake, 
  Milk, 
  UserCheck, 
  AlertTriangle, 
  Clock, 
  ShieldAlert, 
  PhoneCall,
  Save,
  UserPlus
} from 'lucide-react';
import { AppState } from '../../services/storage';
import { AttendanceStatus } from '../../types';

interface AttendanceManagementProps {
  state: AppState;
  onSaveAttendance: (
    classId: string, 
    sessionDate: string, 
    records: { studentId: string; status: AttendanceStatus; note: string }[],
    actualTeacherId: string,
    isSubstitute: boolean
  ) => void;
  userRole: string;
}

export const AttendanceManagement: React.FC<AttendanceManagementProps> = ({
  state,
  onSaveAttendance,
  userRole
}) => {
  const { classes, students, enrollments, attendance, sessions, teachers, timeSlots } = state;

  // Selected class
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  
  // Date selection: default to today (2026-10-14)
  const todayStr = '2026-10-14';
  const [sessionDate, setSessionDate] = useState<string>(todayStr);

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const timeSlot = timeSlots.find(t => t.id === selectedClass?.time_slot_id);
  
  // Teachers list
  const primaryTeacher = teachers.find(t => t.id === selectedClass?.primary_teacher_id);
  const [actualTeacherId, setActualTeacherId] = useState<string>(selectedClass?.primary_teacher_id || '');
  const isSubstitute = actualTeacherId !== selectedClass?.primary_teacher_id;

  // Students enrolled in this class
  const classStudents = useMemo(() => {
    const enrolledIds = enrollments
      .filter(e => e.class_id === selectedClassId && e.status === 'active')
      .map(e => e.student_id);
    return students.filter(s => enrolledIds.includes(s.id));
  }, [enrollments, selectedClassId, students]);

  // Existing attendance for this date
  const existingAttendanceMap = useMemo(() => {
    const map = new Map<string, { status: AttendanceStatus; note: string }>();
    attendance
      .filter(a => a.class_id === selectedClassId && a.session_date === sessionDate)
      .forEach(a => map.set(a.student_id, { status: a.status, note: a.note || '' }));
    return map;
  }, [attendance, selectedClassId, sessionDate]);

  // Local state for attendance records
  const [records, setRecords] = useState<{ [studentId: string]: { status: AttendanceStatus; note: string } }>({});

  // Sync records when class or date changes
  React.useEffect(() => {
    const init: { [studentId: string]: { status: AttendanceStatus; note: string } } = {};
    classStudents.forEach(s => {
      const existing = existingAttendanceMap.get(s.id);
      init[s.id] = existing || { status: 'present', note: '' };
    });
    setRecords(init);
    if (selectedClass) {
      setActualTeacherId(selectedClass.primary_teacher_id);
    }
  }, [selectedClassId, sessionDate, classStudents, existingAttendanceMap]);

  // Check if date is in the future
  const isFutureDate = sessionDate > todayStr;

  // Handler for status change
  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setRecords(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status
      }
    }));
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setRecords(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        note
      }
    }));
  };

  // 1-click mark all present
  const handleMarkAllPresent = () => {
    const updated = { ...records };
    classStudents.forEach(s => {
      updated[s.id] = { ...updated[s.id], status: 'present' };
    });
    setRecords(updated);
  };

  // Snack live calculation
  // Quy định: Chỉ học sinh Royal mới có suất bánh sữa
  // Suất tiêu thụ = Royal có mặt + Royal vắng không phép
  // Suất hoàn trả = Royal vắng có phép
  const royalStudents = classStudents.filter(s => s.is_royal_student);
  const royalCount = royalStudents.length;

  const royalExcusedCount = royalStudents.filter(s => {
    const rec = records[s.id];
    return rec?.status === 'absent_excused';
  }).length;

  const royalConsumedCount = royalCount - royalExcusedCount;

  // Save handler
  const [saveSuccess, setSaveSuccess] = useState(false);
  const handleSave = () => {
    const payload = classStudents.map(s => ({
      studentId: s.id,
      status: records[s.id]?.status || 'present',
      note: records[s.id]?.note || ''
    }));

    onSaveAttendance(selectedClassId, sessionDate, payload, actualTeacherId, isSubstitute);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Controller: Class Selector, Date, Teacher & Rules */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <UserCheck className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-white">
                  {userRole === 'teacher' ? 'Sổ Điểm Danh Lớp - Giáo Viên Trực Tiếp' : 'Chuyên Cần & Điểm Danh Buổi Học'}
                </h2>
                <p className="text-xs text-slate-400">
                  Ràng buộc thời gian & Tự động kết nối đối soát bánh sữa sau giờ
                </p>
              </div>
            </div>
          </div>

          {/* Quick Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleMarkAllPresent}
              disabled={isFutureDate}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Đánh Dấu Tất Cả Có Mặt</span>
            </button>

            <button
              onClick={handleSave}
              disabled={isFutureDate}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-lg transition-all ${
                saveSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{saveSuccess ? 'Đã Lưu Thành Công!' : 'Lưu Điểm Danh'}</span>
            </button>
          </div>
        </div>

        {/* Filters and Class Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80">
          
          {/* Class Select */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Chọn Lớp Ngoại Khóa
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.price_per_session.toLocaleString('vi-VN')} đ/buổi)
                </option>
              ))}
            </select>
          </div>

          {/* Session Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Ngày Buổi Học
            </label>
            <input
              type="date"
              value={sessionDate}
              max={todayStr} // Ràng buộc: Khóa ngày tương lai
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
            {isFutureDate && (
              <span className="text-[10px] text-rose-400 font-semibold block mt-1">
                Lưu ý: Không thể điểm danh trước ngày tương lai.
              </span>
            )}
          </div>

          {/* Teacher / Substitute */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <UserPlus className="w-3.5 h-3.5 text-amber-400" /> Giáo Viên Giảng Dạy
            </label>
            <select
              value={actualTeacherId}
              onChange={(e) => setActualTeacherId(e.target.value)}
              className="w-full bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {teachers.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.id === selectedClass?.primary_teacher_id ? '(Phụ trách)' : '(Dạy thay)'}
                </option>
              ))}
            </select>
            {isSubstitute && (
              <span className="text-[10px] text-amber-400 font-semibold block mt-1">
                ★ Chế độ dạy thay: Thù lao buổi sẽ chuyển cho giáo viên dạy thay.
              </span>
            )}
          </div>

          {/* Time Slot Info */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-center">
            <span className="text-[10px] text-slate-400 font-medium">Khung Giờ Học (TKB):</span>
            <span className="text-xs font-bold text-slate-200 mt-0.5">
              {timeSlot?.name || '16:30 - 18:00'}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">
              Sĩ số: <strong className="text-amber-400">{classStudents.length}</strong> / {selectedClass?.max_students} học sinh
            </span>
          </div>

        </div>

        {/* Live Snack Preview Bar */}
        <div className="rounded-2xl bg-gradient-to-r from-amber-950/30 to-amber-900/10 border border-amber-500/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Milk className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-extrabold text-amber-300">
                Đối Soát Bánh Sữa Trực Tuyến Buổi Này
              </div>
              <div className="text-[11px] text-slate-400">
                Chỉ cấp cho học sinh Royal &bull; Học sinh ngoài không hỗ trợ
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-400">Sĩ số Royal:</span>{' '}
              <strong className="text-white font-mono">{royalCount}</strong>
            </div>
            <div>
              <span className="text-emerald-400 font-semibold">Suất tiêu thụ:</span>{' '}
              <strong className="text-emerald-400 font-mono text-sm">{royalConsumedCount}</strong>
            </div>
            <div>
              <span className="text-amber-400 font-semibold">Hoàn lại bếp:</span>{' '}
              <strong className="text-amber-400 font-mono text-sm">{royalExcusedCount}</strong>
            </div>
          </div>
        </div>

      </div>

      {/* Student Attendance List */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-xl">
        
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-white">Danh Sách Học Sinh Trong Lớp</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
              {classStudents.length} học viên
            </span>
          </div>
          <span className="text-xs text-slate-400 italic">
            Học sinh nợ phí vẫn được điểm danh học bình thường
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0F19]/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">STT</th>
                <th className="py-3 px-4">Mã & Họ Tên Học Sinh</th>
                <th className="py-3 px-4">Phân Loại & Y Tế</th>
                <th className="py-3 px-4">Liên Hệ Khẩn Cấp</th>
                <th className="py-3 px-4 text-center">Trạng Thái Điểm Danh</th>
                <th className="py-3 px-4">Ghi Chú Buổi Học</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {classStudents.map((st, index) => {
                const rec = records[st.id] || { status: 'present', note: '' };
                const isRoyal = st.is_royal_student;

                return (
                  <tr 
                    key={st.id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      rec.status === 'absent_unexcused' ? 'bg-rose-950/10' : ''
                    }`}
                  >
                    {/* STT */}
                    <td className="py-3.5 px-4 font-mono text-slate-400 font-medium">
                      {index + 1}
                    </td>

                    {/* Student Name and Code */}
                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-white text-sm">{st.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[11px] text-amber-400">{st.code}</span>
                        {st.previous_student_code && (
                          <span className="text-[10px] text-slate-500">
                            (cũ: {st.previous_student_code})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Classification & Medical Alert */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <div>
                          {isRoyal ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px]">
                              <Milk className="w-3 h-3 text-amber-400" />
                              Học sinh Royal
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700 font-medium text-[10px]">
                              Học sinh ngoài
                            </span>
                          )}
                        </div>

                        {st.medical_notes ? (
                          <div className="flex items-start gap-1 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 p-1.5 rounded-lg">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <span>{st.medical_notes}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">Bình thường</span>
                        )}
                      </div>
                    </td>

                    {/* Parent Emergency Phone */}
                    <td className="py-3.5 px-4">
                      <div className="text-slate-300 font-medium">{st.parent_name}</div>
                      <a 
                        href={`tel:${st.parent_phone}`}
                        className="text-cyan-400 hover:underline font-mono text-[11px] flex items-center gap-1 mt-0.5"
                      >
                        <PhoneCall className="w-3 h-3" />
                        {st.parent_phone}
                      </a>
                    </td>

                    {/* Attendance Radio Buttons */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Có mặt */}
                        <button
                          type="button"
                          disabled={isFutureDate}
                          onClick={() => handleStatusChange(st.id, 'present')}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                            rec.status === 'present'
                              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40 ring-1 ring-emerald-400'
                              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          Có mặt
                        </button>

                        {/* Vắng có phép */}
                        <button
                          type="button"
                          disabled={isFutureDate}
                          onClick={() => handleStatusChange(st.id, 'absent_excused')}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                            rec.status === 'absent_excused'
                              ? 'bg-amber-600 text-white shadow-md shadow-amber-900/40 ring-1 ring-amber-400'
                              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          Vắng CP
                        </button>

                        {/* Vắng không phép */}
                        <button
                          type="button"
                          disabled={isFutureDate}
                          onClick={() => handleStatusChange(st.id, 'absent_unexcused')}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                            rec.status === 'absent_unexcused'
                              ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40 ring-1 ring-rose-400'
                              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          Vắng KP
                        </button>
                      </div>
                    </td>

                    {/* Note input */}
                    <td className="py-3.5 px-4">
                      <input
                        type="text"
                        placeholder="Lý do nghỉ, báo bài..."
                        value={rec.note}
                        disabled={isFutureDate}
                        onChange={(e) => handleNoteChange(st.id, e.target.value)}
                        className="w-full bg-[#0B0F19] border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
