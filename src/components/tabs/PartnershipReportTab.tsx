import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  RotateCcw,
  Calculator,
  Building2,
  Calendar,
  BookOpen,
  SlidersHorizontal,
  CheckCircle2,
  Sparkles,
  Search,
  Percent,
} from 'lucide-react';
import {
  AppStore,
  formatVND,
  formatDateVN,
  formatDaysListLabel,
  getClassDaysOfWeek,
  getCurrentTerm,
} from '../../lib/storage';
import {
  PartnershipReportItem,
  exportPartnershipExcel,
} from '../../services/partnershipReportExport';
import { showToast } from '../../lib/toast';

interface PartnershipReportTabProps {
  store: AppStore;
  selectedCampusId?: string;
  selectedTermId?: string;
}

interface EditableSpreadsheetRow extends PartnershipReportItem {
  rowId: string;
}

const EXCEL_COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export const PartnershipReportTab: React.FC<PartnershipReportTabProps> = ({
  store,
  selectedCampusId = 'all',
  selectedTermId = '',
}) => {
  // 1. Bộ lọc trích xuất báo cáo
  const [campusFilter, setCampusFilter] = useState<string>(
    selectedCampusId && selectedCampusId !== 'all' ? selectedCampusId : 'camp_pmh'
  );
  const [termFilter, setTermFilter] = useState<string>(() => {
    if (selectedTermId && selectedTermId !== 'all') return selectedTermId;
    return (
      getCurrentTerm(store.terms)?.id ||
      store.terms[0]?.id ||
      ''
    );
  });
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [autoRecalcPaidOnEdit, setAutoRecalcPaidOnEdit] = useState<boolean>(true);

  // Tỷ lệ chia sẻ doanh thu Bên A / Bên B (Mặc định 50% - 50%)
  const [ratioAPercent, setRatioAPercent] = useState<number>(50);
  const [ratioBPercent, setRatioBPercent] = useState<number>(50);
  const [partyALabel, setPartyALabel] = useState<string>('BÊN A');
  const [partyBLabel, setPartyBLabel] = useState<string>('BÊN B');
  const [standardSessionsCount, setStandardSessionsCount] = useState<number>(16);

  // Tiêu đề nhóm lịch học có thể chỉnh sửa trực tiếp trên bảng tính
  const [customScheduleGroupText, setCustomScheduleGroupText] = useState<string>('');
  const [selectedCellInfo, setSelectedCellInfo] = useState<{
    coord: string;
    label: string;
    value: string | number;
    rowIndex?: number;
  } | null>(null);

  // Khi đổi môn học thì reset lọc lớp về 'all'
  useEffect(() => {
    setClassFilter('all');
  }, [subjectFilter, campusFilter, termFilter]);

  // Thông tin Cơ sở, Khóa học, Môn học đang chọn
  const currentCampusObj = useMemo(() => {
    if (campusFilter === 'all') return null;
    return store.campuses.find(c => c.id === campusFilter) || null;
  }, [store.campuses, campusFilter]);

  const campusDisplayName = useMemo(() => {
    if (!currentCampusObj) {
      if (campusFilter === 'camp_pl') return 'CƠ SỞ PHÚ LÂM';
      if (campusFilter === 'camp_pmh') return 'CƠ SỞ PHÚ MỸ HƯNG';
      return 'TOÀN TRƯỜNG (PMH & PHÚ LÂM)';
    }
    return currentCampusObj.name.toUpperCase();
  }, [currentCampusObj, campusFilter]);

  const currentTermObj = useMemo(() => {
    return store.terms.find(t => t.id === termFilter) || store.terms[0] || null;
  }, [store.terms, termFilter]);

  const termNameText = useMemo(() => {
    return currentTermObj?.name || 'KHÓA HỌC NGOẠI KHÓA';
  }, [currentTermObj]);

  const termPeriodText = useMemo(() => {
    if (!currentTermObj) return '01/09/2026 - 31/12/2026';
    const start = formatDateVN(currentTermObj.start_date);
    const end = formatDateVN(currentTermObj.end_date);
    return `${start} - ${end}`;
  }, [currentTermObj]);

  const academicYearText = useMemo(() => {
    return currentTermObj?.academic_year || '2026-2027';
  }, [currentTermObj]);

  const currentSubjectObj = useMemo(() => {
    if (subjectFilter === 'all') return null;
    return store.subjects.find(s => s.id === subjectFilter) || null;
  }, [store.subjects, subjectFilter]);

  const subjectDisplayName = useMemo(() => {
    if (currentSubjectObj) return currentSubjectObj.name;
    if (classFilter !== 'all') {
      const cls = store.classes.find(c => c.id === classFilter);
      const sub = store.subjects.find(s => s.id === cls?.subject_id);
      if (sub) return sub.name;
    }
    return 'TẤT CẢ CÁC MÔN NGOẠI KHÓA';
  }, [currentSubjectObj, classFilter, store.classes, store.subjects]);

  // Danh sách các lớp thuộc bộ lọc
  const matchingClasses = useMemo(() => {
    return (store.classes || []).filter(cls => {
      const matchCampus = campusFilter === 'all' || cls.campus_id === campusFilter;
      const matchTerm = !termFilter || termFilter === 'all' || cls.term_id === termFilter;
      const matchSubject = subjectFilter === 'all' || cls.subject_id === subjectFilter;
      return matchCampus && matchTerm && matchSubject;
    });
  }, [store.classes, campusFilter, termFilter, subjectFilter]);

  // Tự động gợi ý dòng "LỚP THỨ 2 - THỨ 4" dựa trên lớp đang chọn
  const defaultScheduleGroupText = useMemo(() => {
    const targetClasses =
      classFilter !== 'all'
        ? matchingClasses.filter(c => c.id === classFilter)
        : matchingClasses;
    if (targetClasses.length === 1) {
      const cls = targetClasses[0];
      const days = getClassDaysOfWeek(cls);
      if (days.length > 0) {
        const dayNames = days.map(d => (d === 'CN' ? 'CHỦ NHẬT' : `THỨ ${d.replace('T', '')}`));
        return `LỚP ${dayNames.join(' - ')} (${cls.name.toUpperCase()})`;
      }
      return `LỚP ${cls.name.toUpperCase()}`;
    }
    if (targetClasses.length > 1) {
      const allDays = Array.from(
        new Set(targetClasses.flatMap(c => getClassDaysOfWeek(c)))
      );
      if (allDays.length > 0) {
        return `NHÓM LỚP (${formatDaysListLabel(allDays).toUpperCase()})`;
      }
    }
    return 'LỚP THỨ 2 - THỨ 4';
  }, [classFilter, matchingClasses]);

  useEffect(() => {
    setCustomScheduleGroupText(defaultScheduleGroupText);
  }, [defaultScheduleGroupText]);

  // 2. Hàm sinh dữ liệu gốc từ Store (Enrollments + Students + Classes + Invoices)
  const buildSourceRows = useMemo((): EditableSpreadsheetRow[] => {
    const targetClassIds = new Set(
      (classFilter !== 'all'
        ? matchingClasses.filter(c => c.id === classFilter)
        : matchingClasses
      ).map(c => c.id)
    );

    const classMap = new Map(store.classes.map(c => [c.id, c]));
    const studentMap = new Map(store.students.map(s => [s.id, s]));
    const subjectMap = new Map(store.subjects.map(s => [s.id, s]));

    // Lấy danh sách enrollments thuộc các lớp được lọc (chỉ lấy active / completed)
    const relevantEnrollments = (store.enrollments || []).filter(enr => {
      if (!targetClassIds.has(enr.class_id)) return false;
      return enr.status === 'active' || enr.status === 'completed' || !enr.status;
    });

    const resultRows: EditableSpreadsheetRow[] = [];

    relevantEnrollments.forEach((enr, index) => {
      const cls = classMap.get(enr.class_id);
      const student = studentMap.get(enr.student_id);
      if (!cls || !student) return;

      const subject = subjectMap.get(cls.subject_id);
      const subjectName = subject?.name || cls.name;

      // Tìm hóa đơn khớp với học sinh và lớp này
      const invoice = (store.invoices || []).find(
        inv =>
          inv.student_id === student.id &&
          inv.class_id === cls.id &&
          inv.payment_status !== 'cancelled'
      );

      const totalClassSessions = Number(cls.total_sessions) || standardSessionsCount || 16;
      const sessions =
        Number(enr.registered_sessions) ||
        Number(invoice?.registered_sessions) ||
        totalClassSessions;

      const ratePerSession =
        Number(cls.price_per_session) > 0
          ? Number(cls.price_per_session)
          : Number(cls.full_course_fee) > 0
          ? Math.round(Number(cls.full_course_fee) / Math.max(1, totalClassSessions))
          : 150000;

      const standardCourseFee =
        Number(cls.full_course_fee) > 0
          ? Number(cls.full_course_fee)
          : ratePerSession * (standardSessionsCount || 16);

      // Học phí thực đóng theo số buổi học: ưu tiên hóa đơn thực đóng / phải thu hoặc tính = sessions * ratePerSession
      const actualPaidAmount =
        invoice && Number(invoice.paid_amount) > 0
          ? Number(invoice.paid_amount)
          : invoice && Number(invoice.net_payable) > 0
          ? Number(invoice.net_payable)
          : sessions * ratePerSession;

      const noteParts: string[] = [];
      if (invoice?.payment_status === 'paid') {
        noteParts.push('Đã thu đủ');
      } else if (invoice?.payment_status === 'partial') {
        noteParts.push(`Đã đóng 1 phần (${formatVND(invoice.paid_amount)})`);
      } else if (invoice?.payment_status === 'unpaid') {
        noteParts.push('Chưa đóng HP');
      }
      if (invoice && Number(invoice.credit_deducted) > 0) {
        noteParts.push(`Cấn trừ bảo lưu ${formatVND(invoice.credit_deducted)}`);
      }
      const proRataNote = invoice?.prorated_note || (enr as any).pro_rata_note;
      if (proRataNote) {
        noteParts.push(String(proRataNote));
      }

      resultRows.push({
        rowId: `row_${enr.id}_${index}`,
        stt: index + 1,
        studentCode: student.code || `HS-${index + 1}`,
        studentName: student.name || '',
        regularClass: student.regular_class || student.grade || '',
        subjectName,
        sessions,
        standardCourseFee,
        ratePerSession,
        actualPaidAmount,
        note: noteParts.join(' • '),
      });
    });

    // Sắp xếp theo Lớp phổ thông rồi theo Tên học sinh
    resultRows.sort((a, b) => {
      const clsCmp = (a.regularClass || '').localeCompare(b.regularClass || '');
      if (clsCmp !== 0) return clsCmp;
      return (a.studentName || '').localeCompare(b.studentName || '');
    });

    return resultRows.map((r, i) => ({ ...r, stt: i + 1 }));
  }, [
    store.enrollments,
    store.classes,
    store.students,
    store.subjects,
    store.invoices,
    matchingClasses,
    classFilter,
    standardSessionsCount,
  ]);

  // 3. State lưu bảng tính có thể chỉnh sửa trực tiếp (In-App Spreadsheet State)
  const [spreadsheetRows, setSpreadsheetRows] = useState<EditableSpreadsheetRow[]>(buildSourceRows);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  useEffect(() => {
    setSpreadsheetRows(buildSourceRows);
    setSelectedRowId(null);
  }, [buildSourceRows]);

  // Lọc theo từ khóa tìm kiếm nhanh (nếu có)
  const visibleRows = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return spreadsheetRows;
    return spreadsheetRows.filter(
      r =>
        r.studentName.toLowerCase().includes(q) ||
        r.studentCode.toLowerCase().includes(q) ||
        r.regularClass.toLowerCase().includes(q) ||
        r.subjectName.toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q)
    );
  }, [spreadsheetRows, searchKeyword]);

  // Cập nhật 1 ô trong bảng tính
  const handleUpdateCell = (
    rowId: string,
    field: keyof PartnershipReportItem,
    rawValue: string | number
  ) => {
    setSpreadsheetRows(prev =>
      prev.map((row, idx) => {
        if (row.rowId !== rowId) return row;
        const updated: EditableSpreadsheetRow = { ...row };

        if (
          field === 'sessions' ||
          field === 'standardCourseFee' ||
          field === 'ratePerSession' ||
          field === 'actualPaidAmount'
        ) {
          const numVal =
            typeof rawValue === 'number'
              ? rawValue
              : Number(String(rawValue).replace(/[^0-9.-]/g, '')) || 0;
          (updated as any)[field] = numVal;

          // Tự động tính lại Học phí thực đóng nếu kế toán sửa Số buổi hoặc Học phí/buổi
          if (autoRecalcPaidOnEdit && (field === 'sessions' || field === 'ratePerSession')) {
            const nextSessions = field === 'sessions' ? numVal : updated.sessions;
            const nextRate = field === 'ratePerSession' ? numVal : updated.ratePerSession;
            updated.actualPaidAmount = Math.round(nextSessions * nextRate);
          }
          // Nếu sửa Học phí 16 buổi và muốn tự cập nhật đơn giá buổi
          if (autoRecalcPaidOnEdit && field === 'standardCourseFee' && standardSessionsCount > 0) {
            const nextRate = Math.round(numVal / standardSessionsCount);
            updated.ratePerSession = nextRate;
            updated.actualPaidAmount = Math.round(updated.sessions * nextRate);
          }
        } else {
          (updated as any)[field] = String(rawValue);
        }

        // Cập nhật thanh công thức (Formula Bar)
        if (selectedCellInfo && selectedCellInfo.rowIndex === idx) {
          setSelectedCellInfo({
            ...selectedCellInfo,
            value: (updated as any)[field],
          });
        }

        return updated;
      })
    );
  };

  // Thêm dòng học sinh mới vào bảng tính
  const handleAddEmptyRow = () => {
    const defaultSubject =
      currentSubjectObj?.name ||
      (spreadsheetRows[0]?.subjectName ?? 'Ngoại khóa');
    const defaultRate = spreadsheetRows[0]?.ratePerSession ?? 150000;
    const defaultStandardFee =
      spreadsheetRows[0]?.standardCourseFee ?? defaultRate * standardSessionsCount;

    const newRow: EditableSpreadsheetRow = {
      rowId: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stt: spreadsheetRows.length + 1,
      studentCode: `HS-${String(spreadsheetRows.length + 1).padStart(3, '0')}`,
      studentName: 'Học sinh mới',
      regularClass: '1A1',
      subjectName: defaultSubject,
      sessions: standardSessionsCount,
      standardCourseFee: defaultStandardFee,
      ratePerSession: defaultRate,
      actualPaidAmount: standardSessionsCount * defaultRate,
      note: '',
    };

    setSpreadsheetRows(prev => [...prev, newRow].map((r, i) => ({ ...r, stt: i + 1 })));
    setSelectedRowId(newRow.rowId);
    showToast('Đã thêm 1 dòng mới vào bảng tính đối soát.', 'info');
  };

  // Xóa dòng đang chọn
  const handleDeleteSelectedRow = (targetRowId?: string) => {
    const idToDelete = targetRowId || selectedRowId;
    if (!idToDelete) {
      showToast('Vui lòng chọn một dòng trong bảng tính để xóa.', 'warning');
      return;
    }
    setSpreadsheetRows(prev =>
      prev.filter(r => r.rowId !== idToDelete).map((r, i) => ({ ...r, stt: i + 1 }))
    );
    if (selectedRowId === idToDelete) {
      setSelectedRowId(null);
    }
  };

  // Khôi phục dữ liệu gốc từ Store
  const handleResetSpreadsheet = () => {
    setSpreadsheetRows(buildSourceRows);
    setSelectedRowId(null);
    showToast('Đã đồng bộ lại dữ liệu gốc từ Hệ thống.', 'success');
  };

  // Tính tổng cộng cuối bảng
  const summaryTotals = useMemo(() => {
    const totalSessions = spreadsheetRows.reduce((acc, r) => acc + (Number(r.sessions) || 0), 0);
    const totalStandardFee = spreadsheetRows.reduce(
      (acc, r) => acc + (Number(r.standardCourseFee) || 0),
      0
    );
    const totalActualPaid = spreadsheetRows.reduce(
      (acc, r) => acc + (Number(r.actualPaidAmount) || 0),
      0
    );
    const ratioA = (Number(ratioAPercent) || 0) / 100;
    const ratioB = (Number(ratioBPercent) || 0) / 100;
    const partyAAmount = Math.round(totalActualPaid * ratioA);
    const partyBAmount = Math.round(totalActualPaid * ratioB);

    return {
      totalSessions,
      totalStandardFee,
      totalActualPaid,
      ratioA,
      ratioB,
      partyAAmount,
      partyBAmount,
    };
  }, [spreadsheetRows, ratioAPercent, ratioBPercent]);

  // Xuất file Excel (.xlsx)
  const handleDownloadExcel = () => {
    if (spreadsheetRows.length === 0) {
      showToast('Bảng đối soát chưa có dữ liệu học sinh để xuất Excel!', 'warning');
      return;
    }

    exportPartnershipExcel({
      campusName: campusDisplayName,
      subjectName: subjectDisplayName,
      termName: termNameText,
      termPeriodText,
      academicYear: academicYearText,
      classScheduleGroup: customScheduleGroupText || defaultScheduleGroupText,
      items: spreadsheetRows.map((r, idx) => ({
        stt: idx + 1,
        studentCode: r.studentCode,
        studentName: r.studentName,
        regularClass: r.regularClass,
        subjectName: r.subjectName,
        sessions: Number(r.sessions) || 0,
        standardCourseFee: Number(r.standardCourseFee) || 0,
        ratePerSession: Number(r.ratePerSession) || 0,
        actualPaidAmount: Number(r.actualPaidAmount) || 0,
        note: r.note || '',
      })),
      ratioA: summaryTotals.ratioA,
      ratioB: summaryTotals.ratioB,
      standardSessionsCount,
      partyAName: partyALabel,
      partyBName: partyBLabel,
    });

    showToast(
      `Đã xuất file Excel đối soát môn ${subjectDisplayName} (${spreadsheetRows.length} học sinh) thành công!`,
      'success'
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. THANH BỘ LỌC & CẤU HÌNH TỶ LỆ ĐỐI SOÁT ĐỐI TÁC */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              <span>
                Báo Cáo Đối Soát Tài Chính Môn Ngoại Khóa &amp; Bộ Chỉnh Sửa Bảng Tính Trực Tuyến
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Trích xuất danh sách học sinh theo đúng mẫu đối soát đối tác của Royal School, cho phép chỉnh sửa trực tiếp từng ô như Excel và tải xuống file <code className="text-emerald-300">.xlsx</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAddEmptyRow}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm Dòng</span>
            </button>

            <button
              type="button"
              onClick={handleResetSpreadsheet}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Khôi phục bảng tính về dữ liệu gốc từ Hệ thống"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Đồng Bộ Lại Dữ Liệu Gốc</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadExcel}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tải Xuống File Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Bộ lọc Cơ sở, Khóa học, Môn học, Lớp học & Tỷ lệ Bên A/B */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          {/* Cơ sở */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Cơ sở đào tạo</span>
            </label>
            <select
              value={campusFilter}
              onChange={e => setCampusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-amber-500"
            >
              <option value="camp_pmh">Phú Mỹ Hưng (PMH)</option>
              <option value="camp_pl">Phú Lâm (PL)</option>
              <option value="all">Toàn trường (PMH &amp; PL)</option>
            </select>
          </div>

          {/* Khóa học */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>Khóa học áp dụng</span>
            </label>
            <select
              value={termFilter}
              onChange={e => setTermFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-amber-500"
            >
              <option value="all">Tất cả khóa học</option>
              {store.terms.map(t => (
                <option key={t.id} value={t.id}>
                  {t.code ? `${t.code} - ` : ''}{t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Môn học */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>Môn ngoại khóa</span>
            </label>
            <select
              value={subjectFilter}
              onChange={e => setSubjectFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-amber-500"
            >
              <option value="all">Tất cả môn ({store.subjects.length} môn)</option>
              {store.subjects.map(sub => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          {/* Lớp / Nhóm lịch */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
              <span>Lớp ngoại khóa ({matchingClasses.length})</span>
            </label>
            <select
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:outline-none focus:border-amber-500"
            >
              <option value="all">Tất cả lớp thuộc môn</option>
              {matchingClasses.map(cls => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} ({formatDaysListLabel(getClassDaysOfWeek(cls))})
                </option>
              ))}
            </select>
          </div>

          {/* Tỷ lệ Bên A (%) */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
              <Percent className="w-3.5 h-3.5 text-amber-400" />
              <span>Tỷ lệ Bên A hưởng (%)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={ratioAPercent}
                onChange={e => {
                  const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setRatioAPercent(val);
                  setRatioBPercent(Math.round((100 - val) * 100) / 100);
                }}
                className="w-20 px-2.5 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-amber-300 font-mono font-extrabold text-center focus:outline-none"
              />
              <input
                type="text"
                value={partyALabel}
                onChange={e => setPartyALabel(e.target.value)}
                placeholder="BÊN A"
                className="flex-1 min-w-0 px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-bold"
              />
            </div>
          </div>

          {/* Tỷ lệ Bên B (%) */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
              <Percent className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tỷ lệ Bên B hưởng (%)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={ratioBPercent}
                onChange={e => {
                  const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setRatioBPercent(val);
                  setRatioAPercent(Math.round((100 - val) * 100) / 100);
                }}
                className="w-20 px-2.5 py-2 rounded-xl bg-slate-950 border border-cyan-500/40 text-cyan-300 font-mono font-extrabold text-center focus:outline-none"
              />
              <input
                type="text"
                value={partyBLabel}
                onChange={e => setPartyBLabel(e.target.value)}
                placeholder="BÊN B"
                className="flex-1 min-w-0 px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-bold"
              />
            </div>
          </div>
        </div>

        {/* Dòng cấu hình phụ: Số buổi khóa chuẩn, Tự động tính thành tiền, Tìm kiếm nhanh */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={autoRecalcPaidOnEdit}
                onChange={e => setAutoRecalcPaidOnEdit(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0"
              />
              <span>
                Tự động tính <strong>Học phí thực đóng = Số buổi × Học phí/buổi</strong> khi sửa ô
              </span>
            </label>

            <div className="flex items-center gap-2 text-slate-400">
              <span>Khóa chuẩn:</span>
              <input
                type="number"
                min={1}
                max={60}
                value={standardSessionsCount}
                onChange={e => setStandardSessionsCount(Math.max(1, Number(e.target.value) || 16))}
                className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono font-bold text-center"
              />
              <span>buổi</span>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="Lọc nhanh tên HS, MSHS, lớp..."
              className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-56"
            />
          </div>
        </div>
      </div>

      {/* 2. TỔNG HỢP NHANH 4 THẺ CHỈ SỐ ĐỐI SOÁT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase">Tổng Số Lượt Học Sinh</div>
            <div className="text-xl font-extrabold text-white font-mono mt-1">
              {spreadsheetRows.length} <span className="text-xs font-normal text-slate-400">học sinh</span>
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-400 font-mono">
            Tổng buổi: <strong className="text-cyan-300">{summaryTotals.totalSessions}</strong>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-emerald-500/30 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-emerald-400 uppercase">
              Tổng Học Phí Thực Đóng
            </div>
            <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
              {formatVND(summaryTotals.totalActualPaid)}
            </div>
          </div>
          <CheckCircle2 className="w-6 h-6 text-emerald-400/50" />
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-amber-500/30 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-amber-400 uppercase">
              Số Tiền {partyALabel} Hưởng ({ratioAPercent}%)
            </div>
            <div className="text-xl font-extrabold text-amber-300 font-mono mt-1">
              {formatVND(summaryTotals.partyAAmount)}
            </div>
          </div>
          <Calculator className="w-6 h-6 text-amber-400/50" />
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-cyan-400 uppercase">
              Số Tiền {partyBLabel} Hưởng ({ratioBPercent}%)
            </div>
            <div className="text-xl font-extrabold text-cyan-300 font-mono mt-1">
              {formatVND(summaryTotals.partyBAmount)}
            </div>
          </div>
          <Sparkles className="w-6 h-6 text-cyan-400/50" />
        </div>
      </div>

      {/* 3. BỘ CHỈNH SỬA BẢNG TÍNH TRỰC TUYẾN (IN-APP SPREADSHEET VIEWER & EDITOR) */}
      <div className="rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
        {/* Excel Formula Bar (Thanh công thức fx) */}
        <div className="bg-slate-950 border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <span className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-extrabold text-[11px] min-w-[48px] text-center">
              {selectedCellInfo?.coord || 'A1'}
            </span>
            <span className="font-mono italic font-bold text-slate-400 px-1">fx</span>
            <div className="flex-1 px-3 py-1 rounded bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs truncate">
              {selectedCellInfo
                ? `${selectedCellInfo.label}: ${selectedCellInfo.value}`
                : 'Chọn bất kỳ ô nào trên bảng tính bên dưới để chỉnh sửa trực tiếp trước khi xuất Excel (.xlsx)'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedRowId && (
              <button
                type="button"
                onClick={() => handleDeleteSelectedRow(selectedRowId)}
                className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa dòng đang chọn</span>
              </button>
            )}
            <span className="text-[11px] text-slate-400 font-mono">
              Sheet: <strong className="text-emerald-400">Đối Soát Quyết Toán</strong>
            </span>
          </div>
        </div>

        {/* Spreadsheet Grid Container */}
        <div className="overflow-x-auto bg-[#0f172a]">
          <table className="w-full border-collapse text-xs select-text">
            {/* Hàng tiêu đề cột chữ cái Excel: A, B, C, D, E, F, G, H, I, J */}
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                <th className="w-10 py-1.5 px-2 border-r border-slate-800 text-center bg-slate-950">#</th>
                {EXCEL_COL_LETTERS.map(letter => (
                  <th
                    key={letter}
                    className="py-1.5 px-2 border-r border-slate-800 text-center font-bold bg-slate-950/90"
                  >
                    {letter}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/80">
              {/* Dòng 1: CÔNG TY CP ĐT PT GD QUỐC TẾ HOÀNG GIA */}
              <tr className="bg-slate-900/70">
                <td className="py-1.5 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500 bg-slate-950">
                  1
                </td>
                <td colSpan={10} className="py-1.5 px-3 font-extrabold text-slate-200 tracking-wide">
                  CÔNG TY CP ĐT PT GD QUỐC TẾ HOÀNG GIA
                </td>
              </tr>

              {/* Dòng 2: TRUNG TÂM QUẢN LÝ HỌC VỤ - DỊCH VỤ */}
              <tr className="bg-slate-900/70">
                <td className="py-1.5 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500 bg-slate-950">
                  2
                </td>
                <td colSpan={10} className="py-1.5 px-3 font-bold text-amber-400 tracking-wide">
                  TRUNG TÂM QUẢN LÝ HỌC VỤ - DỊCH VỤ
                </td>
              </tr>

              {/* Dòng 3: Tên biểu mẫu báo cáo */}
              <tr className="bg-slate-900/90">
                <td className="py-2 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500 bg-slate-950">
                  3
                </td>
                <td colSpan={10} className="py-2 px-3 text-center">
                  <div className="text-sm sm:text-base font-extrabold text-white uppercase tracking-wide">
                    DANH SÁCH HỌC SINH NGOẠI KHOÁ PHỔ THÔNG MÔN {subjectDisplayName.toUpperCase()} -{' '}
                    {campusDisplayName}
                  </div>
                </td>
              </tr>

              {/* Dòng 4: Khóa học & Thời gian */}
              <tr className="bg-slate-900/90">
                <td className="py-1.5 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500 bg-slate-950">
                  4
                </td>
                <td colSpan={10} className="py-1.5 px-3 text-center">
                  <div className="text-xs font-bold text-cyan-300 uppercase">
                    {termNameText.toUpperCase()}, TỪ {termPeriodText} - TẠI ROYAL SCHOOL (NH{' '}
                    {academicYearText})
                  </div>
                </td>
              </tr>

              {/* Dòng 5: Nhóm lịch học (Cho phép sửa trực tiếp như 1 ô Excel) */}
              <tr className="bg-slate-900">
                <td className="py-1.5 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500 bg-slate-950">
                  5
                </td>
                <td colSpan={10} className="p-0">
                  <input
                    type="text"
                    value={customScheduleGroupText}
                    onFocus={() =>
                      setSelectedCellInfo({
                        coord: 'A5',
                        label: 'Nhóm lớp / Lịch học',
                        value: customScheduleGroupText,
                      })
                    }
                    onChange={e => setCustomScheduleGroupText(e.target.value)}
                    className="w-full py-2 px-3 bg-amber-500/10 border-y border-amber-500/30 text-amber-300 font-extrabold text-xs uppercase focus:outline-none focus:bg-amber-500/20"
                    placeholder="VD: LỚP THỨ 2 - THỨ 4"
                  />
                </td>
              </tr>

              {/* Dòng 6: Tiêu đề 10 cột chuẩn */}
              <tr className="bg-slate-950 text-slate-200 font-extrabold text-[11px] uppercase">
                <td className="py-2.5 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500">
                  6
                </td>
                <td className="py-2.5 px-2 border-r border-slate-800 text-center w-12">STT</td>
                <td className="py-2.5 px-2.5 border-r border-slate-800 w-32">MSHS</td>
                <td className="py-2.5 px-2.5 border-r border-slate-800 min-w-[190px]">HỌ TÊN</td>
                <td className="py-2.5 px-2 border-r border-slate-800 text-center w-24">LỚP</td>
                <td className="py-2.5 px-2.5 border-r border-slate-800 min-w-[140px]">MÔN</td>
                <td className="py-2.5 px-2 border-r border-slate-800 text-center w-28">
                  SỐ BUỔI HỌC
                </td>
                <td className="py-2.5 px-2.5 border-r border-slate-800 text-right w-36">
                  HỌC PHÍ {standardSessionsCount} BUỔI
                </td>
                <td className="py-2.5 px-2.5 border-r border-slate-800 text-right w-32">
                  HỌC PHÍ/BUỔI
                </td>
                <td className="py-2.5 px-2.5 border-r border-slate-800 text-right w-44 bg-emerald-950/30 text-emerald-300">
                  HỌC PHÍ THỰC ĐÓNG THEO SỐ BUỔI HỌC
                </td>
                <td className="py-2.5 px-2.5 min-w-[180px]">GHI CHÚ</td>
              </tr>

              {/* Các dòng dữ liệu học sinh tương tác trực tiếp */}
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="py-2 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500 bg-slate-950">
                    7
                  </td>
                  <td colSpan={10} className="py-10 text-center text-slate-400">
                    Chưa có học sinh ghi danh trong bộ lọc này. Bạn có thể đổi bộ lọc hoặc bấm{' '}
                    <button
                      type="button"
                      onClick={handleAddEmptyRow}
                      className="text-amber-400 underline font-bold cursor-pointer"
                    >
                      + Thêm Dòng
                    </button>{' '}
                    để nhập trực tiếp trên bảng tính.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, idx) => {
                  const excelRowNumber = idx + 7;
                  const isRowSelected = selectedRowId === row.rowId;

                  return (
                    <tr
                      key={row.rowId}
                      onClick={() => setSelectedRowId(row.rowId)}
                      className={`transition-colors ${
                        isRowSelected ? 'bg-amber-500/10' : 'hover:bg-slate-800/50'
                      }`}
                    >
                      {/* Số thứ tự dòng Excel */}
                      <td className="py-1 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500 bg-slate-950">
                        {excelRowNumber}
                      </td>

                      {/* Cột A: STT */}
                      <td className="p-0 border-r border-slate-800 text-center font-mono font-bold text-slate-300">
                        {idx + 1}
                      </td>

                      {/* Cột B: MSHS */}
                      <td className="p-0 border-r border-slate-800">
                        <input
                          type="text"
                          value={row.studentCode}
                          onFocus={() =>
                            setSelectedCellInfo({
                              coord: `B${excelRowNumber}`,
                              label: 'MSHS',
                              value: row.studentCode,
                              rowIndex: idx,
                            })
                          }
                          onChange={e =>
                            handleUpdateCell(row.rowId, 'studentCode', e.target.value)
                          }
                          className="w-full py-1.5 px-2.5 bg-transparent font-mono text-amber-300 font-semibold focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-amber-400"
                        />
                      </td>

                      {/* Cột C: HỌ TÊN */}
                      <td className="p-0 border-r border-slate-800">
                        <input
                          type="text"
                          value={row.studentName}
                          onFocus={() =>
                            setSelectedCellInfo({
                              coord: `C${excelRowNumber}`,
                              label: 'HỌ TÊN',
                              value: row.studentName,
                              rowIndex: idx,
                            })
                          }
                          onChange={e =>
                            handleUpdateCell(row.rowId, 'studentName', e.target.value)
                          }
                          className="w-full py-1.5 px-2.5 bg-transparent text-white font-bold focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-amber-400"
                        />
                      </td>

                      {/* Cột D: LỚP (Lớp phổ thông regular_class) */}
                      <td className="p-0 border-r border-slate-800">
                        <input
                          type="text"
                          value={row.regularClass}
                          onFocus={() =>
                            setSelectedCellInfo({
                              coord: `D${excelRowNumber}`,
                              label: 'LỚP',
                              value: row.regularClass,
                              rowIndex: idx,
                            })
                          }
                          onChange={e =>
                            handleUpdateCell(row.rowId, 'regularClass', e.target.value)
                          }
                          className="w-full py-1.5 px-2 bg-transparent text-center font-mono text-cyan-300 font-bold focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-amber-400"
                        />
                      </td>

                      {/* Cột E: MÔN */}
                      <td className="p-0 border-r border-slate-800">
                        <input
                          type="text"
                          value={row.subjectName}
                          onFocus={() =>
                            setSelectedCellInfo({
                              coord: `E${excelRowNumber}`,
                              label: 'MÔN',
                              value: row.subjectName,
                              rowIndex: idx,
                            })
                          }
                          onChange={e =>
                            handleUpdateCell(row.rowId, 'subjectName', e.target.value)
                          }
                          className="w-full py-1.5 px-2.5 bg-transparent text-slate-200 focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-amber-400"
                        />
                      </td>

                      {/* Cột F: SỐ BUỔI HỌC */}
                      <td className="p-0 border-r border-slate-800">
                        <input
                          type="number"
                          min={0}
                          value={row.sessions}
                          onFocus={() =>
                            setSelectedCellInfo({
                              coord: `F${excelRowNumber}`,
                              label: 'SỐ BUỔI HỌC',
                              value: row.sessions,
                              rowIndex: idx,
                            })
                          }
                          onChange={e => handleUpdateCell(row.rowId, 'sessions', e.target.value)}
                          className="w-full py-1.5 px-2 bg-transparent text-center font-mono font-extrabold text-white focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-amber-400"
                        />
                      </td>

                      {/* Cột G: HỌC PHÍ 16 BUỔI */}
                      <td className="p-0 border-r border-slate-800">
                        <input
                          type="number"
                          step={10000}
                          value={row.standardCourseFee}
                          onFocus={() =>
                            setSelectedCellInfo({
                              coord: `G${excelRowNumber}`,
                              label: `HỌC PHÍ ${standardSessionsCount} BUỔI`,
                              value: row.standardCourseFee,
                              rowIndex: idx,
                            })
                          }
                          onChange={e =>
                            handleUpdateCell(row.rowId, 'standardCourseFee', e.target.value)
                          }
                          className="w-full py-1.5 px-2.5 bg-transparent text-right font-mono text-slate-300 focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-amber-400"
                        />
                      </td>

                      {/* Cột H: HỌC PHÍ/BUỔI */}
                      <td className="p-0 border-r border-slate-800">
                        <input
                          type="number"
                          step={5000}
                          value={row.ratePerSession}
                          onFocus={() =>
                            setSelectedCellInfo({
                              coord: `H${excelRowNumber}`,
                              label: 'HỌC PHÍ/BUỔI',
                              value: row.ratePerSession,
                              rowIndex: idx,
                            })
                          }
                          onChange={e =>
                            handleUpdateCell(row.rowId, 'ratePerSession', e.target.value)
                          }
                          className="w-full py-1.5 px-2.5 bg-transparent text-right font-mono text-amber-300 focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-amber-400"
                        />
                      </td>

                      {/* Cột I: HỌC PHÍ THỰC ĐÓNG THEO SỐ BUỔI HỌC */}
                      <td className="p-0 border-r border-slate-800 bg-emerald-950/15">
                        <input
                          type="number"
                          step={10000}
                          value={row.actualPaidAmount}
                          onFocus={() =>
                            setSelectedCellInfo({
                              coord: `I${excelRowNumber}`,
                              label: 'HỌC PHÍ THỰC ĐÓNG THEO SỐ BUỔI HỌC',
                              value: row.actualPaidAmount,
                              rowIndex: idx,
                            })
                          }
                          onChange={e =>
                            handleUpdateCell(row.rowId, 'actualPaidAmount', e.target.value)
                          }
                          className="w-full py-1.5 px-2.5 bg-transparent text-right font-mono font-extrabold text-emerald-400 focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-emerald-400"
                        />
                      </td>

                      {/* Cột J: GHI CHÚ */}
                      <td className="p-0">
                        <input
                          type="text"
                          value={row.note}
                          placeholder="Nhập ghi chú..."
                          onFocus={() =>
                            setSelectedCellInfo({
                              coord: `J${excelRowNumber}`,
                              label: 'GHI CHÚ',
                              value: row.note,
                              rowIndex: idx,
                            })
                          }
                          onChange={e => handleUpdateCell(row.rowId, 'note', e.target.value)}
                          className="w-full py-1.5 px-2.5 bg-transparent text-slate-300 placeholder-slate-600 focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-amber-400"
                        />
                      </td>
                    </tr>
                  );
                })
              )}

              {/* PHẦN TỔNG HỢP CHÂN TRANG (FOOTER ROWS) */}
              {/* Dòng TỔNG CỘNG HỌC PHÍ THỰC THU */}
              <tr className="bg-slate-950/95 border-t-2 border-slate-700 font-extrabold">
                <td className="py-2.5 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500">
                  {visibleRows.length + 7}
                </td>
                <td colSpan={7} className="py-2.5 px-3 border-r border-slate-800 text-right text-slate-400">
                  TỔNG CỘNG HỌC PHÍ THỰC THU ({spreadsheetRows.length} HỌC SINH):
                </td>
                <td className="py-2.5 px-2.5 border-r border-slate-800 text-right font-mono text-white">
                  TỔNG
                </td>
                <td className="py-2.5 px-2.5 border-r border-slate-800 text-right font-mono text-sm text-emerald-400 bg-emerald-950/30">
                  {formatVND(summaryTotals.totalActualPaid)}
                </td>
                <td className="py-2.5 px-2.5 text-[11px] font-mono text-slate-500">
                  =SUM(I7:I{Math.max(7, visibleRows.length + 6)})
                </td>
              </tr>

              {/* Dòng SỐ TIỀN BÊN A ĐƯỢC HƯỞNG */}
              <tr className="bg-slate-950/90 font-extrabold">
                <td className="py-2 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500">
                  {visibleRows.length + 8}
                </td>
                <td colSpan={8} className="py-2 px-3 border-r border-slate-800 text-right text-amber-300">
                  SỐ TIỀN {partyALabel} ĐƯỢC HƯỞNG ({ratioAPercent}%):
                </td>
                <td className="py-2 px-2.5 border-r border-slate-800 text-right font-mono text-sm text-amber-300 bg-amber-950/20">
                  {formatVND(summaryTotals.partyAAmount)}
                </td>
                <td className="py-2 px-2.5 text-[11px] font-mono text-slate-500">
                  =I{visibleRows.length + 7}*{ratioAPercent}%
                </td>
              </tr>

              {/* Dòng SỐ TIỀN BÊN B ĐƯỢC HƯỞNG */}
              <tr className="bg-slate-950/90 font-extrabold">
                <td className="py-2 px-2 border-r border-slate-800 text-center font-mono text-[10px] text-slate-500">
                  {visibleRows.length + 9}
                </td>
                <td colSpan={8} className="py-2 px-3 border-r border-slate-800 text-right text-cyan-300">
                  SỐ TIỀN {partyBLabel} ĐƯỢC HƯỞNG ({ratioBPercent}%):
                </td>
                <td className="py-2 px-2.5 border-r border-slate-800 text-right font-mono text-sm text-cyan-300 bg-cyan-950/20">
                  {formatVND(summaryTotals.partyBAmount)}
                </td>
                <td className="py-2 px-2.5 text-[11px] font-mono text-slate-500">
                  =I{visibleRows.length + 7}*{ratioBPercent}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
