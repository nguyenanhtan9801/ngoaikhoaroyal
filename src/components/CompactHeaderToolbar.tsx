import React from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  ChevronRight, 
  Sparkles,
  Layers,
  Award,
  Users,
  School,
  Calendar,
  DollarSign,
  Coffee,
  BookmarkCheck,
  Receipt,
  Settings,
  HeartPulse,
  ArrowRightLeft,
  UserCheck,
  CheckCircle2
} from 'lucide-react';

interface CompactHeaderToolbarProps {
  currentRoute: string;
  onExportExcel: () => void;
  onPrintReport: () => void;
}

export const CompactHeaderToolbar: React.FC<CompactHeaderToolbarProps> = ({
  currentRoute,
  onExportExcel,
  onPrintReport,
}) => {
  // Breadcrumb mapping for the 5 Modular Groups & 12 Deduplicated Routes
  const routeMeta: Record<string, { parent: string; title: string; icon: any; badge?: string }> = {
    // Nhóm 1: Tổng Quan & Báo Cáo
    sub_kpi: { parent: 'Tổng Quan & Báo Cáo', title: 'Tổng Quan KPI & Hiệu Suất', icon: Layers, badge: 'Chỉ Số Hiệu Suất' },
    
    // Nhóm 2: Đào Tạo & Vận Hành
    sub_term_subjects: { parent: 'Đào Tạo & Vận Hành', title: 'Môn Học & Khóa Học (Trung Tâm)', icon: School, badge: 'Môn & Khóa Học' },
    sub_pricing: { parent: 'Đào Tạo & Vận Hành', title: 'Ma Trận Biểu Phí Cơ Sở', icon: DollarSign, badge: 'Cơ Sở × Khóa × Môn' },
    sub_classes: { parent: 'Đào Tạo & Vận Hành', title: 'Lớp Học Ngoại Khóa (Cơ Sở)', icon: Calendar, badge: 'Phòng Sân & GV' },
    sub_attendance: { parent: 'Đào Tạo & Vận Hành', title: 'Sổ Điểm Danh & Dạy Thay', icon: CheckCircle2, badge: 'Chuyên Cần & Bù Trừ' },
    sub_snacks: { parent: 'Đào Tạo & Vận Hành', title: 'Báo Cáo Đối Soát Bánh Sữa', icon: Coffee, badge: 'Độc Quyền Royal' },
    
    // Nhóm 3: Học Viên & Tuyển Sinh
    sub_students: { parent: 'Học Viên & Tuyển Sinh', title: 'Hồ Sơ Học Viên & Y Tế', icon: HeartPulse, badge: 'Royal & Y Tế' },
    sub_parents: { parent: 'Học Viên & Tuyển Sinh', title: 'Đơn Đăng Ký Tuyển Sinh', icon: Users, badge: 'Cổng Phụ Huynh' },
    sub_credits: { parent: 'Học Viên & Tuyển Sinh', title: 'Sổ Bảo Lưu & Cấn Trừ Học Phí', icon: BookmarkCheck, badge: 'Hạn 365 Ngày' },
    
    // Nhóm 4: Tài Chính & Kế Toán
    sub_finance_invoices: { parent: 'Tài Chính & Kế Toán', title: 'Thu Học Phí & Mã VietQR', icon: Receipt, badge: 'Napas247' },
    sub_finance_payroll: { parent: 'Tài Chính & Kế Toán', title: 'Quyết Toán Thù Lao Giáo Viên', icon: UserCheck, badge: 'Cơ Hữu & Thỉnh Giảng' },
    sub_finance_transfer: { parent: 'Tài Chính & Kế Toán', title: 'Biến Động Chuyển Lớp & Phụ Thu', icon: ArrowRightLeft, badge: 'Bù Trừ Chênh Lệch' },
    
    // Nhóm 5: Hệ Thống & Danh Mục
    sub_settings: { parent: 'Hệ Thống & Danh Mục', title: 'Quản Trị Dữ Liệu & Master Excel', icon: Settings, badge: 'Quản Trị Viên' },
    
    // Fallback legacy routes
    sub_finance: { parent: 'Tài Chính & Kế Toán', title: 'Doanh Thu & Quyết Toán Thù Lao', icon: Receipt, badge: 'Kế Toán' },
    sub_finance_clearance: { parent: 'Tài Chính & Kế Toán', title: 'Thu Học Phí & Mã VietQR', icon: Receipt },
    sub_students_health: { parent: 'Học Viên & Tuyển Sinh', title: 'Hồ Sơ Học Viên & Y Tế', icon: HeartPulse, badge: 'Y Tế' },
  };

  const current = routeMeta[currentRoute] || {
    parent: 'Hệ Thống',
    title: 'Quản Lý Ngoại Khóa Royal School',
    icon: Sparkles,
  };

  const Icon = current.icon;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-0.5">
      {/* Compact Breadcrumb + Page Title */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>

        <div className="min-w-0">
          {/* Breadcrumb line */}
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 font-medium leading-none">
            <span>Royal School</span>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-slate-300">{current.parent}</span>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-amber-400 font-bold truncate">{current.title}</span>
          </div>

          {/* Clean concise title */}
          <div className="flex items-center gap-2 mt-0.5">
            <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight truncate">
              {current.title}
            </h1>
            {current.badge && (
              <span className="px-2 py-0.2 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[9px] font-bold shrink-0">
                {current.badge}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Action Buttons on the same row */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onExportExcel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          title="Xuất Master Workbook 10 Sheets đồng bộ SheetJS"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
          <span>Xuất Toàn Bộ Excel</span>
        </button>

        <button
          onClick={onPrintReport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs border border-slate-700 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
          title="In ấn và xuất báo cáo PDF chuẩn nhận diện Royal School"
        >
          <Printer className="w-3.5 h-3.5 text-slate-300" />
          <span>In Báo Cáo</span>
        </button>
      </div>
    </div>
  );
};
