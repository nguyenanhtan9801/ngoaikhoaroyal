import { 
  Campus, 
  AcademicTerm, 
  Subject, 
  Facility, 
  TimeSlot, 
  Teacher, 
  ClassItem, 
  Student, 
  Enrollment, 
  TuitionInvoice, 
  ClassSession, 
  Attendance, 
  MakeupCredit, 
  ParentRegistration, 
  PricingRule, 
  NotificationItem,
  UserRole,
  TeacherPayrollSettlement
} from '../types';

import { 
  initialCampuses, 
  initialTerms, 
  initialSubjects, 
  initialFacilities, 
  initialTimeSlots, 
  initialTeachers, 
  initialClasses, 
  initialStudents, 
  initialEnrollments, 
  initialInvoices, 
  initialClassSessions, 
  initialAttendance, 
  initialMakeupCredits, 
  initialParentRegistrations, 
  initialPricingRules,
  initialNotifications 
} from '../mock/initialData';

const STORAGE_KEY = 'royal_extracurricular_store_v1';

export interface AppState {
  campuses: Campus[];
  terms: AcademicTerm[];
  subjects: Subject[];
  facilities: Facility[];
  timeSlots: TimeSlot[];
  teachers: Teacher[];
  pricingRules: PricingRule[];
  classes: ClassItem[];
  students: Student[];
  enrollments: Enrollment[];
  invoices: TuitionInvoice[];
  sessions: ClassSession[];
  attendance: Attendance[];
  makeupCredits: MakeupCredit[];
  registrations: ParentRegistration[];
  notifications: NotificationItem[];
  settlements: TeacherPayrollSettlement[];
  currentRole: UserRole;
  selectedCampusId: string;
  selectedTermId: string;
}

export function getDefaultState(): AppState {
  return {
    campuses: initialCampuses,
    terms: initialTerms,
    subjects: initialSubjects,
    facilities: initialFacilities,
    timeSlots: initialTimeSlots,
    teachers: initialTeachers,
    pricingRules: initialPricingRules,
    classes: initialClasses,
    students: initialStudents,
    enrollments: initialEnrollments,
    invoices: initialInvoices,
    sessions: initialClassSessions,
    attendance: initialAttendance,
    makeupCredits: initialMakeupCredits,
    registrations: initialParentRegistrations,
    notifications: initialNotifications,
    settlements: [
      {
        id: 'set-001',
        teacher_id: 'tch-nam',
        class_id: 'cls-bk-01',
        term_id: 'term-2026-h1',
        taught_sessions: 4,
        substitute_sessions: 0,
        class_revenue: 21600000,
        calculation_type: 'fixed',
        total_payroll: 4 * 380000,
        settled_date: '2026-10-14',
        is_settled: false
      }
    ],
    currentRole: 'super_admin',
    selectedCampusId: 'all',
    selectedTermId: 'term-2026-h1'
  };
}

export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const def = getDefaultState();
      saveAppState(def);
      return def;
    }
    const parsed = JSON.parse(raw);
    return { ...getDefaultState(), ...parsed };
  } catch (err) {
    console.error('Error loading state from localStorage:', err);
    return getDefaultState();
  }
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Error saving state to localStorage:', err);
  }
}

// Reset Database Modules as specified in 5.1
export type ResetOption = 'operational_only' | 'students_only' | 'classes_only' | 'full_factory_reset';

export function executeDatabaseReset(option: ResetOption): AppState {
  const current = loadAppState();
  let updated: AppState;

  switch (option) {
    case 'operational_only':
      // Xóa dữ liệu vận hành & giao dịch: attendance, sessions, invoices, credits, settlements
      updated = {
        ...current,
        attendance: [],
        sessions: [],
        invoices: [],
        makeupCredits: [],
        settlements: [],
        notifications: [
          {
            id: 'notif-reset-' + Date.now(),
            type: 'debt_warning',
            title: 'Hệ thống đã dọn sạch dữ liệu vận hành',
            message: 'Đã xóa toàn bộ điểm danh, buổi học, hóa đơn và bảo lưu. Giữ nguyên danh mục lớp học & học sinh.',
            date: 'Vừa xong',
            severity: 'medium',
            read: false
          }
        ]
      };
      break;

    case 'students_only':
      // Xóa dữ liệu học sinh & ghi danh
      updated = {
        ...current,
        students: [],
        enrollments: [],
        invoices: [],
        attendance: [],
        makeupCredits: [],
        registrations: []
      };
      break;

    case 'classes_only':
      // Xóa lớp học & phân công
      updated = {
        ...current,
        classes: [],
        enrollments: [],
        sessions: [],
        attendance: [],
        invoices: [],
        settlements: []
      };
      break;

    case 'full_factory_reset':
    default:
      // Khôi phục về dữ liệu mẫu chuẩn ban đầu
      updated = getDefaultState();
      break;
  }

  saveAppState(updated);
  return updated;
}
