import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Send, 
  CheckCircle2, 
  PhoneCall, 
  Clock, 
  Search, 
  Check, 
  ExternalLink, 
  MessageSquare, 
  Phone, 
  UserCheck, 
  X, 
  Copy, 
  Share2, 
  ShieldAlert, 
  Lock,
  Calendar,
  Sparkles,
  AlertTriangle,
  Layers,
  DollarSign,
  BookOpen,
  Info,
  Zap,
  RefreshCw,
  Settings2,
  CheckSquare,
  Square,
  Building2,
  User,
  Trash2,
  UserX
} from 'lucide-react';
import { supabase, getSupabaseClient } from '@/supabaseClient';
import { mapSupabaseRowToStoreEntity } from '../../lib/supabase';
import { 
  AppStore, 
  generateStudentCode, 
  formatVND, 
  calculateCeilSessionRate, 
  getEffectivePrice, 
  createAuditRecord, 
  appendAuditLog,
  formatDateVN,
  getClassDaysOfWeek,
  getDayLabel,
  formatDaysListLabel,
  formatStudentScheduleLabel,
  getDefaultClassStartDate,
  calculateRemainingSessions,
  calculateClassProratedPricing,
  matchLeadWithDatabase,
  mergeMedicalNotes
} from '../../lib/storage';
import { ParentRegistration, Student, UserRole, ExtracurricularClass, Enrollment, TuitionInvoice, AppUser } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { showToast } from '../../lib/toast';

interface ParentPortalTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onOpenParentPortal?: () => void;
  onNavigateToStudents?: (studentCode?: string) => void;
}

export const ParentPortalTab: React.FC<ParentPortalTabProps> = ({
  store,
  currentRole,
  currentUser,
  onUpdateStore,
  onOpenParentPortal,
  onNavigateToStudents,
}) => {
  // Check authorization:
  // "Phần xem hồ sơ tiếp nhận chỉ hiện cho Nhân sự được phân công là tuyển sinh, giáo vụ hoặc admin"
  const isAuthorizedStaff = [
    'super_admin',
    'admissions',
    'academic_admissions'
  ].includes(currentRole);

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'contacted' | 'enrolled' | 'partially_enrolled' | 'canceled'>('all');
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  // Modal Xếp lớp & Ghi danh chính thức (Đa môn)
  const [selectedLeadForEnroll, setSelectedLeadForEnroll] = useState<ParentRegistration | null>(null);
  const [assignModalMode, setAssignModalMode] = useState<'quick' | 'detailed'>('quick');
  const [assignedClassesBySubject, setAssignedClassesBySubject] = useState<Record<string, string>>({});
  const [subjectAssignModes, setSubjectAssignModes] = useState<Record<string, 'assign_now' | 'unassigned' | 'already_enrolled'>>({});
  const [subjectEnrollmentTypes, setSubjectEnrollmentTypes] = useState<Record<string, 'official' | 'trial'> >({});
  const [subjectEnrolledDays, setSubjectEnrolledDays] = useState<Record<string, string[]>>({});
  const [subjectStartDates, setSubjectStartDates] = useState<Record<string, string>>({});
  const [subjectCustomSessions, setSubjectCustomSessions] = useState<Record<string, number | undefined>>({});
  const [unassignedReasons, setUnassignedReasons] = useState<Record<string, string>>({});
  const [customStudentCode, setCustomStudentCode] = useState<string>('');
  const [mergedMedicalNotes, setMergedMedicalNotes] = useState<string>('');
  const [enrollNote, setEnrollNote] = useState<string>('');

  // Bulk 1-Click Quick Assignment State
  const [selectedLeadIdsForBulk, setSelectedLeadIdsForBulk] = useState<string[]>([]);
  const [isBulkQuickModalOpen, setIsBulkQuickModalOpen] = useState<boolean>(false);

  // Modal Cập nhật ghi chú tư vấn
  const [editingLeadContact, setEditingLeadContact] = useState<ParentRegistration | null>(null);
  const [contactNoteInput, setContactNoteInput] = useState<string>('');
  const [contactStatusInput, setContactStatusInput] = useState<'pending' | 'contacted' | 'partially_enrolled' | 'canceled'>('contacted');

  // Modal Loại bỏ / Xử lý hồ sơ ảo (Hủy đơn hoặc Xóa vĩnh viễn khỏi CSDL Supabase)
  const [rejectTargetLead, setRejectTargetLead] = useState<ParentRegistration | null>(null);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);

  // Trạng thái đồng bộ CSDL Tuyển sinh trực tiếp từ Supabase
  const [isRefreshingFromSupabase, setIsRefreshingFromSupabase] = useState(false);
  const [lastSupabaseSyncTime, setLastSupabaseSyncTime] = useState<string | null>(null);

  const fetchLeadsFromSupabase = async (showSuccessToast = false) => {
    try {
      setIsRefreshingFromSupabase(true);
      const client = supabase || getSupabaseClient();
      if (!client) {
        setIsRefreshingFromSupabase(false);
        return;
      }

      const { data, error } = await client
        .from('parent_registrations')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (error) {
        console.error('Lỗi Supabase khi tải parent_registrations:', error);
        if (showSuccessToast) {
          showToast('Không thể tải từ Supabase: ' + error.message, 'error');
        }
        return;
      }

      if (data && Array.isArray(data)) {
        const mappedRecords: ParentRegistration[] = data.map((row: any) =>
          mapSupabaseRowToStoreEntity('parent_registrations', row)
        );

        onUpdateStore(prev => ({
          ...prev,
          parentRegistrations: mappedRecords,
        }));
        setLastSupabaseSyncTime(new Date().toLocaleTimeString('vi-VN'));
        if (showSuccessToast) {
          showToast(`Đã đồng bộ ${mappedRecords.length} hồ sơ từ CSDL Supabase!`, 'success');
        }
      }
    } catch (err: any) {
      console.error('Lỗi khi tải parent_registrations:', err);
    } finally {
      setIsRefreshingFromSupabase(false);
    }
  };

  useEffect(() => {
    fetchLeadsFromSupabase(false);
  }, []);

  const handleCopyShareLink = () => {
    try {
      const origin = window.location.origin || '';
      const pathname = window.location.pathname || '/';
      const shareUrl = `${origin}${pathname}?portal=parent`;
      navigator.clipboard.writeText(shareUrl);
      showToast(`Đã sao chép link Cổng Phụ Huynh: ${shareUrl}`);
    } catch {
      showToast('Đã sao chép link Cổng Phụ Huynh!');
    }
  };

  // If role is NOT authorized (e.g. teacher or purely non-admissions)
  if (!isAuthorizedStaff) {
    return (
      <div className="py-12 px-4 max-w-2xl mx-auto text-center space-y-6 animate-fadeIn">
        <div className="p-8 sm:p-10 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-md space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
            <ShieldAlert className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-bold uppercase tracking-wider">
              Phân Quyền Giới Hạn
            </span>
            <h3 className="text-xl font-black text-white">
              QUYỀN TRUY CẬP HỒ SƠ TIẾP NHẬN TUYỂN SINH
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              Phần xem và xử lý danh sách hồ sơ phụ huynh nộp trực tuyến chỉ dành riêng cho Nhân sự được phân công là <strong>Tuyển sinh</strong>, <strong>Giáo vụ</strong> hoặc <strong>Quản trị viên</strong>.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 max-w-md mx-auto space-y-1">
            <div>Vai trò hiện tại của bạn: <strong className="text-amber-400">{currentRole}</strong></div>
            <p className="text-[11px] text-slate-500">
              Để xem hồ sơ tuyển sinh, vui lòng chuyển vai trò sang <strong>Tuyển sinh</strong> hoặc <strong>Giáo vụ & Tuyển sinh</strong> trên thanh menu phía trên.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {onOpenParentPortal && (
              <button
                onClick={onOpenParentPortal}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Mở Cổng Phụ Huynh Trực Tuyến</span>
              </button>
            )}

            <button
              onClick={handleCopyShareLink}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold text-xs flex items-center gap-2"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Sao Chép Link Gửi Phụ Huynh</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // KPIs
  const totalLeads = store.parentRegistrations.length;
  const pendingLeads = store.parentRegistrations.filter(r => r.status === 'pending').length;
  const contactedLeads = store.parentRegistrations.filter(r => r.status === 'contacted').length;
  const enrolledLeads = store.parentRegistrations.filter(r => r.status === 'enrolled' || r.status === 'partially_enrolled').length;

  // Filtered Leads
  const filteredLeads = store.parentRegistrations.filter(lead => {
    if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
    if (campusFilter !== 'all' && lead.desired_campus_id !== campusFilter) return false;
    
    // Check subject filter against both primary and multi-subject list
    if (subjectFilter !== 'all') {
      const matchPrimary = lead.desired_subject_id === subjectFilter;
      const list = lead.selected_subjects || lead.registered_subjects || [];
      const matchMulti = list.some((s: any) => (s.subject_id || s.id) === subjectFilter);
      if (!matchPrimary && !matchMulti) return false;
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const codeMatch = (lead.reg_code || lead.registration_code || lead.code)?.toLowerCase().includes(q);
      const parentMatch = lead.parent_name?.toLowerCase().includes(q);
      const phoneMatch = lead.parent_phone?.includes(q);
      const studentMatch = lead.student_name?.toLowerCase().includes(q);
      const subject = store.subjects.find(s => s.id === lead.desired_subject_id);
      const subjectMatch = subject?.name?.toLowerCase().includes(q);
      const list = lead.selected_subjects || lead.registered_subjects || [];
      const multiSubMatch = list.some((s: any) => (s.subject_name || s.name)?.toLowerCase().includes(q));
      return Boolean(codeMatch || parentMatch || phoneMatch || studentMatch || subjectMatch || multiSubMatch);
    }

    return true;
  });

  // Helper to extract registered subjects for any lead (standardized with Campus pricing)
  const getSubjectsForLead = (lead: ParentRegistration) => {
    const rawList = (lead.selected_subjects && lead.selected_subjects.length > 0)
      ? lead.selected_subjects
      : (lead.registered_subjects && lead.registered_subjects.length > 0)
      ? lead.registered_subjects
      : [];

    const termId = lead.desired_term_id || store.terms[0]?.id || 'term_fall_2026';
    if (rawList.length > 0) {
      return rawList.map((item: any) => {
        const subId = item.subject_id || item.id;
        const subObj = store.subjects.find(s => s.id === subId);
        const eff = getEffectivePrice(termId, lead.desired_campus_id, subId, store);
        return {
          subject_id: subId,
          subject_name: item.subject_name || item.name || subObj?.name || 'Môn ngoại khóa',
          time_slot: item.time_slot || 'after_school',
          time_slot_label: item.time_slot_label || item.time_slot || 'Sau giờ chính khóa (16:45 - 18:15)',
          estimated_fee: Number(item.fee ?? item.estimated_fee ?? eff.course_fee) || 3990000,
        };
      });
    }

    const subject = store.subjects.find(s => s.id === lead.desired_subject_id);
    const eff = getEffectivePrice(termId, lead.desired_campus_id, lead.desired_subject_id, store);
    return [
      {
        subject_id: lead.desired_subject_id,
        subject_name: subject?.name || 'Môn ngoại khóa',
        time_slot: lead.desired_time_slot_type,
        time_slot_label: lead.desired_time_slot_type === 'after_school' ? 'Sau giờ chính khóa (16:45 - 18:15)' : 'Cuối tuần (Thứ 7 - CN)',
        estimated_fee: Number(eff.course_fee || lead.total_estimated_fee || lead.estimated_fee) || 3990000,
      }
    ];
  };

  // Quick Cancel for 100% Duplicate Spam Lead
  const handleCancelDuplicateLead = (lead: ParentRegistration, refLead?: ParentRegistration | null) => {
    const staffName = currentUser?.full_name || 'Chuyên viên Tuyển sinh';
    const refCode = refLead?.registration_code || refLead?.id || 'đơn trước đó';
    const cancelLog = createAuditRecord(
      'DATA_UPDATE' as any,
      'ACADEMIC',
      'Hủy Đơn Tuyển Sinh Trùng Lặp',
      `Tuyển sinh ${staffName} đã hủy đơn trùng lặp ${lead.registration_code || lead.id} của học sinh ${lead.student_name.trim()} (Trùng 100% với ${refCode})`,
      currentUser,
      {
        target_id: lead.registration_code || lead.id,
        details: {
          status: 'success',
          duplicate_of: refCode,
        },
      }
    );

    onUpdateStore(prev => ({
      ...prev,
      parentRegistrations: prev.parentRegistrations.map(r =>
        r.id === lead.id
          ? {
              ...r,
              status: 'canceled',
              is_duplicate_lead: true,
              duplicate_of_lead_id: refLead?.id,
              contact_notes: `Đã hủy đơn trùng lặp 100% (Trùng học sinh, môn học và khung giờ với đơn ${refCode}).`,
            }
          : r
      ),
      auditLogs: [cancelLog, ...(prev.auditLogs || [])],
    }));

    showToast(
      `Đã hủy đơn trùng lặp ${lead.registration_code || lead.id} (Giữ nguyên đơn gốc ${refCode})!`,
      'info',
      { title: 'Đã dọn đơn trùng lặp' }
    );
  };

  // ============================================================================
  // XỬ LÝ LOẠI BỎ HỒ SƠ TUYỂN SINH ẢO (HỦY ĐƠN HOẶC XÓA VĨNH VIỄN KHỎI CSDL)
  // ============================================================================
  const handleRejectRegistration = async (
    regId: string, 
    regCode: string, 
    isPermanentDelete = false
  ) => {
    try {
      setIsRejecting(true);
      const client = supabase || getSupabaseClient();
      const staffName = currentUser?.full_name || 'Chuyên viên Tuyển sinh';

      if (isPermanentDelete) {
        if (client) {
          const { error } = await client
            .from('parent_registrations')
            .delete()
            .eq('id', regId);
          if (error) {
            console.warn('Lỗi Supabase khi xóa vĩnh viễn parent_registrations:', error);
          }
        }

        const deleteAudit = createAuditRecord(
          'DATA_UPDATE' as any,
          'ACADEMIC',
          'Xóa Vĩnh Viễn Hồ Sơ Tuyển Sinh Ảo',
          `Tuyển sinh ${staffName} đã XÓA VĨNH VIỄN hồ sơ ${regCode} khỏi cơ sở dữ liệu.`,
          currentUser,
          {
            target_id: regCode,
            details: {
              action: 'permanent_delete',
              lead_id: regId,
            },
          }
        );

        onUpdateStore(prev => ({
          ...prev,
          parentRegistrations: prev.parentRegistrations.filter(r => r.id !== regId),
          auditLogs: [deleteAudit, ...(prev.auditLogs || [])],
        }));

        showToast(`Đã xóa vĩnh viễn hồ sơ ${regCode} khỏi cơ sở dữ liệu!`, 'success', {
          title: 'Đã Xóa Bản Ghi',
        });
      } else {
        // Đánh dấu là hồ sơ ảo / đã hủy
        if (client) {
          const { error } = await client
            .from('parent_registrations')
            .update({ 
              status: 'canceled', 
              notes: 'Hồ sơ ảo / Người dùng hủy',
              contact_notes: 'Hồ sơ ảo / Người dùng hủy'
            })
            .eq('id', regId);
          if (error) {
            console.warn('Lỗi Supabase khi cập nhật trạng thái hủy:', error);
          }
        }

        const cancelAudit = createAuditRecord(
          'DATA_UPDATE' as any,
          'ACADEMIC',
          'Loại Bỏ Hồ Sơ Tuyển Sinh Ảo',
          `Tuyển sinh ${staffName} đã chuyển hồ sơ ${regCode} sang trạng thái Loại bỏ / Ảo.`,
          currentUser,
          {
            target_id: regCode,
            details: {
              action: 'mark_as_spam_canceled',
              lead_id: regId,
            },
          }
        );

        onUpdateStore(prev => ({
          ...prev,
          parentRegistrations: prev.parentRegistrations.map(r =>
            r.id === regId
              ? {
                  ...r,
                  status: 'canceled',
                  contact_notes: 'Hồ sơ ảo / Người dùng hủy',
                  notes: 'Hồ sơ ảo / Người dùng hủy',
                }
              : r
          ),
          auditLogs: [cancelAudit, ...(prev.auditLogs || [])],
        }));

        showToast(`Đã chuyển hồ sơ ${regCode} sang trạng thái Loại bỏ!`, 'info', {
          title: 'Đã Đánh Dấu Hồ Sơ Ảo',
        });
      }

      setRejectTargetLead(null);
      // Nạp lại danh sách từ Supabase
      fetchLeadsFromSupabase(false);
    } catch (err: any) {
      showToast('Lỗi khi xử lý hồ sơ: ' + (err?.message || err), 'error');
    } finally {
      setIsRejecting(false);
    }
  };

  // ============================================================================
  // THUẬT TOÁN TỰ ĐỘNG KHỚP LỚP TỐI ƯU (SMART MATCHING ALGORITHM - 4 TIÊU CHÍ)
  // ============================================================================
  const autoMatchClasses = (
    lead: ParentRegistration,
    virtualSeatAdjustments: Record<string, number> = {},
    forceFreshAutoMatch: boolean = false
  ) => {
    const matchRes = matchLeadWithDatabase(lead, store);
    const matchedStudent = matchRes.matchedStudent;
    const subjects = getSubjectsForLead(lead);

    const assignedMap: Record<string, string> = {};
    const modesMap: Record<string, 'assign_now' | 'unassigned' | 'already_enrolled'> = {};
    const enrollTypesMap: Record<string, 'official' | 'trial'> = {};
    const enrolledDaysMap: Record<string, string[]> = {};
    const startDatesMap: Record<string, string> = {};
    const reasonsMap: Record<string, string> = {};
    const candidateClassesMap: Record<string, ExtracurricularClass[]> = {};

    // Track occupied schedule slots (days + timeSlot) to prevent conflicts across subjects
    interface OccupiedSlot {
      days: string[];
      timeSlotId: string;
      startTime: string;
      endTime: string;
      className: string;
    }
    const occupiedSlots: OccupiedSlot[] = [];

    const addOccupiedSlot = (cls: ExtracurricularClass, customDays?: string[]) => {
      const days = customDays && customDays.length > 0 ? customDays : getClassDaysOfWeek(cls, store);
      const slot = store.timeSlots.find(ts => ts.id === cls.time_slot_id);
      occupiedSlots.push({
        days,
        timeSlotId: cls.time_slot_id,
        startTime: slot?.start_time || '16:45',
        endTime: slot?.end_time || '18:15',
        className: cls.name,
      });
    };

    const hasScheduleConflict = (cls: ExtracurricularClass): boolean => {
      const clsDays = getClassDaysOfWeek(cls, store);
      const slot = store.timeSlots.find(ts => ts.id === cls.time_slot_id);
      const startA = slot?.start_time || '16:45';
      const endA = slot?.end_time || '18:15';

      return occupiedSlots.some(occ => {
        const commonDays = clsDays.filter(d => occ.days.includes(d));
        if (commonDays.length === 0) return false;
        const isSameSlot = cls.time_slot_id === occ.timeSlotId;
        const isTimeOverlap = startA < occ.endTime && endA > occ.startTime;
        return isSameSlot || isTimeOverlap;
      });
    };

    // Pre-populate occupied slots with classes the existing student is ALREADY taking
    if (matchedStudent && matchRes.enrolledClasses.length > 0) {
      matchRes.enrolledClasses.forEach(ec => {
        addOccupiedSlot(ec);
      });
    }

    // Separate subjects that are already enrolled or preserved vs subjects needing smart matching
    const subjectsToMatch: typeof subjects = [];

    subjects.forEach(sub => {
      enrollTypesMap[sub.subject_id] = 'official';

      // 0. Check if existing student is ALREADY actively enrolled in a class of this subject
      if (matchedStudent) {
        const existingEnrolledClass = matchRes.enrolledClasses.find(c => c.subject_id === sub.subject_id);
        if (existingEnrolledClass) {
          const clsDays = getClassDaysOfWeek(existingEnrolledClass, store);
          assignedMap[sub.subject_id] = existingEnrolledClass.id;
          modesMap[sub.subject_id] = 'already_enrolled';
          enrolledDaysMap[sub.subject_id] = [...clsDays];
          startDatesMap[sub.subject_id] = getDefaultClassStartDate(existingEnrolledClass, store, undefined, clsDays);
          candidateClassesMap[sub.subject_id] = [existingEnrolledClass];
          return;
        }
      }

      // If lead already has an assigned class and we are not forcing fresh re-match
      if (!forceFreshAutoMatch && lead.assigned_class_ids && lead.assigned_class_ids.length > 0) {
        const alreadyClass = store.classes.find(
          c => c.subject_id === sub.subject_id && lead.assigned_class_ids?.includes(c.id)
        );
        if (alreadyClass) {
          const clsDays = getClassDaysOfWeek(alreadyClass, store);
          assignedMap[sub.subject_id] = alreadyClass.id;
          modesMap[sub.subject_id] = 'assign_now';
          enrolledDaysMap[sub.subject_id] = [...clsDays];
          startDatesMap[sub.subject_id] = getDefaultClassStartDate(alreadyClass, store, undefined, clsDays);
          addOccupiedSlot(alreadyClass, clsDays);
          return;
        }
      }

      subjectsToMatch.push(sub);
    });

    // Helper to get available non-full classes for a subject at the desired campus
    const getAvailableCampusClassesForSub = (sub: (typeof subjects)[0]) => {
      // Tiêu chí 1: Đúng Cơ sở & Bộ môn (Bắt buộc)
      const campusSubjectClasses = store.classes.filter(
        c => c.campus_id === lead.desired_campus_id && c.subject_id === sub.subject_id && c.status === 'active'
      );

      // Tiêu chí 2: Còn chỉ tiêu sĩ số (enrolled < max_students)
      return campusSubjectClasses.filter(c => {
        const baseEnrolled = store.enrollments.filter(
          e => e.class_id === c.id && (e.status === 'active' || e.status === 'trial')
        ).length;
        const effectiveEnrolled = baseEnrolled + (virtualSeatAdjustments[c.id] || 0);
        return effectiveEnrolled < c.max_students;
      });
    };

    // Sort subjectsToMatch by Minimum Remaining Values (fewest available classes first)
    // so constrained subjects get their conflict-free slot first
    const orderedSubjectsToMatch = [...subjectsToMatch].sort((a, b) => {
      const countA = getAvailableCampusClassesForSub(a).length;
      const countB = getAvailableCampusClassesForSub(b).length;
      return countA - countB;
    });

    orderedSubjectsToMatch.forEach(sub => {
      const availableClasses = getAvailableCampusClassesForSub(sub);

      if (availableClasses.length === 0) {
        // Tất cả các lớp của môn đó tại cơ sở đều đã đầy 100% hoặc chưa mở lớp
        assignedMap[sub.subject_id] = '';
        modesMap[sub.subject_id] = 'unassigned';
        enrolledDaysMap[sub.subject_id] = [];
        reasonsMap[sub.subject_id] = 'Lớp hiện tại đã kín sĩ số (100%) / Chờ mở thêm lớp';
        candidateClassesMap[sub.subject_id] = [];
        return;
      }

      // Score and sort available classes according to Criteria 3 & 4
      const scoredCandidates = availableClasses
        .map(cls => {
          const baseEnrolled = store.enrollments.filter(
            e => e.class_id === cls.id && (e.status === 'active' || e.status === 'trial')
          ).length;
          const enrolledCount = baseEnrolled + (virtualSeatAdjustments[cls.id] || 0);
          const slotObj = store.timeSlots.find(ts => ts.id === cls.time_slot_id);
          const teacherObj = store.teachers.find(t => t.id === cls.primary_teacher_id);

          // Tiêu chí 3: Đúng khung giờ & Chống trùng lịch thông minh (No-Conflict Constraint)
          const conflict = hasScheduleConflict(cls);
          const matchesSlotType = slotObj ? slotObj.slot_type === sub.time_slot : true;

          // Tiêu chí 4: Ưu tiên lớp chuẩn bị đủ sĩ số mở lớp (enrolled / max_students cao nhất) & GV cơ hữu
          const fillRatioScore = Math.round((enrolledCount / Math.max(1, cls.max_students)) * 100);
          const permanentTeacherScore = teacherObj?.teacher_type === 'permanent' ? 150 : 0;
          const slotMatchScore = matchesSlotType ? 500 : 0;
          const noConflictScore = !conflict ? 10000 : 0;

          return {
            cls,
            conflict,
            matchesSlotType,
            enrolledCount,
            totalScore: noConflictScore + slotMatchScore + permanentTeacherScore + fillRatioScore,
          };
        })
        .sort((a, b) => b.totalScore - a.totalScore);

      candidateClassesMap[sub.subject_id] = scoredCandidates.map(sc => sc.cls);

      // Pick the best non-conflicting class (or if all conflict, mark unassigned or pick top if only 1 subject)
      const bestNonConflicting = scoredCandidates.find(sc => !sc.conflict);

      if (bestNonConflicting) {
        const chosenCls = bestNonConflicting.cls;
        const clsDays = getClassDaysOfWeek(chosenCls, store);
        assignedMap[sub.subject_id] = chosenCls.id;
        modesMap[sub.subject_id] = 'assign_now';
        enrolledDaysMap[sub.subject_id] = [...clsDays];
        startDatesMap[sub.subject_id] = getDefaultClassStartDate(chosenCls, store, undefined, clsDays);
        addOccupiedSlot(chosenCls, clsDays);
      } else {
        // Nếu tất cả các lớp còn chỗ của môn này đều bị trùng lịch với môn đã xếp trước đó
        assignedMap[sub.subject_id] = '';
        modesMap[sub.subject_id] = 'unassigned';
        enrolledDaysMap[sub.subject_id] = [];
        reasonsMap[sub.subject_id] = 'Trùng khung giờ với môn khác của bé / Chờ mở ca lệch thứ';
      }
    });

    return {
      assignedMap,
      modesMap,
      enrollTypesMap,
      enrolledDaysMap,
      startDatesMap,
      reasonsMap,
      candidateClassesMap,
      subjects,
      matchRes,
    };
  };

  // Open multi-subject enroll modal (defaults to Quick 1-Click Mode)
  const handleOpenEnrollModal = (lead: ParentRegistration, initialMode: 'quick' | 'detailed' = 'quick') => {
    setSelectedLeadForEnroll(lead);
    setAssignModalMode(initialMode);
    const matchRes = matchLeadWithDatabase(lead, store);
    const matchedStudent = matchRes.matchedStudent;

    // Lock code to existing student code if matched, otherwise generate a new one
    const existingCode = matchedStudent?.code || lead.assigned_student_code;
    const suggestedCode = existingCode || generateStudentCode(lead.is_royal_student, store.students);
    setCustomStudentCode(suggestedCode);
    setMergedMedicalNotes(
      matchedStudent
        ? mergeMedicalNotes(matchedStudent.medical_notes, lead.medical_notes)
        : lead.medical_notes || ''
    );

    const smartResult = autoMatchClasses(lead, {}, false);

    setAssignedClassesBySubject(smartResult.assignedMap);
    setSubjectAssignModes(smartResult.modesMap);
    setSubjectEnrollmentTypes(smartResult.enrollTypesMap);
    setSubjectEnrolledDays(smartResult.enrolledDaysMap);
    setSubjectStartDates(smartResult.startDatesMap);
    setSubjectCustomSessions({});
    setUnassignedReasons(smartResult.reasonsMap);
    setEnrollNote(
      matchedStudent
        ? `Gộp môn học mới từ đơn ${lead.registration_code || ''} vào hồ sơ học sinh hiện tại ${matchedStudent.code} (${matchedStudent.name})`
        : `Tiếp nhận & xếp lớp nhanh từ hồ sơ tuyển sinh ${lead.registration_code || ''}`
    );
  };

  // Re-run Smart Auto-Matching at any time inside AssignClassModal
  const handleRunSmartAutoMatch = () => {
    if (!selectedLeadForEnroll) return;
    const smartResult = autoMatchClasses(selectedLeadForEnroll, {}, true);
    setAssignedClassesBySubject(smartResult.assignedMap);
    setSubjectAssignModes(smartResult.modesMap);
    setSubjectEnrolledDays(smartResult.enrolledDaysMap);
    setSubjectStartDates(smartResult.startDatesMap);
    setSubjectCustomSessions({});
    setUnassignedReasons(smartResult.reasonsMap);

    const matchedCount = Object.entries(smartResult.modesMap).filter(
      ([subId, mode]) => (mode === 'assign_now' && Boolean(smartResult.assignedMap[subId])) || mode === 'already_enrolled'
    ).length;

    showToast(
      `Đã chạy lại thuật toán Khớp Lớp Tối Ưu: Khớp thành công ${matchedCount}/${smartResult.subjects.length} môn (Không trùng lịch)!`,
      'success',
      { title: '⚡ Tự Động Khớp Lớp Tối Ưu' }
    );
  };

  // Quick Cycle to next available class for a subject (Nút đổi nhanh RefreshCw)
  const handleCycleQuickClass = (subjectId: string) => {
    if (!selectedLeadForEnroll) return;
    const lead = selectedLeadForEnroll;
    const availableCampusClasses = store.classes.filter(c => {
      if (c.campus_id !== lead.desired_campus_id || c.subject_id !== subjectId || c.status !== 'active') return false;
      const enrolled = store.enrollments.filter(
        e => e.class_id === c.id && (e.status === 'active' || e.status === 'trial')
      ).length;
      return enrolled < c.max_students;
    });

    if (availableCampusClasses.length === 0) {
      showToast('Hiện không có lớp nào còn chỗ trống cho môn này tại cơ sở đã chọn!', 'warning');
      return;
    }

    const currentClassId = assignedClassesBySubject[subjectId] || '';
    const currentIndex = availableCampusClasses.findIndex(c => c.id === currentClassId);
    const nextIndex = (currentIndex + 1) % availableCampusClasses.length;
    const nextCls = availableCampusClasses[nextIndex];
    const clsDays = getClassDaysOfWeek(nextCls, store);

    setSubjectAssignModes(prev => ({ ...prev, [subjectId]: 'assign_now' }));
    setAssignedClassesBySubject(prev => ({ ...prev, [subjectId]: nextCls.id }));
    setSubjectEnrolledDays(prev => ({ ...prev, [subjectId]: [...clsDays] }));
    setSubjectStartDates(prev => ({
      ...prev,
      [subjectId]: getDefaultClassStartDate(nextCls, store, undefined, clsDays),
    }));
    setSubjectCustomSessions(prev => ({ ...prev, [subjectId]: undefined }));

    if (availableCampusClasses.length === 1) {
      showToast(`Môn này hiện có 1 lớp khả dụng duy nhất tại cơ sở: ${nextCls.name}`, 'info');
    } else {
      showToast(`Đã đổi nhanh sang lớp: ${nextCls.name} (${clsDays.join(' & ')})`, 'info');
    }
  };

  // Execute Multi-Class Enrollment & Existing Student Merge
  const handleConfirmEnrollment = () => {
    if (!selectedLeadForEnroll) return;
    const lead = selectedLeadForEnroll;
    const subjects = getSubjectsForLead(lead);
    const matchRes = matchLeadWithDatabase(lead, store);
    const matchedStudent = matchRes.matchedStudent;

    // Get selected class IDs ONLY for subjects whose mode is 'assign_now'
    const activeAssignedEntries = Object.entries(assignedClassesBySubject).filter(([subId, classId]) => {
      const mode = subjectAssignModes[subId] ?? 'assign_now';
      return mode === 'assign_now' && Boolean(classId);
    });

    const alreadyEnrolledSubjectsCount = subjects.filter(
      s => subjectAssignModes[s.subject_id] === 'already_enrolled'
    ).length;
    const newRequestedSubjectsCount = Math.max(0, subjects.length - alreadyEnrolledSubjectsCount);

    const selectedClassIds = activeAssignedEntries.map(([_, classId]) => classId);
    const selectedClassObjects = selectedClassIds
      .map(id => store.classes.find(c => c.id === id))
      .filter((c): c is ExtracurricularClass => Boolean(c));

    const totalRequested = subjects.length;
    const assignedCount = selectedClassObjects.length;

    // Check if student already exists via Matching Engine or code
    const existingStudent =
      matchedStudent ||
      store.students.find(
        s =>
          s.code === customStudentCode.trim() ||
          (lead.assigned_student_code && s.code === lead.assigned_student_code)
      );

    // Ensure 1 student has strictly 1 unique student code across all terms
    const studentCode = existingStudent
      ? existingStudent.code
      : customStudentCode.trim() || generateStudentCode(lead.is_royal_student, store.students);
    const studentId = existingStudent ? existingStudent.id : `std_${Date.now()}`;
    const finalMedicalNotes = mergedMedicalNotes.trim() || existingStudent?.medical_notes || lead.medical_notes;

    let newStudent: Student | null = null;
    if (!existingStudent) {
      const targetCampusId: 'pmh' | 'pl' =
        lead.desired_campus_id === 'camp_pl' || lead.desired_campus_id === 'pl' ? 'pl' : 'pmh';
      const regularCls = lead.student_grade || (lead.is_royal_student ? 'Royal Primary' : 'Ngoài trường');
      newStudent = {
        id: studentId,
        code: studentCode,
        name: lead.student_name.trim(),
        dob: lead.student_dob,
        birth_date: lead.student_dob,
        gender: 'Nam',
        campus_id: targetCampusId,
        student_type: lead.is_royal_student ? 'royal' : 'external',
        has_snack: lead.is_royal_student,
        parent_name: lead.parent_name.trim(),
        parent_phone: lead.parent_phone.trim(),
        school_name: lead.is_royal_student
          ? targetCampusId === 'pl'
            ? 'Royal School Phú Lâm'
            : 'Royal School PMH'
          : lead.current_school || 'Trường ngoài',
        regular_class: regularCls,
        class_name: regularCls,
        is_royal_student: lead.is_royal_student,
        medical_notes: finalMedicalNotes,
        status: 'active',
        created_at: new Date().toISOString().split('T')[0],
      };
    }

    // 2. Tạo bản ghi ghi danh (enrollments) & 3. Tạo hóa đơn học phí (invoices) theo đúng số buổi thực học
    const existingEnrollmentsForStudent = store.enrollments.filter(e => e.student_id === studentId);
    const newEnrollments: Enrollment[] = [];
    const newInvoices: TuitionInvoice[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    selectedClassObjects.forEach((cls, idx) => {
      const classDays = getClassDaysOfWeek(cls, store);
      const chosenDays = subjectEnrolledDays[cls.subject_id] && subjectEnrolledDays[cls.subject_id].length > 0
        ? subjectEnrolledDays[cls.subject_id]
        : classDays;
      const startDate = subjectStartDates[cls.subject_id] || getDefaultClassStartDate(cls, store, undefined, chosenDays);
      const autoCalc = calculateRemainingSessions(cls, startDate, store, chosenDays);
      const effectiveSessions = subjectCustomSessions[cls.subject_id] ?? autoCalc.remainingSessions;
      const pricing = calculateClassProratedPricing(cls, effectiveSessions, lead.is_royal_student, store);
      const isTrial = subjectEnrollmentTypes[cls.subject_id] === 'trial';
      const subObj = store.subjects.find(s => s.id === cls.subject_id);
      const subShortName = (subObj?.name || cls.name).split('(')[0].trim();
      const scheduleLabel = formatStudentScheduleLabel(autoCalc.enrolledDaysOfWeek, autoCalc.daysOfWeek);

      const alreadyInClass = existingEnrollmentsForStudent.some(
        e => e.class_id === cls.id && (e.status === 'active' || e.status === 'trial')
      );
      if (!alreadyInClass) {
        newEnrollments.push({
          id: `enr_${Date.now()}_${idx}`,
          student_id: studentId,
          class_id: cls.id,
          registered_sessions: pricing.effectiveSessions,
          joined_date: startDate,
          enrolled_days_of_week: autoCalc.enrolledDaysOfWeek,
          is_partial_schedule: autoCalc.isPartialSchedule,
          status: isTrial ? 'trial' : 'active',
          is_trial: isTrial,
          trial_session_date: isTrial ? startDate : undefined,
          trial_attended: false,
          trial_notes: isTrial
            ? `Đăng ký học thử 1 buổi đầu tiên từ ngày ${formatDateVN(startDate)} (${scheduleLabel} • ${pricing.effectiveSessions}/${pricing.totalSessions} buổi)`
            : undefined,
        });
      }

      // Check if invoice for this class and student already exists
      const alreadyInvoiced = store.invoices.some(
        inv => inv.student_id === studentId && inv.class_id === cls.id && inv.payment_status !== 'cancelled'
      );
      if (!alreadyInvoiced) {
        const proratedNote = autoCalc.isPartialSchedule
          ? `Học phí môn ${subShortName} - Lịch học riêng: [${scheduleLabel}] (${pricing.effectiveSessions} buổi x ${formatVND(pricing.sessionRate)}/buổi)`
          : pricing.isMidCourse
          ? `Tính học phí giữa khóa: ${pricing.effectiveSessions}/${pricing.totalSessions} buổi (Từ ngày ${formatDateVN(startDate)})`
          : `Học phí trọn khóa: ${pricing.totalSessions}/${pricing.totalSessions} buổi (${formatDaysListLabel(autoCalc.daysOfWeek)})`;

        newInvoices.push({
          id: `inv_${Date.now()}_${idx}`,
          invoice_code: `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}${idx + 1}`,
          student_id: studentId,
          class_id: cls.id,
          gross_amount: pricing.proratedGrossFee,
          discount_amount: pricing.discountAmount,
          credit_deducted: 0,
          net_payable: pricing.netPayable,
          paid_amount: 0,
          outstanding_amount: pricing.netPayable,
          payment_status: 'unpaid',
          is_trial_pending: isTrial,
          trial_fee: 0,
          registered_sessions: pricing.effectiveSessions,
          total_class_sessions: pricing.totalSessions,
          session_rate: pricing.sessionRate,
          start_date: startDate,
          enrolled_days_of_week: autoCalc.enrolledDaysOfWeek,
          is_partial_schedule: autoCalc.isPartialSchedule,
          is_prorated: pricing.isMidCourse || autoCalc.isPartialSchedule,
          prorated_note: proratedNote,
          created_at: todayStr,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });
      }
    });

    // 4. Cập nhật trạng thái đơn đăng ký (parentRegistrations)
    const totalFulfilled = assignedCount + alreadyEnrolledSubjectsCount;
    const isFullEnrollment = totalFulfilled >= totalRequested && totalRequested > 0;
    const isPartialEnrollment = totalFulfilled > 0 && totalFulfilled < totalRequested;
    const newStatus: 'enrolled' | 'partially_enrolled' | 'contacted' = isFullEnrollment
      ? 'enrolled'
      : isPartialEnrollment
      ? 'partially_enrolled'
      : 'contacted';

    const assignedNames = selectedClassObjects.map(c => c.name).join(', ');
    const unassignedSubjectsList = subjects
      .filter(s => subjectAssignModes[s.subject_id] === 'unassigned')
      .map(s => {
        const reason = unassignedReasons[s.subject_id] ? ` [Lý do: ${unassignedReasons[s.subject_id]}]` : '';
        return `${s.subject_name}${reason}`;
      })
      .join('; ');

    let updatedNote = '';
    if (existingStudent) {
      updatedNote = `Đã gộp vào hồ sơ học viên hiện tại [${studentCode} - ${existingStudent.name}]. Thêm ${assignedCount}/${newRequestedSubjectsCount || totalRequested} môn mới: ${assignedNames || 'Không phát sinh lớp mới'}. ${enrollNote}`;
    } else if (newStatus === 'enrolled') {
      updatedNote = `Đã phân bổ đủ ${assignedCount}/${totalRequested} môn: ${assignedNames} (Mã HV: ${studentCode}). ${enrollNote}`;
    } else if (newStatus === 'partially_enrolled') {
      updatedNote = `Đã phân bổ ${assignedCount}/${totalRequested} môn: ${assignedNames}. Chờ mở lớp: ${unassignedSubjectsList} (Mã HV: ${studentCode}). ${enrollNote}`;
    } else {
      updatedNote = `Đã tiếp nhận hồ sơ & cấp Mã HV: ${studentCode}. Toàn bộ ${totalRequested} môn chuyển danh sách Chờ xếp lớp: ${unassignedSubjectsList}. ${enrollNote}`;
    }

    const staffName = currentUser?.full_name || 'Chuyên viên Tuyển sinh';
    const auditDescription = existingStudent
      ? `Tuyển sinh ${staffName} đã tiếp nhận đơn ${lead.registration_code || lead.id} và gộp môn học mới vào học sinh hiện tại [${studentCode} - ${existingStudent.name}]`
      : `Tiếp nhận đơn ${lead.registration_code || lead.id}: Xếp ${assignedCount}/${totalRequested} môn cho học sinh mới ${lead.student_name.trim()} (Mã HV: ${studentCode})`;

    const assignLog = createAuditRecord(
      'CLASS_ASSIGN',
      'ACADEMIC',
      existingStudent ? 'Gộp Môn Học Vào Học Viên Hiện Tại' : 'Xếp lớp Đa môn Tuyển sinh',
      auditDescription,
      currentUser || null,
      {
        target_id: lead.registration_code || lead.id,
        details: {
          status: 'success',
          after: {
            registration_code: lead.registration_code || lead.id,
            linked_student_id: studentId,
            student_code: studentCode,
            is_existing_student_merge: Boolean(existingStudent),
            assigned_classes: selectedClassIds,
            status: newStatus,
            enrollments_count: newEnrollments.length,
            invoices_count: newInvoices.length,
          }
        }
      }
    );

    const existingEnrolledClassIds = matchRes.enrolledClasses.map(c => c.id);
    const mergedClassIds = Array.from(
      new Set([...(lead.assigned_class_ids || []), ...existingEnrolledClassIds, ...selectedClassIds])
    );

    onUpdateStore(prev => ({
      ...prev,
      students: newStudent 
        ? [newStudent, ...prev.students] 
        : prev.students.map(s => 
            s.id === studentId 
              ? {
                  ...s,
                  medical_notes: finalMedicalNotes || s.medical_notes,
                  parent_phone: lead.parent_phone?.trim() || s.parent_phone,
                  regular_class: s.regular_class || lead.student_grade,
                }
              : s
          ),
      enrollments: [...newEnrollments, ...prev.enrollments],
      invoices: [...newInvoices, ...prev.invoices],
      parentRegistrations: prev.parentRegistrations.map(r => 
        r.id === lead.id 
          ? { 
              ...r, 
              status: newStatus,
              student_id: studentId,
              assigned_student_id: studentId,
              linked_student_id: studentId,
              assigned_class_id: selectedClassObjects[0]?.id || r.assigned_class_id,
              assigned_class_ids: mergedClassIds,
              assigned_student_code: studentCode,
              contact_notes: updatedNote,
            } 
          : r
      ),
      auditLogs: [assignLog, ...(prev.auditLogs || [])],
    }));

    if (existingStudent) {
      showToast(
        `Đã gộp thêm ${assignedCount} môn mới vào hồ sơ học sinh hiện tại ${existingStudent.name} (${studentCode})!`,
        'success',
        { title: 'Tích hợp học viên hiện tại thành công' }
      );
    } else if (newStatus === 'enrolled') {
      showToast(`Đã phân bổ đủ ${assignedCount}/${totalRequested} môn & cấp mã học viên ${studentCode}!`);
    } else if (newStatus === 'partially_enrolled') {
      showToast(`Đã phân bổ ${assignedCount}/${totalRequested} môn (Trạng thái: Đã xếp một phần). Cấp mã học viên ${studentCode}!`);
    } else {
      showToast(`Đã tiếp nhận hồ sơ & cấp mã học viên ${studentCode}. Toàn bộ môn chuyển sang danh sách Chờ xếp lớp!`);
    }
    setSelectedLeadForEnroll(null);
  };

  // Open Contact Notes Modal
  const handleOpenContactModal = (lead: ParentRegistration) => {
    setEditingLeadContact(lead);
    setContactNoteInput(lead.contact_notes || '');
    setContactStatusInput(lead.status === 'enrolled' ? 'contacted' : lead.status);
  };

  // Save Contact Note
  const handleSaveContactNote = () => {
    if (!editingLeadContact) return;

    onUpdateStore(prev => ({
      ...prev,
      parentRegistrations: prev.parentRegistrations.map(r => 
        r.id === editingLeadContact.id 
          ? { 
              ...r, 
              status: contactStatusInput as any, 
              contact_notes: contactNoteInput.trim() || undefined 
            } 
          : r
      ),
    }));

    showToast('Đã cập nhật tiến độ tư vấn hồ sơ tuyển sinh!');
    setEditingLeadContact(null);
  };

  // ============================================================================
  // XẾP LỚP NHANH HÀNG LOẠT 1-CHẠM (BULK 1-CLICK QUICK ASSIGNMENT)
  // ============================================================================
  const eligibleLeadsForBulk = filteredLeads.filter(lead => {
    if (lead.status === 'enrolled' || lead.status === 'canceled') return false;
    const matchRes = matchLeadWithDatabase(lead, store);
    if (matchRes.isDuplicateSpam) return false;
    return true;
  });

  const isAllEligibleSelected =
    eligibleLeadsForBulk.length > 0 &&
    eligibleLeadsForBulk.every(l => selectedLeadIdsForBulk.includes(l.id));

  const toggleSelectLeadForBulk = (leadId: string) => {
    setSelectedLeadIdsForBulk(prev =>
      prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
    );
  };

  const handleSelectAllEligibleLeads = () => {
    if (isAllEligibleSelected) {
      setSelectedLeadIdsForBulk([]);
    } else {
      setSelectedLeadIdsForBulk(eligibleLeadsForBulk.map(l => l.id));
    }
  };

  // Compute preview items for Bulk Quick Assignment Modal (accounting for virtual seat increments across batch)
  const computeBulkQuickPreview = () => {
    const virtualSeatAdjustments: Record<string, number> = {};
    const selectedLeads = store.parentRegistrations.filter(r =>
      selectedLeadIdsForBulk.includes(r.id)
    );

    return selectedLeads.map((lead, idx) => {
      const smart = autoMatchClasses(lead, virtualSeatAdjustments, false);
      const matchedClassesList: {
        subjectId: string;
        subjectName: string;
        cls: ExtracurricularClass;
        daysLabel: string;
        effectiveSessions: number;
        totalSessions: number;
        sessionRate: number;
        netPayable: number;
        startDate: string;
        enrolledDays: string[];
      }[] = [];

      const unassignedSubjectsList: {
        subjectId: string;
        subjectName: string;
        reason: string;
      }[] = [];

      const alreadyEnrolledSubjectsList: {
        subjectId: string;
        subjectName: string;
        className: string;
      }[] = [];

      smart.subjects.forEach(sub => {
        const mode = smart.modesMap[sub.subject_id];
        const clsId = smart.assignedMap[sub.subject_id];
        if (mode === 'already_enrolled' && clsId) {
          const clsObj = store.classes.find(c => c.id === clsId);
          alreadyEnrolledSubjectsList.push({
            subjectId: sub.subject_id,
            subjectName: sub.subject_name || sub.subject_id,
            className: clsObj?.name || 'Lớp hiện tại',
          });
        } else if (mode === 'assign_now' && clsId) {
          const clsObj = store.classes.find(c => c.id === clsId);
          if (clsObj) {
            // Increment virtual seat count for subsequent leads in the same batch
            virtualSeatAdjustments[clsObj.id] = (virtualSeatAdjustments[clsObj.id] || 0) + 1;
            const days = smart.enrolledDaysMap[sub.subject_id] || getClassDaysOfWeek(clsObj, store);
            const startDate =
              smart.startDatesMap[sub.subject_id] ||
              getDefaultClassStartDate(clsObj, store, undefined, days);
            const autoCalc = calculateRemainingSessions(clsObj, startDate, store, days);
            const pricing = calculateClassProratedPricing(
              clsObj,
              autoCalc.remainingSessions,
              lead.is_royal_student,
              store
            );
            matchedClassesList.push({
              subjectId: sub.subject_id,
              subjectName: sub.subject_name || sub.subject_id,
              cls: clsObj,
              daysLabel: days.join('-'),
              effectiveSessions: pricing.effectiveSessions,
              totalSessions: pricing.totalSessions,
              sessionRate: pricing.sessionRate,
              netPayable: pricing.netPayable,
              startDate,
              enrolledDays: autoCalc.enrolledDaysOfWeek,
            });
          }
        } else {
          unassignedSubjectsList.push({
            subjectId: sub.subject_id,
            subjectName: sub.subject_name || sub.subject_id,
            reason: smart.reasonsMap[sub.subject_id] || 'Kín sĩ số / Chờ mở lớp',
          });
        }
      });

      const totalNetFee = matchedClassesList.reduce((sum, item) => sum + item.netPayable, 0);
      const totalRequested = smart.subjects.length;
      const totalFulfilled = matchedClassesList.length + alreadyEnrolledSubjectsList.length;

      return {
        lead,
        index: idx,
        matchedStudent: smart.matchRes.matchedStudent,
        matchedClassesList,
        unassignedSubjectsList,
        alreadyEnrolledSubjectsList,
        totalRequested,
        totalFulfilled,
        totalNetFee,
      };
    });
  };

  // Execute Bulk 1-Click Approval for all selected leads
  const handleConfirmBulkQuickAssign = () => {
    const previews = computeBulkQuickPreview();
    if (previews.length === 0) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const staffName = currentUser?.full_name || 'Chuyên viên Tuyển sinh';

    onUpdateStore(prev => {
      let updatedStudents = [...prev.students];
      let updatedEnrollments = [...prev.enrollments];
      let updatedInvoices = [...prev.invoices];
      let updatedRegistrations = [...prev.parentRegistrations];
      let updatedAuditLogs = [...(prev.auditLogs || [])];

      previews.forEach((item, leadIdx) => {
        const {
          lead,
          matchedStudent,
          matchedClassesList,
          unassignedSubjectsList,
          alreadyEnrolledSubjectsList,
          totalRequested,
          totalFulfilled,
        } = item;

        // Check if student already exists in updatedStudents (including newly created in earlier iterations of this batch)
        const existingStudent =
          matchedStudent ||
          updatedStudents.find(
            s =>
              (lead.assigned_student_code && s.code === lead.assigned_student_code) ||
              (s.parent_phone.replace(/\D/g, '') === lead.parent_phone.replace(/\D/g, '') &&
                s.name.trim().toLowerCase() === lead.student_name.trim().toLowerCase())
          );

        const studentCode = existingStudent
          ? existingStudent.code
          : lead.assigned_student_code || generateStudentCode(lead.is_royal_student, updatedStudents);
        const studentId = existingStudent ? existingStudent.id : `std_bulk_${Date.now()}_${leadIdx}`;

        if (!existingStudent) {
          const newStudentObj: Student = {
            id: studentId,
            code: studentCode,
            name: lead.student_name.trim(),
            dob: lead.student_dob,
            gender: 'Nam',
            parent_name: lead.parent_name.trim(),
            parent_phone: lead.parent_phone.trim(),
            school_name: lead.is_royal_student ? 'Royal School' : 'Trường ngoài',
            regular_class: lead.student_grade || (lead.is_royal_student ? 'Royal Primary' : 'Ngoài trường'),
            is_royal_student: lead.is_royal_student,
            medical_notes: lead.medical_notes,
            status: 'active',
            created_at: todayStr,
          };
          updatedStudents = [newStudentObj, ...updatedStudents];
        } else if (lead.medical_notes) {
          updatedStudents = updatedStudents.map(s =>
            s.id === studentId
              ? {
                  ...s,
                  medical_notes: mergeMedicalNotes(s.medical_notes, lead.medical_notes),
                }
              : s
          );
        }

        // Create Enrollments & Campus-rate Invoices (0 discount)
        matchedClassesList.forEach((mCls, cIdx) => {
          const alreadyInClass = updatedEnrollments.some(
            e => e.student_id === studentId && e.class_id === mCls.cls.id && (e.status === 'active' || e.status === 'trial')
          );
          if (!alreadyInClass) {
            updatedEnrollments.push({
              id: `enr_bulk_${Date.now()}_${leadIdx}_${cIdx}`,
              student_id: studentId,
              class_id: mCls.cls.id,
              registered_sessions: mCls.effectiveSessions,
              joined_date: mCls.startDate,
              enrolled_days_of_week: mCls.enrolledDays,
              is_partial_schedule: false,
              status: 'active',
              is_trial: false,
            });
          }

          const alreadyInvoiced = updatedInvoices.some(
            inv => inv.student_id === studentId && inv.class_id === mCls.cls.id && inv.payment_status !== 'cancelled'
          );
          if (!alreadyInvoiced) {
            updatedInvoices.push({
              id: `inv_bulk_${Date.now()}_${leadIdx}_${cIdx}`,
              invoice_code: `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-3)}${leadIdx}${cIdx}`,
              student_id: studentId,
              class_id: mCls.cls.id,
              gross_amount: mCls.netPayable,
              discount_amount: 0,
              credit_deducted: 0,
              net_payable: mCls.netPayable,
              paid_amount: 0,
              outstanding_amount: mCls.netPayable,
              payment_status: 'unpaid',
              is_trial_pending: false,
              trial_fee: 0,
              registered_sessions: mCls.effectiveSessions,
              total_class_sessions: mCls.totalSessions,
              session_rate: mCls.sessionRate,
              start_date: mCls.startDate,
              enrolled_days_of_week: mCls.enrolledDays,
              is_partial_schedule: false,
              is_prorated: mCls.effectiveSessions < mCls.totalSessions,
              prorated_note: `Xếp lớp nhanh tự động: ${mCls.effectiveSessions}/${mCls.totalSessions} buổi × ${formatVND(mCls.sessionRate)}/buổi`,
              created_at: todayStr,
              due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            });
          }
        });

        const isFull = totalFulfilled >= totalRequested && totalRequested > 0;
        const isPartial = totalFulfilled > 0 && totalFulfilled < totalRequested;
        const newStatus: 'enrolled' | 'partially_enrolled' | 'contacted' = isFull
          ? 'enrolled'
          : isPartial
          ? 'partially_enrolled'
          : 'contacted';

        const matchedDesc = matchedClassesList.map(m => `${m.cls.name} (${m.daysLabel})`).join(', ');
        const unassignedDesc = unassignedSubjectsList.map(u => `${u.subjectName} [${u.reason}]`).join('; ');

        const noteSummary =
          newStatus === 'enrolled'
            ? `[Xếp Lớp Nhanh 1-Chạm] Đã khớp đủ ${totalFulfilled}/${totalRequested} môn: ${matchedDesc} (Mã HV: ${studentCode}).`
            : newStatus === 'partially_enrolled'
            ? `[Xếp Lớp Nhanh 1-Chạm] Đã khớp ${totalFulfilled}/${totalRequested} môn: ${matchedDesc}. Chờ xếp: ${unassignedDesc} (Mã HV: ${studentCode}).`
            : `[Xếp Lớp Nhanh 1-Chạm] Đã cấp Mã HV ${studentCode}. Chờ mở lớp cho: ${unassignedDesc}.`;

        const mergedClassIds = Array.from(
          new Set([
            ...(lead.assigned_class_ids || []),
            ...matchedClassesList.map(m => m.cls.id),
          ])
        );

        updatedRegistrations = updatedRegistrations.map(r =>
          r.id === lead.id
            ? {
                ...r,
                status: newStatus,
                student_id: studentId,
                assigned_student_id: studentId,
                linked_student_id: studentId,
                assigned_class_id: matchedClassesList[0]?.cls.id || r.assigned_class_id,
                assigned_class_ids: mergedClassIds,
                assigned_student_code: studentCode,
                contact_notes: noteSummary,
              }
            : r
        );

        const logItem = createAuditRecord(
          'CLASS_ASSIGN',
          'ACADEMIC',
          'Xếp Lớp Nhanh Hàng Loạt (1-Click Smart Match)',
          `Chuyên viên ${staffName} đã xếp lớp nhanh cho hồ sơ ${lead.registration_code || lead.id} (${lead.student_name.trim()} - Mã HV: ${studentCode}): Khớp ${matchedClassesList.length + alreadyEnrolledSubjectsList.length}/${totalRequested} môn.`,
          currentUser || null,
          {
            target_id: lead.registration_code || lead.id,
            details: {
              status: 'success',
              student_code: studentCode,
              matched_classes: matchedClassesList.map(m => m.cls.id),
            },
          }
        );
        updatedAuditLogs = [logItem, ...updatedAuditLogs];
      });

      return {
        ...prev,
        students: updatedStudents,
        enrollments: updatedEnrollments,
        invoices: updatedInvoices,
        parentRegistrations: updatedRegistrations,
        auditLogs: updatedAuditLogs,
      };
    });

    const totalEnrolledLeads = previews.length;
    const totalMatchedClasses = previews.reduce((acc, p) => acc + p.matchedClassesList.length, 0);

    showToast(
      `Đã phê duyệt & xếp lớp nhanh thành công cho ${totalEnrolledLeads} hồ sơ (${totalMatchedClasses} lượt phân lớp & sinh hóa đơn tự động)!`,
      'success',
      { title: '⚡ Hoàn tất Xếp Lớp Nhanh Hàng Loạt' }
    );

    setIsBulkQuickModalOpen(false);
    setSelectedLeadIdsForBulk([]);
  };

  return (
    <div className="space-y-6">

      {/* TOP HEADER & ACTION BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
              HỒ SƠ TIẾP NHẬN TUYỂN SINH (LEADS)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold">
              Tuyển sinh ngoại khóa
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Phụ huynh đăng ký môn học và khung giờ từ Cổng Phụ Huynh. Chuyên viên Tuyển sinh & Giáo vụ liên hệ xác nhận và 1-chạm xếp lớp.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Nút Làm Mới từ CSDL Supabase */}
          <button
            onClick={() => fetchLeadsFromSupabase(true)}
            disabled={isRefreshingFromSupabase}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            title="Tải lại danh sách đơn đăng ký trực tiếp từ bảng parent_registrations trên Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshingFromSupabase ? 'animate-spin' : ''}`} />
            <span>{isRefreshingFromSupabase ? 'Đang tải...' : 'Làm Mới Supabase'}</span>
            {lastSupabaseSyncTime && (
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">({lastSupabaseSyncTime})</span>
            )}
          </button>

          {/* Nút Sao Chép Link Đăng Ký */}
          <button
            onClick={handleCopyShareLink}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
            title="Sao chép đường link Cổng Phụ Huynh để gửi qua Zalo/Email cho phụ huynh"
          >
            <Share2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Sao Chép Link Gửi Phụ Huynh</span>
          </button>

          {/* Nút Mở Trang Riêng Trong Tab Mới */}
          <a
            href="?portal=parent"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
            title="Mở giao diện Cổng Đăng Ký Phụ Huynh toàn màn hình trong tab mới"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mở Trang Riêng (Tab mới)</span>
          </a>

          {onOpenParentPortal && (
            <button
              onClick={onOpenParentPortal}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all transform active:scale-95"
              title="Mở Cổng Phụ Huynh dạng popup để kiểm tra hoặc đăng ký hộ"
            >
              <Send className="w-3.5 h-3.5 text-slate-950" />
              <span>Cổng Phụ Huynh (Popup)</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI METRICS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng Đơn Nhận</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1.5">{totalLeads}</div>
          <p className="text-[10px] text-slate-500 mt-0.5">Tất cả hồ sơ tiếp nhận</p>
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Chờ Xử Lý</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1.5">{pendingLeads}</div>
          <p className="text-[10px] text-amber-300/80 mt-0.5">Cần liên hệ trong 24h</p>
        </div>

        <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">Đã Tư Vấn</span>
            <PhoneCall className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-400 mt-1.5">{contactedLeads}</div>
          <p className="text-[10px] text-cyan-300/80 mt-0.5">Đang chờ xác nhận lớp</p>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Đã Xếp Lớp</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1.5">{enrolledLeads}</div>
          <p className="text-[10px] text-emerald-300/80 mt-0.5">Đã thành học viên chính thức</p>
        </div>
      </div>

      {/* FILTER & SEARCH BAR + BULK 1-CLICK QUICK ACTION BAR */}
      <div className="space-y-3">
        <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search box */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm theo mã REG, tên học sinh, phụ huynh, SĐT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-xs"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-medium focus:outline-none focus:border-amber-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Chờ xử lý</option>
              <option value="contacted">Đã tư vấn</option>
              <option value="enrolled">Đã xếp đủ lớp</option>
              <option value="partially_enrolled">Đã xếp một phần</option>
              <option value="canceled">Đã hủy</option>
            </select>

            {/* Campus filter */}
            <select
              value={campusFilter}
              onChange={(e) => setCampusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-medium focus:outline-none focus:border-amber-500"
            >
              <option value="all">Tất cả cơ sở</option>
              {store.campuses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Subject filter */}
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-medium focus:outline-none focus:border-amber-500"
            >
              <option value="all">Tất cả môn học</option>
              {store.subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {eligibleLeadsForBulk.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllEligibleLeads}
                className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isAllEligibleSelected
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                }`}
                title="Chọn hoặc bỏ chọn tất cả hồ sơ đang chờ xếp lớp"
              >
                {isAllEligibleSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Chọn tất cả chờ xếp ({eligibleLeadsForBulk.length})</span>
              </button>
            )}

            {selectedLeadIdsForBulk.length > 0 && (
              <button
                type="button"
                onClick={() => setIsBulkQuickModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/25 transition-all transform active:scale-95 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />
                <span>⚡ Xếp Lớp Nhanh Cho ({selectedLeadIdsForBulk.length}) Hồ Sơ Đã Chọn</span>
              </button>
            )}

            <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          </div>

        </div>

        {/* Floating Bulk Selection Highlight Bar when items are checked */}
        {selectedLeadIdsForBulk.length > 0 && (
          <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-slate-900 to-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs animate-fadeIn">
            <div className="flex items-center gap-2 text-amber-200">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Đang chọn <strong className="text-amber-300 font-black">{selectedLeadIdsForBulk.length}</strong> hồ sơ tuyển sinh để chạy thuật toán <strong>Xếp Lớp Nhanh Tự Động (1-Click Smart Matching)</strong>.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedLeadIdsForBulk([])}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold cursor-pointer"
              >
                Bỏ chọn
              </button>
              <button
                type="button"
                onClick={() => setIsBulkQuickModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 fill-slate-950" />
                <span>Chạy Khớp Lớp & Xem Trước ({selectedLeadIdsForBulk.length})</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RESULTS LIST / QUEUE */}
      {filteredLeads.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 text-slate-400 space-y-3">
          <Users className="w-10 h-10 mx-auto text-slate-600" />
          <p className="text-sm font-semibold">Không tìm thấy hồ sơ tuyển sinh nào phù hợp bộ lọc.</p>
          <button
            onClick={() => { setSearchTerm(''); setStatusFilter('all'); setCampusFilter('all'); setSubjectFilter('all'); }}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-400"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLeads.map(lead => {
            const campus = store.campuses.find(c => c.id === lead.desired_campus_id);
            const subject = store.subjects.find(s => s.id === lead.desired_subject_id);
            const assignedClass = lead.assigned_class_id ? store.classes.find(c => c.id === lead.assigned_class_id) : null;
            const matchRes = matchLeadWithDatabase(lead, store);
            const matchedStudent = matchRes.matchedStudent;
            const shortStudentName = matchedStudent
              ? matchedStudent.name.trim().split(/\s+/).slice(-2).join(' ')
              : '';
            const isEligibleBulk = lead.status !== 'enrolled' && lead.status !== 'canceled' && !matchRes.isDuplicateSpam;
            const isSelectedBulk = selectedLeadIdsForBulk.includes(lead.id);

            return (
              <div 
                key={lead.id}
                className={`rounded-3xl p-5 bg-gradient-to-b from-[#111827] to-[#0D131F] border transition-all flex flex-col justify-between shadow-xl shadow-black/30 space-y-4 ${
                  isSelectedBulk
                    ? 'border-amber-400 ring-2 ring-amber-500/30'
                    : matchRes.isDuplicateSpam && lead.status !== 'canceled'
                    ? 'border-rose-500/50 hover:border-rose-400'
                    : matchedStudent && lead.status !== 'enrolled' && lead.status !== 'canceled'
                    ? 'border-indigo-500/50 hover:border-indigo-400'
                    : 'border-slate-800/80 hover:border-amber-500/40'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-start gap-2.5">
                      {isEligibleBulk && (
                        <button
                          type="button"
                          onClick={() => toggleSelectLeadForBulk(lead.id)}
                          className="mt-0.5 text-amber-400 hover:text-amber-300 cursor-pointer shrink-0"
                          title="Chọn hồ sơ để Xếp lớp nhanh hàng loạt"
                        >
                          {isSelectedBulk ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500 hover:text-slate-300" />
                          )}
                        </button>
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-extrabold text-white text-base">{lead.student_name.trim()}</h4>
                          {lead.is_royal_student ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                              Royal (Bánh sữa)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">
                              Trường ngoài
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 font-mono">
                          <span className="text-amber-400 font-bold">{lead.registration_code || lead.id}</span>
                          <span>&bull;</span>
                          <span>{lead.student_grade || 'Sinh: ' + lead.student_dob}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {lead.status === 'enrolled' ? (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold flex items-center gap-1">
                          <Check className="w-3 h-3 stroke-[3]" />
                          <span>Đã Xếp Đủ</span>
                        </span>
                      ) : lead.status === 'partially_enrolled' ? (
                        <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-extrabold flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          <span>Xếp Một Phần</span>
                        </span>
                      ) : lead.status === 'contacted' ? (
                        <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-extrabold flex items-center gap-1">
                          <PhoneCall className="w-3 h-3" />
                          <span>Đã Tư Vấn</span>
                        </span>
                      ) : lead.status === 'canceled' ? (
                        <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 text-[10px]">
                          Đã Hủy
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-extrabold flex items-center gap-1 animate-pulse">
                          <Clock className="w-3 h-3" />
                          <span>Chờ Tiếp Nhận</span>
                        </span>
                      )}

                      {matchRes.isDuplicateSpam && lead.status !== 'canceled' && (
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-500/25 text-rose-200 border border-rose-500/50 text-[10px] font-black flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          <span>Đơn Trùng Lặp</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* SMART BADGE: EXISTING STUDENT IN DATABASE */}
                  {matchedStudent && (
                    <div className="mb-3 p-2.5 rounded-2xl bg-indigo-950/60 border border-indigo-500/40 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/25 text-indigo-200 border border-indigo-400/40 text-[11px] font-extrabold font-mono flex items-center gap-1">
                          <span>🔗 Đã Có Dữ Liệu: {matchedStudent.code} ({shortStudentName})</span>
                        </span>
                        <span className="text-[10px] font-bold text-cyan-300">
                          Độ tin cậy: {matchRes.confidence}%
                        </span>
                      </div>
                      {matchRes.enrolledClasses.length > 0 && (
                        <div className="text-[10px] text-teal-300 font-semibold">
                          Đang học: {matchRes.enrolledClasses.map(c => c.name).join(', ')}
                        </div>
                      )}
                      {lead.status !== 'enrolled' && lead.status !== 'canceled' && (
                        <p className="text-[10px] text-indigo-200/90 italic leading-snug">
                          * Hệ thống phát hiện học sinh này đã có hồ sơ trong trường. Khi duyệt sẽ tự động cập nhật vào học sinh cũ.
                        </p>
                      )}
                    </div>
                  )}

                  {/* SMART BADGE: SIBLING / NEW CHILD IN SAME FAMILY */}
                  {!matchedStudent && matchRes.matchType === 'sibling' && matchRes.siblingStudents.length > 0 && (
                    <div className="mb-3 p-2.5 rounded-2xl bg-cyan-950/50 border border-cyan-500/35 space-y-1">
                      <div className="text-[11px] font-bold text-cyan-300 flex items-center gap-1">
                        <span>👨‍👩‍👧‍👦 Học sinh mới cùng gia đình (Anh/Chị/Em)</span>
                      </div>
                      <p className="text-[10px] text-slate-300 leading-snug">
                        Chung SĐT phụ huynh với học viên <strong>{matchRes.siblingStudents.map(s => `${s.name} (${s.code})`).join(', ')}</strong>. Sẽ cấp Mã HV riêng và liên kết chung phụ huynh.
                      </p>
                    </div>
                  )}

                  {/* DUPLICATE SPAM WARNING BANNER */}
                  {matchRes.isDuplicateSpam && lead.status !== 'canceled' && (
                    <div className="mb-3 p-2.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 space-y-2 text-[11px]">
                      <div className="text-rose-200 font-semibold leading-snug">
                        ⚠️ <strong>Phát hiện gửi trùng 100%:</strong> {matchRes.duplicateReason}.
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelDuplicateLead(lead, matchRes.duplicateReferenceLead)}
                        className="w-full py-1.5 px-3 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 border border-rose-500/50 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5 text-rose-300" />
                        <span>Hủy Đơn Trùng Ngay</span>
                      </button>
                    </div>
                  )}

                  {/* Parent Details box */}
                  <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 mb-3 text-xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Phụ huynh:</span>
                      <span className="text-white font-bold">{lead.parent_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Điện thoại / Zalo:</span>
                      <a href={`tel:${lead.parent_phone}`} className="font-mono text-amber-400 font-bold hover:underline flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {lead.parent_phone}
                      </a>
                    </div>
                    {lead.parent_email && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">Email:</span>
                        <span className="text-slate-300 truncate max-w-[180px]">{lead.parent_email}</span>
                      </div>
                    )}
                  </div>

                  {/* Course Choice & Slot Preferences */}
                  <div className="text-xs space-y-2 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Cơ sở mong muốn:</span>
                      <span className="text-slate-200 font-medium">{campus?.name}</span>
                    </div>

                    {/* Multi-subject list */}
                    {(() => {
                      const subs = getSubjectsForLead(lead);
                      const totalFee = Number(lead.total_estimated_fee ?? lead.estimated_fee) || subs.reduce((sum, s) => sum + (s.estimated_fee || 0), 0);
                      return (
                        <div className="space-y-1.5 p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                          <div className="text-[11px] font-bold text-amber-300 flex items-center justify-between">
                            <span>Môn học đăng ký ({subs.length} môn):</span>
                            {totalFee > 0 && (
                              <span className="font-mono text-emerald-400 font-bold">{formatVND(totalFee)}</span>
                            )}
                          </div>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                            {subs.map((subItem, idx) => {
                              const assignedClassForSub = store.classes.find(
                                c => c.subject_id === subItem.subject_id && lead.assigned_class_ids?.includes(c.id)
                              );
                              const alreadyEnrolledInDb = matchRes.enrolledClasses.find(
                                c => c.subject_id === subItem.subject_id
                              );

                              return (
                                <div key={idx} className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 space-y-1 text-[11px]">
                                  <div className="flex items-center justify-between">
                                    <div className="font-bold text-white">{subItem.subject_name}</div>
                                    <span className="font-mono text-emerald-400 text-[10px] font-semibold">
                                      {formatVND(subItem.estimated_fee)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between flex-wrap gap-1 text-[10px]">
                                    <div className="text-slate-400 flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5 text-amber-400" />
                                      <span>{subItem.time_slot_label}</span>
                                    </div>
                                    {assignedClassForSub ? (
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                                        <span>Đã xếp: {assignedClassForSub.name}</span>
                                      </span>
                                    ) : alreadyEnrolledInDb ? (
                                      <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold flex items-center gap-1">
                                        <Check className="w-2.5 h-2.5 text-teal-400" />
                                        <span>Đã học: {alreadyEnrolledInDb.name}</span>
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1">
                                        <Clock className="w-2.5 h-2.5 text-amber-400" />
                                        <span>Chờ xếp lớp</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-slate-400">Suất bánh sữa 16:30:</span>
                      <span className={lead.is_royal_student ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {lead.is_royal_student ? 'Được phục vụ (Học sinh Royal)' : 'Không áp dụng'}
                      </span>
                    </div>

                    {/* Medical / Allergy note if any */}
                    {lead.medical_notes && (
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 font-medium">
                        <strong>Lưu ý y tế:</strong> {lead.medical_notes}
                      </div>
                    )}

                    {/* Notes from parent */}
                    {lead.notes && (
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 italic">
                        &ldquo;{lead.notes}&rdquo;
                      </div>
                    )}

                    {/* Staff contact notes if any */}
                    {lead.contact_notes && (
                      <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-300">
                        <strong>Ghi chú tư vấn:</strong> {lead.contact_notes}
                      </div>
                    )}

                    {/* Enrolled details if already enrolled or partially enrolled */}
                    {(lead.status === 'enrolled' || lead.status === 'partially_enrolled') && (
                      <div className={`p-2.5 rounded-xl border text-[11px] space-y-1.5 ${
                        lead.status === 'enrolled'
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                          : 'bg-indigo-500/10 border-indigo-500/25 text-indigo-300'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Mã học viên:</span>
                          <strong className="font-mono text-amber-300 font-bold">{lead.assigned_student_code}</strong>
                        </div>
                        {lead.assigned_class_ids && lead.assigned_class_ids.length > 0 ? (
                          <div className="pt-1 border-t border-slate-800/80">
                            <span className="text-slate-400 block text-[10px] font-semibold uppercase">
                              Lớp đã xếp ({lead.assigned_class_ids.length} môn):
                            </span>
                            <div className="space-y-0.5 mt-0.5">
                              {lead.assigned_class_ids.map(id => {
                                const c = store.classes.find(cls => cls.id === id);
                                return c ? (
                                  <div key={id} className="text-white font-medium text-[11px] flex items-center gap-1">
                                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                    <span>{c.name}</span>
                                  </div>
                                ) : null;
                              })}
                            </div>
                          </div>
                        ) : assignedClass ? (
                          <div>Lớp: <strong>{assignedClass.name}</strong></div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenContactModal(lead)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Cập nhật ghi chú tư vấn hoặc đổi trạng thái"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Ghi Chú</span>
                    </button>

                    <button
                      onClick={() => setRejectTargetLead(lead)}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Loại bỏ hồ sơ ảo / Hủy đơn"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Loại Bỏ</span>
                    </button>
                  </div>

                  {lead.status !== 'enrolled' && lead.status !== 'canceled' ? (
                    <button
                      onClick={() => handleOpenEnrollModal(lead, 'quick')}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md cursor-pointer ${
                        matchedStudent
                          ? 'bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-slate-950 shadow-teal-500/20'
                          : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/20'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 fill-slate-950" />
                      <span>
                        {matchedStudent
                          ? `Xếp Nhanh & Gộp (${matchedStudent.code})`
                          : lead.status === 'partially_enrolled'
                          ? '⚡ Xếp Lớp Bổ Sung'
                          : '⚡ Xếp Lớp Nhanh'}
                      </span>
                    </button>
                  ) : lead.status === 'canceled' ? (
                    <span className="text-slate-500 text-xs font-semibold">Đơn đã hủy</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Đã thành học viên</span>
                      </span>
                      {onNavigateToStudents && lead.assigned_student_code && (
                        <button
                          onClick={() => onNavigateToStudents(lead.assigned_student_code)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 transition-colors"
                          title="Chuyển tới Hồ Sơ Học Viên"
                        >
                          <span>Hồ sơ</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="rounded-3xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 pl-4 pr-2 w-9">
                    {eligibleLeadsForBulk.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSelectAllEligibleLeads}
                        className="text-amber-400 hover:text-amber-300 flex items-center justify-center cursor-pointer"
                        title="Chọn tất cả hồ sơ đủ điều kiện Xếp lớp nhanh"
                      >
                        {isAllEligibleSelected ? (
                          <CheckSquare className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 hover:text-slate-300" />
                        )}
                      </button>
                    )}
                  </th>
                  <th className="py-3 px-4">Mã Đơn / Ngày</th>
                  <th className="py-3 px-4">Học Sinh & Nhận Diện Hồ Sơ</th>
                  <th className="py-3 px-4">Môn Học</th>
                  <th className="py-3 px-4">Cơ Sở</th>
                  <th className="py-3 px-4">Phân Loại / Bánh Sữa</th>
                  <th className="py-3 px-4">Lưu Ý</th>
                  <th className="py-3 px-4">Phụ Huynh</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLeads.map(lead => {
                  const campus = store.campuses.find(c => c.id === lead.desired_campus_id);
                  const subject = store.subjects.find(s => s.id === lead.desired_subject_id);
                  const matchRes = matchLeadWithDatabase(lead, store);
                  const matchedStudent = matchRes.matchedStudent;
                  const shortStudentName = matchedStudent
                    ? matchedStudent.name.trim().split(/\s+/).slice(-2).join(' ')
                    : '';
                  const isEligibleBulk = lead.status !== 'enrolled' && lead.status !== 'canceled' && !matchRes.isDuplicateSpam;
                  const isSelectedBulk = selectedLeadIdsForBulk.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={`transition-colors ${
                        isSelectedBulk
                          ? 'bg-amber-500/10 hover:bg-amber-500/15'
                          : matchRes.isDuplicateSpam && lead.status !== 'canceled'
                          ? 'bg-rose-950/20 hover:bg-rose-950/30'
                          : matchedStudent && lead.status !== 'enrolled' && lead.status !== 'canceled'
                          ? 'bg-indigo-950/15 hover:bg-indigo-950/25'
                          : 'hover:bg-slate-800/30'
                      }`}
                    >
                      {/* 0. Checkbox chọn hàng loạt */}
                      <td className="py-3 pl-4 pr-2">
                        {isEligibleBulk ? (
                          <button
                            type="button"
                            onClick={() => toggleSelectLeadForBulk(lead.id)}
                            className="text-amber-400 hover:text-amber-300 flex items-center justify-center cursor-pointer"
                            title="Tích chọn để Xếp lớp nhanh hàng loạt"
                          >
                            {isSelectedBulk ? (
                              <CheckSquare className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600 hover:text-slate-300" />
                            )}
                          </button>
                        ) : (
                          <span className="w-4 h-4 block" />
                        )}
                      </td>

                      {/* 1. Mã Đơn / Ngày */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-amber-400 font-bold">{lead.registration_code || lead.id}</div>
                        <div className="text-[10px] text-slate-500">{lead.created_at.split('T')[0]}</div>
                        {matchRes.isDuplicateSpam && lead.status !== 'canceled' && (
                          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-extrabold">
                            ⚠️ Đơn Trùng Lặp
                          </span>
                        )}
                      </td>

                      {/* 2. Học Sinh & Smart Badge */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{lead.student_name.trim()}</div>
                        <div className="text-[10px] text-slate-400">{lead.student_grade || 'Sinh: ' + lead.student_dob}</div>

                        {matchedStudent && (
                          <div className="mt-1.5 space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 text-[10px] font-extrabold font-mono">
                              🔗 Đã Có Dữ Liệu: {matchedStudent.code} ({shortStudentName})
                            </span>
                            {lead.status !== 'enrolled' && lead.status !== 'canceled' && (
                              <div className="text-[10px] text-indigo-300/90 italic max-w-[260px] leading-tight">
                                * Phát hiện đã có hồ sơ ({matchRes.confidence}%). Khi duyệt sẽ tự động gộp vào học sinh cũ.
                              </div>
                            )}
                          </div>
                        )}

                        {!matchedStudent && matchRes.matchType === 'sibling' && matchRes.siblingStudents.length > 0 && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                              👨‍👩‍👧‍👦 Cùng gia đình với {matchRes.siblingStudents[0].code}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 3. Môn Học */}
                      <td className="py-3 px-4">
                        {(() => {
                          const subs = getSubjectsForLead(lead);
                          const totalFee = Number(lead.total_estimated_fee ?? lead.estimated_fee) || subs.reduce((sum, s) => sum + (s.estimated_fee || 0), 0);
                          return (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px]">
                                  {subs.length} môn đăng ký
                                </span>
                                {totalFee > 0 && (
                                  <span className="font-mono text-emerald-400 font-bold text-[11px]">
                                    {formatVND(totalFee)}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-300 font-medium">
                                {subs.map(s => s.subject_name).join(', ')}
                              </div>
                              {matchRes.enrolledClasses.length > 0 && (
                                <div className="text-[10px] text-teal-300 font-semibold mt-0.5">
                                  Đang học: {matchRes.enrolledClasses.map(c => c.name).join(', ')}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* 4. Cơ Sở */}
                      <td className="py-3 px-4 text-slate-300">
                        {campus?.name}
                      </td>

                      {/* 5. Phân Loại / Bánh Sữa */}
                      <td className="py-3 px-4">
                        {lead.is_royal_student ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold whitespace-nowrap">
                            Royal (Bánh sữa)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] whitespace-nowrap">
                            Ngoài trường
                          </span>
                        )}
                      </td>

                      {/* 6. Lưu Ý */}
                      <td className="py-3 px-4 text-[11px] max-w-[180px]">
                        {lead.medical_notes ? (
                          <span className="p-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 block break-words leading-snug" title={lead.medical_notes}>
                            {lead.medical_notes}
                          </span>
                        ) : (
                          <span className="text-slate-500">Bình thường</span>
                        )}
                        {lead.notes && (
                          <div className="text-[10px] text-slate-400 italic truncate mt-0.5" title={lead.notes}>
                            &ldquo;{lead.notes}&rdquo;
                          </div>
                        )}
                      </td>

                      {/* 7. Phụ Huynh */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{lead.parent_name}</div>
                        <a href={`tel:${lead.parent_phone}`} className="text-[11px] text-amber-400 font-mono font-bold hover:underline">
                          {lead.parent_phone}
                        </a>
                        {lead.parent_email && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{lead.parent_email}</div>
                        )}
                      </td>

                      {/* 8. Trạng Thái */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {lead.status === 'enrolled' ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold whitespace-nowrap">
                              Đã xếp đủ
                            </span>
                          ) : lead.status === 'partially_enrolled' ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-extrabold whitespace-nowrap">
                              Xếp một phần
                            </span>
                          ) : lead.status === 'contacted' ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold whitespace-nowrap">
                              Đã tư vấn
                            </span>
                          ) : lead.status === 'canceled' ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] whitespace-nowrap">
                              Đã hủy
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold whitespace-nowrap">
                              Chờ Tiếp Nhận
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 9. Thao Tác */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {matchRes.isDuplicateSpam && lead.status !== 'canceled' && (
                            <button
                              type="button"
                              onClick={() => handleCancelDuplicateLead(lead, matchRes.duplicateReferenceLead)}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-500/40 font-bold text-[10px] transition-colors whitespace-nowrap cursor-pointer"
                              title={matchRes.duplicateReason || 'Hủy đơn trùng lặp 100%'}
                            >
                              Hủy Đơn Trùng
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenContactModal(lead)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                            title="Cập nhật ghi chú tư vấn"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setRejectTargetLead(lead)}
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 hover:text-rose-300 text-xs transition-colors cursor-pointer shrink-0"
                            title="Loại bỏ hồ sơ ảo / Hủy đơn"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {lead.status !== 'enrolled' && lead.status !== 'canceled' ? (
                            <button
                              onClick={() => handleOpenEnrollModal(lead, 'quick')}
                              className={`px-2.5 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                                matchedStudent
                                  ? 'bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-slate-950'
                                  : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                              }`}
                            >
                              <Zap className="w-3 h-3 fill-slate-950 shrink-0" />
                              <span>
                                {matchedStudent
                                  ? `Xếp Nhanh & Gộp (${matchedStudent.code})`
                                  : lead.status === 'partially_enrolled'
                                  ? '+ Xếp bổ sung'
                                  : 'Xếp Lớp Nhanh'}
                              </span>
                            </button>
                          ) : lead.status === 'canceled' ? (
                            <span className="text-[10px] text-slate-500 italic">Đã hủy</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-emerald-400 text-[11px] font-bold font-mono">
                                {lead.assigned_student_code}
                              </span>
                              {onNavigateToStudents && lead.assigned_student_code && (
                                <button
                                  onClick={() => onNavigateToStudents(lead.assigned_student_code)}
                                  className="p-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-0.5 transition-colors"
                                  title="Xem tại Hồ Sơ Học Viên"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: TIẾP NHẬN & XẾP LỚP (CONVERT LEAD TO STUDENT)   */}
      {/* ======================================================== */}
      {selectedLeadForEnroll && (() => {
        const lead = selectedLeadForEnroll;
        const subjects = getSubjectsForLead(lead);

        // Calculate selected classes ONLY for subjects whose mode is 'assign_now'
        const activeAssignedEntries = Object.entries(assignedClassesBySubject).filter(([subId, classId]) => {
          const mode = subjectAssignModes[subId] ?? 'assign_now';
          return mode === 'assign_now' && Boolean(classId);
        });
        const selectedClassIds = activeAssignedEntries.map(([_, classId]) => classId);
        const selectedClassObjects = selectedClassIds
          .map(id => store.classes.find(c => c.id === id))
          .filter((c): c is ExtracurricularClass => Boolean(c));

        // Live Conflict Detection: Check if any 2 chosen classes have overlapping days & time
        interface ConflictWarning {
          classA: ExtracurricularClass;
          classB: ExtracurricularClass;
          commonDays: string[];
          timeSlotDesc: string;
        }

        const conflictList: ConflictWarning[] = [];
        for (let i = 0; i < selectedClassObjects.length; i++) {
          for (let j = i + 1; j < selectedClassObjects.length; j++) {
            const clsA = selectedClassObjects[i];
            const clsB = selectedClassObjects[j];

            const fullDaysA = getClassDaysOfWeek(clsA, store);
            const fullDaysB = getClassDaysOfWeek(clsB, store);
            const daysA = subjectEnrolledDays[clsA.subject_id] && subjectEnrolledDays[clsA.subject_id].length > 0
              ? subjectEnrolledDays[clsA.subject_id]
              : fullDaysA;
            const daysB = subjectEnrolledDays[clsB.subject_id] && subjectEnrolledDays[clsB.subject_id].length > 0
              ? subjectEnrolledDays[clsB.subject_id]
              : fullDaysB;

            const commonDays = daysA.filter(d => daysB.includes(d));
            if (commonDays.length > 0) {
              const slotA = store.timeSlots.find(ts => ts.id === clsA.time_slot_id);
              const slotB = store.timeSlots.find(ts => ts.id === clsB.time_slot_id);
              const isSameSlot = clsA.time_slot_id === clsB.time_slot_id;
              const isOverlap = slotA && slotB && (
                (slotA.start_time < slotB.end_time && slotA.end_time > slotB.start_time)
              );

              if (isSameSlot || isOverlap) {
                const timeDesc = slotA ? `${slotA.start_time} - ${slotA.end_time}` : 'Ca sau giờ học';
                conflictList.push({
                  classA: clsA,
                  classB: clsB,
                  commonDays,
                  timeSlotDesc: timeDesc,
                });
              }
            }
          }
        }

        // Real-time Prorated & Day-Specific Tuition Calculation across all assigned classes
        const assignedClassBreakdowns = selectedClassObjects.map(c => {
          const classDays = getClassDaysOfWeek(c, store);
          const enrolledDays = subjectEnrolledDays[c.subject_id] && subjectEnrolledDays[c.subject_id].length > 0
            ? subjectEnrolledDays[c.subject_id]
            : classDays;
          const startDate = subjectStartDates[c.subject_id] || getDefaultClassStartDate(c, store, undefined, enrolledDays);
          const autoCalc = calculateRemainingSessions(c, startDate, store, enrolledDays);
          const effectiveSessions = subjectCustomSessions[c.subject_id] ?? autoCalc.remainingSessions;
          const pricing = calculateClassProratedPricing(c, effectiveSessions, lead.is_royal_student, store);
          const subjectName = store.subjects.find(s => s.id === c.subject_id)?.name || c.name;
          const isTrial = subjectEnrollmentTypes[c.subject_id] === 'trial';
          return {
            cls: c,
            subjectName,
            startDate,
            enrolledDays: autoCalc.enrolledDaysOfWeek,
            classDays: autoCalc.daysOfWeek,
            isPartialSchedule: autoCalc.isPartialSchedule,
            autoCalc,
            pricing,
            isTrial,
          };
        });

        const totalFullGross = assignedClassBreakdowns.reduce((acc, item) => acc + item.pricing.fullCourseFee, 0);
        const totalGross = assignedClassBreakdowns.reduce((acc, item) => acc + item.pricing.proratedGrossFee, 0);
        const discountAmount = assignedClassBreakdowns.reduce((acc, item) => acc + item.pricing.discountAmount, 0);
        const totalNet = assignedClassBreakdowns.reduce((acc, item) => acc + item.pricing.netPayable, 0);
        const hasAnyProrated = assignedClassBreakdowns.some(item => item.pricing.isMidCourse || item.isPartialSchedule);

        const trialAssignedClasses = assignedClassBreakdowns.filter(item => item.isTrial);
        const officialAssignedClasses = assignedClassBreakdowns.filter(item => !item.isTrial);
        const trialAssignedCount = trialAssignedClasses.length;
        const officialAssignedCount = officialAssignedClasses.length;

        const immediatePayable = officialAssignedClasses.reduce((acc, item) => acc + item.pricing.netPayable, 0);
        const trialDeferredAmount = Math.max(0, totalNet - immediatePayable);

        const matchRes = matchLeadWithDatabase(lead, store);
        const matchedStudent = matchRes.matchedStudent;
        const alreadyEnrolledCount = subjects.filter(s => subjectAssignModes[s.subject_id] === 'already_enrolled').length;
        const totalRequested = subjects.length;
        const assignedCount = selectedClassObjects.length;
        const unassignedCount = Math.max(0, totalRequested - assignedCount - alreadyEnrolledCount);
        const isFull = (assignedCount + alreadyEnrolledCount) >= totalRequested && totalRequested > 0;
        const isPartial = (assignedCount + alreadyEnrolledCount) > 0 && (assignedCount + alreadyEnrolledCount) < totalRequested;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
            <div className="w-full max-w-3xl rounded-3xl bg-[#0D131F] border border-amber-500/40 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-fadeIn my-auto">
              
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                    matchedStudent
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base sm:text-lg font-black text-white">
                        {matchedStudent
                          ? 'Tiếp Nhận & Gộp Môn Học Vào Học Sinh Hiện Tại'
                          : 'Tiếp Nhận & Xếp Lớp Ghi Danh (Đa Môn)'}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/30">
                        {lead.registration_code || lead.id}
                      </span>
                      {matchedStudent && (
                        <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-200 font-mono text-[10px] font-extrabold border border-teal-500/40">
                          🔗 Hồ sơ gốc: {matchedStudent.code}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {matchedStudent
                        ? 'Đã nhận diện hồ sơ học viên hiện có trong trường — Giữ nguyên Mã HV & chỉ phân bổ thêm môn học mới'
                        : 'Phân bổ lớp học ngoại khóa & tự động tính học phí theo số buổi thực học khi vào giữa khóa'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedLeadForEnroll(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Đóng modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Modal Content */}
              <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
                
                {/* KHỐI NHẬN DIỆN HỒ SƠ CŨ (PROFILE LINKED BOX) KHI HỌC SINH ĐÃ TỒN TẠI */}
                {matchedStudent ? (
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-teal-950/70 via-slate-900 to-teal-950/40 border-2 border-teal-500/50 text-xs space-y-3 shadow-lg shadow-teal-950/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-teal-500/30">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-xl bg-teal-500/25 text-teal-200 border border-teal-400/40 font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-teal-300" />
                          <span>Đã Liên Kết Hồ Sơ Học Sinh Hiện Tại</span>
                        </span>
                        <span className="text-[11px] text-teal-300 font-semibold">
                          ({matchRes.matchCriteriaLabel})
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-bold text-[10px]">
                        Độ tin cậy: {matchRes.confidence}%
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-teal-500/30 space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Học sinh & Mã học viên cố định:
                        </span>
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-white text-sm">{matchedStudent.name}</strong>
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-black text-xs flex items-center gap-1">
                            <Lock className="w-3 h-3 text-amber-400" />
                            <span>{matchedStudent.code}</span>
                          </span>
                        </div>
                        <div className="text-[10px] text-teal-300/90 flex items-center justify-between pt-0.5">
                          <span>Lớp chính khóa: {matchedStudent.regular_class || lead.student_grade}</span>
                          <span>&bull; Khóa tạo mã mới (Chống trùng mã)</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/80 border border-teal-500/30 space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Các môn bé đang theo học tại trường:
                        </span>
                        {matchRes.enrolledClasses.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {matchRes.enrolledClasses.map(cls => (
                              <span
                                key={cls.id}
                                className="px-2.5 py-1 rounded-lg bg-teal-500/20 text-teal-200 border border-teal-500/40 font-bold text-[11px] flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3 text-teal-400 shrink-0" />
                                <span>Đang học: {cls.name}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-300 font-medium pt-0.5">
                            Đã có hồ sơ gốc trong hệ thống (Chưa có lớp ngoại khóa đang học trong học kỳ này)
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Kế thừa & Cập nhật Lưu ý y tế */}
                    <div className="p-3 rounded-xl bg-slate-950/90 border border-rose-500/30 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <label className="text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>Lưu ý y tế kế thừa từ hồ sơ cũ & cập nhật bổ sung:</span>
                        </label>
                        {matchedStudent.medical_notes && (
                          <span className="text-[10px] text-slate-400">
                            Lưu ý cũ: <strong className="text-slate-200">{matchedStudent.medical_notes}</strong>
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={mergedMedicalNotes}
                        onChange={(e) => setMergedMedicalNotes(e.target.value)}
                        placeholder="Nhập hoặc cập nhật thêm lưu ý dị ứng, sức khỏe của học sinh..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-rose-400"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 1. Lead Summary Info Card (Học sinh mới) */}
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 text-xs space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <span className="text-slate-400">Học sinh:</span>{' '}
                          <strong className="text-white text-sm">{lead.student_name.trim()}</strong>
                          <span className="text-slate-400 font-medium"> ({lead.student_grade || ('Sinh: ' + lead.student_dob)})</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Phụ huynh:</span>{' '}
                          <strong className="text-slate-200">{lead.parent_name}</strong> &bull;{' '}
                          <span className="text-amber-400 font-mono font-bold">{lead.parent_phone}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-900">
                        <div>
                          <span className="text-slate-400">Cơ sở đăng ký:</span>{' '}
                          <strong className="text-cyan-300 font-medium">
                            {store.campuses.find(c => c.id === lead.desired_campus_id)?.name || 'Royal School'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Phân loại học sinh:</span>{' '}
                          <span className={lead.is_royal_student ? 'text-amber-400 font-bold' : 'text-slate-300 font-medium'}>
                            {lead.is_royal_student ? 'HS chính khóa Royal (Có suất bánh sữa)' : 'Học sinh ngoài trường'}
                          </span>
                        </div>
                      </div>

                      {matchRes.matchType === 'sibling' && matchRes.siblingStudents.length > 0 && (
                        <div className="pt-2 border-t border-slate-900 text-[11px] text-cyan-300 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>
                            <strong>Học sinh mới cùng gia đình:</strong> Chung SĐT phụ huynh với {matchRes.siblingStudents.map(s => `${s.name} (${s.code})`).join(', ')}. Hệ thống cấp Mã HV riêng cho bé.
                          </span>
                        </div>
                      )}

                      {lead.medical_notes && (
                        <div className="pt-2 border-t border-slate-900 text-[11px] text-rose-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span><strong>Lưu ý y tế:</strong> {lead.medical_notes}</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Official Student Code Configuration (Học sinh mới) */}
                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Mã học viên chính thức (Chuẩn hóa hệ thống Royal):</span>
                        </label>
                        <span className="text-[10px] text-slate-500">
                          {lead.is_royal_student ? 'Tiền tố RY- (Học sinh Royal)' : 'Tiền tố EXT- (Ngoài trường)'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customStudentCode}
                          onChange={(e) => setCustomStudentCode(e.target.value)}
                          placeholder="RY-2026-xxxxx"
                          className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 font-mono text-amber-400 font-bold text-sm border border-slate-800 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => setCustomStudentCode(generateStudentCode(lead.is_royal_student, store.students))}
                          className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                          title="Tạo lại mã học viên ngẫu nhiên mới"
                        >
                          Tạo lại
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* 2.5. THANH CÔNG CỤ CHỌN PHƯƠNG THỨC XẾP LỚP (MODE SWITCHER & 1-CLICK SMART MATCH) */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Bộ chuyển đổi chế độ (Mode Switcher) */}
                  <div className="inline-flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 gap-1">
                    <button
                      type="button"
                      onClick={() => setAssignModalMode('quick')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                        assignModalMode === 'quick'
                          ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900'
                      }`}
                    >
                      <Zap className={`w-3.5 h-3.5 ${assignModalMode === 'quick' ? 'text-slate-950 fill-slate-950' : 'text-amber-400'}`} />
                      <span>⚡ Xếp Lớp Nhanh Tự Động</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAssignModalMode('detailed')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                        assignModalMode === 'detailed'
                          ? 'bg-slate-800 text-amber-300 border border-amber-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>⚙️ Tùy Chỉnh Chi Tiết Từng Môn</span>
                    </button>
                  </div>

                  {/* Nút hành động nhanh: Tự Động Khớp Lớp Tối Ưu */}
                  <button
                    type="button"
                    onClick={handleRunSmartAutoMatch}
                    className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all transform active:scale-95 cursor-pointer"
                    title="Chạy lại thuật toán tìm lớp trống đúng cơ sở, đúng khung giờ và không trùng lịch"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tự Động Khớp Lớp Tối Ưu</span>
                  </button>
                </div>

                {/* 3. Live Conflict Alert Banner (Cảnh Báo Trùng Lịch Tức Thì) */}
                {conflictList.length > 0 && (
                  <div className="p-4 rounded-2xl bg-rose-500/10 border-2 border-rose-500/40 text-rose-200 text-xs space-y-2 animate-fadeIn shadow-lg shadow-rose-950/40">
                    <div className="flex items-center gap-2 font-black text-rose-300 uppercase tracking-wide">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 stroke-[2.5]" />
                      <span>CẢNH BÁO TRÙNG LỊCH HỌC TỨC THÌ!</span>
                    </div>
                    <div className="space-y-1.5 pl-6">
                      {conflictList.map((c, idx) => (
                        <div key={idx} className="leading-relaxed">
                          &bull; Trùng lịch học giữa lớp <strong className="text-white underline">{c.classA.name}</strong> và <strong className="text-white underline">{c.classB.name}</strong> vào <span className="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-200 font-bold font-mono">{c.commonDays.join(', ')}</span> ({c.timeSlotDesc})!
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-amber-300/90 pl-6 pt-1 border-t border-rose-500/20">
                      Gợi ý: Bấm nút <strong>&ldquo;Tự Động Khớp Lớp Tối Ưu&rdquo;</strong> hoặc nút xoay vòng đổi lớp để hệ thống tự động chọn ca lệch thứ không trùng giờ.
                    </p>
                  </div>
                )}

                {/* 4. Dynamic Multi-Class Assignment List */}
                <div className="space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      {assignModalMode === 'quick' ? (
                        <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      ) : (
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      <span>
                        {assignModalMode === 'quick'
                          ? `Bảng Đề Xuất Xếp Lớp Nhanh Tự Động (${subjects.length} môn đăng ký)`
                          : matchedStudent
                          ? `Phân Bổ Môn Học Mới Đăng Ký Thêm (${totalRequested - alreadyEnrolledCount} môn mới / ${alreadyEnrolledCount} môn đã học)`
                          : `Danh Sách Phân Bổ Lớp Cho Từng Môn (${subjects.length} môn đăng ký)`}
                      </span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Đã chọn xếp mới: <strong className="text-emerald-400 font-bold">{assignedCount}</strong> môn{' '}
                      {alreadyEnrolledCount > 0 && (
                        <span className="text-teal-300 font-semibold">&bull; {alreadyEnrolledCount} môn đã học trước đó </span>
                      )}
                      {unassignedCount > 0 && (
                        <span className="text-amber-400 font-medium">({unassignedCount} môn chờ xếp)</span>
                      )}
                    </span>
                  </div>

                  {assignModalMode === 'quick' ? (
                    /* ===================================================================== */
                    /* CHẾ ĐỘ 1: KHUNG "XẾP LỚP NHANH" (SMART RECOMMENDATION CARD TABLE)     */
                    /* ===================================================================== */
                    <div className="rounded-2xl bg-slate-950/90 border border-amber-500/30 overflow-hidden shadow-inner divide-y divide-slate-800/80 animate-fadeIn">
                      {subjects.map((sub, idx) => {
                        const subjectObj = store.subjects.find(s => s.id === sub.subject_id);
                        const mode = subjectAssignModes[sub.subject_id] ?? 'assign_now';
                        const isAlreadyEnrolledMode = mode === 'already_enrolled';
                        const isAssignNow = mode === 'assign_now';
                        const currentSelectedClassId = assignedClassesBySubject[sub.subject_id] || '';
                        const selectedClassObj = isAssignNow
                          ? store.classes.find(c => c.id === currentSelectedClassId)
                          : null;
                        const alreadyEnrolledClassForSub = matchRes.enrolledClasses.find(
                          c => c.subject_id === sub.subject_id
                        );
                        const activeCls = isAlreadyEnrolledMode ? alreadyEnrolledClassForSub : selectedClassObj;

                        // Available classes at desired campus for this subject
                        const availableCampusClasses = store.classes.filter(c => {
                          if (
                            c.campus_id !== lead.desired_campus_id ||
                            c.subject_id !== sub.subject_id ||
                            c.status !== 'active'
                          )
                            return false;
                          const enrolled = store.enrollments.filter(
                            e => e.class_id === c.id && (e.status === 'active' || e.status === 'trial')
                          ).length;
                          return enrolled < c.max_students;
                        });

                        const enrolledInSelected = activeCls
                          ? store.enrollments.filter(
                              e => e.class_id === activeCls.id && (e.status === 'active' || e.status === 'trial')
                            ).length
                          : 0;
                        const remainingSeats = activeCls ? Math.max(0, activeCls.max_students - enrolledInSelected) : 0;

                        const clsDays = activeCls ? getClassDaysOfWeek(activeCls, store) : [];
                        const enrolledDays =
                          activeCls &&
                          subjectEnrolledDays[sub.subject_id] &&
                          subjectEnrolledDays[sub.subject_id].length > 0
                            ? subjectEnrolledDays[sub.subject_id]
                            : clsDays;
                        const startDate = activeCls
                          ? subjectStartDates[sub.subject_id] ||
                            getDefaultClassStartDate(activeCls, store, undefined, enrolledDays)
                          : '';
                        const autoSessionInfo = activeCls
                          ? calculateRemainingSessions(activeCls, startDate, store, enrolledDays)
                          : null;
                        const effectiveSessions = autoSessionInfo
                          ? subjectCustomSessions[sub.subject_id] ?? autoSessionInfo.remainingSessions
                          : 0;
                        const pricing =
                          activeCls && autoSessionInfo
                            ? calculateClassProratedPricing(
                                activeCls,
                                effectiveSessions,
                                lead.is_royal_student,
                                store
                              )
                            : null;

                        const facilityObj = activeCls
                          ? store.facilities.find(f => f.id === activeCls.facility_id)
                          : null;
                        const teacherObj = activeCls
                          ? store.teachers.find(t => t.id === activeCls.primary_teacher_id)
                          : null;
                        const slotObj = activeCls
                          ? store.timeSlots.find(ts => ts.id === activeCls.time_slot_id)
                          : null;
                        const is100Match =
                          activeCls &&
                          activeCls.campus_id === lead.desired_campus_id &&
                          (!slotObj || slotObj.slot_type === sub.time_slot);

                        return (
                          <div
                            key={sub.subject_id || idx}
                            className={`p-4 transition-colors ${
                              isAlreadyEnrolledMode
                                ? 'bg-teal-950/20'
                                : isAssignNow && selectedClassObj
                                ? 'bg-slate-900/70 hover:bg-slate-900'
                                : 'bg-amber-950/15'
                            }`}
                          >
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                              {/* Cột 1: Môn học & Khung giờ mong muốn */}
                              <div className="flex items-start gap-2.5 min-w-[190px]">
                                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <div>
                                  <div className="font-extrabold text-sm text-white flex items-center gap-1.5 flex-wrap">
                                    <span>{sub.subject_name || subjectObj?.name || 'Môn ngoại khóa'}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                    <span>
                                      {sub.time_slot === 'weekend'
                                        ? 'Cuối tuần (T7 - CN)'
                                        : '16:45 - 18:15 (Sau giờ học)'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Cột 2: Lớp đề xuất tốt nhất (Auto-Matched Class) + Lịch học & Phòng */}
                              <div className="flex-1 space-y-1.5">
                                {isAlreadyEnrolledMode && alreadyEnrolledClassForSub ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-extrabold text-xs text-teal-300">
                                        {alreadyEnrolledClassForSub.name}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-200 border border-teal-500/40 text-[10px] font-extrabold">
                                        [ Đã học lớp này trước đó ]
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                      Hệ thống tự động giữ nguyên lớp hiện tại để không thu trùng học phí.
                                    </p>
                                  </div>
                                ) : isAssignNow && selectedClassObj ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-extrabold text-sm text-emerald-300">
                                        {selectedClassObj.name}
                                      </span>
                                      {is100Match ? (
                                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold">
                                          [ Khớp 100% nguyện vọng ]
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-extrabold">
                                          [ Lớp khả dụng cùng cơ sở ]
                                        </span>
                                      )}
                                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-extrabold font-mono">
                                        [ Còn {remainingSeats}/{selectedClassObj.max_students} chỗ ]
                                      </span>
                                    </div>

                                    {/* Lịch học & Phòng & Giáo viên */}
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
                                      <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                                        📅 {clsDays.join(' & ')}
                                      </span>
                                      <span>
                                        Phòng/Sân:{' '}
                                        <strong className="text-white">
                                          {facilityObj?.name || 'Sân tiêu chuẩn'}
                                        </strong>
                                      </span>
                                      <span>
                                        GV:{' '}
                                        <strong className="text-cyan-300">
                                          {teacherObj?.name || 'Chuyên gia Royal'}
                                        </strong>{' '}
                                        {teacherObj?.teacher_type === 'permanent' && (
                                          <span className="text-[10px] text-emerald-400 font-semibold">(Cơ hữu)</span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-extrabold flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                                        <span>⏱ Chưa xếp lớp (Chờ mở thêm lớp)</span>
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-amber-200/80">
                                      Lý do: {unassignedReasons[sub.subject_id] || 'Các lớp hiện tại tại cơ sở đã đầy sĩ số hoặc trùng giờ'}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Cột 3: Học phí chuẩn cơ sở & Nút đổi nhanh (RefreshCw) */}
                              <div className="flex items-center justify-between lg:justify-end gap-2.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800/60">
                                {isAssignNow && selectedClassObj && pricing && (
                                  <div className="text-right">
                                    <div className="font-mono font-black text-sm text-emerald-400">
                                      {formatVND(pricing.netPayable)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      {pricing.effectiveSessions} buổi × {formatVND(pricing.sessionRate)}/b
                                    </div>
                                  </div>
                                )}

                                {!isAlreadyEnrolledMode && (
                                  <div className="flex items-center gap-1.5">
                                    {/* Nút đổi nhanh (RefreshCw) */}
                                    <button
                                      type="button"
                                      onClick={() => handleCycleQuickClass(sub.subject_id)}
                                      disabled={availableCampusClasses.length === 0}
                                      className={`px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                        availableCampusClasses.length > 0
                                          ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700 hover:border-amber-500/50 shadow-sm active:scale-95'
                                          : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                                      }`}
                                      title="Đổi nhanh sang lớp khả dụng tiếp theo của môn này"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                                      <span className="hidden sm:inline">Đổi lớp</span>
                                    </button>

                                    {/* Nút chuyển Chưa xếp lớp / Xếp ngay */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isAssignNow) {
                                          setSubjectAssignModes(prev => ({
                                            ...prev,
                                            [sub.subject_id]: 'unassigned',
                                          }));
                                          if (!unassignedReasons[sub.subject_id]) {
                                            setUnassignedReasons(prev => ({
                                              ...prev,
                                              [sub.subject_id]: 'Tạm hoãn xếp sau theo nguyện vọng',
                                            }));
                                          }
                                        } else if (availableCampusClasses.length > 0) {
                                          handleCycleQuickClass(sub.subject_id);
                                        } else {
                                          setAssignModalMode('detailed');
                                        }
                                      }}
                                      className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-[11px] font-semibold cursor-pointer"
                                      title={isAssignNow ? 'Chuyển môn này sang Chờ xếp lớp' : 'Kích hoạt xếp lớp môn này'}
                                    >
                                      {isAssignNow ? <Clock className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* ===================================================================== */
                    /* CHẾ ĐỘ 2: TÙY CHỈNH CHI TIẾT TỪNG MÔN (DETAILED MANUAL MODE)          */
                    /* ===================================================================== */
                    <div className="space-y-3">
                    {subjects.map((sub, idx) => {
                      const subjectObj = store.subjects.find(s => s.id === sub.subject_id);
                      const mode = subjectAssignModes[sub.subject_id] ?? 'assign_now';
                      const isAlreadyEnrolledMode = mode === 'already_enrolled';
                      const isAssignNow = mode === 'assign_now';
                      const enrollType = subjectEnrollmentTypes[sub.subject_id] ?? 'official';
                      const isTrialEnroll = enrollType === 'trial';
                      const currentSelectedClassId = assignedClassesBySubject[sub.subject_id] || '';
                      const selectedClassObj = isAssignNow ? store.classes.find(c => c.id === currentSelectedClassId) : null;
                      const alreadyEnrolledClassForSub = matchRes.enrolledClasses.find(c => c.subject_id === sub.subject_id);
                      const reasonText = unassignedReasons[sub.subject_id] || '';

                      // Available classes matching this subject
                      const subjectClasses = store.classes.filter(c => c.subject_id === sub.subject_id && c.status === 'active');
                      // Sort so classes at desired campus appear first
                      const sortedClasses = [...subjectClasses].sort((a, b) => {
                        if (a.campus_id === lead.desired_campus_id && b.campus_id !== lead.desired_campus_id) return -1;
                        if (b.campus_id === lead.desired_campus_id && a.campus_id !== lead.desired_campus_id) return 1;
                        return 0;
                      });

                      // Calculate prorated & day-specific session & fee breakdown if class is chosen
                      const classDaysForSub = selectedClassObj ? getClassDaysOfWeek(selectedClassObj, store) : [];
                      const currentEnrolledDays = selectedClassObj
                        ? (subjectEnrolledDays[sub.subject_id] && subjectEnrolledDays[sub.subject_id].length > 0
                            ? subjectEnrolledDays[sub.subject_id].filter(d => classDaysForSub.includes(d))
                            : classDaysForSub)
                        : [];
                      const effectiveEnrolledDays = currentEnrolledDays.length > 0 ? currentEnrolledDays : classDaysForSub;
                      const currentStartDate = selectedClassObj
                        ? (subjectStartDates[sub.subject_id] || getDefaultClassStartDate(selectedClassObj, store, undefined, effectiveEnrolledDays))
                        : '';
                      const autoSessionInfo = selectedClassObj
                        ? calculateRemainingSessions(selectedClassObj, currentStartDate, store, effectiveEnrolledDays)
                        : null;
                      const manualOverrideSessions = subjectCustomSessions[sub.subject_id];
                      const effectiveSessions = autoSessionInfo
                        ? (manualOverrideSessions ?? autoSessionInfo.remainingSessions)
                        : 0;
                      const pricingBreakdown = selectedClassObj && autoSessionInfo
                        ? calculateClassProratedPricing(selectedClassObj, effectiveSessions, lead.is_royal_student, store)
                        : null;

                      if (isAlreadyEnrolledMode && alreadyEnrolledClassForSub) {
                        return (
                          <div
                            key={sub.subject_id || idx}
                            className="p-4 rounded-2xl bg-slate-950/80 border border-teal-500/40 opacity-90 space-y-2.5"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold text-xs shrink-0">
                                  ✓
                                </span>
                                <div>
                                  <div className="font-bold text-sm text-slate-200 flex items-center gap-2 flex-wrap">
                                    <span>{sub.subject_name || subjectObj?.name || 'Môn ngoại khóa'}</span>
                                    <span className="px-2.5 py-0.5 rounded-lg bg-teal-500/25 text-teal-200 border border-teal-500/40 text-[10px] font-extrabold">
                                      [ Đã ghi danh lớp này trước đó: {alreadyEnrolledClassForSub.name} ]
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    Học viên <strong>{matchedStudent?.name} ({matchedStudent?.code})</strong> hiện đang theo học môn này. Hệ thống tự động khóa để không thu trùng học phí.
                                  </p>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setSubjectAssignModes(prev => ({ ...prev, [sub.subject_id]: 'assign_now' }));
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold shrink-0 cursor-pointer"
                              >
                                Mở khóa chọn lớp khác
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={sub.subject_id || idx} 
                          className={`p-4 rounded-2xl border transition-all ${
                            isAssignNow && selectedClassObj
                              ? isTrialEnroll
                                ? 'bg-slate-900/90 border-purple-500/40 shadow-md ring-1 ring-purple-500/15'
                                : 'bg-slate-900/90 border-emerald-500/40 shadow-md ring-1 ring-emerald-500/10'
                              : !isAssignNow
                              ? 'bg-slate-950/80 border-amber-500/30 shadow-sm'
                              : 'bg-slate-950/60 border-slate-800/80 border-dashed'
                          }`}
                        >
                          {/* Subject Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-2">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                                {idx + 1}
                              </span>
                              <div>
                                <div className="font-bold text-sm text-white flex items-center gap-2 flex-wrap">
                                  <span>{sub.subject_name || subjectObj?.name || 'Môn ngoại khóa'}</span>
                                  {matchedStudent && !alreadyEnrolledClassForSub && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold">
                                      ✨ Môn đăng ký thêm mới
                                    </span>
                                  )}
                                  {isAssignNow && selectedClassObj && isTrialEnroll && (
                                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold">
                                      🧪 Học Thử 1 Buổi Đầu
                                    </span>
                                  )}
                                  {isAssignNow && selectedClassObj && autoSessionInfo?.isPartialSchedule && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                                      📅 {formatStudentScheduleLabel(autoSessionInfo.enrolledDaysOfWeek, autoSessionInfo.daysOfWeek)} ({autoSessionInfo.enrolledDaysOfWeek.length}/{autoSessionInfo.daysOfWeek.length} buổi/tuần)
                                    </span>
                                  )}
                                  {isAssignNow && selectedClassObj && pricingBreakdown?.isMidCourse && (
                                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold">
                                      ⚡ Thực học: {pricingBreakdown.effectiveSessions}/{pricingBreakdown.totalSessions} buổi
                                    </span>
                                  )}
                                </div>
                                {sub.time_slot_label && (
                                  <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                    <Clock className="w-2.5 h-2.5 text-amber-400" />
                                    <span>Nguyện vọng ca: {sub.time_slot_label}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isAssignNow && selectedClassObj && pricingBreakdown ? (
                                isTrialEnroll ? (
                                  <span className="text-purple-300 font-mono font-bold text-xs bg-purple-500/15 px-2.5 py-1 rounded-lg border border-purple-500/30">
                                    Dự kiến ({pricingBreakdown.effectiveSessions}b): {formatVND(pricingBreakdown.netPayable)} (Chờ thử)
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    {(pricingBreakdown.isMidCourse || autoSessionInfo?.isPartialSchedule) && (
                                      <span className="text-slate-500 font-mono text-[11px] line-through">
                                        {formatVND(pricingBreakdown.fullCourseFee)}
                                      </span>
                                    )}
                                    <span className="text-emerald-400 font-mono font-bold text-xs bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                                      {formatVND(pricingBreakdown.netPayable)} ({pricingBreakdown.effectiveSessions} buổi)
                                    </span>
                                  </div>
                                )
                              ) : !isAssignNow ? (
                                <span className="text-amber-400 font-bold text-[11px] bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>Chưa tính học phí</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-xs">
                                  {formatVND(sub.estimated_fee || 3600000)} (dự kiến)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 1. Bộ chuyển đổi trạng thái (Segmented Toggle / Radio Pills) */}
                          <div className="pt-3">
                            <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                              <span>Quyết định phân bổ cho môn này:</span>
                              <span className="text-[10px] text-slate-500">
                                {isAssignNow ? 'Đang kích hoạt chọn lớp' : 'Tạm hoãn ghi danh môn này'}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSubjectAssignModes(prev => ({ ...prev, [sub.subject_id]: 'assign_now' }));
                                  if (!assignedClassesBySubject[sub.subject_id] && sortedClasses.length > 0) {
                                    const firstCls = sortedClasses[0];
                                    const clsDays = getClassDaysOfWeek(firstCls, store);
                                    setAssignedClassesBySubject(prev => ({ ...prev, [sub.subject_id]: firstCls.id }));
                                    setSubjectEnrolledDays(prev => ({ ...prev, [sub.subject_id]: [...clsDays] }));
                                    setSubjectStartDates(prev => ({
                                      ...prev,
                                      [sub.subject_id]: getDefaultClassStartDate(firstCls, store, undefined, clsDays),
                                    }));
                                  }
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                  isAssignNow
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 shadow-sm shadow-emerald-950 ring-1 ring-emerald-500/20'
                                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
                                }`}
                              >
                                <CheckCircle2 className={`w-3.5 h-3.5 ${isAssignNow ? 'text-emerald-400' : 'text-slate-500'}`} />
                                <span>✓ Xếp Lớp Ngay</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setSubjectAssignModes(prev => ({ ...prev, [sub.subject_id]: 'unassigned' }));
                                  if (!unassignedReasons[sub.subject_id]) {
                                    setUnassignedReasons(prev => ({ ...prev, [sub.subject_id]: 'Lớp hiện tại đã kín chỗ / Chờ mở thêm ca' }));
                                  }
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                  !isAssignNow
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-sm shadow-amber-950 ring-1 ring-amber-500/20'
                                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800'
                                }`}
                              >
                                <Clock className={`w-3.5 h-3.5 ${!isAssignNow ? 'text-amber-400' : 'text-slate-500'}`} />
                                <span>⏱ Chưa Xếp Lớp (Chờ mở lớp / Xếp sau)</span>
                              </button>
                            </div>
                          </div>

                          {/* 2. Xử lý hiển thị theo trạng thái chọn */}
                          {isAssignNow ? (
                            /* KHI CHỌN XẾP LỚP NGAY */
                            <div className="pt-3 space-y-3 text-xs animate-fadeIn">
                              <div className="space-y-1.5">
                                <label className="block text-slate-300 font-medium">
                                  Chọn lớp học ngoại khóa phân bổ cho môn này:
                                </label>
                                
                                <select
                                  value={currentSelectedClassId}
                                  onChange={(e) => {
                                    const newClassId = e.target.value;
                                    setAssignedClassesBySubject(prev => ({
                                      ...prev,
                                      [sub.subject_id]: newClassId,
                                    }));
                                    const chosenCls = store.classes.find(c => c.id === newClassId);
                                    if (chosenCls) {
                                      const clsDays = getClassDaysOfWeek(chosenCls, store);
                                      setSubjectEnrolledDays(prev => ({
                                        ...prev,
                                        [sub.subject_id]: [...clsDays],
                                      }));
                                      setSubjectStartDates(prev => ({
                                        ...prev,
                                        [sub.subject_id]: getDefaultClassStartDate(chosenCls, store, undefined, clsDays),
                                      }));
                                    }
                                    setSubjectCustomSessions(prev => ({
                                      ...prev,
                                      [sub.subject_id]: undefined,
                                    }));
                                  }}
                                  className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border font-medium focus:outline-none transition-colors ${
                                    currentSelectedClassId 
                                      ? isTrialEnroll
                                        ? 'border-purple-500/60 text-white'
                                        : 'border-emerald-500/60 text-white' 
                                      : 'border-slate-800 text-slate-400 focus:border-amber-500'
                                  }`}
                                >
                                  <option value="">-- Vui lòng chọn lớp học ngoại khóa --</option>
                                  {sortedClasses.map(c => {
                                    const enrolledCount = store.enrollments.filter(
                                      e => e.class_id === c.id && (e.status === 'active' || e.status === 'trial')
                                    ).length;
                                    const isFullClass = enrolledCount >= c.max_students;
                                    const isAlreadyInThisClass = matchRes.enrolledClasses.some(ec => ec.id === c.id);
                                    const days = c.days_of_week?.join(', ') || 'Lịch mở';
                                    const campusObj = store.campuses.find(cp => cp.id === c.campus_id);
                                    const campusLabel = campusObj?.code || campusObj?.name || 'Cơ sở';
                                    const classPricing = calculateClassProratedPricing(c, c.total_sessions || 24, lead.is_royal_student, store);

                                    return (
                                      <option key={c.id} value={c.id} disabled={isAlreadyInThisClass}>
                                        {c.name} {isAlreadyInThisClass ? '⛔ [Đã ghi danh lớp này trước đó]' : `• Sĩ số: ${enrolledCount}/${c.max_students} • ${days} • Đơn giá ${campusLabel}: ${formatVND(classPricing.sessionRate)}/b (${formatVND(classPricing.fullCourseFee)}) ${isFullClass ? '[HẾT CHỖ]' : ''}`}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              {/* BỘ CHỌN CHẾ ĐỘ NHẬP HỌC (ENROLLMENT MODE PILLS) */}
                              <div className="pt-1 space-y-2">
                                <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                                  <span>Hình thức nhập học môn này:</span>
                                  <span className="text-[10px] text-slate-400">
                                    {isTrialEnroll ? 'Hóa đơn tạm hoãn chờ kết quả buổi 1' : 'Kích hoạt hóa đơn thực học ngay'}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setSubjectEnrollmentTypes(prev => ({ ...prev, [sub.subject_id]: 'official' }))}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                      !isTrialEnroll
                                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/60 shadow-sm ring-1 ring-emerald-500/20'
                                        : 'bg-slate-950/90 text-slate-400 hover:text-slate-200 border border-slate-800'
                                    }`}
                                  >
                                    <span>🎓 Học Chính Thức Ngay</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setSubjectEnrollmentTypes(prev => ({ ...prev, [sub.subject_id]: 'trial' }))}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                      isTrialEnroll
                                        ? 'bg-purple-500/25 text-purple-200 border border-purple-500/60 shadow-sm ring-1 ring-purple-500/25'
                                        : 'bg-slate-950/90 text-slate-400 hover:text-slate-200 border border-slate-800'
                                    }`}
                                  >
                                    <span>🧪 Học Thử 1 Buổi Đầu</span>
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-extrabold">
                                      Trải nghiệm
                                    </span>
                                  </button>
                                </div>

                                {/* Phản hồi giao diện khi chọn "Học Thử 1 Buổi Đầu" */}
                                {isTrialEnroll && (
                                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-[11px] text-purple-200 leading-relaxed flex items-start gap-2 animate-fadeIn">
                                    <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                                    <span>
                                      ℹ️ Học sinh được trải nghiệm 1 buổi học đầu tiên. Hóa đơn học phí toàn khóa sẽ ở trạng thái <strong>&ldquo;Tạm hoãn / Chờ hoàn thành học thử&rdquo;</strong> và chỉ kích hoạt khi học sinh tiếp tục học buổi thứ 2.
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* KHU VỰC CẤU HÌNH LỊCH HỌC THEO THỨ TRONG TUẦN + NGÀY BẮT ĐẦU & SỐ BUỔI THỰC HỌC */}
                              {selectedClassObj && autoSessionInfo && pricingBreakdown && (
                                <div className="p-3.5 rounded-2xl bg-slate-950/95 border border-slate-800/90 space-y-3.5 shadow-inner">
                                  
                                  {/* Row 0: Bộ chọn Lịch học trong tuần của Học sinh (Student Enrolled Days Picker) */}
                                  <div className="pb-3 border-b border-slate-800/80 space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                      <div>
                                        <label className="text-[11px] font-bold text-white flex items-center gap-1.5">
                                          <Calendar className="w-3.5 h-3.5 text-amber-400" />
                                          <span>Lịch học thực tế của bé trong tuần <span className="text-rose-400">*</span>:</span>
                                        </label>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                          Bấm bật/tắt từng thứ để đăng ký học đủ tuần hoặc chỉ học 1 phần buổi cố định trong tuần (tối thiểu 1 ngày)
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        {autoSessionInfo.isPartialSchedule ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSubjectEnrolledDays(prev => ({
                                                ...prev,
                                                [sub.subject_id]: [...autoSessionInfo.daysOfWeek],
                                              }));
                                              setSubjectCustomSessions(prev => ({
                                                ...prev,
                                                [sub.subject_id]: undefined,
                                              }));
                                            }}
                                            className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-bold transition-colors cursor-pointer"
                                          >
                                            Chọn lại đủ {autoSessionInfo.daysOfWeek.length} buổi/tuần
                                          </button>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                            Đang chọn đủ {autoSessionInfo.daysOfWeek.length} buổi/tuần
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Nút bấm chọn các thứ trong tuần của lớp */}
                                    <div className="flex items-center gap-2.5 flex-wrap pt-0.5">
                                      {autoSessionInfo.daysOfWeek.map(dayCode => {
                                        const isDaySelected = autoSessionInfo.enrolledDaysOfWeek.includes(dayCode);
                                        const isOnlyOneLeft = isDaySelected && autoSessionInfo.enrolledDaysOfWeek.length <= 1;

                                        return (
                                          <button
                                            key={dayCode}
                                            type="button"
                                            onClick={() => {
                                              if (isDaySelected) {
                                                // Bắt buộc phải chọn ít nhất 1 ngày trong số các ngày học của lớp
                                                if (autoSessionInfo.enrolledDaysOfWeek.length <= 1) {
                                                  showToast('Ràng buộc lịch học: Bắt buộc phải chọn ít nhất 1 ngày học trong tuần cho học sinh!');
                                                  return;
                                                }
                                                const updatedDays = autoSessionInfo.enrolledDaysOfWeek.filter(d => d !== dayCode);
                                                setSubjectEnrolledDays(prev => ({
                                                  ...prev,
                                                  [sub.subject_id]: updatedDays,
                                                }));
                                              } else {
                                                // Giữ đúng thứ tự ngày của lớp
                                                const updatedDays = autoSessionInfo.daysOfWeek.filter(
                                                  d => d === dayCode || autoSessionInfo.enrolledDaysOfWeek.includes(d)
                                                );
                                                setSubjectEnrolledDays(prev => ({
                                                  ...prev,
                                                  [sub.subject_id]: updatedDays,
                                                }));
                                              }
                                              // Tự động reset manual session override để tính lại tức thì
                                              setSubjectCustomSessions(prev => ({
                                                ...prev,
                                                [sub.subject_id]: undefined,
                                              }));
                                            }}
                                            title={
                                              isOnlyOneLeft
                                                ? 'Bắt buộc chọn ít nhất 1 ngày trong tuần (Hãy bật ngày khác trước nếu muốn đổi thứ)'
                                                : `Bật/tắt lịch học ${getDayLabel(dayCode)}`
                                            }
                                            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                                              isDaySelected
                                                ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 shadow-md shadow-amber-500/20 ring-2 ring-amber-400/60'
                                                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/80'
                                            }`}
                                          >
                                            <span className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] font-black ${
                                              isDaySelected ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-500'
                                            }`}>
                                              {isDaySelected ? '✓' : ''}
                                            </span>
                                            <span>{getDayLabel(dayCode)} ({dayCode})</span>
                                          </button>
                                        );
                                      })}

                                      <span className="text-[11px] text-slate-300 font-medium ml-1">
                                        &rarr;{' '}
                                        {autoSessionInfo.isPartialSchedule ? (
                                          <strong className="text-amber-300">
                                            Bé {formatStudentScheduleLabel(autoSessionInfo.enrolledDaysOfWeek, autoSessionInfo.daysOfWeek).toLowerCase()} hàng tuần ({autoSessionInfo.enrolledDaysOfWeek.length} buổi/tuần)
                                          </strong>
                                        ) : (
                                          <strong className="text-emerald-400">
                                            Bé học đủ {autoSessionInfo.daysOfWeek.length} buổi/tuần ({formatDaysListLabel(autoSessionInfo.daysOfWeek)})
                                          </strong>
                                        )}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Row 1: Ngày bắt đầu học chính thức + Quick Preset Buttons */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800/80">
                                    <div className="space-y-1 flex-1">
                                      <label className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                                        <span>Ngày bắt đầu học chính thức <span className="text-rose-400">*</span>:</span>
                                      </label>
                                      <p className="text-[10px] text-slate-400">
                                        Khung khóa học: <span className="font-mono text-slate-300">{formatDateVN(autoSessionInfo.termStartDate)} &rarr; {formatDateVN(autoSessionInfo.termEndDate)}</span>
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                      <input
                                        type="date"
                                        min={autoSessionInfo.termStartDate}
                                        max={autoSessionInfo.termEndDate}
                                        value={currentStartDate}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setSubjectStartDates(prev => ({
                                            ...prev,
                                            [sub.subject_id]: val,
                                          }));
                                          setSubjectCustomSessions(prev => ({
                                            ...prev,
                                            [sub.subject_id]: undefined,
                                          }));
                                        }}
                                        className="px-3 py-1.5 rounded-xl bg-slate-900 border border-amber-500/40 text-white font-mono text-xs font-bold focus:outline-none focus:border-amber-400"
                                      />

                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextDate = getDefaultClassStartDate(selectedClassObj, store, undefined, effectiveEnrolledDays);
                                          setSubjectStartDates(prev => ({ ...prev, [sub.subject_id]: nextDate }));
                                          setSubjectCustomSessions(prev => ({ ...prev, [sub.subject_id]: undefined }));
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold transition-colors cursor-pointer"
                                        title="Đặt về ngày diễn ra buổi học kế tiếp theo thứ đã chọn"
                                      >
                                        Buổi kế tiếp
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSubjectStartDates(prev => ({
                                            ...prev,
                                            [sub.subject_id]: autoSessionInfo.termStartDate,
                                          }));
                                          setSubjectCustomSessions(prev => ({ ...prev, [sub.subject_id]: undefined }));
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[10px] font-semibold transition-colors cursor-pointer"
                                        title="Tính từ ngày khai giảng đầu khóa"
                                      >
                                        Đầu khóa
                                      </button>
                                    </div>
                                  </div>

                                  {/* Row 2: Tự động đối soát & đếm số buổi còn lại (Reactive Counter) */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
                                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                        Lịch học của lớp
                                      </span>
                                      <div className="mt-1 flex items-baseline justify-between gap-1">
                                        <span className="font-mono font-bold text-xs text-white">
                                          {formatDaysListLabel(autoSessionInfo.daysOfWeek)}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          Toàn khóa: {pricingBreakdown.totalSessions}b
                                        </span>
                                      </div>
                                    </div>

                                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
                                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                        Lịch học của bé
                                      </span>
                                      <div className="mt-1 flex items-baseline justify-between gap-1">
                                        <span className={`font-bold text-xs ${autoSessionInfo.isPartialSchedule ? 'text-amber-300' : 'text-emerald-300'}`}>
                                          {formatStudentScheduleLabel(autoSessionInfo.enrolledDaysOfWeek, autoSessionInfo.daysOfWeek)}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          {autoSessionInfo.enrolledDaysOfWeek.length} buổi/tuần
                                        </span>
                                      </div>
                                    </div>

                                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex flex-col justify-between shadow-sm">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider">
                                          Tổng thực học của bé
                                        </span>
                                        {manualOverrideSessions !== undefined && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setSubjectCustomSessions(prev => ({
                                                ...prev,
                                                [sub.subject_id]: undefined,
                                              }))
                                            }
                                            className="text-[9px] text-amber-300 underline hover:text-amber-200 cursor-pointer"
                                            title="Khôi phục số buổi đếm tự động theo lịch"
                                          >
                                            Tự động ({autoSessionInfo.remainingSessions}b)
                                          </button>
                                        )}
                                      </div>

                                      <div className="mt-1 flex items-center justify-between gap-1.5">
                                        <span className="font-mono font-black text-base text-emerald-400">
                                          {pricingBreakdown.effectiveSessions} buổi
                                        </span>

                                        {/* Linh hoạt điều chỉnh nhanh số buổi */}
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const nextVal = Math.max(1, pricingBreakdown.effectiveSessions - 1);
                                              setSubjectCustomSessions(prev => ({
                                                ...prev,
                                                [sub.subject_id]: nextVal,
                                              }));
                                            }}
                                            className="w-6 h-6 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-mono font-bold text-xs flex items-center justify-center cursor-pointer"
                                            title="Giảm 1 buổi"
                                          >
                                            -
                                          </button>
                                          <input
                                            type="number"
                                            min={1}
                                            max={pricingBreakdown.totalSessions}
                                            value={pricingBreakdown.effectiveSessions}
                                            onChange={(e) => {
                                              const val = Math.min(
                                                pricingBreakdown.totalSessions,
                                                Math.max(1, Number(e.target.value) || 1)
                                              );
                                              setSubjectCustomSessions(prev => ({
                                                ...prev,
                                                [sub.subject_id]: val,
                                              }));
                                            }}
                                            className="w-11 px-1 py-0.5 text-center rounded-lg bg-slate-950 border border-emerald-500/40 font-mono font-bold text-xs text-emerald-300 focus:outline-none"
                                            title="Điều chỉnh số buổi thực học theo thỏa thuận phụ huynh"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const nextVal = Math.min(
                                                pricingBreakdown.totalSessions,
                                                pricingBreakdown.effectiveSessions + 1
                                              );
                                              setSubjectCustomSessions(prev => ({
                                                ...prev,
                                                [sub.subject_id]: nextVal,
                                              }));
                                            }}
                                            className="w-6 h-6 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-mono font-bold text-xs flex items-center justify-center cursor-pointer"
                                            title="Tăng 1 buổi"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Row 3: Hiển thị bảng đối chiếu biểu phí minh bạch (Pricing Breakdown - Chuẩn đơn giá Cơ sở, không trừ ưu đãi) */}
                                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5 text-[11px]">
                                    <div className="flex items-center justify-between text-slate-400">
                                      <span>Lịch học của lớp:</span>
                                      <span className="font-mono text-slate-200 font-medium">
                                        {formatDaysListLabel(autoSessionInfo.daysOfWeek)} ({autoSessionInfo.daysOfWeek.length} buổi/tuần - Toàn khóa: {pricingBreakdown.totalSessions} buổi)
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between text-slate-400">
                                      <span>Lịch học của bé:</span>
                                      <span className="font-mono text-amber-300 font-bold">
                                        {formatStudentScheduleLabel(autoSessionInfo.enrolledDaysOfWeek, autoSessionInfo.daysOfWeek)} ({autoSessionInfo.enrolledDaysOfWeek.length} buổi/tuần - Tổng thực học: {pricingBreakdown.effectiveSessions} buổi)
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between text-slate-400">
                                      <span>Đơn giá 1 buổi (Ceil - Cơ sở {pricingBreakdown.campusCode}):</span>
                                      <span className="font-mono font-bold text-slate-200">
                                        {formatVND(pricingBreakdown.sessionRate)}/buổi
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between text-slate-200 pt-1.5 border-t border-slate-800/80">
                                      <span className="font-semibold">
                                        Học phí áp dụng:
                                      </span>
                                      <span className="font-mono font-bold text-emerald-300 text-right">
                                        {pricingBreakdown.effectiveSessions < pricingBreakdown.totalSessions ? (
                                          <>
                                            {pricingBreakdown.effectiveSessions} buổi × {formatVND(pricingBreakdown.sessionRate)}/buổi = {formatVND(pricingBreakdown.proratedGrossFee)}{' '}
                                            <span className="text-slate-500 font-normal">
                                              (Thay vì <span className="line-through">{formatVND(pricingBreakdown.fullCourseFee)}</span>)
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            {pricingBreakdown.effectiveSessions} buổi × {formatVND(pricingBreakdown.sessionRate)}/buổi = {formatVND(pricingBreakdown.proratedGrossFee)}
                                          </>
                                        )}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-800 font-bold text-xs">
                                      <span className="text-white">
                                        {isTrialEnroll ? 'Học phí môn này (Tạm hoãn chờ học thử):' : 'Học phí thực đóng môn này:'}
                                      </span>
                                      <span className={`font-mono text-sm font-black ${isTrialEnroll ? 'text-purple-300' : 'text-emerald-400'}`}>
                                        {formatVND(pricingBreakdown.netPayable)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Class Details Pill if chosen */}
                              {selectedClassObj ? (
                                <div className={`p-2.5 rounded-xl bg-slate-950/90 border text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2 shadow-sm ${
                                  isTrialEnroll ? 'border-purple-500/30' : 'border-emerald-500/30'
                                }`}>
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span>
                                      Cơ sở: <strong className="text-white">{store.campuses.find(cp => cp.id === selectedClassObj.campus_id)?.name}</strong>
                                    </span>
                                    <span>
                                      Phòng: <strong className="text-slate-200">{store.facilities.find(f => f.id === selectedClassObj.facility_id)?.name || 'Phòng học vụ'}</strong>
                                    </span>
                                    <span>
                                      GV: <strong className="text-amber-300">{store.teachers.find(t => t.id === selectedClassObj.primary_teacher_id)?.name || 'Chuyên gia Royal'}</strong>
                                    </span>
                                  </div>
                                  <div className={isTrialEnroll ? 'text-purple-300 font-mono font-bold' : 'text-emerald-400 font-mono font-bold'}>
                                    {pricingBreakdown && autoSessionInfo
                                      ? `Lịch: ${autoSessionInfo.enrolledDaysOfWeek.join(', ')} • ${pricingBreakdown.effectiveSessions}/${pricingBreakdown.totalSessions} buổi`
                                      : `Trọn khóa: ${selectedClassObj.total_sessions} buổi`}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[11px] text-rose-400 italic pt-0.5">
                                  * Vui lòng chọn 1 lớp học cụ thể ở trên, hoặc chuyển nút sang &ldquo;Chưa xếp lớp&rdquo;.
                                </p>
                              )}
                            </div>
                          ) : (
                            /* KHI CHỌN CHƯA XẾP LỚP */
                            <div className="pt-3 space-y-2.5 animate-fadeIn">
                              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200/90 flex items-start gap-2">
                                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <div className="leading-relaxed">
                                  Môn học này sẽ được lưu ở trạng thái <strong>Chờ xếp lớp</strong>. Chưa phát sinh ghi danh (tránh tăng sĩ số ảo của lớp) và chưa tính học phí môn này vào hóa đơn công nợ.
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <label className="block text-[11px] font-semibold text-slate-300">
                                  Lý do chưa xếp lớp (Tùy chọn):
                                </label>
                                <input
                                  type="text"
                                  value={reasonText}
                                  onChange={(e) => setUnassignedReasons(prev => ({ ...prev, [sub.subject_id]: e.target.value }))}
                                  placeholder="VD: Lớp hiện tại đã kín chỗ / Chờ mở thêm ca cuối tuần / Phụ huynh hẹn tuần sau..."
                                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
                                />

                                {/* Quick Reason Chips */}
                                <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                  <span className="text-slate-500">Gợi ý nhanh:</span>
                                  {[
                                    'Lớp hiện tại đã kín chỗ',
                                    'Chờ mở thêm ca cuối tuần',
                                    'Phụ huynh hẹn tuần sau xác nhận',
                                    'Chờ khảo sát thêm nguyện vọng'
                                  ].map((chip, chipIdx) => (
                                    <button
                                      key={chipIdx}
                                      type="button"
                                      onClick={() => setUnassignedReasons(prev => ({ ...prev, [sub.subject_id]: chip }))}
                                      className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
                                    >
                                      {chip}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>

                {/* 5. Real-time Tuition & Assignment Summary (Tóm Tắt Tài Chính Tự Động) */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/30 space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                    <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <span>Tóm Tắt Học Phí & Tiến Độ Phân Bổ</span>
                    </span>

                    {/* Dynamic Status Badge */}
                    {isFull ? (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Đã phân bổ: {assignedCount}/{totalRequested} môn (Đủ 100%)</span>
                      </span>
                    ) : isPartial ? (
                      <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Đã xếp: {assignedCount}/{totalRequested} môn &bull; {unassignedCount} môn chờ xếp sau</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[11px] font-bold flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Tất cả {totalRequested} môn chờ xếp lớp (Chưa ghi danh)</span>
                      </span>
                    )}
                  </div>

                  {/* Per-subject Session Summary Row */}
                  {assignedClassBreakdowns.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90 text-[11px] flex flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-400 font-semibold">Tổng hợp lịch & số buổi thực học các môn được xếp:</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {assignedClassBreakdowns.map((item, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono font-bold"
                          >
                            {item.subjectName.split('(')[0].trim()}: {formatStudentScheduleLabel(item.enrolledDays, item.classDays)} ({item.pricing.effectiveSessions}/{item.pricing.totalSessions} buổi)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
                      <span className="text-slate-400 text-[11px] block">
                        {hasAnyProrated ? `Học phí theo buổi thực học (${assignedCount} lớp):` : `Tổng học phí chuẩn cơ sở (${assignedCount} lớp):`}
                      </span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-white font-bold font-mono text-base">{formatVND(totalGross)}</span>
                        {hasAnyProrated && totalFullGross > totalGross && (
                          <span className="text-slate-500 font-mono text-xs line-through">
                            {formatVND(totalFullGross)}
                          </span>
                        )}
                      </div>
                      {assignedClassBreakdowns.length > 0 && (
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">
                          {assignedClassBreakdowns
                            .map(item => `${item.pricing.effectiveSessions}b × ${formatVND(item.pricing.sessionRate)}/b (${item.pricing.campusCode})`)
                            .join(' + ')}
                        </div>
                      )}
                    </div>

                    <div className={`p-3 rounded-xl border flex flex-col justify-between ${
                      trialAssignedCount > 0 && officialAssignedCount === 0
                        ? 'bg-purple-500/15 border-purple-500/40'
                        : 'bg-emerald-500/10 border-emerald-500/30'
                    }`}>
                      <span className={`font-bold text-[11px] block uppercase tracking-wider ${
                        trialAssignedCount > 0 && officialAssignedCount === 0 ? 'text-purple-300' : 'text-emerald-300'
                      }`}>
                        {trialAssignedCount > 0 && officialAssignedCount === 0 ? 'Học phí dự kiến thực học:' : 'Tổng học phí thực nộp:'}
                      </span>
                      <span className={`font-black font-mono text-xl sm:text-2xl tracking-tight mt-0.5 ${
                        trialAssignedCount > 0 && officialAssignedCount === 0 ? 'text-purple-300' : 'text-emerald-400'
                      }`}>
                        {formatVND(totalNet)}
                      </span>
                      {trialAssignedCount > 0 && (
                        <div className="text-[10px] text-purple-300 font-semibold mt-1 leading-snug">
                          {officialAssignedCount === 0
                            ? '(Chưa phát sinh công nợ - Chờ kết quả buổi học thử)'
                            : `(Thu ngay ${formatVND(immediatePayable)} • Tạm hoãn ${formatVND(trialDeferredAmount)} chờ học thử)`}
                        </div>
                      )}
                    </div>
                  </div>

                  {lead.is_royal_student && (
                    <div className="text-[11px] text-amber-300/90 flex items-center gap-1.5 pt-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Bé là học sinh chính khóa Royal School: Được hưởng trọn suất bánh sữa dinh dưỡng sau giờ học cho tất cả các môn đã xếp lớp.</span>
                    </div>
                  )}
                </div>

                {/* 6. Ghi chú lưu học vụ */}
                <div className="text-xs space-y-1">
                  <label className="block text-slate-400 font-semibold">Ghi chú lưu học vụ & tuyển sinh:</label>
                  <input
                    type="text"
                    value={enrollNote}
                    onChange={(e) => setEnrollNote(e.target.value)}
                    placeholder="Ghi chú tiếp nhận, thời khóa biểu hoặc thỏa thuận phụ huynh..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-900/90 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div className="text-slate-400 text-[11px]">
                  {assignModalMode === 'quick' && conflictList.length === 0 && (assignedCount + alreadyEnrolledCount) > 0 ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        ✓ Đã tự động khớp {assignedCount + alreadyEnrolledCount}/{totalRequested} môn thành công &mdash; Không có xung đột lịch học
                      </span>
                    </span>
                  ) : isFull ? (
                    <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>&bull; Đơn sẽ chuyển sang trạng thái &ldquo;Đã xếp đủ (Enrolled)&rdquo;.</span>
                    </span>
                  ) : isPartial ? (
                    <span className="text-amber-400 font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>&bull; Đơn sẽ chuyển sang trạng thái &ldquo;Đã xếp một phần (Partially Enrolled)&rdquo; &mdash; {unassignedCount} môn còn lại tiếp tục theo dõi xếp sau.</span>
                    </span>
                  ) : (
                    <span className="text-cyan-400 font-medium flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>&bull; Tiếp nhận hồ sơ & cấp mã học viên, toàn bộ {totalRequested} môn chuyển sang danh sách Chờ xếp lớp.</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedLeadForEnroll(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmEnrollment}
                    className={`px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
                      matchedStudent
                        ? 'bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-slate-950 shadow-teal-500/25 active:scale-95'
                        : assignedCount > 0 
                        ? trialAssignedCount > 0 && officialAssignedCount === 0
                          ? 'bg-gradient-to-r from-purple-500 to-amber-500 hover:from-purple-400 hover:to-amber-400 text-slate-950 shadow-purple-500/25 active:scale-95'
                          : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-amber-500/25 active:scale-95'
                        : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 shadow-sm active:scale-95'
                    }`}
                  >
                    {assignModalMode === 'quick' ? (
                      <Zap className="w-4 h-4 fill-slate-950" />
                    ) : (
                      <Check className="w-4 h-4 stroke-[3]" />
                    )}
                    <span>
                      {matchedStudent
                        ? `Xác Nhận Thêm Môn Vào Học Sinh Hiện Tại (${matchedStudent.code})`
                        : assignModalMode === 'quick' && assignedCount > 0
                        ? `Xác Nhận Xếp Lớp Nhanh & Cấp Mã Học Viên`
                        : assignedCount > 0 
                        ? trialAssignedCount > 0 && officialAssignedCount === 0
                          ? `Xác Nhận Xếp Lớp & Cấp Mã Học Viên (Học Thử ${trialAssignedCount} Lớp)`
                          : trialAssignedCount > 0
                          ? `Xác Nhận Xếp Lớp & Cấp Mã Học Viên (${officialAssignedCount} Chính Thức, ${trialAssignedCount} Học Thử)`
                          : `Xác Nhận Xếp Lớp & Cấp Mã Học Viên (${assignedCount} lớp)`
                        : `Tiếp Nhận & Cấp Mã Học Viên (Lưu Chờ Xếp Lớp)`}
                    </span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ======================================================== */}
      {/* MODAL 2: CẬP NHẬT GHI CHÚ TƯ VẤN (CONTACT NOTES)         */}
      {/* ======================================================== */}
      {editingLeadContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-cyan-500/40 p-6 shadow-2xl space-y-4 animate-fadeIn">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Tiến Độ Tư Vấn Hồ Sơ</h3>
                  <p className="text-[11px] text-slate-400">{editingLeadContact.student_name} - {editingLeadContact.parent_phone}</p>
                </div>
              </div>

              <button
                onClick={() => setEditingLeadContact(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-1">
              <label className="block text-slate-300 font-semibold">Trạng thái liên hệ:</label>
              <select
                value={contactStatusInput}
                onChange={(e) => setContactStatusInput(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="pending">Chờ liên hệ</option>
                <option value="contacted">Đã liên hệ tư vấn</option>
                <option value="partially_enrolled">Đã xếp một phần (Chờ mở thêm lớp)</option>
                <option value="canceled">Đã hủy / Phụ huynh không đăng ký</option>
              </select>
            </div>

            <div className="text-xs space-y-1">
              <label className="block text-slate-300 font-semibold">Nội dung cuộc gọi / Ghi chú tư vấn:</label>
              <textarea
                rows={3}
                value={contactNoteInput}
                onChange={(e) => setContactNoteInput(e.target.value)}
                placeholder="Ví dụ: Đã gọi lúc 10h sáng. Phụ huynh hẹn Thứ 6 đến tham quan và đóng học phí..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditingLeadContact(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveContactNote}
                className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs"
              >
                Lưu Ghi Chú
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: XẾP LỚP NHANH HÀNG LOẠT 1-CHẠM (BULK PREVIEW)   */}
      {/* ======================================================== */}
      {isBulkQuickModalOpen && (() => {
        const bulkPreviews = computeBulkQuickPreview();
        const totalBatchStudents = bulkPreviews.length;
        const totalBatchMatchedSubjects = bulkPreviews.reduce((s, p) => s + p.matchedClassesList.length, 0);
        const totalBatchRequestedSubjects = bulkPreviews.reduce((s, p) => s + p.totalRequested, 0);
        const totalBatchTuition = bulkPreviews.reduce((s, p) => s + p.totalNetFee, 0);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
            <div className="w-full max-w-3xl rounded-3xl bg-[#0D131F] border border-amber-500/40 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fadeIn my-auto">
              {/* Header */}
              <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 fill-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base sm:text-lg font-black text-white">
                        Xác Nhận Xếp Lớp Nhanh Hàng Loạt (1-Click Smart Matching)
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs font-extrabold">
                        {totalBatchStudents} hồ sơ
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Hệ thống đã tự động phân tích cơ sở, sĩ số khả dụng và né trùng lịch giữa các môn cho từng học sinh
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBulkQuickModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
                {/* Summary KPI Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">Số hồ sơ xử lý cùng lúc:</span>
                    <div className="text-lg font-black text-white mt-0.5">{totalBatchStudents} học sinh</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-emerald-300 text-[11px] font-semibold block">Số môn tự động khớp lớp:</span>
                    <div className="text-lg font-black text-emerald-400 mt-0.5">
                      {totalBatchMatchedSubjects}/{totalBatchRequestedSubjects} môn đăng ký
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-amber-300 text-[11px] font-semibold block">Tổng học phí chuẩn cơ sở:</span>
                    <div className="text-lg font-black font-mono text-amber-400 mt-0.5">
                      {formatVND(totalBatchTuition)}
                    </div>
                  </div>
                </div>

                {/* Per-student preview cards */}
                <div className="space-y-2.5">
                  {bulkPreviews.map((item, idx) => {
                    const campus = store.campuses.find(c => c.id === item.lead.desired_campus_id);
                    const matchedSummaryText =
                      item.matchedClassesList.length > 0
                        ? item.matchedClassesList
                            .map(m => `${m.subjectName.split('(')[0].trim()} ${m.daysLabel}`)
                            .join(', ')
                        : 'Chưa có lớp trống phù hợp';

                    return (
                      <div
                        key={item.lead.id}
                        className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-amber-500/40 transition-all space-y-2 text-xs"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-black text-xs flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <strong className="text-white text-sm font-extrabold">
                              {item.lead.student_name.trim()}
                            </strong>
                            <span className="font-mono text-[11px] text-amber-400 font-bold">
                              ({item.lead.registration_code || item.lead.id})
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-900 text-cyan-300 border border-slate-800 text-[10px] font-semibold">
                              {campus?.name}
                            </span>
                            {item.matchedStudent && (
                              <span className="px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-200 border border-teal-500/40 text-[10px] font-extrabold font-mono">
                                🔗 Gộp HS cũ: {item.matchedStudent.code}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {item.totalFulfilled >= item.totalRequested ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-extrabold">
                                ✓ Đã khớp {item.totalFulfilled}/{item.totalRequested} môn ({matchedSummaryText})
                              </span>
                            ) : item.totalFulfilled > 0 ? (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-extrabold">
                                ⚡ Khớp {item.totalFulfilled}/{item.totalRequested} môn ({item.unassignedSubjectsList.length} môn chờ xếp do kín sĩ số)
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-extrabold">
                                ⏱ Chờ mở lớp ({item.totalRequested} môn kín sĩ số)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Matched classes details */}
                        {item.matchedClassesList.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {item.matchedClassesList.map((mc, mIdx) => (
                              <div
                                key={mIdx}
                                className="p-2.5 rounded-xl bg-slate-900 border border-emerald-500/30 flex items-center justify-between gap-2 text-[11px]"
                              >
                                <div>
                                  <div className="font-bold text-emerald-300">{mc.cls.name}</div>
                                  <div className="text-[10px] text-slate-400">
                                    Lịch: <strong className="text-amber-300 font-mono">{mc.daysLabel}</strong> &bull;{' '}
                                    {mc.effectiveSessions}/{mc.totalSessions} buổi
                                  </div>
                                </div>
                                <div className="text-right font-mono">
                                  <div className="font-bold text-white">{formatVND(mc.netPayable)}</div>
                                  <div className="text-[10px] text-slate-400">{formatVND(mc.sessionRate)}/b</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {item.unassignedSubjectsList.length > 0 && (
                          <div className="text-[11px] text-amber-300/90 flex items-center gap-1.5 pt-0.5">
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>
                              Chờ xếp sau:{' '}
                              <strong>
                                {item.unassignedSubjectsList.map(u => `${u.subjectName} (${u.reason})`).join('; ')}
                              </strong>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-900/90 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Tự động cấp Mã HV chuẩn Royal, ghi danh vào lớp và sinh hóa đơn theo đơn giá từng cơ sở (Không trừ chiết khấu).
                  </span>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsBulkQuickModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBulkQuickAssign}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/25 transition-all transform active:scale-95 cursor-pointer"
                  >
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>Phê Duyệt Tất Cả ({totalBatchStudents} Hồ Sơ)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======================================================== */}
      {/* MODAL 4: XÁC NHẬN LOẠI BỎ HỒ SƠ TUYỂN SINH ẢO / HỦY ĐƠN    */}
      {/* ======================================================== */}
      {rejectTargetLead && (() => {
        const leadCode = rejectTargetLead.registration_code || rejectTargetLead.id;
        const campusName = store.campuses.find(c => c.id === rejectTargetLead.desired_campus_id)?.name || rejectTargetLead.desired_campus_id || 'Chưa chọn';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-rose-500/40 p-6 shadow-2xl space-y-5 animate-scaleUp">
              
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>Loại Bỏ Hồ Sơ Tuyển Sinh</span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[11px] font-mono">
                        {leadCode}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Chọn hình thức xử lý hồ sơ ảo hoặc yêu cầu hủy đăng ký từ phụ huynh
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isRejecting}
                  onClick={() => setRejectTargetLead(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Lead Details Card */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Học sinh đăng ký:</span>
                  <span className="font-bold text-white text-sm">{rejectTargetLead.student_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Phụ huynh liên hệ:</span>
                  <span className="font-semibold text-slate-200">
                    {rejectTargetLead.parent_name} • <span className="font-mono text-cyan-400">{rejectTargetLead.parent_phone}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Cơ sở đăng ký:</span>
                  <span className="text-amber-400 font-medium">{campusName}</span>
                </div>
              </div>

              {/* 2 Options Cards */}
              <div className="space-y-3">
                {/* Lựa chọn 1: Đánh dấu hồ sơ ảo */}
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 hover:border-amber-500/40 transition-colors space-y-2">
                  <div className="flex items-center gap-2">
                    <UserX className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-amber-300 text-xs uppercase tracking-wide">
                      Lựa Chọn 1: Đánh Dấu Là Hồ Sơ Ảo / Đã Hủy
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Cập nhật trạng thái thành <code className="text-amber-300 bg-amber-950/40 px-1 py-0.5 rounded">cancelled</code> trên Supabase và ghi chú <em>"Hồ sơ ảo / Người dùng hủy"</em>. Giữ lại bản ghi trong CSDL để tiện đối soát lịch sử.
                  </p>
                  <button
                    type="button"
                    disabled={isRejecting}
                    onClick={() => handleRejectRegistration(rejectTargetLead.id, leadCode, false)}
                    className="w-full mt-1 py-2 px-3.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <UserX className="w-4 h-4" />
                    <span>Xác Nhận Đánh Dấu Hồ Sơ Ảo</span>
                  </button>
                </div>

                {/* Lựa chọn 2: Xóa vĩnh viễn */}
                <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 hover:border-rose-500/40 transition-colors space-y-2">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span className="font-bold text-rose-400 text-xs uppercase tracking-wide">
                      Lựa Chọn 2: Xóa Vĩnh Viễn Khỏi CSDL
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Thực hiện lệnh <code className="text-rose-300 bg-rose-950/40 px-1 py-0.5 rounded">DELETE</code> xóa hoàn toàn bản ghi khỏi bảng <code className="text-slate-300 font-mono">parent_registrations</code> trên Supabase. Thao tác này không thể hoàn tác.
                  </p>
                  <button
                    type="button"
                    disabled={isRejecting}
                    onClick={() => handleRejectRegistration(rejectTargetLead.id, leadCode, true)}
                    className="w-full mt-1 py-2 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-rose-600/20 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa Vĩnh Viễn Khỏi Cơ Sở Dữ Liệu</span>
                  </button>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end pt-2 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isRejecting}
                  onClick={() => setRejectTargetLead(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Đóng / Giữ Lại Hồ Sơ
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};
