import React, { useState } from 'react';
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
  Info
} from 'lucide-react';
import { AppStore, generateStudentCode, formatVND, calculateCeilSessionRate, getEffectivePrice, createAuditRecord, appendAuditLog } from '../../lib/storage';
import { ParentRegistration, Student, UserRole, ExtracurricularClass, Enrollment, TuitionInvoice } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface ParentPortalTabProps {
  store: AppStore;
  currentRole: UserRole;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onOpenParentPortal?: () => void;
  onNavigateToStudents?: (studentCode?: string) => void;
}

export const ParentPortalTab: React.FC<ParentPortalTabProps> = ({
  store,
  currentRole,
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
  const [assignedClassesBySubject, setAssignedClassesBySubject] = useState<Record<string, string>>({});
  const [subjectAssignModes, setSubjectAssignModes] = useState<Record<string, 'assign_now' | 'unassigned'>>({});
  const [unassignedReasons, setUnassignedReasons] = useState<Record<string, string>>({});
  const [customStudentCode, setCustomStudentCode] = useState<string>('');
  const [enrollNote, setEnrollNote] = useState<string>('');

  // Modal Cập nhật ghi chú tư vấn
  const [editingLeadContact, setEditingLeadContact] = useState<ParentRegistration | null>(null);
  const [contactNoteInput, setContactNoteInput] = useState<string>('');
  const [contactStatusInput, setContactStatusInput] = useState<'pending' | 'contacted' | 'partially_enrolled' | 'canceled'>('contacted');

  // Success alert toast banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

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
      const matchMulti = lead.registered_subjects?.some(s => s.subject_id === subjectFilter);
      if (!matchPrimary && !matchMulti) return false;
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const codeMatch = lead.registration_code?.toLowerCase().includes(q);
      const parentMatch = lead.parent_name.toLowerCase().includes(q);
      const phoneMatch = lead.parent_phone.includes(q);
      const studentMatch = lead.student_name.toLowerCase().includes(q);
      const subject = store.subjects.find(s => s.id === lead.desired_subject_id);
      const subjectMatch = subject?.name.toLowerCase().includes(q);
      const multiSubMatch = lead.registered_subjects?.some(s => s.subject_name?.toLowerCase().includes(q));
      return codeMatch || parentMatch || phoneMatch || studentMatch || subjectMatch || multiSubMatch;
    }

    return true;
  });

  // Helper to extract registered subjects for any lead
  const getSubjectsForLead = (lead: ParentRegistration) => {
    if (lead.registered_subjects && lead.registered_subjects.length > 0) {
      return lead.registered_subjects;
    }
    const subject = store.subjects.find(s => s.id === lead.desired_subject_id);
    return [
      {
        subject_id: lead.desired_subject_id,
        subject_name: subject?.name || 'Môn ngoại khóa',
        time_slot: lead.desired_time_slot_type,
        time_slot_label: lead.desired_time_slot_type === 'after_school' ? 'Sau giờ chính khóa (16:45 - 18:15)' : 'Cuối tuần (Thứ 7 - CN)',
        estimated_fee: lead.estimated_fee || 3600000,
      }
    ];
  };

  // Open multi-subject enroll modal
  const handleOpenEnrollModal = (lead: ParentRegistration) => {
    setSelectedLeadForEnroll(lead);
    const existingCode = lead.assigned_student_code;
    const suggestedCode = existingCode || generateStudentCode(lead.is_royal_student, store.students);
    setCustomStudentCode(suggestedCode);

    const subjects = getSubjectsForLead(lead);
    const initialMap: Record<string, string> = {};
    const initialModes: Record<string, 'assign_now' | 'unassigned'> = {};
    const initialReasons: Record<string, string> = {};

    subjects.forEach(sub => {
      // If already assigned in lead, preserve it
      if (lead.assigned_class_ids && lead.assigned_class_ids.length > 0) {
        const alreadyClass = store.classes.find(c => c.subject_id === sub.subject_id && lead.assigned_class_ids?.includes(c.id));
        if (alreadyClass) {
          initialMap[sub.subject_id] = alreadyClass.id;
          initialModes[sub.subject_id] = 'assign_now';
          return;
        }
      }

      // Auto-match class: Prioritize active class in desired campus with available seats
      const campusClasses = store.classes.filter(
        c => c.campus_id === lead.desired_campus_id && c.subject_id === sub.subject_id && c.status === 'active'
      );
      const nonFullClass = campusClasses.find(c => {
        const enrolled = store.enrollments.filter(e => e.class_id === c.id && e.status === 'active').length;
        return enrolled < c.max_students;
      });

      const fallbackClass = campusClasses[0] || store.classes.find(c => c.subject_id === sub.subject_id && c.status === 'active');
      const matchedClass = nonFullClass || fallbackClass;

      if (matchedClass) {
        initialMap[sub.subject_id] = matchedClass.id;
        initialModes[sub.subject_id] = 'assign_now';
      } else {
        initialMap[sub.subject_id] = '';
        initialModes[sub.subject_id] = 'unassigned';
        initialReasons[sub.subject_id] = 'Lớp hiện tại đã kín chỗ / Chờ mở thêm ca';
      }
    });

    setAssignedClassesBySubject(initialMap);
    setSubjectAssignModes(initialModes);
    setUnassignedReasons(initialReasons);
    setEnrollNote(`Tiếp nhận từ hồ sơ tuyển sinh trực tuyến ${lead.registration_code || ''}`);
  };

  // Execute Multi-Class Enrollment
  const handleConfirmEnrollment = () => {
    if (!selectedLeadForEnroll) return;
    const lead = selectedLeadForEnroll;
    const subjects = getSubjectsForLead(lead);

    // Get selected class IDs ONLY for subjects whose mode is 'assign_now'
    const activeAssignedEntries = Object.entries(assignedClassesBySubject).filter(([subId, classId]) => {
      const mode = subjectAssignModes[subId] ?? 'assign_now';
      return mode === 'assign_now' && Boolean(classId);
    });

    const selectedClassIds = activeAssignedEntries.map(([_, classId]) => classId);
    const selectedClassObjects = selectedClassIds
      .map(id => store.classes.find(c => c.id === id))
      .filter((c): c is ExtracurricularClass => Boolean(c));

    const totalRequested = subjects.length;
    const assignedCount = selectedClassObjects.length;

    const studentCode = customStudentCode.trim() || generateStudentCode(lead.is_royal_student, store.students);
    
    // Check if student already exists in store
    const existingStudent = store.students.find(s => s.code === studentCode || (lead.assigned_student_code && s.code === lead.assigned_student_code));
    const studentId = existingStudent ? existingStudent.id : `std_${Date.now()}`;

    let newStudent: Student | null = null;
    if (!existingStudent) {
      newStudent = {
        id: studentId,
        code: studentCode,
        name: lead.student_name,
        dob: lead.student_dob,
        gender: 'Nam',
        parent_name: lead.parent_name,
        parent_phone: lead.parent_phone,
        school_name: lead.is_royal_student ? 'Royal School' : 'Trường ngoài',
        regular_class: lead.student_grade || (lead.is_royal_student ? 'Royal Primary' : 'Ngoài trường'),
        is_royal_student: lead.is_royal_student,
        medical_notes: lead.medical_notes,
        status: 'active',
        created_at: new Date().toISOString().split('T')[0],
      };
    }

    // 2. Tạo bản ghi ghi danh (enrollments) CHỈ cho các lớp được xếp ngay
    const existingEnrollmentsForStudent = store.enrollments.filter(e => e.student_id === studentId);
    const newEnrollments: Enrollment[] = [];

    selectedClassObjects.forEach((cls, idx) => {
      const alreadyInClass = existingEnrollmentsForStudent.some(e => e.class_id === cls.id);
      if (!alreadyInClass) {
        newEnrollments.push({
          id: `enr_${Date.now()}_${idx}`,
          student_id: studentId,
          class_id: cls.id,
          registered_sessions: cls.total_sessions || 24,
          joined_date: new Date().toISOString().split('T')[0],
          status: 'active',
        });
      }
    });

    // 3. Tạo hóa đơn học phí tương ứng (invoices) CHỈ cho các lớp được xếp ngay
    const newInvoices: TuitionInvoice[] = [];
    selectedClassObjects.forEach((cls, idx) => {
      // Check if invoice for this class and student already exists
      const alreadyInvoiced = store.invoices.some(inv => inv.student_id === studentId && inv.class_id === cls.id);
      if (!alreadyInvoiced) {
        const tuitionRate = getEffectivePrice(cls.term_id, cls.campus_id, cls.subject_id, store);
        const grossAmount = cls.full_course_fee || tuitionRate.course_fee || 3600000;
        const discountAmount = lead.is_royal_student ? Math.round(grossAmount * 0.05) : 0;
        const netAmount = Math.max(0, grossAmount - discountAmount);

        newInvoices.push({
          id: `inv_${Date.now()}_${idx}`,
          invoice_code: `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}${idx + 1}`,
          student_id: studentId,
          class_id: cls.id,
          gross_amount: grossAmount,
          credit_deducted: 0,
          net_payable: netAmount,
          paid_amount: 0,
          outstanding_amount: netAmount,
          payment_status: 'unpaid',
          created_at: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });
      }
    });

    // 4. Cập nhật trạng thái đơn đăng ký (parentRegistrations)
    // - Đủ 100% môn: 'enrolled'
    // - Xếp 1 phần: 'partially_enrolled'
    // - 0 môn xếp (Lưu chờ xếp lớp): 'contacted'
    const isFullEnrollment = assignedCount === totalRequested && totalRequested > 0;
    const isPartialEnrollment = assignedCount > 0 && assignedCount < totalRequested;
    const newStatus: 'enrolled' | 'partially_enrolled' | 'contacted' = isFullEnrollment
      ? 'enrolled'
      : isPartialEnrollment
      ? 'partially_enrolled'
      : 'contacted';

    const assignedNames = selectedClassObjects.map(c => c.name).join(', ');
    const unassignedSubjectsList = subjects
      .filter(s => (subjectAssignModes[s.subject_id] === 'unassigned') || !assignedClassesBySubject[s.subject_id])
      .map(s => {
        const reason = unassignedReasons[s.subject_id] ? ` [Lý do: ${unassignedReasons[s.subject_id]}]` : '';
        return `${s.subject_name}${reason}`;
      })
      .join('; ');

    let updatedNote = '';
    if (newStatus === 'enrolled') {
      updatedNote = `Đã phân bổ đủ ${assignedCount}/${totalRequested} môn: ${assignedNames} (Mã HV: ${studentCode}). ${enrollNote}`;
    } else if (newStatus === 'partially_enrolled') {
      updatedNote = `Đã phân bổ ${assignedCount}/${totalRequested} môn: ${assignedNames}. Chờ mở lớp: ${unassignedSubjectsList} (Mã HV: ${studentCode}). ${enrollNote}`;
    } else {
      updatedNote = `Đã tiếp nhận hồ sơ & cấp Mã HV: ${studentCode}. Toàn bộ ${totalRequested} môn chuyển danh sách Chờ xếp lớp: ${unassignedSubjectsList}. ${enrollNote}`;
    }

    const assignLog = createAuditRecord(
      'CLASS_ASSIGN',
      'ACADEMIC',
      'Xếp lớp Đa môn Tuyển sinh',
      `Tiếp nhận đơn ${lead.registration_code || lead.id}: Xếp ${assignedCount}/${totalRequested} môn cho học sinh ${lead.student_name} (Mã HV: ${studentCode})`,
      null,
      {
        target_id: lead.registration_code || lead.id,
        details: {
          status: 'success',
          after: {
            registration_code: lead.registration_code || lead.id,
            student_code: studentCode,
            assigned_classes: selectedClassIds,
            status: newStatus,
            enrollments_count: newEnrollments.length,
            invoices_count: newInvoices.length,
          }
        }
      }
    );

    // Merge newly assigned class IDs with previously assigned ones
    const mergedClassIds = Array.from(new Set([...(lead.assigned_class_ids || []), ...selectedClassIds]));

    onUpdateStore(prev => ({
      ...prev,
      students: newStudent 
        ? [newStudent, ...prev.students] 
        : prev.students.map(s => 
            s.id === studentId 
              ? {
                  ...s,
                  medical_notes: s.medical_notes || lead.medical_notes,
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
              assigned_class_id: selectedClassObjects[0]?.id || r.assigned_class_id,
              assigned_class_ids: mergedClassIds,
              assigned_student_code: studentCode,
              contact_notes: updatedNote,
            } 
          : r
      ),
      auditLogs: [assignLog, ...(prev.auditLogs || [])],
    }));

    if (newStatus === 'enrolled') {
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

  return (
    <div className="space-y-6">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-slate-950 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

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

      {/* FILTER & SEARCH BAR */}
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

        <div className="flex items-center gap-2 shrink-0">
          <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        </div>

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

            return (
              <div 
                key={lead.id}
                className="rounded-3xl p-5 bg-gradient-to-b from-[#111827] to-[#0D131F] border border-slate-800/80 hover:border-amber-500/40 transition-all flex flex-col justify-between shadow-xl shadow-black/30 space-y-4"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-white text-base">{lead.student_name}</h4>
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

                    {/* Status Badge */}
                    {lead.status === 'enrolled' ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold shrink-0 flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>Đã Xếp Đủ</span>
                      </span>
                    ) : lead.status === 'partially_enrolled' ? (
                      <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-extrabold shrink-0 flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        <span>Xếp Một Phần</span>
                      </span>
                    ) : lead.status === 'contacted' ? (
                      <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-extrabold shrink-0 flex items-center gap-1">
                        <PhoneCall className="w-3 h-3" />
                        <span>Đã Tư Vấn</span>
                      </span>
                    ) : lead.status === 'canceled' ? (
                      <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 text-[10px] shrink-0">
                        Đã Hủy
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-extrabold shrink-0 flex items-center gap-1 animate-pulse">
                        <Clock className="w-3 h-3" />
                        <span>Chờ Tiếp Nhận</span>
                      </span>
                    )}
                  </div>

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
                    {lead.registered_subjects && lead.registered_subjects.length > 0 ? (
                      <div className="space-y-1.5 p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                        <div className="text-[11px] font-bold text-amber-300 flex items-center justify-between">
                          <span>Môn học đăng ký ({lead.registered_subjects.length} môn):</span>
                          {lead.estimated_fee && (
                            <span className="font-mono text-emerald-400 font-bold">{formatVND(lead.estimated_fee)}</span>
                          )}
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                          {lead.registered_subjects.map((subItem, idx) => {
                            const assignedClassForSub = store.classes.find(
                              c => c.subject_id === subItem.subject_id && lead.assigned_class_ids?.includes(c.id)
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
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Môn đăng ký:</span>
                          <span className="font-bold text-amber-300">{subject?.name || 'Môn ngoại khóa'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Khung giờ:</span>
                          <span className="text-slate-300">
                            {lead.desired_time_slot_type === 'after_school' ? 'Sau giờ học (16:45 - 18:15)' : 'Cuối tuần'}
                          </span>
                        </div>
                      </div>
                    )}

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
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenContactModal(lead)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                    title="Cập nhật ghi chú tư vấn hoặc đổi trạng thái"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Ghi Chú</span>
                  </button>

                  {lead.status !== 'enrolled' ? (
                    <button
                      onClick={() => handleOpenEnrollModal(lead)}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md shadow-amber-500/20"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{lead.status === 'partially_enrolled' ? '+ Xếp Lớp Bổ Sung' : 'Tiếp Nhận & Xếp Lớp'}</span>
                    </button>
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
                          title="Chuyển tới Hồ Sơ Học Viên & Y Tế"
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
                  <th className="py-3 px-4">Mã Đơn / Ngày</th>
                  <th className="py-3 px-4">Học Sinh</th>
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

                  return (
                    <tr key={lead.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* 1. Mã Đơn / Ngày */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-amber-400 font-bold">{lead.registration_code || lead.id}</div>
                        <div className="text-[10px] text-slate-500">{lead.created_at}</div>
                      </td>

                      {/* 2. Học Sinh */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{lead.student_name}</div>
                        <div className="text-[10px] text-slate-400">{lead.student_grade || 'Sinh: ' + lead.student_dob}</div>
                      </td>

                      {/* 3. Môn Học */}
                      <td className="py-3 px-4">
                        {lead.registered_subjects && lead.registered_subjects.length > 0 ? (
                          <div className="space-y-1">
                            <span className="font-bold text-amber-300">{lead.registered_subjects.length} môn:</span>
                            <div className="text-[11px] text-slate-300">
                              {lead.registered_subjects.map(s => s.subject_name).join(', ')}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-amber-300">{subject?.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {lead.desired_time_slot_type === 'after_school' ? 'Sau giờ học' : 'Cuối tuần'}
                            </div>
                          </div>
                        )}
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
                      <td className="py-3 px-4 text-[11px] max-w-xs">
                        {lead.medical_notes ? (
                          <span className="p-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 block truncate" title={lead.medical_notes}>
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
                            Chờ liên hệ
                          </span>
                        )}
                      </td>

                      {/* 9. Thao Tác */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenContactModal(lead)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                            title="Cập nhật ghi chú tư vấn"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {lead.status !== 'enrolled' ? (
                            <button
                              onClick={() => handleOpenEnrollModal(lead)}
                              className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] transition-colors whitespace-nowrap"
                            >
                              {lead.status === 'partially_enrolled' ? '+ Xếp bổ sung' : 'Tiếp Nhận'}
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-emerald-400 text-[11px] font-bold font-mono">
                                {lead.assigned_student_code}
                              </span>
                              {onNavigateToStudents && lead.assigned_student_code && (
                                <button
                                  onClick={() => onNavigateToStudents(lead.assigned_student_code)}
                                  className="p-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-0.5 transition-colors"
                                  title="Xem tại Hồ Sơ Học Viên & Y Tế"
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

            const daysA = clsA.days_of_week && clsA.days_of_week.length > 0
              ? clsA.days_of_week
              : (store.timeSlots.find(ts => ts.id === clsA.time_slot_id)?.days_of_week || []);
            const daysB = clsB.days_of_week && clsB.days_of_week.length > 0
              ? clsB.days_of_week
              : (store.timeSlots.find(ts => ts.id === clsB.time_slot_id)?.days_of_week || []);

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

        // Real-time Tuition Calculation
        const totalGross = selectedClassObjects.reduce((acc, c) => acc + (c.full_course_fee || 3600000), 0);
        const discountAmount = lead.is_royal_student ? Math.round(totalGross * 0.05) : 0;
        const totalNet = Math.max(0, totalGross - discountAmount);

        const totalRequested = subjects.length;
        const assignedCount = selectedClassObjects.length;
        const unassignedCount = totalRequested - assignedCount;
        const isFull = assignedCount === totalRequested && assignedCount > 0;
        const isPartial = assignedCount > 0 && assignedCount < totalRequested;
        const isAllUnassigned = assignedCount === 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
            <div className="w-full max-w-3xl rounded-3xl bg-[#0D131F] border border-amber-500/40 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-fadeIn my-auto">
              
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-black text-white">
                        Tiếp Nhận & Xếp Lớp Ghi Danh (Đa Môn)
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/30">
                        {lead.registration_code || lead.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Phân bổ lớp học ngoại khóa tương ứng theo từng môn phụ huynh đã đăng ký
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
                
                {/* 1. Lead Summary Info Card */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 text-xs space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-slate-400">Học sinh:</span>{' '}
                      <strong className="text-white text-sm">{lead.student_name}</strong>
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

                  {lead.medical_notes && (
                    <div className="pt-2 border-t border-slate-900 text-[11px] text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span><strong>Lưu ý y tế:</strong> {lead.medical_notes}</span>
                    </div>
                  )}
                </div>

                {/* 2. Official Student Code Configuration */}
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
                      Gợi ý: Vui lòng chuyển ca học cho 1 trong 2 lớp trên hoặc chọn <em>&ldquo;[ Tạm thời chưa xếp lớp môn này ]&rdquo;</em> để tránh trùng giờ của bé.
                    </p>
                  </div>
                )}

                {/* 4. Dynamic Multi-Class Assignment List (Danh sách phân bổ lớp tương ứng theo từng môn) */}
                <div className="space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      <span>Danh Sách Phân Bổ Lớp Cho Từng Môn ({subjects.length} môn đăng ký)</span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Đã chọn xếp: <strong className="text-emerald-400 font-bold">{assignedCount}</strong>/{totalRequested} môn{' '}
                      <span className="text-amber-400 font-medium">({unassignedCount} môn chờ xếp)</span>
                    </span>
                  </div>

                  <div className="space-y-3">
                    {subjects.map((sub, idx) => {
                      const subjectObj = store.subjects.find(s => s.id === sub.subject_id);
                      const mode = subjectAssignModes[sub.subject_id] ?? 'assign_now';
                      const isAssignNow = mode === 'assign_now';
                      const currentSelectedClassId = assignedClassesBySubject[sub.subject_id] || '';
                      const selectedClassObj = isAssignNow ? store.classes.find(c => c.id === currentSelectedClassId) : null;
                      const reasonText = unassignedReasons[sub.subject_id] || '';

                      // Available classes matching this subject
                      const subjectClasses = store.classes.filter(c => c.subject_id === sub.subject_id && c.status === 'active');
                      // Sort so classes at desired campus appear first
                      const sortedClasses = [...subjectClasses].sort((a, b) => {
                        if (a.campus_id === lead.desired_campus_id && b.campus_id !== lead.desired_campus_id) return -1;
                        if (b.campus_id === lead.desired_campus_id && a.campus_id !== lead.desired_campus_id) return 1;
                        return 0;
                      });

                      return (
                        <div 
                          key={sub.subject_id || idx} 
                          className={`p-4 rounded-2xl border transition-all ${
                            isAssignNow && selectedClassObj
                              ? 'bg-slate-900/90 border-emerald-500/40 shadow-md ring-1 ring-emerald-500/10'
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
                                <div className="font-bold text-sm text-white">
                                  {sub.subject_name || subjectObj?.name || 'Môn ngoại khóa'}
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
                              {isAssignNow && selectedClassObj ? (
                                <span className="text-emerald-400 font-mono font-bold text-xs bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                                  {formatVND(selectedClassObj.full_course_fee)}
                                </span>
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
                                    setAssignedClassesBySubject(prev => ({ ...prev, [sub.subject_id]: sortedClasses[0].id }));
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
                            <div className="pt-3 space-y-2 text-xs animate-fadeIn">
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
                                }}
                                className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border font-medium focus:outline-none transition-colors ${
                                  currentSelectedClassId 
                                    ? 'border-emerald-500/60 text-white' 
                                    : 'border-slate-800 text-slate-400 focus:border-amber-500'
                                }`}
                              >
                                <option value="">-- Vui lòng chọn lớp học ngoại khóa --</option>
                                {sortedClasses.map(c => {
                                  const enrolledCount = store.enrollments.filter(e => e.class_id === c.id && e.status === 'active').length;
                                  const isFullClass = enrolledCount >= c.max_students;
                                  const days = c.days_of_week?.join(', ') || 'Lịch mở';
                                  const campusName = store.campuses.find(cp => cp.id === c.campus_id)?.name || 'Cơ sở';
                                  const isDesiredCampus = c.campus_id === lead.desired_campus_id;

                                  return (
                                    <option key={c.id} value={c.id}>
                                      {c.name} &bull; Sĩ số: {enrolledCount}/{c.max_students} &bull; {days} &bull; {formatVND(c.full_course_fee)} {isDesiredCampus ? '' : `(${campusName})`} {isFullClass ? '[HẾT CHỖ]' : ''}
                                    </option>
                                  );
                                })}
                              </select>

                              {/* Class Details Pill if chosen */}
                              {selectedClassObj ? (
                                <div className="mt-2 p-2.5 rounded-xl bg-slate-950/90 border border-emerald-500/30 text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2 shadow-sm">
                                  <div className="flex items-center gap-3">
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
                                  <div className="text-emerald-400 font-mono font-bold">
                                    Học phí thực tế: {formatVND(selectedClassObj.full_course_fee)}
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400 text-[11px] block">Tổng học phí gốc ({assignedCount} lớp):</span>
                      <span className="text-white font-bold font-mono text-base">{formatVND(totalGross)}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400 text-[11px] block">
                        {lead.is_royal_student ? 'Ưu đãi HS Royal (5%):' : 'Ưu đãi chính sách:'}
                      </span>
                      <span className={discountAmount > 0 ? 'text-amber-400 font-bold font-mono text-base' : 'text-slate-400 text-sm'}>
                        {discountAmount > 0 ? `-${formatVND(discountAmount)}` : '0 đ'}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                      <span className="text-emerald-300 font-bold text-[11px] block uppercase tracking-wider">
                        Tổng học phí thực nộp:
                      </span>
                      <span className="text-emerald-400 font-black font-mono text-xl sm:text-2xl tracking-tight">
                        {formatVND(totalNet)}
                      </span>
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
                  {isFull ? (
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
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
                      assignedCount > 0 
                        ? 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-amber-500/25 active:scale-95'
                        : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 shadow-sm active:scale-95'
                    }`}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>
                      {assignedCount > 0 
                        ? `Xác Nhận Xếp Lớp & Cấp Mã Học Viên (${assignedCount} lớp)`
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

    </div>
  );
};
