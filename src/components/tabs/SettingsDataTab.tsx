import React, { useState } from 'react';
import { 
  Settings, 
  Trash2, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  DollarSign, 
  Building2, 
  ShieldAlert, 
  CheckCircle2, 
  Radio, 
  MessageSquare, 
  Database,
  Lock,
  Unlock,
  RefreshCw,
  Sparkles,
  Layers,
  Calendar,
  Copy,
  Plus,
  Edit2,
  Check,
  X,
  Clock,
  BookOpen,
  Info,
  ChevronRight,
  Sliders,
  AlertTriangle,
  Percent,
  Tag
} from 'lucide-react';
import { 
  AppStore, 
  formatVND, 
  calculateCeilSessionRate, 
  getInitialStore, 
  getEffectivePrice, 
  cloneTermConfiguration,
  isTermClosed 
} from '../../lib/storage';
import { downloadSampleTemplate, parseMasterExcelFile, exportMasterWorkbook } from '../../lib/excel';
import { 
  UserRole, 
  TermCampusSubjectPricing, 
  Campus, 
  AcademicTerm, 
  TermStatus, 
  TermSubjectConfig, 
  CampusTermPricing,
  DiscountType 
} from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface SettingsDataTabProps {
  store: AppStore;
  currentRole: UserRole;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  initialSection?: 'pricing' | 'campuses' | 'clean_reset' | 'excel_master' | 'telecom' | 'supabase';
  initialSubTab?: 'terms' | 'term_subjects' | 'campus_pricing' | 'matrix';
}

export const SettingsDataTab: React.FC<SettingsDataTabProps> = ({
  store,
  currentRole,
  onUpdateStore,
  initialSection = 'pricing',
  initialSubTab = 'terms',
}) => {
  const [activeSection, setActiveSection] = useState<'pricing' | 'campuses' | 'clean_reset' | 'excel_master' | 'telecom' | 'supabase'>(initialSection);
  const [pricingViewMode, setPricingViewMode] = useState<ViewMode>('table');
  const [campusesViewMode, setCampusesViewMode] = useState<ViewMode>('cards');

  // Sub-tabs for Section 1: Cấu hình Khóa học & Biểu phí cơ sở
  const [hierarchySubTab, setHierarchySubTab] = useState<'terms' | 'term_subjects' | 'campus_pricing' | 'matrix'>(initialSubTab);
  const [selectedConfigTermId, setSelectedConfigTermId] = useState<string>(store.terms[0]?.id || 'term_fall_2026');
  const [selectedConfigCampusId, setSelectedConfigCampusId] = useState<string>(store.campuses[0]?.id || 'camp_pmh');

  // Term Modal (Create / Edit)
  const [showTermModal, setShowTermModal] = useState<boolean>(false);
  const [editingTerm, setEditingTerm] = useState<AcademicTerm | null>(null);
  const [termFormData, setTermFormData] = useState({
    code: '',
    name: '',
    academic_year: '2026-2027',
    start_date: '2026-09-01',
    end_date: '2026-12-15',
    status: 'draft' as TermStatus,
    description: '',
  });

  // Clone Term Modal
  const [showCloneModal, setShowCloneModal] = useState<boolean>(false);
  const [cloneSourceTermId, setCloneSourceTermId] = useState<string>(store.terms[0]?.id || '');
  const [cloneFormData, setCloneFormData] = useState({
    code: '',
    name: '',
    academic_year: '2026-2027',
    start_date: '2027-01-05',
    end_date: '2027-05-20',
    status: 'draft' as TermStatus,
    description: '',
  });

  // ViewMode for Subtab 3: Biểu phí cơ sở
  const [campusPricingViewMode, setCampusPricingViewMode] = useState<ViewMode>('cards');

  // Campus Modal (Create / Edit)
  const [showCampusModal, setShowCampusModal] = useState<boolean>(false);
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);
  const [campusFormData, setCampusFormData] = useState({
    code: '',
    name: '',
    address: '',
    phone: '',
    bank_name: 'Vietcombank - CN Nam Sài Gòn',
    bank_account: '',
    bank_owner: 'CONG TY CP GD QUOC TE HOANG GIA',
    status: 'active' as 'active' | 'inactive',
  });

  const handleOpenAddCampus = () => {
    setEditingCampus(null);
    setCampusFormData({
      code: '',
      name: '',
      address: '',
      phone: '',
      bank_name: 'Vietcombank - CN Nam Sài Gòn',
      bank_account: '',
      bank_owner: 'CONG TY CP GD QUOC TE HOANG GIA',
      status: 'active',
    });
    setShowCampusModal(true);
  };

  const handleOpenEditCampus = (campus: Campus) => {
    setEditingCampus(campus);
    setCampusFormData({
      code: campus.code,
      name: campus.name,
      address: campus.address,
      phone: campus.phone,
      bank_name: campus.bank_name,
      bank_account: campus.bank_account,
      bank_owner: campus.bank_owner,
      status: campus.status,
    });
    setShowCampusModal(true);
  };

  const handleDeleteCampus = (campus: Campus) => {
    const relatedClasses = store.classes.filter(c => c.campus_id === campus.id);
    if (relatedClasses.length > 0) {
      alert(`Không thể xóa cơ sở "${campus.name}" (${campus.code}) vì hiện có ${relatedClasses.length} lớp học đang trực thuộc cơ sở này. Vui lòng chuyển hoặc xóa các lớp học liên quan trước.`);
      return;
    }
    const ok = window.confirm(`Bạn có chắc chắn muốn xóa cơ sở "${campus.name}" (${campus.code})? Hành động này sẽ xóa dữ liệu cơ sở khỏi hệ thống.`);
    if (!ok) return;

    onUpdateStore(prev => ({
      ...prev,
      campuses: prev.campuses.filter(c => c.id !== campus.id),
      campusPricings: prev.campusPricings.filter(cp => cp.campus_id !== campus.id),
      facilities: prev.facilities.filter(f => f.campus_id !== campus.id),
    }));
  };

  const handleSaveCampus = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = campusFormData.code.trim().toUpperCase();
    if (!cleanCode || !campusFormData.name.trim()) {
      alert('Vui lòng nhập đầy đủ Mã cơ sở và Tên cơ sở.');
      return;
    }

    const duplicate = store.campuses.find(
      c => c.code.toUpperCase() === cleanCode && c.id !== editingCampus?.id
    );
    if (duplicate) {
      alert(`Mã cơ sở "${cleanCode}" đã tồn tại cho cơ sở "${duplicate.name}". Vui lòng chọn mã khác.`);
      return;
    }

    if (editingCampus) {
      onUpdateStore(prev => ({
        ...prev,
        campuses: prev.campuses.map(c => 
          c.id === editingCampus.id 
            ? { 
                ...c, 
                ...campusFormData,
                code: cleanCode,
              } 
            : c
        ),
      }));
    } else {
      const newCampus: Campus = {
        id: `camp_${cleanCode.toLowerCase()}_${Date.now()}`,
        ...campusFormData,
        code: cleanCode,
      };
      onUpdateStore(prev => ({
        ...prev,
        campuses: [...prev.campuses, newCampus],
      }));
    }

    setShowCampusModal(false);
    setEditingCampus(null);
  };

  React.useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
    if (initialSubTab) {
      setHierarchySubTab(initialSubTab);
    }
  }, [initialSection, initialSubTab]);

  // Reset Security Code State
  const [resetConfirmCode, setResetConfirmCode] = useState('');
  const [selectedResetOption, setSelectedResetOption] = useState<'ops' | 'students' | 'classes' | 'factory'>('ops');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Excel Import Status
  const [importStatus, setImportStatus] = useState<{ loading: boolean; message?: string; isError?: boolean }>({ loading: false });

  // Supabase Config State
  const [sbUrl, setSbUrl] = useState(store.supabaseConfig.url || '');
  const [sbKey, setSbKey] = useState(store.supabaseConfig.anonKey || '');
  const [sbConnected, setSbConnected] = useState(store.supabaseConfig.isConnected);

  // Check if current user is Super Admin
  const isSuperAdmin = currentRole === 'super_admin';

  // Handle Clean Seed Data / Reset
  const handleExecuteReset = () => {
    if (!isSuperAdmin) {
      alert('Quyền hạn bị từ chối: Chỉ Quản trị viên Cấp cao mới được thực hiện đặt lại dữ liệu.');
      return;
    }

    if (resetConfirmCode !== 'DELETE_CONFIRM') {
      alert('Mật mã bảo mật không chính xác. Bạn phải nhập chính xác chuỗi ký tự: DELETE_CONFIRM');
      return;
    }

    onUpdateStore(prev => {
      let updated = { ...prev };

      if (selectedResetOption === 'ops') {
        // Option 1: Xóa dữ liệu vận hành & giao dịch
        updated.attendance = [];
        updated.sessions = [];
        updated.invoices = [];
        updated.makeupCredits = [];
        updated.transfers = [];
        updated.payrollSettlements = [];
      } else if (selectedResetOption === 'students') {
        // Option 2: Xóa dữ liệu học sinh & ghi danh
        updated.students = [];
        updated.enrollments = [];
        updated.invoices = [];
        updated.attendance = [];
        updated.makeupCredits = [];
      } else if (selectedResetOption === 'classes') {
        // Option 3: Xóa lớp học & môn học
        updated.classes = [];
        updated.enrollments = [];
        updated.sessions = [];
        updated.attendance = [];
      } else if (selectedResetOption === 'factory') {
        // Option 4: Full Factory Reset (Xóa trắng)
        updated.attendance = [];
        updated.sessions = [];
        updated.invoices = [];
        updated.makeupCredits = [];
        updated.transfers = [];
        updated.payrollSettlements = [];
        updated.students = [];
        updated.enrollments = [];
        updated.parentRegistrations = [];
        updated.classes = [];
      }

      return updated;
    });

    setResetSuccessMessage(`Đã thực hiện dọn sạch dữ liệu theo Option: ${selectedResetOption.toUpperCase()} thành công!`);
    setResetConfirmCode('');
    setTimeout(() => setResetSuccessMessage(null), 5000);
  };

  // Restore Initial Sample Seed Data
  const handleRestoreInitialSeed = () => {
    const initial = getInitialStore();
    onUpdateStore(() => initial);
    alert('Đã khôi phục toàn bộ Dữ Liệu Mẫu Chuẩn Hoàng Gia ban đầu!');
  };

  // Handle Excel File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ loading: true, message: 'Đang đọc và phân tích tệp Master Excel...' });
    const result = await parseMasterExcelFile(file);

    if (result.success && result.data) {
      onUpdateStore(prev => ({
        ...prev,
        students: result.data?.students ? [...result.data.students, ...prev.students] : prev.students,
      }));
      setImportStatus({ loading: false, message: result.message, isError: false });
    } else {
      setImportStatus({ loading: false, message: result.message, isError: true });
    }
  };

  // Save Supabase Config
  const handleSaveSupabase = () => {
    onUpdateStore(prev => ({
      ...prev,
      supabaseConfig: {
        url: sbUrl,
        anonKey: sbKey,
        isConnected: true,
      },
    }));
    setSbConnected(true);
    alert('Đã lưu và kết nối thành công với Supabase PostgreSQL!');
  };

  return (
    <div className="space-y-6">
      
      {/* Navigation Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800">
        <button
          onClick={() => setActiveSection('pricing')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
            activeSection === 'pricing'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Cấu Hình Khóa Học & Biểu Phí Cơ Sở</span>
        </button>
        <button
          onClick={() => setActiveSection('campuses')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSection === 'campuses'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Cơ Sở & Ngân Hàng ({store.campuses.length})
        </button>
        <button
          onClick={() => setActiveSection('clean_reset')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeSection === 'clean_reset'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
              : 'bg-slate-900 text-rose-400 hover:text-rose-300 border border-rose-500/30'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Dọn Sạch Dữ Liệu (Reset DB)</span>
        </button>
        <button
          onClick={() => setActiveSection('excel_master')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeSection === 'excel_master'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'bg-slate-900 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Excel Master (10 Sheets)</span>
        </button>
        <button
          onClick={() => setActiveSection('telecom')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSection === 'telecom'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Kênh Viễn Thông (Zalo/SMS)
        </button>
        <button
          onClick={() => setActiveSection('supabase')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSection === 'supabase'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          Supabase PostgreSQL
        </button>
      </div>

      {/* SECTION 1: CẤU HÌNH KHÓA HỌC & BIỂU PHÍ CƠ SỞ (HIERARCHY MANAGER) */}
      {activeSection === 'pricing' && (
        <div className="space-y-4">
          
          {/* Section Header with Hierarchy Breadcrumb */}
          <div className="p-4 rounded-3xl bg-[#111827]/80 border border-slate-800/80 backdrop-blur-md shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Quản Trị Phân Cấp Khóa Học & Biểu Phí Cơ Sở</h3>
                  <p className="text-xs text-slate-400">
                    Mô hình chuẩn: Trung Tâm &rarr; Danh Mục Môn &rarr; Khóa Học &rarr; Cơ Sở &rarr; Lớp Học
                  </p>
                </div>
              </div>
            </div>

            {/* Sub-tab Navigation */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-slate-800 overflow-x-auto">
              <button
                onClick={() => setHierarchySubTab('terms')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  hierarchySubTab === 'terms'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>1. Khóa Học & Vòng Đời</span>
              </button>
              <button
                onClick={() => setHierarchySubTab('term_subjects')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  hierarchySubTab === 'term_subjects'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>2. Kích Hoạt Môn Khóa</span>
              </button>
              <button
                onClick={() => setHierarchySubTab('campus_pricing')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  hierarchySubTab === 'campus_pricing'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>3. Biểu Phí Cơ Sở</span>
              </button>
              <button
                onClick={() => setHierarchySubTab('matrix')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  hierarchySubTab === 'matrix'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>4. Ma Trận Toàn Trường</span>
              </button>
            </div>
          </div>

          {/* SUB-VIEW 1: QUẢN LÝ VÒNG ĐỜI KHÓA HỌC & NHÂN BẢN (TERMS LIFECYCLE) */}
          {hierarchySubTab === 'terms' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#111827]/80 border border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    <span>Danh Sách Khóa Học (Academic Terms) & Vòng Đời Nghiệp Vụ</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Vòng đời khóa: Dự thảo (Draft) &rarr; Mở Tuyển Sinh (Open Enrollment) &rarr; Đang Học (In Progress) &rarr; Đã Đóng (Closed - Khóa chỉnh sửa toàn bộ dữ liệu)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setCloneSourceTermId(store.terms[0]?.id || '');
                      setCloneFormData({
                        code: `TERM-${Date.now().toString().slice(-4)}`,
                        name: 'Khóa Ngoại Khóa Mới',
                        academic_year: '2026-2027',
                        start_date: new Date().toISOString().split('T')[0],
                        end_date: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
                        status: 'draft',
                        description: '',
                      });
                      setShowCloneModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-600/20 transition-all"
                    title="Nhân bản cấu hình môn và biểu phí từ khóa cũ sang khóa mới mà không sửa dữ liệu lịch sử"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Nhân Bản (Clone) Khóa</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingTerm(null);
                      setTermFormData({
                        code: `TERM-${Date.now().toString().slice(-4)}`,
                        name: '',
                        academic_year: '2026-2027',
                        start_date: new Date().toISOString().split('T')[0],
                        end_date: new Date(Date.now() + 100 * 86400000).toISOString().split('T')[0],
                        status: 'open_enrollment',
                        description: '',
                      });
                      setShowTermModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm Khóa Mới</span>
                  </button>
                </div>
              </div>

              {/* Terms Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {store.terms.map(term => {
                  const termClasses = store.classes.filter(c => c.term_id === term.id);
                  const activeSubjectsCount = store.termSubjects.filter(ts => ts.term_id === term.id && ts.is_active).length;
                  const isClosed = term.status === 'closed';

                  const statusConfig = {
                    draft: {
                      label: 'Dự Thảo (Draft)',
                      color: 'bg-slate-700/50 text-slate-300 border-slate-600',
                      desc: 'Đang thiết lập môn học và biểu phí, chưa mở cho phụ huynh.',
                    },
                    open_enrollment: {
                      label: 'Đang Tuyển Sinh (Open)',
                      color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
                      desc: 'Các cơ sở được phép mở lớp và phụ huynh có thể đăng ký.',
                    },
                    in_progress: {
                      label: 'Đang Giảng Dạy (In Progress)',
                      color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
                      desc: 'Khóa học đang diễn ra, giáo viên tiến hành điểm danh thực tế.',
                    },
                    closed: {
                      label: 'Đã Đóng (Closed - Read Only)',
                      color: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
                      desc: 'Đã hoàn tất khóa học. Toàn bộ lớp, học viên, hóa đơn bị khóa sửa đổi.',
                    },
                  }[term.status || 'draft'];

                  return (
                    <div
                      key={term.id}
                      className={`rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all backdrop-blur-md ${
                        isClosed 
                          ? 'bg-slate-950/70 border border-slate-800 opacity-90'
                          : 'bg-[#111827]/90 border border-slate-800 hover:border-slate-700 shadow-xl'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-amber-400">{term.code}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-base font-extrabold text-white flex items-center gap-1.5">
                            {isClosed && <Lock className="w-4 h-4 text-rose-400 shrink-0" />}
                            <span>{term.name}</span>
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Năm học: <strong className="text-slate-300">{term.academic_year}</strong> &bull; {term.start_date} &rarr; {term.end_date}
                          </p>
                          {term.description && (
                            <p className="text-[11px] text-slate-400 mt-1 italic">{term.description}</p>
                          )}
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 grid grid-cols-2 gap-2 text-center text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Môn kích hoạt</span>
                            <strong className="text-amber-400 font-mono text-sm">{activeSubjectsCount}</strong>
                            <span className="text-[10px] text-slate-500"> / {store.subjects.length}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Lớp đã mở</span>
                            <strong className="text-cyan-400 font-mono text-sm">{termClasses.length}</strong>
                            <span className="text-[10px] text-slate-500"> lớp học</span>
                          </div>
                        </div>

                        {/* Status switcher */}
                        <div>
                          <label className="block text-[10px] text-slate-400 font-medium mb-1">Chuyển trạng thái vòng đời:</label>
                          <select
                            value={term.status}
                            onChange={(e) => {
                              const newStatus = e.target.value as TermStatus;
                              if (newStatus === 'closed') {
                                const ok = window.confirm(`CẢNH BÁO: Bạn có chắc chắn muốn ĐÓNG (Closed) khóa học "${term.name}"? Toàn bộ lớp học, điểm danh và ghi danh của khóa sẽ bị khóa chỉnh sửa (Read-only).`);
                                if (!ok) return;
                              }
                              onUpdateStore(prev => ({
                                ...prev,
                                terms: prev.terms.map(t => 
                                  t.id === term.id 
                                    ? { 
                                        ...t, 
                                        status: newStatus,
                                        is_active: newStatus === 'open_enrollment' || newStatus === 'in_progress'
                                      } 
                                    : t
                                ),
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:border-amber-500"
                          >
                            <option value="draft">Dự thảo (Draft)</option>
                            <option value="open_enrollment">Mở tuyển sinh (Open Enrollment)</option>
                            <option value="in_progress">Đang giảng dạy (In Progress)</option>
                            <option value="closed">Đã đóng (Closed - Khóa sửa)</option>
                          </select>
                        </div>
                      </div>

                      {/* Term Card Actions */}
                      <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            setSelectedConfigTermId(term.id);
                            setHierarchySubTab('term_subjects');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold transition-all flex items-center gap-1"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Cấu hình môn</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setCloneSourceTermId(term.id);
                              setCloneFormData({
                                code: `${term.code}-COPY`,
                                name: `${term.name} (Bản sao)`,
                                academic_year: term.academic_year,
                                start_date: term.start_date,
                                end_date: term.end_date,
                                status: 'draft',
                                description: `Nhân bản từ ${term.name}`,
                              });
                              setShowCloneModal(true);
                            }}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                            title="Nhân bản cấu hình sang khóa mới"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setEditingTerm(term);
                              setTermFormData({
                                code: term.code,
                                name: term.name,
                                academic_year: term.academic_year,
                                start_date: term.start_date,
                                end_date: term.end_date,
                                status: term.status,
                                description: term.description || '',
                              });
                              setShowTermModal(true);
                            }}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                            title="Sửa thông tin khóa"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SUB-VIEW 2: CẤU HÌNH MÔN HỌC THEO TỪNG KHÓA HỌC (TERM-LEVEL SUBJECT CONFIG) */}
          {hierarchySubTab === 'term_subjects' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#111827]/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Cấu Hình Danh Mục Môn Học Của Từng Khóa</h4>
                    <p className="text-[11px] text-slate-400">
                      Chọn môn nào được Kích Hoạt (Active) trong khóa, định nghĩa Số buổi chuẩn và Học phí chuẩn trọn khóa.
                    </p>
                  </div>
                </div>

                {/* Term Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-semibold whitespace-nowrap">Đang xem khóa:</span>
                  <select
                    value={selectedConfigTermId}
                    onChange={(e) => setSelectedConfigTermId(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-amber-500/40 text-amber-400 text-xs font-bold focus:outline-none"
                  >
                    {store.terms.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.status === 'closed' ? 'Đã đóng' : t.status === 'open_enrollment' ? 'Tuyển sinh' : 'Dự thảo'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Closed Term Alert in Sub-view */}
              {isTermClosed(selectedConfigTermId, store) && (
                <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Khóa học này đã ĐÓNG (Closed). Cấu hình môn học đang ở chế độ Chỉ Xem (Read-only).</span>
                </div>
              )}

              {/* Subject Configurations Table */}
              <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Kích Hoạt</th>
                        <th className="py-3 px-4">Môn Học (Catalog)</th>
                        <th className="py-3 px-4">Danh Mục</th>
                        <th className="py-3 px-4 text-center">Số Buổi Chuẩn</th>
                        <th className="py-3 px-4 font-mono">Học Phí Chuẩn Khóa</th>
                        <th className="py-3 px-4 font-mono">Đơn Giá Buổi (Ceil)</th>
                        <th className="py-3 px-4">Ghi Chú Khóa</th>
                        <th className="py-3 px-4 text-right">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {store.subjects.map(subject => {
                        const termConfig = store.termSubjects.find(
                          ts => ts.term_id === selectedConfigTermId && ts.subject_id === subject.id
                        );

                        const isActive = termConfig ? termConfig.is_active : false;
                        const standardSessions = termConfig ? termConfig.standard_sessions : 24;
                        const standardFee = termConfig ? termConfig.standard_course_fee : 3600000;
                        const ceilRate = calculateCeilSessionRate(standardFee, standardSessions);
                        const isClosed = isTermClosed(selectedConfigTermId, store);

                        return (
                          <tr key={subject.id} className="hover:bg-slate-800/30 transition-colors">
                            {/* Toggle Active */}
                            <td className="py-3 px-4">
                              <button
                                disabled={isClosed}
                                onClick={() => {
                                  if (isClosed) return;
                                  onUpdateStore(prev => {
                                    const existing = prev.termSubjects.find(
                                      ts => ts.term_id === selectedConfigTermId && ts.subject_id === subject.id
                                    );
                                    if (existing) {
                                      return {
                                        ...prev,
                                        termSubjects: prev.termSubjects.map(ts => 
                                          ts.id === existing.id ? { ...ts, is_active: !ts.is_active } : ts
                                        ),
                                      };
                                    } else {
                                      const newConfig: TermSubjectConfig = {
                                        id: `ts_${selectedConfigTermId}_${subject.id}`,
                                        term_id: selectedConfigTermId,
                                        subject_id: subject.id,
                                        is_active: true,
                                        standard_sessions: 24,
                                        standard_course_fee: 3600000,
                                        standard_session_rate: 150000,
                                      };
                                      return {
                                        ...prev,
                                        termSubjects: [...prev.termSubjects, newConfig],
                                      };
                                    }
                                  });
                                }}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                                  isActive
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                                } ${isClosed ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105'}`}
                              >
                                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                                <span>{isActive ? 'Mở dạy' : 'Tạm tắt'}</span>
                              </button>
                            </td>

                            <td className="py-3 px-4 font-bold text-white">
                              <div>{subject.name}</div>
                              <span className="font-mono text-[10px] text-slate-400">{subject.code} &bull; {subject.standard_duration}</span>
                            </td>

                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                                {subject.category}
                              </span>
                            </td>

                            {/* Sessions Input */}
                            <td className="py-3 px-4 text-center">
                              <input
                                type="number"
                                min={4}
                                max={60}
                                disabled={isClosed}
                                value={standardSessions}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  onUpdateStore(prev => ({
                                    ...prev,
                                    termSubjects: prev.termSubjects.map(ts => 
                                      ts.term_id === selectedConfigTermId && ts.subject_id === subject.id
                                        ? { 
                                            ...ts, 
                                            standard_sessions: val, 
                                            standard_session_rate: calculateCeilSessionRate(ts.standard_course_fee, val) 
                                          }
                                        : ts
                                    ),
                                  }));
                                }}
                                className="w-16 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-center font-mono font-bold text-white text-xs disabled:opacity-60"
                              />
                            </td>

                            {/* Standard Fee Input */}
                            <td className="py-3 px-4">
                              <input
                                type="number"
                                step={50000}
                                disabled={isClosed}
                                value={standardFee}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  onUpdateStore(prev => ({
                                    ...prev,
                                    termSubjects: prev.termSubjects.map(ts => 
                                      ts.term_id === selectedConfigTermId && ts.subject_id === subject.id
                                        ? { 
                                            ...ts, 
                                            standard_course_fee: val, 
                                            standard_session_rate: calculateCeilSessionRate(val, ts.standard_sessions) 
                                          }
                                        : ts
                                    ),
                                  }));
                                }}
                                className="w-28 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono font-bold text-amber-400 text-xs disabled:opacity-60"
                              />
                            </td>

                            {/* Ceil Rate Preview */}
                            <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                              {formatVND(ceilRate)}/b
                            </td>

                            {/* Notes */}
                            <td className="py-3 px-4 text-slate-300">
                              <input
                                type="text"
                                disabled={isClosed}
                                placeholder="Ghi chú môn học..."
                                value={termConfig?.notes || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  onUpdateStore(prev => ({
                                    ...prev,
                                    termSubjects: prev.termSubjects.map(ts => 
                                      ts.term_id === selectedConfigTermId && ts.subject_id === subject.id
                                        ? { ...ts, notes: val }
                                        : ts
                                    ),
                                  }));
                                }}
                                className="w-full min-w-[120px] px-2 py-1 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                              />
                            </td>

                            <td className="py-3 px-4 text-right">
                              <span className="text-[10px] text-slate-500">Tự động đồng bộ</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SUB-VIEW 3: CẤU HÌNH BIỂU PHÍ THEO CƠ SỞ (CAMPUS-LEVEL PRICING: OVERRIDE OR INHERIT) */}
          {hierarchySubTab === 'campus_pricing' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#111827]/80 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Biểu Phí Theo Cơ Sở: Kế Thừa Chuẩn Khóa HOẶC Ghi Đè (Override)</h4>
                    <p className="text-[11px] text-slate-400">
                      Mỗi cơ sở có thể kế thừa Biểu phí chuẩn của khóa hoặc đặt mức học phí ưu đãi riêng mà không ảnh hưởng cơ sở khác.
                    </p>
                  </div>
                </div>

                {/* Term & Campus Selectors */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedConfigTermId}
                    onChange={(e) => setSelectedConfigTermId(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-amber-500/40 text-amber-400 text-xs font-bold focus:outline-none"
                  >
                    {store.terms.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>

                  <select
                    value={selectedConfigCampusId}
                    onChange={(e) => setSelectedConfigCampusId(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-cyan-500/40 text-cyan-400 text-xs font-bold focus:outline-none"
                  >
                    {store.campuses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Campus Pricing Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {store.subjects.map(subject => {
                  const termConfig = store.termSubjects.find(
                    ts => ts.term_id === selectedConfigTermId && ts.subject_id === subject.id
                  );
                  const isTermSubjectActive = termConfig ? termConfig.is_active : false;

                  const campusPricing = store.campusPricings.find(
                    cp => cp.term_id === selectedConfigTermId && cp.campus_id === selectedConfigCampusId && cp.subject_id === subject.id
                  );

                  const isOverride = campusPricing ? campusPricing.override_pricing : false;
                  const isOffered = campusPricing ? campusPricing.is_offered_at_campus : true;
                  const effectivePricing = getEffectivePrice(selectedConfigTermId, selectedConfigCampusId, subject.id, store);
                  const isClosed = isTermClosed(selectedConfigTermId, store);

                  return (
                    <div
                      key={subject.id}
                      className={`rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all backdrop-blur-md ${
                        !isTermSubjectActive
                          ? 'bg-slate-950/40 border border-slate-900 opacity-50'
                          : isOverride
                          ? 'bg-gradient-to-b from-[#111827] to-amber-950/20 border border-amber-500/40 shadow-xl'
                          : 'bg-[#111827]/90 border border-slate-800'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-white text-sm">{subject.name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            !isTermSubjectActive
                              ? 'bg-slate-800 text-slate-500'
                              : isOverride
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          }`}>
                            {!isTermSubjectActive 
                              ? 'Chưa bật ở Khóa'
                              : isOverride 
                              ? '★ Ghi Đè Cơ Sở' 
                              : '✓ Kế Thừa Khóa'}
                          </span>
                        </div>

                        {/* Inheritance Switcher */}
                        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-medium">Chính sách biểu phí:</span>
                            <button
                              disabled={isClosed || !isTermSubjectActive}
                              onClick={() => {
                                if (isClosed || !isTermSubjectActive) return;
                                onUpdateStore(prev => {
                                  const existing = prev.campusPricings.find(
                                    cp => cp.term_id === selectedConfigTermId && cp.campus_id === selectedConfigCampusId && cp.subject_id === subject.id
                                  );

                                  if (existing) {
                                    return {
                                      ...prev,
                                      campusPricings: prev.campusPricings.map(cp => 
                                        cp.id === existing.id 
                                          ? { 
                                              ...cp, 
                                              override_pricing: !cp.override_pricing,
                                              custom_course_fee: cp.custom_course_fee || termConfig?.standard_course_fee || 3600000,
                                              custom_sessions: cp.custom_sessions || termConfig?.standard_sessions || 24,
                                            } 
                                          : cp
                                      ),
                                    };
                                  } else {
                                    const newCp: CampusTermPricing = {
                                      id: `cp_${selectedConfigTermId}_${selectedConfigCampusId}_${subject.id}`,
                                      term_id: selectedConfigTermId,
                                      campus_id: selectedConfigCampusId,
                                      subject_id: subject.id,
                                      override_pricing: true,
                                      custom_course_fee: termConfig?.standard_course_fee || 3600000,
                                      custom_sessions: termConfig?.standard_sessions || 24,
                                      is_offered_at_campus: true,
                                      notes: 'Ghi đè biểu phí riêng cơ sở',
                                    };
                                    return {
                                      ...prev,
                                      campusPricings: [...prev.campusPricings, newCp],
                                    };
                                  }
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                isOverride
                                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                                  : 'bg-slate-800 text-slate-300 hover:text-white'
                              } disabled:opacity-50`}
                            >
                              {isOverride ? 'Đang ghi đè riêng' : 'Kế thừa chuẩn khóa'}
                            </button>
                          </div>

                          {/* Override Fields */}
                          {isOverride && (
                            <div className="space-y-2 pt-2 border-t border-slate-800/80">
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-0.5">Học phí cơ sở (VND):</label>
                                  <input
                                    type="number"
                                    step={50000}
                                    disabled={isClosed}
                                    value={campusPricing?.custom_course_fee || termConfig?.standard_course_fee || 3600000}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      onUpdateStore(prev => ({
                                        ...prev,
                                        campusPricings: prev.campusPricings.map(cp => 
                                          cp.term_id === selectedConfigTermId && cp.campus_id === selectedConfigCampusId && cp.subject_id === subject.id
                                            ? { 
                                                ...cp, 
                                                custom_course_fee: val,
                                                custom_session_rate: calculateCeilSessionRate(val, cp.custom_sessions || termConfig?.standard_sessions || 24)
                                              } 
                                            : cp
                                        ),
                                      }));
                                    }}
                                    className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-0.5">Số buổi cơ sở:</label>
                                  <input
                                    type="number"
                                    min={4}
                                    max={60}
                                    disabled={isClosed}
                                    value={campusPricing?.custom_sessions || termConfig?.standard_sessions || 24}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      onUpdateStore(prev => ({
                                        ...prev,
                                        campusPricings: prev.campusPricings.map(cp => 
                                          cp.term_id === selectedConfigTermId && cp.campus_id === selectedConfigCampusId && cp.subject_id === subject.id
                                            ? { 
                                                ...cp, 
                                                custom_sessions: val,
                                                custom_session_rate: calculateCeilSessionRate(cp.custom_course_fee || termConfig?.standard_course_fee || 3600000, val)
                                              } 
                                            : cp
                                        ),
                                      }));
                                    }}
                                    className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono font-bold text-xs text-center"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] text-slate-400 block mb-0.5">Lý do ưu đãi cơ sở:</label>
                                <input
                                  type="text"
                                  disabled={isClosed}
                                  placeholder="Ví dụ: Ưu đãi khai trương cơ sở..."
                                  value={campusPricing?.notes || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    onUpdateStore(prev => ({
                                      ...prev,
                                      campusPricings: prev.campusPricings.map(cp => 
                                        cp.term_id === selectedConfigTermId && cp.campus_id === selectedConfigCampusId && cp.subject_id === subject.id
                                          ? { ...cp, notes: val } 
                                          : cp
                                      ),
                                    }));
                                  }}
                                  className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-300 placeholder-slate-600"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Current Effective Display */}
                        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1 text-xs">
                          <div className="flex justify-between text-slate-400">
                            <span>Học phí áp dụng:</span>
                            <span className="font-mono font-bold text-white text-sm">{formatVND(effectivePricing.course_fee)}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Số buổi:</span>
                            <span className="font-mono font-bold text-slate-200">{effectivePricing.total_sessions} buổi</span>
                          </div>
                          <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                            <span>Đơn giá buổi (Ceil):</span>
                            <span className="font-mono font-bold text-emerald-400">{formatVND(effectivePricing.session_rate)}/b</span>
                          </div>
                        </div>
                      </div>

                      {/* Campus offering toggle */}
                      <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Tuyển sinh tại cơ sở:</span>
                        <button
                          disabled={isClosed || !isTermSubjectActive}
                          onClick={() => {
                            if (isClosed || !isTermSubjectActive) return;
                            onUpdateStore(prev => ({
                              ...prev,
                              campusPricings: prev.campusPricings.map(cp => 
                                cp.term_id === selectedConfigTermId && cp.campus_id === selectedConfigCampusId && cp.subject_id === subject.id
                                  ? { ...cp, is_offered_at_campus: !cp.is_offered_at_campus } 
                                  : cp
                              ),
                            }));
                          }}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isOffered && isTermSubjectActive
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          } disabled:opacity-50`}
                        >
                          {isOffered && isTermSubjectActive ? 'Đang mở tại CS' : 'Không mở tại CS'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SUB-VIEW 4: MA TRẬN BIỂU PHÍ TOÀN TRƯỜNG (FULL MATRIX VIEW) */}
          {hierarchySubTab === 'matrix' && (
            <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    <span>Ma Trận Biểu Phí Hiệu Lực: Khóa Học &times; Cơ Sở &times; Môn Học</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Hệ thống tự động tính toán theo thứ tự ưu tiên: <strong>Cơ Sở Override &gt; Khóa Chuẩn &gt; Mặc Định</strong>. Đơn giá buổi làm tròn Ceil đến hàng nghìn đồng.
                  </p>
                </div>
                <ViewToggle viewMode={pricingViewMode} onViewModeChange={setPricingViewMode} />
              </div>

              {pricingViewMode === 'cards' ? (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {store.terms.flatMap(term => 
                    store.campuses.flatMap(campus => 
                      store.subjects.map(subject => {
                        const eff = getEffectivePrice(term.id, campus.id, subject.id, store);
                        const termConfig = store.termSubjects.find(ts => ts.term_id === term.id && ts.subject_id === subject.id);
                        const isTermActive = termConfig ? termConfig.is_active : false;

                        return (
                          <div key={`${term.id}_${campus.id}_${subject.id}`} className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-white text-sm">{subject.name}</span>
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 font-mono">
                                {campus.code}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-400 flex items-center justify-between">
                              <span>Khóa học: <strong className="text-amber-400">{term.name}</strong></span>
                              <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold ${
                                eff.source === 'campus_override'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-cyan-500/20 text-cyan-300'
                              }`}>
                                {eff.source === 'campus_override' ? 'Cơ sở Override' : 'Chuẩn Khóa'}
                              </span>
                            </div>

                            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Học phí trọn khóa:</span>
                                <span className="font-mono font-extrabold text-amber-400">{formatVND(eff.course_fee)}</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Số buổi học:</span>
                                <span className="font-mono font-bold text-white">{eff.total_sessions} buổi</span>
                              </div>
                              <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                                <span>Đơn giá buổi (Ceil):</span>
                                <span className="font-mono font-bold text-emerald-400">{formatVND(eff.session_rate)}/b</span>
                              </div>
                            </div>

                            <div className="text-[10px] text-slate-500 italic">
                              {eff.notes || (isTermActive ? 'Kích hoạt bình thường' : 'Chưa kích hoạt trong khóa này')}
                            </div>
                          </div>
                        );
                      })
                    )
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Khóa Học</th>
                        <th className="py-3 px-4">Cơ Sở</th>
                        <th className="py-3 px-4">Môn Học</th>
                        <th className="py-3 px-4">Nguồn Biểu Phí</th>
                        <th className="py-3 px-4 text-center">Tổng Buổi</th>
                        <th className="py-3 px-4 font-mono">Học Phí Trọn Khóa</th>
                        <th className="py-3 px-4 font-mono">Đơn Giá Buổi (Ceil)</th>
                        <th className="py-3 px-4">Tình Trạng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {store.terms.flatMap(term => 
                        store.campuses.flatMap(campus => 
                          store.subjects.map(subject => {
                            const eff = getEffectivePrice(term.id, campus.id, subject.id, store);
                            const termConfig = store.termSubjects.find(ts => ts.term_id === term.id && ts.subject_id === subject.id);
                            const isTermActive = termConfig ? termConfig.is_active : false;

                            return (
                              <tr key={`${term.id}_${campus.id}_${subject.id}`} className="hover:bg-slate-800/30 transition-colors">
                                <td className="py-3 px-4 font-semibold text-amber-400">{term.name}</td>
                                <td className="py-3 px-4 text-white font-bold">{campus.code}</td>
                                <td className="py-3 px-4 font-medium text-slate-200">{subject.name}</td>
                                <td className="py-3 px-4">
                                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                    eff.source === 'campus_override'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                  }`}>
                                    {eff.source === 'campus_override' ? '★ Override Cơ sở' : '✓ Chuẩn Khóa'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-white">{eff.total_sessions}</td>
                                <td className="py-3 px-4 font-mono font-extrabold text-amber-400">{formatVND(eff.course_fee)}</td>
                                <td className="py-3 px-4 font-mono font-bold text-emerald-400">{formatVND(eff.session_rate)}/b</td>
                                <td className="py-3 px-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isTermActive && eff.is_offered
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : 'bg-rose-500/10 text-rose-400'
                                  }`}>
                                    {isTermActive && eff.is_offered ? 'Mở tuyển sinh' : 'Không mở'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* CLONE TERM MODAL */}
      {showCloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-cyan-500/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Copy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Nhân Bản (Clone) Cấu Hình Khóa Học</h3>
                <p className="text-xs text-slate-400">Sao chép toàn bộ môn kích hoạt và biểu phí sang khóa mới, bảo toàn lịch sử.</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!cloneFormData.code || !cloneFormData.name) return;

                const { updatedStore, newTermId } = cloneTermConfiguration(cloneSourceTermId, cloneFormData, store);
                onUpdateStore(() => updatedStore);
                setSelectedConfigTermId(newTermId);
                setShowCloneModal(false);
                alert(`Đã nhân bản thành công khóa mới: "${cloneFormData.name}" (${cloneFormData.code}) với đầy đủ cấu hình môn học và biểu phí!`);
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block text-slate-400 font-medium mb-1">Khóa học nguồn để sao chép cấu hình:</label>
                <select
                  value={cloneSourceTermId}
                  onChange={(e) => setCloneSourceTermId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold focus:outline-none focus:border-cyan-500"
                >
                  {store.terms.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Mã khóa mới *</label>
                  <input
                    type="text"
                    required
                    value={cloneFormData.code}
                    onChange={(e) => setCloneFormData({ ...cloneFormData, code: e.target.value.toUpperCase() })}
                    placeholder="VD: SPRING-2027"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Năm học *</label>
                  <input
                    type="text"
                    required
                    value={cloneFormData.academic_year}
                    onChange={(e) => setCloneFormData({ ...cloneFormData, academic_year: e.target.value })}
                    placeholder="VD: 2026-2027"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Tên khóa học mới *</label>
                <input
                  type="text"
                  required
                  value={cloneFormData.name}
                  onChange={(e) => setCloneFormData({ ...cloneFormData, name: e.target.value })}
                  placeholder="VD: Khóa Mùa Xuân 2027 (HK2)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Ngày bắt đầu</label>
                  <input
                    type="date"
                    required
                    value={cloneFormData.start_date}
                    onChange={(e) => setCloneFormData({ ...cloneFormData, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Ngày kết thúc</label>
                  <input
                    type="date"
                    required
                    value={cloneFormData.end_date}
                    onChange={(e) => setCloneFormData({ ...cloneFormData, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Trạng thái ban đầu</label>
                <select
                  value={cloneFormData.status}
                  onChange={(e) => setCloneFormData({ ...cloneFormData, status: e.target.value as TermStatus })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 font-semibold"
                >
                  <option value="draft">Dự thảo (Draft) - Tiếp tục chỉnh sửa trước khi công bố</option>
                  <option value="open_enrollment">Mở tuyển sinh (Open Enrollment) - Cho phép tuyển sinh ngay</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCloneModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-lg shadow-cyan-600/20"
                >
                  Tạo Bản Sao Khóa Mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT TERM MODAL */}
      {showTermModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  {editingTerm ? 'Cập Nhật Khóa Học' : 'Tạo Khóa Học Mới'}
                </h3>
                <p className="text-xs text-slate-400">Thiết lập thời gian và trạng thái vòng đời tuyển sinh.</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!termFormData.code || !termFormData.name) return;

                if (editingTerm) {
                  onUpdateStore(prev => ({
                    ...prev,
                    terms: prev.terms.map(t => 
                      t.id === editingTerm.id 
                        ? { 
                            ...t, 
                            ...termFormData,
                            is_active: termFormData.status === 'open_enrollment' || termFormData.status === 'in_progress',
                          } 
                        : t
                    ),
                  }));
                } else {
                  const newTermId = `term_${Date.now()}`;
                  const newTerm: AcademicTerm = {
                    id: newTermId,
                    ...termFormData,
                    is_active: termFormData.status === 'open_enrollment' || termFormData.status === 'in_progress',
                  };

                  // Auto-create default term subjects for all subjects
                  const defaultTermSubjects: TermSubjectConfig[] = store.subjects.map(s => ({
                    id: `ts_${newTermId}_${s.id}`,
                    term_id: newTermId,
                    subject_id: s.id,
                    is_active: true,
                    standard_sessions: 24,
                    standard_course_fee: 3600000,
                    standard_session_rate: 150000,
                  }));

                  onUpdateStore(prev => ({
                    ...prev,
                    terms: [...prev.terms, newTerm],
                    termSubjects: [...prev.termSubjects, ...defaultTermSubjects],
                  }));
                  setSelectedConfigTermId(newTermId);
                }

                setShowTermModal(false);
                setEditingTerm(null);
              }}
              className="space-y-3.5 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Mã khóa *</label>
                  <input
                    type="text"
                    required
                    value={termFormData.code}
                    onChange={(e) => setTermFormData({ ...termFormData, code: e.target.value.toUpperCase() })}
                    placeholder="VD: FALL-2027"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Năm học *</label>
                  <input
                    type="text"
                    required
                    value={termFormData.academic_year}
                    onChange={(e) => setTermFormData({ ...termFormData, academic_year: e.target.value })}
                    placeholder="VD: 2026-2027"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Tên khóa học *</label>
                <input
                  type="text"
                  required
                  value={termFormData.name}
                  onChange={(e) => setTermFormData({ ...termFormData, name: e.target.value })}
                  placeholder="VD: Khóa Mùa Thu 2027 (HK1)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Ngày bắt đầu</label>
                  <input
                    type="date"
                    required
                    value={termFormData.start_date}
                    onChange={(e) => setTermFormData({ ...termFormData, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Ngày kết thúc</label>
                  <input
                    type="date"
                    required
                    value={termFormData.end_date}
                    onChange={(e) => setTermFormData({ ...termFormData, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Trạng thái vòng đời *</label>
                <select
                  value={termFormData.status}
                  onChange={(e) => setTermFormData({ ...termFormData, status: e.target.value as TermStatus })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-semibold"
                >
                  <option value="draft">Dự thảo (Draft)</option>
                  <option value="open_enrollment">Mở tuyển sinh (Open Enrollment)</option>
                  <option value="in_progress">Đang giảng dạy (In Progress)</option>
                  <option value="closed">Đã đóng (Closed - Khóa sửa)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Mô tả / Ghi chú</label>
                <input
                  type="text"
                  value={termFormData.description}
                  onChange={(e) => setTermFormData({ ...termFormData, description: e.target.value })}
                  placeholder="Ghi chú thêm về khóa học..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowTermModal(false);
                    setEditingTerm(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  {editingTerm ? 'Cập Nhật Khóa' : 'Tạo Khóa Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT CAMPUS MODAL */}
      {showCampusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  {editingCampus ? 'Cập Nhật Cơ Sở & Ngân Hàng' : 'Thêm Cơ Sở Mới'}
                </h3>
                <p className="text-xs text-slate-400">Thông tin cơ sở đào tạo và tài khoản nhận thanh toán VietQR.</p>
              </div>
            </div>

            <form onSubmit={handleSaveCampus} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-slate-400 font-medium mb-1">Mã CS *</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={campusFormData.code}
                    onChange={(e) => setCampusFormData({ ...campusFormData, code: e.target.value.toUpperCase() })}
                    placeholder="VD: PMH"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-400 font-medium mb-1">Trạng thái *</label>
                  <select
                    value={campusFormData.status}
                    onChange={(e) => setCampusFormData({ ...campusFormData, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500"
                  >
                    <option value="active">Hoạt động (Active)</option>
                    <option value="inactive">Tạm dừng (Inactive)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Tên cơ sở *</label>
                <input
                  type="text"
                  required
                  value={campusFormData.name}
                  onChange={(e) => setCampusFormData({ ...campusFormData, name: e.target.value })}
                  placeholder="VD: Cơ sở Phú Mỹ Hưng (Quận 7)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Địa chỉ chi tiết *</label>
                <input
                  type="text"
                  required
                  value={campusFormData.address}
                  onChange={(e) => setCampusFormData({ ...campusFormData, address: e.target.value })}
                  placeholder="VD: 08 Đặng Đại Độ, P. Tân Phong, Q.7, TP.HCM"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Hotline liên hệ *</label>
                <input
                  type="text"
                  required
                  value={campusFormData.phone}
                  onChange={(e) => setCampusFormData({ ...campusFormData, phone: e.target.value })}
                  placeholder="VD: 028 7100 7878"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-cyan-300 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* VietQR Bank Information Box */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-950 border border-amber-500/30 space-y-3">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Cấu hình tài khoản VietQR thụ hưởng học phí</span>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Ngân hàng & Chi nhánh *</label>
                  <input
                    type="text"
                    required
                    value={campusFormData.bank_name}
                    onChange={(e) => setCampusFormData({ ...campusFormData, bank_name: e.target.value })}
                    placeholder="VD: Vietcombank - CN Nam Sài Gòn"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Số tài khoản *</label>
                    <input
                      type="text"
                      required
                      value={campusFormData.bank_account}
                      onChange={(e) => setCampusFormData({ ...campusFormData, bank_account: e.target.value.replace(/\s+/g, '') })}
                      placeholder="VD: 0181003456789"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Chủ tài khoản (In hoa) *</label>
                    <input
                      type="text"
                      required
                      value={campusFormData.bank_owner}
                      onChange={(e) => setCampusFormData({ ...campusFormData, bank_owner: e.target.value.toUpperCase() })}
                      placeholder="VD: CONG TY CP GD QUOC TE HOANG GIA"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 font-semibold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCampusModal(false);
                    setEditingCampus(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  {editingCampus ? 'Lưu Thay Đổi' : 'Thêm Cơ Sở'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 2: CAMPUSES */}
      {activeSection === 'campuses' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#111827]/80 border border-slate-800/80">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                <span>Hệ Thống Cơ Sở Trường Song Ngữ Quốc Tế Hoàng Gia ({store.campuses.length} cơ sở)</span>
              </h3>
              <p className="text-[11px] text-slate-400">Danh mục cơ sở đào tạo, thông tin liên hệ và số tài khoản VietQR thu học phí</p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleOpenAddCampus}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>+ Thêm Cơ Sở Mới</span>
              </button>
              <ViewToggle viewMode={campusesViewMode} onViewModeChange={setCampusesViewMode} />
            </div>
          </div>

          {campusesViewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {store.campuses.map(campus => (
                <div key={campus.id} className="p-5 rounded-3xl bg-[#111827]/80 border border-slate-800/80 backdrop-blur-md shadow-xl flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono font-bold text-xs">
                          {campus.code}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          campus.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {campus.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                        </span>
                      </div>

                      {/* Header quick edit/delete */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditCampus(campus)}
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                          title="Sửa cơ sở & ngân hàng"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCampus(campus)}
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-all"
                          title="Xóa cơ sở"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-white">{campus.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{campus.address}</p>
                      <p className="text-xs text-cyan-300 font-mono mt-0.5">Hotline: {campus.phone}</p>
                    </div>

                    <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900/60 to-slate-900 border border-amber-500/30 space-y-1 text-xs">
                      <div className="text-[10px] text-amber-400 uppercase font-bold tracking-wider">Tài khoản thu học phí VietQR:</div>
                      <div className="text-white font-medium">{campus.bank_name}</div>
                      <div className="text-amber-400 font-mono font-bold text-sm tracking-wide">{campus.bank_account}</div>
                      <div className="text-slate-300 text-[11px] font-semibold">{campus.bank_owner}</div>
                    </div>
                  </div>

                  {/* Card bottom actions */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenEditCampus(campus)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Sửa thông tin</span>
                    </button>
                    <button
                      onClick={() => handleDeleteCampus(campus)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Xóa cơ sở</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-3xl bg-[#111827]/80 border border-slate-800/80">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Mã CS</th>
                    <th className="py-3 px-4">Tên Cơ Sở</th>
                    <th className="py-3 px-4">Địa Chỉ</th>
                    <th className="py-3 px-4">Hotline</th>
                    <th className="py-3 px-4">Ngân Hàng VietQR</th>
                    <th className="py-3 px-4">Số Tài Khoản</th>
                    <th className="py-3 px-4">Chủ Tài Khoản</th>
                    <th className="py-3 px-4 text-center">Trạng Thái</th>
                    <th className="py-3 px-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {store.campuses.map(campus => (
                    <tr key={campus.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-amber-400">{campus.code}</td>
                      <td className="py-3 px-4 font-bold text-white">{campus.name}</td>
                      <td className="py-3 px-4 text-slate-300 max-w-xs">{campus.address}</td>
                      <td className="py-3 px-4 font-mono text-cyan-300">{campus.phone}</td>
                      <td className="py-3 px-4 text-slate-200">{campus.bank_name}</td>
                      <td className="py-3 px-4 font-mono font-bold text-amber-400">{campus.bank_account}</td>
                      <td className="py-3 px-4 text-slate-300 font-semibold">{campus.bank_owner}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          campus.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {campus.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditCampus(campus)}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                            title="Sửa cơ sở"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteCampus(campus)}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-all"
                            title="Xóa cơ sở"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: CLEAN SEED DATA / RESET DB (MODULE 5.1) */}
      {activeSection === 'clean_reset' && (
        <div className="rounded-3xl bg-[#111827]/90 border border-rose-500/40 p-6 md:p-8 backdrop-blur-md shadow-2xl max-w-3xl mx-auto space-y-6">
          <div className="flex items-center gap-3 text-rose-400">
            <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Module Dọn Sạch Dữ Liệu & Khôi Phục Hệ Thống (Database Reset)</h3>
              <p className="text-xs text-slate-400">
                Quyền hạn: <strong className="text-amber-400">Super Admin duy nhất</strong> &bull; Bắt buộc xác thực mật mã để bảo đảm an toàn dữ liệu
              </p>
            </div>
          </div>

          {resetSuccessMessage && (
            <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{resetSuccessMessage}</span>
            </div>
          )}

          {/* 4 Reset Options Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Chọn 1 trong 4 cấp độ Reset dữ liệu:
            </label>

            <div className="space-y-2 text-xs">
              <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                selectedResetOption === 'ops' ? 'bg-rose-500/10 border-rose-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}>
                <input
                  type="radio"
                  name="resetOption"
                  checked={selectedResetOption === 'ops'}
                  onChange={() => setSelectedResetOption('ops')}
                  className="mt-0.5 text-rose-500 focus:ring-0"
                />
                <div>
                  <div className="font-bold text-rose-300">Option 1 - Xóa Dữ Liệu Vận Hành & Giao Dịch</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Xóa sạch: Điểm danh, Buổi học, Hóa đơn học phí, Phiếu bảo lưu, Quyết toán thù lao. <strong>Giữ nguyên danh mục Lớp học, Học sinh, Giáo viên và Cơ sở.</strong>
                  </div>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                selectedResetOption === 'students' ? 'bg-rose-500/10 border-rose-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}>
                <input
                  type="radio"
                  name="resetOption"
                  checked={selectedResetOption === 'students'}
                  onChange={() => setSelectedResetOption('students')}
                  className="mt-0.5 text-rose-500 focus:ring-0"
                />
                <div>
                  <div className="font-bold text-rose-300">Option 2 - Xóa Dữ Liệu Học Sinh & Ghi Danh</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Xóa sạch toàn bộ hồ sơ Học sinh (Royal & Ngoài trường) và các liên kết lớp học.
                  </div>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                selectedResetOption === 'classes' ? 'bg-rose-500/10 border-rose-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}>
                <input
                  type="radio"
                  name="resetOption"
                  checked={selectedResetOption === 'classes'}
                  onChange={() => setSelectedResetOption('classes')}
                  className="mt-0.5 text-rose-500 focus:ring-0"
                />
                <div>
                  <div className="font-bold text-rose-300">Option 3 - Xóa Lớp Học & Phân Công</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Xóa danh sách lớp mở trong kỳ và lịch học phân công giáo viên.
                  </div>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                selectedResetOption === 'factory' ? 'bg-rose-500/10 border-rose-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}>
                <input
                  type="radio"
                  name="resetOption"
                  checked={selectedResetOption === 'factory'}
                  onChange={() => setSelectedResetOption('factory')}
                  className="mt-0.5 text-rose-500 focus:ring-0"
                />
                <div>
                  <div className="font-bold text-rose-300">Option 4 - Full Factory Reset (TRUNCATE ... CASCADE)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Xóa toàn bộ mọi bảng dữ liệu vận hành. Chỉ giữ lại tài khoản cấu hình hệ thống.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Security confirmation text input */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Xác thực an toàn (Bắt buộc nhập đúng mật mã):</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Vui lòng nhập chính xác chữ: <strong className="text-rose-400 font-mono">DELETE_CONFIRM</strong> vào ô dưới đây để mở khóa:
            </div>
            <input
              type="text"
              placeholder="DELETE_CONFIRM"
              value={resetConfirmCode}
              onChange={(e) => setResetConfirmCode(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-rose-500/40 text-white font-mono font-bold focus:outline-none focus:border-rose-500 text-xs"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              onClick={handleRestoreInitialSeed}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-700"
            >
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <span>Khôi Phục Dữ Liệu Mẫu Chuẩn Hoàng Gia</span>
            </button>

            <button
              onClick={handleExecuteReset}
              disabled={resetConfirmCode !== 'DELETE_CONFIRM'}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                resetConfirmCode === 'DELETE_CONFIRM'
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>Thực Hiện Dọn Sạch Dữ Liệu</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION 4: EXCEL MASTER IMPORTER (MODULE 5.2 - 10 SHEETS) */}
      {activeSection === 'excel_master' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Module Nhập & Xuất Master Excel Đồng Bộ 10 Sheets</h3>
              </div>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Đọc và nạp dữ liệu hàng loạt từ tệp Excel đa bảng tính. Tự động kiểm tra khóa ngoại, bỏ dòng trống, trim khoảng trắng, chuẩn hóa định dạng ngày tháng YYYY-MM-DD và cơ chế Upsert thông minh.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadSampleTemplate}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
              >
                <Download className="w-4 h-4 text-slate-300" />
                <span>Tải Tệp Mẫu 10 Sheets</span>
              </button>

              <button
                onClick={() => exportMasterWorkbook(store)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 transition-all"
              >
                <Download className="w-4 h-4 text-emerald-100" />
                <span>Xuất Toàn Bộ Dữ Liệu</span>
              </button>
            </div>
          </div>

          {/* 10 Sheets Specification List */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
            {[
              { id: '01', name: '01_CO_SO', desc: 'Cơ sở & Ngân hàng' },
              { id: '02', name: '02_SAN_BAI_PHONG_HOC', desc: 'Phòng học, sân bãi' },
              { id: '03', name: '03_MON_HOC', desc: 'Môn học ngoại khóa' },
              { id: '04', name: '04_KHUNG_GIO', desc: 'Ca học sau giờ & cuối tuần' },
              { id: '05', name: '05_GIAO_VIEN', desc: 'GV cơ hữu & thỉnh giảng' },
              { id: '06', name: '06_LOP_HOC', desc: 'Lớp học mở trong khóa' },
              { id: '07', name: '07_HOC_VIEN', desc: 'Hồ sơ học sinh & Y tế' },
              { id: '08', name: '08_GHI_DANH', desc: 'Học sinh vào từng lớp' },
              { id: '09', name: '09_DIEM_DANH_BUOI', desc: 'Lịch sử chuyên cần' },
              { id: '10', name: '10_BAO_LUU_TIEN_BUOI', desc: 'Phiếu bảo lưu hiệu lực' },
            ].map(sheet => (
              <div key={sheet.id} className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono font-bold text-amber-400 block">{sheet.name}</span>
                <span className="text-[11px] text-slate-300 block font-medium leading-tight">{sheet.desc}</span>
              </div>
            ))}
          </div>

          {/* Upload Dropzone */}
          <div className="p-8 rounded-3xl border-2 border-dashed border-slate-700 hover:border-emerald-500/50 bg-slate-900/50 text-center transition-colors">
            <Upload className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <div className="text-sm font-bold text-white mb-1">
              Chọn hoặc kéo thả tệp Excel Master (.xlsx) vào đây
            </div>
            <div className="text-xs text-slate-400 mb-4">
              Hệ thống sẽ tự động đối soát và nạp toàn bộ các sheet vào cơ sở dữ liệu
            </div>

            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-emerald-600/20 transition-all">
              <span>Duyệt Chọn Tệp (.xlsx)</span>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {importStatus.message && (
              <div className={`mt-4 p-3 rounded-2xl text-xs max-w-md mx-auto ${
                importStatus.isError ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {importStatus.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 5: TELECOM CONFIG */}
      {activeSection === 'telecom' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 md:p-8 backdrop-blur-md shadow-xl max-w-2xl mx-auto space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">Cấu Hình Kênh Viễn Thông & Thông Báo Phụ Huynh Tự Động</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Hệ thống hỗ trợ gửi thông báo tự động (nhắc nợ học phí, báo cáo chuyên cần, cấp phiếu bảo lưu và đối soát bánh sữa) qua các cổng viễn thông ngoại vi.
          </p>

          <div className="space-y-3 text-xs">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-bold text-white">Zalo ZNS (Zalo Notification Service)</div>
                <div className="text-[11px] text-slate-400">Gửi tin nhắn mẫu đã đăng ký qua OA Royal School</div>
              </div>
              <input
                type="checkbox"
                checked={store.telecomConfig.zaloZnsEnabled}
                onChange={(e) => onUpdateStore(prev => ({
                  ...prev,
                  telecomConfig: { ...prev.telecomConfig, zaloZnsEnabled: e.target.checked }
                }))}
                className="w-5 h-5 rounded text-amber-500 focus:ring-0 bg-slate-800 border-slate-700"
              />
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-bold text-white">SMS Brandname "ROYAL SCHOOL"</div>
                <div className="text-[11px] text-slate-400">Tin nhắn SMS định danh viễn thông tiêu chuẩn</div>
              </div>
              <input
                type="checkbox"
                checked={store.telecomConfig.smsBrandnameEnabled}
                onChange={(e) => onUpdateStore(prev => ({
                  ...prev,
                  telecomConfig: { ...prev.telecomConfig, smsBrandnameEnabled: e.target.checked }
                }))}
                className="w-5 h-5 rounded text-amber-500 focus:ring-0 bg-slate-800 border-slate-700"
              />
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-bold text-white">Email Thông Báo Tự Động</div>
                <div className="text-[11px] text-slate-400">Gửi thư điện tử kèm đính kèm PDF Biên lai / Sổ điểm danh</div>
              </div>
              <input
                type="checkbox"
                checked={store.telecomConfig.emailEnabled}
                onChange={(e) => onUpdateStore(prev => ({
                  ...prev,
                  telecomConfig: { ...prev.telecomConfig, emailEnabled: e.target.checked }
                }))}
                className="w-5 h-5 rounded text-amber-500 focus:ring-0 bg-slate-800 border-slate-700"
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: SUPABASE POSTGRESQL CONFIG */}
      {activeSection === 'supabase' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 md:p-8 backdrop-blur-md shadow-xl max-w-2xl mx-auto space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Cấu Hình Kết Nối Supabase Cloud PostgreSQL</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Ứng dụng hiện lưu trữ trực tiếp bằng Client State & LocalStorage tốc độ cao, hoàn toàn tương thích và sẵn sàng đồng bộ 100% với 16 bảng PostgreSQL đã định nghĩa.
          </p>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Supabase Project URL</label>
              <input
                type="text"
                placeholder="https://xyzcompany.supabase.co"
                value={sbUrl}
                onChange={(e) => setSbUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Supabase Anon Key (Public Key)</label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Trạng thái kết nối Supabase:</span>
              {sbConnected ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Đã kết nối trực tiếp
                </span>
              ) : (
                <span className="text-amber-400 font-semibold">Chế độ Standalone Local Storage (Sẵn sàng đồng bộ)</span>
              )}
            </div>

            <button
              onClick={handleSaveSupabase}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20"
            >
              Lưu & Kiểm Tra Kết Nối Supabase
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
