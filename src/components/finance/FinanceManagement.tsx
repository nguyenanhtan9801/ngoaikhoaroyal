import React, { useState } from 'react';
import { 
  CreditCard, 
  QrCode, 
  CheckCircle2, 
  Printer, 
  Clock, 
  DollarSign, 
  Users, 
  FileCheck2, 
  TrendingUp, 
  AlertCircle,
  Copy,
  ExternalLink,
  ShieldCheck,
  Check
} from 'lucide-react';
import { AppState } from '../../services/storage';
import { TuitionInvoice, TeacherPayrollSettlement } from '../../types';

interface FinanceManagementProps {
  state: AppState;
  onApprovePayment: (invoiceId: string, refNumber: string) => void;
  onSettleTeacherPayroll: (settlement: TeacherPayrollSettlement) => void;
  onPrintInvoice: (invoice: TuitionInvoice) => void;
  initialSelectedInvoiceId?: string;
}

export const FinanceManagement: React.FC<FinanceManagementProps> = ({
  state,
  onApprovePayment,
  onSettleTeacherPayroll,
  onPrintInvoice,
  initialSelectedInvoiceId
}) => {
  const { invoices, students, classes, campuses, teachers, sessions, attendance } = state;

  const [activeFinanceTab, setActiveFinanceTab] = useState<'invoices' | 'payroll'>('invoices');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [searchInvoice, setSearchInvoice] = useState('');

  // VietQR Modal state
  const [selectedInvoiceForQR, setSelectedInvoiceForQR] = useState<TuitionInvoice | null>(
    initialSelectedInvoiceId ? invoices.find(i => i.id === initialSelectedInvoiceId) || null : null
  );
  const [copiedSyntax, setCopiedSyntax] = useState(false);
  const [bankRefInput, setBankRefInput] = useState('');

  // Filtered invoices
  const filteredInvoices = invoices.filter(inv => {
    const st = students.find(s => s.id === inv.student_id);
    const matchesStatus = filterPayment === 'all' || inv.payment_status === filterPayment;
    const matchesSearch = !searchInvoice || 
      inv.invoice_code.toLowerCase().includes(searchInvoice.toLowerCase()) ||
      (st && st.name.toLowerCase().includes(searchInvoice.toLowerCase())) ||
      (st && st.code.toLowerCase().includes(searchInvoice.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  // Calculate totals
  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.paid_amount, 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.outstanding_amount, 0);
  const totalCreditsApplied = invoices.reduce((sum, inv) => sum + inv.credit_deducted, 0);

  // Payroll calculation preview for each class & teacher
  const payrollSummaries = classes.map(cl => {
    const teacher = teachers.find(t => t.id === cl.primary_teacher_id);
    const classSessions = sessions.filter(s => s.class_id === cl.id && s.status === 'completed');
    
    // Check sessions taught by primary vs substitute
    const primaryTaught = classSessions.filter(s => s.actual_teacher_id === cl.primary_teacher_id).length;
    const substituteSessions = classSessions.length - primaryTaught;

    // Total gross class revenue
    const classInvoices = invoices.filter(i => i.class_id === cl.id);
    const grossRevenue = classInvoices.reduce((sum, i) => sum + i.gross_amount, 0);

    let calculatedSalary = 0;
    if (teacher?.teacher_type === 'permanent') {
      calculatedSalary = primaryTaught * (teacher.fixed_rate_per_session || 0);
    } else if (teacher?.teacher_type === 'visiting') {
      calculatedSalary = (grossRevenue * (teacher.percentage_rate || 0)) / 100;
    }

    return {
      classId: cl.id,
      className: cl.name,
      teacherId: teacher?.id || '',
      teacherName: teacher?.name || 'Chưa phân công',
      teacherType: teacher?.teacher_type || 'permanent',
      rateDisplay: teacher?.teacher_type === 'permanent' 
        ? `${(teacher.fixed_rate_per_session || 0).toLocaleString('vi-VN')} đ / buổi` 
        : `${teacher?.percentage_rate || 0}% doanh thu`,
      totalCompletedSessions: classSessions.length,
      primaryTaught,
      substituteSessions,
      grossRevenue,
      calculatedSalary
    };
  });

  const handleCopySyntax = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSyntax(true);
    setTimeout(() => setCopiedSyntax(false), 2000);
  };

  const handleReconcileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForQR) return;
    onApprovePayment(selectedInvoiceForQR.id, bankRefInput || `FT${Date.now().toString().slice(-8)}`);
    setSelectedInvoiceForQR(null);
    setBankRefInput('');
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white">
                Tài Chính Học Phí & Quyết Toán Thù Lao Giảng Dạy
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Mã VietQR động Napas247 theo từng cơ sở &bull; Kế toán duyệt thu sao kê &bull; Quyết toán giáo viên cơ hữu / thỉnh giảng
              </p>
            </div>
          </div>

          {/* Sub Switcher: Hóa Đơn vs Quyết Toán */}
          <div className="flex items-center gap-2 p-1 bg-slate-900 border border-slate-800 rounded-2xl">
            <button
              onClick={() => setActiveFinanceTab('invoices')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeFinanceTab === 'invoices'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hóa Đơn & VietQR
            </button>
            <button
              onClick={() => setActiveFinanceTab('payroll')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeFinanceTab === 'payroll'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Quyết Toán Thù Lao GV
            </button>
          </div>
        </div>

        {/* Financial KPI summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800">
          <div className="rounded-2xl bg-[#0B0F19] border border-slate-800 p-4">
            <span className="text-xs text-slate-400 font-medium">Tổng Thực Thu (Đã Gạch Nợ)</span>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">
              {totalRevenue.toLocaleString('vi-VN')} đ
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Tài khoản ngân hàng cơ sở</span>
          </div>

          <div className="rounded-2xl bg-[#0B0F19] border border-slate-800 p-4">
            <span className="text-xs text-rose-400 font-medium">Công Nợ Phải Thu (Chưa Nộp)</span>
            <div className="text-2xl font-extrabold text-rose-400 mt-1">
              {totalOutstanding.toLocaleString('vi-VN')} đ
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Tự động nhắc nợ mốc 1/2 khóa</span>
          </div>

          <div className="rounded-2xl bg-[#0B0F19] border border-slate-800 p-4">
            <span className="text-xs text-amber-400 font-medium">Tổng Cấn Trừ Bảo Lưu</span>
            <div className="text-2xl font-extrabold text-amber-400 mt-1">
              {totalCreditsApplied.toLocaleString('vi-VN')} đ
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Giảm trừ trực tiếp cho phụ huynh</span>
          </div>
        </div>

      </div>

      {/* Main Content Tab: Invoices */}
      {activeFinanceTab === 'invoices' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-xl">
          <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-white">Danh Sách Hóa Đơn Từng Môn Học</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                {filteredInvoices.length} hóa đơn
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Tìm mã HĐ, tên bé, mã HV..."
                value={searchInvoice}
                onChange={(e) => setSearchInvoice(e.target.value)}
                className="bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />

              <select
                value={filterPayment}
                onChange={(e) => setFilterPayment(e.target.value)}
                className="bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white"
              >
                <option value="all">Tất cả thanh toán</option>
                <option value="paid">Đã đóng đủ</option>
                <option value="partial">Đóng một phần</option>
                <option value="unpaid">Còn nợ (Unpaid)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F19]/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Mã HĐ</th>
                  <th className="py-3 px-4">Học Sinh</th>
                  <th className="py-3 px-4">Lớp Học Ngoại Khóa</th>
                  <th className="py-3 px-4">Học Phí Gốc</th>
                  <th className="py-3 px-4">Bảo Lưu Trừ</th>
                  <th className="py-3 px-4">Còn Phải Thu</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-center">VietQR & Đối Soát</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredInvoices.map((inv) => {
                  const st = students.find(s => s.id === inv.student_id);
                  const cl = classes.find(c => c.id === inv.class_id);

                  return (
                    <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-300">
                        {inv.invoice_code}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-white text-sm">{st?.name}</div>
                        <div className="text-[11px] font-mono text-amber-400">{st?.code}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-200">{cl?.name}</div>
                        <div className="text-[10px] text-slate-400">Hạn: {inv.due_date}</div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-slate-300">
                        {inv.gross_amount.toLocaleString('vi-VN')} đ
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-amber-400">
                        {inv.credit_deducted > 0 ? `-${inv.credit_deducted.toLocaleString('vi-VN')} đ` : '-'}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-mono font-extrabold text-sm text-white">
                          {inv.outstanding_amount.toLocaleString('vi-VN')} đ
                        </div>
                        {inv.paid_amount > 0 && (
                          <div className="text-[10px] text-emerald-400">
                            Đã thu: {inv.paid_amount.toLocaleString('vi-VN')} đ
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {inv.payment_status === 'paid' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Đã đóng đủ
                          </span>
                        )}
                        {inv.payment_status === 'partial' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Đóng 1 phần
                          </span>
                        )}
                        {inv.payment_status === 'unpaid' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Còn nợ phí
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedInvoiceForQR(inv)}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-400 border border-slate-700 flex items-center gap-1 transition-all"
                            title="Mở VietQR và Duyệt gạch nợ"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>VietQR</span>
                          </button>

                          <button
                            onClick={() => onPrintInvoice(inv)}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
                            title="In Biên Lai Thu Tiền"
                          >
                            <Printer className="w-3.5 h-3.5" />
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

      {/* Main Content Tab: Teacher Payroll Settlement */}
      {activeFinanceTab === 'payroll' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-xl space-y-4 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-base font-extrabold text-white">Bảng Tính & Quyết Toán Thù Lao Giáo Viên</h3>
              <p className="text-xs text-slate-400">
                Chốt trọn gói 1 lần khi lớp kết thúc &bull; Cơ hữu tính theo buổi &bull; Thỉnh giảng tính theo % doanh thu lớp
              </p>
            </div>
            <span className="text-xs text-amber-400 font-semibold">
              Học sinh nợ phí: Nhà trường tạm ứng chi trước cho GV
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F19]/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Lớp Ngoại Khóa</th>
                  <th className="py-3 px-4">Giáo Viên Phụ Trách</th>
                  <th className="py-3 px-4">Phân Loại & Đơn Giá</th>
                  <th className="py-3 px-4 text-center">Buổi Đã Dạy</th>
                  <th className="py-3 px-4 text-center">Buổi Dạy Thay</th>
                  <th className="py-3 px-4">Doanh Thu Chuẩn Lớp</th>
                  <th className="py-3 px-4">Thù Lao Quyết Toán</th>
                  <th className="py-3 px-4 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {payrollSummaries.map((p, index) => (
                  <tr key={index} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white text-sm">
                      {p.className}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-slate-200">{p.teacherName}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-amber-400 font-semibold">{p.rateDisplay}</div>
                      <div className="text-[10px] text-slate-400">
                        {p.teacherType === 'permanent' ? 'Giáo viên cơ hữu' : 'Thỉnh giảng / Đối tác'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono font-bold text-white">
                      {p.primaryTaught} buổi
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono text-slate-400">
                      {p.substituteSessions} buổi
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-300">
                      {p.grossRevenue.toLocaleString('vi-VN')} đ
                    </td>

                    <td className="py-3.5 px-4 font-mono font-extrabold text-emerald-400 text-sm">
                      {p.calculatedSalary.toLocaleString('vi-VN')} đ
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => {
                          const settlement: TeacherPayrollSettlement = {
                            id: 'set-' + Date.now(),
                            teacher_id: p.teacherId,
                            class_id: p.classId,
                            term_id: 'term-2026-h1',
                            taught_sessions: p.primaryTaught,
                            substitute_sessions: p.substituteSessions,
                            class_revenue: p.grossRevenue,
                            calculation_type: p.teacherType === 'permanent' ? 'fixed' : 'percentage',
                            total_payroll: p.calculatedSalary,
                            settled_date: '2026-10-14',
                            is_settled: true
                          };
                          onSettleTeacherPayroll(settlement);
                          alert(`Đã hoàn tất duyệt chi thù lao ${p.calculatedSalary.toLocaleString('vi-VN')} đ cho ${p.teacherName}!`);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all"
                      >
                        Chốt Quyết Toán
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: VietQR and Manual Reconciliation */}
      {selectedInvoiceForQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#111827] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-white">Mã Thanh Toán VietQR & Đối Soát Sao Kê</h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForQR(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Dynamic VietQR Preview */}
            <div className="bg-[#0B0F19] border border-slate-800 rounded-2xl p-4 flex flex-col items-center text-center">
              <div className="w-48 h-48 bg-white rounded-2xl p-2 shadow-xl flex items-center justify-center overflow-hidden">
                <img
                  src={selectedInvoiceForQR.vietqr_url}
                  alt="Mã VietQR Thanh Toán"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="mt-3">
                <span className="text-[11px] text-slate-400">Cú pháp chuẩn Napas247:</span>
                <div className="flex items-center gap-2 mt-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 font-mono text-xs text-amber-300 font-bold">
                  <span>HP {selectedInvoiceForQR.invoice_code}</span>
                  <button
                    type="button"
                    onClick={() => handleCopySyntax(`HP ${selectedInvoiceForQR.invoice_code}`)}
                    className="p-1 hover:text-white"
                    title="Sao chép cú pháp"
                  >
                    {copiedSyntax ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="mt-2 text-xs text-slate-300">
                Số tiền: <strong className="text-emerald-400 text-sm font-mono">{selectedInvoiceForQR.outstanding_amount.toLocaleString('vi-VN')} đ</strong>
              </div>
            </div>

            {/* Manual Reconciliation Form for Accountant */}
            <form onSubmit={handleReconcileSubmit} className="space-y-3 text-xs pt-2">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-1">
                <span className="text-[11px] font-bold text-amber-400">Xác Nhận Thủ Công Cho Kế Toán:</span>
                <p className="text-slate-400">
                  Đối soát sao kê ngân hàng Vietcombank/BIDV cơ sở và nhập mã giao dịch để gạch nợ tự động.
                </p>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Mã Giao Dịch Ngân Hàng (Ủy nhiệm chi / Sao kê)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: FT262450892211..."
                  value={bankRefInput}
                  onChange={(e) => setBankRefInput(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceForQR(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/30 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Duyệt Thu & Gạch Nợ</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
