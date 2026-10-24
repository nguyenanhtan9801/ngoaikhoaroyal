import React, { useState, useEffect } from 'react';
import { X, Calendar, BookOpen, User, Building2, DollarSign, Users, Clock, AlertTriangle } from 'lucide-react';
import { AppStore, ExtracurricularClass } from '../../types';
import { calculateCeilSessionRate, formatVND } from '../../lib/storage';
import { formatCapitalizedName } from '../../lib/formatters';
import { showToast } from '../../lib/toast';

interface CreateClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingClass: ExtracurricularClass | null;
  store: AppStore;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  initialTermId?: string;
  initialCampusId?: string;
  initialSubjectId?: string;
}

export const CreateClassModal: React.FC<CreateClassModalProps> = ({
  isOpen,
  onClose,
  editingClass,
  store,
  onUpdateStore,
  initialTermId,
  initialCampusId,
  initialSubjectId,
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [termId, setTermId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(['T2', 'T4']);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxStudents, setMaxStudents] = useState<number>(20);
  const [totalSessions, setTotalSessions] = useState<number>(24);
  const [fullCourseFee, setFullCourseFee] = useState<number>(3990000);

  useEffect(() => {
    if (editingClass) {
      setName(editingClass.name);
      setCode(editingClass.code || editingClass.id);
      setTermId(editingClass.term_id);
      setCampusId(editingClass.campus_id);
      setSubjectId(editingClass.subject_id);
      setTeacherId(editingClass.primary_teacher_id);
      setDaysOfWeek(editingClass.days_of_week || ['T2', 'T4']);
      setStartDate(editingClass.start_date || '');
      setEndDate(editingClass.end_date || '');
      setMaxStudents(editingClass.max_students || 20);
      setTotalSessions(editingClass.total_sessions || 24);
      setFullCourseFee(editingClass.full_course_fee || 3990000);
    } else {
      const defaultTerm = initialTermId || store.terms?.[0]?.id || '';
      const defaultCampus = initialCampusId || store.campuses?.[0]?.id || '';
      const defaultSubject = initialSubjectId || store.subjects?.[0]?.id || '';
      const defaultTeacher = store.teachers?.[0]?.id || '';

      const termObj = store.terms?.find((t) => t.id === defaultTerm);
      const subjectObj = store.subjects?.find((s) => s.id === defaultSubject);

      const generatedCode = `CLS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      setName(subjectObj ? `${subjectObj.name} - Nhóm 1` : 'Lớp Ngoại Khóa Mới');
      setCode(generatedCode);
      setTermId(defaultTerm);
      setCampusId(defaultCampus);
      setSubjectId(defaultSubject);
      setTeacherId(defaultTeacher);
      setDaysOfWeek(['T2', 'T4']);
      setStartDate(termObj?.start_date || '2026-09-01');
      setEndDate(termObj?.end_date || '2026-12-15');
      setMaxStudents(20);
      setTotalSessions(24);
      setFullCourseFee(3990000);
    }
  }, [editingClass, isOpen, store, initialTermId, initialCampusId, initialSubjectId]);

  if (!isOpen) return null;

  const pricePerSession = calculateCeilSessionRate(fullCourseFee, totalSessions);

  const toggleDay = (day: string) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Vui lòng nhập tên lớp học!', 'warning');
      return;
    }
    if (daysOfWeek.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 thứ học trong tuần!', 'warning');
      return;
    }

    const formattedName = formatCapitalizedName(name);

    if (editingClass) {
      const updatedClass: ExtracurricularClass = {
        ...editingClass,
        name: formattedName,
        code,
        term_id: termId,
        campus_id: campusId,
        subject_id: subjectId,
        primary_teacher_id: teacherId,
        days_of_week: daysOfWeek,
        start_date: startDate,
        end_date: endDate,
        max_students: maxStudents,
        total_sessions: totalSessions,
        full_course_fee: fullCourseFee,
        facility_id: editingClass.facility_id || 'fac_room_101',
        time_slot_id: editingClass.time_slot_id || 'slot_1',
      };

      onUpdateStore((prev) => ({
        ...prev,
        classes: (prev.classes || []).map((c) => (c.id === editingClass.id ? updatedClass : c)),
      }));

      showToast(`Đã cập nhật thông tin lớp "${updatedClass.name}"!`, 'success');
    } else {
      const newClass: ExtracurricularClass = {
        id: `cls_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: formattedName,
        code: code || `CLS-${Date.now().toString().slice(-4)}`,
        term_id: termId,
        campus_id: campusId,
        subject_id: subjectId,
        primary_teacher_id: teacherId,
        days_of_week: daysOfWeek,
        start_date: startDate,
        end_date: endDate,
        max_students: maxStudents,
        total_sessions: totalSessions,
        full_course_fee: fullCourseFee,
        price_per_session: pricePerSession,
        status: 'active',
        facility_id: 'fac_room_101',
        time_slot_id: 'slot_1',
      };

      onUpdateStore((prev) => ({
        ...prev,
        classes: [newClass, ...(prev.classes || [])],
      }));

      showToast(`Đã tạo mới lớp học "${newClass.name}" thành công!`, 'success');
    }

    onClose();
  };

  const weekDayOptions = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-amber-500/30 p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                {editingClass ? 'Chỉnh Sửa Lớp Ngoại Khóa' : 'Khai Mở Lớp Ngoại Khóa Mới'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Cấu hình lịch học, giáo viên phụ trách và định mức biểu phí
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Tên Lớp Ngoại Khóa *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => setName(formatCapitalizedName(e.target.value))}
                placeholder="VD: Bóng Rổ Nâng Cao PMH - Lớp 01"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Mã Lớp Học (Code)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="VD: CLS-2026-001"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Cơ Sở Giảng Dạy *
              </label>
              <select
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                {(store.campuses || []).map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Khóa Học (Học Kỳ) *
              </label>
              <select
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                {(store.terms || []).map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Môn Học Ngoại Khóa *
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                {(store.subjects || []).map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Giáo Viên Đảm Trách Chính *
            </label>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
            >
              {(store.teachers || []).map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.name} ({tc.code || tc.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
              Các Thứ Học Trong Tuần *
            </label>
            <div className="flex flex-wrap gap-2">
              {weekDayOptions.map((day) => {
                const isSelected = daysOfWeek.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Ngày Bắt Đầu Lớp
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Ngày Kết Thúc Lớp
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Sĩ Số Tối Đa
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={maxStudents}
                onChange={(e) => setMaxStudents(parseInt(e.target.value) || 20)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Tổng Số Buổi Khóa
              </label>
              <input
                type="number"
                min="1"
                value={totalSessions}
                onChange={(e) => setTotalSessions(parseInt(e.target.value) || 24)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Học Phí Toàn Khóa (VNĐ)
              </label>
              <input
                type="number"
                step="10000"
                value={fullCourseFee}
                onChange={(e) => setFullCourseFee(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Fee preview card */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Đơn giá 1 buổi quy đổi (Ceil):</span>
            <span className="font-mono font-bold text-amber-400">
              {formatVND(pricePerSession)} / buổi
            </span>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
            >
              {editingClass ? 'Lưu Cập Nhật Lớp' : 'Tạo Lớp Học Mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
