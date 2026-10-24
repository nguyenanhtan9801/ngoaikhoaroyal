import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  KeyRound,
  Lock,
  Unlock,
  Building2,
  Phone,
  Mail,
  CheckCircle2,
  Trash2,
  Edit3,
  X,
  RefreshCw,
} from 'lucide-react';
import { AppStore, AppUser, UserRole } from '../../types';
import { getRoleLabelVN, syncAppUserToSupabase } from '../../lib/storage';
import { formatCapitalizedName } from '../../lib/formatters';
import { showToast } from '../../lib/toast';

interface UserManagementTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser: AppUser | null;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

export const UserManagementTab: React.FC<UserManagementTabProps> = ({
  store,
  currentUser,
  onUpdateStore,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal create/edit user
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const [formFullName, setFormFullName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('teacher');
  const [formDepartment, setFormDepartment] = useState('Tổ Bộ Môn Ngoại Khóa');
  const [formCampusId, setFormCampusId] = useState('all');

  const filteredUsers = useMemo(() => {
    return (store.users || []).filter((u) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = u.full_name?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
        const matchUser = u.username?.toLowerCase().includes(q);
        const matchEmail = u.email?.toLowerCase().includes(q);
        const matchPhone = u.phone?.includes(q);
        if (!matchName && !matchUser && !matchEmail && !matchPhone) return false;
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (campusFilter !== 'all') {
        const userCamp = u.campus_id === 'camp_pmh' ? 'pmh' : u.campus_id === 'camp_pl' ? 'pl' : u.campus_id;
        if (userCamp !== campusFilter && userCamp !== 'all') return false;
      }
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      return true;
    });
  }, [store.users, searchQuery, roleFilter, campusFilter, statusFilter]);

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormFullName('');
    setFormUsername('');
    setFormPassword('123456');
    setFormEmail('');
    setFormPhone('');
    setFormRole('teacher');
    setFormDepartment('Tổ Bộ Môn Ngoại Khóa');
    setFormCampusId('all');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (user: AppUser) => {
    setEditingUser(user);
    setFormFullName(user.full_name || user.name || '');
    setFormUsername(user.username);
    setFormPassword(user.password || '');
    setFormEmail(user.email || '');
    setFormPhone(user.phone || '');
    setFormRole(user.role);
    setFormDepartment(user.department || '');
    setFormCampusId(user.campus_id || 'all');
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsername.trim() || !formFullName.trim()) {
      showToast('Vui lòng nhập đầy đủ Tên đăng nhập và Họ tên người dùng!', 'warning');
      return;
    }

    const cleanUsername = formUsername.trim().toLowerCase();
    const formattedName = formatCapitalizedName(formFullName);

    if (editingUser) {
      // Cập nhật người dùng
      const updated: AppUser = {
        ...editingUser,
        full_name: formattedName,
        name: formattedName,
        username: cleanUsername,
        password: formPassword || editingUser.password,
        password_hash: formPassword || editingUser.password,
        email: formEmail.trim().toLowerCase(),
        phone: formPhone.trim(),
        role: formRole,
        department: formDepartment.trim() || getRoleLabelVN(formRole),
        campus_id: formCampusId,
      };

      onUpdateStore((prev) => ({
        ...prev,
        users: (prev.users || []).map((u) => (u.id === editingUser.id ? updated : u)),
      }));

      await syncAppUserToSupabase(updated, 'upsert');
      showToast(`Đã cập nhật thông tin tài khoản: ${updated.full_name}!`, 'success');
    } else {
      // Kiểm tra trùng username
      const exists = (store.users || []).some(
        (u) => u.username.toLowerCase() === cleanUsername
      );
      if (exists) {
        showToast(`Tên đăng nhập "${cleanUsername}" đã tồn tại trên hệ thống!`, 'error');
        return;
      }

      const newUser: AppUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        code: `USR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        username: cleanUsername,
        password: formPassword || '123456',
        password_hash: formPassword || '123456',
        full_name: formattedName,
        name: formattedName,
        email: formEmail.trim().toLowerCase() || `${cleanUsername}@royalschool.edu.vn`,
        phone: formPhone.trim(),
        role: formRole,
        department: formDepartment.trim() || getRoleLabelVN(formRole),
        campus_id: formCampusId,
        status: 'active',
        created_at: new Date().toISOString(),
      };

      onUpdateStore((prev) => ({
        ...prev,
        users: [newUser, ...(prev.users || [])],
      }));

      await syncAppUserToSupabase(newUser, 'upsert');
      showToast(`Đã thêm mới tài khoản thành công: ${newUser.full_name}!`, 'success');
    }

    setIsModalOpen(false);
  };

  const handleToggleLock = async (user: AppUser) => {
    if (user.is_root || user.username === 'overadmin') {
      showToast('Không thể khóa tài khoản Quản Trị Tối Cao (Root)!', 'warning');
      return;
    }
    const newStatus: 'active' | 'locked' = user.status === 'locked' ? 'active' : 'locked';
    const updated = { ...user, status: newStatus };

    onUpdateStore((prev) => ({
      ...prev,
      users: (prev.users || []).map((u) => (u.id === user.id ? updated : u)),
    }));

    await syncAppUserToSupabase(updated, 'upsert');
    showToast(
      newStatus === 'locked'
        ? `Đã khóa tài khoản "${user.username}"!`
        : `Đã mở khóa tài khoản "${user.username}"!`,
      newStatus === 'locked' ? 'warning' : 'success'
    );
  };

  const handleDeleteUser = async (user: AppUser) => {
    if (user.is_root || user.username === 'overadmin') {
      showToast('Không thể xóa tài khoản Quản Trị Tối Cao (Root)!', 'error');
      return;
    }
    if (currentUser?.id === user.id) {
      showToast('Không thể tự xóa tài khoản đang đăng nhập!', 'warning');
      return;
    }

    if (window.confirm(`Bạn có chắc chắn muốn xóa tài khoản "${user.full_name}" (${user.username})?`)) {
      onUpdateStore((prev) => ({
        ...prev,
        users: (prev.users || []).filter((u) => u.id !== user.id),
      }));

      await syncAppUserToSupabase(user, 'delete');
      showToast(`Đã xóa tài khoản "${user.username}" thành công!`, 'info');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950/40 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Quản Trị Người Dùng & Phân Quyền Hệ Thống
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-mono border border-amber-500/30">
                {filteredUsers.length} tài khoản
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Phân quyền truy cập đa cơ sở (RBAC), kiểm soát tài khoản cán bộ, giáo viên và nhân viên học vụ
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all shrink-0 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Thêm Tài Khoản Mới
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo họ tên, username, email, SĐT..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Lọc theo vai trò"
          className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
        >
          <option value="all">Tất cả vai trò</option>
          <option value="super_admin">Quản Trị Cấp Cao</option>
          <option value="campus_manager">Quản Lý Cơ Sở</option>
          <option value="academic_affairs">Giáo Vụ / Tuyển Sinh</option>
          <option value="academic_accountant">Kế Toán Học Vụ</option>
          <option value="teacher">Giáo Viên</option>
          <option value="parent">Phụ Huynh</option>
        </select>

        <select
          value={campusFilter}
          onChange={(e) => setCampusFilter(e.target.value)}
          aria-label="Lọc theo cơ sở"
          className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
        >
          <option value="all">Tất cả cơ sở</option>
          <option value="pmh">Phú Mỹ Hưng (PMH)</option>
          <option value="pl">Phú Lâm (PL)</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Lọc theo trạng thái tài khoản"
          className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="locked">Bị khóa</option>
        </select>
      </div>

      {/* Users Table / Grid */}
      <div className="overflow-hidden rounded-2xl bg-slate-900/60 border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Người Dùng</th>
                <th className="py-3 px-3">Vai Trò & Phòng Ban</th>
                <th className="py-3 px-3">Phạm Vi Cơ Sở</th>
                <th className="py-3 px-3">Liên Hệ</th>
                <th className="py-3 px-3">Trạng Thái</th>
                <th className="py-3 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 text-xs">
                    Không tìm thấy tài khoản người dùng nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isLocked = user.status === 'locked';
                  const isRoot = user.is_root || user.username === 'overadmin';

                  return (
                    <tr
                      key={user.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isLocked ? 'opacity-60 bg-rose-950/10' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                              isRoot
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {(user.full_name || user.username).substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-100 flex items-center gap-1.5">
                              {user.full_name || user.name}
                              {isRoot && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono border border-amber-500/30">
                                  ROOT
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              @{user.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-amber-300 font-semibold text-[11px] border border-slate-700">
                          {getRoleLabelVN(user.role, user)}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {user.department || 'Bộ phận chuyên môn'}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                          <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                          {user.campus_id === 'all'
                            ? 'Toàn hệ thống (PMH + PL)'
                            : user.campus_id === 'pmh' || user.campus_id === 'camp_pmh'
                            ? 'Cơ sở Phú Mỹ Hưng'
                            : 'Cơ sở Phú Lâm'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="space-y-0.5 text-[11px]">
                          {user.phone && (
                            <div className="flex items-center gap-1 text-slate-300">
                              <Phone className="w-3 h-3 text-slate-500" />
                              {user.phone}
                            </div>
                          )}
                          {user.email && (
                            <div className="flex items-center gap-1 text-slate-400">
                              <Mail className="w-3 h-3 text-slate-500" />
                              {user.email}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30">
                            <Lock className="w-3 h-3" />
                            Đã khóa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Hoạt động
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(user)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="Sửa thông tin tài khoản"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {!isRoot && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleLock(user)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isLocked
                                    ? 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 border border-rose-500/30'
                                }`}
                                title={isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                              >
                                {isLocked ? (
                                  <Unlock className="w-3.5 h-3.5" />
                                ) : (
                                  <Lock className="w-3.5 h-3.5" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteUser(user)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 transition-colors"
                                title="Xóa tài khoản"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
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

      {/* Modal Thêm / Chỉnh Sửa Người Dùng */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-amber-500/30 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">
                  {editingUser ? 'Cập Nhật Tài Khoản Người Dùng' : 'Thêm Mới Tài Khoản Hệ Thống'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Họ Và Tên Người Dùng *
                  </label>
                  <input
                    type="text"
                    required
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    onBlur={(e) => setFormFullName(formatCapitalizedName(e.target.value))}
                    placeholder="VD: ThS. Nguyễn Hoàng Long"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Tên Đăng Nhập (Username) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingUser)}
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="VD: longnh"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Mật Khẩu Đăng Nhập
                  </label>
                  <input
                    type="text"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="VD: 123456"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Vai Trò (Role RBAC)
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="super_admin">Quản Trị Cấp Cao (Super Admin)</option>
                    <option value="campus_manager">Quản Lý Cơ Sở (Campus Manager)</option>
                    <option value="academic_affairs">Giáo Vụ / Tuyển Sinh (Academic Affairs)</option>
                    <option value="academic_accountant">Kế Toán Học Vụ (Accountant)</option>
                    <option value="teacher">Giáo Viên (Teacher)</option>
                    <option value="parent">Phụ Huynh (Parent)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Phạm Vi Cơ Sở Quản Lý
                  </label>
                  <select
                    value={formCampusId}
                    onChange={(e) => setFormCampusId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">Toàn Trường (Cả PMH & Phú Lâm)</option>
                    <option value="pmh">Chỉ Cơ Sở Phú Mỹ Hưng (PMH)</option>
                    <option value="pl">Chỉ Cơ Sở Phú Lâm (PL)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Phòng Ban / Đơn Vị
                  </label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    placeholder="VD: Ban Giám Hiệu, Tổ Tiếng Anh..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Số Điện Thoại
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="VD: 0908 112 233"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Email Công Vụ
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="VD: longnh@royalschool.edu.vn"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                >
                  {editingUser ? 'Lưu Cập Nhật' : 'Tạo Tài Khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
