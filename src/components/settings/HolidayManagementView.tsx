import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarOff,
  Plus,
  Search,
  Edit,
  Trash2,
  Building2,
  Calendar,
  Repeat,
  RefreshCw,
} from 'lucide-react';
import { AppStore, Holiday } from '../../types';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { HolidayModal, calculateHolidayDaysCount } from '../modals/HolidayModal';

interface HolidayManagementViewProps {
  store: AppStore;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

function formatDateDisplayVN(dateStr?: string): string {
  if (!dateStr) return '--/--/----';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export const HolidayManagementView: React.FC<HolidayManagementViewProps> = ({
  store,
  onUpdateStore,
}) => {
  const [holidays, setHolidays] = useState<Holiday[]>(store.holidays || []);
  const [filterCampus, setFilterCampus] = useState<'all' | 'all_campuses' | 'camp_pmh' | 'camp_pl'>('all');
  const [filterAcademicYear, setFilterAcademicYear] = useState<string>('2026-2027');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);

  // 1. Nạp danh sách ngày nghỉ từ Supabase
  const fetchHolidays = async () => {
    const client = getSupabaseClient() || supabase;
    if (!client) return;
    setIsLoading(true);
    try {
      let query = client.from('holidays').select('*').order('start_date', { ascending: true });
      if (filterCampus && filterCampus !== 'all') {
        if (filterCampus === 'all_campuses') {
          query = query.is('campus_id', null);
        } else {
          query = query.or(`campus_id.eq.${filterCampus},campus_id.is.null`);
        }
      }
      const { data, error } = await query;
      if (!error && data) {
        setHolidays(data as Holiday[]);
      }

      // Đồng bộ toàn bộ ngày nghỉ vào store.holidays để dùng cho tính toán buổi học
      const { data: allHolidays } = await client
        .from('holidays')
        .select('*')
        .order('start_date', { ascending: true });
      if (allHolidays) {
        onUpdateStore((prev) => ({
          ...prev,
          holidays: allHolidays as Holiday[],
        }));
      }
    } catch (err) {
      console.error('Lỗi tải danh sách ngày nghỉ lễ:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, [filterCampus]);

  // 2. Thêm mới / Cập nhật ngày nghỉ lễ
  const handleSaveHoliday = async (formData: any) => {
    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      alert('Ngày kết thúc nghỉ không được nhỏ hơn ngày bắt đầu!');
      return;
    }

    const client = getSupabaseClient() || supabase;
    if (!client) return;

    const payload = {
      id: formData.id || `hol_${Date.now()}`,
      title: formData.title.trim(),
      start_date: formData.start_date,
      end_date: formData.end_date,
      campus_id: formData.campus_id || null,
      academic_year: formData.academic_year || '2026-2027',
      is_recurring: Boolean(formData.is_recurring),
      description: formData.description || '',
      status: formData.status || 'active',
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from('holidays').upsert(payload, { onConflict: 'id' });
    if (error) {
      alert('Lỗi lưu ngày nghỉ lễ: ' + error.message);
      return;
    }

    alert('Đã lưu ngày nghỉ lễ thành công vào CSDL!');
    setIsModalOpen(false);
    setEditingHoliday(null);
    fetchHolidays();
  };

  // 3. Xóa ngày nghỉ lễ
  const handleDeleteHoliday = async (holidayId: string, title: string) => {
    if (!window.confirm(`Xác nhận xóa ngày nghỉ lễ "${title}"?`)) return;

    const client = getSupabaseClient() || supabase;
    if (!client) return;

    const { error } = await client.from('holidays').delete().eq('id', holidayId);
    if (error) {
      alert('Không thể xóa: ' + error.message);
    } else {
      alert('Đã xóa ngày nghỉ lễ!');
      fetchHolidays();
    }
  };

  // Lọc theo năm học & từ khóa tìm kiếm
  const filteredHolidays = useMemo(() => {
    return holidays.filter((h) => {
      if (filterAcademicYear !== 'all' && (h.academic_year || '2026-2027') !== filterAcademicYear) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const titleMatch = (h.title || '').toLowerCase().includes(q);
        const descMatch = (h.description || '').toLowerCase().includes(q);
        if (!titleMatch && !descMatch) return false;
      }

      return true;
    });
  }, [holidays, filterAcademicYear, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="p-5 rounded-3xl bg-[#111827]/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <CalendarOff className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                Quản Lý Danh Sách Ngày Nghỉ Lễ (Holidays Management)
              </h2>
              <p className="text-xs text-slate-400">
                Thiết lập lịch nghỉ lễ toàn trường hoặc theo từng cơ sở. Hệ thống tự động loại trừ các ngày nghỉ đang áp dụng khi tính số buổi thực học.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchHolidays}
              disabled={isLoading}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Làm mới dữ liệu từ Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingHoliday(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm Ngày Nghỉ Lễ</span>
            </button>
          </div>
        </div>

        {/* Thanh Công Cụ (Header Actions): Bộ lọc Cơ sở, Năm học, Tìm kiếm */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Bộ lọc Cơ sở */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1 mr-1">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Phạm vi:</span>
            </span>

            <button
              type="button"
              onClick={() => setFilterCampus('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterCampus === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Tất cả
            </button>

            <button
              type="button"
              onClick={() => setFilterCampus('all_campuses')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterCampus === 'all_campuses'
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                  : 'bg-slate-900 text-amber-300 hover:text-white border border-amber-500/30'
              }`}
            >
              Toàn trường
            </button>

            <button
              type="button"
              onClick={() => setFilterCampus('camp_pmh')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterCampus === 'camp_pmh'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900 text-emerald-400 hover:text-white border border-emerald-500/30'
              }`}
            >
              Phú Mỹ Hưng
            </button>

            <button
              type="button"
              onClick={() => setFilterCampus('camp_pl')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterCampus === 'camp_pl'
                  ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                  : 'bg-slate-900 text-purple-300 hover:text-white border border-purple-500/30'
              }`}
            >
              Phú Lâm
            </button>
          </div>

          {/* Bộ lọc Năm học & Ô Tìm kiếm */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">Năm học:</span>
              <select
                value={filterAcademicYear}
                onChange={(e) => setFilterAcademicYear(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono font-bold focus:outline-none focus:border-amber-500"
              >
                <option value="all">Tất cả năm học</option>
                <option value="2025-2026">2025-2026</option>
                <option value="2026-2027">2026-2027</option>
                <option value="2027-2028">2027-2028</option>
              </select>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tên kỳ nghỉ hoặc ghi chú..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bảng Dữ Liệu (Holidays Table) */}
      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-[#111827]/90 shadow-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-3.5 px-4">Tên Kỳ Nghỉ Lễ</th>
              <th className="py-3.5 px-4">Thời Gian Nghỉ</th>
              <th className="py-3.5 px-4 text-center">Số Ngày Nghỉ</th>
              <th className="py-3.5 px-4 text-center">Phạm Vi Áp Dụng</th>
              <th className="py-3.5 px-4 text-center">Lặp Lại Hàng Năm</th>
              <th className="py-3.5 px-4 text-center">Trạng Thái</th>
              <th className="py-3.5 px-4 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-slate-200">
            {filteredHolidays.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-400">
                  Chưa có ngày nghỉ lễ nào phù hợp với bộ lọc hiện tại. Nhấn &ldquo;+ Thêm Ngày Nghỉ Lễ&rdquo; để khởi tạo.
                </td>
              </tr>
            ) : (
              filteredHolidays.map((holiday) => {
                const daysCount = calculateHolidayDaysCount(holiday.start_date, holiday.end_date);
                const isActive = holiday.status !== 'inactive';

                return (
                  <tr key={holiday.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Tên Kỳ Nghỉ Lễ */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        <span>{holiday.title}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          {holiday.academic_year || '2026-2027'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {holiday.description || 'Không có ghi chú'}
                      </div>
                    </td>

                    {/* Thời Gian Nghỉ */}
                    <td className="py-3.5 px-4 font-mono text-xs text-cyan-300 font-semibold whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                        <span>
                          [{formatDateDisplayVN(holiday.start_date)}] &rarr; [{formatDateDisplayVN(holiday.end_date)}]
                        </span>
                      </span>
                    </td>

                    {/* Số Ngày Nghỉ */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono font-bold text-xs">
                        {daysCount} ngày
                      </span>
                    </td>

                    {/* Phạm Vi Áp Dụng */}
                    <td className="py-3.5 px-4 text-center">
                      {!holiday.campus_id ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Toàn trường
                        </span>
                      ) : holiday.campus_id === 'camp_pmh' ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          Phú Mỹ Hưng
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          Phú Lâm
                        </span>
                      )}
                    </td>

                    {/* Lặp Lại Hàng Năm */}
                    <td className="py-3.5 px-4 text-center">
                      {holiday.is_recurring ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <Repeat className="w-3 h-3" />
                          <span>Có</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          Không
                        </span>
                      )}
                    </td>

                    {/* Trạng Thái */}
                    <td className="py-3.5 px-4 text-center">
                      {isActive ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          Đang áp dụng
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          Tạm ngưng
                        </span>
                      )}
                    </td>

                    {/* Thao Tác */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingHoliday(holiday);
                            setIsModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
                          title="Chỉnh sửa ngày nghỉ lễ"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHoliday(holiday.id, holiday.title)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                          title="Xóa ngày nghỉ lễ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Thêm / Chỉnh Sửa Ngày Nghỉ Lễ */}
      <HolidayModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingHoliday(null);
        }}
        editingHoliday={editingHoliday}
        defaultAcademicYear={filterAcademicYear}
        onSave={handleSaveHoliday}
      />
    </div>
  );
};
