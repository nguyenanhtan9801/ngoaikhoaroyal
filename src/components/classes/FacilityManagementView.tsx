import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Lock,
  Unlock,
  Edit,
  Trash2,
  Dumbbell,
  Waves,
  Palette,
  BookOpen,
  MapPin,
  Users,
  RefreshCw,
} from 'lucide-react';
import { AppStore, Facility, UserRole } from '../../types';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { FacilityModal } from '../modals/FacilityModal';

interface FacilityManagementViewProps {
  store: AppStore;
  currentRole?: UserRole;
  selectedCampusId?: string;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

export const FacilityManagementView: React.FC<FacilityManagementViewProps> = ({
  store,
  selectedCampusId = 'all',
  onUpdateStore,
}) => {
  const [facilities, setFacilities] = useState<Facility[]>(store.facilities || []);
  const [filterCampus, setFilterCampus] = useState<'all' | 'camp_pmh' | 'camp_pl'>(() => {
    if (selectedCampusId === 'camp_pmh' || selectedCampusId === 'pmh') return 'camp_pmh';
    if (selectedCampusId === 'camp_pl' || selectedCampusId === 'pl') return 'camp_pl';
    return 'all';
  });
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'locked'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);

  // 1. Tải danh sách phòng học từ Supabase
  const fetchFacilities = async () => {
    const client = getSupabaseClient() || supabase;
    if (!client) return;
    setIsLoading(true);
    try {
      let query = client.from('facilities').select('*').order('created_at', { ascending: false });
      if (filterCampus !== 'all') {
        query = query.eq('campus_id', filterCampus);
      }
      const { data, error } = await query;
      if (!error && data) {
        setFacilities(data as Facility[]);
        // Đồng bộ danh sách tổng vào store để badge số lượng và modal mở lớp luôn chính xác
        const { data: allData } = await client
          .from('facilities')
          .select('*')
          .order('created_at', { ascending: false });
        if (allData) {
          onUpdateStore((prev) => ({
            ...prev,
            facilities: allData as Facility[],
          }));
        }
      }
    } catch (err) {
      console.error('Lỗi tải danh sách phòng học:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFacilities();
  }, [filterCampus]);

  // 2. Thêm mới / Cập nhật phòng
  const handleSaveFacility = async (formData: any) => {
    const client = getSupabaseClient() || supabase;
    if (!client) return;

    const payload = {
      id: formData.id || `fac_${formData.campus_id}_${Date.now().toString().slice(-6)}`,
      code: formData.code.trim().toUpperCase(),
      name: formData.name.trim(),
      campus_id: formData.campus_id,
      room_type: formData.room_type || 'classroom',
      capacity: Number(formData.capacity) || 30,
      floor_building: formData.floor_building || '',
      equipment: formData.equipment || '',
      is_locked: formData.is_locked ?? false,
      note: formData.note || '',
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from('facilities').upsert(payload, { onConflict: 'code' });
    if (error) {
      alert('Lỗi lưu phòng học: ' + error.message);
      return;
    }
    alert('Đã lưu phòng học thành công vào CSDL!');
    await fetchFacilities();
    setIsModalOpen(false);
    setEditingFacility(null);
  };

  // 3. Khóa / Mở phòng học
  const handleToggleLockFacility = async (facility: Facility) => {
    const client = getSupabaseClient() || supabase;
    if (!client) return;

    const newStatus = !facility.is_locked;
    const actionText = newStatus ? 'KHÓA (BẢO TRÌ)' : 'MỞ HOẠT ĐỘNG';
    if (!window.confirm(`Xác nhận ${actionText} phòng học ${facility.name}?`)) return;

    const { error } = await client
      .from('facilities')
      .update({ is_locked: newStatus, updated_at: new Date().toISOString() })
      .eq('id', facility.id);

    if (error) {
      alert('Lỗi cập nhật trạng thái: ' + error.message);
    } else {
      fetchFacilities();
    }
  };

  // 4. Xóa phòng học
  const handleDeleteFacility = async (facilityId: string, facilityName: string) => {
    const classesUsingFacility = (store.classes || []).filter((c) => c.facility_id === facilityId);
    if (classesUsingFacility.length > 0) {
      alert(
        `Không thể xóa phòng "${facilityName}" vì đang có ${classesUsingFacility.length} lớp học ngoại khóa sử dụng phòng này!`
      );
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa phòng học "${facilityName}" vĩnh viễn?`)) return;

    const client = getSupabaseClient() || supabase;
    if (!client) return;

    const { error } = await client.from('facilities').delete().eq('id', facilityId);
    if (error) {
      alert('Không thể xóa phòng học: ' + error.message);
    } else {
      alert('Đã xóa phòng học thành công!');
      fetchFacilities();
    }
  };

  // Bộ lọc kết hợp Trạng thái + Tìm kiếm
  const filteredFacilities = useMemo(() => {
    return facilities.filter((f) => {
      if (filterCampus !== 'all' && f.campus_id !== filterCampus) return false;
      if (filterStatus === 'open' && Boolean(f.is_locked)) return false;
      if (filterStatus === 'locked' && !f.is_locked) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const codeMatch = (f.code || '').toLowerCase().includes(q);
        const nameMatch = (f.name || '').toLowerCase().includes(q);
        const floorMatch = (f.floor_building || '').toLowerCase().includes(q);
        if (!codeMatch && !nameMatch && !floorMatch) return false;
      }

      return true;
    });
  }, [facilities, filterCampus, filterStatus, searchQuery]);

  const getRoomTypeMeta = (roomType?: string) => {
    switch (roomType) {
      case 'sports_hall':
        return {
          label: 'Nhà thi đấu thể thao',
          icon: Dumbbell,
          color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        };
      case 'pool':
        return {
          label: 'Hồ bơi 4 mùa',
          icon: Waves,
          color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
        };
      case 'art_music':
        return {
          label: 'Phòng vẽ / âm nhạc',
          icon: Palette,
          color: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
        };
      default:
        return {
          label: 'Phòng học tiêu chuẩn',
          icon: BookOpen,
          color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
        };
    }
  };

  return (
    <div className="space-y-5">
      {/* Thanh Công Cụ (Filter Bar) */}
      <div className="p-4 rounded-3xl bg-[#111827]/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Bộ lọc Cơ sở: 3 nút/tab */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-amber-400" />
              <span>Cơ sở:</span>
            </span>

            <button
              type="button"
              onClick={() => setFilterCampus('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterCampus === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Tất cả cơ sở
            </button>

            <button
              type="button"
              onClick={() => setFilterCampus('camp_pmh')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterCampus === 'camp_pl'
                  ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                  : 'bg-slate-900 text-purple-300 hover:text-white border border-purple-500/30'
              }`}
            >
              Phú Lâm
            </button>
          </div>

          {/* Nút Action: + Thêm Phòng Học Mới */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchFacilities}
              disabled={isLoading}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Tải lại từ Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingFacility(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm Phòng Học Mới</span>
            </button>
          </div>
        </div>

        {/* Hàng 2: Bộ lọc Trạng thái & Ô tìm kiếm */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
          {/* Bộ lọc Trạng thái */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 mr-1">Trạng thái:</span>
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                filterStatus === 'all'
                  ? 'bg-slate-200 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Tất cả ({facilities.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('open')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                filterStatus === 'open'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-emerald-400 hover:text-white border border-emerald-500/20'
              }`}
            >
              🟢 Đang mở sử dụng ({facilities.filter((f) => !f.is_locked).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('locked')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                filterStatus === 'locked'
                  ? 'bg-rose-500 text-white font-bold'
                  : 'bg-slate-900 text-rose-400 hover:text-white border border-rose-500/20'
              }`}
            >
              🔒 Đã khóa (Bảo trì) ({facilities.filter((f) => f.is_locked).length})
            </button>
          </div>

          {/* Tìm kiếm */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã phòng, tên phòng học, tòa nhà..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Bảng Danh Sách Phòng Học */}
      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-[#111827]/90 shadow-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-3.5 px-4">Mã Phòng</th>
              <th className="py-3.5 px-4">Tên Phòng &amp; Vị Trí</th>
              <th className="py-3.5 px-4 text-center">Cơ Sở</th>
              <th className="py-3.5 px-4">Loại Hình &amp; Sức Chứa</th>
              <th className="py-3.5 px-4 text-center">Trạng Thái</th>
              <th className="py-3.5 px-4 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-slate-200">
            {filteredFacilities.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
                  Không tìm thấy phòng học / sân bãi nào phù hợp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              filteredFacilities.map((facility) => {
                const roomMeta = getRoomTypeMeta(facility.room_type);
                const RoomIcon = roomMeta.icon;
                const isPMH = facility.campus_id === 'camp_pmh';
                const isLocked = Boolean(facility.is_locked);

                return (
                  <tr
                    key={facility.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    {/* Mã Phòng */}
                    <td className="py-3.5 px-4 font-mono font-extrabold text-amber-400">
                      {facility.code || facility.id}
                    </td>

                    {/* Tên Phòng & Vị Trí */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{facility.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                        <span>{facility.floor_building || 'Chưa cập nhật vị trí / tòa nhà'}</span>
                      </div>
                      {facility.equipment && (
                        <div className="text-[11px] text-cyan-400/80 mt-0.5">
                          Thiết bị: {facility.equipment}
                        </div>
                      )}
                    </td>

                    {/* Cơ Sở */}
                    <td className="py-3.5 px-4 text-center">
                      {isPMH ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          Phú Mỹ Hưng
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          Phú Lâm
                        </span>
                      )}
                    </td>

                    {/* Loại Hình & Sức Chứa */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold ${roomMeta.color}`}
                        >
                          <RoomIcon className="w-3.5 h-3.5" />
                          <span>{roomMeta.label}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 text-slate-200 font-mono text-xs font-bold">
                          <Users className="w-3 h-3 text-slate-400" />
                          {facility.capacity || 30} HS
                        </span>
                      </div>
                    </td>

                    {/* Trạng Thái (Khóa/Mở) */}
                    <td className="py-3.5 px-4 text-center">
                      {!isLocked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          🟢 Đang Hoạt Động
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          🔒 Đã Khóa (Bảo trì)
                        </span>
                      )}
                    </td>

                    {/* Cột Thao Tác (Actions) */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Nút Khóa / Mở Khóa */}
                        <button
                          type="button"
                          onClick={() => handleToggleLockFacility(facility)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            isLocked
                              ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border-amber-500/30'
                          }`}
                          title={isLocked ? 'Mở khóa phòng học' : 'Khóa phòng học (Bảo trì)'}
                        >
                          {isLocked ? (
                            <Unlock className="w-3.5 h-3.5" />
                          ) : (
                            <Lock className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Nút Chỉnh Sửa */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFacility(facility);
                            setIsModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
                          title="Chỉnh sửa thông tin phòng"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Nút Xóa */}
                        <button
                          type="button"
                          onClick={() => handleDeleteFacility(facility.id, facility.name)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                          title="Xóa phòng học"
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

      {/* Modal Thêm / Chỉnh Sửa Phòng Học */}
      <FacilityModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingFacility(null);
        }}
        editingFacility={editingFacility}
        defaultCampusId={filterCampus !== 'all' ? filterCampus : 'camp_pmh'}
        onSave={handleSaveFacility}
      />
    </div>
  );
};
