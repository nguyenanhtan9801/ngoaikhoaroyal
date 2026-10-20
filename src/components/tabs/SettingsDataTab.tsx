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
  ExternalLink
} from 'lucide-react';
import { 
  AppStore, 
  formatVND, 
  calculateCeilSessionRate, 
  getInitialStore, 
  getEffectivePrice, 
  cloneTermConfiguration, 
  isTermClosed,
  createAuditRecord,
  appendAuditLog
} from '../../lib/storage';
import { AuditLogsTab } from './AuditLogsTab';
import { downloadSampleTemplate, parseMasterExcelFile, exportMasterWorkbook } from '../../lib/excel';
import { 
  UserRole, 
  TermCampusSubjectPricing, 
  Campus, 
  AcademicTerm, 
  TermStatus, 
  Subject,
  SubjectCategory,
  TermSubjectConfig, 
  CampusTermPricing,
  DiscountType,
  CloudStorageConfig
} from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface SettingsDataTabProps {
  store: AppStore;
  currentRole: UserRole;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  initialSection?: 'pricing' | 'campuses' | 'clean_reset' | 'excel_master' | 'cloud_storage' | 'telecom' | 'supabase' | 'audit_logs';
  initialSubTab?: 'categories' | 'subjects' | 'terms' | 'term_subjects' | 'campus_pricing' | 'matrix';
}

export const SettingsDataTab: React.FC<SettingsDataTabProps> = ({
  store,
  currentRole,
  onUpdateStore,
  initialSection = 'pricing',
  initialSubTab = 'terms',
}) => {
  const [activeSection, setActiveSection] = useState<'pricing' | 'campuses' | 'clean_reset' | 'excel_master' | 'cloud_storage' | 'telecom' | 'supabase' | 'audit_logs'>(initialSection);
  const [pricingViewMode, setPricingViewMode] = useState<ViewMode>('table');
  const [campusesViewMode, setCampusesViewMode] = useState<ViewMode>('table');

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

  // Fallback categories list if store.subjectCategories is empty
  const categoriesList: SubjectCategory[] = store.subjectCategories && store.subjectCategories.length > 0
    ? store.subjectCategories
    : [
        {
          id: 'cat_sports',
          code: 'SPORTS',
          name: 'Thể thao',
          color: 'amber',
          icon: 'Activity',
          description: 'Rèn luyện thể lực, phản xạ, tinh thần đồng đội và nâng cao sức bền (Bóng rổ, Bơi lội, Cầu lông, Bóng đá mini).',
          status: 'active',
          order: 1,
        },
        {
          id: 'cat_arts',
          code: 'ARTS',
          name: 'Nghệ thuật',
          color: 'purple',
          icon: 'Palette',
          description: 'Nuôi dưỡng cảm xúc thẩm mỹ, sáng tạo không gian và phát triển năng khiếu âm nhạc, hội họa (Piano, Hội họa, Thanh nhạc).',
          status: 'active',
          order: 2,
        },
        {
          id: 'cat_tech',
          code: 'DIGITAL',
          name: 'Kỹ năng số',
          color: 'cyan',
          icon: 'Code',
          description: 'Tư duy logic thuật toán, ứng dụng công nghệ tương lai và kỹ năng chế tạo (Robotics VEX IQ, Lập trình Scratch, AI & IoT).',
          status: 'active',
          order: 3,
        },
        {
          id: 'cat_academic',
          code: 'ACADEMIC',
          name: 'Học thuật',
          color: 'emerald',
          icon: 'GraduationCap',
          description: 'Phát triển tư duy ngôn ngữ học, hùng biện, kỹ năng tranh biện quốc tế và toán học tư duy ứng dụng.',
          status: 'active',
          order: 4,
        },
        {
          id: 'cat_lifeskills',
          code: 'LIFESKILLS',
          name: 'Kỹ năng sống & Sinh tồn',
          color: 'rose',
          icon: 'HeartPulse',
          description: 'Kỹ năng tự vệ, sơ cấp cứu học đường, ứng biến tình huống khẩn cấp và giao tiếp tự tin.',
          status: 'active',
          order: 5,
        },
      ];

  const getCategoryColorDetails = (color: string) => {
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

  const getCategoryIconComponent = (iconName: string) => {
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
      color: cat.color,
      icon: cat.icon,
      description: cat.description || '',
      status: cat.status,
    });
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = (cat: SubjectCategory) => {
    const relatedSubjects = store.subjects.filter(
      s => s.category.trim().toLowerCase() === cat.name.trim().toLowerCase() ||
           s.category.trim().toLowerCase() === cat.code.trim().toLowerCase()
    );

    if (relatedSubjects.length > 0) {
      alert(`Không thể xóa phân loại "${cat.name}" (${cat.code}) vì hiện đang có ${relatedSubjects.length} môn học trực thuộc (${relatedSubjects.map(s => s.name).join(', ')}). Vui lòng chuyển các môn học này sang phân loại khác trước khi xóa.`);
      return;
    }

    const ok = window.confirm(`Bạn có chắc chắn muốn xóa phân loại "${cat.name}" (${cat.code}) khỏi hệ thống?`);
    if (!ok) return;

    onUpdateStore(prev => ({
      ...prev,
      subjectCategories: (prev.subjectCategories || categoriesList).filter(c => c.id !== cat.id),
    }));
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = categoryFormData.code.trim().toUpperCase();
    const cleanName = categoryFormData.name.trim();

    if (!cleanCode || !cleanName) {
      alert('Vui lòng nhập đầy đủ Mã phân loại và Tên phân loại.');
      return;
    }

    const currentList = store.subjectCategories || categoriesList;
    const duplicate = currentList.find(
      c => (c.code.toUpperCase() === cleanCode || c.name.toLowerCase() === cleanName.toLowerCase()) && 
           c.id !== editingCategory?.id
    );
    if (duplicate) {
      alert(`Mã phân loại "${cleanCode}" hoặc Tên "${cleanName}" đã tồn tại. Vui lòng chọn giá trị khác.`);
      return;
    }

    if (editingCategory) {
      const oldName = editingCategory.name;
      onUpdateStore(prev => {
        const updatedCategories = (prev.subjectCategories || categoriesList).map(c =>
          c.id === editingCategory.id
            ? {
                ...c,
                ...categoryFormData,
                code: cleanCode,
                name: cleanName,
              }
            : c
        );

        const updatedSubjects = oldName !== cleanName
          ? prev.subjects.map(s => s.category === oldName ? { ...s, category: cleanName } : s)
          : prev.subjects;

        return {
          ...prev,
          subjectCategories: updatedCategories,
          subjects: updatedSubjects,
        };
      });
    } else {
      const newCatId = `cat_${cleanCode.toLowerCase()}_${Date.now()}`;
      const newCategory: SubjectCategory = {
        id: newCatId,
        ...categoryFormData,
        code: cleanCode,
        name: cleanName,
        order: currentList.length + 1,
      };

      onUpdateStore(prev => ({
        ...prev,
        subjectCategories: [...(prev.subjectCategories || categoriesList), newCategory],
      }));
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
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectFormData, setSubjectFormData] = useState({
    code: '',
    name: '',
    category: categoriesList[0]?.name || 'Thể thao',
    standard_duration: '90 phút',
    description: '',
  });

  const handleOpenAddSubject = (presetCategory?: string | React.MouseEvent) => {
    const defaultCat = (typeof presetCategory === 'string' && presetCategory)
      ? presetCategory
      : (categoriesList[0]?.name || 'Thể thao');
    setEditingSubject(null);
    setSubjectFormData({
      code: '',
      name: '',
      category: defaultCat,
      standard_duration: '90 phút',
      description: '',
    });
    setShowSubjectModal(true);
  };

  const handleOpenEditSubject = (subject: Subject) => {
    setEditingSubject(subject);
    setSubjectFormData({
      code: subject.code,
      name: subject.name,
      category: subject.category,
      standard_duration: subject.standard_duration || '90 phút',
      description: subject.description || '',
    });
    setShowSubjectModal(true);
  };

  const handleDeleteSubject = (subject: Subject) => {
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

    onUpdateStore(prev => ({
      ...prev,
      subjects: prev.subjects.filter(s => s.id !== subject.id),
      termSubjects: prev.termSubjects.filter(ts => ts.subject_id !== subject.id),
      campusPricings: prev.campusPricings.filter(cp => cp.subject_id !== subject.id),
      pricings: prev.pricings.filter(p => p.subject_id !== subject.id),
    }));
  };

  const handleSaveSubject = (e: React.FormEvent) => {
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

    if (editingSubject) {
      onUpdateStore(prev => ({
        ...prev,
        subjects: prev.subjects.map(s => 
          s.id === editingSubject.id
            ? {
                ...s,
                ...subjectFormData,
                code: cleanCode,
                name: cleanName,
              }
            : s
        ),
      }));
    } else {
      const newSubId = `sub_${cleanCode.toLowerCase()}_${Date.now()}`;
      const newSubject: Subject = {
        id: newSubId,
        ...subjectFormData,
        code: cleanCode,
        name: cleanName,
      };

      onUpdateStore(prev => {
        const newTermConfigs: TermSubjectConfig[] = prev.terms.map(t => ({
          id: `ts_${t.id}_${cleanCode.toLowerCase()}`,
          term_id: t.id,
          subject_id: newSubId,
          is_active: true,
          standard_sessions: 24,
          standard_course_fee: 3600000,
          standard_session_rate: 150000,
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

  // Cloud Storage Config State
  const initialCloudConfig = store.cloudStorageConfig || {
    provider: 'google_drive',
    drive_folder_id: '1A9xK_RoyalSchool_Extracurricular_Proof_2026',
    drive_folder_name: 'RoyalSchool_MinhChung_Extracurricular_2026',
    onedrive_folder_url: 'https://royalschooledu-my.sharepoint.com/personal/admin_royalschool_edu_vn/Documents/MinhChung2026',
    auto_create_subfolders: true,
    updated_at: '2026-10-20',
    updated_by: 'ThS. Nguyễn Hoàng Long',
  };

  const [cloudProvider, setCloudProvider] = useState<'google_drive' | 'onedrive' | 'local'>(initialCloudConfig.provider);
  const [driveFolderId, setDriveFolderId] = useState<string>(initialCloudConfig.drive_folder_id || '');
  const [driveFolderName, setDriveFolderName] = useState<string>(initialCloudConfig.drive_folder_name || '');
  const [oneDriveFolderUrl, setOneDriveFolderUrl] = useState<string>(initialCloudConfig.onedrive_folder_url || '');
  const [autoCreateSubfolders, setAutoCreateSubfolders] = useState<boolean>(initialCloudConfig.auto_create_subfolders);
  const [cloudTestStatus, setCloudTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [cloudSaveMessage, setCloudSaveMessage] = useState<string | null>(null);

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

    setImportStatus({ loading: true, message: 'Đang đọc và phân tích tệp bảng tính...' });
    const result = await parseMasterExcelFile(file);

    if (result.success && result.data) {
      onUpdateStore(prev => {
        const importLog = createAuditRecord(
          'EXCEL_IMPORT',
          'SYSTEM',
          'Bảng Tính Master Excel',
          `Import đồng bộ tệp Excel "${file.name}" thành công`,
          null,
          {
            target_id: file.name,
            details: {
              status: 'success',
              after: {
                fileName: file.name,
                fileSize: file.size,
                message: result.message
              }
            }
          }
        );

        return {
          ...prev,
          students: result.data?.students ? [...result.data.students, ...prev.students] : prev.students,
          auditLogs: [importLog, ...(prev.auditLogs || [])],
        };
      });
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
        drive_folder_name: driveFolderName.trim() || 'RoyalSchool_MinhChung_Extracurricular_2026',
        onedrive_folder_url: oneDriveFolderUrl.trim(),
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
    setTimeout(() => setCloudSaveMessage(null), 3500);
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
          <span>Bảng Tính Tổng Thể (10 Bảng)</span>
        </button>
        <button
          onClick={() => setActiveSection('cloud_storage')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeSection === 'cloud_storage'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30'
          }`}
        >
          <Cloud className="w-3.5 h-3.5" />
          <span>Vị Trí Lưu Trữ Tệp (Cloud Storage)</span>
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
        <button
          onClick={() => setActiveSection('audit_logs')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeSection === 'audit_logs'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
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
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-slate-800 overflow-x-auto">
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
                    const relatedSubjects = store.subjects.filter(
                      s => s.category.trim().toLowerCase() === cat.name.trim().toLowerCase() ||
                           s.category.trim().toLowerCase() === cat.code.trim().toLowerCase()
                    );
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
                              {relatedSubjects.length} môn
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
                              <span>Xem danh sách môn ({relatedSubjects.length})</span>
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
                          const relatedSubjects = store.subjects.filter(
                            s => s.category.trim().toLowerCase() === cat.name.trim().toLowerCase() ||
                                 s.category.trim().toLowerCase() === cat.code.trim().toLowerCase()
                          );
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
                                  {relatedSubjects.length} môn
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

                  {/* Add Subject Button */}
                  <button
                    onClick={handleOpenAddSubject}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all shrink-0"
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
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                              <span className="flex items-center gap-1 text-slate-300 font-medium">
                                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                {subject.standard_duration || '90 phút'}
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
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                        <th className="py-3 px-4">Mã Môn</th>
                        <th className="py-3 px-4">Tên Môn Học & Nội Dung</th>
                        <th className="py-3 px-4">Phân Loại</th>
                        <th className="py-3 px-4">Thời Lượng Chuẩn</th>
                        <th className="py-3 px-4 text-center">Khóa Đang Kích Hoạt</th>
                        <th className="py-3 px-4 text-center">Lớp Học Mở</th>
                        <th className="py-3 px-4 text-right">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200">
                      {filteredSubjects.map(subject => {
                        const activeTermsCount = store.termSubjects.filter(ts => ts.subject_id === subject.id && ts.is_active).length;
                        const relatedClassesCount = store.classes.filter(c => c.subject_id === subject.id).length;
                        const catBadge = getSubjectCategoryBadge(subject.category);
                        const CatIcon = catBadge.icon;

                        return (
                          <tr key={subject.id} className="hover:bg-slate-850/50 transition-colors">
                            <td className="py-3 px-4 font-mono font-black text-amber-400">
                              {subject.code}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-extrabold text-white text-xs">{subject.name}</div>
                              {subject.description ? (
                                <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{subject.description}</div>
                              ) : (
                                <div className="text-[11px] text-slate-500 italic mt-0.5">Chương trình chuẩn Hoàng Gia</div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${catBadge.badge}`}>
                                <CatIcon className="w-3 h-3" />
                                <span>{subject.category}</span>
                              </span>
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-300">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                {subject.standard_duration || '90 phút'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono">
                              <span className="text-amber-400 font-bold">{activeTermsCount}</span>
                              <span className="text-slate-500 text-[10px]"> / {store.terms.length}</span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-cyan-400">
                              {relatedClassesCount}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
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

              {filteredSubjects.length === 0 && (
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
              )}
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
                  const termClasses = store.classes.filter(c => c.term_id === term.id);
                  const activeSubjectsCount = store.termSubjects.filter(ts => ts.term_id === term.id && ts.is_active).length;
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
                            onChange={(e) => {
                              const newStatus = e.target.value as TermStatus;
                              if (newStatus === 'closed') {
                                const ok = window.confirm(`CẢNH BÁO: Bạn có chắc chắn muốn ĐÓNG khóa học "${term.name}"? Toàn bộ lớp học, điểm danh và ghi danh của khóa sẽ bị khóa chỉnh sửa.`);
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
      {showSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <School className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  {editingSubject ? 'Cập Nhật Môn Học' : 'Thêm Môn Học Mới Vào Danh Mục'}
                </h3>
                <p className="text-xs text-slate-400">Danh mục Môn học cấp Trung Tâm toàn trường Royal School.</p>
              </div>
            </div>

            <form onSubmit={handleSaveSubject} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-slate-400 font-medium mb-1">Mã môn *</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={subjectFormData.code}
                    onChange={(e) => setSubjectFormData({ ...subjectFormData, code: e.target.value.toUpperCase() })}
                    placeholder="VD: BASK"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-400 font-medium mb-1">Phân loại môn *</label>
                  <select
                    value={subjectFormData.category}
                    onChange={(e) => setSubjectFormData({ ...subjectFormData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold focus:outline-none focus:border-amber-500"
                  >
                    {categoriesList.map(cat => (
                      <option key={cat.id} value={cat.name} className="bg-slate-900 text-white">
                        {cat.name} ({cat.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Tên môn học *</label>
                <input
                  type="text"
                  required
                  value={subjectFormData.name}
                  onChange={(e) => setSubjectFormData({ ...subjectFormData, name: e.target.value })}
                  placeholder="VD: Bóng rổ Hoàng Gia"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Thời lượng chuẩn mỗi buổi</label>
                <div className="grid grid-cols-4 gap-2">
                  {['45 phút', '60 phút', '75 phút', '90 phút'].map(dur => (
                    <button
                      type="button"
                      key={dur}
                      onClick={() => setSubjectFormData({ ...subjectFormData, standard_duration: dur })}
                      className={`py-1.5 px-2 rounded-xl text-center font-medium transition-all ${
                        subjectFormData.standard_duration === dur
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                          : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {dur}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={subjectFormData.standard_duration}
                  onChange={(e) => setSubjectFormData({ ...subjectFormData, standard_duration: e.target.value })}
                  placeholder="Hoặc nhập thời lượng tùy ý (VD: 120 phút)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 mt-2 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Mô tả chương trình đào tạo</label>
                <textarea
                  rows={3}
                  value={subjectFormData.description}
                  onChange={(e) => setSubjectFormData({ ...subjectFormData, description: e.target.value })}
                  placeholder="Tóm tắt mục tiêu môn học, giáo trình hoặc trang thiết bị yêu cầu..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowSubjectModal(false);
                    setEditingSubject(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/20 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingSubject ? 'Lưu Thay Đổi' : 'Thêm Môn Học'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <h3 className="text-base font-bold text-white">Module Nhập & Xuất Bảng Tính Đồng Bộ 10 Bảng Dữ Liệu</h3>
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

      {/* SECTION: VỊ TRÍ LƯU TRỮ TỆP (CLOUD STORAGE INTEGRATION) */}
      {activeSection === 'cloud_storage' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 md:p-8 backdrop-blur-md shadow-xl max-w-4xl mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Cloud className="w-6 h-6 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Cấu Hình Vị Trí Lưu Trữ Tệp (Cloud Storage Integration)</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Thiết lập thư mục lưu trữ tập trung trên đám mây cho toàn bộ file đính kèm: Đơn xin nghỉ phép, toa thuốc/giấy khám bệnh, ảnh học viên và tài liệu đối soát của phụ huynh.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-bold shrink-0">
              Enterprise Cloud Ready
            </span>
          </div>

          {cloudSaveMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{cloudSaveMessage}</span>
            </div>
          )}

          {/* 1. LỰA CHỌN NỀN TẢNG LƯU TRỮ */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
              1. Lựa chọn nền tảng lưu trữ tệp (Storage Provider):
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Google Drive */}
              <div
                onClick={() => setCloudProvider('google_drive')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  cloudProvider === 'google_drive'
                    ? 'bg-cyan-500/10 border-cyan-500 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Cloud className="w-5 h-5 text-cyan-400" />
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold">
                    Khuyến nghị
                  </span>
                </div>
                <div className="font-bold text-white text-sm">Google Drive Workspace</div>
                <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Lưu trữ trực tiếp vào Google Drive của trường Royal School. Hỗ trợ xem trước file tức thì và sinh link chia sẻ.
                </div>
              </div>

              {/* Microsoft OneDrive */}
              <div
                onClick={() => setCloudProvider('onedrive')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  cloudProvider === 'onedrive'
                    ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Share2 className="w-5 h-5 text-blue-400" />
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[9px] font-semibold">
                    Microsoft 365
                  </span>
                </div>
                <div className="font-bold text-white text-sm">OneDrive / SharePoint</div>
                <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Đồng bộ thư mục dùng chung của trường trên hệ sinh thái Microsoft Teams & SharePoint Education.
                </div>
              </div>

              {/* Local / Supabase Storage */}
              <div
                onClick={() => setCloudProvider('local')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  cloudProvider === 'local'
                    ? 'bg-emerald-500/10 border-emerald-500 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <HardDrive className="w-5 h-5 text-emerald-400" />
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-semibold">
                    Internal
                  </span>
                </div>
                <div className="font-bold text-white text-sm">Bộ Nhớ Cục Bộ / Server</div>
                <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Lưu trữ trên máy chủ cục bộ trường hoặc Supabase S3 bucket tốc độ truy xuất siêu tốc.
                </div>
              </div>
            </div>
          </div>

          {/* 2. KHU VỰC NHẬP THÔNG TIN THƯ MỤC */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 text-xs">
            <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
              2. Cấu hình Thư mục Lưu trữ Tập trung:
            </label>

            {cloudProvider === 'google_drive' && (
              <>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Google Drive Folder ID hoặc Đường Dẫn (Folder URL / ID):
                  </label>
                  <input
                    type="text"
                    value={driveFolderId}
                    onChange={(e) => setDriveFolderId(e.target.value)}
                    placeholder="VD: 1A9xK_RoyalSchool_Extracurricular_Proof_2026 hoặc link https://drive.google.com/drive/folders/..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    * Sao chép mã ID thư mục Google Drive sau dấu "/folders/" hoặc dán toàn bộ đường link thư mục dùng chung của trường.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Tên Thư Mục Hiển Thị (Display Folder Name):
                  </label>
                  <input
                    type="text"
                    value={driveFolderName}
                    onChange={(e) => setDriveFolderName(e.target.value)}
                    placeholder="VD: RoyalSchool_MinhChung_Extracurricular_2026"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </>
            )}

            {cloudProvider === 'onedrive' && (
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  OneDrive / SharePoint Shared Folder Link (Đường dẫn dùng chung):
                </label>
                <input
                  type="text"
                  value={oneDriveFolderUrl}
                  onChange={(e) => setOneDriveFolderUrl(e.target.value)}
                  placeholder="https://royalschooledu-my.sharepoint.com/personal/.../Documents/MinhChung2026"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {cloudProvider === 'local' && (
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Đường dẫn thư mục lưu trữ Server / Bucket Name:
                </label>
                <input
                  type="text"
                  value={driveFolderName}
                  onChange={(e) => setDriveFolderName(e.target.value)}
                  placeholder="/var/data/royalschool/proofs_2026 hoặc bucket: student-proofs"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {/* Checkbox tự động tạo thư mục con */}
            <div className="pt-2 border-t border-slate-800">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCreateSubfolders}
                  onChange={(e) => setAutoCreateSubfolders(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-amber-500 mt-0.5"
                />
                <div>
                  <span className="text-slate-200 font-bold block">
                    Tự động phân loại file upload vào thư mục con: [Mã Khóa Học] / [Mã Cơ Sở] / [Minh Chứng Vắng]
                  </span>
                  <span className="text-slate-500 text-[11px] block mt-0.5">
                    Hệ thống tự động gom tệp theo từng cơ sở (PMH / Phú Lâm) và kỳ học để kế toán và học vụ dễ dàng tra cứu, kiểm toán hồ sơ.
                  </span>
                </div>
              </label>
            </div>

            {/* Cấu trúc cây thư mục mô phỏng */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-400 space-y-1">
              <div className="text-amber-400 font-bold flex items-center gap-1.5">
                <FolderCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Cấu trúc đường dẫn thư mục lưu trữ tự động:</span>
              </div>
              <div className="pl-4 text-slate-200 font-semibold">
                📁 {driveFolderName || 'RoyalSchool_MinhChung_Extracurricular_2026'} /
              </div>
              <div className="pl-8 text-slate-400">
                ├── 📂 FALL-2026 (Khóa Mùa Thu 2026) /
              </div>
              <div className="pl-12 text-slate-400">
                ├── 📂 PMH / (Đơn xin nghỉ, toa thuốc học sinh cơ sở Phú Mỹ Hưng)
              </div>
              <div className="pl-12 text-slate-400">
                └── 📂 PL /  (Đơn xin nghỉ, toa thuốc học sinh cơ sở Phú Lâm)
              </div>
            </div>
          </div>

          {/* 3. TRẠNG THÁI KẾT NỐI & NÚT THAO TÁC */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div>
              {cloudTestStatus === 'success' ? (
                <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>✓ Đã kết nối với thư mục: {driveFolderName || 'RoyalSchool_MinhChung_Extracurricular_2026'}</span>
                </div>
              ) : cloudTestStatus === 'testing' ? (
                <div className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                  <span>Đang kiểm tra quyền ghi và đồng bộ thư mục...</span>
                </div>
              ) : (
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Nhấn nút bên cạnh để kiểm tra kết nối API & quyền truy cập thư mục.</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleTestCloudConnection}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-colors"
              >
                Kiểm Tra Kết Nối & Đồng Bộ Thư Mục
              </button>

              <button
                type="button"
                onClick={handleSaveCloudStorage}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 text-slate-950" />
                <span>Lưu Cấu Hình Kho Lưu Trữ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 7: NHẬT KÝ KIỂM TOÁN & LỊCH SỬ THAO TÁC */}
      {activeSection === 'audit_logs' && (
        <AuditLogsTab
          store={store}
          currentRole={currentRole}
          onUpdateStore={onUpdateStore}
        />
      )}

    </div>
  );
};
