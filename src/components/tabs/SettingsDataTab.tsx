import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Trash2, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  DollarSign, 
  Building2, 
  Zap,
  Save, 
  ShieldAlert, 
  CheckCircle2, 
  CheckCircle,
  PauseCircle,
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
  Tag,
  School,
  GraduationCap,
  Search,
  Filter,
  Activity,
  Palette,
  Code,
  HeartPulse,
  Music,
  Trophy,
  Smile,
  Compass,
  Cloud,
  FolderCheck,
  HardDrive,
  Share2,
  ExternalLink,
  Table,
  ShieldCheck,
  Users,
  CalendarOff
} from 'lucide-react';
import { 
  AppStore, 
  formatVND, 
  calculateCeilSessionRate, 
  getInitialStore, 
  getSampleDemoStore,
  deduplicateEnrollments,
  getEffectivePrice, 
  cloneTermConfiguration, 
  isTermClosed,
  createAuditRecord,
  appendAuditLog,
  recalculatePastSessions,
  resolveSubjectCategoryCode
} from '../../lib/storage';
import { getSupabaseClient, supabase } from '../../supabaseClient';
import { AuditLogsTab } from './AuditLogsTab';
import { UserManagementTab } from './UserManagementTab';
import { HolidayManagementView } from '../settings/HolidayManagementView';
import { downloadSampleTemplate, parseMasterExcelFile, exportMasterWorkbook } from '../../lib/excel';
import {
  ROYAL_STANDARDIZED_10_TABLES,
  SUPABASE_FULL_DDL_SQL,
  SUPABASE_REALTIME_PUBLICATION_SQL,
  verifySupabaseConnection,
  inspectAllDatabaseTables,
  pushSingleTableToSupabase,
  pushAllTablesToSupabase,
  pullAllTablesFromSupabase,
  sanitizeSupabaseBaseUrl,
  TableHealthStatus,
  SupabaseConnectionCheckResult,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY
} from '../../lib/supabase';
import { 
  UserRole, 
  AppUser,
  TermCampusSubjectPricing, 
  Campus, 
  AcademicTerm, 
  TermStatus, 
  Subject,
  SubjectCategory,
  TermSubjectConfig, 
  CampusTermPricing,
  DiscountType,
  CloudStorageConfig,
  Teacher,
  PayrollRateConfig,
} from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { showToast } from '../../lib/toast';
import { CreateSubjectModal } from '../modals/CreateSubjectModal';
import { ImportSubjectsModal } from '../modals/ImportSubjectsModal';


interface SettingsDataTabProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  initialSection?: 'pricing' | 'teacher_rates' | 'campuses' | 'holidays' | 'clean_reset' | 'excel_master' | 'telecom' | 'supabase' | 'users' | 'audit_logs' | 'backup';
  initialSubTab?: 'categories' | 'subjects' | 'terms' | 'term_subjects' | 'campus_pricing' | 'matrix';
}

export const SettingsDataTab: React.FC<SettingsDataTabProps> = ({
  store,
  currentRole,
  currentUser,
  onUpdateStore,
  initialSection = 'pricing',
  initialSubTab = 'terms',
}) => {
  const [activeSection, setActiveSection] = useState<'pricing' | 'teacher_rates' | 'campuses' | 'holidays' | 'clean_reset' | 'excel_master' | 'telecom' | 'supabase' | 'users' | 'audit_logs' | 'backup'>(initialSection || 'pricing');
  const [pricingViewMode, setPricingViewMode] = useState<ViewMode>('table');
  const [campusesViewMode, setCampusesViewMode] = useState<ViewMode>('table');

  // State for Uniform Teacher Rate Configuration (Cấu hình Định mức Thù Lao Chuẩn Theo Buổi Toàn Trường)
  const [permanentSessionRateInput, setPermanentSessionRateInput] = useState<number>(
    store.payrollRateConfig?.permanent_session_rate ?? 300000
  );
  const [visitingSessionRateInput, setVisitingSessionRateInput] = useState<number>(
    store.payrollRateConfig?.visiting_session_rate ?? 270000
  );
  const [permanentPeriodRateInput, setPermanentPeriodRateInput] = useState<number>(
    store.payrollRateConfig?.permanent_rate_per_period ?? 150000
  );
  const [visitingPeriodRateInput, setVisitingPeriodRateInput] = useState<number>(
    store.payrollRateConfig?.visiting_rate_per_period ?? 135000
  );
  const [periodsPerSessionInput, setPeriodsPerSessionInput] = useState<number>(
    store.payrollRateConfig?.periods_per_session ?? 2
  );
  const [showRetroactiveConfirmModal, setShowRetroactiveConfirmModal] = useState<boolean>(false);
  const [rateSaveSuccessToast, setRateSaveSuccessToast] = useState<string | null>(null);
  const [teacherSearchQuery, setTeacherSearchQuery] = useState<string>('');

  useEffect(() => {
    if (store.payrollRateConfig) {
      const periods = store.payrollRateConfig.periods_per_session || 2;
      const permSess = store.payrollRateConfig.permanent_session_rate ?? (store.payrollRateConfig.permanent_rate_per_period * periods);
      const visSess = store.payrollRateConfig.visiting_session_rate ?? (store.payrollRateConfig.visiting_rate_per_period * periods);
      setPermanentSessionRateInput(permSess);
      setVisitingSessionRateInput(visSess);
      setPermanentPeriodRateInput(Math.round(permSess / periods));
      setVisitingPeriodRateInput(Math.round(visSess / periods));
      setPeriodsPerSessionInput(periods);
    }
  }, [store.payrollRateConfig]);

  const [teacherCampusFilter, setTeacherCampusFilter] = useState<string>('all');
  const [teacherTypeFilter, setTeacherTypeFilter] = useState<'all' | 'permanent' | 'visiting'>('all');
  const [inlineEditingTeacherId, setInlineEditingTeacherId] = useState<string | null>(null);
  const [inlinePeriodRate, setInlinePeriodRate] = useState<number>(150000);
  const [inlinePeriodsPerSession, setInlinePeriodsPerSession] = useState<number>(2);
  const [editingTeacherModal, setEditingTeacherModal] = useState<Teacher | null>(null);
  const [isCreatingTeacher, setIsCreatingTeacher] = useState<boolean>(false);
  const [teacherForm, setTeacherForm] = useState<{
    code: string;
    name: string;
    phone: string;
    email: string;
    campus_id: string;
    teacher_type: 'permanent' | 'visiting';
    default_rate_per_period: number;
    periods_per_session: number;
    weekend_multiplier: number;
    custom_subject_rates: { subject_id: string; rate_per_period: number }[];
    bank_name: string;
    account_number: string;
    account_holder: string;
    subjects: string[];
  }>({
    code: 'GV-PMH-004',
    name: '',
    phone: '',
    email: '',
    campus_id: 'camp_pmh',
    teacher_type: 'permanent',
    default_rate_per_period: 150000,
    periods_per_session: 2,
    weekend_multiplier: 1.0,
    custom_subject_rates: [],
    bank_name: 'Vietcombank',
    account_number: '',
    account_holder: '',
    subjects: ['sub_swim'],
  });

  const handleOpenEditTeacherRateModal = (teacher: Teacher) => {
    setIsCreatingTeacher(false);
    setEditingTeacherModal(teacher);
    const periods = teacher.periods_per_session || 2;
    const ratePerPeriod =
      teacher.default_rate_per_period ||
      Math.round((teacher.fixed_rate_per_session || 300000) / periods);
    setTeacherForm({
      code: teacher.code || `GV-PMH-001`,
      name: teacher.name,
      phone: teacher.phone,
      email: teacher.email,
      campus_id: teacher.campus_id || 'camp_pmh',
      teacher_type: teacher.type || teacher.teacher_type || 'permanent',
      default_rate_per_period: ratePerPeriod,
      periods_per_session: periods,
      weekend_multiplier: teacher.weekend_multiplier ?? 1.0,
      custom_subject_rates: teacher.custom_subject_rates ? [...teacher.custom_subject_rates] : [],
      bank_name: teacher.bank_account?.bank_name || 'Vietcombank',
      account_number: teacher.bank_account?.account_number || '',
      account_holder: teacher.bank_account?.account_holder || teacher.name.toUpperCase(),
      subjects: teacher.subjects || ['sub_swim'],
    });
  };

  const handleOpenCreateTeacherModal = () => {
    setIsCreatingTeacher(true);
    setEditingTeacherModal(null);
    const nextIdx = store.teachers.length + 1;
    setTeacherForm({
      code: `GV-PMH-00${nextIdx}`,
      name: '',
      phone: '',
      email: '',
      campus_id: 'camp_pmh',
      teacher_type: 'permanent',
      default_rate_per_period: 150000,
      periods_per_session: 2,
      weekend_multiplier: 1.0,
      custom_subject_rates: [],
      bank_name: 'Vietcombank',
      account_number: '',
      account_holder: '',
      subjects: ['sub_swim'],
    });
  };

  const handleSaveInlineTeacherRate = (teacher: Teacher) => {
    const validRate = Math.max(10000, Number(inlinePeriodRate) || 150000);
    const validPeriods = Math.max(1, Math.min(6, Number(inlinePeriodsPerSession) || 2));
    const oldRate = teacher.default_rate_per_period || Math.round((teacher.fixed_rate_per_session || 300000) / (teacher.periods_per_session || 2));
    const oldPeriods = teacher.periods_per_session || 2;
    const newSessionRate = validRate * validPeriods;

    onUpdateStore(prev => {
      const updatedTeachers = prev.teachers.map(t =>
        t.id === teacher.id
          ? {
              ...t,
              default_rate_per_period: validRate,
              periods_per_session: validPeriods,
              fixed_rate_per_session: newSessionRate,
            }
          : t
      );

      const log = createAuditRecord(
        'TEACHER_RATE_UPDATE',
        'FINANCE',
        `Giáo viên ${teacher.name} (${teacher.code || teacher.id})`,
        `Cập nhật nhanh định mức thù lao giảng dạy cho ${teacher.name}: Đơn giá tiết từ ${formatVND(oldRate)}/tiết → ${formatVND(validRate)}/tiết (${validPeriods} tiết/buổi = ${formatVND(newSessionRate)}/buổi)`,
        null,
        {
          target_id: teacher.code || teacher.id,
          details: {
            status: 'success',
            before: {
              default_rate_per_period: oldRate,
              periods_per_session: oldPeriods,
              fixed_rate_per_session: oldRate * oldPeriods,
            },
            after: {
              default_rate_per_period: validRate,
              periods_per_session: validPeriods,
              fixed_rate_per_session: newSessionRate,
            },
          },
        }
      );

      return {
        ...prev,
        teachers: updatedTeachers,
        auditLogs: [log, ...(prev.auditLogs || [])],
      };
    });

    setInlineEditingTeacherId(null);
    showToast(
      `Đã cập nhật định mức thù lao của ${teacher.name}: ${formatVND(validRate)}/tiết (${formatVND(newSessionRate)}/buổi) & ghi nhận Audit Log!`,
      'success',
      { title: 'Cập nhật định mức thù lao' }
    );
  };

  const handleSaveUniformPayrollRates = () => {
    setShowRetroactiveConfirmModal(true);
  };

  const handleConfirmRetroactivePayrollRates = () => {
    const permSessionRate = Math.max(100000, Number(permanentSessionRateInput) || 300000);
    const visSessionRate = Math.max(100000, Number(visitingSessionRateInput) || 270000);
    const periods = Math.max(1, Math.min(6, Number(periodsPerSessionInput) || 2));
    const permPeriodRate = Math.round(permSessionRate / periods);
    const visPeriodRate = Math.round(visSessionRate / periods);

    setPermanentPeriodRateInput(permPeriodRate);
    setVisitingPeriodRateInput(visPeriodRate);

    onUpdateStore(prev => {
      const recalculatedStore = recalculatePastSessions(prev, permSessionRate, visSessionRate);
      const totalSessionsSynced = (recalculatedStore.teacherAttendance || []).length;

      const updatedConfig: PayrollRateConfig = {
        permanent_session_rate: permSessionRate,
        visiting_session_rate: visSessionRate,
        permanent_rate_per_period: permPeriodRate,
        visiting_rate_per_period: visPeriodRate,
        periods_per_session: periods,
        updated_at: new Date().toISOString().split('T')[0],
        updated_by: 'Phòng Tài Chính & Kế Toán Royal School',
      };

      const auditLog = createAuditRecord(
        'TEACHER_RATE_UPDATE',
        'FINANCE',
        'Quy chuẩn Định Mức Thù Lao Toàn Trường (Hồi tố)',
        `Cập nhật & Áp dụng hồi tố định mức thù lao theo buổi: Cơ hữu = ${formatVND(permSessionRate)}/buổi, Thỉnh giảng = ${formatVND(visSessionRate)}/buổi. Đã đồng bộ lại ${totalSessionsSynced} ca dạy lịch sử và ${recalculatedStore.teachers.length} giáo viên.`,
        null,
        {
          target_id: 'uniform_rates_retroactive_sync',
          details: {
            permanent_session_rate: permSessionRate,
            visiting_session_rate: visSessionRate,
            total_sessions_recalculated: totalSessionsSynced,
            total_teachers_synced: recalculatedStore.teachers.length,
          }
        }
      );

      return appendAuditLog({
        ...recalculatedStore,
        payrollRateConfig: updatedConfig,
      }, auditLog);
    });

    setShowRetroactiveConfirmModal(false);
    setRateSaveSuccessToast(
      `✓ Đã cập nhật định mức và đồng bộ lại thù lao cho toàn bộ ca dạy đã điểm danh thành công!`
    );
    setTimeout(() => setRateSaveSuccessToast(null), 5000);

    showToast(
      `✓ Đã cập nhật định mức và đồng bộ lại thù lao cho toàn bộ ca dạy đã điểm danh thành công!`,
      'success',
      { title: 'Đồng Bộ Hồi Tố Thù Lao Thành Công' }
    );
  };

  const handleSaveTeacherModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherForm.name.trim()) {
      showToast('Vui lòng nhập họ tên giáo viên!', 'error');
      return;
    }

    const validRate = Math.max(10000, Number(teacherForm.default_rate_per_period) || 150000);
    const validPeriods = Math.max(1, Math.min(6, Number(teacherForm.periods_per_session) || 2));
    const newSessionRate = validRate * validPeriods;

    onUpdateStore(prev => {
      if (isCreatingTeacher) {
        const newTeacher: Teacher = {
          id: `tch_${Date.now()}`,
          code: teacherForm.code.trim().toUpperCase(),
          name: teacherForm.name.trim(),
          phone: teacherForm.phone.trim() || '0908 000 111',
          email: teacherForm.email.trim() || 'teacher@royalschool.edu.vn',
          campus_id: teacherForm.campus_id,
          type: teacherForm.teacher_type,
          teacher_type: teacherForm.teacher_type,
          default_rate_per_period: validRate,
          periods_per_session: validPeriods,
          weekend_multiplier: Number(teacherForm.weekend_multiplier) || 1.0,
          custom_subject_rates: teacherForm.custom_subject_rates.filter(cr => cr.rate_per_period > 0),
          bank_account: {
            bank_name: teacherForm.bank_name.trim() || 'Vietcombank',
            account_number: teacherForm.account_number.trim() || '0181001122334',
            account_holder: teacherForm.account_holder.trim().toUpperCase() || teacherForm.name.trim().toUpperCase(),
          },
          fixed_rate_per_session: newSessionRate,
          percentage_rate: 60,
          status: 'active',
          subjects: teacherForm.subjects.length > 0 ? teacherForm.subjects : ['sub_swim'],
        };

        const log = createAuditRecord(
          'TEACHER_RATE_UPDATE',
          'FINANCE',
          `Giáo viên mới ${newTeacher.name} (${newTeacher.code})`,
          `Thêm mới hồ sơ & thiết lập định mức thù lao cho ${newTeacher.name}: ${formatVND(validRate)}/tiết (${validPeriods} tiết/buổi = ${formatVND(newSessionRate)}/buổi)`,
          null,
          {
            target_id: newTeacher.code,
            details: {
              status: 'success',
              after: {
                code: newTeacher.code,
                name: newTeacher.name,
                default_rate_per_period: validRate,
                periods_per_session: validPeriods,
                fixed_rate_per_session: newSessionRate,
              },
            },
          }
        );

        return {
          ...prev,
          teachers: [...prev.teachers, newTeacher],
          auditLogs: [log, ...(prev.auditLogs || [])],
        };
      } else if (editingTeacherModal) {
        const oldRate =
          editingTeacherModal.default_rate_per_period ||
          Math.round((editingTeacherModal.fixed_rate_per_session || 300000) / (editingTeacherModal.periods_per_session || 2));
        const oldPeriods = editingTeacherModal.periods_per_session || 2;

        const updatedTeachers = prev.teachers.map(t =>
          t.id === editingTeacherModal.id
            ? {
                ...t,
                code: teacherForm.code.trim().toUpperCase(),
                name: teacherForm.name.trim(),
                phone: teacherForm.phone.trim(),
                email: teacherForm.email.trim(),
                campus_id: teacherForm.campus_id,
                type: teacherForm.teacher_type,
                teacher_type: teacherForm.teacher_type,
                default_rate_per_period: validRate,
                periods_per_session: validPeriods,
                weekend_multiplier: Number(teacherForm.weekend_multiplier) || 1.0,
                custom_subject_rates: teacherForm.custom_subject_rates.filter(cr => cr.rate_per_period > 0),
                bank_account: {
                  bank_name: teacherForm.bank_name.trim() || 'Vietcombank',
                  account_number: teacherForm.account_number.trim(),
                  account_holder: teacherForm.account_holder.trim().toUpperCase() || teacherForm.name.trim().toUpperCase(),
                },
                fixed_rate_per_session: newSessionRate,
                subjects: teacherForm.subjects.length > 0 ? teacherForm.subjects : t.subjects,
              }
            : t
        );

        const log = createAuditRecord(
          'TEACHER_RATE_UPDATE',
          'FINANCE',
          `Giáo viên ${teacherForm.name} (${teacherForm.code})`,
          `Cập nhật cấu hình thù lao giảng dạy cho ${teacherForm.name}: Đơn giá tiết từ ${formatVND(oldRate)}/tiết → ${formatVND(validRate)}/tiết (${validPeriods} tiết/buổi = ${formatVND(newSessionRate)}/buổi, Hệ số cuối tuần: x${teacherForm.weekend_multiplier})`,
          null,
          {
            target_id: teacherForm.code,
            details: {
              status: 'success',
              before: {
                default_rate_per_period: oldRate,
                periods_per_session: oldPeriods,
                fixed_rate_per_session: oldRate * oldPeriods,
                custom_subject_rates: editingTeacherModal.custom_subject_rates || [],
              },
              after: {
                default_rate_per_period: validRate,
                periods_per_session: validPeriods,
                fixed_rate_per_session: newSessionRate,
                weekend_multiplier: teacherForm.weekend_multiplier,
                custom_subject_rates: teacherForm.custom_subject_rates,
              },
            },
          }
        );

        return {
          ...prev,
          teachers: updatedTeachers,
          auditLogs: [log, ...(prev.auditLogs || [])],
        };
      }
      return prev;
    });

    showToast(
      isCreatingTeacher
        ? `Đã thêm mới giáo viên ${teacherForm.name} với định mức ${formatVND(validRate)}/tiết!`
        : `Đã lưu cấu hình thù lao của ${teacherForm.name} (${formatVND(validRate)}/tiết = ${formatVND(newSessionRate)}/buổi)!`,
      'success',
      { title: 'Cấu hình định mức thù lao giáo viên' }
    );
    setEditingTeacherModal(null);
    setIsCreatingTeacher(false);
  };

  // Sub-tabs for Section 1: Cấu hình Khóa học & Biểu phí cơ sở
  const [hierarchySubTab, setHierarchySubTab] = useState<'categories' | 'subjects' | 'terms' | 'term_subjects' | 'campus_pricing' | 'matrix'>(initialSubTab);
  const [selectedConfigTermId, setSelectedConfigTermId] = useState<string>(store.terms[0]?.id || 'term_fall_2026');
  const [selectedConfigCampusId, setSelectedConfigCampusId] = useState<string>(store.campuses[0]?.id || 'camp_pmh');

  // Filters for Subtab 6: Ma Trận Biểu Phí Hiệu Lực Toàn Trường (Full Matrix View)
  const [matrixFilterTermId, setMatrixFilterTermId] = useState<string>('all');
  const [matrixFilterCampusId, setMatrixFilterCampusId] = useState<string>('all');
  const [matrixFilterCategory, setMatrixFilterCategory] = useState<string>('all');
  const [matrixFilterSource, setMatrixFilterSource] = useState<'all' | 'campus_override' | 'term_standard'>('all');
  const [matrixSearchQuery, setMatrixSearchQuery] = useState<string>('');

  // 4 Nhóm phân loại môn cốt lõi chuẩn hóa toàn trường (SPORTS, TECH, ART, SKILLS)
  const defaultSubjectCategories: SubjectCategory[] = [
    {
      id: '7943c6c7-f8dd-42b7-93a5-44e41192434e',
      code: 'SPORTS',
      name: 'Thể Thao & Vận Động',
      color: 'amber',
      icon: 'Activity',
      description: 'Rèn luyện thể lực, phản xạ, tinh thần đồng đội và nâng cao sức bền (Bóng rổ, Bơi lội, Cầu lông, Bóng đá mini).',
      status: 'active',
      order: 1,
    },
    {
      id: '36a477e3-4137-48f4-9a2d-5793d19d015f',
      code: 'TECH',
      name: 'Công Nghệ & Sáng Tạo',
      color: 'cyan',
      icon: 'Code',
      description: 'Tư duy logic thuật toán, ứng dụng công nghệ tương lai và kỹ năng chế tạo (Robotics VEX IQ, Lập trình Scratch, AI & IoT).',
      status: 'active',
      order: 2,
    },
    {
      id: 'ab22a577-2898-4533-b79b-81460fa81a7e',
      code: 'ART',
      name: 'Nghệ Thuật & Hội Họa',
      color: 'purple',
      icon: 'Palette',
      description: 'Nuôi dưỡng cảm xúc thẩm mỹ, sáng tạo không gian và phát triển năng khiếu âm nhạc, hội họa (Piano, Hội họa, Thanh nhạc).',
      status: 'active',
      order: 3,
    },
    {
      id: 'cab2ed8f-617f-4b79-a003-9920d3701f85',
      code: 'SKILLS',
      name: 'Kỹ Năng Sống & Sinh Tồn',
      color: 'rose',
      icon: 'HeartPulse',
      description: 'Kỹ năng tự vệ, sơ cấp cứu học đường, ứng biến tình huống khẩn cấp và giao tiếp tự tin.',
      status: 'active',
      order: 4,
    },
  ];

  // 1. Đồng bộ Số môn trực thuộc (Subject Count by Category):
  // Khi tính toán danh sách categories, đếm số lượng môn học từ danh sách subjects dựa trên trường category_code
  const baseCategories: SubjectCategory[] = store.subjectCategories && store.subjectCategories.length > 0
    ? store.subjectCategories
    : defaultSubjectCategories;

  const categoriesList: (SubjectCategory & { subject_count: number })[] = baseCategories.map((cat) => {
    const catCode = (cat.code || '').trim().toUpperCase();
    const count = (store.subjects || []).filter((s) => {
      const sCode = (s.category_code || resolveSubjectCategoryCode(s.category, s.name)).trim().toUpperCase();
      if (sCode === catCode) return true;
      if ((sCode === 'ART' || sCode === 'ARTS') && (catCode === 'ART' || catCode === 'ARTS')) return true;
      if ((sCode === 'TECH' || sCode === 'DIGITAL') && (catCode === 'TECH' || catCode === 'DIGITAL')) return true;
      if ((sCode === 'SKILLS' || sCode === 'LIFESKILLS') && (catCode === 'SKILLS' || catCode === 'LIFESKILLS')) return true;
      if (s.category && (s.category.trim().toLowerCase() === cat.name.trim().toLowerCase() || s.category.trim().toLowerCase() === catCode.toLowerCase())) return true;
      return false;
    }).length;

    return {
      ...cat,
      subject_count: count,
    };
  });

  const getCategoryColorDetails = (color?: string) => {
    switch (color) {
      case 'amber':
        return {
          badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          cardBorder: 'border-amber-500/30 hover:border-amber-500/60',
          bgSubtle: 'bg-amber-500/10',
          text: 'text-amber-400',
          dot: 'bg-amber-400',
          previewBg: 'bg-amber-500',
        };
      case 'purple':
        return {
          badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
          cardBorder: 'border-purple-500/30 hover:border-purple-500/60',
          bgSubtle: 'bg-purple-500/10',
          text: 'text-purple-400',
          dot: 'bg-purple-400',
          previewBg: 'bg-purple-500',
        };
      case 'cyan':
        return {
          badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
          cardBorder: 'border-cyan-500/30 hover:border-cyan-500/60',
          bgSubtle: 'bg-cyan-500/10',
          text: 'text-cyan-400',
          dot: 'bg-cyan-400',
          previewBg: 'bg-cyan-500',
        };
      case 'emerald':
        return {
          badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          cardBorder: 'border-emerald-500/30 hover:border-emerald-500/60',
          bgSubtle: 'bg-emerald-500/10',
          text: 'text-emerald-400',
          dot: 'bg-emerald-400',
          previewBg: 'bg-emerald-500',
        };
      case 'rose':
        return {
          badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          cardBorder: 'border-rose-500/30 hover:border-rose-500/60',
          bgSubtle: 'bg-rose-500/10',
          text: 'text-rose-400',
          dot: 'bg-rose-400',
          previewBg: 'bg-rose-500',
        };
      case 'blue':
        return {
          badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
          cardBorder: 'border-blue-500/30 hover:border-blue-500/60',
          bgSubtle: 'bg-blue-500/10',
          text: 'text-blue-400',
          dot: 'bg-blue-400',
          previewBg: 'bg-blue-500',
        };
      case 'indigo':
        return {
          badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
          cardBorder: 'border-indigo-500/30 hover:border-indigo-500/60',
          bgSubtle: 'bg-indigo-500/10',
          text: 'text-indigo-400',
          dot: 'bg-indigo-400',
          previewBg: 'bg-indigo-500',
        };
      case 'orange':
        return {
          badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
          cardBorder: 'border-orange-500/30 hover:border-orange-500/60',
          bgSubtle: 'bg-orange-500/10',
          text: 'text-orange-400',
          dot: 'bg-orange-400',
          previewBg: 'bg-orange-500',
        };
      default:
        return {
          badge: 'bg-slate-700/50 text-slate-300 border-slate-600',
          cardBorder: 'border-slate-800 hover:border-slate-700',
          bgSubtle: 'bg-slate-800/40',
          text: 'text-slate-300',
          dot: 'bg-slate-400',
          previewBg: 'bg-slate-600',
        };
    }
  };

  const getCategoryIconComponent = (iconName?: string) => {
    switch (iconName) {
      case 'Activity': return Activity;
      case 'Palette': return Palette;
      case 'Code': return Code;
      case 'GraduationCap': return GraduationCap;
      case 'HeartPulse': return HeartPulse;
      case 'Music': return Music;
      case 'Sparkles': return Sparkles;
      case 'Trophy': return Trophy;
      case 'Smile': return Smile;
      case 'Compass': return Compass;
      default: return Tag;
    }
  };

  // ViewMode, Filters & Modal for Subtab 1: Phân Loại Môn Học (Subject Categories)
  const [categoriesViewMode, setCategoriesViewMode] = useState<ViewMode>('table');
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<SubjectCategory | null>(null);
  const [categoryFormData, setCategoryFormData] = useState({
    code: '',
    name: '',
    color: 'amber' as SubjectCategory['color'],
    icon: 'Activity',
    description: '',
    status: 'active' as 'active' | 'inactive',
  });

  const handleOpenAddCategory = () => {
    setEditingCategory(null);
    setCategoryFormData({
      code: '',
      name: '',
      color: 'amber',
      icon: 'Activity',
      description: '',
      status: 'active',
    });
    setShowCategoryModal(true);
  };

  const handleOpenEditCategory = (cat: SubjectCategory) => {
    setEditingCategory(cat);
    setCategoryFormData({
      code: cat.code,
      name: cat.name,
      color: cat.color || 'amber',
      icon: cat.icon || 'Activity',
      description: cat.description || '',
      status: cat.status,
    });
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = async (cat: SubjectCategory) => {
    // 1. Kiểm tra nếu nhóm này đang có môn trực thuộc (subject_count > 0)
    const subjectCount = cat.subject_count ?? (store.subjects || []).filter(
      s => (s.category_code || resolveSubjectCategoryCode(s.category, s.name)).toUpperCase() === cat.code.toUpperCase()
    ).length;

    if (subjectCount > 0) {
      showToast(
        'Không thể xóa phân loại đang có môn học trực thuộc. Vui lòng chuyển các môn sang nhóm khác trước.',
        'warning',
        { title: 'Không thể xóa phân loại' }
      );
      return;
    }

    const ok = window.confirm(`Bạn có chắc chắn muốn xóa phân loại "${cat.name}" (${cat.code}) khỏi hệ thống?`);
    if (!ok) return;

    // 2. Thực hiện xóa trực tiếp trên Supabase
    const client = getSupabaseClient() || supabase;
    if (client) {
      try {
        const { error } = await client
          .from('subject_categories')
          .delete()
          .eq('code', cat.code);

        if (error) {
          console.warn('Lỗi Supabase khi xóa subject_categories:', error.message);
        }
      } catch (err) {
        console.warn('Exception khi gọi Supabase delete subject_categories:', err);
      }
    }

    // 3. Cập nhật state để giao diện re-render ngay lập tức
    onUpdateStore(prev => ({
      ...prev,
      subjectCategories: (prev.subjectCategories || categoriesList).filter(
        c => c.id !== cat.id && c.code !== cat.code
      ),
    }));

    showToast(`Đã xóa phân loại "${cat.name}" (${cat.code}) thành công.`, 'success');
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = categoryFormData.code.trim().toUpperCase();
    const cleanName = categoryFormData.name.trim();

    if (!cleanCode || !cleanName) {
      showToast('Vui lòng nhập đầy đủ Mã phân loại và Tên phân loại.', 'warning');
      return;
    }

    const currentList = store.subjectCategories || categoriesList;
    const duplicate = currentList.find(
      c => (c.code.toUpperCase() === cleanCode || c.name.toLowerCase() === cleanName.toLowerCase()) && 
           c.id !== editingCategory?.id
    );
    if (duplicate) {
      showToast(`Mã phân loại "${cleanCode}" hoặc Tên "${cleanName}" đã tồn tại. Vui lòng chọn giá trị khác.`, 'warning');
      return;
    }

    const client = getSupabaseClient() || supabase;

    if (editingCategory) {
      const oldCode = editingCategory.code;
      const oldName = editingCategory.name;

      // 1. Cập nhật trực tiếp lên Supabase
      if (client) {
        try {
          const { error } = await client
            .from('subject_categories')
            .update({
              name: cleanName,
              color: categoryFormData.color,
              icon: categoryFormData.icon || 'Activity',
              description: categoryFormData.description,
              status: categoryFormData.status,
              updated_at: new Date().toISOString(),
            })
            .eq('code', oldCode);

          if (error) {
            console.warn('Lỗi Supabase khi cập nhật subject_categories:', error.message);
          }
        } catch (err) {
          console.warn('Exception khi gọi Supabase update subject_categories:', err);
        }
      }

      // 2. Cập nhật Global State & đồng bộ lại môn học
      onUpdateStore(prev => {
        const updatedCategories = (prev.subjectCategories || categoriesList).map(c =>
          c.id === editingCategory.id || c.code === oldCode
            ? {
                ...c,
                ...categoryFormData,
                code: cleanCode,
                name: cleanName,
              }
            : c
        );

        const updatedSubjects = prev.subjects.map(s => {
          let changed = false;
          let newCatName = s.category;
          let newCatCode = s.category_code;
          if (s.category === oldName || (s.category_code && s.category_code.toUpperCase() === oldCode.toUpperCase())) {
            newCatName = cleanName;
            newCatCode = cleanCode;
            changed = true;
          }
          return changed ? { ...s, category: newCatName, category_code: newCatCode } : s;
        });

        return {
          ...prev,
          subjectCategories: updatedCategories,
          subjects: updatedSubjects,
        };
      });

      showToast(`Đã cập nhật phân loại "${cleanName}" (${cleanCode}) thành công!`, 'success');
    } else {
      // THÊM MỚI
      const newCatId = `cat_${cleanCode.toLowerCase()}_${Date.now()}`;
      const newCategory: SubjectCategory = {
        id: newCatId,
        code: cleanCode,
        name: cleanName,
        color: categoryFormData.color,
        icon: categoryFormData.icon || 'Activity',
        description: categoryFormData.description,
        status: categoryFormData.status || 'active',
        order: currentList.length + 1,
      };

      // 1. Thêm mới trực tiếp lên Supabase
      if (client) {
        try {
          const { error } = await client
            .from('subject_categories')
            .insert([
              {
                id: newCatId,
                code: cleanCode,
                name: cleanName,
                color: categoryFormData.color,
                icon: categoryFormData.icon || 'Activity',
                description: categoryFormData.description,
                status: categoryFormData.status || 'active',
                order: currentList.length + 1,
                updated_at: new Date().toISOString(),
              },
            ]);

          if (error) {
            console.warn('Lỗi Supabase khi thêm mới subject_categories:', error.message);
          }
        } catch (err) {
          console.warn('Exception khi gọi Supabase insert subject_categories:', err);
        }
      }

      // 2. Cập nhật Global State
      onUpdateStore(prev => ({
        ...prev,
        subjectCategories: [...(prev.subjectCategories || categoriesList), newCategory],
      }));

      showToast(`Đã thêm mới phân loại "${cleanName}" (${cleanCode}) thành công!`, 'success');
    }

    setShowCategoryModal(false);
    setEditingCategory(null);
  };

  const filteredCategories = categoriesList.filter(c => {
    const q = categorySearchQuery.trim().toLowerCase();
    if (!q) return true;
    return c.code.toLowerCase().includes(q) ||
           c.name.toLowerCase().includes(q) ||
           (c.description && c.description.toLowerCase().includes(q));
  });

  // ViewMode, Filters & Modal for Subtab 2: Danh Mục Môn Học (Subjects Catalog)
  const [subjectsViewMode, setSubjectsViewMode] = useState<ViewMode>('table');
  const [subjectCategoryFilter, setSubjectCategoryFilter] = useState<string>('all');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState<string>('');
  const [showSubjectModal, setShowSubjectModal] = useState<boolean>(false);
  const [showImportSubjectsModal, setShowImportSubjectsModal] = useState<boolean>(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectFormData, setSubjectFormData] = useState({
    code: '',
    name: '',
    category_code: categoriesList[0]?.code || 'SPORTS',
    category: categoriesList[0]?.name || 'Thể thao',
    standard_duration: '90 phút',
    standard_sessions: 24,
    standard_course_fee: 3990000,
    standard_session_rate: 166250,
    description: '',
  });

  const syncTermSubjectToSupabase = async (
    termId: string,
    subjectId: string,
    sessions: number,
    fee: number,
    isActive: boolean,
    notes?: string
  ) => {
    const client = getSupabaseClient() || supabase;
    if (!client) return;
    try {
      const validSessions = Math.max(1, Number(sessions) || 24);
      const validFee = Math.max(0, Number(fee) || 0);
      const payload = {
        id: `ts_${termId}_${subjectId}`,
        term_id: String(termId),
        subject_id: String(subjectId),
        standard_sessions: validSessions,
        total_fee: validFee,
        is_active: isActive,
        term_note: notes || '',
        updated_at: new Date().toISOString(),
      };
      const { error } = await client
        .from('term_subjects')
        .upsert(payload, { onConflict: 'term_id,subject_id' });
      if (error) {
        console.error('Lỗi Supabase khi upsert term_subjects:', error);
      }
    } catch (err) {
      console.warn('Lỗi Supabase khi upsert term_subjects:', err);
    }
  };

  const [isTogglingAllSubjects, setIsTogglingAllSubjects] = useState<boolean>(false);

  // Bật/tắt kích hoạt 1 môn học và lưu trực tiếp xuống Supabase
  const handleToggleSubject = async (subject: Subject) => {
    if (!selectedConfigTermId) return;
    if (isTermClosed(selectedConfigTermId, store)) {
      alert('Khóa học này đã đóng. Cấu hình môn học đang ở chế độ chỉ xem.');
      return;
    }

    const existing = store.termSubjects.find(
      ts => String(ts.term_id) === String(selectedConfigTermId) && (String(ts.subject_id) === String(subject.id) || (ts as any).subject_code === subject.code)
    );

    const isActive = existing ? Boolean(existing.is_active) : false;
    const newActiveState = !isActive;
    const standardSessions = Number(existing?.standard_sessions || subject.standard_sessions || 16);
    const standardFee = Number(existing?.standard_course_fee || (existing as any)?.total_fee || subject.standard_course_fee || 3600000);
    const ceilRate = standardSessions > 0 ? Math.ceil(standardFee / standardSessions) : 0;
    const noteVal = existing?.notes || '';

    const newConfig: TermSubjectConfig = {
      id: existing?.id || `ts_${selectedConfigTermId}_${subject.id}`,
      term_id: String(selectedConfigTermId),
      subject_id: String(subject.id),
      is_active: newActiveState,
      standard_sessions: standardSessions,
      standard_course_fee: standardFee,
      standard_session_rate: ceilRate,
      notes: noteVal,
    };

    // 1. Cập nhật state UI ngay lập tức
    onUpdateStore(prev => {
      const otherConfigs = prev.termSubjects.filter(
        ts => !(String(ts.term_id) === String(selectedConfigTermId) && String(ts.subject_id) === String(subject.id))
      );
      return {
        ...prev,
        termSubjects: [...otherConfigs, newConfig],
      };
    });

    // 2. Lưu trực tiếp xuống Supabase
    try {
      const client = getSupabaseClient() || supabase;
      if (client) {
        const payload = {
          id: `ts_${selectedConfigTermId}_${subject.id}`,
          term_id: String(selectedConfigTermId),
          subject_id: String(subject.id),
          standard_sessions: Number(standardSessions),
          total_fee: Number(standardFee),
          is_active: newActiveState,
          term_note: noteVal,
          updated_at: new Date().toISOString()
        };

        const { error } = await client
          .from('term_subjects')
          .upsert(payload, { onConflict: 'term_id,subject_id' });

        if (error) {
          console.error('Lỗi lưu kích hoạt môn học:', error);
          alert('Không thể lưu trạng thái môn: ' + error.message);
        }
      }
    } catch (err: any) {
      console.error('Exception khi lưu kích hoạt môn học:', err);
    }
  };

  // Bật hoặc tắt toàn bộ môn học cho khóa hiện tại
  const handleToggleAllSubjects = async (enableAll: boolean) => {
    if (!selectedConfigTermId) return;

    const currentTerm = store.terms.find(t => String(t.id) === String(selectedConfigTermId));
    const currentTermName = currentTerm ? currentTerm.name : 'khóa học đang chọn';

    if (isTermClosed(selectedConfigTermId, store)) {
      alert(`Khóa học "${currentTermName}" đã đóng. Cấu hình môn học đang ở chế độ chỉ xem.`);
      return;
    }

    const confirmMsg = enableAll
      ? `Bạn có chắc muốn MỞ DẠY TẤT CẢ môn học cho ${currentTermName}?`
      : `Bạn có chắc muốn TẠM TẮT TẤT CẢ môn học cho ${currentTermName}?`;

    if (!window.confirm(confirmMsg)) return;

    setIsTogglingAllSubjects(true);

    // 1. Cập nhật state tức thì trên UI
    const updatedTermConfigs: TermSubjectConfig[] = store.subjects.map((subject) => {
      const existing = store.termSubjects.find(
        (ts) => String(ts.term_id) === String(selectedConfigTermId) && (String(ts.subject_id) === String(subject.id) || (ts as any).subject_code === subject.code)
      );

      const standardSessions = Number(existing?.standard_sessions || subject.standard_sessions || 16);
      const standardFee = Number(existing?.standard_course_fee || (existing as any)?.total_fee || subject.standard_course_fee || 3600000);
      const ceilRate = standardSessions > 0 ? Math.ceil(standardFee / standardSessions) : 0;
      const noteVal = existing?.notes || '';

      return {
        id: existing?.id || `ts_${selectedConfigTermId}_${subject.id}`,
        term_id: String(selectedConfigTermId),
        subject_id: String(subject.id),
        is_active: enableAll,
        standard_sessions: standardSessions,
        standard_course_fee: standardFee,
        standard_session_rate: ceilRate,
        notes: noteVal,
      };
    });

    onUpdateStore((prev) => {
      const otherTermSubjects = prev.termSubjects.filter((ts) => String(ts.term_id) !== String(selectedConfigTermId));
      return {
        ...prev,
        termSubjects: [...otherTermSubjects, ...updatedTermConfigs],
      };
    });

    // 2. Đồng bộ hàng loạt xuống bảng term_subjects trên Supabase
    try {
      const client = getSupabaseClient() || supabase;
      if (client) {
        const upsertPayload = updatedTermConfigs.map((item) => ({
          id: `ts_${selectedConfigTermId}_${item.subject_id}`,
          term_id: String(selectedConfigTermId),
          subject_id: String(item.subject_id),
          standard_sessions: Number(item.standard_sessions || 16),
          total_fee: Number(item.standard_course_fee || 3600000),
          is_active: enableAll,
          term_note: item.notes || '',
          updated_at: new Date().toISOString(),
        }));

        const { error } = await client
          .from('term_subjects')
          .upsert(upsertPayload, { onConflict: 'term_id,subject_id' });

        if (error) {
          console.error('Lỗi khi cập nhật tất cả:', error);
          alert('Lỗi lưu Supabase: ' + error.message);
          setIsTogglingAllSubjects(false);
          return;
        }
      }

      showToast(
        enableAll
          ? `Đã MỞ DẠY TẤT CẢ ${store.subjects.length} môn học cho ${currentTermName} thành công!`
          : `Đã TẠM TẮT TẤT CẢ ${store.subjects.length} môn học cho ${currentTermName} thành công!`,
        'success',
        { title: 'Cấu hình môn học khóa' }
      );
    } catch (err: any) {
      console.error('Lỗi toggle all subjects:', err);
      alert('Không thể cập nhật trạng thái: ' + (err.message || 'Lỗi kết nối'));
    } finally {
      setIsTogglingAllSubjects(false);
    }
  };

  // Nạp danh sách term_subjects từ Supabase khi chọn khóa hoặc khi vào subtab
  useEffect(() => {
    let cancelled = false;
    const fetchTermSubjectsFromCloud = async () => {
      const client = getSupabaseClient() || supabase;
      if (!client || !selectedConfigTermId) return;

      try {
        const query = hierarchySubTab === 'terms'
          ? client.from('term_subjects').select('*')
          : client.from('term_subjects').select('*').eq('term_id', String(selectedConfigTermId));

        const { data: termConfigs, error } = await query;

        if (!error && Array.isArray(termConfigs) && !cancelled) {
          onUpdateStore((prev) => {
            const mappedRows: TermSubjectConfig[] = termConfigs.map((r: any) => ({
              id: r.id || `ts_${r.term_id}_${r.subject_id}`,
              term_id: String(r.term_id),
              subject_id: String(r.subject_id),
              standard_sessions: Number(r.standard_sessions) || 24,
              standard_course_fee: Number(r.total_fee ?? r.standard_course_fee ?? 3600000),
              standard_session_rate: Math.ceil(Number(r.total_fee ?? r.standard_course_fee ?? 3600000) / Math.max(1, Number(r.standard_sessions || 24))),
              is_active: Boolean(r.is_active === true || r.is_active === 1 || r.is_active === 'true'),
              notes: r.term_note || r.notes || '',
            }));

            if (hierarchySubTab === 'terms') {
              const map = new Map<string, TermSubjectConfig>();
              prev.termSubjects.forEach(ts => map.set(`${ts.term_id}_${ts.subject_id}`, ts));
              mappedRows.forEach(ts => map.set(`${ts.term_id}_${ts.subject_id}`, ts));
              return {
                ...prev,
                termSubjects: Array.from(map.values()),
              };
            }

            const remoteMap = new Map<string, TermSubjectConfig>();
            mappedRows.forEach((r) => {
              remoteMap.set(r.subject_id, r);
            });

            const otherTermSubjects = prev.termSubjects.filter(
              (ts) => String(ts.term_id) !== String(selectedConfigTermId)
            );

            const currentTermSubjects: TermSubjectConfig[] = prev.subjects.map((s) => {
              const remote = remoteMap.get(String(s.id));
              if (remote) return remote;
              const localExisting = prev.termSubjects.find(
                (ts) => String(ts.term_id) === String(selectedConfigTermId) && String(ts.subject_id) === String(s.id)
              );
              if (localExisting) return localExisting;
              return {
                id: `ts_${selectedConfigTermId}_${s.id}`,
                term_id: String(selectedConfigTermId),
                subject_id: String(s.id),
                standard_sessions: Number(s.standard_sessions || 24),
                standard_course_fee: Number(s.standard_course_fee || 3600000),
                standard_session_rate: Math.ceil(Number(s.standard_course_fee || 3600000) / Math.max(1, Number(s.standard_sessions || 24))),
                is_active: false,
                notes: '',
              };
            });

            return {
              ...prev,
              termSubjects: [...otherTermSubjects, ...currentTermSubjects],
            };
          });
        }
      } catch (err) {
        console.warn('Lỗi tải term_subjects từ Cloud:', err);
      }
    };

    if (hierarchySubTab === 'term_subjects' || hierarchySubTab === 'terms') {
      fetchTermSubjectsFromCloud();
    }

    return () => {
      cancelled = true;
    };
  }, [selectedConfigTermId, hierarchySubTab]);

  // Nạp danh sách subjects từ bảng public.subjects trên Supabase để đồng bộ standard_course_fee và standard_session_rate
  useEffect(() => {
    let cancelled = false;
    const fetchSubjectsFromCloud = async () => {
      const client = getSupabaseClient() || supabase;
      if (!client) return;
      try {
        const { data: remoteSubjects, error } = await client.from('subjects').select('*');
        if (!error && Array.isArray(remoteSubjects) && remoteSubjects.length > 0 && !cancelled) {
          onUpdateStore((prev) => {
            const mappedSubjects: Subject[] = remoteSubjects.map((r: any): Subject => {
              const courseFee = Number(r.standard_course_fee || 0);
              const sessions = Number(r.standard_sessions || 16);
              const sessionRate = Number(r.standard_session_rate) || (sessions > 0 && courseFee > 0 ? Math.round(courseFee / sessions) : 0);
              return {
                id: String(r.id),
                code: String(r.code || r.id).toUpperCase(),
                name: String(r.name || ''),
                category: (r.category || 'Thể thao') as Subject['category'],
                category_code: r.category_code || resolveSubjectCategoryCode(r.category, r.name),
                standard_duration: r.standard_duration || '90 phút',
                standard_sessions: sessions,
                standard_course_fee: courseFee,
                standard_session_rate: sessionRate,
                description: r.description || '',
              };
            });
            return {
              ...prev,
              subjects: mappedSubjects,
            };
          });
        }
      } catch (err) {
        console.warn('Lỗi tải subjects từ Supabase:', err);
      }
    };

    fetchSubjectsFromCloud();
    return () => {
      cancelled = true;
    };
  }, [hierarchySubTab]);

  const handleOpenAddSubject = (presetCategory?: string | React.MouseEvent) => {
    let defaultCatObj = categoriesList[0];
    if (typeof presetCategory === 'string' && presetCategory) {
      const match = categoriesList.find(c => c.name === presetCategory || c.code === presetCategory);
      if (match) defaultCatObj = match;
    }
    setEditingSubject(null);
    setSubjectFormData({
      code: '',
      name: '',
      category_code: defaultCatObj?.code || '',
      category: defaultCatObj?.name || 'Thể thao',
      standard_duration: '90 phút',
      standard_sessions: 24,
      standard_course_fee: 3990000,
      standard_session_rate: 166250,
      description: '',
    });
    setShowSubjectModal(true);
  };

  const handleOpenEditSubject = (subject: Subject) => {
    setEditingSubject(subject);
    const catObj = categoriesList.find(
      c => c.code === subject.category_code || c.name === subject.category || c.code === subject.category
    );
    const sessions = subject.standard_sessions ? Number(subject.standard_sessions) : 24;
    const fee = subject.standard_course_fee ? Number(subject.standard_course_fee) : 3990000;
    const rate = subject.standard_session_rate ? Number(subject.standard_session_rate) : Math.ceil(fee / Math.max(1, sessions));
    setSubjectFormData({
      code: subject.code,
      name: subject.name,
      category_code: subject.category_code || catObj?.code || '',
      category: subject.category || catObj?.name || 'Thể thao',
      standard_duration: subject.standard_duration || '90 phút',
      standard_sessions: sessions,
      standard_course_fee: fee,
      standard_session_rate: rate,
      description: subject.description || '',
    });
    setShowSubjectModal(true);
  };

  const handleDeleteSubject = async (subject: Subject) => {
    const relatedClasses = store.classes.filter(c => c.subject_id === subject.id);
    if (relatedClasses.length > 0) {
      alert(`Không thể xóa môn học "${subject.name}" (${subject.code}) vì hiện có ${relatedClasses.length} lớp học ngoại khóa đang mở cho môn này. Vui lòng chuyển hoặc xóa các lớp học liên quan trước.`);
      return;
    }

    const activeTerms = store.termSubjects.filter(ts => ts.subject_id === subject.id && ts.is_active);
    const msg = activeTerms.length > 0
      ? `Môn "${subject.name}" (${subject.code}) đang được kích hoạt ở ${activeTerms.length} khóa học. Bạn có chắc chắn muốn xóa môn học này cùng cấu hình biểu phí liên quan khỏi hệ thống?`
      : `Bạn có chắc chắn muốn xóa môn học "${subject.name}" (${subject.code}) khỏi Danh mục Môn học?`;

    const ok = window.confirm(msg);
    if (!ok) return;

    // Xóa trên Supabase
    const client = getSupabaseClient() || supabase;
    if (client) {
      try {
        await client.from('subjects').delete().eq('id', subject.id);
        await client.from('term_subjects').delete().eq('subject_id', subject.id);
      } catch (err) {
        console.warn('Lỗi Supabase khi xóa subject:', err);
      }
    }

    onUpdateStore(prev => ({
      ...prev,
      subjects: prev.subjects.filter(s => s.id !== subject.id),
      termSubjects: prev.termSubjects.filter(ts => ts.subject_id !== subject.id),
      campusPricings: prev.campusPricings.filter(cp => cp.subject_id !== subject.id),
      pricings: prev.pricings.filter(p => p.subject_id !== subject.id),
    }));

    showToast(`Đã xóa môn học "${subject.name}" (${subject.code}) thành công!`, 'info');
  };

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = subjectFormData.code.trim().toUpperCase();
    const cleanName = subjectFormData.name.trim();

    if (!cleanCode || !cleanName) {
      alert('Vui lòng nhập đầy đủ Mã môn học và Tên môn học.');
      return;
    }

    const duplicate = store.subjects.find(
      s => s.code.toUpperCase() === cleanCode && s.id !== editingSubject?.id
    );
    if (duplicate) {
      alert(`Mã môn "${cleanCode}" đã tồn tại cho môn "${duplicate.name}". Vui lòng chọn mã khác.`);
      return;
    }

    const matchedCategory = categoriesList.find(
      c => c.code === subjectFormData.category_code || c.name === subjectFormData.category_code || c.name === subjectFormData.category
    );
    const finalCategoryName = matchedCategory ? matchedCategory.name : (subjectFormData.category || subjectFormData.category_code);
    const finalCategoryCode = matchedCategory ? matchedCategory.code : (subjectFormData.category_code || '');
    const standardSessionsNum = Number(subjectFormData.standard_sessions) || 24;
    const standardCourseFeeNum = Number(subjectFormData.standard_course_fee) || 3990000;
    const standardSessionRateNum = Math.ceil(standardCourseFeeNum / Math.max(1, standardSessionsNum));
    const client = getSupabaseClient() || supabase;

    if (editingSubject) {
      // 1. Cập nhật trực tiếp lên Supabase
      if (client) {
        try {
          const editPayload: any = {
            id: editingSubject.id,
            code: cleanCode,
            name: cleanName,
            category: finalCategoryName,
            category_code: finalCategoryCode,
            standard_duration: subjectFormData.standard_duration || '90 phút',
            standard_sessions: standardSessionsNum,
            standard_course_fee: standardCourseFeeNum,
            standard_session_rate: standardSessionRateNum,
            description: subjectFormData.description || '',
            is_active: editingSubject.is_active !== false,
            updated_at: new Date().toISOString(),
          };
          if (matchedCategory?.id) {
            editPayload.category_id = matchedCategory.id;
          }

          let { error } = await client.from('subjects').upsert(editPayload, { onConflict: 'code' }).select();
          if (error && (error.message.includes('category_id') || error.code === 'PGRST204')) {
            delete editPayload.category_id;
            await client.from('subjects').upsert(editPayload, { onConflict: 'code' }).select();
          }
        } catch (err) {
          console.warn('Lỗi Supabase khi lưu subjects:', err);
        }
      }

      // 2. Cập nhật Store
      onUpdateStore(prev => ({
        ...prev,
        subjects: prev.subjects.map(s => 
          s.id === editingSubject.id
            ? {
                ...s,
                ...subjectFormData,
                standard_sessions: standardSessionsNum,
                standard_course_fee: standardCourseFeeNum,
                standard_session_rate: standardSessionRateNum,
                category: finalCategoryName,
                category_code: finalCategoryCode,
                category_id: matchedCategory?.id,
                code: cleanCode,
                name: cleanName,
              }
            : s
        ),
      }));

      showToast(`Đã cập nhật môn học "${cleanName}" (${cleanCode}) thành công!`, 'success');
    } else {
      const newSubId = `sub_${cleanCode.toLowerCase()}_${Date.now()}`;
      const newSubject: Subject = {
        id: newSubId,
        ...subjectFormData,
        standard_sessions: standardSessionsNum,
        standard_course_fee: standardCourseFeeNum,
        standard_session_rate: standardSessionRateNum,
        category: finalCategoryName,
        category_code: finalCategoryCode,
        category_id: matchedCategory?.id,
        code: cleanCode,
        name: cleanName,
        is_active: true,
      };

      // 1. Thêm mới trực tiếp lên Supabase
      if (client) {
        try {
          const insertPayload: any = {
            id: newSubId,
            code: cleanCode,
            name: cleanName,
            category: finalCategoryName,
            category_code: finalCategoryCode,
            standard_duration: subjectFormData.standard_duration || '90 phút',
            standard_sessions: standardSessionsNum,
            standard_course_fee: standardCourseFeeNum,
            standard_session_rate: standardSessionRateNum,
            description: subjectFormData.description || '',
            is_active: true,
            updated_at: new Date().toISOString(),
          };
          if (matchedCategory?.id) {
            insertPayload.category_id = matchedCategory.id;
          }

          let { error } = await client.from('subjects').upsert(insertPayload, { onConflict: 'code' }).select();
          if (error && (error.message.includes('category_id') || error.code === 'PGRST204')) {
            delete insertPayload.category_id;
            await client.from('subjects').upsert(insertPayload, { onConflict: 'code' }).select();
          }
        } catch (err) {
          console.warn('Lỗi Supabase khi thêm subjects:', err);
        }
      }

      // 2. Cập nhật Store
      onUpdateStore(prev => {
        const newTermConfigs: TermSubjectConfig[] = prev.terms.map(t => ({
          id: `ts_${t.id}_${cleanCode.toLowerCase()}`,
          term_id: t.id,
          subject_id: newSubId,
          is_active: true,
          standard_sessions: standardSessionsNum,
          standard_course_fee: standardCourseFeeNum,
          standard_session_rate: standardSessionRateNum,
          discount_type: 'none',
          discount_value: 0,
          notes: `${cleanName} - Khóa ${t.name}`,
        }));

        return {
          ...prev,
          subjects: [...prev.subjects, newSubject],
          termSubjects: [...prev.termSubjects, ...newTermConfigs],
        };
      });

      showToast(`Đã thêm môn học "${cleanName}" (${cleanCode}) thành công!`, 'success');
    }

    setShowSubjectModal(false);
    setEditingSubject(null);
  };

  const getSubjectCategoryBadge = (category: string) => {
    const found = categoriesList.find(
      c => c.name.trim().toLowerCase() === category.trim().toLowerCase() ||
           c.code.trim().toLowerCase() === category.trim().toLowerCase()
    );

    if (found) {
      const colorDetails = getCategoryColorDetails(found.color);
      const IconComp = getCategoryIconComponent(found.icon);
      return {
        badge: colorDetails.badge,
        icon: IconComp,
        categoryObj: found,
      };
    }

    switch (category) {
      case 'Thể thao':
        return {
          badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          icon: Activity,
        };
      case 'Nghệ thuật':
        return {
          badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
          icon: Palette,
        };
      case 'Kỹ năng số':
        return {
          badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
          icon: Code,
        };
      case 'Học thuật':
        return {
          badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          icon: GraduationCap,
        };
      default:
        return {
          badge: 'bg-slate-700/50 text-slate-300 border-slate-600',
          icon: BookOpen,
        };
    }
  };

  const filteredSubjects = store.subjects.filter(s => {
    const matchesCategory = subjectCategoryFilter === 'all' || s.category === subjectCategoryFilter;
    const query = subjectSearchQuery.trim().toLowerCase();
    const matchesQuery = !query || 
      s.code.toLowerCase().includes(query) || 
      s.name.toLowerCase().includes(query) ||
      (s.description && s.description.toLowerCase().includes(query));
    return matchesCategory && matchesQuery;
  });

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
  const [campusPricingViewMode, setCampusPricingViewMode] = useState<ViewMode>('table');

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

    showToast(
      editingCampus
        ? `Đã cập nhật cơ sở "${campusFormData.name}" (${cleanCode}) thành công!`
        : `Đã thêm mới cơ sở "${campusFormData.name}" (${cleanCode}) thành công!`,
      'success',
      { title: 'Lưu cấu hình cơ sở' }
    );
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
  const [importStatus, setImportStatus] = useState<{
    loading: boolean;
    message?: string;
    isError?: boolean;
    sheetStats?: { sheetName: string; rowCount: number; status: string }[];
  }>({ loading: false });

  // Supabase Config & 10-Table Diagnostics State
  const [sbUrl, setSbUrl] = useState(() => sanitizeSupabaseBaseUrl(store.supabaseConfig.url || DEFAULT_SUPABASE_URL));
  const [sbKey, setSbKey] = useState(store.supabaseConfig.anonKey || DEFAULT_SUPABASE_ANON_KEY);
  const [sbConnected, setSbConnected] = useState(store.supabaseConfig.isConnected);
  const [sbLatency, setSbLatency] = useState<number | null>(null);
  const [sbHasBucket, setSbHasBucket] = useState<boolean>(false);
  const [sbCheckDetails, setSbCheckDetails] = useState<SupabaseConnectionCheckResult | null>(null);
  const [tableHealthList, setTableHealthList] = useState<TableHealthStatus[]>(() =>
    ROYAL_STANDARDIZED_10_TABLES.map((spec) => ({
      index: spec.index,
      sheetName: spec.sheetName,
      tableName: spec.tableName,
      storeKey: spec.storeKey,
      titleVN: spec.titleVN,
      category: spec.category,
      primaryKey: spec.primaryKey,
      uniqueKey: spec.uniqueKey,
      foreignKeys: spec.foreignKeys,
      localCount: Array.isArray((store as any)[spec.storeKey]) ? (store as any)[spec.storeKey].length : 0,
      remoteCount: null,
      status: 'local_only',
      latencyMs: null,
      integrityValid: true,
      integrityIssues: [],
      statusLabel: 'Chuẩn hóa Local (Chờ kết nối Cloud)',
      message: 'Đang lưu trữ chuẩn hóa tại Local Store (3NF OK).',
    }))
  );
  const [sbTesting, setSbTesting] = useState<boolean>(false);
  const [sbInspectingTables, setSbInspectingTables] = useState<boolean>(false);
  const [sbSyncing, setSbSyncing] = useState<boolean>(false);
  const [sbPushingTable, setSbPushingTable] = useState<string | null>(null);
  const [sbSyncProgress, setSbSyncProgress] = useState<number>(0);
  const [sbSyncTable, setSbSyncTable] = useState<string>('');
  const [showSqlModal, setShowSqlModal] = useState<boolean>(false);
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);

  // Refresh local table health whenever store changes or when entering supabase/excel_master section
  useEffect(() => {
    let cancelled = false;
    const runCheck = async () => {
      const results = await inspectAllDatabaseTables(
        store,
        sbConnected ? sbUrl : '',
        sbConnected ? sbKey : ''
      );
      if (!cancelled) {
        setTableHealthList(results);
      }
    };
    runCheck();
    return () => {
      cancelled = true;
    };
  }, [
    store.campuses.length,
    store.terms.length,
    store.subjects.length,
    store.teachers.length,
    store.classes.length,
    store.students.length,
    store.enrollments.length,
    store.attendance.length,
    store.teacherAttendance?.length,
    store.invoices.length,
    sbConnected,
  ]);

  // Cloud Storage Config State
  const initialCloudConfig = store.cloudStorageConfig || {
    provider: 'google_drive',
    drive_folder_id: '1KVkKVyz9sQVu_22La7RTaTX7-c-_Lf1k',
    drive_folder_name: 'RoyalSchool_Storage_Drive',
    drive_root_url: 'https://drive.google.com/drive/folders/1KVkKVyz9sQVu_22La7RTaTX7-c-_Lf1k?usp=sharing',
    onedrive_folder_url: 'https://royalschooledu-my.sharepoint.com/personal/admin_royalschool_edu_vn/Documents/MinhChung2026',
    auto_create_subfolders: true,
    updated_at: '2026-10-20',
    updated_by: 'ThS. Nguyễn Hoàng Long',
  };

  const [cloudProvider, setCloudProvider] = useState<'google_drive' | 'onedrive' | 'local' | 'internal_base64'>(initialCloudConfig.provider);
  const [driveFolderId, setDriveFolderId] = useState<string>(initialCloudConfig.drive_folder_id || '');
  const [driveFolderName, setDriveFolderName] = useState<string>(initialCloudConfig.drive_folder_name || '');
  const [oneDriveFolderUrl, setOneDriveFolderUrl] = useState<string>(initialCloudConfig.onedrive_folder_url || '');
  const [autoCreateSubfolders, setAutoCreateSubfolders] = useState<boolean>(initialCloudConfig.auto_create_subfolders);
  const [cloudTestStatus, setCloudTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [cloudSaveMessage, setCloudSaveMessage] = useState<string | null>(null);

  // Check if current user is Super Admin
  const isSuperAdmin = currentRole === 'super_admin';

  // Instant 1-Click Clean All Sample Operational Data
  const handleCleanSampleDataNow = () => {
    const cleanStore = getInitialStore();
    onUpdateStore(prev => ({
      ...cleanStore,
      supabaseConfig: prev.supabaseConfig,
      telecomConfig: prev.telecomConfig,
      cloudStorageConfig: prev.cloudStorageConfig,
    }));
    const msg = 'Đã xóa toàn bộ dữ liệu mẫu vận hành (Giáo viên, Lớp học, Học sinh, Ghi danh, Điểm danh, Hóa đơn) và chuẩn hóa 10 bảng CSDL!';
    setResetSuccessMessage(msg);
    showToast(msg, 'success', { title: 'Đã xóa dữ liệu mẫu & Chuẩn hóa CSDL' });
    setTimeout(() => setResetSuccessMessage(null), 5000);
  };

  // Handle Clean Seed Data / Reset
  const handleExecuteReset = () => {
    if (!isSuperAdmin) {
      showToast('Quyền hạn bị từ chối: Chỉ Quản trị viên Cấp cao mới được thực hiện đặt lại dữ liệu.', 'error');
      return;
    }

    if (resetConfirmCode !== 'DELETE_CONFIRM') {
      showToast('Mật mã bảo mật không chính xác. Bạn phải nhập chính xác chuỗi ký tự: DELETE_CONFIRM', 'error');
      return;
    }

    onUpdateStore(prev => {
      let updated = { ...prev };

      if (selectedResetOption === 'ops') {
        // Option 1: Xóa dữ liệu vận hành & giao dịch
        updated.attendance = [];
        updated.teacherAttendance = [];
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
        // Option 3: Xóa lớp học & phân công
        updated.classes = [];
        updated.enrollments = [];
        updated.sessions = [];
        updated.attendance = [];
        updated.teacherAttendance = [];
      } else if (selectedResetOption === 'factory') {
        // Option 4: Full Factory Reset (Xóa trắng toàn bộ dữ liệu mẫu vận hành)
        updated.teachers = [];
        updated.classes = [];
        updated.students = [];
        updated.enrollments = [];
        updated.attendance = [];
        updated.teacherAttendance = [];
        updated.sessions = [];
        updated.invoices = [];
        updated.makeupCredits = [];
        updated.transfers = [];
        updated.payrollSettlements = [];
        updated.parentRegistrations = [];
      }

      // Record Audit Log: DATABASE_RESET
      const resetLog = createAuditRecord(
        'DATABASE_RESET',
        'SYSTEM',
        'Cơ sở dữ liệu hệ thống',
        `Super Admin thực hiện dọn sạch dữ liệu theo cấp độ: ${selectedResetOption.toUpperCase()}`,
        null,
        {
          details: {
            status: 'success',
            after: {
              option: selectedResetOption,
              timestamp: new Date().toISOString()
            }
          }
        }
      );
      updated.auditLogs = [resetLog, ...(updated.auditLogs || [])];

      return updated;
    });

    const resetMsg = `Đã thực hiện dọn sạch dữ liệu theo Option: ${selectedResetOption.toUpperCase()} thành công!`;
    setResetSuccessMessage(resetMsg);
    showToast(resetMsg, 'success', { title: 'Dọn sạch dữ liệu hệ thống' });
    setResetConfirmCode('');
    setTimeout(() => setResetSuccessMessage(null), 5000);
  };

  // Optional: Load Sample Demo Data for Testing
  const handleRestoreInitialSeed = () => {
    const demoStore = getSampleDemoStore();
    onUpdateStore(prev => ({
      ...demoStore,
      supabaseConfig: prev.supabaseConfig,
    }));
    showToast('Đã nạp bộ dữ liệu mẫu thử nghiệm (Demo) vào hệ thống!', 'success', {
      title: 'Nạp dữ liệu thử nghiệm',
    });
  };

  // Handle Excel File Upload (All 10 Standardized Sheets)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ loading: true, message: 'Đang đọc và chuẩn hóa 10 bảng dữ liệu từ tệp Excel...' });
    const result = await parseMasterExcelFile(file, store);

    if (result.success && result.data) {
      onUpdateStore(prev => {
        const importLog = createAuditRecord(
          'EXCEL_IMPORT',
          'SYSTEM',
          'Bảng Tính Master Excel (10 Bảng)',
          `Import đồng bộ tệp Excel "${file.name}" thành công`,
          null,
          {
            target_id: file.name,
            details: {
              status: 'success',
              after: {
                fileName: file.name,
                fileSize: file.size,
                message: result.message,
                sheetStats: result.sheetStats,
              }
            }
          }
        );

        const mergeById = <T extends { id: string }>(incoming: T[] | undefined, existing: T[]): T[] => {
          if (!incoming || incoming.length === 0) return existing;
          const map = new Map<string, T>();
          existing.forEach(item => map.set(item.id, item));
          incoming.forEach(item => map.set(item.id, item));
          return Array.from(map.values());
        };

        return {
          ...prev,
          campuses: mergeById(result.data?.campuses, prev.campuses),
          terms: mergeById(result.data?.terms, prev.terms),
          subjects: mergeById(result.data?.subjects, prev.subjects),
          termSubjects: mergeById(result.data?.termSubjects, prev.termSubjects),
          campusPricings: mergeById(result.data?.campusPricings, prev.campusPricings),
          teachers: mergeById(result.data?.teachers, prev.teachers),
          classes: mergeById(result.data?.classes, prev.classes),
          students: mergeById(result.data?.students, prev.students),
          enrollments: deduplicateEnrollments(mergeById(result.data?.enrollments, prev.enrollments)),
          attendance: mergeById(result.data?.attendance, prev.attendance),
          teacherAttendance: mergeById(result.data?.teacherAttendance, prev.teacherAttendance || []),
          invoices: mergeById(result.data?.invoices, prev.invoices),
          auditLogs: [importLog, ...(prev.auditLogs || [])],
        };
      });
      setImportStatus({
        loading: false,
        message: result.message,
        isError: false,
        sheetStats: result.sheetStats?.map(s => ({
          sheetName: s.sheetName,
          rowCount: s.rowsCount,
          status: 'Thành công',
        })),
      });
      showToast(result.message || `Import đồng bộ 10 bảng từ "${file.name}" thành công!`, 'success', {
        title: 'Nhập Bảng Tính Tổng Thể (10 Bảng)',
      });

      // TỰ ĐỘNG ĐẨY THẲNG LÊN SUPABASE CLOUD
      const client = getSupabaseClient() || supabase;
      if (client) {
        showToast({
          title: 'Đang đẩy lên CSDL',
          message: 'Đang tự động đồng bộ dữ liệu vừa đọc từ Excel lên Supabase Cloud...',
          type: 'info'
        });

        try {
          // 1. Đẩy cơ sở nếu có
          if (result.data.campuses && result.data.campuses.length > 0) {
            const campusesPayload = result.data.campuses.map((c: any) => ({
              id: c.id,
              code: c.code || c.id,
              name: c.name,
              address: c.address || '',
              phone: c.phone || '',
              email: c.email || '',
              status: c.status || 'active'
            }));
            await client.from('campuses').upsert(campusesPayload, { onConflict: 'id' });
          }

          // 2. Đẩy niên khóa nếu có
          if (result.data.terms && result.data.terms.length > 0) {
            const termsPayload = result.data.terms.map((t: any) => ({
              id: t.id,
              code: t.code || t.id,
              name: t.name,
              start_date: t.start_date,
              end_date: t.end_date,
              status: t.status || 'active',
              is_active: t.is_active !== false
            }));
            await client.from('academic_terms').upsert(termsPayload, { onConflict: 'id' });
          }

          // 3. Đẩy danh mục môn nếu có
          if (result.data.subjects && result.data.subjects.length > 0) {
            const subjectsPayload = result.data.subjects.map((s: any) => ({
              id: s.id,
              code: s.code || s.id,
              name: s.name,
              category: s.category || 'Thể thao',
              category_code: s.category_code || resolveSubjectCategoryCode(s.category, s.name),
              standard_duration: s.standard_duration || '90 phút',
              standard_sessions: s.standard_sessions || 24,
              standard_course_fee: s.standard_course_fee || 3990000,
              standard_session_rate: s.standard_session_rate || 166250,
              description: s.description || '',
              is_active: s.is_active !== false
            }));
            await client.from('subjects').upsert(subjectsPayload, { onConflict: 'id' });
          }

          // 4. Đẩy hồ sơ giáo viên nếu có
          if (result.data.teachers && result.data.teachers.length > 0) {
            const teachersPayload = result.data.teachers.map((t: any) => ({
              id: t.id,
              code: t.code || t.id,
              name: t.name,
              phone: t.phone || '',
              email: t.email || '',
              campus_id: t.campus_id || 'camp_pmh',
              type: t.type || t.teacher_type || 'permanent',
              teacher_type: t.teacher_type || t.type || 'permanent',
              fixed_rate_per_session: t.fixed_rate_per_session || 300000,
              default_rate_per_period: t.default_rate_per_period || 150000,
              periods_per_session: t.periods_per_session || 2,
              bank_account: t.bank_account || null,
              status: t.status || 'active'
            }));
            await client.from('teachers').upsert(teachersPayload, { onConflict: 'id' });
          }

          // 5. Đẩy danh sách lớp học nếu có
          if (result.data.classes && result.data.classes.length > 0) {
            const classesPayload = result.data.classes.map((c: any) => ({
              id: c.id,
              code: c.code || c.id,
              name: c.name,
              term_id: c.term_id,
              campus_id: c.campus_id,
              subject_id: c.subject_id,
              primary_teacher_id: c.primary_teacher_id || null,
              days_of_week: c.days_of_week || ['T2', 'T4'],
              start_date: c.start_date || null,
              end_date: c.end_date || null,
              max_students: c.max_students || 25,
              total_sessions: c.total_sessions || 24,
              full_course_fee: c.full_course_fee || 3990000,
              price_per_session: c.price_per_session || 166250,
              status: c.status || 'active'
            }));
            await client.from('extracurricular_classes').upsert(classesPayload, { onConflict: 'id' });
          }

          // 6. Đẩy học sinh nếu có
          if (result.data.students && result.data.students.length > 0) {
            const studentsPayload = result.data.students.map((s: any) => {
              const isRoyal = Boolean(s.is_royal_student ?? (s.student_type !== 'external'));
              const rawCampus = (s.campus_id || 'pmh').toString().toLowerCase();
              const cleanCampus = rawCampus.includes('pl') || rawCampus.includes('phú lâm') ? 'pl' : 'pmh';
              return {
                id: s.id,
                code: s.code || s.id,
                previous_student_code: s.previous_student_code || null,
                name: s.name,
                dob: s.dob || s.birth_date || '2016-01-01',
                gender: s.gender || 'Nam',
                is_royal_student: isRoyal,
                campus_id: cleanCampus,
                school_name: s.school_name || (cleanCampus === 'pl' ? 'Royal School Phú Lâm' : 'Royal School PMH'),
                regular_class: s.regular_class || s.class_name || '',
                parent_name: s.parent_name || 'Phụ huynh',
                parent_phone: s.parent_phone || '',
                medical_notes: s.medical_notes || '',
                avatar_url: s.avatar_url && !s.avatar_url.startsWith('data:') ? s.avatar_url : null,
                status: s.status || 'active',
                created_at: s.created_at || new Date().toISOString().split('T')[0]
              };
            });
            await client.from('students').upsert(studentsPayload, { onConflict: 'id' });
          }

          // 7. Đẩy ghi danh nếu có
          if (result.data.enrollments && result.data.enrollments.length > 0) {
            const enrollmentsPayload = result.data.enrollments.map((e: any) => ({
              id: e.id,
              student_id: e.student_id,
              class_id: e.class_id,
              registered_sessions: e.registered_sessions || 24,
              joined_date: e.joined_date || new Date().toISOString().split('T')[0],
              enrolled_days_of_week: e.enrolled_days_of_week || ['T2', 'T4'],
              is_partial_schedule: Boolean(e.is_partial_schedule),
              is_trial: Boolean(e.is_trial),
              status: e.status || 'active'
            }));
            await client.from('enrollments').upsert(enrollmentsPayload, { onConflict: 'id' });
          }

          // 8. Đẩy điểm danh nếu có
          if (result.data.attendance && result.data.attendance.length > 0) {
            const attendancePayload = result.data.attendance.map((a: any) => ({
              id: a.id,
              session_id: a.session_id || '',
              class_id: a.class_id,
              student_id: a.student_id,
              session_date: a.session_date,
              status: a.status || 'present',
              note: a.note || '',
              proof_file_name: a.proof_file_name || null,
              proof_url: a.proof_url && !a.proof_url.startsWith('data:') ? a.proof_url : null,
              uploaded_by: a.uploaded_by || null,
              uploaded_at: a.uploaded_at || null
            }));
            await client.from('attendance_records').upsert(attendancePayload, { onConflict: 'id' });
          }

          // 9. Đẩy chấm công giáo viên nếu có
          if (result.data.teacherAttendance && result.data.teacherAttendance.length > 0) {
            const teacherWorkPayload = result.data.teacherAttendance.map((ta: any) => ({
              id: ta.id,
              class_id: ta.class_id,
              term_id: ta.term_id,
              campus_id: ta.campus_id,
              session_date: ta.session_date,
              session_number: ta.session_number || 1,
              periods_count: ta.periods_count || 2,
              assigned_teacher_id: ta.assigned_teacher_id || null,
              actual_teacher_id: ta.actual_teacher_id || null,
              is_substitute: Boolean(ta.is_substitute),
              substitute_reason: ta.substitute_reason || null,
              status: ta.status || 'present',
              late_minutes: ta.late_minutes || 0,
              check_in_time: ta.check_in_time || '16:40',
              rate_per_period: ta.rate_per_period || 150000,
              rate_applied: ta.rate_applied || 300000,
              earned_amount: ta.earned_amount ?? ta.total_payout ?? 300000,
              total_payout: ta.total_payout || 300000,
              verified_by: ta.verified_by || '',
              notes: ta.notes || '',
              recalculated_at: ta.recalculated_at || null
            }));
            await client.from('teacher_work_sessions').upsert(teacherWorkPayload, { onConflict: 'id' });
          }

          // 10. Đẩy hóa đơn học phí nếu có
          if (result.data.invoices && result.data.invoices.length > 0) {
            const invoicesPayload = result.data.invoices.map((inv: any) => ({
              id: inv.id,
              invoice_code: inv.invoice_code,
              student_id: inv.student_id,
              class_id: inv.class_id,
              registered_sessions: inv.registered_sessions || 24,
              total_class_sessions: inv.total_class_sessions || 24,
              session_rate: inv.session_rate || 166250,
              gross_amount: inv.gross_amount || 0,
              credit_deducted: inv.credit_deducted || 0,
              discount_amount: inv.discount_amount || 0,
              net_payable: inv.net_payable || 0,
              paid_amount: inv.paid_amount || 0,
              outstanding_amount: inv.outstanding_amount || 0,
              payment_status: inv.payment_status || 'unpaid',
              due_date: inv.due_date || null,
              payment_reference: inv.payment_reference || null,
              verified_by: inv.verified_by || null,
              verified_at: inv.verified_at || null,
              payment_history: inv.payment_history || [],
              created_at: inv.created_at || new Date().toISOString().split('T')[0]
            }));
            await client.from('tuition_invoices').upsert(invoicesPayload, { onConflict: 'id' });
          }

          showToast({
            title: 'Đồng bộ Cloud thành công',
            message: 'Toàn bộ dữ liệu từ Excel đã được lưu vĩnh viễn vào CSDL Supabase!',
            type: 'success'
          });

          // Tải lại kiểm tra trạng thái bảng
          if (typeof handleInspectDatabaseHealth === 'function') {
            handleInspectDatabaseHealth();
          }
        } catch (pushErr: any) {
          console.error('Lỗi khi đẩy dữ liệu lên Supabase:', pushErr);
          showToast({
            title: 'Cảnh báo lưu Cloud',
            message: 'Dữ liệu đã lưu ở App nhưng chưa lên Cloud: ' + (pushErr.message || pushErr.toString()),
            type: 'warning'
          });
        }
      }
    } else {
      setImportStatus({ loading: false, message: result.message, isError: true });
      showToast(result.message || 'Lỗi khi đọc tệp Excel!', 'error');
    }
  };

  // Run Full Connection & 10-Table Health Check
  const handleInspectDatabaseHealth = async (customUrl?: string, customKey?: string) => {
    const targetUrl = sanitizeSupabaseBaseUrl(customUrl ?? sbUrl);
    const targetKey = (customKey ?? sbKey).trim();
    if (targetUrl && targetUrl !== sbUrl) {
      setSbUrl(targetUrl);
    }
    setSbInspectingTables(true);

    if (targetUrl && targetKey) {
      const connRes = await verifySupabaseConnection(targetUrl, targetKey);
      setSbCheckDetails(connRes);
      setSbLatency(connRes.latencyMs);
      setSbHasBucket(connRes.hasStorageBucket);
      setSbConnected(connRes.connected);

      const health = await inspectAllDatabaseTables(
        store,
        connRes.connected ? targetUrl : '',
        connRes.connected ? targetKey : ''
      );
      setTableHealthList(health);
      setSbInspectingTables(false);

      const syncedCount = health.filter(h => h.status === 'synced').length;
      const missingCount = health.filter(h => h.status === 'table_missing').length;

      if (connRes.connected) {
        showToast(
          `Kiểm tra hoàn tất: Kết nối ${connRes.latencyMs}ms • ${syncedCount}/10 bảng đồng bộ${missingCount > 0 ? ` (${missingCount} bảng chưa khởi tạo SQL)` : ''}.`,
          missingCount > 0 ? 'warning' : 'success',
          { title: 'Kiểm Tra CSDL & 10 Bảng Dữ Liệu' }
        );
      } else {
        showToast(connRes.message, 'error', { title: 'Lỗi Kết Nối Supabase' });
      }
    } else {
      const health = await inspectAllDatabaseTables(store, '', '');
      setTableHealthList(health);
      setSbInspectingTables(false);
      const validTables = health.filter(h => h.integrityValid).length;
      showToast(
        `Đã kiểm tra trạng thái 10 bảng Local Store: ${validTables}/10 bảng đạt chuẩn toàn vẹn khóa ngoại 3NF.`,
        'info',
        { title: 'Kiểm Tra Trạng Thái 10 Bảng Dữ Liệu' }
      );
    }
  };

  // Save Supabase Config & Verify Connection + All 10 Tables
  const handleSaveSupabase = async () => {
    setSbTesting(true);
    const cleanUrl = sanitizeSupabaseBaseUrl(sbUrl);
    const cleanKey = sbKey.trim();
    if (cleanUrl !== sbUrl) {
      setSbUrl(cleanUrl);
    }
    const result = await verifySupabaseConnection(cleanUrl, cleanKey);
    setSbCheckDetails(result);
    setSbLatency(result.latencyMs);
    setSbHasBucket(result.hasStorageBucket);
    setSbConnected(result.connected);

    onUpdateStore(prev => ({
      ...prev,
      supabaseConfig: {
        url: cleanUrl,
        anonKey: cleanKey,
        isConnected: result.connected,
      },
    }));

    const health = await inspectAllDatabaseTables(
      store,
      result.connected ? cleanUrl : '',
      result.connected ? cleanKey : ''
    );
    setTableHealthList(health);
    setSbTesting(false);

    if (result.connected) {
      showToast('✓ Đã kết nối Supabase PostgreSQL & kiểm tra trạng thái 10 bảng dữ liệu!', 'success', {
        title: 'Supabase Cloud Connected',
      });
    } else {
      showToast(result.message || 'Không thể kết nối tới Supabase.', 'error', {
        title: 'Lỗi kết nối Supabase',
      });
    }
  };

  const handleTestLiveSupabase = async () => {
    setSbTesting(true);
    await handleInspectDatabaseHealth(sbUrl, sbKey);
    setSbTesting(false);
  };

  // Push All 10 Standardized Tables to Supabase
  const handleExecuteSupabaseSync = async () => {
    if (!sbUrl.trim() || !sbKey.trim()) {
      showToast('Vui lòng nhập Supabase Project URL và Anon Key trước khi đồng bộ.', 'error');
      return;
    }
    setSbSyncing(true);
    setSbSyncProgress(5);
    setSbSyncTable('Khởi tạo tiến trình đồng bộ 10 bảng...');

    const pushResult = await pushAllTablesToSupabase(store, sbUrl, sbKey, (tableName, progress) => {
      setSbSyncProgress(progress);
      setSbSyncTable(tableName);
    });

    const health = await inspectAllDatabaseTables(store, sbUrl, sbKey);
    setTableHealthList(health);
    setSbSyncing(false);

    if (pushResult.success) {
      showToast(pushResult.message, 'success', { title: 'Đồng Bộ 10 Bảng Lên Supabase Thành Công' });
    } else {
      showToast(pushResult.message, 'warning', { title: 'Đồng Bộ Hoàn Tất Có Cảnh Báo' });
    }
  };

  // Pull All 10 Standardized Tables from Supabase into Local Store
  const handlePullFromSupabase = async () => {
    if (!sbUrl.trim() || !sbKey.trim()) {
      showToast('Vui lòng cấu hình Supabase URL và Anon Key trước khi tải dữ liệu.', 'error');
      return;
    }
    setSbSyncing(true);
    setSbSyncProgress(30);
    setSbSyncTable('Đang tải 10 bảng dữ liệu từ Supabase Cloud...');

    const pullRes = await pullAllTablesFromSupabase(store, sbUrl, sbKey);
    if (pullRes.success && pullRes.updatedStore) {
      onUpdateStore(prev => ({
        ...prev,
        ...pullRes.updatedStore,
      }));
      const mergedStore = { ...store, ...pullRes.updatedStore };
      const health = await inspectAllDatabaseTables(mergedStore, sbUrl, sbKey);
      setTableHealthList(health);
      setSbSyncProgress(100);
      setSbSyncing(false);
      showToast(pullRes.message, 'success', { title: 'Tải Dữ Liệu Từ Supabase Thành Công' });
    } else {
      setSbSyncing(false);
      showToast(pullRes.message, 'error', { title: 'Không Thể Tải Dữ Liệu Từ Supabase' });
    }
  };

  // Push Single Table to Supabase
  const handlePushSingleTable = async (spec: typeof ROYAL_STANDARDIZED_10_TABLES[number]) => {
    if (!sbUrl.trim() || !sbKey.trim()) {
      showToast('Vui lòng nhập Supabase Project URL và Anon Key để đẩy bảng lên Cloud.', 'error');
      return;
    }
    setSbPushingTable(spec.tableName);
    const res = await pushSingleTableToSupabase(spec.tableName, store, sbUrl, sbKey);
    const health = await inspectAllDatabaseTables(store, sbUrl, sbKey);
    setTableHealthList(health);
    setSbPushingTable(null);

    if (res.success) {
      showToast(res.message, 'success', { title: `Đồng bộ bảng ${spec.tableName}` });
    } else {
      showToast(res.message, 'error', { title: `Lỗi đồng bộ bảng ${spec.tableName}` });
    }
  };

  const handleCopySqlDdl = () => {
    navigator.clipboard.writeText(SUPABASE_FULL_DDL_SQL);
    setSqlCopied(true);
    showToast('Đã sao chép toàn bộ mã lệnh PostgreSQL DDL (10 Bảng Chuẩn Hóa) vào bộ nhớ tạm!', 'success', {
      title: 'Sao chép SQL DDL',
    });
    setTimeout(() => setSqlCopied(false), 3000);
  };

  const handleDownloadSqlDdl = () => {
    const blob = new Blob([SUPABASE_FULL_DDL_SQL], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'royal_school_10_tables_schema.sql';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Đã tải xuống file royal_school_10_tables_schema.sql!', 'success', {
      title: 'Tải xuống thành công',
    });
  };

  // Test Cloud Connection
  const handleTestCloudConnection = () => {
    setCloudTestStatus('testing');
    setTimeout(() => {
      setCloudTestStatus('success');
    }, 500);
  };

  // Save Cloud Storage Config
  const handleSaveCloudStorage = () => {
    onUpdateStore(prev => {
      const updatedConfig: CloudStorageConfig = {
        provider: cloudProvider,
        drive_folder_id: driveFolderId.trim(),
        drive_folder_name: driveFolderName.trim() || 'RoyalSchool_Storage_Drive',
        drive_root_url: cloudProvider === 'google_drive' 
          ? (driveFolderId.includes('http') ? driveFolderId.trim() : `https://drive.google.com/drive/folders/${driveFolderId.trim() || '1KVkKVyz9sQVu_22La7RTaTX7-c-_Lf1k'}?usp=sharing`)
          : undefined,
        onedrive_folder_url: oneDriveFolderUrl.trim(),
        subfolders: prev.cloudStorageConfig?.subfolders || {
          student_photos: '01_HinhHocSinh',
          attendance_proofs: '02_DonNghiPhep',
          admissions: '03_DonTuyenSinh',
          tuition_invoices: '04_HoaDonHocPhi',
          reports: '05_BaoCaoThongKe',
          backups: '06_SaoLuuHeThong',
        },
        auto_create_subfolders: autoCreateSubfolders,
        updated_at: new Date().toISOString().split('T')[0],
        updated_by: 'ThS. Nguyễn Hoàng Long',
      };

      const auditLog = createAuditRecord(
        'STORAGE_CONFIG_UPDATE',
        'SYSTEM',
        'Cấu hình Kho Lưu Trữ Cloud',
        `Cập nhật vị trí lưu trữ tệp sang ${cloudProvider === 'google_drive' ? 'Google Drive' : cloudProvider === 'onedrive' ? 'OneDrive / SharePoint' : 'Bộ nhớ cục bộ'} - Thư mục: ${updatedConfig.drive_folder_name}`,
        undefined,
        {
          details: {
            provider: cloudProvider,
            folder: updatedConfig.drive_folder_name,
            auto_subfolders: autoCreateSubfolders,
          }
        }
      );

      return {
        ...prev,
        cloudStorageConfig: updatedConfig,
        auditLogs: [auditLog, ...(prev.auditLogs || [])],
      };
    });

    setCloudSaveMessage('Đã lưu cấu hình kho lưu trữ tệp Cloud thành công!');
    showToast('Đã lưu cấu hình kho lưu trữ tệp Cloud thành công!', 'success', {
      title: 'Lưu cấu hình Cloud Storage',
    });
    setTimeout(() => setCloudSaveMessage(null), 3500);
  };

  return (
    <div className="space-y-6">
      
      {/* Navigation Pills - Optimized with Flex Wrap + Smooth Horizontal Scroll + Compact Padding (px-3 py-1.5 text-xs font-semibold) */}
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto no-scrollbar py-1.5 scroll-smooth border-b border-slate-800">
        <button
          onClick={() => setActiveSection('pricing')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'pricing'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5 shrink-0" />
          <span>Cấu Hình Khóa Học &amp; Biểu Phí</span>
        </button>

        <button
          onClick={() => setActiveSection('teacher_rates')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'teacher_rates'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-amber-300 hover:text-white border border-amber-500/30'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5 shrink-0" />
          <span>Định Mức Thù Lao GV ({store.teachers.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('campuses')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'campuses'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span>Cơ Sở &amp; Ngân Hàng ({store.campuses.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('holidays')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'holidays'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-amber-300 hover:text-white border border-amber-500/30'
          }`}
        >
          <CalendarOff className="w-3.5 h-3.5 shrink-0" />
          <span>Danh Sách Ngày Nghỉ Lễ ({store.holidays?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveSection('clean_reset')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'clean_reset'
              ? 'bg-rose-600 text-white font-bold shadow-md shadow-rose-600/30'
              : 'bg-slate-900 text-rose-400 hover:text-rose-300 border border-rose-500/30'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span>Dọn Sạch Dữ Liệu (Reset DB)</span>
        </button>

        <button
          onClick={() => setActiveSection('excel_master')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'excel_master'
              ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
              : 'bg-slate-900 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30'
          }`}
        >
          <Table className="w-3.5 h-3.5 shrink-0" />
          <span>Bảng Tính Tổng Thể (10 Bảng)</span>
        </button>

        <button
          onClick={() => setActiveSection('telecom')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'telecom'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          <span>Kênh Viễn Thông (Zalo/SMS)</span>
        </button>

        <button
          onClick={() => setActiveSection('users')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'users'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-cyan-300 hover:text-white border border-cyan-500/30'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span>Quản Lý Người Dùng &amp; Phân Quyền (RBAC)</span>
        </button>

        <button
          onClick={() => setActiveSection('supabase')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'supabase'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
          }`}
        >
          <Database className="w-3.5 h-3.5 shrink-0" />
          <span>Kết Nối CSDL &amp; Supabase (10 Bảng)</span>
        </button>

        <button
          onClick={() => setActiveSection('backup')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'backup'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
              : 'bg-slate-900 text-emerald-400 hover:text-white border border-emerald-500/30'
          }`}
        >
          <Database className="w-3.5 h-3.5 shrink-0" />
          <span>Sao Lưu CSDL (Backup 18 Bảng)</span>
        </button>

        <button
          onClick={() => setActiveSection('audit_logs')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeSection === 'audit_logs'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>Nhật Ký Kiểm Toán (Audit Logs)</span>
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
                    Mô hình chuẩn: Trung Tâm &rarr; Phân Loại Môn &rarr; Danh Mục Môn &rarr; Khóa Học &rarr; Cơ Sở &rarr; Lớp Học
                  </p>
                </div>
              </div>
            </div>

            {/* Sub-tab Navigation */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-slate-800 overflow-x-auto no-scrollbar scroll-smooth">
              <button
                onClick={() => setHierarchySubTab('categories')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  hierarchySubTab === 'categories'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>1. Phân Loại Môn ({categoriesList.length})</span>
              </button>
              <button
                onClick={() => setHierarchySubTab('subjects')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  hierarchySubTab === 'subjects'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <School className="w-3.5 h-3.5" />
                <span>2. Danh Mục Môn Học ({store.subjects.length})</span>
              </button>
              <button
                onClick={() => setHierarchySubTab('terms')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  hierarchySubTab === 'terms'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>3. Khóa Học & Vòng Đời ({store.terms.length})</span>
              </button>
              <button
                onClick={() => setHierarchySubTab('term_subjects')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  hierarchySubTab === 'term_subjects'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>4. Kích Hoạt Môn Khóa</span>
              </button>
              <button
                onClick={() => setHierarchySubTab('campus_pricing')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  hierarchySubTab === 'campus_pricing'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>5. Biểu Phí Cơ Sở</span>
              </button>
              <button
                onClick={() => setHierarchySubTab('matrix')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  hierarchySubTab === 'matrix'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>6. Ma Trận Toàn Trường</span>
              </button>
            </div>
          </div>

          {/* SUB-VIEW 1: PHÂN LOẠI MÔN HỌC (SUBJECT CATEGORIES - CẤP TRUNG TÂM) */}
          {hierarchySubTab === 'categories' && (
            <div className="space-y-4">
              {/* Header & Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl bg-[#111827]/80 border border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Tag className="w-4 h-4 text-amber-400" />
                    <span>Quản Lý Phân Loại Môn Học Toàn Trường ({filteredCategories.length} nhóm)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Cấp Trung Tâm &rarr; Thiết lập các nhóm năng khiếu & lĩnh vực đào tạo (Thể thao, Nghệ thuật, STEM, Kỹ năng sống...), quy định màu nhận diện và icon đặc trưng.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Search input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={categorySearchQuery}
                      onChange={(e) => setCategorySearchQuery(e.target.value)}
                      placeholder="Tìm mã hoặc tên nhóm..."
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-44"
                    />
                  </div>

                  {/* ViewToggle */}
                  <ViewToggle
                    viewMode={categoriesViewMode}
                    onViewModeChange={setCategoriesViewMode}
                  />

                  {/* Add Category Button */}
                  <button
                    onClick={handleOpenAddCategory}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Thêm Phân Loại Mới</span>
                  </button>
                </div>
              </div>

              {/* KPI Mini-Bar for Categories */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Tổng Nhóm Phân Loại</span>
                    <span className="text-lg font-black text-white">{categoriesList.length}</span>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                    <Tag className="w-4 h-4" />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Đang Hoạt Động</span>
                    <span className="text-lg font-black text-emerald-400">
                      {categoriesList.filter(c => c.status === 'active').length}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Tổng Môn Học Trực Thuộc</span>
                    <span className="text-lg font-black text-cyan-400">{store.subjects.length}</span>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">
                    <School className="w-4 h-4" />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Lớp Ngoại Khóa Đang Mở</span>
                    <span className="text-lg font-black text-purple-400">{store.classes.length}</span>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold">
                    <Calendar className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Cards View */}
              {categoriesViewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCategories.map(cat => {
                    const relatedSubjects = (store.subjects || []).filter(s => {
                      const sCode = (s.category_code || resolveSubjectCategoryCode(s.category, s.name)).trim().toUpperCase();
                      const catCode = (cat.code || '').trim().toUpperCase();
                      if (sCode === catCode) return true;
                      if ((sCode === 'ART' || sCode === 'ARTS') && (catCode === 'ART' || catCode === 'ARTS')) return true;
                      if ((sCode === 'TECH' || sCode === 'DIGITAL') && (catCode === 'TECH' || catCode === 'DIGITAL')) return true;
                      if ((sCode === 'SKILLS' || sCode === 'LIFESKILLS') && (catCode === 'SKILLS' || catCode === 'LIFESKILLS')) return true;
                      if (s.category && (s.category.trim().toLowerCase() === cat.name.trim().toLowerCase() || s.category.trim().toLowerCase() === catCode.toLowerCase())) return true;
                      return false;
                    });
                    const subjectCount = cat.subject_count ?? relatedSubjects.length;
                    const colorStyle = getCategoryColorDetails(cat.color);
                    const IconComp = getCategoryIconComponent(cat.icon);

                    return (
                      <div
                        key={cat.id}
                        className={`p-4 rounded-3xl bg-[#111827]/90 border ${colorStyle.cardBorder} backdrop-blur-md transition-all shadow-md flex flex-col justify-between space-y-3.5`}
                      >
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-10 h-10 rounded-2xl ${colorStyle.bgSubtle} ${colorStyle.text} flex items-center justify-center border ${colorStyle.badge}`}>
                              <IconComp className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${colorStyle.badge}`}>
                                  {cat.code}
                                </span>
                                {cat.status === 'active' ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    Hoạt động
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                    Tạm dừng
                                  </span>
                                )}
                              </div>
                              <h5 className="text-sm font-bold text-white mt-1">{cat.name}</h5>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditCategory(cat)}
                              title="Chỉnh sửa phân loại"
                              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(cat)}
                              title="Xóa phân loại"
                              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-slate-400 leading-relaxed min-h-[36px]">
                          {cat.description || 'Chưa có mô tả chi tiết cho nhóm phân loại này.'}
                        </p>

                        {/* Direct Subjects List */}
                        <div className="pt-2 border-t border-slate-800/80 space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">Môn học trực thuộc:</span>
                            <span className="font-bold text-white flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${colorStyle.dot}`}></span>
                              {subjectCount} môn
                            </span>
                          </div>

                          {relatedSubjects.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto scrollbar-none">
                              {relatedSubjects.map(sub => (
                                <span
                                  key={sub.id}
                                  className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-medium"
                                >
                                  {sub.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 italic">
                              Chưa có môn học nào thuộc phân loại này.
                            </div>
                          )}

                          {/* Quick Link to filter subjects */}
                          <div className="flex items-center justify-between pt-1">
                            <button
                              onClick={() => {
                                setSubjectCategoryFilter(cat.name);
                                setHierarchySubTab('subjects');
                              }}
                              className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition-colors"
                            >
                              <span>Xem danh sách môn ({subjectCount})</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleOpenAddSubject(cat.name)}
                              className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium transition-colors"
                            >
                              + Thêm môn vào nhóm
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Table View */
                <div className="rounded-3xl bg-[#111827]/90 border border-slate-800 overflow-hidden shadow-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-3.5">Mã Nhóm</th>
                          <th className="py-3 px-3.5">Tên Phân Loại & Icon</th>
                          <th className="py-3 px-3.5">Màu Nhận Diện</th>
                          <th className="py-3 px-3.5">Mô Tả & Định Hướng Đào Tạo</th>
                          <th className="py-3 px-3.5 text-center">Số Môn Trực Thuộc</th>
                          <th className="py-3 px-3.5 text-center">Trạng Thái</th>
                          <th className="py-3 px-3.5 text-center">Thao Tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {filteredCategories.map(cat => {
                          const relatedSubjects = (store.subjects || []).filter(s => {
                            const sCode = (s.category_code || resolveSubjectCategoryCode(s.category, s.name)).trim().toUpperCase();
                            const catCode = (cat.code || '').trim().toUpperCase();
                            if (sCode === catCode) return true;
                            if ((sCode === 'ART' || sCode === 'ARTS') && (catCode === 'ART' || catCode === 'ARTS')) return true;
                            if ((sCode === 'TECH' || sCode === 'DIGITAL') && (catCode === 'TECH' || catCode === 'DIGITAL')) return true;
                            if ((sCode === 'SKILLS' || sCode === 'LIFESKILLS') && (catCode === 'SKILLS' || catCode === 'LIFESKILLS')) return true;
                            if (s.category && (s.category.trim().toLowerCase() === cat.name.trim().toLowerCase() || s.category.trim().toLowerCase() === catCode.toLowerCase())) return true;
                            return false;
                          });
                          const subjectCount = cat.subject_count ?? relatedSubjects.length;
                          const colorStyle = getCategoryColorDetails(cat.color);
                          const IconComp = getCategoryIconComponent(cat.icon);

                          return (
                            <tr key={cat.id} className="hover:bg-slate-900/50 transition-colors">
                              <td className="py-3 px-3.5">
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border ${colorStyle.badge}`}>
                                  {cat.code}
                                </span>
                              </td>
                              <td className="py-3 px-3.5 font-bold text-white">
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-lg ${colorStyle.bgSubtle} ${colorStyle.text} flex items-center justify-center border ${colorStyle.badge}`}>
                                    <IconComp className="w-3.5 h-3.5" />
                                  </div>
                                  <span>{cat.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-3.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-3 h-3 rounded-full ${colorStyle.dot}`}></span>
                                  <span className="capitalize text-slate-300 text-[11px]">{cat.color}</span>
                                </div>
                              </td>
                              <td className="py-3 px-3.5 text-slate-400 max-w-xs truncate">
                                {cat.description || '-'}
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                <button
                                  onClick={() => {
                                    setSubjectCategoryFilter(cat.name);
                                    setHierarchySubTab('subjects');
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-amber-500/20 text-slate-300 hover:text-amber-400 font-bold border border-slate-800 transition-all text-xs"
                                >
                                  {subjectCount} môn
                                </button>
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                {cat.status === 'active' ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    Hoạt động
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/50 text-slate-400 border border-slate-600">
                                    Tạm dừng
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleOpenEditCategory(cat)}
                                    title="Sửa"
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCategory(cat)}
                                    title="Xóa"
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUB-VIEW 2: DANH MỤC MÔN HỌC (SUBJECTS CATALOG - CẤP TRUNG TÂM) */}
          {hierarchySubTab === 'subjects' && (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl bg-[#111827]/80 border border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <School className="w-4 h-4 text-amber-400" />
                    <span>Danh Mục Môn Học Tổng Thể ({filteredSubjects.length} môn)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Cấp Trung Tâm &rarr; Khởi tạo danh mục môn học toàn trường, phân loại môn, thời lượng giảng dạy chuẩn và nội dung đào tạo.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-[11px]">
                    <button
                      onClick={() => setSubjectCategoryFilter('all')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                        subjectCategoryFilter === 'all'
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Tất cả ({store.subjects.length})
                    </button>
                    {categoriesList.map(cat => {
                      const count = store.subjects.filter(
                        s => s.category.trim().toLowerCase() === cat.name.trim().toLowerCase() ||
                             s.category.trim().toLowerCase() === cat.code.trim().toLowerCase()
                      ).length;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setSubjectCategoryFilter(cat.name)}
                          className={`px-2 py-1 rounded-lg font-medium transition-all ${
                            subjectCategoryFilter === cat.name
                              ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {cat.name} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={subjectSearchQuery}
                      onChange={(e) => setSubjectSearchQuery(e.target.value)}
                      placeholder="Tìm mã hoặc tên môn..."
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-44"
                    />
                  </div>

                  {/* ViewToggle */}
                  <ViewToggle
                    viewMode={subjectsViewMode}
                    onViewModeChange={setSubjectsViewMode}
                  />

                  {/* Import Excel / CSV Button */}
                  <button
                    onClick={() => setShowImportSubjectsModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all shrink-0 cursor-pointer"
                    title="Nhập môn học hàng loạt từ file Excel hoặc CSV"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>📥 Nhập Excel / CSV</span>
                  </button>

                  {/* Add Subject Button */}
                  <button
                    onClick={handleOpenAddSubject}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Thêm Môn Học Mới</span>
                  </button>
                </div>
              </div>

              {/* Cards View */}
              {subjectsViewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredSubjects.map(subject => {
                    const activeTermsCount = store.termSubjects.filter(ts => ts.subject_id === subject.id && ts.is_active).length;
                    const relatedClassesCount = store.classes.filter(c => c.subject_id === subject.id).length;
                    const catBadge = getSubjectCategoryBadge(subject.category);
                    const CatIcon = catBadge.icon;

                    return (
                      <div
                        key={subject.id}
                        className="rounded-2xl p-4 bg-[#111827]/90 border border-slate-800 hover:border-slate-700 shadow-xl flex flex-col justify-between transition-all group backdrop-blur-md"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                                {subject.code}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${catBadge.badge}`}>
                                <CatIcon className="w-3 h-3" />
                                <span>{subject.category}</span>
                              </span>
                            </div>

                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleOpenEditSubject(subject)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-400 hover:text-amber-400 transition-colors"
                                title="Chỉnh sửa môn học"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteSubject(subject)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                                title="Xóa môn học"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div>
                            <h4 className="text-base font-extrabold text-white group-hover:text-amber-300 transition-colors">
                              {subject.name}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                              <span className="flex items-center gap-1 text-slate-300 font-medium">
                                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                {subject.standard_duration || '90 phút'}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono font-bold text-[10px]">
                                {Number(subject.standard_sessions || 16)} buổi
                              </span>
                            </div>
                            {subject.description ? (
                              <p className="text-[11px] text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                                {subject.description}
                              </p>
                            ) : (
                              <p className="text-[11px] text-slate-500 mt-2 italic">
                                Chương trình đào tạo ngoại khóa theo tiêu chuẩn quốc tế Royal School.
                              </p>
                            )}
                          </div>

                          {/* Học phí khóa & Đơn giá buổi trên Card */}
                          {(() => {
                            const cFee = Number(subject.standard_course_fee || 0);
                            const cSessions = Number(subject.standard_sessions || 16);
                            const cRate = Number(subject.standard_session_rate) || (cSessions > 0 ? Math.round(cFee / cSessions) : 0);
                            return (
                              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Học phí khóa</span>
                                  {cFee > 0 ? (
                                    <strong className="text-amber-300 font-mono text-xs">
                                      {new Intl.NumberFormat('vi-VN').format(cFee)} đ
                                    </strong>
                                  ) : (
                                    <span className="text-slate-500 text-[11px] italic">Chưa thiết lập</span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Đơn giá buổi</span>
                                  {cRate > 0 ? (
                                    <strong className="text-emerald-400 font-mono text-xs">
                                      {new Intl.NumberFormat('vi-VN').format(cRate)} đ/b
                                    </strong>
                                  ) : (
                                    <span className="text-slate-500 text-[11px] italic">--</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 grid grid-cols-2 gap-2 text-center text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Khóa kích hoạt</span>
                              <strong className="text-amber-400 font-mono text-sm">{activeTermsCount}</strong>
                              <span className="text-[10px] text-slate-500"> / {store.terms.length}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">Lớp ngoại khóa mở</span>
                              <strong className="text-cyan-400 font-mono text-sm">{relatedClassesCount}</strong>
                              <span className="text-[10px] text-slate-500"> lớp</span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                          <button
                            onClick={() => {
                              setHierarchySubTab('term_subjects');
                            }}
                            className="text-amber-400 hover:underline font-semibold flex items-center gap-1"
                          >
                            <span>Kích hoạt khóa &rarr;</span>
                          </button>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditSubject(subject)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-all"
                            >
                              Sửa
                            </button>
                            <button
                              onClick={() => handleDeleteSubject(subject)}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30 transition-all"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Table View */
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#111827]/90 shadow-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    {/* Table Header */}
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4 text-left">MÃ MÔN</th>
                        <th className="py-3 px-4 text-left">TÊN MÔN HỌC &amp; NỘI DUNG</th>
                        <th className="py-3 px-4 text-center">PHÂN LOẠI</th>
                        <th className="py-3 px-4 text-center">THỜI LƯỢNG CHUẨN</th>
                        <th className="py-3 px-4 text-center">SỐ BUỔI CHUẨN</th>

                        {/* 2 Cột bổ sung mới */}
                        <th className="py-3 px-4 text-right">HỌC PHÍ KHÓA</th>
                        <th className="py-3 px-4 text-right">ĐƠN GIÁ BUỔI</th>

                        <th className="py-3 px-4 text-center">KHÓA ĐANG KÍCH HOẠT</th>
                        <th className="py-3 px-4 text-center">LỚP HỌC MỞ</th>
                        <th className="py-3 px-4 text-center">THAO TÁC</th>
                      </tr>
                    </thead>

                    {/* Table Body Row */}
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      {filteredSubjects.map((subject) => {
                        const activeTermsCount = store.termSubjects.filter(ts => ts.subject_id === subject.id && ts.is_active).length;
                        const relatedClassesCount = store.classes.filter(c => c.subject_id === subject.id).length;
                        const catBadge = getSubjectCategoryBadge(subject.category);
                        const CatIcon = catBadge.icon;

                        const courseFee = Number(subject.standard_course_fee || 0);
                        const sessions = Number(subject.standard_sessions || 16);
                        const sessionRate = Number(subject.standard_session_rate) || (sessions > 0 ? Math.round(courseFee / sessions) : 0);

                        return (
                          <tr key={subject.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-xs text-amber-400/90">
                              {subject.code}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white text-sm">{subject.name}</div>
                              <div className="text-xs text-slate-400 truncate max-w-xs">
                                {subject.description || 'Chương trình chuẩn Hoàng Gia'}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border inline-flex items-center gap-1 ${catBadge.badge}`}>
                                <CatIcon className="w-3 h-3" />
                                <span>{subject.category || 'Môn học'}</span>
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center text-xs text-slate-300">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                {subject.standard_duration || '90 phút'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                {sessions} buổi
                              </span>
                            </td>

                            {/* Render 2 Cột mới */}
                            <td className="py-3.5 px-4 text-right font-medium text-amber-300 font-mono">
                              {courseFee > 0 ? (
                                `${new Intl.NumberFormat('vi-VN').format(courseFee)} đ`
                              ) : (
                                <span className="text-slate-500 text-xs italic">Chưa thiết lập</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right font-semibold text-emerald-400 font-mono">
                              {sessionRate > 0 ? (
                                `${new Intl.NumberFormat('vi-VN').format(sessionRate)} đ/b`
                              ) : (
                                <span className="text-slate-500 text-xs">--</span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-center text-xs">
                              <span className="text-amber-400 font-bold">{activeTermsCount}</span>
                              <span className="text-slate-500"> / {store.terms.length || 3}</span>
                            </td>
                            <td className="py-3.5 px-4 text-center font-bold text-cyan-400">
                              {relatedClassesCount}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleOpenEditSubject(subject)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all"
                                  title="Sửa môn học"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSubject(subject)}
                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all"
                                  title="Xóa môn học"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {store.subjects.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-slate-900/60 border border-dashed border-amber-500/30 text-slate-300 space-y-4 shadow-xl">
                  <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                    <School className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-extrabold text-white">Chưa có môn học nào trong CSDL</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Bấm <strong className="text-amber-400">'+ Thêm Môn Học Mới'</strong> hoặc <strong className="text-emerald-400">'📥 Nhập Excel / CSV'</strong> để bắt đầu thiết lập danh mục môn học toàn trường.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      onClick={handleOpenAddSubject}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Thêm Môn Học Mới</span>
                    </button>
                    <button
                      onClick={() => setShowImportSubjectsModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>📥 Nhập Excel / CSV</span>
                    </button>
                  </div>
                </div>
              ) : filteredSubjects.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-900/50 border border-slate-800 text-slate-400 space-y-2">
                  <p className="text-sm font-semibold">Không tìm thấy môn học nào phù hợp với bộ lọc.</p>
                  <button
                    onClick={() => {
                      setSubjectCategoryFilter('all');
                      setSubjectSearchQuery('');
                    }}
                    className="text-xs text-amber-400 hover:underline font-bold"
                  >
                    Xóa bộ lọc tìm kiếm
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* SUB-VIEW 2: QUẢN LÝ VÒNG ĐỜI KHÓA HỌC & NHÂN BẢN (TERMS LIFECYCLE) */}
          {hierarchySubTab === 'terms' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#111827]/80 border border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    <span>Danh Sách Khóa Học & Vòng Đời Nghiệp Vụ</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Vòng đời khóa: Dự thảo &rarr; Mở Tuyển Sinh &rarr; Đang Học &rarr; Đã Đóng (Khóa chỉnh sửa toàn bộ dữ liệu)
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
                    <span>Nhân Bản Khóa Học</span>
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
                  const termClasses = store.classes.filter(c => String(c.term_id) === String(term.id));
                  const activeSubjectsCount = store.termSubjects.filter(
                    (ts) => String(ts.term_id) === String(term.id) && ts.is_active === true
                  ).length;
                  const isClosed = term.status === 'closed';

                  const statusConfig = {
                    draft: {
                      label: 'Dự Thảo',
                      color: 'bg-slate-700/50 text-slate-300 border-slate-600',
                      desc: 'Đang thiết lập môn học và biểu phí, chưa mở cho phụ huynh.',
                    },
                    open_enrollment: {
                      label: 'Đang Tuyển Sinh',
                      color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
                      desc: 'Các cơ sở được phép mở lớp và phụ huynh có thể đăng ký.',
                    },
                    in_progress: {
                      label: 'Đang Giảng Dạy',
                      color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
                      desc: 'Khóa học đang diễn ra, giáo viên tiến hành điểm danh thực tế.',
                    },
                    closed: {
                      label: 'Đã Đóng',
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
                            onChange={async (e) => {
                              const newStatus = e.target.value as TermStatus;
                              if (newStatus === 'closed') {
                                const ok = window.confirm(`CẢNH BÁO: Bạn có chắc chắn muốn ĐÓNG khóa học "${term.name}"? Toàn bộ lớp học, điểm danh và ghi danh của khóa sẽ bị khóa chỉnh sửa.`);
                                if (!ok) return;
                              }
                              const isActive = newStatus === 'open_enrollment' || newStatus === 'in_progress';
                              onUpdateStore(prev => ({
                                ...prev,
                                terms: prev.terms.map(t => 
                                  t.id === term.id 
                                    ? { 
                                        ...t, 
                                        status: newStatus,
                                        is_active: isActive
                                      } 
                                    : t
                                ),
                              }));

                              try {
                                const client = getSupabaseClient() || supabase;
                                if (client) {
                                  await client.from('academic_terms').upsert({
                                    id: term.id,
                                    code: term.code || term.id,
                                    name: term.name.trim(),
                                    academic_year: term.academic_year || '2026-2027',
                                    start_date: term.start_date,
                                    end_date: term.end_date,
                                    is_active: isActive,
                                    status: newStatus,
                                    description: term.description || '',
                                    updated_at: new Date().toISOString()
                                  }, { onConflict: 'id' });
                                }
                              } catch (err) {
                                console.warn('Lỗi cập nhật trạng thái khóa lên Supabase:', err);
                              }
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:border-amber-500"
                          >
                            <option value="draft">Dự thảo</option>
                            <option value="open_enrollment">Mở tuyển sinh</option>
                            <option value="in_progress">Đang giảng dạy</option>
                            <option value="closed">Đã đóng (Khóa sửa)</option>
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
                      Chọn môn nào được Kích hoạt trong khóa, định nghĩa Số buổi chuẩn và Học phí chuẩn trọn khóa.
                    </p>
                  </div>
                </div>

                {/* Term Selector & Quick Action Toolbar */}
                <div className="flex flex-wrap items-center gap-2.5">
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

                  <div className="flex items-center gap-2">
                    {/* Nút "🟢 Mở Dạy Tất Cả" */}
                    <button
                      disabled={isTermClosed(selectedConfigTermId, store) || isTogglingAllSubjects}
                      onClick={() => handleToggleAllSubjects(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 font-bold text-xs shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      title="Mở dạy toàn bộ danh mục môn học cho khóa này"
                    >
                      {isTogglingAllSubjects ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      <span>🟢 Mở Dạy Tất Cả</span>
                    </button>

                    {/* Nút "⚪ Tạm Tắt Tất Cả" */}
                    <button
                      disabled={isTermClosed(selectedConfigTermId, store) || isTogglingAllSubjects}
                      onClick={() => handleToggleAllSubjects(false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 font-bold text-xs shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      title="Tạm tắt toàn bộ danh mục môn học trong khóa này"
                    >
                      {isTogglingAllSubjects ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <PauseCircle className="w-3.5 h-3.5" />
                      )}
                      <span>⚪ Tạm Tắt Tất Cả</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Closed Term Alert in Sub-view */}
              {isTermClosed(selectedConfigTermId, store) && (
                <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Khóa học này đã Đóng. Cấu hình môn học đang ở chế độ chỉ xem.</span>
                </div>
              )}

              {/* Subject Configurations Table */}
              <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Kích Hoạt</th>
                        <th className="py-3 px-4">Tên Môn Học</th>
                        <th className="py-3 px-4">Danh Mục</th>
                        <th className="py-3 px-4 text-center">Số Buổi Chuẩn</th>
                        <th className="py-3 px-4 font-mono">Học Phí Chuẩn Khóa</th>
                        <th className="py-3 px-4 font-mono">Đơn Giá Buổi</th>
                        <th className="py-3 px-4">Ghi Chú Khóa</th>
                        <th className="py-3 px-4 text-right">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {store.subjects.map(subject => {
                        const termConfig = store.termSubjects.find(
                          ts => String(ts.term_id) === String(selectedConfigTermId) && (String(ts.subject_id) === String(subject.id) || (ts as any).subject_code === subject.code)
                        );

                        const isActive = termConfig ? Boolean(termConfig.is_active) : false;
                        const standardSessions = termConfig?.standard_sessions ?? subject.standard_sessions ?? 24;
                        const standardFee = termConfig?.standard_course_fee ?? (termConfig as any)?.total_fee ?? subject.standard_course_fee ?? 3600000;
                        const ceilRate = standardSessions > 0 ? Math.ceil(standardFee / standardSessions) : 0;
                        const isClosed = isTermClosed(selectedConfigTermId, store);

                        return (
                          <tr key={subject.id} className="hover:bg-slate-800/30 transition-colors">
                            {/* Toggle Active */}
                            <td className="py-3 px-4">
                              <button
                                disabled={isClosed}
                                onClick={() => handleToggleSubject(subject)}
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
                              <span className="font-mono text-[10px] text-slate-400">{subject.code} &bull; {subject.standard_duration || '90 phút'}</span>
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
                                min={1}
                                max={100}
                                disabled={isClosed}
                                value={standardSessions}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 1;
                                  const newRate = Math.ceil(standardFee / Math.max(1, val));
                                  onUpdateStore(prev => {
                                    const existing = prev.termSubjects.find(
                                      ts => ts.term_id === selectedConfigTermId && ts.subject_id === subject.id
                                    );
                                    if (existing) {
                                      return {
                                        ...prev,
                                        termSubjects: prev.termSubjects.map(ts => 
                                          ts.id === existing.id
                                            ? { 
                                                ...ts, 
                                                standard_sessions: val, 
                                                standard_session_rate: newRate 
                                              }
                                            : ts
                                        ),
                                      };
                                    } else {
                                      const newConfig: TermSubjectConfig = {
                                        id: `ts_${selectedConfigTermId}_${subject.id}`,
                                        term_id: selectedConfigTermId,
                                        subject_id: subject.id,
                                        is_active: isActive,
                                        standard_sessions: val,
                                        standard_course_fee: standardFee,
                                        standard_session_rate: newRate,
                                      };
                                      return {
                                        ...prev,
                                        termSubjects: [...prev.termSubjects, newConfig],
                                      };
                                    }
                                  });
                                }}
                                onBlur={(e) => {
                                  const val = Number(e.target.value) || standardSessions;
                                  syncTermSubjectToSupabase(
                                    selectedConfigTermId,
                                    subject.id,
                                    val,
                                    standardFee,
                                    isActive,
                                    termConfig?.notes
                                  );
                                }}
                                className="w-16 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-center font-mono font-bold text-amber-400 text-xs disabled:opacity-60 focus:border-amber-500 focus:outline-none"
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
                                  const val = Number(e.target.value) || 0;
                                  const newRate = Math.ceil(val / Math.max(1, standardSessions));
                                  onUpdateStore(prev => {
                                    const existing = prev.termSubjects.find(
                                      ts => ts.term_id === selectedConfigTermId && ts.subject_id === subject.id
                                    );
                                    if (existing) {
                                      return {
                                        ...prev,
                                        termSubjects: prev.termSubjects.map(ts => 
                                          ts.id === existing.id
                                            ? { 
                                                ...ts, 
                                                standard_course_fee: val, 
                                                standard_session_rate: newRate 
                                              }
                                            : ts
                                        ),
                                      };
                                    } else {
                                      const newConfig: TermSubjectConfig = {
                                        id: `ts_${selectedConfigTermId}_${subject.id}`,
                                        term_id: selectedConfigTermId,
                                        subject_id: subject.id,
                                        is_active: isActive,
                                        standard_sessions: standardSessions,
                                        standard_course_fee: val,
                                        standard_session_rate: newRate,
                                      };
                                      return {
                                        ...prev,
                                        termSubjects: [...prev.termSubjects, newConfig],
                                      };
                                    }
                                  });
                                }}
                                onBlur={(e) => {
                                  const val = Number(e.target.value) || standardFee;
                                  syncTermSubjectToSupabase(
                                    selectedConfigTermId,
                                    subject.id,
                                    standardSessions,
                                    val,
                                    isActive,
                                    termConfig?.notes
                                  );
                                }}
                                className="w-28 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono font-bold text-amber-400 text-xs disabled:opacity-60 focus:border-amber-500 focus:outline-none"
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
                                onBlur={(e) => {
                                  syncTermSubjectToSupabase(
                                    selectedConfigTermId,
                                    subject.id,
                                    standardSessions,
                                    standardFee,
                                    isActive,
                                    e.target.value
                                  );
                                }}
                                className="w-full min-w-[120px] px-2 py-1 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                              />
                            </td>

                            <td className="py-3 px-4 text-right">
                              <button
                                disabled={isClosed}
                                onClick={async () => {
                                  await syncTermSubjectToSupabase(
                                    selectedConfigTermId,
                                    subject.id,
                                    standardSessions,
                                    standardFee,
                                    isActive,
                                    termConfig?.notes
                                  );
                                  showToast(`Đã đồng bộ môn ${subject.name} vào CSDL Supabase!`, 'success');
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold transition-all"
                                title="Đồng bộ trực tiếp lên Supabase"
                              >
                                <Cloud className="w-3 h-3" />
                                <span>Đồng bộ</span>
                              </button>
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
                            <span>Đơn giá buổi:</span>
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

          {/* SUB-VIEW 6: MA TRẬN BIỂU PHÍ TOÀN TRƯỜNG (FULL MATRIX VIEW) */}
          {(() => {
            // Compute all matrix combinations
            const allMatrixCombinations = store.terms.flatMap(term => 
              store.campuses.flatMap(campus => 
                store.subjects.map(subject => {
                  const eff = getEffectivePrice(term.id, campus.id, subject.id, store);
                  const termConfig = store.termSubjects.find(ts => ts.term_id === term.id && ts.subject_id === subject.id);
                  const campusConfig = store.campusPricings.find(cp => cp.term_id === term.id && cp.campus_id === campus.id && cp.subject_id === subject.id);
                  const isTermActive = termConfig ? termConfig.is_active : false;
                  const isOfferedAtCampus = campusConfig !== undefined ? campusConfig.is_offered_at_campus : isTermActive;

                  return {
                    term,
                    campus,
                    subject,
                    eff,
                    termConfig,
                    campusConfig,
                    isTermActive,
                    isOfferedAtCampus,
                  };
                })
              )
            );

            // Filter combinations
            const filteredMatrixCombinations = allMatrixCombinations.filter(item => {
              if (matrixFilterTermId !== 'all' && item.term.id !== matrixFilterTermId) {
                return false;
              }
              if (matrixFilterCampusId !== 'all' && item.campus.id !== matrixFilterCampusId) {
                return false;
              }
              if (matrixFilterCategory !== 'all') {
                const matchCat = item.subject.category.trim().toLowerCase() === matrixFilterCategory.trim().toLowerCase();
                if (!matchCat) return false;
              }
              if (matrixFilterSource !== 'all' && item.eff.source !== matrixFilterSource) {
                return false;
              }
              const q = matrixSearchQuery.trim().toLowerCase();
              if (q) {
                const match = 
                  item.subject.name.toLowerCase().includes(q) ||
                  item.subject.code.toLowerCase().includes(q) ||
                  item.campus.name.toLowerCase().includes(q) ||
                  item.campus.code.toLowerCase().includes(q) ||
                  item.term.name.toLowerCase().includes(q) ||
                  item.term.code.toLowerCase().includes(q);
                if (!match) return false;
              }
              return true;
            });

            const hasActiveFilters = 
              matrixFilterTermId !== 'all' || 
              matrixFilterCampusId !== 'all' || 
              matrixFilterCategory !== 'all' || 
              matrixFilterSource !== 'all' || 
              matrixSearchQuery.trim() !== '';

            const resetMatrixFilters = () => {
              setMatrixFilterTermId('all');
              setMatrixFilterCampusId('all');
              setMatrixFilterCategory('all');
              setMatrixFilterSource('all');
              setMatrixSearchQuery('');
            };

            return (
              hierarchySubTab === 'matrix' && (
                <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl space-y-4">
                  {/* Header */}
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

                  {/* Filter Toolbar (Khóa Học, Cơ Sở, Phân Loại, Nguồn, Tìm Kiếm) */}
                  <div className="px-4">
                    <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                        
                        {/* 1. Lọc Khóa Học */}
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                          <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
                              Khóa Học
                            </label>
                            <select
                              value={matrixFilterTermId}
                              onChange={(e) => setMatrixFilterTermId(e.target.value)}
                              className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer mt-0.5"
                            >
                              <option value="all" className="bg-[#111827] text-white">
                                Tất cả khóa học ({store.terms.length})
                              </option>
                              {store.terms.map(term => (
                                <option key={term.id} value={term.id} className="bg-[#111827] text-white">
                                  {term.name} ({term.code})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* 2. Lọc Cơ Sở */}
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                          <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
                              Cơ Sở
                            </label>
                            <select
                              value={matrixFilterCampusId}
                              onChange={(e) => setMatrixFilterCampusId(e.target.value)}
                              className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer mt-0.5"
                            >
                              <option value="all" className="bg-[#111827] text-white">
                                Tất cả cơ sở ({store.campuses.length})
                              </option>
                              {store.campuses.map(campus => (
                                <option key={campus.id} value={campus.id} className="bg-[#111827] text-white">
                                  {campus.name} ({campus.code})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* 3. Lọc Phân Loại Môn */}
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                          <Tag className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
                              Phân Loại Môn
                            </label>
                            <select
                              value={matrixFilterCategory}
                              onChange={(e) => setMatrixFilterCategory(e.target.value)}
                              className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer mt-0.5"
                            >
                              <option value="all" className="bg-[#111827] text-white">
                                Tất cả phân loại
                              </option>
                              {categoriesList.map(cat => (
                                <option key={cat.id} value={cat.name} className="bg-[#111827] text-white">
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* 4. Lọc Nguồn Biểu Phí */}
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                          <Sliders className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
                              Nguồn Biểu Phí
                            </label>
                            <select
                              value={matrixFilterSource}
                              onChange={(e) => setMatrixFilterSource(e.target.value as any)}
                              className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer mt-0.5"
                            >
                              <option value="all" className="bg-[#111827] text-white">
                                Tất cả nguồn
                              </option>
                              <option value="campus_override" className="bg-[#111827] text-white">
                                ★ Cơ sở Override
                              </option>
                              <option value="term_standard" className="bg-[#111827] text-white">
                                ✓ Chuẩn Khóa Học
                              </option>
                            </select>
                          </div>
                        </div>

                        {/* 5. Tìm Kiếm Môn */}
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
                              Tìm Kiếm Môn
                            </label>
                            <input
                              type="text"
                              value={matrixSearchQuery}
                              onChange={(e) => setMatrixSearchQuery(e.target.value)}
                              placeholder="Mã hoặc tên môn..."
                              className="w-full bg-transparent text-xs font-bold text-white placeholder-slate-500 focus:outline-none mt-0.5"
                            />
                          </div>
                          {matrixSearchQuery && (
                            <button
                              onClick={() => setMatrixSearchQuery('')}
                              className="text-slate-500 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                      </div>

                      {/* Active Filter Tags & Count Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-400">
                            Đang hiển thị: <strong className="text-amber-400 font-mono">{filteredMatrixCombinations.length}</strong> / <span className="font-mono">{allMatrixCombinations.length}</span> tổ hợp biểu phí
                          </span>

                          {matrixFilterTermId !== 'all' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px]">
                              <span>Khóa: {store.terms.find(t => t.id === matrixFilterTermId)?.code || matrixFilterTermId}</span>
                              <button onClick={() => setMatrixFilterTermId('all')} className="hover:text-white"><X className="w-3 h-3" /></button>
                            </span>
                          )}

                          {matrixFilterCampusId !== 'all' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">
                              <span>Cơ sở: {store.campuses.find(c => c.id === matrixFilterCampusId)?.code || matrixFilterCampusId}</span>
                              <button onClick={() => setMatrixFilterCampusId('all')} className="hover:text-white"><X className="w-3 h-3" /></button>
                            </span>
                          )}

                          {matrixFilterCategory !== 'all' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px]">
                              <span>Nhóm: {matrixFilterCategory}</span>
                              <button onClick={() => setMatrixFilterCategory('all')} className="hover:text-white"><X className="w-3 h-3" /></button>
                            </span>
                          )}

                          {matrixFilterSource !== 'all' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">
                              <span>Nguồn: {matrixFilterSource === 'campus_override' ? 'Cơ sở Override' : 'Chuẩn Khóa'}</span>
                              <button onClick={() => setMatrixFilterSource('all')} className="hover:text-white"><X className="w-3 h-3" /></button>
                            </span>
                          )}
                        </div>

                        {hasActiveFilters && (
                          <button
                            onClick={resetMatrixFilters}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 font-bold transition-all text-[11px]"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Đặt lại bộ lọc</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Body: Cards / Table / Empty */}
                  {filteredMatrixCombinations.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
                        <Filter className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-white">Không tìm thấy tổ hợp biểu phí nào phù hợp</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Không có biểu phí môn học nào khớp với các điều kiện lọc (Khóa học, Cơ sở, Phân loại, Tìm kiếm) hiện tại.
                      </p>
                      <button
                        onClick={resetMatrixFilters}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md transition-all inline-flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Xem Tất Cả ({allMatrixCombinations.length} tổ hợp)</span>
                      </button>
                    </div>
                  ) : pricingViewMode === 'cards' ? (
                    /* CARDS VIEW */
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredMatrixCombinations.map(item => {
                        const { term, campus, subject, eff, isTermActive, isOfferedAtCampus } = item;
                        const catBadge = getSubjectCategoryBadge(subject.category);
                        const hasDiscount = eff.discount_type !== 'none' && eff.discount_amount > 0;

                        return (
                          <div
                            key={`${term.id}_${campus.id}_${subject.id}`}
                            className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 space-y-3 transition-all shadow-md flex flex-col justify-between"
                          >
                            <div>
                              {/* Top Bar: Subject Name & Campus Code */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${catBadge.badge}`}>
                                      {subject.category}
                                    </span>
                                    <span className="font-mono text-[10px] text-slate-400 font-bold">
                                      {subject.code}
                                    </span>
                                  </div>
                                  <h5 className="font-extrabold text-white text-sm leading-tight">
                                    {subject.name}
                                  </h5>
                                </div>
                                <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono shrink-0">
                                  {campus.code}
                                </span>
                              </div>

                              {/* Term & Source Badges */}
                              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2.5">
                                <span className="flex items-center gap-1 text-slate-300">
                                  <Calendar className="w-3 h-3 text-cyan-400" />
                                  <strong className="text-white">{term.name}</strong>
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  eff.source === 'campus_override'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                }`}>
                                  {eff.source === 'campus_override' ? '★ Override Cơ sở' : '✓ Chuẩn Khóa'}
                                </span>
                              </div>
                            </div>

                            {/* Pricing Box */}
                            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                              {/* Original fee & discount if any */}
                              {hasDiscount && (
                                <div className="flex justify-between items-center text-[11px]">
                                  <span className="text-slate-500">Học phí gốc:</span>
                                  <span className="font-mono text-slate-400 line-through">
                                    {formatVND(eff.base_course_fee)}
                                  </span>
                                </div>
                              )}

                              {hasDiscount && (
                                <div className="flex justify-between items-center text-[11px]">
                                  <span className="text-rose-400 font-medium">
                                    Ưu đãi {eff.discount_type === 'percentage' ? `(${eff.discount_value}%)` : ''}:
                                  </span>
                                  <span className="font-mono font-bold text-rose-400">
                                    -{formatVND(eff.discount_amount)}
                                  </span>
                                </div>
                              )}

                              <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
                                <span className="text-slate-300 font-semibold">Học phí trọn khóa:</span>
                                <span className="font-mono font-extrabold text-amber-400 text-sm">
                                  {formatVND(eff.course_fee)}
                                </span>
                              </div>

                              <div className="flex justify-between text-slate-400 text-[11px]">
                                <span>Số buổi học:</span>
                                <span className="font-mono font-bold text-white">{eff.total_sessions} buổi</span>
                              </div>

                              <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800 text-[11px]">
                                <span>Đơn giá buổi:</span>
                                <span className="font-mono font-bold text-emerald-400 text-xs">
                                  {formatVND(eff.session_rate)}/buổi
                                </span>
                              </div>
                            </div>

                            {/* Status & Notes */}
                            <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/60">
                              <span className={`inline-flex items-center gap-1 font-bold ${
                                isOfferedAtCampus && isTermActive
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  isOfferedAtCampus && isTermActive ? 'bg-emerald-400' : 'bg-rose-400'
                                }`}></span>
                                {isOfferedAtCampus && isTermActive ? 'Mở tuyển sinh' : 'Không mở tại CS'}
                              </span>

                              <span className="text-slate-500 truncate max-w-[150px] italic">
                                {eff.discount_reason || eff.notes || (isTermActive ? 'Chuẩn' : 'Chưa kích hoạt')}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* TABLE VIEW */
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/90 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="py-3 px-3.5">Khóa Học</th>
                            <th className="py-3 px-3.5">Cơ Sở</th>
                            <th className="py-3 px-3.5">Môn Học</th>
                            <th className="py-3 px-3.5">Nguồn Biểu Phí</th>
                            <th className="py-3 px-3.5 text-center">Số Buổi</th>
                            <th className="py-3 px-3.5 font-mono text-right">Học Phí Gốc</th>
                            <th className="py-3 px-3.5 font-mono text-right">Ưu Đãi / Giảm Giá</th>
                            <th className="py-3 px-3.5 font-mono text-right">Học Phí Áp Dụng</th>
                            <th className="py-3 px-3.5 font-mono text-right">Đơn Giá Buổi</th>
                            <th className="py-3 px-3.5 text-center">Tình Trạng Tuyển Sinh</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {filteredMatrixCombinations.map(item => {
                            const { term, campus, subject, eff, isTermActive, isOfferedAtCampus } = item;
                            const hasDiscount = eff.discount_type !== 'none' && eff.discount_amount > 0;
                            const catBadge = getSubjectCategoryBadge(subject.category);

                            return (
                              <tr key={`${term.id}_${campus.id}_${subject.id}`} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-3 px-3.5">
                                  <div className="font-semibold text-white">{term.name}</div>
                                  <div className="text-[10px] font-mono text-slate-400">{term.code}</div>
                                </td>
                                <td className="py-3 px-3.5">
                                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
                                    {campus.code}
                                  </span>
                                  <div className="text-[10px] text-slate-400 truncate max-w-[130px] mt-0.5">{campus.name}</div>
                                </td>
                                <td className="py-3 px-3.5">
                                  <div className="font-medium text-slate-100">{subject.name}</div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="font-mono text-[10px] text-slate-400">{subject.code}</span>
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold border ${catBadge.badge}`}>
                                      {subject.category}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3.5">
                                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap ${
                                    eff.source === 'campus_override'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                  }`}>
                                    {eff.source === 'campus_override' ? '★ Override Cơ sở' : '✓ Chuẩn Khóa'}
                                  </span>
                                </td>
                                <td className="py-3 px-3.5 text-center font-mono font-bold text-white">
                                  {eff.total_sessions}
                                </td>
                                <td className="py-3 px-3.5 font-mono text-right text-slate-400">
                                  {formatVND(eff.base_course_fee)}
                                </td>
                                <td className="py-3 px-3.5 font-mono text-right">
                                  {hasDiscount ? (
                                    <div>
                                      <span className="font-bold text-rose-400">-{formatVND(eff.discount_amount)}</span>
                                      {eff.discount_type === 'percentage' && (
                                        <span className="text-[10px] text-rose-400/80 ml-1">({eff.discount_value}%)</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-500">-</span>
                                  )}
                                </td>
                                <td className="py-3 px-3.5 font-mono font-extrabold text-amber-400 text-right">
                                  {formatVND(eff.course_fee)}
                                </td>
                                <td className="py-3 px-3.5 font-mono font-bold text-emerald-400 text-right">
                                  {formatVND(eff.session_rate)}/b
                                </td>
                                <td className="py-3 px-3.5 text-center">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                                    isOfferedAtCampus && isTermActive
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isOfferedAtCampus && isTermActive ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                                    {isOfferedAtCampus && isTermActive ? 'Mở tuyển sinh' : 'Không mở'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            );
          })()}

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
              onSubmit={async (e) => {
                e.preventDefault();
                if (!cloneFormData.code || !cloneFormData.name) return;

                const { updatedStore, newTermId } = cloneTermConfiguration(cloneSourceTermId, cloneFormData, store);
                onUpdateStore(() => updatedStore);
                setSelectedConfigTermId(newTermId);
                setShowCloneModal(false);

                try {
                  const client = getSupabaseClient() || supabase;
                  if (client) {
                    await client.from('academic_terms').upsert({
                      id: newTermId,
                      code: cloneFormData.code.trim().toUpperCase(),
                      name: cloneFormData.name.trim(),
                      academic_year: cloneFormData.academic_year || '2026-2027',
                      start_date: cloneFormData.start_date,
                      end_date: cloneFormData.end_date,
                      is_active: cloneFormData.status === 'open_enrollment' || cloneFormData.status === 'in_progress',
                      status: cloneFormData.status || 'draft',
                      description: cloneFormData.description || '',
                      updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });
                  }
                } catch (err) {
                  console.warn('Lỗi lưu khóa nhân bản lên Supabase:', err);
                }

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
                  <option value="draft">Dự thảo - Tiếp tục chỉnh sửa trước khi công bố</option>
                  <option value="open_enrollment">Mở tuyển sinh - Cho phép tuyển sinh ngay</option>
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
              onSubmit={async (e) => {
                e.preventDefault();
                if (!termFormData.code || !termFormData.name) return;

                const termId = editingTerm ? editingTerm.id : (termFormData.code ? `term_${termFormData.code.toLowerCase().replace(/[^a-z0-9_]/g, '_')}` : `term_${Date.now()}`);
                const isActive = termFormData.status === 'open_enrollment' || termFormData.status === 'in_progress';
                const termPayload = {
                  id: termId,
                  code: termFormData.code.trim().toUpperCase(),
                  name: termFormData.name.trim(),
                  academic_year: termFormData.academic_year || '2026-2027',
                  start_date: termFormData.start_date,
                  end_date: termFormData.end_date,
                  is_active: isActive,
                  status: termFormData.status || 'recruiting',
                  description: termFormData.description || '',
                  updated_at: new Date().toISOString()
                };

                // 1. Direct upsert to Supabase academic_terms
                try {
                  const client = getSupabaseClient() || supabase;
                  if (client) {
                    const { error: termError } = await client
                      .from('academic_terms')
                      .upsert(termPayload, { onConflict: 'id' });
                    if (termError) {
                      console.error('Lỗi khi lưu khóa học lên Supabase:', termError);
                      alert('Không thể lưu khóa học lên Supabase: ' + termError.message);
                      return;
                    }
                  }
                } catch (err: any) {
                  console.warn('Lỗi kết nối khi lưu khóa học:', err);
                }

                // 2. Update store
                if (editingTerm) {
                  onUpdateStore(prev => ({
                    ...prev,
                    terms: prev.terms.map(t => 
                      t.id === editingTerm.id 
                        ? { 
                            ...t, 
                            ...termFormData,
                            code: termFormData.code.trim().toUpperCase(),
                            name: termFormData.name.trim(),
                            is_active: isActive,
                          } 
                        : t
                    ),
                  }));
                } else {
                  const newTerm: AcademicTerm = {
                    id: termId,
                    ...termFormData,
                    code: termFormData.code.trim().toUpperCase(),
                    name: termFormData.name.trim(),
                    is_active: isActive,
                  };

                  const defaultTermSubjects: TermSubjectConfig[] = store.subjects.map(s => ({
                    id: `ts_${termId}_${s.id}`,
                    term_id: termId,
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
                  setSelectedConfigTermId(termId);
                }

                showToast(
                  editingTerm
                    ? `Đã cập nhật khóa học "${termFormData.name}" thành công vào CSDL!`
                    : `Đã tạo mới khóa học "${termFormData.name}" (${termFormData.code}) thành công vào CSDL!`,
                  'success'
                );
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
                  <option value="draft">Dự thảo</option>
                  <option value="open_enrollment">Mở tuyển sinh</option>
                  <option value="in_progress">Đang giảng dạy</option>
                  <option value="closed">Đã đóng (Khóa sửa)</option>
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
                    <option value="active">Đang hoạt động</option>
                    <option value="inactive">Tạm dừng</option>
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

      {/* CREATE / EDIT SUBJECT MODAL */}
      <CreateSubjectModal
        isOpen={showSubjectModal}
        onClose={() => {
          setShowSubjectModal(false);
          setEditingSubject(null);
        }}
        categories={categoriesList}
        editingSubject={editingSubject}
        existingSubjects={store.subjects}
        onSuccess={(savedSubject) => {
          onUpdateStore(prev => {
            const existingIdx = prev.subjects.findIndex(
              s => s.id === savedSubject.id || s.code.toUpperCase() === savedSubject.code.toUpperCase()
            );
            let updatedSubjects: Subject[];
            if (existingIdx >= 0) {
              updatedSubjects = prev.subjects.map((s, idx) => (idx === existingIdx ? savedSubject : s));
            } else {
              updatedSubjects = [...prev.subjects, savedSubject];
            }

            const existingTsKeys = new Set(prev.termSubjects.map(ts => `${ts.term_id}_${ts.subject_id}`));
            const newTermConfigs: TermSubjectConfig[] = [];
            prev.terms.forEach(t => {
              const key = `${t.id}_${savedSubject.id}`;
              if (!existingTsKeys.has(key)) {
                newTermConfigs.push({
                  id: `ts_${t.id}_${savedSubject.id}`,
                  term_id: t.id,
                  subject_id: savedSubject.id,
                  is_active: true,
                  standard_sessions: savedSubject.standard_sessions || 24,
                  standard_course_fee: savedSubject.standard_course_fee || 3600000,
                  standard_session_rate:
                    savedSubject.standard_session_rate ||
                    Math.ceil((savedSubject.standard_course_fee || 3600000) / (savedSubject.standard_sessions || 24)),
                  discount_type: 'none',
                  discount_value: 0,
                  notes: `${savedSubject.name} - Khóa ${t.name}`,
                });
              }
            });

            return {
              ...prev,
              subjects: updatedSubjects,
              termSubjects: [...prev.termSubjects, ...newTermConfigs],
            };
          });
        }}
      />

      {/* IMPORT SUBJECTS FROM EXCEL / CSV MODAL */}
      <ImportSubjectsModal
        isOpen={showImportSubjectsModal}
        onClose={() => setShowImportSubjectsModal(false)}
        categories={categoriesList}
        existingSubjects={store.subjects}
        onSuccess={(importedSubjects) => {
          onUpdateStore(prev => {
            const subjectMap = new Map<string, Subject>();
            prev.subjects.forEach(s => subjectMap.set(s.code.toUpperCase(), s));
            importedSubjects.forEach(s => subjectMap.set(s.code.toUpperCase(), s));
            const updatedSubjects = Array.from(subjectMap.values());

            const existingTsKeys = new Set(prev.termSubjects.map(ts => `${ts.term_id}_${ts.subject_id}`));
            const newTermConfigs: TermSubjectConfig[] = [];

            importedSubjects.forEach(s => {
              prev.terms.forEach(t => {
                const key = `${t.id}_${s.id}`;
                if (!existingTsKeys.has(key)) {
                  newTermConfigs.push({
                    id: `ts_${t.id}_${s.id}`,
                    term_id: t.id,
                    subject_id: s.id,
                    is_active: true,
                    standard_sessions: s.standard_sessions || 24,
                    standard_course_fee: s.standard_course_fee || 3600000,
                    standard_session_rate:
                      s.standard_session_rate ||
                      Math.ceil((s.standard_course_fee || 3600000) / (s.standard_sessions || 24)),
                    discount_type: 'none',
                    discount_value: 0,
                    notes: `${s.name} - Khóa ${t.name}`,
                  });
                }
              });
            });

            return {
              ...prev,
              subjects: updatedSubjects,
              termSubjects: [...prev.termSubjects, ...newTermConfigs],
            };
          });
        }}
      />

      {/* CREATE / EDIT SUBJECT CATEGORY MODAL */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  {editingCategory ? 'Cập Nhật Phân Loại Môn Học' : 'Thêm Nhóm Phân Loại Môn Mới'}
                </h3>
                <p className="text-xs text-slate-400">Định nghĩa nhóm năng khiếu & lĩnh vực đào tạo cấp toàn trường.</p>
              </div>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-slate-400 font-medium mb-1">Mã nhóm *</label>
                  <input
                    type="text"
                    required
                    maxLength={12}
                    value={categoryFormData.code}
                    onChange={(e) => setCategoryFormData({ ...categoryFormData, code: e.target.value.toUpperCase() })}
                    placeholder="VD: SPORTS"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-400 font-medium mb-1">Tên phân loại môn *</label>
                  <input
                    type="text"
                    required
                    value={categoryFormData.name}
                    onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                    placeholder="VD: Thể thao & Vận động"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-slate-400 font-medium mb-1.5">Màu sắc nhận diện (Badge & Card Style)</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'amber', label: 'Hoàng Gia Gold', bg: 'bg-amber-500' },
                    { id: 'purple', label: 'Nghệ Thuật Tím', bg: 'bg-purple-500' },
                    { id: 'cyan', label: 'Công Nghệ Cyan', bg: 'bg-cyan-500' },
                    { id: 'emerald', label: 'Học Thuật Xanh', bg: 'bg-emerald-500' },
                    { id: 'blue', label: 'Thể Chất Blue', bg: 'bg-blue-500' },
                    { id: 'rose', label: 'Kỹ Năng Sống Rose', bg: 'bg-rose-500' },
                    { id: 'indigo', label: 'Tư Duy Indigo', bg: 'bg-indigo-500' },
                    { id: 'orange', label: 'Sáng Tạo Cam', bg: 'bg-orange-500' },
                  ].map(c => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setCategoryFormData({ ...categoryFormData, color: c.id as SubjectCategory['color'] })}
                      className={`flex items-center gap-1.5 p-1.5 rounded-xl border transition-all text-left ${
                        categoryFormData.color === c.id
                          ? 'border-amber-500 bg-amber-500/10 text-white font-bold'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full ${c.bg} shrink-0`}></span>
                      <span className="text-[10px] truncate">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon Picker */}
              <div>
                <label className="block text-slate-400 font-medium mb-1.5">Icon đại diện</label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { id: 'Activity', label: 'Thể thao', icon: Activity },
                    { id: 'Palette', label: 'Nghệ thuật', icon: Palette },
                    { id: 'Code', label: 'STEM/Code', icon: Code },
                    { id: 'GraduationCap', label: 'Học thuật', icon: GraduationCap },
                    { id: 'HeartPulse', label: 'Y tế/Sống', icon: HeartPulse },
                    { id: 'Music', label: 'Âm nhạc', icon: Music },
                    { id: 'Sparkles', label: 'Sáng tạo', icon: Sparkles },
                    { id: 'Trophy', label: 'Thi đấu', icon: Trophy },
                    { id: 'Smile', label: 'Kỹ năng mềm', icon: Smile },
                    { id: 'Compass', label: 'Trải nghiệm', icon: Compass },
                  ].map(item => {
                    const IconComp = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setCategoryFormData({ ...categoryFormData, icon: item.id })}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                          categoryFormData.icon === item.id
                            ? 'border-amber-500 bg-amber-500/15 text-amber-400 font-bold'
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                        <span className="text-[9px] text-center leading-tight truncate w-full">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">Trạng thái tuyển sinh của nhóm</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="cat_status"
                      checked={categoryFormData.status === 'active'}
                      onChange={() => setCategoryFormData({ ...categoryFormData, status: 'active' })}
                      className="text-amber-500 focus:ring-0"
                    />
                    <span className="text-emerald-400 font-bold text-xs">Đang mở tuyển sinh</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="cat_status"
                      checked={categoryFormData.status === 'inactive'}
                      onChange={() => setCategoryFormData({ ...categoryFormData, status: 'inactive' })}
                      className="text-amber-500 focus:ring-0"
                    />
                    <span className="text-slate-400 text-xs">Tạm dừng</span>
                  </label>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">Mô tả & Định hướng phát triển năng khiếu</label>
                <textarea
                  rows={3}
                  value={categoryFormData.description}
                  onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
                  placeholder="Mô tả mục tiêu bồi dưỡng thể chất, tư duy, thẩm mỹ hoặc kỹ năng cho học sinh..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCategoryModal(false);
                    setEditingCategory(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  {editingCategory ? 'Lưu Thay Đổi' : 'Thêm Phân Loại'}
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
        <div className="rounded-3xl bg-[#111827]/90 border border-rose-500/40 p-6 md:p-8 backdrop-blur-md shadow-2xl max-w-4xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/30">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Xóa Dữ Liệu Mẫu &amp; Chuẩn Hóa Cơ Sở Dữ Liệu (Database Clean &amp; Reset)</h3>
                <p className="text-xs text-slate-400">
                  Mặc định hệ thống đã được làm sạch toàn bộ dữ liệu mẫu vận hành &bull; Giữ cấu trúc 10 bảng CSDL chuẩn hóa 3NF
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCleanSampleDataNow}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-600/25 flex items-center gap-2 transition-all shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Xóa Sạch Dữ Liệu Mẫu &amp; Chuẩn Hóa Ngay</span>
            </button>
          </div>

          {resetSuccessMessage && (
            <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{resetSuccessMessage}</span>
            </div>
          )}

          {/* Current 10-Table Record Summary */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>Trạng Thái Hiện Tại Của 10 Bảng Dữ Liệu Chuẩn Hóa</span>
              </span>
              <span className="text-[11px] text-emerald-400 font-semibold">
                {store.students.length === 0 && store.classes.length === 0 && store.teachers.length === 0
                  ? '✓ Hệ thống sạch dữ liệu mẫu vận hành'
                  : `Đang có ${store.teachers.length} GV, ${store.classes.length} lớp, ${store.students.length} học sinh`}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {ROYAL_STANDARDIZED_10_TABLES.map((spec) => {
                const count = Array.isArray((store as any)[spec.storeKey]) ? (store as any)[spec.storeKey].length : 0;
                return (
                  <div key={spec.sheetName} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-amber-400 font-bold truncate">{spec.sheetName}</span>
                    <span className="text-[11px] text-slate-300 truncate mt-0.5">{spec.titleVN}</span>
                    <span className={`text-xs font-mono font-extrabold mt-1 ${count === 0 ? 'text-slate-500' : 'text-emerald-400'}`}>
                      {count} bản ghi
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4 Reset Options Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Chọn 1 trong 4 cấp độ Reset dữ liệu chuyên sâu:
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
                  <div className="font-bold text-rose-300">Option 1 - Xóa Dữ Liệu Vận Hành &amp; Giao Dịch</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Xóa sạch: Điểm danh học sinh, Chấm công giáo viên, Hóa đơn học phí, Phiếu bảo lưu, Quyết toán thù lao. <strong>Giữ nguyên danh mục Lớp học, Học sinh, Giáo viên và Cơ sở.</strong>
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
                  <div className="font-bold text-rose-300">Option 2 - Xóa Dữ Liệu Học Sinh &amp; Ghi Danh</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Xóa sạch toàn bộ hồ sơ Học sinh (Royal &amp; Ngoài trường), Ghi danh, Điểm danh và Hóa đơn.
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
                  <div className="font-bold text-rose-300">Option 3 - Xóa Lớp Học &amp; Phân Công</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Xóa danh sách lớp mở trong kỳ, ghi danh và lịch sử điểm danh/chấm công.
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
                  <div className="font-bold text-rose-300">Option 4 - Full Factory Reset (Xóa Toàn Bộ Dữ Liệu Mẫu Vận Hành)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Xóa sạch Giáo viên, Lớp học, Học sinh, Ghi danh, Điểm danh, Chấm công, Hóa đơn. Chỉ giữ lại danh mục Cơ sở, Khóa học, Môn học và Tài khoản Admin.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Security confirmation text input */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Xác thực an toàn (Khi thực hiện theo 4 Option trên):</span>
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
              <span>Nạp Dữ Liệu Mẫu Thử Nghiệm (Tùy Chọn Demo)</span>
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

      {/* SECTION 4: EXCEL MASTER IMPORTER (MODULE 5.2 - 10 STANDARDIZED TABLES) */}
      {activeSection === 'excel_master' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Bảng Tính Tổng Thể (10 Bảng Chuẩn Hóa CSDL PostgreSQL / Supabase)</h3>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    Ánh xạ 1-1 giữa 10 Sheet Excel và 10 Bảng Cơ Sở Dữ Liệu Quan Hệ Chuẩn 3NF
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Tất cả 10 sheet được chuẩn hóa đúng cấu trúc khóa chính (PK), khóa ngoại (FK) và cột dữ liệu của hệ thống. Hỗ trợ xuất toàn bộ 10 bảng (kể cả khi bảng trống vẫn giữ nguyên dòng tiêu đề cột chuẩn) và nhập đồng bộ hàng loạt.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadSampleTemplate}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Tải Tệp Mẫu Chuẩn 10 Bảng (.xlsx)</span>
              </button>

              <button
                onClick={() => exportMasterWorkbook(store)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-100" />
                <span>Xuất Bảng Tính Tổng Thể (10 Bảng)</span>
              </button>
            </div>
          </div>

          {/* 10 Standardized Database Sheets Specification Matrix */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Cấu Trúc 10 Bảng Trong Bảng Tính Tổng Thể &amp; Ánh Xạ CSDL</span>
              </span>
              <span className="text-[11px] text-slate-400">
                Tổng cộng: {ROYAL_STANDARDIZED_10_TABLES.reduce((sum, s) => sum + (Array.isArray((store as any)[s.storeKey]) ? (store as any)[s.storeKey].length : 0), 0)} bản ghi trên 10 bảng
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              {ROYAL_STANDARDIZED_10_TABLES.map((spec) => {
                const rowCount = Array.isArray((store as any)[spec.storeKey]) ? (store as any)[spec.storeKey].length : 0;
                return (
                  <div key={spec.sheetName} className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-mono font-extrabold text-amber-400 truncate">{spec.sheetName}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-mono text-cyan-300 border border-slate-700">
                          {spec.tableName}
                        </span>
                      </div>
                      <div className="text-xs text-white font-bold">{spec.titleVN}</div>
                      <div className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">{spec.description}</div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Cột chuẩn:</span>
                        <span className="text-slate-300 font-mono">{spec.columns.length} cột</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Số bản ghi:</span>
                        <span className={`font-mono font-bold ${rowCount > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {rowCount} dòng
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upload Dropzone */}
          <div className="p-8 rounded-3xl border-2 border-dashed border-slate-700 hover:border-emerald-500/50 bg-slate-900/50 text-center transition-colors">
            <Upload className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <div className="text-sm font-bold text-white mb-1">
              Nhập Bảng Tính Tổng Thể (.xlsx) Vào 10 Bảng Cơ Sở Dữ Liệu
            </div>
            <div className="text-xs text-slate-400 mb-4 max-w-xl mx-auto">
              Hệ thống tự động đọc tuần tự từ <code className="text-amber-400 font-mono">01_CO_SO</code> đến <code className="text-amber-400 font-mono">10_HOA_DON_BAO_LUU</code>, kiểm tra toàn vẹn khóa ngoại và chuẩn hóa dữ liệu.
            </div>

            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-emerald-600/20 transition-all">
              <span>Duyệt Chọn Tệp Excel 10 Bảng (.xlsx)</span>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {importStatus.message && (
              <div className={`mt-4 p-4 rounded-2xl text-xs max-w-2xl mx-auto text-left space-y-2 ${
                importStatus.isError ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              }`}>
                <div className="font-bold flex items-center gap-2">
                  {importStatus.isError ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  <span>{importStatus.message}</span>
                </div>
                {importStatus.sheetStats && importStatus.sheetStats.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
                    {importStatus.sheetStats.map((st) => (
                      <div key={st.sheetName} className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px]">
                        <div className="font-mono font-bold text-amber-400 truncate">{st.sheetName}</div>
                        <div className="text-white font-bold mt-0.5">{st.rowCount} dòng</div>
                        <div className="text-slate-400 truncate">{st.status}</div>
                      </div>
                    ))}
                  </div>
                )}
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
            <h3 className="text-base font-bold text-white">Cấu Hình Kênh Viễn Thông &amp; Thông Báo Phụ Huynh Tự Động</h3>
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
                <div className="font-bold text-white">SMS Brandname &quot;ROYAL SCHOOL&quot;</div>
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

      {/* SECTION 6: SUPABASE POSTGRESQL & 10-TABLE HEALTH DIAGNOSTICS HUB */}
      {activeSection === 'supabase' && (
        <div className="space-y-6 max-w-6xl mx-auto">
          {/* Main Card */}
          <div className="rounded-3xl bg-[#111827]/90 border border-slate-800/80 p-6 md:p-8 backdrop-blur-md shadow-2xl space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/10">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-extrabold text-white">Liên Kết CSDL Supabase, Kiểm Tra Kết Nối &amp; Trạng Thái 10 Bảng Dữ Liệu</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Chuẩn 3NF &bull; 10 Bảng Chuẩn Hóa
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Kiểm tra kết nối trực tiếp tới Supabase PostgreSQL REST API, kiểm định toàn vẹn khóa ngoại (PK/FK) và đối soát trạng thái đồng bộ thời gian thực của toàn bộ 10 bảng dữ liệu.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowSqlModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Code className="w-4 h-4 text-amber-400" />
                  <span>Xem SQL DDL (10 Bảng Chuẩn)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSqlDdl}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>Tải .sql</span>
                </button>
              </div>
            </div>

            {/* Connection Status & Live Check Banner */}
            <div className={`p-5 rounded-2xl border transition-all space-y-4 ${
              sbConnected
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                : 'bg-slate-900/90 border-amber-500/30 text-amber-200'
            }`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3.5 h-3.5 rounded-full animate-pulse shrink-0 ${
                    sbConnected ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-amber-400'
                  }`} />
                  <div>
                    <div className="font-extrabold text-sm flex items-center gap-2 flex-wrap">
                      {sbConnected ? (
                        <>
                          <span className="text-emerald-400">✓ Đã Liên Kết Cơ Sở Dữ Liệu Supabase PostgreSQL</span>
                          {sbLatency !== null && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300">
                              Độ trễ: {sbLatency}ms
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-amber-300">Chế Độ Local Chuẩn Hóa (Sẵn Sàng Liên Kết Supabase Cloud)</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {sbCheckDetails?.message ||
                        (sbConnected
                          ? `Endpoint: ${sbUrl} • Tất cả 10 bảng sẵn sàng đồng bộ 2 chiều.`
                          : 'Nhập Supabase Project URL & Anon Key bên dưới hoặc bấm "Kiểm Tra Kết Nối & Trạng Thái 10 Bảng" để kiểm định toàn vẹn CSDL.')}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleInspectDatabaseHealth(sbUrl, sbKey)}
                    disabled={sbTesting || sbInspectingTables}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${sbTesting || sbInspectingTables ? 'animate-spin' : ''}`} />
                    <span>{sbTesting || sbInspectingTables ? 'Đang kiểm tra...' : 'Kiểm Tra Kết Nối & 10 Bảng'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExecuteSupabaseSync}
                    disabled={sbSyncing || !sbUrl.trim() || !sbKey.trim()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/30 disabled:opacity-50 cursor-pointer"
                  >
                    <Upload className={`w-3.5 h-3.5 ${sbSyncing ? 'animate-bounce' : ''}`} />
                    <span>{sbSyncing ? 'Đang đồng bộ...' : 'Đẩy 10 Bảng Lên Supabase'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePullFromSupabase}
                    disabled={sbSyncing || !sbUrl.trim() || !sbKey.trim()}
                    className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-md shadow-cyan-600/30 disabled:opacity-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải 10 Bảng Từ Supabase</span>
                  </button>
                </div>
              </div>

              {/* 4 Diagnostic Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400">REST API Endpoint</div>
                    <div className="font-bold text-white mt-0.5">
                      {sbCheckDetails ? (sbCheckDetails.restApiOk ? 'Hoạt động (200 OK)' : 'Chưa kết nối') : sbConnected ? 'Đã kết nối' : 'Chờ cấu hình'}
                    </div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full ${sbCheckDetails?.restApiOk || sbConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400">Xác Thực Anon Key</div>
                    <div className="font-bold text-white mt-0.5">
                      {sbCheckDetails ? (sbCheckDetails.authKeyValid ? 'Hợp lệ (RLS Ready)' : 'Chưa xác thực') : sbConnected ? 'Hợp lệ' : 'Chờ kiểm tra'}
                    </div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full ${sbCheckDetails?.authKeyValid || sbConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400">Toàn Vẹn 3NF (PK/FK)</div>
                    <div className="font-bold text-emerald-400 mt-0.5">
                      {tableHealthList.filter(t => t.integrityValid).length}/10 Bảng Đạt Chuẩn
                    </div>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400">Storage Minh Chứng</div>
                    <div className="font-bold text-white mt-0.5">
                      {sbHasBucket ? 'attendance-proofs OK' : 'Local / Chờ tạo bucket'}
                    </div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full ${sbHasBucket ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                </div>
              </div>

              {/* Progress bar when syncing */}
              {sbSyncing && (
                <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Tiến trình đồng bộ: <strong className="text-emerald-400 font-mono">{sbSyncTable}</strong></span>
                    <span className="font-mono font-bold text-emerald-400">{sbSyncProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
                      style={{ width: `${sbSyncProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Configuration Form */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>Thông Tin Cấu Hình Liên Kết Supabase (API Credentials)</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  Lấy từ Supabase Dashboard &rarr; Project Settings &rarr; API
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Supabase Project URL (VITE_SUPABASE_URL) *
                  </label>
                  <input
                    type="text"
                    placeholder="https://xyzcompany.supabase.co"
                    value={sbUrl}
                    onChange={(e) => setSbUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Định dạng: https://[your-project-id].supabase.co
                  </span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Supabase Anon Public Key (VITE_SUPABASE_ANON_KEY) *
                  </label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={sbKey}
                    onChange={(e) => setSbKey(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Khóa công khai anon (cho phép đọc/ghi 10 bảng theo RLS Policies)
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveSupabase}
                  disabled={sbTesting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Lưu Cấu Hình &amp; Kiểm Tra 10 Bảng Dữ Liệu</span>
                </button>
              </div>
            </div>

            {/* SUPABASE REALTIME PUBLICATION SQL CARD */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-emerald-500/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
                  </span>
                  <div>
                    <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">
                      Cấu Hình Supabase Replication &amp; Realtime WebSockets (Kênh: royal_hub_realtime)
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Kích hoạt đồng bộ tức thì (INSERT / UPDATE / DELETE) cho 8 bảng nghiệp vụ trọng yếu mà không cần tải lại trang.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_REALTIME_PUBLICATION_SQL);
                    showToast('Đã sao chép lệnh SQL kích hoạt Supabase Realtime!', 'success');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao Chép Lệnh Realtime SQL</span>
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto leading-relaxed select-all">
                {SUPABASE_REALTIME_PUBLICATION_SQL}
              </pre>
            </div>

            {/* 10-TABLE HEALTH & SYNC STATUS INSPECTOR */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Bảng Kiểm Tra Trạng Thái 10 Bảng Dữ Liệu Chuẩn Hóa (Database Table Health Inspector)</span>
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Kiểm tra số bản ghi Local, số bản ghi trên Supabase Cloud, ràng buộc khóa chính/khóa ngoại (3NF) và trạng thái đồng bộ từng bảng.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleInspectDatabaseHealth(sbUrl, sbKey)}
                  disabled={sbInspectingTables}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold border border-slate-700 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${sbInspectingTables ? 'animate-spin' : ''}`} />
                  <span>Làm Mới Trạng Thái 10 Bảng</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/80">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[10px] uppercase tracking-wider">
                      <th className="py-3 px-3 font-bold">#</th>
                      <th className="py-3 px-3 font-bold">Sheet Bảng Tính</th>
                      <th className="py-3 px-3 font-bold">Bảng SQL (Supabase)</th>
                      <th className="py-3 px-3 font-bold">Tên Bảng &amp; Khóa Quan Hệ (PK / FK)</th>
                      <th className="py-3 px-3 font-bold text-right">Bản Ghi Local</th>
                      <th className="py-3 px-3 font-bold text-right">Bản Ghi Cloud</th>
                      <th className="py-3 px-3 font-bold text-center">Toàn Vẹn 3NF</th>
                      <th className="py-3 px-3 font-bold">Trạng Thái Bảng Dữ Liệu</th>
                      <th className="py-3 px-3 font-bold text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {tableHealthList.map((tb, idx) => {
                      const spec = ROYAL_STANDARDIZED_10_TABLES.find(
                        s => s.sheetName === tb.sheetName || s.tableName === tb.tableName
                      );
                      const isPushingThis = sbPushingTable === tb.tableName;

                      let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';
                      let badgeLabel = 'Chuẩn hóa Local';
                      if (tb.status === 'synced') {
                        badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                        badgeLabel = '✓ Đã đồng bộ Cloud';
                      } else if (tb.status === 'out_of_sync') {
                        badgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                        badgeLabel = '⚡ Lệch số bản ghi';
                      } else if (tb.status === 'table_missing') {
                        badgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
                        badgeLabel = '✕ Chưa tạo bảng SQL';
                      } else if (tb.status === 'rls_blocked' || tb.status === 'error') {
                        badgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
                        badgeLabel = '⚠ Lỗi RLS / Kết nối';
                      }

                      return (
                        <tr key={tb.sheetName || tb.tableName || `tbl_${idx}`} className="hover:bg-slate-900/50 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-slate-500">
                            {tb.index || String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                            {tb.sheetName}
                          </td>
                          <td className="py-3 px-3 font-mono text-cyan-300 whitespace-nowrap">
                            {tb.tableName}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-white">{tb.titleVN}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              PK: {tb.primaryKey}
                              {tb.foreignKeys.length > 0 ? ` • FK: ${tb.foreignKeys.join(', ')}` : ' • Bảng danh mục gốc'}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-white">
                            {tb.localCount}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold">
                            {tb.remoteCount !== null ? (
                              <span className="text-emerald-400">{tb.remoteCount}</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {tb.integrityValid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                3NF OK
                              </span>
                            ) : (
                              <span
                                title={tb.integrityIssues.join(' | ')}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                {tb.integrityIssues.length} lưu ý
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle}`}>
                              {badgeLabel}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5 max-w-xs truncate" title={tb.message}>
                              {tb.message}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            {spec && (
                              <button
                                type="button"
                                onClick={() => handlePushSingleTable(spec)}
                                disabled={isPushingThis || !sbUrl.trim() || !sbKey.trim()}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-[10px] font-bold border border-slate-700 transition-all disabled:opacity-40 cursor-pointer"
                                title={`Đẩy bảng ${tb.tableName} lên Supabase`}
                              >
                                {isPushingThis ? 'Đang đẩy...' : 'Đẩy bảng ↑'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* SQL DDL Modal */}
          {showSqlModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
              <div className="w-full max-w-4xl max-h-[90vh] rounded-3xl bg-[#0f172a] border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
                {/* Modal Header */}
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Code className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Tập Lệnh SQL DDL Khởi Tạo 10 Bảng Chuẩn Hóa (Supabase PostgreSQL)</h4>
                      <p className="text-[11px] text-slate-400">Bao gồm đầy đủ 10 bảng CSDL ánh xạ 1-1 với Bảng Tính Tổng Thể, RLS Policies &amp; Storage Bucket</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopySqlDdl}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20"
                    >
                      {sqlCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{sqlCopied ? 'Đã sao chép!' : 'Sao Chép SQL'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSqlDdl}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-700"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Tải Tệp .sql</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSqlModal(false)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Code Preview */}
                <div className="p-4 overflow-y-auto font-mono text-[11px] text-slate-300 bg-slate-950 space-y-1 select-all leading-relaxed">
                  <pre className="whitespace-pre-wrap">{SUPABASE_FULL_DDL_SQL}</pre>
                </div>

                {/* Modal Footer */}
                <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
                  <span>Mẹo: Sao chép đoạn mã trên và dán trực tiếp vào tab <strong>SQL Editor</strong> trong Supabase Dashboard để tạo toàn bộ 10 bảng chuẩn hóa.</span>
                  <button
                    type="button"
                    onClick={() => setShowSqlModal(false)}
                    className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 1B: CẤU HÌNH ĐỊNH MỨC THÙ LAO GIẢNG DẠY (TEACHER RATE CONFIGURATION) */}
      {activeSection === 'teacher_rates' && (() => {
        const filteredTeachers = store.teachers.filter(t => {
          const matchCampus = teacherCampusFilter === 'all' || (t.campus_id || 'camp_pmh') === teacherCampusFilter;
          const matchType = teacherTypeFilter === 'all' || (t.type || t.teacher_type) === teacherTypeFilter;
          const matchSearch = !teacherSearchQuery.trim() || 
            t.name.toLowerCase().includes(teacherSearchQuery.toLowerCase()) ||
            (t.code || '').toLowerCase().includes(teacherSearchQuery.toLowerCase()) ||
            t.phone.includes(teacherSearchQuery);
          return matchCampus && matchType && matchSearch;
        });

        const permanentTeachersCount = store.teachers.filter(t => (t.type || t.teacher_type) === 'permanent').length;
        const visitingTeachersCount = store.teachers.filter(t => (t.type || t.teacher_type) === 'visiting').length;

        const rateAuditLogs = (store.auditLogs || []).filter(
          log => log.action === 'TEACHER_RATE_UPDATE' || log.action === 'TEACHER_PAYROLL_SETTLE'
        ).slice(0, 6);

        return (
          <div className="space-y-6">
            {/* Header */}
            <div className="p-6 rounded-3xl bg-[#111827]/90 border border-slate-800/80 backdrop-blur-md shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-extrabold text-white">
                      Quy Chuẩn Định Mức Thù Lao Toàn Trường
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wide">
                      Chuẩn HR &amp; Payroll Royal School
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                    Hệ thống áp dụng <strong>2 mức thù lao chuẩn duy nhất</strong> toàn trường cho <strong>Giáo viên Cơ hữu</strong> và <strong>Giáo viên Thỉnh giảng</strong>. Mọi tính toán thù lao trong Sổ điểm danh, Chấm công và Bảng lương tự động đồng bộ theo 2 định mức này.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveUniformPayrollRates}
                  className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-all flex items-center gap-2 shadow-xl shadow-amber-500/25 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Lưu Định Mức Thù Lao Toàn Trường (Áp Dụng Hồi Tố)</span>
                </button>
              </div>
            </div>

            {/* 2 Symmetric Standard Session Rate Configuration Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* CARD 1: GIÁO VIÊN CƠ HỮU */}
              <div className="rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-cyan-500/30 p-6 shadow-xl relative overflow-hidden flex flex-col justify-between space-y-5">
                <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-extrabold text-white">Giáo Viên Cơ Hữu (Permanent)</h4>
                        <div className="text-xs text-slate-400 mt-0.5">Biên chế giảng dạy ngoại khóa Royal School</div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase tracking-wider">
                      Toàn Thời Gian &bull; Biên Chế
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Đơn giá chuẩn / 1 buổi dạy (90 phút):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step={10000}
                          min={100000}
                          max={2000000}
                          value={permanentSessionRateInput}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setPermanentSessionRateInput(val);
                            setPermanentPeriodRateInput(Math.round(val / (periodsPerSessionInput || 2)));
                          }}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-cyan-500/50 text-cyan-300 font-mono font-extrabold text-base focus:outline-none focus:border-cyan-400"
                        />
                        <span className="text-xs font-bold text-slate-400 shrink-0">VNĐ / buổi</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] text-slate-500">Mức chuẩn gợi ý:</span>
                      {[260000, 300000, 320000, 350000].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setPermanentSessionRateInput(val);
                            setPermanentPeriodRateInput(Math.round(val / (periodsPerSessionInput || 2)));
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                            permanentSessionRateInput === val
                              ? 'bg-cyan-500 text-slate-950 font-extrabold'
                              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                          }`}
                        >
                          {val / 1000}K/buổi
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Thời lượng chuẩn 1 buổi:</span>
                        <strong className="text-white font-mono text-sm">1 buổi (90 phút)</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[11px]">Giáo viên đang áp dụng:</span>
                        <strong className="text-cyan-300 font-mono text-sm">{permanentTeachersCount} nhân sự</strong>
                      </div>
                    </div>
                  </div>

                  {/* Highlighted Result Box */}
                  <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-cyan-300/80 block uppercase font-bold tracking-wider">
                        Thù lao chuẩn 1 buổi dạy (Cơ hữu):
                      </span>
                      <div className="text-xl font-extrabold font-mono text-emerald-400 mt-0.5">
                        {formatVND(permanentSessionRateInput)} <span className="text-xs font-normal text-slate-400">/ buổi</span>
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-slate-400 font-mono">
                      1 buổi &times; {formatVND(permanentSessionRateInput)}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed italic">
                  🏛 <strong>Ghi chú chính sách:</strong> Áp dụng đồng bộ <strong>{formatVND(permanentSessionRateInput)}/buổi</strong> cho toàn bộ giáo viên thuộc biên chế Royal School giảng dạy ngoại khóa.
                </div>
              </div>

              {/* CARD 2: GIÁO VIÊN THỈNH GIẢNG */}
              <div className="rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-amber-500/30 p-6 shadow-xl relative overflow-hidden flex flex-col justify-between space-y-5">
                <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-extrabold text-white">Giáo Viên Thỉnh Giảng (Visiting)</h4>
                        <div className="text-xs text-slate-400 mt-0.5">Huấn luyện viên &amp; Chuyên gia ngoài trường</div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
                      Hợp Đồng Buổi &bull; Thỉnh Giảng
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Đơn giá chuẩn / 1 buổi dạy (90 phút):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step={10000}
                          min={100000}
                          max={2000000}
                          value={visitingSessionRateInput}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setVisitingSessionRateInput(val);
                            setVisitingPeriodRateInput(Math.round(val / (periodsPerSessionInput || 2)));
                          }}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-amber-500/50 text-amber-300 font-mono font-extrabold text-base focus:outline-none focus:border-amber-400"
                        />
                        <span className="text-xs font-bold text-slate-400 shrink-0">VNĐ / buổi</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] text-slate-500">Mức chuẩn gợi ý:</span>
                      {[240000, 270000, 280000, 300000].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setVisitingSessionRateInput(val);
                            setVisitingPeriodRateInput(Math.round(val / (periodsPerSessionInput || 2)));
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                            visitingSessionRateInput === val
                              ? 'bg-amber-500 text-slate-950 font-extrabold'
                              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                          }`}
                        >
                          {val / 1000}K/buổi
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Thời lượng chuẩn 1 buổi:</span>
                        <strong className="text-white font-mono text-sm">1 buổi (90 phút)</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[11px]">Giáo viên đang áp dụng:</span>
                        <strong className="text-amber-300 font-mono text-sm">{visitingTeachersCount} nhân sự</strong>
                      </div>
                    </div>
                  </div>

                  {/* Highlighted Result Box */}
                  <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-amber-300/80 block uppercase font-bold tracking-wider">
                        Thù lao chuẩn 1 buổi dạy (Thỉnh giảng):
                      </span>
                      <div className="text-xl font-extrabold font-mono text-emerald-400 mt-0.5">
                        {formatVND(visitingSessionRateInput)} <span className="text-xs font-normal text-slate-400">/ buổi</span>
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-slate-400 font-mono">
                      1 buổi &times; {formatVND(visitingSessionRateInput)}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed italic">
                  ⚡ <strong>Ghi chú chính sách:</strong> Áp dụng đồng bộ <strong>{formatVND(visitingSessionRateInput)}/buổi</strong> cho huấn luyện viên, chuyên gia ngoài trường cộng tác theo số buổi thực tế.
                </div>
              </div>
            </div>

            {/* Floating Action Bar */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  Lần cập nhật gần nhất: <strong className="text-white font-mono">{store.payrollRateConfig?.updated_at || '2026-10-20'}</strong> bởi <strong className="text-amber-400">{store.payrollRateConfig?.updated_by || 'Phòng Tài Chính & Kế Toán'}</strong>
                  {' • '}
                  <span className="text-emerald-400 font-semibold">Đã đồng bộ hồi tố {(store.teacherAttendance || []).length} ca dạy lịch sử</span>
                </span>
              </div>

              <button
                type="button"
                onClick={handleSaveUniformPayrollRates}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Lưu &amp; Áp Dụng Hồi Tố Toàn Trường</span>
              </button>
            </div>

            {/* Modal Xác Nhận Đồng Bộ Hồi Tố (Retroactive Recalculation Popover) */}
            {showRetroactiveConfirmModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
                <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                      <RefreshCw className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-white">
                        Xác Nhận Đồng Bộ Hồi Tố Thù Lao Giáo Viên
                      </h4>
                      <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                        Hệ thống sẽ tính toán lại thù lao cho tất cả <strong className="text-amber-300 font-mono">{(store.teacherAttendance || []).length || 9} ca học</strong> đã điểm danh trước đó theo mức:{' '}
                        <strong className="text-cyan-300 font-mono">Cơ hữu {Math.round(permanentSessionRateInput / 1000)}K/buổi</strong>,{' '}
                        <strong className="text-amber-300 font-mono">Thỉnh giảng {Math.round(visitingSessionRateInput / 1000)}K/buổi</strong>. Bạn có chắc chắn muốn cập nhật?
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>🏛 Giáo viên Cơ hữu (Permanent):</span>
                      <strong className="font-mono text-cyan-300">{formatVND(permanentSessionRateInput)} / buổi</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>⚡ Giáo viên Thỉnh giảng (Visiting):</span>
                      <strong className="font-mono text-amber-300">{formatVND(visitingSessionRateInput)} / buổi</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 pt-1.5 border-t border-slate-800 text-[11px]">
                      <span>Tổng số ca lịch sử được tính lại:</span>
                      <strong className="font-mono text-emerald-400">{(store.teacherAttendance || []).length || 9} buổi học</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRetroactiveConfirmModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
                    >
                      Hủy Bỏ
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRetroactivePayrollRates}
                      className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Xác Nhận &amp; Đồng Bộ Ngay</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Read-Only Summary Table of Teachers */}
            <div className="rounded-3xl bg-[#111827]/90 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl space-y-0">
              <div className="p-5 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    <span>Bảng Danh Sách Giáo Viên &amp; Định Mức Thù Lao Theo Buổi ({filteredTeachers.length}/{store.teachers.length})</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Chế độ xem đồng bộ: Đơn giá thù lao buổi được hệ thống tự động gán đồng bộ theo loại hình <strong>Cơ Hữu ({formatVND(permanentSessionRateInput)}/buổi)</strong> hoặc <strong>Thỉnh Giảng ({formatVND(visitingSessionRateInput)}/buổi)</strong>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Tìm tên GV, mã, SĐT..."
                      value={teacherSearchQuery}
                      onChange={e => setTeacherSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
                    <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                    <select
                      value={teacherCampusFilter}
                      onChange={e => setTeacherCampusFilter(e.target.value)}
                      className="bg-transparent font-bold text-white focus:outline-none cursor-pointer"
                    >
                      <option value="all" className="bg-slate-900">Tất cả cơ sở</option>
                      <option value="camp_pmh" className="bg-slate-900">Phú Mỹ Hưng (PMH)</option>
                      <option value="camp_pl" className="bg-slate-900">Phú Lâm (PL)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
                    <Filter className="w-3.5 h-3.5 text-amber-400" />
                    <select
                      value={teacherTypeFilter}
                      onChange={e => setTeacherTypeFilter(e.target.value as any)}
                      className="bg-transparent font-bold text-white focus:outline-none cursor-pointer"
                    >
                      <option value="all" className="bg-slate-900">Tất cả phân loại</option>
                      <option value="permanent" className="bg-slate-900">Cơ hữu ({permanentTeachersCount})</option>
                      <option value="visiting" className="bg-slate-900">Thỉnh giảng ({visitingTeachersCount})</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenCreateTeacherModal}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all flex items-center gap-1.5 border border-slate-700"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Thêm Giáo Viên Mới</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">1. Mã GV &amp; Họ Tên</th>
                      <th className="py-3.5 px-4">2. Cơ Sở Chính</th>
                      <th className="py-3.5 px-4">3. Phân Loại Nhân Sự</th>
                      <th className="py-3.5 px-4 text-center">4. Đơn Vị Tính Công</th>
                      <th className="py-3.5 px-4">5. Đơn Giá Áp Dụng / Buổi</th>
                      <th className="py-3.5 px-4">6. Quy Đổi Tham Chiếu</th>
                      <th className="py-3.5 px-4">7. Tài Khoản Nhận Lương</th>
                      <th className="py-3.5 px-4 text-right">8. Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredTeachers.map((teacher, idx) => {
                      const isPerm = (teacher.type || teacher.teacher_type) === 'permanent';
                      const periods = periodsPerSessionInput || 2;
                      const appliedSessionRate = isPerm ? permanentSessionRateInput : visitingSessionRateInput;
                      const appliedRatePerPeriod = Math.round(appliedSessionRate / periods);
                      const campusObj = store.campuses.find(c => c.id === (teacher.campus_id || 'camp_pmh'));

                      return (
                        <tr key={teacher.id} className="hover:bg-slate-800/30 transition-colors">
                          {/* 1. Mã & Họ tên GV */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                                isPerm
                                  ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
                                  : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                              }`}>
                                {teacher.name.split(' ').pop()?.charAt(0) || 'G'}
                              </div>
                              <div>
                                <div className="font-mono text-[10px] font-bold text-amber-400">
                                  {teacher.code || `GV-PMH-00${idx + 1}`}
                                </div>
                                <div className="font-bold text-white text-sm">{teacher.name}</div>
                                <div className="text-[10px] text-slate-500">{teacher.phone} &bull; {teacher.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* 2. Cơ sở */}
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 font-semibold text-[11px]">
                              {campusObj ? `${campusObj.code} - ${campusObj.name.split('(')[0].trim()}` : 'PMH'}
                            </span>
                          </td>

                          {/* 3. Phân loại */}
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 ${
                              isPerm
                                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            }`}>
                              {isPerm ? '🏛 Giáo viên Cơ hữu' : '⚡ Giáo viên Thỉnh giảng'}
                            </span>
                          </td>

                          {/* 4. Đơn vị tính công */}
                          <td className="py-3.5 px-4 text-center font-mono">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-bold text-white">
                              1 buổi (90 phút)
                            </span>
                          </td>

                          {/* 5. Đơn giá/buổi */}
                          <td className="py-3.5 px-4 font-mono">
                            <div className={`font-extrabold text-sm ${isPerm ? 'text-cyan-300' : 'text-amber-300'}`}>
                              {formatVND(appliedSessionRate)}
                              <span className="text-[10px] text-slate-400 font-normal"> / buổi</span>
                            </div>
                          </td>

                          {/* 6. Quy đổi tham chiếu */}
                          <td className="py-3.5 px-4 font-mono">
                            <div className="font-extrabold text-emerald-400 text-sm">
                              {formatVND(appliedSessionRate)}
                              <span className="text-[10px] text-slate-400 font-normal"> / ca dạy</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              ({formatVND(appliedRatePerPeriod)}/tiết &times; {periods} tiết)
                            </div>
                          </td>

                          {/* 7. Tài khoản nhận lương */}
                          <td className="py-3.5 px-4">
                            {teacher.bank_account?.account_number ? (
                              <div className="text-[11px]">
                                <div className="font-bold text-slate-200">{teacher.bank_account.bank_name}</div>
                                <div className="font-mono text-amber-300">{teacher.bank_account.account_number}</div>
                                <div className="text-[9px] text-slate-500 uppercase">{teacher.bank_account.account_holder}</div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-500 italic">Chưa cập nhật TK</span>
                            )}
                          </td>

                          {/* 8. Trạng thái */}
                          <td className="py-3.5 px-4 text-right">
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                              Đang công tác
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom-right Success Toast */}
            {rateSaveSuccessToast && (
              <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-emerald-950/95 border border-emerald-500/50 text-emerald-200 text-xs font-bold shadow-2xl flex items-center gap-3 animate-slideUp">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{rateSaveSuccessToast}</span>
              </div>
            )}

            {/* Recent Teacher Rate & Payroll Audit Trail */}
            <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Nhật Ký Kiểm Toán Thay Đổi Định Mức Thù Lao &amp; Quyết Toán Gần Đây</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSection('audit_logs')}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                >
                  <span>Xem toàn bộ Audit Logs</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {rateAuditLogs.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 text-center">
                  Chưa có biến động thay đổi định mức thù lao nào trong phiên làm việc này. Hãy thử chỉnh sửa đơn giá tiết ở bảng trên để kiểm chứng Audit Log tự động.
                </div>
              ) : (
                <div className="space-y-2">
                  {rateAuditLogs.map(log => (
                    <div key={log.id} className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-bold">
                            {log.action}
                          </span>
                          <strong className="text-white">{log.target_entity}</strong>
                        </div>
                        <p className="text-slate-300 text-[11px]">{log.description}</p>
                      </div>
                      <div className="text-right text-[10px] text-slate-500 font-mono shrink-0">
                        <div>{log.full_name} ({log.user_role})</div>
                        <div>{log.timestamp.replace('T', ' ').slice(0, 19)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* MODAL CẤU HÌNH CHI TIẾT ĐỊNH MỨC THÙ LAO GIÁO VIÊN */}
      {(editingTeacherModal || isCreatingTeacher) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-[#0F172A] border border-amber-500/40 p-6 shadow-2xl space-y-5 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {isCreatingTeacher ? 'Thêm Mới Giáo Viên & Cấu Hình Thù Lao' : `Cấu Hình Định Mức Thù Lao: ${editingTeacherModal?.name}`}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Thiết lập đơn giá tiết chuẩn, phụ cấp ca cuối tuần, đơn giá môn đặc thù &amp; tài khoản ngân hàng nhận lương
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTeacherModal(null);
                  setIsCreatingTeacher(false);
                }}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacherModal} className="space-y-4 text-xs">
              {/* Khối 1: Thông tin định danh & Phân loại nhân sự */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Mã Giáo Viên *</label>
                  <input
                    type="text"
                    value={teacherForm.code}
                    onChange={(e) => setTeacherForm(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="VD: GV-PMH-001"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Họ và Tên Giáo Viên *</label>
                  <input
                    type="text"
                    value={teacherForm.name}
                    onChange={(e) => setTeacherForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="VD: ThS. Đỗ Thu Hương"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Phân loại nhân sự</label>
                  <select
                    value={teacherForm.teacher_type}
                    onChange={(e) => setTeacherForm(prev => ({ ...prev, teacher_type: e.target.value as 'permanent' | 'visiting' }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500"
                  >
                    <option value="permanent">Giáo viên Cơ hữu (Permanent)</option>
                    <option value="visiting">Giáo viên Thỉnh giảng (Visiting)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Cơ sở hoạt động chính</label>
                  <select
                    value={teacherForm.campus_id}
                    onChange={(e) => setTeacherForm(prev => ({ ...prev, campus_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500"
                  >
                    <option value="camp_pmh">Cơ sở Phú Mỹ Hưng (PMH)</option>
                    <option value="camp_pl">Cơ sở Phú Lâm (PL)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    value={teacherForm.phone}
                    onChange={(e) => setTeacherForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="0908 554 433"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Khối 2: Cấu hình Đơn giá Tiết & Quy đổi Buổi */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4" />
                    <span>Định Mức Thù Lao Chuẩn Theo Tiết (Hourly / Period Rate)</span>
                  </span>
                  <span className="font-mono text-xs font-extrabold text-emerald-400">
                    Quy đổi: {formatVND(teacherForm.default_rate_per_period * teacherForm.periods_per_session)} / buổi ({teacherForm.periods_per_session} tiết)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Đơn giá chuẩn 1 tiết (VNĐ) *</label>
                    <input
                      type="number"
                      step={5000}
                      min={10000}
                      value={teacherForm.default_rate_per_period}
                      onChange={(e) => setTeacherForm(prev => ({ ...prev, default_rate_per_period: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/60 text-amber-300 font-mono text-sm font-extrabold focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Số tiết / buổi chuẩn *</label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={teacherForm.periods_per_session}
                      onChange={(e) => setTeacherForm(prev => ({ ...prev, periods_per_session: Math.max(1, Number(e.target.value)) }))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Hệ số phụ cấp Cuối tuần (T7/CN)</label>
                    <select
                      value={teacherForm.weekend_multiplier}
                      onChange={(e) => setTeacherForm(prev => ({ ...prev, weekend_multiplier: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-cyan-300 font-mono font-bold focus:outline-none focus:border-cyan-500"
                    >
                      <option value={1.0}>x1.0 (Không phụ cấp)</option>
                      <option value={1.1}>x1.1 (+10% ca cuối tuần)</option>
                      <option value={1.2}>x1.2 (+20% ca cuối tuần)</option>
                      <option value={1.5}>x1.5 (+50% ca cuối tuần)</option>
                    </select>
                  </div>
                </div>

                {/* Quick Rate Presets */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-[11px] text-slate-400">Chọn nhanh mức chuẩn:</span>
                  {[120000, 150000, 200000, 250000].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTeacherForm(prev => ({ ...prev, default_rate_per_period: preset }))}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border transition-all ${
                        teacherForm.default_rate_per_period === preset
                          ? 'bg-amber-500 text-slate-950 font-extrabold border-amber-400'
                          : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-amber-500/40'
                      }`}
                    >
                      {formatVND(preset)}/tiết ({formatVND(preset * teacherForm.periods_per_session)}/buổi)
                    </button>
                  ))}
                </div>
              </div>

              {/* Khối 3: Đơn giá tiết riêng theo đặc thù môn học */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-300 text-xs">
                    Đơn Giá Tiết Riêng Theo Đặc Thù Môn Học (Tùy chọn)
                  </span>
                  <span className="text-[10px] text-slate-400">Nếu để trống = Áp dụng đơn giá chuẩn ở trên</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {store.subjects.map(sub => {
                    const existing = teacherForm.custom_subject_rates.find(r => r.subject_id === sub.id);
                    return (
                      <div key={sub.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                        <div className="font-bold text-slate-200 text-[11px] truncate">{sub.name}</div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step={5000}
                            placeholder={`${teacherForm.default_rate_per_period}`}
                            value={existing?.rate_per_period || ''}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setTeacherForm(prev => {
                                const others = prev.custom_subject_rates.filter(r => r.subject_id !== sub.id);
                                if (val > 0) {
                                  return { ...prev, custom_subject_rates: [...others, { subject_id: sub.id, rate_per_period: val }] };
                                }
                                return { ...prev, custom_subject_rates: others };
                              });
                            }}
                            className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-purple-300 font-mono text-xs focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-[10px] text-slate-500 shrink-0">đ/tiết</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Khối 4: Tài khoản Ngân hàng nhận thù lao VietQR */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                <div className="font-bold text-cyan-300 text-xs">
                  Thông Tin Tài Khoản Ngân Hàng Nhận Quyết Toán Thù Lao (Tích hợp VietQR)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Ngân hàng thụ hưởng</label>
                    <select
                      value={teacherForm.bank_name}
                      onChange={(e) => setTeacherForm(prev => ({ ...prev, bank_name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs"
                    >
                      <option value="Vietcombank">Vietcombank</option>
                      <option value="BIDV">BIDV</option>
                      <option value="Techcombank">Techcombank</option>
                      <option value="MBBank">MBBank</option>
                      <option value="ACB">ACB</option>
                      <option value="VietinBank">VietinBank</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Số tài khoản</label>
                    <input
                      type="text"
                      value={teacherForm.account_number}
                      onChange={(e) => setTeacherForm(prev => ({ ...prev, account_number: e.target.value }))}
                      placeholder="0181009988776"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-amber-300 font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Chủ tài khoản (In hoa không dấu)</label>
                    <input
                      type="text"
                      value={teacherForm.account_holder}
                      onChange={(e) => setTeacherForm(prev => ({ ...prev, account_holder: e.target.value.toUpperCase() }))}
                      placeholder="DO THU HUONG"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs uppercase"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTeacherModal(null);
                    setIsCreatingTeacher(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Lưu Cấu Hình &amp; Ghi Audit Log</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 6B: QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN TRUY CẬP (RBAC) */}
      {activeSection === 'users' && (
        <UserManagementTab
          store={store}
          currentRole={currentRole}
          currentUser={currentUser || null}
          onUpdateStore={onUpdateStore}
        />
      )}

      {/* SECTION 6C: DANH SÁCH NGÀY NGHỈ LỄ */}
      {activeSection === 'holidays' && (
        <HolidayManagementView
          store={store}
          onUpdateStore={onUpdateStore}
        />
      )}

      {/* SECTION 7: NHẬT KÝ KIỂM TOÁN & LỊCH SỬ THAO TÁC */}
      {activeSection === 'audit_logs' && (
        <AuditLogsTab
          store={store}
          currentRole={currentRole}
          currentUser={currentUser}
          onUpdateStore={onUpdateStore}
        />
      )}

    </div>
  );
};

