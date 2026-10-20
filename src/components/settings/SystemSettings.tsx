import React, { useState } from 'react';
import { 
  Trash2, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  MessageSquare, 
  Mail, 
  Smartphone, 
  Building2, 
  DollarSign, 
  Coins, 
  FileCheck2,
  RefreshCw
} from 'lucide-react';
import { AppState, executeDatabaseReset, ResetOption } from '../../services/storage';
import { exportMasterExcelTemplate, parseMasterExcelFile } from '../../services/excelService';

interface SystemSettingsProps {
  state: AppState;
  onStateUpdate: (newState: AppState) => void;
  userRole: string;
}

export const SystemSettings: React.FC<SystemSettingsProps> = ({
  state,
  onStateUpdate,
  userRole
}) => {
  // Excel Importer states
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; dataSummary?: any } | null>(null);

  // Data Reset states
  const [resetOption, setResetOption] = useState<ResetOption>('operational_only');
  const [confirmCodeInput, setConfirmCodeInput] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState('');

  // Notification channels toggle states
  const [zaloEnabled, setZaloEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);

  // Handle Excel Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    const result = await parseMasterExcelFile(file);
    setImporting(false);
    setImportResult(result);

    if (result.success) {
      // Simulate real-time state merge notification
      const updatedState = { ...state };
      onStateUpdate(updatedState);
    }
  };

  // Handle Database Reset
  const handleExecuteReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmCodeInput !== 'DELETE_CONFIRM') {
      alert('Vui lòng nhập chính xác mã bảo mật DELETE_CONFIRM');
      return;
    }

    const updated = executeDatabaseReset(resetOption);
    onStateUpdate(updated);
    setConfirmCodeInput('');
    setResetSuccessMsg('Đã hoàn tất dọn dẹp dữ liệu theo tùy chọn được chỉ định!');
    setTimeout(() => setResetSuccessMsg(''), 4000);
  };

  const isSuperAdmin = userRole === 'super_admin';

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white">
                Cấu Hình Hệ Thống & Quản Trị Dữ Liệu Master
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Nhập/Xuất Master Excel 10 Sheet &bull; Module Dọn Dẹp Cơ Sở Dữ Liệu (Reset an toàn) &bull; Tích hợp SMS/Zalo Brandname
              </p>
            </div>
          </div>

          <button
            onClick={() => exportMasterExcelTemplate(state)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Tải Tệp Mẫu 10 Sheet (.xlsx)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Module 1: Master Excel Importer (10 Sheets) */}
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Nhập Dữ Liệu Hàng Loạt Bằng Excel (10 Sheets)
              </h3>
              <p className="text-xs text-slate-400">
                Tự động kiểm tra khóa ngoại, bỏ dòng trống, trim khoảng trắng và định dạng YYYY-MM-DD
              </p>
            </div>
          </div>

          {/* 10 Sheets List preview */}
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-amber-400">01</span> 01_CO_SO
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-amber-400">02</span> 02_SAN_BAI_PHONG_HOC
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-amber-400">03</span> 03_MON_HOC
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-amber-400">04</span> 04_KHUNG_GIO
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-amber-400">05</span> 05_GIAO_VIEN
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-amber-400">06</span> 06_LOP_HOC
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-amber-400">07</span> 07_HOC_VIEN (Cờ Royal)
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-amber-400">08</span> 08_GHI_DANH
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-amber-400">09</span> 09_DIEM_DANH_BUOI
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-amber-400">10</span> 10_BAO_LUU_TIEN_BUOI
            </div>
          </div>

          {/* Upload Input Area */}
          <div className="border-2 border-dashed border-slate-700/80 hover:border-amber-500/60 rounded-2xl p-6 text-center transition-colors">
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <span className="text-xs font-bold text-white block">
              Kéo thả hoặc tải lên tệp Excel Master (.xlsx)
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">
              File: RoyalSchool_Master_Import_Template_10_Sheets.xlsx
            </span>
            <label className="mt-3 inline-block px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-400 border border-slate-700 cursor-pointer transition-all">
              Chọn Tệp Excel
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Result Banner */}
          {importing && (
            <div className="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Đang đọc và phân tích cấu trúc 10 bảng tính...</span>
            </div>
          )}

          {importResult && (
            <div
              className={`p-4 rounded-2xl border text-xs space-y-2 ${
                importResult.success
                  ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {importResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                <span>{importResult.message}</span>
              </div>

              {importResult.dataSummary && (
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-900/40 text-[11px] font-mono">
                  <div>Học viên: {importResult.dataSummary.students}</div>
                  <div>Lớp học: {importResult.dataSummary.classes}</div>
                  <div>Điểm danh: {importResult.dataSummary.attendance}</div>
                  <div>Ghi danh: {importResult.dataSummary.enrollments}</div>
                  <div>Bảo lưu: {importResult.dataSummary.credits}</div>
                  <div>Giáo viên: {importResult.dataSummary.teachers}</div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Module 2: Module Dọn Sạch Dữ Liệu (Reset an toàn) */}
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Dọn Sạch Dữ Liệu (Database Reset)
                </h3>
                <p className="text-xs text-slate-400">
                  Dành riêng cho Super Admin &bull; Yêu cầu mã xác thực DELETE_CONFIRM
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Cấp Cao
            </span>
          </div>

          {!isSuperAdmin ? (
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
              Tài khoản hiện tại của bạn không có thẩm quyền thao tác dọn dẹp dữ liệu. Vui lòng chuyển sang vai trò <strong className="text-amber-400">Super Admin</strong> trên thanh điều hướng để mở khóa.
            </div>
          ) : (
            <form onSubmit={handleExecuteReset} className="space-y-4 text-xs">
              
              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">
                  Chọn Tùy Chọn Dọn Dẹp (Reset Policy):
                </label>
                
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                    <input
                      type="radio"
                      name="resetOption"
                      checked={resetOption === 'operational_only'}
                      onChange={() => setResetOption('operational_only')}
                      className="mt-0.5 text-amber-500"
                    />
                    <div>
                      <span className="font-bold text-white block">
                        Option 1 - Xóa Dữ Liệu Vận Hành & Giao Dịch
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Xóa điểm danh, buổi học, hóa đơn, bảo lưu và quyết toán. Giữ nguyên toàn bộ danh mục học sinh, lớp học, giáo viên, cơ sở.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                    <input
                      type="radio"
                      name="resetOption"
                      checked={resetOption === 'students_only'}
                      onChange={() => setResetOption('students_only')}
                      className="mt-0.5 text-amber-500"
                    />
                    <div>
                      <span className="font-bold text-white block">
                        Option 2 - Xóa Học Sinh & Ghi Danh
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Xóa toàn bộ hồ sơ học viên, ghi danh và đơn tuyển sinh để nhập mới danh sách học sinh.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                    <input
                      type="radio"
                      name="resetOption"
                      checked={resetOption === 'classes_only'}
                      onChange={() => setResetOption('classes_only')}
                      className="mt-0.5 text-amber-500"
                    />
                    <div>
                      <span className="font-bold text-white block">
                        Option 3 - Xóa Lớp Học & Phân Công
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Xóa các lớp học mở và lịch phân công để thiết lập thời khóa biểu khóa mới.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                    <input
                      type="radio"
                      name="resetOption"
                      checked={resetOption === 'full_factory_reset'}
                      onChange={() => setResetOption('full_factory_reset')}
                      className="mt-0.5 text-rose-500"
                    />
                    <div>
                      <span className="font-bold text-rose-400 block">
                        Option 4 - Khôi Phục Dữ Liệu Gốc (Full Factory Reset)
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Tái thiết lập toàn bộ hệ thống về bộ dữ liệu mẫu chuẩn ban đầu của Royal School.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Security confirmation password */}
              <div className="pt-2">
                <label className="block text-slate-400 font-semibold mb-1">
                  Nhập Mã Xác Nhận Bảo Mật: <span className="font-mono text-rose-400 font-bold">DELETE_CONFIRM</span>
                </label>
                <input
                  type="text"
                  placeholder="Nhập chính xác DELETE_CONFIRM..."
                  value={confirmCodeInput}
                  onChange={(e) => setConfirmCodeInput(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-rose-900/60 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-rose-500"
                />
              </div>

              {resetSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{resetSuccessMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={confirmCodeInput !== 'DELETE_CONFIRM'}
                className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                  confirmCodeInput === 'DELETE_CONFIRM'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>Tiến Hành Dọn Dẹp Dữ Liệu</span>
              </button>

            </form>
          )}

        </div>

      </div>

      {/* Module 3: Notification Channels Configuration */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">
              Cấu Hình Kênh Viễn Thông & Thông Báo Tự Động
            </h3>
            <p className="text-xs text-slate-400">
              Gửi thông báo học phí, cảnh báo vắng học & nhắc hạn bảo lưu qua cổng tin nhắn đa kênh
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          
          {/* Zalo ZNS */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-cyan-400" />
                Zalo ZNS Official Account
              </div>
              <p className="text-[11px] text-slate-400">Gửi hóa đơn kèm mã QR thanh toán</p>
            </div>
            <button
              onClick={() => setZaloEnabled(!zaloEnabled)}
              className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                zaloEnabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  zaloEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* SMS Brandname */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                SMS Brandname "ROYAL SCHOOL"
              </div>
              <p className="text-[11px] text-slate-400">Nhắc nợ mốc 1/2 khóa học & khẩn cấp</p>
            </div>
            <button
              onClick={() => setSmsEnabled(!smsEnabled)}
              className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                smsEnabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  smsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Email Brand */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-purple-400" />
                Email Biên Lai Điện Tử
              </div>
              <p className="text-[11px] text-slate-400">Đính kèm phiếu bảo lưu & biên lai PDF</p>
            </div>
            <button
              onClick={() => setEmailEnabled(!emailEnabled)}
              className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                emailEnabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  emailEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

        </div>
      </div>

    </div>
  );
};
