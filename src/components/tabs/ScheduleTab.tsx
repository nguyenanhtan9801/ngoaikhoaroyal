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
  // Calendar month state: default to September 2026 (the active academic term in seed data)
  // or current month if active
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const activeTerm = store.terms.find(t => t.is_active);
    if (activeTerm && activeTerm.start_date) {
      const parts = activeTerm.start_date.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
      }
    }
    return new Date(2026, 8, 1); // 2026-09-01
  });

  // Filter States: Hệ thống / Cơ sở, Môn học, Khóa học
  const [filterCampus, setFilterCampus] = useState<string>(selectedCampusId || 'all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterTerm, setFilterTerm] = useState<string>(store.terms.find(t => t.is_active)?.id || 'all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Selected day for inspection
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  
  // Daily kitchen milk slip modal
  const [printSlipDayStr, setPrintSlipDayStr] = useState<string | null>(null);

  // Month navigation helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDayStr(null);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDayStr(null);
  };

  const handleGoToTermMonth = () => {
    const activeTerm = store.terms.find(t => t.is_active);
    if (activeTerm && activeTerm.start_date) {
      const parts = activeTerm.start_date.split('-');
      if (parts.length === 3) {
        setCurrentDate(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1));
        return;
      }
    }
    setCurrentDate(new Date(2026, 8, 1));
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
      const dayMatches = timeSlot ? matchesTimeSlotDay(dateObj, timeSlot.days_of_week) : false;
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

  // Active selected day data
  const selectedDayData = useMemo(() => {
    if (!selectedDayStr) return null;
    return getDayScheduleData(selectedDayStr);
  }, [selectedDayStr, filterCampus, filterSubject, filterTerm, searchQuery, store]);

  // Slip print data
  const printDayData = useMemo(() => {
    if (!printSlipDayStr) return null;
    return getDayScheduleData(printSlipDayStr);
  }, [printSlipDayStr, store]);

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
              onClick={handleGoToTermMonth}
              className="px-3 py-2 rounded-2xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-all flex items-center gap-1.5"
              title="Nhảy về tháng khai giảng của khóa học (09/2026)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Khóa 09/2026</span>
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
            const isSelected = selectedDayStr === cell.dateStr;
            const hasClasses = cell.data.classCount > 0;
            const todayStr = new Date().toISOString().split('T')[0];
            const isToday = cell.dateStr === todayStr;

            return (
              <div
                key={idx}
                onClick={() => {
                  setSelectedDayStr(cell.dateStr);
                }}
                className={`min-h-[105px] sm:min-h-[125px] p-2 sm:p-2.5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer group relative ${
                  !cell.isCurrentMonth
                    ? 'bg-slate-950/40 border-slate-900/80 text-slate-600 opacity-40 hover:opacity-80'
                    : isSelected
                    ? 'bg-gradient-to-b from-[#18233C] to-[#0E1726] border-amber-500 ring-2 ring-amber-500/40 shadow-xl shadow-amber-500/15'
                    : isToday
                    ? 'bg-gradient-to-b from-slate-900 to-slate-950 border-cyan-500/60 shadow-md'
                    : hasClasses
                    ? 'bg-gradient-to-b from-[#101623] to-[#0A0E17] border-slate-800/90 hover:border-amber-500/50 hover:shadow-lg hover:shadow-black/40'
                    : 'bg-slate-950/60 border-slate-900 text-slate-500 hover:border-slate-800'
                }`}
              >
                {/* Top Row: Date Number & Badges */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs sm:text-sm font-black font-mono ${
                    isSelected 
                      ? 'text-amber-400' 
                      : isToday 
                      ? 'text-cyan-400 underline underline-offset-2' 
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

                {/* Bottom Row: View Details Hint */}
                {hasClasses && (
                  <div className="text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between pt-1 border-t border-slate-800/60">
                    <span className="text-amber-400 font-bold">Xem chi tiết</span>
                    <ArrowRight className="w-2.5 h-2.5 text-amber-400" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* 3. DAY INSPECTOR: CHI TIẾT LỊCH HỌC & ĐIỀU PHỐI BÁNH SỮA TRONG NGÀY */}
      {selectedDayData && (
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0D1322] border-2 border-amber-500/40 shadow-2xl space-y-5 animate-fadeIn">
          
          {/* Header of Selected Day */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  CHI TIẾT LỊCH HỌC TRONG NGÀY
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2">
                  <span>
                    {new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(selectedDayData.dateObj)}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-xs font-mono">
                    {selectedDayData.dateStr}
                  </span>
                </h3>
              </div>
            </div>

            {/* Quick Metrics & Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Tổng lớp:</span>
                  <span className="font-bold text-amber-300 font-mono">{selectedDayData.classCount} lớp</span>
                </div>
                <div className="w-px h-6 bg-slate-800" />
                <div>
                  <span className="text-slate-400 text-[10px] block">Tổng HS:</span>
                  <span className="font-bold text-cyan-300 font-mono">{selectedDayData.studentCount} HS</span>
                </div>
                <div className="w-px h-6 bg-slate-800" />
                <div>
                  <span className="text-slate-400 text-[10px] block">Bánh sữa cần cấp:</span>
                  <span className="font-bold text-emerald-400 font-mono">{selectedDayData.milkCount} suất</span>
                </div>
              </div>

              {selectedDayData.classCount > 0 && (
                <button
                  onClick={() => setPrintSlipDayStr(selectedDayData.dateStr)}
                  className="px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all"
                  title="In phiếu bàn giao suất bánh sữa cho bếp ăn và giáo viên"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>In Phiếu Cấp Bánh Sữa</span>
                </button>
              )}

              <button
                onClick={() => setSelectedDayStr(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                title="Đóng chi tiết"
              >
                &times;
              </button>
            </div>
          </div>

          {/* List of Classes Scheduled on this Day */}
          {selectedDayData.classes.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Không có lớp ngoại khóa nào diễn ra vào ngày này theo điều kiện lọc hiện tại.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedDayData.classes.map((item, idx) => (
                <div 
                  key={idx}
                  className="p-4 rounded-2xl bg-slate-950 border border-slate-800/90 hover:border-amber-500/40 transition-all flex flex-col justify-between space-y-3"
                >
                  {/* Class Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[10px] font-bold border border-amber-500/20">
                          {item.subject?.category || 'Ngoại khóa'} &bull; {item.subject?.code}
                        </span>
                        <h4 className="font-extrabold text-white text-sm mt-1">
                          {item.classItem.name}
                        </h4>
                      </div>

                      {onSelectClassForAttendance && (
                        <button
                          onClick={() => {
                            onSelectClassForAttendance(item.classItem);
                          }}
                          className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 text-[11px] font-bold border border-slate-700 transition-all flex items-center gap-1 shrink-0"
                          title="Điểm danh buổi này"
                        >
                          <CheckCircle2 className="w-3 h-3 text-amber-400" />
                          <span>Điểm danh</span>
                        </button>
                      )}
                    </div>

                    {/* Class Metadata: Facility, TimeSlot, Teacher */}
                    <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">{item.timeSlot?.start_time} - {item.timeSlot?.end_time}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">{item.facility?.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{item.campus?.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="truncate">{item.teacher?.name}</span>
                      </div>
                    </div>
                  </div>

                  {/* Student & Milk Ration Breakdown */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-medium">Sĩ số học sinh:</span>
                      <span className="font-bold text-white font-mono">{item.countTotal} học sinh</span>
                    </div>

                    <div className="flex items-center justify-between text-emerald-400 font-bold bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20">
                      <span className="flex items-center gap-1">
                        <Coffee className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Suất bánh sữa cần cấp (Royal):</span>
                      </span>
                      <span className="font-mono text-emerald-300 text-sm font-extrabold">
                        {item.countRoyal} suất
                      </span>
                    </div>

                    {item.countOutside > 0 && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Học sinh ngoài trường (Không áp dụng bánh sữa):</span>
                        <span className="font-mono text-slate-300">{item.countOutside} em</span>
                      </div>
                    )}

                    {/* Students with medical / dietary allergy notes */}
                    {item.royalStudents.some(s => s.medical_notes) && (
                      <div className="pt-2 border-t border-slate-800 space-y-1">
                        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                          ⚠️ Lưu ý y tế & dị ứng thực phẩm bếp ăn:
                        </span>
                        {item.royalStudents
                          .filter(s => s.medical_notes)
                          .map(s => (
                            <div key={s.id} className="text-[11px] text-slate-300 flex items-start gap-1">
                              <span className="font-bold text-white">&bull; {s.name}:</span>
                              <span className="text-rose-300">{s.medical_notes}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* 4. MODAL IN PHIẾU BÀN GIAO BÁNH SỮA BẾP ĂN */}
      {printDayData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-2xl bg-white text-slate-900 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            {/* Slip Header */}
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="text-xs font-black tracking-widest uppercase text-amber-700">
                  ROYAL SCHOOL &bull; HỆ THỐNG TRƯỜNG SONG NGỮ HOÀNG GIA
                </div>
                <h2 className="text-xl font-black text-slate-900 mt-1">
                  PHIẾU XUẤT CẤP SUẤT ĂN NHẸ & BÁNH SỮA NGOẠI KHÓA
                </h2>
                <p className="text-xs text-slate-500">
                  Ngày áp dụng: <strong>{new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(printDayData.dateObj)}</strong>
                </p>
              </div>

              <button
                onClick={() => setPrintSlipDayStr(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                &times;
              </button>
            </div>

            {/* Slip Content Table */}
            <div className="space-y-4 text-xs">
              <table className="w-full border-collapse border border-slate-300 text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 font-bold text-slate-700">
                    <th className="border border-slate-300 p-2">Lớp Học</th>
                    <th className="border border-slate-300 p-2">Giờ Học</th>
                    <th className="border border-slate-300 p-2">Phòng / Sân</th>
                    <th className="border border-slate-300 p-2 text-center">Tổng HS</th>
                    <th className="border border-slate-300 p-2 text-center text-amber-700">Bánh Sữa Cấp</th>
                  </tr>
                </thead>
                <tbody>
                  {printDayData.classes.map((cls, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="border border-slate-300 p-2 font-bold">{cls.classItem.name}</td>
                      <td className="border border-slate-300 p-2">{cls.timeSlot?.start_time} - {cls.timeSlot?.end_time}</td>
                      <td className="border border-slate-300 p-2">{cls.facility?.name}</td>
                      <td className="border border-slate-300 p-2 text-center font-mono">{cls.countTotal}</td>
                      <td className="border border-slate-300 p-2 text-center font-mono font-bold text-amber-700 bg-amber-50">
                        {cls.countRoyal} suất
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-extrabold">
                    <td colSpan={3} className="border border-slate-300 p-2 text-right">TỔNG CỘNG SUẤT CẤP BẾP:</td>
                    <td className="border border-slate-300 p-2 text-center font-mono">{printDayData.studentCount} HS</td>
                    <td className="border border-slate-300 p-2 text-center font-mono text-amber-800 text-sm">
                      {printDayData.milkCount} SUẤT
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Special dietary notes summary */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-1">
                <span className="font-bold block">⚠️ DANH SÁCH LƯU Ý DỊ ỨNG & CHẾ ĐỘ SỮA TRONG NGÀY:</span>
                {printDayData.classes.flatMap(c => c.royalStudents.filter(s => s.medical_notes)).length === 0 ? (
                  <span>Tất cả học sinh dùng suất bánh sữa tiêu chuẩn của trường.</span>
                ) : (
                  printDayData.classes.flatMap(c => c.royalStudents.filter(s => s.medical_notes)).map((s, i) => (
                    <div key={i}>
                      &bull; <strong>{s.name}</strong> ({s.regular_class || 'Royal School'}): {s.medical_notes}
                    </div>
                  ))
                )}
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-4 pt-6 text-center text-xs text-slate-600">
                <div>
                  <div className="font-bold text-slate-800">BỘ PHẬN BẾP ĂN</div>
                  <div className="text-[10px] text-slate-400 italic mt-0.5">(Ký và ghi rõ họ tên)</div>
                  <div className="h-16" />
                </div>
                <div>
                  <div className="font-bold text-slate-800">GIÁO VỤ / ĐIỀU PHỐI</div>
                  <div className="text-[10px] text-slate-400 italic mt-0.5">(Ký và ghi rõ họ tên)</div>
                  <div className="h-16" />
                </div>
                <div>
                  <div className="font-bold text-slate-800">GIÁO VIÊN NHẬN BÁNH</div>
                  <div className="text-[10px] text-slate-400 italic mt-0.5">(Ký và ghi rõ họ tên)</div>
                  <div className="h-16" />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={() => setPrintSlipDayStr(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Đóng
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md"
              >
                <Printer className="w-4 h-4" />
                <span>Xác Nhận In Phiếu</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
