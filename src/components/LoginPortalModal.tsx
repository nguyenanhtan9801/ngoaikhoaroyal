import React, { useState } from 'react';
import { 
  X, 
  Crown, 
  LogIn, 
  LogOut, 
  User, 
  Phone, 
  ShieldCheck, 
  Lock, 
  Sparkles, 
  CheckCircle2, 
  UserCheck, 
  ArrowRight,
  School,
  HeartHandshake
} from 'lucide-react';
import { UserRole, Student, AppUser } from '../types';
import { AppStore, createAuditRecord, appendAuditLog } from '../lib/storage';
import { RoyalLogo } from './RoyalLogo';

interface LoginPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  store: AppStore;
  currentUser?: AppUser | null;
  onUpdateStore?: (updater: (prev: AppStore) => AppStore) => void;
  onLoginSuccess?: (user: AppUser) => void;
  onOpenParentPortalWithStudent?: (student: Student) => void;
  currentParentStudent?: Student | null;
  onSetParentStudent?: (student: Student | null) => void;
}

export const LoginPortalModal: React.FC<LoginPortalModalProps> = ({
  isOpen,
  onClose,
  currentRole,
  onChangeRole,
  store,
  currentUser,
  onUpdateStore,
  onLoginSuccess,
  onOpenParentPortalWithStudent,
  currentParentStudent,
  onSetParentStudent,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'staff' | 'parent'>('staff');
  
  // Staff Form
  const [staffEmail, setStaffEmail] = useState('admin');
  const [staffPassword, setStaffPassword] = useState('123456');
  const [staffError, setStaffError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);

  // Parent Form
  const [parentPhone, setParentPhone] = useState('0903 889 911');
  const [parentError, setParentError] = useState<string | null>(null);

  const staffAccounts: { role: UserRole; name: string; title: string; email: string; avatarBg: string }[] = [
    {
      role: 'super_admin',
      name: 'ThS. Nguyễn Hoàng Long',
      title: 'Quản trị viên Cấp cao',
      email: 'admin@royalschool.edu.vn',
      avatarBg: 'from-amber-500 to-amber-700',
    },
    {
      role: 'academic_accountant',
      name: 'Cô Lê Thị Kim Cúc',
      title: 'Học vụ kiêm Kế toán',
      email: 'ketoan@royalschool.edu.vn',
      avatarBg: 'from-emerald-500 to-teal-700',
    },
    {
      role: 'academic_admissions',
      name: 'Thầy Trần Quốc Bảo',
      title: 'Học vụ kiêm Tuyển sinh',
      email: 'hocvu@royalschool.edu.vn',
      avatarBg: 'from-blue-500 to-indigo-700',
    },
    {
      role: 'admissions',
      name: 'Cô Phạm Thùy Linh',
      title: 'Chuyên viên Tuyển sinh',
      email: 'tuyensinh@royalschool.edu.vn',
      avatarBg: 'from-cyan-500 to-blue-600',
    },
    {
      role: 'teacher',
      name: 'Thầy David Huỳnh (Bóng rổ)',
      title: 'Giáo viên Giảng dạy',
      email: 'teacher.david@royalschool.edu.vn',
      avatarBg: 'from-purple-500 to-pink-600',
    },
  ];

  const handleSelectStaffRole = (role: UserRole, accountName: string) => {
    // Find matching user from store
    let user = store.users.find(u => u.role === role);
    if (!user) {
      user = {
        id: `usr_${role}`,
        username: role === 'super_admin' ? 'admin' : role,
        password: '123',
        full_name: accountName,
        phone: '0908 112 233',
        email: `${role}@royalschool.edu.vn`,
        role,
        department: 'Ban Giám Hiệu & Quản Trị Hệ Thống',
        status: 'active',
        created_at: '2026-08-01',
      };
    }

    // Record Audit Log: AUTH_LOGIN_SUCCESS
    if (onUpdateStore) {
      const log = createAuditRecord(
        'AUTH_LOGIN_SUCCESS',
        'AUTH',
        'Hệ thống Xác thực',
        `Cán bộ ${user.full_name} (@${user.username}) đã đăng nhập thành công với vai trò ${role}`,
        user,
        {
          target_id: user.username,
          details: {
            ip_address: '192.168.1.45',
            status: 'success',
            after: { role, full_name: user.full_name, login_mode: '1-click quick login' }
          }
        }
      );
      onUpdateStore(prev => appendAuditLog(prev, log));
    }

    if (onLoginSuccess) {
      onLoginSuccess(user);
    } else {
      onChangeRole(role);
    }

    if (onSetParentStudent) onSetParentStudent(null);
    setLoginSuccess(`Đã đăng nhập thành công với vai trò: ${accountName}`);
    setTimeout(() => {
      setLoginSuccess(null);
      onClose();
    }, 600);
  };

  const handleStandardStaffLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUname = staffEmail.trim().toLowerCase();
    const cleanPass = staffPassword.trim();

    const matchedUser = store.users.find(
      u => u.username.toLowerCase() === cleanUname || u.email.toLowerCase() === cleanUname
    );

    if (!matchedUser) {
      // Record Audit Log: AUTH_LOGIN_FAILED
      if (onUpdateStore) {
        const failLog = createAuditRecord(
          'AUTH_LOGIN_FAILED',
          'AUTH',
          'Hệ thống Xác thực',
          `Đăng nhập thất bại: Tài khoản "${cleanUname}" không tồn tại trên hệ thống`,
          null,
          {
            target_id: cleanUname,
            details: {
              ip_address: '192.168.1.45',
              status: 'failed',
              after: { reason: 'Tài khoản không tồn tại', attempted_username: cleanUname }
            }
          }
        );
        onUpdateStore(prev => appendAuditLog(prev, failLog));
      }
      setStaffError('Tài khoản không tồn tại trong hệ thống. Vui lòng kiểm tra lại.');
      return;
    }

    if (matchedUser.password && matchedUser.password !== cleanPass) {
      // Record Audit Log: AUTH_LOGIN_FAILED
      if (onUpdateStore) {
        const failLog = createAuditRecord(
          'AUTH_LOGIN_FAILED',
          'AUTH',
          'Hệ thống Xác thực',
          `Đăng nhập thất bại: Sai mật khẩu truy cập cho tài khoản "${matchedUser.username}"`,
          matchedUser,
          {
            target_id: matchedUser.username,
            details: {
              ip_address: '192.168.1.45',
              status: 'failed',
              after: { reason: 'Mật khẩu không chính xác', username: matchedUser.username }
            }
          }
        );
        onUpdateStore(prev => appendAuditLog(prev, failLog));
      }
      setStaffError('Mật khẩu không chính xác. Mật khẩu mẫu mặc định là: 123456');
      return;
    }

    // Success
    setStaffError(null);
    if (onUpdateStore) {
      const log = createAuditRecord(
        'AUTH_LOGIN_SUCCESS',
        'AUTH',
        'Hệ thống Xác thực',
        `Nhân sự ${matchedUser.full_name} (@${matchedUser.username}) đăng nhập thành công`,
        matchedUser,
        {
          target_id: matchedUser.username,
          details: {
            ip_address: '192.168.1.45',
            status: 'success',
            after: { role: matchedUser.role, full_name: matchedUser.full_name, login_mode: 'form_credentials' }
          }
        }
      );
      onUpdateStore(prev => appendAuditLog(prev, log));
    }

    if (onLoginSuccess) {
      onLoginSuccess(matchedUser);
    } else {
      onChangeRole(matchedUser.role);
    }

    if (onSetParentStudent) onSetParentStudent(null);
    setLoginSuccess(`Đã đăng nhập thành công: ${matchedUser.full_name}`);
    setTimeout(() => {
      setLoginSuccess(null);
      onClose();
    }, 600);
  };

  const handleParentPhoneLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = parentPhone.replace(/\s+/g, '');
    const found = store.students.find(s => s.parent_phone.replace(/\s+/g, '') === clean);

    if (found) {
      if (onSetParentStudent) onSetParentStudent(found);
      if (onOpenParentPortalWithStudent) {
        onOpenParentPortalWithStudent(found);
      }
      setParentError(null);
      onClose();
    } else {
      setParentError('Không tìm thấy phụ huynh với số điện thoại này trong hệ thống. Vui lòng thử số mẫu bên dưới.');
    }
  };

  const handleSelectDemoParent = (student: Student) => {
    setParentPhone(student.parent_phone);
    if (onSetParentStudent) onSetParentStudent(student);
    if (onOpenParentPortalWithStudent) {
      onOpenParentPortalWithStudent(student);
    }
    setParentError(null);
    onClose();
  };

  const handleLogout = () => {
    onChangeRole('super_admin');
    if (onSetParentStudent) onSetParentStudent(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-xl rounded-3xl bg-[#0B0F19] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-[#111827] to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RoyalLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white tracking-wide">CỔNG XÁC THỰC & ĐĂNG NHẬP</h3>
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">
                  Royal Auth
                </span>
              </div>
              <p className="text-xs text-slate-400">Trường Song Ngữ Quốc Tế Hoàng Gia</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-2 p-2 bg-slate-950/70 border-b border-slate-800/80 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'staff'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Cán Bộ & Giáo Viên</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('parent')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'parent'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <HeartHandshake className="w-4 h-4" />
            <span>Phụ Huynh Học Sinh</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {loginSuccess && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{loginSuccess}</span>
            </div>
          )}

          {/* TAB 1: STAFF & TEACHERS */}
          {activeTab === 'staff' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  1-Click Đăng Nhập Nhanh Theo Vai Trò (Tài Khoản Mẫu)
                </h4>
                <div className="space-y-2">
                  {staffAccounts.map(acc => {
                    const isActive = currentRole === acc.role && !currentParentStudent;
                    return (
                      <button
                        key={acc.role}
                        type="button"
                        onClick={() => handleSelectStaffRole(acc.role, acc.name)}
                        className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                          isActive
                            ? 'bg-amber-500/15 border-amber-500/50 shadow-md shadow-amber-500/10'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${acc.avatarBg} flex items-center justify-center text-white font-extrabold text-xs shadow-md`}>
                            {acc.name.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                              <span>{acc.name}</span>
                              {isActive && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 text-[9px] font-extrabold uppercase">
                                  Đang chọn
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">{acc.title}</div>
                          </div>
                        </div>

                        <ArrowRight className="w-4 h-4 text-slate-500" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Standard Credentials Form Simulation */}
              <form onSubmit={handleStandardStaffLogin} className="pt-3 border-t border-slate-800/80 space-y-3">
                <div className="text-xs font-semibold text-slate-400">Hoặc đăng nhập bằng tài khoản nội bộ:</div>
                
                {staffError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                    {staffError}
                  </div>
                )}

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Tên đăng nhập hoặc Email</label>
                    <input
                      type="text"
                      value={staffEmail}
                      onChange={e => { setStaffEmail(e.target.value); setStaffError(null); }}
                      placeholder="VD: admin, ketoan, tuyensinh..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Mật khẩu</label>
                    <input
                      type="password"
                      value={staffPassword}
                      onChange={e => { setStaffPassword(e.target.value); setStaffError(null); }}
                      placeholder="Mặc định: 123456"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 text-xs font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-amber-500/20"
                >
                  Xác Thực & Đăng Nhập Hệ Thống
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: PARENT LOGIN */}
          {activeTab === 'parent' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-slate-300">
                Phụ huynh sử dụng <strong>Số điện thoại</strong> đã đăng ký với trường để đăng nhập tra cứu tiến độ học tập, điểm danh, suất bánh sữa và quét mã VietQR học phí.
              </div>

              {parentError && (
                <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                  {parentError}
                </div>
              )}

              <form onSubmit={handleParentPhoneLogin} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Số điện thoại phụ huynh:
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="VD: 0903 889 911"
                      value={parentPhone}
                      onChange={e => setParentPhone(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-amber-500/20 flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4 text-slate-950" />
                  <span>Đăng Nhập Cổng Phụ Huynh</span>
                </button>
              </form>

              {/* Demo 1-Click Parents */}
              <div className="pt-3 border-t border-slate-800/80">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Hoặc chọn nhanh hồ sơ phụ huynh mẫu:
                </span>
                <div className="space-y-2">
                  {store.students.slice(0, 3).map(st => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleSelectDemoParent(st)}
                      className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-left flex items-center justify-between text-xs transition-all"
                    >
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>PH Bé: {st.name}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            st.is_royal_student ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {st.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-amber-400 font-mono mt-0.5">SĐT: {st.parent_phone}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-xs">
          <div className="text-slate-400">
            Hiện tại: <strong className="text-amber-400">{currentRole}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng Xuất</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
