import React, { useState, useMemo } from 'react';
import { 
  Clock, 
  Plus, 
  Edit2, 
  Trash2, 
  Check, 
  X, 
  Calendar, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';
import { TimeSlot, AppStore } from '../../types';
import { getSupabaseClient, supabase } from '../../supabaseClient';
import { showToast } from '../../lib/toast';
import { createAuditRecord, appendAuditLog } from '../../lib/storage';

interface TimeSlotsManagerProps {
  store: AppStore;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

const WEEKDAYS_LIST = [
  { code: 'T2', label: 'Thứ 2' },
  { code: 'T3', label: 'Thứ 3' },
  { code: 'T4', label: 'Thứ 4' },
  { code: 'T5', label: 'Thứ 5' },
  { code: 'T6', label: 'Thứ 6' },
  { code: 'T7', label: 'Thứ 7' },
  { code: 'CN', label: 'Chủ Nhật' },
];

const PRESET_DURATIONS = [
  { value: 45, label: '45 phút' },
  { value: 60, label: '60 phút' },
  { value: 75, label: '75 phút' },
  { value: 90, label: '90 phút (Chuẩn)' },
  { value: 120, label: '120 phút' },
];

/**
 * Tính giờ kết thúc tự động từ start_time và duration (phút)
 */
function calculateEndTime(startTime: string, durationMinutes: number): string {
  if (!startTime) return '';
  const [hStr, mStr] = startTime.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return '';
  const totalMinutes = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

export const TimeSlotsManager: React.FC<TimeSlotsManagerProps> = ({
  store,
  onUpdateStore,
  isModal = false,
  isOpen = true,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');

  // Form modal state for Add/Edit Time Slot
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  const [formData, setFormData] = useState<{
    code: string;
    name: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    days_of_week: string[];
    campus_id: string;
    status: 'active' | 'inactive';
    notes: string;
  }>({
    code: '',
    name: '',
    start_time: '16:30',
    end_time: '18:00',
    duration_minutes: 90,
    days_of_week: ['T2', 'T4'],
    campus_id: 'all',
    status: 'active',
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtered slots list
  const filteredSlots = useMemo(() => {
    return (store.timeSlots || []).filter(slot => {
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery = !q ||
        (slot.code && slot.code.toLowerCase().includes(q)) ||
        (slot.name && slot.name.toLowerCase().includes(q)) ||
        (slot.notes && slot.notes.toLowerCase().includes(q)) ||
        slot.start_time.includes(q) ||
        slot.end_time.includes(q);

      const matchesStatus = statusFilter === 'all' || (slot.status || 'active') === statusFilter;
      const matchesDay = selectedDayFilter === 'all' || (slot.days_of_week || []).includes(selectedDayFilter);

      return matchesQuery && matchesStatus && matchesDay;
    });
  }, [store.timeSlots, searchQuery, statusFilter, selectedDayFilter]);

  // Open Form to Add New Slot
  const handleOpenAdd = () => {
    const nextIndex = (store.timeSlots?.length || 0) + 1;
    setEditingSlot(null);
    setFormData({
      code: `CA_CHIEU_${nextIndex > 9 ? nextIndex : `0${nextIndex}`}_90P`,
      name: `Ca Chiều Chuẩn ${nextIndex} (16:30 - 18:00)`,
      start_time: '16:30',
      end_time: '18:00',
      duration_minutes: 90,
      days_of_week: ['T2', 'T4'],
      campus_id: 'all',
      status: 'active',
      notes: '',
    });
    setShowEditModal(true);
  };

  // Open Form to Edit Slot
  const handleOpenEdit = (slot: TimeSlot) => {
    setEditingSlot(slot);
    setFormData({
      code: slot.code || slot.id,
      name: slot.name,
      start_time: slot.start_time,
      end_time: slot.end_time,
      duration_minutes: slot.duration_minutes || 90,
      days_of_week: Array.isArray(slot.days_of_week) ? [...slot.days_of_week] : ['T2', 'T4'],
      campus_id: slot.campus_id || 'all',
      status: slot.status || 'active',
      notes: slot.notes || '',
    });
    setShowEditModal(true);
  };

  // Toggle Day Selection
  const handleToggleDay = (dayCode: string) => {
    setFormData(prev => {
      const exists = prev.days_of_week.includes(dayCode);
      const updated = exists
        ? prev.days_of_week.filter(d => d !== dayCode)
        : [...prev.days_of_week, dayCode];
      return { ...prev, days_of_week: updated };
    });
  };

  // Duration change auto updates end_time
  const handleDurationChange = (dur: number) => {
    const newEndTime = calculateEndTime(formData.start_time, dur) || formData.end_time;
    setFormData(prev => ({
      ...prev,
      duration_minutes: dur,
      end_time: newEndTime,
    }));
  };

  // Start time change auto calculates end_time
  const handleStartTimeChange = (newStartTime: string) => {
    const newEndTime = calculateEndTime(newStartTime, formData.duration_minutes) || formData.end_time;
    setFormData(prev => ({
      ...prev,
      start_time: newStartTime,
      end_time: newEndTime,
    }));
  };

  // Save (Create or Update) with direct Supabase sync
  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = formData.code.trim().toUpperCase();
    const cleanName = formData.name.trim();

    if (!cleanCode || !cleanName) {
      showToast('Vui lòng nhập đầy đủ Mã ca học và Tên ca học.', 'error');
      return;
    }

    if (!formData.start_time || !formData.end_time) {
      showToast('Vui lòng chọn Giờ bắt đầu và Giờ kết thúc.', 'error');
      return;
    }

    if (formData.days_of_week.length === 0) {
      showToast('Vui lòng chọn ít nhất một thứ trong tuần cho khung giờ.', 'error');
      return;
    }

    // Check duplicate code
    const isDup = (store.timeSlots || []).find(
      s => (s.code || '').toUpperCase() === cleanCode && s.id !== editingSlot?.id
    );
    if (isDup) {
      showToast(`Mã ca học "${cleanCode}" đã tồn tại cho ca "${isDup.name}".`, 'error');
      return;
    }

    setIsSubmitting(true);
    const client = getSupabaseClient() || supabase;

    try {
      if (editingSlot) {
        // UPDATE
        const updatedSlot: TimeSlot = {
          ...editingSlot,
          code: cleanCode,
          name: cleanName,
          start_time: formData.start_time,
          end_time: formData.end_time,
          duration_minutes: formData.duration_minutes,
          days_of_week: formData.days_of_week,
          campus_id: formData.campus_id !== 'all' ? formData.campus_id : undefined,
          status: formData.status,
          notes: formData.notes.trim(),
        };

        // 1. Direct Supabase Update
        if (client) {
          try {
            const { error } = await client
              .from('time_slots')
              .update({
                code: cleanCode,
                name: cleanName,
                start_time: formData.start_time,
                end_time: formData.end_time,
                duration_minutes: formData.duration_minutes,
                days_of_week: formData.days_of_week,
                campus_id: formData.campus_id !== 'all' ? formData.campus_id : null,
                status: formData.status,
                notes: formData.notes.trim(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', editingSlot.id);

            if (error) {
              console.warn('Lỗi Supabase khi cập nhật time_slots (sẽ lưu Local):', error.message);
            }
          } catch (err) {
            console.warn('Exception khi gọi Supabase update time_slots:', err);
          }
        }

        // 2. Global State & Audit Log
        onUpdateStore(prev => {
          const log = createAuditRecord(
            'TIME_SLOT_UPDATE',
            'ACADEMIC',
            `Khung giờ: ${cleanName}`,
            `Cập nhật khung giờ học ${cleanCode} (${formData.start_time} - ${formData.end_time}, ${formData.duration_minutes} phút)`,
            null,
            { details: { status: 'success', after: updatedSlot } }
          );
          return {
            ...prev,
            timeSlots: (prev.timeSlots || []).map(s => (s.id === editingSlot.id ? updatedSlot : s)),
            auditLogs: [log, ...(prev.auditLogs || [])],
          };
        });

        showToast(`Đã cập nhật khung giờ "${cleanName}" (${cleanCode}) thành công!`, 'success');
      } else {
        // INSERT
        const newId = `slot_${cleanCode.toLowerCase()}_${Date.now()}`;
        const newSlot: TimeSlot = {
          id: newId,
          code: cleanCode,
          name: cleanName,
          start_time: formData.start_time,
          end_time: formData.end_time,
          duration_minutes: formData.duration_minutes,
          days_of_week: formData.days_of_week,
          campus_id: formData.campus_id !== 'all' ? formData.campus_id : undefined,
          status: formData.status,
          notes: formData.notes.trim(),
          slot_type: formData.days_of_week.some(d => d === 'T7' || d === 'CN') ? 'weekend' : 'after_school',
        };

        // 1. Direct Supabase Insert
        if (client) {
          try {
            const { error } = await client.from('time_slots').insert([
              {
                id: newId,
                code: cleanCode,
                name: cleanName,
                start_time: formData.start_time,
                end_time: formData.end_time,
                duration_minutes: formData.duration_minutes,
                days_of_week: formData.days_of_week,
                campus_id: formData.campus_id !== 'all' ? formData.campus_id : null,
                status: formData.status,
                notes: formData.notes.trim(),
                slot_type: newSlot.slot_type,
                updated_at: new Date().toISOString(),
              },
            ]);

            if (error) {
              console.warn('Lỗi Supabase khi thêm time_slots (sẽ lưu Local):', error.message);
            }
          } catch (err) {
            console.warn('Exception khi gọi Supabase insert time_slots:', err);
          }
        }

        // 2. Global State & Audit Log
        onUpdateStore(prev => {
          const log = createAuditRecord(
            'TIME_SLOT_CREATE',
            'ACADEMIC',
            `Khung giờ: ${cleanName}`,
            `Thêm mới khung giờ học ${cleanCode} (${formData.start_time} - ${formData.end_time}, ${formData.duration_minutes} phút)`,
            null,
            { details: { status: 'success', after: newSlot } }
          );
          return {
            ...prev,
            timeSlots: [...(prev.timeSlots || []), newSlot],
            auditLogs: [log, ...(prev.auditLogs || [])],
          };
        });

        showToast(`Đã thêm mới khung giờ "${cleanName}" (${cleanCode}) thành công!`, 'success');
      }

      setShowEditModal(false);
      setEditingSlot(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Slot with direct Supabase sync
  const handleDeleteSlot = async (slot: TimeSlot) => {
    const relatedClasses = (store.classes || []).filter(c => c.time_slot_id === slot.id);
    if (relatedClasses.length > 0) {
      alert(
        `Không thể xóa khung giờ "${slot.name}" (${slot.code || slot.id}) vì hiện có ${relatedClasses.length} lớp học đang sử dụng khung giờ này:\n${relatedClasses
          .map(c => `• ${c.name}`)
          .slice(0, 5)
          .join('\n')}${relatedClasses.length > 5 ? '\n...' : ''}\nVui lòng chuyển đổi khung giờ của các lớp trước khi xóa.`
      );
      return;
    }

    const ok = window.confirm(`Bạn có chắc chắn muốn xóa khung giờ học "${slot.name}" (${slot.code || slot.id}) khỏi hệ thống?`);
    if (!ok) return;

    const client = getSupabaseClient() || supabase;
    if (client) {
      try {
        const { error } = await client.from('time_slots').delete().eq('id', slot.id);
        if (error) {
          console.warn('Lỗi Supabase khi xóa time_slots:', error.message);
        }
      } catch (err) {
        console.warn('Exception Supabase delete time_slots:', err);
      }
    }

    onUpdateStore(prev => {
      const log = createAuditRecord(
        'TIME_SLOT_DELETE',
        'ACADEMIC',
        `Khung giờ: ${slot.name}`,
        `Đã xóa khung giờ học ${slot.code || slot.id} khỏi hệ thống`,
        null,
        { details: { status: 'success', target_id: slot.id } }
      );
      return {
        ...prev,
        timeSlots: (prev.timeSlots || []).filter(s => s.id !== slot.id),
        auditLogs: [log, ...(prev.auditLogs || [])],
      };
    });

    showToast(`Đã xóa khung giờ "${slot.name}" thành công!`, 'success');
  };

  const content = (
    <div className="space-y-4">
      {/* Top Action & Stats Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>Quản Lý Khung Giờ Học (Time Slots)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {store.timeSlots?.length || 0} ca học
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Thiết lập ca học chuẩn, thời lượng, các ngày áp dụng trong tuần &bull; Kết nối trực tiếp Supabase Database
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Khung Giờ Mới</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3.5 rounded-2xl bg-[#111827]/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Tìm mã, tên ca, giờ học..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                statusFilter === 'all' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                statusFilter === 'active' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Đang áp dụng
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                statusFilter === 'inactive' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tạm dừng
            </button>
          </div>

          {/* Day of week filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <select
              value={selectedDayFilter}
              onChange={e => setSelectedDayFilter(e.target.value)}
              className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">Tất cả thứ trong tuần</option>
              {WEEKDAYS_LIST.map(d => (
                <option key={d.code} value={d.code} className="bg-slate-900">{d.label} ({d.code})</option>
              ))}
            </select>
          </div>
        </div>

        {(searchQuery || statusFilter !== 'all' || selectedDayFilter !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setSelectedDayFilter('all');
            }}
            className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Đặt lại bộ lọc</span>
          </button>
        )}
      </div>

      {/* TimeSlotTable */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#111827]/90 shadow-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
              <th className="py-3 px-4">Mã Khung Giờ</th>
              <th className="py-3 px-4">Tên Ca Học &amp; Mô Tả</th>
              <th className="py-3 px-4">Thời Gian</th>
              <th className="py-3 px-4 text-center">Thời Lượng</th>
              <th className="py-3 px-4">Các Ngày Áp Dụng</th>
              <th className="py-3 px-4 text-center">Lớp Đang Dùng</th>
              <th className="py-3 px-4 text-center">Trạng Thái</th>
              <th className="py-3 px-4 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {filteredSlots.map(slot => {
              const relatedClassesCount = (store.classes || []).filter(c => c.time_slot_id === slot.id).length;
              const isActive = (slot.status || 'active') === 'active';

              return (
                <tr key={slot.id} className="hover:bg-slate-850/50 transition-colors">
                  {/* Mã khung giờ */}
                  <td className="py-3 px-4 font-mono font-black text-amber-400">
                    {slot.code || slot.id}
                  </td>

                  {/* Tên ca học */}
                  <td className="py-3 px-4">
                    <div className="font-extrabold text-white text-xs">{slot.name}</div>
                    {slot.notes ? (
                      <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{slot.notes}</div>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic mt-0.5">Ca học tiêu chuẩn Royal School</div>
                    )}
                  </td>

                  {/* Thời gian */}
                  <td className="py-3 px-4 font-medium text-slate-300">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-mono font-bold text-white">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{slot.start_time} - {slot.end_time}</span>
                    </span>
                  </td>

                  {/* Thời lượng */}
                  <td className="py-3 px-4 text-center font-mono">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      {slot.duration_minutes || 90} phút
                    </span>
                  </td>

                  {/* Các ngày áp dụng */}
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {(slot.days_of_week || []).map(day => (
                        <span
                          key={day}
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30"
                        >
                          {day}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Lớp đang dùng */}
                  <td className="py-3 px-4 text-center font-mono font-bold">
                    <span className={relatedClassesCount > 0 ? 'text-amber-400' : 'text-slate-500'}>
                      {relatedClassesCount} lớp
                    </span>
                  </td>

                  {/* Trạng thái */}
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-slate-400'}`}></span>
                      <span>{isActive ? 'Đang áp dụng' : 'Tạm dừng'}</span>
                    </span>
                  </td>

                  {/* Thao tác */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(slot)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all cursor-pointer"
                        title="Sửa khung giờ"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(slot)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                        title="Xóa khung giờ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredSlots.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  <div className="max-w-sm mx-auto space-y-2">
                    <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs font-semibold">Chưa có khung giờ học nào phù hợp với bộ lọc.</p>
                    <button
                      type="button"
                      onClick={handleOpenAdd}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-sm inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm Khung Giờ Đầu Tiên</span>
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* FORM MODAL: THÊM / SỬA KHUNG GIỜ HỌC */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {editingSlot ? 'Chỉnh Sửa Khung Giờ Học' : 'Thêm Khung Giờ Học Mới'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Đồng bộ trực tiếp Supabase Database bảng <span className="font-mono text-amber-400">time_slots</span>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingSlot(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveSlot} className="space-y-3.5 text-xs">
              {/* Row 1: Code & Status */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-400 font-medium mb-1">Mã ca học (Code) *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="VD: CA_CHIEU_90P"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Ví dụ: CA_CHIEU_90P, CA_SANG_T7</span>
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Trạng thái *</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500"
                  >
                    <option value="active">Đang áp dụng</option>
                    <option value="inactive">Tạm dừng</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Name */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">Tên ca học (Name) *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="VD: Ca Chiều Chuẩn 90 Phút (16:30 - 18:00)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Row 3: Start Time & End Time */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div>
                  <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Giờ bắt đầu *</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.start_time}
                    onChange={e => handleStartTimeChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold focus:outline-none focus:border-cyan-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Giờ kết thúc *</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.end_time}
                    onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold focus:outline-none focus:border-amber-500 text-sm"
                  />
                </div>
              </div>

              {/* Row 4: Thời lượng (duration_minutes) Radio Selector */}
              <div>
                <label className="block text-slate-400 font-medium mb-1.5 flex items-center justify-between">
                  <span>Thời lượng ca học (phút):</span>
                  <span className="font-mono text-cyan-400 font-bold">{formData.duration_minutes} phút</span>
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESET_DURATIONS.map(dur => (
                    <button
                      key={dur.value}
                      type="button"
                      onClick={() => handleDurationChange(dur.value)}
                      className={`py-1.5 px-1 rounded-xl text-center font-bold text-xs transition-all cursor-pointer ${
                        formData.duration_minutes === dur.value
                          ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                          : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {dur.value}p
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 5: Các thứ trong tuần (days_of_week) Checkbox */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-400 font-medium">Các ngày áp dụng trong tuần *</label>
                  <div className="flex items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, days_of_week: ['T2', 'T4'] }))}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-400"
                    >
                      T2-T4
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, days_of_week: ['T3', 'T5'] }))}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400"
                    >
                      T3-T5
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, days_of_week: ['T7'] }))}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-purple-400"
                    >
                      Thứ 7
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS_LIST.map(day => {
                    const isSelected = formData.days_of_week.includes(day.code);
                    return (
                      <button
                        type="button"
                        key={day.code}
                        onClick={() => handleToggleDay(day.code)}
                        className={`py-2 px-1 rounded-xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 border-amber-400 text-slate-950 font-black shadow-md'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="text-[10px] leading-none uppercase">{day.code}</span>
                        <span className="text-[9px] mt-0.5 opacity-80">{day.label.replace('Thứ ', 'T')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 6: Ghi chú */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">Ghi chú thêm</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ghi chú đối tượng học sinh, cơ sở hoặc phòng học áp dụng..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingSlot(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Đang lưu...' : editingSlot ? 'Cập Nhật Ca Học' : 'Tạo Khung Giờ Mới'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  if (isModal) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="w-full max-w-5xl rounded-3xl bg-[#0B0F17] border border-slate-800 p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span>Phân Hệ Quản Lý Khung Giờ Học</span>
            </h3>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          {content}
        </div>
      </div>
    );
  }

  return content;
};
