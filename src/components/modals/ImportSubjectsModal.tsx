import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  Check,
  FileText,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Subject, SubjectCategory } from '../../types';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { showToast } from '../../lib/toast';
import { formatVND } from '../../lib/storage';

interface ImportSubjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: SubjectCategory[];
  existingSubjects: Subject[];
  onSuccess: (importedSubjects: Subject[]) => void;
}

interface ParsedSubjectRow {
  rowNum: number;
  rawCode: string;
  code: string;
  name: string;
  category_code: string;
  category_name: string;
  duration: number;
  sessions: number;
  fee: number;
  rate: number;
  description: string;
  status: 'valid' | 'update' | 'duplicate_in_file' | 'error';
  errorDetails?: string;
}

export const ImportSubjectsModal: React.FC<ImportSubjectsModalProps> = ({
  isOpen,
  onClose,
  categories,
  existingSubjects,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedSubjectRow[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 1. Tải file mẫu Excel / CSV chuẩn
  const downloadSampleTemplate = (type: 'xlsx' | 'csv' = 'xlsx') => {
    const sampleHeaders = [
      'Mã môn',
      'Tên môn',
      'Phân loại (SPORTS/TECH/ART/SKILLS)',
      'Thời lượng (phút)',
      'Số buổi chuẩn',
      'Học phí chuẩn',
      'Mô tả',
    ];

    const sampleData = [
      [
        'BASKET',
        'Bóng rổ Hoàng Gia (Royal Basketball Pro)',
        'SPORTS',
        90,
        24,
        3990000,
        'Rèn luyện thể lực, phản xạ, tinh thần đồng đội và kỹ thuật ném rổ chuẩn FIBA.',
      ],
      [
        'ROBOT_VEX',
        'Robotics VEX IQ & Trí Tuệ Nhân Tạo',
        'TECH',
        90,
        24,
        4800000,
        'Tư duy lập trình khối kéo thả Scratch, điều khiển robot thông minh và thuật toán STEM.',
      ],
      [
        'PIANO_K12',
        'Piano Cổ Điển & Cảm Thụ Âm Nhạc',
        'ART',
        60,
        16,
        3600000,
        'Phát triển cảm thụ thẩm mỹ, luyện ngón piano cơ bản đến nâng cao và biểu diễn sân khấu.',
      ],
      [
        'SURVIVAL',
        'Kỹ Năng Sống & Tự Vệ Thoát Hiểm',
        'SKILLS',
        90,
        16,
        3200000,
        'Kỹ năng sơ cấp cứu ban đầu, xử lý hỏa hoạn và kỹ thuật tự vệ học đường an toàn.',
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet([sampleHeaders, ...sampleData]);

    // Định dạng độ rộng cột
    ws['!cols'] = [
      { wch: 15 }, // Mã môn
      { wch: 42 }, // Tên môn
      { wch: 35 }, // Phân loại
      { wch: 18 }, // Thời lượng
      { wch: 16 }, // Số buổi
      { wch: 18 }, // Học phí
      { wch: 60 }, // Mô tả
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Muc_Mon_Hoc');

    const fileName = `Mau_Nhap_Mon_Hoc_RoyalSchool.${type}`;
    if (type === 'csv') {
      XLSX.writeFile(wb, fileName, { bookType: 'csv' });
    } else {
      XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
    }

    showToast(`Đã tải file mẫu ${fileName} thành công!`, 'info');
  };

  // 2. Chuẩn hóa & parse file Excel / CSV
  const normalizeKey = (key: string): string => {
    return key
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  const processFile = async (uploadedFile: File) => {
    setParseError(null);
    setIsProcessingFile(true);
    setFile(uploadedFile);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];

      if (!firstSheetName) {
        throw new Error('File không chứa trang tính (sheet) nào.');
      }

      const ws = wb.Sheets[firstSheetName];
      const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

      if (!Array.isArray(rawData) || rawData.length === 0) {
        throw new Error('File tính trống, không tìm thấy dữ liệu dòng nào.');
      }

      const seenCodes = new Set<string>();
      const existingCodes = new Set(existingSubjects.map(s => s.code.toUpperCase()));

      const parsed: ParsedSubjectRow[] = rawData.map((row, index) => {
        const rowNum = index + 2; // Dòng 1 là tiêu đề

        // Tìm kiếm các cột tương ứng
        let code = '';
        let name = '';
        let categoryInput = '';
        let duration = 90;
        let sessions = 24;
        let fee = 3600000;
        let description = '';

        for (const [k, v] of Object.entries(row)) {
          const norm = normalizeKey(k);
          const strVal = String(v ?? '').trim();

          if (norm.includes('mamon') || norm === 'code' || norm === 'subjectcode') {
            code = strVal.toUpperCase().replace(/\s+/g, '_');
          } else if (norm.includes('tenmon') || norm === 'name' || norm === 'subjectname') {
            name = strVal;
          } else if (norm.includes('phanloai') || norm.includes('nhom') || norm === 'category' || norm === 'categorycode') {
            categoryInput = strVal;
          } else if (norm.includes('thoiluong') || norm.includes('phut') || norm === 'duration') {
            const parsedDur = parseInt(strVal.replace(/[^0-9]/g, ''));
            if (!isNaN(parsedDur) && parsedDur > 0) duration = parsedDur;
          } else if (norm.includes('sobuoi') || norm.includes('buoi') || norm === 'sessions') {
            const parsedSessions = parseInt(strVal.replace(/[^0-9]/g, ''));
            if (!isNaN(parsedSessions) && parsedSessions > 0) sessions = parsedSessions;
          } else if (norm.includes('hocphi') || norm.includes('phi') || norm === 'fee' || norm === 'price') {
            const parsedFee = Number(strVal.replace(/[^0-9]/g, ''));
            if (!isNaN(parsedFee) && parsedFee >= 0) fee = parsedFee;
          } else if (norm.includes('mota') || norm.includes('ghichu') || norm === 'description') {
            description = strVal;
          }
        }

        // Tự động suy luận Phân loại môn (Category)
        let resolvedCategoryCode = 'SPORTS';
        let resolvedCategoryName = 'Thể thao';

        const matchCat = categories.find(c => {
          const cCode = c.code.toUpperCase();
          const cNameNorm = normalizeKey(c.name);
          const inputNorm = normalizeKey(categoryInput);
          return cCode === categoryInput.toUpperCase() || inputNorm.includes(cNameNorm) || cNameNorm.includes(inputNorm);
        });

        if (matchCat) {
          resolvedCategoryCode = matchCat.code;
          resolvedCategoryName = matchCat.name;
        } else {
          // Suy luận từ tên môn
          const normName = normalizeKey(name);
          if (normName.includes('robot') || normName.includes('stem') || normName.includes('code') || normName.includes('laptrinh') || normName.includes('ai')) {
            resolvedCategoryCode = 'TECH';
            resolvedCategoryName = 'Công nghệ & Sáng tạo';
          } else if (normName.includes('piano') || normName.includes('ve') || normName.includes('art') || normName.includes('dan') || normName.includes('nhac') || normName.includes('hoahoa')) {
            resolvedCategoryCode = 'ART';
            resolvedCategoryName = 'Nghệ thuật & Hội họa';
          } else if (normName.includes('kynang') || normName.includes('sinhton') || normName.includes('tuve') || normName.includes('giao tiep')) {
            resolvedCategoryCode = 'SKILLS';
            resolvedCategoryName = 'Kỹ năng sống & Sinh tồn';
          }
        }

        const rate = sessions > 0 ? Math.ceil(fee / sessions) : 0;

        // Validation
        let status: ParsedSubjectRow['status'] = 'valid';
        let errorDetails: string | undefined = undefined;

        if (!code || !name) {
          status = 'error';
          errorDetails = 'Thiếu Mã môn hoặc Tên môn học';
        } else if (seenCodes.has(code)) {
          status = 'duplicate_in_file';
          errorDetails = `Trùng mã môn "${code}" với một dòng khác trong file`;
        } else if (existingCodes.has(code)) {
          status = 'update';
        }

        if (code) seenCodes.add(code);

        return {
          rowNum,
          rawCode: code,
          code,
          name,
          category_code: resolvedCategoryCode,
          category_name: resolvedCategoryName,
          duration,
          sessions,
          fee,
          rate,
          description,
          status,
          errorDetails,
        };
      });

      setParsedRows(parsed);
    } catch (err: any) {
      console.error('[ImportSubjectsModal] Parse error:', err);
      setParseError(err?.message || 'Không thể đọc nội dung file. Vui lòng kiểm tra định dạng Excel/CSV.');
      setParsedRows([]);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      processFile(selected);
    }
  };

  // 3. Thực hiện lưu vào CSDL Supabase
  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter(r => r.status === 'valid' || r.status === 'update');
    if (validRows.length === 0) {
      alert('Không có dòng môn học nào hợp lệ để lưu vào CSDL.');
      return;
    }

    setIsSubmitting(true);

    try {
      const recordsToUpsert = validRows.map(row => {
        const existing = existingSubjects.find(s => s.code.toUpperCase() === row.code.toUpperCase());
        return {
          id: existing?.id || `sub_${row.code.toLowerCase()}`,
          code: row.code,
          name: row.name,
          category_code: row.category_code,
          category: row.category_name,
          standard_duration: `${row.duration} phút`,
          duration_minutes: row.duration,
          standard_sessions: row.sessions,
          standard_course_fee: row.fee,
          standard_session_rate: row.rate,
          description: row.description || '',
          status: 'active',
          is_active: true,
          updated_at: new Date().toISOString(),
        };
      });

      const client = getSupabaseClient() || supabase;
      if (client) {
        const { error } = await client
          .from('subjects')
          .upsert(recordsToUpsert, { onConflict: 'code' })
          .select();

        if (error) {
          throw new Error(error.message);
        }
      }

      const mappedSubjects: Subject[] = recordsToUpsert.map(r => ({
        id: r.id,
        code: r.code,
        name: r.name,
        category: r.category,
        category_code: r.category_code,
        standard_duration: r.standard_duration,
        duration_minutes: r.duration_minutes,
        standard_sessions: r.standard_sessions,
        standard_course_fee: r.standard_course_fee,
        standard_session_rate: r.standard_session_rate,
        description: r.description,
        is_active: true,
      }));

      showToast(
        `Đã nhập thành công ${validRows.length} môn học vào cơ sở dữ liệu!`,
        'success',
        { title: 'Nhập Danh Mục Môn Học' }
      );

      onSuccess(mappedSubjects);
      onClose();
    } catch (err: any) {
      console.error('[ImportSubjectsModal] Save error:', err);
      alert('Lỗi lưu CSDL Supabase: ' + (err?.message || 'Không xác định'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const validCount = parsedRows.filter(r => r.status === 'valid').length;
  const updateCount = parsedRows.filter(r => r.status === 'update').length;
  const errorCount = parsedRows.filter(r => r.status === 'error' || r.status === 'duplicate_in_file').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-4xl rounded-3xl bg-[#111827] border border-amber-500/40 p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>📥 Nhập Danh Mục Môn Học Từ File Excel / CSV</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Bulk Import
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Ghi trực tiếp vào bảng <code className="text-amber-400 font-mono">public.subjects</code> trên Supabase với cơ chế kiểm tra trùng mã tự động.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action bar: Sample Download Buttons */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-300">
              Chưa có file mẫu? Tải cấu trúc chuẩn tại đây:
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadSampleTemplate('xlsx')}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải File Mẫu Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => downloadSampleTemplate('csv')}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải File Mẫu CSV</span>
            </button>
          </div>
        </div>

        {/* Drag & Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-6 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10'
              : 'border-slate-700 bg-slate-900/40 hover:border-amber-500/50 hover:bg-slate-900/80'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
            <Upload className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">
            {file ? file.name : 'Kéo & thả file Excel / CSV hoặc Bấm vào đây để chọn'}
          </h4>
          <p className="text-xs text-slate-400">
            Hỗ trợ định dạng chuẩn <code className="text-amber-400 font-mono">.xlsx</code>, <code className="text-amber-400 font-mono">.xls</code>, <code className="text-amber-400 font-mono">.csv</code> (Tối đa 10MB)
          </p>
          {file && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>{(file.size / 1024).toFixed(1)} KB</span>
              <span>&bull;</span>
              <span className="text-emerald-400 font-bold">Đã nạp file</span>
            </div>
          )}
        </div>

        {/* Error Notification */}
        {parseError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <div className="flex-1 font-medium">{parseError}</div>
          </div>
        )}

        {/* Loading Indicator */}
        {isProcessingFile && (
          <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span>Đang phân tích cấu trúc dữ liệu bảng tính...</span>
          </div>
        )}

        {/* Preview & Validation Table */}
        {parsedRows.length > 0 && (
          <div className="space-y-3">
            {/* Stats Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold text-white">Xem trước & Đối soát:</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                  Tổng: <strong>{parsedRows.length}</strong> dòng
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono font-bold">
                  ✓ Hợp lệ: {validCount}
                </span>
                {updateCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-mono font-bold">
                    ↻ Cập nhật đè: {updateCount}
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30 font-mono font-bold">
                    ✕ Lỗi: {errorCount}
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800 z-10">
                  <tr>
                    <th className="py-2.5 px-3 text-center">Dòng</th>
                    <th className="py-2.5 px-3">Trạng thái</th>
                    <th className="py-2.5 px-3 font-mono">Mã môn</th>
                    <th className="py-2.5 px-3">Tên môn học</th>
                    <th className="py-2.5 px-3">Phân loại</th>
                    <th className="py-2.5 px-3 text-center">Thời lượng</th>
                    <th className="py-2.5 px-3 text-center">Số buổi</th>
                    <th className="py-2.5 px-3 font-mono text-right">Học phí</th>
                    <th className="py-2.5 px-3 font-mono text-right">Đơn giá buổi</th>
                    <th className="py-2.5 px-3">Mô tả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {parsedRows.map((r) => {
                    const statusBadge = {
                      valid: {
                        label: 'Hợp lệ',
                        cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                      },
                      update: {
                        label: 'Ghi đè CSDL',
                        cls: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
                      },
                      duplicate_in_file: {
                        label: 'Trùng trong file',
                        cls: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
                      },
                      error: {
                        label: 'Thiếu dữ liệu',
                        cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
                      },
                    }[r.status];

                    return (
                      <tr
                        key={r.rowNum}
                        className={`hover:bg-slate-800/30 transition-colors ${
                          r.status === 'error' || r.status === 'duplicate_in_file'
                            ? 'bg-rose-500/5'
                            : ''
                        }`}
                      >
                        <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px]">
                          #{r.rowNum}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${statusBadge.cls}`}
                            title={r.errorDetails}
                          >
                            <span>{statusBadge.label}</span>
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono font-black text-amber-400">
                          {r.code || <span className="text-rose-400 italic">Trống</span>}
                        </td>
                        <td className="py-2 px-3 font-bold text-white max-w-[200px] truncate">
                          {r.name || <span className="text-rose-400 italic">Trống</span>}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-[10px] font-semibold">
                            {r.category_name} ({r.category_code})
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center text-slate-400">
                          {r.duration}p
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-amber-400">
                          {r.sessions}b
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-200">
                          {formatVND(r.fee)}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-400 text-right">
                          {formatVND(r.rate)}/b
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-[11px] max-w-[180px] truncate" title={r.description}>
                          {r.description || <span className="text-slate-600 italic">-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 flex items-center justify-between border-t border-slate-800 text-xs">
          <div className="text-slate-400 text-[11px]">
            {parsedRows.length > 0 && (
              <span>
                Sẵn sàng lưu{' '}
                <strong className="text-amber-400 font-bold">
                  {validCount + updateCount}
                </strong>{' '}
                môn học hợp lệ vào CSDL Supabase.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isSubmitting || validCount + updateCount === 0}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Đang nhập vào CSDL...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Xác Nhận Lưu Vào CSDL ({validCount + updateCount} môn)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportSubjectsModal;
