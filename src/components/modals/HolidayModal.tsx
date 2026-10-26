import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CalendarOff,
  Calendar,
  Building2,
  Repeat,
  Save,
  FileText,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Holiday } from '../../types';
import { DatePickerVN } from '../common/DatePickerVN';

interface HolidayModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingHoliday?: Holiday | null;
  defaultAcademicYear?: string;
  onSave: (formData: {
    id?: string;
    title: string;
    start_date: string;
    end_date: string;
    campus_id: string | null;
    academic_year: string;
    is_recurring: boolean;
    description: string;
    status: 'active' | 'inactive';
  }) => Promise<void>;
}

export function calculateHolidayDaysCount(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0;
  const start = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${endDateStr}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / 86400000) + 1;
}

export const HolidayModal: React.FC<HolidayModalProps> = ({
  isOpen,
  onClose,
  editingHoliday,
  defaultAcademicYear = '2026-2027',
  onSave,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [title, setTitle] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [campusId, setCampusId] = useState<string>(''); // '' represents null (Toàn trường)
  const [academicYear, setAcademicYear] = useState<string>(defaultAcademicYear);
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingHoliday) {
      setTitle(editingHoliday.title || '');
      setStartDate(editingHoliday.start_date || todayStr);
      setEndDate(editingHoliday.end_date || editingHoliday.start_date || todayStr);
      setCampusId(editingHoliday.campus_id || '');
      setAcademicYear(editingHoliday.academic_year || '2026-2027');
      setIsRecurring(Boolean(editingHoliday.is_recurring));
      setDescription(editingHoliday.description || '');
      setStatus(editingHoliday.status === 'inactive' ? 'inactive' : 'active');
    } else {
      setTitle('');
      setStartDate(todayStr);
      setEndDate(todayStr);
      setCampusId('');
      setAcademicYear(defaultAcademicYear && defaultAcademicYear !== 'all' ? defaultAcademicYear : '2026-2027');
      setIsRecurring(false);
      setDescription('');
      setStatus('active');
    }
  }, [isOpen, editingHoliday, defaultAcademicYear, todayStr]);

  const totalDays = useMemo(() => {
    return calculateHolidayDaysCount(startDate, endDate);
  }, [startDate, endDate]);

  if (!isOpen) return null;

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (endDate && val > endDate) {
      setEndDate(val);
    }
  };

  const handleEndDateChange = (val: string) => {
    if (startDate && val < startDate) {
      setEndDate(startDate);
    } else {
      setEndDate(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Vui lòng nhập tên ngày nghỉ lễ!');
      return;
    }
    if (!startDate || !endDate) {
      alert('Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc nghỉ!');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      alert('Ngày kết thúc nghỉ không được nhỏ hơn ngày bắt đầu!');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: editingHoliday?.id,
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        campus_id: campusId ? campusId : null,
        academic_year: academicYear.trim() || '2026-2027',
        is_recurring: isRecurring,
        description: description.trim(),
        status,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-xl rounded-3xl bg-[#111827] border border-slate-700/80 p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <CalendarOff className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                {editingHoliday ? 'Chỉnh Sửa Ngày Nghỉ Lễ' : '+ Thêm Ngày Nghỉ Lễ Mới'}
              </h3>
              <p className="text-xs text-slate-400">
                Đồng bộ trực tiếp vào bảng <code className="text-amber-300">public.holidays</code> và tự động trừ khi tính buổi học
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* 1. Tên ngày nghỉ lễ */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">
              1. Tên ngày nghỉ lễ (Bắt buộc) *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Nghỉ Lễ Quốc Khánh 2/9, Nghỉ Tết Nguyên Đán..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* 2. Khoảng thời gian nghỉ */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>2. Khoảng thời gian nghỉ (Bắt buộc) *</span>
              </span>
              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-extrabold text-xs">
                Tổng cộng: {totalDays} ngày nghỉ
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Từ ngày (DD/MM/YYYY) *</label>
                <DatePickerVN
                  required
                  value={startDate}
                  onChange={handleStartDateChange}
                  className="bg-slate-950 font-bold"
                  placeholder="DD/MM/YYYY"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Đến ngày (DD/MM/YYYY) *</label>
                <DatePickerVN
                  required
                  min={startDate}
                  value={endDate}
                  onChange={handleEndDateChange}
                  className="bg-slate-950 font-bold"
                  placeholder="DD/MM/YYYY"
                />
              </div>
            </div>
          </div>

          {/* 3. Phạm vi cơ sở áp dụng & 4. Năm học */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span>3. Phạm vi cơ sở áp dụng</span>
              </label>
              <select
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500"
              >
                <option value="">Toàn trường (Tất cả cơ sở)</option>
                <option value="camp_pmh">Cơ sở Phú Mỹ Hưng</option>
                <option value="camp_pl">Cơ sở Phú Lâm</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                4. Năm học
              </label>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold focus:outline-none focus:border-amber-500"
              >
                <option value="2025-2026">2025-2026</option>
                <option value="2026-2027">2026-2027</option>
                <option value="2027-2028">2027-2028</option>
              </select>
            </div>
          </div>

          {/* 5. Lặp lại hàng năm & Trạng thái */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              onClick={() => setIsRecurring(!isRecurring)}
              className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                isRecurring
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-slate-900/90 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Repeat className={`w-4 h-4 ${isRecurring ? 'text-emerald-400' : 'text-slate-500'}`} />
                <div>
                  <div className="font-bold text-white text-xs">5. Lặp lại hàng năm</div>
                  <div className="text-[10px] text-slate-400">Lặp lại theo chu kỳ hàng năm</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                Trạng thái áp dụng
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500"
              >
                <option value="active">🟢 Đang áp dụng (Active)</option>
                <option value="inactive">⏸️ Tạm ngưng (Inactive)</option>
              </select>
            </div>
          </div>

          {/* 6. Mô tả / Ghi chú */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>6. Mô tả / Ghi chú</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú nội dung chi tiết về kỳ nghỉ lễ hoặc hướng dẫn xếp lịch học bù..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Đang lưu...'
                  : editingHoliday
                  ? 'Cập Nhật Ngày Nghỉ Lễ'
                  : 'Lưu Ngày Nghỉ Lễ'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
