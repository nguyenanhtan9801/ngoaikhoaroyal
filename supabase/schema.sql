-- ==============================================================================
-- ROYAL SCHOOL EXTRACURRICULAR MANAGEMENT - EXECUTIVE BI & ANALYTICS HUB
-- POSTGRESQL 15+ DATABASE SCHEMA (SUPABASE ENGINE)
-- 3rd Normal Form (3NF), Referential Integrity & Domain Constraints
-- ==============================================================================

-- Bật extension tạo UUID tự động
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. NHÓM MASTER & DANH MỤC PHÂN CẤP
CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  bank_name TEXT,
  bank_account TEXT,
  bank_owner TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_terms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL DEFAULT '2026-2027',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_weeks INTEGER DEFAULT 16,
  status TEXT NOT NULL CHECK (status IN ('planning', 'draft', 'enrollment_open', 'open_enrollment', 'active', 'in_progress', 'closed')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_term_dates CHECK (start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS subject_masters (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('sports', 'arts', 'stem', 'skills', 'Thể thao', 'Nghệ thuật', 'Kỹ năng số', 'Học thuật', 'Kỹ năng sống & Sinh tồn')),
  required_room_type TEXT,
  standard_duration TEXT DEFAULT '90 phút (2 tiết)',
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campus_subject_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  campus_id TEXT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subject_masters(id) ON DELETE CASCADE,
  standard_sessions INTEGER NOT NULL DEFAULT 24 CHECK (standard_sessions > 0),
  price_per_session NUMERIC(12, 2) NOT NULL CHECK (price_per_session > 0),
  full_package_fee NUMERIC(14, 2) NOT NULL CHECK (full_package_fee >= 0),
  is_activated BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_term_campus_subject UNIQUE (term_id, campus_id, subject_id)
);

-- 2. NHÓM LỚP HỌC, NHÂN SỰ & PHÒNG BAN
CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  campus_id TEXT REFERENCES campuses(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('permanent', 'visiting')),
  default_rate_per_period NUMERIC(12, 2) NOT NULL DEFAULT 150000,
  periods_per_session INTEGER NOT NULL DEFAULT 2 CHECK (periods_per_session > 0),
  fixed_rate_per_session NUMERIC(12, 2) DEFAULT 300000,
  weekend_multiplier NUMERIC(3, 2) DEFAULT 1.0,
  custom_subject_rates JSONB DEFAULT '[]'::jsonb,
  bank_name TEXT,
  bank_account TEXT,
  bank_owner TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extracurricular_classes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  term_id TEXT NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  campus_id TEXT NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subject_masters(id) ON DELETE RESTRICT,
  room_id TEXT,
  primary_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  days_of_week TEXT[] NOT NULL,
  time_slot_id TEXT,
  time_slot TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  standard_sessions INTEGER NOT NULL DEFAULT 24,
  total_sessions INTEGER NOT NULL DEFAULT 24 CHECK (total_sessions > 0),
  price_per_session NUMERIC(12, 2) NOT NULL CHECK (price_per_session > 0),
  tuition_fee NUMERIC(14, 2) NOT NULL CHECK (tuition_fee >= 0),
  max_students INTEGER NOT NULL DEFAULT 20 CHECK (max_students > 0),
  current_students INTEGER NOT NULL DEFAULT 0 CHECK (current_students >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'canceled')),
  allow_over_quota BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_class_dates CHECK (start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS class_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  session_number INTEGER NOT NULL,
  session_date DATE NOT NULL,
  day_of_week TEXT,
  actual_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  is_substitute BOOLEAN NOT NULL DEFAULT false,
  snacks_allocated INTEGER NOT NULL DEFAULT 0,
  snacks_consumed INTEGER NOT NULL DEFAULT 0,
  snacks_returned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_class_session_date UNIQUE (class_id, session_date)
);

-- 3. NHÓM TUYỂN SINH, HỌC VIÊN & GHI DANH
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  previous_student_code TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender TEXT CHECK (gender IN ('Nam', 'Nữ')),
  grade_level TEXT,
  student_type TEXT NOT NULL DEFAULT 'royal' CHECK (student_type IN ('royal', 'external')),
  is_royal_student BOOLEAN NOT NULL DEFAULT true,
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  parent_email TEXT,
  school_name TEXT DEFAULT 'Royal School',
  regular_class TEXT,
  medical_notes TEXT,
  avatar_url TEXT,
  drive_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'graduated', 'dropped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_match ON students(parent_phone, normalized_name);

CREATE TABLE IF NOT EXISTS parent_registrations (
  id TEXT PRIMARY KEY,
  registration_code TEXT NOT NULL UNIQUE,
  campus_id TEXT NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT,
  student_name TEXT NOT NULL,
  student_dob DATE,
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  parent_email TEXT,
  student_type TEXT DEFAULT 'royal',
  is_royal_student BOOLEAN DEFAULT true,
  medical_notes TEXT,
  desired_courses JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'enrolled', 'partially_enrolled', 'canceled')),
  linked_student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  assigned_class_ids TEXT[],
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  joined_date DATE NOT NULL,
  enrolled_days_of_week TEXT[],
  registered_sessions INTEGER NOT NULL CHECK (registered_sessions > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'trial_dropped', 'transferred', 'completed', 'dropped')),
  is_trial BOOLEAN NOT NULL DEFAULT false,
  trial_session_date DATE,
  trial_attended BOOLEAN NOT NULL DEFAULT false,
  trial_outcome TEXT,
  trial_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_class_enrollment UNIQUE (student_id, class_id)
);

-- 4. NHÓM ĐIỂM DANH, MINH CHỨNG & CHẤM CÔNG
CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES class_sessions(id) ON DELETE SET NULL,
  class_id TEXT NOT NULL REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent_excused', 'absent_unexcused')),
  note TEXT,
  proof_file_name TEXT,
  proof_url TEXT,
  proof_base64 TEXT,
  uploaded_at TIMESTAMPTZ,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_attendance_date_not_future CHECK (session_date <= CURRENT_DATE),
  CONSTRAINT uq_student_attendance_session UNIQUE (class_id, student_id, session_date)
);

CREATE TABLE IF NOT EXISTS teacher_work_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES class_sessions(id) ON DELETE SET NULL,
  class_id TEXT NOT NULL REFERENCES extracurricular_classes(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  assigned_teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  actual_teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  is_substitute BOOLEAN NOT NULL DEFAULT false,
  substitute_reason TEXT,
  periods_count INTEGER NOT NULL DEFAULT 2 CHECK (periods_count > 0),
  rate_per_period NUMERIC(12, 2) NOT NULL CHECK (rate_per_period >= 0),
  earned_amount NUMERIC(14, 2) NOT NULL CHECK (earned_amount >= 0),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'settled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. NHÓM TÀI CHÍNH, BẢO LƯU & CHUYỂN MÔN
CREATE TABLE IF NOT EXISTS tuition_invoices (
  id TEXT PRIMARY KEY,
  invoice_code TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  class_id TEXT NOT NULL REFERENCES extracurricular_classes(id) ON DELETE RESTRICT,
  term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  campus_id TEXT REFERENCES campuses(id) ON DELETE SET NULL,
  gross_amount NUMERIC(14, 2) NOT NULL CHECK (gross_amount >= 0),
  credit_deducted NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (credit_deducted >= 0),
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  net_payable NUMERIC(14, 2) NOT NULL CHECK (net_payable >= 0),
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  outstanding_amount NUMERIC(14, 2) NOT NULL CHECK (outstanding_amount >= 0),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'cancelled')),
  is_trial_pending BOOLEAN NOT NULL DEFAULT false,
  due_date DATE,
  payment_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_invoice_net_arithmetic CHECK (gross_amount - credit_deducted - discount_amount = net_payable),
  CONSTRAINT chk_invoice_outstanding_arithmetic CHECK (net_payable - paid_amount = outstanding_amount)
);

CREATE TABLE IF NOT EXISTS credit_notes (
  id TEXT PRIMARY KEY,
  credit_code TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  source_class_id TEXT NOT NULL REFERENCES extracurricular_classes(id) ON DELETE RESTRICT,
  source_term_id TEXT REFERENCES academic_terms(id) ON DELETE SET NULL,
  subject_id TEXT REFERENCES subject_masters(id) ON DELETE SET NULL,
  consecutive_absent_sessions INTEGER NOT NULL CHECK (consecutive_absent_sessions >= 3),
  absent_dates TEXT[] NOT NULL,
  unit_price_old NUMERIC(12, 2) NOT NULL CHECK (unit_price_old > 0),
  total_credit_amount NUMERIC(14, 2) NOT NULL CHECK (total_credit_amount > 0),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'used', 'expired', 'cancelled', 'issued', 'applied')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE NOT NULL,
  redeemed_info JSONB,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfer_records (
  id TEXT PRIMARY KEY,
  transfer_code TEXT UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  from_class_id TEXT NOT NULL REFERENCES extracurricular_classes(id) ON DELETE RESTRICT,
  to_class_id TEXT NOT NULL REFERENCES extracurricular_classes(id) ON DELETE RESTRICT,
  remaining_sessions INTEGER NOT NULL CHECK (remaining_sessions >= 0),
  old_session_rate NUMERIC(12, 2) NOT NULL CHECK (old_session_rate >= 0),
  new_session_rate NUMERIC(12, 2) NOT NULL CHECK (new_session_rate >= 0),
  surcharge_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (surcharge_amount >= 0),
  surplus_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (surplus_amount >= 0),
  status TEXT NOT NULL DEFAULT 'completed',
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. THIẾT LẬP KHO LƯU TRỮ TRÊN SUPABASE (STORAGE BUCKETS)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-proofs',
  'attendance-proofs',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

CREATE POLICY "Public Read Access on Attendance Proofs"
ON storage.objects FOR SELECT
USING (bucket_id = 'attendance-proofs');

CREATE POLICY "Allow Upload on Attendance Proofs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attendance-proofs' AND
  (storage.foldername(name))[1] = 'proofs'
);

CREATE POLICY "Allow Update on Attendance Proofs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'attendance-proofs');
