import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  Plus,
  Edit2,
  Trash2,
  Search,
  DollarSign,
  Percent,
  Building2,
  Calendar,
  BookOpen,
  CreditCard,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  History,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  X,
  FileText,
  Sparkles,
} from 'lucide-react';
import {
  AppStore,
  Teacher,
  TeacherContract,
  TeacherPayModel,
  UserRole,
  AppUser,
} from '../../types';
import {
  formatVND,
  formatDateVN,
  generateTeacherCode,
  getTeacherContractAt,
  getLatestSettledSessionDateForTeacher,
  syncTeachersCurrentFieldsFromContracts,
  createAuditRecord,
  appendAuditLog,
  getEffectivePermissions,
  normalizeCampusScope,
} from '../../lib/storage';
import { supabase } from '../../supabaseClient';
import { showToast } from '../../lib/toast';

interface TeachersManagementProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  selectedCampusId?: string;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  try {
    if (supabase?.auth) {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
    }
  } catch {
    // ignore
  }
  return headers;
}

export const TeachersManagement: React.FC<TeachersManagementProps> = ({
  store,
  currentRole,
  currentUser,
  selectedCampusId = 'all',
  onUpdateStore,
}) => {
  const todayIso = useMemo(() => getTodayIso(), []);
  const userScopedCampus = useMemo(
    () => normalizeCampusScope(currentUser?.campus_id),
    [currentUser?.campus_id]
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [campusFilter, setCampusFilter] = useState<string>(
    userScopedCampus !== 'all' ? userScopedCampus : selectedCampusId || 'all'
  );
  const [typeFilter, setTypeFilter] = useState<'all' | 'permanent' | 'visiting'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Permissions check
  const effectivePerms = useMemo(
    () => getEffectivePermissions(currentUser || null),
    [currentUser]
  );

  const canManageGlobal = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'super_admin') return true;
    if (currentUser.role === 'campus_manager') return true;
    return Boolean(effectivePerms.can_manage_teachers);
  }, [currentUser, effectivePerms]);

  const canManageCampus = (targetCampusId?: string): boolean => {
    if (!canManageGlobal || !currentUser) return false;
    if (currentUser.role === 'super_admin') return true;
    if (userScopedCampus === 'all') return true;
    const normTarget = normalizeCampusScope(targetCampusId || 'camp_pmh');
    return normTarget === userScopedCampus;
  };

  // Add / Edit Teacher Modal State
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<{
    name: string;
    phone: string;
    email: string;
    campus_id: string;
    teacher_type: 'permanent' | 'visiting';
    pay_model: TeacherPayModel;
    hire_date: string;
    rate_per_period: number;
    periods_per_session: number;
    percentage_rate: number;
    weekend_multiplier: number;
    subjects: string[];
    bank_name: string;
    account_number: string;
    account_holder: string;
    notes: string;
    create_login_account: boolean;
    login_email: string;
    login_password: string;
  }>({
    name: '',
    phone: '',
    email: '',
    campus_id: userScopedCampus !== 'all' ? userScopedCampus : 'camp_pmh',
    teacher_type: 'permanent',
    pay_model: 'per_session',
    hire_date: todayIso,
    rate_per_period: 150000,
    periods_per_session: 2,
    percentage_rate: 60,
    weekend_multiplier: 1,
    subjects: [],
    bank_name: 'Vietcombank',
    account_number: '',
    account_holder: '',
    notes: '',
    create_login_account: false,
    login_email: '',
    login_password: '',
  });

  // Contract Change ("Chuyển ngạch / Đổi mức lương") Modal State
  const [contractModalTeacher, setContractModalTeacher] = useState<Teacher | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractForm, setContractForm] = useState<{
    effective_from: string;
    teacher_type: 'permanent' | 'visiting';
    pay_model: TeacherPayModel;
    rate_per_period: number;
    periods_per_session: number;
    percentage_rate: number;
    weekend_multiplier: number;
    custom_subject_rates: { subject_id: string; rate_per_period: number }[];
    note: string;
  }>({
    effective_from: todayIso,
    teacher_type: 'permanent',
    pay_model: 'per_session',
    rate_per_period: 150000,
    periods_per_session: 2,
    percentage_rate: 60,
    weekend_multiplier: 1,
    custom_subject_rates: [],
    note: '',
  });

  // Contract History ("Lịch sử ngạch & mức lương") Modal State
  const [historyModalTeacher, setHistoryModalTeacher] = useState<Teacher | null>(null);
  const [editingContractNoteId, setEditingContractNoteId] = useState<string | null>(null);
  const [editingContractNoteText, setEditingContractNoteText] = useState<string>('');

  // Reset Password Modal State
  const [resetPasswordTeacher, setResetPasswordTeacher] = useState<{
    teacher: Teacher;
    linkedUser: AppUser;
  } | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Lock / Unlock & Delete Confirmation Modal State
  const [lockConfirmTeacher, setLockConfirmTeacher] = useState<Teacher | null>(null);
  const [isLockingBusy, setIsLockingBusy] = useState(false);

  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    teacher: Teacher;
    canDelete: boolean;
    references: string[];
  } | null>(null);
  const [isDeletingBusy, setIsDeletingBusy] = useState(false);

  // Helper: Find linked login account for a teacher
  const getLinkedUserForTeacher = (teacherId: string): AppUser | undefined => {
    return (store.users || []).find(
      u => u.linked_teacher_id === teacherId || u.teacher_id === teacherId
    );
  };

  // Helper: Get all contract milestones for a teacher sorted chronologically (ascending)
  const getTeacherMilestonesAsc = (teacherId: string): TeacherContract[] => {
    return (store.teacherContracts || [])
      .filter(c => c && c.teacher_id === teacherId)
      .sort((a, b) => (a.effective_from || '').localeCompare(b.effective_from || ''));
  };

  // Filtered Teachers List
  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (store.teachers || []).filter(t => {
      if (userScopedCampus !== 'all') {
        const tCampus = normalizeCampusScope(t.campus_id);
        if (tCampus !== userScopedCampus) return false;
      }
      if (campusFilter !== 'all') {
        const tCampus = normalizeCampusScope(t.campus_id);
        if (tCampus !== campusFilter) return false;
      }
      const effType = t.teacher_type || t.type || 'permanent';
      if (typeFilter !== 'all' && effType !== typeFilter) return false;

      const effStatus = t.status === 'inactive' ? 'inactive' : 'active';
      if (statusFilter !== 'all' && effStatus !== statusFilter) return false;

      if (!q) return true;
      return (
        (t.name || '').toLowerCase().includes(q) ||
        (t.code || '').toLowerCase().includes(q) ||
        (t.phone || '').toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q)
      );
    });
  }, [store.teachers, searchQuery, campusFilter, typeFilter, statusFilter, userScopedCampus]);

  // Open Add Teacher Modal
  const handleOpenAddModal = () => {
    const defaultCampus =
      userScopedCampus !== 'all'
        ? userScopedCampus
        : campusFilter !== 'all'
        ? campusFilter
        : 'camp_pmh';
    setEditingTeacher(null);
    setFormError(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      campus_id: defaultCampus,
      teacher_type: 'permanent',
      pay_model: 'per_session',
      hire_date: todayIso,
      rate_per_period: 150000,
      periods_per_session: 2,
      percentage_rate: 60,
      weekend_multiplier: 1,
      subjects: store.subjects.slice(0, 1).map(s => s.id),
      bank_name: 'Vietcombank',
      account_number: '',
      account_holder: '',
      notes: '',
      create_login_account: false,
      login_email: '',
      login_password: '',
    });
    setIsAddEditModalOpen(true);
  };

  // Open Edit Teacher Modal
  const handleOpenEditModal = (teacher: Teacher) => {
    const activeContract = getTeacherContractAt(teacher, todayIso, store);
    setEditingTeacher(teacher);
    setFormError(null);
    setFormData({
      name: teacher.name || '',
      phone: teacher.phone || '',
      email: teacher.email || '',
      campus_id: normalizeCampusScope(teacher.campus_id) === 'all' ? 'camp_pmh' : normalizeCampusScope(teacher.campus_id),
      teacher_type: activeContract.teacher_type,
      pay_model: activeContract.pay_model,
      hire_date: teacher.hire_date || activeContract.effective_from || todayIso,
      rate_per_period: activeContract.rate_per_period || teacher.default_rate_per_period || 150000,
      periods_per_session: activeContract.periods_per_session || teacher.periods_per_session || 2,
      percentage_rate: activeContract.percentage_rate || teacher.percentage_rate || 60,
      weekend_multiplier: activeContract.weekend_multiplier || teacher.weekend_multiplier || 1,
      subjects: Array.isArray(teacher.subjects) ? teacher.subjects : [],
      bank_name: teacher.bank_account?.bank_name || 'Vietcombank',
      account_number: teacher.bank_account?.account_number || '',
      account_holder: teacher.bank_account?.account_holder || (teacher.name || '').toUpperCase(),
      notes: teacher.notes || '',
      create_login_account: false,
      login_email: teacher.email || '',
      login_password: '',
    });
    setIsAddEditModalOpen(true);
  };

  const handleToggleSubject = (subjId: string) => {
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects.includes(subjId)
        ? prev.subjects.filter(id => id !== subjId)
        : [...prev.subjects, subjId],
    }));
  };

  // Submit Add / Edit Teacher
  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = formData.name.trim();
    if (!cleanName) {
      setFormError('Vui lòng nhập họ và tên giáo viên.');
      return;
    }

    if (!canManageCampus(formData.campus_id)) {
      setFormError('Bạn chỉ có quyền quản lý giáo viên thuộc cơ sở của mình.');
      return;
    }

    const existingLinkedUser = editingTeacher ? getLinkedUserForTeacher(editingTeacher.id) : undefined;
    if (formData.create_login_account && !existingLinkedUser) {
      const loginEmail = (formData.login_email || formData.email).trim().toLowerCase();
      const loginPassword = formData.login_password.trim();
      if (!loginEmail || !loginEmail.includes('@')) {
        setFormError('Vui lòng nhập địa chỉ Email hợp lệ để tạo tài khoản đăng nhập cho giáo viên.');
        return;
      }
      if (loginPassword.length < 10) {
        setFormError('Mật khẩu khởi tạo cho tài khoản giáo viên bắt buộc tối thiểu 10 ký tự.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const teacherId = editingTeacher ? editingTeacher.id : `t_${Date.now()}`;
      const campusChanged = editingTeacher && editingTeacher.campus_id !== formData.campus_id;
      const teacherCode =
        editingTeacher && editingTeacher.code && !campusChanged
          ? editingTeacher.code
          : generateTeacherCode(formData.campus_id, store.teachers);

      const sessionRate =
        Math.max(1, Number(formData.rate_per_period) || 150000) *
        Math.max(1, Number(formData.periods_per_session) || 2);

      const teacherRecord: Teacher = {
        id: teacherId,
        code: teacherCode,
        name: cleanName,
        phone: formData.phone.trim(),
        email: (formData.email || formData.login_email).trim(),
        campus_id: formData.campus_id,
        type: editingTeacher ? editingTeacher.type : formData.teacher_type,
        teacher_type: editingTeacher ? editingTeacher.teacher_type : formData.teacher_type,
        fixed_rate_per_session: editingTeacher
          ? editingTeacher.fixed_rate_per_session
          : sessionRate,
        default_rate_per_period: editingTeacher
          ? editingTeacher.default_rate_per_period
          : Number(formData.rate_per_period) || 150000,
        periods_per_session: editingTeacher
          ? editingTeacher.periods_per_session
          : Number(formData.periods_per_session) || 2,
        bank_account: {
          bank_name: formData.bank_name.trim() || 'Vietcombank',
          account_number: formData.account_number.trim(),
          account_holder: formData.account_holder.trim() || cleanName.toUpperCase(),
        },
        subjects: formData.subjects,
        status: editingTeacher ? editingTeacher.status : 'active',
        updated_at: new Date().toISOString(),
        percentage_rate: editingTeacher
          ? editingTeacher.percentage_rate
          : Number(formData.percentage_rate) || 60,
        weekend_multiplier: editingTeacher
          ? editingTeacher.weekend_multiplier || 1
          : Number(formData.weekend_multiplier) || 1,
        custom_subject_rates: Array.isArray(editingTeacher?.custom_subject_rates)
          ? editingTeacher.custom_subject_rates
          : [],
        hire_date: formData.hire_date || todayIso,
        notes: formData.notes.trim(),
      };

      // If creating a new teacher, also create the initial contract milestone in teacher_contracts
      const existingContracts = getTeacherMilestonesAsc(teacherId);
      let newInitialContract: TeacherContract | null = null;
      if (!editingTeacher || existingContracts.length === 0) {
        newInitialContract = {
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          teacher_id: teacherId,
          teacher_type: formData.teacher_type,
          pay_model: formData.pay_model,
          effective_from: formData.hire_date || todayIso,
          rate_per_period: Number(formData.rate_per_period) || 150000,
          periods_per_session: Number(formData.periods_per_session) || 2,
          session_rate: sessionRate,
          percentage_rate:
            formData.pay_model === 'revenue_share' ? Number(formData.percentage_rate) || 45 : 0,
          weekend_multiplier: Number(formData.weekend_multiplier) || 1,
          custom_subject_rates: [],
          note: 'Mốc hợp đồng khởi tạo khi tiếp nhận giáo viên',
          created_by: currentUser?.full_name || currentUser?.username || 'Hệ thống',
          created_at: new Date().toISOString(),
        };
      }

      // First persist teacher & initial contract to Supabase so server.ts can verify linked_teacher_id on teachers table
      if (supabase) {
        const dbTeacherRow = {
          id: teacherRecord.id,
          code: teacherRecord.code,
          name: teacherRecord.name,
          phone: teacherRecord.phone,
          email: teacherRecord.email,
          campus_id: teacherRecord.campus_id,
          type: teacherRecord.type,
          teacher_type: teacherRecord.teacher_type,
          fixed_rate_per_session: teacherRecord.fixed_rate_per_session,
          default_rate_per_period: teacherRecord.default_rate_per_period,
          periods_per_session: teacherRecord.periods_per_session,
          bank_account: teacherRecord.bank_account || {},
          subjects: teacherRecord.subjects || [],
          status: teacherRecord.status,
          updated_at: teacherRecord.updated_at,
          percentage_rate: teacherRecord.percentage_rate || 60,
          weekend_multiplier: teacherRecord.weekend_multiplier || 1,
          custom_subject_rates: teacherRecord.custom_subject_rates || {},
          hire_date: teacherRecord.hire_date || null,
          notes: teacherRecord.notes || '',
        };
        await supabase.from('teachers').upsert(dbTeacherRow, { onConflict: 'id' });
        if (newInitialContract) {
          await supabase.from('teacher_contracts').upsert(newInitialContract, { onConflict: 'id' });
        }
      }

      // Optional: Create login account via /api/admin/create-user
      let createdUserAccount: AppUser | null = null;
      if (formData.create_login_account && !existingLinkedUser) {
        const loginEmail = (formData.login_email || formData.email).trim().toLowerCase();
        const rawUsername = loginEmail.split('@')[0] || teacherCode.toLowerCase().replace(/[^a-z0-9]/g, '');
        const headers = await getAdminAuthHeaders();
        const res = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            username: rawUsername,
            email: loginEmail,
            password: formData.login_password.trim(),
            full_name: cleanName,
            phone: formData.phone.trim(),
            department: 'Đội ngũ Giáo viên Ngoại khóa',
            campus_id: formData.campus_id,
            role: 'teacher',
            status: 'active',
            linked_teacher_id: teacherId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data?.error || 'Đã lưu hồ sơ giáo viên nhưng không thể tạo tài khoản đăng nhập.'
          );
        }
        if (data?.user) {
          createdUserAccount = {
            id: data.user.id,
            username: data.user.username || rawUsername,
            email: loginEmail,
            full_name: cleanName,
            phone: formData.phone.trim(),
            role: 'teacher',
            department: 'Đội ngũ Giáo viên Ngoại khóa',
            campus_id: formData.campus_id as any,
            status: 'active',
            linked_teacher_id: teacherId,
            created_at: todayIso,
          };
        }
      }

      onUpdateStore(prev => {
        const updatedTeachers = editingTeacher
          ? prev.teachers.map(t => (t.id === teacherId ? teacherRecord : t))
          : [teacherRecord, ...prev.teachers];

        const updatedContracts = newInitialContract
          ? [...(prev.teacherContracts || []), newInitialContract]
          : prev.teacherContracts || [];

        const updatedUsers = createdUserAccount
          ? [
              createdUserAccount,
              ...(prev.users || []).filter(u => u.id !== createdUserAccount!.id),
            ]
          : prev.users;

        const auditLog = createAuditRecord(
          editingTeacher ? 'TEACHER_UPDATE' : 'TEACHER_CREATE',
          'ACADEMIC',
          `Giáo viên ${teacherRecord.name} (${teacherRecord.code})`,
          `${editingTeacher ? 'Cập nhật' : 'Thêm mới'} hồ sơ giáo viên ${teacherRecord.name} (${teacherRecord.code})${
            createdUserAccount ? ` kèm tài khoản đăng nhập @${createdUserAccount.username}` : ''
          }`,
          currentUser,
          { target_id: teacherRecord.code }
        );

        const nextState = syncTeachersCurrentFieldsFromContracts(
          appendAuditLog(
            {
              ...prev,
              teachers: updatedTeachers,
              teacherContracts: updatedContracts,
              users: updatedUsers,
            },
            auditLog
          ),
          todayIso
        );
        return nextState;
      });

      showToast(
        `${editingTeacher ? 'Đã cập nhật' : 'Đã thêm mới'} giáo viên ${teacherRecord.name} (${teacherRecord.code})${
          createdUserAccount ? ' và cấp tài khoản đăng nhập' : ''
        } thành công!`,
        'success'
      );
      setIsAddEditModalOpen(false);
      setEditingTeacher(null);
    } catch (err: any) {
      setFormError(err?.message || 'Lỗi khi lưu hồ sơ giáo viên.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Contract Change Modal ("Chuyển ngạch / Đổi mức lương")
  const handleOpenContractModal = (teacher: Teacher) => {
    const milestones = getTeacherMilestonesAsc(teacher.id);
    const latestMilestone = milestones[milestones.length - 1];
    const currentContract = getTeacherContractAt(teacher, todayIso, store);

    // Suggest tomorrow if latest milestone is today or later
    let defaultEffectiveDate = todayIso;
    if (latestMilestone && latestMilestone.effective_from >= defaultEffectiveDate) {
      const d = new Date(`${latestMilestone.effective_from}T00:00:00`);
      d.setDate(d.getDate() + 1);
      defaultEffectiveDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
    }

    setContractModalTeacher(teacher);
    setContractError(null);
    setContractForm({
      effective_from: defaultEffectiveDate,
      teacher_type: currentContract.teacher_type,
      pay_model: currentContract.pay_model,
      rate_per_period: currentContract.rate_per_period || 150000,
      periods_per_session: currentContract.periods_per_session || 2,
      percentage_rate: currentContract.percentage_rate || 45,
      weekend_multiplier: currentContract.weekend_multiplier || 1,
      custom_subject_rates: Array.isArray(currentContract.custom_subject_rates)
        ? [...currentContract.custom_subject_rates]
        : [],
      note: '',
    });
  };

  // Save New Contract Milestone (Insert new row into teacher_contracts, never overwrite old rows)
  const handleSaveNewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractModalTeacher) return;
    setContractError(null);

    const effDate = (contractForm.effective_from || '').trim();
    if (!effDate) {
      setContractError('Vui lòng chọn Ngày bắt đầu áp dụng (effective_from).');
      return;
    }

    const existingMilestones = getTeacherMilestonesAsc(contractModalTeacher.id);
    const latestMilestone = existingMilestones[existingMilestones.length - 1];

    // Rule 1: effective_from phải sau (>) mốc effective_from gần nhất của giáo viên đó
    if (latestMilestone && effDate <= latestMilestone.effective_from) {
      setContractError(
        `Ngày bắt đầu áp dụng (${formatDateVN(effDate)}) bắt buộc phải sau mốc hợp đồng gần nhất của giáo viên (${formatDateVN(
          latestMilestone.effective_from
        )}).`
      );
      return;
    }

    // Rule 2: Không được đặt vào hoặc trước ngày của bất kỳ buổi dạy nào đã thuộc kỳ lương đã quyết toán
    const latestSettledDate = getLatestSettledSessionDateForTeacher(
      contractModalTeacher.id,
      store
    );
    if (latestSettledDate && effDate <= latestSettledDate) {
      setContractError(
        `Không thể áp dụng từ ngày ${formatDateVN(
          effDate
        )} vì giáo viên đã có buổi dạy thuộc kỳ lương ĐÃ QUYẾT TOÁN đến ngày ${formatDateVN(
          latestSettledDate
        )}. Vui lòng chọn ngày sau ${formatDateVN(latestSettledDate)}.`
      );
      return;
    }

    const ratePerPeriod = Math.max(0, Number(contractForm.rate_per_period) || 0);
    const periodsPerSession = Math.max(1, Number(contractForm.periods_per_session) || 2);
    const sessionRate = ratePerPeriod * periodsPerSession;
    const percentageRate = Math.max(0, Math.min(100, Number(contractForm.percentage_rate) || 0));

    if (contractForm.pay_model === 'per_session' && sessionRate <= 0) {
      setContractError('Đơn giá theo buổi phải lớn hơn 0 VNĐ.');
      return;
    }
    if (contractForm.pay_model === 'revenue_share' && percentageRate <= 0) {
      setContractError('Tỷ lệ % chia sẻ doanh thu phải lớn hơn 0%.');
      return;
    }

    const newContract: TeacherContract = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      teacher_id: contractModalTeacher.id,
      teacher_type: contractForm.teacher_type,
      pay_model: contractForm.pay_model,
      effective_from: effDate,
      rate_per_period: ratePerPeriod,
      periods_per_session: periodsPerSession,
      session_rate: sessionRate,
      percentage_rate: contractForm.pay_model === 'revenue_share' ? percentageRate : 0,
      weekend_multiplier: Math.max(1, Number(contractForm.weekend_multiplier) || 1),
      custom_subject_rates: Array.isArray(contractForm.custom_subject_rates)
        ? contractForm.custom_subject_rates
        : [],
      note:
        contractForm.note.trim() ||
        `Chuyển ngạch sang ${
          contractForm.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'
        } (${
          contractForm.pay_model === 'revenue_share'
            ? `Chia sẻ ${percentageRate}% doanh thu`
            : `${formatVND(sessionRate)}/buổi`
        }) từ ${formatDateVN(effDate)}`,
      created_by: currentUser?.full_name || currentUser?.username || 'Ban Giám Hiệu',
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      await supabase.from('teacher_contracts').insert(newContract);
    }

    onUpdateStore(prev => {
      // Ensure teacher has an initial milestone if none existed in teacherContracts before
      const prevTeacherMilestones = (prev.teacherContracts || []).filter(
        c => c.teacher_id === contractModalTeacher.id
      );
      const baseContracts = [...(prev.teacherContracts || [])];
      if (prevTeacherMilestones.length === 0) {
        const fallbackInit = getTeacherContractAt(contractModalTeacher, '1970-01-01', prev);
        baseContracts.push({
          ...fallbackInit,
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `tc_init_${Date.now()}`,
          effective_from: contractModalTeacher.hire_date || '2026-01-01',
          note: 'Hợp đồng gốc trước khi chuyển ngạch',
        });
      }
      baseContracts.push(newContract);

      const auditLog = createAuditRecord(
        'TEACHER_CONTRACT_CHANGE',
        'FINANCE',
        `Chuyển ngạch / Đổi mức lương: ${contractModalTeacher.name}`,
        `Thêm mốc hợp đồng mới cho ${contractModalTeacher.name} áp dụng từ ${formatDateVN(
          effDate
        )}: ${contractForm.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'} - ${
          contractForm.pay_model === 'revenue_share'
            ? `${percentageRate}% doanh thu`
            : `${formatVND(sessionRate)}/buổi`
        }`,
        currentUser,
        { target_id: contractModalTeacher.code || contractModalTeacher.id }
      );

      // Sync teacher's current fields based on the contract active as of TODAY
      const synced = syncTeachersCurrentFieldsFromContracts(
        appendAuditLog(
          {
            ...prev,
            teacherContracts: baseContracts,
          },
          auditLog
        ),
        todayIso
      );
      return synced;
    });

    showToast(
      `Đã lưu mốc chuyển ngạch / mức lương mới cho ${contractModalTeacher.name} (Áp dụng từ ${formatDateVN(
        effDate
      )})!`,
      'success'
    );
    setContractModalTeacher(null);
  };

  // Lock / Unlock Teacher Handler
  const executeToggleLockTeacher = async () => {
    if (!lockConfirmTeacher) return;
    setIsLockingBusy(true);
    try {
      const nextStatus: 'active' | 'inactive' =
        lockConfirmTeacher.status === 'inactive' ? 'active' : 'inactive';
      const linkedUser = getLinkedUserForTeacher(lockConfirmTeacher.id);

      if (linkedUser) {
        const headers = await getAdminAuthHeaders();
        const res = await fetch('/api/admin/update-user', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: linkedUser.id,
            username: linkedUser.username,
            status: nextStatus === 'inactive' ? 'locked' : 'active',
            linked_teacher_id: lockConfirmTeacher.id,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.warn('[Lock Teacher Account Warning]:', errData?.error);
        }
      }

      onUpdateStore(prev => {
        const updatedTeachers = prev.teachers.map(t =>
          t.id === lockConfirmTeacher.id
            ? { ...t, status: nextStatus, updated_at: new Date().toISOString() }
            : t
        );
        const updatedUsers = (prev.users || []).map(u =>
          u.linked_teacher_id === lockConfirmTeacher.id || u.teacher_id === lockConfirmTeacher.id
            ? { ...u, status: (nextStatus === 'inactive' ? 'locked' : 'active') as 'active' | 'locked' }
            : u
        );
        const auditLog = createAuditRecord(
          nextStatus === 'inactive' ? 'TEACHER_LOCK' : 'TEACHER_UNLOCK',
          'SYSTEM',
          `Giáo viên ${lockConfirmTeacher.name} (${lockConfirmTeacher.code})`,
          `${
            nextStatus === 'inactive' ? 'Khóa hồ sơ & tài khoản' : 'Mở khóa hồ sơ & tài khoản'
          } giáo viên ${lockConfirmTeacher.name}`,
          currentUser,
          { target_id: lockConfirmTeacher.code }
        );
        return appendAuditLog(
          {
            ...prev,
            teachers: updatedTeachers,
            users: updatedUsers,
          },
          auditLog
        );
      });

      showToast(
        nextStatus === 'inactive'
          ? `Đã khóa hồ sơ giáo viên ${lockConfirmTeacher.name}${
              linkedUser ? ' và khóa tài khoản đăng nhập liên kết' : ''
            }.`
          : `Đã kích hoạt lại hồ sơ giáo viên ${lockConfirmTeacher.name}${
              linkedUser ? ' và mở khóa tài khoản đăng nhập' : ''
            }.`,
        'success'
      );
      setLockConfirmTeacher(null);
    } finally {
      setIsLockingBusy(false);
    }
  };

  // Check references & open Delete Confirmation Modal
  const handleRequestDeleteTeacher = (teacher: Teacher) => {
    const refs: string[] = [];
    const classesCount = (store.classes || []).filter(
      c => c.primary_teacher_id === teacher.id
    ).length;
    if (classesCount > 0) {
      refs.push(`${classesCount} lớp học ngoại khóa đang phân công`);
    }

    const sessionsCount = (store.sessions || []).filter(
      s => s.actual_teacher_id === teacher.id
    ).length;
    const workSessionsCount = (store.teacherAttendance || []).filter(
      ta => ta.assigned_teacher_id === teacher.id || ta.actual_teacher_id === teacher.id
    ).length;
    if (sessionsCount > 0 || workSessionsCount > 0) {
      refs.push(`${Math.max(sessionsCount, workSessionsCount)} buổi chấm công giảng dạy / dạy thay`);
    }

    const payrollCount = (store.payrollSettlements || []).filter(
      ps => ps.teacher_id === teacher.id
    ).length;
    if (payrollCount > 0) {
      refs.push(`${payrollCount} hồ sơ quyết toán thù lao`);
    }

    setDeleteConfirmState({
      teacher,
      canDelete: refs.length === 0,
      references: refs,
    });
  };

  const executeDeleteTeacher = async () => {
    if (!deleteConfirmState || !deleteConfirmState.canDelete) return;
    const targetTeacher = deleteConfirmState.teacher;
    setIsDeletingBusy(true);
    try {
      const linkedUser = getLinkedUserForTeacher(targetTeacher.id);
      if (linkedUser) {
        const headers = await getAdminAuthHeaders();
        await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: linkedUser.id,
            username: linkedUser.username,
          }),
        }).catch(() => {});
      }

      if (supabase) {
        await supabase.from('teacher_contracts').delete().eq('teacher_id', targetTeacher.id);
        await supabase.from('teachers').delete().eq('id', targetTeacher.id);
      }

      onUpdateStore(prev => {
        const auditLog = createAuditRecord(
          'TEACHER_DELETE',
          'SYSTEM',
          `Xóa giáo viên ${targetTeacher.name} (${targetTeacher.code})`,
          `Đã xóa vĩnh viễn hồ sơ giáo viên ${targetTeacher.name} (${targetTeacher.code}) chưa phát sinh dữ liệu giảng dạy`,
          currentUser,
          { target_id: targetTeacher.code }
        );
        return appendAuditLog(
          {
            ...prev,
            teachers: prev.teachers.filter(t => t.id !== targetTeacher.id),
            teacherContracts: (prev.teacherContracts || []).filter(
              c => c.teacher_id !== targetTeacher.id
            ),
            users: (prev.users || []).filter(
              u => u.linked_teacher_id !== targetTeacher.id && u.teacher_id !== targetTeacher.id
            ),
          },
          auditLog
        );
      });

      showToast(`Đã xóa hồ sơ giáo viên ${targetTeacher.name} thành công.`, 'success');
      setDeleteConfirmState(null);
    } finally {
      setIsDeletingBusy(false);
    }
  };

  // Reset Password Handler for Linked Teacher Account
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordTeacher) return;
    setResetPasswordError(null);

    const cleanPass = newResetPassword.trim();
    if (cleanPass.length < 10) {
      setResetPasswordError('Mật khẩu mới bắt buộc phải có tối thiểu 10 ký tự.');
      return;
    }

    setIsResettingPassword(true);
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: resetPasswordTeacher.linkedUser.id,
          username: resetPasswordTeacher.linkedUser.username,
          email: resetPasswordTeacher.linkedUser.email,
          newPassword: cleanPass,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể đặt lại mật khẩu cho tài khoản giáo viên.');
      }
      showToast(
        `Đã đặt lại mật khẩu đăng nhập cho giáo viên ${resetPasswordTeacher.teacher.name} (@${resetPasswordTeacher.linkedUser.username})!`,
        'success'
      );
      setResetPasswordTeacher(null);
      setNewResetPassword('');
    } catch (err: any) {
      setResetPasswordError(err?.message || 'Lỗi khi đặt lại mật khẩu.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Save edited note on a historical contract milestone
  const handleSaveMilestoneNote = (contractId: string) => {
    onUpdateStore(prev => ({
      ...prev,
      teacherContracts: (prev.teacherContracts || []).map(c =>
        c.id === contractId ? { ...c, note: editingContractNoteText.trim() } : c
      ),
    }));
    setEditingContractNoteId(null);
    showToast('Đã cập nhật ghi chú mốc hợp đồng.', 'success');
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-amber-400" />
            <span>Quản Lý Hồ Sơ Giáo Viên, Tài Khoản &amp; Lịch Sử Mức Lương ({filteredTeachers.length} GV)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Quản lý định danh nhân sự theo cơ sở (<code className="text-amber-300">GV-PMH-xxx</code> /{' '}
            <code className="text-cyan-300">GV-PL-xxx</code>), chuyển ngạch Cơ hữu ⇄ Thỉnh giảng và tính lương chính xác theo ngày từng buổi dạy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm tên, mã GV, SĐT..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-52 sm:w-64"
            />
          </div>

          {/* Campus Filter */}
          <select
            value={campusFilter}
            disabled={userScopedCampus !== 'all'}
            onChange={e => setCampusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tất cả cơ sở</option>
            <option value="camp_pmh">Phú Mỹ Hưng (PMH)</option>
            <option value="camp_pl">Phú Lâm (PL)</option>
          </select>

          {/* Teacher Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tất cả phân loại</option>
            <option value="permanent">Cơ hữu (Permanent)</option>
            <option value="visiting">Thỉnh giảng (Visiting)</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang giảng dạy</option>
            <option value="inactive">Đã khóa / Ngưng dạy</option>
          </select>

          {canManageGlobal && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Giáo Viên Mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Role Notice for View-Only Users (Academic / Accountant) */}
      {!canManageGlobal && (
        <div className="px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Vai trò hiện tại (<strong>{currentRole}</strong>) đang ở chế độ <strong>Chỉ xem</strong>. Bạn có thể tra cứu hồ sơ và xem Lịch sử ngạch &amp; mức lương của từng giáo viên.
          </span>
        </div>
      )}

      {/* Teachers Cards Grid */}
      {filteredTeachers.length === 0 ? (
        <div className="p-12 rounded-3xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
          <UserCheck className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="text-sm font-bold text-white">Không tìm thấy hồ sơ giáo viên phù hợp</div>
          <p className="text-xs text-slate-400">
            Hãy thử thay đổi bộ lọc cơ sở, phân loại hoặc từ khóa tìm kiếm.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeachers.map(teacher => {
            const activeContract = getTeacherContractAt(teacher, todayIso, store);
            const milestones = getTeacherMilestonesAsc(teacher.id);
            const linkedUser = getLinkedUserForTeacher(teacher.id);
            const campusObj = store.campuses.find(c => c.id === teacher.campus_id);
            const isPermanent = activeContract.teacher_type === 'permanent';
            const isLocked = teacher.status === 'inactive';
            const canEditThisTeacher = canManageCampus(teacher.campus_id);
            const assignedClassesCount = (store.classes || []).filter(
              c => c.primary_teacher_id === teacher.id
            ).length;

            return (
              <div
                key={teacher.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                  isLocked
                    ? 'bg-slate-950/70 border-rose-500/30 opacity-80'
                    : 'bg-slate-900/90 border-slate-800 hover:border-amber-500/40'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Row: Code + Name + Type Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] text-amber-400 font-extrabold">
                          {teacher.code}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[10px] font-mono font-bold text-slate-300">
                          {campusObj?.code || (teacher.campus_id === 'camp_pl' ? 'PL' : 'PMH')}
                        </span>
                        {isLocked && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                            Đã khóa
                          </span>
                        )}
                      </div>
                      <h4 className="font-extrabold text-white text-base mt-1">{teacher.name}</h4>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {teacher.phone || 'Chưa có SĐT'} {teacher.email ? `• ${teacher.email}` : ''}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                        isPermanent
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      }`}
                    >
                      {isPermanent ? 'Cơ hữu' : 'Thỉnh giảng'}
                    </span>
                  </div>

                  {/* Current Contract & Pay Model Box */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Hình thức trả lương hiện hành:</span>
                      <span className="font-bold text-slate-200">
                        {activeContract.pay_model === 'revenue_share'
                          ? 'Chia sẻ % doanh thu'
                          : 'Theo buổi / tiết'}
                      </span>
                    </div>

                    {activeContract.pay_model === 'revenue_share' ? (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Tỷ lệ hưởng doanh thu lớp:</span>
                        <strong className="font-mono font-extrabold text-purple-400">
                          {activeContract.percentage_rate}% doanh thu
                        </strong>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Đơn giá ca dạy chuẩn:</span>
                          <strong className="font-mono font-extrabold text-emerald-400">
                            {formatVND(activeContract.session_rate || 0)}/buổi
                          </strong>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Chi tiết định mức:</span>
                          <span className="font-mono text-amber-300">
                            {formatVND(activeContract.rate_per_period || 0)}/tiết ×{' '}
                            {activeContract.periods_per_session || 2} tiết
                            {(activeContract.weekend_multiplier || 1) > 1
                              ? ` (Cuối tuần ×${activeContract.weekend_multiplier})`
                              : ''}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[11px] text-slate-400">
                      <span>Áp dụng từ ngày:</span>
                      <span className="font-mono font-semibold text-cyan-300">
                        {formatDateVN(activeContract.effective_from)} ({milestones.length || 1} mốc)
                      </span>
                    </div>
                  </div>

                  {/* Account & Subjects Info */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Tài khoản đăng nhập:</span>
                      {linkedUser ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                              linkedUser.status === 'locked'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            @{linkedUser.username} ({linkedUser.status === 'locked' ? 'Đã khóa' : 'Active'})
                          </span>
                          {canEditThisTeacher && (
                            <button
                              type="button"
                              onClick={() => {
                                setResetPasswordTeacher({ teacher, linkedUser });
                                setNewResetPassword('');
                                setResetPasswordError(null);
                              }}
                              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300"
                              title="Đặt lại mật khẩu đăng nhập"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">Chưa tạo tài khoản</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Lớp đang phụ trách:</span>
                      <strong className="text-white font-mono">{assignedClassesCount} lớp</strong>
                    </div>

                    {teacher.bank_account?.account_number && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                        <CreditCard className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">
                          {teacher.bank_account.bank_name} • {teacher.bank_account.account_number} (
                          {teacher.bank_account.account_holder})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Taught Subjects Pills */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(teacher.subjects || []).map(subId => {
                      const sub = store.subjects.find(s => s.id === subId);
                      return sub ? (
                        <span
                          key={subId}
                          className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-medium"
                        >
                          {sub.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>

                {/* Action Footer */}
                <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryModalTeacher(teacher);
                        setEditingContractNoteId(null);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-bold flex items-center gap-1 transition-colors"
                      title="Xem lịch sử chuyển ngạch & thay đổi mức lương"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Lịch sử lương</span>
                    </button>

                    {canEditThisTeacher && (
                      <button
                        type="button"
                        onClick={() => handleOpenContractModal(teacher)}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 transition-colors"
                        title="Chuyển ngạch Cơ hữu / Thỉnh giảng hoặc Đổi mức lương theo ngày hiệu lực"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Chuyển ngạch / Đổi lương</span>
                      </button>
                    )}
                  </div>

                  {canEditThisTeacher && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(teacher)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="Chỉnh sửa hồ sơ & tài khoản giáo viên"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setLockConfirmTeacher(teacher)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isLocked
                            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400'
                            : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300'
                        }`}
                        title={isLocked ? 'Mở khóa giáo viên' : 'Khóa giáo viên (ẩn khỏi danh sách chọn)'}
                      >
                        {isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRequestDeleteTeacher(teacher)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                        title="Xóa giáo viên (chỉ khi chưa có dữ liệu liên quan)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: THÊM / SỬA HỒ SƠ GIÁO VIÊN & TẠO TÀI KHOẢN ĐĂNG NHẬP */}
      {isAddEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-amber-400" />
                  <span>
                    {editingTeacher
                      ? `Cập Nhật Hồ Sơ Giáo Viên (${editingTeacher.code})`
                      : 'Thêm Mới Hồ Sơ Giáo Viên'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mã giáo viên tự động sinh theo cơ sở (VD:{' '}
                  <code className="text-amber-300">
                    {editingTeacher?.code || generateTeacherCode(formData.campus_id, store.teachers)}
                  </code>
                  ).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddEditModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveTeacher} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Họ và tên giáo viên *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        name: e.target.value,
                        account_holder: formData.account_holder || e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="VD: Thầy Nguyễn Văn A"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Số điện thoại liên hệ</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="090xxxxxxx"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Email công việc</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        email: e.target.value,
                        login_email: formData.login_email || e.target.value,
                      })
                    }
                    placeholder="giaovien@royal.edu.vn"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Cơ sở công tác *</label>
                  <select
                    value={formData.campus_id}
                    disabled={userScopedCampus !== 'all'}
                    onChange={e => setFormData({ ...formData, campus_id: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold focus:outline-none focus:border-amber-500"
                  >
                    {store.campuses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Ngày nhận việc (Hire Date)</label>
                  <input
                    type="date"
                    value={formData.hire_date}
                    onChange={e => setFormData({ ...formData, hire_date: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                {!editingTeacher && (
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Ngạch hợp đồng ban đầu *</label>
                    <select
                      value={formData.teacher_type}
                      onChange={e => {
                        const nextType = e.target.value as 'permanent' | 'visiting';
                        setFormData({
                          ...formData,
                          teacher_type: nextType,
                          rate_per_period: nextType === 'permanent' ? 150000 : 135000,
                        });
                      }}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold focus:outline-none focus:border-amber-500"
                    >
                      <option value="permanent">Giáo viên Cơ hữu (Permanent)</option>
                      <option value="visiting">Giáo viên Thỉnh giảng (Visiting)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Initial Contract Configuration when creating a new teacher */}
              {!editingTeacher && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
                      Cấu Hình Mốc Lương Khởi Tạo (Áp dụng từ ngày nhận việc)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, pay_model: 'per_session' })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                          formData.pay_model === 'per_session'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        Theo buổi / tiết
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, pay_model: 'revenue_share' })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                          formData.pay_model === 'revenue_share'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        Chia sẻ % doanh thu
                      </button>
                    </div>
                  </div>

                  {formData.pay_model === 'per_session' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Đơn giá 1 tiết (VNĐ)</label>
                        <input
                          type="number"
                          step={5000}
                          value={formData.rate_per_period}
                          onChange={e =>
                            setFormData({ ...formData, rate_per_period: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-300 font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Số tiết / buổi</label>
                        <input
                          type="number"
                          min={1}
                          max={6}
                          value={formData.periods_per_session}
                          onChange={e =>
                            setFormData({ ...formData, periods_per_session: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Thành tiền / buổi</label>
                        <div className="px-3 py-2 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 font-mono font-extrabold">
                          {formatVND(
                            (Number(formData.rate_per_period) || 0) *
                              (Number(formData.periods_per_session) || 2)
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Tỷ lệ % chia sẻ doanh thu lớp</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={formData.percentage_rate}
                          onChange={e =>
                            setFormData({ ...formData, percentage_rate: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-purple-300 font-mono font-bold"
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
                          Thù lao mỗi buổi = <strong className="text-white">(Doanh thu lớp / Tổng buổi lớp) × {formData.percentage_rate}%</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bank Account */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Thông Tin Tài Khoản Thụ Hưởng (VietQR Quyết Toán Lương)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Ngân hàng</label>
                    <input
                      type="text"
                      value={formData.bank_name}
                      onChange={e => setFormData({ ...formData, bank_name: e.target.value })}
                      placeholder="Vietcombank, ACB, MB..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Số tài khoản</label>
                    <input
                      type="text"
                      value={formData.account_number}
                      onChange={e => setFormData({ ...formData, account_number: e.target.value })}
                      placeholder="007100xxxxxxx"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-cyan-300 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Chủ tài khoản (IN HOA)</label>
                    <input
                      type="text"
                      value={formData.account_holder}
                      onChange={e =>
                        setFormData({ ...formData, account_holder: e.target.value.toUpperCase() })
                      }
                      placeholder="NGUYEN VAN A"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white uppercase font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Taught Subjects Multi-Select */}
              <div>
                <label className="block text-slate-300 font-bold mb-1.5">
                  Chuyên môn giảng dạy ({formData.subjects.length} môn đã chọn)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  {store.subjects.map(subj => {
                    const checked = formData.subjects.includes(subj.id);
                    return (
                      <label
                        key={subj.id}
                        className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors ${
                          checked
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleSubject(subj.id)}
                          className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                        />
                        <span className="truncate text-[11px] font-medium">{subj.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">Ghi chú nhân sự</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Chứng chỉ chuyên môn, lưu ý lịch dạy..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              {/* Teacher Login Account Section (Default OFF) */}
              {(() => {
                const existingAcc = editingTeacher
                  ? getLinkedUserForTeacher(editingTeacher.id)
                  : undefined;

                if (existingAcc) {
                  return (
                    <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4" />
                          <span>Đã liên kết tài khoản đăng nhập: @{existingAcc.username}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Email: {existingAcc.email} • Trạng thái:{' '}
                          <strong className="text-white">
                            {existingAcc.status === 'locked' ? 'Đã khóa' : 'Đang hoạt động'}
                          </strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddEditModalOpen(false);
                          setResetPasswordTeacher({
                            teacher: editingTeacher!,
                            linkedUser: existingAcc,
                          });
                          setNewResetPassword('');
                          setResetPasswordError(null);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-xs flex items-center gap-1.5 shrink-0"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Đặt lại mật khẩu</span>
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
                          <KeyRound className="w-4 h-4 text-amber-400" />
                          <span>Tạo tài khoản đăng nhập cho giáo viên (Mặc định: TẮT)</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Cấp quyền truy cập Sổ Điểm Danh &amp; Dạy Thay cho các lớp của chính giáo viên này.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.create_login_account}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            create_login_account: e.target.checked,
                            login_email: formData.login_email || formData.email,
                          })
                        }
                        className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                      />
                    </label>

                    {formData.create_login_account && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                        <div>
                          <label className="block text-slate-400 mb-1">Email đăng nhập *</label>
                          <input
                            type="email"
                            required={formData.create_login_account}
                            value={formData.login_email}
                            onChange={e => setFormData({ ...formData, login_email: e.target.value })}
                            placeholder="gv.nguyenvana@royal.edu.vn"
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">
                            Mật khẩu khởi tạo (Tối thiểu 10 ký tự) *
                          </label>
                          <input
                            type="password"
                            required={formData.create_login_account}
                            minLength={10}
                            value={formData.login_password}
                            onChange={e =>
                              setFormData({ ...formData, login_password: e.target.value })
                            }
                            placeholder="Ít nhất 10 ký tự..."
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-300 font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold cursor-pointer"
                >
                  {isSubmitting
                    ? 'Đang xử lý...'
                    : editingTeacher
                    ? 'Lưu Thay Đổi'
                    : 'Tạo Hồ Sơ Giáo Viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CHUYỂN NGẠCH / ĐỔI MỨC LƯƠNG (INSERT NEW TEACHER_CONTRACTS ROW) */}
      {contractModalTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-amber-400" />
                  <span>Chuyển Ngạch / Đổi Mức Lương — {contractModalTeacher.name}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tạo bản ghi mới trong <code className="text-amber-300">teacher_contracts</code>. Các buổi dạy trước ngày hiệu lực vẫn giữ nguyên mức lương cũ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setContractModalTeacher(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {contractError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{contractError}</span>
              </div>
            )}

            <form onSubmit={handleSaveNewContract} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Ngày bắt đầu áp dụng (effective_from) *
                  </label>
                  <input
                    type="date"
                    required
                    value={contractForm.effective_from}
                    onChange={e =>
                      setContractForm({ ...contractForm, effective_from: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Loại giáo viên mới (teacher_type) *
                  </label>
                  <select
                    value={contractForm.teacher_type}
                    onChange={e =>
                      setContractForm({
                        ...contractForm,
                        teacher_type: e.target.value as 'permanent' | 'visiting',
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-amber-500"
                  >
                    <option value="permanent">Cơ hữu (Permanent)</option>
                    <option value="visiting">Thỉnh giảng (Visiting)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1.5">
                  Hình thức trả lương (pay_model) *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setContractForm({ ...contractForm, pay_model: 'per_session' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      contractForm.pay_model === 'per_session'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-extrabold text-xs">Theo buổi / tiết (per_session)</div>
                    <div className="text-[10px] opacity-80 mt-0.5">
                      Đơn giá tiết × Số tiết / buổi
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setContractForm({ ...contractForm, pay_model: 'revenue_share' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      contractForm.pay_model === 'revenue_share'
                        ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-extrabold text-xs">Chia sẻ % doanh thu (revenue_share)</div>
                    <div className="text-[10px] opacity-80 mt-0.5">
                      Tính theo % doanh thu thực tế của lớp
                    </div>
                  </button>
                </div>
              </div>

              {contractForm.pay_model === 'per_session' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div>
                    <label className="block text-slate-400 mb-1">Đơn giá / tiết (VNĐ)</label>
                    <input
                      type="number"
                      step={5000}
                      value={contractForm.rate_per_period}
                      onChange={e =>
                        setContractForm({
                          ...contractForm,
                          rate_per_period: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-300 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Số tiết / buổi</label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={contractForm.periods_per_session}
                      onChange={e =>
                        setContractForm({
                          ...contractForm,
                          periods_per_session: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Đơn giá / buổi (session_rate)</label>
                    <div className="px-3 py-2 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 font-mono font-extrabold">
                      {formatVND(
                        (Number(contractForm.rate_per_period) || 0) *
                          (Number(contractForm.periods_per_session) || 2)
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="block text-slate-300 font-bold">
                    Tỷ lệ % chia sẻ doanh thu (percentage_rate) *
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={contractForm.percentage_rate}
                      onChange={e =>
                        setContractForm({
                          ...contractForm,
                          percentage_rate: Number(e.target.value),
                        })
                      }
                      className="w-32 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-purple-300 font-mono font-extrabold text-sm"
                    />
                    <span className="text-slate-400 text-[11px]">
                      % doanh thu lớp chia đều cho tổng số buổi của lớp học (làm tròn đồng gần nhất)
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Hệ số ca cuối tuần (weekend_multiplier)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="3"
                    value={contractForm.weekend_multiplier}
                    onChange={e =>
                      setContractForm({
                        ...contractForm,
                        weekend_multiplier: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Ghi chú quyết định (note)</label>
                  <input
                    type="text"
                    value={contractForm.note}
                    onChange={e => setContractForm({ ...contractForm, note: e.target.value })}
                    placeholder="VD: Quyết định chuyển sang thỉnh giảng 45% từ 15/10..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setContractModalTeacher(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold cursor-pointer"
                >
                  Xác Nhận Lưu Mốc Hợp Đồng Mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: LỊCH SỬ NGẠCH & MỨC LƯƠNG (TIMELINE) */}
      {historyModalTeacher && (() => {
        const milestones = getTeacherMilestonesAsc(historyModalTeacher.id);
        const displayMilestones: TeacherContract[] =
          milestones.length > 0
            ? milestones
            : [getTeacherContractAt(historyModalTeacher, todayIso, store)];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-cyan-400" />
                    <span>
                      Lịch Sử Ngạch &amp; Mức Lương — {historyModalTeacher.name} ({historyModalTeacher.code})
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mỗi buổi dạy được áp dụng mốc hợp đồng có <code className="text-amber-300">effective_from &lt;= session_date</code> gần nhất. Các mốc đã phát sinh buổi dạy chỉ cho phép sửa ghi chú.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryModalTeacher(null)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {displayMilestones.map((m, index) => {
                  const nextMilestone = displayMilestones[index + 1];
                  const sessionsInPeriod = (store.teacherAttendance || []).filter(ta => {
                    if (ta.actual_teacher_id !== historyModalTeacher.id) return false;
                    if (ta.status === 'absent_excused' || ta.status === 'absent_unexcused') return false;
                    const afterStart = ta.session_date >= m.effective_from;
                    const beforeNext = !nextMilestone || ta.session_date < nextMilestone.effective_from;
                    return afterStart && beforeNext;
                  });
                  const hasSessions = sessionsInPeriod.length > 0;
                  const isCurrentActive =
                    m.effective_from <= todayIso &&
                    (!nextMilestone || nextMilestone.effective_from > todayIso);

                  return (
                    <div
                      key={m.id}
                      className={`p-4 rounded-2xl border space-y-2 text-xs ${
                        isCurrentActive
                          ? 'bg-emerald-950/20 border-emerald-500/40'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono font-bold">
                            Từ {formatDateVN(m.effective_from)}
                            {nextMilestone ? ` → trước ${formatDateVN(nextMilestone.effective_from)}` : ' → Hiện tại'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              m.teacher_type === 'permanent'
                                ? 'bg-cyan-500/20 text-cyan-300'
                                : 'bg-purple-500/20 text-purple-300'
                            }`}
                          >
                            {m.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'}
                          </span>
                          {isCurrentActive && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                              Đang áp dụng hôm nay
                            </span>
                          )}
                        </div>

                        <span className="font-mono text-[11px] text-slate-400">
                          Đã dạy: <strong className="text-white">{sessionsInPeriod.length} buổi</strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div>
                          {m.pay_model === 'revenue_share' ? (
                            <span className="font-mono font-extrabold text-purple-300 text-sm">
                              Chia sẻ {m.percentage_rate}% doanh thu lớp
                            </span>
                          ) : (
                            <span className="font-mono font-extrabold text-emerald-400 text-sm">
                              {formatVND(m.session_rate || 0)}/buổi ({formatVND(m.rate_per_period || 0)}/tiết ×{' '}
                              {m.periods_per_session || 2} tiết)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Người tạo: <strong className="text-slate-200">{m.created_by || 'Hệ thống'}</strong>
                        </div>
                      </div>

                      {/* Note Row (Always editable even when sessions exist) */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        {editingContractNoteId === m.id ? (
                          <div className="flex items-center gap-2 w-full">
                            <input
                              type="text"
                              value={editingContractNoteText}
                              onChange={e => setEditingContractNoteText(e.target.value)}
                              className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-amber-500/50 text-white text-xs"
                              placeholder="Nhập ghi chú cho mốc hợp đồng..."
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveMilestoneNote(m.id)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                            >
                              Lưu
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingContractNoteId(null)}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="text-[11px] text-slate-400">
                              Ghi chú: <span className="text-slate-200">{m.note || '—'}</span>
                              {hasSessions && (
                                <span className="ml-2 text-[10px] text-amber-400/90">
                                  (Đã phát sinh {sessionsInPeriod.length} buổi dạy — khóa sửa mức lương, chỉ sửa ghi chú)
                                </span>
                              )}
                            </div>
                            {canManageCampus(historyModalTeacher.campus_id) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingContractNoteId(m.id);
                                  setEditingContractNoteText(m.note || '');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold shrink-0"
                              >
                                Sửa ghi chú
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                {canManageCampus(historyModalTeacher.campus_id) ? (
                  <button
                    type="button"
                    onClick={() => {
                      const t = historyModalTeacher;
                      setHistoryModalTeacher(null);
                      handleOpenContractModal(t);
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Mốc Chuyển Ngạch / Đổi Lương Mới</span>
                  </button>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  onClick={() => setHistoryModalTeacher(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 4: ĐẶT LẠI MẬT KHẨU TÀI KHOẢN GIÁO VIÊN */}
      {resetPasswordTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <span>Đặt Lại Mật Khẩu Giáo Viên</span>
              </h3>
              <button
                type="button"
                onClick={() => setResetPasswordTeacher(null)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-1">
              <div>
                Giáo viên: <strong className="text-white">{resetPasswordTeacher.teacher.name}</strong>
              </div>
              <div>
                Tài khoản: <strong className="text-amber-300 font-mono">@{resetPasswordTeacher.linkedUser.username}</strong>
              </div>
            </div>

            {resetPasswordError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300">
                {resetPasswordError}
              </div>
            )}

            <form onSubmit={handleConfirmResetPassword} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Mật khẩu mới (Tối thiểu 10 ký tự) *
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  value={newResetPassword}
                  onChange={e => setNewResetPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới ít nhất 10 ký tự..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordTeacher(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isResettingPassword}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold cursor-pointer"
                >
                  {isResettingPassword ? 'Đang cập nhật...' : 'Xác Nhận Đặt Lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: XÁC NHẬN KHÓA / MỞ KHÓA GIÁO VIÊN */}
      {lockConfirmTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              {lockConfirmTeacher.status === 'inactive' ? (
                <Unlock className="w-5 h-5 text-emerald-400" />
              ) : (
                <Lock className="w-5 h-5 text-amber-400" />
              )}
              <span>
                {lockConfirmTeacher.status === 'inactive'
                  ? `Mở Khóa Hồ Sơ Giáo Viên`
                  : `Khóa Hồ Sơ Giáo Viên`}
              </span>
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              {lockConfirmTeacher.status === 'inactive' ? (
                <>
                  Bạn có chắc chắn muốn kích hoạt lại hồ sơ giáo viên{' '}
                  <strong className="text-white">{lockConfirmTeacher.name}</strong> ({lockConfirmTeacher.code})? Tài khoản đăng nhập liên kết (nếu có) sẽ được mở khóa và giáo viên sẽ xuất hiện lại trong danh sách phân công lớp / dạy thay.
                </>
              ) : (
                <>
                  Khi khóa hồ sơ giáo viên <strong className="text-white">{lockConfirmTeacher.name}</strong> ({lockConfirmTeacher.code}):
                  <br />• Tài khoản đăng nhập liên kết (nếu có) sẽ tự động bị khóa (<code className="text-rose-300">locked</code>).
                  <br />• Giáo viên sẽ <strong>ẩn khỏi danh sách chọn</strong> khi mở lớp mới hoặc chọn người dạy thay.
                  <br />• Toàn bộ lịch sử buổi dạy và bảng quyết toán cũ vẫn giữ nguyên tên giáo viên.
                </>
              )}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLockConfirmTeacher(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={isLockingBusy}
                onClick={executeToggleLockTeacher}
                className={`px-4 py-2 rounded-xl font-extrabold text-xs cursor-pointer ${
                  lockConfirmTeacher.status === 'inactive'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                {isLockingBusy
                  ? 'Đang xử lý...'
                  : lockConfirmTeacher.status === 'inactive'
                  ? 'Xác Nhận Mở Khóa'
                  : 'Xác Nhận Khóa Giáo Viên'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: XÁC NHẬN XÓA GIÁO VIÊN (CHẶN NẾU ĐÃ CÓ THAM CHIẾU) */}
      {deleteConfirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              <span>Xóa Hồ Sơ Giáo Viên — {deleteConfirmState.teacher.name}</span>
            </h3>

            {!deleteConfirmState.canDelete ? (
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/40 text-rose-200 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-rose-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Không thể xóa giáo viên đã phát sinh dữ liệu lịch sử!</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Hồ sơ giáo viên <strong>{deleteConfirmState.teacher.name}</strong> đang được tham chiếu tại:
                  </p>
                  <ul className="list-disc list-inside text-[11px] text-amber-300 font-semibold space-y-0.5">
                    {deleteConfirmState.references.map((ref, i) => (
                      <li key={i}>{ref}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Để bảo toàn lịch sử điểm danh và quyết toán thù lao, vui lòng sử dụng chức năng <strong>Khóa giáo viên</strong> thay vì xóa.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmState(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                  >
                    Đóng
                  </button>
                  {deleteConfirmState.teacher.status !== 'inactive' && (
                    <button
                      type="button"
                      onClick={() => {
                        const t = deleteConfirmState.teacher;
                        setDeleteConfirmState(null);
                        setLockConfirmTeacher(t);
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold cursor-pointer"
                    >
                      Chuyển sang Khóa Giáo Viên
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <p className="text-slate-300 leading-relaxed">
                  Giáo viên <strong className="text-white">{deleteConfirmState.teacher.name}</strong> ({deleteConfirmState.teacher.code}) chưa được gán vào lớp học, buổi dạy hay bảng lương nào. Bạn có chắc chắn muốn xóa vĩnh viễn hồ sơ và tài khoản đăng nhập liên kết (nếu có)?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmState(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingBusy}
                    onClick={executeDeleteTeacher}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold cursor-pointer"
                  >
                    {isDeletingBusy ? 'Đang xóa...' : 'Xác Nhận Xóa Vĩnh Viễn'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
