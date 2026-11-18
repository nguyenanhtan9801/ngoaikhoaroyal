-- =====================================================================================
-- ROYAL SCHOOL EXTRACURRICULAR MANAGEMENT SYSTEM
-- MIGRATION: BỔ SUNG CHỨC NĂNG "LÊN LỚP" (CLASS PROMOTION) & TRANSACTION ATOMIC RPC
-- Lưu ý: Script này hoàn toàn an toàn (idempotent), KHÔNG thay đổi cấu trúc các cột
-- đang chạy của hệ thống hiện tại, chỉ bổ sung bảng lịch sử, cột mở rộng tùy chọn
-- và hàm RPC chạy trong 1 transaction có đầy đủ RLS.
-- =====================================================================================

BEGIN;

-- 1. Bổ sung các cột mở rộng tùy chọn (IF NOT EXISTS) vào bảng enrollments & tuition_invoices
-- để lưu vết lên lớp và lý do chỉnh tay (nếu cần truy vấn trực tiếp trên DB)
ALTER TABLE IF EXISTS public.enrollments
  ADD COLUMN IF NOT EXISTS promoted_from_enrollment_id TEXT,
  ADD COLUMN IF NOT EXISTS promoted_from_class_id TEXT,
  ADD COLUMN IF NOT EXISTS promotion_batch_id TEXT;

ALTER TABLE IF EXISTS public.tuition_invoices
  ADD COLUMN IF NOT EXISTS prepaid_deducted NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS promotion_batch_id TEXT;

-- 1b. Sequence & hàm sinh mã hóa đơn học phí tự động trên CSDL (tránh trùng 23505 ở client)
-- Không đụng tới dữ liệu cũ đang lẫn mã ngắn INV-YYYY-0001..0371 và mã ngẫu nhiên 6 số INV-YYYY-xxxxxx.
CREATE SEQUENCE IF NOT EXISTS public.invoice_code_seq
  AS BIGINT
  START WITH 1000
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

DO $$
DECLARE
  v_max_short BIGINT := 0;
  v_current_seq BIGINT := 0;
  v_seq_called BOOLEAN := FALSE;
  v_next_val BIGINT;
BEGIN
  IF to_regclass('public.tuition_invoices') IS NOT NULL THEN
    SELECT COALESCE(
      MAX((regexp_match(invoice_code, '^INV-[0-9]{4}-([0-9]{1,4})$'))[1]::bigint),
      0
    )
    INTO v_max_short
    FROM public.tuition_invoices
    WHERE invoice_code ~ '^INV-[0-9]{4}-[0-9]{1,4}$';
  END IF;

  SELECT last_value, is_called
    INTO v_current_seq, v_seq_called
    FROM public.invoice_code_seq;

  IF v_seq_called THEN
    v_current_seq := v_current_seq + 1;
  END IF;

  v_next_val := GREATEST(1000, v_max_short + 1, v_current_seq);
  PERFORM setval('public.invoice_code_seq', v_next_val, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year TEXT := to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY');
  v_seq BIGINT;
  v_candidate TEXT;
  v_attempts INTEGER := 0;
BEGIN
  LOOP
    v_seq := nextval('public.invoice_code_seq');
    v_candidate := 'INV-' || v_year || '-' || lpad(v_seq::text, 4, '0');
    IF to_regclass('public.tuition_invoices') IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.tuition_invoices WHERE invoice_code = v_candidate
    ) THEN
      RETURN v_candidate;
    END IF;
    v_attempts := v_attempts + 1;
    IF v_attempts >= 500 THEN
      RAISE EXCEPTION 'Không thể cấp phát mã hóa đơn duy nhất sau % lần thử.', v_attempts;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE IF EXISTS public.tuition_invoices
  ALTER COLUMN invoice_code SET DEFAULT public.next_invoice_code();

GRANT USAGE, SELECT ON SEQUENCE public.invoice_code_seq TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_code() TO anon, authenticated, service_role;

-- 2. Tạo bảng lưu lịch sử các đợt Lên Lớp (class_promotion_histories)
-- Lịch sử lên lớp chỉ cho phép XEM, tuyệt đối không cho phép tự động xóa.
CREATE TABLE IF NOT EXISTS public.class_promotion_histories (
  id TEXT PRIMARY KEY,
  batch_code TEXT NOT NULL,
  campus_id TEXT NOT NULL,
  source_term_id TEXT NOT NULL,
  source_class_id TEXT NOT NULL,
  source_class_name TEXT NOT NULL,
  target_term_id TEXT NOT NULL,
  target_class_id TEXT NOT NULL,
  target_class_name TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  promoted_count INTEGER NOT NULL DEFAULT 0,
  dropped_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  total_gross_amount NUMERIC NOT NULL DEFAULT 0,
  total_discount_amount NUMERIC NOT NULL DEFAULT 0,
  total_credit_deducted NUMERIC NOT NULL DEFAULT 0,
  total_prepaid_deducted NUMERIC NOT NULL DEFAULT 0,
  total_net_payable NUMERIC NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_promotion_histories_campus
  ON public.class_promotion_histories (campus_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_class_promotion_histories_classes
  ON public.class_promotion_histories (source_class_id, target_class_id);

-- 3. Bật Row Level Security (RLS) cho bảng class_promotion_histories
ALTER TABLE public.class_promotion_histories ENABLE ROW LEVEL SECURITY;

-- Hàm kiểm tra quyền thực hiện / xem Lên Lớp từ bảng profiles
CREATE OR REPLACE FUNCTION public.can_access_class_promotion(p_campus_id TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_campus TEXT;
  v_perms JSONB;
BEGIN
  -- Cho phép service_role hoặc môi trường đồng bộ nội bộ
  IF auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN TRUE; -- Tương thích chế độ đồng bộ anon/legacy khi chưa gắn JWT
  END IF;

  SELECT LOWER(COALESCE(role, '')), LOWER(COALESCE(campus_id, 'all')), COALESCE(permissions, '{}'::jsonb)
    INTO v_role, v_campus, v_perms
    FROM public.profiles
   WHERE id = auth.uid()
   LIMIT 1;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'super_admin' THEN
    RETURN TRUE;
  END IF;

  -- Kiểm tra quyền: super_admin, campus_manager, academic_affairs / học vụ hoặc có can_manage_enrollment
  IF v_role NOT IN (
    'campus_manager',
    'academic_affairs',
    'academic',
    'academic_admissions',
    'academic_accountant',
    'academic_staff'
  ) AND COALESCE((v_perms->>'can_manage_enrollment')::boolean, FALSE) = FALSE THEN
    RETURN FALSE;
  END IF;

  -- Kiểm tra phạm vi cơ sở (campus scope)
  IF p_campus_id IS NOT NULL AND v_campus <> 'all' THEN
    IF REPLACE(v_campus, 'camp_', '') <> REPLACE(LOWER(p_campus_id), 'camp_', '') THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

DROP POLICY IF EXISTS "class_promotion_histories_select_policy" ON public.class_promotion_histories;
CREATE POLICY "class_promotion_histories_select_policy"
  ON public.class_promotion_histories
  FOR SELECT
  USING (public.can_access_class_promotion(campus_id));

DROP POLICY IF EXISTS "class_promotion_histories_insert_policy" ON public.class_promotion_histories;
CREATE POLICY "class_promotion_histories_insert_policy"
  ON public.class_promotion_histories
  FOR INSERT
  WITH CHECK (public.can_access_class_promotion(campus_id));

-- Không tạo policy DELETE để đảm bảo lịch sử lên lớp chỉ được xem, không bao giờ tự động xóa.

-- 4. RPC thực thi Lên Lớp trong 1 Transaction nguyên tử (Atomic Transaction)
-- Nếu bất kỳ bước nào lỗi (ghi danh mới, tạo hóa đơn, cập nhật lớp cũ, cập nhật bảo lưu, lưu lịch sử),
-- PostgreSQL tự động ROLLBACK toàn bộ để không tạo dữ liệu dở dang.
CREATE OR REPLACE FUNCTION public.promote_students_to_new_class(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history JSONB := p_payload->'history';
  v_new_enrollments JSONB := COALESCE(p_payload->'new_enrollments', '[]'::jsonb);
  v_updated_old_enrollments JSONB := COALESCE(p_payload->'updated_old_enrollments', '[]'::jsonb);
  v_new_invoices JSONB := COALESCE(p_payload->'new_invoices', '[]'::jsonb);
  v_updated_credits JSONB := COALESCE(p_payload->'updated_credits', '[]'::jsonb);
  v_audit_logs JSONB := COALESCE(p_payload->'audit_logs', '[]'::jsonb);
  v_item JSONB;
  v_invoice_code TEXT;
  v_created_invoices JSONB := '[]'::jsonb;
  v_history_items JSONB := '[]'::jsonb;
  v_log_entity TEXT;
  v_matched_code TEXT;
BEGIN
  IF v_history IS NULL OR (v_history->>'id') IS NULL THEN
    RAISE EXCEPTION 'Thiếu thông tin đợt lên lớp (history payload).';
  END IF;

  IF NOT public.can_access_class_promotion(v_history->>'campus_id') THEN
    RAISE EXCEPTION 'Bạn không có quyền thực hiện lên lớp tại cơ sở này.';
  END IF;

  -- 4.1. Cập nhật trạng thái enrollment ở lớp cũ ('completed' hoặc 'dropped')
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_updated_old_enrollments)
  LOOP
    UPDATE public.enrollments
       SET status = COALESCE(v_item->>'status', 'completed')
     WHERE id = (v_item->>'id');
  END LOOP;

  -- 4.2. Tạo các bản ghi enrollment mới ở lớp đích
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_new_enrollments)
  LOOP
    INSERT INTO public.enrollments (
      id,
      student_id,
      class_id,
      registered_sessions,
      joined_date,
      enrolled_days_of_week,
      is_partial_schedule,
      is_trial,
      enrollment_type,
      status,
      promoted_from_enrollment_id,
      promoted_from_class_id,
      promotion_batch_id
    ) VALUES (
      v_item->>'id',
      v_item->>'student_id',
      v_item->>'class_id',
      COALESCE((v_item->>'registered_sessions')::integer, 24),
      COALESCE((v_item->>'joined_date')::date, CURRENT_DATE),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'enrolled_days_of_week', '[]'::jsonb))),
      COALESCE((v_item->>'is_partial_schedule')::boolean, FALSE),
      FALSE,
      'official',
      'active',
      v_item->>'promoted_from_enrollment_id',
      v_item->>'promoted_from_class_id',
      v_history->>'id'
    )
    ON CONFLICT (student_id, class_id) DO UPDATE
      SET registered_sessions = EXCLUDED.registered_sessions,
          joined_date = EXCLUDED.joined_date,
          enrolled_days_of_week = EXCLUDED.enrolled_days_of_week,
          is_partial_schedule = EXCLUDED.is_partial_schedule,
          is_trial = FALSE,
          enrollment_type = 'official',
          status = 'active',
          promoted_from_enrollment_id = EXCLUDED.promoted_from_enrollment_id,
          promoted_from_class_id = EXCLUDED.promoted_from_class_id,
          promotion_batch_id = EXCLUDED.promotion_batch_id;
  END LOOP;

  -- 4.3. Tạo các hóa đơn học phí tương ứng cho khóa mới (DB tự sinh invoice_code nếu client không truyền)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_new_invoices)
  LOOP
    v_invoice_code := COALESCE(NULLIF(TRIM(v_item->>'invoice_code'), ''), public.next_invoice_code());

    INSERT INTO public.tuition_invoices (
      id,
      invoice_code,
      student_id,
      class_id,
      registered_sessions,
      total_class_sessions,
      session_rate,
      gross_amount,
      credit_deducted,
      discount_amount,
      prepaid_deducted,
      net_payable,
      paid_amount,
      outstanding_amount,
      payment_status,
      due_date,
      payment_reference,
      is_manual_override,
      manual_override_reason,
      promotion_batch_id,
      created_at
    ) VALUES (
      v_item->>'id',
      v_invoice_code,
      v_item->>'student_id',
      v_item->>'class_id',
      COALESCE((v_item->>'registered_sessions')::integer, 24),
      COALESCE((v_item->>'total_class_sessions')::integer, 24),
      COALESCE((v_item->>'session_rate')::numeric, 0),
      COALESCE((v_item->>'gross_amount')::numeric, 0),
      COALESCE((v_item->>'credit_deducted')::numeric, 0),
      COALESCE((v_item->>'discount_amount')::numeric, 0),
      COALESCE((v_item->>'prepaid_deducted')::numeric, 0),
      COALESCE((v_item->>'net_payable')::numeric, 0),
      COALESCE((v_item->>'paid_amount')::numeric, 0),
      COALESCE((v_item->>'outstanding_amount')::numeric, 0),
      COALESCE(v_item->>'payment_status', 'unpaid'),
      NULLIF(v_item->>'due_date', '')::date,
      v_item->>'payment_reference',
      COALESCE((v_item->>'is_manual_override')::boolean, FALSE),
      v_item->>'manual_override_reason',
      v_history->>'id',
      COALESCE((v_item->>'created_at')::date, CURRENT_DATE)
    );

    v_created_invoices := v_created_invoices || jsonb_build_array(
      jsonb_build_object(
        'id', v_item->>'id',
        'invoice_code', v_invoice_code
      )
    );
  END LOOP;

  -- 4.4. Cập nhật trạng thái các phiếu bảo lưu (credit_notes) đã áp dụng cấn trừ
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_updated_credits)
  LOOP
    UPDATE public.credit_notes
       SET status = 'applied',
           applied_to_class_id = v_item->>'applied_to_class_id',
           applied_to_term_id = v_item->>'applied_to_term_id',
           redemption_type = v_item->>'redemption_type',
           deducted_amount = COALESCE((v_item->>'deducted_amount')::numeric, 0),
           remaining_balance_due = COALESCE((v_item->>'remaining_balance_due')::numeric, 0),
           applied_date = COALESCE((v_item->>'applied_date')::date, CURRENT_DATE)
     WHERE id = (v_item->>'id');
  END LOOP;

  -- 4.5. Lưu bản ghi lịch sử đợt Lên Lớp (cập nhật lại invoice_code vừa được DB cấp phát vào items)
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN (elem ? 'invoice_id') AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_created_invoices) ci
          WHERE ci->>'id' = elem->>'invoice_id'
        )
        THEN jsonb_set(
          elem,
          '{invoice_code}',
          to_jsonb((
            SELECT ci->>'invoice_code'
            FROM jsonb_array_elements(v_created_invoices) ci
            WHERE ci->>'id' = elem->>'invoice_id'
            LIMIT 1
          )),
          TRUE
        )
        ELSE elem
      END
    ),
    '[]'::jsonb
  )
  INTO v_history_items
  FROM jsonb_array_elements(COALESCE(v_history->'items', '[]'::jsonb)) AS elem;

  INSERT INTO public.class_promotion_histories (
    id,
    batch_code,
    campus_id,
    source_term_id,
    source_class_id,
    source_class_name,
    target_term_id,
    target_class_id,
    target_class_name,
    subject_id,
    promoted_count,
    dropped_count,
    skipped_count,
    total_gross_amount,
    total_discount_amount,
    total_credit_deducted,
    total_prepaid_deducted,
    total_net_payable,
    items,
    created_by,
    created_by_name,
    created_by_role,
    created_at
  ) VALUES (
    v_history->>'id',
    v_history->>'batch_code',
    v_history->>'campus_id',
    v_history->>'source_term_id',
    v_history->>'source_class_id',
    v_history->>'source_class_name',
    v_history->>'target_term_id',
    v_history->>'target_class_id',
    v_history->>'target_class_name',
    v_history->>'subject_id',
    COALESCE((v_history->>'promoted_count')::integer, 0),
    COALESCE((v_history->>'dropped_count')::integer, 0),
    COALESCE((v_history->>'skipped_count')::integer, 0),
    COALESCE((v_history->>'total_gross_amount')::numeric, 0),
    COALESCE((v_history->>'total_discount_amount')::numeric, 0),
    COALESCE((v_history->>'total_credit_deducted')::numeric, 0),
    COALESCE((v_history->>'total_prepaid_deducted')::numeric, 0),
    COALESCE((v_history->>'total_net_payable')::numeric, 0),
    v_history_items,
    COALESCE(v_history->>'created_by', 'system'),
    COALESCE(v_history->>'created_by_name', 'Hệ thống'),
    v_history->>'created_by_role',
    NOW()
  );

  -- 4.6. Ghi nhật ký kiểm toán (audit_logs)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_audit_logs)
  LOOP
    v_log_entity := v_item->>'target_entity';
    SELECT ci->>'invoice_code'
      INTO v_matched_code
      FROM jsonb_array_elements(v_created_invoices) ci
     WHERE ci->>'id' = (v_item->>'target_id')
     LIMIT 1;

    IF v_matched_code IS NOT NULL AND v_log_entity IS NOT NULL THEN
      v_log_entity := REPLACE(v_log_entity, 'Hóa đơn ' || (v_item->>'target_id'), 'Hóa đơn ' || v_matched_code);
    END IF;

    INSERT INTO public.audit_logs (
      id,
      timestamp,
      user_id,
      username,
      user_role,
      full_name,
      action,
      category,
      target_entity,
      target_id,
      description,
      details
    ) VALUES (
      v_item->>'id',
      COALESCE((v_item->>'timestamp')::timestamptz, NOW()),
      v_item->>'user_id',
      v_item->>'username',
      v_item->>'user_role',
      v_item->>'full_name',
      v_item->>'action',
      v_item->>'category',
      v_log_entity,
      v_item->>'target_id',
      v_item->>'description',
      COALESCE(v_item->'details', '{}'::jsonb)
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'batch_id', v_history->>'id',
    'batch_code', v_history->>'batch_code',
    'created_invoices', v_created_invoices
  );
END;
$$;

COMMIT;
