import React from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  Calendar, 
  Building2, 
  Search, 
  Sparkles,
  Layers
} from 'lucide-react';
import { Campus, AcademicTerm } from '../../types';

interface HeaderBannerProps {
  campuses: Campus[];
  terms: AcademicTerm[];
  selectedCampusId: string;
  onCampusChange: (id: string) => void;
  selectedTermId: string;
  onTermChange: (id: string) => void;
  timeFilter: string;
  onTimeFilterChange: (filter: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onExportExcel: () => void;
  onPrintReport: () => void;
  activeSubTab: string;
  onSubTabChange: (tab: string) => void;
  userRole: string;
}

export const HeaderBanner: React.FC<HeaderBannerProps> = ({
  campuses,
  terms,
  selectedCampusId,
  onCampusChange,
  selectedTermId,
  onTermChange,
  timeFilter,
  onTimeFilterChange,
  searchQuery,
  onSearchChange,
  onExportExcel,
  onPrintReport,
  activeSubTab,
  onSubTabChange,
  userRole
}) => {
  const subTabs = [
    { id: 'kpi_overview', label: '1. Tổng Quan KPI' },
    { id: 'students', label: '2. Học Viên & Tuyển Sinh' },
    { id: 'classes', label: '3. Lớp & Môn Học' },
    { id: 'attendance', label: '4. Chuyên Cần & Điểm Danh' },
    { id: 'snacks', label: '5. Bánh Sữa & Suất Ăn' },
    { id: 'credits', label: '6. Bảo Lưu Khóa Học' },
    // Only show Finance if not pure Teacher
    ...(userRole !== 'teacher' ? [{ id: 'finance', label: '7. Tài Chính & Thù Lao' }] : [])
  ];

  return (
    <div className="w-full space-y-4">
      {/* Executive Card Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#111827]/90 via-[#0F172A]/80 to-[#111827]/90 border border-slate-800/80 p-6 lg:p-8 backdrop-blur-xl shadow-2xl">
        
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          
          {/* Left Title and Badge */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-amber-500/30 text-amber-300 text-[11px] font-bold tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              EXECUTIVE BI & ANALYTICS HUB
            </div>
            
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
              Hệ Thống Quản Lý Ngoại Khóa Toàn Diện
            </h1>

            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Trường Song Ngữ Quốc Tế Hoàng Gia (Royal School) &bull; Chuẩn hóa nghiệp vụ chuyên cần, định mức bánh sữa, phiếu bảo lưu học phí & đối soát thù lao giảng dạy.
            </p>
          </div>

          {/* Right Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={onExportExcel}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Toàn Bộ Excel (SheetJS)</span>
            </button>

            <button
              onClick={onPrintReport}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 font-bold text-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              <span>In Báo Cáo (PDF)</span>
            </button>
          </div>
        </div>

        {/* Quick Filter Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Time Filter */}
          <div className="relative">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" /> Khung Thời Gian
            </label>
            <select
              value={timeFilter}
              onChange={(e) => onTimeFilterChange(e.target.value)}
              className="w-full bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="today">Hôm nay (14/10/2026)</option>
              <option value="this_week">Tuần này</option>
              <option value="this_month">Tháng này (10/2026)</option>
              <option value="all_term">Toàn khóa học</option>
            </select>
          </div>

          {/* Academic Term */}
          <div className="relative">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" /> Niên Khóa / Kỳ Học
            </label>
            <select
              value={selectedTermId}
              onChange={(e) => onTermChange(e.target.value)}
              className="w-full bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_active ? '● (Hiện hành)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Campus */}
          <div className="relative">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-400" /> Cơ Sở Trường (Campuses)
            </label>
            <select
              value={selectedCampusId}
              onChange={(e) => onCampusChange(e.target.value)}
              className="w-full bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="all">Tất cả các cơ sở Royal School</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-purple-400" /> Tìm Kiếm Nhanh
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm mã HV, tên bé, tên lớp..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-[#0B0F19] border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            </div>
          </div>

        </div>

      </div>

      {/* Sub-Tabs Navigation (Hàng tab con chuyển đổi nhanh các phân hệ) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 px-1">
        {subTabs.map((sub) => {
          const isActive = activeSubTab === sub.id;
          return (
            <button
              key={sub.id}
              onClick={() => onSubTabChange(sub.id)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all duration-200 whitespace-nowrap border ${
                isActive
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20 ring-1 ring-amber-400/50'
                  : 'bg-[#111827]/70 text-slate-300 border-slate-800/80 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              {sub.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
