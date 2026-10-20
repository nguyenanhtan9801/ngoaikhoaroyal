import React, { useState } from 'react';
import { 
  GraduationCap, 
  Plus, 
  Search, 
  AlertTriangle, 
  ArrowRightLeft, 
  Clock, 
  Building2, 
  UserPlus, 
  Users, 
  Coins,
  CheckCircle,
  Calendar
} from 'lucide-react';
import { AppState } from '../../services/storage';
import { ClassItem } from '../../types';

interface ClassManagementProps {
  state: AppState;
  onCreateClass: (newClass: ClassItem) => void;
  onTransferStudent: (
    studentId: string, 
    fromClassId: string, 
    toClassId: string, 
    remainingSessions: number,
    surcharge: number
  ) => void;
}

export const ClassManagement: React.FC<ClassManagementProps> = ({
  state,
  onCreateClass,
  onTransferStudent
}) => {
  const { classes, subjects, facilities, timeSlots, teachers, campuses, enrollments, students } = state;

  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // New Class Form State
  const [className, setClassName] = useState('');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || '');
  const [campusId, setCampusId] = useState(campuses[0]?.id || '');
  const [facilityId, setFacilityId] = useState(facilities[0]?.id || '');
  const [timeSlotId, setTimeSlotId] = useState(timeSlots[0]?.id || '');
  const [primaryTeacherId, setPrimaryTeacherId] = useState(teachers[0]?.id || '');
  const [maxStudents, setMaxStudents] = useState<number>(15);
  const [totalSessions, setTotalSessions] = useState<number>(30);
  const [fullCourseFee, setFullCourseFee] = useState<number>(5400000);

  // Formula: Round up to thousands
  const calculatedSessionRate = Math.ceil(fullCourseFee / totalSessions / 1000) * 1000;

  // Check schedule conflict (Soft Warning)
  const conflictingFacilityClass = classes.find(
    c => c.facility_id === facilityId && c.time_slot_id === timeSlotId
  );
  const conflictingTeacherClass = classes.find(
    c => c.primary_teacher_id === primaryTeacherId && c.time_slot_id === timeSlotId
  );
  const hasConflict = Boolean(conflictingFacilityClass || conflictingTeacherClass);

  // Transfer Student Form State
  const [transferStudentId, setTransferStudentId] = useState(students[0]?.id || '');
  const [transferFromClassId, setTransferFromClassId] = useState(classes[0]?.id || '');
  const [transferToClassId, setTransferToClassId] = useState(classes[1]?.id || '');
  const [remainingSessions, setRemainingSessions] = useState<number>(15);

  const fromClass = classes.find(c => c.id === transferFromClassId);
  const toClass = classes.find(c => c.id === transferToClassId);
  const oldRate = fromClass?.price_per_session || 0;
  const newRate = toClass?.price_per_session || 0;

  // Transfer formula:
  // If oldRate >= newRate: no refund, surcharge = 0
  // If oldRate < newRate: surcharge = (newRate - oldRate) * remainingSessions
  const surcharge = newRate > oldRate ? (newRate - oldRate) * remainingSessions : 0;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!className) return;

    const newClassItem: ClassItem = {
      id: 'cls-' + Date.now(),
      name: className,
      term_id: 'term-2026-h1',
      campus_id: campusId,
      subject_id: subjectId,
      facility_id: facilityId,
      time_slot_id: timeSlotId,
      primary_teacher_id: primaryTeacherId,
      max_students: maxStudents,
      total_sessions: totalSessions,
      full_course_fee: fullCourseFee,
      price_per_session: calculatedSessionRate,
      status: 'active'
    };

    onCreateClass(newClassItem);
    setShowCreateModal(false);
    setClassName('');
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferStudentId || !transferFromClassId || !transferToClassId) return;

    onTransferStudent(transferStudentId, transferFromClassId, transferToClassId, remainingSessions, surcharge);
    setShowTransferModal(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white">
                Quản Lý Đào Tạo & Vận Hành Lớp Học
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Cảnh báo trùng lịch phòng/giáo viên &bull; Chuyển lớp chéo cơ sở &bull; Học sinh vào giữa chừng & Sĩ số linh hoạt
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTransferModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition-all shadow-md"
            >
              <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
              <span>Chuyển Lớp Cho Học Viên</span>
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Mở Lớp Học Mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* Classes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {classes.map((cls) => {
          const subject = subjects.find(s => s.id === cls.subject_id);
          const campus = campuses.find(c => c.id === cls.campus_id);
          const facility = facilities.find(f => f.id === cls.facility_id);
          const timeSlot = timeSlots.find(t => t.id === cls.time_slot_id);
          const teacher = teachers.find(t => t.id === cls.primary_teacher_id);
          
          const enrolledCount = enrollments.filter(e => e.class_id === cls.id && e.status === 'active').length;
          const isOverCapacity = enrolledCount > cls.max_students;

          return (
            <div
              key={cls.id}
              className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-5 backdrop-blur-xl space-y-4 hover:border-slate-700 transition-all group"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                    {subject?.category || 'Ngoại khóa'}
                  </span>
                  <h3 className="text-base font-extrabold text-white mt-1.5 group-hover:text-amber-300 transition-colors">
                    {cls.name}
                  </h3>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>{campus?.name}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-extrabold text-emerald-400 font-mono">
                    {cls.price_per_session.toLocaleString('vi-VN')} đ
                  </div>
                  <div className="text-[10px] text-slate-500">1 buổi chuẩn</div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-xs text-slate-300 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Phòng / Sân:</span>
                  <span className="font-semibold text-slate-200">{facility?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Khung giờ:</span>
                  <span className="font-semibold text-slate-200">{timeSlot?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Giáo viên:</span>
                  <span className="font-semibold text-amber-300">{teacher?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Học phí trọn khóa:</span>
                  <span className="font-mono font-bold text-white">
                    {cls.full_course_fee.toLocaleString('vi-VN')} đ ({cls.total_sessions} buổi)
                  </span>
                </div>
              </div>

              {/* Sĩ số Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400 font-medium">Sĩ số học viên:</span>
                  <span className={`font-mono font-bold ${isOverCapacity ? 'text-rose-400' : 'text-slate-200'}`}>
                    {enrolledCount} / {cls.max_students}
                    {isOverCapacity && ' (Vượt chỉ tiêu)'}
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOverCapacity ? 'bg-rose-500' : 'bg-amber-500'
                    }`} 
                    style={{ width: `${Math.min((enrolledCount / cls.max_students) * 100, 100)}%` }} 
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Mở Lớp Học Mới */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-xl bg-[#111827] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-white">Mở Lớp Ngoại Khóa Mới</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              
              {/* Conflict Soft Warning */}
              {hasConflict && (
                <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/50 text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Cảnh Báo Trùng Lịch (Soft Warning):</span>
                    {conflictingFacilityClass && (
                      <p className="mt-0.5 text-[11px] text-amber-200">
                        Phòng/Sân đã có lớp <strong className="text-white">{conflictingFacilityClass.name}</strong> vào khung giờ này.
                      </p>
                    )}
                    {conflictingTeacherClass && (
                      <p className="mt-0.5 text-[11px] text-amber-200">
                        Giáo viên đã được phân công lớp <strong className="text-white">{conflictingTeacherClass.name}</strong> cùng thời điểm.
                      </p>
                    )}
                    <span className="text-[10px] text-slate-400 block mt-1">
                      (Quy định: Vẫn cho phép Học vụ lưu khi có phê duyệt đặc biệt)
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Tên Lớp Ngoại Khóa *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Bóng Rổ U11 (Lớp Sáng T7-CN)"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Môn học</label>
                  <select
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Cơ sở trường</label>
                  <select
                    value={campusId}
                    onChange={(e) => setCampusId(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Phòng học / Sân bãi</label>
                  <select
                    value={facilityId}
                    onChange={(e) => setFacilityId(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Khung giờ học (TKB)</label>
                  <select
                    value={timeSlotId}
                    onChange={(e) => setTimeSlotId(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    {timeSlots.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Giáo viên phụ trách</label>
                  <select
                    value={primaryTeacherId}
                    onChange={(e) => setPrimaryTeacherId(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'})</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Sĩ số tối đa</label>
                  <input
                    type="number"
                    value={maxStudents}
                    onChange={(e) => setMaxStudents(Number(e.target.value))}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Học phí trọn khóa (đ)</label>
                  <input
                    type="number"
                    step="100000"
                    value={fullCourseFee}
                    onChange={(e) => setFullCourseFee(Number(e.target.value))}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tổng số buổi</label>
                  <input
                    type="number"
                    value={totalSessions}
                    onChange={(e) => setTotalSessions(Number(e.target.value))}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
                <span className="text-slate-400">Đơn giá 1 buổi tự động tính:</span>
                <span className="text-sm font-extrabold text-amber-400 font-mono">
                  {calculatedSessionRate.toLocaleString('vi-VN')} đ / buổi
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  Xác Nhận Tạo Lớp
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal: Chuyển Lớp Cho Học Viên */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#111827] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-extrabold text-white">Nghiệp Vụ Chuyển Lớp Cho Học Viên</h3>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-3.5 text-xs">
              
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Chọn học viên chuyển lớp</label>
                <select
                  value={transferStudentId}
                  onChange={(e) => setTransferStudentId(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Lớp chuyển đi</label>
                  <select
                    value={transferFromClassId}
                    onChange={(e) => setTransferFromClassId(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.price_per_session.toLocaleString('vi-VN')} đ)</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Lớp chuyển đến</label>
                  <select
                    value={transferToClassId}
                    onChange={(e) => setTransferToClassId(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.price_per_session.toLocaleString('vi-VN')} đ)</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Số buổi học thực tế còn lại</label>
                <input
                  type="number"
                  min="1"
                  value={remainingSessions}
                  onChange={(e) => setRemainingSessions(Number(e.target.value))}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* Surcharge calculation box */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Đơn giá buổi cũ:</span>
                  <span className="font-mono text-white">{oldRate.toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Đơn giá buổi mới:</span>
                  <span className="font-mono text-white">{newRate.toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-slate-200">Tiền phụ huynh đóng thêm:</span>
                  <span className="font-mono font-extrabold text-base text-amber-400">
                    {surcharge > 0 ? `+${surcharge.toLocaleString('vi-VN')} đ` : '0 đ (Không hoàn tiền thừa)'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 italic mt-1">
                  Quy định: Nếu đơn giá cũ &gt; mới: không hoàn tiền thừa. Nếu cũ &lt; mới: phụ huynh đóng chênh lệch cho các buổi còn lại.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-lg"
                >
                  Xác Nhận Chuyển Lớp
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
