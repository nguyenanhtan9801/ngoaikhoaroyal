import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { CompactHeaderToolbar } from './components/CompactHeaderToolbar';
import { OverviewKpiTab } from './components/tabs/OverviewKpiTab';
import { StudentsTab } from './components/tabs/StudentsTab';
import { ClassesTab } from './components/tabs/ClassesTab';
import { AttendanceTab } from './components/tabs/AttendanceTab';
import { SnacksTab } from './components/tabs/SnacksTab';
import { MakeupCreditsTab } from './components/tabs/MakeupCreditsTab';
import { FinancePayrollTab } from './components/tabs/FinancePayrollTab';
import { ParentPortalTab } from './components/tabs/ParentPortalTab';
import { SettingsDataTab } from './components/tabs/SettingsDataTab';
import { AuditLogsTab } from './components/tabs/AuditLogsTab';
import { UserManagementTab } from './components/tabs/UserManagementTab';
import { TeacherAppModal } from './components/TeacherAppModal';
import { PrintModal, PrintDocumentType } from './components/PrintModal';
import { NotificationModal } from './components/NotificationModal';
import { ParentPortalModal } from './components/ParentPortalModal';
import { LoginPortalModal } from './components/LoginPortalModal';
import { ToastContainer } from './components/ToastContainer';
import { showToast } from './lib/toast';
import { loadStore, saveStore, AppStore, createAuditRecord, appendAuditLog, validateCreditNoteCreation, formatVND, normalizeCampusScope } from './lib/storage';
import { exportMasterWorkbook } from './lib/excel';
import { UserRole, ExtracurricularClass, Student, TuitionInvoice, MakeupCredit, AppUser, ClassTransfer } from './types';
import { useSupabaseRealtime } from './hooks/useSupabaseRealtime';
import { safeStorage } from './supabaseClient';

export default function App() {
  const [store, setStore] = useState<AppStore>(() => loadStore());

  // User Authentication State (Persists across F5 via safeStorage)
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const stored = safeStorage.getItem('royal_current_user');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // noop
    }
    const initialStore = loadStore();
    return initialStore.users[0] || {
      id: 'usr_admin',
      username: 'admin',
      password: '123',
      full_name: 'ThS. Nguyễn Hoàng Long',
      department: 'Ban Giám Hiệu & Quản Trị Hệ Thống',
      email: 'admin@royalschool.edu.vn',
      phone: '0908 112 233',
      role: 'super_admin',
      campus_id: 'all',
      status: 'active',
      created_at: '2026-08-01',
    };
  });

  // Set currentRole based on currentUser if logged in
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    try {
      const stored = safeStorage.getItem('royal_current_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u && u.role) return u.role;
      }
    } catch {
      // noop
    }
    return 'super_admin';
  });

  const handleLoginSuccess = (user: AppUser) => {
    setCurrentUser(user);
    setCurrentRole(user.role);
    try {
      safeStorage.setItem('royal_current_user', JSON.stringify(user));
      safeStorage.setItem('royal_auth_session', JSON.stringify(user));
    } catch {
      // noop
    }
    setIsLoginModalOpen(false);

    // Enforce campus scope if user is restricted to PMH or Phú Lâm
    const scopedCampus = normalizeCampusScope(user.campus_id);
    setSelectedCampusId(scopedCampus);

    // Điều hướng thông minh sau đăng nhập theo vai trò (Role-based Routing)
    if (user.role === 'teacher') {
      if (user.linked_teacher_id) {
        const teacherClass = store.classes.find(c => c.primary_teacher_id === user.linked_teacher_id);
        if (teacherClass) {
          setFocusedClass(teacherClass);
        }
      }
      setCurrentRoute('sub_attendance');
    } else if (user.role === 'admissions') {
      setCurrentRoute('sub_parents');
    } else if (user.role === 'accountant') {
      setCurrentRoute('sub_finance_invoices');
    } else {
      setCurrentRoute('sub_kpi');
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      const logoutRecord = createAuditRecord(
        'AUTH_LOGOUT',
        'AUTH',
        'Phiên Làm Việc',
        `Nhân sự ${currentUser.full_name} (@${currentUser.username}) đã đăng xuất an toàn khỏi hệ thống`,
        currentUser,
        { details: { status: 'success', ip_address: '192.168.1.45' } }
      );
      updateStore(prev => appendAuditLog(prev, logoutRecord));
    }
    setCurrentUser(null);
    try {
      safeStorage.removeItem('royal_current_user');
      safeStorage.removeItem('royal_auth_session');
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('royal_current_user');
      }
    } catch {
      // noop
    }
  };
  
  // Current active navigation route (handled via top navbar dropdowns and direct links)
  const [currentRoute, setCurrentRoute] = useState<string>('sub_kpi');

  // Filter states (respect campus scope if user is restricted to PMH or PL)
  const [selectedCampusId, setSelectedCampusId] = useState<string>(() =>
    normalizeCampusScope(currentUser?.campus_id)
  );
  const [selectedTermId, setSelectedTermId] = useState<string>(store.terms[0]?.id || 'term_fall_2026');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [studentSearchFilter, setStudentSearchFilter] = useState<string>('');

  // Selected class for attendance focus
  const [focusedClass, setFocusedClass] = useState<ExtracurricularClass | null>(store.classes[0] || null);

  // Modals
  const [isTeacherAppOpen, setIsTeacherAppOpen] = useState<boolean>(false);
  const [isParentPortalOpen, setIsParentPortalOpen] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [currentParentStudent, setCurrentParentStudent] = useState<Student | null>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const [printableDoc, setPrintableDoc] = useState<PrintDocumentType | null>(null);

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

  useEffect(() => {
    const handleUrlChange = () => {
      setIsStandalonePortal(checkIsStandalonePortal());
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Synchronize localStorage with event listener
  useEffect(() => {
    const handleStorageUpdate = () => {
      setStore(loadStore());
    };
    window.addEventListener('royal_store_updated', handleStorageUpdate);
    return () => window.removeEventListener('royal_store_updated', handleStorageUpdate);
  }, []);

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
    if (!currentUser || currentUser.is_root || currentUser.username === 'overadmin') return;
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

  const updateStore = (updater: (prev: AppStore) => AppStore) => {
    setStore(prev => {
      const next = updater(prev);
      saveStore(next);
      return next;
    });
  };

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

  // 1. PUBLIC ENTRYPOINT: If user is not logged in, show Public Parent Portal directly with "Đăng Nhập Quản Trị" button
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans tracking-[-0.011em] antialiased">
        <ParentPortalModal
          store={store}
          isOpen={true}
          isStandalonePage={true}
          currentRole={currentRole}
          currentUser={null}
          onClose={() => {}}
          onUpdateStore={updateStore}
          onOpenAdminLogin={() => setIsLoginModalOpen(true)}
        />

        <LoginPortalModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          currentRole={currentRole}
          onChangeRole={(role) => {
            setCurrentRole(role);
            const defaultUser: AppUser = {
              id: `usr_${role}`,
              username: `${role}_staff`,
              password: '123',
              full_name: 'Cán bộ Royal School',
              department: 'Phòng Đào Tạo & Quản Trị',
              email: `${role}@royalschool.edu.vn`,
              phone: '0908 123 456',
              role,
              campus_id: 'all',
              status: 'active',
              created_at: '2026-08-01',
            };
            const user = store.users.find(u => u.role === role) || defaultUser;
            handleLoginSuccess(user);
          }}
          store={store}
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

  // 2. STANDALONE PORTAL (if explicitly opened via ?portal=parent while logged in)
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
          onChangeRole={(role) => {
            setCurrentRole(role);
            const defaultUser: AppUser = {
              id: `usr_${role}`,
              username: `${role}_staff`,
              password: '123',
              full_name: 'Cán bộ Royal School',
              department: 'Phòng Đào Tạo & Quản Trị',
              email: `${role}@royalschool.edu.vn`,
              phone: '0908 123 456',
              role,
              campus_id: 'all',
              status: 'active',
              created_at: '2026-08-01',
            };
            const user = store.users.find(u => u.role === role) || defaultUser;
            handleLoginSuccess(user);
          }}
          store={store}
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

  // 3. ADMIN DASHBOARD: User is authenticated as staff
  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans tracking-[-0.011em] antialiased">
      
      {/* Top Navbar with Dropdown Submenus & Hamburger Drawer */}
      <Navbar
        currentRoute={currentRoute}
        onNavigate={setCurrentRoute}
        currentRole={currentRole}
        onChangeRole={setCurrentRole}
        onOpenTeacherApp={() => setIsTeacherAppOpen(true)}
        onOpenParentPortal={() => setIsParentPortalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        currentParentStudent={currentParentStudent}
        notifications={store.notifications}
        onOpenNotifications={() => setIsNotificationOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
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
              onUpdateStore={updateStore}
              initialSection="pricing"
              initialSubTab="subjects"
            />
          )}

          {currentRoute === 'sub_pricing' && (
            <SettingsDataTab
              store={store}
              currentRole={currentRole}
              onUpdateStore={updateStore}
              initialSection="pricing"
              initialSubTab="matrix"
            />
          )}

          {currentRoute === 'sub_schedule' && (
            <ClassesTab
              store={store}
              currentRole={currentRole}
              selectedCampusId={selectedCampusId}
              selectedTermId={selectedTermId}
              onUpdateStore={updateStore}
              onSelectClassForAttendance={(cls: ExtracurricularClass) => {
                setFocusedClass(cls);
                setCurrentRoute('sub_attendance');
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

          {currentRoute === 'sub_audit_logs' && (
            <AuditLogsTab
              store={store}
              currentRole={currentRole}
              currentUser={currentUser}
              onUpdateStore={updateStore}
              onOpenLoginModal={() => setIsLoginModalOpen(true)}
            />
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-[#07090E] py-3 text-center text-xs text-slate-500">
        <div className="max-w-[1780px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; 2026 Trường Song Ngữ Quốc Tế Hoàng Gia. Bảo lưu mọi quyền.</span>
          <span className="font-mono text-amber-500/80">Hệ Thống Quản Lý Ngoại Khóa v2.6</span>
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
        onChangeRole={setCurrentRole}
        store={store}
        currentUser={currentUser}
        onUpdateStore={updateStore}
        onLoginSuccess={handleLoginSuccess}
        currentParentStudent={currentParentStudent}
        onSetParentStudent={setCurrentParentStudent}
        onOpenParentPortalWithStudent={(st) => {
          setCurrentParentStudent(st);
          setIsParentPortalOpen(true);
        }}
      />

      {/* Global Bottom-Right Floating Toast Notifications */}
      <ToastContainer />

    </div>
  );
}
