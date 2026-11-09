import React, { useState, useEffect } from 'react';
import {
  X,
  LogIn,
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
} from 'lucide-react';
import { UserRole, Student, AppUser } from '../types';
import {
  AppStore,
  createAuditRecord,
  appendAuditLog,
  getRoleLabelVN,
  getDefaultPermissionsForRole,
  sanitizeUserForClient,
  saveActiveSessionUser,
  clearActiveSessionUser,
  getOfflineExpectedPassword,
  fetchClientIpAddress,
  getClientIpAddress,
  buildAppUserFromProfile,
  isLegacyLoginEnabled,
} from '../lib/storage';
import { RoyalLogo } from './RoyalLogo';
import { showToast } from '../lib/toast';
import { supabase } from '../supabaseClient';

const STAFF_LOCKOUT_STORAGE_KEY = 'royal_staff_login_lockout';
const STAFF_MAX_FAILED_ATTEMPTS = 5;
const STAFF_LOCKOUT_DURATION_MS = 60 * 1000; // 60 giây

const PARENT_RATELIMIT_STORAGE_KEY = 'royal_parent_login_ratelimit';
const PARENT_MAX_ATTEMPTS = 5;
const PARENT_WINDOW_MS = 15 * 60 * 1000; // 15 phút

interface StaffLockoutState {
  failedCount: number;
  lockoutUntil: number;
}

function getStaffLockoutState(): StaffLockoutState {
  try {
    const raw = localStorage.getItem(STAFF_LOCKOUT_STORAGE_KEY);
    if (!raw) return { failedCount: 0, lockoutUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      failedCount: Number(parsed?.failedCount) || 0,
      lockoutUntil: Number(parsed?.lockoutUntil) || 0,
    };
  } catch {
    return { failedCount: 0, lockoutUntil: 0 };
  }
}

function saveStaffLockoutState(state: StaffLockoutState): void {
  try {
    localStorage.setItem(STAFF_LOCKOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function clearStaffLockoutState(): void {
  try {
    localStorage.removeItem(STAFF_LOCKOUT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function getParentRecentAttempts(): number[] {
  try {
    const raw = localStorage.getItem(PARENT_RATELIMIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - PARENT_WINDOW_MS;
    return parsed.map(Number).filter(ts => Number.isFinite(ts) && ts > cutoff);
  } catch {
    return [];
  }
}

function recordParentAttempt(): number[] {
  const recent = getParentRecentAttempts();
  const updated = [...recent, Date.now()];
  try {
    localStorage.setItem(PARENT_RATELIMIT_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

interface LoginPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole?: UserRole;
  store: AppStore;
  currentUser?: AppUser | null;
  setCurrentUser?: (user: AppUser | null) => void;
  isAuthenticated?: boolean;
  setIsAuthenticated?: (auth: boolean) => void;
  onLogout?: () => void;
  onUpdateStore?: (updater: (prev: AppStore) => AppStore) => void;
  onLoginSuccess?: (user: AppUser, rememberMe?: boolean) => void;
  onOpenParentPortalWithStudent?: (student: Student) => void;
  currentParentStudent?: Student | null;
  onSetParentStudent?: (student: Student | null) => void;
  forceUnclosable?: boolean;
}

export const LoginPortalModal: React.FC<LoginPortalModalProps> = ({
  isOpen,
  onClose,
  store,
  currentUser,
  setCurrentUser,
  setIsAuthenticated,
  onLogout,
  onUpdateStore,
  onLoginSuccess,
  onOpenParentPortalWithStudent,
  onSetParentStudent,
  forceUnclosable,
}) => {
  const [activeTab, setActiveTab] = useState<'staff' | 'parent'>('staff');

  // Staff Credentials Form State
  const [staffUsername, setStaffUsername] = useState(currentUser?.username || '');
  const [staffPassword, setStaffPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isStaffSubmitting, setIsStaffSubmitting] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffHelpVisible, setStaffHelpVisible] = useState(false);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState<number>(0);

  // Parent Form State (Phone + Student Code, no fake OTP)
  const [parentPhone, setParentPhone] = useState('');
  const [parentStudentCode, setParentStudentCode] = useState('');
  const [isParentSubmitting, setIsParentSubmitting] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);

  // Common Feedback State
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);

  // Track 60-second temporary lockout countdown on device
  useEffect(() => {
    if (!isOpen) return;
    const updateCountdown = () => {
      const { lockoutUntil } = getStaffLockoutState();
      if (lockoutUntil > Date.now()) {
        setLockoutRemainingSec(Math.ceil((lockoutUntil - Date.now()) / 1000));
      } else {
        setLockoutRemainingSec(0);
      }
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

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
  };

  const registerFailedStaffLogin = (): string => {
    const current = getStaffLockoutState();
    const now = Date.now();
    const baseCount = current.lockoutUntil > now ? current.failedCount : current.failedCount;
    const nextCount = baseCount + 1;

    if (nextCount >= STAFF_MAX_FAILED_ATTEMPTS) {
      const lockoutUntil = now + STAFF_LOCKOUT_DURATION_MS;
      saveStaffLockoutState({ failedCount: 0, lockoutUntil });
      setLockoutRemainingSec(60);
      return 'Tên đăng nhập hoặc mật khẩu không đúng.';
    }

    saveStaffLockoutState({ failedCount: nextCount, lockoutUntil: 0 });
    return 'Tên đăng nhập hoặc mật khẩu không đúng.';
  };

  const handleStandardStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError(null);

    // Kiểm tra khóa tạm 60 giây sau 5 lần sai liên tiếp trên cùng thiết bị
    const lockoutState = getStaffLockoutState();
    if (lockoutState.lockoutUntil > Date.now()) {
      const remaining = Math.ceil((lockoutState.lockoutUntil - Date.now()) / 1000);
      setLockoutRemainingSec(remaining);
      setStaffError(`Tài khoản đang bị khóa tạm thời trên thiết bị này. Vui lòng thử lại sau ${remaining} giây.`);
      return;
    }

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

      const nowIso = new Date().toISOString();
      let sessionUser: AppUser | null = null;

      // =======================================================================
      // NHÁNH 1: ĐĂNG NHẬP SUPABASE AUTH + ĐỌC BẢNG `profiles` (GIAI ĐOẠN 2A)
      // =======================================================================
      if (supabase) {
        try {
          const { data: resolvedData, error: rpcError } = await supabase.rpc('resolve_login_email', {
            p_identifier: inputIdentifier,
          });

          let resolvedEmail = inputIdentifier;
          if (!rpcError && resolvedData) {
            if (typeof resolvedData === 'string' && resolvedData.trim()) {
              resolvedEmail = resolvedData.trim().toLowerCase();
            } else if (Array.isArray(resolvedData) && resolvedData[0]) {
              resolvedEmail = String(resolvedData[0]?.email || resolvedData[0] || inputIdentifier)
                .trim()
                .toLowerCase();
            } else if (typeof resolvedData === 'object' && (resolvedData as any).email) {
              resolvedEmail = String((resolvedData as any).email).trim().toLowerCase();
            }
          }

          if (resolvedEmail) {
            const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
              email: resolvedEmail,
              password: cleanPassword,
            });

            if (!signInError && authData?.user) {
              if (authData.session?.access_token) {
                supabase.realtime?.setAuth(authData.session.access_token);
              }
              // Đọc hồ sơ của chính mình từ bảng `profiles` (id = user.id)
              const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', authData.user.id)
                .maybeSingle();

              // Chỉ cho vào nếu có hồ sơ và status = 'active'; ngược lại gọi signOut() và báo lỗi chung
              if (
                profileError ||
                !profileData ||
                String(profileData.status || '').toLowerCase() !== 'active'
              ) {
                await supabase.auth.signOut();
                const msg = registerFailedStaffLogin();
                setStaffError(msg);
                setIsStaffSubmitting(false);
                return;
              }

              // Dựng đối tượng AppUser từ profiles (id, username, full_name, role, campus_id, permissions);
              // lần đăng nhập gần nhất lấy từ phiên Supabase Auth (last_sign_in_at)
              const sessionLastSignIn = authData.user.last_sign_in_at || nowIso;
              sessionUser = sanitizeUserForClient({
                ...buildAppUserFromProfile(
                  profileData,
                  authData.user.email || resolvedEmail,
                  sessionLastSignIn
                ),
                last_login: sessionLastSignIn,
              });
            }
          }
        } catch (sbAuthErr) {
          console.warn('Supabase Auth login note:', sbAuthErr);
        }
      }

      // =======================================================================
      // NHÁNH 2: ĐĂNG NHẬP TRỰC TIẾP QUA BẢNG app_users / LOCAL STORE
      // =======================================================================
      if (!sessionUser) {
        // Trước khi ghép vào bộ lọc .or(...), từ chối hoặc loại bỏ các ký tự , ( ) % * \ trong tên đăng nhập hoặc email
        if (/[,()%*\\]/.test(inputIdentifier)) {
          const msg = registerFailedStaffLogin();
          setStaffError(msg);
          setIsStaffSubmitting(false);
          return;
        }
        const safeLegacyIdentifier = inputIdentifier.replace(/[,()%*\\]/g, '');

        let user: any = null;
        let expectedPassword = '';

        if (supabase && safeLegacyIdentifier) {
          try {
            const { data, error } = await supabase
              .from('app_users')
              .select('*')
              .or(`username.ilike.${safeLegacyIdentifier},email.ilike.${safeLegacyIdentifier}`)
              .maybeSingle();

            if (!error && data) {
              user = data;
              expectedPassword = String(data.password_hash || data.password || '').trim();
            }
          } catch (sbErr) {
            console.warn('Lỗi kết nối bảng app_users:', sbErr);
          }
        }

        // Fallback kiểm tra danh sách nội bộ nếu Supabase offline hoặc chưa hoàn tất đồng bộ
        if (!user && store?.users) {
          const local = store.users.find(
            u =>
              (u.username && u.username.toLowerCase() === inputIdentifier) ||
              (u.email && u.email.toLowerCase() === inputIdentifier)
          );
          if (local) {
            user = local;
            expectedPassword = String(
              local.password_hash ||
                local.password ||
                getOfflineExpectedPassword(local.username || inputIdentifier) ||
                ''
            ).trim();
          }
        }

        const encodedInputPass = (() => {
          try {
            return btoa(cleanPassword);
          } catch {
            return '';
          }
        })();

        const isPasswordMatched =
          Boolean(expectedPassword) &&
          (expectedPassword === cleanPassword ||
            (Boolean(encodedInputPass) && expectedPassword === encodedInputPass));

        // Mọi lỗi (sai tài khoản, sai mật khẩu, bị khóa) đều dùng thông báo chung "Tên đăng nhập hoặc mật khẩu không đúng."
        if (
          !user ||
          String(user.status || 'active').toLowerCase() !== 'active' ||
          !isPasswordMatched
        ) {
          const msg = registerFailedStaffLogin();
          setStaffError(msg);
          setIsStaffSubmitting(false);
          return;
        }

        sessionUser = sanitizeUserForClient({
          id: user.id,
          username: user.username,
          email: user.email || `${user.username}@royal.edu.vn`,
          full_name: user.full_name || user.name || user.username,
          role: user.role || 'teacher',
          campus_id: user.campus_id || 'all',
          department: user.department || 'Ban Quản Trị & Học Vụ',
          permissions: user.permissions || getDefaultPermissionsForRole(user.role),
          status: 'active',
          linked_teacher_id: user.linked_teacher_id || user.teacher_id || undefined,
          created_at: user.created_at || nowIso,
          last_login: nowIso,
          phone: user.phone || '',
          avatar_url: user.avatar_url,
        });

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
      }

      // Đăng nhập thành công: Xóa bộ đếm khóa tạm
      clearStaffLockoutState();
      setLockoutRemainingSec(0);

      // Khi VITE_LEGACY_LOGIN='true', lưu phiên cục bộ làm phương án lùi; khi 'false' thì không lưu JSON phiên vào localStorage
      if (isLegacyLoginEnabled()) {
        saveActiveSessionUser(sessionUser, rememberMe);
      }

      if (typeof setCurrentUser === 'function') {
        setCurrentUser(sessionUser);
      }
      if (typeof setIsAuthenticated === 'function') {
        setIsAuthenticated(true);
      }

      // Lấy IP thực từ /api/whoami để ghi nhật ký kiểm toán
      const clientIp = await fetchClientIpAddress();

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
              ip_address: clientIp || getClientIpAddress(),
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
            u.id === sessionUser!.id || u.username === sessionUser!.username
              ? sanitizeUserForClient({ ...u, last_login: nowIso })
              : sanitizeUserForClient(u)
          ),
        }));
      }

      if (onSetParentStudent) onSetParentStudent(null);
      showToast(`✓ Chào mừng ${sessionUser.full_name} đã đăng nhập thành công!`, 'success');
      setLoginSuccess(`Chào mừng ${sessionUser.full_name}! Đang chuyển hướng...`);
      setIsStaffSubmitting(false);

      if (onLoginSuccess) {
        onLoginSuccess(sessionUser, rememberMe);
      }

      setTimeout(() => {
        setLoginSuccess(null);
        onClose();
      }, 400);
    } catch (err: any) {
      console.error('Lỗi đăng nhập:', err);
      setStaffError('Tên đăng nhập hoặc mật khẩu không đúng.');
      setIsStaffSubmitting(false);
    }
  };

  const handleParentPhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setParentError(null);

    // Giữ giới hạn lần thử ở client như lớp phụ (5 lần / 15 phút)
    const recentAttempts = getParentRecentAttempts();
    if (recentAttempts.length >= PARENT_MAX_ATTEMPTS) {
      setParentError('Bạn đã thử quá 5 lần trong 15 phút. Vui lòng thử lại sau hoặc liên hệ Văn phòng Học vụ.');
      return;
    }

    const cleanDigits = parentPhone.replace(/\D/g, '');
    const cleanStudentCode = parentStudentCode.trim().toUpperCase();

    if (!cleanDigits || cleanDigits.length < 9 || !cleanStudentCode) {
      recordParentAttempt();
      setParentError('Thông tin không khớp. Vui lòng kiểm tra lại SĐT và Mã học sinh hoặc liên hệ Văn phòng Học vụ.');
      return;
    }

    setIsParentSubmitting(true);

    try {
      const res = await fetch('/api/parent/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          phone: cleanDigits,
          studentCode: cleanStudentCode,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.token || !data?.student) {
        recordParentAttempt();
        setParentError(
          data?.error ||
            'Thông tin không khớp. Vui lòng kiểm tra lại SĐT và Mã học sinh hoặc liên hệ Văn phòng Học vụ.'
        );
        setIsParentSubmitting(false);
        return;
      }

      // Lưu token HMAC-SHA256 vào sessionStorage
      try {
        sessionStorage.setItem('royal_parent_session_token', String(data.token));
      } catch {
        // ignore storage error
      }

      // Đối tượng student gọn từ server: { id, code, name, grade, dob, parent_name, parent_phone, campus_id }
      const verifiedStudent: Student = {
        id: String(data.student.id || ''),
        code: String(data.student.code || cleanStudentCode),
        name: String(data.student.name || ''),
        grade: String(data.student.grade || ''),
        dob: String(data.student.dob || ''),
        gender: 'Nam',
        parent_name: String(data.student.parent_name || ''),
        parent_phone: String(data.student.parent_phone || cleanDigits),
        campus_id: String(data.student.campus_id || 'pmh').toLowerCase() === 'pl' ? 'pl' : 'pmh',
        student_type: String(data.student.code || cleanStudentCode).startsWith('EXT-') ? 'external' : 'royal',
        is_royal_student: !String(data.student.code || cleanStudentCode).startsWith('EXT-'),
        status: 'active',
        created_at: '',
      };

      if (onSetParentStudent) onSetParentStudent(verifiedStudent);
      if (onOpenParentPortalWithStudent) {
        onOpenParentPortalWithStudent(verifiedStudent);
      }

      setLoginSuccess(`Chào mừng Phụ huynh bé ${verifiedStudent.name}! Đang mở Cổng Tra Cứu...`);
      setIsParentSubmitting(false);

      setTimeout(() => {
        setLoginSuccess(null);
        onClose();
      }, 600);
    } catch {
      recordParentAttempt();
      setParentError('Thông tin không khớp. Vui lòng kiểm tra lại SĐT và Mã học sinh hoặc liên hệ Văn phòng Học vụ.');
      setIsParentSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (supabase && supabase.auth) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Lỗi signOut Supabase:', err);
    }

    clearActiveSessionUser();

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

    setStaffUsername('');
    setStaffPassword('');
    setParentPhone('');
    setParentStudentCode('');
    setStaffError(null);
    setParentError(null);
    setLoginSuccess(null);

    showToast('Đã đăng xuất phiên làm việc thành công!', 'info');
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
            onClick={() => {
              setActiveTab('staff');
              setStaffError(null);
            }}
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
            onClick={() => {
              setActiveTab('parent');
              setParentError(null);
            }}
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

              {lockoutRemainingSec > 0 && (
                <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    Tạm khóa đăng nhập trên thiết bị này ({lockoutRemainingSec} giây) do nhập sai 5 lần liên tiếp.
                  </span>
                </div>
              )}

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
                    Vui lòng liên hệ <strong>Phòng CNTT &amp; Học Vụ</strong> hoặc Hotline: <strong>(028) 7108 7676</strong> để được cấp lại mật khẩu truy cập nội bộ.
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
                      onChange={e => {
                        setStaffUsername(e.target.value);
                        setStaffError(null);
                      }}
                      placeholder=""
                      disabled={lockoutRemainingSec > 0}
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500 disabled:opacity-50"
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
                      onChange={e => {
                        setStaffPassword(e.target.value);
                        setStaffError(null);
                      }}
                      placeholder="Nhập mật khẩu của bạn"
                      disabled={lockoutRemainingSec > 0}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500 disabled:opacity-50"
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
                    <span>Ghi nhớ đăng nhập</span>
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
                disabled={isStaffSubmitting || lockoutRemainingSec > 0}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                {isStaffSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Đang Xác Thực...</span>
                  </>
                ) : lockoutRemainingSec > 0 ? (
                  <>
                    <Lock className="w-4 h-4 text-slate-950" />
                    <span>Tạm khóa ({lockoutRemainingSec}s)</span>
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
                Phụ huynh vui lòng nhập đồng thời <strong>Số điện thoại đã đăng ký</strong> và <strong>Mã học sinh</strong> để tra cứu tiến độ học tập, điểm danh, suất bánh sữa và học phí.
              </div>

              {parentError && (
                <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{parentError}</span>
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
                      required
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Định dạng: 10 chữ số (VD: 0908 112 233)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Mã học sinh (Bắt buộc):
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      placeholder="VD: RY-2026-00001 hoặc EXT-2026-00001"
                      value={parentStudentCode}
                      onChange={e => {
                        setParentStudentCode(e.target.value);
                        setParentError(null);
                      }}
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs uppercase focus:outline-none focus:border-amber-500 transition-colors"
                      required
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Nhập chính xác Mã học viên được cấp trên thẻ học sinh hoặc phiếu thu học phí.
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

        {/* Support Info */}
        <div className="px-5 py-2.5 bg-black/60 border-t border-slate-900/80 text-[10px] text-slate-400 flex items-center justify-center">
          <div className="text-center space-y-0.5 leading-relaxed">
            <div>
              CƠ SỞ PHÚ MỸ HƯNG: <strong className="text-amber-400/90 font-mono">(028) 7108 7676 - 076 5420 355</strong>
            </div>
            <div>
              CƠ SỞ PHÚ LÂM: <strong className="text-amber-400/90 font-mono">(028) 7107 7676 - 076 7648 166</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
