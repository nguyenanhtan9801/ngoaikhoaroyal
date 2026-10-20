export type UserRole = 
  | 'super_admin' 
  | 'academic_accountant' 
  | 'academic_admissions' 
  | 'academic_staff'
  | 'admissions_staff'
  | 'admissions' 
  | 'teacher';

export type AttendanceStatus = 'present' | 'absent_excused' | 'absent_unexcused';
export type ClassItem = ExtracurricularClass;
export type Attendance = AttendanceRecord;
export type NotificationItem = SystemNotification;

export interface PricingRule {
  id: string;
  campus_id: string;
  term_id: string;
  subject_id: string;
  base_price?: number;
  discount_type?: 'percentage' | 'fixed_amount';
  discount_value?: number;
  custom_session_rate?: number;
  final_price: number;
  total_sessions: number;
  session_rate: number;
}

export interface AppUser {
  id: string;
  username: string;              // Tên đăng nhập duy nhất
  password: string;              // Mật khẩu
  full_name: string;             // Họ và tên nhân sự
  phone: string;
  email: string;
  role: UserRole;
  department: string;            // Phòng ban: Ban Giám Hiệu, Kế Toán, Tuyển Sinh, Tổ Bộ Môn...
  campus_id?: string;            // Thuộc cơ sở nào (hoặc 'all' cho Super Admin)
  teacher_id?: string;           // Nếu là giáo viên: liên kết với mã giáo viên trong danh sách GV
  status: 'active' | 'locked';   // Trạng thái tài khoản
  created_at: string;
}

export interface Campus {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  bank_owner: string;
  status: 'active' | 'inactive';
}

export type TermStatus = 'draft' | 'open_enrollment' | 'in_progress' | 'closed';

export interface AcademicTerm {
  id: string;
  code: string;
  name: string;
  academic_year: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  status: TermStatus;
  description?: string;
}

export interface SubjectCategory {
  id: string;
  code: string;
  name: string;
  color: 'amber' | 'purple' | 'cyan' | 'emerald' | 'blue' | 'rose' | 'indigo' | 'orange';
  icon: string;
  description?: string;
  status: 'active' | 'inactive';
  order?: number;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  category: string;
  standard_duration: string;
  description?: string;
}

export type DiscountType = 'none' | 'percentage' | 'fixed_amount';

// 1. Cấu hình Môn Học theo Khóa Học (Cấp Khóa Học)
export interface TermSubjectConfig {
  id: string;
  term_id: string;
  subject_id: string;
  is_active: boolean; // Môn có được mở trong khóa học này không
  standard_sessions: number; // Số buổi chuẩn của khóa cho môn này
  standard_course_fee: number; // Học phí trọn khóa chuẩn (gốc)
  standard_session_rate: number; // Đơn giá buổi chuẩn làm tròn lên
  discount_type?: DiscountType; // Chính sách ưu đãi khóa
  discount_value?: number; // % hoặc số tiền mặt
  discount_reason?: string; // Tên chương trình ưu đãi / lý do
  notes?: string;
}

// 2. Biểu phí theo Cơ Sở (Cấp Cơ Sở - Kế thừa hoặc Ghi đè biểu phí Khóa)
export interface CampusTermPricing {
  id: string;
  term_id: string;
  campus_id: string;
  subject_id: string;
  override_pricing: boolean; // false: Kế thừa từ TermSubjectConfig; true: Ghi đè biểu phí riêng cơ sở
  custom_course_fee?: number; // Học phí riêng của cơ sở (gốc)
  custom_sessions?: number; // Số buổi riêng của cơ sở
  custom_session_rate?: number; // Đơn giá buổi riêng làm tròn lên
  is_offered_at_campus: boolean; // Cơ sở có tổ chức môn này không
  discount_type?: DiscountType; // Ưu đãi riêng cơ sở
  discount_value?: number; // % hoặc số tiền mặt
  discount_reason?: string; // Tên chương trình ưu đãi riêng cơ sở
  notes?: string;
}

// Kết quả tính học phí có hiệu lực theo thứ tự ưu tiên: Cơ sở > Khóa > Mặc định
export interface EffectivePricingResult {
  source: 'campus_override' | 'term_standard' | 'subject_default';
  is_offered: boolean;
  total_sessions: number;
  base_course_fee: number; // Học phí gốc trước ưu đãi
  course_fee: number; // Học phí áp dụng thực tế sau ưu đãi
  session_rate: number; // Đơn giá buổi làm tròn lên trên học phí áp dụng
  override_pricing: boolean;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number; // Số tiền được giảm trừ cụ thể
  discount_reason?: string;
  notes?: string;
}

// Giữ tương thích ngược với cấu hình pricing cũ
export interface TermCampusSubjectPricing {
  id: string;
  term_id: string;
  campus_id: string;
  subject_id: string;
  base_price?: number;
  discount_type?: 'percentage' | 'fixed_amount';
  discount_value?: number;
  final_price: number;
  total_sessions: number;
  session_rate: number;
  custom_session_rate?: number;
  override_pricing?: boolean;
  custom_course_fee?: number;
  custom_sessions?: number;
  is_offered_at_campus?: boolean;
}

export interface Facility {
  id: string;
  name: string;
  campus_id: string;
  capacity: number;
  type: 'classroom' | 'field' | 'pool' | 'studio' | 'hall' | 'music_hall' | 'art_studio';
  is_active: boolean;
}

export interface TimeSlot {
  id: string;
  name: string;
  days_of_week: string[]; // e.g. ['T2', 'T4', 'T6'] or ['T7', 'CN']
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  slot_type: 'after_school' | 'weekend';
}

export interface Teacher {
  id: string;
  user_id?: string;
  name: string;
  phone: string;
  email: string;
  teacher_type: 'permanent' | 'visiting';
  fixed_rate_per_session: number; // for permanent
  percentage_rate: number; // for visiting (e.g. 60%)
  status: 'active' | 'inactive';
  subjects?: string[];
}

export interface ExtracurricularClass {
  id: string;
  name: string;
  term_id: string;
  campus_id: string;
  subject_id: string;
  facility_id: string;
  time_slot_id: string;
  days_of_week?: string[]; // e.g. ['T2', 'T4'] - Exactly 2 days per class
  primary_teacher_id: string;
  max_students: number;
  total_sessions: number;
  full_course_fee: number;
  price_per_session: number;
  status: 'active' | 'completed' | 'canceled';
  allow_over_quota?: boolean;
}

export interface Student {
  id: string;
  code: string; // RY-2026-xxxxx or EXT-2026-xxxxx
  previous_student_code?: string;
  name: string;
  dob: string;
  gender: 'Nam' | 'Nữ';
  parent_name: string;
  parent_phone: string;
  school_name?: string;
  regular_class?: string;
  is_royal_student: boolean; // true = eligible for snacks
  medical_notes?: string; // e.g. "Dị ứng đậu phộng, uống sữa không đường"
  status: 'active' | 'graduated' | 'dropped';
  created_at: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  class_id: string;
  registered_sessions: number;
  joined_date: string;
  status: 'trial' | 'active' | 'trial_dropped' | 'transferred' | 'completed' | 'dropped';
  trial_session_date?: string;          // Ngày diễn ra buổi học thử đầu tiên
  trial_outcome?: 'promoted' | 'dropped'; // Kết quả sau buổi thử
  trial_notes?: string;                 // Ghi chú đánh giá sau buổi học thử
}

export interface InvoicePaymentRecord {
  id: string;
  payment_date: string;          // Ngày nộp tiền
  amount: number;                // Số tiền nộp trong đợt này
  payment_method: 'bank_transfer' | 'cash'; // Chuyển khoản / Tiền mặt
  payment_reference: string;     // Mã giao dịch ngân hàng / Mã sao kê
  verified_by: string;           // Kế toán xác nhận
  notes?: string;                // Ghi chú đợt đóng (VD: Đóng đợt 1 - 2.000.000đ)
}

export interface TuitionInvoice {
  id: string;
  invoice_code: string;
  student_id: string;
  class_id: string;
  gross_amount: number;
  credit_deducted: number; // deducted from makeup credit
  net_payable: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: 'paid' | 'partial' | 'unpaid' | 'cancelled';
  due_date: string;
  vietqr_url?: string;
  payment_reference?: string;
  proof_image_url?: string;
  verified_by?: string;
  verified_at?: string;
  created_at: string;
  is_trial_pending?: boolean; // Tạm hoãn thu toàn khóa cho đến khi qua buổi học thử
  trial_fee?: number;         // Đơn giá 1 buổi thử (mặc định 0 nếu miễn phí thử)
  payment_history?: InvoicePaymentRecord[]; // Lịch sử các lần đóng tiền
}

export interface ClassSession {
  id: string;
  class_id: string;
  session_date: string;
  session_number: number;
  actual_teacher_id: string;
  is_substitute: boolean;
  snacks_allocated: number; // count of Royal students
  snacks_consumed: number; // Present Royal + Absent Unexcused Royal
  snacks_returned: number; // Absent Excused Royal
  status: 'scheduled' | 'completed' | 'canceled';
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  class_id: string;
  student_id: string;
  session_date: string;
  status: 'present' | 'absent_excused' | 'absent_unexcused';
  note?: string;
}

export interface MakeupCredit {
  id: string;
  credit_code: string;
  student_id: string;
  source_class_id: string;
  subject_id: string;
  term_id: string;
  consecutive_absent_count: number;
  consecutive_dates: string[];
  source_rate: number;
  credit_rule: 'monetary' | 'sessions';
  total_credit_amount: number;
  transferred_sessions: number;
  issue_date: string;
  expiry_date: string; // 1 year from issue
  status: 'issued' | 'applied' | 'expired';
  applied_class_id?: string;
  applied_at?: string;
  note?: string;
}

export interface ClassTransfer {
  id: string;
  student_id: string;
  from_class_id: string;
  to_class_id: string;
  remaining_sessions: number;
  old_session_rate: number;
  new_session_rate: number;
  surcharge_amount: number;
  transfer_date: string;
  created_by: string;
}

export interface TeacherPayrollSettlement {
  id: string;
  teacher_id: string;
  class_id: string;
  term_id: string;
  taught_sessions: number;
  substitute_sessions: number;
  class_revenue: number;
  calculation_type: 'fixed' | 'percentage';
  total_payroll: number;
  settled_date: string;
  is_settled: boolean;
}

export interface RegisteredSubjectItem {
  subject_id: string;
  subject_name?: string;
  time_slot: string; // e.g. 'after_school' | 'sat_morning' | 'sat_afternoon' | 'sun_morning' | 'sun_afternoon'
  time_slot_label: string;
  estimated_fee: number;
}

export interface ParentRegistration {
  id: string;
  registration_code?: string;
  code?: string; // alias for registration_code
  parent_name: string;
  parent_phone: string;
  parent_email?: string;
  student_name: string;
  student_dob: string;
  dob?: string; // alias for student_dob
  student_grade?: string;
  current_school?: string; // current school of student
  current_class?: string; // alias for regular class
  desired_campus_id: string;
  campus_id?: string; // alias for desired_campus_id
  desired_term_id?: string;
  desired_subject_id: string; // Primary subject for backward compat
  preferred_subject_id?: string; // alias for desired_subject_id
  desired_time_slot_type: 'after_school' | 'weekend';
  preferred_time_slot_id?: string; // alias
  registered_subjects?: RegisteredSubjectItem[]; // Multi-subject registrations with separate time slots
  is_royal_student: boolean;
  is_royal?: boolean; // alias for is_royal_student
  medical_notes?: string;
  notes?: string;
  estimated_fee?: number;
  discount_policy?: string;
  status: 'pending' | 'contacted' | 'enrolled' | 'partially_enrolled' | 'canceled';
  contact_notes?: string;
  student_id?: string;
  assigned_student_id?: string;
  assigned_class_id?: string;
  assigned_class_ids?: string[];
  assigned_student_code?: string;
  created_at: string;
}

export interface SystemNotification {
  id: string;
  type: 'debt_warning' | 'credit_expiring' | 'consecutive_absence' | 'enrollment_over_quota' | 'new_lead_registration' | 'drop_alert' | 'absence_alert' | 'new_registration';
  title: string;
  message: string;
  date: string;
  severity?: 'low' | 'medium' | 'high';
  read: boolean;
  metadata?: Record<string, any>;
}

export type LogActionType = 
  | 'AUTH_LOGIN_SUCCESS'      // Đăng nhập thành công
  | 'AUTH_LOGIN_FAILED'       // Đăng nhập thất bại (sai pass/bị khóa)
  | 'AUTH_LOGOUT'             // Đăng xuất
  | 'STUDENT_CREATE'          // Tạo hồ sơ học sinh
  | 'STUDENT_UPDATE'          // Cập nhật thông tin học sinh
  | 'STUDENT_DELETE'          // Xóa học sinh
  | 'CLASS_ASSIGN'            // Xếp lớp / ghi danh
  | 'CLASS_CREATE'            // Tạo lớp mới
  | 'ATTENDANCE_SAVE'         // Lưu điểm danh buổi
  | 'INVOICE_PAYMENT_COLLECT' // Gạch nợ / Thu học phí
  | 'CREDIT_ISSUE'            // Lập phiếu bảo lưu
  | 'CLASS_TRANSFER'          // Biến động chuyển lớp
  | 'DATABASE_RESET'          // Dọn sạch / Reset database
  | 'EXCEL_IMPORT'            // Import Master Excel
  | 'USER_CREATE'             // Tạo tài khoản nhân sự
  | 'USER_PASSWORD_CHANGE';   // Đổi mật khẩu

export interface AuditLogRecord {
  id: string;
  timestamp: string;          // Thời gian chính xác (ISO String & Giờ VN)
  user_id: string;            // ID người thực hiện
  username: string;           // Tên đăng nhập (VD: 'admin', 'ketoan_pl')
  user_role: string;          // Vai trò (Super Admin, Kế toán, Giáo viên...)
  full_name: string;          // Tên đầy đủ nhân sự
  action: LogActionType;      // Mã hành động
  category: 'AUTH' | 'ACADEMIC' | 'FINANCE' | 'SYSTEM'; // Phân nhóm nghiệp vụ
  target_entity: string;      // Thực thể bị tác động (Học sinh, Lớp học, Hóa đơn...)
  target_id?: string;         // ID của đối tượng bị tác động (Mã HV, Mã Lớp, Số Hóa đơn...)
  description: string;        // Mô tả chi tiết hành động đọc được bằng tiếng Việt
  details?: {
    before?: any;             // Dữ liệu trước khi sửa (nếu là hành động Update/Delete)
    after?: any;              // Dữ liệu sau khi sửa
    ip_address?: string;      // Địa chỉ IP hoặc User-Agent thiết bị
    status?: 'success' | 'failed';
  };
}
