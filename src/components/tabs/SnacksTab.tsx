import React, { useState } from 'react';
import { Coffee, Printer, CheckCircle2, AlertTriangle, ArrowRight, Calendar, Filter } from 'lucide-react';
import { AppStore, formatVND } from '../../lib/storage';
import { UserRole } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface SnacksTabProps {
  store: AppStore;
  currentRole: UserRole;
  selectedCampusId: string;
  selectedTermId: string;
  onPrintSnacksReport: () => void;
}

export const SnacksTab: React.FC<SnacksTabProps> = ({
  store,
  currentRole,
  selectedCampusId,
  selectedTermId,
  onPrintSnacksReport,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [filterClassId, setFilterClassId] = useState<string>('all');

  // Filter classes
  const classesInScope = store.classes.filter(c => {
    const matchCampus = selectedCampusId === 'all' || c.campus_id === selectedCampusId;
    const matchTerm = c.term_id === selectedTermId;
    return matchCampus && matchTerm;
  });

  const classIdsInScope = new Set(classesInScope.map(c => c.id));

  // Filter sessions
  const sessionsInScope = store.sessions.filter(s => {
    const matchClass = filterClassId === 'all' ? classIdsInScope.has(s.class_id) : s.class_id === filterClassId;
    return matchClass;
  }).sort((a, b) => b.session_date.localeCompare(a.session_date));

  const totalAllocated = sessionsInScope.reduce((acc, s) => acc + (s.snacks_allocated || 0), 0);
  const totalConsumed = sessionsInScope.reduce((acc, s) => acc + (s.snacks_consumed || 0), 0);
  const totalReturned = sessionsInScope.reduce((acc, s) => acc + (s.snacks_returned || 0), 0);
  const totalSavedValue = totalReturned * 35000; // 35k / snack cost

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-md shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Coffee className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">Sổ Đối Soát Bánh Sữa & Suất Ăn Nhẹ Sau Giờ</h2>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Quy định độc quyền Royal School: Chỉ học sinh Royal được hỗ trợ suất ăn nhẹ. Suất tiêu thụ tính trên học sinh có mặt và vắng không phép; học sinh vắng có phép được thu hồi hoàn trả bếp trung tâm để chống thất thoát.
          </p>
        </div>

        <button
          onClick={onPrintSnacksReport}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all shrink-0"
        >
          <Printer className="w-4 h-4 text-slate-950" />
          <span>In Phiếu Đối Soát Bếp</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-[#111827]/80 border border-slate-800/80 shadow-xl">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Tổng Suất Cấp Chuẩn</span>
          <div className="mt-2 text-3xl font-extrabold text-white font-mono">{totalAllocated}</div>
          <span className="mt-1 text-[11px] text-slate-500 block">Dựa trên sĩ số HS Royal</span>
        </div>

        <div className="p-5 rounded-3xl bg-[#111827]/80 border border-slate-800/80 shadow-xl">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">Thực Tế Tiêu Thụ</span>
          <div className="mt-2 text-3xl font-extrabold text-emerald-400 font-mono">{totalConsumed}</div>
          <span className="mt-1 text-[11px] text-emerald-500/80 block">Có mặt + Vắng Không phép</span>
        </div>

        <div className="p-5 rounded-3xl bg-[#111827]/80 border border-slate-800/80 shadow-xl">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Thu Hồi Hoàn Bếp</span>
          <div className="mt-2 text-3xl font-extrabold text-amber-400 font-mono">{totalReturned}</div>
          <span className="mt-1 text-[11px] text-amber-500/80 block">Vắng Có phép báo trước</span>
        </div>

        <div className="p-5 rounded-3xl bg-[#111827]/80 border border-slate-800/80 shadow-xl">
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block">Giá Trị Tiết Kiệm</span>
          <div className="mt-2 text-2xl font-extrabold text-cyan-400 font-mono">{formatVND(totalSavedValue)}</div>
          <span className="mt-1 text-[11px] text-cyan-500/80 block">Quy đổi 35.000 đ / suất</span>
        </div>
      </div>

      {/* Sessions Container (Cards or Table) */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Nhật Ký Cấp & Quyết Toán Suất Ăn Theo Buổi Học ({sessionsInScope.length} buổi)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Định mức tự động đối soát dựa trên điểm danh thực tế
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Lớp:</span>
              <select
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-xs text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
              >
                <option value="all">Tất cả các lớp</option>
                {classesInScope.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          </div>
        </div>

        {/* VIEW 1: CARDS VIEW */}
        {viewMode === 'cards' && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessionsInScope.map(session => {
              const cls = store.classes.find(c => c.id === session.class_id);
              const teacher = store.teachers.find(t => t.id === session.actual_teacher_id);
              const savedVal = session.snacks_returned * 35000;

              return (
                <div 
                  key={session.id}
                  className="rounded-2xl p-4 bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-amber-400 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {session.session_date}
                        </span>
                        <h4 className="font-bold text-white text-sm mt-1">{cls?.name || 'Lớp ngoại khóa'}</h4>
                      </div>

                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        Đã chốt sổ
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
                      <span>GV:</span>
                      <span className="text-slate-200 font-semibold">{teacher?.name}</span>
                      {session.is_substitute && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                          Dạy thay
                        </span>
                      )}
                    </div>

                    {/* 3 Metrics Box */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase font-semibold">Định mức</span>
                        <span className="text-sm font-extrabold text-white font-mono">{session.snacks_allocated}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-500/80 block uppercase font-semibold">Tiêu thụ</span>
                        <span className="text-sm font-extrabold text-emerald-400 font-mono">{session.snacks_consumed}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-amber-500/80 block uppercase font-semibold">Hoàn bếp</span>
                        <span className="text-sm font-extrabold text-amber-400 font-mono">{session.snacks_returned}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Saved amount */}
                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Tiết kiệm bếp:</span>
                    <span className="font-mono font-bold text-cyan-400">{formatVND(savedVal)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 2: TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Ngày Dạy</th>
                  <th className="py-3 px-4">Lớp Học</th>
                  <th className="py-3 px-4">Giáo Viên Dạy</th>
                  <th className="py-3 px-4 text-center">Định Mức Cấp (Royal)</th>
                  <th className="py-3 px-4 text-center">Tiêu Thụ</th>
                  <th className="py-3 px-4 text-center">Hoàn Trả Kho/Bếp</th>
                  <th className="py-3 px-4 text-right">Giá Trị Hoàn Trả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sessionsInScope.map(session => {
                  const cls = store.classes.find(c => c.id === session.class_id);
                  const teacher = store.teachers.find(t => t.id === session.actual_teacher_id);
                  return (
                    <tr key={session.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-white">{session.session_date}</td>
                      <td className="py-3 px-4 font-semibold text-slate-200">{cls?.name || 'Lớp ngoại khóa'}</td>
                      <td className="py-3 px-4 text-slate-300">
                        {teacher?.name} {session.is_substitute && <span className="text-amber-400 text-[10px]">(Dạy thay)</span>}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-white">{session.snacks_allocated}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-emerald-400">{session.snacks_consumed}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-amber-400">
                        {session.snacks_returned > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {session.snacks_returned}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-cyan-400">
                        {formatVND(session.snacks_returned * 35000)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
};
