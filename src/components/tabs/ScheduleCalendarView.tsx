import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Building2,
  BookOpen,
  Users,
  Coffee,
  Clock,
  Sparkles,
  MapPin,
  CheckCircle2,
  X,
  Eye,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { AppStore, ExtracurricularClass, Student, Enrollment, UserRole } from '../../types';

interface ScheduleCalendarViewProps {
  store: AppStore;
  currentRole: UserRole;
  selectedCampusId?: string;
  selectedTermId?: string;
  onSelectClassForAttendance?: (cls: ExtracurricularClass, dateStr: string) => void;
  onNavigateToSnacks?: (dateStr: string) => void;
}

// Chuyển đổi chỉ số ngày JavaScript (0: CN, 1: T2, ..., 6: T7) sang mã thứ của Royal School
const DOW_MAP: Record<number, string> = {
  0: 'CN',
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
};

const DAY_NAMES_VN = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const DAY_CODES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({
  store,
  currentRole,
  selectedCampusId = 'all',
  selectedTermId = 'all',
  onSelectClassForAttendance,
  onNavigateToSnacks,
}) => {
  // Trạng thái tháng/năm đang xem
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [campusFilter, setCampusFilter] = useState<string>(selectedCampusId);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [termFilter, setTermFilter] = useState<string>(selectedTermId);

  // Modal chi tiết ngày
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    dateStr: string;
    dayOfWeek: string;
    dayNum: number;
    classes: ExtracurricularClass[];
    snackCount: number;
    pmhClasses: ExtracurricularClass[];
    plClasses: ExtracurricularClass[];
  } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Lọc danh sách lớp học theo bộ lọc Cơ sở, Môn học và Khóa học
  const activeClasses = useMemo(() => {
    return (store.classes || []).filter((cls) => {
      if (termFilter !== 'all' && cls.term_id !== termFilter) return false;

      if (campusFilter !== 'all') {
        const cId = cls.campus_id === 'camp_pmh' ? 'pmh' : cls.campus_id === 'camp_pl' ? 'pl' : cls.campus_id;
        const targetCamp = campusFilter === 'camp_pmh' ? 'pmh' : campusFilter === 'camp_pl' ? 'pl' : campusFilter;
        if (cId !== targetCamp) return false;
      }

      if (subjectFilter !== 'all' && cls.subject_id !== subjectFilter) return false;

      return true;
    });
  }, [store.classes, campusFilter, subjectFilter, termFilter]);

  // Tạo ma trận các ngày trong tháng (Grid Thứ 2 -> Chủ Nhật)
  const calendarGrid = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    // Trong JS, getDay(): 0 là CN, 1 là T2... Ta chuyển về 0 là T2, 6 là CN
    let firstDayIndex = firstDayOfMonth.getDay() - 1;
    if (firstDayIndex === -1) firstDayIndex = 6; // Chủ Nhật là ngày cuối tuần

    const days = [];

    // Các ô trống của tháng trước
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        dayNum: prevMonthLastDay - i,
        isCurrentMonth: false,
        dateStr: '',
        dayOfWeek: '',
        classes: [],
        pmhClasses: [],
        plClasses: [],
        snackCount: 0,
      });
    }

    // Các ngày trong tháng hiện tại
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let d = 1; d <= totalDays; d++) {
      const dObj = new Date(year, month, d);
      const dowCode = DOW_MAP[dObj.getDay()];
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${mStr}-${dStr}`;

      // Tìm các lớp học diễn ra vào ngày này
      const dayClasses = activeClasses.filter((cls) => {
        const daysList = cls.days_of_week || ['T2', 'T4'];
        if (!daysList.includes(dowCode)) return false;

        // Kiểm tra khoảng thời gian bắt đầu và kết thúc của lớp
        if (cls.start_date && dateStr < cls.start_date) return false;
        if (cls.end_date && dateStr > cls.end_date) return false;

        return true;
      });

      // Tách theo cơ sở
      const pmhClasses = dayClasses.filter(
        (c) => c.campus_id === 'camp_pmh' || c.campus_id === 'pmh'
      );
      const plClasses = dayClasses.filter(
        (c) => c.campus_id === 'camp_pl' || c.campus_id === 'pl'
      );

      // Tính tổng số suất bánh sữa cho ngày này
      // Bằng tổng học sinh đang học tại các lớp diễn ra trong ngày có cờ nhận bánh sữa
      let snackCount = 0;
      const dayClassIds = new Set(dayClasses.map((c) => c.id));

      const relevantEnrollments = (store.enrollments || []).filter(
        (en) => dayClassIds.has(en.class_id) && en.status === 'active'
      );

      relevantEnrollments.forEach((en) => {
        // Kiểm tra lịch học bán phần tuần
        if (en.is_partial_schedule && Array.isArray(en.enrolled_days_of_week)) {
          if (!en.enrolled_days_of_week.includes(dowCode)) return;
        }

        const student = (store.students || []).find((s) => s.id === en.student_id);
        if (student) {
          const receivesSnack =
            (student as any).has_snack === true ||
            student.is_royal_student === true ||
            (en as any).has_snack === true;
          if (receivesSnack) {
            snackCount++;
          }
        }
      });

      days.push({
        dayNum: d,
        isCurrentMonth: true,
        dateStr,
        dayOfWeek: dowCode,
        isToday: dateStr === todayStr,
        classes: dayClasses,
        pmhClasses,
        plClasses,
        snackCount,
      });
    }

    // Các ô trống của tháng sau để hoàn thiện hàng
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        dayNum: i,
        isCurrentMonth: false,
        dateStr: '',
        dayOfWeek: '',
        classes: [],
        pmhClasses: [],
        plClasses: [],
        snackCount: 0,
      });
    }

    return days;
  }, [year, month, activeClasses, store.enrollments, store.students]);

  // Thống kê tổng quan trong tháng
  const monthSummary = useMemo(() => {
    let totalClassesCount = 0;
    let totalSnacksCount = 0;
    calendarGrid.forEach((day) => {
      if (day.isCurrentMonth) {
        totalClassesCount += day.classes.length;
        totalSnacksCount += day.snackCount;
      }
    });
    return { totalClassesCount, totalSnacksCount };
  }, [calendarGrid]);

  return (
    <div className="space-y-4">
      {/* HEADER TOOLBAR & BỘ LỌC */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950/40 border border-amber-500/30 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Tiêu đề & Điều hướng tháng */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <CalendarIcon className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Lịch Học Tháng & Điều Phối Ngoại Khóa
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-mono font-bold border border-amber-500/30">
                Tháng {month + 1} / {year}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Theo dõi lịch giảng dạy hàng ngày, phân bổ theo cơ sở PMH & Phú Lâm và tổng hợp khẩu phần bánh sữa
            </p>
          </div>

          {/* Nút lùi/tiến tháng */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 ml-0 sm:ml-4">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-850 transition-colors"
              title="Tháng trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 rounded-lg text-xs font-bold text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              Hôm nay
            </button>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-850 transition-colors"
              title="Tháng sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* BỘ LỌC CƠ SỞ & MÔN HỌC */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Bộ lọc Cơ sở */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setCampusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                campusFilter === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tất Cả Cơ Sở
            </button>
            <button
              type="button"
              onClick={() => setCampusFilter('pmh')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                campusFilter === 'pmh' || campusFilter === 'camp_pmh'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-sky-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              Phú Mỹ Hưng (PMH)
            </button>
            <button
              type="button"
              onClick={() => setCampusFilter('pl')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                campusFilter === 'pl' || campusFilter === 'camp_pl'
                  ? 'bg-purple-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-purple-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              Phú Lâm (PL)
            </button>
          </div>

          {/* Bộ lọc Môn học */}
          <div className="relative">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              aria-label="Chọn môn học"
              className="px-3 py-2 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-medium"
            >
              <option value="all">Tất cả môn học ({store.subjects?.length || 0})</option>
              {(store.subjects || []).map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({sub.code})
                </option>
              ))}
            </select>
          </div>

          {/* Bộ lọc Khóa học */}
          <div className="relative">
            <select
              value={termFilter}
              onChange={(e) => setTermFilter(e.target.value)}
              aria-label="Chọn khóa học"
              className="px-3 py-2 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-amber-300 focus:outline-none focus:border-amber-500 font-mono font-bold"
            >
              <option value="all">Tất cả khóa học</option>
              {(store.terms || []).map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI TÓM TẮT THÁNG */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400">Lớp học hoạt động:</span>
          <span className="font-mono font-bold text-amber-400 text-sm">
            {activeClasses.length} lớp
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400">Tổng ca dạy trong tháng:</span>
          <span className="font-mono font-bold text-cyan-400 text-sm">
            {monthSummary.totalClassesCount} ca
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400">Tổng suất bánh sữa dự kiến:</span>
          <span className="font-mono font-bold text-amber-300 text-sm flex items-center gap-1">
            <span>🍞🥛</span>
            {monthSummary.totalSnacksCount} suất
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400">Phân bổ cơ sở:</span>
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold">
            <span className="text-sky-400">PMH: {activeClasses.filter(c => c.campus_id === 'camp_pmh' || c.campus_id === 'pmh').length}</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-purple-400">PL: {activeClasses.filter(c => c.campus_id === 'camp_pl' || c.campus_id === 'pl').length}</span>
          </div>
        </div>
      </div>

      {/* LƯỚI LỊCH THÁNG (7 CỘT: THỨ HAI -> CHỦ NHẬT) */}
      <div className="rounded-2xl border border-slate-800 bg-[#0d131f]/90 overflow-hidden shadow-2xl">
        {/* Header 7 Ngày trong tuần */}
        <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950 text-center text-xs font-bold text-slate-300">
          {DAY_NAMES_VN.map((dayName, idx) => {
            const isWeekend = idx >= 5;
            return (
              <div
                key={dayName}
                className={`py-3 px-2 border-r border-slate-800/80 last:border-r-0 ${
                  isWeekend ? 'bg-amber-500/5 text-amber-400' : ''
                }`}
              >
                <div className="text-[11px] uppercase tracking-wider">{dayName}</div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">({DAY_CODES[idx]})</div>
              </div>
            );
          })}
        </div>

        {/* Các ô ngày trong tháng */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-800/60 auto-rows-fr">
          {calendarGrid.map((day, cellIdx) => {
            if (!day.isCurrentMonth) {
              return (
                <div
                  key={`empty_${cellIdx}`}
                  className="min-h-[120px] p-2 bg-slate-950/40 text-slate-600 select-none opacity-40"
                >
                  <span className="text-xs font-mono font-medium">{day.dayNum}</span>
                </div>
              );
            }

            const hasClasses = day.classes.length > 0;
            const isSelected = selectedDayDetail?.dateStr === day.dateStr;

            return (
              <div
                key={day.dateStr}
                onClick={() => {
                  setSelectedDayDetail({
                    dateStr: day.dateStr,
                    dayOfWeek: day.dayOfWeek,
                    dayNum: day.dayNum,
                    classes: day.classes,
                    snackCount: day.snackCount,
                    pmhClasses: day.pmhClasses,
                    plClasses: day.plClasses,
                  });
                }}
                className={`min-h-[135px] p-2 flex flex-col justify-between transition-all cursor-pointer group relative ${
                  day.isToday
                    ? 'bg-amber-500/10 border-2 border-amber-500/50'
                    : 'hover:bg-slate-800/50 bg-slate-900/30'
                } ${isSelected ? 'ring-2 ring-amber-400 bg-amber-500/15' : ''}`}
              >
                {/* Góc trên: Số ngày & Huy hiệu Hôm nay */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded-lg ${
                        day.isToday
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-200 group-hover:text-amber-400'
                      }`}
                    >
                      {day.dayNum}
                    </span>

                    {/* Huy hiệu Bánh Sữa */}
                    {day.snackCount > 0 && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30"
                        title={`Có ${day.snackCount} học sinh nhận khẩu phần bánh sữa`}
                      >
                        <span>🍞🥛</span>
                        <span>{day.snackCount}</span>
                      </span>
                    )}
                  </div>

                  {/* Huy hiệu số lớp theo cơ sở PMH (xanh sky) và PL (tím purple) */}
                  {hasClasses && (
                    <div className="flex flex-wrap items-center gap-1 mb-1.5">
                      {campusFilter === 'all' ? (
                        <>
                          {day.pmhClasses.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-bold border border-sky-500/30">
                              PMH: {day.pmhClasses.length} lớp
                            </span>
                          )}
                          {day.plClasses.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/30">
                              PL: {day.plClasses.length} lớp
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                          {day.classes.length} lớp diễn ra
                        </span>
                      )}
                    </div>
                  )}

                  {/* Danh sách tóm tắt 2-3 lớp tiêu biểu */}
                  <div className="space-y-1">
                    {day.classes.slice(0, 2).map((cls) => {
                      const subject = (store.subjects || []).find((s) => s.id === cls.subject_id);
                      const isPmh = cls.campus_id === 'camp_pmh' || cls.campus_id === 'pmh';
                      return (
                        <div
                          key={cls.id}
                          className="px-1.5 py-1 rounded bg-slate-950/80 border border-slate-800 text-[10px] truncate hover:border-slate-700 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-slate-100 truncate">
                              {cls.name}
                            </span>
                            <span
                              className={`text-[9px] font-mono font-bold shrink-0 ${
                                isPmh ? 'text-sky-400' : 'text-purple-400'
                              }`}
                            >
                              {isPmh ? 'PMH' : 'PL'}
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-400 truncate">
                            {subject?.name || 'Môn học'}
                          </div>
                        </div>
                      );
                    })}

                    {day.classes.length > 2 && (
                      <div className="text-[10px] text-amber-400/90 font-medium text-center pt-0.5">
                        +{day.classes.length - 2} lớp khác &rarr;
                      </div>
                    )}
                  </div>
                </div>

                {!hasClasses && (
                  <div className="text-[10px] text-slate-600 italic text-center py-2">
                    Không có ca học
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL CHI TIẾT NGÀY: DANH SÁCH LỚP HỌC & ĐIỂM DANH BÁNH SỮA */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-3xl rounded-3xl bg-[#111827] border border-amber-500/40 p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Chi Tiết Lịch Học Ngày {selectedDayDetail.dateStr}</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-mono font-bold border border-amber-500/30">
                      {selectedDayDetail.dayOfWeek}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tổng cộng {selectedDayDetail.classes.length} lớp học &bull;{' '}
                    <span className="text-amber-400 font-bold">
                      {selectedDayDetail.snackCount} suất bánh sữa Royal
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDayDetail(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thống kê nhanh ngày */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Lớp cơ sở Phú Mỹ Hưng:</span>
                <span className="font-mono font-bold text-sky-400">
                  {selectedDayDetail.pmhClasses.length} lớp
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Lớp cơ sở Phú Lâm:</span>
                <span className="font-mono font-bold text-purple-400">
                  {selectedDayDetail.plClasses.length} lớp
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/30 flex items-center justify-between">
                <span className="text-slate-400">Suất bánh sữa cấp bếp:</span>
                <span className="font-mono font-bold text-amber-400 flex items-center gap-1">
                  <span>🍞🥛</span>
                  {selectedDayDetail.snackCount} suất
                </span>
              </div>
            </div>

            {/* Danh sách các lớp diễn ra trong ngày */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>Danh Sách Các Lớp Giảng Dạy Trong Ngày</span>
              </h4>

              {selectedDayDetail.classes.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/60 rounded-2xl border border-slate-800">
                  Không có lớp học ngoại khóa nào diễn ra vào ngày này.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedDayDetail.classes.map((cls) => {
                    const subject = (store.subjects || []).find((s) => s.id === cls.subject_id);
                    const teacher = (store.teachers || []).find((t) => t.id === cls.primary_teacher_id);
                    const isPmh = cls.campus_id === 'camp_pmh' || cls.campus_id === 'pmh';

                    // Lấy học sinh lớp này và đếm bánh sữa
                    const enrolledStudents = (store.enrollments || [])
                      .filter((en) => en.class_id === cls.id && en.status === 'active')
                      .map((en) => {
                        const st = (store.students || []).find((s) => s.id === en.student_id);
                        const hasSnack =
                          (st as any)?.has_snack === true ||
                          st?.is_royal_student === true ||
                          (en as any)?.has_snack === true;
                        return { student: st, enrollment: en, hasSnack };
                      })
                      .filter((item) => Boolean(item.student));

                    const classSnacks = enrolledStudents.filter((item) => item.hasSnack).length;

                    return (
                      <div
                        key={cls.id}
                        className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm">{cls.name}</span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border font-mono ${
                                isPmh
                                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                                  : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              }`}
                            >
                              {isPmh ? 'Phú Mỹ Hưng' : 'Phú Lâm'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 text-[10px] font-bold border border-amber-500/20 font-mono">
                              {subject?.name || 'Môn ngoại khóa'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-slate-400 text-[11px] flex-wrap">
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-slate-500" />
                              Sĩ số: {enrolledStudents.length} / {cls.max_students}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                              Giáo viên: {teacher?.name || 'Chưa phân công'}
                            </span>
                            <span className="flex items-center gap-1 text-amber-400 font-bold">
                              <span>🍞🥛</span>
                              Bánh sữa: {classSnacks} suất
                            </span>
                          </div>
                        </div>

                        {/* Nút hành động */}
                        <div className="flex items-center gap-2 shrink-0">
                          {onSelectClassForAttendance && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectClassForAttendance(cls, selectedDayDetail.dateStr);
                                setSelectedDayDetail(null);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Điểm Danh Lớp</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Chân modal */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Lịch học được đồng bộ theo thời gian thực từ CSDL Royal School
              </span>
              <button
                type="button"
                onClick={() => setSelectedDayDetail(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleCalendarView;
