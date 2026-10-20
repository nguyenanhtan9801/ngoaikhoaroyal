import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Bell, 
  Smartphone, 
  LogOut, 
  ChevronDown, 
  UserCheck, 
  GraduationCap, 
  AlertTriangle,
  FileSpreadsheet,
  Check
} from 'lucide-react';
import { UserRole, NotificationItem } from '../../types';

interface NavbarProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  notifications: NotificationItem[];
  onMarkNotificationRead: (id: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onRoleChange,
  activeTab,
  onTabChange,
  notifications,
  onMarkNotificationRead
}) => {
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  const unreadNotifs = notifications.filter(n => !n.read);

  const roleLabels: Record<UserRole, { title: string; color: string }> = {
    super_admin: { title: 'Super Admin', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
    academic_accountant: { title: 'Học vụ kiêm Kế toán', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
    academic_admissions: { title: 'Học vụ & Tuyển sinh', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' },
    academic_staff: { title: 'Nhân viên Học vụ', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
    admissions_staff: { title: 'Nhân viên Tuyển sinh', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
    admissions: { title: 'Tổ Tuyển sinh', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
    teacher: { title: 'Giáo viên Giảng dạy', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' }
  };

  const navMenuItems = [
    { id: 'dashboard', label: 'Bảng Điều Khiển' },
    { id: 'reports', label: 'Báo Cáo & Thống Kê' },
    { id: 'admissions', label: 'Đăng Ký Phụ Huynh' },
    { id: 'students', label: 'Quản Lý Học Viên' },
    { id: 'classes', label: 'Quản Lý Đào Tạo' },
    { id: 'catalogs', label: 'Danh Mục & Đào Tạo' },
    { id: 'teachers', label: 'Nhân Sự & Giảng Dạy' },
    { id: 'settings', label: 'Cấu Hình & Trợ Giúp' }
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0B0F19]/90 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl">
      <div className="max-w-[1720px] mx-auto px-4 lg:px-8 h-20 flex items-center justify-between gap-4">
        
        {/* Brand Logo & Name */}
        <div 
          onClick={() => onTabChange('dashboard')} 
          className="flex items-center gap-3.5 cursor-pointer select-none group shrink-0"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 p-[1.5px] shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform duration-200">
            <div className="w-full h-full bg-[#07090E] rounded-2xl flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-wider text-white">ROYAL SCHOOL</span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                BI INTEL
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-400 tracking-tight">
              Quản Lý Ngoại Khóa Toàn Diện
            </p>
          </div>
        </div>

        {/* Center Navigation Menus */}
        <nav className="hidden xl:flex items-center gap-1 overflow-x-auto py-1">
          {navMenuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/25 ring-1 ring-amber-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right Section: Teacher App quick button, notifications, role switcher */}
        <div className="flex items-center gap-3">
          
          {/* Quick "App Giáo Viên" switch button */}
          <button
            onClick={() => {
              onRoleChange('teacher');
              onTabChange('attendance');
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              currentRole === 'teacher'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50 shadow-md shadow-cyan-500/20'
                : 'bg-transparent text-amber-400 border-amber-500/60 hover:bg-amber-500/10 shadow-sm'
            }`}
          >
            <Smartphone className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">App Giáo Viên</span>
          </button>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition-colors"
              title="Trung tâm thông báo"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifs.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center animate-pulse border-2 border-[#0B0F19]">
                  {unreadNotifs.length}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifMenu && (
              <div className="absolute right-0 mt-3 w-84 sm:w-96 bg-[#111827] border border-slate-700/80 rounded-2xl shadow-2xl p-4 z-50 backdrop-blur-2xl">
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">Thông Báo Nghiệp Vụ</span>
                    <span className="text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold">
                      {unreadNotifs.length} mới
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {notifications.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-6">Không có thông báo mới.</p>
                  ) : (
                    notifications.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => onMarkNotificationRead(item.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          item.read 
                            ? 'bg-slate-900/50 border-slate-800 text-slate-400' 
                            : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:border-amber-500/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                            {item.title}
                          </div>
                          <span className="text-[10px] text-slate-500">{item.date}</span>
                        </div>
                        <p className="text-xs mt-1 text-slate-300 leading-relaxed">{item.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Role Switcher & User Profile */}
          <div className="relative">
            <button
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className="flex items-center gap-2.5 pl-2.5 pr-3 py-1.5 rounded-2xl bg-slate-900/80 border border-slate-700/70 hover:border-slate-600 transition-all text-left"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-amber-700 flex items-center justify-center font-bold text-xs text-white shadow-inner">
                RS
              </div>
              <div className="hidden md:block">
                <div className="text-xs font-bold text-slate-200">Bùi Quốc Thái</div>
                <div className="text-[10px] text-amber-400 font-medium">
                  {roleLabels[currentRole]?.title}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {/* Role Switcher Menu */}
            {showRoleMenu && (
              <div className="absolute right-0 mt-3 w-64 bg-[#111827] border border-slate-700/80 rounded-2xl shadow-2xl p-2 z-50">
                <div className="px-3 py-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-800/80 mb-1">
                  Chuyển Đổi Quyền Thao Tác (5 Vai Trò)
                </div>
                {(Object.keys(roleLabels) as UserRole[]).map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      onRoleChange(role);
                      setShowRoleMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl transition-all ${
                      currentRole === role
                        ? 'bg-amber-500/20 text-amber-300 font-bold'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <span>{roleLabels[role].title}</span>
                    {currentRole === role && <Check className="w-4 h-4 text-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
