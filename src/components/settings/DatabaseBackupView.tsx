import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  CheckCircle2, 
  RefreshCw, 
  HardDrive, 
  Layers,
  Table,
  Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getSupabaseClient, supabase } from '../../supabaseClient';
import { AppStore } from '../../types';
import { showToast } from '../../lib/toast';

interface DatabaseBackupViewProps {
  store?: AppStore;
}

export const ROYAL_DATABASE_TABLES = [
  { name: 'campuses', label: '01. Cơ sở & Ngân hàng VietQR' },
  { name: 'academic_terms', label: '02. Khóa học & Niên khóa tuyển sinh' },
  { name: 'subject_categories', label: '03. Nhóm phân loại môn học' },
  { name: 'subjects', label: '04. Danh mục môn học & Biểu phí' },
  { name: 'teachers', label: '05. Hồ sơ giáo viên & Định mức thù lao' },
  { name: 'facilities', label: '06. Cơ sở vật chất & Phòng học' },
  { name: 'time_slots', label: '07. Khung giờ học (TKB)' },
  { name: 'holidays', label: '08. Danh sách ngày nghỉ lễ' },
  { name: 'extracurricular_classes', label: '09. Danh sách lớp học ngoại khóa' },
  { name: 'students', label: '10. Hồ sơ học viên Royal & Ngoài trường' },
  { name: 'enrollments', label: '11. Ghi danh xếp lớp & Học thử' },
  { name: 'attendance_records', label: '12. Sổ điểm danh học sinh' },
  { name: 'teacher_work_sessions', label: '13. Chấm công giáo viên & Dạy thay' },
  { name: 'tuition_invoices', label: '14. Hóa đơn học phí VietQR & Gạch nợ' },
  { name: 'credit_notes', label: '15. Phiếu bảo lưu & Cấn trừ học phí' },
  { name: 'parent_registrations', label: '16. Đơn đăng ký tuyển sinh phụ huynh' },
  { name: 'term_subjects', label: '17. Biểu phí môn học theo khóa' },
  { name: 'campus_subject_fees', label: '18. Biểu phí môn theo từng cơ sở' },
  { name: 'app_users', label: '19. Tài khoản hệ thống & Phân quyền' }
];

export const DatabaseBackupView: React.FC<DatabaseBackupViewProps> = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<string>('');
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);

  // Truy vấn dữ liệu thực tế của một bảng từ Supabase
  const fetchTableData = async (tableName: string): Promise<any[]> => {
    const client = getSupabaseClient() || supabase;
    if (!client) throw new Error('Không thể kết nối Supabase Client');

    const { data, error } = await client.from(tableName).select('*');
    if (error) {
      console.warn(`Lỗi đọc bảng ${tableName}:`, error.message);
      return [];
    }
    return data || [];
  };

  // Đếm số dòng thực tế của từng bảng trên Supabase
  const refreshCounts = async () => {
    setIsLoadingCounts(true);
    const client = getSupabaseClient() || supabase;
    if (!client) {
      setIsLoadingCounts(false);
      return;
    }
    const counts: Record<string, number> = {};
    for (const tbl of ROYAL_DATABASE_TABLES) {
      try {
        const { count, error } = await client.from(tbl.name).select('*', { count: 'exact', head: true });
        counts[tbl.name] = (!error && typeof count === 'number') ? count : 0;
      } catch {
        counts[tbl.name] = 0;
      }
    }
    setTableCounts(counts);
    setIsLoadingCounts(false);
  };

  useEffect(() => {
    refreshCounts();
  }, []);

  // 1. Xuất toàn bộ CSDL ra 1 file Excel (.xlsx) gồm đầy đủ các Sheet
  const handleExportFullExcel = async () => {
    setIsExporting(true);
    setCurrentProgress('Đang kết nối Supabase...');
    try {
      const wb = XLSX.utils.book_new();
      const today = new Date().toISOString().split('T')[0];

      for (let i = 0; i < ROYAL_DATABASE_TABLES.length; i++) {
        const tbl = ROYAL_DATABASE_TABLES[i];
        setCurrentProgress(`Đang trích xuất dữ liệu: ${tbl.name} (${i + 1}/${ROYAL_DATABASE_TABLES.length})...`);
        const rows = await fetchTableData(tbl.name);
        const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Note: 'Bảng chưa có dữ liệu' }]);
        const sheetName = tbl.name.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      setCurrentProgress('Đang đóng gói file Excel...');
      XLSX.writeFile(wb, `RoyalSchool_Backup_CSDL_${today}.xlsx`);
      showToast('Đã tải thành công tệp Excel sao lưu toàn bộ CSDL!', 'success');
    } catch (err: any) {
      console.error('Lỗi export Excel:', err);
      showToast('Lỗi khi sao lưu Excel: ' + (err.message || String(err)), 'error');
    } finally {
      setIsExporting(false);
      setCurrentProgress('');
    }
  };

  // 2. Xuất 1 bảng ra file CSV
  const handleExportSingleCSV = async (tableName: string) => {
    try {
      const rows = await fetchTableData(tableName);
      if (rows.length === 0) {
        showToast(`Bảng ${tableName} hiện đang rỗng!`, 'warning');
        return;
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Đã tải file ${tableName}.csv!`, 'success');
    } catch (err: any) {
      showToast('Không thể xuất CSV: ' + err.message, 'error');
    }
  };

  // 3. Tải tất cả các bảng thành từng file CSV
  const handleExportAllCSVs = async () => {
    setIsExporting(true);
    try {
      for (const tbl of ROYAL_DATABASE_TABLES) {
        setCurrentProgress(`Đang tải CSV bảng ${tbl.name}...`);
        await handleExportSingleCSV(tbl.name);
        await new Promise(r => setTimeout(r, 250));
      }
      showToast('Đã tải toàn bộ file CSV về máy!', 'success');
    } catch (err: any) {
      showToast('Lỗi khi xuất CSV: ' + err.message, 'error');
    } finally {
      setIsExporting(false);
      setCurrentProgress('');
    }
  };

  // 4. Xuất file JSON toàn hệ thống
  const handleExportFullJSON = async () => {
    setIsExporting(true);
    setCurrentProgress('Đang trích xuất JSON toàn bộ CSDL...');
    try {
      const fullBackup: Record<string, any[]> = {};
      for (const tbl of ROYAL_DATABASE_TABLES) {
        fullBackup[tbl.name] = await fetchTableData(tbl.name);
      }
      const jsonStr = JSON.stringify(fullBackup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RoyalSchool_Backup_JSON_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Đã tải thành công file JSON toàn bộ CSDL!', 'success');
    } catch (err: any) {
      showToast('Lỗi khi xuất JSON: ' + err.message, 'error');
    } finally {
      setIsExporting(false);
      setCurrentProgress('');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Banner Trung Tâm Sao Lưu */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-[#0B0F19] to-slate-900 border border-slate-800 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-13 h-13 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/10">
            <Database className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <span>Sao Lưu Toàn Bộ CSDL Supabase</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                Trực Tiếp Từ Cloud
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Trích xuất toàn bộ dữ liệu thực tế từ Cloud về máy tính dưới định dạng tệp Excel (.xlsx) đa Sheet, file CSV từng bảng hoặc JSON.
            </p>
          </div>
        </div>

        {/* Cụm Nút Tải Nhanh */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleExportFullExcel}
            disabled={isExporting}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Tải Toàn Bộ (File Excel .xlsx)</span>
          </button>
          <button
            type="button"
            onClick={handleExportAllCSVs}
            disabled={isExporting}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-slate-950" />
            <span>Tải Toàn Bộ File CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportFullJSON}
            disabled={isExporting}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-cyan-400" />
            <span>Tải File JSON</span>
          </button>
        </div>
      </div>

      {/* Thông báo tiến trình */}
      {isExporting && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3 animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
          <span>{currentProgress || 'Đang kết nối và trích xuất dữ liệu từ Supabase Cloud...'}</span>
        </div>
      )}

      {/* Bảng Danh Sách Các Bảng & Tải CSV Lẻ */}
      <div className="rounded-3xl bg-[#111827]/90 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Danh Mục Toàn Bộ Bảng Dữ Liệu Thực Tế Trên Supabase
            </span>
          </div>
          <button
            type="button"
            onClick={refreshCounts}
            disabled={isLoadingCounts}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isLoadingCounts ? 'animate-spin' : ''}`} />
            <span>Làm Mới Số Bản Ghi</span>
          </button>
        </div>

        <div className="divide-y divide-slate-800/60">
          {ROYAL_DATABASE_TABLES.map((tbl, idx) => {
            const rowCount = tableCounts[tbl.name] ?? 0;
            return (
              <div 
                key={tbl.name}
                className="p-3.5 px-5 flex items-center justify-between hover:bg-slate-800/30 transition-colors text-xs"
              >
                <div className="flex items-center gap-3.5">
                  <span className="w-6 font-mono text-slate-500 font-bold">{String(idx + 1).padStart(2, '0')}.</span>
                  <div>
                    <div className="font-bold text-white font-mono text-xs flex items-center gap-2">
                      <span>{tbl.name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400 font-sans">
                        PostgreSQL
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{tbl.label}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs font-bold">
                    {rowCount} bản ghi
                  </span>
                  <button
                    type="button"
                    onClick={() => handleExportSingleCSV(tbl.name)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-amber-500/40 text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    title={`Tải file ${tbl.name}.csv`}
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tải CSV</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
