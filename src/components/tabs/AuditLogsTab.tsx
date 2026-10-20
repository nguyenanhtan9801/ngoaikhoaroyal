import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Activity, 
  Search, 
  Filter, 
  Download, 
  Trash2, 
  Eye, 
  Clock, 
  User, 
  Lock, 
  LogIn, 
  LogOut, 
  FileSpreadsheet, 
  AlertTriangle, 
  ChevronRight, 
  X, 
  CheckCircle2, 
  RefreshCw, 
  Layers, 
  GraduationCap, 
  Receipt, 
  Calendar, 
  ArrowRightLeft, 
  Settings, 
  Database, 
  Sparkles,
  Laptop,
  Check,
  HelpCircle
} from 'lucide-react';
import { AppStore, appendAuditLog, createAuditRecord } from '../../lib/storage';
import { UserRole, AuditLogRecord, LogActionType, AppUser } from '../../types';

interface AuditLogsTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onOpenLoginModal?: () => void;
}

export const AuditLogsTab: React.FC<AuditLogsTabProps> = ({
  store,
  currentRole,
  currentUser,
  onUpdateStore,
  onOpenLoginModal,
}) => {
  // Access check: Super Admin only
  const isSuperAdmin = currentRole === 'super_admin';

  // State filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedUsername, setSelectedUsername] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Selected Log for Diff Modal
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  // Friendly time formatter (e.g. 10:15:20 20/10/2026 (2 phút trước))
  const formatFriendlyTime = (isoString: string): { full: string; relative: string } => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return { full: isoString, relative: '' };

      const pad = (n: number) => String(n).padStart(2, '0');
      const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      const full = `${timeStr} ${dateStr}`;

      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      let relative = '';
      if (diffSec < 60) {
        relative = 'Vừa xong';
      } else if (diffMin < 60) {
        relative = `${diffMin} phút trước`;
      } else if (diffHour < 24) {
        relative = `${diffHour} giờ trước`;
      } else if (diffDay === 1) {
        relative = 'Hôm qua';
      } else if (diffDay < 30) {
        relative = `${diffDay} ngày trước`;
      } else {
        relative = dateStr;
      }

      return { full, relative };
    } catch {
      return { full: isoString, relative: '' };
    }
  };

  // Helper config for action labels, colors, and icons
  const getActionConfig = (action: LogActionType, category: string) => {
    switch (action) {
      case 'AUTH_LOGIN_SUCCESS':
        return {
          label: 'Đăng nhập thành công',
          badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          dotColor: 'bg-emerald-400',
          icon: LogIn,
        };
      case 'AUTH_LOGIN_FAILED':
        return {
          label: 'Đăng nhập thất bại',
          badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          dotColor: 'bg-rose-500',
          icon: AlertTriangle,
        };
      case 'AUTH_LOGOUT':
        return {
          label: 'Đăng xuất hệ thống',
          badgeClass: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
          dotColor: 'bg-slate-400',
          icon: LogOut,
        };
      case 'STUDENT_CREATE':
        return {
          label: 'Tạo hồ sơ học sinh',
          badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
          dotColor: 'bg-cyan-400',
          icon: GraduationCap,
        };
      case 'STUDENT_UPDATE':
        return {
          label: 'Cập nhật học sinh',
          badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
          dotColor: 'bg-blue-400',
          icon: GraduationCap,
        };
      case 'STUDENT_DELETE':
        return {
          label: 'Xóa hồ sơ học sinh',
          badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          dotColor: 'bg-rose-400',
          icon: Trash2,
        };
      case 'CLASS_ASSIGN':
        return {
          label: 'Xếp lớp ghi danh',
          badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          dotColor: 'bg-amber-400',
          icon: CheckCircle2,
        };
      case 'CLASS_CREATE':
        return {
          label: 'Tạo lớp học mới',
          badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          dotColor: 'bg-amber-400',
          icon: Calendar,
        };
      case 'ATTENDANCE_SAVE':
        return {
          label: 'Lưu điểm danh buổi',
          badgeClass: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
          dotColor: 'bg-teal-400',
          icon: CheckCircle2,
        };
      case 'INVOICE_PAYMENT_COLLECT':
        return {
          label: 'Gạch nợ thu học phí',
          badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          dotColor: 'bg-emerald-400',
          icon: Receipt,
        };
      case 'CREDIT_ISSUE':
        return {
          label: 'Lập phiếu bảo lưu',
          badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
          dotColor: 'bg-purple-400',
          icon: Layers,
        };
      case 'CLASS_TRANSFER':
        return {
          label: 'Chuyển lớp ngoại khóa',
          badgeClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
          dotColor: 'bg-indigo-400',
          icon: ArrowRightLeft,
        };
      case 'DATABASE_RESET':
        return {
          label: 'Dọn sạch / Reset DB',
          badgeClass: 'bg-rose-600/20 text-rose-300 border-rose-500/40',
          dotColor: 'bg-rose-600',
          icon: Database,
        };
      case 'EXCEL_IMPORT':
        return {
          label: 'Import Master Excel',
          badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          dotColor: 'bg-emerald-400',
          icon: FileSpreadsheet,
        };
      case 'USER_CREATE':
        return {
          label: 'Tạo tài khoản nhân sự',
          badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
          dotColor: 'bg-blue-400',
          icon: User,
        };
      case 'USER_PASSWORD_CHANGE':
        return {
          label: 'Đổi mật khẩu nhân sự',
          badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
          dotColor: 'bg-orange-400',
          icon: Lock,
        };
      default:
        return {
          label: action,
          badgeClass: 'bg-slate-700/50 text-slate-300 border-slate-600',
          dotColor: 'bg-slate-400',
          icon: Activity,
        };
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'AUTH':
        return {
          label: 'Xác thực & Phiên',
          badge: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
        };
      case 'ACADEMIC':
        return {
          label: 'Học vụ & Đào tạo',
          badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        };
      case 'FINANCE':
        return {
          label: 'Tài chính & Học phí',
          badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        };
      case 'SYSTEM':
        return {
          label: 'Quản trị Hệ thống',
          badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        };
      default:
        return {
          label: category,
          badge: 'bg-slate-700/50 text-slate-300 border-slate-600',
        };
    }
  };

  const allLogs = store.auditLogs || [];

  // Filter logs
  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDesc = log.description?.toLowerCase().includes(q);
        const matchUser = log.full_name?.toLowerCase().includes(q) || log.username?.toLowerCase().includes(q);
        const matchTarget = log.target_entity?.toLowerCase().includes(q) || log.target_id?.toLowerCase().includes(q);
        const matchRole = log.user_role?.toLowerCase().includes(q);
        if (!matchDesc && !matchUser && !matchTarget && !matchRole) return false;
      }

      // Category
      if (selectedCategory !== 'all' && log.category !== selectedCategory) {
        return false;
      }

      // Action
      if (selectedAction !== 'all' && log.action !== selectedAction) {
        return false;
      }

      // User
      if (selectedUsername !== 'all' && log.username !== selectedUsername) {
        return false;
      }

      // Time Range
      if (timeRange !== 'all') {
        const logDate = new Date(log.timestamp);
        const now = new Date();
        if (timeRange === 'today') {
          const isToday = 
            logDate.getDate() === now.getDate() &&
            logDate.getMonth() === now.getMonth() &&
            logDate.getFullYear() === now.getFullYear();
          if (!isToday) return false;
        } else if (timeRange === '7days') {
          const diffDays = (now.getTime() - logDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7) return false;
        } else if (timeRange === '30days') {
          const diffDays = (now.getTime() - logDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 30) return false;
        }
      }

      return true;
    });
  }, [allLogs, searchQuery, selectedCategory, selectedAction, selectedUsername, timeRange]);

  // Pagination slice
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Statistics KPIs
  const stats = useMemo(() => {
    const total = allLogs.length;
    const authSuccess = allLogs.filter(l => l.action === 'AUTH_LOGIN_SUCCESS').length;
    const authFailed = allLogs.filter(l => l.action === 'AUTH_LOGIN_FAILED').length;
    const academicChanges = allLogs.filter(l => l.category === 'ACADEMIC').length;
    const financeActions = allLogs.filter(l => l.category === 'FINANCE').length;
    return { total, authSuccess, authFailed, academicChanges, financeActions };
  }, [allLogs]);

  // Distinct usernames for dropdown
  const distinctUsers = useMemo(() => {
    const map = new Map<string, string>();
    allLogs.forEach(l => {
      if (l.username) map.set(l.username, l.full_name || l.username);
    });
    store.users.forEach(u => {
      map.set(u.username, u.full_name || u.username);
    });
    return Array.from(map.entries());
  }, [allLogs, store.users]);

  // Export to CSV / Excel
  const handleExportCSV = () => {
    try {
      const headers = ['Mã Log', 'Thời Gian', 'Tài Khoản', 'Họ Và Tên', 'Vai Trò', 'Phân Nhóm', 'Hành Động', 'Thực Thể Tác Động', 'Mã Đối Tượng', 'Mô Tả Chi Tiết', 'IP / Thiết Bị'];
      
      const rows = filteredLogs.map(l => [
        `"${l.id}"`,
        `"${formatFriendlyTime(l.timestamp).full}"`,
        `"${l.username}"`,
        `"${l.full_name}"`,
        `"${l.user_role}"`,
        `"${l.category}"`,
        `"${l.action}"`,
        `"${l.target_entity}"`,
        `"${l.target_id || ''}"`,
        `"${(l.description || '').replace(/"/g, '""')}"`,
        `"${l.details?.ip_address || ''}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Nhat_Ky_Kiem_Toan_RoyalSchool_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export CSV error:', err);
    }
  };

  // Clear older logs (> 90 days)
  const handleCleanOldLogs = () => {
    const ok = window.confirm('Bạn có chắc chắn muốn dọn dẹp các bản ghi nhật ký kiểm toán cũ hơn 90 ngày? Hành động này sẽ được lưu vết kiểm toán.');
    if (!ok) return;

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).getTime();
    const keptLogs = allLogs.filter(l => new Date(l.timestamp).getTime() >= ninetyDaysAgo);
    const removedCount = allLogs.length - keptLogs.length;

    const cleanupRecord = createAuditRecord(
      'DATABASE_RESET',
      'SYSTEM',
      'Nhật Ký Kiểm Toán',
      `Super Admin dọn dẹp ${removedCount} bản ghi kiểm toán cũ hơn 90 ngày`,
      currentUser,
      { details: { before: { total_records: allLogs.length }, after: { retained_records: keptLogs.length, removed: removedCount } } }
    );

    onUpdateStore(prev => ({
      ...prev,
      auditLogs: [cleanupRecord, ...keptLogs],
    }));

    alert(`Đã dọn dẹp thành công ${removedCount} bản ghi kiểm toán cũ.`);
  };

  // If user is not super_admin, display Access Denied
  if (!isSuperAdmin) {
    return (
      <div className="min-h-[500px] flex items-center justify-center p-6">
        <div className="max-w-xl w-full p-8 rounded-3xl bg-[#0F141F] border border-rose-500/30 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-52 h-52 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-52 h-52 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-rose-500/10">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <h3 className="text-xl font-extrabold text-white mb-2 tracking-wide uppercase">
            Truy Cập Bị Giới Hạn - Chỉ Dành Cho Super Admin
          </h3>
          
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Phân hệ <span className="text-amber-400 font-semibold">Nhật Ký Hoạt Động & Kiểm Toán Hệ Thống (Audit Trail)</span> ghi nhận toàn bộ lịch sử can thiệp dữ liệu, phân quyền và bảo mật. Chỉ có tài khoản Quản trị viên cấp cao (<span className="text-rose-400 font-mono font-bold">Super Admin</span>) mới được phép tra cứu thông tin này.
          </p>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-left mb-6 text-xs text-slate-300 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Tài khoản hiện tại:</span>
              <span className="font-semibold text-white">{currentUser?.full_name || 'Khách vãng lai'} ({currentUser?.username || 'Chưa đăng nhập'})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Vai trò của bạn:</span>
              <span className="font-mono text-amber-400 font-medium">{currentRole}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Quyền truy cập yêu cầu:</span>
              <span className="font-mono text-rose-400 font-bold">super_admin</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {onOpenLoginModal && (
              <button
                onClick={onOpenLoginModal}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Đổi Sang Tài Khoản Super Admin</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Title */}
      <div className="p-5 rounded-3xl bg-[#0F141F] border border-slate-800/80 backdrop-blur-md shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-md shadow-amber-500/10">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-wide">
                Nhật Ký Hoạt Động & Kiểm Toán Hệ Thống
              </h2>
              <p className="text-xs text-slate-400">
                Theo dõi toàn bộ lịch sử đăng nhập, can thiệp học vụ, gạch nợ học phí và thay đổi cấu hình theo chuẩn an toàn thông tin
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5"
            title="Xuất bảng tính CSV nhật ký"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel / CSV</span>
          </button>

          <button
            onClick={handleCleanOldLogs}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-rose-400 border border-rose-500/30 hover:border-rose-500/60 font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5"
            title="Dọn dẹp nhật ký cũ hơn 90 ngày"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Dọn Dẹp (&gt;90 ngày)</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tổng số hành vi */}
        <div className="p-4 rounded-3xl bg-[#0F141F] border border-slate-800/80 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng Thao Tác</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">{stats.total}</div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Bản ghi lưu trữ trong bộ nhớ</span>
          </div>
        </div>

        {/* Card 2: Xác thực & Đăng nhập */}
        <div className="p-4 rounded-3xl bg-[#0F141F] border border-slate-800/80 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Phiên Đăng Nhập</span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <LogIn className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{stats.authSuccess}</span>
            <span className="text-xs text-emerald-400 font-semibold">thành công</span>
            {stats.authFailed > 0 && (
              <span className="text-xs text-rose-400 font-semibold">/ {stats.authFailed} thất bại</span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Giám sát bảo mật truy cập nhân sự</div>
        </div>

        {/* Card 3: Thao tác Học vụ */}
        <div className="p-4 rounded-3xl bg-[#0F141F] border border-slate-800/80 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Học Vụ & Lớp Học</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">{stats.academicChanges}</div>
          <div className="text-[11px] text-slate-400 mt-1">Học sinh, xếp lớp & chuyên cần</div>
        </div>

        {/* Card 4: Thao tác Tài chính */}
        <div className="p-4 rounded-3xl bg-[#0F141F] border border-slate-800/80 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Tài Chính & Thu Phí</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">{stats.financeActions}</div>
          <div className="text-[11px] text-slate-400 mt-1">Gạch nợ, hóa đơn & bảo lưu</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-3xl bg-[#0F141F] border border-slate-800/80 shadow-lg space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          
          {/* Search box */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Tìm theo mô tả, tên cán bộ, mã học sinh, mã đơn..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={e => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500/60 transition-colors"
            >
              <option value="all">Tất cả phân nhóm nghiệp vụ</option>
              <option value="AUTH">Xác thực & Phiên làm việc (AUTH)</option>
              <option value="ACADEMIC">Học vụ & Đào tạo (ACADEMIC)</option>
              <option value="FINANCE">Tài chính & Học phí (FINANCE)</option>
              <option value="SYSTEM">Quản trị Hệ thống (SYSTEM)</option>
            </select>
          </div>

          {/* Action Filter */}
          <div>
            <select
              value={selectedAction}
              onChange={e => { setSelectedAction(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500/60 transition-colors"
            >
              <option value="all">Tất cả mã hành động</option>
              <option value="AUTH_LOGIN_SUCCESS">Đăng nhập thành công</option>
              <option value="AUTH_LOGIN_FAILED">Đăng nhập thất bại</option>
              <option value="AUTH_LOGOUT">Đăng xuất</option>
              <option value="STUDENT_CREATE">Tạo hồ sơ học sinh</option>
              <option value="STUDENT_UPDATE">Cập nhật học sinh</option>
              <option value="STUDENT_DELETE">Xóa học sinh</option>
              <option value="CLASS_ASSIGN">Xếp lớp ghi danh</option>
              <option value="CLASS_CREATE">Tạo lớp học mới</option>
              <option value="ATTENDANCE_SAVE">Lưu điểm danh buổi</option>
              <option value="INVOICE_PAYMENT_COLLECT">Gạch nợ thu học phí</option>
              <option value="CREDIT_ISSUE">Lập phiếu bảo lưu</option>
              <option value="CLASS_TRANSFER">Chuyển lớp ngoại khóa</option>
              <option value="DATABASE_RESET">Dọn sạch / Reset DB</option>
              <option value="EXCEL_IMPORT">Import Master Excel</option>
              <option value="USER_CREATE">Tạo tài khoản nhân sự</option>
              <option value="USER_PASSWORD_CHANGE">Đổi mật khẩu nhân sự</option>
            </select>
          </div>

          {/* User Filter */}
          <div>
            <select
              value={selectedUsername}
              onChange={e => { setSelectedUsername(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500/60 transition-colors"
            >
              <option value="all">Tất cả nhân sự</option>
              {distinctUsers.map(([uname, fname]) => (
                <option key={uname} value={uname}>
                  {fname} ({uname})
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Row 2: Time Range & View Mode Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => { setTimeRange('all'); setCurrentPage(1); }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                timeRange === 'all'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Toàn bộ
            </button>
            <button
              onClick={() => { setTimeRange('today'); setCurrentPage(1); }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                timeRange === 'today'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => { setTimeRange('7days'); setCurrentPage(1); }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                timeRange === '7days'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              7 ngày qua
            </button>
            <button
              onClick={() => { setTimeRange('30days'); setCurrentPage(1); }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                timeRange === '30days'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              30 ngày qua
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              Tìm thấy <strong className="text-amber-400 font-bold">{filteredLogs.length}</strong> kết quả
            </span>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                  viewMode === 'table'
                    ? 'bg-slate-800 text-amber-400 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Dạng Bảng
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                  viewMode === 'timeline'
                    ? 'bg-slate-800 text-amber-400 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Dòng Thời Gian
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {filteredLogs.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-[#0F141F] border border-slate-800">
          <Activity className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h4 className="text-base font-bold text-slate-300">Không tìm thấy bản ghi kiểm toán phù hợp</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Thử thay đổi từ khóa tìm kiếm hoặc chọn lại bộ lọc phân nhóm/thời gian để hiển thị dữ liệu lịch sử thao tác.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        
        /* TABLE VIEW */
        <div className="rounded-3xl bg-[#0F141F] border border-slate-800/80 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#141C2E] text-slate-400 uppercase text-[10px] tracking-wider font-bold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Thời Gian & Tương Đối</th>
                  <th className="py-3 px-4">Nhân Sự Thực Hiện</th>
                  <th className="py-3 px-4">Nghiệp Vụ & Hành Động</th>
                  <th className="py-3 px-4">Thực Thể Tác Động</th>
                  <th className="py-3 px-4">Nội Dung Thao Tác Chi Tiết</th>
                  <th className="py-3 px-4 text-center">Biến Động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-normal">
                {paginatedLogs.map((log) => {
                  const actionCfg = getActionConfig(log.action, log.category);
                  const catCfg = getCategoryBadge(log.category);
                  const ActionIcon = actionCfg.icon;
                  const timeInfo = formatFriendlyTime(log.timestamp);
                  const hasDetails = log.details && (log.details.before || log.details.after || log.details.ip_address);

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* 1. Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono text-white font-medium">{timeInfo.full}</div>
                        <div className="text-[10px] text-amber-500/80 font-medium">{timeInfo.relative}</div>
                      </td>

                      {/* 2. User */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 text-amber-400 font-bold text-xs flex items-center justify-center shrink-0">
                            {log.full_name?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-white">{log.full_name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              @{log.username} · <span className="text-slate-400">{log.user_role}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. Category & Action */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold w-fit ${actionCfg.badgeClass}`}>
                            <ActionIcon className="w-3 h-3" />
                            <span>{actionCfg.label}</span>
                          </span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] w-fit ${catCfg.badge}`}>
                            {catCfg.label}
                          </span>
                        </div>
                      </td>

                      {/* 4. Target Entity */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-200">{log.target_entity}</div>
                        {log.target_id && (
                          <div className="text-[10px] font-mono text-amber-400/90">{log.target_id}</div>
                        )}
                      </td>

                      {/* 5. Description */}
                      <td className="py-3.5 px-4">
                        <div className="text-slate-300 line-clamp-2 max-w-md">
                          {log.description}
                        </div>
                        {log.details?.ip_address && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            IP: {log.details.ip_address}
                          </div>
                        )}
                      </td>

                      {/* 6. Diff / Details Button */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {hasDetails ? (
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 text-[11px] font-medium transition-all inline-flex items-center gap-1 shadow-sm"
                            title="Xem chi tiết biến động trước/sau"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Xem Diff</span>
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[11px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 bg-[#141C2E] border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              Hiển thị <span className="font-bold text-white">{(currentPage - 1) * pageSize + 1}</span> - <span className="font-bold text-white">{Math.min(currentPage * pageSize, filteredLogs.length)}</span> trên <span className="font-bold text-white">{filteredLogs.length}</span> bản ghi
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-white border border-slate-700 transition-colors"
              >
                Trang trước
              </button>
              
              <span className="px-3 py-1.5 font-mono text-amber-400 font-bold">
                {currentPage} / {totalPages}
              </span>

              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-white border border-slate-700 transition-colors"
              >
                Trang sau
              </button>
            </div>
          </div>
        </div>

      ) : (

        /* TIMELINE VIEW */
        <div className="p-6 rounded-3xl bg-[#0F141F] border border-slate-800/80 shadow-xl space-y-6">
          <div className="relative pl-6 sm:pl-8 border-l border-slate-800 space-y-8">
            {paginatedLogs.map((log) => {
              const actionCfg = getActionConfig(log.action, log.category);
              const timeInfo = formatFriendlyTime(log.timestamp);
              const ActionIcon = actionCfg.icon;
              const hasDetails = log.details && (log.details.before || log.details.after || log.details.ip_address);

              return (
                <div key={log.id} className="relative group">
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[31px] sm:-left-[39px] top-1.5 w-4 h-4 rounded-full border-2 border-[#0F141F] ${actionCfg.dotColor} shadow-md`} />

                  <div className="p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-all shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold ${actionCfg.badgeClass}`}>
                          <ActionIcon className="w-3 h-3" />
                          <span>{actionCfg.label}</span>
                        </span>
                        <span className="text-xs font-bold text-white">
                          {log.full_name} <span className="text-slate-500 font-normal">(@{log.username} · {log.user_role})</span>
                        </span>
                      </div>

                      <div className="text-right whitespace-nowrap">
                        <span className="text-xs font-mono text-slate-300">{timeInfo.full}</span>
                        <span className="text-[11px] text-amber-500/80 ml-2 font-medium">({timeInfo.relative})</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {log.description}
                    </p>

                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px] text-slate-500">
                      <div className="flex items-center gap-3">
                        <span>Thực thể: <strong className="text-slate-300">{log.target_entity}</strong></span>
                        {log.target_id && <span>Mã: <strong className="font-mono text-amber-400">{log.target_id}</strong></span>}
                        {log.details?.ip_address && <span>IP: <strong className="font-mono text-slate-400">{log.details.ip_address}</strong></span>}
                      </div>

                      {hasDetails && (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1 hover:underline"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Xem chi tiết Diff</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timeline Pagination */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Trang <span className="font-bold text-amber-400">{currentPage}</span> / <span className="font-bold text-white">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-slate-800 disabled:opacity-40 text-white border border-slate-700"
              >
                Trước
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-slate-800 disabled:opacity-40 text-white border border-slate-700"
              >
                Tiếp theo
              </button>
            </div>
          </div>
        </div>

      )}

      {/* MODAL: DIFF & EVENT DETAILS VIEWER */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-[#0F141F] border border-amber-500/30 shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-[#141C2E] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Biến Động Dữ Liệu Kiểm Toán</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {selectedLog.id}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {formatFriendlyTime(selectedLog.timestamp).full} · Thực hiện bởi <strong className="text-white">{selectedLog.full_name}</strong> (@{selectedLog.username})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              
              {/* Event Summary Box */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-400">Hành động:</span>
                    <span className="font-mono font-bold text-amber-400">{selectedLog.action}</span>
                    <span className="text-slate-500">({selectedLog.category})</span>
                  </div>
                  {selectedLog.details?.ip_address && (
                    <div className="font-mono text-slate-400">
                      IP Client: <span className="text-cyan-400">{selectedLog.details.ip_address}</span>
                    </div>
                  )}
                </div>

                <div className="text-slate-300">
                  <strong className="text-white">Mô tả:</strong> {selectedLog.description}
                </div>

                <div className="flex items-center gap-4 text-slate-400 pt-1">
                  <div>Thực thể: <strong className="text-white">{selectedLog.target_entity}</strong></div>
                  {selectedLog.target_id && <div>Mã đối tượng: <strong className="font-mono text-amber-400">{selectedLog.target_id}</strong></div>}
                  <div>Trạng thái: <span className="text-emerald-400 font-semibold">{selectedLog.details?.status || 'success'}</span></div>
                </div>
              </div>

              {/* Diff 2 Columns (Before vs After) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Column 1: Before State */}
                <div className="rounded-2xl bg-rose-950/15 border border-rose-500/30 overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 bg-rose-950/40 border-b border-rose-500/30 flex items-center justify-between text-rose-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      DỮ LIỆU BAN ĐẦU (TRƯỚC KHI THAY ĐỔI)
                    </span>
                    <span className="text-[10px] uppercase font-mono text-rose-400">OLD STATE</span>
                  </div>
                  <div className="p-4 flex-1 font-mono text-slate-300 overflow-x-auto text-[11px] leading-relaxed">
                    {selectedLog.details?.before ? (
                      <pre className="whitespace-pre-wrap font-mono text-slate-300">
                        {JSON.stringify(selectedLog.details.before, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-slate-500 italic py-6 text-center">
                        (Không có dữ liệu snapshot trước đó hoặc đây là thao tác khởi tạo mới)
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: After State */}
                <div className="rounded-2xl bg-emerald-950/15 border border-emerald-500/30 overflow-hidden flex flex-col">
                  <div className="px-4 py-2.5 bg-emerald-950/40 border-b border-emerald-500/30 flex items-center justify-between text-emerald-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      DỮ LIỆU CẬP NHẬT (SAU KHI THAY ĐỔI)
                    </span>
                    <span className="text-[10px] uppercase font-mono text-emerald-400">NEW STATE</span>
                  </div>
                  <div className="p-4 flex-1 font-mono text-slate-200 overflow-x-auto text-[11px] leading-relaxed">
                    {selectedLog.details?.after ? (
                      <pre className="whitespace-pre-wrap font-mono text-emerald-300">
                        {JSON.stringify(selectedLog.details.after, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-slate-500 italic py-6 text-center">
                        (Không có dữ liệu payload sau thao tác)
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#141C2E] flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors"
              >
                Đóng Cửa Sổ
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
