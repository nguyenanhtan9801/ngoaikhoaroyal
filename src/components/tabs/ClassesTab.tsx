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
  Filter,
  Globe,
  Trash2
} from 'lucide-react';
import { AppStore, formatVND, calculateCeilSessionRate, getEffectivePrice, isTermClosed, createAuditRecord, appendAuditLog, formatDateVN } from '../../lib/storage';
import { getSupabaseClient, supabase } from '../../supabaseClient';
import { ExtracurricularClass, ClassSession, UserRole } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { showToast } from '../../lib/toast';
import { CreateClassModal, calculateExactSchedule, DAY_INDEX } from '../modals/CreateClassModal';
import { TimeSlotsManager } from '../classes/TimeSlotsManager';
import { FacilityManagementView } from '../classes/FacilityManagementView';
import { ScheduleCalendarView } from './ScheduleCalendarView';

export { calculateExactSchedule, DAY_INDEX };

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
  const result = calculateExactSchedule(
    startDateStr,
    targetSessions,
    daysOfWeek,
    termEndDateStr,
    '',
    []
  );

  return {
    actualSessions: result.phase1Sessions,
    endDate: result.phase1Dates.length > 0 ? result.phase1Dates[result.phase1Dates.length - 1] : (startDateStr || termEndDateStr),
    isTruncatedByTerm: result.phase1Sessions < targetSessions,
    calculatedFee: result.phase1Sessions * pricePerSession,
    sessionDates: result.phase1Dates,
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
  initialTab?: 'classes' | 'time_slots' | 'facilities' | 'monthly_schedule';
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
  initialTab = 'classes',
}) => {
  const [activeTab, setActiveTab] = useState<'classes' | 'time_slots' | 'facilities' | 'monthly_schedule'>(initialTab);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ExtracurricularClass | null>(null);
  const [dayPickerNotice, setDayPickerNotice] = useState<string | null>(null);

  // Synchronize initialTab if changed externally
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

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

  // Auto-fetch latest classes and facilities from Supabase
  useEffect(() => {
    let cancelled = false;
    const fetchClassesFromCloud = async () => {
      const client = getSupabaseClient() || supabase;
      if (!client) return;
      try {
        const [classesRes, facilitiesRes] = await Promise.all([
          client.from('extracurricular_classes').select('*'),
          client.from('facilities').select('*').order('name', { ascending: true }),
        ]);

        if (!cancelled) {
          onUpdateStore(prev => {
            let nextClasses = prev.classes;
            if (!classesRes.error && Array.isArray(classesRes.data) && classesRes.data.length > 0) {
              const mappedClasses: ExtracurricularClass[] = classesRes.data.map((r: any): ExtracurricularClass => ({
                id: r.id,
                code: r.code || r.id,
                name: r.name,
                term_id: r.term_id,
                spanning_term_id: r.spanning_term_id || undefined,
                is_cross_term: Boolean(r.is_cross_term),
                term_distribution: r.term_distribution || undefined,
                campus_id: r.campus_id,
                subject_id: r.subject_id,
                facility_id: r.facility_id || '',
                time_slot_id: r.time_slot_id || '',
                days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week : ['T2', 'T4'],
                start_date: r.start_date || undefined,
                end_date: r.end_date || undefined,
                primary_teacher_id: r.primary_teacher_id || '',
                max_students: Number(r.max_students) || 25,
                total_sessions: Number(r.total_sessions) || 24,
                full_course_fee: Number(r.full_course_fee) || 0,
                price_per_session: Number(r.price_per_session) || 0,
                status: r.status || 'active',
                allow_over_quota: Boolean(r.allow_over_quota),
              }));

              const map = new Map<string, ExtracurricularClass>();
              prev.classes.forEach(c => map.set(c.id, c));
              mappedClasses.forEach(c => map.set(c.id, c));
              nextClasses = Array.from(map.values());
            }

            const nextFacilities = (!facilitiesRes.error && Array.isArray(facilitiesRes.data) && facilitiesRes.data.length > 0)
              ? facilitiesRes.data
              : prev.facilities;

            return {
              ...prev,
              classes: nextClasses,
              facilities: nextFacilities,
            };
          });
        }
      } catch (err) {
        console.warn('Lỗi auto-fetch classes & facilities:', err);
      }
    };
    fetchClassesFromCloud();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Form state for Create / Edit Class Modal
  const defaultActiveTermId =
    (localTermId !== 'all' ? localTermId : undefined) ||
    store.terms.find(t => t.is_active)?.id ||
    store.terms[0]?.id ||
    'term_fall_2026';
  const defaultCampusId =
    (localCampusId !== 'all' ? localCampusId : undefined) ||
    store.campuses[0]?.id ||
    'camp_pmh';
  const defaultSubjectId = store.subjects[0]?.id || 'subj_robotics';
  const defaultPricing = getEffectivePrice(defaultActiveTermId, defaultCampusId, defaultSubjectId, store);

  const [formData, setFormData] = useState<{
    name: string;
    term_id: string;
    campus_id: string;
    subject_id: string;
    facility_id: string;
    time_slot_id: string;
    days_of_week: string[];
    start_date: string;
    primary_teacher_id: string;
    max_students: number;
    total_sessions: number;
    full_course_fee: number;
    allow_over_quota: boolean;
  }>({
    name: '',
    term_id: defaultActiveTermId,
    campus_id: defaultCampusId,
    subject_id: defaultSubjectId,
    facility_id: store.facilities.find(f => f.campus_id === defaultCampusId)?.id || store.facilities[0]?.id || '',
    time_slot_id: store.timeSlots[0]?.id || 'slot_weekday_1',
    days_of_week: ['T2', 'T4'],
    start_date: store.terms.find(t => t.id === defaultActiveTermId)?.start_date || '2026-09-01',
    primary_teacher_id: store.teachers[0]?.id || 'tea_1',
    max_students: 20,
    total_sessions: defaultPricing.total_sessions || 24,
    full_course_fee: defaultPricing.course_fee || 5400000,
    allow_over_quota: false,
  });

  const [crossTermMode, setCrossTermMode] = useState<'allow_cross_term' | 'truncate_to_term'>('allow_cross_term');

  const activeFormTerm = useMemo(
    () => store.terms.find(t => t.id === formData.term_id) || store.terms[0],
    [store.terms, formData.term_id]
  );

  // Auto-detect next consecutive term (Khóa kế tiếp)
  const nextFormTerm = useMemo(() => {
    if (!activeFormTerm) return undefined;
    const sortedTerms = [...store.terms].sort((a, b) => a.start_date.localeCompare(b.start_date));
    return sortedTerms.find(t => t.id !== activeFormTerm.id && t.start_date > activeFormTerm.start_date);
  }, [store.terms, activeFormTerm]);

  const isStartDateOutOfBounds = useMemo(() => {
    if (!activeFormTerm || !formData.start_date) return false;
    return formData.start_date < activeFormTerm.start_date || formData.start_date > activeFormTerm.end_date;
  }, [activeFormTerm, formData.start_date]);

  const effectiveModalPricing = useMemo(
    () => getEffectivePrice(formData.term_id, formData.campus_id, formData.subject_id, store),
    [formData.term_id, formData.campus_id, formData.subject_id, store]
  );

  const computedSessionRate = useMemo(
    () => effectiveModalPricing.session_rate || calculateCeilSessionRate(formData.full_course_fee, formData.total_sessions),
    [effectiveModalPricing.session_rate, formData.full_course_fee, formData.total_sessions]
  );

  // Calculate full schedule across primary term and optional spanning next term
  const scheduleCalcResult = useMemo(() => {
    const standardSessions = effectiveModalPricing.total_sessions || 24;
    const sessionRate = effectiveModalPricing.session_rate || computedSessionRate;
    const primaryEndStr = activeFormTerm?.end_date || '2026-12-25';

    // Base calculation within primary term
    const truncatedCalc = calculateClassTimeline(
      formData.start_date,
      standardSessions,
      formData.days_of_week,
      primaryEndStr,
      sessionRate
    );

    // Full calculation without primary term end cap (to check if class spans into next term)
    const farFutureEndStr = nextFormTerm?.end_date || '2027-12-31';
    const fullCalc = calculateClassTimeline(
      formData.start_date,
      standardSessions,
      formData.days_of_week,
      farFutureEndStr,
      sessionRate
    );

    const isCrossTermCandidate =
      truncatedCalc.actualSessions < standardSessions &&
      fullCalc.endDate > primaryEndStr;

    const primarySessionDates = fullCalc.sessionDates.filter(d => d <= primaryEndStr);
    const spanningSessionDates = fullCalc.sessionDates.filter(d => d > primaryEndStr);

    if (isCrossTermCandidate && crossTermMode === 'allow_cross_term') {
      return {
        actualSessions: fullCalc.actualSessions,
        endDate: fullCalc.endDate,
        isTruncatedByTerm: false,
        calculatedFee: fullCalc.actualSessions * sessionRate,
        sessionDates: fullCalc.sessionDates,
        isCrossTermCandidate: true,
        fullCourseEndDate: fullCalc.endDate,
        primaryTermSessions: primarySessionDates.length,
        spanningTermSessions: spanningSessionDates.length,
        primarySessionDates,
        spanningSessionDates,
        truncatedEndDate: truncatedCalc.endDate,
        truncatedSessions: truncatedCalc.actualSessions,
        truncatedFee: truncatedCalc.calculatedFee,
      };
    }

    return {
      ...truncatedCalc,
      isCrossTermCandidate,
      fullCourseEndDate: fullCalc.endDate,
      primaryTermSessions: primarySessionDates.length,
      spanningTermSessions: spanningSessionDates.length,
      primarySessionDates,
      spanningSessionDates,
      truncatedEndDate: truncatedCalc.endDate,
      truncatedSessions: truncatedCalc.actualSessions,
      truncatedFee: truncatedCalc.calculatedFee,
    };
  }, [
    formData.start_date,
    formData.days_of_week,
    effectiveModalPricing.total_sessions,
    effectiveModalPricing.session_rate,
    computedSessionRate,
    activeFormTerm?.end_date,
    nextFormTerm?.end_date,
    crossTermMode,
  ]);

  const handleCascadingChange = (
    newTermId: string,
    newCampusId: string,
    newSubjectId: string,
    preserveStartDate = false
  ) => {
    const termObj = store.terms.find(t => t.id === newTermId);
    const pricing = getEffectivePrice(newTermId, newCampusId, newSubjectId, store);
    const campusFacs = store.facilities.filter(f => f.campus_id === newCampusId && f.is_active);
    setFormData(prev => ({
      ...prev,
      term_id: newTermId,
      campus_id: newCampusId,
      subject_id: newSubjectId,
      facility_id: campusFacs.some(f => f.id === prev.facility_id)
        ? prev.facility_id
        : (campusFacs[0]?.id || prev.facility_id),
      start_date: preserveStartDate ? prev.start_date : (termObj?.start_date || prev.start_date),
      total_sessions: pricing.total_sessions || 24,
      full_course_fee: pricing.course_fee || 5400000,
    }));
  };

  const handleToggleDay = (dayCode: string) => {
    setDayPickerNotice(null);
    setFormData(prev => {
      const exists = prev.days_of_week.includes(dayCode);
      if (exists) {
        return {
          ...prev,
          days_of_week: prev.days_of_week.filter(d => d !== dayCode),
        };
      }
      if (prev.days_of_week.length >= 2) {
        setDayPickerNotice('Mỗi lớp chỉ học cố định 2 buổi/tuần. Hãy bỏ chọn 1 ngày trước khi chọn ngày mới.');
        return prev;
      }
      const order = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
      const updated = [...prev.days_of_week, dayCode].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return {
        ...prev,
        days_of_week: updated,
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
    const targetTermId = localTermId !== 'all' ? localTermId : defaultActiveTermId;
    const targetCampusId = localCampusId !== 'all' ? localCampusId : defaultCampusId;
    const termObj = store.terms.find(t => t.id === targetTermId);
    const termSubjs = store.termSubjects.filter(ts => ts.term_id === targetTermId && ts.is_active);
    const targetSubjectId =
      localSubjectId !== 'all' && termSubjs.some(ts => ts.subject_id === localSubjectId)
        ? localSubjectId
        : (termSubjs[0]?.subject_id || store.subjects[0]?.id || '');
    const pricing = getEffectivePrice(targetTermId, targetCampusId, targetSubjectId, store);
    const campusFacs = store.facilities.filter(f => f.campus_id === targetCampusId && f.is_active);

    setEditingClass(null);
    setCrossTermMode('allow_cross_term');
    setFormData({
      name: '',
      term_id: targetTermId,
      campus_id: targetCampusId,
      subject_id: targetSubjectId,
      facility_id: campusFacs[0]?.id || store.facilities[0]?.id || '',
      time_slot_id: store.timeSlots[0]?.id || 'slot_weekday_1',
      days_of_week: ['T2', 'T4'],
      start_date: termObj?.start_date || '2026-09-01',
      primary_teacher_id: store.teachers[0]?.id || 'tea_1',
      max_students: 20,
      total_sessions: pricing.total_sessions || 24,
      full_course_fee: pricing.course_fee || 5400000,
      allow_over_quota: false,
    });
    setShowAddModal(true);
  };

  const handleOpenEditModal = (cls: ExtracurricularClass) => {
    if (isTermClosed(cls.term_id, store)) {
      showToast('Khóa học này đã Đóng. Toàn bộ dữ liệu ở chế độ chỉ xem, không thể sửa lớp.', 'error', {
        title: 'Khóa học đã đóng',
      });
      return;
    }
    setEditingClass(cls);
    setCrossTermMode(cls.is_cross_term ? 'allow_cross_term' : 'truncate_to_term');
    setFormData({
      name: cls.name,
      term_id: cls.term_id,
      campus_id: cls.campus_id,
      subject_id: cls.subject_id,
      facility_id: cls.facility_id,
      time_slot_id: cls.time_slot_id,
      days_of_week: getClassDays(cls, store),
      start_date: cls.start_date || store.terms.find(t => t.id === cls.term_id)?.start_date || '2026-09-01',
      primary_teacher_id: cls.primary_teacher_id,
      max_students: cls.max_students,
      total_sessions: cls.total_sessions,
      full_course_fee: cls.full_course_fee,
      allow_over_quota: Boolean(cls.allow_over_quota),
    });
    setShowAddModal(true);
  };

  const handleDeleteClass = async (classItem: ExtracurricularClass) => {
    // 0. Khóa học đã đóng kiểm tra quyền
    if (isTermClosed(classItem.term_id, store)) {
      showToast('Khóa học này đã Đóng. Toàn bộ dữ liệu ở chế độ chỉ xem, không thể xóa lớp.', 'error', {
        title: 'Khóa học đã đóng',
      });
      return;
    }

    try {
      // 1. Kiểm tra sĩ số / học viên thực tế trong bảng enrollments (cả từ local store và Supabase)
      const localEnrollments = store.enrollments.filter(
        e => e.class_id === classItem.id && (e.status === 'active' || e.status === 'trial')
      );
      if (localEnrollments.length > 0) {
        alert(
          `Không thể xóa! Lớp "${classItem.name}" đang có ${localEnrollments.length} học viên ghi danh. Vui lòng gỡ học viên khỏi lớp trước khi xóa.`
        );
        return;
      }

      const client = getSupabaseClient() || supabase;
      if (client) {
        const { count, error: countError } = await client
          .from('enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', classItem.id);

        if (!countError && count && count > 0) {
          alert(
            `Không thể xóa! Lớp "${classItem.name}" đang có ${count} học viên ghi danh. Vui lòng gỡ học viên khỏi lớp trước khi xóa.`
          );
          return;
        }
      }

      // 2. Xác nhận xóa
      if (!window.confirm(`Xác nhận xóa vĩnh viễn lớp "${classItem.name}"?`)) {
        return;
      }

      // 3. Xóa các hóa đơn rác hoặc dữ liệu liên kết nếu có (cascade)
      if (client) {
        try {
          await client.from('tuition_invoices').delete().eq('class_id', classItem.id);
          await client.from('class_sessions').delete().eq('class_id', classItem.id);
        } catch (e) {
          console.warn('Lỗi dọn dẹp sessions/invoices:', e);
        }

        // 4. Xóa lớp học khỏi bảng extracurricular_classes
        const { error: deleteError } = await client
          .from('extracurricular_classes')
          .delete()
          .eq('id', classItem.id);

        if (deleteError) throw deleteError;
      }

      // 5. Cập nhật local reactive store
      onUpdateStore(prev => ({
        ...prev,
        classes: prev.classes.filter(c => c.id !== classItem.id),
        sessions: prev.sessions.filter(s => s.class_id !== classItem.id),
        invoices: prev.invoices.filter(i => i.class_id !== classItem.id),
        auditLogs: [
          createAuditRecord(
            'CLASS_DELETE' as any,
            'ACADEMIC',
            'Lớp Ngoại Khóa',
            `Xóa vĩnh viễn lớp: ${classItem.name} (${classItem.code || classItem.id})`,
            null,
            { target_id: classItem.id }
          ),
          ...(prev.auditLogs || [])
        ]
      }));

      showToast(`Đã xóa thành công lớp học "${classItem.name}"!`, 'success', {
        title: 'Xóa lớp học'
      });
    } catch (err: any) {
      console.error('Lỗi khi xóa lớp:', err);
      alert('Không thể xóa lớp học: ' + (err.message || err));
    }
  };

  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.days_of_week.length !== 2 || isStartDateOutOfBounds || scheduleCalcResult.actualSessions <= 0) {
      return;
    }

    const isCrossTerm = Boolean(
      scheduleCalcResult.isCrossTermCandidate &&
      crossTermMode === 'allow_cross_term' &&
      nextFormTerm
    );
    const spanningTermId = isCrossTerm ? nextFormTerm?.id : undefined;
    const termDistribution = isCrossTerm
      ? {
          primary_term_sessions: scheduleCalcResult.primaryTermSessions,
          spanning_term_sessions: scheduleCalcResult.spanningTermSessions,
        }
      : undefined;

    const classId = editingClass?.id || `cls_${Date.now()}`;
    const newClassObj: ExtracurricularClass = {
      id: classId,
      name: formData.name.trim(),
      campus_id: formData.campus_id,
      term_id: formData.term_id,
      subject_id: formData.subject_id,
      facility_id: formData.facility_id,
      time_slot_id: formData.time_slot_id,
      days_of_week: formData.days_of_week,
      start_date: formData.start_date,
      end_date: scheduleCalcResult.endDate,
      primary_teacher_id: formData.primary_teacher_id,
      max_students: formData.max_students,
      total_sessions: scheduleCalcResult.actualSessions,
      full_course_fee: scheduleCalcResult.calculatedFee,
      price_per_session: computedSessionRate,
      allow_over_quota: formData.allow_over_quota,
      status: editingClass?.status || 'active',
      is_cross_term: isCrossTerm,
      spanning_term_id: spanningTermId,
      term_distribution: termDistribution,
    };

    onUpdateStore(prev => {
      const updatedClasses = editingClass
        ? prev.classes.map(c => (c.id === editingClass.id ? newClassObj : c))
        : [newClassObj, ...prev.classes];

      // Generate scheduled ClassSession records across Stage 1 & Stage 2 for new classes (or preserve completed ones)
      const existingCompletedSessions = prev.sessions.filter(
        s => s.class_id === classId && s.status === 'completed'
      );
      const completedDateSet = new Set(existingCompletedSessions.map(s => s.session_date));
      const otherClassSessions = prev.sessions.filter(s => s.class_id !== classId);

      const generatedSessions: ClassSession[] = scheduleCalcResult.sessionDates.map((dateStr, idx) => {
        const existingComp = existingCompletedSessions.find(s => s.session_date === dateStr);
        if (existingComp) return existingComp;
        const belongsToSpanning =
          isCrossTerm &&
          activeFormTerm?.end_date &&
          dateStr > activeFormTerm.end_date &&
          nextFormTerm;
        return {
          id: `ses_${classId}_${String(idx + 1).padStart(2, '0')}`,
          class_id: classId,
          term_id: belongsToSpanning ? nextFormTerm.id : formData.term_id,
          session_date: dateStr,
          session_number: idx + 1,
          actual_teacher_id: formData.primary_teacher_id,
          is_substitute: false,
          snacks_allocated: 0,
          snacks_consumed: 0,
          snacks_returned: 0,
          status: 'scheduled',
        };
      });

      // Keep any completed sessions not in the new generated dates
      const extraCompleted = existingCompletedSessions.filter(
        s => !scheduleCalcResult.sessionDates.includes(s.session_date) && completedDateSet.has(s.session_date)
      );

      const auditLog = createAuditRecord(
        editingClass ? 'CLASS_UPDATE' : 'CLASS_CREATE',
        'ACADEMIC',
        newClassObj.name,
        `${editingClass ? 'Cập nhật' : 'Tạo mới'} lớp "${newClassObj.name}" (${newClassObj.total_sessions} buổi, ${
          isCrossTerm
            ? `Liên khóa: ${termDistribution?.primary_term_sessions}b ${activeFormTerm?.name} + ${termDistribution?.spanning_term_sessions}b ${nextFormTerm?.name}`
            : `Trong khóa ${activeFormTerm?.name}`
        })`,
        null,
        {
          target_id: newClassObj.id,
          details: { status: 'success', after: newClassObj },
        }
      );

      return {
        ...prev,
        classes: updatedClasses,
        sessions: [...otherClassSessions, ...extraCompleted, ...generatedSessions],
        auditLogs: [auditLog, ...(prev.auditLogs || [])],
      };
    });

    setShowAddModal(false);
    setEditingClass(null);
    showToast(
      isCrossTerm
        ? `✓ Đã lưu lớp liên khóa "${newClassObj.name}" (${termDistribution?.primary_term_sessions} buổi ${activeFormTerm?.name} + ${termDistribution?.spanning_term_sessions} buổi ${nextFormTerm?.name})!`
        : `✓ Đã lưu lớp ngoại khóa "${newClassObj.name}" (${newClassObj.total_sessions} buổi) thành công!`,
      'success',
      { title: editingClass ? 'Cập nhật lớp học' : 'Tạo lớp ngoại khóa mới' }
    );
  };

  // Filter classes by campus, term, subject & search query
  const filteredClasses = useMemo(() => {
    return store.classes.filter(cls => {
      // 1. Lọc theo Khóa học (Hỗ trợ lớp liên khóa vắt sang khóa sau)
      const matchTerm =
        localTermId === 'all' ||
        cls.term_id === localTermId ||
        (cls.is_cross_term && cls.spanning_term_id === localTermId);

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

  // Schedule Conflict Soft Warning Check with Weekdays and Time Slot
  const checkConflicts = (
    facilityId: string, 
    teacherId: string, 
    timeSlotId: string, 
    daysOfWeek: string[],
    campusId: string,
    excludeClassId?: string,
    targetTermId?: string
  ) => {
    const conflicts: string[] = [];

    // Find classes in the same campus & term with the same timeSlot
    const existingClassesInSlot = store.classes.filter(
      c => c.id !== excludeClassId && 
           (!targetTermId || c.term_id === targetTermId || (c.is_cross_term && c.spanning_term_id === targetTermId)) && 
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

      {/* Sub-tab Navigation: Classes vs Time Slots */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('classes')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'classes'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Danh Sách Lớp Ngoại Khóa ({store.classes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('time_slots')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'time_slots'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Quản Lý Khung Giờ Học ({store.timeSlots?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('facilities')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'facilities'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Quản Lý Phòng Học &amp; Sân ({store.facilities?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('monthly_schedule')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'monthly_schedule'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Lịch Học Dạng Tháng</span>
          </button>
        </div>

        {activeTab === 'classes' && (
          <button
            type="button"
            onClick={() => setActiveTab('monthly_schedule')}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition-colors"
          >
            <span>Xem lịch học dạng tháng &rarr;</span>
          </button>
        )}
      </div>

      {activeTab === 'time_slots' ? (
        <TimeSlotsManager store={store} onUpdateStore={onUpdateStore} />
      ) : activeTab === 'facilities' ? (
        <FacilityManagementView
          store={store}
          currentRole={currentRole}
          selectedCampusId={localCampusId}
          onUpdateStore={onUpdateStore}
        />
      ) : activeTab === 'monthly_schedule' ? (
        <ScheduleCalendarView
          store={store}
          currentRole={currentRole}
          selectedCampusId={localCampusId}
          selectedTermId={localTermId}
          onSelectClassForAttendance={(cls) => onSelectClassForAttendance(cls)}
        />
      ) : (
        <>
          {/* Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                <span>Danh Sách Lớp Ngoại Khóa &amp; Khung Giờ Hoạt Động</span>
              </h2>
              <p className="text-xs text-slate-400">
                Kiểm soát sĩ số tối đa, phát hiện trùng lịch giáo viên/phòng học và áp dụng công thức đơn giá buổi chuẩn Ceil
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />

              <button
                type="button"
                onClick={() => setActiveTab('time_slots')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/30 cursor-pointer"
                title="Quản lý khung giờ học"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Khung Giờ</span>
              </button>

              <button
                onClick={handleOpenAddModal}
                disabled={isSelectedTermClosed}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
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
                        {cls.is_cross_term && (
                          <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/40 text-[10px] text-purple-300 font-semibold">
                            <Globe className="w-3 h-3 text-purple-400 shrink-0" />
                            <span>Liên khóa ({cls.term_distribution ? `${cls.term_distribution.primary_term_sessions}b + ${cls.term_distribution.spanning_term_sessions}b` : 'Vắt 2 khóa'})</span>
                            {localTermId !== 'all' && cls.spanning_term_id === localTermId && (
                              <span className="text-amber-400 font-bold ml-1">• Vắt từ khóa trước</span>
                            )}
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
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(cls)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              isTermClosed(cls.term_id, store)
                                ? 'bg-slate-800/40 text-slate-500 cursor-not-allowed border border-slate-800'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                            }`}
                            title={isTermClosed(cls.term_id, store) ? 'Khóa đã đóng - Chỉ xem' : 'Sửa'}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectClassForAttendance(cls)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold"
                          >
                            Điểm Danh
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClass(cls)}
                            disabled={isTermClosed(cls.term_id, store)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isTermClosed(cls.term_id, store)
                                ? 'bg-slate-800/30 text-slate-600 border-slate-800 cursor-not-allowed'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors'
                            }`}
                            title="Xóa lớp học"
                          >
                            <Trash2 className="w-4 h-4" />
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

                  {cls.is_cross_term && (
                    <div className="mb-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-500/20 border border-purple-500/40 text-xs text-purple-300 font-medium">
                      <Globe className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>Liên khóa ({cls.term_distribution ? `${cls.term_distribution.primary_term_sessions}b Khóa 1 + ${cls.term_distribution.spanning_term_sessions}b Khóa 2` : 'Vắt 2 khóa'})</span>
                      {localTermId !== 'all' && cls.spanning_term_id === localTermId && (
                        <span className="text-amber-400 font-bold ml-1">• Vắt từ khóa trước</span>
                      )}
                    </div>
                  )}

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
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(cls)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        isTermClosed(cls.term_id, store)
                          ? 'bg-slate-800/40 text-slate-500 cursor-not-allowed'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                      title={isTermClosed(cls.term_id, store) ? 'Khóa đã đóng - Chỉ xem' : 'Sửa Lớp'}
                    >
                      Sửa Lớp
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteClass(cls)}
                      disabled={isTermClosed(cls.term_id, store)}
                      className={`p-1.5 rounded-xl border transition-colors ${
                        isTermClosed(cls.term_id, store)
                          ? 'bg-slate-800/30 text-slate-600 border-slate-800 cursor-not-allowed'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors'
                      }`}
                      title="Xóa lớp học"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
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

      {/* Create / Edit Class Modal with Full Cross-Term Support */}
      <CreateClassModal
        key={editingClass ? `edit_${editingClass.id}` : 'new_class'}
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingClass(null);
        }}
        editingClass={editingClass}
        store={store}
        onUpdateStore={onUpdateStore}
        initialTermId={localTermId !== 'all' ? localTermId : undefined}
        initialCampusId={localCampusId !== 'all' ? localCampusId : undefined}
        initialSubjectId={localSubjectId !== 'all' ? localSubjectId : undefined}
      />
      </>
      )}

    </div>
  );
};
