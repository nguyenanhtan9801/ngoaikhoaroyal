import React, { useState, useMemo } from 'react';
import { 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  Building2, 
  BookOpen, 
  Users, 
  Coffee, 
  Clock, 
  MapPin, 
  User, 
  Filter, 
  Sparkles, 
  Calendar as CalendarIcon, 
  AlertCircle, 
  Printer, 
  CheckCircle2, 
  Search, 
  RotateCcw,
  Eye,
  Info,
  Layers,
  ArrowRight
} from 'lucide-react';
import { AppStore, formatVND } from '../../lib/storage';
import { ExtracurricularClass, UserRole, Campus, Subject, AcademicTerm, TimeSlot, Facility, Teacher, Student, Enrollment, ClassSession } from '../../types';

interface ScheduleTabProps {
  store: AppStore;
  currentRole: UserRole;
  selectedCampusId?: string;
  onSelectCampus?: (id: string) => void;
  onNavigateTab?: (route: string) => void;
  onSelectClassForAttendance?: (cls: ExtracurricularClass) => void;
}

const DAY_NAMES_VI = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const DAY_CODES_MAP: Record<number, string> = {
  0: 'CN', // Sunday
  1: 'T2', // Monday
  2: 'T3', // Tuesday
  3: 'T4', // Wednesday
  4: 'T5', // Thursday
  5: 'T6', // Friday
  6: 'T7', // Saturday
};

// Check if a JS Date matches any day string in timeSlot.days_of_week
function matchesTimeSlotDay(date: Date, daysOfWeek: string[]): boolean {
  if (!daysOfWeek || daysOfWeek.length === 0) return false;
  const dayIndex = date.getDay(); // 0 is Sunday
  const code = DAY_CODES_MAP[dayIndex];

  return daysOfWeek.some(d => {
    const norm = d.toUpperCase().trim();
    if (norm === code) return true;
    if (dayIndex === 0 && (norm.includes('CN') || norm.includes('CHỦ NHẬT') || norm.includes('SUNDAY') || norm === '0')) return true;
    if (dayIndex === 1 && (norm.includes('T2') || norm.includes('THỨ 2') || norm.includes('MONDAY') || norm === '2')) return true;
    if (dayIndex === 2 && (norm.includes('T3') || norm.includes('THỨ 3') || norm.includes('TUESDAY') || norm === '3')) return true;
    if (dayIndex === 3 && (norm.includes('T4') || norm.includes('THỨ 4') || norm.includes('WEDNESDAY') || norm === '4')) return true;
    if (dayIndex === 4 && (norm.includes('T5') || norm.includes('THỨ 5') || norm.includes('THURSDAY') || norm === '5')) return true;
    if (dayIndex === 5 && (norm.includes('T6') || norm.includes('THỨ 6') || norm.includes('FRIDAY') || norm === '6')) return true;
    if (dayIndex === 6 && (norm.includes('T7') || norm.includes('THỨ 7') || norm.includes('SATURDAY') || norm === '7')) return true;
    return false;
  });
}

function formatDateISO(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  store,
  currentRole,
  selectedCampusId = 'all',
  onSelectCampus,
  onNavigateTab,
  onSelectClassForAttendance,
}) => {
  // Calendar month state: default to current month (Tháng hiện hành)
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Filter States: Hệ thống / Cơ sở, Môn học, Khóa học
  const [filterCampus, setFilterCampus] = useState<string>(selectedCampusId || 'all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterTerm, setFilterTerm] = useState<string>(store.terms.find(t => t.is_active)?.id || 'all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Month navigation helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleGoToCurrentMonth = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const handleResetFilters = () => {
    setFilterCampus('all');
    setFilterSubject('all');
    setFilterTerm('all');
    setSearchQuery('');
    if (onSelectCampus) onSelectCampus('all');
  };

  // Sync external selectedCampusId when changed from QuickFilterBar
  React.useEffect(() => {
    if (selectedCampusId && selectedCampusId !== filterCampus) {
      setFilterCampus(selectedCampusId);
    }
  }, [selectedCampusId]);

  // Calendar day calculation
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // In Vietnam, Monday is index 0
  const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Helper: Get classes and milk stats for any specific date string YYYY-MM-DD
  const getDayScheduleData = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);

    // Filter active classes matching filters
    const matchingClasses = store.classes.filter(cls => {
      // 1. Campus filter (Hệ thống = all)
      if (filterCampus !== 'all' && cls.campus_id !== filterCampus) {
        return false;
      }
      // 2. Subject filter
      if (filterSubject !== 'all' && cls.subject_id !== filterSubject) {
        return false;
      }
      // 3. Term filter
      if (filterTerm !== 'all' && cls.term_id !== filterTerm) {
        return false;
      }
      // 4. Class status
      if (cls.status === 'canceled') {
        return false;
      }

      // 5. Term date boundaries
      const term = store.terms.find(t => t.id === cls.term_id);
      if (term && term.start_date && term.end_date) {
        if (dateStr < term.start_date || dateStr > term.end_date) {
          // Unless there is an explicit recorded session
          const hasSession = store.sessions.some(s => s.class_id === cls.id && s.session_date === dateStr);
          if (!hasSession) return false;
        }
      }

      // 6. Day of week matching
      const timeSlot = store.timeSlots.find(ts => ts.id === cls.time_slot_id);
      const classDays = (cls.days_of_week && cls.days_of_week.length > 0)
        ? cls.days_of_week
        : (timeSlot?.days_of_week || []);
      const dayMatches = matchesTimeSlotDay(dateObj, classDays);
      const explicitSession = store.sessions.some(s => s.class_id === cls.id && s.session_date === dateStr);

      if (!dayMatches && !explicitSession) {
        return false;
      }

      // 7. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const subject = store.subjects.find(s => s.id === cls.subject_id);
        const teacher = store.teachers.find(t => t.id === cls.primary_teacher_id);
        const matchName = cls.name.toLowerCase().includes(q);
        const matchSub = subject?.name.toLowerCase().includes(q) || subject?.code.toLowerCase().includes(q);
        const matchTch = teacher?.name.toLowerCase().includes(q);
        if (!matchName && !matchSub && !matchTch) {
          return false;
        }
      }

      return true;
    });

    // For each matching class, calculate students & milk rations
    let totalStudents = 0;
    let totalMilkRations = 0;
    let totalOutsideStudents = 0;

    const classDetails = matchingClasses.map(cls => {
      const subject = store.subjects.find(s => s.id === cls.subject_id);
      const campus = store.campuses.find(c => c.id === cls.campus_id);
      const facility = store.facilities.find(f => f.id === cls.facility_id);
      const timeSlot = store.timeSlots.find(ts => ts.id === cls.time_slot_id);
      const teacher = store.teachers.find(t => t.id === cls.primary_teacher_id);
      const session = store.sessions.find(s => s.class_id === cls.id && s.session_date === dateStr);

      // Active enrollments for this class
      const enrollments = store.enrollments.filter(e => e.class_id === cls.id && e.status === 'active');
      const enrolledStudents = enrollments.map(e => store.students.find(s => s.id === e.student_id)).filter(Boolean) as Student[];

      const royalStudents = enrolledStudents.filter(s => s.is_royal_student);
      const outsideStudents = enrolledStudents.filter(s => !s.is_royal_student);

      const countRoyal = royalStudents.length;
      const countOutside = outsideStudents.length;
      const countTotal = enrolledStudents.length;

      totalStudents += countTotal;
      totalMilkRations += countRoyal;
      totalOutsideStudents += countOutside;

      return {
        classItem: cls,
        subject,
        campus,
        facility,
        timeSlot,
        teacher,
        session,
        enrolledStudents,
        royalStudents,
        outsideStudents,
        countTotal,
        countRoyal,
        countOutside,
      };
    });

    return {
      dateStr,
      dateObj,
      classCount: matchingClasses.length,
      studentCount: totalStudents,
      milkCount: totalMilkRations,
      outsideCount: totalOutsideStudents,
      classes: classDetails,
    };
  };

  // Pre-calculate month days
  const calendarCells = useMemo(() => {
    const cells = [];

    // Previous month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDate = daysInPrevMonth - i;
      const prevMonthIdx = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = formatDateISO(prevYear, prevMonthIdx, prevDate);
      cells.push({
        dayNumber: prevDate,
        dateStr,
        isCurrentMonth: false,
        data: getDayScheduleData(dateStr),
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateISO(year, month, day);
      cells.push({
        dayNumber: day,
        dateStr,
        isCurrentMonth: true,
        data: getDayScheduleData(dateStr),
      });
    }

    // Next month padding to fill a 35 or 42 grid
    const totalCells = cells.length > 35 ? 42 : 35;
    const remaining = totalCells - cells.length;
    for (let day = 1; day <= remaining; day++) {
      const nextMonthIdx = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const dateStr = formatDateISO(nextYear, nextMonthIdx, day);
      cells.push({
        dayNumber: day,
        dateStr,
        isCurrentMonth: false,
        data: getDayScheduleData(dateStr),
      });
    }

    return cells;
  }, [year, month, filterCampus, filterSubject, filterTerm, searchQuery, store.classes, store.enrollments, store.sessions]);

  // Overall Month Totals
  const monthTotals = useMemo(() => {
    let totalSessions = 0;
    let totalStudentAttendances = 0;
    let totalMilkSnacks = 0;
    const activeClassIds = new Set<string>();

    calendarCells.forEach(cell => {
      if (cell.isCurrentMonth) {
        totalSessions += cell.data.classCount;
        totalStudentAttendances += cell.data.studentCount;
        totalMilkSnacks += cell.data.milkCount;
        cell.data.classes.forEach(c => activeClassIds.add(c.classItem.id));
      }
    });

    return {
      totalSessions,
      totalStudentAttendances,
      totalMilkSnacks,
      uniqueClassesCount: activeClassIds.size,
    };
  }, [calendarCells]);

  const activeCampusObj = store.campuses.find(c => c.id === filterCampus);
  const activeSubjectObj = store.subjects.find(s => s.id === filterSubject);

  return (
    <div className="space-y-4">
      
      {/* 1. TOP HEADER & FILTER BAR */}
      <div className="p-4 rounded-3xl bg-[#0D121F] border border-slate-800/80 shadow-xl space-y-4">
        
        {/* Navigation & Month Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">
                  LỊCH HỌC NGOẠI KHÓA TOÀN TRƯỜNG
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                  Lịch Tháng & Bánh Sữa
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Theo dõi số lớp, số học sinh và tổng hợp suất bánh sữa Royal cấp mỗi ngày theo cơ sở & môn học
              </p>
            </div>
          </div>

          {/* Month Switcher Controls */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="flex items-center rounded-2xl bg-slate-900 border border-slate-700/80 p-1 shadow-inner">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                title="Tháng trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="px-3 py-1 text-center min-w-[130px]">
                <span className="text-xs font-black text-white block">
                  Tháng {month + 1} / {year}
                </span>
                <span className="text-[10px] text-amber-400 font-semibold">
                  {new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(currentDate)}
                </span>
              </div>

              <button
                onClick={handleNextMonth}
                className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                title="Tháng kế tiếp"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleGoToCurrentMonth}
              className="px-3 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-xs font-black text-slate-950 transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/20"
              title="Quay về tháng hiện hành và ngày hôm nay"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-950" />
              <span>Tháng Hiện Hành</span>
            </button>
          </div>
        </div>

        {/* 3 FILTER DROPDOWNS: HỆ THỐNG / CƠ SỞ, MÔN HỌC, NIÊN KHÓA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          
          {/* Lọc 1: HỆ THỐNG / CƠ SỞ (Yêu cầu đề bài) */}
          <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <Building2 className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Phạm Vi Cơ Sở
              </span>
              <select
                value={filterCampus}
                onChange={(e) => {
                  setFilterCampus(e.target.value);
                  if (onSelectCampus) onSelectCampus(e.target.value);
                }}
                className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer mt-0.5"
              >
                <option value="all" className="bg-[#111827] text-white">
                  🏢 Toàn Hệ Thống (Tất cả cơ sở)
                </option>
                {store.campuses.map(c => (
                  <option key={c.id} value={c.id} className="bg-[#111827] text-white">
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lọc 2: MÔN HỌC (Yêu cầu đề bài) */}
          <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Môn Ngoại Khóa
              </span>
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer mt-0.5"
              >
                <option value="all" className="bg-[#111827] text-white">
                  🎨 Tất cả môn ngoại khóa
                </option>
                {store.subjects.map(s => (
                  <option key={s.id} value={s.id} className="bg-[#111827] text-white">
                    {s.name} ({s.category})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lọc 3: NIÊN KHÓA / KỲ HỌC */}
          <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <CalendarIcon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Niên Khóa
              </span>
              <select
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer mt-0.5"
              >
                <option value="all" className="bg-[#111827] text-white">
                  Tất cả niên khóa
                </option>
                {store.terms.map(t => (
                  <option key={t.id} value={t.id} className="bg-[#111827] text-white">
                    {t.name} ({t.status === 'open_enrollment' ? 'Đang tuyển sinh' : 'Đang học'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lọc 4: Tìm kiếm theo tên lớp / Giáo viên */}
          <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
              <Search className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Tìm Lớp / Giáo Viên
              </span>
              <input
                type="text"
                placeholder="Nhập tên lớp, môn, GV..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs font-bold text-white focus:outline-none placeholder-slate-600 mt-0.5"
              />
            </div>
            {(filterCampus !== 'all' || filterSubject !== 'all' || filterTerm !== 'all' || searchQuery) && (
              <button
                onClick={handleResetFilters}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                title="Bỏ lọc"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* METRIC CARDS FOR THE CURRENT MONTH */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-950 border border-amber-500/20">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-amber-300/90 font-medium">Buổi học trong tháng</span>
              <CalendarDays className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-black text-amber-400 font-mono mt-1">
              {monthTotals.totalSessions} <span className="text-xs text-slate-400 font-normal">ca/buổi</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Từ {monthTotals.uniqueClassesCount} lớp học đang chạy
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500/10 via-slate-900 to-slate-950 border border-cyan-500/20">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-cyan-300/90 font-medium">Lượt học sinh theo học</span>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl font-black text-cyan-300 font-mono mt-1">
              {monthTotals.totalStudentAttendances} <span className="text-xs text-slate-400 font-normal">lượt HS</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Học sinh Royal + Vãng lai
            </div>
          </div>

          {/* SUẤT BÁNH SỮA ROYAL CẦN CẤP TRONG THÁNG */}
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-950 border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-emerald-300 font-bold flex items-center gap-1">
                <Coffee className="w-3.5 h-3.5 text-emerald-400" />
                <span>Bánh Sữa Cần Cấp (Tháng)</span>
              </span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">
                Royal Only
              </span>
            </div>
            <div className="text-xl font-black text-emerald-400 font-mono mt-1">
              {monthTotals.totalMilkSnacks} <span className="text-xs text-slate-400 font-normal">suất bánh sữa</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Chỉ cấp cho Học sinh Royal chính khóa
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500/10 via-slate-900 to-slate-950 border border-purple-500/20">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-purple-300/90 font-medium">Phạm vi đang lọc</span>
              <Filter className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xs font-bold text-white mt-1 truncate">
              {activeCampusObj ? activeCampusObj.name : 'Toàn Hệ Thống'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
              {activeSubjectObj ? activeSubjectObj.name : 'Tất cả môn học'}
            </div>
          </div>
        </div>

      </div>

      {/* 2. MAIN MONTHLY CALENDAR GRID */}
      <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0F19] border border-slate-800 shadow-2xl space-y-3">
        
        {/* Calendar Day-of-Week Headers (7 columns) */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center">
          {DAY_NAMES_VI.map((dayName, idx) => {
            const isWeekend = idx >= 5;
            return (
              <div 
                key={dayName} 
                className={`py-2 px-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                  isWeekend 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                    : 'bg-slate-900/90 text-slate-300 border border-slate-800'
                }`}
              >
                <span className="hidden sm:inline">{dayName}</span>
                <span className="sm:hidden">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][idx]}</span>
              </div>
            );
          })}
        </div>

        {/* 7-column Calendar Month Grid */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {calendarCells.map((cell, idx) => {
            const hasClasses = cell.data.classCount > 0;
            const todayStr = new Date().toISOString().split('T')[0];
            const isToday = cell.dateStr === todayStr;

            return (
              <div
                key={idx}
                className={`min-h-[105px] sm:min-h-[125px] p-2 sm:p-2.5 rounded-2xl border transition-all flex flex-col justify-between group relative ${
                  !cell.isCurrentMonth
                    ? 'bg-slate-950/40 border-slate-900/80 text-slate-600 opacity-40'
                    : isToday
                    ? 'bg-gradient-to-b from-slate-900 to-slate-950 border-cyan-500/60 shadow-md ring-1 ring-cyan-500/30'
                    : hasClasses
                    ? 'bg-gradient-to-b from-[#101623] to-[#0A0E17] border-slate-800/90 hover:border-amber-500/40 hover:shadow-lg hover:shadow-black/40'
                    : 'bg-slate-950/60 border-slate-900 text-slate-500'
                }`}
              >
                {/* Top Row: Date Number & Badges */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs sm:text-sm font-black font-mono ${
                    isToday 
                      ? 'text-cyan-400 font-extrabold' 
                      : cell.isCurrentMonth 
                      ? 'text-white' 
                      : 'text-slate-600'
                  }`}>
                    {cell.dayNumber}
                  </span>

                  {isToday && (
                    <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px] font-bold">
                      Hôm nay
                    </span>
                  )}

                  {hasClasses && (
                    <span className="hidden sm:inline-block w-2 h-2 rounded-full bg-amber-400 group-hover:scale-125 transition-transform" />
                  )}
                </div>

                {/* Center Content: 3 Required Indicators per User Request:
                    1. Số lớp học trong ngày
                    2. Số học sinh
                    3. Số bánh sữa cần cấp
                */}
                {hasClasses ? (
                  <div className="space-y-1.5 my-1 text-left">
                    
                    {/* 1. SỐ LỚP HỌC TRONG NGÀY */}
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-slate-200 bg-slate-900/90 px-1.5 py-0.5 rounded-lg border border-slate-800">
                      <span className="flex items-center gap-1 text-slate-400">
                        <BookOpen className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400 shrink-0" />
                        <span className="hidden sm:inline">Lớp:</span>
                      </span>
                      <span className="font-mono text-amber-300 font-extrabold">
                        {cell.data.classCount} lớp
                      </span>
                    </div>

                    {/* 2. SỐ HỌC SINH */}
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-semibold text-slate-300 bg-slate-900/90 px-1.5 py-0.5 rounded-lg border border-slate-800">
                      <span className="flex items-center gap-1 text-slate-400">
                        <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-cyan-400 shrink-0" />
                        <span className="hidden sm:inline">HS:</span>
                      </span>
                      <span className="font-mono text-cyan-300 font-bold">
                        {cell.data.studentCount} HS
                      </span>
                    </div>

                    {/* 3. SỐ BÁNH SỮA CẦN CẤP (ROYAL SNACK ALLOCATION) */}
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded-lg border border-emerald-500/30 shadow-sm">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Coffee className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
                        <span className="hidden sm:inline">Bánh sữa:</span>
                      </span>
                      <span className="font-mono text-emerald-300 font-extrabold">
                        {cell.data.milkCount} suất
                      </span>
                    </div>

                  </div>
                ) : (
                  <div className="py-2 text-center text-[10px] text-slate-600 font-medium">
                    {cell.isCurrentMonth ? 'Nghỉ / Trống' : ''}
                  </div>
                )}

              </div>
            );
          })}
        </div>

      </div>

    </div>
  );
};
