import React, { useState } from 'react';
import { supabase, getSupabaseClient } from '@/supabaseClient';
import { generateStudentCode } from '../../lib/storage';
import { Zap, Sparkles, X } from 'lucide-react';

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
        registrationData.student_id ||
        (await generateStudentCode(Boolean(registrationData.is_royal_student)));
      const studentId =
        registrationData.student_id ||
        registrationData.allocated_student_id ||
        studentCode;
      const studentName = registrationData.student_name || registrationData.name || 'Học viên';

      // Chuẩn hóa campus_id
      const rawCampus = registrationData.desired_campus_id || registrationData.campus_id || 'camp_pmh';
      const cleanCampus = rawCampus.startsWith('camp_') ? rawCampus : `camp_${rawCampus}`;

      // Lấy lớp học đã chọn
      const targetClassObj =
        assignedClasses.find((c: any) => (c.class_id || c.id) === selectedClassId) ||
        assignedClasses[0];
      const targetClassId = selectedClassId || targetClassObj?.class_id || targetClassObj?.id;

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
      const actualSessionsVal = Number(actualSessions || 16);
      const sessionRateVal = Number(targetClassObj?.price_per_session || targetClassObj?.session_rate || 250000);
      const calculatedTuitionFee = isTrial ? 0 : Number(calculatedFee || 3000000);

      // Gọi hàm RPC create_enrollment_with_invoice đã được tạo sẵn trên Supabase
      const { data: result, error: rpcError } = await client.rpc('create_enrollment_with_invoice', {
        p_student_id: studentId,
        p_student_code: studentCode,
        p_student_name: studentName,
        p_campus_id: cleanCampus,
        p_parent_name: registrationData.parent_name || 'Phụ huynh',
        p_parent_phone: registrationData.parent_phone || '',
        p_class_id: targetClassId,
        p_is_trial: isTrial,
        p_start_date: startDateVal,
        p_actual_sessions: actualSessionsVal,
        p_session_rate: sessionRateVal,
        p_total_tuition: calculatedTuitionFee
      });

      let resolvedStudentId = result?.student_id || studentId;

      if (rpcError) {
        const isFnMissing =
          rpcError.code === 'PGRST202' ||
          rpcError.code === '42883' ||
          String(rpcError.message || '').includes('does not exist') ||
          String(rpcError.message || '').includes('schema cache');

        if (!isFnMissing) {
          throw rpcError;
        }

        // Fallback an toàn đảm bảo học sinh tồn tại trong bảng students trước khi tạo enrollments & tuition_invoices
        const { data: existingStd } = await client
          .from('students')
          .select('id, code')
          .or(`id.eq.${studentId},code.eq.${studentCode}`)
          .maybeSingle();

        if (existingStd?.id) {
          resolvedStudentId = existingStd.id;
        } else {
          await client.from('students').upsert(
            {
              id: studentId,
              code: studentCode,
              name: studentName,
              campus_id: cleanCampus === 'camp_pl' ? 'pl' : 'pmh',
              is_royal_student: Boolean(registrationData.is_royal_student),
              parent_name: registrationData.parent_name || 'Phụ huynh',
              parent_phone: registrationData.parent_phone || '',
              school_name: registrationData.is_royal_student ? 'Royal School' : 'Trường ngoài',
              regular_class: registrationData.student_grade || 'Khối Mầm Non',
              medical_notes: registrationData.medical_notes || '',
              status: 'active',
            },
            { onConflict: 'id' }
          );
        }

        await client.from('enrollments').upsert(
          {
            id: `enr_${resolvedStudentId}_${targetClassId}`,
            student_id: resolvedStudentId,
            class_id: targetClassId,
            status: isTrial ? 'trial' : 'active',
            is_trial: isTrial,
            enrollment_type: isTrial ? 'trial' : 'official',
            registered_sessions: isTrial ? 1 : actualSessionsVal,
            joined_date: startDateVal,
          },
          { onConflict: 'student_id,class_id' }
        );

        await client.from('tuition_invoices').upsert(
          {
            id: `inv_${resolvedStudentId}_${targetClassId}`,
            invoice_code: `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
            student_id: resolvedStudentId,
            class_id: targetClassId,
            registered_sessions: isTrial ? 1 : actualSessionsVal,
            session_rate: isTrial ? 0 : sessionRateVal,
            gross_amount: calculatedTuitionFee,
            net_payable: calculatedTuitionFee,
            paid_amount: 0,
            outstanding_amount: calculatedTuitionFee,
            payment_status: isTrial ? 'trial_pending' : 'unpaid',
            created_at: new Date().toISOString().split('T')[0],
          },
          { onConflict: 'id' }
        );
      } else if (result && !result.success) {
        throw new Error(result.error);
      }

      // Cập nhật đơn parent_registrations sang trạng thái enrolled
      if (registrationData.id) {
        const { error: regUpdErr } = await client
          .from('parent_registrations')
          .update({
            status: 'enrolled',
            allocated_student_id: resolvedStudentId,
            student_id: resolvedStudentId,
            assigned_student_code: studentCode,
            assigned_class_id: targetClassId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', registrationData.id);

        if (regUpdErr) {
          await client
            .from('parent_registrations')
            .update({
              status: 'enrolled',
              student_id: resolvedStudentId,
              assigned_class_id: targetClassId,
            })
            .eq('id', registrationData.id);
        }
      }

      // Thông báo thành công
      if (isTrial) {
        alert(`✅ Đã xếp học sinh ${studentName} vào lớp học thử thành công!`);
      } else {
        alert(`✅ Ghi danh & Tạo hóa đơn thành công! Mã HĐ: ${result?.invoice_code || 'Tự động'}`);
      }

      onClose();
      if (typeof refreshData === 'function') {
        await refreshData();
      }
    } catch (err: any) {
      console.error('Lỗi khi ghi danh & tạo hóa đơn:', err);
      alert('Không thể hoàn tất ghi danh: ' + (err.message || err.toString()));
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
