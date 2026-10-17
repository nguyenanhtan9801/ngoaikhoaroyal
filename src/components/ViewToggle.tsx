import React from 'react';
import { Table, LayoutGrid } from 'lucide-react';

export type ViewMode = 'table' | 'cards';

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({
  viewMode,
  onViewModeChange,
  className = '',
}) => {
  return (
    <div className={`inline-flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs ${className}`}>
      <button
        type="button"
        onClick={() => onViewModeChange('table')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all ${
          viewMode === 'table'
            ? 'bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/20'
            : 'text-slate-400 hover:text-white'
        }`}
        title="Hiển thị dạng lưới / bảng dữ liệu"
      >
        <Table className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Dạng Lưới</span>
      </button>

      <button
        type="button"
        onClick={() => onViewModeChange('cards')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all ${
          viewMode === 'cards'
            ? 'bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/20'
            : 'text-slate-400 hover:text-white'
        }`}
        title="Hiển thị dạng thẻ danh thiếp"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Dạng Thẻ</span>
      </button>
    </div>
  );
};
