import React, { useState } from 'react';
import { 
  Calendar, 
  Plus, 
  Users, 
  MapPin, 
  Clock, 
  User, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  Layers, 
  ChevronRight,
  ShieldAlert,
  Lock,
  Building2,
  BookOpen,
  Sparkles,
  Info
} from 'lucide-react';
import { AppStore, formatVND, calculateCeilSessionRate, getEffectivePrice, isTermClosed } from '../../lib/storage';
import { ExtracurricularClass, UserRole } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface ClassesTabProps {
  store: AppStore;
  currentRole: UserRole;
  selectedCampusId: string;
  selectedTermId: string;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onSelectClassForAttendance: (cls: ExtracurricularClass) => void;
}

export const ClassesTab: React.FC<ClassesTabProps> = ({
  store,
  currentRole,
  selectedCampusId,
  selectedTermId,
  onUpdateStore,
  onSelectClassForAttendance,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ExtracurricularClass | null>(null);

  // Check if active selected term is closed (read-only mode)
  const currentSelectedTerm = store.terms.find(t => t.id === selectedTermId);
  const isSelectedTermClosed = currentSelectedTerm?.status === 'closed';

  // Initial campus and term selection
  const defaultCampusId = selectedCampusId !== 'all' ? selectedCampusId : (store.campuses[0]?.id || '');
  const defaultTermId = selectedTermId;

  // New Class Form State with Term, Campus, Subject hierarchy
  const [formData, setFormData] = useState({
    name: '',
    term_id: defaultTermId,
    campus_id: defaultCampusId,
    subject_id: store.subjects[0]?.id || '',
    facility_id: store.facilities[0]?.id || '',
    time_slot_id: store.timeSlots[0]?.id || '',
    primary_teacher_id: store.teachers[0]?.id || '',
    max_students: 15,
    total_sessions: 24,
    full_course_fee: 3600000,
    allow_over_quota: false,
  });

  // Calculate live session rate
  const computedSessionRate = calculateCeilSessionRate(formData.full_course_fee, formData.total_sessions);

  // Filter classes by campus & term
  const filteredClasses = store.classes.filter(c => {
    const matchCampus = selectedCampusId === 'all' || c.campus_id === selectedCampusId;
    const matchTerm = c.term_id === selectedTermId;
    return matchCampus && matchTerm;
  });

  // Schedule Conflict Soft Warning Check
  const checkConflicts = (
    facilityId: string, 
    teacherId: string, 
    timeSlotId: string, 
    excludeClassId?: string,
    targetTermId: string = formData.term_id
  ) => {
    const conflicts: string[] = [];

    const existingClassesInSlot = store.classes.filter(
      c => c.time_slot_id === timeSlotId && c.id !== excludeClassId && c.term_id === targetTermId
    );

    // Check facility clash
    const facilityClash = existingClassesInSlot.find(c => c.facility_id === facilityId);
    if (facilityClash) {
      const fac = store.facilities.find(f => f.id === facilityId);
      conflicts.push(`Sân/Phòng [${fac?.name || facilityId}] đã được xếp cho lớp "${facilityClash.name}" trong cùng khung giờ.`);
    }

    // Check teacher clash
    const teacherClash = existingClassesInSlot.find(c => c.primary_teacher_id === teacherId);
    if (teacherClash) {
      const tch = store.teachers.find(t => t.id === teacherId);
      conflicts.push(`Giáo viên [${tch?.name || teacherId}] đang đứng lớp "${teacherClash.name}" trong cùng khung giờ.`);
    }

    return conflicts;
  };

  const formConflicts = checkConflicts(
    formData.facility_id,
    formData.primary_teacher_id,
    formData.time_slot_id,
    editingClass?.id,
    formData.term_id
  );

  // Cascading Selection Handler: Term -> Campus -> Subject
  const handleCascadingChange = (
    newTermId: string, 
    newCampusId: string, 
    newSubjectId: string,
    keepCustomName = false
  ) => {
    // 1. Calculate effective pricing (Campus Override > Term Standard > Default)
    const effectivePricing = getEffectivePrice(newTermId, newCampusId, newSubjectId, store);

    // 2. Filter facilities for this campus
    const campusFacilities = store.facilities.filter(f => f.campus_id === newCampusId && f.is_active);
    const nextFacilityId = campusFacilities.find(f => f.id === formData.facility_id)?.id || campusFacilities[0]?.id || formData.facility_id;

    const subj = store.subjects.find(s => s.id === newSubjectId);
    const camp = store.campuses.find(c => c.id === newCampusId);

    setFormData(prev => ({
      ...prev,
      term_id: newTermId,
      campus_id: newCampusId,
      subject_id: newSubjectId,
      facility_id: nextFacilityId,
      total_sessions: effectivePricing.total_sessions,
      full_course_fee: effectivePricing.course_fee,
      name: keepCustomName && prev.name !== '' ? prev.name : `${subj?.name || 'Lớp'} - ${camp?.code || ''}`,
    }));
  };

  const handleOpenAddModal = () => {
    if (isSelectedTermClosed) {
      alert('Khóa học này đã Đóng (Closed). Toàn bộ dữ liệu ở chế độ chỉ xem, không thể mở thêm lớp mới.');
      return;
    }

    const initialTermId = selectedTermId;
    const initialCampusId = selectedCampusId !== 'all' ? selectedCampusId : (store.campuses[0]?.id || '');

    // Get active subjects in this term
    const activeTermSubjects = store.termSubjects.filter(ts => ts.term_id === initialTermId && ts.is_active);
    const initialSubjectId = activeTermSubjects[0]?.subject_id || store.subjects[0]?.id || '';

    const effectivePricing = getEffectivePrice(initialTermId, initialCampusId, initialSubjectId, store);
    const campusFacilities = store.facilities.filter(f => f.campus_id === initialCampusId && f.is_active);
    const subj = store.subjects.find(s => s.id === initialSubjectId);
    const camp = store.campuses.find(c => c.id === initialCampusId);

    setEditingClass(null);
    setFormData({
      name: `${subj?.name || 'Lớp ngoại khóa'} - ${camp?.code || ''}`,
      term_id: initialTermId,
      campus_id: initialCampusId,
      subject_id: initialSubjectId,
      facility_id: campusFacilities[0]?.id || store.facilities[0]?.id || '',
      time_slot_id: store.timeSlots[0]?.id || '',
      primary_teacher_id: store.teachers[0]?.id || '',
      max_students: 15,
      total_sessions: effectivePricing.total_sessions,
      full_course_fee: effectivePricing.course_fee,
      allow_over_quota: false,
    });
    setShowAddModal(true);
  };

  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    // Check if target term is closed
    if (isTermClosed(formData.term_id, store)) {
      alert('Không thể lưu lớp học vào Khóa học đã ĐÓNG (Closed).');
      return;
    }

    const sessionRate = calculateCeilSessionRate(formData.full_course_fee, formData.total_sessions);

    if (editingClass) {
      onUpdateStore(prev => ({
        ...prev,
        classes: prev.classes.map(c => 
          c.id === editingClass.id 
            ? { 
                ...c, 
                ...formData, 
                price_per_session: sessionRate,
              } 
            : c
        ),
      }));
    } else {
      const newClass: ExtracurricularClass = {
        id: `cls_${Date.now()}`,
        name: formData.name,
        term_id: formData.term_id,
        campus_id: formData.campus_id,
        subject_id: formData.subject_id,
        facility_id: formData.facility_id,
        time_slot_id: formData.time_slot_id,
        primary_teacher_id: formData.primary_teacher_id,
        max_students: formData.max_students,
        total_sessions: formData.total_sessions,
        full_course_fee: formData.full_course_fee,
        price_per_session: sessionRate,
        status: 'active',
        allow_over_quota: formData.allow_over_quota,
      };

      onUpdateStore(prev => ({
        ...prev,
        classes: [newClass, ...prev.classes],
      }));
    }

    setShowAddModal(false);
    setEditingClass(null);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* Closed Term Warning Banner */}
      {isSelectedTermClosed && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-xs sm:text-sm">
                  KHÓA HỌC ĐÃ ĐÓNG (CLOSED): {currentSelectedTerm?.name}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/40">
                  CHỈ XEM (READ-ONLY)
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Theo quy chuẩn phân cấp Royal School: Toàn bộ lớp học, học viên ghi danh và điểm danh của khóa này đã được chốt và khóa sửa đổi.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-400" />
            <span>Danh Sách Lớp Ngoại Khóa & Khung Giờ Hoạt Động</span>
          </h2>
          <p className="text-xs text-slate-400">
            Kiểm soát sĩ số tối đa, phát hiện trùng lịch giáo viên/phòng học và áp dụng công thức đơn giá buổi chuẩn Ceil
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />

          <button
            onClick={handleOpenAddModal}
            disabled={isSelectedTermClosed}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              isSelectedTermClosed 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/60'
                : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98]'
            }`}
            title={isSelectedTermClosed ? 'Khóa học đã đóng - Không thể mở lớp mới' : 'Mở Lớp Ngoại Khóa Mới'}
          >
            {isSelectedTermClosed ? <Lock className="w-4 h-4 text-slate-500" /> : <Plus className="w-4 h-4 text-slate-950" />}
            <span>Mở Lớp Mới</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: DẠNG LƯỚI (TABLE VIEW) */}
      {viewMode === 'table' ? (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Tên Lớp Học</th>
                  <th className="py-3 px-4">Cơ Sở</th>
                  <th className="py-3 px-4">Môn Ngoại Khóa</th>
                  <th className="py-3 px-4">Khung Giờ Học</th>
                  <th className="py-3 px-4">Sân / Phòng</th>
                  <th className="py-3 px-4">Giáo Viên Đứng Lớp</th>
                  <th className="py-3 px-4 text-center">Sĩ Số</th>
                  <th className="py-3 px-4 font-mono">Đơn Giá Buổi (Ceil)</th>
                  <th className="py-3 px-4 font-mono">Trọn Khóa</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredClasses.map(cls => {
                  const campus = store.campuses.find(c => c.id === cls.campus_id);
                  const subject = store.subjects.find(s => s.id === cls.subject_id);
                  const facility = store.facilities.find(f => f.id === cls.facility_id);
                  const timeSlot = store.timeSlots.find(t => t.id === cls.time_slot_id);
                  const teacher = store.teachers.find(t => t.id === cls.primary_teacher_id);
                  const enrollments = store.enrollments.filter(e => e.class_id === cls.id && e.status === 'active');
                  const isOverQuota = enrollments.length > cls.max_students;
                  const conflicts = checkConflicts(cls.facility_id, cls.primary_teacher_id, cls.time_slot_id, cls.id);

                  return (
                    <tr key={cls.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{cls.name}</div>
                        {conflicts.length > 0 && (
                          <div className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Trùng lịch ca này</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono text-xs text-amber-400 font-bold">{campus?.code}</span>
                      </td>

                      <td className="py-3 px-4 text-slate-300 font-medium">{subject?.name}</td>

                      <td className="py-3 px-4 text-slate-300">{timeSlot?.name.split(':')[0]} ({timeSlot?.days_of_week.join(',')})</td>

                      <td className="py-3 px-4 text-slate-400">{facility?.name}</td>

                      <td className="py-3 px-4 text-slate-300 font-medium">
                        {teacher?.name} <span className="text-[10px] text-slate-500">({teacher?.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'})</span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                          isOverQuota ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-white'
                        }`}>
                          {enrollments.length} / {cls.max_students}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-amber-400">{formatVND(cls.price_per_session)}</td>

                      <td className="py-3 px-4 font-mono text-white font-medium">{formatVND(cls.full_course_fee)}</td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              if (isTermClosed(cls.term_id, store)) {
                                alert('Khóa học này đã Đóng (Closed). Toàn bộ dữ liệu ở chế độ chỉ xem, không thể sửa lớp.');
                                return;
                              }
                              setEditingClass(cls);
                              setFormData({
                                name: cls.name,
                                term_id: cls.term_id,
                                campus_id: cls.campus_id,
                                subject_id: cls.subject_id,
                                facility_id: cls.facility_id,
                                time_slot_id: cls.time_slot_id,
                                primary_teacher_id: cls.primary_teacher_id,
                                max_students: cls.max_students,
                                total_sessions: cls.total_sessions,
                                full_course_fee: cls.full_course_fee,
                                allow_over_quota: !!cls.allow_over_quota,
                              });
                              setShowAddModal(true);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                              isTermClosed(cls.term_id, store)
                                ? 'bg-slate-800/40 text-slate-500 cursor-not-allowed'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            }`}
                            title={isTermClosed(cls.term_id, store) ? 'Khóa đã đóng - Chỉ xem' : 'Sửa Lớp'}
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => onSelectClassForAttendance(cls)}
                            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-bold"
                          >
                            Điểm Danh
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VIEW MODE 2: DẠNG THẺ (CARDS VIEW) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredClasses.map(cls => {
            const campus = store.campuses.find(c => c.id === cls.campus_id);
            const subject = store.subjects.find(s => s.id === cls.subject_id);
            const facility = store.facilities.find(f => f.id === cls.facility_id);
            const timeSlot = store.timeSlots.find(t => t.id === cls.time_slot_id);
            const teacher = store.teachers.find(t => t.id === cls.primary_teacher_id);
            
            const enrollments = store.enrollments.filter(e => e.class_id === cls.id && e.status === 'active');
            const studentCount = enrollments.length;
            const isOverQuota = studentCount > cls.max_students;
            const conflicts = checkConflicts(cls.facility_id, cls.primary_teacher_id, cls.time_slot_id, cls.id);

            return (
              <div
                key={cls.id}
                className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-5 backdrop-blur-md shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold">
                      {subject?.name || 'Môn Ngoại Khóa'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{campus?.code}</span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-2">{cls.name}</h3>

                  {conflicts.length > 0 && (
                    <div className="mb-3 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>CẢNH BÁO TRÙNG LỊCH:</span>
                      </div>
                      {conflicts.map((msg, i) => (
                        <p key={i} className="text-amber-200/90 pl-5 text-[10px]">&bull; {msg}</p>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{timeSlot?.name || 'Chưa xếp khung giờ'}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{facility?.name || 'Chưa xếp phòng/sân'}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-amber-300 font-medium">
                        GV: {teacher?.name || 'Chưa phân công'} ({teacher?.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'})
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-400">Sĩ số lớp:</span>
                      <span className={`font-mono font-bold ${isOverQuota ? 'text-rose-400' : 'text-white'}`}>
                        {studentCount} / {cls.max_students} học viên
                        {isOverQuota && ' (Vượt chỉ tiêu)'}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOverQuota ? 'bg-rose-500' : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                        }`}
                        style={{ width: `${Math.min(100, (studentCount / cls.max_students) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Đơn giá 1 buổi (Ceil):</span>
                      <span className="text-amber-400 font-bold font-mono">{formatVND(cls.price_per_session)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 text-[10px] block">Trọn khóa ({cls.total_sessions} buổi):</span>
                      <span className="text-white font-bold font-mono">{formatVND(cls.full_course_fee)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      if (isTermClosed(cls.term_id, store)) {
                        alert('Khóa học này đã Đóng (Closed). Toàn bộ dữ liệu ở chế độ chỉ xem, không thể sửa lớp.');
                        return;
                      }
                      setEditingClass(cls);
                      setFormData({
                        name: cls.name,
                        term_id: cls.term_id,
                        campus_id: cls.campus_id,
                        subject_id: cls.subject_id,
                        facility_id: cls.facility_id,
                        time_slot_id: cls.time_slot_id,
                        primary_teacher_id: cls.primary_teacher_id,
                        max_students: cls.max_students,
                        total_sessions: cls.total_sessions,
                        full_course_fee: cls.full_course_fee,
                        allow_over_quota: !!cls.allow_over_quota,
                      });
                      setShowAddModal(true);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isTermClosed(cls.term_id, store)
                        ? 'bg-slate-800/40 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                    title={isTermClosed(cls.term_id, store) ? 'Khóa đã đóng - Chỉ xem' : 'Sửa Lớp'}
                  >
                    Sửa Lớp
                  </button>

                  <button
                    onClick={() => onSelectClassForAttendance(cls)}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 flex items-center gap-1.5"
                  >
                    <span>Sổ Điểm Danh</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-950" />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Class Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-400" />
              <span>{editingClass ? 'Cập Nhật Lớp Ngoại Khóa' : 'Tạo Lớp Ngoại Khóa Mới'}</span>
            </h3>

            {/* Live Conflict Alert in Modal */}
            {formConflicts.length > 0 && (
              <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-300 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-400">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>CẢNH BÁO TRÙNG LỊCH (Có thể lưu đè nếu được phê duyệt):</span>
                </div>
                {formConflicts.map((c, i) => (
                  <p key={i} className="pl-6 text-[11px] text-amber-200">&bull; {c}</p>
                ))}
              </div>
            )}

            {/* Active Pricing Result computation */}
            {(() => {
              const activeTermSubjects = store.termSubjects.filter(ts => ts.term_id === formData.term_id && ts.is_active);
              const activeSubjectIds = new Set(activeTermSubjects.map(ts => ts.subject_id));
              const availableSubjects = store.subjects.filter(s => activeSubjectIds.has(s.id));
              const effectivePricing = getEffectivePrice(formData.term_id, formData.campus_id, formData.subject_id, store);
              const campusFacilities = store.facilities.filter(f => f.campus_id === formData.campus_id && f.is_active);

              return (
                <form onSubmit={handleSaveClass} className="space-y-4 text-xs">
                  
                  {/* CASCADING HIERARCHY SELECTORS */}
                  <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                    <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-800">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      <span>Chuỗi Phân Cấp: Khóa Học &rarr; Cơ Sở &rarr; Môn Học Kích Hoạt</span>
                    </div>

                    {/* Step 1: Chọn Khóa Học (Academic Term) */}
                    <div>
                      <label className="block text-slate-300 font-bold mb-1 flex items-center justify-between">
                        <span>1. Khóa Học (Academic Term) *</span>
                        <span className="text-[10px] text-amber-400 font-mono">Cấp 1</span>
                      </label>
                      <select
                        value={formData.term_id}
                        onChange={(e) => {
                          const newTermId = e.target.value;
                          const termSubjs = store.termSubjects.filter(ts => ts.term_id === newTermId && ts.is_active);
                          const nextSubjId = termSubjs.some(ts => ts.subject_id === formData.subject_id)
                            ? formData.subject_id
                            : (termSubjs[0]?.subject_id || store.subjects[0]?.id || '');
                          handleCascadingChange(newTermId, formData.campus_id, nextSubjId, false);
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-semibold"
                      >
                        {store.terms.map(t => {
                          const statusLabel = 
                            t.status === 'open_enrollment' ? 'Đang tuyển sinh' :
                            t.status === 'in_progress' ? 'Đang diễn ra' :
                            t.status === 'closed' ? 'Đã đóng' : 'Dự thảo (Draft)';
                          return (
                            <option key={t.id} value={t.id} disabled={t.status === 'closed'}>
                              {t.name} ({statusLabel})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Step 2: Chọn Cơ Sở (Campus) */}
                      <div>
                        <label className="block text-slate-300 font-bold mb-1 flex items-center justify-between">
                          <span>2. Cơ Sở Trường (Campus) *</span>
                          <span className="text-[10px] text-cyan-400 font-mono">Cấp 2</span>
                        </label>
                        <select
                          value={formData.campus_id}
                          onChange={(e) => {
                            const newCampusId = e.target.value;
                            handleCascadingChange(formData.term_id, newCampusId, formData.subject_id, false);
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 font-semibold"
                        >
                          {store.campuses.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Step 3: Chọn Môn Học (Subject - Only Active in this Term) */}
                      <div>
                        <label className="block text-slate-300 font-bold mb-1 flex items-center justify-between">
                          <span>3. Môn Học (Chỉ môn kích hoạt) *</span>
                          <span className="text-[10px] text-emerald-400 font-mono">Cấp 3</span>
                        </label>
                        <select
                          value={formData.subject_id}
                          onChange={(e) => {
                            const newSubjectId = e.target.value;
                            handleCascadingChange(formData.term_id, formData.campus_id, newSubjectId, false);
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-semibold"
                        >
                          {availableSubjects.length === 0 ? (
                            <option value="" disabled>Không có môn nào được kích hoạt trong khóa này</option>
                          ) : (
                            availableSubjects.map(s => {
                              const p = getEffectivePrice(formData.term_id, formData.campus_id, s.id, store);
                              return (
                                <option key={s.id} value={s.id}>
                                  {s.name} {p.source === 'campus_override' ? '★ (Giá riêng CS)' : '✓ (Chuẩn khóa)'}
                                </option>
                              );
                            })
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Step 4: Auto-calculated Pricing Information Box */}
                    <div className="p-3 rounded-xl bg-gradient-to-r from-slate-950 via-slate-950 to-amber-950/20 border border-amber-500/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-bold text-white text-xs">Biểu Phí Tự Động Theo Phân Cấp</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          effectivePricing.source === 'campus_override'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        }`}>
                          {effectivePricing.source === 'campus_override'
                            ? '★ Áp dụng biểu phí riêng Cơ sở'
                            : '✓ Kế thừa biểu phí chuẩn của Khóa'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-0.5 text-center">
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">Số buổi chuẩn</span>
                          <span className="font-bold text-white font-mono text-xs">{effectivePricing.total_sessions} buổi</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">Học phí trọn khóa</span>
                          <span className="font-bold text-amber-400 font-mono text-xs">{formatVND(effectivePricing.course_fee)}</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">Đơn giá buổi (Ceil)</span>
                          <span className="font-bold text-emerald-400 font-mono text-xs">{formatVND(effectivePricing.session_rate)}/b</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                        <span>{effectivePricing.notes || 'Hệ thống tự động điền học phí và số buổi chuẩn.'}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              total_sessions: effectivePricing.total_sessions,
                              full_course_fee: effectivePricing.course_fee,
                            }));
                          }}
                          className="text-amber-400 hover:text-amber-300 font-semibold underline text-[10px]"
                        >
                          Điền lại biểu phí chuẩn
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CLASS DETAILS */}
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Tên lớp học ngoại khóa *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ví dụ: Bóng rổ Hoàng Gia U11 - Nhóm A"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Phòng học / Sân bãi ({store.campuses.find(c => c.id === formData.campus_id)?.code})</label>
                      <select
                        value={formData.facility_id}
                        onChange={(e) => setFormData({ ...formData, facility_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                      >
                        {campusFacilities.map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Khung giờ học (Time Slot)</label>
                      <select
                        value={formData.time_slot_id}
                        onChange={(e) => setFormData({ ...formData, time_slot_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                      >
                        {store.timeSlots.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Giáo viên phụ trách chính</label>
                      <select
                        value={formData.primary_teacher_id}
                        onChange={(e) => setFormData({ ...formData, primary_teacher_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                      >
                        {store.teachers.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Sĩ số tối đa</label>
                      <input
                        type="number"
                        min={5}
                        max={40}
                        value={formData.max_students}
                        onChange={(e) => setFormData({ ...formData, max_students: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Tổng số buổi của khóa</label>
                      <input
                        type="number"
                        min={4}
                        max={60}
                        value={formData.total_sessions}
                        onChange={(e) => setFormData({ ...formData, total_sessions: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Học phí trọn khóa (sau ưu đãi) (VND)</label>
                      <input
                        type="number"
                        step={50000}
                        value={formData.full_course_fee}
                        onChange={(e) => setFormData({ ...formData, full_course_fee: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* Ceil Rate Preview */}
                  <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 text-xs block">Đơn giá 1 buổi làm tròn lên (Ceil):</span>
                      <span className="text-amber-400 font-bold font-mono text-sm">
                        {formatVND(computedSessionRate)} / buổi
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 max-w-xs text-right">
                      Công thức chuẩn: Ceil(Học phí / Số buổi đến hàng nghìn đồng)
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="overQuota"
                      checked={formData.allow_over_quota}
                      onChange={(e) => setFormData({ ...formData, allow_over_quota: e.target.checked })}
                      className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                    />
                    <label htmlFor="overQuota" className="text-slate-300 font-medium cursor-pointer">
                      Cho phép ghi danh vượt chỉ tiêu sĩ số (Over-quota) khi có phê duyệt
                    </label>
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                    >
                      {editingClass ? 'Lưu Thay Đổi' : 'Tạo Lớp Học'}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
};
