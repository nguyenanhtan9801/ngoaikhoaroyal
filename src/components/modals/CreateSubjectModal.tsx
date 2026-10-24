import React, { useState, useEffect } from 'react';
import {
  X,
  School,
  Check,
  Clock,
  Sparkles,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Subject, SubjectCategory } from '../../types';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { showToast } from '../../lib/toast';
import { formatVND } from '../../lib/storage';

interface CreateSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: SubjectCategory[];
  editingSubject?: Subject | null;
  existingSubjects?: Subject[];
  onSuccess: (savedSubject: Subject) => void;
}

export const CreateSubjectModal: React.FC<CreateSubjectModalProps> = ({
  isOpen,
  onClose,
  categories,
  editingSubject = null,
  existingSubjects = [],
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category_code: 'SPORTS',
    category_id: '',
    standard_duration: '90 phút',
    standard_sessions: 16,
    standard_course_fee: 2600000,
    standard_session_rate: 162500,
    description: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (editingSubject) {
      const sNum = editingSubject.standard_sessions || 16;
      const fee = editingSubject.standard_course_fee || 2600000;
      const rate = editingSubject.standard_session_rate || (sNum > 0 ? Math.ceil(fee / sNum) : 0);
      const catCode = editingSubject.category_code || 'SPORTS';
      const matched = categories.find(c => c.code === catCode || c.id === editingSubject.category_id);
      setFormData({
        code: editingSubject.code || '',
        name: editingSubject.name || '',
        category_code: catCode,
        category_id: matched?.id || editingSubject.category_id || '',
        standard_duration: editingSubject.standard_duration || '90 phút',
        standard_sessions: sNum,
        standard_course_fee: fee,
        standard_session_rate: rate,
        description: editingSubject.description || '',
      });
    } else {
      const defaultCat = categories[0]?.code || 'SPORTS';
      const matched = categories.find(c => c.code === defaultCat);
      setFormData({
        code: '',
        name: '',
        category_code: defaultCat,
        category_id: matched?.id || '',
        standard_duration: '90 phút',
        standard_sessions: 16,
        standard_course_fee: 2600000,
        standard_session_rate: 162500,
        description: '',
      });
    }
    setErrorMsg(null);
  }, [editingSubject, isOpen, categories]);

  if (!isOpen) return null;

  const durationQuickOptions = ['45 phút', '60 phút', '75 phút', '90 phút'];
  const sessionQuickOptions = [12, 16, 20, 24];

  const handleDurationChange = (dur: string) => {
    setFormData(prev => ({
      ...prev,
      standard_duration: dur,
    }));
  };

  const handleSessionsChange = (num: number) => {
    const validNum = Math.max(1, num);
    const fee = formData.standard_course_fee || 0;
    const rate = Math.ceil(fee / validNum);
    setFormData(prev => ({
      ...prev,
      standard_sessions: validNum,
      standard_session_rate: rate,
    }));
  };

  const handleFeeChange = (fee: number) => {
    const validFee = Math.max(0, fee);
    const sNum = Math.max(1, formData.standard_sessions || 16);
    const rate = Math.ceil(validFee / sNum);
    setFormData(prev => ({
      ...prev,
      standard_course_fee: validFee,
      standard_session_rate: rate,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCode = formData.code.trim().toUpperCase();
    const cleanName = formData.name.trim();

    if (!cleanCode || !cleanName) {
      setErrorMsg('Vui lòng nhập đầy đủ Mã môn học và Tên môn học.');
      return;
    }

    // Check duplicate code
    const isDuplicate = existingSubjects.some(
      s => s.code.toUpperCase() === cleanCode && s.id !== editingSubject?.id
    );
    if (isDuplicate) {
      setErrorMsg(`Mã môn "${cleanCode}" đã tồn tại trong hệ thống. Vui lòng chọn mã khác.`);
      return;
    }

    // Tìm object phân loại đã chọn từ danh sách categories
    const selectedCat = categories.find(
      (c) => c.code === formData.category_code || c.id === formData.category_id
    );

    const durationNum = parseInt(formData.standard_duration) || 90;
    const sessionsNum = parseInt(String(formData.standard_sessions)) || 16;
    const courseFee = Number(formData.standard_course_fee) || 2600000;
    const sessionRate = sessionsNum > 0 ? Math.ceil(courseFee / sessionsNum) : 0;
    const subId = editingSubject?.id || `sub_${cleanCode.toLowerCase()}`;

    const payload: any = {
      id: subId,
      code: cleanCode,
      name: cleanName,
      category: selectedCat?.name || 'Thể Thao',
      category_code: selectedCat?.code || 'SPORTS',
      standard_duration: `${durationNum} phút`,
      standard_sessions: sessionsNum,
      standard_course_fee: courseFee,
      standard_session_rate: sessionRate,
      description: formData.description || '',
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Nếu có ID của category thì gắn vào
    if (selectedCat?.id) {
      payload.category_id = selectedCat.id;
    }

    setIsSubmitting(true);

    try {
      const client = getSupabaseClient() || supabase;
      if (client) {
        let { data, error } = await client
          .from('subjects')
          .upsert([payload], { onConflict: 'code' })
          .select();

        // Tự động xử lý nếu schema cache báo lỗi cột category_id
        if (error && (error.message.includes('category_id') || error.message.includes('schema cache') || error.code === 'PGRST204')) {
          console.warn('Supabase báo lỗi schema cache với category_id, tự động thử lại mà không gửi category_id:', error.message);
          const safePayload = { ...payload };
          delete safePayload.category_id;

          const retryResult = await client
            .from('subjects')
            .upsert([safePayload], { onConflict: 'code' })
            .select();

          data = retryResult.data;
          error = retryResult.error;
        }

        if (error) {
          console.error('Lỗi tạo môn học:', error);
          setErrorMsg('Lỗi tạo môn học: ' + error.message);
          alert('Lỗi tạo môn học: ' + error.message);
          setIsSubmitting(false);
          return;
        }
      }

      alert('Đã thêm môn học thành công vào CSDL!');
      showToast(
        editingSubject
          ? `Đã cập nhật môn học "${cleanName}" (${cleanCode}) thành công!`
          : `Đã lưu môn học "${cleanName}" (${cleanCode}) thành công vào CSDL!`,
        'success',
        { title: 'Quản Lý Danh Mục Môn Học' }
      );

      const finalSavedSubject: Subject = {
        id: subId,
        code: cleanCode,
        name: cleanName,
        category: selectedCat?.name || 'Thể Thao',
        category_code: selectedCat?.code || 'SPORTS',
        category_id: selectedCat?.id,
        standard_duration: `${durationNum} phút`,
        duration_minutes: durationNum,
        standard_sessions: sessionsNum,
        standard_course_fee: courseFee,
        standard_session_rate: sessionRate,
        description: formData.description || '',
        is_active: true,
      };

      onSuccess(finalSavedSubject);
      onClose();
    } catch (err: any) {
      console.error('[CreateSubjectModal] Unexpected error:', err);
      setErrorMsg('Lỗi bất ngờ khi lưu môn học: ' + (err?.message || 'Không xác định'));
      alert('Lỗi bất ngờ khi lưu môn học: ' + (err?.message || 'Không xác định'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculatedUnitPrice =
    formData.standard_sessions > 0
      ? Math.ceil((formData.standard_course_fee || 0) / formData.standard_sessions)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>{editingSubject ? 'Cập Nhật Môn Học' : '+ Thêm Môn Học Mới Vào Danh Mục'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  CSDL Supabase
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Lưu trực tiếp vào bảng <code className="text-amber-400 font-mono">public.subjects</code> và kích hoạt ngay.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <div className="flex-1 font-medium">{errorMsg}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Row 1: Code & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                <span>Mã Môn *</span>
                <span className="text-[10px] text-slate-500 font-normal">In hoa</span>
              </label>
              <input
                type="text"
                required
                maxLength={12}
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                placeholder="VD: BASKET"
                disabled={Boolean(editingSubject)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-amber-400 font-mono font-black text-sm focus:outline-none focus:border-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-bold mb-1.5">
                Phân Loại Môn *
              </label>
              <select
                value={formData.category_code}
                onChange={(e) => {
                  const val = e.target.value;
                  const cat = categories.find(c => c.code === val || c.id === val);
                  setFormData({
                    ...formData,
                    category_code: cat?.code || val,
                    category_id: cat?.id || '',
                  });
                }}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white font-semibold focus:outline-none focus:border-amber-500"
                required
              >
                <option value="">-- Chọn Phân Loại Môn --</option>
                {categories.map((cat) => (
                  <option key={cat.code} value={cat.code}>
                    {cat.name} ({cat.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Name */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">
              Tên Môn Học *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="VD: Bóng rổ Hoàng Gia (Royal Basketball Pro)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white font-extrabold text-sm focus:outline-none focus:border-amber-500 placeholder-slate-600"
            />
          </div>

          {/* Row 3: Duration & Quick Picks */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Thời Lượng Chuẩn Một Buổi *</span>
              </label>
              <span className="text-[11px] font-mono text-cyan-400 font-bold">
                {formData.standard_duration}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {durationQuickOptions.map(dur => (
                <button
                  type="button"
                  key={dur}
                  onClick={() => handleDurationChange(dur)}
                  className={`py-2 px-2 rounded-xl text-center text-xs font-bold transition-all cursor-pointer ${
                    formData.standard_duration === dur
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {dur}
                </button>
              ))}
            </div>
          </div>

          {/* Row 4: Sessions & Quick Picks */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-bold">
                Số Buổi Chuẩn Khóa *
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 mr-1">Chọn nhanh:</span>
                {sessionQuickOptions.map(sNum => (
                  <button
                    type="button"
                    key={sNum}
                    onClick={() => handleSessionsChange(sNum)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer ${
                      formData.standard_sessions === sNum
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {sNum}b
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              min={1}
              max={120}
              required
              value={formData.standard_sessions}
              onChange={(e) => handleSessionsChange(Number(e.target.value) || 1)}
              placeholder="VD: 16 hoặc 24"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-amber-400 font-mono font-bold text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Row 5: Course Fee & Auto Unit Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                Học Phí Chuẩn Cả Khóa (VNĐ) *
              </label>
              <input
                type="number"
                step={50000}
                min={0}
                required
                value={formData.standard_course_fee}
                onChange={(e) => handleFeeChange(Number(e.target.value) || 0)}
                placeholder="VD: 3990000"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-amber-400 font-mono font-black text-sm focus:outline-none focus:border-amber-500"
              />
              <span className="text-[11px] text-slate-400 font-mono font-semibold mt-1 block">
                {formatVND(formData.standard_course_fee || 0)}
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                <span>Đơn Giá Buổi (Tự động)</span>
                <span className="text-[10px] text-emerald-400 font-normal">Math.ceil làm tròn</span>
              </label>
              <div className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-emerald-500/30 text-emerald-400 font-mono font-black text-sm flex items-center justify-between">
                <span>{formatVND(calculatedUnitPrice)} / buổi</span>
                <span className="text-[10px] text-slate-500 font-sans font-normal">
                  ({formData.standard_sessions}b)
                </span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                = {formatVND(formData.standard_course_fee || 0)} / {formData.standard_sessions || 24} buổi
              </span>
            </div>
          </div>

          {/* Row 6: Description */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">
              Mô Tả Chương Trình Đào Tạo
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Tóm tắt mục tiêu môn học, giáo trình tiêu chuẩn, chứng chỉ hoặc trang thiết bị ngoại khóa..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-200 focus:outline-none focus:border-amber-500 placeholder-slate-600 text-xs"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Đang ghi CSDL...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{editingSubject ? 'Lưu Thay Đổi' : 'Thêm Môn Học Vào CSDL'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateSubjectModal;
