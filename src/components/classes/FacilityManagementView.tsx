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
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Users, 
  Info,
  Layers,
  Sparkles,
  MapPin
} from 'lucide-react';
import { Facility, AppStore, UserRole } from '../../types';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { FacilityModal } from '../modals/FacilityModal';
import { showToast } from '../../lib/toast';

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
  const [facilities, setFacilities] = useState<Facility[]>(() => store.facilities || []);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filterCampus, setFilterCampus] = useState<string>(
    selectedCampusId !== 'all' ? selectedCampusId : 'all'
  );
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'locked'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);

  // Sync when global campus filter changes
  useEffect(() => {
    if (selectedCampusId !== undefined && selectedCampusId !== 'all') {
      setFilterCampus(selectedCampusId);
    }
  }, [selectedCampusId]);

  // 1. Tải danh sách phòng học từ Supabase
  const fetchFacilities = async () => {
    const client = getSupabaseClient() || supabase;
    if (!client) return;

    try {
      setIsLoading(true);
      let query = client.from('facilities').select('*').order('created_at', { ascending: false });
      if (filterCampus !== 'all') {
        query = query.eq('campus_id', filterCampus);
      }
      
      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped: Facility[] = data.map((r: any) => ({
          id: r.id,
          code: r.code || r.id,
          name: r.name,
          campus_id: r.campus_id,
          room_type: r.room_type || r.type || 'classroom',
          type: r.room_type || r.type || 'classroom',
          capacity: Number(r.capacity) || 30,
          floor_building: r.floor_building || '',
          equipment: r.equipment || '',
          is_locked: Boolean(r.is_locked),
          is_active: !Boolean(r.is_locked),
          note: r.note || '',
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));

        setFacilities(mapped);
        onUpdateStore(prev => {
          // Merge with prev.facilities
          const map = new Map<string, Facility>();
          prev.facilities.forEach(f => map.set(f.id, f));
          mapped.forEach(f => map.set(f.id, f));
          return {
            ...prev,
            facilities: Array.from(map.values()),
          };
        });
      } else {
        // Fallback to local store facilities if table is not yet populated
        if (filterCampus === 'all') {
          setFacilities(store.facilities);
        } else {
          setFacilities(store.facilities.filter(f => f.campus_id === filterCampus));
        }
      }
    } catch (err) {
      console.warn('Lỗi tải facilities từ Supabase:', err);
      // Fallback
      if (filterCampus === 'all') {
        setFacilities(store.facilities);
      } else {
        setFacilities(store.facilities.filter(f => f.campus_id === filterCampus));
      }
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
    const cleanCampusId = formData.campus_id;
    const facId = formData.id || `fac_${cleanCampusId}_${Date.now().toString().slice(-6)}`;
    const facCode = formData.code.trim().toUpperCase();

    const payload = {
      id: facId,
      code: facCode,
      name: formData.name.trim(),
      campus_id: cleanCampusId,
      room_type: formData.room_type || 'classroom',
      capacity: Number(formData.capacity) || 30,
      floor_building: formData.floor_building || '',
      equipment: formData.equipment || '',
      is_locked: formData.is_locked ?? false,
      note: formData.note || '',
      updated_at: new Date().toISOString(),
    };

    const newFacilityObj: Facility = {
      ...payload,
      type: payload.room_type as any,
      is_active: !payload.is_locked,
    };

    let savedToSupabase = false;
    if (client) {
      try {
        const { error } = await client.from('facilities').upsert(payload, { onConflict: 'code' });
        if (error) {
          console.warn('Supabase upsert facilities warning:', error.message);
        } else {
          savedToSupabase = true;
        }
      } catch (err) {
        console.warn('Lỗi kết nối Supabase facilities:', err);
      }
    }

    // Always update local reactive store
    onUpdateStore(prev => {
      const exists = prev.facilities.some(f => f.id === newFacilityObj.id || f.code === newFacilityObj.code);
      const updated = exists
        ? prev.facilities.map(f => (f.id === newFacilityObj.id || f.code === newFacilityObj.code ? newFacilityObj : f))
        : [newFacilityObj, ...prev.facilities];
      return {
        ...prev,
        facilities: updated,
      };
    });

    setFacilities(prev => {
      const exists = prev.some(f => f.id === newFacilityObj.id || f.code === newFacilityObj.code);
      return exists
        ? prev.map(f => (f.id === newFacilityObj.id || f.code === newFacilityObj.code ? newFacilityObj : f))
        : [newFacilityObj, ...prev];
    });

    showToast(
      savedToSupabase
        ? `Đã lưu phòng học "${newFacilityObj.name}" thành công vào CSDL Supabase!`
        : `Đã lưu phòng học "${newFacilityObj.name}" thành công!`,
      'success'
    );

    setIsModalOpen(false);
    setEditingFacility(null);
  };

  // 3. Khóa / Mở phòng học
  const handleToggleLockFacility = async (facility: Facility) => {
    const client = getSupabaseClient() || supabase;
    const newStatus = !facility.is_locked;
    const actionText = newStatus ? 'KHÓA (BẢO TRÌ)' : 'MỞ HOẠT ĐỘNG';

    if (!window.confirm(`Xác nhận ${actionText} phòng học "${facility.name}"?`)) return;

    if (client) {
      try {
        const { error } = await client
          .from('facilities')
          .update({ is_locked: newStatus, updated_at: new Date().toISOString() })
          .eq('id', facility.id);
        if (error) {
          console.warn('Lỗi cập nhật trạng thái trên Supabase:', error.message);
        }
      } catch (err) {
        console.warn('Lỗi kết nối Supabase:', err);
      }
    }

    // Update local store
    onUpdateStore(prev => ({
      ...prev,
      facilities: prev.facilities.map(f =>
        f.id === facility.id ? { ...f, is_locked: newStatus, is_active: !newStatus } : f
      ),
    }));

    setFacilities(prev =>
      prev.map(f => (f.id === facility.id ? { ...f, is_locked: newStatus, is_active: !newStatus } : f))
    );

    showToast(
      newStatus
        ? `Đã KHÓA phòng "${facility.name}" để bảo trì. Không thể chọn phòng này khi xếp lớp mới.`
        : `Đã MỞ phòng "${facility.name}" sẵn sàng tiếp nhận lớp học!`,
      newStatus ? 'info' : 'success'
    );
  };

  // 4. Xóa phòng học
  const handleDeleteFacility = async (facility: Facility) => {
    // Kiểm tra ràng buộc xem có lớp nào đang sử dụng phòng này không
    const assignedClasses = store.classes.filter(
      c => c.facility_id === facility.id || c.facility_id === facility.code || c.facility_id === facility.name
    );

    if (assignedClasses.length > 0) {
      alert(
        `Không thể xóa phòng học "${facility.name}" vì đang có ${assignedClasses.length} lớp học ngoại khóa được xếp tại đây:\n` +
        assignedClasses.map(c => `• ${c.name}`).slice(0, 5).join('\n') +
        (assignedClasses.length > 5 ? `\n... và ${assignedClasses.length - 5} lớp khác.` : '') +
        `\nVui lòng đổi phòng cho các lớp trước khi xóa.`
      );
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa phòng học "${facility.name}" (${facility.code || facility.id}) vĩnh viễn?`)) {
      return;
    }

    const client = getSupabaseClient() || supabase;
    if (client) {
      try {
        const { error } = await client.from('facilities').delete().eq('id', facility.id);
        if (error) {
          console.warn('Lỗi xóa Supabase:', error.message);
        }
      } catch (err) {
        console.warn('Lỗi kết nối Supabase:', err);
      }
    }

    onUpdateStore(prev => ({
      ...prev,
      facilities: prev.facilities.filter(f => f.id !== facility.id),
    }));

    setFacilities(prev => prev.filter(f => f.id !== facility.id));
    showToast(`Đã xóa phòng học "${facility.name}" thành công!`, 'success');
  };

  // Filter & Search Facilities
  const filteredFacilities = useMemo(() => {
    return facilities.filter(f => {
      // 1. Campus filter
      const matchCampus = filterCampus === 'all' || f.campus_id === filterCampus;

      // 2. Status filter
      const isLocked = Boolean(f.is_locked);
      const matchStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && !isLocked) ||
        (filterStatus === 'locked' && isLocked);

      // 3. Search query
      const query = searchTerm.trim().toLowerCase();
      const matchSearch =
        !query ||
        (f.code || '').toLowerCase().includes(query) ||
        (f.name || '').toLowerCase().includes(query) ||
        (f.floor_building || '').toLowerCase().includes(query) ||
        (f.equipment || '').toLowerCase().includes(query);

      return matchCampus && matchStatus && matchSearch;
    });
  }, [facilities, filterCampus, filterStatus, searchTerm]);

  // Summary counts
  const totalCount = facilities.length;
  const activeCount = facilities.filter(f => !f.is_locked).length;
  const lockedCount = facilities.filter(f => f.is_locked).length;
  const totalCapacity = facilities.reduce((sum, f) => sum + (f.capacity || 0), 0);

  const getRoomTypeInfo = (type?: string) => {
    switch (type) {
      case 'sports_hall':
        return {
          icon: <Dumbbell className="w-4 h-4 text-amber-400" />,
          label: 'Nhà thi đấu thể thao',
          color: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
        };
      case 'pool':
        return {
          icon: <Waves className="w-4 h-4 text-cyan-400" />,
          label: 'Hồ bơi 4 mùa',
          color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
        };
      case 'art_music':
        return {
          icon: <Palette className="w-4 h-4 text-purple-400" />,
          label: 'Mỹ thuật / Âm nhạc',
          color: 'text-purple-400 bg-purple-500/10 border-purple-500/20'
        };
      default:
        return {
          icon: <BookOpen className="w-4 h-4 text-blue-400" />,
          label: 'Phòng học tiêu chuẩn',
          color: 'text-blue-400 bg-blue-500/10 border-blue-500/20'
        };
    }
  };

  const getCampusBadge = (campusId: string) => {
    if (campusId === 'camp_pmh' || campusId === 'pmh') {
      return (
        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          Phú Mỹ Hưng (PMH)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
        Phú Lâm (PL)
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Quick Statistics KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Tổng Số Phòng / Sân</span>
            <Building2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{totalCount}</div>
          <span className="text-[11px] text-slate-400">Trên cả 2 cơ sở</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Đang Hoạt Động</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{activeCount}</div>
          <span className="text-[11px] text-emerald-300">Sẵn sàng xếp lớp</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Đã Khóa Bảo Trì</span>
            <Lock className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">{lockedCount}</div>
          <span className="text-[11px] text-rose-300">Tạm dừng tiếp nhận</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Tổng Sức Chứa</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-400 font-mono">{totalCapacity}</div>
          <span className="text-[11px] text-slate-400">Học sinh tối đa</span>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Bộ lọc Cơ sở (3 tab) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400 mr-1.5 hidden sm:inline">Cơ sở:</span>
            <button
              type="button"
              onClick={() => setFilterCampus('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterCampus === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Tất cả cơ sở ({facilities.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterCampus('camp_pmh')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterCampus === 'camp_pmh'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Phú Mỹ Hưng (PMH)
            </button>
            <button
              type="button"
              onClick={() => setFilterCampus('camp_pl')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterCampus === 'camp_pl'
                  ? 'bg-purple-500 text-slate-950 shadow-md shadow-purple-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Phú Lâm (PL)
            </button>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-2.5 self-end lg:self-auto">
            <button
              type="button"
              onClick={fetchFacilities}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Làm mới từ CSDL Supabase"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingFacility(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-slate-950" />
              <span>+ Thêm Phòng Học Mới</span>
            </button>
          </div>
        </div>

        {/* Hàng 2: Bộ lọc Trạng thái & Ô Tìm kiếm */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-800/80">
          {/* Trạng thái */}
          <div className="sm:col-span-5 flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400 mr-1 shrink-0">Trạng thái:</span>
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === 'all'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('active')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === 'active'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Đang mở sử dụng
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('locked')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === 'locked'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Đã khóa (Bảo trì)
            </button>
          </div>

          {/* Ô Tìm kiếm */}
          <div className="sm:col-span-7 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã phòng, tên phòng học, tòa nhà/vị trí, trang thiết bị..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* BẢNG DANH SÁCH PHÒNG HỌC */}
      <div className="rounded-3xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 uppercase text-[11px] font-bold tracking-wider">
                <th className="py-3.5 px-4">Mã Phòng</th>
                <th className="py-3.5 px-4">Tên Phòng & Vị Trí</th>
                <th className="py-3.5 px-4">Cơ Sở</th>
                <th className="py-3.5 px-4">Loại Hình & Sức Chứa</th>
                <th className="py-3.5 px-4">Trang Thiết Bị / Ghi Chú</th>
                <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                <th className="py-3.5 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredFacilities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Building2 className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-slate-400">Không tìm thấy phòng học hoặc sân bãi nào</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Thử thay đổi bộ lọc cơ sở hoặc bấm nút "+ Thêm Phòng Học Mới" để tạo phòng.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredFacilities.map((fac) => {
                  const roomInfo = getRoomTypeInfo(fac.room_type || fac.type);
                  const isLocked = Boolean(fac.is_locked);

                  // Count active classes currently assigned to this room
                  const assignedClassesCount = store.classes.filter(
                    c => c.facility_id === fac.id || c.facility_id === fac.code || c.facility_id === fac.name
                  ).length;

                  return (
                    <tr 
                      key={fac.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Mã Phòng */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono font-black text-amber-300 text-xs px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20">
                          {fac.code || fac.id}
                        </span>
                      </td>

                      {/* Tên Phòng & Vị Trí */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-xs group-hover:text-amber-300 transition-colors">
                          {fac.name}
                        </div>
                        {fac.floor_building ? (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>{fac.floor_building}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Chưa cấu hình vị trí tòa nhà</span>
                        )}
                      </td>

                      {/* Cơ Sở */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getCampusBadge(fac.campus_id)}
                      </td>

                      {/* Loại Hình & Sức Chứa */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md border flex items-center gap-1 text-[11px] font-medium ${roomInfo.color}`}>
                            {roomInfo.icon}
                            <span>{roomInfo.label}</span>
                          </span>
                          <span className="text-slate-300 font-mono text-xs font-semibold">
                            {fac.capacity || 30} HS
                          </span>
                        </div>
                      </td>

                      {/* Trang thiết bị / Ghi chú */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {fac.equipment ? (
                          <div className="text-slate-300 text-[11px] truncate" title={fac.equipment}>
                            {fac.equipment}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[10px] italic">Tiêu chuẩn Royal</span>
                        )}
                        {fac.note && (
                          <div className="text-[10px] text-slate-500 truncate mt-0.5" title={fac.note}>
                            Lưu ý: {fac.note}
                          </div>
                        )}
                        {assignedClassesCount > 0 && (
                          <div className="mt-1 text-[10px] text-cyan-400 font-semibold">
                            ★ Đang phục vụ {assignedClassesCount} lớp ngoại khóa
                          </div>
                        )}
                      </td>

                      {/* Trạng Thái */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                            <Lock className="w-3 h-3" />
                            <span>🔒 Đã Khóa (Bảo trì)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>🟢 Đang Hoạt Động</span>
                          </span>
                        )}
                      </td>

                      {/* Thao Tác (Actions) */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Nút Khóa / Mở Khóa */}
                          <button
                            type="button"
                            onClick={() => handleToggleLockFacility(fac)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isLocked
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                            }`}
                            title={isLocked ? 'Mở khóa phòng cho phép xếp lớp' : 'Khóa phòng để bảo trì/sửa chữa'}
                          >
                            {isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>

                          {/* Nút Chỉnh Sửa */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFacility(fac);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors"
                            title="Chỉnh sửa thông tin phòng học"
                          >
                            <Edit className="w-3.5 h-3.5 text-amber-400" />
                          </button>

                          {/* Nút Xóa */}
                          <button
                            type="button"
                            onClick={() => handleDeleteFacility(fac)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/40 transition-colors"
                            title="Xóa phòng học vĩnh viễn"
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

        {/* Footer info bar */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              Hiển thị {filteredFacilities.length} / {facilities.length} phòng học &amp; sân bãi.
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Dữ liệu phòng học được liên kết tự động với module Thời khóa biểu và Sổ điểm danh.
          </div>
        </div>
      </div>

      {/* Facility Modal */}
      <FacilityModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingFacility(null);
        }}
        facility={editingFacility}
        onSave={handleSaveFacility}
        campuses={store.campuses}
        defaultCampusId={filterCampus !== 'all' ? filterCampus : 'camp_pmh'}
      />
    </div>
  );
};
