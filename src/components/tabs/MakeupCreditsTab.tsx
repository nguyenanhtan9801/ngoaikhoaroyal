import React, { useState } from 'react';
import { 
  BookmarkCheck, 
  Plus, 
  Printer, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  ArrowRight, 
  Calendar,
  FileText,
  User,
  ShieldCheck
} from 'lucide-react';
import { AppStore, formatVND } from '../../lib/storage';
import { MakeupCredit, Student, ExtracurricularClass, UserRole } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';

interface MakeupCreditsTabProps {
  store: AppStore;
  currentRole: UserRole;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onPrintCreditSlip: (credit: MakeupCredit) => void;
}

export const MakeupCreditsTab: React.FC<MakeupCreditsTabProps> = ({
  store,
  currentRole,
  onUpdateStore,
  onPrintCreditSlip,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [applyingCredit, setApplyingCredit] = useState<MakeupCredit | null>(null);

  // Issue Form State
  const [issueForm, setIssueForm] = useState({
    student_id: store.students[0]?.id || '',
    source_class_id: store.classes[0]?.id || '',
    consecutive_absent_count: 3,
    consecutive_dates_text: '2026-09-14, 2026-09-16, 2026-09-21',
  });

  // Selected Student & Class for live calculation
  const selectedStudent = store.students.find(s => s.id === issueForm.student_id);
  const selectedClass = store.classes.find(c => c.id === issueForm.source_class_id);
  const calculatedCreditAmount = (selectedClass?.price_per_session || 0) * issueForm.consecutive_absent_count;

  // Handle Create Credit
  const handleCreateCredit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedClass) return;

    const datesArray = issueForm.consecutive_dates_text.split(',').map(d => d.trim()).filter(Boolean);
    const today = new Date();
    const expiry = new Date(today);
    expiry.setFullYear(today.getFullYear() + 1); // 1 year validity

    const newCredit: MakeupCredit = {
      id: `cred_${Date.now()}`,
      credit_code: `MC-${today.getFullYear()}-${String(store.makeupCredits.length + 1).padStart(4, '0')}`,
      student_id: selectedStudent.id,
      source_class_id: selectedClass.id,
      subject_id: selectedClass.subject_id,
      term_id: selectedClass.term_id,
      consecutive_absent_count: issueForm.consecutive_absent_count,
      consecutive_dates: datesArray,
      source_rate: selectedClass.price_per_session,
      credit_rule: 'monetary',
      total_credit_amount: calculatedCreditAmount,
      transferred_sessions: issueForm.consecutive_absent_count,
      issue_date: today.toISOString().split('T')[0],
      expiry_date: expiry.toISOString().split('T')[0],
      status: 'issued',
    };

    onUpdateStore(prev => ({
      ...prev,
      makeupCredits: [newCredit, ...prev.makeupCredits],
    }));

    setShowIssueModal(false);
  };

  // Handle Apply Credit to Next Term Class/Invoice
  const handleApplyToInvoice = (targetClassId: string) => {
    if (!applyingCredit) return;
    const targetClass = store.classes.find(c => c.id === targetClassId);
    if (!targetClass) return;

    // Check rate comparison
    // If Old Rate < New Rate: credit monetary deduction
    // If Old Rate >= New Rate: transfer sessions
    const oldRate = applyingCredit.source_rate;
    const newRate = targetClass.price_per_session;

    onUpdateStore(prev => {
      // Find invoice for this student & target class, or update credit
      const updatedCredits = prev.makeupCredits.map(c => {
        if (c.id === applyingCredit.id) {
          return {
            ...c,
            status: 'applied' as const,
            applied_class_id: targetClass.id,
            applied_at: new Date().toISOString(),
          };
        }
        return c;
      });

      // Update matching invoice if exists
      const updatedInvoices = prev.invoices.map(inv => {
        if (inv.student_id === applyingCredit.student_id && inv.class_id === targetClass.id && inv.payment_status !== 'paid') {
          const deduction = oldRate < newRate 
            ? applyingCredit.total_credit_amount 
            : applyingCredit.transferred_sessions * newRate;
          
          const newNet = Math.max(0, inv.gross_amount - deduction);
          const newOutstanding = Math.max(0, newNet - inv.paid_amount);

          return {
            ...inv,
            credit_deducted: deduction,
            net_payable: newNet,
            outstanding_amount: newOutstanding,
            payment_status: (newOutstanding === 0 ? 'paid' : inv.paid_amount > 0 ? 'partial' : 'unpaid') as any,
          };
        }
        return inv;
      });

      return {
        ...prev,
        makeupCredits: updatedCredits,
        invoices: updatedInvoices,
      };
    });

    setApplyingCredit(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Policy Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-[#111827]/90 via-[#131d31]/80 to-[#111827]/90 border border-slate-800/80 p-6 backdrop-blur-md shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <BookmarkCheck className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">Chính Sách Bảo Lưu Học Phí (Bãi Bỏ Học Bù Lẻ Tẻ)</h2>
          </div>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Nhà trường bãi bỏ học bù đơn lẻ, bảo đảm chất lượng đào tạo thông qua cấp Phiếu bảo lưu học phí cho học sinh vắng có phép liên tục từ 3 buổi trở lên. Phiếu có giá trị cấn trừ vào khóa học tiếp theo trong vòng 1 năm (365 ngày).
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
              &bull; Điều kiện: Vắng có phép liên tục ≥ 3 buổi
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
              &bull; Định mức: Tối đa 1 lần / 1 môn / 1 khóa
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
              &bull; Hiệu lực: 365 ngày kể từ ngày cấp
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowIssueModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all shrink-0"
        >
          <Plus className="w-4 h-4 text-slate-950" />
          <span>Lập Phiếu Bảo Lưu Mới</span>
        </button>
      </div>

      {/* Credits List Container (Cards or Table) */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BookmarkCheck className="w-4 h-4 text-amber-400" />
              <span>Sổ Theo Dõi Phiếu Bảo Lưu Học Phí Toàn Trường ({store.makeupCredits.length} phiếu)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Thời hạn bảo lưu chính xác 365 ngày kể từ ngày cấp, có giá trị cấn trừ vào mọi khóa học sau
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          </div>
        </div>

        {/* VIEW 1: CARDS VIEW (VOUCHER STYLE) */}
        {viewMode === 'cards' && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {store.makeupCredits.map(credit => {
              const student = store.students.find(s => s.id === credit.student_id);
              const cls = store.classes.find(c => c.id === credit.source_class_id);
              const subject = store.subjects.find(s => s.id === credit.subject_id);

              return (
                <div 
                  key={credit.id}
                  className="rounded-2xl p-4 bg-gradient-to-br from-[#111827] via-slate-900 to-[#0B0F19] border border-amber-500/30 hover:border-amber-500/60 shadow-lg shadow-amber-500/5 transition-all flex flex-col justify-between relative overflow-hidden"
                >
                  {/* Watermark */}
                  <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none text-white">
                    <BookmarkCheck className="w-28 h-28" />
                  </div>

                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div>
                        <span className="font-mono text-xs font-extrabold text-amber-400 tracking-wider">
                          {credit.credit_code}
                        </span>
                        <div className="text-white font-bold text-sm mt-0.5">{student?.name}</div>
                        <span className="text-[10px] text-slate-500 font-mono">{student?.code}</span>
                      </div>

                      {credit.status === 'issued' ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                          Chưa sử dụng
                        </span>
                      ) : credit.status === 'applied' ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                          Đã cấn trừ
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[10px] font-bold">
                          Hết hạn
                        </span>
                      )}
                    </div>

                    {/* Class Details */}
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs mb-3 space-y-1">
                      <div className="text-slate-300 font-semibold">{cls?.name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center justify-between">
                        <span>{subject?.name}</span>
                        <span className="text-rose-400 font-bold">Vắng {credit.consecutive_absent_count} buổi liên tiếp</span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        Ngày vắng: {credit.consecutive_dates.join(', ')}
                      </div>
                    </div>

                    {/* Amount & Rate */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-3">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">Giá trị bảo lưu</span>
                        <span className="text-base font-extrabold text-emerald-400 font-mono">
                          {formatVND(credit.total_credit_amount)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">Đơn giá gốc</span>
                        <span className="text-xs font-bold text-slate-300 font-mono">
                          {formatVND(credit.source_rate)}/b
                        </span>
                      </div>
                    </div>

                    {/* Validity */}
                    <div className="text-[11px] text-slate-400 flex items-center justify-between mb-3">
                      <span>Hiệu lực đến:</span>
                      <span className="font-mono text-white font-bold">{credit.expiry_date}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onPrintCreditSlip(credit)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                      title="In Phiếu Bảo Lưu Học Phí"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-400" />
                      <span>In Phiếu</span>
                    </button>

                    {credit.status === 'issued' && (
                      <button
                        onClick={() => setApplyingCredit(credit)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all hover:scale-[1.02]"
                      >
                        <span>Cấn trừ khóa sau</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 2: TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Mã Phiếu</th>
                  <th className="py-3 px-4">Học Viên</th>
                  <th className="py-3 px-4">Môn & Lớp Nguồn</th>
                  <th className="py-3 px-4 text-center">Số Buổi Vắng Liên Tiếp</th>
                  <th className="py-3 px-4">Đơn Giá Buổi Cũ</th>
                  <th className="py-3 px-4">Tổng Tiền Bảo Lưu</th>
                  <th className="py-3 px-4">Hạn Hiệu Lực (1 Năm)</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {store.makeupCredits.map(credit => {
                  const student = store.students.find(s => s.id === credit.student_id);
                  const cls = store.classes.find(c => c.id === credit.source_class_id);
                  const subject = store.subjects.find(s => s.id === credit.subject_id);

                  return (
                    <tr key={credit.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-amber-400">{credit.credit_code}</span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{student?.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{student?.code}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{cls?.name}</div>
                        <div className="text-[10px] text-slate-400">{subject?.name}</div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                          {credit.consecutive_absent_count} buổi
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {credit.consecutive_dates.join(', ')}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-300">
                        {formatVND(credit.source_rate)}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        {formatVND(credit.total_credit_amount)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-white font-mono">{credit.expiry_date}</div>
                        <div className="text-[10px] text-slate-500">Cấp: {credit.issue_date}</div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {credit.status === 'issued' ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            Chưa sử dụng
                          </span>
                        ) : credit.status === 'applied' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            Đã cấn trừ khóa sau
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[10px] font-bold">
                            Hết hiệu lực
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onPrintCreditSlip(credit)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="In Phiếu Bảo Lưu Học Phí"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {credit.status === 'issued' && (
                            <button
                              onClick={() => setApplyingCredit(credit)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-bold shadow-sm shadow-amber-500/20"
                            >
                              Cấn trừ khóa sau
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Issue Credit Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BookmarkCheck className="w-5 h-5 text-amber-400" />
              <span>Lập Phiếu Bảo Lưu Học Phí Khóa Học</span>
            </h3>

            <form onSubmit={handleCreateCredit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Chọn Học sinh *</label>
                <select
                  value={issueForm.student_id}
                  onChange={(e) => setIssueForm({ ...issueForm, student_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                >
                  {store.students.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Lớp học phát sinh vắng có phép *</label>
                <select
                  value={issueForm.source_class_id}
                  onChange={(e) => setIssueForm({ ...issueForm, source_class_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                >
                  {store.classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} - Đơn giá: {formatVND(c.price_per_session)}/buổi
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Số buổi nghỉ liên tiếp (≥ 3) *</label>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    required
                    value={issueForm.consecutive_absent_count}
                    onChange={(e) => setIssueForm({ ...issueForm, consecutive_absent_count: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Thời hạn hiệu lực</label>
                  <input
                    type="text"
                    disabled
                    value="1 Năm (365 ngày)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Các ngày vắng học (phân cách bằng dấu phẩy)</label>
                <input
                  type="text"
                  value={issueForm.consecutive_dates_text}
                  onChange={(e) => setIssueForm({ ...issueForm, consecutive_dates_text: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                  placeholder="2026-09-14, 2026-09-16, 2026-09-21"
                />
              </div>

              {/* Live Computation */}
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Đơn giá buổi cũ:</span>
                  <span className="font-mono text-white">{formatVND(selectedClass?.price_per_session || 0)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Số buổi bảo lưu:</span>
                  <span className="font-mono text-white">{issueForm.consecutive_absent_count} buổi</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold border-t border-slate-800 pt-1 text-sm">
                  <span>Tổng tiền bảo lưu cấn trừ:</span>
                  <span className="font-mono">{formatVND(calculatedCreditAmount)}</span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  Xác Nhận Cấp Phiếu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Apply Credit Modal */}
      {applyingCredit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Cấn Trừ Bảo Lưu Vào Lớp Khóa Sau</span>
            </h3>

            <p className="text-xs text-slate-400">
              Áp dụng phiếu <strong className="text-amber-400 font-mono">{applyingCredit.credit_code}</strong> (Số tiền: {formatVND(applyingCredit.total_credit_amount)}) cho học sinh: <strong className="text-white">{store.students.find(s => s.id === applyingCredit.student_id)?.name}</strong>.
            </p>

            <div className="space-y-3 text-xs">
              <label className="block text-slate-400 font-medium">Chọn lớp khóa sau cần cấn trừ:</label>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {store.classes.map(c => {
                  const isOldRateLower = applyingCredit.source_rate < c.price_per_session;
                  return (
                    <div
                      key={c.id}
                      onClick={() => handleApplyToInvoice(c.id)}
                      className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 cursor-pointer transition-all"
                    >
                      <div className="font-bold text-white">{c.name}</div>
                      <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                        <span>Đơn giá mới: {formatVND(c.price_per_session)}</span>
                        <span className={isOldRateLower ? 'text-amber-400' : 'text-emerald-400'}>
                          {isOldRateLower ? 'Cấn trừ theo số tiền' : 'Bảo lưu nguyên số buổi'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setApplyingCredit(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
