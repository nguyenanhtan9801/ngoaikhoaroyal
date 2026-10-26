import React, { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  Save, 
  Lock, 
  Unlock, 
  BookOpen, 
  Dumbbell, 
  Waves, 
  Palette, 
  Info,
  CheckCircle2
} from 'lucide-react';
import { Facility, Campus } from '../../types';

interface FacilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  facility?: Facility | null;
  onSave: (formData: any) => Promise<void>;
  campuses: Campus[];
  defaultCampusId?: string;
}

export const FacilityModal: React.FC<FacilityModalProps> = ({
  isOpen,
  onClose,
  facility,
  onSave,
  campuses,
  defaultCampusId = 'camp_pmh',
}) => {
  const [formData, setFormData] = useState({
    id: '',
    code: '',
    name: '',
    campus_id: defaultCampusId,
    room_type: 'classroom',
    capacity: 30,
    floor_building: '',
    equipment: '',
    is_locked: false,
    note: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (facility) {
      setFormData({
        id: facility.id || '',
        code: facility.code || facility.id || '',
        name: facility.name || '',
        campus_id: facility.campus_id || defaultCampusId,
        room_type: facility.room_type || facility.type || 'classroom',
        capacity: facility.capacity || 30,
        floor_building: facility.floor_building || '',
        equipment: facility.equipment || '',
        is_locked: facility.is_locked ?? (facility.is_active === false),
        note: facility.note || '',
      });
    } else {
      const campId = defaultCampusId && defaultCampusId !== 'all' ? defaultCampusId : 'camp_pmh';
      const prefix = campId === 'camp_pl' ? 'PL' : 'PMH';
      setFormData({
        id: '',
        code: `${prefix}-PH-${Date.now().toString().slice(-4)}`,
        name: '',
        campus_id: campId,
        room_type: 'classroom',
        capacity: 30,
        floor_building: '',
        equipment: '',
        is_locked: false,
        note: '',
      });
    }
    setErrorMsg(null);
  }, [facility, defaultCampusId, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim()) {
      setErrorMsg('Vui lòng nhập Mã phòng học.');
      return;
    }
    if (!formData.name.trim()) {
      setErrorMsg('Vui lòng nhập Tên phòng học / Sân bãi.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onSave({
        ...formData,
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        capacity: Number(formData.capacity) || 30,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi lưu dữ liệu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoomTypeIcon = (type: string) => {
    switch (type) {
      case 'sports_hall':
        return <Dumbbell className="w-4 h-4 text-amber-400" />;
      case 'pool':
        return <Waves className="w-4 h-4 text-cyan-400" />;
      case 'art_music':
        return <Palette className="w-4 h-4 text-purple-400" />;
      default:
        return <BookOpen className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {facility ? 'Chỉnh Sửa Phòng Học / Sân Bãi' : 'Thêm Phòng Học / Sân Bãi Mới'}
              </h3>
              <p className="text-xs text-slate-400">
                Lưu trực tiếp vào CSDL Supabase và đồng bộ lịch học ngoại khóa
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {/* 1. Cơ sở & 2. Mã phòng */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                <span>1. Cơ sở trường <span className="text-rose-400">*</span></span>
              </label>
              <select
                value={formData.campus_id}
                onChange={(e) => {
                  const camp = e.target.value;
                  const prefix = camp === 'camp_pl' ? 'PL' : 'PMH';
                  setFormData(prev => ({
                    ...prev,
                    campus_id: camp,
                    code: prev.code.includes('-') ? `${prefix}-${prev.code.split('-').slice(1).join('-')}` : prev.code
                  }));
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500 transition-colors"
              >
                {campuses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                2. Mã phòng / Mã sân <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="VD: PMH-TD-01, PMH-A202"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* 3. Tên phòng / Sân */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">
              3. Tên phòng / Sân bãi <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="VD: Nhà thi đấu đa năng PMH, Hồ bơi 4 mùa Olympic..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* 4. Loại phòng & 5. Sức chứa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
                {getRoomTypeIcon(formData.room_type)}
                <span>4. Loại phòng</span>
              </label>
              <select
                value={formData.room_type}
                onChange={(e) => setFormData({ ...formData, room_type: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500 transition-colors"
              >
                <option value="classroom">Phòng học tiêu chuẩn</option>
                <option value="sports_hall">Nhà thi đấu thể thao</option>
                <option value="pool">Hồ bơi 4 mùa</option>
                <option value="art_music">Phòng vẽ / âm nhạc</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                5. Sức chứa tối đa (Học sinh)
              </label>
              <input
                type="number"
                min="1"
                max="300"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value, 10) || 30 })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* 6. Vị trí / Tòa nhà */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">
              6. Vị trí / Tòa nhà
            </label>
            <input
              type="text"
              value={formData.floor_building}
              onChange={(e) => setFormData({ ...formData, floor_building: e.target.value })}
              placeholder="VD: Tòa B - Tầng 2, Khu Vận Động Ngoài Trời..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* 7. Trang thiết bị */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">
              7. Trang thiết bị
            </label>
            <input
              type="text"
              value={formData.equipment}
              onChange={(e) => setFormData({ ...formData, equipment: e.target.value })}
              placeholder="VD: Điều hòa 2 chiều, máy chiếu HD, bảng rổ điện tử, thảm đấu võ..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">
              Ghi chú thêm
            </label>
            <textarea
              rows={2}
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Lưu ý riêng về chìa khóa phòng, thời gian bảo dưỡng định kỳ..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition-colors resize-none"
            />
          </div>

          {/* 8. Khóa phòng tạm thời (Bảo trì) */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                formData.is_locked ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              }`}>
                {formData.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </div>
              <div>
                <span className="font-bold text-white block">
                  {formData.is_locked ? 'Đang Khóa (Bảo Trì)' : 'Đang Mở Sử Dụng Bình Thường'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {formData.is_locked
                    ? 'Phòng sẽ bị vô hiệu hóa trong form tạo lớp mới, không thể xếp học sinh vào.'
                    : 'Phòng sẵn sàng tiếp nhận lớp học ngoại khóa.'}
                </span>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_locked}
                onChange={(e) => setFormData({ ...formData, is_locked: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Đang lưu...' : facility ? 'Cập Nhật Phòng' : 'Tạo Phòng Mới'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
