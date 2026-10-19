import React, { useState } from 'react';
import { 
  X, 
  Send, 
  CheckCircle2, 
  User, 
  Phone, 
  Calendar, 
  Clock, 
  Coffee, 
  QrCode, 
  Award, 
  BookOpen, 
  Mail, 
  Check, 
  School, 
  Activity, 
  Palette, 
  Code, 
  Sparkles, 
  Search, 
  Info,
  ChevronRight
} from 'lucide-react';
import { AppStore, formatVND, getEffectivePrice } from '../lib/storage';
import { generateVietQRUrl } from '../lib/vietqr';
import { Student, ParentRegistration } from '../types';
import { RoyalLogo } from './RoyalLogo';

interface ParentPortalModalProps {
  store: AppStore;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  initialStudent?: Student | null;
  onNavigateToAdminLeads?: () => void;
}

export const ParentPortalModal: React.FC<ParentPortalModalProps> = ({
  store,
  isOpen,
  onClose,
  onUpdateStore,
  onNavigateToAdminLeads,
}) => {
  if (!isOpen) return null;

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [subjectSearch, setSubjectSearch] = useState<string>('');

  // Phone number formatter
  const formatPhoneNumber = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  };

  // Default active term
  const activeTerm = store.terms.find(t => t.is_active || t.status === 'open_enrollment') || store.terms[0];

  // Registration Form State - Phụ huynh CHỈ ĐĂNG KÝ MÔN HỌC
  const [regForm, setRegForm] = useState({
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    student_name: '',
    student_dob: '2016-05-15',
    student_grade: 'Lớp 3 - Tiểu học',
    desired_campus_id: store.campuses[0]?.id || '',
    desired_term_id: activeTerm?.id || '',
    desired_subject_id: store.subjects[0]?.id || '',
    desired_time_slot_type: 'after_school' as 'after_school' | 'weekend',
    is_royal_student: true,
    medical_notes: '',
    notes: '',
  });

  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [regReceipt, setRegReceipt] = useState<{
    leadCode: string;
    parentName: string;
    parentPhone: string;
    parentEmail?: string;
    studentName: string;
    studentGrade?: string;
    campusName: string;
    termName: string;
    subjectName: string;
    subjectCategory: string;
    isRoyal: boolean;
    estimatedAmount: number;
    baseAmount: number;
    discountNote: string;
    qrUrl: string;
    bankName: string;
    bankAccount: string;
    bankOwner: string;
  } | null>(null);

  // Selected entities & pricing
  const selectedCampus = store.campuses.find(c => c.id === regForm.desired_campus_id) || store.campuses[0];
  const selectedSubject = store.subjects.find(s => s.id === regForm.desired_subject_id) || store.subjects[0];
  const selectedTerm = store.terms.find(t => t.id === regForm.desired_term_id) || activeTerm;

  const effectivePricing = getEffectivePrice(
    regForm.desired_term_id,
    regForm.desired_campus_id,
    regForm.desired_subject_id,
    store
  );

  const baseCourseFee = effectivePricing.base_course_fee || 3600000;
  const royalDiscount = regForm.is_royal_student ? Math.round(baseCourseFee * 0.05) : 0;
  const estimatedPayable = Math.max(0, (effectivePricing.course_fee || baseCourseFee) - (regForm.is_royal_student ? royalDiscount : 0));

  // Medical chips presets
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

  // Filtered Subject Catalog
  const filteredSubjects = store.subjects.filter(s => {
    if (selectedCategory !== 'all' && s.category !== selectedCategory) return false;
    if (subjectSearch.trim()) {
      const q = subjectSearch.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q));
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

  // Handle Submit Registration
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!regForm.parent_name.trim()) {
      errors.parent_name = 'Vui lòng nhập họ tên phụ huynh';
    }
    const cleanPhone = regForm.parent_phone.replace(/\s+/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      errors.parent_phone = 'Vui lòng nhập số điện thoại hợp lệ (từ 10 chữ số)';
    }
    if (!regForm.student_name.trim()) {
      errors.student_name = 'Vui lòng nhập họ tên học sinh';
    }
    if (!regForm.desired_subject_id) {
      errors.desired_subject_id = 'Vui lòng chọn môn học đăng ký';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    const currentYear = new Date().getFullYear();
    const leadCode = `REG-${currentYear}-${Date.now().toString().slice(-6)}`;
    const campus = selectedCampus;
    const subject = selectedSubject;
    const term = selectedTerm;

    const discountPolicy = regForm.is_royal_student
      ? 'Học sinh Royal School (Ưu đãi 5% học phí + Suất ăn nhẹ bánh sữa sau giờ)'
      : 'Học sinh Ngoài trường / Vãng lai (Không áp dụng suất bánh sữa)';

    const qrUrl = generateVietQRUrl({
      bankName: campus?.bank_name || 'Vietcombank',
      bankAccount: campus?.bank_account || '0071001234567',
      bankOwner: campus?.bank_owner || 'ROYAL INTERNATIONAL SCHOOL',
      amount: estimatedPayable,
      studentCode: leadCode,
      className: subject?.name || 'Ngoại Khóa',
    });

    const newLead: ParentRegistration = {
      id: `preg_${Date.now()}`,
      registration_code: leadCode,
      parent_name: regForm.parent_name.trim(),
      parent_phone: regForm.parent_phone.trim(),
      parent_email: regForm.parent_email.trim() || undefined,
      student_name: regForm.student_name.trim(),
      student_dob: regForm.student_dob,
      student_grade: regForm.student_grade,
      desired_campus_id: regForm.desired_campus_id,
      desired_term_id: regForm.desired_term_id,
      desired_subject_id: regForm.desired_subject_id,
      desired_time_slot_type: regForm.desired_time_slot_type,
      is_royal_student: regForm.is_royal_student,
      medical_notes: regForm.medical_notes.trim() || undefined,
      notes: regForm.notes.trim() || undefined,
      estimated_fee: estimatedPayable,
      discount_policy: discountPolicy,
      status: 'pending',
      created_at: new Date().toISOString().split('T')[0],
    };

    // Live sync to store
    onUpdateStore(prev => ({
      ...prev,
      parentRegistrations: [newLead, ...prev.parentRegistrations],
      notifications: [
        {
          id: `notif_lead_${Date.now()}`,
          type: 'new_lead_registration',
          title: 'Đăng ký môn học mới từ Cổng Phụ Huynh',
          message: `Phụ huynh ${regForm.parent_name} vừa đăng ký môn ${subject?.name || 'Môn học'} cho bé ${regForm.student_name} tại cơ sở ${campus?.name || 'Royal School'}.`,
          date: new Date().toISOString().split('T')[0],
          severity: 'medium',
          read: false,
        },
        ...prev.notifications,
      ],
    }));

    setRegReceipt({
      leadCode,
      parentName: regForm.parent_name,
      parentPhone: regForm.parent_phone,
      parentEmail: regForm.parent_email,
      studentName: regForm.student_name,
      studentGrade: regForm.student_grade,
      campusName: campus?.name || 'Royal School',
      termName: term?.name || 'Niên khóa hiện tại',
      subjectName: subject?.name || 'Môn ngoại khóa',
      subjectCategory: subject?.category || 'Ngoại khóa',
      isRoyal: regForm.is_royal_student,
      estimatedAmount: estimatedPayable,
      baseAmount: baseCourseFee,
      discountNote: discountPolicy,
      qrUrl,
      bankName: campus?.bank_name || 'Vietcombank',
      bankAccount: campus?.bank_account || '0071001234567',
      bankOwner: campus?.bank_owner || 'ROYAL INTERNATIONAL SCHOOL',
    });

    // Reset Form
    setRegForm(prev => ({
      ...prev,
      parent_name: '',
      parent_phone: '',
      parent_email: '',
      student_name: '',
      student_dob: '2016-05-15',
      student_grade: 'Lớp 3 - Tiểu học',
      medical_notes: '',
      notes: '',
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-hidden">
      <div className="w-full max-w-5xl h-[94vh] max-h-[94vh] flex flex-col rounded-3xl bg-[#0B0F19] border border-amber-500/35 shadow-2xl overflow-hidden text-slate-100">
        
        {/* Top Header - Apple School Style */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-[#0D1527] to-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <RoyalLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-wider text-white">ROYAL PARENT PORTAL</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                  Cổng Đăng Ký Môn Học
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Phụ huynh đăng ký môn học cho con &bull; Ban Học vụ sắp xếp thời khóa biểu và xếp lớp phù hợp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {onNavigateToAdminLeads && (
              <button
                onClick={onNavigateToAdminLeads}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800/80 hover:bg-slate-700 hover:text-white border border-slate-700 transition-all"
                title="Chuyển đến màn hình Quản trị Đơn Tuyển Sinh nội bộ"
              >
                <UsersIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>Xem Hồ Sơ Tiếp Nhận ({store.parentRegistrations.length})</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Đóng Cổng Phụ Huynh"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Subheader info bar */}
        <div className="px-5 sm:px-8 py-2.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 text-slate-300 font-semibold">
            <Send className="w-3.5 h-3.5 text-amber-400" />
            <span>Biểu mẫu trực tuyến &bull; Phụ huynh chọn môn học ngoại khóa mong muốn</span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Hotline Tuyển sinh: <strong>(028) 7102 9999</strong></span>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7 space-y-6 bg-gradient-to-b from-[#0B0F19] to-[#070A11]">
          <div className="space-y-6 max-w-4xl mx-auto">
            
            {/* PORTAL NOTICE BANNER */}
            <div className="rounded-2xl p-4 bg-gradient-to-r from-amber-500/10 via-slate-900 to-amber-500/5 border border-amber-500/30 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <Info className="w-5 h-5" />
              </div>
              <div className="text-xs text-slate-300 leading-relaxed">
                <span className="font-bold text-amber-300 block text-sm mb-0.5">
                  Cổng Đăng Ký Môn Học Ngoại Khóa Hoàng Gia
                </span>
                Quý Phụ huynh <strong>chỉ cần chọn Môn học và Cơ sở mong muốn</strong>. Sau khi tiếp nhận hồ sơ, Ban Học vụ & Tuyển sinh Royal School sẽ trực tiếp liên hệ tư vấn, sắp xếp thời khóa biểu và phân bổ lớp học phù hợp nhất với lứa tuổi của con.
              </div>
            </div>

            {/* SUCCESS MODAL / RECEIPT BANNER IF JUST SUBMITTED */}
            {regReceipt && (
              <div className="rounded-3xl bg-gradient-to-br from-[#0D182A] via-slate-900 to-[#0A121E] border-2 border-emerald-500/40 p-6 sm:p-7 shadow-2xl space-y-5 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Đã Tiếp Nhận Đăng Ký Môn Học Cho Bé!
                      </div>
                      <h3 className="text-lg font-extrabold text-white">
                        Mã Hồ Sơ Tiếp Nhận: <span className="text-amber-400 font-mono">{regReceipt.leadCode}</span>
                      </h3>
                    </div>
                  </div>

                  <button
                    onClick={() => setRegReceipt(null)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold transition-colors self-start sm:self-center"
                  >
                    Đăng ký thêm môn học khác
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200">
                  Phòng Tuyển sinh sẽ liên hệ phụ huynh <strong>{regReceipt.parentName}</strong> qua SĐT <strong>{regReceipt.parentPhone}</strong> trong vòng <strong>24 giờ làm việc</strong> để xác nhận lịch học và xếp lớp chính thức cho bé.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                  {/* Summary card */}
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                      <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                        Chi Tiết Môn Học Đã Đăng Ký
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Môn học đã chọn:</span>
                        <span className="text-amber-300 font-extrabold text-sm">{regReceipt.subjectName}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Phân loại môn:</span>
                        <span className="text-slate-300 font-medium">{regReceipt.subjectCategory}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Học sinh:</span>
                        <span className="text-white font-bold">{regReceipt.studentName} ({regReceipt.studentGrade})</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Cơ sở đăng ký:</span>
                        <span className="text-slate-200">{regReceipt.campusName}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-400">Chính sách ưu đãi:</span>
                        <span className="text-emerald-400 font-semibold text-right">{regReceipt.discountNote}</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                      <span className="text-[11px] text-slate-400 block">Học phí tham khảo khóa học:</span>
                      <div className="text-xl font-black text-emerald-400 font-mono">
                        {formatVND(regReceipt.estimatedAmount)}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Phụ huynh có thể thanh toán trước giữ chỗ hoặc thanh toán sau khi nhà trường xác nhận xếp lớp.
                      </p>
                    </div>
                  </div>

                  {/* VietQR Box */}
                  <div className="p-4 rounded-2xl bg-white text-slate-950 flex flex-col items-center justify-center text-center shadow-lg">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-2">
                      <QrCode className="w-3.5 h-3.5 text-amber-600" />
                      <span>Mã VietQR Chuyển Khoản Tạm Tính</span>
                    </div>
                    <img 
                      src={regReceipt.qrUrl} 
                      alt="VietQR Chuyển Khoản" 
                      className="w-40 h-40 object-contain rounded-xl border border-slate-200 shadow-sm"
                    />
                    <div className="mt-2 text-[10px] text-slate-600 font-mono space-y-0.5">
                      <p>Số TK: <strong>{regReceipt.bankAccount}</strong> ({regReceipt.bankName})</p>
                      <p>Chủ TK: <strong>{regReceipt.bankOwner}</strong></p>
                      <p className="font-bold text-amber-700">Cú pháp: {regReceipt.leadCode} {regReceipt.studentName}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* REGISTRATION FORM CONTAINER */}
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 sm:p-7 backdrop-blur-md shadow-2xl space-y-6">
              
              <form onSubmit={handleRegisterSubmit} className="space-y-6">
                
                {/* BƯỚC 1: CHỌN MÔN HỌC NGOẠI KHÓA (TRỌNG TÂM - PHỤ HUYNH CHỈ ĐĂNG KÝ MÔN) */}
                <div className="space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-800 gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                      <Award className="w-4 h-4 text-amber-400" />
                      <span>1. Chọn Môn Học Ngoại Khóa Đăng Ký Cho Bé</span>
                      <span className="text-rose-400">*</span>
                    </div>

                    {/* Quick Search Môn học */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Tìm môn (Bơi, Bóng rổ, Piano...)"
                        value={subjectSearch}
                        onChange={(e) => setSubjectSearch(e.target.value)}
                        className="pl-7 pr-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-white text-[11px] focus:outline-none focus:border-amber-500 w-48 sm:w-56"
                      />
                    </div>
                  </div>

                  {/* Category Filter Pills */}
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
                      Tất cả môn ({store.subjects.length})
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

                  {/* SUBJECT CARDS CATALOG (VISUAL SELECTION) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                    {filteredSubjects.map(sub => {
                      const isSelected = regForm.desired_subject_id === sub.id;
                      return (
                        <div
                          key={sub.id}
                          onClick={() => {
                            setRegForm({ ...regForm, desired_subject_id: sub.id });
                            if (formErrors.desired_subject_id) setFormErrors({ ...formErrors, desired_subject_id: '' });
                          }}
                          className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between relative group ${
                            isSelected
                              ? 'bg-gradient-to-br from-amber-500/15 via-slate-900 to-amber-500/5 border-amber-400 shadow-md shadow-amber-500/15'
                              : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                isSelected ? 'bg-amber-500/25' : 'bg-slate-800/80'
                              }`}>
                                {getSubjectIcon(sub.category)}
                              </div>
                              <div className="pr-5">
                                <h4 className="font-bold text-white text-xs sm:text-sm group-hover:text-amber-300 transition-colors">
                                  {sub.name}
                                </h4>
                                <span className="text-[10px] text-amber-400/90 font-medium">
                                  {sub.category}
                                </span>
                              </div>
                            </div>

                            <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                              {sub.description || `Chương trình phát triển năng khiếu toàn diện cho học sinh.`}
                            </p>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 font-mono">
                              {sub.standard_duration || '24 buổi'}
                            </span>
                            <span className={`font-semibold ${isSelected ? 'text-amber-300' : 'text-slate-300'}`}>
                              {isSelected ? 'Đã chọn môn này' : 'Nhấp để chọn'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {formErrors.desired_subject_id && (
                    <p className="text-xs text-rose-400">{formErrors.desired_subject_id}</p>
                  )}

                  {/* Campus Selection & Slot Preference */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 text-xs">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Cơ sở (Campus) mong muốn học <span className="text-rose-400">*</span>
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
                        Kỳ học tuyển sinh
                      </label>
                      <select
                        value={regForm.desired_term_id}
                        onChange={(e) => setRegForm({ ...regForm, desired_term_id: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500"
                      >
                        {store.terms.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.status === 'open_enrollment' ? 'Đang mở' : t.academic_year})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Khung giờ mong muốn
                      </label>
                      <select
                        value={regForm.desired_time_slot_type}
                        onChange={(e) => setRegForm({ ...regForm, desired_time_slot_type: e.target.value as any })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500"
                      >
                        <option value="after_school">Sau giờ chính khóa (16:45 - 18:15)</option>
                        <option value="weekend">Cuối tuần (Sáng / Chiều Thứ 7 - CN)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* BƯỚC 2: THÔNG TIN PHỤ HUYNH & HỌC SINH */}
                <div className="space-y-4 pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                    <User className="w-4 h-4 text-amber-400" />
                    <span>2. Thông Tin Phụ Huynh & Học Sinh</span>
                  </div>

                  {/* Thông tin phụ huynh */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
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
                          setRegForm({ ...regForm, parent_name: e.target.value });
                          if (formErrors.parent_name) setFormErrors({ ...formErrors, parent_name: '' });
                        }}
                        className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border ${
                          formErrors.parent_name ? 'border-rose-500' : 'border-slate-800'
                        } text-white focus:outline-none focus:border-amber-500`}
                      />
                      {formErrors.parent_name && (
                        <p className="text-[11px] text-rose-400 mt-1">{formErrors.parent_name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Số điện thoại / Zalo liên hệ <span className="text-rose-400">*</span>
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
                        Email nhận lịch học & học phí
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
                          setRegForm({ ...regForm, student_name: e.target.value });
                          if (formErrors.student_name) setFormErrors({ ...formErrors, student_name: '' });
                        }}
                        className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border ${
                          formErrors.student_name ? 'border-rose-500' : 'border-slate-800'
                        } text-white focus:outline-none focus:border-amber-500`}
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
                        Khối lớp hiện tại
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
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-xs font-semibold text-slate-300 block">
                      Phân loại học sinh & Chế độ ăn nhẹ bánh sữa:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => setRegForm({ ...regForm, is_royal_student: true })}
                        className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                          regForm.is_royal_student
                            ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm shadow-amber-500/20'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          regForm.is_royal_student ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-600'
                        }`}>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <span>Học sinh chính khóa Royal School</span>
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">Ưu đãi 5%</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Được phục vụ suất ăn nhẹ/bánh sữa tươi sau giờ học lúc 16:30 trước khi tập luyện.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRegForm({ ...regForm, is_royal_student: false })}
                        className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                          !regForm.is_royal_student
                            ? 'bg-cyan-500/15 border-cyan-500 text-white shadow-sm shadow-cyan-500/20'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          !regForm.is_royal_student ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-600'
                        }`}>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                        <div>
                          <div className="font-bold text-white">Học sinh ngoài trường / Vãng lai</div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Không áp dụng chính sách suất ăn nhẹ bánh sữa của bếp ăn Royal School.
                          </p>
                        </div>
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
                    {/* Quick Chips */}
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

                  {/* Ghi chú thêm */}
                  <div className="text-xs">
                    <label className="block text-slate-300 font-semibold mb-1">
                      Ghi chú nguyện vọng của phụ huynh (nếu có):
                    </label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Phụ huynh muốn học cùng ca với bạn Minh Khôi..."
                      value={regForm.notes}
                      onChange={(e) => setRegForm({ ...regForm, notes: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* BƯỚC 3: TÓM TẮT & GỬI ĐĂNG KÝ */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">Môn học đã chọn:</span>
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[11px] font-bold">
                          {selectedSubject?.name} ({selectedSubject?.category})
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Cơ sở: <strong className="text-slate-200">{selectedCampus?.name}</strong> &bull; Học phí chuẩn: {formatVND(baseCourseFee)}
                        {regForm.is_royal_student && (
                          <span className="text-emerald-400 ml-1 font-semibold">
                            (Ưu đãi 5% HS Royal: -{formatVND(royalDiscount)})
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Học phí tham khảo:</div>
                      <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
                        {formatVND(estimatedPayable)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm tracking-wide shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99]"
                  >
                    <Send className="w-4 h-4 text-slate-950" />
                    <span>GỬI ĐĂNG KÝ MÔN HỌC CHO BÉ NGAY</span>
                  </button>
                  <p className="text-center text-[11px] text-slate-500">
                    Sau khi phụ huynh gửi đơn đăng ký môn học, Ban Học vụ & Tuyển sinh sẽ liên hệ xác nhận thời khóa biểu và xếp lớp cho bé.
                  </p>
                </div>

              </form>

            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs shrink-0">
          <div className="text-slate-500 text-[11px] hidden sm:block">
            Royal Bilingual International School &bull; Hotline Tuyển sinh: (028) 7102 9999
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors ml-auto"
          >
            Đóng Cổng Phụ Huynh
          </button>
        </div>

      </div>
    </div>
  );
};

function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
