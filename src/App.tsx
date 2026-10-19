import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { CompactHeaderToolbar } from './components/CompactHeaderToolbar';
import { OverviewKpiTab } from './components/tabs/OverviewKpiTab';
import { StudentsTab } from './components/tabs/StudentsTab';
import { ClassesTab } from './components/tabs/ClassesTab';
import { ScheduleTab } from './components/tabs/ScheduleTab';
import { AttendanceTab } from './components/tabs/AttendanceTab';
import { SnacksTab } from './components/tabs/SnacksTab';
import { MakeupCreditsTab } from './components/tabs/MakeupCreditsTab';
import { FinancePayrollTab } from './components/tabs/FinancePayrollTab';
import { ParentPortalTab } from './components/tabs/ParentPortalTab';
import { SettingsDataTab } from './components/tabs/SettingsDataTab';
import { TeacherAppModal } from './components/TeacherAppModal';
import { PrintModal, PrintDocumentType } from './components/PrintModal';
import { NotificationModal } from './components/NotificationModal';
import { ParentPortalModal } from './components/ParentPortalModal';
import { LoginPortalModal } from './components/LoginPortalModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { UsersManagementTab } from './components/tabs/UsersManagementTab';
import { loadStore, saveStore, AppStore } from './lib/storage';
import { exportMasterWorkbook } from './lib/excel';
import { UserRole, ExtracurricularClass, Student, TuitionInvoice, MakeupCredit, AppUser } from './types';

export default function App() {
  const [store, setStore] = useState<AppStore>(() => loadStore());

  // User Authentication State (Persists across F5 via localStorage)
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const stored = localStorage.getItem('royal_current_user');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // noop
    }
    return null;
  });

  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState<boolean>(false);

  // Set currentRole based on currentUser if logged in
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    try {
      const stored = localStorage.getItem('royal_current_user');
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
      localStorage.setItem('royal_current_user', JSON.stringify(user));
    } catch {
      // noop
    }
    setIsAdminLoginOpen(false);
    setCurrentRoute('sub_kpi');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('royal_current_user');
    } catch {
      // noop
    }
  };
  
  // Current active navigation route (handled via top navbar dropdowns and direct links)
  const [currentRoute, setCurrentRoute] = useState<string>('sub_kpi');

  // Filter states
  const [selectedCampusId, setSelectedCampusId] = useState<string>('all');
  const [selectedTermId, setSelectedTermId] = useState<string>(store.terms[0]?.id || 'term_fall_2026');
  const [timeRange, setTimeRange] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  const updateStore = (updater: (prev: AppStore) => AppStore) => {
    setStore(prev => {
      const next = updater(prev);
      saveStore(next);
      return next;
    });
  };

  // Quick Issue Credit from Alert Card
  const handleIssueCreditForStudent = (student: Student, cls: ExtracurricularClass, dates: string[]) => {
    const today = new Date();
    const expiry = new Date(today);
    expiry.setFullYear(today.getFullYear() + 1);

    const newCredit: MakeupCredit = {
      id: `cred_${Date.now()}`,
      credit_code: `MC-${today.getFullYear()}-${String(store.makeupCredits.length + 1).padStart(4, '0')}`,
      student_id: student.id,
      source_class_id: cls.id,
      subject_id: cls.subject_id,
      term_id: cls.term_id,
      consecutive_absent_count: dates.length,
      consecutive_dates: dates,
      source_rate: cls.price_per_session,
      credit_rule: 'monetary',
      total_credit_amount: cls.price_per_session * dates.length,
      transferred_sessions: dates.length,
      issue_date: today.toISOString().split('T')[0],
      expiry_date: expiry.toISOString().split('T')[0],
      status: 'issued',
    };

    updateStore(prev => ({
      ...prev,
      makeupCredits: [newCredit, ...prev.makeupCredits],
    }));

    setCurrentRoute('sub_credits');
    alert(`Đã lập Phiếu bảo lưu học phí ${newCredit.credit_code} cho học sinh ${student.name}!`);
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
          onOpenAdminLogin={() => setIsAdminLoginOpen(true)}
        />

        <AdminLoginModal
          isOpen={isAdminLoginOpen}
          onClose={() => setIsAdminLoginOpen(false)}
          users={store.users}
          onLoginSuccess={handleLoginSuccess}
        />
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

        <AdminLoginModal
          isOpen={isAdminLoginOpen}
          onClose={() => setIsAdminLoginOpen(false)}
          users={store.users}
          onLoginSuccess={handleLoginSuccess}
        />
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

          {/* Nhóm 2: ĐÀO TẠO & VẬN HÀNH */}
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
            <ScheduleTab
              store={store}
              currentRole={currentRole}
              selectedCampusId={selectedCampusId}
              onSelectCampus={setSelectedCampusId}
              onNavigateTab={setCurrentRoute}
              onSelectClassForAttendance={(cls) => {
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
              selectedClass={focusedClass}
              onSelectClass={setFocusedClass}
              onUpdateStore={updateStore}
              onPrintAttendanceBook={handlePrintAttendanceBook}
              onIssueCreditForStudent={handleIssueCreditForStudent}
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

          {/* Nhóm 3: HỌC VIÊN & TUYỂN SINH */}
          {(currentRoute === 'sub_students' || currentRoute === 'sub_students_health') && (
            <StudentsTab
              store={store}
              currentRole={currentRole}
              onUpdateStore={updateStore}
              onPrintStudentCard={handlePrintStudentCard}
              focusHealth={currentRoute === 'sub_students_health'}
            />
          )}

          {currentRoute === 'sub_parents' && (
            <ParentPortalTab
              store={store}
              currentRole={currentRole}
              onUpdateStore={updateStore}
              onOpenParentPortal={() => setIsParentPortalOpen(true)}
            />
          )}

          {currentRoute === 'sub_credits' && (
            <MakeupCreditsTab
              store={store}
              currentRole={currentRole}
              onUpdateStore={updateStore}
              onPrintCreditSlip={handlePrintCreditSlip}
            />
          )}

          {/* Nhóm 4: TÀI CHÍNH & KẾ TOÁN */}
          {(currentRoute === 'sub_finance' || currentRoute === 'sub_finance_invoices' || currentRoute === 'sub_finance_clearance') && (
            <FinancePayrollTab
              store={store}
              currentRole={currentRole}
              selectedCampusId={selectedCampusId}
              selectedTermId={selectedTermId}
              onUpdateStore={updateStore}
              onPrintReceipt={handlePrintReceipt}
              initialSection="invoices"
            />
          )}

          {currentRoute === 'sub_finance_payroll' && (
            <FinancePayrollTab
              store={store}
              currentRole={currentRole}
              selectedCampusId={selectedCampusId}
              selectedTermId={selectedTermId}
              onUpdateStore={updateStore}
              onPrintReceipt={handlePrintReceipt}
              initialSection="payroll"
            />
          )}

          {currentRoute === 'sub_finance_transfer' && (
            <FinancePayrollTab
              store={store}
              currentRole={currentRole}
              selectedCampusId={selectedCampusId}
              selectedTermId={selectedTermId}
              onUpdateStore={updateStore}
              onPrintReceipt={handlePrintReceipt}
              initialSection="transfer"
            />
          )}

          {/* Nhóm 5: HỆ THỐNG & DANH MỤC */}
          {currentRoute === 'sub_users' && (
            <UsersManagementTab
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
              onUpdateStore={updateStore}
              initialSection="clean_reset"
            />
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-[#07090E] py-3 text-center text-xs text-slate-500">
        <div className="max-w-[1780px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; 2026 Trường Song Ngữ Quốc Tế Hoàng Gia (Royal School). Bảo lưu mọi quyền.</span>
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
        onOpenAdminLogin={() => setIsAdminLoginOpen(true)}
        onNavigateToAdminLeads={() => {
          setIsParentPortalOpen(false);
          setCurrentRoute('sub_parents');
        }}
      />

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={isAdminLoginOpen}
        onClose={() => setIsAdminLoginOpen(false)}
        users={store.users}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Multi-role Login Portal Modal */}
      <LoginPortalModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        currentRole={currentRole}
        onChangeRole={setCurrentRole}
        store={store}
        currentParentStudent={currentParentStudent}
        onSetParentStudent={setCurrentParentStudent}
        onOpenParentPortalWithStudent={(st) => {
          setCurrentParentStudent(st);
          setIsParentPortalOpen(true);
        }}
      />

    </div>
  );
}
