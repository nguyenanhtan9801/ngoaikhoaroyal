import React, { useState } from 'react';
import { 
  Milk, 
  Printer, 
  CheckCircle2, 
  RotateCcw, 
  Calendar, 
  Building2, 
  FileText,
  Clock,
  Search,
  Filter
} from 'lucide-react';
import { AppState } from '../../services/storage';

interface SnackManagementProps {
  state: AppState;
  onPrintSnackReport: (sessionDate: string) => void;
}

export const SnackManagement: React.FC<SnackManagementProps> = ({
  state,
  onPrintSnackReport
}) => {
  const { sessions, classes, attendance, students, enrollments } = state;
  const [selectedDate, setSelectedDate] = useState<string>('2026-10-14');

  // Filter sessions by selected date or show all
  const filteredSessions = sessions.filter(s => !selectedDate || s.session_date === selectedDate);

  // Totals
  const totalAllocated = filteredSessions.reduce((sum, s) => sum + s.snacks_allocated, 0);
  const totalConsumed = filteredSessions.reduce((sum, s) => sum + s.snacks_consumed, 0);
  const totalReturned = filteredSessions.reduce((sum, s) => sum + s.snacks_returned, 0);

  return (
    <div className="space-y-6">
      
      {/* Header Banner for Snacks */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Milk className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white">
                Kiểm Soát & Đối Soát Bánh Sữa Sau Giờ (Snack Pantry)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Chính sách chuẩn Royal: Chỉ học sinh trường Royal mới được cấp suất bánh sữa sau giờ.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onPrintSnackReport(selectedDate)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition-all shadow-md"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>In Phiếu Đối Soát Bếp (PDF)</span>
            </button>
          </div>
        </div>

        {/* Metric summary boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800">
          <div className="rounded-2xl bg-[#0B0F19] border border-slate-800 p-4">
            <span className="text-xs text-slate-400 font-medium">Tổng Suất Cấp Ban Đầu (Bếp Xuất)</span>
            <div className="text-2xl font-extrabold text-white mt-1">
              {totalAllocated} <span className="text-xs text-slate-400 font-normal">suất</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              = Tổng sĩ số học sinh Royal có trong các lớp
            </span>
          </div>

          <div className="rounded-2xl bg-[#0B0F19] border border-emerald-950/60 p-4">
            <span className="text-xs text-emerald-400 font-medium">Tổng Suất Đã Tiêu Thụ Thực Tế</span>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">
              {totalConsumed} <span className="text-xs text-slate-400 font-normal">suất</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              = Royal có mặt + Royal vắng không phép
            </span>
          </div>

          <div className="rounded-2xl bg-[#0B0F19] border border-amber-950/60 p-4">
            <span className="text-xs text-amber-400 font-medium">Tổng Suất Hoàn Trả Bếp/Kho</span>
            <div className="text-2xl font-extrabold text-amber-400 mt-1">
              {totalReturned} <span className="text-xs text-slate-400 font-normal">suất</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              = Học sinh Royal vắng có phép
            </span>
          </div>
        </div>

      </div>

      {/* Sessions Detail Table */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-xl">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-white">Nhật Ký Đối Soát Suất Ăn Theo Lớp Học</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
              {filteredSessions.length} buổi học
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Lọc ngày:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-[#0B0F19] border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs text-white"
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate('')}
                className="text-xs text-amber-400 hover:underline ml-1"
              >
                Xem tất cả
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0F19]/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Ngày</th>
                <th className="py-3 px-4">Tên Lớp Ngoại Khóa</th>
                <th className="py-3 px-4 text-center">Cấp Ban Đầu (Royal)</th>
                <th className="py-3 px-4 text-center">Tiêu Thụ</th>
                <th className="py-3 px-4 text-center">Hoàn Trả Kho/Bếp</th>
                <th className="py-3 px-4">Giáo Viên Xác Nhận</th>
                <th className="py-3 px-4 text-center">Trạng Thái Buổi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredSessions.map((ses) => {
                const cls = classes.find(c => c.id === ses.class_id);
                const teacher = state.teachers.find(t => t.id === ses.actual_teacher_id);

                return (
                  <tr key={ses.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-300 font-semibold">
                      {ses.session_date}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-sm">{cls?.name || ses.class_id}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {ses.is_substitute ? '★ Giáo viên dạy thay' : 'Giáo viên phụ trách'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center font-bold font-mono text-slate-200">
                      {ses.snacks_allocated}
                    </td>

                    <td className="py-3.5 px-4 text-center font-bold font-mono text-emerald-400">
                      {ses.snacks_consumed}
                    </td>

                    <td className="py-3.5 px-4 text-center font-bold font-mono text-amber-400">
                      {ses.snacks_returned}
                    </td>

                    <td className="py-3.5 px-4 text-slate-300 font-medium">
                      {teacher?.name || ses.actual_teacher_id}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Đã đối soát
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
