import React, { useMemo } from 'react';
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
  CalendarDays,
  Building2,
  Coins,
  BarChart3,
  BookOpen,
  School
} from 'lucide-react';
import { AppStore, formatVND, getCurrentTerm, formatDateVN } from '../../lib/storage';
import { Student, ExtracurricularClass } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { supabase } from '../../supabaseClient';
import { fetchOnce } from '../../lib/fetchOnce';

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
    const matchTerm = selectedTermId === 'all' || c.term_id === selectedTermId;
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

  // 3. DOANH THU KHÓA HIỆN TẠI & TÀI CHÍNH THU HỌC PHÍ (Khi selectedTermId = 'all', vẫn tính theo khóa hiện tại)
  const currentTerm =
    (selectedTermId && selectedTermId !== 'all'
      ? store.terms.find(t => t.id === selectedTermId)
      : undefined) ||
    getCurrentTerm(store.terms) ||
    store.terms[0];

  const currentTermClasses = store.classes.filter(c => {
    const matchCampus = selectedCampusId === 'all' || c.campus_id === selectedCampusId;
    return matchCampus && c.term_id === currentTerm?.id;
  });
  const currentTermClassIds = new Set(currentTermClasses.map(c => c.id));

  // Filter official invoices for current/selected term (exclude trial_pending and cancelled from official debt/billed KPIs)
  const currentTermInvoices = store.invoices.filter(
    i => currentTermClassIds.has(i.class_id) && i.payment_status !== 'cancelled' && !i.is_trial_pending
  );
  const termTotalRevenue = currentTermInvoices.reduce((acc, i) => acc + (i.net_payable || 0), 0);
  const termCollectedRevenue = currentTermInvoices.reduce((acc, i) => acc + (i.paid_amount || 0), 0);
  const termOutstandingRevenue = Math.max(0, termTotalRevenue - termCollectedRevenue);
  const termRecoveryRate = termTotalRevenue > 0
    ? Number(((termCollectedRevenue / termTotalRevenue) * 100).toFixed(1))
    : 0;
  const termRecoveryRateLabel = termTotalRevenue > 0
    ? ((termCollectedRevenue / termTotalRevenue) * 100).toFixed(1).replace('.', ',')
    : '0,0';

  const totalBilled = termTotalRevenue;
  const totalPaid = termCollectedRevenue;
  const totalDebt = termOutstandingRevenue;

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

  // ==========================================
  // KPI CALCULATIONS (Synchronized with Supabase & Local Store)
  // ==========================================
  // 1. Lấy danh sách ID học sinh đang học thực tế
  const totalStudents = store.students.length;
  const activeEnrollments = (store.enrollments || []).filter(e => e.status === 'active');
  const uniqueActiveStudentIds = Array.from(new Set(activeEnrollments.map(e => String(e.student_id || ''))))
    .filter(id => id !== '');

  // Số lượng học sinh đang học thực tế
  const activeStudentsCount = uniqueActiveStudentIds.length;

  // 2. HỌC VIÊN THEO CƠ SỞ (PMH vs Phú Lâm)
  const studentMap = React.useMemo(() => 
    new Map((store.students || []).map(s => [String(s.id || s.code), s])), 
    [store.students]
  );

  const classMap = React.useMemo(() => 
    new Map((store.classes || []).map(c => [String(c.id), c])), 
    [store.classes]
  );

  const { activePMH, activePL } = React.useMemo(() => {
    // NẾU KHÔNG CÓ HỌC SINH NÀO ĐANG HỌC -> CẢ 2 CƠ SỞ ĐỀU BẰNG 0
    if (uniqueActiveStudentIds.length === 0) {
      return { activePMH: 0, activePL: 0 };
    }

    let pmh = 0;
    let pl = 0;

    uniqueActiveStudentIds.forEach(studentId => {
      const student = studentMap.get(String(studentId));
      let campus = '';

      if (student?.campus_id) {
        campus = String(student.campus_id).toLowerCase();
      } else if (student?.school_name) {
        const sn = String(student.school_name).toLowerCase();
        if (sn.includes('pmh') || sn.includes('phú mỹ hưng') || sn.includes('phu my hung')) campus = 'pmh';
        else if (sn.includes('pl') || sn.includes('phú lâm') || sn.includes('phu lam')) campus = 'pl';
      }

      if (!campus) {
        const studentEnrolls = activeEnrollments.filter(e => String(e.student_id) === String(studentId));
        for (const enr of studentEnrolls) {
          const cls = classMap.get(String(enr.class_id));
          if (cls) {
            const cId = String(cls.campus_id || '').toLowerCase();
            if (cId.includes('pmh')) { campus = 'pmh'; break; }
            if (cId.includes('pl')) { campus = 'pl'; break; }
          }
        }
      }

      if (campus.includes('pl')) {
        pl += 1;
      } else if (campus.includes('pmh')) {
        pmh += 1;
      }
    });

    return { activePMH: pmh, activePL: pl };
  }, [uniqueActiveStudentIds, studentMap, classMap, activeEnrollments]);

  // Khóa học hiện tại đã được xác định phía trên (currentTerm)

  // Real-time Supabase sync fallback state
  const [liveDb, setLiveDb] = React.useState<{
    totalStudents?: number;
    activeCount?: number;
  } | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    const fetchLiveKPIs = async () => {
      const sbClient = supabase;
      if (!sbClient) return;
      try {
        const [{ count: sCount, error: sErr }, { data: enrData }] = await fetchOnce(
          'overview_kpi:live_counts',
          async () => {
            const [resStudents, resEnrollments] = await Promise.all([
              sbClient.from('students').select('*', { count: 'exact', head: true }),
              sbClient.from('enrollments').select('student_id').eq('status', 'active'),
            ]);
            return [resStudents, resEnrollments] as const;
          },
          60_000
        );

        if (!isMounted) return;

        if (!sErr && typeof sCount === 'number' && sCount > 0) {
          const uniqueIds = enrData ? Array.from(new Set(enrData.map((e: any) => e.student_id))) : [];
          setLiveDb({
            totalStudents: sCount,
            activeCount: uniqueIds.length,
          });
        }
      } catch (err) {
        // Fallback directly to local store
      }
    };
    fetchLiveKPIs();
    return () => { isMounted = false; };
  }, [selectedTermId]);

  // Đồng bộ với dữ liệu liveDb nếu có: Nếu tổng học viên đang học = 0 thì ép PMH và PL về 0
  const displayActiveStudents = liveDb?.activeCount ?? activeStudentsCount;
  const finalActivePMH = displayActiveStudents === 0 ? 0 : activePMH;
  const finalActivePL = displayActiveStudents === 0 ? 0 : activePL;

  const displayTotalStudents = liveDb?.totalStudents ?? totalStudents;
  const displayParticipationRate = displayTotalStudents > 0
    ? ((displayActiveStudents / displayTotalStudents) * 100).toFixed(1)
    : '0.0';

  const activePMHPercent = displayTotalStudents > 0 ? ((finalActivePMH / displayTotalStudents) * 100).toFixed(1) : '0.0';
  const activePLPercent = displayTotalStudents > 0 ? ((finalActivePL / displayTotalStudents) * 100).toFixed(1) : '0.0';
  const totalCampusActive = finalActivePMH + finalActivePL;
  const pmhRatio = totalCampusActive > 0 ? Math.round((finalActivePMH / totalCampusActive) * 100) : 0;
  const plRatio = totalCampusActive > 0 ? 100 - pmhRatio : 0;

  // 4. SỐ LƯỢNG ĐĂNG KÝ HỌC (Tổng lượt ghi danh của từng lớp cộng lại, 1 học sinh học 2 lớp = tính là 2)
  const enrollmentStats = React.useMemo(() => {
    // Lấy danh sách ghi danh đang hoạt động (active)
    const activeEnrs = (store.enrollments || []).filter(e => e.status === 'active' || !e.status);

    // Tạo map tra cứu cơ sở của từng lớp
    const classCampusMap = new Map<string, string>();
    (store.classes || []).forEach(cls => {
      const rawCampus = String(cls.campus_id || '').toLowerCase();
      const campusCode = (rawCampus.includes('pl') || cls.name.toUpperCase().includes('PL')) ? 'pl' : 'pmh';
      classCampusMap.set(String(cls.id), campusCode);
    });

    // Đếm theo từng lớp và từng cơ sở (1 học sinh học 2 lớp = tính là 2)
    let pmhCount = 0;
    let plCount = 0;

    activeEnrs.forEach(enr => {
      const campus = classCampusMap.get(String(enr.class_id)) || 'pmh';
      if (campus === 'pl') {
        plCount++;
      } else {
        pmhCount++;
      }
    });

    if (activeEnrs.length === 0) {
      (store.classes || []).forEach(cls => {
        const count = Number((cls as any).enrolled_count ?? cls.current_students) || 0;
        const campus = classCampusMap.get(String(cls.id)) || 'pmh';
        if (campus === 'pl') {
          plCount += count;
        } else {
          pmhCount += count;
        }
      });
    }

    const totalEnrollments = activeEnrs.length > 0
      ? (pmhCount + plCount)
      : (store.classes || []).reduce((acc, c) => acc + (Number((c as any).enrolled_count ?? c.current_students) || 0), 0);

    const pmhPercent = totalEnrollments > 0 ? ((pmhCount / totalEnrollments) * 100).toFixed(1) : '0.0';
    const plPercent = totalEnrollments > 0 ? ((plCount / totalEnrollments) * 100).toFixed(1) : '0.0';

    return {
      totalEnrollments,
      pmhCount,
      plCount,
      pmhPercent,
      plPercent,
    };
  }, [store.enrollments, store.classes]);

  // ============================================================================
  // TÍNH TOÁN THỐNG KÊ MÔN HỌC & CƠ CẤU HỌC SINH (THAY THẾ KHUNG CẢNH BÁO VẮNG)
  // ============================================================================
  const detailedStats = useMemo(() => {
    const activeEnrs = (store.enrollments || []).filter(e => e.status === 'active' || !e.status);
    const classes = store.classes || [];
    const subjects = store.subjects || [];
    const students = store.students || [];

    // 1. THỐNG KÊ LƯỢT ĐĂNG KÝ THEO MÔN HỌC (1 HS học 2 lớp cùng môn = tính 2 lượt)
    const subjectStatsMap = new Map<string, { id: string; name: string; pmh_count: number; pl_count: number; total_count: number }>();

    // Khởi tạo tất cả các môn học có trong hệ thống
    subjects.forEach(sub => {
      subjectStatsMap.set(String(sub.id), {
        id: String(sub.id),
        name: sub.name,
        pmh_count: 0,
        pl_count: 0,
        total_count: 0
      });
    });

    // Map tra cứu thông tin lớp học -> môn học & cơ sở
    const classInfoMap = new Map<string, { subject_id: string; subject_name: string; campus: 'pmh' | 'pl' }>();
    classes.forEach(cls => {
      const rawCampus = String(cls.campus_id || '').toLowerCase();
      const campus: 'pmh' | 'pl' = (rawCampus.includes('pl') || cls.name.toUpperCase().includes('PL')) ? 'pl' : 'pmh';
      const subId = String(cls.subject_id || cls.name.split('-')[0].trim());
      const matchedSub = subjects.find(s => String(s.id) === subId);

      classInfoMap.set(String(cls.id), {
        subject_id: subId,
        subject_name: matchedSub ? matchedSub.name : (cls.name.split('-')[0].trim() || 'Môn khác'),
        campus
      });
    });

    // Cộng dồn từng lượt đăng ký (enrollments)
    activeEnrs.forEach(enr => {
      const clsInfo = classInfoMap.get(String(enr.class_id));
      if (!clsInfo) return;

      let stat = subjectStatsMap.get(clsInfo.subject_id);
      if (!stat) {
        stat = {
          id: clsInfo.subject_id,
          name: clsInfo.subject_name,
          pmh_count: 0,
          pl_count: 0,
          total_count: 0
        };
        subjectStatsMap.set(clsInfo.subject_id, stat);
      }

      if (clsInfo.campus === 'pl') {
        stat.pl_count += 1;
      } else {
        stat.pmh_count += 1;
      }
      stat.total_count += 1;
    });

    const subjectList = Array.from(subjectStatsMap.values()).sort((a, b) => b.total_count - a.total_count);

    return { subjectList };
  }, [store.enrollments, store.classes, store.subjects]);

  const studentBreakdown = useMemo(() => {
    // Lấy danh sách học sinh (ưu tiên những em đang học active hoặc toàn bộ danh sách)
    const students = store.students || [];

    const counts = {
      // 1. Phổ thông Royal
      pt_royal_pmh: 0,
      pt_royal_pl: 0,
      // 2. Mầm non Royal
      mn_royal_pmh: 0,
      mn_royal_pl: 0,
      // 3. Phổ thông Ngoài
      pt_ext_pmh: 0,
      pt_ext_pl: 0,
      // 4. Mầm non Ngoài
      mn_ext_pmh: 0,
      mn_ext_pl: 0,
    };

    students.forEach((st) => {
      const isRoyal = Boolean(st.is_royal_student || String(st.code || '').startsWith('RY-'));
      const isPL = String(st.campus_id || '').toLowerCase().includes('pl');

      // Phân loại Mầm non vs Phổ thông
      const regClass = String(st.regular_class || '').toUpperCase();
      const isMN = regClass.includes('MN') || 
                   regClass.includes('MẦM') || 
                   regClass.includes('MAM') || 
                   regClass.includes('KINDY') || 
                   (st.dob && new Date().getFullYear() - new Date(st.dob).getFullYear() < 6);

      if (isRoyal) {
        if (isMN) {
          if (isPL) counts.mn_royal_pl++;
          else counts.mn_royal_pmh++;
        } else {
          if (isPL) counts.pt_royal_pl++;
          else counts.pt_royal_pmh++;
        }
      } else {
        if (isMN) {
          if (isPL) counts.mn_ext_pl++;
          else counts.mn_ext_pmh++;
        } else {
          if (isPL) counts.pt_ext_pl++;
          else counts.pt_ext_pmh++;
        }
      }
    });

    const total_pmh = counts.pt_royal_pmh + counts.mn_royal_pmh + counts.pt_ext_pmh + counts.mn_ext_pmh;
    const total_pl = counts.pt_royal_pl + counts.mn_royal_pl + counts.pt_ext_pl + counts.mn_ext_pl;
    const total_all = total_pmh + total_pl;

    return {
      rows: [
        {
          label: 'Học sinh Phổ thông Royal',
          color: 'bg-amber-400',
          textColor: 'text-amber-300',
          pmh: counts.pt_royal_pmh,
          pl: counts.pt_royal_pl,
          total: counts.pt_royal_pmh + counts.pt_royal_pl
        },
        {
          label: 'Học sinh Mầm non Royal',
          color: 'bg-pink-400',
          textColor: 'text-pink-300',
          pmh: counts.mn_royal_pmh,
          pl: counts.mn_royal_pl,
          total: counts.mn_royal_pmh + counts.mn_royal_pl
        },
        {
          label: 'Học sinh Phổ thông Ngoài trường',
          color: 'bg-blue-400',
          textColor: 'text-blue-300',
          pmh: counts.pt_ext_pmh,
          pl: counts.pt_ext_pl,
          total: counts.pt_ext_pmh + counts.pt_ext_pl
        },
        {
          label: 'Học sinh Mầm non Ngoài trường',
          color: 'bg-purple-400',
          textColor: 'text-purple-300',
          pmh: counts.mn_ext_pmh,
          pl: counts.mn_ext_pl,
          total: counts.mn_ext_pmh + counts.mn_ext_pl
        }
      ],
      total_pmh,
      total_pl,
      total_all,
      royal_percent: total_all > 0 ? (((counts.pt_royal_pmh + counts.pt_royal_pl + counts.mn_royal_pmh + counts.mn_royal_pl) / total_all) * 100).toFixed(1) : '0.0',
      pt_percent: total_all > 0 ? (((counts.pt_royal_pmh + counts.pt_royal_pl + counts.pt_ext_pmh + counts.pt_ext_pl) / total_all) * 100).toFixed(1) : '0.0'
    };
  }, [store.students]);

  return (
    <div className="space-y-4">
      
      {/* 4 Large KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Thẻ 1: TỔNG HỌC VIÊN ĐANG HỌC */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-4 sm:p-4.5 backdrop-blur-md relative overflow-hidden shadow-xl hover:border-blue-500/30 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Tổng Học Viên Đang Học
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {displayActiveStudents}
            </span>
            <span className="text-xs text-blue-400 font-medium">học sinh đang học</span>
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Trên tổng số <span className="text-white font-semibold">{displayTotalStudents}</span> học sinh toàn trường
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <TrendingUp className="w-3 h-3" />
              Tỷ lệ tham gia: {displayParticipationRate}%
            </span>
          </div>
        </div>

        {/* Thẻ 2: HỌC VIÊN THEO CƠ SỞ */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-4 sm:p-4.5 backdrop-blur-md relative overflow-hidden shadow-xl hover:border-amber-500/30 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Học Viên Theo Cơ Sở
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                PMH:
              </span>
              <span className="font-semibold text-white">
                {finalActivePMH}/{displayTotalStudents} <span className="text-amber-400 text-[11px]">({activePMHPercent}%)</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                Phú Lâm:
              </span>
              <span className="font-semibold text-white">
                {finalActivePL}/{displayTotalStudents} <span className="text-cyan-400 text-[11px]">({activePLPercent}%)</span>
              </span>
            </div>
          </div>
          {/* Dual progress bar */}
          <div className="mt-2.5 w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
            <div
              className="bg-amber-500 h-full transition-all duration-500"
              style={{ width: `${pmhRatio}%` }}
              title={`Phú Mỹ Hưng: ${pmhRatio}%`}
            />
            <div
              className="bg-cyan-500 h-full transition-all duration-500"
              style={{ width: `${plRatio}%` }}
              title={`Phú Lâm: ${plRatio}%`}
            />
          </div>
        </div>

        {/* Thẻ 3: DOANH THU KHÓA HIỆN TẠI */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-4 sm:p-4.5 backdrop-blur-md relative overflow-hidden shadow-xl hover:border-emerald-500/30 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Doanh Thu Khóa Hiện Tại
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-extrabold text-emerald-400 tracking-tight">
              {formatVND(termTotalRevenue)}
            </span>
          </div>
          <div className="mt-1 text-[11px] sm:text-xs text-slate-400 truncate">
            Đã thu: <span className="text-emerald-400 font-semibold">{formatVND(termCollectedRevenue)}</span> • Còn nợ: <span className="text-rose-400 font-semibold">{formatVND(termOutstandingRevenue)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mr-2">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, termRecoveryRate)}%` }}
              />
            </div>
            <span className="text-slate-400 whitespace-nowrap text-[11px] font-medium">
              Thu hồi: <strong className="text-emerald-400">{termRecoveryRateLabel}%</strong>
            </span>
          </div>
          {currentTerm && (
            <div className="mt-1.5 text-[10.5px] text-slate-400 truncate font-medium">
              {currentTerm.name} ({formatDateVN(currentTerm.start_date)} – {formatDateVN(currentTerm.end_date)})
            </div>
          )}
        </div>

        {/* Thẻ 4: SỐ LƯỢNG ĐĂNG KÝ HỌC */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-4 sm:p-4.5 backdrop-blur-md relative overflow-hidden shadow-xl hover:border-cyan-500/30 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Số Lượng Đăng Ký Học
            </span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-cyan-400 tracking-tight">
              {enrollmentStats.totalEnrollments}
            </span>
            <span className="text-xs text-slate-400 font-medium">lượt đăng ký lớp</span>
          </div>
          <div className="mt-1.5 space-y-0.5 text-[11px] sm:text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                PMH:
              </span>
              <span className="font-semibold text-white">
                {enrollmentStats.pmhCount} lượt <span className="text-amber-400">({enrollmentStats.pmhPercent}%)</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                Phú Lâm:
              </span>
              <span className="font-semibold text-white">
                {enrollmentStats.plCount} lượt <span className="text-cyan-400">({enrollmentStats.plPercent}%)</span>
              </span>
            </div>
          </div>
          <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden flex">
            <div
              className="bg-amber-500 h-full transition-all duration-500"
              style={{ width: `${Number(enrollmentStats.pmhPercent)}%` }}
              title={`Phú Mỹ Hưng: ${enrollmentStats.pmhCount} lượt (${enrollmentStats.pmhPercent}%)`}
            />
            <div
              className="bg-cyan-500 h-full transition-all duration-500"
              style={{ width: `${Number(enrollmentStats.plPercent)}%` }}
              title={`Phú Lâm: ${enrollmentStats.plCount} lượt (${enrollmentStats.plPercent}%)`}
            />
          </div>
        </div>
      </div>

      {/* HÀNG 2: THỐNG KÊ NHANH TUYỂN SINH & CƠ CẤU HỌC VIÊN (CHIẾM HẾT CHIỀU NGANG 100%) */}
      <div className="w-full rounded-3xl bg-[#111827]/90 border border-slate-800 p-6 shadow-xl space-y-5 animate-fadeIn">
        {/* Header của khối */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-800/80 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-white">
                  Thống Kê Nhanh Tuyển Sinh & Cơ Cấu Học Viên
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold font-mono">
                  ● Real-time
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Tổng hợp lượt đăng ký theo từng môn học (1 HS học 2 lớp = tính 2 lượt) và phân bổ cấp học Mầm non / Phổ thông, Royal / Ngoài trường
              </p>
            </div>
          </div>
        </div>

        {/* Nội dung 2 Bảng hiển thị song song trải rộng */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* BẢNG 1: SỐ LƯỢNG ĐĂNG KÝ TỪNG MÔN THEO CƠ SỞ (Chiếm 7/12 chiều ngang) */}
          <div className="lg:col-span-7 flex flex-col space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>1. Số Lượng Đăng Ký Từng Môn Học Theo Cơ Sở</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Đơn vị: <strong className="text-cyan-400">Lượt đăng ký lớp</strong>
              </span>
            </div>

            <div className="rounded-2xl bg-slate-950/80 border border-slate-800/80 overflow-hidden flex-1 shadow-inner flex flex-col justify-between">
              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 sticky top-0 text-[10.5px] font-bold uppercase text-slate-400 border-b border-slate-800 z-10">
                    <tr>
                      <th className="py-3 px-4 font-bold text-slate-300">Tên Môn Học</th>
                      <th className="py-3 px-3 text-center text-amber-400 font-bold w-24">PMH</th>
                      <th className="py-3 px-3 text-center text-cyan-400 font-bold w-24">Phú Lâm</th>
                      <th className="py-3 px-4 text-right text-emerald-400 font-bold w-28">Tổng Lượt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {detailedStats.subjectList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          Chưa có dữ liệu môn học
                        </td>
                      </tr>
                    ) : (
                      detailedStats.subjectList.map((sub) => (
                        <tr key={sub.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-4 font-semibold text-slate-200">{sub.name}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-amber-300 font-semibold w-24">
                            {sub.pmh_count}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-cyan-300 font-semibold w-24">
                            {sub.pl_count}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400 w-28">
                            {sub.total_count} lượt
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-slate-900/95 border-t border-slate-800 font-bold text-xs sticky bottom-0">
                    <tr>
                      <td className="py-3 px-4 text-white uppercase">Tổng Cộng Tất Cả Môn</td>
                      <td className="py-3 px-3 text-center font-mono text-amber-400 w-24">
                        {detailedStats.subjectList.reduce((sum, s) => sum + s.pmh_count, 0)}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-cyan-400 w-24">
                        {detailedStats.subjectList.reduce((sum, s) => sum + s.pl_count, 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400 w-28">
                        {detailedStats.subjectList.reduce((sum, s) => sum + s.total_count, 0)} lượt
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* BẢNG 2: CƠ CẤU CẤP HỌC & ĐỐI TƯỢNG HỌC SINH */}
          <div className="lg:col-span-5 flex flex-col space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5 uppercase tracking-wide">
                <School className="w-4 h-4 text-cyan-400" />
                <span>2. Cơ Cấu Cấp Học & Đối Tượng</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Tổng: <strong className="text-white">{studentBreakdown.total_all} HS</strong>
              </span>
            </div>

            <div className="rounded-2xl bg-slate-950/80 border border-slate-800/80 overflow-hidden flex-1 shadow-inner flex flex-col justify-between">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-[10.5px] font-bold uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Phân Loại Học Viên</th>
                      <th className="py-3 px-3 text-center text-amber-400 font-bold w-20">PMH</th>
                      <th className="py-3 px-3 text-center text-cyan-400 font-bold w-20">Phú Lâm</th>
                      <th className="py-3 px-4 text-right text-emerald-400 font-bold w-24">Toàn Trường</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {studentBreakdown.rows.map((row, index) => (
                      <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-4 font-medium flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${row.color}`}></span>
                          <span className="text-slate-200">{row.label}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-200">
                          {row.pmh > 0 ? (
                            <span className="text-amber-300">{row.pmh}</span>
                          ) : (
                            <span className="text-slate-600">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-200">
                          {row.pl > 0 ? (
                            <span className="text-cyan-300">{row.pl}</span>
                          ) : (
                            <span className="text-slate-600">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold">
                          <span className={row.textColor}>{row.total} HS</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Dòng tổng cộng */}
                  <tfoot className="bg-slate-900/90 font-bold border-t border-slate-800 text-xs">
                    <tr>
                      <td className="py-3 px-4 text-white uppercase font-black">
                        Tổng Cộng Học Sinh
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-amber-400 text-sm">
                        {studentBreakdown.total_pmh}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-cyan-400 text-sm">
                        {studentBreakdown.total_pl}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400 text-sm">
                        {studentBreakdown.total_all} HS
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Footer hiển thị tỷ lệ */}
              <div className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">
                  Tỷ lệ HS Royal: <strong className="text-amber-400">{studentBreakdown.royal_percent}%</strong>
                </span>
                <span className="text-slate-400">
                  Tỷ lệ Phổ thông: <strong className="text-cyan-400">{studentBreakdown.pt_percent}%</strong>
                </span>
              </div>
            </div>
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

          <div className="mt-5 pt-4 border-t border-slate-800 space-y-2.5">
            {currentTerm && (
              <div className="text-[11px] text-slate-400 text-center font-medium">
                {currentTerm.name} ({formatDateVN(currentTerm.start_date)} – {formatDateVN(currentTerm.end_date)})
              </div>
            )}
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
