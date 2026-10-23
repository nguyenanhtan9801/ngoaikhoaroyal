import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Layers, 
  ShieldAlert, 
  Plus, 
  Save, 
  Building2, 
  BookOpen, 
  UserCheck, 
  Users, 
  ArrowRight,
  Globe,
  Info
} from 'lucide-react';
import { ExtracurricularClass, ClassSession, AppStore, AcademicTerm } from '../../types';
import { 
  formatVND, 
  formatDateVN, 
  getEffectivePrice, 
  calculateCeilSessionRate, 
  createAuditRecord, 
  appendAuditLog 
} from '../../lib/storage';
import { showToast } from '../../lib/toast';

interface CreateClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingClass?: ExtracurricularClass | null;
  store: AppStore;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  initialTermId?: string;
  initialCampusId?: string;
  initialSubjectId?: string;
  onSuccess?: (cls: ExtracurricularClass) => void;
}

const WEEKDAYS = [
  { code: 'T2', label: 'Thứ 2' },
  { code: 'T3', label: 'Thứ 3' },
  { code: 'T4', label: 'Thứ 4' },
  { code: 'T5', label: 'Thứ 5' },
  { code: 'T6', label: 'Thứ 6' },
  { code: 'T7', label: 'Thứ 7' },
  { code: 'CN', label: 'Chủ Nhật' },
];

const DAY_MAPPING: Record<string, number> = {
  'CN': 0, 'T2': 1, 'T3': 2, 'T4': 3, 'T5': 4, 'T6': 5, 'T7': 6
};

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const formatDaysDisplay = (days: string[]): string => {
  const map: Record<string, string> = {
    'T2': 'Thứ 2',
    'T3': 'Thứ 3',
    'T4': 'Thứ 4',
    'T5': 'Thứ 5',
    'T6': 'Thứ 6',
    'T7': 'Thứ 7',
    'CN': 'Chủ Nhật',
  };
  return days.map(d => map[d] || d).join(' & ');
};

export const CreateClassModal: React.FC<CreateClassModalProps> = ({
  isOpen,
  onClose,
  editingClass,
  store,
  onUpdateStore,
  initialTermId,
  initialCampusId,
  initialSubjectId,
  onSuccess,
}) => {
  if (!isOpen) return null;

  // Active term list sorted chronologically
  const sortedTerms = useMemo(() => {
    return [...store.terms].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  }, [store.terms]);

  // Initial form values
  const defaultTermId = initialTermId && initialTermId !== 'all' 
    ? initialTermId 
    : (store.terms.find(t => t.is_active)?.id || store.terms[0]?.id || 'term_fall_2026');
  const defaultCampusId = initialCampusId && initialCampusId !== 'all'
    ? initialCampusId
    : (store.campuses[0]?.id || 'camp_pmh');

  // Form State
  const [formData, setFormData] = useState({
    name: editingClass?.name || '',
    term_id: editingClass?.term_id || defaultTermId,
    campus_id: editingClass?.campus_id || defaultCampusId,
    subject_id: editingClass?.subject_id || initialSubjectId || store.subjects[0]?.id || '',
    facility_id: editingClass?.facility_id || store.facilities[0]?.id || '',
    time_slot_id: editingClass?.time_slot_id || store.timeSlots[0]?.id || '',
    days_of_week: (editingClass?.days_of_week && editingClass.days_of_week.length === 2)
      ? editingClass.days_of_week
      : (store.timeSlots[0]?.days_of_week && store.timeSlots[0].days_of_week.length === 2)
      ? store.timeSlots[0].days_of_week
      : ['T2', 'T4'],
    start_date: editingClass?.start_date || store.terms.find(t => t.id === defaultTermId)?.start_date || '2026-09-01',
    primary_teacher_id: editingClass?.primary_teacher_id || store.teachers[0]?.id || '',
    max_students: editingClass?.max_students || 15,
    allow_over_quota: editingClass?.allow_over_quota || false,
  });

  // Cross-term choice: 'spanning' (Cho phép vắt sang khóa sau) | 'truncate' (Cắt ngắn kết thúc theo khóa hiện tại)
  const [crossTermMode, setCrossTermMode] = useState<'spanning' | 'truncate'>(
    editingClass?.is_cross_term ? 'spanning' : 'spanning'
  );
  const [dayPickerNotice, setDayPickerNotice] = useState<string | null>(null);

  // Active Primary Term
  const primaryTerm = useMemo(() => {
    return store.terms.find(t => t.id === formData.term_id) || store.terms[0];
  }, [store.terms, formData.term_id]);

  // Next Chronological Term (Spanning Term)
  const nextSpanningTerm = useMemo(() => {
    if (!primaryTerm) return undefined;
    const currentIndex = sortedTerms.findIndex(t => t.id === primaryTerm.id);
    if (currentIndex >= 0 && currentIndex < sortedTerms.length - 1) {
      return sortedTerms[currentIndex + 1];
    }
    // Fallback: look for term with start_date >= primaryTerm.end_date
    return sortedTerms.find(t => t.id !== primaryTerm.id && (t.start_date || '') >= (primaryTerm.end_date || ''));
  }, [sortedTerms, primaryTerm]);

  // Active Subject Pricing
  const effectivePricing = useMemo(() => {
    return getEffectivePrice(formData.term_id, formData.campus_id, formData.subject_id, store);
  }, [formData.term_id, formData.campus_id, formData.subject_id, store]);

  const standardSessions = effectivePricing.total_sessions || 24;
  const sessionRate = effectivePricing.session_rate || calculateCeilSessionRate(effectivePricing.course_fee, standardSessions);

  // Active Term Subjects for cascading dropdown
  const activeTermSubjects = useMemo(() => {
    const list = store.termSubjects.filter(ts => ts.term_id === formData.term_id && ts.is_active);
    const activeIds = new Set(list.map(ts => ts.subject_id));
    return store.subjects.filter(s => activeIds.has(s.id));
  }, [store.termSubjects, store.subjects, formData.term_id]);

  // Campus Facilities
  const campusFacilities = useMemo(() => {
    return store.facilities.filter(f => f.campus_id === formData.campus_id && f.is_active);
  }, [store.facilities, formData.campus_id]);

  // Handle Cascading Changes
  const handleCascadingChange = (newTermId: string, newCampusId: string, newSubjId: string) => {
    const termObj = store.terms.find(t => t.id === newTermId) || store.terms[0];
    const newFacilities = store.facilities.filter(f => f.campus_id === newCampusId && f.is_active);
    
    // Auto generate suggested class name
    const subj = store.subjects.find(s => s.id === newSubjId);
    const camp = store.campuses.find(c => c.id === newCampusId);
    const suggestedName = subj && camp ? `${subj.name} ${camp.code} (${formData.days_of_week.join('-')})` : formData.name;

    setFormData(prev => ({
      ...prev,
      term_id: newTermId,
      campus_id: newCampusId,
      subject_id: newSubjId,
      facility_id: newFacilities[0]?.id || prev.facility_id,
      start_date: termObj?.start_date || prev.start_date,
      name: editingClass ? prev.name : suggestedName,
    }));
  };

  // Toggle Days of Week (strictly 2 days)
  const handleToggleDay = (code: string) => {
    if (formData.days_of_week.includes(code)) {
      if (formData.days_of_week.length > 1) {
        const nextDays = formData.days_of_week.filter(d => d !== code);
        setFormData(prev => ({ ...prev, days_of_week: nextDays }));
        setDayPickerNotice(null);
      } else {
        setDayPickerNotice('Lớp học cần tối thiểu 1 ngày trước khi chọn ngày khác.');
        setTimeout(() => setDayPickerNotice(null), 2500);
      }
    } else {
      if (formData.days_of_week.length >= 2) {
        setDayPickerNotice('Mỗi lớp học chỉ học tối đa 2 ngày trong tuần. Hãy bỏ chọn 1 ngày trước nếu muốn đổi.');
        setTimeout(() => setDayPickerNotice(null), 3000);
      } else {
        const nextDays = [...formData.days_of_week, code];
        setFormData(prev => ({ ...prev, days_of_week: nextDays }));
        setDayPickerNotice(null);
      }
    }
  };

  // =========================================================================
  // CROSS-TERM & SCHEDULE TIMELINE CALCULATION ENGINE
  // =========================================================================
  const scheduleAnalysis = useMemo(() => {
    const activeDayNumbers = formData.days_of_week.map(d => DAY_MAPPING[d]).filter(n => n !== undefined);
    
    if (!formData.start_date || activeDayNumbers.length !== 2 || !primaryTerm) {
      return {
        isCrossTerm: false,
        primaryCount: 0,
        primaryDates: [] as string[],
        spanningCount: 0,
        spanningDates: [] as string[],
        projectedEndDate: formData.start_date || '',
        spanningEndDate: '',
        primaryEndDate: '',
        effectiveTotalSessions: standardSessions,
        effectiveFee: standardSessions * sessionRate,
      };
    }

    const startDate = new Date(`${formData.start_date}T00:00:00`);
    const primaryTermEndDate = new Date(`${primaryTerm.end_date}T00:00:00`);

    // 1. Calculate Primary Term sessions
    const primaryDates: string[] = [];
    const cur1 = new Date(startDate);
    while (primaryDates.length < standardSessions && cur1 <= primaryTermEndDate) {
      if (activeDayNumbers.includes(cur1.getDay())) {
        primaryDates.push(toLocalDateStr(cur1));
      }
      cur1.setDate(cur1.getDate() + 1);
    }

    const primaryCount = primaryDates.length;
    const isCrossTerm = primaryCount < standardSessions;
    const primaryEndDate = primaryDates.length > 0 ? primaryDates[primaryDates.length - 1] : formData.start_date;

    // 2. If cross-term is needed, calculate Spanning Term sessions
    const spanningDates: string[] = [];
    let spanningEndDate = primaryEndDate;

    if (isCrossTerm && nextSpanningTerm) {
      const remainingNeeded = standardSessions - primaryCount;
      // Start in next term (either nextTerm.start_date or day after primaryTerm ends)
      const nextTermStart = new Date(`${nextSpanningTerm.start_date}T00:00:00`);
      const nextTermEnd = new Date(`${nextSpanningTerm.end_date}T00:00:00`);
      const cur2 = new Date(nextTermStart);

      while (spanningDates.length < remainingNeeded && cur2 <= nextTermEnd) {
        if (activeDayNumbers.includes(cur2.getDay())) {
          spanningDates.push(toLocalDateStr(cur2));
        }
        cur2.setDate(cur2.getDate() + 1);
      }
      if (spanningDates.length > 0) {
        spanningEndDate = spanningDates[spanningDates.length - 1];
      }
    }

    const spanningCount = spanningDates.length;

    // Determine final effective sessions & fee based on crossTermMode
    let effectiveTotalSessions = standardSessions;
    let effectiveFee = standardSessions * sessionRate;
    let finalEndDate = primaryEndDate;

    if (isCrossTerm) {
      if (crossTermMode === 'spanning' && nextSpanningTerm) {
        effectiveTotalSessions = primaryCount + spanningCount;
        effectiveFee = effectiveTotalSessions * sessionRate;
        finalEndDate = spanningEndDate;
      } else {
        // Truncate mode
        effectiveTotalSessions = primaryCount;
        effectiveFee = primaryCount * sessionRate;
        finalEndDate = primaryEndDate;
      }
    } else {
      effectiveTotalSessions = primaryCount;
      effectiveFee = primaryCount * sessionRate;
      finalEndDate = primaryEndDate;
    }

    return {
      isCrossTerm,
      primaryCount,
      primaryDates,
      spanningCount,
      spanningDates,
      primaryEndDate,
      spanningEndDate,
      projectedEndDate: finalEndDate,
      effectiveTotalSessions,
      effectiveFee,
    };
  }, [formData.start_date, formData.days_of_week, primaryTerm, nextSpanningTerm, standardSessions, sessionRate, crossTermMode]);

  // Conflict Checking
  const formConflicts = useMemo(() => {
    if (!formData.time_slot_id || !formData.days_of_week || formData.days_of_week.length !== 2) {
      return [];
    }
    const conflicts: string[] = [];
    const otherClasses = store.classes.filter(c => (!editingClass || c.id !== editingClass.id) && c.campus_id === formData.campus_id);

    otherClasses.forEach(cls => {
      if (cls.time_slot_id !== formData.time_slot_id) return;
      const otherDays = cls.days_of_week || [];
      const overlapDays = formData.days_of_week.filter(d => otherDays.includes(d));
      if (overlapDays.length === 0) return;

      if (cls.facility_id === formData.facility_id) {
        const fac = store.facilities.find(f => f.id === cls.facility_id);
        conflicts.push(`Sân/phòng "${fac?.name}" đã có lớp "${cls.name}" hoạt động vào thứ [${overlapDays.join(', ')}]`);
      }
      if (cls.primary_teacher_id === formData.primary_teacher_id) {
        const tch = store.teachers.find(t => t.id === cls.primary_teacher_id);
        conflicts.push(`Giáo viên "${tch?.name}" đang dạy lớp "${cls.name}" vào cùng khung giờ thứ [${overlapDays.join(', ')}]`);
      }
    });

    return conflicts;
  }, [store.classes, store.facilities, store.teachers, formData, editingClass]);

  // Form Submission
  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast('Vui lòng nhập tên lớp học!', 'error');
      return;
    }

    if (formData.days_of_week.length !== 2) {
      showToast('Lịch học bắt buộc phải chọn đúng 2 ngày trong tuần!', 'error');
      return;
    }

    const isCrossSpanning = scheduleAnalysis.isCrossTerm && crossTermMode === 'spanning' && !!nextSpanningTerm;
    const finalTotalSessions = scheduleAnalysis.effectiveTotalSessions;
    const finalFee = scheduleAnalysis.effectiveFee;
    const finalEndDate = scheduleAnalysis.projectedEndDate;

    const termDistribution = isCrossSpanning
      ? {
          primary_term_sessions: scheduleAnalysis.primaryCount,
          spanning_term_sessions: scheduleAnalysis.spanningCount,
        }
      : {
          primary_term_sessions: scheduleAnalysis.primaryCount,
          spanning_term_sessions: 0,
        };

    const targetClassId = editingClass ? editingClass.id : `cls_${Date.now()}`;

    const savedClass: ExtracurricularClass = {
      id: targetClassId,
      name: formData.name.trim(),
      code: editingClass?.code || `CL-${formData.campus_id === 'camp_pl' ? 'PL' : 'PMH'}-${Date.now().toString().slice(-4)}`,
      term_id: formData.term_id,
      spanning_term_id: isCrossSpanning ? nextSpanningTerm?.id : undefined,
      is_cross_term: isCrossSpanning,
      term_distribution: termDistribution,
      campus_id: formData.campus_id,
      subject_id: formData.subject_id,
      facility_id: formData.facility_id,
      time_slot_id: formData.time_slot_id,
      days_of_week: formData.days_of_week,
      start_date: formData.start_date,
      end_date: finalEndDate,
      standard_sessions: standardSessions,
      primary_teacher_id: formData.primary_teacher_id,
      max_students: formData.max_students,
      total_sessions: finalTotalSessions,
      full_course_fee: finalFee,
      tuition_fee: finalFee,
      price_per_session: sessionRate,
      status: editingClass?.status || 'active',
      allow_over_quota: formData.allow_over_quota,
    };

    // Generate Session Records with correct term_id
    const generatedSessions: ClassSession[] = [];

    // Phase 1: Primary Term Sessions
    scheduleAnalysis.primaryDates.forEach((dateStr, idx) => {
      generatedSessions.push({
        id: `ses_${targetClassId}_${idx + 1}`,
        class_id: targetClassId,
        term_id: formData.term_id, // Gắn đúng Khóa gốc
        session_date: dateStr,
        session_number: idx + 1,
        actual_teacher_id: formData.primary_teacher_id,
        is_substitute: false,
        snacks_allocated: 0,
        snacks_consumed: 0,
        snacks_returned: 0,
        status: 'scheduled',
      });
    });

    // Phase 2: Spanning Term Sessions (if cross-term spanning selected)
    if (isCrossSpanning && nextSpanningTerm) {
      scheduleAnalysis.spanningDates.forEach((dateStr, idx) => {
        const sessionNum = scheduleAnalysis.primaryCount + idx + 1;
        generatedSessions.push({
          id: `ses_${targetClassId}_${sessionNum}`,
          class_id: targetClassId,
          term_id: nextSpanningTerm.id, // Gắn đúng Khóa chuyển tiếp
          session_date: dateStr,
          session_number: sessionNum,
          actual_teacher_id: formData.primary_teacher_id,
          is_substitute: false,
          snacks_allocated: 0,
          snacks_consumed: 0,
          snacks_returned: 0,
          status: 'scheduled',
        });
      });
    }

    onUpdateStore(prev => {
      let updatedClasses: ExtracurricularClass[];
      let updatedSessions: ClassSession[];

      if (editingClass) {
        updatedClasses = prev.classes.map(c => c.id === editingClass.id ? savedClass : c);
        // Retain completed sessions, replace scheduled sessions
        const existingSessions = prev.sessions.filter(s => s.class_id === editingClass.id);
        const completedSessions = existingSessions.filter(s => s.status === 'completed');
        const otherSessions = prev.sessions.filter(s => s.class_id !== editingClass.id);
        
        // Only add new sessions that aren't already completed
        const completedDates = new Set(completedSessions.map(s => s.session_date));
        const newSchedSessions = generatedSessions.filter(s => !completedDates.has(s.session_date));

        updatedSessions = [...otherSessions, ...completedSessions, ...newSchedSessions];
      } else {
        updatedClasses = [savedClass, ...prev.classes];
        updatedSessions = [...prev.sessions, ...generatedSessions];
      }

      const auditLog = createAuditRecord(
        editingClass ? 'CLASS_UPDATE' : 'CLASS_CREATE',
        'ACADEMIC',
        'Lớp Ngoại Khóa',
        editingClass
          ? `Cập nhật lớp: ${savedClass.name} (${savedClass.is_cross_term ? 'Lớp liên khóa' : 'Lớp chuẩn'}), ${savedClass.total_sessions} buổi, Học phí: ${formatVND(savedClass.full_course_fee)}`
          : `Tạo mới lớp: ${savedClass.name} (${savedClass.is_cross_term ? `Lớp liên khóa: ${savedClass.term_distribution?.primary_term_sessions}b ${primaryTerm?.name} + ${savedClass.term_distribution?.spanning_term_sessions}b ${nextSpanningTerm?.name}` : 'Lớp chuẩn'}), ${savedClass.total_sessions} buổi`,
        null,
        {
          target_id: savedClass.id,
          details: {
            class_id: savedClass.id,
            name: savedClass.name,
            term_id: savedClass.term_id,
            spanning_term_id: savedClass.spanning_term_id,
            is_cross_term: savedClass.is_cross_term,
            term_distribution: savedClass.term_distribution,
            total_sessions: savedClass.total_sessions,
            full_course_fee: savedClass.full_course_fee,
          }
        }
      );

      return appendAuditLog({
        ...prev,
        classes: updatedClasses,
        sessions: updatedSessions,
      }, auditLog);
    });

    showToast(
      editingClass
        ? `Đã cập nhật lớp "${savedClass.name}" thành công!`
        : `Đã mở mới lớp "${savedClass.name}" (${savedClass.total_sessions} buổi) thành công!`,
      'success',
      { title: editingClass ? 'Cập nhật lớp' : 'Mở lớp thành công' }
    );

    onSuccess?.(savedClass);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div 
        className="w-full max-w-3xl rounded-3xl bg-[#111827] border border-slate-700/80 p-6 shadow-2xl space-y-5 my-8 max-h-[92vh] overflow-y-auto relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">
                  {editingClass ? 'Cập Nhật Lớp Ngoại Khóa' : 'Tạo Lớp Ngoại Khóa Mới'}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">
                  Royal Class Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Chuẩn hóa kế thừa biểu phí Ceil, tự động kiểm tra trùng lịch và xử lý lớp vắt qua 2 khóa
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Conflict Alert in Modal */}
        {formConflicts.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-300 space-y-1 animate-fadeIn">
            <div className="flex items-center gap-2 font-bold text-amber-400">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>CẢNH BÁO TRÙNG LỊCH CA HỌC (Vẫn cho phép lưu nếu ban quản trị phê duyệt):</span>
            </div>
            {formConflicts.map((c, i) => (
              <p key={i} className="pl-6 text-[11px] text-amber-200">&bull; {c}</p>
            ))}
          </div>
        )}

        <form onSubmit={handleSaveClass} className="space-y-4 text-xs">
          
          {/* CASCADING HIERARCHY SELECTORS */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-inner">
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-800">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Chuỗi Phân Cấp: Khóa Học &rarr; Cơ Sở &rarr; Môn Học Kích Hoạt</span>
            </div>

            {/* Step 1: Chọn Khóa Học Gốc (Academic Term) */}
            <div>
              <label className="block text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                <span>1. Khóa Học Gốc (Primary Academic Term) *</span>
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
                  handleCascadingChange(newTermId, formData.campus_id, nextSubjId);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-semibold"
              >
                {store.terms.map(t => {
                  const statusLabel = 
                    t.status === 'open_enrollment' ? 'Đang tuyển sinh' :
                    t.status === 'in_progress' ? 'Đang diễn ra' :
                    t.status === 'closed' ? 'Đã đóng' : 'Dự thảo';
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
                <label className="block text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                  <span>2. Cơ Sở Trường (Campus) *</span>
                  <span className="text-[10px] text-cyan-400 font-mono">Cấp 2</span>
                </label>
                <select
                  value={formData.campus_id}
                  onChange={(e) => {
                    const newCampusId = e.target.value;
                    handleCascadingChange(formData.term_id, newCampusId, formData.subject_id);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 font-semibold"
                >
                  {store.campuses.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              {/* Step 3: Chọn Môn Học (Subject) */}
              <div>
                <label className="block text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                  <span>3. Môn Ngoại Khóa Kích Hoạt *</span>
                  <span className="text-[10px] text-emerald-400 font-mono">Cấp 3</span>
                </label>
                <select
                  value={formData.subject_id}
                  onChange={(e) => {
                    const newSubjId = e.target.value;
                    handleCascadingChange(formData.term_id, formData.campus_id, newSubjId);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-semibold"
                >
                  {activeTermSubjects.length === 0 ? (
                    <option value="" disabled>Không có môn nào được kích hoạt trong khóa này</option>
                  ) : (
                    activeTermSubjects.map(s => {
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

            {/* Step 4: Auto Pricing Info */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-slate-950 via-slate-950 to-amber-950/20 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold text-white text-xs">Biểu Phí Tự Động Kế Thừa</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  effectivePricing.source === 'campus_override'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                }`}>
                  {effectivePricing.source === 'campus_override'
                    ? '★ Biểu phí cơ sở quy định'
                    : '✓ Kế thừa biểu phí chuẩn khóa'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Số buổi chuẩn</span>
                  <strong className="text-white font-mono text-xs">{standardSessions} buổi</strong>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Đơn giá 1 buổi (Ceil)</span>
                  <strong className="text-emerald-400 font-mono text-xs">{formatVND(sessionRate)}/b</strong>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Học phí trọn gói</span>
                  <strong className="text-amber-400 font-mono text-xs">{formatVND(standardSessions * sessionRate)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* CLASS DETAILS */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">Tên lớp học ngoại khóa *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ví dụ: Bơi Lội Hoàng Gia PMH (T2-T4)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-bold text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                Phòng học / Sân bãi ({store.campuses.find(c => c.id === formData.campus_id)?.code}):
              </label>
              <select
                value={formData.facility_id}
                onChange={(e) => setFormData({ ...formData, facility_id: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-medium"
              >
                {campusFacilities.map(f => (
                  <option key={f.id} value={f.id}>{f.name} ({f.room_code || f.type})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">Khung giờ học (Time Slot):</label>
              <select
                value={formData.time_slot_id}
                onChange={(e) => {
                  const slotId = e.target.value;
                  const slot = store.timeSlots.find(t => t.id === slotId);
                  setFormData(prev => ({ 
                    ...prev, 
                    time_slot_id: slotId,
                    days_of_week: (slot?.days_of_week && slot.days_of_week.length === 2)
                      ? slot.days_of_week
                      : prev.days_of_week
                  }));
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-semibold"
              >
                {store.timeSlots.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.start_time} - {t.end_time})</option>
                ))}
              </select>
            </div>
          </div>

          {/* WEEKDAY PICKER UI (Exactly 2 days) */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-inner">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>Lịch học trong tuần (Bắt buộc chọn đúng 2 ngày) *</span>
              </label>

              <div>
                {formData.days_of_week.length < 2 ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-bold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Đã chọn: {formData.days_of_week.length}/2 ngày
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ✓ Hợp lệ: [{formData.days_of_week.join(', ')}]
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 sm:gap-2">
              {WEEKDAYS.map(day => {
                const isSelected = formData.days_of_week.includes(day.code);
                const isDisabled = !isSelected && formData.days_of_week.length >= 2;

                return (
                  <button
                    key={day.code}
                    type="button"
                    onClick={() => handleToggleDay(day.code)}
                    className={`py-2 px-1.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-extrabold border border-amber-400 shadow-md shadow-amber-500/25 scale-[1.02]'
                        : isDisabled
                        ? 'bg-slate-900 border border-slate-800 text-slate-500 opacity-50 cursor-not-allowed'
                        : 'bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-800'
                    }`}
                  >
                    <span>{day.label}</span>
                    <span className={`text-[10px] font-mono ${isSelected ? 'text-slate-950 font-bold' : 'text-slate-500'}`}>
                      {day.code}
                    </span>
                  </button>
                );
              })}
            </div>

            {dayPickerNotice && (
              <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{dayPickerNotice}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800">
              <span className="text-slate-400">Tóm tắt lịch xếp lớp:</span>
              <span className="font-bold text-amber-400 font-mono">
                {formData.days_of_week.length === 2 ? formatDaysDisplay(formData.days_of_week) : 'Chưa đủ 2 ngày'}
              </span>
            </div>
          </div>

          {/* CLASS START DATE & TIMELINE */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3.5 shadow-inner">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-slate-200 font-bold text-xs">
                  Thời Gian Mở Lớp &amp; Nhận Diện Liên Khóa (Cross-Term)
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2.5 py-0.5 rounded-lg border border-slate-800">
                Khóa {primaryTerm?.name}: <strong className="text-cyan-300">{formatDateVN(primaryTerm?.start_date)} &rarr; {formatDateVN(primaryTerm?.end_date)}</strong>
              </span>
            </div>

            {/* Date Input */}
            <div>
              <label className="block text-slate-200 font-bold mb-1.5 flex items-center justify-between">
                <span>Ngày bắt đầu mở lớp *</span>
                <span className="text-[10px] text-slate-400">
                  Khóa gốc: {primaryTerm?.name}
                </span>
              </label>
              <input
                type="date"
                required
                min={primaryTerm?.start_date}
                value={formData.start_date}
                onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 text-white font-mono text-xs font-bold border border-slate-700 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* CROSS-TERM DETECTION & RESOLUTION OPTIONS */}
            {scheduleAnalysis.isCrossTerm ? (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-indigo-950/40 border border-indigo-500/40 space-y-4 animate-fadeIn">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-white text-xs flex items-center gap-2">
                      <span>Lớp học liên khóa (Cross-Term Class)</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/30 text-indigo-200 text-[10px] font-mono">
                        {primaryTerm?.code} &rarr; {nextSpanningTerm?.code || 'NEXT-TERM'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-indigo-200 mt-0.5 leading-relaxed">
                      Lớp bắt đầu ngày <strong className="text-white font-mono">{formatDateVN(formData.start_date)}</strong> dẫn đến lộ trình kéo dài từ <strong>{primaryTerm?.name}</strong> sang <strong>{nextSpanningTerm?.name || 'Khóa tiếp theo'}</strong>.
                    </p>
                  </div>
                </div>

                {/* 2 Selectable Options (Radio Pills) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* OPTION 1: ALLOW SPANNING */}
                  <div
                    onClick={() => setCrossTermMode('spanning')}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between space-y-2.5 ${
                      crossTermMode === 'spanning'
                        ? 'bg-indigo-950/60 border-indigo-500 shadow-md shadow-indigo-500/20 ring-1 ring-indigo-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-white text-xs flex items-center gap-1.5">
                          <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                            crossTermMode === 'spanning' ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600'
                          }`}>
                            {crossTermMode === 'spanning' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                          Cho phép vắt sang khóa sau
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-extrabold uppercase">
                          Khuyên Dùng
                        </span>
                      </div>

                      <div className="mt-2 space-y-1.5 text-[11px] text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Giai đoạn 1 ({primaryTerm?.name?.split('(')[0].trim()}):</span>
                          <strong className="text-amber-400 font-mono">{scheduleAnalysis.primaryCount} buổi</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Giai đoạn 2 ({nextSpanningTerm?.name?.split('(')[0].trim() || 'Khóa sau'}):</span>
                          <strong className="text-cyan-300 font-mono">{scheduleAnalysis.spanningCount} buổi</strong>
                        </div>
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-indigo-900/30 border border-indigo-500/30 text-[10px] text-indigo-200">
                      ✓ Giữ nguyên đủ <strong>{standardSessions} buổi</strong> &amp; học phí gốc <strong>{formatVND(standardSessions * sessionRate)}</strong>. Kết thúc: <span className="font-mono text-white font-bold">{formatDateVN(scheduleAnalysis.spanningEndDate)}</span>.
                    </div>
                  </div>

                  {/* OPTION 2: TRUNCATE */}
                  <div
                    onClick={() => setCrossTermMode('truncate')}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between space-y-2.5 ${
                      crossTermMode === 'truncate'
                        ? 'bg-amber-950/40 border-amber-500 shadow-md shadow-amber-500/20 ring-1 ring-amber-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-white text-xs flex items-center gap-1.5">
                          <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                            crossTermMode === 'truncate' ? 'border-amber-400 bg-amber-500' : 'border-slate-600'
                          }`}>
                            {crossTermMode === 'truncate' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                          Cắt ngắn lớp kết thúc theo khóa
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[9px] font-bold">
                          Rút Gọn
                        </span>
                      </div>

                      <div className="mt-2 space-y-1.5 text-[11px] text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Số buổi thực tế:</span>
                          <strong className="text-amber-400 font-mono">{scheduleAnalysis.primaryCount} buổi</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Ngày kết thúc:</span>
                          <strong className="text-white font-mono">{formatDateVN(scheduleAnalysis.primaryEndDate)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[10px] text-slate-400">
                      Rút ngắn còn <strong>{scheduleAnalysis.primaryCount} buổi</strong>. Học phí lớp tính lại: <strong className="text-amber-300 font-mono">{formatVND(scheduleAnalysis.primaryCount * sessionRate)}</strong>.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Single Term Normal Timeline Display */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Ngày kết thúc lớp</span>
                  <div className="mt-1 font-mono font-extrabold text-sm text-cyan-300">
                    {formatDateVN(scheduleAnalysis.projectedEndDate)}
                  </div>
                  <span className="text-[10px] text-slate-500">Hoàn thành trong {primaryTerm?.name}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Số buổi hoàn thành</span>
                  <div className="mt-1 font-mono font-extrabold text-sm text-emerald-400">
                    {scheduleAnalysis.effectiveTotalSessions} / {standardSessions} buổi
                  </div>
                  <span className="text-[10px] text-emerald-400/80">✓ Đạt định mức chuẩn toàn khóa</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Học phí trọn lớp</span>
                  <div className="mt-1 font-mono font-extrabold text-sm text-amber-400">
                    {formatVND(scheduleAnalysis.effectiveFee)}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    = {scheduleAnalysis.effectiveTotalSessions} buổi &times; {formatVND(sessionRate)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* TEACHER & MAX STUDENTS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">Giáo viên phụ trách chính *</label>
              <select
                value={formData.primary_teacher_id}
                onChange={(e) => setFormData({ ...formData, primary_teacher_id: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-semibold"
              >
                {store.teachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({(t.type || t.teacher_type) === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">Sĩ số tối đa</label>
              <input
                type="number"
                min={5}
                max={40}
                value={formData.max_students}
                onChange={(e) => setFormData({ ...formData, max_students: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono font-bold"
              />
            </div>
          </div>

          {/* SUMMARY BANNER BEFORE SUBMIT */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="text-slate-400">Quy mô đào tạo:</span>
              <div className="font-bold text-white flex items-center gap-2">
                <span>{scheduleAnalysis.effectiveTotalSessions} buổi</span>
                <span>&bull;</span>
                <span className="text-amber-400">{formatVND(scheduleAnalysis.effectiveFee)}</span>
                {scheduleAnalysis.isCrossTerm && crossTermMode === 'spanning' && (
                  <span className="px-2 py-0.2 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold">
                    Liên Khóa
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors"
              >
                Hủy Bỏ
              </button>

              <button
                type="submit"
                className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{editingClass ? 'Lưu Thay Đổi' : 'Xác Nhận Mở Lớp'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
