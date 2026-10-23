import React, { useState, useMemo, useEffect } from 'react';
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
  Info,
  Search,
  X,
  RotateCcw,
  Filter
} from 'lucide-react';
import { AppStore, formatVND, calculateCeilSessionRate, getEffectivePrice, isTermClosed, createAuditRecord, appendAuditLog, formatDateVN } from '../../lib/storage';
import { ExtracurricularClass, ClassSession, UserRole } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { showToast } from '../../lib/toast';

export interface ScheduleCalculationResult {
  actualSessions: number;      // Số buổi thực tế diễn ra trong khóa
  endDate: string;             // Ngày kết thúc (YYYY-MM-DD)
  isTruncatedByTerm: boolean;  // Có bị cắt bởi ngày kết thúc khóa hay không
  calculatedFee: number;       // Học phí tương ứng
  sessionDates: string[];      // Danh sách ngày diễn ra các buổi học thực tế (YYYY-MM-DD)
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function calculateClassTimeline(
  startDateStr: string,
  targetSessions: number,      // Số buổi chuẩn (VD: 24)
  daysOfWeek: string[],        // Mảng thứ đã chọn, ví dụ: ['T2', 'T4']
  termEndDateStr: string,      // Ngày kết thúc khóa (VD: 2026-12-25)
  pricePerSession: number      // Đơn giá 1 buổi (Ceil)
): ScheduleCalculationResult {
  const dayMapping: Record<string, number> = {
    'CN': 0, 'T2': 1, 'T3': 2, 'T4': 3, 'T5': 4, 'T6': 5, 'T7': 6
  };
  const activeDayNumbers = daysOfWeek
    .map(d => dayMapping[d])
    .filter(n => n !== undefined);

  if (!startDateStr || !termEndDateStr || activeDayNumbers.length === 0 || targetSessions <= 0) {
    return {
      actualSessions: 0,
      endDate: startDateStr || termEndDateStr || '',
      isTruncatedByTerm: true,
      calculatedFee: 0,
      sessionDates: [],
    };
  }

  const currentDate = new Date(`${startDateStr}T00:00:00`);
  const termEndDate = new Date(`${termEndDateStr}T00:00:00`);

  let sessionCount = 0;
  let lastSessionDate = new Date(`${startDateStr}T00:00:00`);
  const sessionDates: string[] = [];

  while (sessionCount < targetSessions && currentDate <= termEndDate) {
    if (activeDayNumbers.includes(currentDate.getDay())) {
      sessionCount++;
      lastSessionDate = new Date(currentDate);
      sessionDates.push(toLocalDateStr(currentDate));
    }
    // Tăng thêm 1 ngày
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const isTruncated = sessionCount < targetSessions;
  const calculatedFee = sessionCount * pricePerSession;

  return {
    actualSessions: sessionCount,
    endDate: toLocalDateStr(lastSessionDate),
    isTruncatedByTerm: isTruncated,
    calculatedFee: calculatedFee,
    sessionDates,
  };
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

const getClassDays = (cls: ExtracurricularClass, store: AppStore): string[] => {
  if (cls.days_of_week && cls.days_of_week.length > 0) return cls.days_of_week;
  const slot = store.timeSlots.find(t => t.id === cls.time_slot_id);
  return slot?.days_of_week || ['T2', 'T4'];
};

interface ClassesTabProps {
  store: AppStore;
  currentRole: UserRole;
  selectedCampusId?: string;
  selectedTermId?: string;
  searchQuery?: string;
  onSelectCampusId?: (id: string) => void;
  onSelectTermId?: (id: string) => void;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onSelectClassForAttendance: (cls: ExtracurricularClass) => void;
}

export const ClassesTab: React.FC<ClassesTabProps> = ({
  store,
  currentRole,
  selectedCampusId = 'all',
  selectedTermId = 'all',
  searchQuery = '',
  onSelectCampusId,
  onSelectTermId,
  onUpdateStore,
  onSelectClassForAttendance,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ExtracurricularClass | null>(null);
  const [dayPickerNotice, setDayPickerNotice] = useState<string | null>(null);

  // Local Filter States (bộ lọc nội bộ đồng bộ với props toàn cục)
  const [localCampusId, setLocalCampusId] = useState<string>(selectedCampusId);
  const [localTermId, setLocalTermId] = useState<string>(selectedTermId);
  const [localSubjectId, setLocalSubjectId] = useState<string>('all');
  const [localSearchQuery, setLocalSearchQuery] = useState<string>(searchQuery);

  // Đồng bộ khi props từ Navbar/App thay đổi
  useEffect(() => {
    if (selectedCampusId !== undefined) {
      setLocalCampusId(selectedCampusId);
    }
  }, [selectedCampusId]);

  useEffect(() => {
    if (selectedTermId !== undefined) {
      setLocalTermId(selectedTermId);
    }
  }, [selectedTermId]);

  useEffect(() => {
    if (searchQuery !== undefined) {
      setLocalSearchQuery(searchQuery);
    }
  }, [searchQuery]);

  const handleCampusChange = (newCampusId: string) => {
    setLocalCampusId(newCampusId);
    onSelectCampusId?.(newCampusId);
  };

  const handleTermChange = (newTermId: string) => {
    setLocalTermId(newTermId);
    onSelectTermId?.(newTermId);
  };

  const handleResetFilters = () => {
    setLocalCampusId('all');
    setLocalTermId('all');
    setLocalSubjectId('all');
    setLocalSearchQuery('');
    onSelectCampusId?.('all');
    onSelectTermId?.('all');
  };

  // Check if active selected term is closed (read-only mode)
  const currentSelectedTerm = store.terms.find(t => t.id === localTermId);
  const isSelectedTermClosed = currentSelectedTerm?.status === 'closed';

  // Initial campus and term selection for Add modal
  const defaultCampusId = localCampusId !== 'all' ? localCampusId : (store.campuses[0]?.id || '');
  const defaultTermId = localTermId !== 'all' ? localTermId : (store.terms.find(t => t.is_active)?.id || store.terms[0]?.id || '');
  const initialDefaultTerm = store.terms.find(t => t.id === defaultTermId) || store.terms[0];

  // New Class Form State with Term, Campus, Subject hierarchy & Start Date
  const [formData, setFormData] = useState({
    name: '',
    term_id: defaultTermId,
    campus_id: defaultCampusId,
    subject_id: store.subjects[0]?.id || '',
    facility_id: store.facilities[0]?.id || '',
    time_slot_id: store.timeSlots[0]?.id || '',
    days_of_week: ['T2', 'T4'] as string[],
    start_date: initialDefaultTerm?.start_date || '2026-09-01',
    primary_teacher_id: store.teachers[0]?.id || '',
    max_students: 15,
    total_sessions: 24,
    full_course_fee: 3600000,
    allow_over_quota: false,
  });

  // Active term and effective pricing for the currently selected values in the Modal
  const activeFormTerm = useMemo(
    () => store.terms.find(t => t.id === formData.term_id) || store.terms[0],
    [store.terms, formData.term_id]
  );

  const activeEffectivePricing = useMemo(
    () => getEffectivePrice(formData.term_id, formData.campus_id, formData.subject_id, store),
    [formData.term_id, formData.campus_id, formData.subject_id, store]
  );

  // Live calculation of class timeline (End Date, Actual Sessions, Truncation & Adjusted Tuition Fee)
  const scheduleCalcResult = useMemo(() => {
    const standardSessions = activeEffectivePricing.total_sessions || 24;
    const pricePerSession = activeEffectivePricing.session_rate || calculateCeilSessionRate(activeEffectivePricing.course_fee, standardSessions);
    const termEndDate = activeFormTerm?.end_date || '2026-12-20';
    return calculateClassTimeline(
      formData.start_date,
      standardSessions,
      formData.days_of_week,
      termEndDate,
      pricePerSession
    );
  }, [
    formData.start_date,
    formData.days_of_week,
    activeEffectivePricing.total_sessions,
    activeEffectivePricing.session_rate,
    activeEffectivePricing.course_fee,
    activeFormTerm?.end_date,
  ]);

  // Synchronize formData.total_sessions and formData.full_course_fee reactively when scheduleCalcResult updates
  useEffect(() => {
    if (scheduleCalcResult.actualSessions > 0) {
      setFormData(prev => {
        if (
          prev.total_sessions === scheduleCalcResult.actualSessions &&
          prev.full_course_fee === scheduleCalcResult.calculatedFee
        ) {
          return prev;
        }
        return {
          ...prev,
          total_sessions: scheduleCalcResult.actualSessions,
          full_course_fee: scheduleCalcResult.calculatedFee,
        };
      });
    }
  }, [scheduleCalcResult.actualSessions, scheduleCalcResult.calculatedFee]);

  // Check if start_date is within the selected term bounds
  const isStartDateOutOfBounds = useMemo(() => {
    if (!formData.start_date || !activeFormTerm) return true;
    return formData.start_date < activeFormTerm.start_date || formData.start_date > activeFormTerm.end_date;
  }, [formData.start_date, activeFormTerm]);

  // Calculate live session rate
  const computedSessionRate = activeEffectivePricing.session_rate || calculateCeilSessionRate(formData.full_course_fee, formData.total_sessions);

  // Filter classes by campus, term, subject & search query
  const filteredClasses = useMemo(() => {
    return store.classes.filter(cls => {
      // 1. Lọc theo Khóa học
      const matchTerm = localTermId === 'all' || cls.term_id === localTermId;

      // 2. Lọc theo Cơ sở trường
      const matchCampus = localCampusId === 'all' || cls.campus_id === localCampusId;

      // 3. Lọc theo Bộ môn
      const matchSubject = localSubjectId === 'all' || cls.subject_id === localSubjectId;

      // 4. Lọc theo từ khóa tìm kiếm (tên lớp, môn học, giáo viên, phòng, cơ sở)
      const query = (localSearchQuery || '').trim().toLowerCase();
      if (!query) {
        return matchTerm && matchCampus && matchSubject;
      }

      const campus = store.campuses.find(c => c.id === cls.campus_id);
      const subject = store.subjects.find(s => s.id === cls.subject_id);
      const teacher = store.teachers.find(t => t.id === cls.primary_teacher_id);
      const facility = store.facilities.find(f => f.id === cls.facility_id);

      const matchQuery =
        cls.name.toLowerCase().includes(query) ||
        (subject?.name || '').toLowerCase().includes(query) ||
        (teacher?.name || '').toLowerCase().includes(query) ||
        (facility?.name || '').toLowerCase().includes(query) ||
        (campus?.name || '').toLowerCase().includes(query) ||
        (campus?.code || '').toLowerCase().includes(query);

      return matchTerm && matchCampus && matchSubject && matchQuery;
    });
  }, [store.classes, store.campuses, store.subjects, store.teachers, store.facilities, localTermId, localCampusId, localSubjectId, localSearchQuery]);

  // Active filter readable names for statistics label
  const activeCampusName = localCampusId === 'all' 
    ? 'Tất cả cơ sở' 
    : store.campuses.find(c => c.id === localCampusId)?.name || 'Cơ sở đã chọn';
  const activeTermName = localTermId === 'all'
    ? 'Tất cả khóa học'
    : store.terms.find(t => t.id === localTermId)?.name || 'Khóa đã chọn';
  const activeSubjectName = localSubjectId === 'all'
    ? 'Tất cả bộ môn'
    : store.subjects.find(s => s.id === localSubjectId)?.name || 'Bộ môn đã chọn';
  const hasActiveFilters = localCampusId !== 'all' || localTermId !== 'all' || localSubjectId !== 'all' || localSearchQuery.trim() !== '';

  // Toggle Day Selection (Strict constraint: Exactly 2 days per class)
  const handleToggleDay = (dayCode: string) => {
    const current = formData.days_of_week || [];
    if (current.includes(dayCode)) {
      // Unselect
      const updated = current.filter(d => d !== dayCode);
      setFormData(prev => ({ ...prev, days_of_week: updated }));
      setDayPickerNotice(null);
    } else {
      // Select
      if (current.length < 2) {
        const order = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        const updated = [...current, dayCode].sort((a, b) => order.indexOf(a) - order.indexOf(b));
        setFormData(prev => ({ ...prev, days_of_week: updated }));
        setDayPickerNotice(null);
      } else {
        setDayPickerNotice('Mỗi môn chỉ học tối đa 2 ngày trong tuần. Hãy bỏ chọn 1 ngày trước nếu muốn thay đổi.');
        setTimeout(() => setDayPickerNotice(null), 3500);
      }
    }
  };

  // Schedule Conflict Soft Warning Check with Weekdays and Time Slot
  const checkConflicts = (
    facilityId: string, 
    teacherId: string, 
    timeSlotId: string, 
    daysOfWeek: string[],
    campusId: string,
    excludeClassId?: string,
    targetTermId: string = formData.term_id
  ) => {
    const conflicts: string[] = [];

    // Find classes in the same campus & term with the same timeSlot
    const existingClassesInSlot = store.classes.filter(
      c => c.id !== excludeClassId && 
           c.term_id === targetTermId && 
           c.campus_id === campusId && 
           c.time_slot_id === timeSlotId
    );

    for (const existing of existingClassesInSlot) {
      const existingDays = getClassDays(existing, store);
      // Find overlapping days
      const overlappingDays = daysOfWeek.filter(d => existingDays.includes(d));
      if (overlappingDays.length > 0) {
        const overlapText = formatDaysDisplay(overlappingDays);

        // Check facility clash
        if (existing.facility_id === facilityId) {
          const fac = store.facilities.find(f => f.id === facilityId);
          conflicts.push(`Sân/Phòng [${fac?.name || facilityId}] đã được xếp cho lớp "${existing.name}" vào ${overlapText} trong cùng khung giờ.`);
        }

        // Check teacher clash
        if (existing.primary_teacher_id === teacherId) {
          const tch = store.teachers.find(t => t.id === teacherId);
          conflicts.push(`Giáo viên [${tch?.name || teacherId}] đang đứng lớp "${existing.name}" vào ${overlapText} trong cùng khung giờ.`);
        }
      }
    }

    return conflicts;
  };

  const formConflicts = checkConflicts(
    formData.facility_id,
    formData.primary_teacher_id,
    formData.time_slot_id,
    formData.days_of_week,
    formData.campus_id,
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
    const targetTerm = store.terms.find(t => t.id === newTermId);

    setFormData(prev => {
      // If term changed or start_date is outside new term, reset start_date to new term's start_date
      const nextStartDate =
        newTermId !== prev.term_id ||
        !prev.start_date ||
        (targetTerm && (prev.start_date < targetTerm.start_date || prev.start_date > targetTerm.end_date))
          ? (targetTerm?.start_date || prev.start_date)
          : prev.start_date;

      const calc = calculateClassTimeline(
        nextStartDate,
        effectivePricing.total_sessions,
        prev.days_of_week,
        targetTerm?.end_date || '2026-12-20',
        effectivePricing.session_rate
      );

      return {
        ...prev,
        term_id: newTermId,
        campus_id: newCampusId,
        subject_id: newSubjectId,
        facility_id: nextFacilityId,
        start_date: nextStartDate,
        total_sessions: calc.actualSessions > 0 ? calc.actualSessions : effectivePricing.total_sessions,
        full_course_fee: calc.actualSessions > 0 ? calc.calculatedFee : effectivePricing.course_fee,
        name: keepCustomName && prev.name !== '' ? prev.name : `${subj?.name || 'Lớp'} - ${camp?.code || ''}`,
      };
    });
  };

  const handleOpenAddModal = () => {
    if (isSelectedTermClosed) {
      showToast('Khóa học này đã Đóng. Toàn bộ dữ liệu ở chế độ chỉ xem, không thể mở thêm lớp mới.', 'error', {
        title: 'Khóa học đã đóng',
      });
      return;
    }

    const initialTermId =
      localTermId !== 'all'
        ? localTermId
        : (store.terms.find(t => t.is_active)?.id || store.terms[0]?.id || 'term_fall_2026');
    const initialCampusId = localCampusId !== 'all' ? localCampusId : (store.campuses[0]?.id || 'camp_pmh');
    const targetTerm = store.terms.find(t => t.id === initialTermId) || store.terms[0];

    // Get active subjects in this term
    const activeTermSubjects = store.termSubjects.filter(ts => ts.term_id === initialTermId && ts.is_active);
    const initialSubjectId = activeTermSubjects[0]?.subject_id || store.subjects[0]?.id || '';

    const effectivePricing = getEffectivePrice(initialTermId, initialCampusId, initialSubjectId, store);
    const campusFacilities = store.facilities.filter(f => f.campus_id === initialCampusId && f.is_active);
    const subj = store.subjects.find(s => s.id === initialSubjectId);
    const camp = store.campuses.find(c => c.id === initialCampusId);

    const initialDays = (store.timeSlots[0]?.days_of_week && store.timeSlots[0].days_of_week.length === 2)
      ? store.timeSlots[0].days_of_week
      : ['T2', 'T4'];

    const initialStartDate = targetTerm?.start_date || '2026-09-01';
    const initialCalc = calculateClassTimeline(
      initialStartDate,
      effectivePricing.total_sessions,
      initialDays,
      targetTerm?.end_date || '2026-12-20',
      effectivePricing.session_rate
    );

    setEditingClass(null);
    setFormData({
      name: `${subj?.name || 'Lớp ngoại khóa'} - ${camp?.code || ''}`,
      term_id: initialTermId,
      campus_id: initialCampusId,
      subject_id: initialSubjectId,
      facility_id: campusFacilities[0]?.id || store.facilities[0]?.id || '',
      time_slot_id: store.timeSlots[0]?.id || '',
      days_of_week: initialDays,
      start_date: initialStartDate,
      primary_teacher_id: store.teachers[0]?.id || '',
      max_students: 15,
      total_sessions: initialCalc.actualSessions > 0 ? initialCalc.actualSessions : effectivePricing.total_sessions,
      full_course_fee: initialCalc.actualSessions > 0 ? initialCalc.calculatedFee : effectivePricing.course_fee,
      allow_over_quota: false,
    });
    setDayPickerNotice(null);
    setShowAddModal(true);
  };

  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    // 1. Kiểm tra đã chọn đúng 2 ngày trong tuần
    if (!formData.days_of_week || formData.days_of_week.length !== 2) {
      showToast('Vui lòng chọn đúng 2 ngày học trong tuần trước khi lưu lớp!', 'warning', {
        title: 'Thiếu cấu hình ngày học',
      });
      return;
    }

    // 2. Kiểm tra khóa học
    const targetTerm = store.terms.find(t => t.id === formData.term_id);
    if (!targetTerm || isTermClosed(formData.term_id, store)) {
      showToast('Không thể lưu lớp học vào Khóa học đã ĐÓNG.', 'error', {
        title: 'Khóa học đã đóng',
      });
      return;
    }

    // 3. Kiểm tra ràng buộc startDate >= term.start_date && startDate <= term.end_date
    if (
      !formData.start_date ||
      formData.start_date < targetTerm.start_date ||
      formData.start_date > targetTerm.end_date
    ) {
      showToast(
        `Ngày bắt đầu mở lớp phải nằm trong khung thời gian của ${targetTerm.name} (${formatDateVN(targetTerm.start_date)} → ${formatDateVN(targetTerm.end_date)})!`,
        'error',
        { title: 'Ngày mở lớp nằm ngoài khóa học' }
      );
      return;
    }

    const effectivePricing = getEffectivePrice(formData.term_id, formData.campus_id, formData.subject_id, store);
    const standardSessions = effectivePricing.total_sessions || 24;
    const sessionRate = effectivePricing.session_rate || calculateCeilSessionRate(effectivePricing.course_fee, standardSessions);

    const calc = calculateClassTimeline(
      formData.start_date,
      standardSessions,
      formData.days_of_week,
      targetTerm.end_date,
      sessionRate
    );

    if (calc.actualSessions <= 0) {
      showToast('Không có buổi học hợp lệ nào từ ngày bắt đầu đến ngày kết thúc khóa học. Vui lòng chọn ngày bắt đầu sớm hơn!', 'error', {
        title: 'Không đủ thời gian mở lớp',
      });
      return;
    }

    if (editingClass) {
      onUpdateStore(prev => {
        const updatedClass: ExtracurricularClass = {
          ...editingClass,
          ...formData,
          start_date: formData.start_date,
          end_date: calc.endDate,
          standard_sessions: standardSessions,
          total_sessions: calc.actualSessions,
          price_per_session: sessionRate,
          tuition_fee: calc.calculatedFee,
          full_course_fee: calc.calculatedFee,
          days_of_week: formData.days_of_week,
        };

        // Sinh lại danh sách ClassSession nằm trong khoảng [start_date, end_date], giữ nguyên các buổi đã điểm danh (completed)
        const otherClassSessions = prev.sessions.filter(s => s.class_id !== editingClass.id);
        const completedSessionsForClass = prev.sessions.filter(
          s => s.class_id === editingClass.id && s.status === 'completed'
        );
        const completedDates = new Set(completedSessionsForClass.map(s => s.session_date));

        const generatedScheduledSessions: ClassSession[] = calc.sessionDates
          .map((dateStr, idx) => {
            if (completedDates.has(dateStr)) return null;
            return {
              id: `ses_${editingClass.id}_${idx + 1}`,
              class_id: editingClass.id,
              session_date: dateStr,
              session_number: idx + 1,
              actual_teacher_id: formData.primary_teacher_id,
              is_substitute: false,
              snacks_allocated: 0,
              snacks_consumed: 0,
              snacks_returned: 0,
              status: 'scheduled' as const,
            };
          })
          .filter(Boolean) as ClassSession[];

        return {
          ...prev,
          classes: prev.classes.map(c => (c.id === editingClass.id ? updatedClass : c)),
          sessions: [...otherClassSessions, ...completedSessionsForClass, ...generatedScheduledSessions],
        };
      });
    } else {
      const newClassId = `cls_${Date.now()}`;
      const newClass: ExtracurricularClass = {
        id: newClassId,
        name: formData.name,
        term_id: formData.term_id,
        campus_id: formData.campus_id,
        subject_id: formData.subject_id,
        facility_id: formData.facility_id,
        time_slot_id: formData.time_slot_id,
        days_of_week: formData.days_of_week,
        start_date: formData.start_date,
        end_date: calc.endDate,
        standard_sessions: standardSessions,
        primary_teacher_id: formData.primary_teacher_id,
        max_students: formData.max_students,
        total_sessions: calc.actualSessions,
        full_course_fee: calc.calculatedFee,
        tuition_fee: calc.calculatedFee,
        price_per_session: sessionRate,
        status: 'active',
        allow_over_quota: formData.allow_over_quota,
      };

      // Sinh đúng số buổi thực tế (ClassSession) nằm trong khoảng [start_date, end_date]
      const generatedSessions: ClassSession[] = calc.sessionDates.map((dateStr, idx) => ({
        id: `ses_${newClassId}_${idx + 1}`,
        class_id: newClassId,
        session_date: dateStr,
        session_number: idx + 1,
        actual_teacher_id: formData.primary_teacher_id,
        is_substitute: false,
        snacks_allocated: 0,
        snacks_consumed: 0,
        snacks_returned: 0,
        status: 'scheduled',
      }));

      const createClassLog = createAuditRecord(
        'CLASS_CREATE',
        'ACADEMIC',
        'Lớp Ngoại Khóa',
        `Tạo mới lớp học: ${newClass.name} (${formatDateVN(newClass.start_date)} → ${formatDateVN(newClass.end_date)}, Số buổi: ${newClass.total_sessions}/${standardSessions}, Học phí: ${formatVND(newClass.full_course_fee)})`,
        null,
        {
          target_id: newClass.id,
          details: {
            status: 'success',
            after: {
              class_id: newClass.id,
              name: newClass.name,
              start_date: newClass.start_date,
              end_date: newClass.end_date,
              standard_sessions: standardSessions,
              total_sessions: newClass.total_sessions,
              full_course_fee: newClass.full_course_fee,
              days: newClass.days_of_week
            }
          }
        }
      );

      onUpdateStore(prev => ({
        ...prev,
        classes: [newClass, ...prev.classes],
        sessions: [...prev.sessions, ...generatedSessions],
        auditLogs: [createClassLog, ...(prev.auditLogs || [])],
      }));
    }

    showToast(
      editingClass
        ? `Đã cập nhật lớp "${formData.name}" (${calc.actualSessions}/${standardSessions} buổi • Kết thúc ${formatDateVN(calc.endDate)})!`
        : `Đã mở lớp "${formData.name}" (${calc.actualSessions}/${standardSessions} buổi • Học phí ${formatVND(calc.calculatedFee)})!`,
      'success',
      { title: editingClass ? 'Cập nhật lớp học' : 'Mở lớp học mới' }
    );
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

      {/* FILTER TOOLBAR: KHÓA HỌC, CƠ SỞ, BỘ MÔN & TÌM KIẾM NHANH */}
      <div className="rounded-3xl bg-[#111827]/90 border border-slate-800/80 p-4 backdrop-blur-md shadow-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Dropdown 1: Khóa học (Academic Term) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Khóa học (Academic Term)</span>
            </label>
            <select
              value={localTermId}
              onChange={(e) => handleTermChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-white focus:outline-none focus:border-amber-500 text-xs font-medium cursor-pointer transition-colors"
            >
              <option value="all">Tất cả khóa học ({store.terms.length} khóa)</option>
              {store.terms.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.status === 'closed' ? '🔒 (Đã đóng)' : t.is_active ? '⭐ (Hiện hành)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown 2: Cơ sở trường (Campus) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Cơ sở trường (Campus)</span>
            </label>
            <select
              value={localCampusId}
              onChange={(e) => handleCampusChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-white focus:outline-none focus:border-cyan-500 text-xs font-medium cursor-pointer transition-colors"
            >
              <option value="all">Tất cả cơ sở ({store.campuses.length} cơ sở)</option>
              {store.campuses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown 3: Bộ môn ngoại khóa (Subject) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>Bộ môn ngoại khóa (Subject)</span>
            </label>
            <select
              value={localSubjectId}
              onChange={(e) => setLocalSubjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-white focus:outline-none focus:border-purple-500 text-xs font-medium cursor-pointer transition-colors"
            >
              <option value="all">Tất cả bộ môn ({store.subjects.length} môn)</option>
              {store.subjects.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Ô tìm kiếm nhanh */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>Tìm kiếm nhanh</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                placeholder="Tìm theo tên lớp, GV, phòng..."
                className="w-full pl-3 pr-8 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-xs"
              />
              {localSearchQuery && (
                <button
                  type="button"
                  onClick={() => setLocalSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded-full"
                  title="Xóa tìm kiếm"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* THỐNG KÊ KẾT QUẢ & CÁC TAG ĐANG LỌC */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Hiển thị: <strong className="text-white font-mono">{filteredClasses.length}</strong> lớp học
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-slate-300">
              Đang lọc theo: <strong className="text-amber-400">{activeCampusName}</strong> &bull; <strong className="text-cyan-400">{activeTermName}</strong>
              {localSubjectId !== 'all' && (
                <> &bull; <strong className="text-purple-400">{activeSubjectName}</strong></>
              )}
              {localSearchQuery.trim() && (
                <> &bull; Từ khóa: <strong className="text-white">"{localSearchQuery.trim()}"</strong></>
              )}
            </span>
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-slate-400 hover:text-amber-400 flex items-center gap-1 font-semibold text-[11px] transition-colors self-start sm:self-auto cursor-pointer"
              title="Đặt lại tất cả bộ lọc về mặc định"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Xóa bộ lọc</span>
            </button>
          )}
        </div>
      </div>

      {/* EMPTY STATE KHI KHÔNG TÌM THẤY LỚP NÀO */}
      {filteredClasses.length === 0 ? (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-8 sm:p-12 text-center backdrop-blur-md shadow-xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
            <Calendar className="w-7 h-7 text-amber-500/60" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-white">
              Không tìm thấy lớp học nào thuộc cơ sở và khóa học đã chọn
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Không có lớp ngoại khóa nào phù hợp với bộ lọc ({activeCampusName} &bull; {activeTermName}
              {localSubjectId !== 'all' ? ` &bull; ${activeSubjectName}` : ''}). Vui lòng chọn tiêu chí khác hoặc đặt lại bộ lọc.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Xóa bộ lọc</span>
            </button>
            <button
              onClick={handleOpenAddModal}
              disabled={isSelectedTermClosed}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Mở lớp mới</span>
            </button>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* VIEW MODE 1: DẠNG LƯỚI (TABLE VIEW) */
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
                  <th className="py-3 px-4 font-mono">Đơn Giá Buổi</th>
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
                  const term = store.terms.find(t => t.id === cls.term_id);
                  const enrollments = store.enrollments.filter(e => e.class_id === cls.id && (e.status === 'active' || e.status === 'trial'));
                  const trialCount = enrollments.filter(e => e.status === 'trial').length;
                  const isOverQuota = enrollments.length > cls.max_students;
                  const classDays = getClassDays(cls, store);
                  const conflicts = checkConflicts(cls.facility_id, cls.primary_teacher_id, cls.time_slot_id, classDays, cls.campus_id, cls.id, cls.term_id);

                  return (
                    <tr key={cls.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{cls.name}</div>
                        {localTermId === 'all' && term && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            [{term.name}]
                          </div>
                        )}
                        {conflicts.length > 0 && (
                          <div className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Trùng lịch ca này ({conflicts.length})</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono border ${
                          campus?.code === 'PMH'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10'
                            : campus?.code === 'PL'
                            ? 'bg-lime-500/20 text-lime-300 border-lime-500/40 shadow-sm shadow-lime-500/10'
                            : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        }`}>
                          {campus?.code || 'PMH'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-300 font-medium">{subject?.name}</td>

                      <td className="py-3 px-4 text-slate-300">
                        <div className="font-semibold text-white">
                          {formatDaysDisplay(classDays)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {timeSlot?.start_time} - {timeSlot?.end_time}
                        </div>
                        {(cls.start_date || term?.start_date) && (
                          <div className="text-[10px] text-cyan-400/90 font-mono mt-0.5">
                            {formatDateVN(cls.start_date || term?.start_date)} &rarr; {formatDateVN(cls.end_date || term?.end_date)}
                          </div>
                        )}
                      </td>

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
                        {trialCount > 0 && (
                          <div className="text-[9px] text-purple-300 font-semibold mt-0.5">
                            ({trialCount} học thử)
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-amber-400">{formatVND(cls.price_per_session)}</td>

                      <td className="py-3 px-4 font-mono text-white font-medium">
                        <div>{formatVND(cls.full_course_fee)}</div>
                        <div className={`text-[10px] font-semibold mt-0.5 ${
                          cls.standard_sessions && cls.total_sessions < cls.standard_sessions
                            ? 'text-amber-400'
                            : 'text-emerald-400/90'
                        }`}>
                          {cls.standard_sessions
                            ? `${cls.total_sessions}/${cls.standard_sessions} buổi`
                            : `${cls.total_sessions} buổi`}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              if (isTermClosed(cls.term_id, store)) {
                                showToast('Khóa học này đã Đóng. Toàn bộ dữ liệu ở chế độ chỉ xem, không thể sửa lớp.', 'error', {
                                  title: 'Khóa học đã đóng',
                                });
                                return;
                              }
                              const editDays = getClassDays(cls, store).slice(0, 2);
                              setEditingClass(cls);
                              setFormData({
                                name: cls.name,
                                term_id: cls.term_id,
                                campus_id: cls.campus_id,
                                subject_id: cls.subject_id,
                                facility_id: cls.facility_id,
                                time_slot_id: cls.time_slot_id,
                                days_of_week: editDays.length === 2 ? editDays : ['T2', 'T4'],
                                start_date: cls.start_date || term?.start_date || '2026-09-01',
                                primary_teacher_id: cls.primary_teacher_id,
                                max_students: cls.max_students,
                                total_sessions: cls.total_sessions,
                                full_course_fee: cls.full_course_fee,
                                allow_over_quota: !!cls.allow_over_quota,
                              });
                              setDayPickerNotice(null);
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
            const term = store.terms.find(t => t.id === cls.term_id);
            
            const enrollments = store.enrollments.filter(e => e.class_id === cls.id && (e.status === 'active' || e.status === 'trial'));
            const trialCount = enrollments.filter(e => e.status === 'trial').length;
            const studentCount = enrollments.length;
            const isOverQuota = studentCount > cls.max_students;
            const classDays = getClassDays(cls, store);
            const conflicts = checkConflicts(cls.facility_id, cls.primary_teacher_id, cls.time_slot_id, classDays, cls.campus_id, cls.id, cls.term_id);

            return (
              <div
                key={cls.id}
                className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-5 backdrop-blur-md shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold">
                        {subject?.name || 'Môn Ngoại Khóa'}
                      </span>
                      {localTermId === 'all' && term && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          [{term.name}]
                        </span>
                      )}
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold font-mono border ${
                      campus?.code === 'PMH'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10'
                        : campus?.code === 'PL'
                        ? 'bg-lime-500/20 text-lime-300 border-lime-500/40 shadow-sm shadow-lime-500/10'
                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    }`}>
                      {campus?.code || 'PMH'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-2">{cls.name}</h3>

                  {conflicts.length > 0 && (
                    <div className="mb-3 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>CẢNH BÁO TRÙNG LỊCH ({conflicts.length}):</span>
                      </div>
                      {conflicts.map((msg, i) => (
                        <p key={i} className="text-amber-200/90 pl-5 text-[10px]">&bull; {msg}</p>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="font-semibold text-white">
                        {formatDaysDisplay(classDays)} ({timeSlot?.start_time} - {timeSlot?.end_time})
                      </span>
                    </div>

                    {(cls.start_date || term?.start_date) && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="font-mono text-[11px] text-cyan-300">
                          {formatDateVN(cls.start_date || term?.start_date)} &rarr; {formatDateVN(cls.end_date || term?.end_date)}
                        </span>
                      </div>
                    )}

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
                        {trialCount > 0 && <span className="text-purple-300 text-[10px] ml-1">({trialCount} thử)</span>}
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
                      <span className="text-slate-400 text-[10px] block">Đơn giá 1 buổi:</span>
                      <span className="text-amber-400 font-bold font-mono">{formatVND(cls.price_per_session)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 text-[10px] block">
                        Học phí lớp ({cls.standard_sessions ? `${cls.total_sessions}/${cls.standard_sessions}` : cls.total_sessions} buổi):
                      </span>
                      <span className="text-white font-bold font-mono">{formatVND(cls.full_course_fee)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      if (isTermClosed(cls.term_id, store)) {
                        showToast('Khóa học này đã Đóng. Toàn bộ dữ liệu ở chế độ chỉ xem, không thể sửa lớp.', 'error', {
                          title: 'Khóa học đã đóng',
                        });
                        return;
                      }
                      const editDays = getClassDays(cls, store).slice(0, 2);
                      setEditingClass(cls);
                      setFormData({
                        name: cls.name,
                        term_id: cls.term_id,
                        campus_id: cls.campus_id,
                        subject_id: cls.subject_id,
                        facility_id: cls.facility_id,
                        time_slot_id: cls.time_slot_id,
                        days_of_week: editDays.length === 2 ? editDays : ['T2', 'T4'],
                        start_date: cls.start_date || term?.start_date || '2026-09-01',
                        primary_teacher_id: cls.primary_teacher_id,
                        max_students: cls.max_students,
                        total_sessions: cls.total_sessions,
                        full_course_fee: cls.full_course_fee,
                        allow_over_quota: !!cls.allow_over_quota,
                      });
                      setDayPickerNotice(null);
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
          <div className="w-full max-w-2xl rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
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
              const standardSessions = effectivePricing.total_sessions || 24;

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
                              start_date: activeFormTerm?.start_date || prev.start_date,
                              total_sessions: effectivePricing.total_sessions,
                              full_course_fee: effectivePricing.course_fee,
                            }));
                          }}
                          className="text-amber-400 hover:text-amber-300 font-semibold underline text-[10px]"
                        >
                          Khôi phục từ đầu khóa
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
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-semibold"
                      >
                        {store.timeSlots.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* PHẦN 1: THIẾT KẾ GIAO DIỆN BỘ CHỌN THỨ (WEEKDAY PICKER UI) */}
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-inner">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                        <Calendar className="w-4 h-4 text-amber-400" />
                        <span>Lịch học trong tuần (Bắt buộc chọn đúng 2 ngày) *</span>
                      </label>

                      {/* Nhãn phụ hiển thị trạng thái động */}
                      <div>
                        {formData.days_of_week.length < 2 ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-bold inline-flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            Đã chọn: {formData.days_of_week.length}/2 ngày (Vui lòng chọn đủ 2 ngày)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ✓ Hợp lệ: [{formData.days_of_week.join(', ')}]
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 7 nút bấm đại diện cho 7 ngày trong tuần */}
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
                            title={
                              isSelected 
                                ? `Bấm để bỏ chọn ${day.label}` 
                                : isDisabled 
                                ? 'Mỗi môn chỉ học tối đa 2 ngày trong tuần. Hãy bỏ chọn 1 ngày trước nếu muốn thay đổi.' 
                                : `Bấm để chọn ${day.label}`
                            }
                          >
                            <span>{day.label}</span>
                            <span className={`text-[10px] font-mono ${isSelected ? 'text-slate-950 font-bold' : 'text-slate-500'}`}>
                              {day.code}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Toast / Thông báo nhẹ khi người dùng cố bấm chọn ngày thứ 3 */}
                    {dayPickerNotice && (
                      <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2 animate-fadeIn">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>{dayPickerNotice}</span>
                      </div>
                    )}

                    {/* Tự động cập nhật nhãn tóm tắt hiển thị */}
                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800">
                      <span className="text-slate-400">Tóm tắt lịch xếp lớp:</span>
                      <div>
                        {formData.days_of_week.length === 2 ? (
                          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-amber-500/30 text-amber-400 font-bold font-mono inline-flex items-center gap-1.5 shadow-sm">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            {formatDaysDisplay(formData.days_of_week)} ({store.timeSlots.find(t => t.id === formData.time_slot_id)?.start_time || '16:45'} - {store.timeSlots.find(t => t.id === formData.time_slot_id)?.end_time || '18:15'})
                          </span>
                        ) : (
                          <span className="text-amber-400/90 italic font-medium">
                            Chưa đủ 2 ngày học (vui lòng chọn thêm {2 - formData.days_of_week.length} ngày)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PHẦN 1.2: KHU VỰC THỜI GIAN MỞ LỚP & TÍNH TOÁN TIẾN ĐỘ TỰ ĐỘNG */}
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3.5 shadow-inner">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span className="text-slate-200 font-bold text-xs">
                          Cấu hình Thời gian Mở lớp & Tự động Tính ngày kết thúc
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2.5 py-0.5 rounded-lg border border-slate-800">
                        Khung thời gian khóa học: <strong className="text-cyan-300">{formatDateVN(activeFormTerm?.start_date)} &rarr; {formatDateVN(activeFormTerm?.end_date)}</strong>
                      </span>
                    </div>

                    {/* 1. Bộ chọn Ngày mở lớp (Class Start Date) */}
                    <div>
                      <label className="block text-slate-200 font-bold mb-1.5 flex items-center justify-between">
                        <span>Ngày bắt đầu mở lớp *</span>
                        {isStartDateOutOfBounds ? (
                          <span className="text-[10px] text-rose-400 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Nằm ngoài khoảng thời gian khóa học!
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-400 font-semibold">
                            ✓ Trong phạm vi khóa học
                          </span>
                        )}
                      </label>
                      <input
                        type="date"
                        required
                        min={activeFormTerm?.start_date}
                        max={activeFormTerm?.end_date}
                        value={formData.start_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                        className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 text-white font-mono text-xs font-bold focus:outline-none transition-all ${
                          isStartDateOutOfBounds
                            ? 'border-2 border-rose-500 ring-2 ring-rose-500/20 text-rose-200'
                            : 'border border-slate-700 focus:border-cyan-500'
                        }`}
                      />
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                        <span>
                          Khung thời gian khóa học: <strong className="text-slate-200 font-mono">{formatDateVN(activeFormTerm?.start_date)} &rarr; {formatDateVN(activeFormTerm?.end_date)}</strong>
                        </span>
                        {formData.start_date !== activeFormTerm?.start_date && !isStartDateOutOfBounds && (
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, start_date: activeFormTerm?.start_date || prev.start_date }))}
                            className="text-cyan-400 hover:text-cyan-300 underline font-semibold text-[10px]"
                          >
                            Đặt về ngày đầu khóa ({formatDateVN(activeFormTerm?.start_date)})
                          </button>
                        )}
                      </p>
                      {isStartDateOutOfBounds && (
                        <div className="mt-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[11px] font-semibold flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>
                            Ngày bắt đầu mở lớp phải nằm trong khoảng từ <strong>{formatDateVN(activeFormTerm?.start_date)}</strong> đến <strong>{formatDateVN(activeFormTerm?.end_date)}</strong> của {activeFormTerm?.name}.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 2. Thẻ hiển thị Tiến độ & Ngày kết thúc tự động (Dynamic Schedule Box) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Chỉ số 1: Ngày kết thúc lớp */}
                      <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">Ngày kết thúc lớp</span>
                        <div className="mt-1 font-mono font-extrabold text-sm text-cyan-300">
                          {scheduleCalcResult.actualSessions > 0 ? formatDateVN(scheduleCalcResult.endDate) : '—'}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5">
                          Buổi học cuối cùng trong khóa
                        </span>
                      </div>

                      {/* Chỉ số 2: Số buổi thực tế trong khóa */}
                      <div className={`p-3 rounded-xl border flex flex-col justify-between ${
                        scheduleCalcResult.isTruncatedByTerm
                          ? 'bg-amber-950/20 border-amber-500/40'
                          : 'bg-emerald-950/15 border-emerald-500/30'
                      }`}>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">Số buổi thực tế trong khóa</span>
                        <div className={`mt-1 font-mono font-extrabold text-sm flex items-center gap-1.5 ${
                          scheduleCalcResult.isTruncatedByTerm ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          <span>{scheduleCalcResult.actualSessions} / {standardSessions} buổi</span>
                        </div>
                        <span className={`text-[10px] font-semibold mt-0.5 ${
                          scheduleCalcResult.isTruncatedByTerm ? 'text-amber-300/90' : 'text-emerald-300/80'
                        }`}>
                          {scheduleCalcResult.isTruncatedByTerm
                            ? 'Bị giới hạn bởi ngày kết thúc khóa'
                            : '✓ Đủ định mức buổi chuẩn toàn khóa'}
                        </span>
                      </div>

                      {/* Chỉ số 3: Học phí điều chỉnh theo số buổi thực tế */}
                      <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">
                          {scheduleCalcResult.isTruncatedByTerm ? 'Học phí điều chỉnh thực tế' : 'Học phí lớp chuẩn'}
                        </span>
                        <div className="mt-1 font-mono font-extrabold text-sm text-amber-400">
                          {formatVND(scheduleCalcResult.calculatedFee)}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {scheduleCalcResult.actualSessions} buổi &times; {formatVND(effectivePricing.session_rate)}/b
                        </span>
                      </div>
                    </div>

                    {/* Banner cảnh báo màu vàng khi lớp mở muộn / bị giới hạn bởi ngày kết thúc khóa */}
                    {scheduleCalcResult.isTruncatedByTerm && !isStartDateOutOfBounds && (
                      <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs leading-relaxed flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          ⚠️ <strong>Lớp học được mở muộn trong khóa:</strong> Khóa học kết thúc vào ngày{' '}
                          <strong className="text-white font-mono">{formatDateVN(activeFormTerm?.end_date)}</strong>, lớp sẽ hoàn thành{' '}
                          <strong className="text-amber-300 font-mono">{scheduleCalcResult.actualSessions}/{standardSessions}</strong> buổi. Học phí lớp được tính là{' '}
                          <strong className="text-amber-300 font-mono">{formatVND(scheduleCalcResult.calculatedFee)}</strong>.
                        </div>
                      </div>
                    )}
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
                      <label className="block text-slate-400 font-medium mb-1">Số buổi thực tế của lớp trong khóa</label>
                      <input
                        type="number"
                        readOnly
                        value={scheduleCalcResult.actualSessions}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-bold font-mono cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Học phí lớp tương ứng (VND)</label>
                      <input
                        type="text"
                        readOnly
                        value={formatVND(scheduleCalcResult.calculatedFee)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-400 font-bold font-mono cursor-not-allowed"
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
                      Công thức chuẩn: Học phí lớp = Số buổi thực tế &times; Đơn giá buổi (Ceil)
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
                      disabled={formData.days_of_week.length !== 2 || isStartDateOutOfBounds || scheduleCalcResult.actualSessions <= 0}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold shadow-lg shadow-amber-500/20 transition-all"
                      title={
                        formData.days_of_week.length !== 2
                          ? 'Vui lòng chọn đúng 2 ngày học trong tuần trước khi lưu'
                          : isStartDateOutOfBounds
                          ? 'Ngày bắt đầu mở lớp phải nằm trong khung thời gian khóa học'
                          : undefined
                      }
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
