import React, { useState } from 'react';
import { 
  X, 
  Crown, 
  Send, 
  CheckCircle2, 
  LogIn, 
  LogOut, 
  User, 
  Phone, 
  Calendar, 
  Clock, 
  Coffee, 
  QrCode, 
  BookmarkCheck, 
  Receipt, 
  AlertCircle, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { AppStore, formatVND } from '../lib/storage';
import { generateVietQRUrl } from '../lib/vietqr';
import { Student, ParentRegistration, TuitionInvoice, AttendanceRecord } from '../types';
import { RoyalLogo } from './RoyalLogo';
import { ViewToggle, ViewMode } from './ViewToggle';

interface ParentPortalModalProps {
  store: AppStore;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

export const ParentPortalModal: React.FC<ParentPortalModalProps> = ({
  store,
  isOpen,
  onClose,
  onUpdateStore,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'register' | 'login'>('login');
  const [attViewMode, setAttViewMode] = useState<ViewMode>('table');

  // Registration Form State
  const [regForm, setRegForm] = useState({
    parent_name: '',
    parent_phone: '',
    student_name: '',
    student_dob: '2016-05-10',
    desired_campus_id: store.campuses[0]?.id || '',
    desired_subject_id: store.subjects[0]?.id || '',
    desired_time_slot_type: 'after_school' as 'after_school' | 'weekend',
    is_royal_student: true,
    medical_notes: '',
    notes: '',
  });
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [regReceipt, setRegReceipt] = useState<{
    leadCode: string;
    parentName: string;
    parentPhone: string;
    studentName: string;
    campusName: string;
    subjectName: string;
    estimatedAmount: number;
    qrUrl: string;
    bankName: string;
    bankAccount: string;
    bankOwner: string;
  } | null>(null);

  // Login State
  const [loginPhone, setLoginPhone] = useState('0903 889 911');
  const [loggedInStudent, setLoggedInStudent] = useState<Student | null>(() => {
    return store.students[0] || null;
  });
  const [loginError, setLoginError] = useState<string | null>(null);

  // QR Code preview in parent view
  const [viewingQrInvoice, setViewingQrInvoice] = useState<TuitionInvoice | null>(null);

  // Handle Registration Submit
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.parent_name || !regForm.parent_phone || !regForm.student_name) return;

    const leadCode = `REG-${Date.now().toString().slice(-6)}`;
    const campus = store.campuses.find(c => c.id === regForm.desired_campus_id) || store.campuses[0];
    const subject = store.subjects.find(s => s.id === regForm.desired_subject_id) || store.subjects[0];
    const matchingClass = store.classes.find(c => c.subject_id === regForm.desired_subject_id && c.campus_id === regForm.desired_campus_id);
    const baseFee = matchingClass?.full_course_fee || 3600000;
    const finalFee = regForm.is_royal_student ? Math.round(baseFee * 0.95) : baseFee;

    const qrUrl = generateVietQRUrl({
      bankName: campus?.bank_name || 'Vietcombank',
      bankAccount: campus?.bank_account || '0071001234567',
      bankOwner: campus?.bank_owner || 'ROYAL INTERNATIONAL SCHOOL',
      amount: finalFee,
      studentCode: leadCode,
      className: subject?.name || 'Ngoại Khóa',
    });

    const newLead: ParentRegistration = {
      id: `preg_${Date.now()}`,
      parent_name: regForm.parent_name,
      parent_phone: regForm.parent_phone,
      student_name: regForm.student_name,
      student_dob: regForm.student_dob,
      desired_campus_id: regForm.desired_campus_id,
      desired_subject_id: regForm.desired_subject_id,
      desired_time_slot_type: regForm.desired_time_slot_type,
      is_royal_student: regForm.is_royal_student,
      medical_notes: regForm.medical_notes,
      notes: regForm.notes,
      status: 'pending',
      created_at: new Date().toISOString().split('T')[0],
    };

    onUpdateStore(prev => ({
      ...prev,
      parentRegistrations: [newLead, ...prev.parentRegistrations],
      notifications: [
        {
          id: `notif_preg_${Date.now()}`,
          type: 'enrollment_over_quota',
          title: 'Đăng ký mới từ Cổng Phụ Huynh',
          message: `Phụ huynh ${regForm.parent_name} (${regForm.parent_phone}) vừa gửi đăng ký khóa học cho bé ${regForm.student_name}.`,
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
      studentName: regForm.student_name,
      campusName: campus?.name || 'Royal School',
      subjectName: subject?.name || 'Môn ngoại khóa',
      estimatedAmount: finalFee,
      qrUrl,
      bankName: campus?.bank_name || 'Vietcombank',
      bankAccount: campus?.bank_account || '0071001234567',
      bankOwner: campus?.bank_owner || 'ROYAL INTERNATIONAL SCHOOL',
    });

    setRegSuccess(`Đăng ký thành công! Mã hồ sơ tiếp nhận: ${leadCode}. Ban tuyển sinh Royal School đã nhận hồ sơ.`);
    setRegForm({
      parent_name: '',
      parent_phone: '',
      student_name: '',
      student_dob: '2016-05-10',
      desired_campus_id: store.campuses[0]?.id || '',
      desired_subject_id: store.subjects[0]?.id || '',
      desired_time_slot_type: 'after_school',
      is_royal_student: true,
      medical_notes: '',
      notes: '',
    });
  };

  // Handle Parent Login
  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPhone = loginPhone.replace(/\s+/g, '');
    const found = store.students.find(s => s.parent_phone.replace(/\s+/g, '') === cleanPhone);

    if (found) {
      setLoggedInStudent(found);
      setLoginError(null);
    } else {
      setLoginError('Không tìm thấy hồ sơ học sinh tương ứng với Số điện thoại này. Vui lòng kiểm tra lại hoặc liên hệ Học vụ.');
    }
  };

  // Quick switch student for testing
  const handleQuickSwitchStudent = (student: Student) => {
    setLoggedInStudent(student);
    setLoginPhone(student.parent_phone);
    setLoginError(null);
  };

  // Data for logged in student
  const studentEnrollments = loggedInStudent
    ? store.enrollments.filter(e => e.student_id === loggedInStudent.id && e.status === 'active')
    : [];
  
  const studentClasses = studentEnrollments
    .map(e => store.classes.find(c => c.id === e.class_id))
    .filter(Boolean);

  const studentInvoices = loggedInStudent
    ? store.invoices.filter(i => i.student_id === loggedInStudent.id)
    : [];

  const studentCredits = loggedInStudent
    ? store.makeupCredits.filter(c => c.student_id === loggedInStudent.id)
    : [];

  const studentAttendance = loggedInStudent
    ? store.attendance.filter(a => a.student_id === loggedInStudent.id).sort((a, b) => b.session_date.localeCompare(a.session_date))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-3xl bg-[#0B0F19] border border-amber-500/40 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/10 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RoyalLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">CỔNG THÔNG TIN PHỤ HUYNH HOÀNG GIA</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                  Royal Parent Portal
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Đăng ký khóa học ngoại khóa & Tra cứu điểm danh, suất bánh sữa, bảo lưu, VietQR học phí
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3 bg-slate-900/60 border-b border-slate-800 flex items-center gap-3">
          <button
            onClick={() => setActiveTab('login')}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'login'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Cổng Đăng Nhập & Tra Cứu Học Tập</span>
            {loggedInStudent && (
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('register')}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'register'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Đăng Ký Khóa Học Mới Trực Tuyến</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 sm:p-6 flex-1 overflow-y-auto">
          
          {/* TAB 1: PARENT LOGIN & STUDENT PROGRESS */}
          {activeTab === 'login' && (
            <div className="space-y-5">
              {/* Login Bar / Quick Picker */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                    Đăng nhập bằng Số điện thoại Phụ huynh:
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nhập SĐT (Ví dụ: 0903 889 911)"
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-500 w-full sm:w-64"
                    />
                    <button
                      onClick={() => handleLogin()}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 shrink-0"
                    >
                      Tra Cứu
                    </button>
                  </div>
                  {loginError && (
                    <p className="text-xs text-rose-400 mt-1.5">{loginError}</p>
                  )}
                </div>

                {/* Quick Select demo profiles */}
                <div className="shrink-0">
                  <span className="text-[10px] text-slate-400 block mb-1">Hồ sơ mẫu có sẵn:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {store.students.slice(0, 4).map(st => (
                      <button
                        key={st.id}
                        onClick={() => handleQuickSwitchStudent(st)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                          loggedInStudent?.id === st.id
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {st.name.split(' ').slice(-2).join(' ')} ({st.is_royal_student ? 'Royal' : 'Ngoài'})
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Logged in Student Details */}
              {loggedInStudent ? (
                <div className="space-y-5">
                  {/* Student Card Summary */}
                  <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-base">
                        {loggedInStudent.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-extrabold text-white">{loggedInStudent.name}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            loggedInStudent.is_royal_student
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {loggedInStudent.is_royal_student ? 'Học sinh chính khóa Royal' : 'Học sinh ngoài trường'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 font-mono">
                          <span>Mã HV: <strong className="text-amber-400">{loggedInStudent.code}</strong></span>
                          <span>&bull;</span>
                          <span>Lớp: {loggedInStudent.regular_class || 'Royal School'}</span>
                          <span>&bull;</span>
                          <span>PH: {loggedInStudent.parent_name} ({loggedInStudent.parent_phone})</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400">Chế độ bánh sữa sau giờ:</div>
                      <span className={`inline-block mt-1 px-3 py-1 rounded-xl text-xs font-bold border ${
                        loggedInStudent.is_royal_student
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {loggedInStudent.is_royal_student ? 'Được cấp suất ăn nhẹ' : 'Không thuộc diện cấp'}
                      </span>
                    </div>
                  </div>

                  {/* Medical Note Banner if any */}
                  {loggedInStudent.medical_notes && (
                    <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2 text-xs text-rose-300">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Lưu ý y tế & Dị ứng thực phẩm cho nhà trường: </strong>
                        <span>{loggedInStudent.medical_notes}</span>
                      </div>
                    </div>
                  )}

                  {/* 3 Columns: Lớp đang học, Hóa đơn & VietQR, Phiếu bảo lưu */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    
                    {/* Col 1: Lớp học đang tham gia */}
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-white border-b border-slate-800 pb-2">
                        <Calendar className="w-4 h-4 text-amber-400" />
                        <span>Khóa Học Đang Theo Học ({studentClasses.length})</span>
                      </div>

                      {studentClasses.length === 0 ? (
                        <p className="text-xs text-slate-500">Chưa ghi danh môn học nào.</p>
                      ) : (
                        <div className="space-y-2">
                          {studentClasses.map(cls => (
                            <div key={cls!.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                              <div className="font-bold text-white">{cls!.name}</div>
                              <div className="text-[11px] text-slate-400">
                                Thời lượng: {cls!.total_sessions} buổi &bull; Đơn giá: {formatVND(cls!.price_per_session)}/buổi
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Col 2: Hóa đơn & VietQR */}
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-white border-b border-slate-800 pb-2">
                        <Receipt className="w-4 h-4 text-cyan-400" />
                        <span>Học Phí & Thanh Toán VietQR</span>
                      </div>

                      {studentInvoices.length === 0 ? (
                        <p className="text-xs text-slate-500">Không có hóa đơn học phí.</p>
                      ) : (
                        <div className="space-y-2">
                          {studentInvoices.map(inv => (
                            <div key={inv.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="font-mono text-amber-400 font-bold">{inv.invoice_code}</span>
                                <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                                  inv.payment_status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                }`}>
                                  {inv.payment_status === 'paid' ? 'Đã đóng' : 'Chưa đóng'}
                                </span>
                              </div>

                              <div className="flex justify-between text-slate-300">
                                <span>Phải thanh toán:</span>
                                <span className="font-mono font-bold text-white">{formatVND(inv.net_payable)}</span>
                              </div>

                              {inv.payment_status !== 'paid' && (
                                <button
                                  onClick={() => setViewingQrInvoice(inv)}
                                  className="w-full mt-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1 shadow-sm shadow-amber-500/20"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  <span>Quét Mã VietQR Trả Phí</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Col 3: Phiếu bảo lưu học phí */}
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-white border-b border-slate-800 pb-2">
                        <BookmarkCheck className="w-4 h-4 text-emerald-400" />
                        <span>Sổ Phiếu Bảo Lưu Của Con ({studentCredits.length})</span>
                      </div>

                      {studentCredits.length === 0 ? (
                        <p className="text-xs text-slate-500">Chưa phát sinh phiếu bảo lưu.</p>
                      ) : (
                        <div className="space-y-2">
                          {studentCredits.map(c => (
                            <div key={c.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="font-mono text-amber-400 font-bold">{c.credit_code}</span>
                                <span className={`text-[10px] font-bold ${c.status === 'applied' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  {c.status === 'applied' ? 'Đã cấn trừ' : 'Còn hiệu lực'}
                                </span>
                              </div>
                              <div className="text-slate-300">
                                Tiền bảo lưu: <strong className="text-emerald-400 font-mono">{formatVND(c.total_credit_amount)}</strong>
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Hạn sử dụng: đến {c.expiry_date} (Hạn 1 năm)
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Attendance Log for Parents */}
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs border-b border-slate-800 pb-2 gap-2">
                      <div className="font-bold text-white flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Nhật Ký Chuyên Cần & Nhận Bánh Sữa Các Buổi Học ({studentAttendance.length} buổi)</span>
                      </div>
                      <ViewToggle viewMode={attViewMode} onViewModeChange={setAttViewMode} />
                    </div>

                    {attViewMode === 'cards' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {studentAttendance.map(att => {
                          const cls = store.classes.find(c => c.id === att.class_id);
                          return (
                            <div key={att.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="font-mono font-bold text-white">{att.session_date}</span>
                                <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                  att.status === 'present'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : att.status === 'absent_excused'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}>
                                  {att.status === 'present' ? 'Có mặt' : att.status === 'absent_excused' ? 'Vắng Có phép' : 'Vắng Không phép'}
                                </span>
                              </div>
                              <div className="text-slate-300 font-semibold">{cls?.name}</div>
                              <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800/80">
                                <span className="text-slate-400">Suất bánh sữa:</span>
                                <span>
                                  {loggedInStudent.is_royal_student ? (
                                    att.status === 'absent_excused' ? (
                                      <span className="text-amber-400 font-semibold">Hoàn trả bếp</span>
                                    ) : (
                                      <span className="text-emerald-400 font-semibold">Đã nhận suất</span>
                                    )
                                  ) : (
                                    <span className="text-slate-500">Không thuộc diện</span>
                                  )}
                                </span>
                              </div>
                              {att.note && (
                                <div className="text-[11px] text-slate-400 italic">
                                  Ghi chú: {att.note}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2 px-3">Ngày Học</th>
                              <th className="py-2 px-3">Lớp Học</th>
                              <th className="py-2 px-3 text-center">Chuyên Cần</th>
                              <th className="py-2 px-3 text-center">Suất Bánh Sữa</th>
                              <th className="py-2 px-3">Ghi Chú Của Giáo Viên</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {studentAttendance.map(att => {
                              const cls = store.classes.find(c => c.id === att.class_id);
                              return (
                                <tr key={att.id} className="hover:bg-slate-800/30">
                                  <td className="py-2 px-3 font-mono font-bold text-white">{att.session_date}</td>
                                  <td className="py-2 px-3 text-slate-300">{cls?.name}</td>
                                  <td className="py-2 px-3 text-center font-bold">
                                    {att.status === 'present' ? (
                                      <span className="text-emerald-400">Có mặt</span>
                                    ) : att.status === 'absent_excused' ? (
                                      <span className="text-amber-400">Vắng Có phép</span>
                                    ) : (
                                      <span className="text-rose-400">Vắng Không phép</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {loggedInStudent.is_royal_student ? (
                                      att.status === 'absent_excused' ? (
                                        <span className="text-amber-400 text-[11px]">Hoàn trả bếp</span>
                                      ) : (
                                        <span className="text-emerald-400 text-[11px]">Đã nhận suất</span>
                                      )
                                    ) : (
                                      <span className="text-slate-500 text-[11px]">Không thuộc diện</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-slate-400 text-[11px]">{att.note || '-'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Vui lòng nhập Số điện thoại phụ huynh để tra cứu hồ sơ học viên.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COURSE REGISTRATION FORM */}
          {activeTab === 'register' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="text-center mb-4">
                <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                  Trường Song Ngữ Quốc Tế Hoàng Gia
                </span>
                <h3 className="text-xl font-extrabold text-white mt-1">Đăng Ký Khóa Học Ngoại Khóa Online</h3>
                <p className="text-xs text-slate-400">
                  Phụ huynh chọn môn học và khung giờ mong muốn; Học vụ sẽ sắp xếp lớp và gửi xác nhận.
                </p>
              </div>

              {regReceipt && (
                <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-900 to-[#0B0F19] border border-amber-500/40 shadow-2xl space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-extrabold text-white text-sm">HỒ SƠ ĐÃ ĐƯỢC TIẾP NHẬN THÀNH CÔNG</div>
                        <div className="text-[11px] text-amber-400 font-mono font-bold">Mã tiếp nhận: {regReceipt.leadCode}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setRegReceipt(null)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Đăng ký thêm
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Left: Summary info */}
                    <div className="space-y-2 text-xs">
                      <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Học sinh:</span>
                          <span className="text-white font-bold">{regReceipt.studentName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Phụ huynh:</span>
                          <span className="text-slate-200">{regReceipt.parentName} ({regReceipt.parentPhone})</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Môn học:</span>
                          <span className="text-amber-300 font-semibold">{regReceipt.subjectName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Cơ sở:</span>
                          <span className="text-slate-200">{regReceipt.campusName}</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Học phí cần thanh toán:</span>
                        <span className="text-xl font-extrabold text-emerald-400 font-mono">{formatVND(regReceipt.estimatedAmount)}</span>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Số tài khoản: <strong className="text-white font-mono">{regReceipt.bankAccount}</strong> ({regReceipt.bankName})
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Chủ TK: <strong className="text-white">{regReceipt.bankOwner}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Right: VietQR Code */}
                    <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white text-slate-950 shadow-lg text-center">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                        Quét Mã VietQR Napas247 Chuyển Khoản
                      </span>
                      <img 
                        src={regReceipt.qrUrl} 
                        alt="VietQR Napas247" 
                        className="w-40 h-40 object-contain rounded-lg"
                      />
                      <span className="text-[9px] font-mono text-slate-500 mt-1">
                        Cú pháp: {regReceipt.leadCode} {regReceipt.studentName}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Họ tên Phụ huynh *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nguyễn Văn A"
                      value={regForm.parent_name}
                      onChange={(e) => setRegForm({ ...regForm, parent_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">SĐT Phụ huynh *</label>
                    <input
                      type="tel"
                      required
                      placeholder="0909..."
                      value={regForm.parent_phone}
                      onChange={(e) => setRegForm({ ...regForm, parent_phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Họ tên bé học sinh *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nguyễn Hoàng B"
                      value={regForm.student_name}
                      onChange={(e) => setRegForm({ ...regForm, student_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Ngày sinh của bé</label>
                    <input
                      type="date"
                      value={regForm.student_dob}
                      onChange={(e) => setRegForm({ ...regForm, student_dob: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Cơ sở đăng ký</label>
                    <select
                      value={regForm.desired_campus_id}
                      onChange={(e) => setRegForm({ ...regForm, desired_campus_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    >
                      {store.campuses.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Môn học ngoại khóa</label>
                    <select
                      value={regForm.desired_subject_id}
                      onChange={(e) => setRegForm({ ...regForm, desired_subject_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    >
                      {store.subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Khung giờ mong muốn</label>
                    <select
                      value={regForm.desired_time_slot_type}
                      onChange={(e) => setRegForm({ ...regForm, desired_time_slot_type: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="after_school">Sau giờ học (16:45 - 18:15)</option>
                      <option value="weekend">Cuối tuần (Sáng Thứ Bảy / Chủ Nhật)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Phân loại học sinh</label>
                    <select
                      value={regForm.is_royal_student ? 'true' : 'false'}
                      onChange={(e) => setRegForm({ ...regForm, is_royal_student: e.target.value === 'true' })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                    >
                      <option value="true">Học sinh chính khóa Royal School (Có suất bánh sữa)</option>
                      <option value="false">Học sinh trường ngoài</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-rose-400 font-semibold mb-1">Lưu ý sức khỏe / dị ứng thực phẩm</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Uống sữa không đường, dị ứng đậu phộng, hen suyễn nhẹ..."
                    value={regForm.medical_notes}
                    onChange={(e) => setRegForm({ ...regForm, medical_notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-rose-500/30 text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4 text-slate-950" />
                  <span>Gửi Đơn Đăng Ký Khóa Học</span>
                </button>
              </form>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900/90 border-t border-slate-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Đóng Cổng Phụ Huynh
          </button>
        </div>

      </div>

      {/* VietQR View Modal for Parent */}
      {viewingQrInvoice && (() => {
        const student = store.students.find(s => s.id === viewingQrInvoice.student_id);
        const cls = store.classes.find(c => c.id === viewingQrInvoice.class_id);
        const campus = store.campuses.find(c => c.id === cls?.campus_id) || store.campuses[0];

        const qrUrl = generateVietQRUrl({
          bankName: campus.bank_name,
          bankAccount: campus.bank_account,
          bankOwner: campus.bank_owner,
          amount: viewingQrInvoice.outstanding_amount || viewingQrInvoice.net_payable,
          studentCode: student?.code || 'STUDENT',
          className: cls?.name || 'CLASS',
          invoiceCode: viewingQrInvoice.invoice_code,
        });

        return (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl text-center space-y-4">
              <div className="flex items-center justify-between text-xs text-amber-400 font-bold uppercase tracking-wider">
                <span>Quét Mã Thanh Toán VietQR</span>
                <button onClick={() => setViewingQrInvoice(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="bg-white p-3 rounded-2xl inline-block shadow-md">
                <img
                  src={qrUrl}
                  alt="VietQR"
                  className="w-60 h-60 mx-auto object-contain"
                />
              </div>

              <div className="text-left bg-slate-900 p-3 rounded-xl text-xs space-y-1">
                <div className="text-slate-400">Ngân hàng: <strong className="text-white">{campus.bank_name}</strong></div>
                <div className="text-slate-400">Số tài khoản: <strong className="text-amber-400 font-mono">{campus.bank_account}</strong></div>
                <div className="text-slate-400">Số tiền: <strong className="text-emerald-400 font-mono">{formatVND(viewingQrInvoice.outstanding_amount || viewingQrInvoice.net_payable)}</strong></div>
                <div className="text-slate-400">Nội dung CK: <strong className="text-cyan-300 font-mono">HP {student?.code} {cls?.name.split('-')[0].trim()}</strong></div>
              </div>

              <button
                onClick={() => setViewingQrInvoice(null)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
