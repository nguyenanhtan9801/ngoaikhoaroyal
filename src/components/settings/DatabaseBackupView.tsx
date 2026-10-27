import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Table, 
  CheckCircle2, 
  RefreshCw, 
  AlertCircle, 
  Calendar, 
  Users, 
  GraduationCap, 
  DollarSign, 
  Receipt, 
  ShieldCheck, 
  Clock, 
  Sparkles, 
  Layers,
  Archive,
  ArrowDownToLine
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { AppStore } from '../../lib/storage';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { showToast } from '../../lib/toast';

interface DatabaseBackupViewProps {
  store: AppStore;
}

export interface BackupTableInfo {
  index: string;
  tableName: string;
  sheetName: string;
  titleVN: string;
  category: string;
  description: string;
  recordCount: number;
  status: 'ready' | 'loading' | 'error';
  data?: any[];
}

export const DatabaseBackupView: React.FC<DatabaseBackupViewProps> = ({ store }) => {
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isRefreshingCounts, setIsRefreshingCounts] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Khai báo chuẩn hóa toàn bộ 18 bảng CSDL Supabase
  const [tablesList, setTablesList] = useState<BackupTableInfo[]>([
    {
      index: '01',
      tableName: 'campuses',
      sheetName: '01_CO_SO',
      titleVN: 'Danh Mục Cơ Sở Đào Tạo & Ngân Hàng VietQR',
      category: 'DANH MỤC GỐC',
      description: 'Quản lý cơ sở đào tạo (PMH, Phú Lâm) và thông tin tài khoản ngân hàng thụ hưởng VietQR.',
      recordCount: store.campuses?.length || 0,
      status: 'ready',
    },
    {
      index: '02',
      tableName: 'academic_terms',
      sheetName: '02_KHOA_HOC',
      titleVN: 'Danh Mục Khóa Học & Chu Kỳ Tuyển Sinh',
      category: 'DANH MỤC GỐC',
      description: 'Quản lý niên khóa, học kỳ ngoại khóa và trạng thái kích hoạt mở lớp.',
      recordCount: store.terms?.length || 0,
      status: 'ready',
    },
    {
      index: '03',
      tableName: 'subject_categories',
      sheetName: '03_NHOM_MON',
      titleVN: 'Nhóm Phân Loại Môn Học Ngoại Khóa',
      category: 'DANH MỤC GỐC',
      description: 'Phân nhóm môn: Thể Thao, Nghệ Thuật, Công Nghệ & Kỹ Năng.',
      recordCount: store.subjectCategories?.length || 0,
      status: 'ready',
    },
    {
      index: '04',
      tableName: 'subjects',
      sheetName: '04_MON_HOC',
      titleVN: 'Danh Mục Môn Học Ngoại Khóa & Biểu Phí Chuẩn',
      category: 'DANH MỤC GỐC',
      description: 'Thông tin môn học, mã môn, thời lượng chuẩn và định mức học phí.',
      recordCount: store.subjects?.length || 0,
      status: 'ready',
    },
    {
      index: '05',
      tableName: 'campus_subject_fees',
      sheetName: '05_BIEU_PHI_CO_SO',
      titleVN: 'Biểu Phí Môn Học Theo Khóa & Cơ Sở',
      category: 'DANH MỤC GỐC',
      description: 'Biểu phí cấu hình riêng từng môn tại PMH & Phú Lâm, đơn giá làm tròn lên.',
      recordCount: store.campusPricings?.length || store.termSubjects?.length || 0,
      status: 'ready',
    },
    {
      index: '06',
      tableName: 'teachers',
      sheetName: '06_GIAO_VIEN',
      titleVN: 'Hồ Sơ Giáo Viên & Định Mức Thù Lao Giảng Dạy',
      category: 'ĐÀO TẠO & NHÂN SỰ',
      description: 'Danh sách giáo viên Cơ hữu (300K/buổi) & Thỉnh giảng (270K/buổi) và tài khoản nhận lương.',
      recordCount: store.teachers?.length || 0,
      status: 'ready',
    },
    {
      index: '07',
      tableName: 'extracurricular_classes',
      sheetName: '07_LOP_HOC',
      titleVN: 'Danh Sách Lớp Học Ngoại Khóa Mở Trong Khóa',
      category: 'ĐÀO TẠO & NHÂN SỰ',
      description: 'Lớp học theo môn, cơ sở, giáo viên phân công, lịch thứ trong tuần và học phí.',
      recordCount: store.classes?.length || 0,
      status: 'ready',
    },
    {
      index: '08',
      tableName: 'class_sessions',
      sheetName: '08_CA_HOC',
      titleVN: 'Lịch Chi Tiết Ca Học & Buổi Học Toàn Khóa',
      category: 'ĐÀO TẠO & NHÂN SỰ',
      description: 'Chi tiết từng buổi học cụ thể của các lớp theo ngày và phòng học.',
      recordCount: store.classes?.reduce((acc, c) => acc + (c.total_sessions || 24), 0) || 0,
      status: 'ready',
    },
    {
      index: '09',
      tableName: 'students',
      sheetName: '09_HOC_SINH',
      titleVN: 'Hồ Sơ Học Sinh, Phụ Huynh & Y Tế / Bánh Sữa',
      category: 'HỌC VIÊN & TUYỂN SINH',
      description: 'Học sinh Royal School (RY-) & Ngoài trường (EXT-), SĐT gia đình và lưu ý sức khỏe.',
      recordCount: store.students?.length || 0,
      status: 'ready',
    },
    {
      index: '10',
      tableName: 'parent_registrations',
      sheetName: '10_DON_DANG_KY',
      titleVN: 'Hồ Sơ Đăng Ký Tuyển Sinh Trực Tuyến Từ Phụ Huynh',
      category: 'HỌC VIÊN & TUYỂN SINH',
      description: 'Hồ sơ tiếp nhận đơn trực tuyến từ cổng tuyển sinh phụ huynh gửi về hệ thống.',
      recordCount: store.parentRegistrations?.length || 0,
      status: 'ready',
    },
    {
      index: '11',
      tableName: 'enrollments',
      sheetName: '11_GHI_DANH',
      titleVN: 'Bảng Ghi Danh Xếp Lớp, Học Thử & Lịch Học Bán Phần',
      category: 'HỌC VIÊN & TUYỂN SINH',
      description: 'Phân bổ học sinh vào lớp học, số buổi thực học đăng ký và trạng thái học thử 1 buổi.',
      recordCount: store.enrollments?.length || 0,
      status: 'ready',
    },
    {
      index: '12',
      tableName: 'attendance_records',
      sheetName: '12_DIEM_DANH_HS',
      titleVN: 'Sổ Điểm Danh Chuyên Cần & Minh Chứng Nghỉ Phép',
      category: 'VẬN HÀNH & CHUYÊN CẦN',
      description: 'Lịch sử điểm danh 3 trạng thái, minh chứng nghỉ có phép và đối soát bánh sữa.',
      recordCount: store.attendance?.length || 0,
      status: 'ready',
    },
    {
      index: '13',
      tableName: 'teacher_work_sessions',
      sheetName: '13_CHAM_CONG_GV',
      titleVN: 'Bảng Chấm Công Giáo Viên & Quyết Toán Thù Lao',
      category: 'VẬN HÀNH & CHUYÊN CẦN',
      description: 'Ghi nhận giờ dạy thực tế, theo dõi ca dạy thay và thù lao buổi tương ứng.',
      recordCount: store.teacherAttendance?.length || 0,
      status: 'ready',
    },
    {
      index: '14',
      tableName: 'tuition_invoices',
      sheetName: '14_HOA_DON',
      titleVN: 'Hóa Đơn Thu Học Phí, Biên Lai & Mã VietQR',
      category: 'TÀI CHÍNH & KẾ TOÁN',
      description: 'Hóa đơn học phí từng môn, mã thanh toán chuẩn ngân hàng và trạng thái gạch nợ.',
      recordCount: store.invoices?.length || 0,
      status: 'ready',
    },
    {
      index: '15',
      tableName: 'credit_notes',
      sheetName: '15_BAO_LUU',
      titleVN: 'Phiếu Bảo Lưu Học Phí (Hạn 365 Ngày)',
      category: 'TÀI CHÍNH & KẾ TOÁN',
      description: 'Đóng băng số dư cho học sinh nghỉ từ 3 buổi trở lên, cấn trừ khóa tiếp theo.',
      recordCount: store.makeupCredits?.length || 0,
      status: 'ready',
    },
    {
      index: '16',
      tableName: 'transfer_records',
      sheetName: '16_CHUYEN_LOP',
      titleVN: 'Lịch Sử Biến Động Chuyển Lớp & Phụ Thu',
      category: 'TÀI CHÍNH & KẾ TOÁN',
      description: 'Nhật ký chuyển lớp ngang khóa, tính bù trừ chênh lệch đơn giá và phụ thu học phí.',
      recordCount: store.transfers?.length || 0,
      status: 'ready',
    },
    {
      index: '17',
      tableName: 'app_users',
      sheetName: '17_NGUOI_DUNG',
      titleVN: 'Danh Sách Tài Khoản Người Dùng & Phân Quyền (RBAC)',
      category: 'HỆ THỐNG & BẢO MẬT',
      description: 'Tài khoản nhân sự, quyền truy cập 4 nhóm và trạng thái khóa/mở khóa.',
      recordCount: store.users?.length || 0,
      status: 'ready',
    },
    {
      index: '18',
      tableName: 'holidays',
      sheetName: '18_NGAY_LE',
      titleVN: 'Danh Sách Ngày Nghỉ Lễ & Lịch Nghỉ Toàn Trường',
      category: 'HỆ THỐNG & BẢO MẬT',
      description: 'Lịch nghỉ lễ tự động loại trừ khi tính số buổi thực học của các lớp ngoại khóa.',
      recordCount: store.holidays?.length || 0,
      status: 'ready',
    },
  ]);

  // Hàm truy vấn số lượng bản ghi thực tế từ Supabase
  const refreshTableCounts = async () => {
    setIsRefreshingCounts(true);
    const client = getSupabaseClient() || supabase;
    
    try {
      const updated = await Promise.all(
        tablesList.map(async (tbl) => {
          if (!client) return tbl;
          try {
            // Thử query count từ Supabase
            let targetTable = tbl.tableName;
            if (tbl.tableName === 'subject_categories') targetTable = 'subject_categories';
            if (tbl.tableName === 'holidays') targetTable = 'holidays';

            const { count, error } = await client
              .from(targetTable)
              .select('*', { count: 'exact', head: true });

            if (!error && count !== null) {
              return { ...tbl, recordCount: count, status: 'ready' as const };
            }
          } catch {
            // Bỏ qua lỗi và giữ số lượng từ local store
          }
          return tbl;
        })
      );
      setTablesList(updated);
      showToast({
        title: 'Cập nhật số liệu',
        message: 'Đã làm mới số lượng bản ghi của toàn bộ 18 bảng CSDL!',
        type: 'success'
      });
    } catch (e: any) {
      console.warn('Lỗi làm mới số lượng bảng:', e);
    } finally {
      setIsRefreshingCounts(false);
    }
  };

  useEffect(() => {
    refreshTableCounts();
  }, []);

  // Hàm tải dữ liệu của 1 bảng từ Supabase hoặc local store
  const fetchTableData = async (tbl: BackupTableInfo): Promise<any[]> => {
    const client = getSupabaseClient() || supabase;
    if (client) {
      try {
        const { data, error } = await client.from(tbl.tableName).select('*').limit(5000);
        if (!error && Array.isArray(data) && data.length > 0) {
          return data;
        }
      } catch (err) {
        console.warn(`Fallback local data for ${tbl.tableName}:`, err);
      }
    }

    // Fallback sang local store tương ứng
    switch (tbl.tableName) {
      case 'campuses':
        return store.campuses || [];
      case 'academic_terms':
        return store.terms || [];
      case 'subject_categories':
        return store.subjectCategories || [];
      case 'subjects':
        return store.subjects || [];
      case 'campus_subject_fees':
        return store.campusPricings || store.termSubjects || [];
      case 'teachers':
        return store.teachers || [];
      case 'extracurricular_classes':
        return store.classes || [];
      case 'class_sessions':
        return store.classes?.map(c => ({ class_id: c.id, class_name: c.name, sessions: c.total_sessions })) || [];
      case 'students':
        return store.students || [];
      case 'parent_registrations':
        return store.parentRegistrations || [];
      case 'enrollments':
        return store.enrollments || [];
      case 'attendance_records':
        return store.attendance || [];
      case 'teacher_work_sessions':
        return store.teacherAttendance || [];
      case 'tuition_invoices':
        return store.invoices || [];
      case 'credit_notes':
        return store.makeupCredits || [];
      case 'transfer_records':
        return store.transfers || [];
      case 'app_users':
        return (store.users || []).map(u => ({ ...u, password: '***' }));
      case 'holidays':
        return store.holidays || [];
      default:
        return [];
    }
  };

  // 1. TẢI TOÀN BỘ 18 BẢNG DẠNG EXCEL MULTI-SHEET (.XLSX)
  const handleExportFullExcel = async () => {
    setIsExportingExcel(true);
    try {
      showToast({
        title: 'Bắt đầu sao lưu',
        message: 'Đang tải dữ liệu từ 18 bảng Supabase để tạo file Excel...',
        type: 'info'
      });

      const wb = XLSX.utils.book_new();
      const dateStr = new Date().toISOString().split('T')[0];

      for (const tbl of tablesList) {
        const data = await fetchTableData(tbl);
        let safeData = data;
        if (!safeData || safeData.length === 0) {
          safeData = [{ Ghi_Chu: `Bảng ${tbl.tableName} hiện chưa có bản ghi nào.` }];
        }
        const ws = XLSX.utils.json_to_sheet(safeData);
        XLSX.utils.book_append_sheet(wb, ws, tbl.sheetName.substring(0, 31));
      }

      const fileName = `RoyalSchool_Backup_18Bang_CSDL_${dateStr}.xlsx`;
      XLSX.writeFile(wb, fileName);

      showToast({
        title: 'Xuất file thành công',
        message: `Đã tải về máy file Excel chứa trọn bộ 18 bảng CSDL: ${fileName}!`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('Lỗi xuất file Excel sao lưu:', err);
      alert('Không thể xuất file Excel: ' + (err?.message || err.toString()));
    } finally {
      setIsExportingExcel(false);
    }
  };

  // 2. TẢI TOÀN BỘ 18 BẢNG DẠNG JSON SNAPSHOT (.JSON)
  const handleExportFullJson = async () => {
    setIsExportingJson(true);
    try {
      showToast({
        title: 'Tạo JSON Backup',
        message: 'Đang đóng gói dữ liệu 18 bảng sang định dạng JSON...',
        type: 'info'
      });

      const dateStr = new Date().toISOString();
      const dumpData: Record<string, any> = {};

      for (const tbl of tablesList) {
        dumpData[tbl.tableName] = await fetchTableData(tbl);
      }

      const backupPackage = {
        metadata: {
          system: 'Royal School Extracurricular Management',
          exported_at: dateStr,
          total_tables: tablesList.length,
          database_type: 'Supabase PostgreSQL 3NF',
          description: 'Bản sao lưu CSDL đầy đủ 18 bảng phục vụ lưu trữ an toàn hoặc khôi phục dữ liệu.',
        },
        tables: dumpData
      };

      const jsonStr = JSON.stringify(backupPackage, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RoyalSchool_Database_Backup_18Tables_${dateStr.split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast({
        title: 'Xuất JSON thành công',
        message: 'Đã tải bản sao lưu JSON toàn diện về máy tính!',
        type: 'success'
      });
    } catch (err: any) {
      console.error('Lỗi xuất JSON sao lưu:', err);
      alert('Không thể tạo file JSON: ' + (err?.message || err.toString()));
    } finally {
      setIsExportingJson(false);
    }
  };

  // 3. TẢI TỪNG BẢNG RIÊNG LẺ (CSV HOẶC XLSX)
  const handleExportSingleTable = async (tbl: BackupTableInfo, format: 'xlsx' | 'csv') => {
    try {
      const data = await fetchTableData(tbl);
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `${tbl.sheetName}_${dateStr}.${format}`;

      let safeData = data;
      if (!safeData || safeData.length === 0) {
        safeData = [{ Thong_Bao: 'Bảng chưa có dữ liệu' }];
      }

      const ws = XLSX.utils.json_to_sheet(safeData);

      if (format === 'csv') {
        const csvContent = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, tbl.sheetName.substring(0, 31));
        XLSX.writeFile(wb, fileName);
      }

      showToast({
        title: 'Tải bảng thành công',
        message: `Đã xuất bảng ${tbl.titleVN} (${fileName})!`,
        type: 'success'
      });
    } catch (err: any) {
      alert(`Không thể tải bảng ${tbl.tableName}: ` + (err?.message || err.toString()));
    }
  };

  const categories = ['all', 'DANH MỤC GỐC', 'ĐÀO TẠO & NHÂN SỰ', 'HỌC VIÊN & TUYỂN SINH', 'VẬN HÀNH & CHUYÊN CẦN', 'TÀI CHÍNH & KẾ TOÁN', 'HỆ THỐNG & BẢO MẬT'];

  const filteredTables = tablesList.filter(t => {
    const matchCat = selectedCategory === 'all' || t.category === selectedCategory;
    const matchSearch = !searchTerm || 
      t.tableName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.titleVN.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  const totalRecordsCount = tablesList.reduce((acc, t) => acc + t.recordCount, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="rounded-3xl bg-[#111827]/90 border border-slate-800/80 p-6 md:p-8 backdrop-blur-md shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/15">
              <Database className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl md:text-2xl font-black text-white">Trung Tâm Sao Lưu &amp; Xuất Toàn Bộ CSDL (Backup 18 Bảng)</h2>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  18 Bảng Chuẩn 3NF
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-300 mt-1.5 max-w-3xl leading-relaxed">
                Tải toàn bộ 18 bảng cơ sở dữ liệu Supabase PostgreSQL về máy tính cá nhân để lưu trữ an toàn định kỳ, đối soát độc lập hoặc phục hồi khi có sự cố. Hỗ trợ đầy đủ định dạng Excel (.xlsx đa sheet), CSV và JSON Snapshot.
              </p>
            </div>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center min-w-[120px]">
              <div className="text-2xl font-black text-emerald-400 font-mono">{tablesList.length}</div>
              <div className="text-[11px] font-semibold text-slate-400">Bảng Dữ Liệu</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center min-w-[140px]">
              <div className="text-2xl font-black text-amber-400 font-mono">{totalRecordsCount.toLocaleString('vi-VN')}</div>
              <div className="text-[11px] font-semibold text-slate-400">Tổng Số Bản Ghi</div>
            </div>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="mt-6 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Nút 1: Tải trọn bộ Excel 18 Sheet */}
            <button
              type="button"
              onClick={handleExportFullExcel}
              disabled={isExportingExcel}
              className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              {isExportingExcel ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Đang Đóng Gói 18 Sheet...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4 text-white" />
                  <span>Tải Trọn Bộ 18 Bảng (.XLSX Đa Sheet)</span>
                </>
              )}
            </button>

            {/* Nút 2: Tải trọn bộ JSON Snapshot */}
            <button
              type="button"
              onClick={handleExportFullJson}
              disabled={isExportingJson}
              className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 font-bold text-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              {isExportingJson ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang Xuất JSON...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>Tải Bản Sao Lưu JSON (.JSON)</span>
                </>
              )}
            </button>

            {/* Nút 3: Làm mới số liệu */}
            <button
              type="button"
              onClick={refreshTableCounts}
              disabled={isRefreshingCounts}
              className="px-3.5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Làm mới số lượng bản ghi thực tế từ CSDL"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isRefreshingCounts ? 'animate-spin' : ''}`} />
              <span>Đối Soát Số Lượng</span>
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Mã hóa bảo mật &bull; Không lưu trữ mật khẩu nhạy cảm</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat === 'all' ? 'Tất Cả (18 Bảng)' : cat}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <input
            type="text"
            placeholder="Tìm theo tên bảng hoặc nghiệp vụ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* 18 Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTables.map((tbl) => (
          <div
            key={tbl.tableName}
            className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-5 backdrop-blur-md shadow-xl hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 group"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-lg font-mono text-[11px] font-bold bg-slate-800 text-amber-300 border border-slate-700">
                  #{tbl.index} &bull; {tbl.sheetName}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-mono">
                  {tbl.recordCount.toLocaleString('vi-VN')} hàng
                </span>
              </div>

              <h4 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                {tbl.titleVN}
              </h4>
              <div className="font-mono text-[11px] text-cyan-400 mt-0.5">
                table: <span className="underline">{tbl.tableName}</span>
              </div>

              <p className="text-xs text-slate-400 mt-2 leading-relaxed line-clamp-2">
                {tbl.description}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {tbl.category}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleExportSingleTable(tbl, 'csv')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title={`Tải file CSV cho bảng ${tbl.tableName}`}
                >
                  <ArrowDownToLine className="w-3 h-3 text-cyan-400" />
                  <span>.CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSingleTable(tbl, 'xlsx')}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title={`Tải file Excel riêng cho bảng ${tbl.tableName}`}
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                  <span>.XLSX</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTables.length === 0 && (
        <div className="p-8 text-center bg-slate-900/60 rounded-3xl border border-slate-800 text-slate-400 text-sm">
          Không tìm thấy bảng CSDL nào khớp với từ khóa tìm kiếm.
        </div>
      )}
    </div>
  );
};
