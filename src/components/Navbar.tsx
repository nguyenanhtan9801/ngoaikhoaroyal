import React, { useState } from 'react';
import { 
  Crown, 
  Bell, 
  UserCheck, 
  Sparkles, 
  ShieldCheck, 
  ChevronDown, 
  ExternalLink,
  School,
  Settings,
  Users,
  Calendar,
  Layers,
  Award,
  DollarSign,
  Coffee,
  BookmarkCheck,
  Receipt,
  HeartPulse,
  GraduationCap,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Menu,
  X,
  ChevronRight,
  HeartHandshake,
  LogIn,
  LogOut,
  CalendarOff,
  Database
} from 'lucide-react';
import { UserRole, SystemNotification, Student, AppUser } from '../types';
import { RoyalLogo } from './RoyalLogo';
import { getUserPermissions, getRoleLabelVN, getCampusLabelVN } from '../lib/storage';

interface SubMenuItem {
  id: string;
  label: string;
  icon: any;
  desc: string;
  badge?: string;
  badgeColor?: string;
}

interface MenuGroup {
  id: string;
  title: string;
  icon: any;
  items: SubMenuItem[];
}

interface NavbarProps {
  currentRoute: string;
  onNavigate: (routeId: string) => void;
  currentRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  onOpenTeacherApp: () => void;
  onOpenParentPortal: () => void;
  onOpenLoginModal: () => void;
  currentParentStudent?: Student | null;
  notifications: SystemNotification[];
  onOpenNotifications: () => void;
  currentUser?: AppUser | null;
  onLogout?: () => void;
  realtimeStatus?: 'connected' | 'reconnecting' | 'disconnected';
  onReconnectRealtime?: () => void;
  pendingRegistrationsCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  currentRole,
  onChangeRole,
  onOpenTeacherApp,
  onOpenParentPortal,
  onOpenLoginModal,
  currentParentStudent,
  notifications,
  onOpenNotifications,
  currentUser,
  onLogout,
  realtimeStatus = 'connected',
  onReconnectRealtime,
  pendingRegistrationsCount = 0,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;
  const consecutiveAlertCount = notifications.filter(n => n.type === 'consecutive_absence' && !n.read).length;

  const rolesList: { id: UserRole; label: string; desc: string }[] = [
    { id: 'super_admin', label: 'Quản trị viên Cấp cao', desc: 'Toàn quyền cấu hình, phân quyền RBAC, đặt lại dữ liệu & xuất bảng tính tổng thể' },
    { id: 'campus_manager', label: 'Quản lý cơ sở (PMH / PL)', desc: 'Quản lý toàn diện đào tạo, tuyển sinh & tài chính tại cơ sở phụ trách' },
    { id: 'academic_accountant', label: 'Học vụ kiêm Kế toán', desc: 'Quản lý lớp, chuyên cần, bảo lưu & duyệt thu học phí' },
    { id: 'academic_admissions', label: 'Học vụ kiêm Tuyển sinh', desc: 'Xếp lớp, bánh sữa, chuyển lớp, ghi danh' },
    { id: 'admissions', label: 'Chuyên viên Tuyển sinh', desc: 'Tiếp nhận đơn cổng phụ huynh, xếp lớp nhanh 1-Click' },
    { id: 'accountant', label: 'Kế toán Học phí & Thù lao', desc: 'Quản lý hóa đơn VietQR, bảo lưu & quyết toán thù lao giáo viên' },
    { id: 'teacher', label: 'Giáo viên bộ môn', desc: 'Chỉ điểm danh & y tế, khóa hoàn toàn tài chính' },
  ];

  const currentRoleInfo = rolesList.find(r => r.id === currentRole) || rolesList[0];
  const perms = getUserPermissions(currentUser, currentRole);

  // Danh mục phân hệ điều hướng hệ thống
  const allMenuGroups: MenuGroup[] = [
    {
      id: 'group_bi',
      title: 'TỔNG QUAN & BÁO CÁO',
      icon: Award,
      items: [
        { 
          id: 'sub_kpi', 
          label: 'Tổng Quan Hiệu Suất & Thống Kê', 
          icon: Layers, 
          desc: 'Tỷ lệ chuyên cần, cảnh báo vắng từ 3 buổi trở lên và doanh thu',
          badge: consecutiveAlertCount > 0 ? `${consecutiveAlertCount} cảnh báo` : undefined,
          badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30'
        },
      ],
    },
    {
      id: 'group_students',
      title: 'HỌC VIÊN & TUYỂN SINH',
      icon: Users,
      items: [
        { 
          id: 'sub_parents', 
          label: 'Đơn Đăng Ký Tuyển Sinh', 
          icon: Users, 
          desc: 'Hồ sơ tiếp nhận trực tuyến từ phụ huynh dành cho cán bộ tuyển sinh và học vụ',
          badge: pendingRegistrationsCount > 0 ? `${pendingRegistrationsCount} đơn mới` : undefined,
          badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
        },
        { 
          id: 'sub_students', 
          label: 'Hồ Sơ Học Viên', 
          icon: GraduationCap, 
          desc: 'Danh sách học viên, hình thẻ, học sinh Royal, học sinh ngoài trường, thông tin y tế' 
        },
        { 
          id: 'sub_credits', 
          label: 'Bảo Lưu', 
          icon: BookmarkCheck, 
          desc: 'Cấp phiếu nghỉ từ 3 buổi trở lên, theo dõi hạn 365 ngày và cấn trừ khóa mới' 
        },
      ],
    },
    {
      id: 'group_academics',
      title: 'ĐÀO TẠO & VẬN HÀNH',
      icon: Calendar,
      items: [
        { 
          id: 'sub_term_subjects', 
          label: 'Khóa Học & Môn Học', 
          icon: School, 
          desc: 'Quản lý danh mục môn, kích hoạt môn cho từng khóa, đóng mở niên khóa' 
        },
        { 
          id: 'sub_pricing', 
          label: 'Biểu Phí Theo Cơ Sở', 
          icon: DollarSign, 
          desc: 'Cấu hình học phí theo Cơ sở, Khóa học và Môn học, làm tròn đơn giá buổi' 
        },
        { 
          id: 'sub_classes', 
          label: 'Lớp Học Ngoại Khóa', 
          icon: Calendar, 
          desc: 'Phòng học, sân bãi, khung giờ, giáo viên và kiểm tra trùng lịch' 
        },
        { 
          id: 'sub_schedule', 
          label: 'Quản Lý Khung Giờ Học', 
          icon: Clock, 
          desc: 'Quản lý ca học, thời lượng, các ngày áp dụng trong tuần và đồng bộ CSDL' 
        },
        { 
          id: 'sub_attendance', 
          label: 'Sổ Điểm Danh & Dạy Thay', 
          icon: CheckCircle2, 
          desc: 'Điểm danh 3 trạng thái, quản lý dạy thay và tính bù trừ bánh sữa theo buổi' 
        },
        { 
          id: 'sub_snacks', 
          label: 'Báo Cáo Đối Soát Bánh Sữa', 
          icon: Coffee, 
          desc: 'Tổng hợp khẩu phần ăn nhẹ học sinh Royal tiêu thụ và hoàn bếp theo khóa' 
        },
      ],
    },
    {
      id: 'group_finance',
      title: 'TÀI CHÍNH & KẾ TOÁN',
      icon: DollarSign,
      items: [
        { 
          id: 'sub_finance_invoices', 
          label: 'Thu Học Phí & Mã Chuyển Khoản', 
          icon: Receipt, 
          desc: 'Hóa đơn học phí từng môn, mã VietQR tiêu chuẩn ngân hàng, gạch nợ sao kê' 
        },
        { 
          id: 'sub_finance_payroll', 
          label: 'Quyết Toán Thù Lao Giáo Viên', 
          icon: UserCheck, 
          desc: 'Thù lao theo buổi cố định cơ hữu (300k) và thỉnh giảng (270k)' 
        },
        { 
          id: 'sub_finance_transfer', 
          label: 'Biến Động Chuyển Lớp & Phụ Thu', 
          icon: ArrowRightLeft, 
          desc: 'Tính bù trừ chênh lệch đơn giá ca học khi chuyển lớp' 
        },
      ],
    },
    {
      id: 'group_settings',
      title: 'HỆ THỐNG & DANH MỤC',
      icon: Settings,
      items: [
        { 
          id: 'sub_users', 
          label: 'Quản Lý Người Dùng & Phân Quyền', 
          icon: ShieldCheck, 
          desc: 'Thêm tài khoản, khóa/mở khóa đăng nhập và cấu hình ma trận quyền hạn RBAC',
          badge: 'RBAC',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        },
        { 
          id: 'sub_backup', 
          label: 'Sao Lưu Toàn Bộ CSDL (Backup)', 
          icon: Database, 
          desc: 'Tải toàn bộ 18 bảng dữ liệu Supabase về máy tính dạng Excel (.xlsx), CSV hoặc JSON',
          badge: 'Cloud Export',
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        },
        { 
          id: 'sub_settings', 
          label: 'Quản Trị Dữ Liệu & Bảng Tính Tổng Thể', 
          icon: Settings, 
          desc: 'Dọn sạch cơ sở dữ liệu 4 cấp độ an toàn, Nhập và Xuất 10 bảng dữ liệu' 
        },
        { 
          id: 'sub_holidays', 
          label: 'Danh Sách Ngày Nghỉ Lễ', 
          icon: CalendarOff, 
          desc: 'Quản lý lịch nghỉ lễ toàn trường hoặc theo cơ sở, tự động loại trừ khi tính số buổi thực học' 
        },
        { 
          id: 'sub_audit_logs', 
          label: 'Nhật Ký Hoạt Động & Kiểm Toán', 
          icon: ShieldCheck, 
          desc: 'Audit Trail: Lịch sử đăng nhập, can thiệp học vụ, gạch nợ học phí và thay đổi cấu hình',
          badge: 'Admin',
          badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
        },
      ],
    },
  ];

  const isRouteAllowed = (routeId: string): boolean => {
    if (currentRole === 'super_admin' || currentUser?.role === 'super_admin' || currentUser?.is_root) {
      return true;
    }
    switch (routeId) {
      case 'sub_kpi':
        return true;
      case 'sub_parents':
      case 'sub_students':
        return !!(perms.can_manage_enrollment || perms.can_view_registrations || perms.can_manage_classes);
      case 'sub_credits':
        return !!(perms.can_manage_credits || perms.can_manage_finance);
      case 'sub_term_subjects':
      case 'sub_pricing':
      case 'sub_settings':
      case 'sub_holidays':
      case 'sub_backup':
        return !!(perms.can_config_system || perms.can_manage_classes);
      case 'sub_classes':
        return !!(perms.can_manage_classes || perms.can_view_classes || perms.can_take_attendance);
      case 'sub_attendance':
      case 'sub_snacks':
        return !!perms.can_take_attendance;
      case 'sub_finance_invoices':
      case 'sub_finance_transfer':
        return !!perms.can_manage_finance;
      case 'sub_finance_payroll':
        return !!(perms.can_settle_payroll || perms.can_manage_finance);
      case 'sub_users':
      case 'sub_audit_logs':
        return !!perms.can_manage_users;
      default:
        return true;
    }
  };

  const menuGroups: MenuGroup[] = allMenuGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => isRouteAllowed(item.id)),
    }))
    .filter(group => group.items.length > 0);

  const handleItemClick = (routeId: string) => {
    onNavigate(routeId);
    setIsDrawerOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#07090E]/95 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-[1780px] mx-auto px-2.5 sm:px-4 lg:px-5">
          <div className="flex items-center justify-between h-13 sm:h-14 gap-2.5">
            
            {/* Left: Brand Logo & Hamburger Button */}
            <div className="flex items-center gap-3">
              {/* Dấu 3 gạch (Hamburger Button) - Menu hệ thống chỉ để icon không để tên */}
              <button
                onClick={() => setIsDrawerOpen(prev => !prev)}
                className="p-2 sm:p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700/80 hover:border-amber-500/50 transition-all shadow-sm shadow-amber-500/10 group flex items-center justify-center shrink-0"
                title="Menu hệ thống"
                aria-label="Menu hệ thống"
              >
                <Menu className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
              </button>

              {/* Logo Royal School (Không có chữ INSPIRE) */}
              <div 
                className="flex items-center gap-2.5 cursor-pointer shrink-0" 
                onClick={() => onNavigate('sub_kpi')}
                title="Về Trang chủ / KPI"
              >
                <RoyalLogo size="sm" />
                <div className="hidden md:block">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm tracking-wider text-white">ROYAL SCHOOL</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">Hệ thống quản lý Ngoại khóa</p>
                </div>
              </div>
            </div>

            {/* Right Action Tools */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Cổng Phụ Huynh Button */}
              <button
                onClick={onOpenParentPortal}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/40 hover:bg-cyan-500/20 transition-all shadow-sm shadow-cyan-500/10"
                title="Mở Cổng Phụ Huynh: Đăng ký môn học ngoại khóa cho con"
              >
                <HeartHandshake className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Cổng Phụ Huynh</span>
              </button>

              {/* Quick App Giáo Viên Button */}
              <button
                onClick={onOpenTeacherApp}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500/20 transition-all shadow-sm shadow-amber-500/10"
                title="Chuyển sang giao diện Giáo viên (Điểm danh & Y tế, không hiển thị tài chính)"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Ứng Dụng Giáo Viên</span>
                <ExternalLink className="w-3 h-3 text-amber-400/70" />
              </button>

              {/* Notification Bell */}
              <button
                onClick={onOpenNotifications}
                className="relative p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors border border-slate-800/80"
                title="Trung tâm thông báo"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Realtime Connection Status Indicator (Cạnh thông tin người dùng) */}
              {realtimeStatus === 'connected' ? (
                <button
                  type="button"
                  onClick={onReconnectRealtime}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold shadow-sm shadow-emerald-500/10 hover:bg-emerald-500/15 transition-all shrink-0"
                  title="Kênh đồng bộ thời gian thực (royal_hub_realtime) đang hoạt động ổn định"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <span className="hidden md:inline">Realtime Connected</span>
                  <span className="md:hidden">Realtime</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onReconnectRealtime}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-bold shadow-sm shadow-amber-500/10 animate-pulse hover:bg-amber-500/25 transition-all shrink-0"
                  title="Đang tự động kết nối lại theo cơ chế Exponential Backoff — Bấm để thử kết nối ngay"
                >
                  <span>⚠️ Reconnecting...</span>
                </button>
              )}

              {/* Role Switcher & Login Portal Button */}
              <div className="relative flex items-center gap-1.5">
                {currentParentStudent ? (
                  <div className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 rounded-xl text-xs">
                    <HeartHandshake className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-bold text-cyan-300 hidden sm:inline">PH: {currentParentStudent.name.split(' ').slice(-1)[0]}</span>
                    <button
                      onClick={onOpenLoginModal}
                      className="ml-1 text-[10px] text-amber-400 hover:underline font-semibold"
                    >
                      Đổi
                    </button>
                  </div>
                ) : null}

                <button
                  onClick={() => setShowRoleMenu(!showRoleMenu)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 hover:border-amber-500/50 transition-all text-left group"
                  title="Tài khoản & Phân quyền hệ thống"
                >
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center text-[10px] font-extrabold text-slate-950 shadow-sm">
                    {currentUser ? currentUser.full_name.slice(0, 1).toUpperCase() : currentRole === 'super_admin' ? 'AD' : currentRole === 'teacher' ? 'GV' : 'NV'}
                  </div>
                  <div className="hidden xl:block">
                    <div className="text-[11px] font-bold text-white leading-tight flex items-center gap-1">
                      <span>{currentUser ? currentUser.full_name : currentRoleInfo.label.split('(')[0].trim()}</span>
                      <ShieldCheck className="w-3 h-3 text-amber-400" />
                    </div>
                    {currentUser && (
                      <div className="text-[9px] text-amber-400/90 leading-none mt-0.5">
                        {currentUser.role === 'super_admin' ? 'Quản trị cấp cao' : currentUser.department}
                      </div>
                    )}
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-amber-400" />
                </button>

                {/* Direct Logout Button */}
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-1.5 sm:px-2 sm:py-1.5 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/80 hover:border-rose-500/40 transition-all text-xs font-semibold flex items-center gap-1"
                    title="Đăng xuất khỏi hệ thống"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline text-[11px]">Đăng Xuất</span>
                  </button>
                )}

                {showRoleMenu && (
                  <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-[#111827] border border-slate-700 shadow-2xl p-2 z-50 animate-fadeIn">
                    {currentUser && (
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 mb-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-white">{currentUser.full_name}</span>
                          <span className="text-[10px] font-mono text-amber-400 font-bold">@{currentUser.username}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {currentUser.department} &bull; <span className="text-amber-300">{currentRoleInfo.label.split('(')[0].trim()}</span>
                        </div>
                      </div>
                    )}

                    <div className="px-2.5 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
                      <span>Chuyển đổi vai trò kiểm thử</span>
                    </div>

                    <div className="mt-1 space-y-1 max-h-56 overflow-y-auto">
                      {rolesList.map(r => (
                        <button
                          key={r.id}
                          onClick={() => {
                            onChangeRole(r.id);
                            setShowRoleMenu(false);
                          }}
                          className={`w-full text-left p-2 rounded-xl text-xs transition-colors ${
                            currentRole === r.id && !currentParentStudent
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'hover:bg-slate-800/80 text-slate-300'
                          }`}
                        >
                          <div className="font-bold flex items-center justify-between">
                            <span>{r.label}</span>
                            {currentRole === r.id && !currentParentStudent && <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{r.desc}</div>
                        </button>
                      ))}

                      {onLogout && (
                        <div className="pt-1.5 border-t border-slate-800 mt-1">
                          <button
                            onClick={() => {
                              setShowRoleMenu(false);
                              onLogout();
                            }}
                            className="w-full py-1.5 px-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Đăng Xuất Khỏi Hệ Thống</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </header>

      {/* EXECUTIVE SLIDE-OVER DRAWER MENU (MỞ KHI BẤM DẤU 3 GẠCH) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-full max-w-sm sm:max-w-md bg-[#0B0F19] border-r border-slate-800/80 shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-left duration-250">
            
            {/* Drawer Header */}
            <div className="p-4 bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/10 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <RoyalLogo size="sm" />
                <div>
                  <h3 className="font-extrabold text-sm text-white">ROYAL SCHOOL</h3>
                  <p className="text-[10px] text-slate-400">Hệ Thống Quản Lý Ngoại Khóa Toàn Diện</p>
                </div>
              </div>

              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Links inside Drawer */}
            <div className="p-3 bg-slate-900/60 border-b border-slate-800/80 flex items-center gap-2">
              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  onOpenParentPortal();
                }}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <HeartHandshake className="w-3.5 h-3.5 text-cyan-400" />
                <span>Cổng Phụ Huynh</span>
              </button>

              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  onOpenTeacherApp();
                }}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Ứng Dụng Giáo Viên</span>
              </button>
            </div>

            {/* Drawer Body: Grouped Navigation Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {menuGroups.map(group => (
                <div key={group.id} className="space-y-1">
                  <div className="px-2 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <group.icon className="w-3.5 h-3.5 text-amber-400" />
                    <span>{group.title}</span>
                  </div>

                  <div className="space-y-0.5">
                    {group.items.map(item => {
                      const isActive = currentRoute === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleItemClick(item.id)}
                          className={`w-full text-left p-2 rounded-xl text-xs transition-all flex items-start gap-2.5 ${
                            isActive
                              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/25'
                              : 'text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800'
                          }`}
                        >
                          <item.icon className={`w-4 h-4 shrink-0 mt-0.5 ${
                            isActive ? 'text-slate-950' : 'text-slate-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 leading-snug">
                              <span className="truncate">{item.label}</span>
                              {item.badge && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border shrink-0 ${
                                  isActive ? 'bg-slate-950 text-white border-transparent' : item.badgeColor
                                }`}>
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <div className={`text-[10px] mt-0.5 line-clamp-1 ${
                              isActive ? 'text-slate-900/80 font-medium' : 'text-slate-500'
                            }`}>
                              {item.desc}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>Trung tâm Quản lý Học vụ - Dịch vụ</span>
              <span className="font-mono text-amber-400/80">Version 3.1</span>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
