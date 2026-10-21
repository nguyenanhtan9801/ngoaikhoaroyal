import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  HeartHandshake, 
  GraduationCap, 
  Crown, 
  ArrowRightLeft, 
  FileText,
  Phone,
  Cake,
  Edit2,
  Filter,
  Sparkles,
  XCircle,
  Camera,
  Upload,
  Trash2,
  Cloud,
  User,
  X,
  Save,
  ExternalLink
} from 'lucide-react';
import { 
  AppStore, 
  generateStudentCode, 
  formatVND, 
  deduplicateEnrollments, 
  createAuditRecord, 
  appendAuditLog,
  GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_DRIVE_ROOT_URL
} from '../../lib/storage';
import { formatCapitalizedName } from '../../lib/formatters';
import { uploadFileToServer } from '../../lib/fileStorage';
import { Student, UserRole, ExtracurricularClass, Enrollment, TuitionInvoice } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { RoyalLogo } from '../RoyalLogo';

interface StudentsTabProps {
  store: AppStore;
  currentRole: UserRole;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onPrintStudentCard: (student: Student) => void;
  focusHealth?: boolean;
  initialSearch?: string;
}

export const StudentsTab: React.FC<StudentsTabProps> = ({
  store,
  currentRole,
  onUpdateStore,
  onPrintStudentCard,
  focusHealth = false,
  initialSearch,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [search, setSearch] = useState(initialSearch || '');
  const [filterType, setFilterType] = useState<'all' | 'royal' | 'outside'>('all');
  const [onlyHealth, setOnlyHealth] = useState(focusHealth);

  React.useEffect(() => {
    setOnlyHealth(focusHealth);
  }, [focusHealth]);

  React.useEffect(() => {
    if (initialSearch !== undefined) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  // Business Rule 3: Auto-cleanup deduplication to strictly enforce Unique Constraint: (student_id, class_id)
  React.useEffect(() => {
    const cleaned = deduplicateEnrollments(store.enrollments);
    if (cleaned.length !== store.enrollments.length) {
      onUpdateStore(prev => ({
        ...prev,
        enrollments: deduplicateEnrollments(prev.enrollments),
      }));
    }
  }, [store.enrollments, onUpdateStore]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [convertingStudent, setConvertingStudent] = useState<Student | null>(null);
  const [enrollingStudent, setEnrollingStudent] = useState<Student | null>(null);

  // Student Photo Upload & Preview Modal
  const [photoModalStudent, setPhotoModalStudent] = useState<Student | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploadSuccess, setPhotoUploadSuccess] = useState<string | null>(null);

  // Cloud Storage destination folder config
  const cloudFolder = store.cloudStorageConfig?.drive_folder_id || GOOGLE_DRIVE_FOLDER_ID;
  const cloudProviderLabel = 'Google Drive';

  // New Student Form State
  const [formData, setFormData] = useState({
    name: '',
    dob: '2016-01-01',
    gender: 'Nam' as 'Nam' | 'Nữ',
    parent_name: '',
    parent_phone: '',
    school_name: 'Royal School PMH',
    regular_class: 'Grade 4A1',
    is_royal_student: true,
    medical_notes: '',
    avatar_url: '',
    photo_stored_at: '',
  });

  // Handle image file selection
  const handlePhotoFileChange = (
    file: File, 
    callback: (dataUrl: string, storedPath: string) => void, 
    studentCode?: string
  ) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = (e.target?.result as string) || '';
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetCode = studentCode || 'STUDENT_CARD';
      const storedPath = `Google Drive: ${cloudFolder}/01_HinhHocSinh/${targetCode}_${sanitizedName}`;
      callback(dataUrl, storedPath);
    };
    reader.readAsDataURL(file);
  };

  // Save or delete photo from modal
  const handleSaveModalPhoto = (dataUrl: string | null) => {
    if (!photoModalStudent) return;
    const student = photoModalStudent;
    const now = new Date().toISOString().split('T')[0];

    if (dataUrl) {
      const storedPath = `Server: /uploads/students/${student.code}.jpg`;
      uploadFileToServer(dataUrl, `${student.code}.jpg`, 'students').catch(err => {
        console.warn('Server photo upload error:', err);
      });

      const updateLog = createAuditRecord(
        'STUDENT_UPDATE',
        'ACADEMIC',
        `Hình thẻ Học viên ${student.name}`,
        `Cập nhật ảnh thẻ học viên ${student.name} (${student.code}) - Tệp đã lưu vào Server: /uploads/students/${student.code}.jpg và đồng bộ Drive`,
        null,
        {
          target_id: student.code,
          details: {
            photo_stored_at: storedPath,
            drive_url: GOOGLE_DRIVE_ROOT_URL,
            status: 'success',
          }
        }
      );

      onUpdateStore(prev => ({
        ...prev,
        students: prev.students.map(s => 
          s.id === student.id 
            ? { ...s, avatar_url: dataUrl, photo_stored_at: storedPath, photo_updated_at: now } 
            : s
        ),
        auditLogs: [updateLog, ...(prev.auditLogs || [])],
      }));
      setPhotoUploadSuccess(`Đã lưu ảnh thẻ vào Server: /uploads/students/${student.code}.jpg`);
      setTimeout(() => {
        setPhotoUploadSuccess(null);
        setPhotoModalStudent(null);
        setPhotoPreview(null);
      }, 1100);
    } else {
      const removeLog = createAuditRecord(
        'STUDENT_UPDATE',
        'ACADEMIC',
        `Hình thẻ Học viên ${student.name}`,
        `Gỡ bỏ ảnh thẻ của học viên ${student.name} (${student.code})`,
        null,
        {
          target_id: student.code,
          details: { action: 'delete_photo', status: 'success' }
        }
      );

      onUpdateStore(prev => ({
        ...prev,
        students: prev.students.map(s => 
          s.id === student.id 
            ? { ...s, avatar_url: undefined, photo_stored_at: undefined, photo_updated_at: undefined } 
            : s
        ),
        auditLogs: [removeLog, ...(prev.auditLogs || [])],
      }));
      setPhotoModalStudent(null);
      setPhotoPreview(null);
    }
  };

  // Enrollment Modal State
  const [selectedClassId, setSelectedClassId] = useState('');
  const [registeredSessions, setRegisteredSessions] = useState(24);
  const [isTrialMode, setIsTrialMode] = useState(true);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

  // Trial Action Modal State (Promote to Active or Drop after Trial)
  const [trialActionModal, setTrialActionModal] = useState<{
    type: 'promote' | 'drop';
    student: Student;
    enrollment: Enrollment;
    className: string;
  } | null>(null);
  const [trialNotes, setTrialNotes] = useState('');

  // Filter students
  const filteredStudents = store.students.filter(s => {
    const matchSearch = 
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.parent_phone.includes(search) ||
      (s.medical_notes && s.medical_notes.toLowerCase().includes(search.toLowerCase()));

    const matchType = 
      filterType === 'all' ? true :
      filterType === 'royal' ? s.is_royal_student :
      !s.is_royal_student;

    const matchHealth = onlyHealth ? !!s.medical_notes && s.medical_notes.trim().length > 0 : true;

    return matchSearch && matchType && matchHealth;
  });

  // Convert Outside Student to Royal Student
  const handleConfirmConvert = (student: Student) => {
    const newCode = generateStudentCode(true, store.students);
    onUpdateStore(prev => {
      const updatedStudents = prev.students.map(s => {
        if (s.id === student.id) {
          return {
            ...s,
            code: newCode,
            previous_student_code: s.code,
            is_royal_student: true,
            school_name: s.school_name?.includes('Royal') ? s.school_name : 'Royal School (Chính khóa)',
          };
        }
        return s;
      });

      return {
        ...prev,
        students: updatedStudents,
        notifications: [
          {
            id: `notif_${Date.now()}`,
            type: 'enrollment_over_quota',
            title: 'Chuyển đổi học sinh sang trường Royal thành công',
            message: `Học sinh ${student.name} đã được cấp mã mới ${newCode} (Mã cũ: ${student.code}). Kích hoạt suất bánh sữa sau giờ!`,
            date: new Date().toISOString().split('T')[0],
            severity: 'low',
            read: false,
          },
          ...prev.notifications,
        ],
      };
    });

    setConvertingStudent(null);
  };

  // Save Add / Edit Student
  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.parent_phone) return;

    if (editingStudent) {
      // Edit
      const storedAt = formData.avatar_url && (!editingStudent.avatar_url || formData.avatar_url !== editingStudent.avatar_url)
        ? `${cloudProviderLabel}: ${cloudFolder}/TheHocVien/${editingStudent.code}.jpg`
        : (formData.photo_stored_at || editingStudent.photo_stored_at);

      const updateLog = createAuditRecord(
        'STUDENT_UPDATE',
        'ACADEMIC',
        'Hồ sơ Học sinh',
        `Cập nhật thông tin học sinh ${editingStudent.name} (Mã: ${editingStudent.code})${formData.avatar_url !== editingStudent.avatar_url ? ' - Đồng bộ hình thẻ vào Cloud' : ''}`,
        null,
        {
          target_id: editingStudent.code,
          details: {
            status: 'success',
            photo_stored_at: storedAt,
            before: {
              name: editingStudent.name,
              parent_phone: editingStudent.parent_phone,
              regular_class: editingStudent.regular_class,
              medical_notes: editingStudent.medical_notes,
            },
            after: {
              name: formData.name,
              parent_phone: formData.parent_phone,
              regular_class: formData.regular_class,
              medical_notes: formData.medical_notes,
            }
          }
        }
      );

      onUpdateStore(prev => ({
        ...prev,
        students: prev.students.map(s => 
          s.id === editingStudent.id 
            ? { 
                ...s, 
                ...formData, 
                photo_stored_at: storedAt, 
                photo_updated_at: formData.avatar_url ? (s.photo_updated_at || new Date().toISOString().split('T')[0]) : undefined 
              } 
            : s
        ),
        auditLogs: [updateLog, ...(prev.auditLogs || [])],
      }));
    } else {
      // Add
      const code = generateStudentCode(formData.is_royal_student, store.students);
      const storedAt = formData.avatar_url
        ? `${cloudProviderLabel}: ${cloudFolder}/TheHocVien/${code}.jpg`
        : undefined;

      const newStudent: Student = {
        id: `std_${Date.now()}`,
        code,
        name: formData.name,
        dob: formData.dob,
        gender: formData.gender,
        parent_name: formData.parent_name,
        parent_phone: formData.parent_phone,
        school_name: formData.school_name,
        regular_class: formData.regular_class,
        is_royal_student: formData.is_royal_student,
        medical_notes: formData.medical_notes,
        avatar_url: formData.avatar_url || undefined,
        photo_stored_at: storedAt,
        photo_updated_at: formData.avatar_url ? new Date().toISOString().split('T')[0] : undefined,
        status: 'active',
        created_at: new Date().toISOString().split('T')[0],
      };

      const createLog = createAuditRecord(
        'STUDENT_CREATE',
        'ACADEMIC',
        'Hồ sơ Học sinh',
        `Thêm mới hồ sơ học sinh ${newStudent.name} (Mã: ${newStudent.code})${newStudent.avatar_url ? ' kèm hình thẻ' : ' (chưa tải hình thẻ)'}`,
        null,
        {
          target_id: newStudent.code,
          details: {
            status: 'success',
            has_photo: !!newStudent.avatar_url,
            photo_stored_at: storedAt,
            after: {
              code: newStudent.code,
              name: newStudent.name,
              parent_phone: newStudent.parent_phone,
              is_royal: newStudent.is_royal_student,
            }
          }
        }
      );

      onUpdateStore(prev => ({
        ...prev,
        students: [newStudent, ...prev.students],
        auditLogs: [createLog, ...(prev.auditLogs || [])],
      }));
    }

    setShowAddModal(false);
    setEditingStudent(null);
  };

  // Open Edit Modal
  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      name: student.name,
      dob: student.dob,
      gender: student.gender,
      parent_name: student.parent_name,
      parent_phone: student.parent_phone,
      school_name: student.school_name || '',
      regular_class: student.regular_class || '',
      is_royal_student: student.is_royal_student,
      medical_notes: student.medical_notes || '',
      avatar_url: student.avatar_url || '',
      photo_stored_at: student.photo_stored_at || '',
    });
    setShowAddModal(true);
  };

  // Open Class Enrollment Modal with duplicate checks
  const handleOpenEnrollModal = (student: Student) => {
    const studentActiveEnrolledClassIds = new Set(
      store.enrollments
        .filter(e => e.student_id === student.id && (e.status === 'active' || e.status === 'trial'))
        .map(e => e.class_id)
    );
    // Find first class student has NOT enrolled in yet
    const firstAvailable = store.classes.find(c => !studentActiveEnrolledClassIds.has(c.id));

    if (firstAvailable) {
      setSelectedClassId(firstAvailable.id);
      setRegisteredSessions(firstAvailable.total_sessions);
      setEnrollmentError(null);
    } else {
      setSelectedClassId('');
      setRegisteredSessions(24);
      setEnrollmentError('Học viên này đã ghi danh vào tất cả các lớp học hiện có trong hệ thống!');
    }
    setIsTrialMode(true);
    setEnrollingStudent(student);
  };

  // Enroll in Class with duplicate validation & Trial Policy
  const handleConfirmEnrollment = () => {
    if (!enrollingStudent) return;
    if (!selectedClassId) {
      setEnrollmentError('Vui lòng chọn lớp học để ghi danh!');
      return;
    }
    const cls = store.classes.find(c => c.id === selectedClassId);
    if (!cls) {
      setEnrollmentError('Không tìm thấy thông tin lớp học được chọn!');
      return;
    }

    // Business Rule 1 & 2: Check if student is already enrolled in this class
    const isAlreadyEnrolled = store.enrollments.some(
      e => e.student_id === enrollingStudent.id && e.class_id === cls.id && (e.status === 'active' || e.status === 'trial')
    );
    if (isAlreadyEnrolled) {
      setEnrollmentError(`Học viên này đã được ghi danh vào lớp "${cls.name}". Không thể đăng ký trùng lặp!`);
      return;
    }

    setEnrollmentError(null);

    const enrollmentStatus: 'trial' | 'active' = isTrialMode ? 'trial' : 'active';
    const newEnrollment: Enrollment = {
      id: `enr_${Date.now()}`,
      student_id: enrollingStudent.id,
      class_id: cls.id,
      registered_sessions: registeredSessions,
      joined_date: new Date().toISOString().split('T')[0],
      status: enrollmentStatus,
      trial_session_date: isTrialMode ? new Date().toISOString().split('T')[0] : undefined,
      trial_notes: isTrialMode ? 'Học sinh đăng ký học thử 1 buổi đầu tiên' : undefined,
    };

    // Calculate mid-course tuition: price_per_session * registeredSessions
    const grossAmount = cls.price_per_session * registeredSessions;

    // Create Invoice with separate subject/class
    const newInvoice: TuitionInvoice = {
      id: `inv_${Date.now()}`,
      invoice_code: `INV-${new Date().getFullYear()}-${String(store.invoices.length + 1).padStart(4, '0')}`,
      student_id: enrollingStudent.id,
      class_id: cls.id,
      gross_amount: grossAmount,
      credit_deducted: 0,
      net_payable: grossAmount,
      paid_amount: 0,
      outstanding_amount: grossAmount,
      payment_status: 'unpaid',
      due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], // 1 week
      is_trial_pending: isTrialMode,
      trial_fee: 0,
      created_at: new Date().toISOString().split('T')[0],
    };

    onUpdateStore(prev => {
      // Business Rule 3: Filter out any existing active or trial record for this student & class and deduplicate
      const cleanExisting = prev.enrollments.filter(
        e => !(e.student_id === enrollingStudent.id && e.class_id === cls.id && (e.status === 'active' || e.status === 'trial'))
      );
      const cleanEnrollments = deduplicateEnrollments([...cleanExisting, newEnrollment]);
      return {
        ...prev,
        enrollments: cleanEnrollments,
        invoices: [...prev.invoices, newInvoice],
      };
    });

    setEnrollingStudent(null);
  };

  // Promote Trial Enrollment to Active (Chính thức theo học)
  const handleConfirmPromoteTrial = (enrollmentId: string) => {
    onUpdateStore(prev => {
      const enr = prev.enrollments.find(e => e.id === enrollmentId);
      if (!enr) return prev;
      const student = prev.students.find(s => s.id === enr.student_id);
      const cls = prev.classes.find(c => c.id === enr.class_id);

      return {
        ...prev,
        enrollments: prev.enrollments.map(e => 
          e.id === enrollmentId 
            ? { ...e, status: 'active', trial_outcome: 'promoted', trial_notes: 'Xác nhận lên học chính thức toàn khóa' } 
            : e
        ),
        invoices: prev.invoices.map(inv => 
          inv.student_id === enr.student_id && inv.class_id === enr.class_id && inv.is_trial_pending
            ? { ...inv, is_trial_pending: false }
            : inv
        ),
        notifications: [
          {
            id: `notif_${Date.now()}`,
            type: 'enrollment_over_quota',
            title: 'Học viên chính thức theo học sau buổi thử 1',
            message: `Học sinh ${student?.name || ''} đã chuyển sang học CHÍNH THỨC lớp ${cls?.name || ''}. Hóa đơn học phí đã kích hoạt thanh toán.`,
            date: new Date().toISOString().split('T')[0],
            severity: 'low',
            read: false,
          },
          ...prev.notifications,
        ],
      };
    });
    setTrialActionModal(null);
    setTrialNotes('');
  };

  // Drop Trial Enrollment (Nghỉ sau buổi học thử 1 - Hủy hóa đơn, không nợ, giải phóng chỗ)
  const handleConfirmDropTrial = (enrollmentId: string, notes?: string) => {
    onUpdateStore(prev => {
      const enr = prev.enrollments.find(e => e.id === enrollmentId);
      if (!enr) return prev;
      const student = prev.students.find(s => s.id === enr.student_id);
      const cls = prev.classes.find(c => c.id === enr.class_id);

      return {
        ...prev,
        enrollments: prev.enrollments.map(e => 
          e.id === enrollmentId 
            ? { ...e, status: 'trial_dropped', trial_outcome: 'dropped', trial_notes: notes || 'Học sinh dừng học sau buổi thử 1' } 
            : e
        ),
        // Cancel the full-course invoice with 0 fee, no bad debt
        invoices: prev.invoices.map(inv => 
          inv.student_id === enr.student_id && inv.class_id === enr.class_id
            ? { 
                ...inv, 
                is_trial_pending: false, 
                payment_status: 'cancelled', 
                outstanding_amount: 0,
                net_payable: 0,
                payment_reference: 'MIỄN PHÍ BUỔI HỌC THỬ (DỪNG HỌC)',
              }
            : inv
        ),
        notifications: [
          {
            id: `notif_${Date.now()}`,
            type: 'drop_alert',
            title: 'Dừng học thử lớp ngoại khóa (Không nợ phí)',
            message: `Học sinh ${student?.name || ''} dừng học thử lớp ${cls?.name || ''}. Đã hủy hóa đơn, giải phóng sĩ số lớp và không ghi nhận công nợ.`,
            date: new Date().toISOString().split('T')[0],
            severity: 'medium',
            read: false,
          },
          ...prev.notifications,
        ],
      };
    });
    setTrialActionModal(null);
    setTrialNotes('');
  };

  return (
    <div className="space-y-6">
      
      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {/* Filter Pills */}
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterType === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Tất cả ({store.students.length})
          </button>
          <button
            onClick={() => setFilterType('royal')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterType === 'royal'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Học sinh Royal ({store.students.filter(s => s.is_royal_student).length})
          </button>
          <button
            onClick={() => setFilterType('outside')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterType === 'outside'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Học sinh ngoài trường ({store.students.filter(s => !s.is_royal_student).length})
          </button>
          <button
            onClick={() => setOnlyHealth(!onlyHealth)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              onlyHealth
                ? 'bg-rose-500 text-white font-bold shadow-md shadow-rose-500/20'
                : 'bg-slate-900 text-rose-400 hover:text-rose-300 border border-rose-500/30'
            }`}
          >
            <span>Có lưu ý y tế ({store.students.filter(s => !!s.medical_notes).length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo tên, mã HV, SĐT, dị ứng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 w-56"
            />
          </div>

          <a
            href={GOOGLE_DRIVE_ROOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-semibold text-xs transition-colors shrink-0"
            title="Mở thư mục Google Drive lưu trữ hình học sinh & đơn nghỉ phép"
          >
            <Cloud className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Drive Ảnh Học Sinh</span>
            <ExternalLink className="w-3 h-3 text-cyan-400" />
          </a>

          <button
            onClick={() => {
              setEditingStudent(null);
              setFormData({
                name: '',
                dob: '2016-01-01',
                gender: 'Nam',
                parent_name: '',
                parent_phone: '',
                school_name: 'Royal School PMH',
                regular_class: 'Grade 4A1',
                is_royal_student: true,
                medical_notes: '',
                avatar_url: '',
                photo_stored_at: '',
              });
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all shrink-0"
          >
            <UserPlus className="w-4 h-4 text-slate-950" />
            <span>Thêm Học Viên</span>
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
                  <th className="py-3 px-3 text-center w-14">Hình Thẻ</th>
                  <th className="py-3 px-4">Mã HV</th>
                  <th className="py-3 px-4">Họ và Tên</th>
                  <th className="py-3 px-4">Ngày Sinh & Giới Tính</th>
                  <th className="py-3 px-4">Phân Loại / Bánh Sữa</th>
                  <th className="py-3 px-4">Trường & Lớp</th>
                  <th className="py-3 px-4">Phụ Huynh & SĐT</th>
                  <th className="py-3 px-4">Lưu Ý Y Tế & Dị Ứng</th>
                  <th className="py-3 px-4">Lớp Đang Học</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStudents.map(student => {
                  const studentEnrollments = store.enrollments.filter(
                    e => e.student_id === student.id && (e.status === 'active' || e.status === 'trial')
                  );

                  return (
                    <tr key={student.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-center">
                        {student.avatar_url ? (
                          <div
                            onClick={() => {
                              setPhotoModalStudent(student);
                              setPhotoPreview(student.avatar_url || null);
                            }}
                            className="relative group cursor-pointer inline-block w-9 h-11 rounded-lg overflow-hidden border border-amber-500/40 shadow-sm align-middle"
                            title={`Xem / Đổi ảnh thẻ của ${student.name}`}
                          >
                            <img
                              src={student.avatar_url}
                              alt={student.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Camera className="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPhotoModalStudent(student);
                              setPhotoPreview(null);
                            }}
                            className="inline-flex flex-col items-center justify-center w-9 h-11 rounded-lg bg-slate-900 border border-dashed border-slate-700 hover:border-amber-500/60 text-slate-500 hover:text-amber-400 transition-all group align-middle"
                            title="Tải ảnh thẻ học sinh"
                          >
                            <Camera className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                            <span className="text-[7.5px] font-bold">+Ảnh</span>
                          </button>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                          student.is_royal_student
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}>
                          {student.code}
                        </span>
                        {student.previous_student_code && (
                          <div className="text-[10px] text-cyan-400 font-mono mt-0.5">
                            Cũ: {student.previous_student_code}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{student.name}</div>
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        <div>{student.dob}</div>
                        <div className="text-[10px] text-slate-500">{student.gender}</div>
                      </td>

                      <td className="py-3 px-4">
                        {student.is_royal_student ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 inline-flex items-center gap-1">
                            <Crown className="w-3 h-3 text-amber-400" />
                            Royal (Bánh sữa)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            Ngoài trường
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        <div>{student.school_name || 'Royal School'}</div>
                        <div className="text-[10px] text-slate-500">{student.regular_class || 'Chưa xếp lớp'}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-white font-medium">{student.parent_name}</div>
                        <div className="text-amber-400 font-mono text-[11px]">{student.parent_phone}</div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        {student.medical_notes ? (
                          <div className="flex items-start gap-1 p-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <span className="truncate">{student.medical_notes}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Bình thường</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1.5 max-w-xs">
                          {studentEnrollments.length > 0 ? (
                            studentEnrollments.map(enr => {
                              const c = store.classes.find(cl => cl.id === enr.class_id);
                              if (!c) return null;
                              const isTrial = enr.status === 'trial';
                              const shortName = c.name.split('-')[0].trim();
                              return (
                                <div key={enr.id} className="flex items-center gap-1.5 flex-wrap">
                                  {isTrial ? (
                                    <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                                      <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                                      <span>{shortName} (Học thử buổi 1)</span>
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-medium flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span>{shortName} (Chính thức)</span>
                                    </span>
                                  )}

                                  {isTrial && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setTrialActionModal({ type: 'promote', student, enrollment: enr, className: c.name })}
                                        className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold flex items-center gap-0.5 transition-colors"
                                        title="Lên chính thức (Kích hoạt hóa đơn toàn khóa)"
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                        <span>Lên CT</span>
                                      </button>
                                      <button
                                        onClick={() => setTrialActionModal({ type: 'drop', student, enrollment: enr, className: c.name })}
                                        className="px-1.5 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[9px] font-bold flex items-center gap-0.5 transition-colors"
                                        title="Nghỉ sau buổi thử (Hủy HĐ, giải phóng chỗ)"
                                      >
                                        <XCircle className="w-2.5 h-2.5 text-rose-400" />
                                        <span>Nghỉ thử</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-slate-500 text-[10px] italic">Chưa xếp lớp</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setPhotoModalStudent(student);
                              setPhotoPreview(student.avatar_url || null);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                            title="Quản lý ảnh thẻ 3x4 (Lưu vào Cloud)"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(student)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                            title="Sửa thông tin"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onPrintStudentCard(student)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                            title="In thẻ học viên"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          {!student.is_royal_student && (
                            <button
                              onClick={() => setConvertingStudent(student)}
                              className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-bold"
                              title="Chuyển sang Royal"
                            >
                              Chuyển Royal
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEnrollModal(student)}
                            className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-bold shadow-sm"
                            title="Ghi danh vào lớp học mới"
                          >
                            + Lớp
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.map(student => {
            const studentEnrollments = store.enrollments.filter(
              e => e.student_id === student.id && (e.status === 'active' || e.status === 'trial')
            );

            return (
              <div
                key={student.id}
                className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-5 backdrop-blur-md shadow-xl flex flex-col justify-between hover:border-slate-700/80 transition-all relative overflow-hidden"
              >
                {/* Header row with Photo and Badges */}
                <div className="flex items-start gap-3 mb-3">
                  {student.avatar_url ? (
                    <div
                      onClick={() => {
                        setPhotoModalStudent(student);
                        setPhotoPreview(student.avatar_url || null);
                      }}
                      className="relative group cursor-pointer w-12 h-14 rounded-2xl overflow-hidden border border-amber-500/40 shadow-md shrink-0"
                      title={`Xem / Thay ảnh thẻ (Lưu tại: ${student.photo_stored_at || cloudFolder})`}
                    >
                      <img
                        src={student.avatar_url}
                        alt={student.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoModalStudent(student);
                        setPhotoPreview(null);
                      }}
                      className="w-12 h-14 rounded-2xl bg-slate-900 border border-dashed border-slate-700 hover:border-amber-500/60 flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-amber-400 transition-all group shrink-0"
                      title="Chưa có hình thẻ - Nhấp để tải lên Cloud"
                    >
                      <Camera className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span className="text-[9px] font-medium">+Ảnh thẻ</span>
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold border ${
                        student.is_royal_student
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {student.code}
                      </span>

                      {student.is_royal_student ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <Crown className="w-3 h-3 text-amber-400" />
                          Royal
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          Ngoài trường
                        </span>
                      )}
                    </div>

                    <h4 className="text-base font-bold text-white flex items-center justify-between">
                      <span className="truncate">{student.name}</span>
                      <span className="text-xs text-slate-400 font-normal shrink-0 ml-1">{student.gender}</span>
                    </h4>
                  </div>
                </div>

                <div>

                  <div className="mt-2 space-y-1 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <Cake className="w-3.5 h-3.5 text-slate-500" />
                      <span>Sinh: {student.dob}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-500" />
                      <span>{student.school_name} &bull; {student.regular_class || 'Chưa xếp lớp'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>PH: {student.parent_name} ({student.parent_phone})</span>
                    </div>
                  </div>

                  {student.previous_student_code && (
                    <div className="mt-2 text-[11px] text-cyan-400 font-mono bg-cyan-950/30 px-2 py-1 rounded-lg border border-cyan-800/40">
                      Mã cũ: {student.previous_student_code} (Đã chuyển Royal)
                    </div>
                  )}

                  {student.medical_notes && (
                    <div className="mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-rose-200 leading-tight">
                        <span className="font-bold">Lưu ý y tế/thực phẩm: </span>
                        {student.medical_notes}
                      </div>
                    </div>
                  )}

                  <div className="mt-3">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Lớp đang theo học:
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {studentEnrollments.length > 0 ? (
                        studentEnrollments.map(enr => {
                          const c = store.classes.find(cl => cl.id === enr.class_id);
                          if (!c) return null;
                          const isTrial = enr.status === 'trial';
                          return (
                            <div key={enr.id} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                              {isTrial ? (
                                <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                                  <span className="truncate">{c.name.split('-')[0].trim()} (Học thử)</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-medium flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                  <span className="truncate">{c.name.split('-')[0].trim()}</span>
                                </span>
                              )}

                              {isTrial && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => setTrialActionModal({ type: 'promote', student, enrollment: enr, className: c.name })}
                                    className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold transition-colors"
                                    title="Lên chính thức (Kích hoạt hóa đơn toàn khóa)"
                                  >
                                    Lên CT
                                  </button>
                                  <button
                                    onClick={() => setTrialActionModal({ type: 'drop', student, enrollment: enr, className: c.name })}
                                    className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-bold transition-colors"
                                    title="Dừng học thử (Hủy HĐ, không nợ)"
                                  >
                                    Nghỉ thử
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">Chưa ghi danh lớp nào</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setPhotoModalStudent(student);
                        setPhotoPreview(student.avatar_url || null);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="Quản lý hình thẻ 3x4 (Lưu vào Cloud)"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(student)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="Chỉnh sửa thông tin"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onPrintStudentCard(student)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="In Thẻ Học Viên & QR Code"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {!student.is_royal_student && (
                      <button
                        onClick={() => setConvertingStudent(student)}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-[11px] transition-all flex items-center gap-1"
                        title="Chuyển đổi thành Học sinh chính khóa Royal (Cấp mã RY... và suất bánh sữa)"
                      >
                        <ArrowRightLeft className="w-3 h-3 text-amber-400" />
                        <span>Chuyển Royal</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenEnrollModal(student)}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-[11px] transition-all flex items-center gap-1 shadow-sm"
                      title="Ghi danh vào lớp học mới"
                    >
                      + Xếp Lớp
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-amber-400" />
              <span>{editingStudent ? 'Chỉnh Sửa Hồ Sơ Học Viên' : 'Thêm Học Viên Mới Vào Hệ Thống'}</span>
            </h3>

            <form onSubmit={handleSaveStudent} className="space-y-3.5 text-xs">
              {/* Ảnh thẻ 3x4 (Có thể tải lên sau - Tự động đồng bộ vào Cloud) */}
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center gap-3.5">
                <div className="relative group shrink-0">
                  {formData.avatar_url ? (
                    <img 
                      src={formData.avatar_url} 
                      alt="Ảnh thẻ" 
                      className="w-14 h-18 object-cover rounded-xl border border-amber-500/50 shadow-md"
                    />
                  ) : (
                    <div className="w-14 h-18 rounded-xl bg-slate-950 border border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500 p-1 text-center">
                      <Camera className="w-4 h-4 mb-0.5 text-slate-400" />
                      <span className="text-[9px] font-medium leading-none">Ảnh 3x4</span>
                    </div>
                  )}
                  {formData.avatar_url && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, avatar_url: '', photo_stored_at: '' })}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 shadow-sm"
                      title="Gỡ ảnh"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs">Hình thẻ học sinh (3x4)</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-medium">
                      Có thể tải lên sau
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <label className="cursor-pointer px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center gap-1 transition-colors">
                      <Upload className="w-3 h-3" />
                      <span>{formData.avatar_url ? 'Thay đổi ảnh thẻ' : 'Chọn ảnh thẻ'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handlePhotoFileChange(file, (dataUrl, storedPath) => {
                              setFormData(prev => ({
                                ...prev,
                                avatar_url: dataUrl,
                                photo_stored_at: storedPath,
                              }));
                            }, editingStudent?.code);
                          }
                        }}
                      />
                    </label>
                    {formData.avatar_url && (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Đã chọn ảnh
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Họ và tên học sinh *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: formatCapitalizedName(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 capitalize"
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Giới tính</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Ngày sinh</label>
                  <input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Phân loại học sinh</label>
                  <select
                    value={formData.is_royal_student ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, is_royal_student: e.target.value === 'true' })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                  >
                    <option value="true">Học sinh Royal (Cấp mã RY... + Bánh sữa)</option>
                    <option value="false">Học sinh ngoài trường (Mã EXT... - Không bánh sữa)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Họ tên Phụ huynh</label>
                  <input
                    type="text"
                    value={formData.parent_name}
                    onChange={(e) => setFormData({ ...formData, parent_name: formatCapitalizedName(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 capitalize"
                    placeholder="Nguyễn Văn B"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">SĐT Phụ huynh *</label>
                  <input
                    type="text"
                    required
                    value={formData.parent_phone}
                    onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    placeholder="0903..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Trường học</label>
                  <input
                    type="text"
                    value={formData.school_name}
                    onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Lớp chính khóa</label>
                  <input
                    type="text"
                    value={formData.regular_class}
                    onChange={(e) => setFormData({ ...formData, regular_class: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                    placeholder="Grade 4A1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-rose-400 font-medium mb-1">
                  Lưu ý Y tế & Dị ứng thực phẩm (Hiển thị cảnh báo trực quan cho Giáo viên)
                </label>
                <input
                  type="text"
                  value={formData.medical_notes}
                  onChange={(e) => setFormData({ ...formData, medical_notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-rose-500/40 text-white focus:outline-none focus:border-rose-500"
                  placeholder="Ví dụ: Uống sữa không đường, dị ứng đậu phộng, hen suyễn nhẹ..."
                />
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
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                >
                  {editingStudent ? 'Cập Nhật' : 'Lưu Học Viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Convert to Royal Student Confirmation Modal */}
      {convertingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <RoyalLogo size="sm" />
              <h3 className="text-base font-bold text-white">Chuyển Đổi Thành Học Sinh Royal</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Bạn đang chuyển học sinh <strong className="text-white">{convertingStudent.name}</strong> (Mã hiện tại: <span className="font-mono text-amber-400">{convertingStudent.code}</span>) sang diện <strong>Học sinh chính khóa Royal School</strong>.
            </p>

            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Cấp mã định danh mới chuẩn: <strong>RY-2026-xxxxx</strong></span>
              </div>
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Bảo toàn 100% lịch sử học tập, hóa đơn, chuyên cần và bảo lưu</span>
              </div>
              <div className="flex items-center gap-2 text-amber-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Tự động kích hoạt tiêu chuẩn cấp <strong>suất bánh sữa sau giờ</strong></span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConvertingStudent(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => handleConfirmConvert(convertingStudent)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20"
              >
                Xác Nhận Chuyển Đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Class Enrollment Modal */}
      {enrollingStudent && (() => {
        // Enforce Unique Constraint: Find classes already actively enrolled or trialed
        const studentActiveEnrolledClassIds = new Set(
          store.enrollments
            .filter(e => e.student_id === enrollingStudent.id && (e.status === 'active' || e.status === 'trial'))
            .map(e => e.class_id)
        );
        const isCurrentClassAlreadyEnrolled = studentActiveEnrolledClassIds.has(selectedClassId);
        const isAllClassesEnrolled = store.classes.length > 0 && studentActiveEnrolledClassIds.size >= store.classes.length;
        const currentSelectedClass = store.classes.find(cl => cl.id === selectedClassId);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4 animate-fadeIn">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-amber-400" />
                <span>Ghi Danh Lớp & Tạo Hóa Đơn Tách Biệt</span>
              </h3>

              <div className="text-xs text-slate-400 flex items-center justify-between pb-2 border-b border-slate-800">
                <span>
                  Học sinh: <strong className="text-white">{enrollingStudent.name}</strong> ({enrollingStudent.code})
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px]">
                  Đã học {studentActiveEnrolledClassIds.size} lớp
                </span>
              </div>

              {/* Duplicate Enrollment Error Alert */}
              {enrollmentError && (
                <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{enrollmentError}</span>
                </div>
              )}

              {isCurrentClassAlreadyEnrolled && !enrollmentError && currentSelectedClass && (
                <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">
                    Học viên này đã được ghi danh vào lớp "{currentSelectedClass.name}". Không thể đăng ký trùng lặp!
                  </span>
                </div>
              )}

              {isAllClassesEnrolled && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Học sinh này đã ghi danh vào tất cả các lớp học hiện có trong hệ thống!</span>
                </div>
              )}

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Chọn lớp học mở <span className="text-slate-500">(Lớp đã ghi danh sẽ bị vô hiệu hóa)</span>
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => {
                      const classId = e.target.value;
                      setSelectedClassId(classId);
                      const isEnrolled = studentActiveEnrolledClassIds.has(classId);
                      const c = store.classes.find(cl => cl.id === classId);
                      if (isEnrolled && c) {
                        setEnrollmentError(`Học viên này đã được ghi danh vào lớp "${c.name}". Không thể đăng ký trùng lặp!`);
                      } else {
                        setEnrollmentError(null);
                      }
                      if (c) setRegisteredSessions(c.total_sessions);
                    }}
                    className={`w-full px-3 py-2 rounded-xl bg-slate-900 border text-white focus:outline-none transition-colors ${
                      isCurrentClassAlreadyEnrolled || enrollmentError
                        ? 'border-rose-500/60 focus:border-rose-500' 
                        : 'border-slate-700 focus:border-amber-500'
                    }`}
                  >
                    <option value="" disabled>-- Chọn lớp học cần ghi danh --</option>
                    {store.classes.map(c => {
                      const isEnrolled = studentActiveEnrolledClassIds.has(c.id);
                      return (
                        <option 
                          key={c.id} 
                          value={c.id} 
                          disabled={isEnrolled}
                          className={isEnrolled ? 'text-slate-500 bg-slate-900 font-normal italic' : 'text-white bg-slate-900 font-semibold'}
                        >
                          {c.name} {isEnrolled ? '⛔ [ĐÃ GHI DANH - KHÔNG THỂ CHỌN TRÙNG]' : ` - Đơn giá: ${formatVND(c.price_per_session)}/buổi`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Số buổi học đăng ký thực tế (Học sinh vào giữa chừng)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={registeredSessions}
                    onChange={(e) => setRegisteredSessions(Number(e.target.value))}
                    disabled={!selectedClassId || isCurrentClassAlreadyEnrolled || isAllClassesEnrolled}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 disabled:opacity-40 text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                {/* Trial Session Policy Option */}
                <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-transparent border border-purple-500/30 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="trialModeCheckbox"
                    checked={isTrialMode}
                    onChange={(e) => setIsTrialMode(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-purple-600 focus:ring-purple-500 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                  <label htmlFor="trialModeCheckbox" className="text-xs text-slate-300 cursor-pointer select-none">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Chính sách "Học thử 1 buổi đầu tiên"</span>
                      <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px] font-bold">Mặc định</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Học sinh trải nghiệm 1 buổi đầu tiên. Hóa đơn toàn khóa được tạm hoãn chờ (không nhắc nợ). Khi điểm danh buổi 2 hoặc phụ huynh xác nhận học tiếp, hệ thống sẽ kích hoạt chính thức.
                    </div>
                  </label>
                </div>

                {/* Live Tuition Calculation */}
                {selectedClassId && (() => {
                  const c = store.classes.find(cl => cl.id === selectedClassId);
                  if (!c) return null;
                  const total = c.price_per_session * registeredSessions;
                  return (
                    <div className={`p-3 rounded-2xl space-y-1 ${
                      isTrialMode 
                        ? 'bg-purple-950/40 border border-purple-500/40' 
                        : 'bg-slate-900/90 border border-amber-500/30'
                    }`}>
                      <div className="flex justify-between text-slate-400">
                        <span>Đơn giá buổi:</span>
                        <span className="font-mono text-white">{formatVND(c.price_per_session)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Số buổi đăng ký:</span>
                        <span className="font-mono text-white">{registeredSessions} buổi</span>
                      </div>
                      {isTrialMode ? (
                        <>
                          <div className="flex justify-between text-purple-300 font-bold border-t border-purple-800/60 pt-1 text-sm">
                            <span>Học phí buổi thử 1:</span>
                            <span className="font-mono text-emerald-400">0 ₫ (Miễn phí 100%)</span>
                          </div>
                          <div className="text-[10px] text-slate-400 italic">
                            * Hóa đơn toàn khóa ({formatVND(total)}) sẽ ở trạng thái chờ duyệt sau khi học xong buổi 1.
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between text-amber-400 font-bold border-t border-slate-800 pt-1 text-sm">
                            <span>Học phí cần thu:</span>
                            <span className="font-mono">{formatVND(total)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 italic mt-1">
                            Hệ thống tự động phát hành hóa đơn học phí kèm mã VietQR riêng biệt.
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => {
                    setEnrollingStudent(null);
                    setEnrollmentError(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleConfirmEnrollment}
                  disabled={!selectedClassId || isCurrentClassAlreadyEnrolled || isAllClassesEnrolled || !!enrollmentError}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all"
                >
                  Xác Nhận Ghi Danh
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Xác nhận Lên Chính Thức hoặc Dừng Học Sau Buổi Thử */}
      {trialActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4 animate-fadeIn">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              {trialActionModal.type === 'promote' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Xác Nhận Lên Học Chính Thức</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-rose-400" />
                  <span>Xác Nhận Dừng Sau Buổi Học Thử</span>
                </>
              )}
            </h3>

            <div className="text-xs text-slate-300 space-y-1.5 p-3 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-400">Học sinh:</span>
                <span className="font-bold text-white">{trialActionModal.student.name} ({trialActionModal.student.code})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Lớp ngoại khóa:</span>
                <span className="font-bold text-amber-400">{trialActionModal.className}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Trạng thái hiện tại:</span>
                <span className="px-2 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">Học thử buổi 1</span>
              </div>
            </div>

            {trialActionModal.type === 'promote' ? (
              <div className="space-y-2 text-xs text-slate-300 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Quy trình kích hoạt chính thức:
                </div>
                <ul className="list-disc pl-5 space-y-1 text-slate-400 text-[11px]">
                  <li>Chuyển trạng thái ghi danh sang <strong>Chính thức</strong>.</li>
                  <li>Kích hoạt hóa đơn học phí toàn khóa & mở khóa thanh toán mã VietQR.</li>
                  <li>Duy trì quyền lợi bữa phụ bánh sữa (nếu là học sinh Royal) cho toàn bộ khóa học.</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="space-y-2 text-xs text-slate-300 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                  <div className="font-bold text-rose-300 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    Chính sách kết thúc học thử:
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-slate-400 text-[11px]">
                    <li>Đóng hồ sơ học thử lớp này mà <strong>không phát sinh công nợ / nợ xấu</strong>.</li>
                    <li>Tự động HỦY BỎ hóa đơn học phí của lớp này (về 0 ₫).</li>
                    <li>Giải phóng sĩ số chỗ học để đón học sinh khác vào lớp.</li>
                    <li>Hoàn trả định mức suất ăn nhẹ bánh sữa các buổi tiếp theo.</li>
                  </ul>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Lý do / Ghi chú phản hồi của phụ huynh / giáo viên:
                  </label>
                  <textarea
                    rows={2}
                    value={trialNotes}
                    onChange={(e) => setTrialNotes(e.target.value)}
                    placeholder="VD: Bé chưa quen môi trường, bị trùng lịch học chính khóa..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-rose-500 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setTrialActionModal(null);
                  setTrialNotes('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Hủy bỏ
              </button>
              {trialActionModal.type === 'promote' ? (
                <button
                  onClick={() => handleConfirmPromoteTrial(trialActionModal.enrollment.id)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all"
                >
                  Xác Nhận Lên Chính Thức
                </button>
              ) : (
                <button
                  onClick={() => handleConfirmDropTrial(trialActionModal.enrollment.id, trialNotes)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/20 transition-all"
                >
                  Xác Nhận Dừng Học (Hủy HĐ)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Photo Upload & Management Modal */}
      {photoModalStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Hình Thẻ Học Viên (Ảnh 3x4)</h3>
              </div>
              <button
                onClick={() => {
                  setPhotoModalStudent(null);
                  setPhotoPreview(null);
                  setPhotoUploadSuccess(null);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Student Info Bar */}
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <div className="font-bold text-white text-sm">{photoModalStudent.name}</div>
                <div className="text-slate-400 mt-0.5">{photoModalStudent.school_name || 'Royal School'} &bull; {photoModalStudent.regular_class || 'Chưa xếp lớp'}</div>
              </div>
              <span className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs ${
                photoModalStudent.is_royal_student
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}>
                {photoModalStudent.code}
              </span>
            </div>

            {/* Photo Preview & Upload Zone */}
            <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-900/60 border border-dashed border-slate-700 space-y-3">
              {photoPreview || photoModalStudent.avatar_url ? (
                <div className="relative group">
                  <img
                    src={photoPreview || photoModalStudent.avatar_url}
                    alt={photoModalStudent.name}
                    className="w-28 h-36 object-cover rounded-2xl border-2 border-amber-500/50 shadow-lg"
                  />
                  <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <label className="cursor-pointer p-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-md hover:bg-amber-600 transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Chọn ảnh khác</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handlePhotoFileChange(file, (dataUrl) => {
                              setPhotoPreview(dataUrl);
                            }, photoModalStudent.code);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="w-28 h-36 rounded-2xl bg-slate-950 border-2 border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500 gap-1.5 p-2 text-center">
                  <Camera className="w-8 h-8 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-400">Ảnh thẻ 3x4</span>
                  <span className="text-[10px] text-slate-500">Chưa có ảnh</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <label className="cursor-pointer px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{photoPreview || photoModalStudent.avatar_url ? 'Tải tệp ảnh mới' : 'Tải lên hình thẻ (3x4)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handlePhotoFileChange(file, (dataUrl) => {
                          setPhotoPreview(dataUrl);
                        }, photoModalStudent.code);
                      }
                    }}
                  />
                </label>

                {(photoPreview || photoModalStudent.avatar_url) && (
                  <button
                    onClick={() => {
                      setPhotoPreview(null);
                      if (photoModalStudent.avatar_url) {
                        handleSaveModalPhoto(null);
                      }
                    }}
                    className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors"
                    title="Gỡ hình thẻ"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {photoUploadSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{photoUploadSuccess}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setPhotoModalStudent(null);
                  setPhotoPreview(null);
                  setPhotoUploadSuccess(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Đóng
              </button>

              {photoPreview && (
                <button
                  onClick={() => handleSaveModalPhoto(photoPreview)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu Ảnh Thẻ</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
