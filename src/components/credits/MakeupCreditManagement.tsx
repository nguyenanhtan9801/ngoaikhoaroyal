import React, { useState } from 'react';
import { 
  FileCheck2, 
  Printer, 
  Plus, 
  AlertTriangle, 
  Calendar, 
  CheckCircle, 
  Clock, 
  DollarSign, 
  Coins, 
  ShieldCheck,
  Tag,
  Search
} from 'lucide-react';
import { AppState } from '../../services/storage';
import { MakeupCredit } from '../../types';

interface MakeupCreditManagementProps {
  state: AppState;
  onCreateCredit: (credit: MakeupCredit) => void;
  onPrintCredit: (credit: MakeupCredit) => void;
  initialModalStudentId?: string;
  initialModalClassId?: string;
}

export const MakeupCreditManagement: React.FC<MakeupCreditManagementProps> = ({
  state,
  onCreateCredit,
  onPrintCredit,
  initialModalStudentId,
  initialModalClassId
}) => {
  const { makeupCredits, students, classes, subjects, terms } = state;

  const [showCreateModal, setShowCreateModal] = useState(Boolean(initialModalStudentId));
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Form states for new Credit
  const [studentId, setStudentId] = useState(initialModalStudentId || students[0]?.id || '');
  const [sourceClassId, setSourceClassId] = useState(initialModalClassId || classes[0]?.id || '');
  const [absentCount, setAbsentCount] = useState<number>(3);
  const [ruleType, setRuleType] = useState<'monetary' | 'sessions'>('monetary');
  const [validityDays, setValidityDays] = useState<number>(365);
  const [datesStr, setDatesStr] = useState<string>('05/10/2026, 07/10/2026, 12/10/2026');
  const [note, setNote] = useState<string>('Vắng có phép liên tục 3 buổi (có đơn bệnh viện Nhi Đồng).');

  const selectedClass = classes.find(c => c.id === sourceClassId);
  const oldRate = selectedClass?.price_per_session || 180000;
  const calculatedCreditAmount = absentCount * oldRate;

  // Filter credits
  const filteredCredits = makeupCredits.filter(c => {
    const st = students.find(s => s.id === c.student_id);
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchesSearch = !searchTerm || 
      c.credit_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (st && st.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (st && st.code.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const st = students.find(s => s.id === studentId);
    if (!st || !selectedClass) return;

    const today = new Date();
    const issueDateStr = today.toISOString().split('T')[0];
    const expiryDate = new Date(today);
    expiryDate.setDate(expiryDate.getDate() + validityDays);
    const expiryDateStr = expiryDate.toISOString().split('T')[0];

    const newCredit: MakeupCredit = {
      id: 'cred-' + Date.now(),
      credit_code: `RS-CRED-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      student_id: studentId,
      source_class_id: sourceClassId,
      subject_id: selectedClass.subject_id,
      term_id: selectedClass.term_id,
      consecutive_absent_count: absentCount,
      consecutive_dates: datesStr.split(',').map(s => s.trim()),
      source_rate: oldRate,
      credit_rule: ruleType,
      total_credit_amount: calculatedCreditAmount,
      transferred_sessions: absentCount,
      issue_date: issueDateStr,
      expiry_date: expiryDateStr,
      status: 'issued',
      note: note
    };

    onCreateCredit(newCredit);
    setShowCreateModal(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white">
                Quản Lý Bảo Lưu Khóa Học (Bãi Bỏ Học Bù)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Chỉ xét bảo lưu khi vắng có phép liên tục từ 3 buổi trở lên &bull; Hạn hiệu lực 1 năm &bull; Cấn trừ khóa sau
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Phiếu Bảo Lưu Mới</span>
            </button>
          </div>
        </div>

        {/* Business Rule Summary Box */}
        <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="text-amber-400 font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Điều Kiện Kích Hoạt
            </div>
            <p className="text-slate-400">
              Vắng có phép liên tục $\ge$ 3 buổi. Định mức tối đa 1 lần / 1 môn / 1 khóa học.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="text-cyan-400 font-bold flex items-center gap-1.5">
              <Coins className="w-4 h-4" /> Cấn Trừ Khóa Sau
            </div>
            <p className="text-slate-400">
              Nếu giá cũ &lt; giá mới: Trừ tiền thẳng. Nếu giá cũ $\ge$ giá mới: Chuyển ngang số buổi.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="text-rose-400 font-bold flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> Thời Hạn & Hết Hạn
            </div>
            <p className="text-slate-400">
              Mặc định 365 ngày (1 năm). Nhắc trước 1 tháng và 1 tuần. Quá hạn tự động Expired.
            </p>
          </div>
        </div>

      </div>

      {/* Credit List with Filter */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-xl">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-white">Danh Sách Phiếu Bảo Lưu Đã Phát Hành</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
              {filteredCredits.length} phiếu
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm mã phiếu, học sinh..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2" />
            </div>

            {/* Filter status */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="issued">Còn hiệu lực</option>
              <option value="applied">Đã cấn trừ</option>
              <option value="expired">Đã hết hạn</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0F19]/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Mã Phiếu</th>
                <th className="py-3 px-4">Học Sinh</th>
                <th className="py-3 px-4">Lớp Nguồn & Số Buổi</th>
                <th className="py-3 px-4">Quy Tắc & Giá Trị</th>
                <th className="py-3 px-4">Ngày Cấp & Hạn (1 Năm)</th>
                <th className="py-3 px-4 text-center">Trạng Thái</th>
                <th className="py-3 px-4 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredCredits.map((c) => {
                const st = students.find(s => s.id === c.student_id);
                const cl = classes.find(item => item.id === c.source_class_id);

                return (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                      {c.credit_code}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-white text-sm">{st?.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{st?.code}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-200">{cl?.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Nghỉ <strong className="text-amber-400">{c.consecutive_absent_count} buổi</strong> ({c.consecutive_dates.join(', ')})
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-emerald-400 font-extrabold text-sm">
                        {c.total_credit_amount.toLocaleString('vi-VN')} đ
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {c.credit_rule === 'monetary' ? 'Bảo lưu theo số tiền' : `Bảo lưu ${c.transferred_sessions} buổi`}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-slate-300">Cấp: {c.issue_date}</div>
                      <div className="text-[11px] text-rose-400 font-semibold mt-0.5">
                        Hạn: {c.expiry_date}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {c.status === 'issued' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Còn hiệu lực
                        </span>
                      )}
                      {c.status === 'applied' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Đã cấn trừ
                        </span>
                      )}
                      {c.status === 'expired' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Đã hết hạn
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => onPrintCredit(c)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition-all flex items-center gap-1 mx-auto"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-400" />
                        <span>In Phiếu</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      {/* Modal: Create Makeup Credit */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-xl bg-[#111827] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-white">Lập Phiếu Bảo Lưu Học Phí Khóa Sau</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              
              {/* Student selection */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Học sinh được bảo lưu</label>
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) - {s.is_royal_student ? 'Học sinh Royal' : 'Học sinh ngoài'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Class selection */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Lớp học phát sinh vắng</label>
                <select
                  value={sourceClassId}
                  onChange={(e) => setSourceClassId(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} &bull; Đơn giá: {c.price_per_session.toLocaleString('vi-VN')} đ/buổi
                    </option>
                  ))}
                </select>
              </div>

              {/* Absent count and dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Số buổi vắng có phép liên tiếp</label>
                  <input
                    type="number"
                    min="3"
                    value={absentCount}
                    onChange={(e) => setAbsentCount(Number(e.target.value))}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                  <span className="text-[10px] text-amber-400">Yêu cầu $\ge$ 3 buổi liên tục</span>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Ngày các buổi vắng</label>
                  <input
                    type="text"
                    value={datesStr}
                    onChange={(e) => setDatesStr(e.target.value)}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Rule type */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Phương thức bảo lưu cấn trừ</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRuleType('monetary')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      ruleType === 'monetary'
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div>Bảo lưu theo Số Tiền</div>
                    <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                      Trừ trực tiếp: {calculatedCreditAmount.toLocaleString('vi-VN')} đ
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRuleType('sessions')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      ruleType === 'sessions'
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div>Bảo lưu theo Số Buổi</div>
                    <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                      Chuyển ngang: {absentCount} buổi khóa sau
                    </div>
                  </button>
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Ghi chú & Hồ sơ chứng từ</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  Phát Hành Phiếu Bảo Lưu
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
