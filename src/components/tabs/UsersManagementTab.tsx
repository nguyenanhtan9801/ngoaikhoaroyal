import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Search, 
  Lock, 
  Unlock, 
  Edit3, 
  Trash2, 
  Eye, 
  EyeOff, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  School, 
  Phone, 
  Mail, 
  Briefcase, 
  Building2, 
  X, 
  Check, 
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { AppStore } from '../../lib/storage';
import { AppUser, UserRole } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface UsersManagementTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser: AppUser | null;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

export const UsersManagementTab: React.FC<UsersManagementTabProps> = ({
  store,
  currentRole,
  currentUser,
  onUpdateStore,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [campusFilter, setCampusFilter] = useState<string>('all');

  // Password visibility map { [userId]: boolean }
  const [visiblePasswords, setVisiblePasswords] = useState<{ [key: string]: boolean }>({});

  // Modals
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [passwordChangeUser, setPasswordChangeUser] = useState<AppUser | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  // Add / Edit User Form State
  const initialFormState: {
    username: string;
    password: string;
    full_name: string;
    phone: string;
    email: string;
    role: UserRole;
    department: string;
    campus_id: string;
    teacher_id: string;
    status: 'active' | 'locked';
  } = {
    username: '',
    password: '',
    full_name: '',
    phone: '',
    email: '',
    role: 'admissions',
    department: 'Phòng Tuyển Sinh',
    campus_id: 'all',
    teacher_id: '',
    status: 'active',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [showFormPassword, setShowFormPassword] = useState(false);

  const handleOpenAddModal = () => {
    setFormData(initialFormState);
    setFormError(null);
    setShowFormPassword(false);
    setIsAddUserModalOpen(true);
  };

  const handleOpenEditModal = (user: AppUser) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: user.password,
      full_name: user.full_name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      department: user.department,
      campus_id: user.campus_id || 'all',
      teacher_id: user.teacher_id || '',
      status: user.status,
    });
    setFormError(null);
    setShowFormPassword(false);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUsername = formData.username.trim().toLowerCase().replace(/\s+/g, '');
    if (!cleanUsername) {
      setFormError('Vui lòng nhập tên đăng nhập (Username)');
      return;
    }

    if (!formData.full_name.trim()) {
      setFormError('Vui lòng nhập họ và tên nhân sự');
      return;
    }

    if (!editingUser) {
      // Check duplicate username
      const exists = store.users.some(u => u.username.toLowerCase() === cleanUsername);
      if (exists) {
        setFormError('Tên đăng nhập này đã tồn tại, vui lòng chọn tên khác!');
        return;
      }
      if (!formData.password || formData.password.length < 6) {
        setFormError('Mật khẩu phải từ 6 ký tự trở lên');
        return;
      }

      const newUser: AppUser = {
        id: `user_${Date.now()}`,
        username: cleanUsername,
        password: formData.password,
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        role: formData.role,
        department: formData.department.trim(),
        campus_id: formData.campus_id,
        teacher_id: formData.role === 'teacher' ? formData.teacher_id || undefined : undefined,
        status: formData.status,
        created_at: new Date().toISOString().split('T')[0],
      };

      onUpdateStore(prev => ({
        ...prev,
        users: [...prev.users, newUser],
      }));

      showToast(`Đã thêm nhân sự ${newUser.full_name} (${newUser.username}) thành công!`);
      setIsAddUserModalOpen(false);
    } else {
      // Editing existing user
      const isDuplicate = store.users.some(
        u => u.id !== editingUser.id && u.username.toLowerCase() === cleanUsername
      );
      if (isDuplicate) {
        setFormError('Tên đăng nhập này đã được sử dụng bởi người dùng khác!');
        return;
      }

      onUpdateStore(prev => ({
        ...prev,
        users: prev.users.map(u => 
          u.id === editingUser.id 
            ? {
                ...u,
                username: cleanUsername,
                password: formData.password || u.password,
                full_name: formData.full_name.trim(),
                phone: formData.phone.trim(),
                email: formData.email.trim(),
                role: formData.role,
                department: formData.department.trim(),
                campus_id: formData.campus_id,
                teacher_id: formData.role === 'teacher' ? formData.teacher_id || undefined : undefined,
                status: formData.status,
              }
            : u
        ),
      }));

      showToast(`Đã cập nhật thông tin nhân sự ${formData.full_name}!`);
      setEditingUser(null);
    }
  };

  // Toggle lock/unlock status
  const handleToggleLockStatus = (user: AppUser) => {
    if (user.username === 'admin') {
      alert('Không thể khóa tài khoản Super Admin quản trị cao nhất!');
      return;
    }

    const nextStatus = user.status === 'active' ? 'locked' : 'active';
    onUpdateStore(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === user.id ? { ...u, status: nextStatus } : u)
    }));

    showToast(
      nextStatus === 'locked' 
        ? `Đã khóa tài khoản ${user.username}. Người dùng không thể đăng nhập.`
        : `Đã mở khóa tài khoản ${user.username}.`
    );
  };

  // Delete user
  const handleDeleteUser = (user: AppUser) => {
    if (user.username === 'admin') {
      alert('Không thể xóa tài khoản Super Admin mặc định của trường!');
      return;
    }

    if (currentUser && currentUser.id === user.id) {
      alert('Bạn không thể xóa chính tài khoản đang đăng nhập của mình!');
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${user.full_name}" (${user.username})?`)) {
      return;
    }

    onUpdateStore(prev => ({
      ...prev,
      users: prev.users.filter(u => u.id !== user.id)
    }));

    showToast(`Đã xóa tài khoản ${user.username}!`);
  };

  // Change password modal save
  const handleSavePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordChangeUser) return;

    if (!newPasswordInput || newPasswordInput.length < 6) {
      alert('Mật khẩu mới phải từ 6 ký tự trở lên');
      return;
    }

    onUpdateStore(prev => ({
      ...prev,
      users: prev.users.map(u => 
        u.id === passwordChangeUser.id 
          ? { ...u, password: newPasswordInput } 
          : u
      )
    }));

    showToast(`Đã đổi mật khẩu cho tài khoản ${passwordChangeUser.username} thành công!`);
    setPasswordChangeUser(null);
    setNewPasswordInput('');
  };

  // Filtered Users List
  const filteredUsers = store.users.filter(user => {
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;
    if (statusFilter !== 'all' && user.status !== statusFilter) return false;
    if (campusFilter !== 'all' && user.campus_id !== 'all' && user.campus_id !== campusFilter) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchUser = user.username.toLowerCase().includes(q);
      const matchName = user.full_name.toLowerCase().includes(q);
      const matchPhone = user.phone.includes(q);
      const matchEmail = user.email.toLowerCase().includes(q);
      const matchDept = user.department.toLowerCase().includes(q);
      return matchUser || matchName || matchPhone || matchEmail || matchDept;
    }

    return true;
  });

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">Super Admin</span>;
      case 'academic_accountant':
        return <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">Kế Toán Học Vụ</span>;
      case 'academic_admissions':
        return <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold">Giáo Vụ & Tuyển Sinh</span>;
      case 'admissions':
        return <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">Tuyển Sinh</span>;
      case 'teacher':
        return <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">Giáo Viên</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">Nhân viên</span>;
    }
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

      {/* HEADER & ACTION BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
              QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold">
              Master Security & Roles
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quản trị danh sách nhân sự, phân quyền vai trò (Super Admin, Kế toán, Tuyển sinh, Giáo vụ, Giáo viên) và thông tin đăng nhập.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all transform active:scale-95"
          >
            <UserPlus className="w-4 h-4 text-slate-950" />
            <span>+ Thêm Nhân Sự Mới</span>
          </button>
        </div>
      </div>

      {/* KPI METRICS OVERVIEW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tổng Nhân Sự</div>
          <div className="text-2xl font-black text-white mt-1">{store.users.length}</div>
          <p className="text-[10px] text-slate-500 mt-0.5">Tài khoản hệ thống</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Super Admin</div>
          <div className="text-2xl font-black text-amber-300 mt-1">
            {store.users.filter(u => u.role === 'super_admin').length}
          </div>
          <p className="text-[10px] text-amber-400/80 mt-0.5">Ban giám hiệu</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Kế Toán & Học Vụ</div>
          <div className="text-2xl font-black text-emerald-300 mt-1">
            {store.users.filter(u => u.role === 'academic_accountant' || u.role === 'academic_admissions').length}
          </div>
          <p className="text-[10px] text-emerald-400/80 mt-0.5">Vận hành tài chính</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
          <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Tuyển Sinh</div>
          <div className="text-2xl font-black text-cyan-300 mt-1">
            {store.users.filter(u => u.role === 'admissions').length}
          </div>
          <p className="text-[10px] text-cyan-400/80 mt-0.5">Chăm sóc phụ huynh</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30">
          <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Giáo Viên</div>
          <div className="text-2xl font-black text-purple-300 mt-1">
            {store.users.filter(u => u.role === 'teacher').length}
          </div>
          <p className="text-[10px] text-purple-400/80 mt-0.5">Giảng dạy ngoại khóa</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Hoạt Động / Khóa</div>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {store.users.filter(u => u.status === 'active').length}
            <span className="text-xs text-rose-400 font-normal ml-1">
              ({store.users.filter(u => u.status === 'locked').length} khóa)
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Trạng thái đăng nhập</p>
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
              placeholder="Tìm theo username, họ tên nhân sự, SĐT, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-xs"
            />
          </div>

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-medium focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tất cả vai trò</option>
            <option value="super_admin">Super Admin (Quản trị viên)</option>
            <option value="academic_accountant">Kế toán học vụ</option>
            <option value="academic_admissions">Giáo vụ & Tuyển sinh</option>
            <option value="admissions">Tuyển sinh</option>
            <option value="teacher">Giáo viên</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-medium focus:outline-none focus:border-amber-500"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động (Active)</option>
            <option value="locked">Đã bị khóa (Locked)</option>
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
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        </div>

      </div>

      {/* RESULTS LIST / DISPLAY */}
      {filteredUsers.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 text-slate-400 space-y-3">
          <Users className="w-10 h-10 mx-auto text-slate-600" />
          <p className="text-sm font-semibold">Không tìm thấy tài khoản nhân sự nào phù hợp bộ lọc.</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map(user => {
            const isPasswordVisible = visiblePasswords[user.id];
            const campusName = user.campus_id === 'all' 
              ? 'Toàn hệ thống' 
              : store.campuses.find(c => c.id === user.campus_id)?.name || 'Cơ sở chính';
            const teacherEntity = user.teacher_id ? store.teachers.find(t => t.id === user.teacher_id) : null;

            return (
              <div
                key={user.id}
                className="rounded-3xl p-5 bg-gradient-to-b from-[#111827] to-[#0D131F] border border-slate-800/80 hover:border-amber-500/40 transition-all flex flex-col justify-between shadow-xl shadow-black/30 space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-slate-800 text-amber-400 font-black text-sm flex items-center justify-center shrink-0 border border-slate-700">
                        {user.full_name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-white text-sm">{user.full_name}</h4>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                          <span className="text-amber-400 font-bold">@{user.username}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {getRoleBadge(user.role)}
                      {user.status === 'active' ? (
                        <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          <span>Hoạt động</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-rose-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                          <span>Đã khóa</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                        <span>Phòng ban:</span>
                      </span>
                      <span className="text-white font-medium truncate max-w-[170px]">{user.department}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Cơ sở:</span>
                      </span>
                      <span className="text-slate-200">{campusName}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>Số điện thoại:</span>
                      </span>
                      <span className="font-mono text-amber-300 font-bold">{user.phone}</span>
                    </div>

                    {user.email && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-600" />
                          <span>Email:</span>
                        </span>
                        <span className="text-slate-300 truncate max-w-[170px]">{user.email}</span>
                      </div>
                    )}

                    {teacherEntity && (
                      <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800">
                        <span className="text-purple-400 font-medium">Giáo viên:</span>
                        <span className="text-white font-semibold">{teacherEntity.name}</span>
                      </div>
                    )}

                    {/* Masked Password */}
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80 text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-500" />
                        <span>Mật khẩu:</span>
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-slate-300 font-bold">
                          {isPasswordVisible ? user.password : '••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(user.id)}
                          className="p-1 rounded text-slate-400 hover:text-white transition-colors"
                          title={isPasswordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        >
                          {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEditModal(user)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1 text-xs transition-colors"
                      title="Chỉnh sửa thông tin"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Sửa</span>
                    </button>

                    <button
                      onClick={() => {
                        setPasswordChangeUser(user);
                        setNewPasswordInput('');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 flex items-center gap-1 text-xs transition-colors"
                      title="Đổi mật khẩu tài khoản"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Đổi Pass</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleLockStatus(user)}
                      className={`p-1.5 rounded-xl border transition-colors ${
                        user.status === 'active' 
                          ? 'bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border-slate-700'
                          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      }`}
                      title={user.status === 'active' ? 'Khóa tài khoản này' : 'Mở khóa tài khoản'}
                    >
                      {user.status === 'active' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>

                    {user.username !== 'admin' && (
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors"
                        title="Xóa tài khoản"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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
                  <th className="py-3 px-4">Tên Đăng Nhập</th>
                  <th className="py-3 px-4">Họ Tên Nhân Sự</th>
                  <th className="py-3 px-4">Phòng Ban / Vị Trí</th>
                  <th className="py-3 px-4">Vai Trò Phân Quyền</th>
                  <th className="py-3 px-4">Cơ Sở</th>
                  <th className="py-3 px-4">Số Điện Thoại & Email</th>
                  <th className="py-3 px-4">Mật Khẩu</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredUsers.map(user => {
                  const isPasswordVisible = visiblePasswords[user.id];
                  const campusName = user.campus_id === 'all' 
                    ? 'Toàn hệ thống' 
                    : store.campuses.find(c => c.id === user.campus_id)?.name || 'Cơ sở chính';

                  return (
                    <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                          {user.username}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-bold text-white">
                        {user.full_name}
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        {user.department}
                      </td>

                      <td className="py-3 px-4">
                        {getRoleBadge(user.role)}
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        {campusName}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-mono text-amber-300 font-bold">{user.phone}</div>
                        {user.email && <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{user.email}</div>}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-slate-300 font-bold">
                            {isPasswordVisible ? user.password : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(user.id)}
                            className="p-1 rounded text-slate-400 hover:text-white transition-colors"
                            title={isPasswordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                          >
                            {isPasswordVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {user.status === 'active' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            Hoạt động
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                            Đã khóa
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(user)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                            title="Chỉnh sửa thông tin"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setPasswordChangeUser(user);
                              setNewPasswordInput('');
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs"
                            title="Đổi mật khẩu"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleLockStatus(user)}
                            className={`p-1.5 rounded-lg text-xs ${
                              user.status === 'active'
                                ? 'bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                            title={user.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                          >
                            {user.status === 'active' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>

                          {user.username !== 'admin' && (
                            <button
                              onClick={() => handleDeleteUser(user)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 text-xs"
                              title="Xóa tài khoản"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
      {/* MODAL: THÊM / CHỈNH SỬA TÀI KHOẢN NHÂN SỰ                 */}
      {/* ======================================================== */}
      {(isAddUserModalOpen || editingUser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-5">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {editingUser ? 'Chỉnh Sửa Nhân Sự' : 'Thêm Nhân Sự / Tài Khoản Mới'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Phân quyền vai trò và tạo thông tin đăng nhập hệ thống
                  </p>
                </div>
              </div>

              <button
                onClick={() => { setIsAddUserModalOpen(false); setEditingUser(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Họ và tên nhân sự <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Nguyễn Văn Hưng"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Số điện thoại liên hệ <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Ví dụ: 0909 888 777"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Email nhân sự:
                  </label>
                  <input
                    type="email"
                    placeholder="nhansu@royalschool.edu.vn"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Phòng ban / Vị trí:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Phòng Tuyển Sinh / Tổ Thể Dục"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Vai trò hệ thống <span className="text-rose-400">*</span>:
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                  >
                    <option value="super_admin">Super Admin (Quản trị viên cấp cao)</option>
                    <option value="academic_accountant">Kế Toán Học Vụ</option>
                    <option value="academic_admissions">Giáo Vụ & Tuyển Sinh</option>
                    <option value="admissions">Chuyên Viên Tuyển Sinh</option>
                    <option value="teacher">Giáo Viên Giảng Dạy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Cơ sở trực thuộc:
                  </label>
                  <select
                    value={formData.campus_id}
                    onChange={(e) => setFormData({ ...formData, campus_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">Toàn trường / Tất cả cơ sở</option>
                    {store.campuses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Nếu chọn vai trò Giáo viên -> Cho phép liên kết với giáo viên trong danh sách */}
              {formData.role === 'teacher' && (
                <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-1">
                  <label className="block text-purple-300 font-semibold">
                    Liên kết với hồ sơ Giáo Viên trong hệ thống:
                  </label>
                  <select
                    value={formData.teacher_id}
                    onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-purple-500/40 text-white focus:outline-none focus:border-purple-400"
                  >
                    <option value="">-- Chọn hồ sơ giáo viên tương ứng --</option>
                    {store.teachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.phone} - {t.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Thông tin tài khoản đăng nhập */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Tài Khoản Đăng Nhập Hệ Thống</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Tên đăng nhập (Username) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="tuyensinh01"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      {editingUser ? 'Mật khẩu mới (Bỏ trống nếu giữ nguyên)' : 'Mật khẩu (Password) *'}
                    </label>
                    <div className="relative">
                      <input
                        type={showFormPassword ? 'text' : 'password'}
                        required={!editingUser}
                        placeholder={editingUser ? 'Để trống nếu không đổi' : 'Tối thiểu 6 ký tự'}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full pl-3 pr-9 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowFormPassword(!showFormPassword)}
                        className="p-1 rounded text-slate-400 hover:text-white absolute right-2.5 top-1/2 -translate-y-1/2"
                      >
                        {showFormPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Trạng thái tài khoản:</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="radio"
                        name="status"
                        checked={formData.status === 'active'}
                        onChange={() => setFormData({ ...formData, status: 'active' })}
                        className="accent-amber-500"
                      />
                      <span>Đang hoạt động (Active)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-400">
                      <input
                        type="radio"
                        name="status"
                        checked={formData.status === 'locked'}
                        onChange={() => setFormData({ ...formData, status: 'locked' })}
                        className="accent-rose-500"
                      />
                      <span>Khóa tài khoản (Locked)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsAddUserModalOpen(false); setEditingUser(null); }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{editingUser ? 'Lưu Thay Đổi' : 'Tạo Tài Khoản'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ĐỔI MẬT KHẨU NHANH CHO USER                        */}
      {/* ======================================================== */}
      {passwordChangeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Đổi Mật Khẩu Tài Khoản</h3>
              </div>
              <button
                onClick={() => setPasswordChangeUser(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Tài khoản:</span>
                <span className="font-mono text-amber-400 font-bold">{passwordChangeUser.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Họ và tên:</span>
                <span className="text-white font-bold">{passwordChangeUser.full_name}</span>
              </div>
            </div>

            <form onSubmit={handleSavePasswordChange} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Mật khẩu mới (Tối thiểu 6 ký tự):
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Nhập mật khẩu mới..."
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setPasswordChangeUser(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  Xác Nhận Đổi
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
