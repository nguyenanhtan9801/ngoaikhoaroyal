import { SupabaseClient } from '@supabase/supabase-js';
import {
  getSupabaseClient,
  getResolvedSupabaseConfig,
  isValidSupabaseAnonJwt,
  sanitizeSupabaseBaseUrl,
  sanitizeSupabaseTableName,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabase,
} from '../supabaseClient';
import {
  AppStore,
  Campus,
  AcademicTerm,
  Subject,
  Teacher,
  ExtracurricularClass,
  Student,
  Enrollment,
  AttendanceRecord,
  TeacherAttendanceRecord,
  TuitionInvoice,
  MakeupCredit,
  AppUser,
} from '../types';

export interface TableColumnSpec {
  dbCol: string;
  excelHeader: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface StandardizedTableDefinition {
  index: string;
  sheetName: string;
  tableName: string;
  storeKey: keyof AppStore;
  titleVN: string;
  category: 'DANH MỤC GỐC' | 'ĐÀO TẠO & NHÂN SỰ' | 'VẬN HÀNH & ĐIỂM DANH' | 'TÀI CHÍNH & BẢO LƯU';
  primaryKey: string;
  uniqueKey: string;
  foreignKeys: string[];
  description: string;
  columns: TableColumnSpec[];
}

/**
 * 10 BẢNG DỮ LIỆU CHUẨN HÓA CỐT LÕI (3NF)
 * Đồng bộ 1-1 giữa CSDL Supabase PostgreSQL và Bảng Tính Tổng Thể (10 Bảng Excel Master)
 */
export const ROYAL_STANDARDIZED_10_TABLES: StandardizedTableDefinition[] = [
  {
    index: '01',
    sheetName: '01_CO_SO',
    tableName: 'campuses',
    storeKey: 'campuses',
    titleVN: 'Danh Mục Cơ Sở Đào Tạo & Ngân Hàng VietQR',
    category: 'DANH MỤC GỐC',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: [],
    description: 'Quản lý cơ sở đào tạo (PMH, Phú Lâm) và thông tin tài khoản thụ hưởng VietQR.',
    columns: [
      { dbCol: 'id', excelHeader: 'ID Cơ Sở', type: 'TEXT PK', required: true, description: 'Khóa chính (VD: camp_pmh)' },
      { dbCol: 'code', excelHeader: 'Mã Cơ Sở', type: 'TEXT UNIQUE', required: true, description: 'Mã định danh (PMH, PL)' },
      { dbCol: 'name', excelHeader: 'Tên Cơ Sở', type: 'TEXT', required: true, description: 'Tên cơ sở đào tạo' },
      { dbCol: 'address', excelHeader: 'Địa Chỉ', type: 'TEXT', description: 'Địa chỉ cơ sở' },
      { dbCol: 'phone', excelHeader: 'Hotline', type: 'TEXT', description: 'Số điện thoại liên hệ' },
      { dbCol: 'bank_name', excelHeader: 'Ngân Hàng', type: 'TEXT', description: 'Tên ngân hàng VietQR' },
      { dbCol: 'bank_account', excelHeader: 'Số Tài Khoản', type: 'TEXT', description: 'Số tài khoản thu học phí' },
      { dbCol: 'bank_owner', excelHeader: 'Chủ Tài Khoản', type: 'TEXT', description: 'Tên chủ tài khoản thụ hưởng' },
      { dbCol: 'status', excelHeader: 'Trạng Thái', type: 'TEXT', description: 'active | inactive' },
    ],
  },
  {
    index: '02',
    sheetName: '02_KHOA_HOC',
    tableName: 'academic_terms',
    storeKey: 'terms',
    titleVN: 'Danh Mục Khóa Học & Chu Kỳ Tuyển Sinh',
    category: 'DANH MỤC GỐC',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: [],
    description: 'Quản lý khóa học ngoại khóa theo học kỳ/năm học và trạng thái mở ghi danh.',
    columns: [
      { dbCol: 'id', excelHeader: 'ID Khóa Học', type: 'TEXT PK', required: true, description: 'Khóa chính (VD: term_fall_2026)' },
      { dbCol: 'code', excelHeader: 'Mã Khóa Học', type: 'TEXT UNIQUE', required: true, description: 'Mã khóa (VD: FALL-2026)' },
      { dbCol: 'name', excelHeader: 'Tên Khóa Học', type: 'TEXT', required: true, description: 'Tên khóa học' },
      { dbCol: 'academic_year', excelHeader: 'Năm Học', type: 'TEXT', required: true, description: 'Niên khóa (VD: 2026-2027)' },
      { dbCol: 'start_date', excelHeader: 'Ngày Bắt Đầu', type: 'DATE', required: true, description: 'YYYY-MM-DD' },
      { dbCol: 'end_date', excelHeader: 'Ngày Kết Thúc', type: 'DATE', required: true, description: 'YYYY-MM-DD' },
      { dbCol: 'status', excelHeader: 'Trạng Thái Khóa', type: 'TEXT', description: 'draft | open_enrollment | in_progress | closed' },
      { dbCol: 'is_active', excelHeader: 'Đang Kích Hoạt', type: 'BOOLEAN', description: 'true | false' },
      { dbCol: 'description', excelHeader: 'Mô Tả', type: 'TEXT', description: 'Ghi chú khóa học' },
    ],
  },
  {
    index: '03',
    sheetName: '03_MON_HOC_BIEU_PHI',
    tableName: 'subjects',
    storeKey: 'subjects',
    titleVN: 'Danh Mục Môn Học Ngoại Khóa & Biểu Phí Chuẩn',
    category: 'DANH MỤC GỐC',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: [],
    description: 'Danh mục môn học, nhóm phân loại, thời lượng chuẩn và biểu phí theo cơ sở.',
    columns: [
      { dbCol: 'id', excelHeader: 'ID Môn Học', type: 'TEXT PK', required: true, description: 'Khóa chính (VD: sub_swim)' },
      { dbCol: 'code', excelHeader: 'Mã Môn', type: 'TEXT UNIQUE', required: true, description: 'Mã môn (SWIM, BASK, STEM)' },
      { dbCol: 'name', excelHeader: 'Tên Môn Ngoại Khóa', type: 'TEXT', required: true, description: 'Tên môn học' },
      { dbCol: 'category', excelHeader: 'Phân Loại Môn', type: 'TEXT', required: true, description: 'Thể thao, Nghệ thuật, Công nghệ...' },
      { dbCol: 'standard_duration', excelHeader: 'Thời Lượng Chuẩn', type: 'TEXT', description: 'VD: 90 phút' },
      { dbCol: 'standard_sessions', excelHeader: 'Số Buổi Chuẩn', type: 'INTEGER', description: 'Tổng số buổi chuẩn (VD: 24)' },
      { dbCol: 'standard_course_fee', excelHeader: 'Học Phí Chuẩn (VNĐ)', type: 'NUMERIC', description: 'Học phí trọn khóa chuẩn' },
      { dbCol: 'standard_session_rate', excelHeader: 'Đơn Giá Buổi (VNĐ)', type: 'NUMERIC', description: 'Đơn giá 1 buổi chuẩn' },
      { dbCol: 'pmh_course_fee', excelHeader: 'Học Phí Cơ Sở PMH (VNĐ)', type: 'NUMERIC', description: 'Biểu phí áp dụng tại PMH' },
      { dbCol: 'pl_course_fee', excelHeader: 'Học Phí Cơ Sở PL (VNĐ)', type: 'NUMERIC', description: 'Biểu phí áp dụng tại Phú Lâm' },
      { dbCol: 'description', excelHeader: 'Mô Tả Chương Trình', type: 'TEXT', description: 'Nội dung đào tạo' },
    ],
  },
  {
    index: '04',
    sheetName: '04_GIAO_VIEN',
    tableName: 'teachers',
    storeKey: 'teachers',
    titleVN: 'Hồ Sơ Giáo Viên & Định Mức Thù Lao Giảng Dạy',
    category: 'ĐÀO TẠO & NHÂN SỰ',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: ['campus_id -> campuses.id'],
    description: 'Danh sách giáo viên Cơ hữu (300K/buổi) & Thỉnh giảng (270K/buổi) cùng tài khoản nhận lương.',
    columns: [
      { dbCol: 'id', excelHeader: 'ID Giáo Viên', type: 'TEXT PK', required: true, description: 'Khóa chính (VD: tea_1)' },
      { dbCol: 'code', excelHeader: 'Mã Giáo Viên', type: 'TEXT UNIQUE', required: true, description: 'Mã nhân sự (VD: GV-PMH-001)' },
      { dbCol: 'name', excelHeader: 'Họ Tên Giáo Viên', type: 'TEXT', required: true, description: 'Họ và tên đầy đủ' },
      { dbCol: 'phone', excelHeader: 'Số Điện Thoại', type: 'TEXT', required: true, description: 'SĐT liên hệ' },
      { dbCol: 'email', excelHeader: 'Email Công Vụ', type: 'TEXT', description: 'Email (@royal.edu.vn)' },
      { dbCol: 'campus_id', excelHeader: 'Mã Cơ Sở Chính', type: 'TEXT FK', required: true, description: 'PMH hoặc PL' },
      { dbCol: 'type', excelHeader: 'Phân Loại Nhân Sự', type: 'TEXT', required: true, description: 'permanent (Cơ hữu) | visiting (Thỉnh giảng)' },
      { dbCol: 'fixed_rate_per_session', excelHeader: 'Đơn Giá Thù Lao / Buổi (VNĐ)', type: 'NUMERIC', required: true, description: '300000 (Cơ hữu) | 270000 (Thỉnh giảng)' },
      { dbCol: 'periods_per_session', excelHeader: 'Số Tiết / Buổi', type: 'INTEGER', description: 'Mặc định 2 tiết/buổi' },
      { dbCol: 'default_rate_per_period', excelHeader: 'Đơn Giá / Tiết (VNĐ)', type: 'NUMERIC', description: 'Quy đổi đơn giá tiết' },
      { dbCol: 'bank_name', excelHeader: 'Ngân Hàng Nhận Lương', type: 'TEXT', description: 'Tên ngân hàng' },
      { dbCol: 'bank_account_number', excelHeader: 'Số Tài Khoản NH', type: 'TEXT', description: 'Số tài khoản nhận thù lao' },
      { dbCol: 'bank_account_holder', excelHeader: 'Chủ Tài Khoản NH', type: 'TEXT', description: 'Tên chủ tài khoản' },
      { dbCol: 'status', excelHeader: 'Trạng Thái', type: 'TEXT', description: 'active | inactive' },
    ],
  },
  {
    index: '05',
    sheetName: '05_LOP_HOC',
    tableName: 'extracurricular_classes',
    storeKey: 'classes',
    titleVN: 'Danh Sách Lớp Học Ngoại Khóa & Phân Công',
    category: 'ĐÀO TẠO & NHÂN SỰ',
    primaryKey: 'id',
    uniqueKey: 'name, term_id, campus_id',
    foreignKeys: ['term_id -> academic_terms.id', 'campus_id -> campuses.id', 'subject_id -> subjects.id', 'primary_teacher_id -> teachers.id'],
    description: 'Thực thể lớp học mở theo khóa, cơ sở, lịch học trong tuần, giáo viên chính và đơn giá lớp.',
    columns: [
      { dbCol: 'id', excelHeader: 'Mã Lớp (ID)', type: 'TEXT PK', required: true, description: 'Khóa chính (VD: cls_swim_pmh_01)' },
      { dbCol: 'name', excelHeader: 'Tên Lớp Học', type: 'TEXT', required: true, description: 'Tên lớp ngoại khóa' },
      { dbCol: 'term_id', excelHeader: 'Mã Khóa Học', type: 'TEXT FK', required: true, description: 'Liên kết bảng Khóa học' },
      { dbCol: 'campus_id', excelHeader: 'Mã Cơ Sở', type: 'TEXT FK', required: true, description: 'Liên kết bảng Cơ sở (PMH/PL)' },
      { dbCol: 'subject_id', excelHeader: 'Mã Môn Học', type: 'TEXT FK', required: true, description: 'Liên kết bảng Môn học' },
      { dbCol: 'primary_teacher_id', excelHeader: 'Mã Giáo Viên Chính', type: 'TEXT FK', required: true, description: 'Liên kết bảng Giáo viên' },
      { dbCol: 'days_of_week', excelHeader: 'Các Thứ Học Trong Tuần', type: 'TEXT[]', required: true, description: 'VD: T2, T4 hoặc T7, CN' },
      { dbCol: 'start_date', excelHeader: 'Ngày Khai Giảng', type: 'DATE', description: 'YYYY-MM-DD' },
      { dbCol: 'end_date', excelHeader: 'Ngày Kết Thúc', type: 'DATE', description: 'YYYY-MM-DD' },
      { dbCol: 'max_students', excelHeader: 'Sĩ Số Tối Đa', type: 'INTEGER', description: 'Định mức học sinh/lớp' },
      { dbCol: 'total_sessions', excelHeader: 'Tổng Số Buổi', type: 'INTEGER', required: true, description: 'Số buổi toàn khóa (VD: 24)' },
      { dbCol: 'full_course_fee', excelHeader: 'Học Phí Trọn Khóa (VNĐ)', type: 'NUMERIC', required: true, description: 'Tổng học phí lớp' },
      { dbCol: 'price_per_session', excelHeader: 'Đơn Giá 1 Buổi (VNĐ)', type: 'NUMERIC', required: true, description: 'Đơn giá buổi làm tròn' },
      { dbCol: 'status', excelHeader: 'Trạng Thái Lớp', type: 'TEXT', description: 'active | completed | canceled' },
    ],
  },
  {
    index: '06',
    sheetName: '06_HOC_SINH',
    tableName: 'students',
    storeKey: 'students',
    titleVN: 'Hồ Sơ Học Sinh, Phụ Huynh & Y Tế / Bánh Sữa',
    category: 'ĐÀO TẠO & NHÂN SỰ',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: [],
    description: 'Hồ sơ học sinh chính khóa Royal & ngoài trường, thông tin phụ huynh, dị ứng thực phẩm và chế độ bánh sữa.',
    columns: [
      { dbCol: 'id', excelHeader: 'ID Học Sinh', type: 'TEXT PK', required: true, description: 'Khóa chính (VD: std_01)' },
      { dbCol: 'code', excelHeader: 'Mã Học Viên', type: 'TEXT UNIQUE', required: true, description: 'RY-2026-xxxxx hoặc EXT-2026-xxxxx' },
      { dbCol: 'previous_student_code', excelHeader: 'Mã Cũ (Nếu Có)', type: 'TEXT', description: 'Mã cũ khi chuyển từ ngoài vào Royal' },
      { dbCol: 'name', excelHeader: 'Họ Và Tên Học Sinh', type: 'TEXT', required: true, description: 'Họ tên chuẩn hóa' },
      { dbCol: 'dob', excelHeader: 'Ngày Sinh', type: 'DATE', required: true, description: 'YYYY-MM-DD' },
      { dbCol: 'gender', excelHeader: 'Giới Tính', type: 'TEXT', description: 'Nam | Nữ' },
      { dbCol: 'is_royal_student', excelHeader: 'Học Sinh Royal (Cấp Bánh Sữa)', type: 'BOOLEAN', required: true, description: 'CÓ (Royal) | KHÔNG (Ngoài trường)' },
      { dbCol: 'school_name', excelHeader: 'Trường Đang Học', type: 'TEXT', description: 'Tên trường chính khóa' },
      { dbCol: 'regular_class', excelHeader: 'Lớp Chính Khóa', type: 'TEXT', description: 'Lớp chính khóa (VD: 4A1)' },
      { dbCol: 'parent_name', excelHeader: 'Họ Tên Phụ Huynh', type: 'TEXT', required: true, description: 'Phụ huynh liên hệ' },
      { dbCol: 'parent_phone', excelHeader: 'SĐT Phụ Huynh', type: 'TEXT', required: true, description: 'Số điện thoại định danh gia đình' },
      { dbCol: 'medical_notes', excelHeader: 'Lưu Ý Y Tế & Thực Phẩm', type: 'TEXT', description: 'Ghi chú dị ứng thực phẩm/sức khỏe' },
      { dbCol: 'status', excelHeader: 'Trạng Thái', type: 'TEXT', description: 'active | graduated | dropped' },
      { dbCol: 'created_at', excelHeader: 'Ngày Tạo Hồ Sơ', type: 'DATE', description: 'YYYY-MM-DD' },
    ],
  },
  {
    index: '07',
    sheetName: '07_GHI_DANH',
    tableName: 'enrollments',
    storeKey: 'enrollments',
    titleVN: 'Bảng Ghi Danh Xếp Lớp & Học Thử',
    category: 'VẬN HÀNH & ĐIỂM DANH',
    primaryKey: 'id',
    uniqueKey: 'student_id, class_id',
    foreignKeys: ['student_id -> students.id', 'class_id -> extracurricular_classes.id'],
    description: 'Liên kết học sinh vào lớp học, quản lý lịch học riêng (bán phần/toàn phần) và trạng thái học thử.',
    columns: [
      { dbCol: 'id', excelHeader: 'ID Ghi Danh', type: 'TEXT PK', required: true, description: 'Khóa chính (VD: enr_01)' },
      { dbCol: 'student_id', excelHeader: 'Mã Học Viên', type: 'TEXT FK', required: true, description: 'Mã học viên hoặc ID học sinh' },
      { dbCol: 'class_id', excelHeader: 'Mã Lớp Học', type: 'TEXT FK', required: true, description: 'Mã lớp hoặc tên lớp học' },
      { dbCol: 'registered_sessions', excelHeader: 'Số Buổi Đăng Ký', type: 'INTEGER', required: true, description: 'Số buổi thực học đăng ký' },
      { dbCol: 'joined_date', excelHeader: 'Ngày Bắt Đầu Học', type: 'DATE', required: true, description: 'YYYY-MM-DD' },
      { dbCol: 'enrolled_days_of_week', excelHeader: 'Thứ Đăng Ký Học', type: 'TEXT[]', description: 'VD: T2, T4 hoặc chỉ T2' },
      { dbCol: 'is_partial_schedule', excelHeader: 'Học Bán Phần Tuần', type: 'BOOLEAN', description: 'true nếu chỉ học 1 buổi/tuần' },
      { dbCol: 'is_trial', excelHeader: 'Đăng Ký Học Thử', type: 'BOOLEAN', description: 'true | false' },
      { dbCol: 'trial_session_date', excelHeader: 'Ngày Học Thử', type: 'DATE', description: 'YYYY-MM-DD' },
      { dbCol: 'status', excelHeader: 'Trạng Thái Ghi Danh', type: 'TEXT', required: true, description: 'active | trial | transferred | completed | dropped' },
    ],
  },
  {
    index: '08',
    sheetName: '08_DIEM_DANH_HS',
    tableName: 'attendance_records',
    storeKey: 'attendance',
    titleVN: 'Sổ Điểm Danh Học Sinh & Minh Chứng Nghỉ Phép',
    category: 'VẬN HÀNH & ĐIỂM DANH',
    primaryKey: 'id',
    uniqueKey: 'class_id, student_id, session_date',
    foreignKeys: ['class_id -> extracurricular_classes.id', 'student_id -> students.id'],
    description: 'Ghi nhận chuyên cần học sinh theo từng buổi học, đối soát suất bánh sữa và lưu link minh chứng nghỉ phép.',
    columns: [
      { dbCol: 'id', excelHeader: 'ID Điểm Danh', type: 'TEXT PK', required: true, description: 'Khóa chính (VD: att_01)' },
      { dbCol: 'session_id', excelHeader: 'Mã Buổi Học', type: 'TEXT', description: 'Liên kết ca học' },
      { dbCol: 'session_date', excelHeader: 'Ngày Buổi Học', type: 'DATE', required: true, description: 'YYYY-MM-DD' },
      { dbCol: 'class_id', excelHeader: 'Mã Lớp Học', type: 'TEXT FK', required: true, description: 'Lớp ngoại khóa' },
      { dbCol: 'student_id', excelHeader: 'Mã Học Viên', type: 'TEXT FK', required: true, description: 'Mã học viên' },
      { dbCol: 'status', excelHeader: 'Trạng Thái Chuyên Cần', type: 'TEXT', required: true, description: 'present | absent_excused | absent_unexcused' },
      { dbCol: 'note', excelHeader: 'Ghi Chú Điểm Danh', type: 'TEXT', description: 'Lý do nghỉ hoặc ghi chú' },
      { dbCol: 'proof_file_name', excelHeader: 'Tệp Minh Chứng', type: 'TEXT', description: 'Tên tệp đơn xin phép/toa thuốc' },
      { dbCol: 'proof_url', excelHeader: 'Link Minh Chứng', type: 'TEXT', description: 'URL tệp trên Supabase/Cloud' },
      { dbCol: 'uploaded_by', excelHeader: 'Người Xác Nhận', type: 'TEXT', description: 'Giáo viên / Học vụ điểm danh' },
    ],
  },
  {
    index: '09',
    sheetName: '09_CHAM_CONG_GV',
    tableName: 'teacher_work_sessions',
    storeKey: 'teacherAttendance',
    titleVN: 'Bảng Chấm Công Giáo Viên, Dạy Thay & Thù Lao Buổi',
    category: 'VẬN HÀNH & ĐIỂM DANH',
    primaryKey: 'id',
    uniqueKey: 'class_id, session_date',
    foreignKeys: ['class_id -> extracurricular_classes.id', 'assigned_teacher_id -> teachers.id', 'actual_teacher_id -> teachers.id'],
    description: 'Chấm công ca dạy thực tế của giáo viên, theo dõi dạy thay và tự động tính thù lao theo buổi.',
    columns: [
      { dbCol: 'id', excelHeader: 'ID Ca Dạy', type: 'TEXT PK', required: true, description: 'Khóa chính (VD: tatt_01)' },
      { dbCol: 'session_date', excelHeader: 'Ngày Giảng Dạy', type: 'DATE', required: true, description: 'YYYY-MM-DD' },
      { dbCol: 'session_number', excelHeader: 'Buổi Thứ', type: 'INTEGER', required: true, description: 'Thứ tự buổi của lớp' },
      { dbCol: 'term_id', excelHeader: 'Mã Khóa Học', type: 'TEXT FK', required: true, description: 'Khóa học' },
      { dbCol: 'campus_id', excelHeader: 'Mã Cơ Sở', type: 'TEXT FK', required: true, description: 'Cơ sở (PMH/PL)' },
      { dbCol: 'class_id', excelHeader: 'Mã Lớp Học', type: 'TEXT FK', required: true, description: 'Lớp giảng dạy' },
      { dbCol: 'assigned_teacher_id', excelHeader: 'Mã GV Phân Công', type: 'TEXT FK', required: true, description: 'GV chính thức của lớp' },
      { dbCol: 'actual_teacher_id', excelHeader: 'Mã GV Thực Dạy', type: 'TEXT FK', required: true, description: 'GV trực tiếp đứng lớp' },
      { dbCol: 'is_substitute', excelHeader: 'Là Ca Dạy Thay', type: 'BOOLEAN', description: 'true nếu dạy thay' },
      { dbCol: 'status', excelHeader: 'Trạng Thái Chấm Công', type: 'TEXT', required: true, description: 'present | late | substitute | absent_excused | absent_unexcused' },
      { dbCol: 'check_in_time', excelHeader: 'Giờ Check-in', type: 'TEXT', description: 'HH:mm' },
      { dbCol: 'periods_count', excelHeader: 'Số Tiết Quy Đổi', type: 'INTEGER', description: 'Chuẩn 2 tiết/buổi' },
      { dbCol: 'rate_applied', excelHeader: 'Đơn Giá Buổi Áp Dụng (VNĐ)', type: 'NUMERIC', required: true, description: '300000 (Cơ hữu) | 270000 (Thỉnh giảng)' },
      { dbCol: 'total_payout', excelHeader: 'Thành Tiền Thù Lao (VNĐ)', type: 'NUMERIC', required: true, description: 'Thù lao thực nhận của ca dạy' },
      { dbCol: 'verified_by', excelHeader: 'Người Đối Soát', type: 'TEXT', description: 'Học vụ xác nhận' },
      { dbCol: 'notes', excelHeader: 'Ghi Chú Ca Dạy', type: 'TEXT', description: 'Lý do dạy thay / ghi chú' },
    ],
  },
  {
    index: '10',
    sheetName: '10_HOA_DON_BAO_LUU',
    tableName: 'tuition_invoices',
    storeKey: 'invoices',
    titleVN: 'Hóa Đơn Học Phí VietQR, Công Nợ & Bảo Lưu Cấn Trừ',
    category: 'TÀI CHÍNH & BẢO LƯU',
    primaryKey: 'id',
    uniqueKey: 'invoice_code',
    foreignKeys: ['student_id -> students.id', 'class_id -> extracurricular_classes.id'],
    description: 'Quản lý hóa đơn học phí, đối soát gạch nợ VietQR, lịch sử thu từng đợt và cấn trừ phiếu bảo lưu.',
    columns: [
      { dbCol: 'id', excelHeader: 'ID Hóa Đơn', type: 'TEXT PK', required: true, description: 'Khóa chính (VD: inv_01)' },
      { dbCol: 'invoice_code', excelHeader: 'Số Hóa Đơn', type: 'TEXT UNIQUE', required: true, description: 'Mã hóa đơn (VD: INV-2026-0001)' },
      { dbCol: 'student_id', excelHeader: 'Mã Học Viên', type: 'TEXT FK', required: true, description: 'Liên kết bảng Học sinh' },
      { dbCol: 'class_id', excelHeader: 'Mã Lớp Học', type: 'TEXT FK', required: true, description: 'Liên kết bảng Lớp học' },
      { dbCol: 'registered_sessions', excelHeader: 'Số Buổi Tính Phí', type: 'INTEGER', description: 'Số buổi đăng ký thực tế' },
      { dbCol: 'session_rate', excelHeader: 'Đơn Giá 1 Buổi (VNĐ)', type: 'NUMERIC', description: 'Đơn giá buổi áp dụng' },
      { dbCol: 'gross_amount', excelHeader: 'Học Phí Gốc (VNĐ)', type: 'NUMERIC', required: true, description: 'Tổng tiền trước cấn trừ' },
      { dbCol: 'credit_deducted', excelHeader: 'Cấn Trừ Bảo Lưu (VNĐ)', type: 'NUMERIC', description: 'Số tiền trừ từ phiếu bảo lưu' },
      { dbCol: 'discount_amount', excelHeader: 'Ưu Đãi Giảm Trừ (VNĐ)', type: 'NUMERIC', description: 'Số tiền giảm giá (nếu có)' },
      { dbCol: 'net_payable', excelHeader: 'Thực Thu Phải Đóng (VNĐ)', type: 'NUMERIC', required: true, description: 'Số tiền phải thu sau cấn trừ' },
      { dbCol: 'paid_amount', excelHeader: 'Đã Thanh Toán (VNĐ)', type: 'NUMERIC', required: true, description: 'Tổng tiền phụ huynh đã nộp' },
      { dbCol: 'outstanding_amount', excelHeader: 'Còn Nợ (VNĐ)', type: 'NUMERIC', required: true, description: 'Công nợ còn lại' },
      { dbCol: 'payment_status', excelHeader: 'Trạng Thái Thanh Toán', type: 'TEXT', required: true, description: 'paid | partial | unpaid | cancelled' },
      { dbCol: 'due_date', excelHeader: 'Hạn Thanh Toán', type: 'DATE', description: 'YYYY-MM-DD' },
      { dbCol: 'payment_reference', excelHeader: 'Mã Giao Dịch Ngân Hàng', type: 'TEXT', description: 'Mã bút toán sao kê VietQR' },
      { dbCol: 'verified_by', excelHeader: 'Kế Toán Xác Nhận', type: 'TEXT', description: 'Nhân sự gạch nợ' },
      { dbCol: 'created_at', excelHeader: 'Ngày Lập Hóa Đơn', type: 'DATE', description: 'YYYY-MM-DD' },
    ],
  },
];

/**
 * MÃ NGUỒN SQL DDL ĐẦY ĐỦ CHUẨN 3NF CHO SUPABASE POSTGRESQL
 * Bao gồm đầy đủ 10 bảng dữ liệu cốt lõi + bảng bảo lưu & phân quyền RBAC + RLS Policies + Storage Bucket
 */
export const SUPABASE_FULL_DDL_SQL = `-- ============================================================================
-- ROYAL SCHOOL EXTRACURRICULAR ERP - NORMALIZED 3NF POSTGRESQL SCHEMA
-- Đồng bộ chuẩn 10 Bảng Dữ Liệu Cốt Lõi & Hệ Thống Phân Quyền RBAC
-- ============================================================================

-- 01. BẢNG CƠ SỞ ĐÀO TẠO & NGÂN HÀNG VIETQR (01_CO_SO)
CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  bank_account TEXT DEFAULT '',
  bank_owner TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 02. BẢNG KHÓA HỌC & NIÊN KHÓA (02_KHOA_HOC)
CREATE TABLE IF NOT EXISTS academic_terms (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  academic_year TEXT DEFAULT '2026-2027',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'open_enrollment',
  description TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 03. BẢNG MÔN HỌC NGOẠI KHÓA & BIỂU PHÍ CHUẨN (03_MON_HOC_BIEU_PHI)
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  standard_duration TEXT DEFAULT '90 phút',
  standard_sessions INTEGER DEFAULT 24,
  standard_course_fee NUMERIC DEFAULT 3990000,
  standard_session_rate NUMERIC DEFAULT 166250,
  pmh_course_fee NUMERIC DEFAULT 3990000,
  pl_course_fee NUMERIC DEFAULT 3800000,
  description TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 04. BẢNG HỒ SƠ GIÁO VIÊN & ĐỊNH MỨC THÙ LAO (04_GIAO_VIEN)
CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  campus_id TEXT REFERENCES campuses(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'permanent', -- 'permanent' (300K/buổi) | 'visiting' (270K/buổi)
  teacher_type TEXT DEFAULT 'permanent',
  fixed_rate_per_session NUMERIC DEFAULT 300000,
  default_rate_per_period NUMERIC DEFAULT 150000,
  periods_per_session INTEGER DEFAULT 2,
  bank_account JSONB DEFAULT '{}'::jsonb,
  subjects JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 05. BẢNG LỚP HỌC NGOẠI KHÓA (05_LOP_HOC)
CREATE TABLE IF NOT EXISTS extracurricular_classes (
  id TEXT PRIMARY KEY,
  code TEXT,
  name TEXT NOT NULL,
  term_id TEXT REFERENCES academic_terms(id) ON DELETE CASCADE,
  spanning_term_id TEXT,
  is_cross_term BOOLEAN DEFAULT false,
  term_distribution JSONB,
  campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
  facility_id TEXT DEFAULT '',
  time_slot_id TEXT DEFAULT '',
  days_of_week JSONB DEFAULT '["T2", "T4"]'::jsonb,
  start_date DATE,
  end_date DATE,
  primary_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  max_students INTEGER DEFAULT 25,
  total_sessions INTEGER DEFAULT 24,
  full_course_fee NUMERIC DEFAULT 3990000,
  price_per_session NUMERIC DEFAULT 166250,
  status TEXT DEFAULT 'active',
  allow_over_quota BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 06. BẢNG HỒ SƠ HỌC SINH & Y TẾ / BÁNH SỮA (06_HOC_SINH)
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  previous_student_code TEXT,
  name TEXT NOT NULL,
  dob DATE,
  gender TEXT DEFAULT 'Nam',
  is_royal_student BOOLEAN DEFAULT true,
  school_name TEXT DEFAULT 'Royal School',
  regular_class TEXT DEFAULT '',
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  medical_notes TEXT DEFAULT '',
  avatar_url TEXT,
  status TEXT DEFAULT 'active',
  created_at DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 07. BẢNG GHI DANH XẾP LỚP & HỌC THỬ (07_GHI_DANH)
CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  registered_sessions INTEGER DEFAULT 24,
  joined_date DATE DEFAULT CURRENT_DATE,
  enrolled_days_of_week JSONB DEFAULT '[]'::jsonb,
  is_partial_schedule BOOLEAN DEFAULT false,
  is_trial BOOLEAN DEFAULT false,
  trial_session_date DATE,
  trial_attended BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, class_id)
);

-- 08. BẢNG ĐIỂM DANH HỌC SINH & MINH CHỨNG NGHỈ PHÉP (08_DIEM_DANH_HS)
CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  session_id TEXT DEFAULT '',
  class_id TEXT REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present', -- 'present' | 'absent_excused' | 'absent_unexcused'
  note TEXT DEFAULT '',
  proof_file_name TEXT,
  proof_url TEXT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 09. BẢNG CHẤM CÔNG GIÁO VIÊN & THÙ LAO CA DẠY (09_CHAM_CONG_GV)
CREATE TABLE IF NOT EXISTS teacher_work_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  term_id TEXT REFERENCES academic_terms(id) ON DELETE CASCADE,
  campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  session_number INTEGER DEFAULT 1,
  periods_count INTEGER DEFAULT 2,
  assigned_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  actual_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  is_substitute BOOLEAN DEFAULT false,
  substitute_reason TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  late_minutes INTEGER DEFAULT 0,
  check_in_time TEXT DEFAULT '16:40',
  rate_per_period NUMERIC DEFAULT 150000,
  rate_applied NUMERIC DEFAULT 300000,
  earned_amount NUMERIC DEFAULT 300000,
  total_payout NUMERIC DEFAULT 300000,
  verified_by TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  recalculated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. BẢNG HÓA ĐƠN HỌC PHÍ VIETQR & BẢO LƯU CẤN TRỪ (10_HOA_DON_BAO_LUU)
CREATE TABLE IF NOT EXISTS tuition_invoices (
  id TEXT PRIMARY KEY,
  invoice_code TEXT UNIQUE NOT NULL,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  registered_sessions INTEGER DEFAULT 24,
  total_class_sessions INTEGER DEFAULT 24,
  session_rate NUMERIC DEFAULT 166250,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  credit_deducted NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  net_payable NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  outstanding_amount NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  due_date DATE,
  payment_reference TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  payment_history JSONB DEFAULT '[]'::jsonb,
  created_at DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BẢNG BỔ TRỢ 11: PHIẾU BẢO LƯU HỌC PHÍ (CREDIT NOTES)
CREATE TABLE IF NOT EXISTS credit_notes (
  id TEXT PRIMARY KEY,
  credit_code TEXT UNIQUE NOT NULL,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  source_class_id TEXT,
  subject_id TEXT,
  term_id TEXT,
  consecutive_absent_count INTEGER NOT NULL DEFAULT 3,
  consecutive_dates JSONB DEFAULT '[]'::jsonb,
  source_rate NUMERIC NOT NULL DEFAULT 0,
  credit_rule TEXT DEFAULT 'monetary',
  total_credit_amount NUMERIC NOT NULL DEFAULT 0,
  transferred_sessions INTEGER DEFAULT 3,
  issue_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE,
  status TEXT DEFAULT 'issued',
  redeemed_info JSONB,
  note TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BẢNG BỔ TRỢ 12: TÀI KHOẢN NGƯỜI DÙNG & PHÂN QUYỀN RBAC (APP USERS)
CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'academic',
  department TEXT DEFAULT '',
  campus_id TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'active',
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_teacher_id TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BẢNG BỔ TRỢ 13: ĐƠN ĐĂNG KÝ TUYỂN SINH TỪ CỔNG PHỤ HUYNH (PARENT REGISTRATIONS)
CREATE TABLE IF NOT EXISTS parent_registrations (
  id TEXT PRIMARY KEY,
  registration_code TEXT,
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  parent_email TEXT DEFAULT '',
  student_name TEXT NOT NULL,
  student_dob DATE,
  student_grade TEXT DEFAULT '',
  current_school TEXT DEFAULT 'Royal School',
  current_class TEXT DEFAULT '',
  desired_campus_id TEXT NOT NULL DEFAULT 'camp_pmh',
  desired_term_id TEXT,
  desired_subject_id TEXT NOT NULL,
  desired_time_slot_type TEXT DEFAULT 'after_school',
  registered_subjects JSONB DEFAULT '[]'::jsonb,
  is_royal_student BOOLEAN DEFAULT true,
  medical_notes TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  estimated_fee NUMERIC DEFAULT 0,
  discount_policy TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  contact_notes TEXT DEFAULT '',
  student_id TEXT,
  assigned_class_id TEXT,
  assigned_class_ids JSONB DEFAULT '[]'::jsonb,
  attachment_file_name TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- KÍCH HOẠT ROW LEVEL SECURITY (CHO PHÉP ĐỒNG BỘ QUA ANON KEY TRONG MÔI TRƯỜNG TRƯỜNG HỌC)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'campuses', 'academic_terms', 'subjects', 'teachers',
    'extracurricular_classes', 'students', 'enrollments',
    'attendance_records', 'teacher_work_sessions', 'tuition_invoices',
    'credit_notes', 'app_users', 'parent_registrations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow full access for Royal School Hub" ON %I;', tbl);
    EXECUTE format('CREATE POLICY "Allow full access for Royal School Hub" ON %I FOR ALL USING (true) WITH CHECK (true);', tbl);
    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL;', tbl);
  END LOOP;
END $$;

-- KÍCH HOẠT REALTIME CHO TOÀN BỘ CÁC BẢNG NGHIỆP VỤ CỐT LÕI (SUPABASE REALTIME REPLICATION)
ALTER PUBLICATION supabase_realtime ADD TABLE app_users;
ALTER PUBLICATION supabase_realtime ADD TABLE extracurricular_classes;
ALTER PUBLICATION supabase_realtime ADD TABLE enrollments;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE teacher_work_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE tuition_invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE credit_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE parent_registrations;

-- KHỞI TẠO STORAGE BUCKET LƯU MINH CHỨNG NGHỈ PHÉP
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-proofs', 'attendance-proofs', true)
ON CONFLICT (id) DO NOTHING;
`;

export const SUPABASE_REALTIME_PUBLICATION_SQL = `-- Kích hoạt Realtime cho toàn bộ các bảng nghiệp vụ cốt lõi
ALTER PUBLICATION supabase_realtime ADD TABLE app_users;
ALTER PUBLICATION supabase_realtime ADD TABLE extracurricular_classes;
ALTER PUBLICATION supabase_realtime ADD TABLE enrollments;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE teacher_work_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE tuition_invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE credit_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE parent_registrations;`;


export interface SupabaseConnectionCheckResult {
  connected: boolean;
  configured: boolean;
  url: string;
  latencyMs: number | null;
  restApiOk: boolean;
  authKeyValid: boolean;
  hasStorageBucket: boolean;
  message: string;
  checkedAt: string;
}

export interface TableHealthStatus {
  index: string;
  sheetName: string;
  tableName: string;
  storeKey: keyof AppStore;
  titleVN: string;
  category: string;
  primaryKey: string;
  uniqueKey: string;
  foreignKeys: string[];
  localCount: number;
  remoteCount: number | null;
  status: 'synced' | 'out_of_sync' | 'table_missing' | 'rls_blocked' | 'local_only' | 'error';
  latencyMs: number | null;
  integrityValid: boolean;
  integrityIssues: string[];
  statusLabel: string;
  message: string;
}

/**
 * Lấy cấu hình Supabase hiện hành từ tham số truyền vào, localStorage hoặc biến môi trường
 */
export function resolveSupabaseCredentials(urlInput?: string, anonKeyInput?: string): { url: string; anonKey: string } {
  return getResolvedSupabaseConfig(urlInput, anonKeyInput);
}

/**
 * Trả về Singleton SupabaseClient duy nhất (ngăn chặn lỗi Multiple GoTrueClient instances)
 */
export function createSupabaseClientInstance(urlInput?: string, anonKeyInput?: string): SupabaseClient | null {
  return getSupabaseClient(urlInput, anonKeyInput);
}

export {
  getSupabaseClient,
  isValidSupabaseAnonJwt,
  sanitizeSupabaseBaseUrl,
  sanitizeSupabaseTableName,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabase,
};

/**
 * Kiểm tra toàn diện kết nối CSDL Supabase (REST API, Auth Key, Storage Bucket & Độ trễ)
 */
export async function verifySupabaseConnection(
  urlInput?: string,
  anonKeyInput?: string
): Promise<SupabaseConnectionCheckResult> {
  const { url: rawUrl, anonKey } = resolveSupabaseCredentials(urlInput, anonKeyInput);
  const url = sanitizeSupabaseBaseUrl(rawUrl);
  const checkedAt = new Date().toISOString();

  if (!url || !anonKey) {
    return {
      connected: false,
      configured: false,
      url: '',
      latencyMs: null,
      restApiOk: false,
      authKeyValid: false,
      hasStorageBucket: false,
      message: 'Chưa cấu hình Project URL và Anon Key. Hệ thống đang vận hành ở chế độ Local Database chuẩn hóa.',
      checkedAt,
    };
  }

  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    return {
      connected: false,
      configured: true,
      url,
      latencyMs: null,
      restApiOk: false,
      authKeyValid: false,
      hasStorageBucket: false,
      message: 'Định dạng Supabase Project URL không hợp lệ (cần bắt đầu bằng https://).',
      checkedAt,
    };
  }

  const start = Date.now();
  try {
    const cleanRestEndpoint = `${url}/rest/v1/`.replace(/(\/rest\/v1)+/gi, '/rest/v1');
    const res = await fetch(cleanRestEndpoint, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    const latencyMs = Date.now() - start;

    if (res.status === 401 || res.status === 403) {
      return {
        connected: false,
        configured: true,
        url,
        latencyMs,
        restApiOk: true,
        authKeyValid: false,
        hasStorageBucket: false,
        message: `HTTP ${res.status}: Khóa Anon Public Key không hợp lệ hoặc đã bị từ chối xác thực.`,
        checkedAt,
      };
    }

    if (!res.ok && res.status !== 200) {
      return {
        connected: false,
        configured: true,
        url,
        latencyMs,
        restApiOk: false,
        authKeyValid: false,
        hasStorageBucket: false,
        message: `HTTP ${res.status}: Điểm cuối Supabase REST không phản hồi hợp lệ.`,
        checkedAt,
      };
    }

    // Kiểm tra Storage Bucket
    let hasStorageBucket = false;
    try {
      const client = createSupabaseClientInstance(url, anonKey);
      if (client) {
        const { data: buckets } = await client.storage.listBuckets();
        hasStorageBucket = Array.isArray(buckets) && buckets.some(b => b.name === 'attendance-proofs' || b.id === 'attendance-proofs');
      }
    } catch {
      hasStorageBucket = false;
    }

    // Lưu cấu hình hợp lệ vào localStorage để các module khác tự động dùng
    try {
      localStorage.setItem(
        'royal_supabase_config',
        JSON.stringify({ url, anonKey, isConnected: true, updatedAt: checkedAt })
      );
    } catch {
      // ignore
    }

    return {
      connected: true,
      configured: true,
      url,
      latencyMs,
      restApiOk: true,
      authKeyValid: true,
      hasStorageBucket,
      message: `Kết nối CSDL Supabase PostgreSQL thành công (${latencyMs}ms).`,
      checkedAt,
    };
  } catch (err: any) {
    return {
      connected: false,
      configured: true,
      url,
      latencyMs: null,
      restApiOk: false,
      authKeyValid: false,
      hasStorageBucket: false,
      message: `Không thể kết nối mạng tới Supabase Endpoint (${err?.message || 'Network Error'}).`,
      checkedAt,
    };
  }
}

/**
 * Kiểm tra tính toàn vẹn dữ liệu (Khóa chính, Khóa ngoại & Ràng buộc duy nhất) cho từng bảng trong Store
 */
export function validateLocalTableIntegrity(tableName: string, store: AppStore): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const campusIds = new Set((store.campuses || []).map(c => c.id));
  const termIds = new Set((store.terms || []).map(t => t.id));
  const subjectIds = new Set((store.subjects || []).map(s => s.id));
  const teacherIds = new Set((store.teachers || []).map(t => t.id));
  const classIds = new Set((store.classes || []).map(c => c.id));
  const studentIds = new Set((store.students || []).map(s => s.id));

  switch (tableName) {
    case 'campuses': {
      const codes = new Set<string>();
      for (const c of store.campuses || []) {
        if (!c.id || !c.code) issues.push(`Cơ sở thiếu ID hoặc Mã cơ sở`);
        if (codes.has(c.code)) issues.push(`Trùng mã cơ sở: ${c.code}`);
        codes.add(c.code);
      }
      break;
    }
    case 'academic_terms': {
      const codes = new Set<string>();
      for (const t of store.terms || []) {
        if (!t.id || !t.code) issues.push(`Khóa học thiếu ID hoặc Mã khóa`);
        if (codes.has(t.code)) issues.push(`Trùng mã khóa học: ${t.code}`);
        codes.add(t.code);
      }
      break;
    }
    case 'subjects': {
      const codes = new Set<string>();
      for (const s of store.subjects || []) {
        if (!s.id || !s.code) issues.push(`Môn học thiếu ID hoặc Mã môn`);
        if (codes.has(s.code)) issues.push(`Trùng mã môn học: ${s.code}`);
        codes.add(s.code);
      }
      break;
    }
    case 'teachers': {
      for (const tc of store.teachers || []) {
        if (tc.campus_id && tc.campus_id !== 'all' && !campusIds.has(tc.campus_id)) {
          issues.push(`GV ${tc.name} tham chiếu campus_id không tồn tại (${tc.campus_id})`);
        }
      }
      break;
    }
    case 'extracurricular_classes': {
      for (const cl of store.classes || []) {
        if (!termIds.has(cl.term_id)) issues.push(`Lớp ${cl.name} sai khóa ngoại term_id (${cl.term_id})`);
        if (!campusIds.has(cl.campus_id)) issues.push(`Lớp ${cl.name} sai khóa ngoại campus_id (${cl.campus_id})`);
        if (!subjectIds.has(cl.subject_id)) issues.push(`Lớp ${cl.name} sai khóa ngoại subject_id (${cl.subject_id})`);
        if (cl.primary_teacher_id && teacherIds.size > 0 && !teacherIds.has(cl.primary_teacher_id)) {
          issues.push(`Lớp ${cl.name} tham chiếu GV chưa có trong danh mục (${cl.primary_teacher_id})`);
        }
      }
      break;
    }
    case 'students': {
      const codes = new Set<string>();
      for (const st of store.students || []) {
        if (codes.has(st.code)) issues.push(`Trùng mã học viên: ${st.code}`);
        codes.add(st.code);
      }
      break;
    }
    case 'enrollments': {
      const pairs = new Set<string>();
      for (const en of store.enrollments || []) {
        if (!studentIds.has(en.student_id)) issues.push(`Ghi danh ${en.id} tham chiếu student_id không tồn tại`);
        if (!classIds.has(en.class_id)) issues.push(`Ghi danh ${en.id} tham chiếu class_id không tồn tại`);
        const key = `${en.student_id}_${en.class_id}`;
        if ((en.status === 'active' || en.status === 'trial') && pairs.has(key)) {
          issues.push(`Trùng ghi danh học sinh ${en.student_id} trong lớp ${en.class_id}`);
        }
        pairs.add(key);
      }
      break;
    }
    case 'attendance_records': {
      for (const att of store.attendance || []) {
        if (!classIds.has(att.class_id)) issues.push(`Điểm danh ${att.id} sai class_id`);
        if (!studentIds.has(att.student_id)) issues.push(`Điểm danh ${att.id} sai student_id`);
      }
      break;
    }
    case 'teacher_work_sessions': {
      for (const tw of store.teacherAttendance || []) {
        if (!classIds.has(tw.class_id)) issues.push(`Chấm công GV ${tw.id} sai class_id`);
      }
      break;
    }
    case 'tuition_invoices': {
      const invCodes = new Set<string>();
      for (const inv of store.invoices || []) {
        if (invCodes.has(inv.invoice_code)) issues.push(`Trùng mã hóa đơn: ${inv.invoice_code}`);
        invCodes.add(inv.invoice_code);
        if (!studentIds.has(inv.student_id)) issues.push(`Hóa đơn ${inv.invoice_code} sai student_id`);
        if (!classIds.has(inv.class_id)) issues.push(`Hóa đơn ${inv.invoice_code} sai class_id`);
      }
      break;
    }
  }

  return {
    valid: issues.length === 0,
    issues: issues.slice(0, 5),
  };
}

/**
 * Kiểm tra trạng thái chi tiết toàn bộ 10 bảng dữ liệu cốt lõi trên cả Local Store & Supabase Cloud
 */
export async function inspectAllDatabaseTables(
  store: AppStore,
  urlInput?: string,
  anonKeyInput?: string
): Promise<TableHealthStatus[]> {
  const client = createSupabaseClientInstance(urlInput, anonKeyInput);

  const results: TableHealthStatus[] = await Promise.all(
    ROYAL_STANDARDIZED_10_TABLES.map(async (tblDef): Promise<TableHealthStatus> => {
      const localArr = (store[tblDef.storeKey] as any[]) || [];
      const localCount = Array.isArray(localArr) ? localArr.length : 0;
      const integrity = validateLocalTableIntegrity(tblDef.tableName, store);

      if (!client) {
        return {
          index: tblDef.index,
          sheetName: tblDef.sheetName,
          tableName: tblDef.tableName,
          storeKey: tblDef.storeKey,
          titleVN: tblDef.titleVN,
          category: tblDef.category,
          primaryKey: tblDef.primaryKey,
          uniqueKey: tblDef.uniqueKey,
          foreignKeys: tblDef.foreignKeys,
          localCount,
          remoteCount: null,
          status: 'local_only',
          latencyMs: null,
          integrityValid: integrity.valid,
          integrityIssues: integrity.issues,
          statusLabel: 'Chuẩn hóa Local (Chờ kết nối Cloud)',
          message: integrity.valid
            ? `Cấu trúc bảng chuẩn 3NF (${localCount} bản ghi local).`
            : `Phát hiện ${integrity.issues.length} cảnh báo khóa ngoại.`,
        };
      }

      const start = Date.now();
      const safeTableName = sanitizeSupabaseTableName(tblDef.tableName);
      try {
        const { count, error } = await client
          .from(safeTableName)
          .select('*', { count: 'exact', head: true });
        const latencyMs = Date.now() - start;

        if (error) {
          const code = String(error.code || '');
          const msg = String(error.message || '');
          if (code === '42P01' || code === 'PGRST205' || msg.includes('does not exist') || msg.includes('schema cache')) {
            return {
              index: tblDef.index,
              sheetName: tblDef.sheetName,
              tableName: tblDef.tableName,
              storeKey: tblDef.storeKey,
              titleVN: tblDef.titleVN,
              category: tblDef.category,
              primaryKey: tblDef.primaryKey,
              uniqueKey: tblDef.uniqueKey,
              foreignKeys: tblDef.foreignKeys,
              localCount,
              remoteCount: null,
              status: 'table_missing',
              latencyMs,
              integrityValid: integrity.valid,
              integrityIssues: integrity.issues,
              statusLabel: 'Chưa khởi tạo bảng SQL',
              message: `Bảng "${tblDef.tableName}" chưa tồn tại trên Supabase. Hãy chạy SQL DDL để tạo bảng.`,
            };
          }

          if (code === '42501' || msg.includes('permission denied') || msg.includes('row-level security')) {
            return {
              index: tblDef.index,
              sheetName: tblDef.sheetName,
              tableName: tblDef.tableName,
              storeKey: tblDef.storeKey,
              titleVN: tblDef.titleVN,
              category: tblDef.category,
              primaryKey: tblDef.primaryKey,
              uniqueKey: tblDef.uniqueKey,
              foreignKeys: tblDef.foreignKeys,
              localCount,
              remoteCount: null,
              status: 'rls_blocked',
              latencyMs,
              integrityValid: integrity.valid,
              integrityIssues: integrity.issues,
              statusLabel: 'Chặn quyền RLS Policy',
              message: `Bảng "${tblDef.tableName}" đang chặn quyền đọc/ghi RLS.`,
            };
          }

          return {
            index: tblDef.index,
            sheetName: tblDef.sheetName,
            tableName: tblDef.tableName,
            storeKey: tblDef.storeKey,
            titleVN: tblDef.titleVN,
            category: tblDef.category,
            primaryKey: tblDef.primaryKey,
            uniqueKey: tblDef.uniqueKey,
            foreignKeys: tblDef.foreignKeys,
            localCount,
            remoteCount: null,
            status: 'error',
            latencyMs,
            integrityValid: integrity.valid,
            integrityIssues: integrity.issues,
            statusLabel: 'Lỗi truy vấn bảng',
            message: msg || 'Không thể kiểm tra bảng trên Supabase.',
          };
        }

        const remoteCount = count ?? 0;
        const isSynced = remoteCount === localCount;

        return {
          index: tblDef.index,
          sheetName: tblDef.sheetName,
          tableName: tblDef.tableName,
          storeKey: tblDef.storeKey,
          titleVN: tblDef.titleVN,
          category: tblDef.category,
          primaryKey: tblDef.primaryKey,
          uniqueKey: tblDef.uniqueKey,
          foreignKeys: tblDef.foreignKeys,
          localCount,
          remoteCount,
          status: isSynced ? 'synced' : 'out_of_sync',
          latencyMs,
          integrityValid: integrity.valid,
          integrityIssues: integrity.issues,
          statusLabel: isSynced ? 'Đã đồng bộ 100%' : `Lệch (${localCount} Local / ${remoteCount} Cloud)`,
          message: isSynced
            ? `Bảng hoạt động tốt, đồng bộ khớp ${localCount} bản ghi (${latencyMs}ms).`
            : `Local có ${localCount} bản ghi, Supabase có ${remoteCount} bản ghi. Bấm Đồng bộ để khớp dữ liệu.`,
        };
      } catch (err: any) {
        return {
          index: tblDef.index,
          sheetName: tblDef.sheetName,
          tableName: tblDef.tableName,
          storeKey: tblDef.storeKey,
          titleVN: tblDef.titleVN,
          category: tblDef.category,
          primaryKey: tblDef.primaryKey,
          uniqueKey: tblDef.uniqueKey,
          foreignKeys: tblDef.foreignKeys,
          localCount,
          remoteCount: null,
          status: 'error',
          latencyMs: null,
          integrityValid: integrity.valid,
          integrityIssues: integrity.issues,
          statusLabel: 'Lỗi kết nối bảng',
          message: err?.message || 'Lỗi kết nối khi kiểm tra bảng.',
        };
      }
    })
  );

  return results;
}

/**
 * Chuyển đổi dữ liệu từ AppStore sang bản ghi chuẩn SQL để Upsert lên Supabase
 */
function serializeTableRowsForSupabase(tableName: string, store: AppStore): Record<string, any>[] {
  const cleanTable = sanitizeSupabaseTableName(tableName);
  switch (cleanTable) {
    case 'campuses':
      return (store.campuses || []).map(c => ({
        id: c.id,
        code: c.code,
        name: c.name,
        address: c.address || '',
        phone: c.phone || '',
        bank_name: c.bank_name || '',
        bank_account: c.bank_account || '',
        bank_owner: c.bank_owner || '',
        status: c.status || 'active',
      }));

    case 'academic_terms':
      return (store.terms || []).map(t => ({
        id: t.id,
        code: t.code,
        name: t.name,
        academic_year: t.academic_year || '2026-2027',
        start_date: t.start_date,
        end_date: t.end_date,
        is_active: Boolean(t.is_active),
        status: t.status || 'open_enrollment',
        description: t.description || '',
      }));

    case 'subjects':
      return (store.subjects || []).map(s => {
        const ts = (store.termSubjects || []).find(item => item.subject_id === s.id);
        const pmh = (store.campusPricings || []).find(cp => cp.subject_id === s.id && cp.campus_id === 'camp_pmh');
        const pl = (store.campusPricings || []).find(cp => cp.subject_id === s.id && cp.campus_id === 'camp_pl');
        const stdFee = ts?.standard_course_fee || 3990000;
        const stdSessions = ts?.standard_sessions || 24;
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          category: s.category || 'Thể thao',
          standard_duration: s.standard_duration || '90 phút',
          standard_sessions: stdSessions,
          standard_course_fee: stdFee,
          standard_session_rate: ts?.standard_session_rate || Math.ceil(stdFee / Math.max(1, stdSessions)),
          pmh_course_fee: pmh?.custom_course_fee || stdFee,
          pl_course_fee: pl?.custom_course_fee || stdFee,
          description: s.description || '',
          is_active: s.is_active !== false,
        };
      });

    case 'teachers':
      return (store.teachers || []).map(t => ({
        id: t.id,
        code: t.code || t.id,
        name: t.name,
        phone: t.phone || '',
        email: t.email || '',
        campus_id: t.campus_id && t.campus_id !== 'all' ? t.campus_id : (store.campuses[0]?.id || 'camp_pmh'),
        type: t.type || t.teacher_type || 'permanent',
        teacher_type: t.teacher_type || t.type || 'permanent',
        fixed_rate_per_session: t.fixed_rate_per_session || 300000,
        default_rate_per_period: t.default_rate_per_period || 150000,
        periods_per_session: t.periods_per_session || 2,
        bank_account: t.bank_account || {},
        subjects: t.subjects || [],
        status: t.status || 'active',
      }));

    case 'extracurricular_classes':
      return (store.classes || []).map(c => ({
        id: c.id,
        code: c.code || c.id,
        name: c.name,
        term_id: c.term_id,
        spanning_term_id: c.spanning_term_id || null,
        is_cross_term: Boolean(c.is_cross_term),
        term_distribution: c.term_distribution || null,
        campus_id: c.campus_id,
        subject_id: c.subject_id,
        facility_id: c.facility_id || '',
        time_slot_id: c.time_slot_id || '',
        days_of_week: c.days_of_week || ['T2', 'T4'],
        start_date: c.start_date || null,
        end_date: c.end_date || null,
        primary_teacher_id: c.primary_teacher_id || null,
        max_students: c.max_students || 25,
        total_sessions: c.total_sessions || 24,
        full_course_fee: c.full_course_fee || 0,
        price_per_session: c.price_per_session || 0,
        status: c.status || 'active',
        allow_over_quota: Boolean(c.allow_over_quota),
      }));

    case 'students':
      return (store.students || []).map(s => ({
        id: s.id,
        code: s.code,
        previous_student_code: s.previous_student_code || null,
        name: s.name,
        dob: s.dob || null,
        gender: s.gender || 'Nam',
        is_royal_student: Boolean(s.is_royal_student),
        school_name: s.school_name || 'Royal School',
        regular_class: s.regular_class || '',
        parent_name: s.parent_name || '',
        parent_phone: s.parent_phone || '',
        medical_notes: s.medical_notes || '',
        avatar_url: s.avatar_url && !s.avatar_url.startsWith('data:') ? s.avatar_url : null,
        status: s.status || 'active',
        created_at: s.created_at || new Date().toISOString().split('T')[0],
      }));

    case 'enrollments':
      return (store.enrollments || []).map(e => ({
        id: e.id,
        student_id: e.student_id,
        class_id: e.class_id,
        registered_sessions: e.registered_sessions || 24,
        joined_date: e.joined_date || new Date().toISOString().split('T')[0],
        enrolled_days_of_week: e.enrolled_days_of_week || [],
        is_partial_schedule: Boolean(e.is_partial_schedule),
        is_trial: Boolean(e.is_trial),
        trial_session_date: e.trial_session_date || null,
        trial_attended: Boolean(e.trial_attended),
        status: e.status || 'active',
      }));

    case 'attendance_records':
      return (store.attendance || []).map(a => ({
        id: a.id,
        session_id: a.session_id || '',
        class_id: a.class_id,
        student_id: a.student_id,
        session_date: a.session_date,
        status: a.status || 'present',
        note: a.note || '',
        proof_file_name: a.proof_file_name || null,
        proof_url: a.proof_url && !a.proof_url.startsWith('data:') ? a.proof_url : null,
        uploaded_by: a.uploaded_by || null,
        uploaded_at: a.uploaded_at || null,
      }));

    case 'teacher_work_sessions':
      return (store.teacherAttendance || []).map(ta => ({
        id: ta.id,
        class_id: ta.class_id,
        term_id: ta.term_id,
        campus_id: ta.campus_id,
        session_date: ta.session_date,
        session_number: ta.session_number || 1,
        periods_count: ta.periods_count || 2,
        assigned_teacher_id: ta.assigned_teacher_id || null,
        actual_teacher_id: ta.actual_teacher_id || null,
        is_substitute: Boolean(ta.is_substitute),
        substitute_reason: ta.substitute_reason || null,
        status: ta.status || 'present',
        late_minutes: ta.late_minutes || 0,
        check_in_time: ta.check_in_time || '16:40',
        rate_per_period: ta.rate_per_period || 150000,
        rate_applied: ta.rate_applied || 300000,
        earned_amount: ta.earned_amount ?? ta.total_payout ?? 300000,
        total_payout: ta.total_payout || 300000,
        verified_by: ta.verified_by || '',
        notes: ta.notes || '',
        recalculated_at: ta.recalculated_at || null,
      }));

    case 'tuition_invoices':
      return (store.invoices || []).map(inv => ({
        id: inv.id,
        invoice_code: inv.invoice_code,
        student_id: inv.student_id,
        class_id: inv.class_id,
        registered_sessions: inv.registered_sessions || 24,
        total_class_sessions: inv.total_class_sessions || 24,
        session_rate: inv.session_rate || 166250,
        gross_amount: inv.gross_amount || 0,
        credit_deducted: inv.credit_deducted || 0,
        discount_amount: inv.discount_amount || 0,
        net_payable: inv.net_payable || 0,
        paid_amount: inv.paid_amount || 0,
        outstanding_amount: inv.outstanding_amount || 0,
        payment_status: inv.payment_status || 'unpaid',
        due_date: inv.due_date || null,
        payment_reference: inv.payment_reference || null,
        verified_by: inv.verified_by || null,
        verified_at: inv.verified_at || null,
        payment_history: inv.payment_history || [],
        created_at: inv.created_at || new Date().toISOString().split('T')[0],
      }));

    case 'credit_notes':
      return (store.makeupCredits || []).map(cr => ({
        id: cr.id,
        credit_code: cr.credit_code,
        student_id: cr.student_id,
        source_class_id: cr.source_class_id || '',
        subject_id: cr.subject_id || '',
        term_id: cr.term_id || '',
        consecutive_absent_count: cr.consecutive_absent_count || 3,
        consecutive_dates: cr.consecutive_dates || [],
        source_rate: cr.source_rate || 0,
        credit_rule: cr.credit_rule || 'monetary',
        total_credit_amount: cr.total_credit_amount || 0,
        transferred_sessions: cr.transferred_sessions || 3,
        issue_date: cr.issue_date,
        expiry_date: cr.expiry_date,
        status: cr.status || 'issued',
        redeemed_info: cr.redeemed_info || null,
        note: cr.note || '',
      }));

    case 'app_users':
      return (store.users || []).map(u => ({
        id: u.id,
        username: u.username,
        email: u.email || `${u.username}@royal.edu.vn`,
        password_hash: u.password_hash || u.password || '123456',
        full_name: u.full_name,
        phone: u.phone || '',
        role: u.role || 'academic',
        department: u.department || '',
        campus_id: u.campus_id || 'all',
        status: u.status || 'active',
        permissions: u.permissions || {},
        linked_teacher_id: u.linked_teacher_id || u.teacher_id || null,
        last_login: u.last_login || null,
      }));

    case 'parent_registrations':
      return (store.parentRegistrations || []).map(r => ({
        id: r.id,
        registration_code: r.registration_code || r.code || r.id,
        parent_name: r.parent_name,
        parent_phone: r.parent_phone,
        parent_email: r.parent_email || '',
        student_name: r.student_name,
        student_dob: r.student_dob || r.dob || null,
        student_grade: r.student_grade || '',
        current_school: r.current_school || 'Royal School',
        current_class: r.current_class || '',
        desired_campus_id: r.desired_campus_id || r.campus_id || 'camp_pmh',
        desired_term_id: r.desired_term_id || null,
        desired_subject_id: r.desired_subject_id || r.preferred_subject_id || '',
        desired_time_slot_type: r.desired_time_slot_type || 'after_school',
        registered_subjects: r.registered_subjects || [],
        is_royal_student: Boolean(r.is_royal_student ?? r.is_royal ?? true),
        medical_notes: r.medical_notes || '',
        notes: r.notes || '',
        estimated_fee: r.estimated_fee || 0,
        discount_policy: r.discount_policy || '',
        status: r.status || 'pending',
        contact_notes: r.contact_notes || '',
        student_id: r.student_id || r.assigned_student_id || null,
        assigned_class_id: r.assigned_class_id || null,
        assigned_class_ids: r.assigned_class_ids || [],
        attachment_file_name: r.attachment_file_name || null,
        attachment_url: r.attachment_url && !r.attachment_url.startsWith('data:') ? r.attachment_url : null,
      }));

    default:
      return [];
  }
}

/**
 * Đẩy (Push/Upsert) 1 bảng dữ liệu cụ thể từ Local Store lên Supabase
 */
export async function pushSingleTableToSupabase(
  tableName: string,
  store: AppStore,
  urlInput?: string,
  anonKeyInput?: string
): Promise<{ success: boolean; count: number; message: string }> {
  const safeTableName = sanitizeSupabaseTableName(tableName);
  const client = createSupabaseClientInstance(urlInput, anonKeyInput);
  if (!client) {
    return { success: false, count: 0, message: 'Chưa kết nối Supabase.' };
  }

  const rows = serializeTableRowsForSupabase(safeTableName, store);
  if (rows.length === 0) {
    return { success: true, count: 0, message: `Bảng ${safeTableName} hiện đang trống (0 bản ghi).` };
  }

  try {
    const { error } = await client.from(safeTableName).upsert(rows, { onConflict: 'id' });
    if (error) {
      return {
        success: false,
        count: 0,
        message: `Lỗi đẩy bảng ${safeTableName}: ${error.message}`,
      };
    }
    return {
      success: true,
      count: rows.length,
      message: `Đã đồng bộ ${rows.length} bản ghi lên bảng ${safeTableName} thành công!`,
    };
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      message: `Lỗi kết nối khi đẩy bảng ${safeTableName}: ${err?.message || 'Unknown error'}`,
    };
  }
}

/**
 * Tải (Pull) dữ liệu của 1 bảng hoặc toàn bộ 10 bảng từ Supabase về Local Store
 */
export async function pullAllTablesFromSupabase(
  currentStore: AppStore,
  urlInput?: string,
  anonKeyInput?: string,
  onProgress?: (tableName: string, progressPercent: number) => void
): Promise<{ success: boolean; updatedStore: AppStore; totalPulled: number; message: string }> {
  const client = createSupabaseClientInstance(urlInput, anonKeyInput);
  if (!client) {
    return {
      success: false,
      updatedStore: currentStore,
      totalPulled: 0,
      message: 'Chưa cấu hình kết nối Supabase.',
    };
  }

  const nextStore: AppStore = { ...currentStore };
  let totalPulled = 0;
  const totalTables = ROYAL_STANDARDIZED_10_TABLES.length;

  for (let i = 0; i < totalTables; i++) {
    const tbl = ROYAL_STANDARDIZED_10_TABLES[i];
    const safeTableName = sanitizeSupabaseTableName(tbl.tableName);
    onProgress?.(safeTableName, Math.round(((i + 1) / totalTables) * 100));

    try {
      const { data, error } = await client.from(safeTableName).select('*');
      if (error || !Array.isArray(data) || data.length === 0) continue;

      totalPulled += data.length;

      switch (safeTableName) {
        case 'campuses':
          nextStore.campuses = data as Campus[];
          break;
        case 'academic_terms':
          nextStore.terms = data as AcademicTerm[];
          break;
        case 'subjects':
          nextStore.subjects = data.map((r: any): Subject => ({
            id: r.id,
            code: r.code,
            name: r.name,
            category: r.category || 'Thể thao',
            standard_duration: r.standard_duration || '90 phút',
            description: r.description || '',
            is_active: r.is_active !== false,
          }));
          break;
        case 'teachers':
          nextStore.teachers = data.map((r: any): Teacher => ({
            id: r.id,
            code: r.code,
            name: r.name,
            phone: r.phone || '',
            email: r.email || '',
            campus_id: r.campus_id || 'camp_pmh',
            type: r.type || r.teacher_type || 'permanent',
            teacher_type: r.teacher_type || r.type || 'permanent',
            fixed_rate_per_session: Number(r.fixed_rate_per_session) || 300000,
            default_rate_per_period: Number(r.default_rate_per_period) || 150000,
            periods_per_session: Number(r.periods_per_session) || 2,
            bank_account: r.bank_account || undefined,
            subjects: Array.isArray(r.subjects) ? r.subjects : [],
            percentage_rate: 60,
            status: r.status || 'active',
          }));
          break;
        case 'extracurricular_classes':
          nextStore.classes = data.map((r: any): ExtracurricularClass => ({
            id: r.id,
            code: r.code || r.id,
            name: r.name,
            term_id: r.term_id,
            spanning_term_id: r.spanning_term_id || undefined,
            is_cross_term: Boolean(r.is_cross_term),
            term_distribution: r.term_distribution || undefined,
            campus_id: r.campus_id,
            subject_id: r.subject_id,
            facility_id: r.facility_id || '',
            time_slot_id: r.time_slot_id || '',
            days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week : ['T2', 'T4'],
            start_date: r.start_date || undefined,
            end_date: r.end_date || undefined,
            primary_teacher_id: r.primary_teacher_id || '',
            max_students: Number(r.max_students) || 25,
            total_sessions: Number(r.total_sessions) || 24,
            full_course_fee: Number(r.full_course_fee) || 0,
            price_per_session: Number(r.price_per_session) || 0,
            status: r.status || 'active',
            allow_over_quota: Boolean(r.allow_over_quota),
          }));
          break;
        case 'students':
          nextStore.students = data.map((r: any): Student => ({
            id: r.id,
            code: r.code,
            previous_student_code: r.previous_student_code || undefined,
            name: r.name,
            dob: r.dob || '2016-01-01',
            gender: r.gender === 'Nữ' ? 'Nữ' : 'Nam',
            is_royal_student: Boolean(r.is_royal_student),
            school_name: r.school_name || 'Royal School',
            regular_class: r.regular_class || '',
            parent_name: r.parent_name || '',
            parent_phone: r.parent_phone || '',
            medical_notes: r.medical_notes || '',
            avatar_url: r.avatar_url || undefined,
            status: r.status || 'active',
            created_at: r.created_at || new Date().toISOString().split('T')[0],
          }));
          break;
        case 'enrollments':
          nextStore.enrollments = data.map((r: any): Enrollment => ({
            id: r.id,
            student_id: r.student_id,
            class_id: r.class_id,
            registered_sessions: Number(r.registered_sessions) || 24,
            joined_date: r.joined_date || new Date().toISOString().split('T')[0],
            enrolled_days_of_week: Array.isArray(r.enrolled_days_of_week) ? r.enrolled_days_of_week : undefined,
            is_partial_schedule: Boolean(r.is_partial_schedule),
            is_trial: Boolean(r.is_trial),
            trial_session_date: r.trial_session_date || undefined,
            trial_attended: Boolean(r.trial_attended),
            status: r.status || 'active',
          }));
          break;
        case 'attendance_records':
          nextStore.attendance = data.map((r: any): AttendanceRecord => ({
            id: r.id,
            session_id: r.session_id || '',
            class_id: r.class_id,
            student_id: r.student_id,
            session_date: r.session_date,
            status: r.status || 'present',
            note: r.note || '',
            proof_file_name: r.proof_file_name || undefined,
            proof_url: r.proof_url || undefined,
            uploaded_by: r.uploaded_by || undefined,
            uploaded_at: r.uploaded_at || undefined,
          }));
          break;
        case 'teacher_work_sessions':
          nextStore.teacherAttendance = data.map((r: any): TeacherAttendanceRecord => ({
            id: r.id,
            class_id: r.class_id,
            term_id: r.term_id,
            campus_id: r.campus_id,
            session_date: r.session_date,
            session_number: Number(r.session_number) || 1,
            periods_count: Number(r.periods_count) || 2,
            assigned_teacher_id: r.assigned_teacher_id || '',
            actual_teacher_id: r.actual_teacher_id || '',
            is_substitute: Boolean(r.is_substitute),
            substitute_reason: r.substitute_reason || undefined,
            status: r.status || 'present',
            late_minutes: Number(r.late_minutes) || 0,
            check_in_time: r.check_in_time || '16:40',
            rate_per_period: Number(r.rate_per_period) || 150000,
            rate_applied: Number(r.rate_applied) || 300000,
            earned_amount: Number(r.earned_amount) || Number(r.total_payout) || 300000,
            total_payout: Number(r.total_payout) || 300000,
            verified_by: r.verified_by || '',
            notes: r.notes || '',
            recalculated_at: r.recalculated_at || undefined,
          }));
          break;
        case 'tuition_invoices':
          nextStore.invoices = data.map((r: any): TuitionInvoice => ({
            id: r.id,
            invoice_code: r.invoice_code,
            student_id: r.student_id,
            class_id: r.class_id,
            registered_sessions: Number(r.registered_sessions) || 24,
            total_class_sessions: Number(r.total_class_sessions) || 24,
            session_rate: Number(r.session_rate) || 166250,
            gross_amount: Number(r.gross_amount) || 0,
            credit_deducted: Number(r.credit_deducted) || 0,
            discount_amount: Number(r.discount_amount) || 0,
            net_payable: Number(r.net_payable) || 0,
            paid_amount: Number(r.paid_amount) || 0,
            outstanding_amount: Number(r.outstanding_amount) || 0,
            payment_status: r.payment_status || 'unpaid',
            due_date: r.due_date || '',
            payment_reference: r.payment_reference || undefined,
            verified_by: r.verified_by || undefined,
            verified_at: r.verified_at || undefined,
            payment_history: Array.isArray(r.payment_history) ? r.payment_history : [],
            created_at: r.created_at || new Date().toISOString().split('T')[0],
          }));
          break;
      }
    } catch {
      // continue next table
    }
  }

  // Pull credit_notes, app_users & parent_registrations if available
  try {
    const { data: creditsData } = await client.from('credit_notes').select('*');
    if (Array.isArray(creditsData) && creditsData.length > 0) {
      nextStore.makeupCredits = creditsData as MakeupCredit[];
      totalPulled += creditsData.length;
    }
  } catch {
    // ignore
  }

  try {
    const { data: usersData } = await client.from('app_users').select('*');
    if (Array.isArray(usersData) && usersData.length > 0) {
      nextStore.users = usersData.map((r: any) => mapSupabaseRowToStoreEntity('app_users', r));
      totalPulled += usersData.length;
    }
  } catch {
    // ignore
  }

  try {
    const { data: regsData } = await client.from('parent_registrations').select('*');
    if (Array.isArray(regsData) && regsData.length > 0) {
      nextStore.parentRegistrations = regsData.map((r: any) => mapSupabaseRowToStoreEntity('parent_registrations', r));
      totalPulled += regsData.length;
    }
  } catch {
    // ignore
  }

  return {
    success: true,
    updatedStore: nextStore,
    totalPulled,
    message: `Đã tải và đồng bộ ${totalPulled} bản ghi từ Supabase PostgreSQL về hệ thống!`,
  };
}

/**
 * Đẩy toàn bộ 10 bảng theo đúng thứ tự khóa ngoại (Dependency Order) lên Supabase
 */
export async function pushAllTablesToSupabase(
  store: AppStore,
  urlInput?: string,
  anonKeyInput?: string,
  onProgress?: (tableName: string, progressPercent: number) => void
): Promise<{
  success: boolean;
  totalSynced: number;
  failedTables: string[];
  message: string;
}> {
  const client = createSupabaseClientInstance(urlInput, anonKeyInput);
  if (!client) {
    return {
      success: false,
      totalSynced: 0,
      failedTables: [],
      message: 'Chưa kết nối Supabase.',
    };
  }

  let totalSynced = 0;
  const failedTables: string[] = [];
  const totalTables = ROYAL_STANDARDIZED_10_TABLES.length;

  for (let i = 0; i < totalTables; i++) {
    const tbl = ROYAL_STANDARDIZED_10_TABLES[i];
    onProgress?.(tbl.tableName, Math.round(((i + 1) / totalTables) * 100));

    const res = await pushSingleTableToSupabase(tbl.tableName, store, urlInput, anonKeyInput);
    if (res.success) {
      totalSynced += res.count;
    } else {
      failedTables.push(tbl.tableName);
    }
  }

  // Push credit_notes, app_users, parent_registrations as well if any
  for (const extraTable of ['credit_notes', 'app_users', 'parent_registrations']) {
    const extraRes = await pushSingleTableToSupabase(extraTable, store, urlInput, anonKeyInput);
    if (extraRes.success) totalSynced += extraRes.count;
  }

  if (failedTables.length > 0) {
    return {
      success: false,
      totalSynced,
      failedTables,
      message: `Đã đẩy ${totalSynced} bản ghi. Có ${failedTables.length} bảng chưa khởi tạo trên Supabase (${failedTables.join(', ')}) — vui lòng chạy SQL DDL.`,
    };
  }

  return {
    success: true,
    totalSynced,
    failedTables: [],
    message: `Đã đồng bộ thành công toàn bộ 10 bảng (${totalSynced} bản ghi) lên Supabase PostgreSQL!`,
  };
}

/**
 * Ánh xạ tên bảng Supabase sang khóa tương ứng trong AppStore
 */
export const SUPABASE_TABLE_TO_STORE_KEY: Record<string, keyof AppStore> = {
  app_users: 'users',
  campuses: 'campuses',
  academic_terms: 'terms',
  subjects: 'subjects',
  teachers: 'teachers',
  extracurricular_classes: 'classes',
  students: 'students',
  enrollments: 'enrollments',
  attendance_records: 'attendance',
  teacher_work_sessions: 'teacherAttendance',
  tuition_invoices: 'invoices',
  credit_notes: 'makeupCredits',
  parent_registrations: 'parentRegistrations',
};

/**
 * Chuyển đổi 1 dòng dữ liệu (Row) nhận từ Supabase Realtime Payload sang chuẩn Entity trong AppStore
 */
export function mapSupabaseRowToStoreEntity(tableName: string, r: any): any {
  if (!r || typeof r !== 'object') return r;
  const cleanTable = sanitizeSupabaseTableName(tableName);

  switch (cleanTable) {
    case 'app_users':
      return {
        id: r.id,
        username: r.username || '',
        email: r.email || '',
        password: r.password || r.password_hash || '123456',
        password_hash: r.password_hash || r.password || '123456',
        full_name: r.full_name || r.name || r.username || '',
        phone: r.phone || '',
        role: r.role || 'academic',
        department: r.department || '',
        campus_id: r.campus_id || 'all',
        status: r.status === 'locked' ? 'locked' : 'active',
        permissions: r.permissions || undefined,
        linked_teacher_id: r.linked_teacher_id || r.teacher_id || undefined,
        last_login: r.last_login || undefined,
        created_at: r.created_at || new Date().toISOString().split('T')[0],
      };

    case 'extracurricular_classes':
      return {
        id: r.id,
        code: r.code || r.id,
        name: r.name,
        term_id: r.term_id,
        spanning_term_id: r.spanning_term_id || undefined,
        is_cross_term: Boolean(r.is_cross_term),
        term_distribution: r.term_distribution || undefined,
        campus_id: r.campus_id,
        subject_id: r.subject_id,
        facility_id: r.facility_id || '',
        time_slot_id: r.time_slot_id || '',
        days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week : ['T2', 'T4'],
        start_date: r.start_date || undefined,
        end_date: r.end_date || undefined,
        primary_teacher_id: r.primary_teacher_id || '',
        max_students: Number(r.max_students) || 25,
        current_students: r.current_students !== undefined ? Number(r.current_students) : undefined,
        total_sessions: Number(r.total_sessions) || 24,
        full_course_fee: Number(r.full_course_fee) || 0,
        price_per_session: Number(r.price_per_session) || 0,
        status: r.status || 'active',
        allow_over_quota: Boolean(r.allow_over_quota),
      };

    case 'enrollments':
      return {
        id: r.id,
        student_id: r.student_id,
        class_id: r.class_id,
        registered_sessions: Number(r.registered_sessions) || 24,
        joined_date: r.joined_date || new Date().toISOString().split('T')[0],
        enrolled_days_of_week: Array.isArray(r.enrolled_days_of_week) ? r.enrolled_days_of_week : undefined,
        is_partial_schedule: Boolean(r.is_partial_schedule),
        is_trial: Boolean(r.is_trial),
        trial_session_date: r.trial_session_date || undefined,
        trial_attended: Boolean(r.trial_attended),
        status: r.status || 'active',
      };

    case 'attendance_records':
      return {
        id: r.id,
        session_id: r.session_id || '',
        class_id: r.class_id,
        student_id: r.student_id,
        session_date: r.session_date,
        status: r.status || 'present',
        note: r.note || '',
        proof_file_name: r.proof_file_name || undefined,
        proof_url: r.proof_url || undefined,
        uploaded_by: r.uploaded_by || undefined,
        uploaded_at: r.uploaded_at || undefined,
      };

    case 'teacher_work_sessions':
      return {
        id: r.id,
        class_id: r.class_id,
        term_id: r.term_id,
        campus_id: r.campus_id,
        session_date: r.session_date,
        session_number: Number(r.session_number) || 1,
        periods_count: Number(r.periods_count) || 2,
        assigned_teacher_id: r.assigned_teacher_id || '',
        actual_teacher_id: r.actual_teacher_id || '',
        is_substitute: Boolean(r.is_substitute),
        substitute_reason: r.substitute_reason || undefined,
        status: r.status || 'present',
        late_minutes: Number(r.late_minutes) || 0,
        check_in_time: r.check_in_time || '16:40',
        rate_per_period: Number(r.rate_per_period) || 150000,
        rate_applied: Number(r.rate_applied) || 300000,
        earned_amount: Number(r.earned_amount) || Number(r.total_payout) || 300000,
        total_payout: Number(r.total_payout) || 300000,
        verified_by: r.verified_by || '',
        notes: r.notes || '',
        recalculated_at: r.recalculated_at || undefined,
      };

    case 'tuition_invoices':
      return {
        id: r.id,
        invoice_code: r.invoice_code,
        student_id: r.student_id,
        class_id: r.class_id,
        registered_sessions: Number(r.registered_sessions) || 24,
        total_class_sessions: Number(r.total_class_sessions) || 24,
        session_rate: Number(r.session_rate) || 166250,
        gross_amount: Number(r.gross_amount) || 0,
        credit_deducted: Number(r.credit_deducted) || 0,
        discount_amount: Number(r.discount_amount) || 0,
        net_payable: Number(r.net_payable) || 0,
        paid_amount: Number(r.paid_amount) || 0,
        outstanding_amount: Number(r.outstanding_amount) || 0,
        payment_status: r.payment_status || 'unpaid',
        due_date: r.due_date || '',
        payment_reference: r.payment_reference || undefined,
        verified_by: r.verified_by || undefined,
        verified_at: r.verified_at || undefined,
        payment_history: Array.isArray(r.payment_history) ? r.payment_history : [],
        created_at: r.created_at || new Date().toISOString().split('T')[0],
      };

    case 'credit_notes':
      return {
        id: r.id,
        credit_code: r.credit_code,
        student_id: r.student_id,
        source_class_id: r.source_class_id || '',
        subject_id: r.subject_id || '',
        term_id: r.term_id || '',
        consecutive_absent_count: Number(r.consecutive_absent_count) || 3,
        consecutive_dates: Array.isArray(r.consecutive_dates) ? r.consecutive_dates : [],
        source_rate: Number(r.source_rate) || 0,
        credit_rule: r.credit_rule || 'monetary',
        total_credit_amount: Number(r.total_credit_amount) || 0,
        transferred_sessions: Number(r.transferred_sessions) || 3,
        issue_date: r.issue_date || new Date().toISOString().split('T')[0],
        expiry_date: r.expiry_date || '',
        status: r.status || 'issued',
        redeemed_info: r.redeemed_info || undefined,
        note: r.note || '',
      };

    case 'parent_registrations':
      return {
        id: r.id,
        registration_code: r.registration_code || r.code || r.id,
        code: r.registration_code || r.code || r.id,
        parent_name: r.parent_name || '',
        parent_phone: r.parent_phone || '',
        parent_email: r.parent_email || '',
        student_name: r.student_name || '',
        student_dob: r.student_dob || r.dob || '2016-01-01',
        dob: r.student_dob || r.dob || '2016-01-01',
        student_grade: r.student_grade || '',
        current_school: r.current_school || 'Royal School',
        current_class: r.current_class || '',
        desired_campus_id: r.desired_campus_id || r.campus_id || 'camp_pmh',
        campus_id: r.desired_campus_id || r.campus_id || 'camp_pmh',
        desired_term_id: r.desired_term_id || undefined,
        desired_subject_id: r.desired_subject_id || r.preferred_subject_id || '',
        preferred_subject_id: r.desired_subject_id || r.preferred_subject_id || '',
        desired_time_slot_type: r.desired_time_slot_type || 'after_school',
        registered_subjects: Array.isArray(r.registered_subjects) ? r.registered_subjects : [],
        is_royal_student: Boolean(r.is_royal_student ?? r.is_royal ?? true),
        is_royal: Boolean(r.is_royal_student ?? r.is_royal ?? true),
        medical_notes: r.medical_notes || '',
        notes: r.notes || '',
        estimated_fee: Number(r.estimated_fee) || 0,
        discount_policy: r.discount_policy || '',
        status: r.status || 'pending',
        contact_notes: r.contact_notes || '',
        student_id: r.student_id || undefined,
        assigned_class_id: r.assigned_class_id || undefined,
        assigned_class_ids: Array.isArray(r.assigned_class_ids) ? r.assigned_class_ids : [],
        attachment_file_name: r.attachment_file_name || undefined,
        attachment_url: r.attachment_url || undefined,
        created_at: r.created_at || new Date().toISOString(),
      };

    default:
      return r;
  }
}

export interface RealtimeMutationEvent {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: any;
  old: any;
  commit_timestamp: string;
  originClientId?: string;
}

/**
 * Phát hiện sự thay đổi (Diff) giữa 2 trạng thái Store và tự động đồng bộ các bản ghi Thêm / Sửa / Xóa lên Supabase
 */
export async function syncStoreDeltaToSupabase(
  prevStore: AppStore,
  nextStore: AppStore,
  originClientId: string
): Promise<RealtimeMutationEvent[]> {
  const events: RealtimeMutationEvent[] = [];
  const nowIso = new Date().toISOString();

  const tablesToWatch: Array<{ table: string; storeKey: keyof AppStore }> = [
    { table: 'app_users', storeKey: 'users' },
    { table: 'campuses', storeKey: 'campuses' },
    { table: 'academic_terms', storeKey: 'terms' },
    { table: 'subjects', storeKey: 'subjects' },
    { table: 'teachers', storeKey: 'teachers' },
    { table: 'extracurricular_classes', storeKey: 'classes' },
    { table: 'students', storeKey: 'students' },
    { table: 'enrollments', storeKey: 'enrollments' },
    { table: 'attendance_records', storeKey: 'attendance' },
    { table: 'teacher_work_sessions', storeKey: 'teacherAttendance' },
    { table: 'tuition_invoices', storeKey: 'invoices' },
    { table: 'credit_notes', storeKey: 'makeupCredits' },
    { table: 'parent_registrations', storeKey: 'parentRegistrations' },
  ];

  const client = createSupabaseClientInstance(
    nextStore.supabaseConfig?.url,
    nextStore.supabaseConfig?.anonKey
  );

  for (const { table, storeKey } of tablesToWatch) {
    const prevList = ((prevStore[storeKey] as any[]) || []);
    const nextList = ((nextStore[storeKey] as any[]) || []);
    if (prevList === nextList) continue;

    const prevMap = new Map<string, any>();
    for (const item of prevList) {
      if (item && item.id) prevMap.set(String(item.id), item);
    }

    const nextMap = new Map<string, any>();
    const toUpsertIds = new Set<string>();

    for (const item of nextList) {
      if (!item || !item.id) continue;
      const id = String(item.id);
      nextMap.set(id, item);

      const oldItem = prevMap.get(id);
      if (!oldItem) {
        toUpsertIds.add(id);
        events.push({
          table,
          eventType: 'INSERT',
          new: item,
          old: {},
          commit_timestamp: nowIso,
          originClientId,
        });
      } else if (oldItem !== item && JSON.stringify(oldItem) !== JSON.stringify(item)) {
        toUpsertIds.add(id);
        events.push({
          table,
          eventType: 'UPDATE',
          new: item,
          old: oldItem,
          commit_timestamp: nowIso,
          originClientId,
        });
      }
    }

    const toDeleteIds: string[] = [];
    for (const [id, oldItem] of prevMap.entries()) {
      if (!nextMap.has(id)) {
        toDeleteIds.push(id);
        events.push({
          table,
          eventType: 'DELETE',
          new: {},
          old: { id, ...oldItem },
          commit_timestamp: nowIso,
          originClientId,
        });
      }
    }

    if (client) {
      if (toUpsertIds.size > 0) {
        const serializedAll = serializeTableRowsForSupabase(table, nextStore);
        const rowsToUpsert = serializedAll.filter(r => toUpsertIds.has(String(r.id)));
        if (rowsToUpsert.length > 0) {
          client
            .from(table)
            .upsert(rowsToUpsert, { onConflict: 'id' })
            .then(() => {})
            .catch(() => {});
        }
      }

      if (toDeleteIds.length > 0) {
        client
          .from(table)
          .delete()
          .in('id', toDeleteIds)
          .then(() => {})
          .catch(() => {});
      }
    }
  }

  return events;
}


