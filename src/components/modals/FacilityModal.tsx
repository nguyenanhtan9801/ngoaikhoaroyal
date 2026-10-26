import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  BookOpen,
  Dumbbell,
  Waves,
  Palette,
  Lock,
  Unlock,
  Save,
  MapPin,
  Users,
  Wrench,
} from 'lucide-react';
import { Facility } from '../../types';

interface FacilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingFacility?: Facility | null;
  defaultCampusId?: string;
  onSave: (formData: {
    id?: string;
    code: string;
    name: string;
    campus_id: string;
    room_type: 'classroom' | 'sports_hall' | 'pool' | 'art_music';
    capacity: number;
    floor_building: string;
    equipment: string;
    is_locked: boolean;
    note: string;
  }) => Promise<void>;
}

const ROOM_TYPE_OPTIONS: {
  value: 'classroom' | 'sports_hall' | 'pool' | 'art_music';
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { value: 'classroom', label: 'Phòng học tiêu chuẩn', icon: BookOpen },
  { value: 'sports_hall', label: 'Nhà thi đấu thể thao', icon: Dumbbell },
  { value: 'pool', label: 'Hồ bơi 4 mùa', icon: Waves },
  { value: 'art_music', label: 'Phòng vẽ / âm nhạc', icon: Palette },
];

export const FacilityModal: React.FC<FacilityModalProps> = ({
  isOpen,
  onClose,
  editingFacility,
  defaultCampusId = 'camp_pmh',
  onSave,
}) => {
  const normalizedDefaultCampus =
    defaultCampusId === 'camp_pl' || defaultCampusId === 'pl' ? 'camp_pl' : 'camp_pmh';

  const [campusId, setCampusId] = useState<string>(normalizedDefaultCampus);
  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [roomType, setRoomType] = useState<'classroom' | 'sports_hall' | 'pool' | 'art_music'>('classroom');
  const [floorBuilding, setFloorBuilding] = useState<string>('');
  const [capacity, setCapacity] = useState<number>(30);
  const [equipment, setEquipment] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingFacility) {
      setCampusId(editingFacility.campus_id === 'camp_pl' ? 'camp_pl' : 'camp_pmh');
      setCode(editingFacility.code || '');
      setName(editingFacility.name || '');
      const validRoomType = (['classroom', 'sports_hall', 'pool', 'art_music'] as const).includes(
        editingFacility.room_type as any
      )
        ? (editingFacility.room_type as 'classroom' | 'sports_hall' | 'pool' | 'art_music')
        : 'classroom';
      setRoomType(validRoomType);
      setFloorBuilding(editingFacility.floor_building || '');
      setCapacity(Number(editingFacility.capacity) || 30);
      setEquipment(editingFacility.equipment || '');
      setNote(editingFacility.note || '');
      setIsLocked(Boolean(editingFacility.is_locked));
    } else {
      const targetCampus =
        defaultCampusId === 'camp_pl' || defaultCampusId === 'pl' ? 'camp_pl' : 'camp_pmh';
      setCampusId(targetCampus);
      setCode('');
      setName('');
      setRoomType('classroom');
      setFloorBuilding('');
      setCapacity(30);
      setEquipment('');
      setNote('');
      setIsLocked(false);
    }
  }, [isOpen, editingFacility, defaultCampusId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      alert('Vui lòng nhập Mã phòng học!');
      return;
    }
    if (!name.trim()) {
      alert('Vui lòng nhập Tên phòng / Sân!');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: editingFacility?.id,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        campus_id: campusId,
        room_type: roomType,
        capacity: Number(capacity) || 30,
        floor_building: floorBuilding.trim(),
        equipment: equipment.trim(),
        is_locked: isLocked,
        note: note.trim(),
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
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                {editingFacility ? 'Chỉnh Sửa Phòng Học & Sân Bãi' : '+ Thêm Phòng Học Mới'}
              </h3>
              <p className="text-xs text-slate-400">
                Đồng bộ trực tiếp vào bảng <code className="text-amber-300">public.facilities</code> trên CSDL Supabase
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
          {/* 1. Cơ sở & 2. Mã phòng */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                1. Cơ sở (Bắt buộc) *
              </label>
              <select
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-semibold"
              >
                <option value="camp_pmh">Phú Mỹ Hưng (camp_pmh)</option>
                <option value="camp_pl">Phú Lâm (camp_pl)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                2. Mã phòng (Bắt buộc) *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="VD: PMH-A202"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold uppercase focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* 3. Tên phòng / Sân */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">
              3. Tên phòng / Sân (Bắt buộc) *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Phòng Học Đa Năng A202"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* 4. Loại phòng & 6. Sức chứa tối đa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                4. Loại phòng *
              </label>
              <select
                value={roomType}
                onChange={(e) =>
                  setRoomType(e.target.value as 'classroom' | 'sports_hall' | 'pool' | 'art_music')
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500"
              >
                {ROOM_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span>6. Sức chứa tối đa (Học sinh) *</span>
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                required
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* 5. Vị trí / Tòa nhà */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span>5. Vị trí / Tòa nhà</span>
            </label>
            <input
              type="text"
              value={floorBuilding}
              onChange={(e) => setFloorBuilding(e.target.value)}
              placeholder="VD: Tòa B - Tầng 2"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* 7. Trang thiết bị & Ghi chú */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-slate-400" />
                <span>7. Trang thiết bị</span>
              </label>
              <input
                type="text"
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                placeholder="VD: Điều hòa, máy chiếu, thảm đấu..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                Ghi chú vận hành
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú thêm (nếu có)..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* 8. Khóa phòng tạm thời */}
          <div
            onClick={() => setIsLocked(!isLocked)}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
              isLocked
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  isLocked
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </div>
              <div>
                <div className="font-bold text-white text-xs">
                  8. Khóa phòng tạm thời (Bảo trì / Sửa chữa)
                </div>
                <div className="text-[11px] text-slate-400">
                  {isLocked
                    ? 'Phòng sẽ ở trạng thái 🔒 Đã Khóa (Bảo trì) và không hiện khi mở lớp mới'
                    : 'Phòng đang ở trạng thái 🟢 Đang Hoạt Động và sẵn sàng xếp lớp'}
                </div>
              </div>
            </div>

            <input
              type="checkbox"
              checked={isLocked}
              onChange={(e) => setIsLocked(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
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
              <span>{isSubmitting ? 'Đang lưu...' : editingFacility ? 'Cập Nhật Phòng Học' : 'Lưu Phòng Học Mới'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
