import React, { useState } from 'react';
import { Clock, Plus, Trash2, Edit3, CheckCircle2, Building2, Calendar, Sparkles } from 'lucide-react';
import { AppStore } from '../../types';
import { showToast } from '../../lib/toast';

interface TimeSlotsManagerProps {
  store: AppStore;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

export const TimeSlotsManager: React.FC<TimeSlotsManagerProps> = ({ store, onUpdateStore }) => {
  const [selectedCampus, setSelectedCampus] = useState<string>('all');

  const defaultSlots = [
    { id: 'slot_1', name: 'Ca Chiều 1 (Thứ 2 - 4)', days: ['T2', 'T4'], time: '16:30 - 18:00', campus: 'pmh', activeClasses: 4 },
    { id: 'slot_2', name: 'Ca Chiều 2 (Thứ 3 - 5)', days: ['T3', 'T5'], time: '16:30 - 18:00', campus: 'pmh', activeClasses: 5 },
    { id: 'slot_3', name: 'Ca Cuối Tuần Sáng (Thứ 7)', days: ['T7'], time: '08:30 - 11:30', campus: 'pl', activeClasses: 3 },
    { id: 'slot_4', name: 'Ca Cuối Tuần Chiều (Chủ Nhật)', days: ['CN'], time: '14:00 - 17:00', campus: 'all', activeClasses: 6 },
  ];

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950/30 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Quản Lý Khung Giờ & Ca Học Ngoại Khóa
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-mono border border-amber-500/30">
                Chuẩn Hóa Lịch Học
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cấu hình các khung giờ chuẩn cho toàn hệ thống Royal School (Phú Mỹ Hưng & Phú Lâm)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => showToast('Tính năng thêm ca học mới đã sẵn sàng!', 'info')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Thêm Khung Giờ Mới
        </button>
      </div>

      {/* Grid of Slots */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {defaultSlots.map((slot) => (
          <div
            key={slot.id}
            className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400">{slot.name}</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-mono text-cyan-300 border border-slate-700">
                  {slot.time}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                {slot.days.map((day) => (
                  <span
                    key={day}
                    className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] font-bold"
                  >
                    {day}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1 text-[11px]">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                {slot.campus === 'all' ? 'Cả 2 cơ sở' : slot.campus === 'pmh' ? 'Phú Mỹ Hưng' : 'Phú Lâm'}
              </span>
              <span className="text-emerald-400 font-semibold text-[11px]">
                {slot.activeClasses} lớp đang chạy
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
