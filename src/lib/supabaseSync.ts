import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import {
  AppStore,
  Student,
  ExtracurricularClass,
  Enrollment,
  TuitionInvoice,
  AttendanceRecord,
  MakeupCredit,
  ClassTransfer,
  TeacherAttendanceRecord,
} from '../types';
import { showToast } from './toast';

export interface SyncProgress {
  currentTable: string;
  progressPercent: number;
}

/**
 * Đẩy toàn bộ dữ liệu từ Local Store lên Supabase PostgreSQL
 */
export async function syncStoreToSupabase(
  store: AppStore,
  onProgress?: (progress: SyncProgress) => void
): Promise<{ success: boolean; message: string; syncedCount: number }> {
  if (!isSupabaseConfigured(store.supabaseConfig.url, store.supabaseConfig.anonKey)) {
    return {
      success: false,
      message: 'Supabase chưa được cấu hình. Vui lòng kiểm tra lại URL và Anon Key.',
      syncedCount: 0,
    };
  }

  const client = getSupabaseClient(store.supabaseConfig.url, store.supabaseConfig.anonKey);
  if (!client) {
    return {
      success: false,
      message: 'Không thể kết nối Supabase Client.',
      syncedCount: 0,
    };
  }

  let totalSynced = 0;
  const tables = [
    'campuses',
    'academic_terms',
    'subject_masters',
    'teachers',
    'extracurricular_classes',
    'students',
    'enrollments',
    'attendance_records',
    'tuition_invoices',
    'credit_notes',
    'transfer_records',
  ];

  try {
    // 1. Campuses
    onProgress?.({ currentTable: 'campuses', progressPercent: 10 });
    const campusRows = (store.campuses || []).map(c => ({
      id: c.id,
      code: c.code,
      name: c.name,
      address: c.address,
      phone: c.phone,
      bank_name: c.bank_name,
      bank_account: c.bank_account,
      bank_owner: c.bank_owner,
      is_active: c.status === 'active',
    }));
    if (campusRows.length > 0) {
      const { error } = await client.from('campuses').upsert(campusRows, { onConflict: 'id' });
      if (error) console.warn('Supabase sync campuses error:', error);
      else totalSynced += campusRows.length;
    }

    // 2. Academic Terms
    onProgress?.({ currentTable: 'academic_terms', progressPercent: 20 });
    const termRows = (store.terms || []).map(t => ({
      id: t.id,
      code: t.code,
      name: t.name,
      academic_year: t.academic_year || '2026-2027',
      start_date: t.start_date,
      end_date: t.end_date,
      total_weeks: t.total_weeks || 16,
      status: t.status,
      is_active: t.is_active,
      description: t.description || null,
    }));
    if (termRows.length > 0) {
      const { error } = await client.from('academic_terms').upsert(termRows, { onConflict: 'id' });
      if (error) console.warn('Supabase sync terms error:', error);
      else totalSynced += termRows.length;
    }

    // 3. Subject Masters
    onProgress?.({ currentTable: 'subject_masters', progressPercent: 30 });
    const subjectRows = (store.subjects || []).map(s => ({
      id: s.id,
      code: s.code,
      name: s.name,
      category: s.category || 'sports',
      required_room_type: s.required_room_type || null,
      standard_duration: s.standard_duration || '90 phút (2 tiết)',
      is_active: s.is_active ?? true,
      description: s.description || null,
    }));
    if (subjectRows.length > 0) {
      const { error } = await client.from('subject_masters').upsert(subjectRows, { onConflict: 'id' });
      if (error) console.warn('Supabase sync subjects error:', error);
      else totalSynced += subjectRows.length;
    }

    // 4. Teachers
    onProgress?.({ currentTable: 'teachers', progressPercent: 40 });
    const teacherRows = (store.teachers || []).map(t => ({
      id: t.id,
      code: t.code || `GV-${t.id}`,
      name: t.name,
      phone: t.phone,
      email: t.email || null,
      campus_id: t.campus_id || 'camp_pmh',
      type: t.type || t.teacher_type || 'permanent',
      default_rate_per_period: t.default_rate_per_period || 150000,
      periods_per_session: t.periods_per_session || 2,
      fixed_rate_per_session: t.fixed_rate_per_session || 300000,
      weekend_multiplier: t.weekend_multiplier || 1.0,
      custom_subject_rates: t.custom_subject_rates || [],
      bank_name: t.bank_account?.bank_name || null,
      bank_account: t.bank_account?.account_number || null,
      bank_owner: t.bank_account?.account_holder || null,
      is_active: t.status === 'active',
    }));
    if (teacherRows.length > 0) {
      const { error } = await client.from('teachers').upsert(teacherRows, { onConflict: 'id' });
      if (error) console.warn('Supabase sync teachers error:', error);
      else totalSynced += teacherRows.length;
    }

    // 5. Extracurricular Classes
    onProgress?.({ currentTable: 'extracurricular_classes', progressPercent: 55 });
    const classRows = (store.classes || []).map(c => ({
      id: c.id,
      code: c.code || c.id,
      name: c.name,
      term_id: c.term_id,
      campus_id: c.campus_id,
      subject_id: c.subject_id,
      room_id: c.room_id || c.facility_id || null,
      primary_teacher_id: c.primary_teacher_id || null,
      days_of_week: c.days_of_week || ['T2', 'T4'],
      time_slot_id: c.time_slot_id || null,
      time_slot: c.time_slot || null,
      start_date: c.start_date || '2026-09-01',
      end_date: c.end_date || '2027-01-15',
      standard_sessions: c.standard_sessions || 24,
      total_sessions: c.total_sessions || 24,
      price_per_session: c.price_per_session,
      tuition_fee: c.tuition_fee || c.full_course_fee,
      max_students: c.max_students,
      current_students: c.current_students || 0,
      status: c.status,
      allow_over_quota: c.allow_over_quota || false,
    }));
    if (classRows.length > 0) {
      const { error } = await client.from('extracurricular_classes').upsert(classRows, { onConflict: 'id' });
      if (error) console.warn('Supabase sync classes error:', error);
      else totalSynced += classRows.length;
    }

    // 6. Students
    onProgress?.({ currentTable: 'students', progressPercent: 70 });
    const studentRows = (store.students || []).map(s => ({
      id: s.id,
      code: s.code,
      name: s.name,
      normalized_name: s.normalized_name || s.name.toLowerCase(),
      date_of_birth: s.dob || s.date_of_birth || '2018-01-01',
      gender: s.gender || 'Nam',
      grade_level: s.grade_level || s.regular_class || 'Grade 3',
      student_type: s.is_royal_student ? 'royal' : 'external',
      is_royal_student: s.is_royal_student,
      parent_name: s.parent_name,
      parent_phone: s.parent_phone,
      parent_email: null,
      school_name: s.school_name || 'Royal School',
      regular_class: s.regular_class || null,
      medical_notes: s.medical_notes || null,
      avatar_url: s.avatar_url || null,
      drive_url: s.drive_url || null,
      status: s.status,
    }));
    if (studentRows.length > 0) {
      const { error } = await client.from('students').upsert(studentRows, { onConflict: 'id' });
      if (error) console.warn('Supabase sync students error:', error);
      else totalSynced += studentRows.length;
    }

    // 7. Enrollments
    onProgress?.({ currentTable: 'enrollments', progressPercent: 80 });
    const enrollmentRows = (store.enrollments || []).map(e => ({
      id: e.id,
      student_id: e.student_id,
      class_id: e.class_id,
      joined_date: e.joined_date || '2026-09-01',
      enrolled_days_of_week: e.enrolled_days_of_week || ['T2', 'T4'],
      registered_sessions: e.registered_sessions,
      status: e.status,
      is_trial: e.is_trial || false,
      trial_session_date: e.trial_session_date || null,
      trial_attended: e.trial_attended || false,
      trial_outcome: e.trial_outcome || e.trial_completed_action || null,
      trial_notes: e.trial_notes || null,
    }));
    if (enrollmentRows.length > 0) {
      const { error } = await client.from('enrollments').upsert(enrollmentRows, { onConflict: 'id' });
      if (error) console.warn('Supabase sync enrollments error:', error);
      else totalSynced += enrollmentRows.length;
    }

    // 8. Attendance Records (Sanitized without heavy Base64)
    onProgress?.({ currentTable: 'attendance_records', progressPercent: 90 });
    const attendanceRows = (store.attendance || []).map(a => ({
      id: a.id,
      session_id: a.session_id || null,
      class_id: a.class_id,
      student_id: a.student_id,
      session_date: a.session_date,
      status: a.status,
      note: a.note || null,
      proof_file_name: a.proof_file_name || null,
      proof_url: a.proof_url || null,
      proof_base64: null, // Không lưu base64 nặng lên database để tối ưu dung lượng
      uploaded_at: a.uploaded_at || null,
      uploaded_by: a.uploaded_by || null,
    }));
    if (attendanceRows.length > 0) {
      const { error } = await client.from('attendance_records').upsert(attendanceRows, { onConflict: 'id' });
      if (error) console.warn('Supabase sync attendance error:', error);
      else totalSynced += attendanceRows.length;
    }

    // 9. Tuition Invoices
    onProgress?.({ currentTable: 'tuition_invoices', progressPercent: 95 });
    const invoiceRows = (store.invoices || []).map(inv => ({
      id: inv.id,
      invoice_code: inv.invoice_code,
      student_id: inv.student_id,
      class_id: inv.class_id,
      gross_amount: inv.gross_amount,
      credit_deducted: inv.credit_deducted || 0,
      discount_amount: inv.discount_amount || 0,
      net_payable: inv.net_payable,
      paid_amount: inv.paid_amount || 0,
      outstanding_amount: inv.outstanding_amount || 0,
      payment_status: inv.payment_status,
      is_trial_pending: inv.is_trial_pending || false,
      due_date: inv.due_date || null,
      payment_history: inv.payment_history || [],
    }));
    if (invoiceRows.length > 0) {
      const { error } = await client.from('tuition_invoices').upsert(invoiceRows, { onConflict: 'id' });
      if (error) console.warn('Supabase sync invoices error:', error);
      else totalSynced += invoiceRows.length;
    }

    // 10. Credit Notes
    onProgress?.({ currentTable: 'credit_notes', progressPercent: 98 });
    const creditRows = (store.makeupCredits || []).map(cr => ({
      id: cr.id,
      credit_code: cr.credit_code,
      student_id: cr.student_id,
      source_class_id: cr.source_class_id,
      source_term_id: cr.source_term_id || cr.term_id || null,
      subject_id: cr.subject_id || null,
      consecutive_absent_sessions: Math.max(3, cr.consecutive_absent_sessions || cr.consecutive_absent_count || 3),
      absent_dates: cr.absent_dates || cr.consecutive_dates || [],
      unit_price_old: cr.unit_price_old || cr.source_rate || 166250,
      total_credit_amount: cr.total_credit_amount,
      status: cr.status,
      issue_date: cr.issue_date || new Date().toISOString().split('T')[0],
      expires_at: cr.expires_at || cr.expiry_date,
      redeemed_info: cr.redeemed_info || null,
      note: cr.note || null,
    }));
    if (creditRows.length > 0) {
      const { error } = await client.from('credit_notes').upsert(creditRows, { onConflict: 'id' });
      if (error) console.warn('Supabase sync credits error:', error);
      else totalSynced += creditRows.length;
    }

    onProgress?.({ currentTable: 'complete', progressPercent: 100 });
    return {
      success: true,
      message: `Đồng bộ thành công ${totalSynced} bản ghi lên Supabase Cloud PostgreSQL!`,
      syncedCount: totalSynced,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi đồng bộ Supabase: ${err?.message || 'Không thể ghi dữ liệu'}`,
      syncedCount: totalSynced,
    };
  }
}

/**
 * Optimistic Sync: Đẩy 1 bản ghi điểm danh lên Supabase ngầm
 */
export async function pushAttendanceRecordAsync(record: AttendanceRecord, store: AppStore): Promise<void> {
  const client = getSupabaseClient(store.supabaseConfig.url, store.supabaseConfig.anonKey);
  if (!client) return;

  try {
    const row = {
      id: record.id,
      session_id: record.session_id || null,
      class_id: record.class_id,
      student_id: record.student_id,
      session_date: record.session_date,
      status: record.status,
      note: record.note || null,
      proof_file_name: record.proof_file_name || null,
      proof_url: record.proof_url || null,
      uploaded_at: record.uploaded_at || null,
      uploaded_by: record.uploaded_by || null,
    };
    const { error } = await client.from('attendance_records').upsert([row], { onConflict: 'id' });
    if (error) {
      console.warn('Lỗi đồng bộ Supabase ngầm (Điểm danh):', error.message);
    }
  } catch (err: any) {
    console.warn('Không thể gửi điểm danh lên Supabase:', err?.message);
  }
}

/**
 * Optimistic Sync: Đẩy 1 bản ghi chấm công giáo viên lên Supabase ngầm
 */
export async function pushTeacherWorkSessionAsync(
  record: TeacherAttendanceRecord,
  store: AppStore
): Promise<void> {
  const client = getSupabaseClient(store.supabaseConfig.url, store.supabaseConfig.anonKey);
  if (!client) return;

  try {
    const row = {
      id: record.id,
      class_id: record.class_id,
      session_date: record.session_date,
      assigned_teacher_id: record.assigned_teacher_id,
      actual_teacher_id: record.actual_teacher_id,
      is_substitute: record.is_substitute,
      substitute_reason: record.substitute_reason || null,
      periods_count: record.periods_count || 2,
      rate_per_period: record.rate_per_period,
      earned_amount: record.total_payout,
      status: 'submitted',
    };
    await client.from('teacher_work_sessions').upsert([row], { onConflict: 'id' });
  } catch (err: any) {
    console.warn('Không thể gửi chấm công lên Supabase:', err?.message);
  }
}
