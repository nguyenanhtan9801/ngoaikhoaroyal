import React from 'react';
import { 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  TrendingUp, 
  Coffee, 
  DollarSign, 
  ArrowRight,
  ShieldAlert,
  FileText,
  CalendarDays
} from 'lucide-react';
import { AppStore, formatVND } from '../../lib/storage';
import { Student, ExtracurricularClass } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface OverviewKpiTabProps {
  store: AppStore;
  selectedCampusId: string;
  selectedTermId: string;
  onNavigateTab: (tabId: string) => void;
  onIssueCreditForStudent: (student: Student, cls: ExtracurricularClass, dates: string[]) => void;
}

export const OverviewKpiTab: React.FC<OverviewKpiTabProps> = ({
  store,
  selectedCampusId,
  selectedTermId,
  onNavigateTab,
  onIssueCreditForStudent,
}) => {
  const [alertViewMode, setAlertViewMode] = React.useState<ViewMode>('table');
  // Filter classes by campus & term
  const filteredClasses = store.classes.filter(c => {
    const matchCampus = selectedCampusId === 'all' || c.campus_id === selectedCampusId;
    const matchTerm = c.term_id === selectedTermId;
    return matchCampus && matchTerm;
  });

  const filteredClassIds = new Set(filteredClasses.map(c => c.id));

  // Filter attendance records (Exclude students currently in 'trial' or 'trial_dropped' status from official attendance rate until promoted to 'active')
  const filteredAttendance = store.attendance.filter(a => {
    if (!filteredClassIds.has(a.class_id)) return false;
    const enrollment = store.enrollments.find(
      e => e.student_id === a.student_id && e.class_id === a.class_id
    );
    if (enrollment && (enrollment.status === 'trial' || enrollment.status === 'trial_dropped')) {
      return false;
    }
    return true;
  });

  const totalAttendance = filteredAttendance.length;
  const presentCount = filteredAttendance.filter(a => a.status === 'present').length;
  const excusedCount = filteredAttendance.filter(a => a.status === 'absent_excused').length;
  const unexcusedCount = filteredAttendance.filter(a => a.status === 'absent_unexcused').length;
  const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

  // Filter snacks
  const filteredSessions = store.sessions.filter(s => filteredClassIds.has(s.class_id));
  const snacksAllocated = filteredSessions.reduce((acc, s) => acc + (s.snacks_allocated || 0), 0);
  const snacksConsumed = filteredSessions.reduce((acc, s) => acc + (s.snacks_consumed || 0), 0);
  const snacksReturned = filteredSessions.reduce((acc, s) => acc + (s.snacks_returned || 0), 0);

  // Filter official invoices (exclude trial_pending and cancelled from official debt/billed KPIs)
  const filteredInvoices = store.invoices.filter(
    i => filteredClassIds.has(i.class_id) && i.payment_status !== 'cancelled' && !i.is_trial_pending
  );
  const totalBilled = filteredInvoices.reduce((acc, i) => acc + i.net_payable, 0);
  const totalPaid = filteredInvoices.reduce((acc, i) => acc + i.paid_amount, 0);
  const totalDebt = filteredInvoices.reduce((acc, i) => acc + i.outstanding_amount, 0);

  // Consecutive absence >= 3 detection
  // Group attendance by class and student, sorted by date
  interface ConsecutiveAbsenceAlert {
    student: Student;
    cls: ExtracurricularClass;
    dates: string[];
    count: number;
    notes: string[];
  }

  const consecutiveAlerts: ConsecutiveAbsenceAlert[] = [];

  filteredClasses.forEach(cls => {
    const classRecords = store.attendance
      .filter(a => a.class_id === cls.id)
      .sort((a, b) => a.session_date.localeCompare(b.session_date));

    const studentMap = new Map<string, typeof classRecords>();
    classRecords.forEach(r => {
      if (!studentMap.has(r.student_id)) studentMap.set(r.student_id, []);
      studentMap.get(r.student_id)!.push(r);
    });

    studentMap.forEach((records, studentId) => {
      const student = store.students.find(s => s.id === studentId);
      if (!student) return;

      let currentStreak: string[] = [];
      let notes: string[] = [];

      for (const rec of records) {
        if (rec.status === 'absent_excused') {
          currentStreak.push(rec.session_date);
          if (rec.note) notes.push(rec.note);
        } else {
          if (currentStreak.length >= 3) {
            consecutiveAlerts.push({
              student,
              cls,
              dates: [...currentStreak],
              count: currentStreak.length,
              notes: [...notes],
            });
          }
          currentStreak = [];
          notes = [];
        }
      }

      if (currentStreak.length >= 3) {
        consecutiveAlerts.push({
          student,
          cls,
          dates: [...currentStreak],
          count: currentStreak.length,
          notes: [...notes],
        });
      }
    });
  });

  // Day of week analysis
  const dayStats = [
    { day: 'Thứ 2', code: 'T2', count: 0, present: 0 },
    { day: 'Thứ 3', code: 'T3', count: 0, present: 0 },
    { day: 'Thứ 4', code: 'T4', count: 0, present: 0 },
    { day: 'Thứ 5', code: 'T5', count: 0, present: 0 },
    { day: 'Thứ 6', code: 'T6', count: 0, present: 0 },
    { day: 'Thứ 7', code: 'T7', count: 0, present: 0 },
    { day: 'Chủ Nhật', code: 'CN', count: 0, present: 0 },
  ];

  filteredAttendance.forEach(a => {
    const d = new Date(a.session_date).getDay();
    // 0: CN, 1: T2, 2: T3, 3: T4, 4: T5, 5: T6, 6: T7
    const index = d === 0 ? 6 : d - 1;
    if (dayStats[index]) {
      dayStats[index].count += 1;
      if (a.status === 'present') dayStats[index].present += 1;
    }
  });

  return (
    <div className="space-y-4">
      
      {/* 4 Large KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Attendance */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-4 sm:p-4.5 backdrop-blur-md relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Lượt Điểm Danh</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white">{totalAttendance}</span>
            <span className="text-xs text-slate-400">lượt tổng hợp</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{filteredClasses.length} lớp học đang mở</span>
          </div>
        </div>

        {/* Card 2: Attendance Rate */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-4 sm:p-4.5 backdrop-blur-md relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Tỷ Lệ Chuyên Cần</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-cyan-400">{attendanceRate}%</span>
            <span className="text-xs text-slate-400">{presentCount} / {totalAttendance} có mặt</span>
          </div>
          <div className="mt-3 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, attendanceRate)}%` }}
            />
          </div>
        </div>

        {/* Card 3: Excused Absence */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-4 sm:p-4.5 backdrop-blur-md relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Vắng Có Phép</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-400">{excusedCount}</span>
            <span className="text-xs text-slate-400">buổi (hoàn trả bánh sữa)</span>
          </div>
          <div className="mt-3 text-xs text-amber-400/90 font-medium">
            Có thể phát sinh quyền bảo lưu
          </div>
        </div>

        {/* Card 4: Unexcused Absence */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-4 sm:p-4.5 backdrop-blur-md relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Vắng Không Phép</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-400">{unexcusedCount}</span>
            <span className="text-xs text-slate-400">buổi vi phạm</span>
          </div>
          <div className="mt-3 text-xs text-rose-400/90 font-medium">
            Suất bánh sữa vẫn tính tiêu thụ
          </div>
        </div>
      </div>

      {/* CORE BUSINESS ALERTS & CONSECUTIVE ABSENCES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-4">
        
        {/* Left 2 Cols: Consecutive Absence >= 3 Warning */}
        <div className="lg:col-span-2 rounded-2xl sm:rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-4 sm:p-5 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Cảnh Báo Vắng Học Liên Tiếp Từ 3 Buổi (Đủ Điều Kiện Bảo Lưu)
                  {consecutiveAlerts.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-bold border border-rose-500/30">
                      {consecutiveAlerts.length} học sinh
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400">
                  Quy định Royal: Vắng có phép liên tục ≥ 3 buổi được cấp Phiếu bảo lưu học phí (Hiệu lực 1 năm, cấn trừ khóa sau)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ViewToggle viewMode={alertViewMode} onViewModeChange={setAlertViewMode} />

              <button
                onClick={() => onNavigateTab('sub_credits')}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors ml-1"
              >
                <span>Xem sổ</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {consecutiveAlerts.length === 0 ? (
            <div className="py-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              Không có học sinh nào vắng liên tiếp từ 3 buổi trong kỳ lọc này.
            </div>
          ) : alertViewMode === 'cards' ? (
            <div className="space-y-3">
              {consecutiveAlerts.map((item, idx) => {
                const alreadyHasCredit = store.makeupCredits.some(
                  c => c.student_id === item.student.id && c.source_class_id === item.cls.id && c.status === 'issued'
                );

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-slate-900/90 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-mono font-bold border border-rose-500/30">
                          {item.student.code}
                        </span>
                        <span className="text-sm font-bold text-white">{item.student.name}</span>
                        <span className="text-xs text-slate-400 font-medium">({item.cls.name})</span>
                        {item.student.is_royal_student && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            Royal School
                          </span>
                        )}
                      </div>

                      <div className="mt-2 text-xs text-slate-300 flex items-center gap-2 flex-wrap">
                        <span className="text-rose-400 font-bold">Vắng liên tiếp: {item.count} buổi</span>
                        <span className="text-slate-500">&bull;</span>
                        <span className="text-slate-400">Các ngày: {item.dates.join(', ')}</span>
                      </div>

                      {item.notes.length > 0 && (
                        <div className="mt-1 text-[11px] text-slate-400 italic">
                          Lý do: {item.notes.join('; ')}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {alreadyHasCredit ? (
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Đã Lập Phiếu Bảo Lưu
                        </span>
                      ) : (
                        <button
                          onClick={() => onIssueCreditForStudent(item.student, item.cls, item.dates)}
                          className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5 text-slate-950" />
                          <span>Lập Phiếu Bảo Lưu Ngay</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Mã HV</th>
                    <th className="py-2.5 px-3">Họ và Tên</th>
                    <th className="py-2.5 px-3">Lớp Ngoại Khóa</th>
                    <th className="py-2.5 px-3 text-center">Số Buổi Vắng</th>
                    <th className="py-2.5 px-3">Ngày Vắng Cụ Thể</th>
                    <th className="py-2.5 px-3 text-right">Xử Lý Bảo Lưu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {consecutiveAlerts.map((item, idx) => {
                    const alreadyHasCredit = store.makeupCredits.some(
                      c => c.student_id === item.student.id && c.source_class_id === item.cls.id && c.status === 'issued'
                    );

                    return (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{item.student.code}</td>
                        <td className="py-2.5 px-3 font-bold text-white">{item.student.name}</td>
                        <td className="py-2.5 px-3 text-slate-300">{item.cls.name}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 text-[10px]">
                            {item.count} buổi
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">{item.dates.join(', ')}</td>
                        <td className="py-2.5 px-3 text-right">
                          {alreadyHasCredit ? (
                            <span className="text-emerald-400 font-semibold text-[11px]">Đã lập phiếu</span>
                          ) : (
                            <button
                              onClick={() => onIssueCreditForStudent(item.student, item.cls, item.dates)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] transition-colors"
                            >
                              Lập phiếu ngay
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Col: Snacks & Meals Live Audit */}
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-md shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Coffee className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">Đối Soát Bánh Sữa Sau Giờ</h3>
              </div>
              <button
                onClick={() => onNavigateTab('sub_snacks')}
                className="text-xs font-bold text-amber-400 hover:text-amber-300"
              >
                Chi tiết
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Quy tắc Hoàng Gia: Chỉ cấp suất cho Học sinh Royal. Học sinh vắng có phép hoàn trả bếp; vắng không phép tính tiêu thụ.
            </p>

            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Suất cấp ban đầu (Định mức)</span>
                <span className="text-sm font-bold text-white font-mono">{snacksAllocated} suất</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-emerald-500/30 flex items-center justify-between">
                <span className="text-xs text-emerald-400 font-medium">Thực tế tiêu thụ (Có mặt + Vắng KP)</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">{snacksConsumed} suất</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-amber-500/30 flex items-center justify-between">
                <span className="text-xs text-amber-400 font-medium">Hoàn trả kho/bếp (Vắng Có phép)</span>
                <span className="text-sm font-bold text-amber-400 font-mono">{snacksReturned} suất</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Tiết kiệm chống lãng phí:</span>
            <span className="text-emerald-400 font-bold font-mono">
              {formatVND(snacksReturned * 35000)}
            </span>
          </div>
        </div>

      </div>

      {/* Row 3: Day of Week Attendance Chart & Financial Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Attendance by Day of Week */}
        <div className="lg:col-span-2 rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white">Chuyên Cần Phân Bổ Theo Thứ Trong Tuần</h3>
            </div>
            <span className="text-xs text-slate-400">Tỷ lệ đi học đều</span>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center pt-2">
            {dayStats.map((item, idx) => {
              const rate = item.count > 0 ? Math.round((item.present / item.count) * 100) : 0;
              const hasData = item.count > 0;
              return (
                <div key={idx} className="flex flex-col items-center">
                  <div className="w-full bg-slate-900/80 rounded-2xl p-2.5 border border-slate-800 flex flex-col items-center justify-end h-36 relative">
                    {hasData ? (
                      <>
                        <div 
                          className="w-full bg-gradient-to-t from-cyan-600 to-amber-500 rounded-xl transition-all duration-700"
                          style={{ height: `${Math.max(15, rate)}%` }}
                        />
                        <span className="absolute top-2 text-[11px] font-bold text-cyan-300 font-mono">
                          {rate}%
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-600">Không lịch</span>
                    )}
                  </div>
                  <span className="mt-2 text-xs font-bold text-slate-300">{item.code}</span>
                  <span className="text-[10px] text-slate-500">{item.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Financial Highlights */}
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-md shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Tài Chính & Thu Học Phí</h3>
              </div>
              <button
                onClick={() => onNavigateTab('sub_finance')}
                className="text-xs font-bold text-amber-400 hover:text-amber-300"
              >
                Gạch nợ
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400">Tổng doanh thu kỳ:</span>
                  <span className="text-white font-bold font-mono">{formatVND(totalBilled)}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-emerald-400 font-medium">Đã thu thực tế:</span>
                  <span className="text-emerald-400 font-bold font-mono">{formatVND(totalPaid)}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-rose-400 font-medium">Công nợ cần thu:</span>
                  <span className="text-rose-400 font-bold font-mono">{formatVND(totalDebt)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800">
            <button
              onClick={() => onNavigateTab('sub_finance')}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Xem Báo Cáo Quyết Toán & VietQR</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
