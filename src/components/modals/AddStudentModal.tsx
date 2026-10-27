import React, { useState } from 'react';
import { UserPlus, X, Upload, Camera, Save, AlertCircle } from 'lucide-react';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { showToast } from '../../lib/toast';
import { DatePickerVN } from '../common/DatePickerVN';
import { formatCapitalizedName } from '../../lib/formatters';

export interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  fetchStudents?: () => Promise<void> | void;
  onSuccess?: (student: any) => void;
  initialData?: any;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({
  isOpen,
  onClose,
  fetchStudents,
  onSuccess,
  initialData
}) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || initialData?.full_name || '',
    dob: initialData?.dob || initialData?.date_of_birth || '2016-01-01',
    gender: (initialData?.gender as 'Nam' | 'Nữ') || 'Nam',
    campus_id: (initialData?.campus_id as 'pmh' | 'pl') || 'pmh',
    parent_name: initialData?.parent_name || '',
    parent_phone: initialData?.parent_phone || '',
    parent_email: initialData?.parent_email || '',
    school_name: initialData?.school_name || 'Royal School PMH',
    regular_class: initialData?.regular_class || 'Lớp 4A1',
    grade: initialData?.grade || '',
    is_royal_student: initialData?.is_royal_student !== false,
    medical_notes: initialData?.medical_notes || 'Bình thường',
    avatar_url: initialData?.avatar_url || ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSaveStudent = async (formData: any) => {
    setIsSubmitting(true);
    try {
      const isRoyal = formData.is_royal_student !== false && formData.student_type !== 'external';
      const client = getSupabaseClient() || supabase;
      if (!client) {
        throw new Error('Không thể kết nối tới cơ sở dữ liệu Supabase.');
      }
      
      // Gọi trực tiếp hàm RPC trên Supabase
      const { data: res, error: rpcError } = await client.rpc('create_new_student', {
        p_name: formData.name || formData.full_name,
        p_campus_id: formData.campus_id || 'pmh',
        p_parent_name: formData.parent_name || 'Phụ huynh',
        p_parent_phone: formData.parent_phone || '',
        p_parent_email: formData.parent_email || '',
        p_dob: formData.dob || formData.date_of_birth || '2016-01-01',
        p_gender: formData.gender || 'Nam',
        p_is_royal: isRoyal,
        p_school_name: formData.school_name || (isRoyal ? 'Royal School' : 'Ngoài trường'),
        p_regular_class: formData.regular_class || '',
        p_grade: formData.grade || '',
        p_medical_notes: formData.medical_notes || 'Bình thường'
      });

      if (rpcError) {
        throw rpcError;
      }

      if (res && !res.success) {
        throw new Error(res.error || 'CSDL từ chối lưu học sinh');
      }

      const assignedCode = res?.student_code || res?.code || (typeof res === 'string' ? res : '');

      showToast({
        title: 'Thành công',
        message: `Đã lưu hồ sơ học sinh: ${formData.name} (${assignedCode})!`,
        type: 'success'
      });

      if (typeof onSuccess === 'function') {
        onSuccess({ ...formData, code: assignedCode, id: res?.student_id || assignedCode });
      }

      onClose();
      if (typeof fetchStudents === 'function') {
        await fetchStudents();
      }
    } catch (err: any) {
      console.error('Lỗi lưu học sinh:', err);
      alert('Không thể lưu học sinh vào CSDL: ' + (err.message || err.toString()));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.parent_phone) {
      alert('Vui lòng nhập họ tên học sinh và số điện thoại phụ huynh!');
      return;
    }
    handleSaveStudent(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-lg bg-[#111827] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-extrabold text-white">Thêm Hồ Sơ Học Viên Mới</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmitForm} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Họ và tên học sinh *</label>
            <input
              type="text"
              required
              placeholder="Ví dụ: Hoàng Bảo Nam"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: formatCapitalizedName(e.target.value) })}
              className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white capitalize focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Ngày sinh (DD/MM/YYYY)</label>
              <DatePickerVN
                value={formData.dob}
                onChange={(val) => setFormData({ ...formData, dob: val })}
                placeholder="DD/MM/YYYY"
                className="bg-[#0B0F19]"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Giới tính</label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'Nam' | 'Nữ' })}
                className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Cơ sở học tập</label>
              <select
                value={formData.campus_id}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  campus_id: e.target.value as 'pmh' | 'pl',
                  school_name: e.target.value === 'pl' ? 'Royal School Phú Lâm' : 'Royal School PMH'
                })}
                className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="pmh">Phú Mỹ Hưng (PMH)</option>
                <option value="pl">Phú Lâm (PL)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Lớp chính khóa</label>
              <input
                type="text"
                placeholder="Lớp 4A1"
                value={formData.regular_class}
                onChange={(e) => setFormData({ ...formData, regular_class: e.target.value })}
                className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Họ tên phụ huynh</label>
              <input
                type="text"
                placeholder="Ví dụ: Hoàng Đình Trọng"
                value={formData.parent_name}
                onChange={(e) => setFormData({ ...formData, parent_name: formatCapitalizedName(e.target.value) })}
                className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white capitalize focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">SĐT phụ huynh *</label>
              <input
                type="text"
                required
                placeholder="090..."
                value={formData.parent_phone}
                onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Phân loại học sinh</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ 
                  ...formData, 
                  is_royal_student: true,
                  school_name: formData.campus_id === 'pl' ? 'Royal School Phú Lâm' : 'Royal School PMH'
                })}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  formData.is_royal_student
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                👑 Royal School (Bánh sữa)
              </button>
              <button
                type="button"
                onClick={() => setFormData({ 
                  ...formData, 
                  is_royal_student: false,
                  school_name: 'Ngoài trường'
                })}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  !formData.is_royal_student
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Ngoài Trường
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Lưu ý y tế, dị ứng thực phẩm</label>
            <textarea
              rows={2}
              placeholder="Ví dụ: Dị ứng sữa tươi, hen suyễn nhẹ (để trống: Bình thường)"
              value={formData.medical_notes}
              onChange={(e) => setFormData({ ...formData, medical_notes: e.target.value })}
              className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-slate-950 font-extrabold shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <span>Đang lưu...</span>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Lưu Hồ Sơ Học Viên</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const StudentModal = AddStudentModal;
