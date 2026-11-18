import React, { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  Users,
  Search,
  Download,
  Calendar,
  ArrowUpRight,
  Phone,
  CheckCircle2,
  Clock,
  XCircle,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import {
  AppStore,
  formatDateVN,
  formatDateShortVN,
  formatDaysListLabel,
  getClassDaysOfWeek,
  getClassEffectiveBounds,
  getClassEnrollmentStatsMap,
  getClassPhase,
  getEnrollmentStartDate,
  getEnrollmentStatusDisplay,
  getPromotedTargetInfo,
  getTodayStrHoChiMinh,
} from '../../lib/storage';
import { Enrollment, ExtracurricularClass, Student } from '../../types';
import { sortByLabelVi } from '../../utils/sortVi';
import { getSupabaseClient, supabase } from '../../supabaseClient';
import { showToast } from '../../lib/toast';

interface ClassRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  classItem: ExtracurricularClass | null;
  store: AppStore;
  onUpdateStore?: (updater: (prev: AppStore) => AppStore) => void;
  onNavigateToAttendance?: (cls: ExtracurricularClass) => void;
}

type RosterFilterStatus = 'all' | 'active' | 'completed' | 'trial' | 'dropped';

export const ClassRosterModal: React.FC<ClassRosterModalProps> = ({
  isOpen,
  onClose,
  classItem,
  store,
  onUpdateStore,
  onNavigateToAttendance,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<RosterFilterStatus>('all');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const todayStr = useMemo(() => getTodayStrHoChiMinh(), []);

  useEffect(() => {
    if (!isOpen || !classItem) return;
    setSearchQuery('');
    setStatusFilter('all');

    let cancelled = false;
    const refreshClassEnrollments = async () => {
      const client = getSupabaseClient() || supabase;
      if (!client || !onUpdateStore) return;
      setIsRefreshing(true);
      try {
        const [enrRes, promRes] = await Promise.all([
          client.from('enrollments').select('*').eq('class_id', classItem.id),
          client
            .from('enrollments')
            .select('*')
            .eq('promoted_from_class_id', classItem.id),
        ]);

        if (cancelled) return;
        const fetchedRows = [
          ...(Array.isArray(enrRes.data) ? enrRes.data : []),
          ...(Array.isArray(promRes.data) ? promRes.data : []),
        ];
        if (fetchedRows.length === 0) return;

        onUpdateStore(prev => {
          const map = new Map<string, Enrollment>();
          for (const e of prev.enrollments || []) {
            map.set(e.id, e);
          }
          for (const r of fetchedRows as any[]) {
            const isTrial = Boolean(
              (r.is_trial === true || r.enrollment_type === 'trial') &&
                r.status !== 'active'
            );
            const existing = map.get(r.id);
            map.set(r.id, {
              ...(existing || {}),
              id: r.id,
              student_id: r.student_id,
              class_id: r.class_id,
              registered_sessions:
                Number(r.registered_sessions || r.total_sessions) ||
                existing?.registered_sessions ||
                24,
              joined_date:
                (r.joined_date ? String(r.joined_date).split('T')[0] : '') ||
                (r.start_date ? String(r.start_date).split('T')[0] : '') ||
                existing?.joined_date ||
                todayStr,
              start_date: r.start_date ? String(r.start_date).split('T')[0] : existing?.start_date,
              dropped_date:
                (r.dropped_date || r.left_date || r.withdrawn_date)
                  ? String(r.dropped_date || r.left_date || r.withdrawn_date).split('T')[0]
                  : existing?.dropped_date,
              end_date: r.end_date ? String(r.end_date).split('T')[0] : existing?.end_date,
              enrolled_days_of_week: Array.isArray(r.enrolled_days_of_week)
                ? r.enrolled_days_of_week
                : existing?.enrolled_days_of_week,
              is_partial_schedule: Boolean(
                r.is_partial_schedule ?? existing?.is_partial_schedule
              ),
              is_trial: isTrial,
              trial_session_date:
                r.trial_session_date || existing?.trial_session_date,
              trial_attended: Boolean(
                r.trial_attended ?? existing?.trial_attended
              ),
              status: isTrial
                ? 'trial'
                : r.status === 'dropped' ||
                  r.status === 'trial_dropped' ||
                  r.status === 'completed' ||
                  r.status === 'transferred'
                ? r.status
                : 'active',
              promoted_from_enrollment_id:
                r.promoted_from_enrollment_id ||
                existing?.promoted_from_enrollment_id,
              promoted_from_class_id:
                r.promoted_from_class_id || existing?.promoted_from_class_id,
              promotion_batch_id:
                r.promotion_batch_id || existing?.promotion_batch_id,
            });
          }
          return {
            ...prev,
            enrollments: Array.from(map.values()),
          };
        });
      } catch {
        // Giữ dữ liệu hiện có trong store nếu offline/lỗi mạng
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };

    void refreshClassEnrollments();
    return () => {
      cancelled = true;
    };
  }, [isOpen, classItem?.id]);

  const classPhase = useMemo(
    () => (classItem ? getClassPhase(classItem, todayStr, store.terms) : 'active'),
    [classItem, todayStr, store.terms]
  );

  const classBounds = useMemo(
    () => (classItem ? getClassEffectiveBounds(classItem, store.terms) : { startDate: '', endDate: '' }),
    [classItem, store.terms]
  );

  const classDays = useMemo(
    () => (classItem ? getClassDaysOfWeek(classItem, store.timeSlots) : ['T2', 'T4']),
    [classItem, store.timeSlots]
  );

  const studentMap = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of store.students || []) {
      if (s.id) m.set(String(s.id), s);
      if (s.code) m.set(String(s.code), s);
    }
    return m;
  }, [store.students]);

  const classStats = useMemo(() => {
    if (!classItem) return null;
    const statsMap = getClassEnrollmentStatsMap(store.enrollments || []);
    return (
      statsMap.get(classItem.id) || {
        activeCount: 0,
        trialCount: 0,
        activeAndTrialCount: 0,
        completedCount: 0,
        droppedCount: 0,
        transferredCount: 0,
        totalCount: 0,
        enrollments: [] as Enrollment[],
      }
    );
  }, [classItem, store.enrollments]);

  const rosterRows = useMemo(() => {
    if (!classItem || !classStats) return [];

    const rows = classStats.enrollments.map(enr => {
      const student = studentMap.get(String(enr.student_id));
      const statusDisplay = getEnrollmentStatusDisplay(
        enr,
        classItem,
        todayStr,
        store.terms
      );
      const promotedInfo = getPromotedTargetInfo(
        enr,
        store.enrollments || [],
        store.classes || [],
        store.promotionHistories || []
      );
      const studentDays =
        enr.enrolled_days_of_week && enr.enrolled_days_of_week.length > 0
          ? enr.enrolled_days_of_week
          : classDays;

      return {
        enrollment: enr,
        student,
        studentName: student?.name || `Học viên (${enr.student_id})`,
        studentCode: student?.code || enr.student_id,
        statusDisplay,
        promotedInfo,
        studentDays,
      };
    });

    return sortByLabelVi(rows, r => r.studentName);
  }, [
    classItem,
    classStats,
    studentMap,
    todayStr,
    store.terms,
    store.enrollments,
    store.classes,
    store.promotionHistories,
    classDays,
  ]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rosterRows.filter(row => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && row.statusDisplay.tone !== 'active' && row.statusDisplay.tone !== 'upcoming') {
          return false;
        }
        if (statusFilter === 'completed' && row.statusDisplay.tone !== 'completed') {
          return false;
        }
        if (statusFilter === 'trial' && row.statusDisplay.tone !== 'trial') {
          return false;
        }
        if (statusFilter === 'dropped' && row.statusDisplay.tone !== 'dropped' && row.statusDisplay.tone !== 'transferred') {
          return false;
        }
      }

      if (q) {
        const hay = [
          row.studentName,
          row.studentCode,
          row.student?.parent_phone || '',
          row.student?.parent_name || '',
          row.promotedInfo?.targetClass.name || '',
          row.promotedInfo?.targetClass.code || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [rosterRows, statusFilter, searchQuery]);

  if (!isOpen || !classItem) return null;

  const subject = store.subjects.find(s => s.id === classItem.subject_id);
  const campus = store.campuses.find(c => c.id === classItem.campus_id);
  const term = store.terms.find(t => t.id === classItem.term_id);
  const teacher = store.teachers.find(t => t.id === classItem.primary_teacher_id);

  const handleExportExcel = () => {
    try {
      const exportData = filteredRows.map((row, idx) => ({
        STT: idx + 1,
        'Mã Học Viên': row.studentCode,
        'Họ và Tên': row.studentName,
        'Phân Loại': row.student?.is_royal_student ? 'Royal School' : 'Ngoài trường',
        'Lớp Chính Khóa': row.student?.regular_class || '',
        'SĐT Phụ Huynh': row.student?.parent_phone || '',
        'Lịch Học': formatDaysListLabel(row.studentDays),
        'Số Buổi ĐK': row.enrollment.registered_sessions || classItem.total_sessions || 0,
        'Ngày Bắt Đầu': formatDateVN(getEnrollmentStartDate(row.enrollment, classItem)),
        'Trạng Thái': row.statusDisplay.label,
        'Lớp Đã Xếp Tiếp': row.promotedInfo
          ? `${row.promotedInfo.targetClass.name} (${row.promotedInfo.targetClass.code || row.promotedInfo.targetClass.id})`
          : '',
        'Bắt Đầu Lớp Mới': row.promotedInfo?.startDate
          ? formatDateVN(row.promotedInfo.startDate)
          : '',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 15 },
        { wch: 26 },
        { wch: 14 },
        { wch: 14 },
        { wch: 15 },
        { wch: 14 },
        { wch: 12 },
        { wch: 14 },
        { wch: 16 },
        { wch: 30 },
        { wch: 16 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Hoc_Vien');
      const safeCode = (classItem.code || classItem.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      XLSX.writeFile(wb, `DanhSachHocVien_${safeCode}_${todayStr}.xlsx`);
      showToast(`Đã xuất danh sách ${filteredRows.length} học viên lớp ${classItem.name} ra Excel.`, 'success', {
        title: 'Xuất Excel thành công',
      });
    } catch (err: any) {
      showToast('Không thể xuất file Excel: ' + (err?.message || String(err)), 'error');
    }
  };

  const renderStatusBadge = (tone: string, label: string) => {
    const clsMap: Record<string, string> = {
      active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      completed: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
      trial: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      dropped: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      transferred: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      upcoming: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    };
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
          clsMap[tone] || 'bg-slate-800 text-slate-300 border-slate-700'
        }`}
      >
        {tone === 'completed' || tone === 'active' ? (
          <CheckCircle2 className="w-3 h-3 shrink-0" />
        ) : tone === 'dropped' ? (
          <XCircle className="w-3 h-3 shrink-0" />
        ) : tone === 'trial' ? (
          <Sparkles className="w-3 h-3 shrink-0" />
        ) : (
          <Clock className="w-3 h-3 shrink-0" />
        )}
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-3xl bg-[#0F172A] border border-slate-700/80 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
                Danh sách học viên — {classItem.name}
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${
                  classPhase === 'upcoming'
                    ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                    : classPhase === 'ended'
                    ? 'bg-slate-800 text-slate-300 border-slate-700'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}
              >
                {classPhase === 'upcoming'
                  ? 'Sắp bắt đầu'
                  : classPhase === 'ended'
                  ? 'Đã kết thúc'
                  : 'Đang học'}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400">
              <span className="font-mono text-amber-300 font-semibold">
                {classItem.code || classItem.id}
              </span>
              {campus && <span>&bull; {campus.name}</span>}
              {term && <span>&bull; {term.name}</span>}
              {subject && (
                <span className="inline-flex items-center gap-1 text-slate-300">
                  &bull; <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                  {subject.name}
                </span>
              )}
              {teacher && <span>&bull; GV: {teacher.name}</span>}
              {(classBounds.startDate || classBounds.endDate) && (
                <span className="inline-flex items-center gap-1 font-mono text-cyan-300">
                  &bull; <Calendar className="w-3.5 h-3.5" />
                  {formatDateVN(classBounds.startDate)} &rarr; {formatDateVN(classBounds.endDate)}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0 cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Strip & Filters */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Segmented Filter Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all' as RosterFilterStatus, label: `Tất cả (${rosterRows.length})` },
                {
                  id: 'active' as RosterFilterStatus,
                  label: `Đang học (${rosterRows.filter(r => r.statusDisplay.tone === 'active' || r.statusDisplay.tone === 'upcoming').length})`,
                },
                {
                  id: 'completed' as RosterFilterStatus,
                  label: `Đã hoàn thành (${rosterRows.filter(r => r.statusDisplay.tone === 'completed').length})`,
                },
                {
                  id: 'trial' as RosterFilterStatus,
                  label: `Học thử (${rosterRows.filter(r => r.statusDisplay.tone === 'trial').length})`,
                },
                {
                  id: 'dropped' as RosterFilterStatus,
                  label: `Đã nghỉ (${rosterRows.filter(r => r.statusDisplay.tone === 'dropped' || r.statusDisplay.tone === 'transferred').length})`,
                },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors tabular-nums cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-900 text-slate-300 border-slate-700/80 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên, mã HV, SĐT, lớp mới..."
                  className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleExportExcel}
                disabled={filteredRows.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Xuất Excel ({filteredRows.length})</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="tabular-nums">
              {classPhase === 'ended' ? (
                <>
                  Tổng kết lớp: <strong className="text-cyan-300">{classStats?.completedCount || 0} học viên đã hoàn thành</strong>
                  {(classStats?.droppedCount || 0) > 0 && (
                    <> &bull; <strong className="text-rose-300">{classStats?.droppedCount} đã nghỉ</strong></>
                  )}
                  {(classStats?.activeAndTrialCount || 0) > 0 && (
                    <> &bull; <strong className="text-amber-300">{classStats?.activeAndTrialCount} chưa chốt lên lớp</strong></>
                  )}
                </>
              ) : (
                <>
                  Sĩ số đang học: <strong className="text-white">{classStats?.activeAndTrialCount || 0} / {classItem.max_students}</strong> học viên
                  {(classStats?.trialCount || 0) > 0 && (
                    <> (<strong className="text-purple-300">{classStats?.trialCount} học thử</strong>)</>
                  )}
                  {(classStats?.droppedCount || 0) > 0 && (
                    <> &bull; <strong className="text-rose-300">{classStats?.droppedCount} đã nghỉ</strong></>
                  )}
                </>
              )}
            </span>
            {isRefreshing && <span className="text-amber-400">Đang đồng bộ danh sách...</span>}
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto">
          {filteredRows.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-slate-300">
                Không có học viên nào phù hợp
              </div>
              <p className="text-xs text-slate-500">
                Thử thay đổi bộ lọc trạng thái hoặc từ khóa tìm kiếm.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/95 sticky top-0 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800 z-10">
                <tr>
                  <th className="py-3 px-4 w-12">STT</th>
                  <th className="py-3 px-4 w-32">Mã HV</th>
                  <th className="py-3 px-4">Họ và Tên</th>
                  <th className="py-3 px-4">Lịch Học &amp; Thời Gian</th>
                  <th className="py-3 px-4">Trạng Thái</th>
                  <th className="py-3 px-4">Thông Tin Lên Lớp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredRows.map((row, idx) => (
                  <tr key={row.enrollment.id} className="hover:bg-slate-800/35 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-500 tabular-nums">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md font-mono font-bold tabular-nums text-[11px] ${
                          row.student?.is_royal_student
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {row.studentCode}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-white text-sm">{row.studentName}</div>
                      <div className="flex items-center gap-2.5 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                        <span>{row.student?.is_royal_student ? 'Royal School' : 'Ngoài trường'}</span>
                        {row.student?.regular_class && (
                          <span>&bull; Lớp {row.student.regular_class}</span>
                        )}
                        {row.student?.parent_phone && (
                          <span className="inline-flex items-center gap-1 font-mono text-slate-300">
                            &bull; <Phone className="w-3 h-3 text-slate-500" />
                            {row.student.parent_phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <div className="font-semibold text-slate-200">
                        {formatDaysListLabel(row.studentDays)} ({row.enrollment.registered_sessions || classItem.total_sessions || 0} buổi)
                      </div>
                      {getEnrollmentStartDate(row.enrollment, classItem) && (
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Từ ngày {formatDateVN(getEnrollmentStartDate(row.enrollment, classItem))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {renderStatusBadge(row.statusDisplay.tone, row.statusDisplay.label)}
                    </td>
                    <td className="py-3 px-4">
                      {row.promotedInfo ? (
                        <div className="space-y-0.5">
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold"
                            title={`${row.promotedInfo.targetClass.name} (bắt đầu ${formatDateVN(row.promotedInfo.startDate)})`}
                          >
                            <ArrowUpRight className="w-3 h-3 shrink-0" />
                            <span>
                              Đã xếp lớp {row.promotedInfo.targetClass.code || row.promotedInfo.targetClass.name} từ {formatDateShortVN(row.promotedInfo.startDate)}
                            </span>
                          </span>
                          <div className="text-[10.5px] text-slate-400 truncate max-w-[240px]">
                            {row.promotedInfo.targetClass.name}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-slate-400">
            Hiển thị tất cả bản ghi danh lịch sử (Đang học, Đã hoàn thành, Học thử, Đã nghỉ).
          </span>
          <div className="flex items-center gap-2.5">
            {onNavigateToAttendance && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToAttendance(classItem);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-colors cursor-pointer"
              >
                Mở Sổ Điểm Danh
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
