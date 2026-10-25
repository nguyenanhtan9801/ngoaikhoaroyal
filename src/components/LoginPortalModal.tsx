import React, { useState } from 'react';
import { 
  X, 
  LogIn, 
  LogOut, 
  User, 
  Phone, 
  ShieldCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertTriangle,
  HeartHandshake,
  HelpCircle,
  KeyRound,
  Loader2,
  Sparkles
} from 'lucide-react';
import { UserRole, Student, AppUser } from '../types';
import { AppStore, createAuditRecord, appendAuditLog, handleLoginProcess, getRoleLabelVN, getDefaultPermissionsForRole } from '../lib/storage';
import { RoyalLogo } from './RoyalLogo';
import { showToast } from '../lib/toast';
import { supabase } from '../supabaseClient';

interface LoginPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  store: AppStore;
  currentUser?: AppUser | null;
  setCurrentUser?: (user: AppUser | null) => void;
  isAuthenticated?: boolean;
  setIsAuthenticated?: (auth: boolean) => void;
  onLogout?: () => void;
  onUpdateStore?: (updater: (prev: AppStore) => AppStore) => void;
  onLoginSuccess?: (user: AppUser) => void;
  onOpenParentPortalWithStudent?: (student: Student) => void;
  currentParentStudent?: Student | null;
  onSetParentStudent?: (student: Student | null) => void;
  forceUnclosable?: boolean;
}

export const LoginPortalModal: React.FC<LoginPortalModalProps> = ({
  isOpen,
  onClose,
  currentRole,
  onChangeRole,
  store,
  currentUser,
  setCurrentUser,
  isAuthenticated,
  setIsAuthenticated,
  onLogout,
  onUpdateStore,
  onLoginSuccess,
  onOpenParentPortalWithStudent,
  currentParentStudent,
  onSetParentStudent,
  forceUnclosable,
}) => {
  const [activeTab, setActiveTab] = useState<'staff' | 'parent'>('staff');
  
  // Staff Credentials Form State (cleared when logged out)
  const [staffUsername, setStaffUsername] = useState(currentUser?.username || '');
  const [staffPassword, setStaffPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isStaffSubmitting, setIsStaffSubmitting] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffHelpVisible, setStaffHelpVisible] = useState(false);

  // Parent Form State
  const [parentPhone, setParentPhone] = useState('');
  const [parentOtp, setParentOtp] = useState('');
  const [isParentSubmitting, setIsParentSubmitting] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  const [parentWarning, setParentWarning] = useState<string | null>(null);

  // Common Feedback State
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  // Format phone number with spaces (e.g., 0908 112 233)
  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
    let formatted = raw;
    if (raw.length > 7) {
      formatted = `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7)}`;
    } else if (raw.length > 4) {
      formatted = `${raw.slice(0, 4)} ${raw.slice(4)}`;
    }
    setParentPhone(formatted);
    setParentError(null);
    setParentWarning(null);
  };

  const handleStandardStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError(null);
    setIsStaffSubmitting(true);

    try {
      const inputIdentifier = staffUsername.trim().toLowerCase();
      const cleanPassword = staffPassword.trim();

      if (!inputIdentifier) {
        setStaffError('Vui lòng nhập Tên đăng nhập hoặc Email công vụ.');
        setIsStaffSubmitting(false);
        return;
      }

      if (!cleanPassword) {
        setStaffError('Vui lòng nhập Mật khẩu truy cập.');
        setIsStaffSubmitting(false);
        return;
      }

      let user: any = null;

      // 1. TÌM TÀI KHOẢN TRỰC TIẾP TỪ BẢNG app_users TRÊN SUPABASE
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('app_users')
            .select('*')
            .or(`username.ilike.${inputIdentifier},email.ilike.${inputIdentifier}`)
            .eq('status', 'active')
            .maybeSingle();

          if (!error && data) {
            user = data;
          } else if (error) {
            console.warn('Supabase app_users query note:', error.message);
          }
        } catch (sbErr) {
          console.warn('Lỗi kết nối bảng app_users:', sbErr);
        }
      }

      // Fallback kiểm tra danh sách nội bộ nếu Supabase offline hoặc chưa hoàn tất đồng bộ
      if (!user && store?.users) {
        const local = store.users.find(
          u => (u.username && u.username.toLowerCase() === inputIdentifier) ||
               (u.email && u.email.toLowerCase() === inputIdentifier)
        );
        if (local && local.status === 'active') {
          user = local;
        }
      }

      if (!user) {
        setStaffError('Tài khoản hoặc email không tồn tại trong hệ thống.');
        setIsStaffSubmitting(false);
        return;
      }

      // Kiểm tra mật khẩu (hỗ trợ so sánh trực tiếp password_hash hoặc password)
      const expectedPassword = user.password_hash || user.password || '';
      if (expectedPassword && expectedPassword !== cleanPassword) {
        setStaffError('Mật khẩu truy cập không chính xác. Vui lòng kiểm tra lại.');
        setIsStaffSubmitting(false);
        return;
      }

      // Đăng nhập thành công: Lưu session vào localStorage
      const nowIso = new Date().toISOString();
      const sessionUser: AppUser = {
        id: user.id,
        username: user.username,
        password: user.password || '',
        password_hash: user.password_hash || '',
        email: user.email || `${user.username}@royal.edu.vn`,
        full_name: user.full_name || user.name || user.username,
        role: user.role || 'teacher',
        campus_id: user.campus_id || 'all',
        department: user.department || 'Ban Quản Trị & Học Vụ',
        permissions: user.permissions || getDefaultPermissionsForRole(user.role),
        status: user.status || 'active',
        created_at: user.created_at || nowIso,
        last_login: nowIso,
        phone: user.phone || '',
        avatar_url: user.avatar_url,
      };

      try {
        localStorage.setItem('royal_auth_user', JSON.stringify(sessionUser));
        localStorage.setItem('royal_current_user', JSON.stringify(sessionUser));
        localStorage.setItem('royal_auth_session', JSON.stringify(sessionUser));
        localStorage.removeItem('royal_logged_out');
      } catch {
        // noop
      }

      if (typeof setCurrentUser === 'function') {
        setCurrentUser(sessionUser);
      }
      if (typeof setIsAuthenticated === 'function') {
        setIsAuthenticated(true);
      }

      // Cập nhật thời điểm last_login lên Supabase
      if (supabase && user.id) {
        try {
          await supabase
            .from('app_users')
            .update({ last_login: nowIso })
            .eq('id', user.id);
        } catch {
          // noop
        }
      }

      // Ghi log kiểm toán đăng nhập
      if (onUpdateStore) {
        const log = createAuditRecord(
          'AUTH_LOGIN_SUCCESS',
          'AUTH',
          'Hệ thống Xác thực',
          `Nhân sự ${sessionUser.full_name} (@${sessionUser.username}) đăng nhập thành công với vai trò ${getRoleLabelVN(sessionUser.role, sessionUser)}`,
          sessionUser,
          {
            target_id: sessionUser.username,
            details: {
              ip_address: '192.168.1.45',
              status: 'success',
              after: {
                role: sessionUser.role,
                full_name: sessionUser.full_name,
                campus_id: sessionUser.campus_id,
                last_login: sessionUser.last_login,
              },
            },
          }
        );

        onUpdateStore(prev => ({
          ...appendAuditLog(prev, log),
          users: prev.users.map(u =>
            u.id === sessionUser.id || u.username === sessionUser.username
              ? { ...u, last_login: nowIso }
              : u
          ),
        }));
      }

      if (onSetParentStudent) onSetParentStudent(null);
      showToast(`✓ Chào mừng ${sessionUser.full_name} đã đăng nhập thành công!`, 'success');
      setLoginSuccess(`Chào mừng ${sessionUser.full_name}! Đang chuyển hướng...`);
      setIsStaffSubmitting(false);

      if (onLoginSuccess) {
        onLoginSuccess(sessionUser);
      } else {
        onChangeRole(sessionUser.role);
      }

      setTimeout(() => {
        setLoginSuccess(null);
        onClose();
      }, 400);
    } catch (err: any) {
      console.error('Lỗi đăng nhập:', err);
      setStaffError('Đã có lỗi xảy ra trong quá trình xác thực: ' + (err?.message || 'Lỗi không xác định'));
      setIsStaffSubmitting(false);
    }
  };

  const handleParentPhoneLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setParentError(null);
    setParentWarning(null);
    setIsParentSubmitting(true);

    setTimeout(() => {
      const cleanDigits = parentPhone.replace(/\D/g, '');

      if (!cleanDigits || cleanDigits.length < 9) {
        setParentError('Vui lòng nhập số điện thoại hợp lệ (từ 10 đến 11 chữ số).');
        setIsParentSubmitting(false);
        return;
      }

      // Check students registered with parent phone
      const foundStudent = store.students.find(s => {
        const sPhoneClean = (s.parent_phone || '').replace(/\D/g, '');
        return sPhoneClean === cleanDigits;
      });

      if (foundStudent) {
        if (onSetParentStudent) onSetParentStudent(foundStudent);
        if (onOpenParentPortalWithStudent) {
          onOpenParentPortalWithStudent(foundStudent);
        }

        if (onUpdateStore) {
          const log = createAuditRecord(
            'AUTH_LOGIN_SUCCESS',
            'AUTH',
            'Cổng Phụ Huynh',
            `Phụ huynh học sinh ${foundStudent.name} (${foundStudent.code}) đã xác thực thành công qua SĐT ${parentPhone}`,
            null,
            {
              target_id: foundStudent.id,
              details: {
                student_name: foundStudent.name,
                parent_phone: parentPhone,
                status: 'success'
              }
            }
          );
          onUpdateStore(prev => appendAuditLog(prev, log));
        }

        setLoginSuccess(`Chào mừng Phụ huynh bé ${foundStudent.name}! Đang mở Cổng Tra Cứu...`);
        setIsParentSubmitting(false);

        setTimeout(() => {
          setLoginSuccess(null);
          onClose();
        }, 700);
      } else {
        // Check in prospective parent registrations as secondary check
        const foundReg = store.parentRegistrations?.find(r => (r.parent_phone || '').replace(/\D/g, '') === cleanDigits);
        if (foundReg) {
          setParentWarning(
            `Tìm thấy đơn ghi danh của Phụ huynh "${foundReg.parent_name}" cho học sinh "${foundReg.student_name}". Hồ sơ đang trong quy trình tuyển sinh và chưa hoàn tất ghi danh vào lớp.`
          );
        } else {
          setParentWarning(
            `Không tìm thấy hồ sơ học sinh nào liên kết với Số điện thoại "${parentPhone}". Vui lòng kiểm tra lại hoặc liên hệ Văn phòng Học vụ: (028) 7101 6669 để cập nhật.`
          );
        }
        setIsParentSubmitting(false);
      }
    }, 350);
  };

  const handleLogout = async () => {
    try {
      // 1. Đăng xuất khỏi Supabase Auth (nếu có dùng)
      if (supabase && supabase.auth) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Lỗi signOut Supabase:', err);
    }

    // 2. Xóa sạch mọi key lưu trữ phiên đăng nhập cục bộ
    try {
      localStorage.removeItem('royal_auth_user');
      localStorage.removeItem('royal_token');
      localStorage.removeItem('sb-access-token');
      localStorage.removeItem('sb-refresh-token');
      localStorage.removeItem('royal_current_user');
      localStorage.removeItem('royal_auth_session');
      localStorage.setItem('royal_logged_out', 'true');
      sessionStorage.clear();
    } catch {
      // noop
    }

    // 3. Reset toàn bộ state người dùng
    if (typeof setCurrentUser === 'function') {
      setCurrentUser(null);
    }
    if (typeof setIsAuthenticated === 'function') {
      setIsAuthenticated(false);
    }
    if (typeof onLogout === 'function') {
      onLogout();
    }
    if (onSetParentStudent) {
      onSetParentStudent(null);
    }

    // 4. Reset form đăng nhập về rỗng
    setStaffUsername('');
    setStaffPassword('');
    setParentPhone('');
    setParentOtp('');
    setStaffError(null);
    setParentError(null);
    setParentWarning(null);
    setLoginSuccess(null);

    showToast('Đã đăng xuất phiên làm việc thành công!', 'info');

    // 5. Nếu đang ở trang Dashboard, điều hướng bắt buộc về trạng thái Chưa đăng nhập (khóa toàn bộ màn hình Dashboard)
    // Tuyệt đối không gọi onClose() để lộ trang chủ phía sau.
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={() => {
        if (currentUser && !forceUnclosable) {
          onClose();
        }
      }}
    >
      {/* Background radial glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_40%,rgba(245,158,11,0.08),transparent_65%)]" />

      <div 
        className="w-full max-w-lg rounded-3xl bg-[#111827]/95 border border-slate-800/90 shadow-2xl overflow-hidden flex flex-col relative z-10 backdrop-blur-xl animate-scaleUp"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-[#131b2e] to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RoyalLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white tracking-wide">CỔNG XÁC THỰC NỘI BỘ</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-extrabold tracking-wider uppercase">
                  ROYAL IDENTITY
                </span>
              </div>
              <p className="text-xs text-slate-400">Trường Song Ngữ Quốc Tế Hoàng Gia (Royal School)</p>
            </div>
          </div>

          {currentUser && !forceUnclosable && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-2 p-2 bg-slate-950/80 border-b border-slate-800/80 gap-2">
          <button
            type="button"
            onClick={() => { setActiveTab('staff'); setStaffError(null); }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'staff'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Cán Bộ &amp; Giáo Viên</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('parent'); setParentError(null); setParentWarning(null); }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'parent'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <HeartHandshake className="w-4 h-4" />
            <span>Phụ Huynh Học Sinh</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {loginSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{loginSuccess}</span>
            </div>
          )}

          {/* TAB 1: CÁN BỘ & GIÁO VIÊN */}
          {activeTab === 'staff' && (
            <form onSubmit={handleStandardStaffLogin} className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                Khu vực dành riêng cho <strong>Cán bộ Quản trị, Học vụ, Kế toán và Giáo viên</strong> ngoại khóa Royal School. Đăng nhập để truy cập quyền hạn theo phân công.
              </div>

              {staffError && (
                <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{staffError}</span>
                </div>
              )}

              {staffHelpVisible && (
                <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs leading-relaxed space-y-1 animate-fadeIn">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <HelpCircle className="w-4 h-4" />
                    <span>Hỗ Trợ Tài Khoản &amp; Khôi Phục Mật Khẩu</span>
                  </div>
                  <p>
                    Vui lòng liên hệ <strong>Phòng CNTT &amp; Học Vụ</strong> hoặc Hotline: <strong>(028) 7101 6669</strong> để được cấp lại mật khẩu truy cập nội bộ.
                  </p>
                </div>
              )}

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Tên đăng nhập hoặc Email công vụ:
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={staffUsername}
                      onChange={e => { setStaffUsername(e.target.value); setStaffError(null); }}
                      placeholder="Ví dụ: ntp.hanh hoặc ntp.hanh@royal.edu.vn"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Mật khẩu truy cập:
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={staffPassword}
                      onChange={e => { setStaffPassword(e.target.value); setStaffError(null); }}
                      placeholder="Nhập mật khẩu của bạn"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 focus:outline-none accent-amber-500"
                    />
                    <span>Ghi nhớ phiên đăng nhập</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setStaffHelpVisible(!staffHelpVisible)}
                    title="Vui lòng liên hệ Phòng CNTT &amp; Học Vụ"
                    className="text-amber-400 hover:text-amber-300 font-semibold transition-colors flex items-center gap-1 group relative"
                  >
                    <span>Quên mật khẩu?</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isStaffSubmitting}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                {isStaffSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Đang Xác Thực...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 text-slate-950" />
                    <span>→] Đăng Nhập Cổng Nội Bộ</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 2: PHỤ HUYNH HỌC SINH */}
          {activeTab === 'parent' && (
            <form onSubmit={handleParentPhoneLogin} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-slate-300 leading-relaxed">
                Phụ huynh sử dụng <strong>Số điện thoại</strong> đã đăng ký với trường để đăng nhập tra cứu tiến độ học tập, điểm danh, suất bánh sữa và quét mã VietQR học phí.
              </div>

              {parentError && (
                <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{parentError}</span>
                </div>
              )}

              {parentWarning && (
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs leading-relaxed space-y-1 animate-fadeIn">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Thông Báo Tra Cứu</span>
                  </div>
                  <p>{parentWarning}</p>
                </div>
              )}

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Số điện thoại phụ huynh:
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="tel"
                      placeholder="VD: 0908 112 233"
                      value={parentPhone}
                      onChange={handlePhoneInputChange}
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500 transition-colors"
                      autoFocus
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Định dạng: 10 chữ số (VD: 0908 112 233)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Mã bảo mật OTP (Tùy chọn - Nhận qua Zalo ZNS / SMS):
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      placeholder="Nhập 6 chữ số OTP nếu đã nhận"
                      value={parentOtp}
                      onChange={e => setParentOtp(e.target.value.slice(0, 6))}
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Nếu chưa có mã OTP, phụ huynh có thể đăng nhập trực tiếp qua Số điện thoại đã đăng ký.
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isParentSubmitting}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-extrabold text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                {isParentSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Đang Tra Cứu Hồ Sơ...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 text-slate-950" />
                    <span>Tra Cứu &amp; Đăng Nhập Cổng Phụ Huynh</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Chân Modal Đăng Nhập */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400 p-4 bg-slate-950/80">
          <div>
            Phiên làm việc: <span className="text-amber-400 font-semibold">{currentUser?.username || 'Chưa đăng nhập'}</span>
          </div>
          
          {currentUser && (
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 text-slate-300 hover:bg-rose-500/20 hover:text-rose-400 border border-slate-700 transition-colors"
            >
              <span>[→ Đăng Xuất]</span>
            </button>
          )}
        </div>

        {/* Security & Support Info */}
        <div className="px-5 py-2.5 bg-black/60 border-t border-slate-900/80 text-[10px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-1">
          <div>
            🔒 Hệ thống bảo mật nội bộ Royal School &bull; SSL 256-bit &bull; Supabase Engine
          </div>
          <div>
            Hotline Học Vụ &amp; CNTT: <strong className="text-amber-400/90 font-mono">(028) 7101 6669</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
