import React, { useState, useMemo } from 'react';
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
  ExternalLink,
  Calendar,
  BookOpen
} from 'lucide-react';
import { 
  AppStore, 
  generateStudentCode, 
  formatVND, 
  deduplicateEnrollments, 
  createAuditRecord, 
  appendAuditLog,
  GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_DRIVE_ROOT_URL,
  uploadFileToServer,
  formatDateVN,
  getClassDaysOfWeek,
  getDayLabel,
  formatDaysListLabel,
  formatStudentScheduleLabel,
  getDefaultClassStartDate,
  countSessionsBetweenDates,
  calculateRemainingSessions,
  calculateClassProratedPricing,
  getCampusPricingForClass,
  resolveStudentCampusId,
  checkIsRoyalStudent
} from '../../lib/storage';
import { formatCapitalizedName } from '../../lib/formatters';
import { Student, UserRole, ExtracurricularClass, Enrollment, TuitionInvoice } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { RoyalLogo } from '../RoyalLogo';
import { showToast } from '../../lib/toast';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { EnrollmentModal } from '../modals/EnrollmentModal';
import { DatePickerVN } from '../common/DatePickerVN';

export { checkIsRoyalStudent };

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
  const [selectedCampus, setSelectedCampus] = useState<'all' | 'pmh' | 'pl'>('all');
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

  // Đồng bộ trực tiếp danh sách học sinh kèm ghi danh (enrollments) & lớp học (extracurricular_classes) từ Supabase
  const fetchStudents = React.useCallback(async () => {
    const client = getSupabaseClient() || supabase;
    if (!client) return;

    try {
      let { data: studentsData, error: studentsErr } = await client
        .from('students')
        .select(`
          *,
          enrollments (
            id,
            class_id,
            enrollment_type,
            status,
            extracurricular_classes (
              id,
              name,
              schedule_days,
              days_of_week
            )
          )
        `);

      if (studentsErr) {
        const fallbackJoin = await client
          .from('students')
          .select(`
            *,
            enrollments (
              *,
              extracurricular_classes (
                *
              )
            )
          `);
        if (!fallbackJoin.error && fallbackJoin.data) {
          studentsData = fallbackJoin.data;
        } else {
          const plainStudents = await client.from('students').select('*');
          if (!plainStudents.error && plainStudents.data) {
            studentsData = plainStudents.data;
          }
        }
      }

      const [enrRes, clsRes] = await Promise.all([
        client.from('enrollments').select('*, extracurricular_classes(*)'),
        client.from('extracurricular_classes').select('*'),
      ]);

      let remoteEnrollmentsRaw: any[] = [];
      if (!enrRes.error && Array.isArray(enrRes.data)) {
        remoteEnrollmentsRaw = enrRes.data;
      } else {
        const plainEnr = await client.from('enrollments').select('*');
        if (!plainEnr.error && Array.isArray(plainEnr.data)) {
          remoteEnrollmentsRaw = plainEnr.data;
        }
      }

      const remoteClassesRaw: any[] = !clsRes.error && Array.isArray(clsRes.data) ? clsRes.data : [];

      onUpdateStore(prev => {
        // 1. Merge classes
        const classMap = new Map<string, ExtracurricularClass>();
        prev.classes.forEach(c => classMap.set(c.id, c));
        remoteClassesRaw.forEach(r => {
          if (!r || !r.id) return;
          const existing = classMap.get(r.id);
          const parsedDays = Array.isArray(r.days_of_week)
            ? r.days_of_week
            : typeof r.days_of_week === 'string' && r.days_of_week.startsWith('[')
            ? JSON.parse(r.days_of_week)
            : Array.isArray(r.schedule_days)
            ? r.schedule_days
            : existing?.days_of_week || ['T2', 'T4'];
          classMap.set(r.id, {
            ...(existing || {}),
            id: r.id,
            name: r.name || existing?.name || r.id,
            code: r.code || existing?.code || r.id,
            term_id: r.term_id || existing?.term_id || 'term_fall_2026',
            campus_id: r.campus_id || existing?.campus_id || 'camp_pmh',
            subject_id: r.subject_id || existing?.subject_id || 'sub_01',
            facility_id: r.facility_id || existing?.facility_id || 'fac_01',
            time_slot_id: r.time_slot_id || existing?.time_slot_id || 'slot_after_01',
            days_of_week: parsedDays,
            start_date: r.start_date || existing?.start_date,
            end_date: r.end_date || existing?.end_date,
            primary_teacher_id: r.primary_teacher_id || r.teacher_id || existing?.primary_teacher_id || '',
            max_students: Number(r.max_students || existing?.max_students || 25),
            total_sessions: Number(r.total_sessions || existing?.total_sessions || 24),
            full_course_fee: Number(r.full_course_fee || existing?.full_course_fee || 3990000),
            price_per_session: Number(r.price_per_session || existing?.price_per_session || 166250),
            status: r.status || existing?.status || 'active',
          });
        });

        // 2. Collect nested enrollments from studentsData + remoteEnrollmentsRaw
        const enrMap = new Map<string, Enrollment>();
        prev.enrollments.forEach(e => {
          enrMap.set(`${e.student_id}__${e.class_id}`, e);
        });

        const processRawEnrollment = (raw: any, fallbackStudentId?: string) => {
          if (!raw || !raw.class_id) return;
          const sid = raw.student_id || fallbackStudentId;
          if (!sid) return;
          const isTrial = Boolean(
            (raw.is_trial === true || raw.enrollment_type === 'trial') &&
            raw.status !== 'active'
          );
          const nestedCls = Array.isArray(raw.extracurricular_classes)
            ? raw.extracurricular_classes[0]
            : raw.extracurricular_classes;

          if (nestedCls && nestedCls.id && !classMap.has(nestedCls.id)) {
            const parsedDays = Array.isArray(nestedCls.days_of_week)
              ? nestedCls.days_of_week
              : Array.isArray(nestedCls.schedule_days)
              ? nestedCls.schedule_days
              : typeof nestedCls.schedule_days === 'string'
              ? nestedCls.schedule_days.split(',').map((s: string) => s.trim()).filter(Boolean)
              : ['T2', 'T4'];
            classMap.set(nestedCls.id, {
              id: nestedCls.id,
              name: nestedCls.name || nestedCls.id,
              code: nestedCls.id,
              term_id: 'term_fall_2026',
              campus_id: 'camp_pmh',
              subject_id: 'sub_01',
              facility_id: 'fac_01',
              time_slot_id: 'slot_after_01',
              days_of_week: parsedDays,
              primary_teacher_id: '',
              max_students: 25,
              total_sessions: Number(nestedCls.total_sessions || 24),
              full_course_fee: 3990000,
              price_per_session: 166250,
              status: 'active',
            });
          }

          const key = `${sid}__${raw.class_id}`;
          const existing = enrMap.get(key);
          const enrolledDays = Array.isArray(raw.enrolled_days_of_week)
            ? raw.enrolled_days_of_week
            : existing?.enrolled_days_of_week;

          enrMap.set(key, {
            ...(existing || {}),
            id: raw.id || existing?.id || `enr_${sid}_${raw.class_id}`,
            student_id: sid,
            class_id: raw.class_id,
            registered_sessions: Number(raw.registered_sessions || raw.actual_sessions || raw.total_sessions || existing?.registered_sessions || 24),
            joined_date: raw.joined_date || raw.start_date || existing?.joined_date || new Date().toISOString().split('T')[0],
            enrolled_days_of_week: enrolledDays,
            is_partial_schedule: Boolean(raw.is_partial_schedule ?? existing?.is_partial_schedule),
            status: isTrial ? 'trial' : (raw.status === 'dropped' || raw.status === 'trial_dropped' ? raw.status : 'active'),
            is_trial: isTrial,
            trial_session_date: raw.trial_session_date || raw.start_date || existing?.trial_session_date,
            trial_attended: Boolean(raw.trial_attended ?? existing?.trial_attended),
            ...( {
              enrollment_type: isTrial ? 'trial' : (raw.enrollment_type || 'official'),
              extracurricular_classes: nestedCls || (existing as any)?.extracurricular_classes,
            } as any ),
          });
        };

        remoteEnrollmentsRaw.forEach(raw => processRawEnrollment(raw));

        // 3. Merge students
        const studentMap = new Map<string, Student>();
        prev.students.forEach(s => studentMap.set(s.id, s));

        if (Array.isArray(studentsData)) {
          studentsData.forEach((r: any) => {
            if (!r) return;
            const sid = r.id || r.code || r.student_code;
            const scode = r.code || r.student_code || r.id;
            if (!sid) return;

            if (Array.isArray(r.enrollments)) {
              r.enrollments.forEach((ne: any) => processRawEnrollment(ne, sid));
            }

            const existing = studentMap.get(sid) || Array.from(studentMap.values()).find(s => s.code === scode);
            if (existing && existing.id !== sid) {
              studentMap.delete(existing.id);
            }
            const isRoyal = checkIsRoyalStudent({ ...existing, ...r, code: scode, id: sid });
            const dob = r.dob || r.birth_date || r.date_of_birth || existing?.dob || '2016-01-01';
            const regularClass = r.regular_class || r.class_name || r.grade_level || existing?.regular_class || '';
            const campusId = resolveStudentCampusId({ ...existing, ...r });

            const targetKey = sid;
            studentMap.set(targetKey, {
              ...(existing || {}),
              id: targetKey,
              code: scode,
              previous_student_code: r.previous_student_code || existing?.previous_student_code,
              name: r.name || r.full_name || existing?.name || '',
              dob,
              birth_date: dob,
              gender: r.gender === 'Nữ' ? 'Nữ' : 'Nam',
              is_royal_student: isRoyal,
              student_type: isRoyal ? 'royal' : 'external',
              has_snack: isRoyal,
              campus_id: campusId,
              school_name: r.school_name || existing?.school_name || (campusId === 'pl' ? 'Royal School Phú Lâm' : 'Royal School PMH'),
              regular_class: regularClass,
              class_name: regularClass,
              parent_name: r.parent_name || existing?.parent_name || '',
              parent_phone: r.parent_phone || existing?.parent_phone || '',
              medical_notes: r.medical_notes ?? existing?.medical_notes ?? '',
              avatar_url: r.avatar_url || existing?.avatar_url,
              status: r.status || existing?.status || 'active',
              created_at: r.created_at ? String(r.created_at).split('T')[0] : (existing?.created_at || new Date().toISOString().split('T')[0]),
              ...(Array.isArray(r.enrollments) ? { enrollments: r.enrollments } : {}),
            } as Student);
          });
        }

        return {
          ...prev,
          classes: Array.from(classMap.values()),
          students: Array.from(studentMap.values()),
          enrollments: deduplicateEnrollments(Array.from(enrMap.values())),
        };
      });
    } catch (err) {
      console.warn('Lỗi đồng bộ danh sách học sinh & ghi danh từ Supabase:', err);
    }
  }, [onUpdateStore]);

  React.useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Helper lấy danh sách enrollments (kèm thông tin lớp) của 1 học sinh từ cả store.enrollments và nested student.enrollments
  const getStudentEnrollmentsList = (student: Student) => {
    const fromStore = store.enrollments.filter(
      e =>
        (String(e.student_id) === String(student.id) || String(e.student_id) === String(student.code)) &&
        e.status !== 'dropped' &&
        e.status !== 'trial_dropped' &&
        (e.status as string) !== 'cancelled' &&
        (e.status as string) !== 'canceled'
    );

    const nestedRaw: any[] = Array.isArray((student as any).enrollments) ? (student as any).enrollments : [];
    const combinedMap = new Map<string, Enrollment>();

    fromStore.forEach(e => {
      combinedMap.set(e.class_id || e.id, e);
    });

    nestedRaw.forEach(raw => {
      if (!raw || !raw.class_id) return;
      if (raw.status === 'dropped' || raw.status === 'trial_dropped' || raw.status === 'cancelled') return;
      const isTrial = Boolean(
        (raw.is_trial === true || raw.enrollment_type === 'trial') &&
        raw.status !== 'active'
      );
      const existing = combinedMap.get(raw.class_id);
      if (!existing || (!isTrial && existing.is_trial)) {
        combinedMap.set(raw.class_id, {
          ...(existing || {}),
          id: raw.id || existing?.id || `enr_${student.id}_${raw.class_id}`,
          student_id: student.id,
          class_id: raw.class_id,
          registered_sessions: Number(raw.registered_sessions || raw.actual_sessions || existing?.registered_sessions || 24),
          joined_date: raw.joined_date || raw.start_date || existing?.joined_date || new Date().toISOString().split('T')[0],
          enrolled_days_of_week: Array.isArray(raw.enrolled_days_of_week) ? raw.enrolled_days_of_week : existing?.enrolled_days_of_week,
          status: isTrial ? 'trial' : 'active',
          is_trial: isTrial,
          ...( {
            enrollment_type: isTrial ? 'trial' : 'official',
            extracurricular_classes: raw.extracurricular_classes || (existing as any)?.extracurricular_classes,
          } as any ),
        });
      }
    });

    return Array.from(combinedMap.values());
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    campus_id: 'pmh' as 'pmh' | 'pl',
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
      const storedPath = `Google Drive: ${cloudFolder}/01_HinhHocSinh/${student.code}.jpg`;
      uploadFileToServer(dataUrl, `${student.code}.jpg`, 'students').catch(err => {
        console.warn('Drive photo upload error:', err);
      });

      const updateLog = createAuditRecord(
        'STUDENT_UPDATE',
        'ACADEMIC',
        `Hình thẻ Học viên ${student.name}`,
        `Cập nhật ảnh thẻ học viên ${student.name} (${student.code}) - Tệp đã lưu lên Google Drive (${cloudFolder}/01_HinhHocSinh/${student.code}.jpg)`,
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
      setPhotoUploadSuccess(`Đã tải ảnh thẻ lên Google Drive: ${cloudFolder}/01_HinhHocSinh/${student.code}.jpg`);
      showToast(`Đã cập nhật ảnh thẻ học viên ${student.name} (${student.code})!`, 'success', {
        title: 'Lưu ảnh thẻ thành công',
      });
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


  // Trial Action Modal State (Promote to Active or Drop after Trial)
  const [trialActionModal, setTrialActionModal] = useState<{
    type: 'promote' | 'drop';
    student: Student;
    enrollment: Enrollment;
    className: string;
  } | null>(null);
  const [trialNotes, setTrialNotes] = useState('');

  // Filter students combining Campus ('all' | 'pmh' | 'pl'), Type, Medical & Search Query
  const filteredStudents = useMemo(() => {
    return store.students.filter((student) => {
      const studentCampus = resolveStudentCampusId(student);
      const matchCampus = selectedCampus === 'all' || studentCampus === selectedCampus;

      const isRoyal = checkIsRoyalStudent(student);
      const matchType =
        filterType === 'all' ? true :
        filterType === 'royal' ? isRoyal :
        !isRoyal;

      const matchHealth = onlyHealth
        ? Boolean(student.medical_notes && student.medical_notes.trim().length > 0 && student.medical_notes !== 'Bình thường')
        : true;

      const query = search.trim().toLowerCase();
      const matchSearch =
        !query ||
        student.name.toLowerCase().includes(query) ||
        student.code.toLowerCase().includes(query) ||
        student.parent_phone.includes(query) ||
        Boolean(student.medical_notes && student.medical_notes.toLowerCase().includes(query));

      return matchCampus && matchType && matchHealth && matchSearch;
    });
  }, [store.students, selectedCampus, filterType, onlyHealth, search]);

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
            student_type: 'royal' as const,
            has_snack: true,
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

    // Đồng bộ trực tiếp vào Supabase
    try {
      const client = getSupabaseClient() || supabase;
      if (client) {
        client.from('students').update({
          code: newCode,
          student_code: newCode,
          previous_student_code: student.code,
          is_royal_student: true,
          student_type: 'royal',
          has_snack: true,
          school_name: student.school_name?.includes('Royal') ? student.school_name : 'Royal School (Chính khóa)',
          updated_at: new Date().toISOString()
        }).eq('id', student.id).then();
      }
    } catch (e) {
      console.warn('Sync convert to Supabase error:', e);
    }

    setConvertingStudent(null);
    showToast(`Đã chuyển đổi học sinh ${student.name} sang mã ROYAL SCHOOL (${newCode})!`, 'success', {
      title: 'Chuyển đổi phân loại thành công',
    });
  };

  const handleCreateStudent = async (studentFormData: any) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const isRoyal = studentFormData.is_royal_student !== false && studentFormData.student_type !== 'external';
      const client = getSupabaseClient() || supabase;
      if (!client) {
        throw new Error('Không thể kết nối tới máy chủ Supabase.');
      }

      // Gọi hàm RPC tự động cấp mã kế tiếp và lưu vào CSDL trong 1 giao dịch
      const { data: res, error: rpcError } = await client.rpc('create_new_student', {
        p_name: studentFormData.name || studentFormData.full_name,
        p_campus_id: studentFormData.campus_id || 'pmh',
        p_parent_name: studentFormData.parent_name || 'Phụ huynh',
        p_parent_phone: studentFormData.parent_phone || '',
        p_parent_email: studentFormData.parent_email || '',
        p_dob: studentFormData.dob || studentFormData.date_of_birth || '2016-01-01',
        p_gender: studentFormData.gender || 'Nam',
        p_is_royal: isRoyal,
        p_school_name: studentFormData.school_name || (isRoyal ? 'Royal School' : 'Ngoài trường'),
        p_regular_class: studentFormData.regular_class || '',
        p_grade: studentFormData.grade || '',
        p_medical_notes: studentFormData.medical_notes || ''
      });

      if (rpcError) {
        throw rpcError;
      }
      if (res && !res.success) {
        throw new Error(res.error || 'Lỗi khi lưu học sinh vào CSDL');
      }

      const assignedCode = res?.student_code || res?.code || (typeof res === 'string' ? res : '');
      const assignedId = res?.student_id || res?.id || assignedCode;

      const storedAt = studentFormData.avatar_url
        ? `${cloudProviderLabel}: ${cloudFolder}/TheHocVien/${assignedCode}.jpg`
        : undefined;

      const newStudent: Student = {
        id: assignedId || `std_${Date.now()}`,
        code: assignedCode,
        name: studentFormData.name,
        dob: studentFormData.dob,
        birth_date: studentFormData.dob,
        gender: studentFormData.gender,
        campus_id: studentFormData.campus_id,
        student_type: (isRoyal ? 'royal' : 'external') as ('royal' | 'external'),
        has_snack: isRoyal,
        parent_name: studentFormData.parent_name,
        parent_phone: studentFormData.parent_phone,
        school_name: studentFormData.school_name,
        regular_class: studentFormData.regular_class,
        class_name: studentFormData.regular_class,
        is_royal_student: isRoyal,
        medical_notes: studentFormData.medical_notes,
        avatar_url: studentFormData.avatar_url || undefined,
        photo_stored_at: storedAt,
        photo_updated_at: studentFormData.avatar_url ? new Date().toISOString().split('T')[0] : undefined,
        status: 'active',
        created_at: new Date().toISOString().split('T')[0],
      };

      const createLog = createAuditRecord(
        'STUDENT_CREATE',
        'ACADEMIC',
        'Hồ sơ Học sinh',
        `Thêm mới hồ sơ học sinh ${newStudent.name} (Mã: ${assignedCode}, Cơ sở: ${(studentFormData.campus_id || 'pmh').toUpperCase()})${newStudent.avatar_url ? ' kèm hình thẻ' : ' (chưa tải hình thẻ)'}`,
        null,
        {
          target_id: assignedCode,
          details: {
            status: 'success',
            has_photo: !!newStudent.avatar_url,
            photo_stored_at: storedAt,
            after: {
              code: assignedCode,
              name: newStudent.name,
              campus_id: newStudent.campus_id,
              parent_phone: newStudent.parent_phone,
              is_royal: newStudent.is_royal_student,
            }
          }
        }
      );

      onUpdateStore(prev => ({
        ...prev,
        students: [newStudent, ...prev.students.filter(s => s.id !== newStudent.id && s.code !== assignedCode)],
        auditLogs: [createLog, ...(prev.auditLogs || [])],
      }));

      // Hiển thị toast thông báo kèm mã học viên thực tế được sinh ra
      showToast({
        title: 'Thêm mới học sinh',
        message: `Đã thêm mới hồ sơ học viên ${studentFormData.name} (${assignedCode}) thành công!`,
        type: 'success'
      });

      // Đóng modal và tải lại dữ liệu từ Supabase
      setShowAddModal(false);
      setEditingStudent(null);
      if (typeof fetchStudents === 'function') {
        await fetchStudents();
      }
    } catch (err: any) {
      console.error('Lỗi thêm học sinh:', err);
      alert('Không thể lưu học sinh vào CSDL: ' + (err.message || err.toString()));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save Add / Edit Student
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.parent_phone) return;

    if (!editingStudent) {
      await handleCreateStudent(formData);
      return;
    }

    setIsSubmitting(true);
    try {
      // Edit
      const storedAt = formData.avatar_url && (!editingStudent.avatar_url || formData.avatar_url !== editingStudent.avatar_url)
        ? `${cloudProviderLabel}: ${cloudFolder}/TheHocVien/${editingStudent.code}.jpg`
        : (formData.photo_stored_at || editingStudent.photo_stored_at);

      // Đồng bộ cập nhật vào Supabase
      const client = getSupabaseClient() || supabase;
      if (client) {
        const isRoyal = formData.is_royal_student;
        const { error: updateErr } = await client.from('students').update({
          full_name: formData.name,
          name: formData.name,
          date_of_birth: formData.dob,
          dob: formData.dob,
          gender: formData.gender,
          campus_id: formData.campus_id,
          parent_name: formData.parent_name,
          parent_phone: formData.parent_phone,
          school_name: formData.school_name,
          regular_class: formData.regular_class,
          class_name: formData.regular_class,
          is_royal_student: isRoyal,
          student_type: isRoyal ? 'royal' : 'external',
          has_snack: isRoyal,
          medical_notes: formData.medical_notes,
          avatar_url: formData.avatar_url || null,
          updated_at: new Date().toISOString()
        }).eq('id', editingStudent.id);

        if (updateErr) {
          console.warn('Sync student update to Supabase warning:', updateErr);
        }
      }

      const updateLog = createAuditRecord(
        'STUDENT_UPDATE',
        'ACADEMIC',
        'Hồ sơ Học sinh',
        `Cập nhật thông tin học sinh ${editingStudent.name} (Mã: ${editingStudent.code}, Cơ sở: ${formData.campus_id.toUpperCase()})${formData.avatar_url !== editingStudent.avatar_url ? ' - Đồng bộ hình thẻ vào Cloud' : ''}`,
        null,
        {
          target_id: editingStudent.code,
          details: {
            status: 'success',
            photo_stored_at: storedAt,
            before: {
              name: editingStudent.name,
              campus_id: resolveStudentCampusId(editingStudent),
              parent_phone: editingStudent.parent_phone,
              regular_class: editingStudent.regular_class,
              medical_notes: editingStudent.medical_notes,
            },
            after: {
              name: formData.name,
              campus_id: formData.campus_id,
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
                birth_date: formData.dob,
                class_name: formData.regular_class,
                is_royal_student: formData.is_royal_student,
                student_type: (formData.is_royal_student ? 'royal' : 'external') as ('royal' | 'external'),
                has_snack: formData.is_royal_student,
                photo_stored_at: storedAt, 
                photo_updated_at: formData.avatar_url ? (s.photo_updated_at || new Date().toISOString().split('T')[0]) : undefined 
              } 
            : s
        ),
        auditLogs: [updateLog, ...(prev.auditLogs || [])],
      }));

      showToast(
        `Đã cập nhật hồ sơ học viên ${formData.name} (${editingStudent.code} - Cơ sở ${formData.campus_id.toUpperCase()}) thành công!`,
        'success',
        { title: 'Cập nhật hồ sơ học sinh' }
      );
      setShowAddModal(false);
      setEditingStudent(null);
      if (typeof fetchStudents === 'function') {
        await fetchStudents();
      }
    } catch (err: any) {
      console.error('Lỗi cập nhật học sinh:', err);
      alert('Không thể cập nhật học sinh: ' + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      name: student.name,
      dob: student.dob || student.birth_date || '2016-01-01',
      gender: student.gender,
      campus_id: resolveStudentCampusId(student),
      parent_name: student.parent_name,
      parent_phone: student.parent_phone,
      school_name: student.school_name || '',
      regular_class: student.regular_class || student.class_name || '',
      is_royal_student: checkIsRoyalStudent(student),
      medical_notes: student.medical_notes || '',
      avatar_url: student.avatar_url || '',
      photo_stored_at: student.photo_stored_at || '',
    });
    setShowAddModal(true);
  };

  // Delete Student along with related enrollments, invoices, and attendance records
  const handleDeleteStudent = async (student: Student) => {
    const confirmMsg = `Bạn có chắc chắn muốn xóa học sinh "${student.name}" (Mã: ${student.code})? Mọi dữ liệu ghi danh và hóa đơn liên quan sẽ bị xóa vĩnh viễn!`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const client = getSupabaseClient() || supabase;
      if (client) {
        // 1. Xóa các hóa đơn học phí liên quan
        const { error: invErr } = await client.from('tuition_invoices').delete().eq('student_id', student.id);
        if (invErr) console.warn('Lỗi xóa tuition_invoices trên Supabase:', invErr);

        // 2. Xóa các bản ghi ghi danh
        const { error: enrErr } = await client.from('enrollments').delete().eq('student_id', student.id);
        if (enrErr) console.warn('Lỗi xóa enrollments trên Supabase:', enrErr);

        // 3. Xóa các bản ghi điểm danh
        await client.from('attendance_records').delete().eq('student_id', student.id);

        // 4. Xóa các phiếu bảo lưu
        await client.from('credit_notes').delete().eq('student_id', student.id);

        // 5. Xóa học sinh khỏi bảng students
        const { error } = await client.from('students').delete().eq('id', student.id);
        if (error) throw error;
      }

      // Cập nhật State toàn cục
      onUpdateStore(prev => ({
        ...prev,
        students: prev.students.filter(s => s.id !== student.id),
        enrollments: prev.enrollments.filter(e => e.student_id !== student.id),
        invoices: prev.invoices.filter(inv => inv.student_id !== student.id),
        attendance: prev.attendance.filter(att => att.student_id !== student.id),
        makeupCredits: (prev.makeupCredits || []).filter(mc => mc.student_id !== student.id),
      }));

      showToast(`Đã xóa hồ sơ học sinh ${student.name} (${student.code}) thành công!`, 'success', {
        title: 'Xóa hồ sơ học sinh'
      });
    } catch (err: any) {
      console.error('Lỗi khi xóa học sinh:', err);
      alert('Lỗi khi xóa học sinh: ' + (err.message || String(err)));
    }
  };

  // Open Class Enrollment Modal
  const handleOpenEnrollModal = async (student: Student) => {
    // Safety check: If store.classes is empty, try loading fresh classes from Supabase
    if (store.classes.length === 0) {
      const client = getSupabaseClient() || supabase;
      if (client) {
        try {
          const { data: clsData } = await client.from('extracurricular_classes').select('*');
          if (Array.isArray(clsData) && clsData.length > 0) {
            const mappedClasses = clsData.map(r => ({
              id: r.id,
              name: r.name,
              code: r.code || r.id,
              term_id: r.term_id,
              campus_id: r.campus_id,
              subject_id: r.subject_id,
              facility_id: r.facility_id || 'fac_01',
              time_slot_id: r.time_slot_id || 'slot_after_01',
              time_slot: r.time_slot || '',
              days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week : (typeof r.days_of_week === 'string' ? JSON.parse(r.days_of_week) : ['T2', 'T4']),
              start_date: r.start_date,
              end_date: r.end_date,
              primary_teacher_id: r.primary_teacher_id || r.teacher_id,
              max_students: r.max_students || 25,
              total_sessions: r.total_sessions || 24,
              full_course_fee: r.full_course_fee || 3990000,
              price_per_session: r.price_per_session || 166250,
              status: r.status || 'active',
            }));
            onUpdateStore(prev => ({
              ...prev,
              classes: mappedClasses,
            }));
          }
        } catch (e) {
          console.warn('Lỗi nạp classes dự phòng:', e);
        }
      }
    }

    setEnrollingStudent(student);
  };



  // Promote Trial Enrollment to Official (Chính thức theo học - Đồng bộ CSDL Supabase)
  const handlePromoteToOfficial = async (studentId: string, classId?: string, enrollmentId?: string) => {
    try {
      const client = getSupabaseClient() || supabase;
      const targetStudent = store.students.find(
        s => String(s.id) === String(studentId) || String(s.code) === String(studentId)
      );
      const candidateStudentIds = Array.from(
        new Set([studentId, targetStudent?.id, targetStudent?.code].filter(Boolean) as string[])
      );

      if (client) {
        // 1. Gọi RPC cập nhật triệt để trong DB
        const { error } = await client.rpc('convert_trial_to_official', {
          p_student_id: studentId,
          p_class_id: classId || null,
        });

        if (error) {
          console.warn('RPC convert_trial_to_official thông báo, thực hiện update trực tiếp:', error.message);
        }

        // Luôn đồng bộ trực tiếp cả is_trial, enrollment_type và status = 'active' trên bảng enrollments để đảm bảo F5 không bao giờ trả về tím
        let updateQuery = client
          .from('enrollments')
          .update({
            is_trial: false,
            enrollment_type: 'official',
            status: 'active',
            trial_session_count: 0,
          })
          .in('student_id', candidateStudentIds);

        if (classId) {
          updateQuery = updateQuery.eq('class_id', classId);
        }

        const { error: updateErr } = await updateQuery;
        if (updateErr) {
          let minQuery = client
            .from('enrollments')
            .update({
              is_trial: false,
              enrollment_type: 'official',
              status: 'active',
            })
            .in('student_id', candidateStudentIds);
          if (classId) {
            minQuery = minQuery.eq('class_id', classId);
          }
          await minQuery;
        }

        // Kích hoạt hóa đơn học phí liên quan nếu đang ở trạng thái chờ học thử
        let invQuery = client
          .from('tuition_invoices')
          .update({
            is_trial_pending: false,
            payment_status: 'unpaid',
          })
          .in('student_id', candidateStudentIds);
        if (classId) {
          invQuery = invQuery.eq('class_id', classId);
        }
        await invQuery;
      }

      // 2. Cập nhật ngay trên State UI
      onUpdateStore(prev => {
        const student = prev.students.find(
          s => candidateStudentIds.includes(String(s.id)) || candidateStudentIds.includes(String(s.code))
        );
        const cls = classId ? prev.classes.find(c => c.id === classId) : undefined;

        return {
          ...prev,
          students: prev.students.map(s => {
            if (
              s.id === studentId ||
              s.code === studentId ||
              candidateStudentIds.includes(String(s.id)) ||
              candidateStudentIds.includes(String(s.code))
            ) {
              const updated = ((s as any).enrollments || []).map((e: any) => {
                if (!classId || e.class_id === classId) {
                  return {
                    ...e,
                    is_trial: false,
                    enrollment_type: 'official',
                    status: 'active',
                  };
                }
                return e;
              });
              return { ...s, enrollments: updated } as Student;
            }
            return s;
          }),
          enrollments: prev.enrollments.map(e => {
            const matchStudent = candidateStudentIds.includes(String(e.student_id));
            const matchClass = !classId || e.class_id === classId;
            const matchId = Boolean(enrollmentId && e.id === enrollmentId);
            if ((matchStudent && matchClass) || matchId) {
              return {
                ...e,
                status: 'active',
                is_trial: false,
                trial_attended: true,
                trial_completed_action: 'promoted',
                trial_outcome: 'promoted',
                trial_notes: 'Xác nhận lên học chính thức toàn khóa (Buổi thử tính là buổi 1)',
                ...({ enrollment_type: 'official' } as any),
              };
            }
            return e;
          }),
          invoices: prev.invoices.map(inv =>
            candidateStudentIds.includes(String(inv.student_id)) &&
            (!classId || inv.class_id === classId) &&
            inv.is_trial_pending
              ? { ...inv, is_trial_pending: false, payment_status: 'unpaid' }
              : inv
          ),
          notifications: [
            {
              id: `notif_${Date.now()}`,
              type: 'enrollment_over_quota',
              title: 'Học viên chính thức theo học sau buổi thử 1',
              message: `Học sinh ${student?.name || studentId} đã chuyển sang học CHÍNH THỨC lớp ${cls?.name || classId || ''}. Hóa đơn học phí đã kích hoạt thanh toán VietQR.`,
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

      alert('Đã chuyển học viên lên học CHÍNH THỨC thành công!');
      showToast('Đã chuyển học viên lên học CHÍNH THỨC thành công!', 'success', {
        title: 'Chuyển lên học chính thức',
      });

      await fetchStudents();
    } catch (err: any) {
      console.error('Lỗi khi chuyển lên chính thức:', err);
      alert('Lỗi cập nhật: ' + (err.message || String(err)));
    }
  };

  const handleConfirmPromoteTrial = async (enrollmentId: string) => {
    const enr = store.enrollments.find(e => e.id === enrollmentId) || trialActionModal?.enrollment;
    const studentId = enr?.student_id || trialActionModal?.student?.id || trialActionModal?.student?.code;
    if (!studentId) return;
    await handlePromoteToOfficial(studentId, enr?.class_id, enrollmentId);
  };

  // Drop Trial Enrollment (Nghỉ sau buổi học thử 1 - Hủy hóa đơn, không nợ, giải phóng chỗ)
  const handleConfirmDropTrial = (enrollmentId: string, notes?: string) => {
    const enr = store.enrollments.find(e => e.id === enrollmentId);
    if (!enr) return;

    const client = getSupabaseClient() || supabase;
    if (client) {
      client.from('enrollments').update({
        status: 'trial_dropped',
        trial_attended: true,
        trial_outcome: 'dropped',
        trial_notes: notes || 'Học sinh dừng học sau buổi thử 1 (Trial Dropped)'
      }).eq('id', enrollmentId).then();

      client.from('tuition_invoices').update({
        is_trial_pending: false,
        payment_status: 'cancelled',
        outstanding_amount: 0,
        net_payable: 0,
        payment_reference: 'MIỄN PHÍ BUỔI HỌC THỬ (DỪNG HỌC)'
      }).match({ student_id: enr.student_id, class_id: enr.class_id }).then();
    }

    onUpdateStore(prev => {
      const student = prev.students.find(s => s.id === enr.student_id);
      const cls = prev.classes.find(c => c.id === enr.class_id);

      return {
        ...prev,
        enrollments: prev.enrollments.map(e => 
          e.id === enrollmentId 
            ? { 
                ...e, 
                status: 'trial_dropped', 
                trial_attended: true,
                trial_completed_action: 'dropped',
                trial_outcome: 'dropped', 
                trial_notes: notes || 'Học sinh dừng học sau buổi thử 1 (Trial Dropped)' 
              } 
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
    showToast('Đã chốt dừng học thử — Hủy hóa đơn và giải phóng chỉ tiêu sĩ số lớp!', 'info', {
      title: 'Dừng sau buổi học thử',
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Action Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Cụm bộ lọc Cơ sở (Segmented Filter Pills) */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setSelectedCampus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedCampus === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tất cả cơ sở ({store.students.length})
            </button>

            <button
              onClick={() => setSelectedCampus('pmh')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedCampus === 'pmh'
                  ? 'bg-sky-600 text-white shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-sky-400"></span>
              Phú Mỹ Hưng ({store.students.filter(s => resolveStudentCampusId(s) === 'pmh').length})
            </button>

            <button
              onClick={() => setSelectedCampus('pl')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedCampus === 'pl'
                  ? 'bg-purple-600 text-white shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              Phú Lâm ({store.students.filter(s => resolveStudentCampusId(s) === 'pl').length})
            </button>
          </div>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          {/* Filter Pills theo phân loại học viên */}
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Tất cả ({store.students.length})
          </button>
          <button
            onClick={() => setFilterType('royal')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'royal'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Học sinh Royal ({store.students.filter(s => checkIsRoyalStudent(s)).length})
          </button>
          <button
            onClick={() => setFilterType('outside')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'outside'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Học sinh ngoài trường ({store.students.filter(s => !checkIsRoyalStudent(s)).length})
          </button>
          <button
            onClick={() => setOnlyHealth(!onlyHealth)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              onlyHealth
                ? 'bg-rose-500 text-white font-bold shadow-md shadow-rose-500/20'
                : 'bg-slate-900 text-rose-400 hover:text-rose-300 border border-rose-500/30'
            }`}
          >
            <span>Có lưu ý y tế ({store.students.filter(s => Boolean(s.medical_notes && s.medical_notes !== 'Bình thường')).length})</span>
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
              const defaultCampus = selectedCampus === 'pl' ? 'pl' : 'pmh';
              setFormData({
                name: '',
                dob: '2016-01-01',
                gender: 'Nam',
                campus_id: defaultCampus,
                parent_name: '',
                parent_phone: '',
                school_name: defaultCampus === 'pl' ? 'Royal School Phú Lâm' : 'Royal School PMH',
                regular_class: defaultCampus === 'pl' ? 'Grade 4PL1' : 'Grade 4A1',
                is_royal_student: true,
                medical_notes: '',
                avatar_url: '',
                photo_stored_at: '',
              });
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all shrink-0 cursor-pointer"
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
                  <th className="py-3 px-3 whitespace-nowrap">Mã HV</th>
                  <th className="py-3 px-4">Họ và Tên</th>
                  <th className="py-3 px-3">Ngày Sinh & Giới Tính</th>
                  <th className="py-3 px-3">Phân Loại / Bánh Sữa</th>
                  <th className="py-3 px-3">Trường & Lớp</th>
                  <th className="py-3 px-3">Phụ Huynh & SĐT</th>
                  <th className="py-3 px-3 w-40 max-w-[160px]">Lưu Ý Y Tế & Dị Ứng</th>
                  <th className="py-3 px-4">Lớp Đang Học</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStudents.map(student => {
                  const studentEnrollments = getStudentEnrollmentsList(student);
                  const isRoyal = checkIsRoyalStudent(student);

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

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs inline-block whitespace-nowrap ${
                          isRoyal
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}>
                          {student.code}
                        </span>
                        {student.previous_student_code && (
                          <div className="text-[10px] text-cyan-400 font-mono mt-0.5 whitespace-nowrap">
                            Cũ: {student.previous_student_code}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{student.name}</div>
                      </td>

                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                        <div>{student.dob}</div>
                        <div className="text-[10px] text-slate-500">{student.gender}</div>
                      </td>

                      <td className="py-3 px-4">
                        {isRoyal ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            👑 Royal (Bánh sữa)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            Ngoài trường
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-slate-300">
                        <div className="font-medium text-white">{student.school_name || 'Royal School'}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {resolveStudentCampusId(student) === 'pl' ? (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono font-bold text-[10px] leading-none">
                              [PL]
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono font-bold text-[10px] leading-none">
                              [PMH]
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 font-medium">
                            {student.regular_class || student.class_name || 'Chưa xếp lớp'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-white font-medium">{student.parent_name}</div>
                        <div className="text-amber-400 font-mono text-[11px] whitespace-nowrap">{student.parent_phone}</div>
                      </td>

                      <td className="py-3 px-3 w-40 max-w-[160px]">
                        {student.medical_notes ? (
                          <div className="flex items-start gap-1.5 p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <span className="whitespace-normal break-words leading-snug">{student.medical_notes}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Bình thường</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1.5 max-w-xs">
                          {studentEnrollments.length > 0 ? (
                            studentEnrollments.map(enr => {
                              const nestedClsRaw = (enr as any).extracurricular_classes;
                              const nestedCls = Array.isArray(nestedClsRaw) ? nestedClsRaw[0] : nestedClsRaw;
                              const c = store.classes.find(cl => cl.id === enr.class_id) || nestedCls || {
                                id: enr.class_id,
                                name: enr.class_id || 'Lớp ngoại khóa',
                                days_of_week: ['T2', 'T4'],
                                total_sessions: 24,
                              };
                              // Chỉ coi là học thử khi VÀ CHỈ KHI cả 2 cờ xác nhận là trial và status khác 'active'
                              const isTrial = Boolean(
                                (enr.is_trial === true || (enr as any).enrollment_type === 'trial') &&
                                enr.status !== 'active'
                              );
                              const shortName = (c.name || 'Môn học').split('-')[0].trim();
                              const clsDays = Array.isArray(c.days_of_week) && c.days_of_week.length > 0
                                ? c.days_of_week
                                : getClassDaysOfWeek(c as ExtracurricularClass, store);
                              const studentDays = enr.enrolled_days_of_week && enr.enrolled_days_of_week.length > 0
                                ? enr.enrolled_days_of_week
                                : clsDays;
                              const scheduleLabelText =
                                typeof (c as any).schedule_days === 'string' && (c as any).schedule_days.trim()
                                  ? (c as any).schedule_days
                                  : formatDaysListLabel(studentDays);
                              const isPartial = enr.is_partial_schedule || studentDays.length < clsDays.length;
                              const regSess = enr.registered_sessions || c.total_sessions || 24;
                              const attendedCount = store.attendance.filter(
                                a => (String(a.student_id) === String(student.id) || String(a.student_id) === String(student.code)) &&
                                     a.class_id === c.id &&
                                     a.status === 'present'
                              ).length;

                              return (
                                <div key={enr.id} className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {isTrial ? (
                                      <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold inline-flex items-center gap-1 shadow-sm w-fit">
                                        <span>🟣</span>
                                        <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                                        <span>{shortName} (Học Thử Buổi 1)</span>
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold inline-flex items-center gap-1 w-fit">
                                        <span>🟢</span>
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                        <span>{shortName} (Chính thức)</span>
                                      </span>
                                    )}
                                    <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold border ${
                                      isPartial
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                        : 'bg-slate-800/80 text-slate-300 border-slate-700'
                                    }`}>
                                      Lịch: {scheduleLabelText} ({attendedCount}/{regSess}b)
                                    </span>
                                  </div>

                                  {isTrial && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <button
                                        onClick={() => handlePromoteToOfficial(student.id, enr.class_id, enr.id)}
                                        className="px-2 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[9.5px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                        title="Chuyển Lên Chính Thức (Lưu trực tiếp vào CSDL Supabase)"
                                      >
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                        <span>✓ Lên chính thức</span>
                                      </button>
                                      <button
                                        onClick={() => setTrialActionModal({ type: 'drop', student, enrollment: enr, className: c.name })}
                                        className="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[9.5px] font-bold flex items-center gap-1 transition-colors"
                                        title="Dừng Sau Buổi Thử (Hủy HĐ, giải phóng sĩ số lớp)"
                                      >
                                        <XCircle className="w-3 h-3 text-rose-400" />
                                        <span>✕ Dừng học thử</span>
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
                          {!isRoyal && (
                            <button
                              type="button"
                              onClick={() => setConvertingStudent(student)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-xs transition-colors"
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
                          <button
                            onClick={() => handleDeleteStudent(student)}
                            className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 hover:text-rose-300 border border-rose-500/30 transition-colors"
                            title={`Xóa vĩnh viễn hồ sơ học sinh ${student.name} (${student.code})`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
            const studentEnrollments = getStudentEnrollmentsList(student);
            const isRoyal = checkIsRoyalStudent(student);

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
                        isRoyal
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {student.code}
                      </span>

                      {isRoyal ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          👑 Royal (Bánh sữa)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
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
                      <GraduationCap className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {resolveStudentCampusId(student) === 'pl' ? (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono font-bold text-[10px] leading-none">
                            [PL]
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono font-bold text-[10px] leading-none">
                            [PMH]
                          </span>
                        )}
                        <span className="text-slate-300">{student.school_name || 'Royal School'} &bull; {student.regular_class || student.class_name || 'Chưa xếp lớp'}</span>
                      </div>
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
                          const nestedClsRaw = (enr as any).extracurricular_classes;
                          const nestedCls = Array.isArray(nestedClsRaw) ? nestedClsRaw[0] : nestedClsRaw;
                          const c = store.classes.find(cl => cl.id === enr.class_id) || nestedCls || {
                            id: enr.class_id,
                            name: enr.class_id || 'Lớp ngoại khóa',
                            days_of_week: ['T2', 'T4'],
                            total_sessions: 24,
                          };
                          // Chỉ coi là học thử khi VÀ CHỈ KHI cả 2 cờ xác nhận là trial và status khác 'active'
                          const isTrial = Boolean(
                            (enr.is_trial === true || (enr as any).enrollment_type === 'trial') &&
                            enr.status !== 'active'
                          );
                          const shortName = (c.name || 'Môn học').split('-')[0].trim();
                          const clsDays = Array.isArray(c.days_of_week) && c.days_of_week.length > 0
                            ? c.days_of_week
                            : getClassDaysOfWeek(c as ExtracurricularClass, store);
                          const studentDays = enr.enrolled_days_of_week && enr.enrolled_days_of_week.length > 0
                            ? enr.enrolled_days_of_week
                            : clsDays;
                          const scheduleLabelText =
                            typeof (c as any).schedule_days === 'string' && (c as any).schedule_days.trim()
                              ? (c as any).schedule_days
                              : formatDaysListLabel(studentDays);
                          const isPartial = enr.is_partial_schedule || studentDays.length < clsDays.length;
                          const regSess = enr.registered_sessions || c.total_sessions || 24;
                          const attendedCount = store.attendance.filter(
                            a => (String(a.student_id) === String(student.id) || String(a.student_id) === String(student.code)) &&
                                 a.class_id === c.id &&
                                 a.status === 'present'
                          ).length;

                          return (
                            <div key={enr.id} className="flex flex-col gap-2 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                {isTrial ? (
                                  <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1">
                                    <span>🟣</span>
                                    <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                                    <span className="truncate">{shortName} (Học Thử Buổi 1)</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                                    <span>🟢</span>
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                    <span className="truncate">{shortName} (Chính thức)</span>
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                                  isPartial
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                    : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}>
                                  Lịch: {scheduleLabelText} ({attendedCount}/{regSess} buổi)
                                </span>
                              </div>

                              {isTrial && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handlePromoteToOfficial(student.id, enr.class_id, enr.id)}
                                    className="flex-1 px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                    title="Chuyển Lên Chính Thức (Lưu trực tiếp vào CSDL Supabase)"
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    <span>✓ Lên chính thức</span>
                                  </button>
                                  <button
                                    onClick={() => setTrialActionModal({ type: 'drop', student, enrollment: enr, className: c.name })}
                                    className="flex-1 px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                                    title="Dừng Sau Buổi Thử (Hủy HĐ, không nợ)"
                                  >
                                    <XCircle className="w-3 h-3 text-rose-400" />
                                    <span>✕ Dừng học thử</span>
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
                    {!isRoyal && (
                      <button
                        type="button"
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
                    <button
                      onClick={() => handleDeleteStudent(student)}
                      className="p-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 hover:text-rose-300 border border-rose-500/30 transition-colors"
                      title={`Xóa vĩnh viễn hồ sơ học sinh ${student.name} (${student.code})`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
                  <label className="block text-slate-400 font-medium mb-1">Ngày sinh (DD/MM/YYYY)</label>
                  <DatePickerVN
                    value={formData.dob}
                    onChange={(val) => setFormData({ ...formData, dob: val })}
                    placeholder="DD/MM/YYYY"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Phân loại học sinh</label>
                  <select
                    value={formData.is_royal_student ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, is_royal_student: e.target.value === 'true' })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                  >
                    <option value="true">Học sinh ROYAL SCHOOL</option>
                    <option value="false">Học sinh ngoài trường</option>
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

              {/* Cơ sở trường học * (Radio / Segmented Selector) */}
              <div>
                <label className="block text-slate-300 font-bold mb-1.5">
                  Cơ sở trường học <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label
                    onClick={() => {
                      const nextSchool =
                        formData.is_royal_student &&
                        (!formData.school_name || formData.school_name.includes('Royal School'))
                          ? 'Royal School PMH'
                          : formData.school_name;
                      setFormData({
                        ...formData,
                        campus_id: 'pmh',
                        school_name: nextSchool,
                      });
                    }}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      formData.campus_id === 'pmh'
                        ? 'bg-sky-500/15 border-sky-500 text-white shadow-sm ring-1 ring-sky-500/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="student_campus_id"
                      value="pmh"
                      checked={formData.campus_id === 'pmh'}
                      onChange={() => {}}
                      className="accent-sky-500"
                    />
                    <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0"></span>
                    <div className="leading-tight">
                      <div className="font-bold text-xs">Cơ sở Phú Mỹ Hưng (PMH)</div>
                      <div className="text-[10px] text-slate-400 font-mono">campus_id: &apos;pmh&apos;</div>
                    </div>
                  </label>

                  <label
                    onClick={() => {
                      const nextSchool =
                        formData.is_royal_student &&
                        (!formData.school_name || formData.school_name.includes('Royal School'))
                          ? 'Royal School Phú Lâm'
                          : formData.school_name;
                      setFormData({
                        ...formData,
                        campus_id: 'pl',
                        school_name: nextSchool,
                      });
                    }}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      formData.campus_id === 'pl'
                        ? 'bg-purple-500/15 border-purple-500 text-white shadow-sm ring-1 ring-purple-500/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="student_campus_id"
                      value="pl"
                      checked={formData.campus_id === 'pl'}
                      onChange={() => {}}
                      className="accent-purple-500"
                    />
                    <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0"></span>
                    <div className="leading-tight">
                      <div className="font-bold text-xs">Cơ sở Phú Lâm (PL)</div>
                      <div className="text-[10px] text-slate-400 font-mono">campus_id: &apos;pl&apos;</div>
                    </div>
                  </label>
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
                  disabled={isSubmitting}
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : (editingStudent ? 'Cập Nhật' : 'Lưu Học Viên')}
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
      <EnrollmentModal
        isOpen={!!enrollingStudent}
        onClose={() => setEnrollingStudent(null)}
        enrollingStudent={enrollingStudent}
        store={store}
        onUpdateStore={onUpdateStore}
        onSuccess={() => {
          fetchStudents();
        }}
      />

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
