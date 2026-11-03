import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { CompactHeaderToolbar } from './components/CompactHeaderToolbar';
import { OverviewKpiTab } from './components/tabs/OverviewKpiTab';
import { StudentsTab } from './components/tabs/StudentsTab';
import { ClassesTab } from './components/tabs/ClassesTab';
import { ScheduleCalendarView } from './components/tabs/ScheduleCalendarView';
import { AttendanceTab } from './components/tabs/AttendanceTab';
import { SnacksTab } from './components/tabs/SnacksTab';
import { MakeupCreditsTab } from './components/tabs/MakeupCreditsTab';
import { FinancePayrollTab } from './components/tabs/FinancePayrollTab';
import { ParentPortalTab } from './components/tabs/ParentPortalTab';
import { SettingsDataTab } from './components/tabs/SettingsDataTab';
import { AuditLogsTab } from './components/tabs/AuditLogsTab';
import { UserManagementTab } from './components/tabs/UserManagementTab';
import { HolidayManagementView } from './components/settings/HolidayManagementView';
import { TeacherAppModal } from './components/TeacherAppModal';
import { PrintModal, PrintDocumentType } from './components/PrintModal';
import { NotificationModal } from './components/NotificationModal';
import { ParentPortalModal } from './components/ParentPortalModal';
import { LoginPortalModal } from './components/LoginPortalModal';
import { ToastContainer } from './components/ToastContainer';
import { showToast } from './lib/toast';
import {
  loadStore,
  saveStore,
  AppStore,
  createAuditRecord,
  appendAuditLog,
  validateCreditNoteCreation,
  formatVND,
  normalizeCampusScope,
  getActiveSessionUser,
  saveActiveSessionUser,
  clearActiveSessionUser,
  fetchClientIpAddress,
  getClientIpAddress,
  fetchActiveProfileFromSupabase,
  fetchAllProfilesFromSupabase,
  isLegacyLoginEnabled,
} from './lib/storage';
import { isRouteAllowed, getDefaultRouteForUser } from './lib/permissions';
import { exportMasterWorkbook } from './lib/excel';
import { UserRole, ExtracurricularClass, Student, TuitionInvoice, MakeupCredit, AppUser, ClassTransfer } from './types';
import { useSupabaseRealtime, recomputeDerivedRealtimeState } from './hooks/useSupabaseRealtime';
import { buildGuestCatalogStore, loadPublicCatalogSafely } from './services/dataLoader';
import { supabase } from './supabaseClient';
import { ShieldAlert, ArrowLeft, KeyRound, X, Loader2 } from 'lucide-react';

const ROUTE_HASH_MAP: Record<string, string> = {
  sub_kpi: 'kpi',
  sub_parents: 'parents',
  sub_students: 'students',
  sub_students_health: 'students-health',
  sub_credits: 'credits',
  sub_term_subjects: 'term-subjects',
  sub_pricing: 'pricing',
  sub_classes: 'classes',
  sub_schedule: 'schedule',
  sub_attendance: 'attendance',
  sub_snacks: 'snacks',
  sub_finance_invoices: 'invoices',
  sub_finance_payroll: 'payroll',
  sub_finance_transfer: 'transfer',
  sub_users: 'users',
  sub_settings: 'settings',
  sub_holidays: 'holidays',
  sub_audit_logs: 'audit-logs',
  sub_backup: 'backup',
};

// Hàm đọc route từ Hash URL hoặc Session khi khởi tạo
const getInitialRouteFromUrl = (): string => {
  if (typeof window === 'undefined') return 'sub_kpi';

  // 1. Kiểm tra Hash trên URL (#pricing, #students...)
  const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (hash) {
    for (const [routeId, hashName] of Object.entries(ROUTE_HASH_MAP)) {
      if (hash === hashName || hash === routeId) return routeId;
    }
  }

  // 2. Kiểm tra query param (?tab=pricing...)
  const params = new URLSearchParams(window.location.search);
  const tab = (params.get('tab') || params.get('view') || '').trim().toLowerCase();
  if (tab) {
    for (const [routeId, hashName] of Object.entries(ROUTE_HASH_MAP)) {
      if (tab === hashName || tab === routeId) return routeId;
    }
  }

  // 3. Kiểm tra sessionStorage lưu gần nhất
  try {
    const saved = sessionStorage.getItem('royal_last_active_route') || localStorage.getItem('royal_last_active_route');
    if (saved && ROUTE_HASH_MAP[saved]) return saved;
  } catch {
    // ignore
  }

  return 'sub_kpi';
};

export default function App() {
  // User Authentication State: Khi VITE_LEGACY_LOGIN='false', không chấp nhận phiên nào chỉ dựa trên JSON trong localStorage
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() =>
    isLegacyLoginEnabled() ? getActiveSessionUser() : null
  );

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    isLegacyLoginEnabled() ? Boolean(getActiveSessionUser()) : false
  );

  // Store cho khách (chưa đăng nhập nhân sự) chỉ chứa dữ liệu danh mục từ GET /api/public/catalog
  const [store, setStore] = useState<AppStore>(() => {
    const initialUser = isLegacyLoginEnabled() ? getActiveSessionUser() : null;
    return initialUser ? loadStore() : buildGuestCatalogStore();
  });

  // Nguyên tắc phân quyền: currentRole luôn lấy trực tiếp từ currentUser.role (bỏ mặc định 'super_admin' khi chưa đăng nhập)
  const currentRole: UserRole = currentUser?.role || 'teacher';

  const syncProfilesListForSuperAdmin = async (activeUser: AppUser) => {
    if (activeUser.role !== 'super_admin') return;
    const profilesList = await fetchAllProfilesFromSupabase();
    if (profilesList.length === 0) return;

    setStore(prev => {
      if (!isLegacyLoginEnabled()) {
        const next = {
          ...prev,
          users: profilesList,
        };
        saveStore(next);
        return next;
      }

      const mergedMap = new Map<string, AppUser>();
      for (const existing of prev.users || []) {
        mergedMap.set(existing.username.toLowerCase(), existing);
      }
      for (const prof of profilesList) {
        const key = prof.username.toLowerCase();
        const prevUser = mergedMap.get(key);
        mergedMap.set(key, {
          ...(prevUser || {}),
          ...prof,
          email: prof.email || prevUser?.email || `${prof.username}@royal.edu.vn`,
          phone: prof.phone || prevUser?.phone || '',
          department: prof.department || prevUser?.department || '',
          linked_teacher_id: prof.linked_teacher_id || prevUser?.linked_teacher_id,
        });
      }
      const next = {
        ...prev,
        users: Array.from(mergedMap.values()),
      };
      saveStore(next);
      return next;
    });
  };

  const handleLoginSuccess = (user: AppUser, rememberMe: boolean = true) => {
    const cleanUser = isLegacyLoginEnabled() ? saveActiveSessionUser(user, rememberMe) : user;
    setCurrentUser(cleanUser);
    setIsAuthenticated(true);
    setIsLoginModalOpen(false);
    syncProfilesListForSuperAdmin(cleanUser);

    // Enforce campus scope if user is restricted to PMH or Phú Lâm
    const scopedCampus = normalizeCampusScope(cleanUser.campus_id);
    setSelectedCampusId(scopedCampus);

    // Điều hướng thông minh sau đăng nhập theo vai trò (Role-based Routing)
    if (cleanUser.role === 'teacher') {
      const teacherClasses = store.classes.filter(
        c =>
          (cleanUser.linked_teacher_id && c.primary_teacher_id === cleanUser.linked_teacher_id) ||
          (c as any).assistant_teacher_id === cleanUser.linked_teacher_id
      );
      if (teacherClasses.length === 1) {
        setFocusedClass(teacherClasses[0]);
      } else {
        setFocusedClass(null);
      }
      setCurrentRoute('sub_attendance');
    } else {
      setCurrentRoute(getDefaultRouteForUser(cleanUser));
    }
  };

  const handleLogout = async () => {
    try {
      // 1. Đăng xuất khỏi Supabase Auth trước
      if (supabase && supabase.auth) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Lỗi signOut Supabase:', err);
    }

    if (currentUser) {
      const clientIp = await fetchClientIpAddress();
      const logoutRecord = createAuditRecord(
        'AUTH_LOGOUT',
        'AUTH',
        'Phiên Làm Việc',
        `Nhân sự ${currentUser.full_name} (@${currentUser.username}) đã đăng xuất an toàn khỏi hệ thống`,
        currentUser,
        { details: { status: 'success', ip_address: clientIp || getClientIpAddress() } }
      );
      updateStore(prev => appendAuditLog(prev, logoutRecord));
    }

    // 2. Reset toàn bộ state người dùng & đưa store về chế độ danh mục công khai dành cho khách
    setCurrentUser(null);
    setIsAuthenticated(false);
    loadPublicCatalogSafely().then(res => setStore(res.store)).catch(() => {
      setStore(prev => buildGuestCatalogStore(prev));
    });

    // 3. Xóa sạch dữ liệu phiên đăng nhập cục bộ sau khi signOut()
    try {
      localStorage.removeItem('royal_token');
      localStorage.removeItem('sb-access-token');
      localStorage.removeItem('sb-refresh-token');
      localStorage.removeItem('royal_school_supabase_auth');
      sessionStorage.clear();
    } catch {
      // noop
    }
    clearActiveSessionUser();

    // 4. Mở modal đăng nhập bắt buộc và khóa màn hình Dashboard
    setIsLoginModalOpen(true);
  };
  
  // Current active navigation route (handled via top navbar dropdowns, direct links, and URL Hash)
  const [currentRoute, setCurrentRoute] = useState<string>(() => getInitialRouteFromUrl());

  // Filter states (respect campus scope if user is restricted to PMH or PL)
  const [selectedCampusId, setSelectedCampusId] = useState<string>(() =>
    normalizeCampusScope(currentUser?.campus_id)
  );
  const [selectedTermId, setSelectedTermId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [studentSearchFilter, setStudentSearchFilter] = useState<string>('');

  // Selected class for attendance focus (do not auto-open store.classes[0] for teachers with multiple classes)
  const [focusedClass, setFocusedClass] = useState<ExtracurricularClass | null>(() => {
    const initialUser = getActiveSessionUser();
    if (initialUser?.role === 'teacher') {
      return null;
    }
    return store.classes[0] || null;
  });

  // Modals
  const [isTeacherAppOpen, setIsTeacherAppOpen] = useState<boolean>(false);
  const [isParentPortalOpen, setIsParentPortalOpen] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [currentParentStudent, setCurrentParentStudent] = useState<Student | null>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const [printableDoc, setPrintableDoc] = useState<PrintDocumentType | null>(null);

  // Change Password Modal State (cho người đang đăng nhập)
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState<boolean>(false);
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);

  // Khởi động app: dùng supabase.auth.getSession() và onAuthStateChange để khôi phục phiên, sau đó nạp lại profiles
  useEffect(() => {
    let isMounted = true;

    const syncSessionWithProfiles = async (
      sessionUser: { id: string; email?: string; last_sign_in_at?: string } | null
    ) => {
      if (!isMounted) return;

      if (sessionUser?.id) {
        const { user: profileUser, status } = await fetchActiveProfileFromSupabase(
          sessionUser.id,
          sessionUser.email,
          sessionUser.last_sign_in_at
        );

        if (!isMounted) return;

        if (profileUser && status === 'active') {
          if (isLegacyLoginEnabled()) {
            saveActiveSessionUser(profileUser, true);
          }
          setCurrentUser(profileUser);
          setIsAuthenticated(true);
          setSelectedCampusId(normalizeCampusScope(profileUser.campus_id));
          syncProfilesListForSuperAdmin(profileUser);
        } else {
          // Nếu tài khoản bị khóa hoặc không có profile active
          try {
            await supabase?.auth.signOut();
          } catch {
            // noop
          }
          if (!isLegacyLoginEnabled() || status === 'locked') {
            clearActiveSessionUser();
            setCurrentUser(null);
            setIsAuthenticated(false);
          }
        }
      } else {
        // Không có phiên Supabase Auth: nếu VITE_LEGACY_LOGIN='false', từ chối mọi phiên chỉ dựa trên JSON trong localStorage
        if (!isLegacyLoginEnabled()) {
          clearActiveSessionUser();
          setCurrentUser(null);
          setIsAuthenticated(false);
        }
      }
    };

    if (supabase?.auth) {
      let hasStoredAuthSession = false;
      try {
        hasStoredAuthSession = Boolean(localStorage.getItem('royal_school_supabase_auth'));
      } catch {
        hasStoredAuthSession = false;
      }

      if (hasStoredAuthSession) {
        supabase.auth
          .getSession()
          .then(({ data }) => {
            syncSessionWithProfiles(data?.session?.user || null);
          })
          .catch(() => {
            if (!isLegacyLoginEnabled() && isMounted) {
              clearActiveSessionUser();
              setCurrentUser(null);
              setIsAuthenticated(false);
            }
          });
      } else if (!isLegacyLoginEnabled()) {
        clearActiveSessionUser();
        setCurrentUser(null);
        setIsAuthenticated(false);
      }

      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          clearActiveSessionUser();
          if (isMounted) {
            setCurrentUser(null);
            setIsAuthenticated(false);
          }
          return;
        }
        if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED' ||
          (event === 'INITIAL_SESSION' && session?.user)
        ) {
          syncSessionWithProfiles(session?.user || null);
        }
      });

      return () => {
        isMounted = false;
        authListener?.subscription.unsubscribe();
      };
    } else if (!isLegacyLoginEnabled()) {
      clearActiveSessionUser();
      setCurrentUser(null);
      setIsAuthenticated(false);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError(null);

    const cleanNew = newPasswordInput.trim();
    const cleanConfirm = confirmPasswordInput.trim();

    if (cleanNew.length < 10) {
      setChangePasswordError('Mật khẩu mới bắt buộc phải có tối thiểu 10 ký tự.');
      return;
    }

    if (cleanNew !== cleanConfirm) {
      setChangePasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }

    if (!supabase?.auth) {
      setChangePasswordError('Không thể kết nối dịch vụ xác thực Supabase Auth.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: cleanNew });
      if (error) {
        setChangePasswordError(error.message || 'Không thể đổi mật khẩu. Vui lòng đăng nhập lại qua Supabase Auth.');
        setIsChangingPassword(false);
        return;
      }

      showToast('✓ Đổi mật khẩu thành công!', 'success');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setIsChangePasswordOpen(false);
    } catch (err: any) {
      setChangePasswordError(err?.message || 'Lỗi khi cập nhật mật khẩu.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Standalone Parent Portal Page (?portal=parent, ?page=parent_portal or #parent_portal)
  const checkIsStandalonePortal = (): boolean => {
    try {
      const params = new URLSearchParams(window.location.search);
      const portal = params.get('portal');
      const page = params.get('page');
      const mode = params.get('mode');
      const hash = window.location.hash.toLowerCase();
      return (
        portal === 'parent' ||
        portal === 'true' ||
        portal === 'parent_portal' ||
        page === 'parent_portal' ||
        page === 'parent' ||
        mode === 'parent' ||
        hash === '#parent_portal' ||
        hash === '#parent' ||
        hash === '#portal'
      );
    } catch {
      return false;
    }
  };

  const [isStandalonePortal, setIsStandalonePortal] = useState<boolean>(() => checkIsStandalonePortal());

  // Đồng bộ 2 chiều: Khi currentRoute thay đổi -> Cập nhật URL Hash & lưu sessionStorage/localStorage
  useEffect(() => {
    if (typeof window === 'undefined' || checkIsStandalonePortal()) return;
    const targetHash = ROUTE_HASH_MAP[currentRoute] || 'kpi';
    const currentCleanHash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    if (currentCleanHash !== targetHash) {
      window.history.replaceState(null, '', `#${targetHash}`);
    }
    try {
      sessionStorage.setItem('royal_last_active_route', currentRoute);
      localStorage.setItem('royal_last_active_route', currentRoute);
    } catch {
      // ignore
    }
  }, [currentRoute]);

  useEffect(() => {
    const handleUrlChange = () => {
      const isPortal = checkIsStandalonePortal();
      setIsStandalonePortal(isPortal);
      if (!isPortal) {
        const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
        if (hash) {
          for (const [routeId, hashName] of Object.entries(ROUTE_HASH_MAP)) {
            if (hash === hashName || hash === routeId) {
              setCurrentRoute(routeId);
              break;
            }
          }
        }
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Synchronize cross-tab localStorage updates via native StorageEvent (chỉ khi đã có nhân sự đăng nhập)
  useEffect(() => {
    if (!currentUser) return;
    const handleStorageUpdate = (e: StorageEvent) => {
      if (e.key && e.key !== 'royal_extracurricular_store_v4_clean') return;
      setStore(recomputeDerivedRealtimeState(loadStore()));
    };
    window.addEventListener('storage', handleStorageUpdate);
    return () => window.removeEventListener('storage', handleStorageUpdate);
  }, [currentUser?.id]);

  // Cơ chế thu hồi phiên tức thì (Instant Session Invalidation) nếu tài khoản bị khóa & đồng bộ quyền hạn
  const forceLockoutCurrentUser = () => {
    showToast(
      'Tài khoản của bạn đã bị khóa bởi Quản trị viên.',
      'error',
      { title: 'Khóa Tài Khoản & Thu Hồi Phiên' }
    );
    setCurrentUser(null);
    setIsLoginModalOpen(true);
    try {
      localStorage.removeItem('royal_current_user');
      localStorage.removeItem('royal_auth_session');
      sessionStorage.removeItem('royal_current_user');
    } catch {
      // noop
    }
  };

  // Kênh lắng nghe & đồng bộ đa kênh thời gian thực (Supabase Realtime WebSockets: royal_hub_realtime)
  const realtime = useSupabaseRealtime({
    store,
    setStore,
    currentUser,
    onCurrentUserLocked: () => {
      forceLockoutCurrentUser();
    },
    onNewParentRegistration: reg => {
      showToast(
        `Phụ huynh ${reg.parent_name} vừa gửi đơn đăng ký cho bé ${reg.student_name} (${reg.parent_phone}).`,
        'info',
        { title: '🔔 Đơn Đăng Ký Tuyển Sinh Mới (Realtime)' }
      );
    },
  });

  useEffect(() => {
    if (!currentUser) return;
    const latestInStore = store.users.find(
      u => u.id === currentUser.id || u.username.toLowerCase() === currentUser.username.toLowerCase()
    );
    if (!latestInStore) return;

    if (latestInStore.status === 'locked') {
      forceLockoutCurrentUser();
      return;
    }

    // Đồng bộ campus_id nếu người dùng bị giới hạn cơ sở
    const scoped = normalizeCampusScope(latestInStore.campus_id);
    if (scoped !== 'all' && selectedCampusId !== scoped) {
      setSelectedCampusId(scoped);
    }
  }, [store.users, currentUser, selectedCampusId]);

  const pendingRegistrationsCount = (store.parentRegistrations || []).filter(
    r => r.status === 'pending'
  ).length;

  const updateStore = useCallback((updater: (prev: AppStore) => AppStore) => {
    setStore(prev => {
      const next = updater(prev);
      if (next === prev) return prev;
      const recomputed = recomputeDerivedRealtimeState(next);
      saveStore(recomputed);
      return recomputed;
    });
  }, []);

  // Quick Issue Credit from Alert Card
  const handleIssueCreditForStudent = (student: Student, cls: ExtracurricularClass, dates: string[]) => {
    const validation = validateCreditNoteCreation(student.id, cls.id, store);
    if (validation.hasExistingCredit) {
      showToast(
        validation.quotaErrorMessage || 'Môn học này đã được cấp 1 phiếu bảo lưu trong khóa học hiện tại!',
        'warning',
        { title: 'Vượt định mức bảo lưu (1 lần/môn/khóa)' }
      );
      setCurrentRoute('sub_credits');
      return;
    }

    const effectiveCount = Math.max(dates.length, validation.maxConsecutiveExcused);
    if (effectiveCount < 3) {
      showToast(
        validation.streakErrorMessage ||
          `Không đủ điều kiện: Học sinh cần có ít nhất 3 buổi vắng có phép liên tục không ngắt quãng (Hiện tại: ${effectiveCount} buổi).`,
        'error',
        { title: 'Chưa đủ điều kiện bảo lưu' }
      );
      return;
    }

    const effectiveDates =
      validation.validSessionDates.length >= 3 ? validation.validSessionDates : dates;

    const today = new Date();
    const expiry = new Date(today);
    expiry.setFullYear(today.getFullYear() + 1);
    const expiryStr = expiry.toISOString().split('T')[0];

    const newCredit: MakeupCredit = {
      id: `cred_${Date.now()}`,
      credit_code: `CRE-${today.getFullYear()}-${String(store.makeupCredits.length + 1).padStart(4, '0')}`,
      student_id: student.id,
      student_name: student.name,
      source_class_id: cls.id,
      source_term_id: cls.term_id,
      subject_id: cls.subject_id,
      term_id: cls.term_id,
      consecutive_absent_sessions: effectiveDates.length,
      consecutive_absent_count: effectiveDates.length,
      absent_dates: effectiveDates,
      consecutive_dates: effectiveDates,
      unit_price_old: cls.price_per_session,
      source_rate: cls.price_per_session,
      credit_rule: 'monetary',
      total_credit_amount: cls.price_per_session * effectiveDates.length,
      transferred_sessions: effectiveDates.length,
      issue_date: today.toISOString().split('T')[0],
      expiry_date: expiryStr,
      expires_at: expiryStr,
      status: 'issued',
      note: `Bảo lưu ${effectiveDates.length} buổi vắng có phép liên tiếp có minh chứng hợp lệ`,
    };

    const creditLog = createAuditRecord(
      'CREDIT_ISSUE',
      'FINANCE',
      'Phiếu Bảo Lưu Học Phí',
      `Lập phiếu bảo lưu ${newCredit.credit_code} cho học sinh ${student.name} (Vắng liên tiếp ${newCredit.consecutive_absent_count} buổi, Giá trị: ${formatVND(newCredit.total_credit_amount)})`,
      currentUser,
      {
        target_id: newCredit.credit_code,
        details: {
          status: 'success',
          after: {
            credit_code: newCredit.credit_code,
            student_name: student.name,
            class_name: cls.name,
            amount: newCredit.total_credit_amount,
            absent_count: newCredit.consecutive_absent_count,
            expiry_date: newCredit.expiry_date,
          },
        },
      }
    );

    updateStore(prev => ({
      ...prev,
      makeupCredits: [newCredit, ...prev.makeupCredits],
      auditLogs: [creditLog, ...(prev.auditLogs || [])],
    }));

    setCurrentRoute('sub_credits');
    showToast(
      `Đã lập Phiếu bảo lưu học phí ${newCredit.credit_code} cho học sinh ${student.name} (${effectiveDates.length} buổi • ${formatVND(newCredit.total_credit_amount)})!`,
      'success',
      { title: 'Cấp phiếu bảo lưu thành công' }
    );
  };

  // Print Handlers
  const handlePrintReceipt = (invoice: TuitionInvoice) => {
    const student = store.students.find(s => s.id === invoice.student_id);
    const cls = store.classes.find(c => c.id === invoice.class_id);
    setPrintableDoc({
      type: 'receipt',
      invoice,
      student,
      cls,
    });
  };

  const handlePrintAttendanceBook = (cls: ExtracurricularClass, sessionDate: string) => {
    const enrollments = store.enrollments.filter(e => e.class_id === cls.id && e.status === 'active');
    const students = enrollments.map(e => store.students.find(s => s.id === e.student_id)).filter(Boolean) as Student[];
    setPrintableDoc({
      type: 'attendance_book',
      cls,
      sessionDate,
      students,
    });
  };

  const handlePrintCreditSlip = (credit: MakeupCredit) => {
    const student = store.students.find(s => s.id === credit.student_id);
    const cls = store.classes.find(c => c.id === credit.source_class_id);
    setPrintableDoc({
      type: 'credit_slip',
      credit,
      student,
      cls,
    });
  };

  const handlePrintSnacksSlip = () => {
    const campus = store.campuses.find(c => c.id === selectedCampusId);
    const term = store.terms.find(t => t.id === selectedTermId);
    const sessions = store.sessions;
    const totalAllocated = sessions.reduce((a, s) => a + (s.snacks_allocated || 0), 0);
    const totalConsumed = sessions.reduce((a, s) => a + (s.snacks_consumed || 0), 0);
    const totalReturned = sessions.reduce((a, s) => a + (s.snacks_returned || 0), 0);

    setPrintableDoc({
      type: 'snack_slip',
      campusName: campus?.name || 'Toàn trường',
      termName: term?.name || 'Khóa hiện tại',
      totalAllocated,
      totalConsumed,
      totalReturned,
    });
  };

  const handlePrintStudentCard = (student: Student) => {
    setPrintableDoc({
      type: 'student_card',
      student,
    });
  };

  const handlePrintTransferAgreement = (tr: ClassTransfer) => {
    const student = store.students.find(s => s.id === tr.student_id);
    const fromClass = store.classes.find(c => c.id === tr.from_class_id);
    const toClass = store.classes.find(c => c.id === tr.to_class_id);
    const fromCampus = store.campuses.find(c => c.id === fromClass?.campus_id);
    const toCampus = store.campuses.find(c => c.id === toClass?.campus_id);
    const fromSubject = store.subjects.find(s => s.id === fromClass?.subject_id);
    const toSubject = store.subjects.find(s => s.id === toClass?.subject_id);

    setPrintableDoc({
      type: 'transfer_agreement',
      transfer: tr,
      student,
      fromClass,
      toClass,
      fromCampusName: fromCampus?.name,
      toCampusName: toCampus?.name,
      fromSubjectName: fromSubject?.name,
      toSubjectName: toSubject?.name,
    });
  };

  // 1. STANDALONE PORTAL (if explicitly opened via ?portal=parent while logged in or guest)
  if (isStandalonePortal) {
    return (
      <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans tracking-[-0.011em] antialiased">
        <ParentPortalModal
          store={store}
          isOpen={true}
          isStandalonePage={true}
          currentRole={currentRole}
          currentUser={currentUser}
          onClose={() => {
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete('portal');
              url.searchParams.delete('page');
              url.searchParams.delete('mode');
              if (url.hash.includes('parent') || url.hash.includes('portal')) {
                window.history.pushState({}, '', url.pathname + (url.search ? url.search : ''));
              } else {
                window.history.pushState({}, '', url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : ''));
              }
            } catch {
              // noop
            }
            setIsStandalonePortal(false);
          }}
          onLogout={handleLogout}
          onUpdateStore={updateStore}
          onOpenAdminLogin={() => setIsLoginModalOpen(true)}
          onNavigateToAdminLeads={() => {
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete('portal');
              url.searchParams.delete('page');
              url.searchParams.delete('mode');
              if (url.hash.includes('parent') || url.hash.includes('portal')) {
                window.history.pushState({}, '', url.pathname + (url.search ? url.search : ''));
              } else {
                window.history.pushState({}, '', url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : ''));
              }
            } catch {
              // noop
            }
            setIsStandalonePortal(false);
            setCurrentRoute('sub_parents');
          }}
        />

        <LoginPortalModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          currentRole={currentRole}
          store={store}
          currentUser={currentUser}
          setCurrentUser={setCurrentUser}
          isAuthenticated={isAuthenticated}
          setIsAuthenticated={setIsAuthenticated}
          onLogout={handleLogout}
          onUpdateStore={updateStore}
          onLoginSuccess={handleLoginSuccess}
          currentParentStudent={currentParentStudent}
          onSetParentStudent={setCurrentParentStudent}
          onOpenParentPortalWithStudent={(st) => {
            setCurrentParentStudent(st);
            setIsParentPortalOpen(true);
          }}
        />
        <ToastContainer />
      </div>
    );
  }

  // 2. RÀNG BUỘC BẢO VỆ ROUTE (PROTECTED ROUTE): Nếu chưa đăng nhập (!currentUser hoặc !isAuthenticated)
  if (!currentUser || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col items-center justify-center font-sans tracking-[-0.011em] antialiased relative overflow-hidden select-none p-4">
        {/* Nền đồ họa Hoàng Gia & hiệu ứng ánh sáng bảo mật */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.12),transparent_70%)]" />
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <LoginPortalModal
          isOpen={true}
          forceUnclosable={true}
          onClose={() => {}}
          currentRole={currentRole}
          store={store}
          currentUser={null}
          setCurrentUser={setCurrentUser}
          isAuthenticated={false}
          setIsAuthenticated={setIsAuthenticated}
          onLogout={handleLogout}
          onUpdateStore={updateStore}
          onLoginSuccess={handleLoginSuccess}
          currentParentStudent={currentParentStudent}
          onSetParentStudent={setCurrentParentStudent}
          onOpenParentPortalWithStudent={(st) => {
            setCurrentParentStudent(st);
            setIsParentPortalOpen(true);
          }}
        />

        <ToastContainer />
      </div>
    );
  }

  const routeAllowed = isRouteAllowed(currentRoute, currentUser);

  // 3. ADMIN DASHBOARD: User is authenticated as staff
  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans tracking-[-0.011em] antialiased">
      
      {/* Top Navbar with Dropdown Submenus & Hamburger Drawer */}
      <Navbar
        currentRoute={currentRoute}
        onNavigate={setCurrentRoute}
        currentRole={currentRole}
        onOpenTeacherApp={() => setIsTeacherAppOpen(true)}
        onOpenParentPortal={() => setIsParentPortalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        currentParentStudent={currentParentStudent}
        notifications={store.notifications}
        onOpenNotifications={() => setIsNotificationOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenChangePassword={() => {
          setNewPasswordInput('');
          setConfirmPasswordInput('');
          setChangePasswordError(null);
          setIsChangePasswordOpen(true);
        }}
        realtimeStatus={realtime.connectionState}
        onReconnectRealtime={realtime.reconnectNow}
        pendingRegistrationsCount={pendingRegistrationsCount}
      />

      {/* Main Body with Optimized Viewport for 1366x768 and Standard Displays */}
      <main className="flex-1 max-w-[1780px] w-full mx-auto px-2.5 sm:px-4 lg:px-5 py-2.5 sm:py-3 space-y-2.5 sm:space-y-3">
        
        {/* Compact Breadcrumb + Page Title + Action Buttons on same line */}
        <CompactHeaderToolbar
          currentRoute={currentRoute}
          onExportExcel={() => exportMasterWorkbook(store)}
          onPrintReport={handlePrintSnacksSlip}
        />



        {/* Content Display pushed higher up for maximum vertical density */}
        <div className="pt-1 transition-all duration-200">
          {!routeAllowed ? (
            <div className="rounded-3xl bg-[#111827]/90 border border-rose-500/30 p-10 text-center max-w-xl mx-auto my-8 space-y-4 shadow-2xl">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-extrabold text-white">Bạn không có quyền truy cập mục này</h2>
                <p className="text-xs text-slate-400">
                  Tài khoản <strong>{currentUser.full_name}</strong> (@{currentUser.username}) hiện không được phân quyền truy cập phân hệ này.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentRoute(getDefaultRouteForUser(currentUser))}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-all shadow-lg shadow-amber-500/20"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Quay về trang mặc định của vai trò</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Nhóm 1: TỔNG QUAN & BÁO CÁO */}
              {currentRoute === 'sub_kpi' && (
                <OverviewKpiTab
                  store={store}
                  selectedCampusId={selectedCampusId}
                  selectedTermId={selectedTermId}
                  onNavigateTab={setCurrentRoute}
                  onIssueCreditForStudent={handleIssueCreditForStudent}
                />
              )}

              {/* Nhóm 2: HỌC VIÊN & TUYỂN SINH */}
              {(currentRoute === 'sub_students' || currentRoute === 'sub_students_health') && (
                <StudentsTab
                  store={store}
                  currentRole={currentRole}
                  onUpdateStore={updateStore}
                  onPrintStudentCard={handlePrintStudentCard}
                  focusHealth={currentRoute === 'sub_students_health'}
                  initialSearch={studentSearchFilter}
                />
              )}

              {currentRoute === 'sub_parents' && (
                <ParentPortalTab
                  store={store}
                  currentRole={currentRole}
                  currentUser={currentUser}
                  onUpdateStore={updateStore}
                  onOpenParentPortal={() => setIsParentPortalOpen(true)}
                  onNavigateToStudents={(studentCode) => {
                    setStudentSearchFilter(studentCode || '');
                    setCurrentRoute('sub_students');
                  }}
                />
              )}

              {currentRoute === 'sub_credits' && (
                <MakeupCreditsTab
                  store={store}
                  currentRole={currentRole}
                  currentUser={currentUser}
                  onUpdateStore={updateStore}
                  onPrintCreditSlip={handlePrintCreditSlip}
                />
              )}

              {/* Nhóm 3: ĐÀO TẠO & VẬN HÀNH */}
              {currentRoute === 'sub_term_subjects' && (
                <SettingsDataTab
                  store={store}
                  currentRole={currentRole}
                  currentUser={currentUser}
                  onUpdateStore={updateStore}
                  initialSection="pricing"
                  initialSubTab="subjects"
                />
              )}

              {currentRoute === 'sub_pricing' && (
                <SettingsDataTab
                  store={store}
                  currentRole={currentRole}
                  currentUser={currentUser}
                  onUpdateStore={updateStore}
                  initialSection="pricing"
                  initialSubTab="matrix"
                />
              )}

          {currentRoute === 'sub_schedule' && (
            <ScheduleCalendarView
              store={store}
              currentRole={currentRole}
              selectedCampusId={selectedCampusId}
              selectedTermId={selectedTermId}
              onSelectClassForAttendance={(cls: ExtracurricularClass) => {
                setFocusedClass(cls);
                setCurrentRoute('sub_attendance');
              }}
              onNavigateToSnacks={() => {
                setCurrentRoute('sub_snacks');
              }}
            />
          )}

          {currentRoute === 'sub_classes' && (
            <ClassesTab
              store={store}
              currentRole={currentRole}
              selectedCampusId={selectedCampusId}
              selectedTermId={selectedTermId}
              searchQuery={searchQuery}
              onSelectCampusId={setSelectedCampusId}
              onSelectTermId={setSelectedTermId}
              onUpdateStore={updateStore}
              onSelectClassForAttendance={(cls) => {
                setFocusedClass(cls);
                setCurrentRoute('sub_attendance');
              }}
            />
          )}

          {currentRoute === 'sub_attendance' && (
            <AttendanceTab
              store={store}
              currentRole={currentRole}
              currentUser={currentUser}
              selectedClass={focusedClass}
              onSelectClass={setFocusedClass}
              onUpdateStore={updateStore}
              onPrintAttendanceBook={handlePrintAttendanceBook}
              onIssueCreditForStudent={handleIssueCreditForStudent}
              onNavigateTab={(tab) => setCurrentRoute(tab as any)}
            />
          )}

          {currentRoute === 'sub_snacks' && (
            <SnacksTab
              store={store}
              currentRole={currentRole}
              selectedCampusId={selectedCampusId}
              selectedTermId={selectedTermId}
              onPrintSnacksReport={handlePrintSnacksSlip}
            />
          )}

          {/* Nhóm 4: TÀI CHÍNH & KẾ TOÁN */}
          {(currentRoute === 'sub_finance' || currentRoute === 'sub_finance_invoices' || currentRoute === 'sub_finance_clearance') && (
            <FinancePayrollTab
              store={store}
              currentRole={currentRole}
              currentUser={currentUser}
              selectedCampusId={selectedCampusId}
              selectedTermId={selectedTermId}
              searchQuery={searchQuery}
              onUpdateStore={updateStore}
              onPrintReceipt={handlePrintReceipt}
              onPrintTransferAgreement={handlePrintTransferAgreement}
              initialSection="invoices"
            />
          )}

          {currentRoute === 'sub_finance_payroll' && (
            <FinancePayrollTab
              store={store}
              currentRole={currentRole}
              currentUser={currentUser}
              selectedCampusId={selectedCampusId}
              selectedTermId={selectedTermId}
              searchQuery={searchQuery}
              onUpdateStore={updateStore}
              onPrintReceipt={handlePrintReceipt}
              onPrintTransferAgreement={handlePrintTransferAgreement}
              initialSection="payroll"
            />
          )}

          {currentRoute === 'sub_finance_transfer' && (
            <FinancePayrollTab
              store={store}
              currentRole={currentRole}
              currentUser={currentUser}
              selectedCampusId={selectedCampusId}
              selectedTermId={selectedTermId}
              searchQuery={searchQuery}
              onUpdateStore={updateStore}
              onPrintReceipt={handlePrintReceipt}
              onPrintTransferAgreement={handlePrintTransferAgreement}
              initialSection="transfer"
            />
          )}

          {currentRoute === 'sub_users' && (
            <UserManagementTab
              store={store}
              currentRole={currentRole}
              currentUser={currentUser}
              onUpdateStore={updateStore}
            />
          )}

          {currentRoute === 'sub_settings' && (
            <SettingsDataTab
              store={store}
              currentRole={currentRole}
              currentUser={currentUser}
              onUpdateStore={updateStore}
              initialSection="excel_master"
            />
          )}

          {currentRoute === 'sub_holidays' && (
            <HolidayManagementView
              store={store}
              onUpdateStore={updateStore}
            />
          )}

          {currentRoute === 'sub_audit_logs' && (
            <AuditLogsTab
              store={store}
              currentRole={currentRole}
              currentUser={currentUser}
              onUpdateStore={updateStore}
              onOpenLoginModal={() => setIsLoginModalOpen(true)}
            />
          )}

          {currentRoute === 'sub_backup' && (
            <SettingsDataTab
              store={store}
              currentRole={currentRole}
              currentUser={currentUser}
              onUpdateStore={updateStore}
              initialSection="backup"
            />
          )}
            </>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-[#07090E] py-3 text-center text-xs text-slate-500">
        <div className="max-w-[1780px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; 2026 Trung tâm Quản lý Học vụ - Dịch vụ</span>
          <span className="font-mono text-amber-500/80">Version 3.1</span>
        </div>
      </footer>

      {/* Teacher App Modal */}
      <TeacherAppModal
        store={store}
        isOpen={isTeacherAppOpen}
        onClose={() => setIsTeacherAppOpen(false)}
        onUpdateStore={updateStore}
      />

      {/* Print Preview & Print to PDF Modal */}
      <PrintModal
        document={printableDoc}
        onClose={() => setPrintableDoc(null)}
      />

      {/* Notification Center Modal */}
      <NotificationModal
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={store.notifications}
        onMarkAllAsRead={() => {
          updateStore(prev => ({
            ...prev,
            notifications: prev.notifications.map(n => ({ ...n, read: true })),
          }));
        }}
        onNavigateAction={(notif) => {
          if (notif.type === 'consecutive_absence') {
            setCurrentRoute('sub_credits');
          } else if (notif.type === 'debt_warning') {
            setCurrentRoute('sub_finance');
          } else if (notif.type === 'new_lead_registration' || notif.type === 'enrollment_over_quota') {
            setCurrentRoute('sub_parents');
          }
        }}
      />

      {/* Parent Course Registration Portal Modal */}
      <ParentPortalModal
        store={store}
        isOpen={isParentPortalOpen}
        onClose={() => setIsParentPortalOpen(false)}
        onUpdateStore={updateStore}
        initialStudent={currentParentStudent}
        currentRole={currentRole}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenAdminLogin={() => setIsLoginModalOpen(true)}
        onNavigateToAdminLeads={() => {
          setIsParentPortalOpen(false);
          setCurrentRoute('sub_parents');
        }}
      />

      {/* Multi-role Login Portal Modal */}
      <LoginPortalModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        currentRole={currentRole}
        store={store}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        isAuthenticated={isAuthenticated}
        setIsAuthenticated={setIsAuthenticated}
        onLogout={handleLogout}
        onUpdateStore={updateStore}
        onLoginSuccess={handleLoginSuccess}
        currentParentStudent={currentParentStudent}
        onSetParentStudent={setCurrentParentStudent}
        onOpenParentPortalWithStudent={(st) => {
          setCurrentParentStudent(st);
          setIsParentPortalOpen(true);
        }}
      />

      {/* Modal Đổi mật khẩu cho người đang đăng nhập */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-[#0B0F19] border border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Đổi Mật Khẩu Tài Khoản</h3>
                  <p className="text-[11px] text-slate-400">
                    Tài khoản: <strong className="text-amber-300 font-mono">@{currentUser?.username}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="p-6 space-y-4 text-xs">
              {changePasswordError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-semibold">
                  {changePasswordError}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-300 mb-1.5">
                  Mật khẩu mới (tối thiểu 10 ký tự) *
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  value={newPasswordInput}
                  onChange={e => {
                    setNewPasswordInput(e.target.value);
                    setChangePasswordError(null);
                  }}
                  placeholder="Nhập mật khẩu mới (>= 10 ký tự)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1.5">
                  Xác nhận mật khẩu mới *
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  value={confirmPasswordInput}
                  onChange={e => {
                    setConfirmPasswordInput(e.target.value);
                    setChangePasswordError(null);
                  }}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-extrabold flex items-center gap-1.5"
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang cập nhật...</span>
                    </>
                  ) : (
                    <span>Cập Nhật Mật Khẩu</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Bottom-Right Floating Toast Notifications */}
      <ToastContainer />

    </div>
  );
}
