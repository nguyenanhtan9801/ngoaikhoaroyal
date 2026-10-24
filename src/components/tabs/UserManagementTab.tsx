import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Edit3,
  Trash2,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Mail,
  Phone,
  Database,
  Copy,
  Check,
  X,
  Dices,
  UserCheck,
  Sliders,
  Sparkles,
  Clock,
} from 'lucide-react';
import {
  AppUser,
  UserRole,
  UserPermissionMatrix,
} from '../../types';
import {
  AppStore,
  getDefaultPermissionsForRole,
  getUserPermissions,
  getRoleLabelVN,
  getCampusLabelVN,
  getPermissionSummaryText,
  createAuditRecord,
  appendAuditLog,
  syncAppUserToSupabase,
  APP_USERS_SQL_DDL,
} from '../../lib/storage';
import { showToast } from '../../lib/toast';

interface UserManagementTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

export const UserManagementTab: React.FC<UserManagementTabProps> = ({
  store,
  currentRole,
  currentUser,
  onUpdateStore,
}) => {
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'locked'>('all');

  // Modals state
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [permissionModalUser, setPermissionModalUser] = useState<AppUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AppUser | null>(null);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Edit / Create Form state
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('123456');
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formCampusId, setFormCampusId] = useState<string>('all');
  const [formRole, setFormRole] = useState<UserRole>('academic');
  const [formStatus, setFormStatus] = useState<'active' | 'locked'>('active');
  const [formLinkedTeacherId, setFormLinkedTeacherId] = useState<string>('');
  const [formPermissions, setFormPermissions] = useState<UserPermissionMatrix>(() =>
    getDefaultPermissionsForRole('academic')
  );

  // Permission Matrix Modal state
  const [matrixPerms, setMatrixPerms] = useState<UserPermissionMatrix>(() =>
    getDefaultPermissionsForRole('academic')
  );

  const currentPerms = useMemo(
    () => getUserPermissions(currentUser, currentRole),
    [currentUser, currentRole]
  );

  const isSuperAdminOrAllowed =
    currentRole === 'super_admin' ||
    currentUser?.role === 'super_admin' ||
    currentUser?.is_root ||
    currentPerms.can_manage_users;

  // Match role filter helper
  const matchesRoleFilter = (u: AppUser, filter: string): boolean => {
    if (filter === 'all') return true;
    if (filter === 'super_admin') return u.role === 'super_admin' || !!u.is_root;
    if (filter === 'campus_manager') return u.role === 'campus_manager';
    if (filter === 'academic') {
      return (
        u.role === 'academic' ||
        u.role === 'academic_accountant' ||
        u.role === 'academic_admissions'
      );
    }
    if (filter === 'admissions') {
      return u.role === 'admissions' || u.role === 'academic_admissions';
    }
    if (filter === 'accountant') {
      return u.role === 'accountant' || u.role === 'academic_accountant';
    }
    if (filter === 'teacher') return u.role === 'teacher';
    return u.role === filter;
  };

  // Match campus filter helper
  const matchesCampusFilter = (u: AppUser, filter: string): boolean => {
    if (filter === 'all') return true;
    if (filter === 'pmh') return u.campus_id === 'pmh' || u.campus_id === 'camp_pmh';
    if (filter === 'pl') return u.campus_id === 'pl' || u.campus_id === 'camp_pl';
    return u.campus_id === filter;
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (store.users || []).filter(u => {
      if (!matchesRoleFilter(u, roleFilter)) return false;
      if (!matchesCampusFilter(u, campusFilter)) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (q) {
        const matchUname = u.username.toLowerCase().includes(q);
        const matchName = (u.full_name || u.name || '').toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchPhone = (u.phone || '').toLowerCase().includes(q);
        if (!matchUname && !matchName && !matchEmail && !matchPhone) return false;
      }
      return true;
    });
  }, [store.users, searchQuery, roleFilter, campusFilter, statusFilter]);

  // Stats counters
  const stats = useMemo(() => {
    const all = store.users || [];
    const active = all.filter(u => u.status === 'active').length;
    const locked = all.filter(u => u.status === 'locked').length;
    const teachers = all.filter(u => u.role === 'teacher').length;
    const admins = all.filter(u => u.role === 'super_admin' || u.is_root).length;
    return { total: all.length, active, locked, teachers, admins };
  }, [store.users]);

  // Open Create User modal
  const handleOpenAddUser = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormPassword('Royal@2026');
    setFormFullName('');
    setFormEmail('@royal.edu.vn');
    setFormPhone('090');
    setFormDepartment('Phòng Học Vụ Ngoại Khóa');
    setFormCampusId('pmh');
    setFormRole('academic');
    setFormStatus('active');
    setFormLinkedTeacherId('');
    setFormPermissions(getDefaultPermissionsForRole('academic'));
    setIsAddUserOpen(true);
  };

  // Open Edit User modal
  const handleOpenEditUser = (u: AppUser) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormPassword(u.password || u.password_hash || '123456');
    setFormFullName(u.full_name || u.name || '');
    setFormEmail(u.email || `${u.username}@royal.edu.vn`);
    setFormPhone(u.phone || '');
    setFormDepartment(u.department || getRoleLabelVN(u.role, u));
    setFormCampusId(
      u.campus_id === 'camp_pmh' ? 'pmh' : u.campus_id === 'camp_pl' ? 'pl' : u.campus_id || 'all'
    );
    setFormRole(u.role);
    setFormStatus(u.status);
    setFormLinkedTeacherId(u.linked_teacher_id || '');
    setFormPermissions(getUserPermissions(u));
    setIsAddUserOpen(true);
  };

  // Generate random secure password
  const handleGenerateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let randomPart = '';
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const generated = `RS@${randomPart}`;
    setFormPassword(generated);
    showToast(`🎲 Đã sinh mật khẩu ngẫu nhiên: ${generated}`, 'info');
  };

  // Role change inside EditUserModal automatically applies default permissions template
  const handleRoleChangeInForm = (newRole: UserRole) => {
    setFormRole(newRole);
    setFormPermissions(getDefaultPermissionsForRole(newRole));
    if (newRole === 'super_admin') {
      setFormDepartment('Ban Giám Hiệu & Quản Trị Hệ Thống');
      setFormCampusId('all');
    } else if (newRole === 'campus_manager') {
      setFormDepartment('Ban Quản Lý Cơ Sở');
    } else if (newRole === 'academic_accountant') {
      setFormDepartment('Học Vụ & Kế Toán');
    } else if (newRole === 'academic' || newRole === 'academic_admissions') {
      setFormDepartment('Phòng Giáo Vụ & Học Vụ');
    } else if (newRole === 'admissions') {
      setFormDepartment('Phòng Tuyển Sinh & CSKH');
    } else if (newRole === 'accountant') {
      setFormDepartment('Phòng Tài Chính - Kế Toán');
    } else if (newRole === 'teacher') {
      setFormDepartment('Tổ Giáo Viên Ngoại Khóa');
    }
  };

  // Save Add / Edit User
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = formUsername.trim().toLowerCase();
    const cleanName = formFullName.trim();
    const cleanEmail = formEmail.trim().toLowerCase();

    if (!cleanUsername || !cleanName) {
      showToast('✕ Vui lòng nhập đầy đủ Tên đăng nhập và Họ tên người dùng.', 'error');
      return;
    }

    if (cleanUsername === 'overadmin' && (!editingUser || editingUser.username !== 'overadmin')) {
      showToast('✕ Tên đăng nhập "overadmin" được bảo lưu cho Tài khoản Quản trị Tối cao (Root).', 'error');
      return;
    }

    // Check duplicate username or email
    const duplicate = store.users.find(
      u =>
        u.id !== editingUser?.id &&
        (u.username.toLowerCase() === cleanUsername ||
          (cleanEmail && u.email.toLowerCase() === cleanEmail))
    );
    if (duplicate) {
      showToast(
        `✕ Tên đăng nhập "${cleanUsername}" hoặc Email "${cleanEmail}" đã tồn tại trên hệ thống!`,
        'error'
      );
      return;
    }

    // Prevent self-lock in edit form
    if (
      editingUser &&
      currentUser &&
      (editingUser.id === currentUser.id || editingUser.username === currentUser.username) &&
      formStatus === 'locked'
    ) {
      showToast('⚠️ Bạn không thể tự khóa tài khoản đang đăng nhập của chính mình!', 'warning');
      return;
    }

    const nowStr = new Date().toLocaleString('vi-VN');
    const actorName = currentUser?.full_name || 'Quản trị viên';

    if (editingUser) {
      const updatedUser: AppUser = {
        ...editingUser,
        username: cleanUsername,
        password: formPassword.trim() || editingUser.password || '123456',
        password_hash: formPassword.trim() || editingUser.password_hash || '123456',
        full_name: cleanName,
        name: cleanName,
        email: cleanEmail || `${cleanUsername}@royal.edu.vn`,
        phone: formPhone.trim(),
        department: formDepartment.trim() || getRoleLabelVN(formRole),
        campus_id: formCampusId,
        role: formRole,
        status: formStatus,
        linked_teacher_id: formRole === 'teacher' ? formLinkedTeacherId || undefined : undefined,
        permissions: formPermissions,
      };

      const log = createAuditRecord(
        'USER_UPDATE',
        'SYSTEM',
        'Tài Khoản Người Dùng',
        `Admin ${actorName} đã cập nhật thông tin tài khoản ${updatedUser.username} (${updatedUser.full_name}) vào lúc ${nowStr}`,
        currentUser,
        {
          target_id: updatedUser.username,
          details: {
            status: 'success',
            before: {
              role: editingUser.role,
              campus_id: editingUser.campus_id,
              status: editingUser.status,
            },
            after: {
              role: updatedUser.role,
              campus_id: updatedUser.campus_id,
              status: updatedUser.status,
            },
          },
        }
      );

      onUpdateStore(prev => ({
        ...prev,
        users: prev.users.map(u => (u.id === editingUser.id ? updatedUser : u)),
        auditLogs: [log, ...(prev.auditLogs || [])],
      }));

      await syncAppUserToSupabase(updatedUser, 'upsert');
      showToast(`✓ Đã cập nhật hồ sơ tài khoản @${updatedUser.username} thành công!`, 'success');
    } else {
      const newUser: AppUser = {
        id: `usr_${Date.now()}`,
        code: `NV-${String(store.users.length + 1).padStart(3, '0')}`,
        username: cleanUsername,
        password: formPassword.trim() || '123456',
        password_hash: formPassword.trim() || '123456',
        full_name: cleanName,
        name: cleanName,
        email: cleanEmail || `${cleanUsername}@royal.edu.vn`,
        phone: formPhone.trim(),
        department: formDepartment.trim() || getRoleLabelVN(formRole),
        campus_id: formCampusId,
        role: formRole,
        status: formStatus,
        linked_teacher_id: formRole === 'teacher' ? formLinkedTeacherId || undefined : undefined,
        permissions: formPermissions,
        created_at: new Date().toISOString().split('T')[0],
      };

      const log = createAuditRecord(
        'USER_CREATE',
        'SYSTEM',
        'Tài Khoản Người Dùng',
        `Admin ${actorName} đã tạo mới tài khoản ${newUser.username} (${newUser.full_name} - ${getRoleLabelVN(newUser.role, newUser)}) vào lúc ${nowStr}`,
        currentUser,
        {
          target_id: newUser.username,
          details: {
            status: 'success',
            after: {
              username: newUser.username,
              full_name: newUser.full_name,
              role: newUser.role,
              campus_id: newUser.campus_id,
              status: newUser.status,
            },
          },
        }
      );

      onUpdateStore(prev => ({
        ...prev,
        users: [newUser, ...prev.users],
        auditLogs: [log, ...(prev.auditLogs || [])],
      }));

      await syncAppUserToSupabase(newUser, 'upsert');
      showToast(`✓ Đã thêm tài khoản người dùng mới @${newUser.username} (${newUser.full_name})!`, 'success');
    }

    setIsAddUserOpen(false);
    setEditingUser(null);
  };

  // Toggle Lock / Unlock user account
  const handleToggleLockUser = async (targetUser: AppUser) => {
    if (targetUser.is_root || targetUser.username === 'overadmin') {
      showToast('🛡️ Tài khoản Root (overadmin) được bảo vệ cứng và không thể bị khóa!', 'error');
      return;
    }

    if (
      currentUser &&
      (targetUser.id === currentUser.id || targetUser.username === currentUser.username)
    ) {
      showToast('⚠️ Bạn không thể tự khóa tài khoản đang đăng nhập của chính mình!', 'warning');
      return;
    }

    const nextStatus: 'active' | 'locked' = targetUser.status === 'locked' ? 'active' : 'locked';
    const updatedUser: AppUser = {
      ...targetUser,
      status: nextStatus,
    };

    const nowStr = new Date().toLocaleString('vi-VN');
    const actorName = currentUser?.full_name || 'Quản trị viên';
    const actionLabel = nextStatus === 'locked' ? 'Khóa' : 'Mở khóa';

    const log = createAuditRecord(
      nextStatus === 'locked' ? 'USER_LOCK' : 'USER_UNLOCK',
      'SYSTEM',
      'Tài Khoản Người Dùng',
      `Admin ${actorName} đã ${actionLabel} tài khoản ${targetUser.username} vào lúc ${nowStr}`,
      currentUser,
      {
        target_id: targetUser.username,
        details: {
          status: 'success',
          before: { status: targetUser.status },
          after: { status: nextStatus },
        },
      }
    );

    onUpdateStore(prev => ({
      ...prev,
      users: prev.users.map(u => (u.id === targetUser.id ? updatedUser : u)),
      auditLogs: [log, ...(prev.auditLogs || [])],
    }));

    await syncAppUserToSupabase(updatedUser, 'upsert');

    if (nextStatus === 'locked') {
      showToast(
        `🔒 Đã khóa tài khoản ${targetUser.username}. Người dùng này sẽ không thể đăng nhập vào hệ thống.`,
        'warning'
      );
    } else {
      showToast(
        `🔓 Đã mở khóa tài khoản ${targetUser.username}. Người dùng có thể đăng nhập trở lại.`,
        'success'
      );
    }
  };

  // Open RolePermissionModal
  const handleOpenPermissionModal = (u: AppUser) => {
    setPermissionModalUser(u);
    setMatrixPerms(getUserPermissions(u));
  };

  // Save RolePermissionModal
  const handleSavePermissionMatrix = async () => {
    if (!permissionModalUser) return;

    const updatedUser: AppUser = {
      ...permissionModalUser,
      permissions: matrixPerms,
    };

    const nowStr = new Date().toLocaleString('vi-VN');
    const actorName = currentUser?.full_name || 'Quản trị viên';

    const log = createAuditRecord(
      'USER_PERMISSION_UPDATE',
      'SYSTEM',
      'Phân Quyền Truy Cập (RBAC)',
      `Admin ${actorName} đã Đổi quyền tài khoản ${permissionModalUser.username} vào lúc ${nowStr}`,
      currentUser,
      {
        target_id: permissionModalUser.username,
        details: {
          status: 'success',
          before: getUserPermissions(permissionModalUser),
          after: matrixPerms,
        },
      }
    );

    onUpdateStore(prev => ({
      ...prev,
      users: prev.users.map(u => (u.id === permissionModalUser.id ? updatedUser : u)),
      auditLogs: [log, ...(prev.auditLogs || [])],
    }));

    await syncAppUserToSupabase(updatedUser, 'upsert');
    showToast(
      `✓ Đã lưu ma trận quyền hạn RBAC cho tài khoản @${permissionModalUser.username}!`,
      'success'
    );
    setPermissionModalUser(null);
  };

  // Check if user has historical attendance/payroll data
  const getUserHistoricalActivity = (u: AppUser) => {
    const linkedTeacherId =
      u.linked_teacher_id ||
      store.teachers.find(t => t.name.toLowerCase() === (u.full_name || '').toLowerCase())?.id;
    const hasTeacherSessions = linkedTeacherId
      ? (store.teacherAttendance || []).some(
          ta => ta.actual_teacher_id === linkedTeacherId || ta.assigned_teacher_id === linkedTeacherId
        )
      : false;
    const hasAuditLogs = (store.auditLogs || []).some(
      l => l.username === u.username || l.user_id === u.id
    );
    return {
      hasHistory: hasTeacherSessions || hasAuditLogs,
      hasTeacherSessions,
      hasAuditLogs,
    };
  };

  // Confirm Delete User
  const handleConfirmDeleteUser = async () => {
    if (!deletingUser) return;

    if (deletingUser.is_root || deletingUser.username === 'overadmin') {
      showToast('🛡️ Không thể xóa tài khoản Quản trị viên gốc (overadmin)!', 'error');
      setDeletingUser(null);
      return;
    }

    if (
      currentUser &&
      (deletingUser.id === currentUser.id || deletingUser.username === currentUser.username)
    ) {
      showToast('⚠️ Không cho phép xóa tài khoản đang đăng nhập hiện tại!', 'error');
      setDeletingUser(null);
      return;
    }

    const nowStr = new Date().toLocaleString('vi-VN');
    const actorName = currentUser?.full_name || 'Quản trị viên';

    const log = createAuditRecord(
      'USER_DELETE',
      'SYSTEM',
      'Tài Khoản Người Dùng',
      `Admin ${actorName} đã Xóa tài khoản ${deletingUser.username} (${deletingUser.full_name}) vào lúc ${nowStr}`,
      currentUser,
      {
        target_id: deletingUser.username,
        details: {
          status: 'success',
          before: {
            id: deletingUser.id,
            username: deletingUser.username,
            full_name: deletingUser.full_name,
            role: deletingUser.role,
          },
        },
      }
    );

    onUpdateStore(prev => ({
      ...prev,
      users: prev.users.filter(u => u.id !== deletingUser.id),
      auditLogs: [log, ...(prev.auditLogs || [])],
    }));

    await syncAppUserToSupabase(deletingUser, 'delete');
    showToast(
      `🗑️ Đã xóa vĩnh viễn tài khoản @${deletingUser.username} (${deletingUser.full_name}).`,
      'info'
    );
    setDeletingUser(null);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(APP_USERS_SQL_DDL);
    setCopiedSql(true);
    showToast('✓ Đã sao chép kịch bản SQL khởi tạo bảng app_users trên Supabase!', 'success');
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Top Summary Banner & KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#111827]/90 border border-slate-800/90 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Tổng Tài Khoản
            </p>
            <p className="text-xl font-black text-white mt-0.5">{stats.total}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {stats.admins} Quản trị • {stats.teachers} Giáo viên
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#111827]/90 border border-emerald-500/25 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Đang Hoạt Động
            </p>
            <p className="text-xl font-black text-emerald-300 mt-0.5">{stats.active}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Cho phép xác thực phiên</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#111827]/90 border border-red-500/25 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">
              Đang Bị Khóa
            </p>
            <p className="text-xl font-black text-red-300 mt-0.5">{stats.locked}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Chặn đăng nhập tức thì</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
            <Lock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#111827]/90 border border-cyan-500/25 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">
              Bảo Mật RBAC
            </p>
            <p className="text-sm font-extrabold text-cyan-300 mt-1">Ma Trận 4 Phân Hệ</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Root OverAdmin bất tử</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 1. Thanh công cụ & Bộ lọc (Toolbar & Filters) */}
      <div className="p-3.5 rounded-2xl bg-[#111827]/95 border border-slate-800/90 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
        {/* Bên trái: Tìm kiếm & 3 Bộ lọc */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Ô tìm kiếm nhanh */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm theo username, họ tên, email, SĐT..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Bộ lọc Vai trò */}
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tất cả vai trò</option>
            <option value="super_admin">Quản trị viên</option>
            <option value="campus_manager">Quản lý cơ sở</option>
            <option value="academic">Học vụ</option>
            <option value="admissions">Tuyển sinh</option>
            <option value="accountant">Kế toán</option>
            <option value="teacher">Giáo viên</option>
          </select>

          {/* Bộ lọc Cơ sở */}
          <select
            value={campusFilter}
            onChange={e => setCampusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tất cả cơ sở</option>
            <option value="pmh">Phú Mỹ Hưng (PMH)</option>
            <option value="pl">Phú Lâm (PL)</option>
          </select>

          {/* Bộ lọc Trạng thái */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">● Đang hoạt động</option>
            <option value="locked">🔒 Đang bị khóa</option>
          </select>
        </div>

        {/* Bên phải: Nút Thêm Người Dùng Mới & SQL DDL */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowSqlModal(true)}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 font-bold text-xs flex items-center gap-1.5 transition-all"
            title="Xem kịch bản SQL khởi tạo bảng app_users trên Supabase"
          >
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>SQL Supabase</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAddUser}
            disabled={!isSuperAdminOrAllowed}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all"
          >
            <UserPlus className="w-4 h-4 text-slate-950" />
            <span>+ Thêm Người Dùng Mới</span>
          </button>
        </div>
      </div>

      {/* 2. Bảng danh sách tài khoản người dùng (Users Table) */}
      <div className="rounded-2xl bg-[#111827]/95 border border-slate-800/90 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/90 border-b border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">TÀI KHOẢN &amp; HỌ TÊN</th>
                <th className="py-3 px-3.5">VAI TRÒ CHÍNH</th>
                <th className="py-3 px-3.5">CƠ SỞ PHỤ TRÁCH</th>
                <th className="py-3 px-3.5">QUYỀN HẠN PHÂN HỆ</th>
                <th className="py-3 px-3.5">TRẠNG THÁI</th>
                <th className="py-3 px-4 text-right">THAO TÁC QUẢN TRỊ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    Không tìm thấy tài khoản người dùng nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const isSelf =
                    currentUser &&
                    (u.id === currentUser.id || u.username === currentUser.username);
                  const isProtectedRoot = u.is_root || u.username === 'overadmin';
                  const roleLabel = getRoleLabelVN(u.role, u);
                  const campusLabel = getCampusLabelVN(u.campus_id);
                  const permSummary = getPermissionSummaryText(u);

                  return (
                    <tr
                      key={u.id}
                      className={`transition-colors ${
                        u.status === 'locked'
                          ? 'bg-red-950/10 hover:bg-red-950/20'
                          : 'hover:bg-slate-900/70'
                      }`}
                    >
                      {/* TÀI KHOẢN & HỌ TÊN */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 border ${
                              u.status === 'locked'
                                ? 'bg-red-500/15 text-red-300 border-red-500/30'
                                : u.role === 'super_admin'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-slate-800 text-slate-200 border-slate-700'
                            }`}
                          >
                            {(u.full_name || u.username).slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-amber-400">
                                {u.username}
                              </span>
                              <span className="text-slate-600">/</span>
                              <span className="font-bold text-white">{u.full_name}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold">
                                  Bạn
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3 text-slate-500" />
                                {u.email}
                              </span>
                              {u.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-500" />
                                  {u.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* VAI TRÒ CHÍNH */}
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                            u.role === 'super_admin'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : u.role === 'academic_accountant' || u.role === 'accountant'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : u.role === 'admissions' || u.role === 'academic_admissions'
                              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                              : u.role === 'teacher'
                              ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                              : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          <span>{roleLabel}</span>
                        </span>
                      </td>

                      {/* CƠ SỞ PHỤ TRÁCH */}
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border ${
                            u.campus_id === 'all'
                              ? 'bg-slate-800/90 text-amber-300 border-amber-500/30'
                              : 'bg-slate-900 text-slate-300 border-slate-700'
                          }`}
                        >
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{campusLabel}</span>
                        </span>
                      </td>

                      {/* QUYỀN HẠN PHÂN HỆ */}
                      <td className="py-3 px-3.5">
                        <div className="max-w-xs">
                          <span
                            className={`text-xs font-semibold ${
                              permSummary.includes('Toàn Quyền')
                                ? 'text-amber-300 font-bold'
                                : 'text-slate-300'
                            }`}
                          >
                            {permSummary}
                          </span>
                          {u.last_login && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              <span>
                                Đăng nhập cuối:{' '}
                                {u.last_login.includes('T')
                                  ? new Date(u.last_login).toLocaleString('vi-VN')
                                  : u.last_login}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* TRẠNG THÁI */}
                      <td className="py-3 px-3.5">
                        {u.status === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                            <span>● Đang hoạt động</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] font-bold">
                            <span>🔒 Đang bị khóa</span>
                          </span>
                        )}
                      </td>

                      {/* THAO TÁC QUẢN TRỊ */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                          {/* [Phân quyền] */}
                          <button
                            type="button"
                            onClick={() => handleOpenPermissionModal(u)}
                            disabled={!isSuperAdminOrAllowed}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center gap-1 transition-all disabled:opacity-40"
                            title="Cấu hình ma trận quyền hạn RBAC"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Phân quyền</span>
                          </button>

                          {/* [Sửa] */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditUser(u)}
                            disabled={!isSuperAdminOrAllowed}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[11px] flex items-center gap-1 transition-all disabled:opacity-40"
                            title="Chỉnh sửa thông tin người dùng"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Sửa</span>
                          </button>

                          {/* [Khóa] / [Mở khóa] */}
                          <button
                            type="button"
                            onClick={() => handleToggleLockUser(u)}
                            disabled={!isSuperAdminOrAllowed || isProtectedRoot || !!isSelf}
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1 border transition-all disabled:opacity-40 ${
                              u.status === 'locked'
                                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                                : 'bg-amber-500/10 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border-slate-700 hover:border-red-500/30'
                            }`}
                            title={
                              isSelf
                                ? 'Không thể tự khóa tài khoản đang đăng nhập'
                                : u.status === 'locked'
                                ? 'Mở khóa tài khoản để cho phép đăng nhập lại'
                                : 'Khóa tạm thời tài khoản, chặn đăng nhập tức thì'
                            }
                          >
                            {u.status === 'locked' ? (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>Mở khóa</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>Khóa</span>
                              </>
                            )}
                          </button>

                          {/* [Xóa] */}
                          <button
                            type="button"
                            onClick={() => setDeletingUser(u)}
                            disabled={!isSuperAdminOrAllowed || isProtectedRoot || !!isSelf}
                            className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/25 font-bold text-[11px] flex items-center gap-1 transition-all disabled:opacity-40"
                            title={
                              isSelf
                                ? 'Không thể tự xóa tài khoản đang đăng nhập'
                                : 'Xóa tài khoản người dùng'
                            }
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Xóa</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          MODAL 1: THÊM / CHỈNH SỬA NGƯỜI DÙNG (EditUserModal)
         ===================================================================== */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl rounded-3xl bg-[#0B0F19] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-[#111A2E] to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  {editingUser ? <Edit3 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white">
                    {editingUser
                      ? `Chỉnh Sửa Tài Khoản: @${editingUser.username}`
                      : 'Thêm Tài Khoản Người Dùng Mới'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Thiết lập thông tin đăng nhập, cơ sở phụ trách và vai trò phân quyền mặc định
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddUserOpen(false);
                  setEditingUser(null);
                }}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveUser} className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Khối 1: Thông tin đăng nhập */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3.5">
                <div className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>1. Thông Tin Đăng Nhập</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Tên đăng nhập (Username) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formUsername}
                      onChange={e => setFormUsername(e.target.value)}
                      placeholder="VD: cuc.ltk, tuan.lq..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      {editingUser ? 'Đặt lại mật khẩu mới' : 'Mật khẩu khởi tạo *'}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        required
                        value={formPassword}
                        onChange={e => setFormPassword(e.target.value)}
                        placeholder="Mật khẩu đăng nhập"
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateRandomPassword}
                        className="px-3 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px] shrink-0 flex items-center gap-1 transition-all"
                        title="Sinh mật khẩu ngẫu nhiên an toàn"
                      >
                        <Dices className="w-3.5 h-3.5" />
                        <span>🎲 Sinh mật khẩu</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Khối 2: Thông tin cá nhân */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3.5">
                <div className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>2. Thông Tin Cá Nhân &amp; Liên Hệ</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="sm:col-span-1">
                    <label className="block font-bold text-slate-300 mb-1">Họ và tên *</label>
                    <input
                      type="text"
                      required
                      value={formFullName}
                      onChange={e => setFormFullName(e.target.value)}
                      placeholder="VD: Cô Lê Thị Kim Cúc"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Email công vụ (@royal.edu.vn) *
                    </label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      placeholder="cuc.ltk@royal.edu.vn"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Số điện thoại</label>
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                      placeholder="0903 111 222"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Khối 3: Phạm vi & Vai trò */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3.5">
                <div className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>3. Phạm Vi Cơ Sở &amp; Vai Trò Hệ Thống (RBAC)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Cơ sở phụ trách *
                    </label>
                    <select
                      value={formCampusId}
                      onChange={e => setFormCampusId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold focus:outline-none focus:border-amber-500"
                    >
                      <option value="all">Toàn trường (All)</option>
                      <option value="pmh">Cơ sở Phú Mỹ Hưng (PMH)</option>
                      <option value="pl">Cơ sở Phú Lâm (PL)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Vai trò mẫu (Role Template) *
                    </label>
                    <select
                      value={formRole}
                      onChange={e => handleRoleChangeInForm(e.target.value as UserRole)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                    >
                      <option value="super_admin">Quản trị viên cấp cao (Toàn quyền)</option>
                      <option value="campus_manager">Quản lý cơ sở (PMH / Phú Lâm)</option>
                      <option value="academic_accountant">Học vụ kiêm Kế toán</option>
                      <option value="academic">Giáo vụ / Học vụ (Lớp học &amp; Điểm danh)</option>
                      <option value="admissions">Tuyển sinh (Tiếp nhận đơn &amp; Xếp lớp)</option>
                      <option value="accountant">Kế toán (Học phí, Bảo lưu &amp; Thù lao GV)</option>
                      <option value="teacher">Giáo viên (Chỉ xem lịch dạy &amp; Điểm danh)</option>
                    </select>
                  </div>
                </div>

                {/* Liên kết hồ sơ Giáo viên nếu vai trò là Giáo viên */}
                {formRole === 'teacher' && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <label className="block font-bold text-purple-300 mb-1">
                      Liên kết hồ sơ Giáo viên giảng dạy (Chỉ nhìn thấy lớp học của chính mình):
                    </label>
                    <select
                      value={formLinkedTeacherId}
                      onChange={e => {
                        const tid = e.target.value;
                        setFormLinkedTeacherId(tid);
                        const foundTeacher = store.teachers.find(t => t.id === tid);
                        if (foundTeacher) {
                          if (!formFullName) setFormFullName(foundTeacher.name);
                          if (!formPhone || formPhone === '090') setFormPhone(foundTeacher.phone);
                          setFormCampusId(foundTeacher.campus_id === 'camp_pl' ? 'pl' : 'pmh');
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-purple-500/40 text-purple-200 font-semibold focus:outline-none focus:border-purple-400"
                    >
                      <option value="">-- Chọn hồ sơ Giáo viên liên kết --</option>
                      {store.teachers.map(tc => (
                        <option key={tc.id} value={tc.id}>
                          {tc.code} - {tc.name} (
                          {tc.type === 'visiting' ? 'Thỉnh giảng' : 'Cơ hữu'} •{' '}
                          {tc.campus_id === 'camp_pl' ? 'Phú Lâm' : 'PMH'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Trạng thái tài khoản Toggle */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-200 block">Trạng thái tài khoản</span>
                    <span className="text-[11px] text-slate-400">
                      Khi chuyển sang Khóa, người dùng sẽ bị chặn đăng nhập ngay lập tức
                    </span>
                  </div>

                  <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setFormStatus('active')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        formStatus === 'active'
                          ? 'bg-emerald-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      ● Đang hoạt động (Active)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormStatus('locked')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        formStatus === 'locked'
                          ? 'bg-red-500 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🔒 Khóa tài khoản (Locked)
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddUserOpen(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold shadow-lg shadow-amber-500/20"
                >
                  {editingUser ? 'Lưu Cập Nhật Tài Khoản' : 'Tạo Tài Khoản Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: CẤU HÌNH MA TRẬN QUYỀN HẠN (RolePermissionModal)
         ===================================================================== */}
      {permissionModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl rounded-3xl bg-[#0B0F19] border border-amber-500/35 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-[#131C31] to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white">
                    Cấu Hình Ma Trận Quyền Hạn (RBAC)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Tài khoản:{' '}
                    <strong className="text-amber-400 font-mono">
                      @{permissionModalUser.username}
                    </strong>{' '}
                    — <strong className="text-white">{permissionModalUser.full_name}</strong> (
                    {getRoleLabelVN(permissionModalUser.role, permissionModalUser)})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPermissionModalUser(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body: 4 Permission Groups */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                <span className="text-slate-300 font-semibold">
                  Áp dụng nhanh bộ quyền chuẩn theo vai trò:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setMatrixPerms(getDefaultPermissionsForRole('super_admin'))}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px]"
                  >
                    Toàn quyền (*)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMatrixPerms(getDefaultPermissionsForRole('academic_accountant'))
                    }
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-bold text-[11px]"
                  >
                    Học vụ &amp; Kế toán
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixPerms(getDefaultPermissionsForRole('admissions'))}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-[11px]"
                  >
                    Tuyển sinh
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixPerms(getDefaultPermissionsForRole('teacher'))}
                    className="px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 font-bold text-[11px]"
                  >
                    Giáo viên
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Nhóm Đào Tạo */}
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5">
                  <div className="font-extrabold text-amber-400 uppercase tracking-wider text-[11px]">
                    1. Nhóm Đào Tạo
                  </div>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        matrixPerms.can_view_classes ?? matrixPerms.can_manage_classes ?? true
                      }
                      onChange={e =>
                        setMatrixPerms(prev => ({ ...prev, can_view_classes: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">Xem lớp học</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matrixPerms.can_manage_classes}
                      onChange={e =>
                        setMatrixPerms(prev => ({
                          ...prev,
                          can_manage_classes: e.target.checked,
                          can_view_classes: e.target.checked ? true : prev.can_view_classes,
                        }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">Tạo &amp; Sửa lớp học</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matrixPerms.can_take_attendance}
                      onChange={e =>
                        setMatrixPerms(prev => ({
                          ...prev,
                          can_take_attendance: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">
                      Điểm danh học sinh &amp; tải minh chứng
                    </span>
                  </label>
                </div>

                {/* 2. Nhóm Tuyển Sinh */}
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5">
                  <div className="font-extrabold text-cyan-400 uppercase tracking-wider text-[11px]">
                    2. Nhóm Tuyển Sinh
                  </div>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        matrixPerms.can_view_registrations ?? matrixPerms.can_manage_enrollment
                      }
                      onChange={e =>
                        setMatrixPerms(prev => ({
                          ...prev,
                          can_view_registrations: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">Xem danh sách đăng ký</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matrixPerms.can_manage_enrollment}
                      onChange={e =>
                        setMatrixPerms(prev => ({
                          ...prev,
                          can_manage_enrollment: e.target.checked,
                          can_view_registrations: e.target.checked
                            ? true
                            : prev.can_view_registrations,
                        }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">
                      Xếp lớp học sinh (1-Click &amp; Thủ công)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matrixPerms.can_manage_trial ?? matrixPerms.can_manage_enrollment}
                      onChange={e =>
                        setMatrixPerms(prev => ({ ...prev, can_manage_trial: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">Học thử 1 buổi</span>
                  </label>
                </div>

                {/* 3. Nhóm Tài Chính */}
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5">
                  <div className="font-extrabold text-emerald-400 uppercase tracking-wider text-[11px]">
                    3. Nhóm Tài Chính
                  </div>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matrixPerms.can_manage_finance}
                      onChange={e =>
                        setMatrixPerms(prev => ({
                          ...prev,
                          can_manage_finance: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">
                      Tạo &amp; Thu học phí VietQR
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matrixPerms.can_manage_credits}
                      onChange={e =>
                        setMatrixPerms(prev => ({
                          ...prev,
                          can_manage_credits: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">
                      Lập &amp; Cấn trừ bảo lưu
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matrixPerms.can_settle_payroll}
                      onChange={e =>
                        setMatrixPerms(prev => ({
                          ...prev,
                          can_settle_payroll: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">
                      Quyết toán thù lao giáo viên
                    </span>
                  </label>
                </div>

                {/* 4. Nhóm Quản Trị Hệ Thống */}
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2.5">
                  <div className="font-extrabold text-rose-400 uppercase tracking-wider text-[11px]">
                    4. Nhóm Quản Trị Hệ Thống
                  </div>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matrixPerms.can_config_system}
                      onChange={e =>
                        setMatrixPerms(prev => ({
                          ...prev,
                          can_config_system: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">
                      Cấu hình biểu phí môn học
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        matrixPerms.can_config_payroll_rates ?? matrixPerms.can_config_system
                      }
                      onChange={e =>
                        setMatrixPerms(prev => ({
                          ...prev,
                          can_config_payroll_rates: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">
                      Cài đặt mức thù lao cơ hữu/thỉnh giảng
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matrixPerms.can_manage_users}
                      onChange={e =>
                        setMatrixPerms(prev => ({
                          ...prev,
                          can_manage_users: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-slate-200 font-medium">
                      Quản lý tài khoản người dùng
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPermissionModalUser(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissionMatrix}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold shadow-lg shadow-amber-500/20"
                >
                  Lưu Ma Trận Quyền Hạn
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: HỘP THOẠI XÁC NHẬN XÓA TÀI KHOẢN (DeleteConfirmationModal)
         ===================================================================== */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-[#0B0F19] border border-red-500/40 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-red-400">
                  ⚠️ Xác nhận xóa người dùng
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Hành động này không thể hoàn tác. Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản{' '}
                  <strong className="text-white">
                    {deletingUser.full_name} (@{deletingUser.username})
                  </strong>
                  ?
                </p>
              </div>
            </div>

            {(() => {
              const activity = getUserHistoricalActivity(deletingUser);
              if (!activity.hasHistory) return null;
              return (
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-xs text-amber-200 space-y-2">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Khuyến nghị bảo toàn vết kiểm toán (Audit Log):</span>
                  </div>
                  <p className="leading-relaxed">
                    Tài khoản này đã có lịch sử điểm danh, chấm công giảng dạy hoặc nhật ký tác
                    nghiệp trên hệ thống. Khuyến nghị chuyển sang chế độ{' '}
                    <strong>Khóa tài khoản (Locked)</strong> thay vì xóa để bảo toàn dữ liệu đối
                    soát.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const target = deletingUser;
                      setDeletingUser(null);
                      if (target.status !== 'locked') {
                        handleToggleLockUser(target);
                      }
                    }}
                    className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Chuyển sang Khóa tài khoản (@{deletingUser.username})</span>
                  </button>
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/25"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa Vĩnh Viễn</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: SQL SUPABASE DDL (`app_users` Table Schema)
         ===================================================================== */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl rounded-3xl bg-[#0B0F19] border border-cyan-500/35 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    Cấu Trúc Bảng Supabase: `app_users` (PostgreSQL DDL)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Chạy kịch bản SQL này trong Supabase SQL Editor để đồng bộ đám mây
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs overflow-x-auto leading-relaxed">
                {APP_USERS_SQL_DDL}
              </pre>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Hỗ trợ đăng nhập qua cả Username &amp; Email công vụ + kiểm tra trạng thái Khóa
                  tức thì.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5"
                  >
                    {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedSql ? 'Đã Sao Chép SQL' : 'Sao Chép SQL'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
