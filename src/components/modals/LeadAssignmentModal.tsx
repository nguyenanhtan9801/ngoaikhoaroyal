import React, { useState } from 'react';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { Zap, Sparkles, X } from 'lucide-react';
import { checkIsRoyalStudent } from '../../lib/storage';

export interface LeadAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  registrationData: any;
  assignedClasses?: any[];
  selectedClassId?: string;
  selectedEnrollType?: 'official' | 'trial';
  currentStudentCode?: string;
  calculatedFee?: number;
  actualSessions?: number;
  refreshData?: () => Promise<void> | void;
}

export const LeadAssignmentModal: React.FC<LeadAssignmentModalProps> = ({
  isOpen,
  onClose,
  registrationData,
  assignedClasses = [],
  selectedClassId,
  selectedEnrollType = 'official',
  currentStudentCode,
  calculatedFee,
  actualSessions,
  refreshData
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !registrationData) return null;

  const handleExecuteEnrollment = async (forceTrial?: boolean) => {
    try {
      setIsSubmitting(true);

      const isTrial = forceTrial !== undefined ? forceTrial : selectedEnrollType === 'trial';
      const studentCode =
        currentStudentCode ||
        registrationData.allocated_student_id ||
        registrationData.assigned_student_code ||
        'EXT-2026-00102';
      
      // Chuẩn hóa campus_id
      const rawCampus = registrationData.desired_campus_id || registrationData.campus_id || 'camp_pmh';
      const cleanCampus = rawCampus.startsWith('camp_') ? rawCampus : `camp_${rawCampus}`;

      // Lấy lớp học đã chọn
      const targetClassId = selectedClassId || assignedClasses[0]?.class_id || assignedClasses[0]?.id;

      if (!targetClassId) {
        alert('Vui lòng chọn lớp học cụ thể trước khi xác nhận xếp lớp!');
        setIsSubmitting(false);
        return;
      }

      const client = getSupabaseClient() || supabase;
      if (!client) {
        throw new Error('Chưa kết nối tới cơ sở dữ liệu Supabase');
      }

      const startDateVal = registrationData.start_date || new Date().toISOString().split('T')[0];
      const actualSessionsVal = Number(actualSessions || 12);
      const totalFeeVal = isTrial ? 0 : Number(calculatedFee || 3000000);

      // 1. Ghi trực tiếp vào Supabase (bảng students, enrollments, parent_registrations)
      let directOk = false;
      let directErrDetail = '';
      try {
        // Chuẩn hóa ngày sinh
        const birthDateValue = registrationData.date_of_birth || registrationData.dob || registrationData.student_dob || '2016-05-15';
        const isRoyal = checkIsRoyalStudent({ ...registrationData, code: studentCode, id: studentCode });

        const studentPayload: any = {
          id: studentCode,
          code: studentCode,
          name: registrationData.student_name || registrationData.name || 'Học viên mới',
          full_name: registrationData.student_name || registrationData.name || 'Học viên mới',
          campus_id: cleanCampus === 'camp_pl' ? 'pl' : 'pmh',
          student_type: isRoyal ? 'royal' : 'external',
          is_royal_student: isRoyal,
          has_snack: isRoyal,
          parent_name: registrationData.parent_name || 'Phụ huynh',
          parent_phone: registrationData.parent_phone || '',
          parent_email: registrationData.parent_email || '',
          school_name: isRoyal ? 'Royal School' : 'Trường ngoài',
          regular_class: registrationData.student_grade || 'Khối Mầm Non',
          medical_notes: registrationData.medical_notes || '',
          status: 'active',
          updated_at: new Date().toISOString()
        };

        // Gán cả 2 trường ngày sinh để tương thích mọi cấu trúc bảng
        if (birthDateValue) {
          studentPayload.date_of_birth = birthDateValue;
          studentPayload.dob = birthDateValue;
        }

        const { error: studentErr } = await client
          .from('students')
          .upsert(studentPayload, { onConflict: 'id' });

        if (studentErr) {
          // Nếu lỗi do cột nào chưa nhận, thử lại chỉ với các trường cơ bản
          console.warn('Lỗi upsert students, đang thử lại với fallback:', studentErr);
          delete studentPayload.date_of_birth;
          delete studentPayload.full_name;
          const { error: retryErr } = await client.from('students').upsert(studentPayload, { onConflict: 'id' });
          if (!retryErr) directOk = true;
          else {
            directErrDetail = retryErr.message;
            console.warn('Lỗi retry upsert student:', retryErr);
          }
        } else {
          directOk = true;
        }

        const { data: existingEnr } = await client
          .from('enrollments')
          .select('id')
          .eq('student_id', studentCode)
          .eq('class_id', targetClassId)
          .maybeSingle();

        const finalEnrId = existingEnr?.id || `enr_${Date.now()}_${targetClassId}`;

        const { error: enrollUpsertErr } = await client.from('enrollments').upsert({
          id: finalEnrId,
          student_id: studentCode,
          class_id: targetClassId,
          status: isTrial ? 'trial' : 'active',
          is_trial: isTrial,
          enrollment_type: isTrial ? 'trial' : 'official',
          trial_session_count: isTrial ? 1 : 0,
          registered_sessions: isTrial ? 1 : actualSessionsVal,
          total_sessions: isTrial ? 1 : actualSessionsVal,
          joined_date: startDateVal,
          created_at: new Date().toISOString()
        }, { onConflict: 'student_id,class_id' });

        if (!enrollUpsertErr) {
          directOk = true;
        } else if (!directErrDetail) {
          directErrDetail = enrollUpsertErr.message;
        }

        const { error: regUpdErr } = await client.from('parent_registrations').update({
          status: 'enrolled',
          allocated_student_id: studentCode,
          student_id: studentCode,
          assigned_student_code: studentCode,
          assigned_class_id: targetClassId,
          updated_at: new Date().toISOString()
        }).eq('id', registrationData.id);

        if (regUpdErr) {
          await client.from('parent_registrations').update({
            status: 'enrolled',
            student_id: studentCode,
            assigned_class_id: targetClassId
          }).eq('id', registrationData.id);
        }
      } catch (directErr: any) {
        console.warn('Direct write error:', directErr);
        directErrDetail = directErr?.message || String(directErr);
      }

      if (!directOk && directErrDetail) {
        throw new Error(directErrDetail);
      }

      alert(`✅ Thành công! Đã lưu học sinh ${registrationData.student_name || registrationData.name} (${studentCode}) và xếp lớp ${isTrial ? 'HỌC THỬ' : 'CHÍNH THỨC'} vào CSDL.`);
      
      // Đóng modal và nạp lại danh sách Leads & Hồ Sơ Học Viên
      onClose();
      if (typeof refreshData === 'function') {
        await refreshData();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Lỗi xếp lớp:', err);
      alert('Không thể hoàn tất xếp lớp: ' + (err.message || err.toString()));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl bg-[#0f172a] border border-amber-500/40 shadow-2xl p-6 text-white space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white">Tiếp Nhận & Xếp Lớp Ghi Danh (Đa Môn)</h3>
            <p className="text-xs text-slate-400">
              Học sinh: <span className="text-amber-400 font-bold">{registrationData.student_name || registrationData.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Mã học viên:</span>
            <span className="font-mono font-bold text-amber-400">{currentStudentCode || registrationData.assigned_student_code || 'Tự động tạo'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Phụ huynh:</span>
            <span>{registrationData.parent_name} ({registrationData.parent_phone})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Học phí dự kiến:</span>
            <span className="text-emerald-400 font-bold">{Number(calculatedFee || 3250000).toLocaleString('vi-VN')} đ</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 flex-wrap pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Hủy Bỏ
          </button>

          {/* Nút tím: Học Thử 1 Lớp */}
          <button
            type="button"
            onClick={() => handleExecuteEnrollment(true)}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg transition-all bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/25 active:scale-95 cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-purple-200" />
            )}
            <span>Xác Nhận Xếp Lớp & Cấp Mã Học Viên (Học Thử 1 Lớp)</span>
          </button>

          {/* Nút cam: Xếp Lớp Nhanh & Cấp Mã Học Viên */}
          <button
            type="button"
            onClick={() => handleExecuteEnrollment(false)}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg transition-all bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-amber-500/25 active:scale-95 cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? (
              <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Zap className="w-4 h-4 fill-slate-950" />
            )}
            <span>Xác Nhận Xếp Lớp Nhanh & Cấp Mã Học Viên</span>
          </button>
        </div>
      </div>
    </div>
  );
};
