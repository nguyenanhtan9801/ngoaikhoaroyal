import React, { useState } from 'react';
import { 
  Users, 
  Send, 
  CheckCircle2, 
  PhoneCall, 
  GraduationCap, 
  School, 
  Clock, 
  HeartHandshake, 
  Sparkles,
  Search,
  Filter,
  Check,
  AlertCircle,
  QrCode,
  Calendar,
  ExternalLink,
  MessageSquare,
  Plus,
  Eye,
  Coffee,
  X,
  FileText,
  DollarSign,
  Phone,
  Mail,
  UserCheck,
  UserX,
  BookOpen
} from 'lucide-react';
import { AppStore, generateStudentCode, formatVND, calculateCeilSessionRate, getEffectivePrice } from '../../lib/storage';
import { ParentRegistration, Student, UserRole, ExtracurricularClass, Enrollment, TuitionInvoice } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { RoyalLogo } from '../RoyalLogo';

interface ParentPortalTabProps {
  store: AppStore;
  currentRole: UserRole;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onOpenParentPortal?: () => void;
}

export const ParentPortalTab: React.FC<ParentPortalTabProps> = ({
  store,
  currentRole,
  onUpdateStore,
  onOpenParentPortal,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'contacted' | 'enrolled' | 'canceled'>('all');
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  // Modal Xếp lớp & Ghi danh chính thức
  const [selectedLeadForEnroll, setSelectedLeadForEnroll] = useState<ParentRegistration | null>(null);
  const [targetClassId, setTargetClassId] = useState<string>('');
  const [customStudentCode, setCustomStudentCode] = useState<string>('');
  const [enrollNote, setEnrollNote] = useState<string>('');

  // Modal Cập nhật ghi chú tư vấn
  const [editingLeadContact, setEditingLeadContact] = useState<ParentRegistration | null>(null);
  const [contactNoteInput, setContactNoteInput] = useState<string>('');
  const [contactStatusInput, setContactStatusInput] = useState<'pending' | 'contacted' | 'canceled'>('contacted');

  // Success alert toast banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // KPIs
  const totalLeads = store.parentRegistrations.length;
  const pendingLeads = store.parentRegistrations.filter(r => r.status === 'pending').length;
  const contactedLeads = store.parentRegistrations.filter(r => r.status === 'contacted').length;
  const enrolledLeads = store.parentRegistrations.filter(r => r.status === 'enrolled').length;
  const conversionRate = totalLeads > 0 ? Math.round((enrolledLeads / totalLeads) * 100) : 0;

  // Filtered Leads
  const filteredLeads = store.parentRegistrations.filter(lead => {
    if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
    if (campusFilter !== 'all' && lead.desired_campus_id !== campusFilter) return false;
    if (subjectFilter !== 'all' && lead.desired_subject_id !== subjectFilter) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const codeMatch = lead.registration_code?.toLowerCase().includes(q);
      const parentMatch = lead.parent_name.toLowerCase().includes(q);
      const phoneMatch = lead.parent_phone.includes(q);
      const studentMatch = lead.student_name.toLowerCase().includes(q);
      const subject = store.subjects.find(s => s.id === lead.desired_subject_id);
      const subjectMatch = subject?.name.toLowerCase().includes(q);
      return codeMatch || parentMatch || phoneMatch || studentMatch || subjectMatch;
    }

    return true;
  });

  // Open enroll modal
  const handleOpenEnrollModal = (lead: ParentRegistration) => {
    setSelectedLeadForEnroll(lead);
    const suggestedCode = generateStudentCode(lead.is_royal_student, store.students);
    setCustomStudentCode(suggestedCode);

    // Auto find best matching class
    const matchingClass = store.classes.find(
      c => c.campus_id === lead.desired_campus_id && c.subject_id === lead.desired_subject_id && c.status === 'active'
    ) || store.classes.find(c => c.subject_id === lead.desired_subject_id && c.status === 'active') || store.classes[0];

    setTargetClassId(matchingClass?.id || '');
    setEnrollNote(`Tiếp nhận từ hồ sơ tuyển sinh trực tuyến ${lead.registration_code || ''}`);
  };

  // Execute Enrollment
  const handleConfirmEnrollment = () => {
    if (!selectedLeadForEnroll || !targetClassId) return;

    const lead = selectedLeadForEnroll;
    const studentCode = customStudentCode.trim() || generateStudentCode(lead.is_royal_student, store.students);
    const cls = store.classes.find(c => c.id === targetClassId);
    if (!cls) return;

    const newStudentId = `std_${Date.now()}`;
    const newStudent: Student = {
      id: newStudentId,
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

    const newEnrollment: Enrollment = {
      id: `enr_${Date.now()}`,
      student_id: newStudentId,
      class_id: cls.id,
      registered_sessions: cls.total_sessions || 24,
      joined_date: new Date().toISOString().split('T')[0],
      status: 'active',
    };

    // Calculate fee
    const baseFee = cls.full_course_fee || (cls.price_per_session * cls.total_sessions);
    const discount = lead.is_royal_student ? Math.round(baseFee * 0.05) : 0;
    const netAmount = Math.max(0, baseFee - discount);

    const newInvoice: TuitionInvoice = {
      id: `inv_${Date.now()}`,
      invoice_code: `INV-${new Date().getFullYear()}-${String(store.invoices.length + 1).padStart(4, '0')}`,
      student_id: newStudentId,
      class_id: cls.id,
      gross_amount: baseFee,
      credit_deducted: 0,
      net_payable: netAmount,
      paid_amount: 0,
      outstanding_amount: netAmount,
      payment_status: 'unpaid',
      due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      created_at: new Date().toISOString().split('T')[0],
    };

    onUpdateStore(prev => ({
      ...prev,
      students: [newStudent, ...prev.students],
      enrollments: [...prev.enrollments, newEnrollment],
      invoices: [...prev.invoices, newInvoice],
      parentRegistrations: prev.parentRegistrations.map(r => 
        r.id === lead.id 
          ? { 
              ...r, 
              status: 'enrolled' as const, 
              assigned_class_id: cls.id,
              assigned_student_code: studentCode,
              contact_notes: enrollNote 
            } 
          : r
      ),
      notifications: [
        {
          id: `notif_enrolled_${Date.now()}`,
          type: 'enrollment_over_quota',
          title: 'Học viên mới đã ghi danh',
          message: `Học viên ${lead.student_name} (${studentCode}) đã được xếp vào lớp ${cls.name}.`,
          date: new Date().toISOString().split('T')[0],
          severity: 'low',
          read: false,
        },
        ...prev.notifications,
      ],
    }));

    showToast(`Đã tiếp nhận hồ sơ & cấp mã học viên ${studentCode} vào lớp ${cls.name}!`);
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
              QUẢN TRỊ ĐƠN ĐĂNG KÝ TUYỂN SINH (LEADS)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold">
              Tuyển sinh ngoại khóa
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Phụ huynh chỉ đăng ký môn học và cơ sở. Học vụ & Tuyển sinh liên hệ tư vấn, sắp thời khóa biểu và 1-chạm xếp lớp cấp mã học viên.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenParentPortal && (
            <button
              onClick={onOpenParentPortal}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all transform active:scale-95"
              title="Mở Cổng Phụ Huynh để phụ huynh đăng ký môn học hoặc trải nghiệm"
            >
              <Send className="w-3.5 h-3.5 text-slate-950" />
              <span>Mở Cổng Đăng Ký Môn Học (Phụ Huynh)</span>
              <ExternalLink className="w-3 h-3 text-slate-950" />
            </button>
          )}
        </div>
      </div>

      {/* KPI METRICS OVERVIEW CARDS (Apple UI style) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng Đơn Nhận</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1.5">{totalLeads}</div>
          <p className="text-[10px] text-slate-500 mt-0.5">Tất cả nguồn hồ sơ</p>
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
          <p className="text-[10px] text-cyan-300/80 mt-0.5">Đang chờ xác nhận lịch</p>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Đã Xếp Lớp</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1.5">{enrolledLeads}</div>
          <p className="text-[10px] text-emerald-300/80 mt-0.5">Thành học viên chính thức</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tỷ Lệ Chốt</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1.5">{conversionRate}%</div>
          <p className="text-[10px] text-slate-500 mt-0.5">Hiệu quả tuyển sinh</p>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROLS */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        
        {/* Left: Search box */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo Mã REG-, tên học sinh, PH hoặc SĐT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Right: Dropdowns & View Toggle */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tất cả trạng thái ({totalLeads})</option>
            <option value="pending">Chờ xử lý ({pendingLeads})</option>
            <option value="contacted">Đã liên hệ tư vấn ({contactedLeads})</option>
            <option value="enrolled">Đã ghi danh & xếp lớp ({enrolledLeads})</option>
            <option value="canceled">Đã hủy</option>
          </select>

          {/* Campus filter */}
          <select
            value={campusFilter}
            onChange={(e) => setCampusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500"
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
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tất cả môn học</option>
            {store.subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* View toggle */}
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
                className="rounded-3xl p-5 bg-gradient-to-b from-[#111827] to-[#0D131F] border border-slate-800/80 hover:border-amber-500/40 transition-all flex flex-col justify-between shadow-xl shadow-black/30"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-white text-base">{lead.student_name}</h4>
                        {lead.is_royal_student ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            Royal
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
                        <span>{lead.student_grade || 'Khối lớp chưa rõ'}</span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {lead.status === 'enrolled' ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold shrink-0 flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>Đã Xếp Lớp</span>
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
                      <span className="text-slate-400">Môn đăng ký:</span>
                      <span className="font-bold text-amber-300">{subject?.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Cơ sở mong muốn:</span>
                      <span className="text-slate-200">{campus?.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Khung giờ:</span>
                      <span className="text-slate-300">
                        {lead.desired_time_slot_type === 'after_school' ? 'Sau giờ học (16:45 - 18:15)' : 'Cuối tuần (Thứ 7 & CN)'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Suất bánh sữa:</span>
                      <span className={lead.is_royal_student ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {lead.is_royal_student ? 'Được phục vụ (HS Royal)' : 'Không áp dụng'}
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

                    {/* Enrolled details if already enrolled */}
                    {lead.status === 'enrolled' && (
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-300 space-y-1">
                        <div>Mã học viên: <strong className="font-mono text-amber-300">{lead.assigned_student_code}</strong></div>
                        {assignedClass && <div>Lớp: <strong>{assignedClass.name}</strong></div>}
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
                      <span>Tiếp Nhận & Xếp Lớp</span>
                    </button>
                  ) : (
                    <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Đã thành học viên</span>
                    </span>
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
                  <th className="py-3 px-4">Phụ Huynh Liên Hệ</th>
                  <th className="py-3 px-4">Học Sinh & Khối Lớp</th>
                  <th className="py-3 px-4">Môn Học & Cơ Sở</th>
                  <th className="py-3 px-4">Khung Giờ</th>
                  <th className="py-3 px-4">Phân Loại / Bánh Sữa</th>
                  <th className="py-3 px-4">Lưu Ý Y Tế</th>
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
                      <td className="py-3 px-4">
                        <div className="font-mono text-amber-400 font-bold">{lead.registration_code || lead.id}</div>
                        <div className="text-[10px] text-slate-500">{lead.created_at}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{lead.parent_name}</div>
                        <a href={`tel:${lead.parent_phone}`} className="text-[11px] text-amber-400 font-mono font-bold hover:underline">
                          {lead.parent_phone}
                        </a>
                        {lead.parent_email && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{lead.parent_email}</div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{lead.student_name}</div>
                        <div className="text-[10px] text-slate-400">{lead.student_grade || 'Sinh: ' + lead.student_dob}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-amber-300">{subject?.name}</div>
                        <div className="text-[10px] text-slate-400">{campus?.name}</div>
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        {lead.desired_time_slot_type === 'after_school' ? 'Sau giờ học (16:45)' : 'Cuối tuần'}
                      </td>

                      <td className="py-3 px-4">
                        {lead.is_royal_student ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold whitespace-nowrap">
                            Royal (Có bánh sữa)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] whitespace-nowrap">
                            Ngoài trường
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-rose-300 text-[11px] max-w-xs">
                        {lead.medical_notes ? (
                          <span className="p-1 rounded bg-rose-500/10 border border-rose-500/20 block truncate">
                            {lead.medical_notes}
                          </span>
                        ) : (
                          <span className="text-slate-500">Bình thường</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {lead.status === 'enrolled' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold">
                            Đã xếp lớp
                          </span>
                        ) : lead.status === 'contacted' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                            Đã tư vấn
                          </span>
                        ) : lead.status === 'canceled' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">
                            Đã hủy
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                            Chờ liên hệ
                          </span>
                        )}
                      </td>

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
                              Tiếp Nhận
                            </button>
                          ) : (
                            <span className="text-emerald-400 text-[11px] font-bold font-mono">
                              {lead.assigned_student_code}
                            </span>
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
        const matchingClasses = store.classes.filter(
          c => c.campus_id === lead.desired_campus_id && c.subject_id === lead.desired_subject_id && c.status === 'active'
        );
        const allClasses = store.classes.filter(c => c.status === 'active');
        const availableClasses = matchingClasses.length > 0 ? matchingClasses : allClasses;
        const chosenClass = store.classes.find(c => c.id === targetClassId) || availableClasses[0];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-5 animate-fadeIn">
              
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white">Tiếp Nhận & Xếp Lớp Ghi Danh</h3>
                    <p className="text-[11px] text-slate-400">Chuyển hồ sơ tuyển sinh thành học viên chính thức</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedLeadForEnroll(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Lead Summary Info */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Học sinh:</span>
                  <span className="text-white font-bold">{lead.student_name} ({lead.student_grade || lead.student_dob})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Phụ huynh:</span>
                  <span className="text-slate-200">{lead.parent_name} - {lead.parent_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Môn & Cơ sở nguyện vọng:</span>
                  <span className="text-amber-300 font-bold">
                    {store.subjects.find(s => s.id === lead.desired_subject_id)?.name} &bull; {store.campuses.find(c => c.id === lead.desired_campus_id)?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Phân loại học sinh:</span>
                  <span className={lead.is_royal_student ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                    {lead.is_royal_student ? 'Học sinh chính khóa Royal (Có bánh sữa + Ưu đãi 5%)' : 'Học sinh ngoài trường'}
                  </span>
                </div>
              </div>

              {/* Auto Generated Student Code */}
              <div className="text-xs space-y-1">
                <label className="block text-slate-300 font-semibold">
                  Mã học viên chính thức (Đề xuất theo chuẩn Royal):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customStudentCode}
                    onChange={(e) => setCustomStudentCode(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 font-mono text-amber-400 font-bold text-sm border border-slate-800 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomStudentCode(generateStudentCode(lead.is_royal_student, store.students))}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Tạo lại
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  {lead.is_royal_student ? 'Học sinh Royal bắt đầu bằng tiền tố RY-' : 'Học sinh ngoài bắt đầu bằng tiền tố EXT-'}
                </p>
              </div>

              {/* Select Extracurricular Class */}
              <div className="text-xs space-y-1">
                <label className="block text-slate-300 font-semibold">
                  Chọn lớp học ngoại khóa chính thức:
                </label>
                <select
                  value={targetClassId}
                  onChange={(e) => setTargetClassId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500"
                >
                  {availableClasses.map(c => {
                    const enrolledCount = store.enrollments.filter(e => e.class_id === c.id && e.status === 'active').length;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({enrolledCount}/{c.max_students} học viên) - {formatVND(c.full_course_fee)}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Action Note */}
              <div className="text-xs space-y-1">
                <label className="block text-slate-300 font-semibold">Ghi chú lưu học vụ:</label>
                <input
                  type="text"
                  value={enrollNote}
                  onChange={(e) => setEnrollNote(e.target.value)}
                  placeholder="Ghi chú tiếp nhận..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedLeadForEnroll(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmEnrollment}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/25"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Xác Nhận Xếp Lớp & Cấp Mã Học Viên</span>
                </button>
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
                <option value="pending">Chờ liên hệ (Pending)</option>
                <option value="contacted">Đã liên hệ tư vấn (Contacted)</option>
                <option value="canceled">Đã hủy / Phụ huynh không đăng ký (Canceled)</option>
              </select>
            </div>

            <div className="text-xs space-y-1">
              <label className="block text-slate-300 font-semibold">Nội dung cuộc gọi / Ghi chú tư vấn:</label>
              <textarea
                rows={3}
                value={contactNoteInput}
                onChange={(e) => setContactNoteInput(e.target.value)}
                placeholder="Ví dụ: Đã gọi lúc 10h sáng. Phụ huynh hẹn Thứ 6 đến tham quan sân bóng rổ và đóng phí..."
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
