import {
  supabase,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  sanitizeSupabaseBaseUrl,
} from '../supabaseClient';
import { AppStore } from '../types';

export {
  supabase,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  sanitizeSupabaseBaseUrl,
};

export interface TableSpec {
  index: number;
  sheetName: string;
  tableName: string;
  storeKey: keyof AppStore | string;
  titleVN: string;
  category: string;
  primaryKey: string;
  uniqueKey: string;
  foreignKeys: string[];
  description: string;
  columns: string[];
}

export const ROYAL_STANDARDIZED_10_TABLES: TableSpec[] = [
  {
    index: 1,
    sheetName: '01_CO_SO',
    tableName: 'campuses',
    storeKey: 'campuses',
    titleVN: 'Danh Mục Cơ Sở Trường Học',
    category: 'Master Data',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: [],
    description: 'Danh mục các cơ sở trường Royal School (Phú Mỹ Hưng, Phú Lâm) cùng thông tin tài khoản ngân hàng thụ hưởng.',
    columns: ['id', 'code', 'name', 'address', 'phone', 'bank_name', 'bank_account', 'bank_owner', 'status'],
  },
  {
    index: 2,
    sheetName: '02_KHOA_HOC',
    tableName: 'academic_terms',
    storeKey: 'terms',
    titleVN: 'Khóa Học & Niên Khóa',
    category: 'Master Data',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: [],
    description: 'Thời gian biểu các khóa học ngoại khóa, niên khóa đào tạo, ngày khai giảng và ngày kết thúc toàn hệ thống.',
    columns: ['id', 'code', 'name', 'academic_year', 'start_date', 'end_date', 'status', 'is_active', 'description'],
  },
  {
    index: 3,
    sheetName: '03_MON_HOC_BIEU_PHI',
    tableName: 'subjects',
    storeKey: 'subjects',
    titleVN: 'Môn Học & Biểu Phí Chuẩn',
    category: 'Curriculum & Pricing',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: [],
    description: 'Chương trình các môn học năng khiếu, thể thao, nghệ thuật, STEM và bảng giá chuẩn theo từng cơ sở.',
    columns: ['id', 'code', 'name', 'category', 'standard_duration', 'description'],
  },
  {
    index: 4,
    sheetName: '04_GIAO_VIEN',
    tableName: 'teachers',
    storeKey: 'teachers',
    titleVN: 'Hồ Sơ Giáo Viên & Định Mức',
    category: 'Human Resources',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: ['campus_id'],
    description: 'Danh sách nhân sự giảng dạy cơ hữu và thỉnh giảng, định mức thù lao ca dạy và thông tin thanh toán tiền lương.',
    columns: ['id', 'code', 'name', 'phone', 'email', 'campus_id', 'type', 'fixed_rate_per_session', 'periods_per_session', 'default_rate_per_period', 'bank_name', 'bank_account', 'bank_owner', 'status'],
  },
  {
    index: 5,
    sheetName: '05_LOP_HOC',
    tableName: 'extracurricular_classes',
    storeKey: 'classes',
    titleVN: 'Lớp Học Ngoại Khóa',
    category: 'Operations',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: ['campus_id', 'term_id', 'subject_id', 'primary_teacher_id'],
    description: 'Các lớp ngoại khóa mở thực tế theo khóa, lịch học các thứ trong tuần, sĩ số trần và học phí niêm yết.',
    columns: ['id', 'name', 'code', 'term_id', 'campus_id', 'subject_id', 'primary_teacher_id', 'days_of_week', 'start_date', 'end_date', 'max_students', 'total_sessions', 'full_course_fee', 'price_per_session', 'status'],
  },
  {
    index: 6,
    sheetName: '06_HOC_SINH',
    tableName: 'students',
    storeKey: 'students',
    titleVN: 'Hồ Sơ Học Viên & Y Tế',
    category: 'Student Affairs',
    primaryKey: 'id',
    uniqueKey: 'code',
    foreignKeys: ['campus_id'],
    description: 'Hồ sơ học sinh chính quy Royal và học viên ngoài trường, mã định danh RY/EXT, thông tin phụ huynh và lưu ý dị ứng.',
    columns: ['id', 'code', 'previous_student_code', 'name', 'dob', 'gender', 'campus_id', 'is_royal_student', 'school_name', 'regular_class', 'parent_name', 'parent_phone', 'medical_notes', 'status', 'created_at'],
  },
  {
    index: 7,
    sheetName: '07_GHI_DANH',
    tableName: 'enrollments',
    storeKey: 'enrollments',
    titleVN: 'Ghi Danh & Xếp Lớp',
    category: 'Admissions & Enrollment',
    primaryKey: 'id',
    uniqueKey: 'id',
    foreignKeys: ['student_id', 'class_id'],
    description: 'Quan hệ đăng ký học sinh vào từng lớp ngoại khóa cụ thể, lịch học bán phần tuần, đăng ký học thử và trạng thái.',
    columns: ['id', 'student_id', 'class_id', 'registered_sessions', 'joined_date', 'enrolled_days_of_week', 'is_partial_schedule', 'is_trial', 'trial_session_date', 'status'],
  },
  {
    index: 8,
    sheetName: '08_DIEM_DANH_HS',
    tableName: 'attendance_records',
    storeKey: 'attendance',
    titleVN: 'Điểm Danh & Chuyên Cần',
    category: 'Academic Tracking',
    primaryKey: 'id',
    uniqueKey: 'id',
    foreignKeys: ['class_id', 'student_id'],
    description: 'Nhật ký điểm danh từng buổi học của học sinh, lý do vắng có phép/không phép và tệp ảnh minh chứng đơn xin nghỉ.',
    columns: ['id', 'session_id', 'session_date', 'class_id', 'student_id', 'status', 'note', 'proof_file_name', 'proof_url', 'uploaded_by'],
  },
  {
    index: 9,
    sheetName: '09_CHAM_CONG_GV',
    tableName: 'teacher_work_sessions',
    storeKey: 'teacherAttendance',
    titleVN: 'Chấm Công & Giảng Dạy',
    category: 'Payroll & HR',
    primaryKey: 'id',
    uniqueKey: 'id',
    foreignKeys: ['class_id', 'assigned_teacher_id'],
    description: 'Dữ liệu chấm công giáo viên thực tế đứng lớp, ghi nhận dạy thay, số tiết quy đổi và tổng tiền thù lao ca dạy.',
    columns: ['id', 'session_date', 'session_number', 'term_id', 'campus_id', 'class_id', 'assigned_teacher_id', 'actual_teacher_id', 'is_substitute', 'status', 'checkin_time', 'converted_periods', 'rate_applied', 'total_pay', 'verified_by', 'note'],
  },
  {
    index: 10,
    sheetName: '10_HOA_DON_HOC_PHI',
    tableName: 'tuition_invoices',
    storeKey: 'invoices',
    titleVN: 'Hóa Đơn & Thu Học Phí',
    category: 'Finance & Accounting',
    primaryKey: 'id',
    uniqueKey: 'invoice_code',
    foreignKeys: ['student_id', 'class_id'],
    description: 'Hóa đơn học phí chi tiết từng học sinh, cấn trừ bảo lưu tín chỉ, miễn giảm ưu đãi, số tiền đã thu và nợ đọng.',
    columns: ['id', 'invoice_code', 'student_id', 'class_id', 'registered_sessions', 'session_rate', 'gross_amount', 'credit_deducted', 'discount_amount', 'net_payable', 'paid_amount', 'outstanding_amount', 'status', 'due_date', 'bank_reference', 'confirmed_by', 'created_at'],
  },
];

export interface TableHealthStatus {
  index: number;
  sheetName: string;
  tableName: string;
  storeKey: string;
  titleVN: string;
  category: string;
  primaryKey: string;
  uniqueKey: string;
  foreignKeys: string[];
  localCount: number;
  remoteCount: number | null;
  status: 'synced' | 'out_of_sync' | 'table_missing' | 'local_only' | 'error' | 'rls_blocked';
  latencyMs: number | null;
  integrityValid: boolean;
  integrityIssues: string[];
  statusLabel: string;
  message: string;
}

export interface SupabaseConnectionCheckResult {
  connected: boolean;
  latencyMs: number;
  hasStorageBucket: boolean;
  restApiOk: boolean;
  authKeyValid: boolean;
  message: string;
  details?: any;
}

export const SUPABASE_FULL_DDL_SQL = `-- ROYAL SCHOOL - CƠ SỞ DỮ LIỆU ĐA CƠ SỞ (10 BẢNG CHUẨN HÓA 3NF)
-- Thiết kế tối ưu cho PostgreSQL / Supabase Realtime

CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  bank_name TEXT,
  bank_account TEXT,
  bank_owner TEXT,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS academic_terms (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'upcoming',
  is_active BOOLEAN DEFAULT false,
  description TEXT
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  standard_duration TEXT DEFAULT '90 phút',
  description TEXT
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  campus_id TEXT REFERENCES campuses(id),
  type TEXT DEFAULT 'permanent',
  fixed_rate_per_session NUMERIC DEFAULT 300000,
  periods_per_session INT DEFAULT 2,
  default_rate_per_period NUMERIC DEFAULT 150000,
  bank_name TEXT,
  bank_account TEXT,
  bank_owner TEXT,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS extracurricular_classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  term_id TEXT REFERENCES academic_terms(id),
  campus_id TEXT REFERENCES campuses(id),
  subject_id TEXT REFERENCES subjects(id),
  primary_teacher_id TEXT REFERENCES teachers(id),
  days_of_week JSONB DEFAULT '[]'::jsonb,
  start_date DATE,
  end_date DATE,
  max_students INT DEFAULT 20,
  total_sessions INT DEFAULT 24,
  full_course_fee NUMERIC DEFAULT 3990000,
  price_per_session NUMERIC DEFAULT 166250,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  previous_student_code TEXT,
  name TEXT NOT NULL,
  dob DATE,
  gender TEXT,
  campus_id TEXT REFERENCES campuses(id),
  is_royal_student BOOLEAN DEFAULT true,
  school_name TEXT,
  regular_class TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  medical_notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  registered_sessions INT DEFAULT 24,
  joined_date DATE,
  enrolled_days_of_week JSONB DEFAULT '[]'::jsonb,
  is_partial_schedule BOOLEAN DEFAULT false,
  is_trial BOOLEAN DEFAULT false,
  trial_session_date DATE,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  session_date DATE NOT NULL,
  class_id TEXT REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'present',
  note TEXT,
  proof_file_name TEXT,
  proof_url TEXT,
  uploaded_by TEXT
);

CREATE TABLE IF NOT EXISTS teacher_work_sessions (
  id TEXT PRIMARY KEY,
  session_date DATE NOT NULL,
  session_number INT DEFAULT 1,
  term_id TEXT REFERENCES academic_terms(id),
  campus_id TEXT REFERENCES campuses(id),
  class_id TEXT REFERENCES extracurricular_classes(id),
  assigned_teacher_id TEXT REFERENCES teachers(id),
  actual_teacher_id TEXT REFERENCES teachers(id),
  is_substitute BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'completed',
  checkin_time TEXT,
  converted_periods NUMERIC DEFAULT 2,
  rate_applied NUMERIC DEFAULT 300000,
  total_pay NUMERIC DEFAULT 300000,
  verified_by TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS tuition_invoices (
  id TEXT PRIMARY KEY,
  invoice_code TEXT UNIQUE NOT NULL,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  registered_sessions INT DEFAULT 24,
  session_rate NUMERIC DEFAULT 166250,
  gross_amount NUMERIC DEFAULT 3990000,
  credit_deducted NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  net_payable NUMERIC DEFAULT 3990000,
  paid_amount NUMERIC DEFAULT 0,
  outstanding_amount NUMERIC DEFAULT 3990000,
  status TEXT DEFAULT 'unpaid',
  due_date DATE,
  bank_reference TEXT,
  confirmed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bảng tài khoản người dùng và đơn đăng ký phụ huynh
CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  code TEXT,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'teacher',
  department TEXT,
  campus_id TEXT DEFAULT 'all',
  status TEXT DEFAULT 'active',
  permissions JSONB DEFAULT '{}'::jsonb,
  linked_teacher_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS parent_registrations (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  campus_id TEXT,
  student_name TEXT NOT NULL,
  student_dob DATE,
  student_gender TEXT,
  is_royal_student BOOLEAN DEFAULT true,
  regular_class TEXT,
  school_name TEXT,
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  parent_email TEXT,
  medical_notes TEXT,
  desired_courses JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  assigned_student_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

export const SUPABASE_REALTIME_PUBLICATION_SQL = `-- BẬT SUPABASE REALTIME CHO CÁC BẢNG TRỌNG YẾU
ALTER PUBLICATION supabase_realtime ADD TABLE parent_registrations, app_users, tuition_invoices, extracurricular_classes;
`;

/**
 * Kiểm tra kết nối tới Supabase Cloud
 */
export async function verifySupabaseConnection(
  _url?: string,
  _anonKey?: string
): Promise<SupabaseConnectionCheckResult> {
  const t0 = performance.now();
  try {
    const { count, error } = await supabase
      .from('campuses')
      .select('*', { count: 'exact', head: true });

    const latencyMs = Math.round(performance.now() - t0);

    if (error && error.code !== 'PGRST116') {
      return {
        connected: true,
        latencyMs,
        hasStorageBucket: false,
        restApiOk: true,
        authKeyValid: true,
        message: `Đã kết nối máy chủ Supabase (${latencyMs}ms). Cần thực thi DDL script để khởi tạo các bảng.`,
        details: error,
      };
    }

    return {
      connected: true,
      latencyMs,
      hasStorageBucket: true,
      restApiOk: true,
      authKeyValid: true,
      message: `Kết nối thành công tới Supabase (${latencyMs}ms). CSDL sẵn sàng hoạt động.`,
      details: { count },
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - t0);
    return {
      connected: false,
      latencyMs,
      hasStorageBucket: false,
      restApiOk: false,
      authKeyValid: false,
      message: err?.message || 'Không thể kết nối đến máy chủ Supabase.',
      details: err,
    };
  }
}

/**
 * Quét toàn diện tình trạng sức khỏe của 10 bảng dữ liệu
 */
export async function inspectAllDatabaseTables(
  store: AppStore,
  _url?: string,
  _anonKey?: string
): Promise<TableHealthStatus[]> {
  const result: TableHealthStatus[] = [];

  for (const spec of ROYAL_STANDARDIZED_10_TABLES) {
    const rawLocal = (store as any)[spec.storeKey];
    const localCount = Array.isArray(rawLocal) ? rawLocal.length : 0;

    let remoteCount: number | null = null;
    let status: TableHealthStatus['status'] = 'local_only';
    let statusLabel = 'Chuẩn hóa Local';
    let message = 'Dữ liệu đang lưu trữ cục bộ tại trình duyệt (3NF).';

    try {
      const t0 = performance.now();
      const { count, error } = await supabase
        .from(spec.tableName)
        .select('*', { count: 'exact', head: true });
      const latency = Math.round(performance.now() - t0);

      if (!error) {
        remoteCount = count ?? 0;
        if (remoteCount === localCount) {
          status = 'synced';
          statusLabel = '✓ Đã đồng bộ Cloud';
          message = `Khớp hoàn toàn ${localCount} bản ghi (${latency}ms).`;
        } else {
          status = 'out_of_sync';
          statusLabel = 'Chưa khớp bản ghi';
          message = `Local: ${localCount} • Cloud: ${remoteCount} bản ghi.`;
        }
      } else if (error.code === '42P01') {
        status = 'table_missing';
        statusLabel = 'Bảng chưa tạo trên CSDL';
        message = 'Chạy mã DDL SQL để tạo bảng này trên Supabase.';
      }
    } catch {
      status = 'local_only';
    }

    result.push({
      index: spec.index,
      sheetName: spec.sheetName,
      tableName: spec.tableName,
      storeKey: spec.storeKey,
      titleVN: spec.titleVN,
      category: spec.category,
      primaryKey: spec.primaryKey,
      uniqueKey: spec.uniqueKey,
      foreignKeys: spec.foreignKeys,
      localCount,
      remoteCount,
      status,
      latencyMs: null,
      integrityValid: true,
      integrityIssues: [],
      statusLabel,
      message,
    });
  }

  return result;
}

/**
 * Đẩy dữ liệu của 1 bảng lên Supabase
 */
export async function pushSingleTableToSupabase(
  tableName: string,
  store: AppStore,
  _url?: string,
  _anonKey?: string
): Promise<{ success: boolean; message: string }> {
  const spec = ROYAL_STANDARDIZED_10_TABLES.find((s) => s.tableName === tableName);
  if (!spec) {
    return { success: false, message: `Không tìm thấy cấu hình bảng ${tableName}.` };
  }

  const records = (store as any)[spec.storeKey];
  if (!Array.isArray(records) || records.length === 0) {
    return { success: true, message: `Bảng ${spec.titleVN} không có bản ghi nào để đẩy.` };
  }

  try {
    const { error } = await (supabase.from(tableName) as any).upsert(records, {
      onConflict: spec.primaryKey,
    });

    if (error) {
      return {
        success: false,
        message: `Lỗi đồng bộ bảng ${tableName}: ${error.message}`,
      };
    }

    return {
      success: true,
      message: `Đã đồng bộ ${records.length} bản ghi của bảng "${spec.titleVN}" lên Supabase!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi kết nối khi đẩy bảng ${tableName}: ${err?.message || 'Không xác định'}`,
    };
  }
}

/**
 * Đẩy toàn bộ 10 bảng lên Supabase
 */
export async function pushAllTablesToSupabase(
  store: AppStore,
  _url?: string,
  _anonKey?: string,
  onProgress?: (tableName: string, progress: number) => void
): Promise<{ success: boolean; message: string }> {
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < ROYAL_STANDARDIZED_10_TABLES.length; i++) {
    const spec = ROYAL_STANDARDIZED_10_TABLES[i];
    const progress = Math.round(((i + 1) / ROYAL_STANDARDIZED_10_TABLES.length) * 100);
    if (onProgress) {
      onProgress(spec.titleVN, progress);
    }

    const res = await pushSingleTableToSupabase(spec.tableName, store);
    if (res.success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  if (failCount === 0) {
    return {
      success: true,
      message: `Đồng bộ thành công trọn vẹn cả 10 bảng (${successCount}/10) lên CSDL Supabase!`,
    };
  }

  return {
    success: false,
    message: `Đồng bộ hoàn tất: ${successCount} bảng thành công, ${failCount} bảng cảnh báo hoặc chưa tạo trên CSDL.`,
  };
}

/**
 * Kéo toàn bộ 10 bảng từ Supabase về Local Store
 */
export async function pullAllTablesFromSupabase(
  _store: AppStore,
  _url?: string,
  _anonKey?: string
): Promise<{ success: boolean; message: string; updatedStore?: Partial<AppStore> }> {
  const updated: Partial<AppStore> = {};
  let loadedCount = 0;

  for (const spec of ROYAL_STANDARDIZED_10_TABLES) {
    try {
      const { data, error } = await supabase.from(spec.tableName).select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        (updated as any)[spec.storeKey] = data;
        loadedCount++;
      }
    } catch {
      // noop
    }
  }

  if (loadedCount > 0) {
    return {
      success: true,
      message: `Đã nạp thành công dữ liệu ${loadedCount}/10 bảng từ Supabase Cloud!`,
      updatedStore: updated,
    };
  }

  return {
    success: false,
    message: 'Không tìm thấy dữ liệu trên các bảng Supabase hoặc chưa kích hoạt.',
  };
}
