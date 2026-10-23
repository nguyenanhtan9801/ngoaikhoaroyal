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
  total_weeks?: number;
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
  standard_duration?: string;
  description?: string;
  required_room_type?: string;
  is_active?: boolean;
}

export type SubjectMaster = Subject;

export interface CampusSubjectFee {
  id: string;                     // PK: term_id + campus_id + subject_id
  term_id: string;                // FK -> AcademicTerm.id
  campus_id: string;              // FK -> Campus.id
  subject_id: string;             // FK -> SubjectMaster.id
  standard_sessions: number;      // Số buổi chuẩn (VD: 24 buổi)
  price_per_session: number;      // Đơn giá 1 buổi Ceil chuẩn của cơ sở (VD: 166.250 đ)
  full_package_fee: number;       // standard_sessions * price_per_session
  is_activated: boolean;          // Đã kích hoạt tuyển sinh tại cơ sở này hay chưa
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
  code?: string; // Mã GV (VD: GV-PMH-001)
  name: string;
  phone: string;
  email: string;
  campus_id?: string; // Cơ sở hoạt động chính ('camp_pmh' | 'camp_pl' | 'all')
  type?: 'permanent' | 'visiting'; // Cơ hữu (Permanent) | Thỉnh giảng (Visiting)
  teacher_type: 'permanent' | 'visiting';
  default_rate_per_period?: number; // Định mức thù lao chuẩn 1 tiết (VD: 150,000 VNĐ/tiết)
  periods_per_session?: number; // Số tiết quy đổi trên 1 buổi học chuẩn (Mặc định: 2 tiết = 90 phút)
  weekend_multiplier?: number; // Hệ số phụ cấp ca cuối tuần T7/CN (Mặc định: 1.0, ví dụ 1.2 = +20%)
  custom_subject_rates?: {
    subject_id: string;
    rate_per_period: number; // Đơn giá tiết riêng nếu dạy môn đặc thù (VD: STEM/Robotics)
  }[];
  bank_account?: {
    bank_name: string;
    account_number: string;
    account_holder: string;
  };
  fixed_rate_per_session: number; // for permanent (= default_rate_per_period * periods_per_session)
  percentage_rate: number; // for visiting (e.g. 60%)
  status: 'active' | 'inactive';
  subjects?: string[];
}

export interface TeacherAttendanceRecord {
  id: string;
  class_id: string;
  term_id: string;
  campus_id: string;
  session_date: string; // YYYY-MM-DD
  session_number: number; // Buổi thứ mấy của lớp
  periods_count: number; // Số tiết thực dạy trong buổi (Mặc định: 2 tiết)
  assigned_teacher_id: string; // Giáo viên phân công chính thức của lớp
  actual_teacher_id: string; // Giáo viên thực tế đứng lớp (chính thức hoặc dạy thay)
  is_substitute: boolean; // true nếu là ca dạy thay
  substitute_reason?: string; // Lý do dạy thay
  status: 'present' | 'late' | 'absent_excused' | 'absent_unexcused' | 'substitute';
  late_minutes?: number; // Số phút đi muộn (nếu status === 'late')
  check_in_time?: string; // Giờ vào lớp thực tế (VD: '16:55')
  rate_per_period: number; // Đơn giá tiết áp dụng tại thời điểm chấm công
  total_payout: number; // Thành tiền buổi dạy = periods_count * rate_per_period (hoặc trừ phạt nếu quy định)
  verified_by?: string; // Học vụ xác nhận
  notes?: string; // Ghi chú (VD: "Cô Hương nghỉ ốm, Thầy Tuấn dạy thay 2 tiết")
}

export interface ExtracurricularClass {
  id: string;
  name: string;
  code?: string;
  term_id: string; // Khóa học gốc mở lớp (VD: Thu 2026)
  spanning_term_id?: string; // Khóa học vắt tiếp theo (VD: Xuân 2027)
  is_cross_term?: boolean; // Đánh dấu lớp vắt qua 2 khóa
  term_distribution?: {
    primary_term_sessions: number; // Số buổi ở khóa 1 (VD: 14)
    spanning_term_sessions: number; // Số buổi ở khóa 2 (VD: 10)
  };
  campus_id: string;
  subject_id: string;
  facility_id: string;
  room_id?: string;
  time_slot_id: string;
  time_slot?: string;
  days_of_week?: string[]; // e.g. ['T2', 'T4'] - Exactly 2 days per class
  start_date?: string; // Ngày bắt đầu mở lớp (YYYY-MM-DD)
  end_date?: string; // Ngày kết thúc dự kiến (YYYY-MM-DD)
  standard_sessions?: number; // Số buổi chuẩn ban đầu của môn học trong khóa (VD: 24)
  primary_teacher_id: string;
  max_students: number;
  current_students?: number;
  total_sessions: number; // Số buổi thực tế của lớp (VD: 18 hoặc 24)
  full_course_fee: number; // Học phí theo số buổi thực tế
  tuition_fee?: number; // Học phí chuẩn theo số buổi thực tế (tương thích schema)
  price_per_session: number;
  status: 'active' | 'completed' | 'canceled';
  allow_over_quota?: boolean;
}

export interface Student {
  id: string;
  code: string; // RY-2026-xxxxx or EXT-2026-xxxxx
  previous_student_code?: string;
  name: string;
  normalized_name?: string;
  dob: string;
  date_of_birth?: string;
  grade_level?: string;
  student_type?: 'royal' | 'external';
  gender: 'Nam' | 'Nữ';
  parent_name: string;
  parent_phone: string;
  school_name?: string;
  regular_class?: string;
  is_royal_student: boolean; // true = eligible for snacks
  medical_notes?: string; // e.g. "Dị ứng đậu phộng, uống sữa không đường"
  avatar_url?: string; // Hình thẻ học sinh 3x4 (URL hoặc base64, có thể tải lên sau)
  photo_stored_at?: string; // Vị trí thư mục Google Drive (VD: Google Drive: RoyalSchool_Drive_Storage_2026/01_TheHocVien/RY-2026-00001.jpg)
  drive_url?: string; // Link mở tệp trực tiếp trên Google Drive
  drive_file_id?: string; // Mã file Google Drive
  photo_updated_at?: string; // Ngày cập nhật hình thẻ
  status: 'active' | 'graduated' | 'dropped';
  created_at: string;
}

export type TeacherWorkSession = TeacherAttendanceRecord;

export interface Enrollment {
  id: string;
  student_id: string;
  class_id: string;
  registered_sessions: number;
  joined_date: string;
  enrolled_days_of_week?: string[];     // Mảng các thứ bé thực học (VD: ['T2'] thay vì ['T2', 'T4'])
  is_partial_schedule?: boolean;        // Đánh dấu học bán phần theo tuần (1 phần buổi trong tuần)
  status: 'trial' | 'active' | 'trial_dropped' | 'transferred' | 'completed' | 'dropped';
  is_trial?: boolean;                    // Đánh dấu lớp này bắt đầu bằng học thử
  trial_session_date?: string;          // Ngày diễn ra buổi học thử đầu tiên
  trial_attended?: boolean;             // Buổi thử đã được điểm danh hay chưa
  trial_completed_action?: 'promoted' | 'dropped'; // Kết quả xử lý sau buổi thử
  trial_outcome?: 'promoted' | 'dropped'; // Kết quả sau buổi thử (tương thích ngược)
  trial_notes?: string;                 // Ghi chú đánh giá sau buổi học thử
}

export interface InvoicePaymentRecord {
  id: string;
  payment_date: string;          // Ngày nộp tiền
  amount: number;                // Số tiền nộp trong đợt này
  payment_method: 'bank_transfer' | 'cash'; // Chuyển khoản / Tiền mặt
  payment_reference: string;     // Mã giao dịch ngân hàng / Mã sao kê
  receipt_drive_url?: string;    // Link chứng từ/sao kê lưu trên Google Drive
  receipt_stored_at?: string;    // Vị trí lưu trữ trên Google Drive: 04_HoaDonHocPhi
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
  discount_amount?: number; // Số tiền ưu đãi giảm trừ (nếu có)
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
  registered_sessions?: number; // Số buổi thực tế học sinh đăng ký
  total_class_sessions?: number; // Tổng số buổi chuẩn toàn khóa của lớp
  session_rate?: number;      // Đơn giá 1 buổi (Ceil) áp dụng
  start_date?: string;        // Ngày bắt đầu học chính thức (YYYY-MM-DD)
  enrolled_days_of_week?: string[]; // Mảng các thứ học sinh thực học (VD: ['T2'])
  is_partial_schedule?: boolean;    // Đánh dấu học bán phần theo tuần
  is_prorated?: boolean;      // Đánh dấu hóa đơn tính theo số buổi còn lại hoặc lịch riêng
  prorated_note?: string;     // Ghi chú minh bạch trên hóa đơn
  payment_history?: InvoicePaymentRecord[]; // Lịch sử các lần đóng tiền
}

export interface ClassSession {
  id: string;
  class_id: string;
  term_id?: string; // Ghi nhận chính xác buổi này thuộc Khóa nào (VD: Thu 2026 hoặc Xuân 2027)
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
  proof_file_name?: string;     // Tên file gốc (VD: don_xin_nghi_phep.jpg)
  proof_url?: string;           // URL xem ảnh cố định (Supabase Storage hoặc Drive link công khai)
  proof_base64?: string;        // Dữ liệu ảnh nén base64 lưu dự phòng nội bộ
  uploaded_at?: string;         // Thời gian upload
  uploaded_by?: string;         // Giáo viên/Nhân viên thực hiện
}

export interface CreditRedeemedInfo {
  target_term_id: string;        // Khóa sau được cấn trừ
  target_class_id: string;       // Lớp sau
  redemption_type: 'by_sessions' | 'by_amount'; // 'by_sessions' nếu rate_old >= rate_new, 'by_amount' nếu rate_old < rate_new
  applied_sessions?: number;     // Số buổi được bảo lưu (nếu rate_old >= rate_new)
  deducted_amount: number;       // Số tiền thực tế giảm trừ trên hóa đơn mới
  remaining_balance_due: number; // Số tiền phụ huynh cần đóng thêm (nếu có)
  redeemed_at: string;
  invoice_id?: string;
  invoice_code?: string;
}

export interface CreditNote {
  id: string;
  credit_code: string;                  // CRE-YYYY-XXXX
  student_id: string;
  student_name?: string;
  source_class_id: string;              // Lớp nguồn
  source_term_id?: string;              // Khóa học nguồn
  subject_id: string;
  term_id: string;
  consecutive_absent_sessions?: number; // Số buổi vắng liên tiếp (Bắt buộc >= 3)
  consecutive_absent_count: number;     // Số buổi vắng liên tiếp (Bắt buộc >= 3)
  absent_dates?: string[];              // Danh sách các ngày nghỉ liên tiếp
  consecutive_dates: string[];          // Danh sách các ngày nghỉ liên tiếp
  unit_price_old?: number;              // Đơn giá buổi cũ
  source_rate: number;                  // Đơn giá buổi cũ
  credit_rule: 'monetary' | 'sessions';
  total_credit_amount: number;          // Tổng tiền bảo lưu = Số buổi x unit_price_old
  transferred_sessions: number;
  issue_date: string;
  expiry_date: string;                  // 1 year from issue
  expires_at?: string;                  // Hạn 365 ngày
  status: 'available' | 'used' | 'expired' | 'cancelled' | 'issued' | 'applied';
  applied_class_id?: string;
  applied_at?: string;
  note?: string;
  // Dữ liệu khi cấn trừ vào khóa sau:
  redeemed_info?: CreditRedeemedInfo;
}

export type MakeupCredit = CreditNote;

export interface ClassTransfer {
  id: string;
  transfer_code?: string;
  student_id: string;
  from_class_id: string;
  to_class_id: string;
  remaining_sessions: number;
  old_session_rate: number;
  new_session_rate: number;
  surcharge_amount: number;
  surplus_amount?: number;
  surplus_handling?: 'standard_no_refund' | 'issue_credit_note' | 'convert_sessions';
  converted_sessions?: number;
  credit_note_id?: string;
  invoice_id?: string;
  reason?: string;
  notes?: string;
  transfer_date: string;
  created_by: string;
}

export type TransferRecord = ClassTransfer;

export interface TeacherPayrollSettlement {
  id: string;
  teacher_id: string;
  class_id: string; // Có thể lưu class_id cụ thể hoặc 'all' khi chốt toàn khóa
  term_id: string;
  campus_id?: string;
  taught_sessions: number;
  substitute_sessions: number;
  total_periods?: number;
  substitute_periods_added?: number;
  absent_periods_deducted?: number;
  class_revenue: number;
  calculation_type: 'fixed' | 'percentage' | 'period_rate';
  total_payroll: number;
  settled_date: string;
  is_settled: boolean;
  verified_by?: string;
  bank_reference?: string;
  notes?: string;
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
  linked_student_id?: string;
  assigned_class_id?: string;
  assigned_class_ids?: string[];
  assigned_student_code?: string;
  is_duplicate_lead?: boolean;
  duplicate_of_lead_id?: string;
  attachment_file_name?: string;
  attachment_url?: string;        // Link chứng từ đính kèm (giấy khai sinh, học bạ) trên Google Drive
  attachment_stored_at?: string;  // Vị trí lưu trữ Google Drive: 03_DonTuyenSinh
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

export interface GoogleDriveSubfolders {
  student_photos: string;        // '01_TheHocVien' (Ảnh thẻ học viên 3x4)
  attendance_proofs: string;     // '02_MinhChungDiemDanh' (Minh chứng phép & y tế)
  admissions: string;            // '03_DonTuyenSinh' (Hồ sơ đăng ký từ phụ huynh)
  tuition_invoices: string;      // '04_HoaDonHocPhi' (Hóa đơn & chứng từ chuyển khoản)
  reports: string;               // '05_BaoCaoThongKe' (Báo cáo, thù lao & Excel xuất)
  backups: string;               // '06_SaoLuuHeThong' (Snapshot sao lưu hệ thống)
}

export interface CloudStorageConfig {
  provider: 'internal_base64' | 'google_drive' | 'onedrive' | 'local'; // Phương thức lưu trữ chính (Khuyên dùng: internal_base64)
  storage_mode?: 'internal_base64' | 'google_drive_webapp' | 'google_drive_folder';
  google_script_url?: string;      // Google Apps Script Web App Endpoint vượt rào cản auth
  drive_folder_id?: string;        // ID thư mục gốc Google Drive
  drive_folder_name: string;       // Tên thư mục gốc
  drive_root_url?: string;         // Link xem thư mục gốc trên Google Drive
  drive_storage_quota?: {
    used_bytes: number;
    total_bytes: number;
    used_label: string;
    total_label: string;
  };
  subfolders: GoogleDriveSubfolders;
  onedrive_folder_url?: string;    // Tương thích ngược
  auto_create_subfolders: boolean; // Tự động tạo thư mục con theo Tháng/Khóa học
  updated_at?: string;
  updated_by?: string;
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
  | 'USER_PASSWORD_CHANGE'    // Đổi mật khẩu
  | 'STORAGE_CONFIG_UPDATE'   // Cập nhật cấu hình lưu trữ Cloud
  | 'TEACHER_RATE_UPDATE'     // Cập nhật định mức thù lao tiết dạy giáo viên
  | 'TEACHER_PAYROLL_SETTLE'; // Xác nhận quyết toán chi trả thù lao giáo viên

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
    [key: string]: any;
  };
}

export interface PayrollRateConfig {
  permanent_rate_per_period: number; // Đơn giá / tiết cho GV Cơ Hữu (VD: 150.000 đ)
  visiting_rate_per_period: number;  // Đơn giá / tiết cho GV Thỉnh Giảng (VD: 135.000 đ)
  periods_per_session: number;       // Số tiết chuẩn 1 buổi (Mặc định: 2 tiết)
  updated_at?: string;
  updated_by?: string;
}

export interface AppStore {
  users: AppUser[];
  campuses: Campus[];
  terms: AcademicTerm[];
  subjectCategories: SubjectCategory[];
  subjects: Subject[];
  termSubjects: TermSubjectConfig[];
  campusPricings: CampusTermPricing[];
  pricings: TermCampusSubjectPricing[];
  facilities: Facility[];
  timeSlots: TimeSlot[];
  teachers: Teacher[];
  classes: ExtracurricularClass[];
  students: Student[];
  enrollments: Enrollment[];
  invoices: TuitionInvoice[];
  sessions: ClassSession[];
  teacherAttendance?: TeacherAttendanceRecord[];
  attendance: AttendanceRecord[];
  makeupCredits: MakeupCredit[];
  transfers: ClassTransfer[];
  payrollSettlements: TeacherPayrollSettlement[];
  payrollRateConfig?: PayrollRateConfig;
  parentRegistrations: ParentRegistration[];
  notifications: SystemNotification[];
  auditLogs: AuditLogRecord[];
  telecomConfig: {
    zaloZnsEnabled: boolean;
    smsBrandnameEnabled: boolean;
    emailEnabled: boolean;
    brandName: string;
  };
  supabaseConfig: {
    url: string;
    anonKey: string;
    isConnected: boolean;
  };
  cloudStorageConfig?: CloudStorageConfig;
}
