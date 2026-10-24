import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Send, 
  CheckCircle2, 
  User, 
  Phone, 
  Calendar, 
  Clock, 
  Award, 
  BookOpen, 
  Mail, 
  Check, 
  Activity, 
  Palette, 
  Code, 
  Sparkles, 
  Search, 
  Info,
  Copy,
  Share2,
  Trash2,
  Users as UsersIcon,
  ExternalLink,
  ShieldAlert,
  Lock,
  LogIn,
  LogOut,
  RefreshCw
} from 'lucide-react';
import { supabase, getSupabaseClient } from '@/supabaseClient';
import { AppStore, formatVND, getEffectivePrice, matchLeadWithDatabase } from '../lib/storage';
import { formatCapitalizedName } from '../lib/formatters';
import { Student, ParentRegistration, UserRole, RegisteredSubjectItem, AppUser } from '../types';
import { RoyalLogo } from './RoyalLogo';

interface ParentPortalModalProps {
  store: AppStore;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  initialStudent?: Student | null;
  onNavigateToAdminLeads?: () => void;
  currentRole?: UserRole;
  isStandalonePage?: boolean;
  currentUser?: AppUser | null;
  onOpenAdminLogin?: () => void;
  onLogout?: () => void;
  onRegistrationSuccess?: () => void;
}

export const TIME_SLOT_OPTIONS = [
  { value: 'after_school', label: 'Sau giờ chính khóa (16:45 - 18:15)' },
  { value: 'sat_morning', label: 'Sáng Thứ Bảy (08:30 - 10:00)' },
  { value: 'sat_afternoon', label: 'Chiều Thứ Bảy (15:00 - 16:30)' },
  { value: 'sun_morning', label: 'Sáng Chủ Nhật (08:30 - 10:00)' },
  { value: 'sun_afternoon', label: 'Chiều Chủ Nhật (15:00 - 16:30)' },
  { value: 'evening', label: 'Ca tối ngày thường (18:15 - 19:45)' },
];

export type PortalStep = 'form' | 'success';

export interface ParentRegistrationSummary {
  leadCode: string;
  parentName: string;
  parentPhone: string;
  parentEmail?: string;
  studentName: string;
  studentGrade?: string;
  campusName: string;
  termName: string;
  registeredSubjects: {
    name: string;
    category: string;
    timeSlotLabel: string;
    fee: number;
  }[];
  isRoyal: boolean;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  discountNote: string;
  submittedAt: string;
}

export const ParentPortalModal: React.FC<ParentPortalModalProps> = ({
  store,
  isOpen,
  onClose,
  onUpdateStore,
  onNavigateToAdminLeads,
  currentRole,
  isStandalonePage = false,
  currentUser,
  onOpenAdminLogin,
  onLogout,
  onRegistrationSuccess,
}) => {
  // Trạng thái gửi đơn vào Supabase
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check role authorization for "Xem hồ sơ tiếp nhận"
  // CHỈ HIỆN CHO NHÂN SỰ ĐƯỢC PHÂN CÔNG LÀ TUYỂN SINH, GIÁO VỤ HOẶC ADMIN
  const isAuthorizedStaff = Boolean(
    currentRole && [
      'super_admin',
      'admissions',
      'academic_admissions'
    ].includes(currentRole)
  );

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // Phone number formatter
  const formatPhoneNumber = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  };

  const activeTerm = store.terms.find(t => t.is_active || t.status === 'open_enrollment') || store.terms[0];

  // 1. THÔNG TIN HỌC SINH VÀ PHỤ HUYNH
  const [regForm, setRegForm] = useState({
    student_name: '',
    student_dob: '2016-05-15',
    student_grade: 'Lớp 3 - Tiểu học',
    is_royal_student: true,
    medical_notes: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    desired_campus_id: store.campuses[0]?.id || '',
    desired_term_id: activeTerm?.id || '',
    notes: '',
  });

  // 2. MÔN HỌC ĐĂNG KÝ: CÓ THỂ CHỌN NHIỀU MÔN, GIỜ HỌC CHO MỖI MÔN
  const [selectedSubjectConfigs, setSelectedSubjectConfigs] = useState<
    { subjectId: string; timeSlot: string; timeSlotLabel: string }[]
  >(() => {
    const firstSub = store.subjects[0];
    return firstSub
      ? [{ subjectId: firstSub.id, timeSlot: 'after_school', timeSlotLabel: 'Sau giờ chính khóa (16:45 - 18:15)' }]
      : [];
  });

  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  
  // Step Management: 'form' | 'success'
  const [currentStep, setCurrentStep] = useState<PortalStep>('form');
  const [submittedRegistration, setSubmittedRegistration] = useState<ParentRegistrationSummary | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when step transitions to 'success' or 'form'
  useEffect(() => {
    if (!isOpen) return;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (isStandalonePage && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep, isStandalonePage, isOpen]);

  if (!isOpen) return null;

  // Selected campus & term entities
  const selectedCampus = store.campuses.find(c => c.id === regForm.desired_campus_id) || store.campuses[0];
  const selectedTerm = store.terms.find(t => t.id === regForm.desired_term_id) || activeTerm;

  // Handle Medical chip toggle
  const medicalChips = [
    'Dị ứng sữa bò tươi',
    'Dị ứng đậu phộng / hạt',
    'Nhạy cảm nước lạnh',
    'Tiền sử hen suyễn / hô hấp',
    'Cần uống sữa hạt không đường',
    'Thể trạng bình thường, tốt',
  ];

  const handleToggleMedicalChip = (chip: string) => {
    if (chip === 'Thể trạng bình thường, tốt') {
      setRegForm(prev => ({ ...prev, medical_notes: 'Bình thường, thể trạng tốt' }));
      return;
    }
    const current = regForm.medical_notes ? regForm.medical_notes.split(',').map(s => s.trim()) : [];
    if (current.includes(chip)) {
      const filtered = current.filter(c => c !== chip && c !== 'Bình thường, thể trạng tốt');
      setRegForm(prev => ({ ...prev, medical_notes: filtered.join(', ') }));
    } else {
      const filtered = current.filter(c => c !== 'Bình thường, thể trạng tốt');
      filtered.push(chip);
      setRegForm(prev => ({ ...prev, medical_notes: filtered.join(', ') }));
    }
  };

  // Toggle Subject Selection (Multi-select)
  const handleToggleSubject = (subjectId: string) => {
    setSelectedSubjectConfigs(prev => {
      const exists = prev.some(c => c.subjectId === subjectId);
      if (exists) {
        return prev.filter(c => c.subjectId !== subjectId);
      } else {
        return [
          ...prev,
          {
            subjectId,
            timeSlot: 'after_school',
            timeSlotLabel: 'Sau giờ chính khóa (16:45 - 18:15)',
          },
        ];
      }
    });
    if (formErrors.subjects) {
      setFormErrors(prev => ({ ...prev, subjects: '' }));
    }
  };

  // Change Time Slot for a specific Subject
  const handleChangeSubjectTimeSlot = (subjectId: string, newSlotValue: string) => {
    const slotObj = TIME_SLOT_OPTIONS.find(o => o.value === newSlotValue);
    const label = slotObj ? slotObj.label : newSlotValue;

    setSelectedSubjectConfigs(prev =>
      prev.map(c =>
        c.subjectId === subjectId
          ? { ...c, timeSlot: newSlotValue, timeSlotLabel: label }
          : c
      )
    );
  };

  // Remove Subject from selection
  const handleRemoveSubject = (subjectId: string) => {
    setSelectedSubjectConfigs(prev => prev.filter(c => c.subjectId !== subjectId));
  };

  // Calculate pricing for each selected subject
  const detailedSelectedSubjects = selectedSubjectConfigs.map(c => {
    const sub = store.subjects.find(s => s.id === c.subjectId);
    const pricing = getEffectivePrice(
      regForm.desired_term_id,
      regForm.desired_campus_id,
      c.subjectId,
      store
    );
    const fee = pricing.course_fee || pricing.base_course_fee || 3600000;
    return {
      ...c,
      subject: sub,
      fee,
    };
  });

  const totalBaseFee = detailedSelectedSubjects.reduce((sum, item) => sum + item.fee, 0);
  const finalTotalAmount = totalBaseFee;

  // Copy Direct Link to Clipboard for sending to parents
  const handleCopyPortalLink = () => {
    try {
      const origin = window.location.origin || '';
      const pathname = window.location.pathname || '/';
      const shareUrl = `${origin}${pathname}?portal=parent`;
      navigator.clipboard.writeText(shareUrl);
      setCopyToast(`Đã sao chép link Cổng Phụ Huynh: ${shareUrl}`);
      setTimeout(() => setCopyToast(null), 3500);
    } catch {
      setCopyToast('Đã sao chép link Cổng Phụ Huynh!');
      setTimeout(() => setCopyToast(null), 3500);
    }
  };

  // Filtered Subject Catalog
  const filteredSubjects = store.subjects.filter(s => {
    if (selectedCategory !== 'all' && s.category !== selectedCategory) return false;
    if (subjectSearch.trim()) {
      const q = subjectSearch.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const categoriesList = Array.from(new Set(store.subjects.map(s => s.category)));

  const getSubjectIcon = (category: string) => {
    switch (category) {
      case 'Thể thao':
        return <Activity className="w-5 h-5 text-amber-400" />;
      case 'Nghệ thuật':
        return <Palette className="w-5 h-5 text-purple-400" />;
      case 'Kỹ năng số':
      case 'Khoa học công nghệ':
        return <Code className="w-5 h-5 text-cyan-400" />;
      case 'Học thuật':
        return <BookOpen className="w-5 h-5 text-emerald-400" />;
      default:
        return <Sparkles className="w-5 h-5 text-amber-400" />;
    }
  };

  // Handle Form Submit / Gửi Đơn Đăng Ký Tuyển Sinh vào CSDL Supabase
  const handleSubmitRegistration = async (e?: React.FormEvent) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const errors: { [key: string]: string } = {};

    if (!regForm.student_name.trim()) {
      errors.student_name = 'Vui lòng nhập họ tên học sinh';
    }
    if (!regForm.parent_name.trim()) {
      errors.parent_name = 'Vui lòng nhập họ tên phụ huynh';
    }
    const cleanPhone = regForm.parent_phone.replace(/\s+/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      errors.parent_phone = 'Vui lòng nhập số điện thoại hợp lệ (từ 10 chữ số)';
    }
    if (selectedSubjectConfigs.length === 0) {
      errors.subjects = 'Vui lòng chọn ít nhất 1 môn học ngoại khóa cho bé';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    // Tạo mã đăng ký ngẫu nhiên chuẩn Royal School
    const currentYear = new Date().getFullYear();
    const regCode = `REG-${currentYear}-${Math.floor(100000 + Math.random() * 900000)}`;
    const campus = selectedCampus;
    const term = selectedTerm;

    // Chuẩn bị dữ liệu danh sách môn học đã chọn kèm khung giờ
    const formattedSubjects = detailedSelectedSubjects.map((sub: any) => ({
      subject_id: sub.subjectId || sub.id,
      subject_code: sub.subject?.code || sub.subjectId,
      subject_name: sub.subject?.name || 'Môn ngoại khóa',
      category: sub.subject?.category_code || sub.subject?.category || 'Ngoại khóa',
      time_slot: sub.timeSlotLabel || sub.selected_time_slot || sub.timeSlot || 'Sau giờ chính khóa (16:45 - 18:15)',
      fee: sub.fee || sub.standard_course_fee || 3990000
    }));

    const subjectNamesList = formattedSubjects.map(s => s.subject_name).join(', ');

    const discountPolicy = regForm.is_royal_student
      ? `Học sinh chính khóa Royal School (Được phục vụ suất ăn nhẹ bánh sữa sau giờ)`
      : `Học sinh Ngoài trường / Vãng lai (${detailedSelectedSubjects.length} môn - Không áp dụng suất bánh sữa)`;

    const campusIdShort = (regForm.desired_campus_id || 'camp_pmh').replace(/^camp_/, '') || 'pmh';

    const payload = {
      reg_code: regCode,
      student_name: regForm.student_name.trim(),
      student_dob: regForm.student_dob || null,
      student_grade: regForm.student_grade || 'Lớp 3 - Tiểu học',
      student_type: regForm.is_royal_student ? 'royal' : 'external', // 'royal' | 'external'
      medical_notes: regForm.medical_notes?.trim() || 'Bình thường',
      parent_name: regForm.parent_name.trim(),
      parent_phone: regForm.parent_phone.trim(),
      parent_email: regForm.parent_email?.trim() || '',
      campus_id: campusIdShort, // 'pmh' | 'pl'
      term_name: term?.name || 'KHÓA HỌC 1 (Đang mở tuyển sinh)',
      selected_subjects: formattedSubjects,
      total_estimated_fee: finalTotalAmount || 0,
      parent_notes: regForm.notes?.trim() || '',
      status: 'pending', // Trạng thái mặc định: Chờ xử lý
      submitted_at: new Date().toISOString()
    };

    let insertedId = `preg_${Date.now()}`;

    try {
      setIsSubmitting(true);
      const client = supabase || getSupabaseClient();
      if (client) {
        const { data, error } = await client
          .from('parent_registrations')
          .insert([payload])
          .select();

        if (error) {
          console.error('Lỗi Supabase khi lưu đơn:', error);
          alert('Không thể lưu đơn đăng ký: ' + error.message);
          setIsSubmitting(false);
          return;
        }

        if (data && data[0] && data[0].id) {
          insertedId = data[0].id;
        }
      }

      // Hiển thị thông báo thành công và chuyển sang màn hình xác nhận / đóng modal
      alert(`Đăng ký thành công! Mã tiếp nhận của bé là: ${regCode}`);
      
      // Gọi callback reload danh sách nếu đang mở trong giao diện quản trị
      if (typeof onRegistrationSuccess === 'function') {
        onRegistrationSuccess();
      }
    } catch (err: any) {
      console.error('Lỗi ngoại lệ:', err);
      alert('Không thể lưu đơn đăng ký: ' + (err?.message || 'Lỗi không xác định'));
      setIsSubmitting(false);
      return;
    } finally {
      setIsSubmitting(false);
    }

    const registeredSubjectItems: RegisteredSubjectItem[] = detailedSelectedSubjects.map(item => ({
      subject_id: item.subjectId,
      subject_name: item.subject?.name || 'Môn ngoại khóa',
      time_slot: item.timeSlot,
      time_slot_label: item.timeSlotLabel,
      estimated_fee: item.fee,
    }));

    const draftLead: ParentRegistration = {
      id: insertedId,
      registration_code: regCode,
      code: regCode,
      reg_code: regCode,
      parent_name: regForm.parent_name.trim(),
      parent_phone: regForm.parent_phone.trim(),
      parent_email: regForm.parent_email.trim() || undefined,
      student_name: regForm.student_name.trim(),
      student_dob: regForm.student_dob,
      dob: regForm.student_dob,
      student_grade: regForm.student_grade,
      student_type: regForm.is_royal_student ? 'royal' : 'external',
      desired_campus_id: regForm.desired_campus_id,
      campus_id: campusIdShort,
      desired_term_id: regForm.desired_term_id,
      term_name: payload.term_name,
      desired_subject_id: selectedSubjectConfigs[0]?.subjectId || '',
      desired_time_slot_type: selectedSubjectConfigs[0]?.timeSlot === 'after_school' ? 'after_school' : 'weekend',
      registered_subjects: registeredSubjectItems,
      selected_subjects: formattedSubjects,
      is_royal_student: regForm.is_royal_student,
      is_royal: regForm.is_royal_student,
      medical_notes: payload.medical_notes,
      notes: payload.parent_notes,
      parent_notes: payload.parent_notes,
      estimated_fee: finalTotalAmount,
      total_estimated_fee: finalTotalAmount,
      discount_policy: discountPolicy,
      status: 'pending',
      created_at: payload.submitted_at,
      submitted_at: payload.submitted_at,
    };

    const matchRes = matchLeadWithDatabase(draftLead, store);
    const newLead: ParentRegistration = {
      ...draftLead,
      linked_student_id: matchRes.matchedStudent?.id,
    };

    // Live sync to store
    onUpdateStore(prev => ({
      ...prev,
      parentRegistrations: [newLead, ...prev.parentRegistrations.filter(r => r.id !== newLead.id)],
      notifications: [
        {
          id: `notif_lead_${Date.now()}`,
          type: 'new_lead_registration',
          title: matchRes.matchedStudent
            ? `Đơn đăng ký thêm môn từ Học viên hiện tại (${matchRes.matchedStudent.code})`
            : 'Đơn đăng ký mới từ Cổng Phụ Huynh',
          message: matchRes.matchedStudent
            ? `Phụ huynh ${regForm.parent_name} vừa đăng ký thêm ${detailedSelectedSubjects.length} môn (${subjectNamesList}) cho học sinh ${matchRes.matchedStudent.name} (${matchRes.matchedStudent.code}).`
            : `Phụ huynh ${regForm.parent_name} vừa đăng ký ${detailedSelectedSubjects.length} môn (${subjectNamesList}) cho bé ${regForm.student_name} tại cơ sở ${campus?.name || 'Royal School'}.`,
          date: new Date().toISOString().split('T')[0],
          severity: 'medium',
          read: false,
        },
        ...prev.notifications,
      ],
    }));

    const summary: ParentRegistrationSummary = {
      leadCode: regCode,
      parentName: regForm.parent_name.trim(),
      parentPhone: regForm.parent_phone.trim(),
      parentEmail: regForm.parent_email.trim() || undefined,
      studentName: regForm.student_name.trim(),
      studentGrade: regForm.student_grade,
      campusName: campus?.name || 'Royal School',
      termName: term?.name || 'Niên khóa hiện tại',
      registeredSubjects: detailedSelectedSubjects.map(item => ({
        name: item.subject?.name || 'Môn ngoại khóa',
        category: item.subject?.category || 'Ngoại khóa',
        timeSlotLabel: item.timeSlotLabel,
        fee: item.fee,
      })),
      isRoyal: regForm.is_royal_student,
      totalAmount: totalBaseFee,
      discountAmount: 0,
      finalAmount: finalTotalAmount,
      discountNote: discountPolicy,
      submittedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('vi-VN'),
    };

    setSubmittedRegistration(summary);
    setCurrentStep('success');

    // Auto-scroll to top smoothly upon submission
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (isStandalonePage && typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 50);
  };

  const handleRegisterSubmit = handleSubmitRegistration;

  // Reset form and transition back to 'form' step for registering another child
  const handleRegisterAnotherChild = () => {
    setRegForm(prev => ({
      ...prev,
      student_name: '',
      student_dob: '2016-05-15',
      student_grade: 'Lớp 3 - Tiểu học',
      is_royal_student: true,
      medical_notes: '',
      notes: '',
    }));
    setFormErrors({});
    setCurrentStep('form');
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (isStandalonePage && typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 50);
  };

  const portalContent = (
    <div className={`w-full ${isStandalonePage ? 'min-h-screen bg-[#07090E]' : 'max-w-5xl h-[94vh] max-h-[94vh] rounded-3xl bg-[#0B0F19] border border-amber-500/35 shadow-2xl'} flex flex-col overflow-hidden text-slate-100 font-sans`}>
      
      {/* Toast Alert for Copied Link */}
      {copyToast && (
        <div className="fixed top-6 right-6 z-50 p-4 rounded-2xl bg-amber-500 text-slate-950 font-bold text-xs shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-slate-950 shrink-0" />
          <span>{copyToast}</span>
        </div>
      )}

      {/* Top Header - Apple School Style */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-[#0D1527] to-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <RoyalLogo size="md" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base tracking-wider text-white">ROYAL PARENT PORTAL</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                currentStep === 'success' 
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              }`}>
                {currentStep === 'success' ? 'Đã Tiếp Nhận Hồ Sơ' : 'Cổng Đăng Ký Trực Tuyến'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Trường Song Ngữ Quốc Tế Hoàng Gia &bull; Đăng Ký Môn Học Ngoại Khóa Cho Con
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Nút Sao Chép Link Đăng Ký Gửi Phụ Huynh */}
          <button
            onClick={handleCopyPortalLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 transition-all shadow-sm"
            title="Sao chép link này để gửi qua Zalo/Email cho phụ huynh đăng ký"
          >
            <Share2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Sao Chép Link Gửi Phụ Huynh</span>
          </button>

          {/* Phần xem hồ sơ tiếp nhận: CHỈ HIỆN CHO NHÂN SỰ ĐƯỢC PHÂN CÔNG (TUYỂN SINH, GIÁO VỤ, ADMIN) */}
          {isAuthorizedStaff && onNavigateToAdminLeads && (
            <button
              onClick={onNavigateToAdminLeads}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800/80 hover:bg-slate-700 hover:text-white border border-slate-700 transition-all"
              title="Dành cho Tuyển sinh & Giáo vụ: Xem danh sách hồ sơ phụ huynh nộp"
            >
              <UsersIcon className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Hồ Sơ Tiếp Nhận</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                {store.parentRegistrations.length}
              </span>
            </button>
          )}

          {/* NÚT ĐĂNG NHẬP QUẢN TRỊ (Nếu chưa đăng nhập) */}
          {!currentUser && onOpenAdminLogin && (
            <button
              onClick={onOpenAdminLogin}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:from-amber-300 hover:to-amber-200 border border-amber-400 shadow-md shadow-amber-500/25 transition-all transform active:scale-95"
              title="Dành cho Ban giám hiệu, nhân viên học vụ, kế toán, giáo viên đăng nhập"
            >
              <Lock className="w-3.5 h-3.5 text-slate-950" />
              <span>Đăng Nhập Quản Trị</span>
            </button>
          )}

          {/* THÔNG TIN NHÂN SỰ ĐÃ ĐĂNG NHẬP */}
          {currentUser && (
            <div className="flex items-center gap-2">
              <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-white font-semibold truncate max-w-[130px]">{currentUser.full_name}</span>
                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                  {currentUser.role === 'super_admin' ? 'Super Admin' : currentUser.role}
                </span>
              </div>

              {onClose && (
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-sm"
                  title="Vào hệ thống quản trị nội bộ"
                >
                  Vào Quản Trị
                </button>
              )}

              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors"
                  title="Đăng xuất tài khoản quản trị"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {!isStandalonePage && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Đóng Cổng Phụ Huynh"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Subheader Notice Banner */}
      <div className="px-5 sm:px-8 py-2.5 bg-slate-900/80 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2 shrink-0">
        <div className="flex items-center gap-2 text-slate-300 font-medium">
          {currentStep === 'success' ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Đã tiếp nhận hồ sơ đăng ký thành công. Phòng Tuyển sinh sẽ liên hệ phụ huynh trong vòng 24 giờ làm việc.</span>
            </>
          ) : (
            <>
              <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Phụ huynh chọn môn học & khung giờ cho con. Ban Tuyển sinh & Học vụ sẽ liên hệ xác nhận trong vòng 24 giờ làm việc.</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-[11px] shrink-0">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>Hotline Tuyển sinh: <strong>(028) 7102 9999</strong></span>
        </div>
      </div>

      {/* Scrollable Form Body */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7 space-y-6 bg-gradient-to-b from-[#0B0F19] to-[#070A11] scroll-smooth"
      >
        <div className="space-y-6 max-w-4xl mx-auto">
          
          {/* STEP 2: MÀN HÌNH THÔNG BÁO XÁC NHẬN TIẾP NHẬN HỒ SƠ THÀNH CÔNG */}
          {currentStep === 'success' && submittedRegistration ? (
            <div className="rounded-3xl bg-gradient-to-br from-[#0D182A] via-slate-900 to-[#0A121E] border-2 border-emerald-500/30 p-6 sm:p-8 shadow-2xl space-y-6 animate-fadeIn transition-all">
              
              {/* 1. Header xác nhận (Top Alert Bar) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-800/90 gap-4">
                {/* Bên trái */}
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/10">
                    <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-emerald-400">
                      ĐÃ TIẾP NHẬN ĐƠN ĐĂNG KÝ NGOẠI KHÓA THÀNH CÔNG!
                    </div>
                    <h3 className="text-base sm:text-xl font-black text-white flex flex-wrap items-center gap-2 mt-0.5">
                      <span>Mã Hồ Sơ Tiếp Nhận:</span>
                      <span className="font-mono text-amber-400 font-bold tracking-wider">{submittedRegistration.leadCode}</span>
                    </h3>
                  </div>
                </div>

                {/* Bên phải */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(submittedRegistration.leadCode);
                      setCopyToast(`Đã sao chép mã hồ sơ: ${submittedRegistration.leadCode}`);
                      setTimeout(() => setCopyToast(null), 3000);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs text-amber-300 font-bold border border-slate-700 hover:border-amber-500/40 transition-all flex items-center gap-2 shadow-sm"
                    title="Sao chép mã tiếp nhận vào bộ nhớ tạm"
                  >
                    <Copy className="w-4 h-4 text-amber-400" />
                    <span>Sao chép mã</span>
                  </button>
                  <button
                    onClick={handleRegisterAnotherChild}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 text-slate-950 text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                    title="Tiếp tục đăng ký môn học cho bé khác"
                  >
                    <Sparkles className="w-4 h-4 text-slate-950" />
                    <span>Đăng ký thêm cho bé khác</span>
                  </button>
                </div>
              </div>

              {/* 2. Khối thông điệp hỗ trợ (Message Banner) */}
              <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs sm:text-sm text-emerald-200 leading-relaxed shadow-inner">
                Nhà trường đã tiếp nhận thông tin và phòng Tuyển sinh sẽ liên hệ phụ huynh{' '}
                <strong className="text-white font-bold">{submittedRegistration.parentName}</strong>{' '}
                qua SĐT{' '}
                <strong className="font-mono text-amber-300 font-bold">{submittedRegistration.parentPhone}</strong>{' '}
                trong vòng{' '}
                <strong className="text-emerald-300 font-bold">24 giờ làm việc</strong>{' '}
                để xác nhận thời khóa biểu và phân lớp cho bé{' '}
                <strong className="text-white font-bold">{submittedRegistration.studentName}</strong>.
              </div>

              {/* 3. Khu vực tóm tắt chi tiết đơn đăng ký (2 Cột Grid) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
                
                {/* Cột trái - Môn học & Lịch đăng ký */}
                <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="text-[11px] font-black text-amber-400 uppercase tracking-wider flex items-center justify-between">
                      <span>MÔN HỌC & LỊCH ĐĂNG KÝ ({submittedRegistration.registeredSubjects.length} MÔN)</span>
                      <span className="text-[10px] text-slate-500 font-normal font-sans">Chi tiết môn học</span>
                    </div>
                    
                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                      {submittedRegistration.registeredSubjects.map((sub, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-900 border border-slate-800/90 space-y-1.5 hover:border-slate-700 transition-colors">
                          <div className="flex justify-between items-center gap-2">
                            <span className="font-bold text-white text-xs">{sub.name}</span>
                            <span className="font-mono text-emerald-400 font-bold shrink-0">{formatVND(sub.fee)}</span>
                          </div>
                          <div className="text-[11px] text-amber-300/90 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{sub.timeSlotLabel}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Thông tin học viên bên dưới */}
                  <div className="pt-3 border-t border-slate-800/90 space-y-2 text-slate-300 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-medium">Học sinh:</span>
                      <span className="text-white font-bold">{submittedRegistration.studentName} {submittedRegistration.studentGrade ? `(${submittedRegistration.studentGrade})` : ''}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-medium">Cơ sở:</span>
                      <span className="text-slate-200 font-semibold">{submittedRegistration.campusName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-medium">Phân loại học sinh:</span>
                      <span className={submittedRegistration.isRoyal ? "text-amber-400 font-bold" : "text-slate-200 font-medium"}>
                        {submittedRegistration.isRoyal ? "HS chính khóa Royal (Có suất bánh sữa)" : "Học sinh ngoài trường"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cột phải - Tài chính & Liên hệ phụ huynh */}
                <div className="space-y-4 flex flex-col justify-between">
                  
                  {/* Khối 1: Mức học phí tham khảo */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-950 to-slate-950 border border-amber-500/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 block font-bold uppercase tracking-wider">
                        MỨC HỌC PHÍ THAM KHẢO:
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/25">
                        Dự kiến
                      </span>
                    </div>

                    <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight">
                      {formatVND(submittedRegistration.finalAmount)}
                    </div>
                    
                    <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                      {submittedRegistration.discountNote}
                    </p>

                    <p className="text-[10px] text-amber-300/80 pt-2 border-t border-slate-800/80 leading-normal">
                      * Học phí chính thức và phương thức đóng phí sẽ được chuyên viên tuyển sinh tư vấn chi tiết khi liên hệ.
                    </p>
                  </div>

                  {/* Khối 2: Thông tin liên hệ phụ huynh */}
                  <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3 text-slate-300">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-800/80 flex items-center justify-between">
                      <span>THÔNG TIN LIÊN HỆ PHỤ HUYNH</span>
                      <Phone className="w-3.5 h-3.5 text-amber-400" />
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-medium">Phụ huynh:</span>
                        <span className="text-white font-bold uppercase tracking-wide">{submittedRegistration.parentName}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-medium">Số điện thoại:</span>
                        <span className="font-mono text-amber-300 font-bold text-sm">{submittedRegistration.parentPhone}</span>
                      </div>
                      {submittedRegistration.parentEmail && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-medium">Email:</span>
                          <span className="text-slate-300 font-medium">{submittedRegistration.parentEmail}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-slate-400 text-[11px] pt-2 border-t border-slate-800/80">
                        <span>Thời gian gửi đơn:</span>
                        <span className="font-mono text-slate-300">{submittedRegistration.submittedAt}</span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* Bottom Quick Actions */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs border-t border-slate-800/80">
                <div className="text-slate-400 text-[11px] flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Bộ phận tuyển sinh sẽ liên hệ theo số điện thoại trên để hoàn tất thủ tục.</span>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    onClick={handleRegisterAnotherChild}
                    className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all text-xs flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Đăng Ký Thêm Cho Bé Khác</span>
                  </button>
                  {!isStandalonePage && (
                    <button
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors text-xs"
                    >
                      Đóng
                    </button>
                  )}
                </div>
              </div>

            </div>
          ) : (
            /* STEP 1: FORM ĐĂNG KÝ */
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 sm:p-7 backdrop-blur-md shadow-2xl space-y-7 animate-fadeIn">
            
            <form onSubmit={handleRegisterSubmit} className="space-y-7">
              
              {/* ======================================================== */}
              {/* 1. THÔNG TIN HỌC SINH VÀ PHỤ HUYNH (ĐƯỢC ĐẶT ĐẦU TIÊN)     */}
              {/* ======================================================== */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-800 text-xs font-bold text-amber-300 uppercase tracking-wider">
                  <User className="w-4 h-4 text-amber-400" />
                  <span>1. Thông Tin Học Sinh & Phụ Huynh</span>
                  <span className="text-rose-400">*</span>
                </div>

                {/* Thông tin học sinh */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Họ và tên Học sinh <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Nguyễn Hoàng Khang"
                      value={regForm.student_name}
                      onChange={(e) => {
                        const capitalized = formatCapitalizedName(e.target.value);
                        setRegForm({ ...regForm, student_name: capitalized });
                        if (formErrors.student_name) setFormErrors({ ...formErrors, student_name: '' });
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border ${
                        formErrors.student_name ? 'border-rose-500' : 'border-slate-800'
                      } text-white focus:outline-none focus:border-amber-500 capitalize`}
                    />
                    {formErrors.student_name && (
                      <p className="text-[11px] text-rose-400 mt-1">{formErrors.student_name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Ngày tháng năm sinh của bé
                    </label>
                    <input
                      type="date"
                      value={regForm.student_dob}
                      onChange={(e) => setRegForm({ ...regForm, student_dob: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Khối lớp hiện tại của con
                    </label>
                    <select
                      value={regForm.student_grade}
                      onChange={(e) => setRegForm({ ...regForm, student_grade: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="Khối Mầm Non">Khối Mầm Non (3 - 5 tuổi)</option>
                      <option value="Lớp 1 - Tiểu học">Lớp 1 - Tiểu học</option>
                      <option value="Lớp 2 - Tiểu học">Lớp 2 - Tiểu học</option>
                      <option value="Lớp 3 - Tiểu học">Lớp 3 - Tiểu học</option>
                      <option value="Lớp 4 - Tiểu học">Lớp 4 - Tiểu học</option>
                      <option value="Lớp 5 - Tiểu học">Lớp 5 - Tiểu học</option>
                      <option value="Khối THCS (Lớp 6 - 9)">Khối THCS (Lớp 6 - 9)</option>
                      <option value="Khối THPT (Lớp 10 - 12)">Khối THPT (Lớp 10 - 12)</option>
                    </select>
                  </div>
                </div>

                {/* Phân loại học sinh - Royal vs Ngoài trường */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setRegForm({ ...regForm, is_royal_student: true })}
                      className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                        regForm.is_royal_student
                          ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm shadow-amber-500/20'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        regForm.is_royal_student ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-600'
                      }`}>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                      <div className="font-bold text-white">Học sinh ROYAL SCHOOL</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRegForm({ ...regForm, is_royal_student: false })}
                      className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                        !regForm.is_royal_student
                          ? 'bg-cyan-500/15 border-cyan-500 text-white shadow-sm shadow-cyan-500/20'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        !regForm.is_royal_student ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-600'
                      }`}>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                      <div className="font-bold text-white">Học sinh ngoài trường</div>
                    </button>
                  </div>
                </div>

                {/* Lưu ý y tế & Dị ứng thực phẩm */}
                <div className="space-y-1.5 text-xs">
                  <label className="block text-slate-300 font-semibold">
                    Lưu ý y tế, dị ứng thực phẩm hoặc vận động của con (nếu có):
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Dị ứng sữa tươi, dị ứng đậu phộng, nhạy cảm nước lạnh..."
                    value={regForm.medical_notes}
                    onChange={(e) => setRegForm({ ...regForm, medical_notes: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-rose-300 focus:outline-none focus:border-rose-500"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-500 font-medium">Chọn nhanh:</span>
                    {medicalChips.map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => handleToggleMedicalChip(chip)}
                        className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] transition-colors"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Thông tin phụ huynh */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs pt-1">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Họ và tên Phụ huynh <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Nguyễn Văn Hưng"
                      value={regForm.parent_name}
                      onChange={(e) => {
                        const capitalized = formatCapitalizedName(e.target.value);
                        setRegForm({ ...regForm, parent_name: capitalized });
                        if (formErrors.parent_name) setFormErrors({ ...formErrors, parent_name: '' });
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border ${
                        formErrors.parent_name ? 'border-rose-500' : 'border-slate-800'
                      } text-white focus:outline-none focus:border-amber-500 capitalize`}
                    />
                    {formErrors.parent_name && (
                      <p className="text-[11px] text-rose-400 mt-1">{formErrors.parent_name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Số điện thoại / Zalo <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="Ví dụ: 0909 123 456"
                      value={regForm.parent_phone}
                      onChange={(e) => {
                        const formatted = formatPhoneNumber(e.target.value);
                        setRegForm({ ...regForm, parent_phone: formatted });
                        if (formErrors.parent_phone) setFormErrors({ ...formErrors, parent_phone: '' });
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 font-mono border ${
                        formErrors.parent_phone ? 'border-rose-500' : 'border-slate-800'
                      } text-amber-300 font-bold focus:outline-none focus:border-amber-500`}
                    />
                    {formErrors.parent_phone && (
                      <p className="text-[11px] text-rose-400 mt-1">{formErrors.parent_phone}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Email nhận lịch học & thông báo
                    </label>
                    <input
                      type="email"
                      placeholder="Ví dụ: phuhuynh@gmail.com"
                      value={regForm.parent_email}
                      onChange={(e) => setRegForm({ ...regForm, parent_email: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Cơ sở & Niên khóa */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Cơ sở theo học <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={regForm.desired_campus_id}
                      onChange={(e) => setRegForm({ ...regForm, desired_campus_id: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500"
                    >
                      {store.campuses.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Niên khóa / Kỳ học tuyển sinh
                    </label>
                    <select
                      value={regForm.desired_term_id}
                      onChange={(e) => setRegForm({ ...regForm, desired_term_id: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500"
                    >
                      {store.terms.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.status === 'open_enrollment' ? 'Đang mở tuyển sinh' : t.academic_year})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* ======================================================== */}
              {/* 2. MÔN HỌC ĐĂNG KÝ: CÓ THỂ CHỌN NHIỀU MÔN, GIỜ HỌC CHO MỖI MÔN */}
              {/* ======================================================== */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-slate-800 gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>2. Môn Học Đăng Ký (Có Thể Chọn Nhiều Môn & Giờ Học Cho Mỗi Môn)</span>
                    <span className="text-rose-400">*</span>
                  </div>

                  {/* Search box */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Tìm môn học..."
                      value={subjectSearch}
                      onChange={(e) => setSubjectSearch(e.target.value)}
                      className="pl-7 pr-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-white text-[11px] focus:outline-none focus:border-amber-500 w-44 sm:w-52"
                    />
                  </div>
                </div>

                {/* Category filter pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                      selectedCategory === 'all'
                        ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Tất cả ({store.subjects.length})
                  </button>
                  {categoriesList.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                        selectedCategory === cat
                          ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* SUBJECT SELECTION GRID (Multi-select) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredSubjects.map(sub => {
                    const isSelected = selectedSubjectConfigs.some(c => c.subjectId === sub.id);
                    return (
                      <div
                        key={sub.id}
                        onClick={() => handleToggleSubject(sub.id)}
                        className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between relative group ${
                          isSelected
                            ? 'bg-gradient-to-br from-amber-500/15 via-slate-900 to-amber-500/5 border-amber-400 shadow-md shadow-amber-500/20 ring-1 ring-amber-400/40'
                            : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-amber-500/25' : 'bg-slate-800/80'
                            }`}>
                              {getSubjectIcon(sub.category)}
                            </div>
                            <div>
                              <h4 className="font-bold text-white text-xs sm:text-sm group-hover:text-amber-300 transition-colors">
                                {sub.name}
                              </h4>
                              <span className="text-[10px] text-amber-400/90 font-medium">
                                {sub.category}
                              </span>
                            </div>
                          </div>

                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-amber-400 border-amber-400 text-slate-950' : 'border-slate-700 bg-slate-900'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mt-1">
                          {sub.description || `Chương trình rèn luyện năng khiếu toàn diện cho học sinh.`}
                        </p>

                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-mono">
                            {sub.standard_duration || '24 buổi'}
                          </span>
                          <span className={`font-semibold text-[11px] ${isSelected ? 'text-amber-300' : 'text-slate-400'}`}>
                            {isSelected ? '✓ Đã chọn môn' : '+ Chọn môn này'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {formErrors.subjects && (
                  <p className="text-xs text-rose-400">{formErrors.subjects}</p>
                )}

                {/* ======================================================== */}
                {/* GIỜ HỌC CHO TỪNG MÔN ĐÃ CHỌN (TIME SLOTS PER SUBJECT)     */}
                {/* ======================================================== */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Cấu hình khung giờ học cho từng môn đã chọn ({selectedSubjectConfigs.length} môn)</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Mỗi môn có thể học ca sau giờ học hoặc cuối tuần
                    </span>
                  </div>

                  {selectedSubjectConfigs.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-500">
                      Chưa chọn môn học nào. Vui lòng bấm vào danh sách môn ở trên để chọn môn cho bé.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {detailedSelectedSubjects.map(item => (
                        <div
                          key={item.subjectId}
                          className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                              {getSubjectIcon(item.subject?.category || '')}
                            </div>
                            <div>
                              <div className="font-bold text-white text-xs">{item.subject?.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {item.subject?.category} &bull; Học phí: <span className="font-mono text-emerald-400 font-bold">{formatVND(item.fee)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Chọn giờ học cho môn này */}
                          <div className="flex items-center gap-2 sm:w-80">
                            <label className="text-[11px] text-slate-400 shrink-0">Giờ học:</label>
                            <select
                              value={item.timeSlot}
                              onChange={(e) => handleChangeSubjectTimeSlot(item.subjectId, e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500 font-medium"
                            >
                              {TIME_SLOT_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveSubject(item.subjectId)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors self-end sm:self-center"
                            title="Bỏ môn này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ghi chú thêm nếu có */}
                <div className="text-xs">
                  <label className="block text-slate-300 font-semibold mb-1">
                    Ghi chú nguyện vọng của phụ huynh về bạn học cùng lớp hoặc lưu ý riêng (nếu có):
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Mong muốn bé học cùng ca với bạn Minh Khôi lớp 3A1..."
                    value={regForm.notes}
                    onChange={(e) => setRegForm({ ...regForm, notes: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* BẢNG TỔNG HỢP HỌC PHÍ TẤT CẢ CÁC MÔN */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">Tổng hợp đăng ký:</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[11px] font-bold">
                        {selectedSubjectConfigs.length} môn học đã chọn
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Tổng học phí dự kiến: <span className="font-mono text-slate-200 font-bold">{formatVND(totalBaseFee)}</span>
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Học phí tham khảo:</div>
                    <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
                      {formatVND(finalTotalAmount)}
                    </div>
                  </div>
                </div>

                {/* NÚT GỬI ĐĂNG KÝ */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={selectedSubjectConfigs.length === 0 || isSubmitting}
                    onClick={(e) => {
                      // Hỗ trợ submit trực tiếp
                      if (e.currentTarget.form === null) {
                        e.preventDefault();
                        handleSubmitRegistration();
                      }
                    }}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 disabled:opacity-50 text-slate-950 font-black text-sm tracking-wide shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99] cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 text-slate-950 animate-spin" />
                        <span>ĐANG GỬI ĐƠN VÀO HỆ THỐNG SUPABASE...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 text-slate-950" />
                        <span>
                          GỬI ĐƠN ĐĂNG KÝ {selectedSubjectConfigs.length > 0 ? `${selectedSubjectConfigs.length} MÔN HỌC` : 'MÔN HỌC'} CHO BÉ NGAY
                        </span>
                      </>
                    )}
                  </button>
                  <p className="text-center text-[11px] text-slate-500 mt-2">
                    Sau khi phụ huynh gửi đơn đăng ký, dữ liệu sẽ được lưu trực tiếp vào CSDL tuyển sinh của trường và thông báo tức thì đến Ban Tuyển Sinh.
                  </p>
                </div>

              </div>

            </form>

          </div>
          )}

        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs shrink-0">
        <div className="text-slate-500 text-[11px] hidden sm:block">
          Royal Bilingual International School &bull; Hotline Tuyển sinh: (028) 7102 9999
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <button
            onClick={handleCopyPortalLink}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 transition-all"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Sao chép link đăng ký gửi phụ huynh</span>
          </button>

          {!isStandalonePage && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
            >
              Đóng Cổng Phụ Huynh
            </button>
          )}
        </div>
      </div>

    </div>
  );

  if (isStandalonePage) {
    return portalContent;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-hidden animate-fadeIn">
      {portalContent}
    </div>
  );
};
