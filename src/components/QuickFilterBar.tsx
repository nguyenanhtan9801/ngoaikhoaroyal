import React from 'react';
import { Search, Calendar, Building2, Clock, X } from 'lucide-react';
import { Campus, AcademicTerm } from '../types';

interface QuickFilterBarProps {
  campuses: Campus[];
  terms: AcademicTerm[];
  selectedCampusId: string;
  onSelectCampus: (id: string) => void;
  selectedTermId: string;
  onSelectTerm: (id: string) => void;
  timeRange: string;
  onChangeTimeRange: (range: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const QuickFilterBar: React.FC<QuickFilterBarProps> = ({
  campuses,
  terms,
  selectedCampusId,
  onSelectCampus,
  selectedTermId,
  onSelectTerm,
  timeRange,
  onChangeTimeRange,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="rounded-2xl bg-[#111827]/80 border border-slate-800/80 p-2 backdrop-blur-md shadow-md">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        
        {/* Khung Thời Gian */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
              Khung Thời Gian
            </label>
            <select
              value={timeRange}
              onChange={(e) => onChangeTimeRange(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer mt-0.5"
            >
              <option value="all" className="bg-[#111827] text-white">Toàn khóa học</option>
              <option value="today" className="bg-[#111827] text-white">Hôm nay (Buổi thực tế)</option>
              <option value="week" className="bg-[#111827] text-white">Tuần này</option>
              <option value="month" className="bg-[#111827] text-white">Tháng này</option>
            </select>
          </div>
        </div>

        {/* Niên Khóa / Kỳ Học */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
              Niên Khóa / Kỳ Học
            </label>
            <select
              value={selectedTermId}
              onChange={(e) => onSelectTerm(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer mt-0.5"
            >
              {terms.map(t => (
                <option key={t.id} value={t.id} className="bg-[#111827] text-white">
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cơ Sở Trường */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
              Cơ Sở Trường
            </label>
            <select
              value={selectedCampusId}
              onChange={(e) => onSelectCampus(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer mt-0.5"
            >
              <option value="all" className="bg-[#111827] text-white">Tất cả các cơ sở (Toàn trường)</option>
              {campuses.map(c => (
                <option key={c.id} value={c.id} className="bg-[#111827] text-white">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Ô Tìm Kiếm Nhanh */}
        <div className="relative flex items-center px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 focus-within:border-amber-500/50 transition-colors">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm học sinh, lớp, mã HV, SĐT..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="text-slate-500 hover:text-slate-300 ml-1"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
