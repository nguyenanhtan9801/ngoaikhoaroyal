import React, { useState } from 'react';
import { 
  Building2, 
  Layers, 
  Clock, 
  MapPin, 
  Coins, 
  Plus, 
  CheckCircle, 
  Edit2, 
  ShieldCheck,
  CreditCard
} from 'lucide-react';
import { AppState } from '../../services/storage';
import { PricingRule } from '../../types';

interface CatalogsManagementProps {
  state: AppState;
  onUpdatePricingRule: (rule: PricingRule) => void;
}

export const CatalogsManagement: React.FC<CatalogsManagementProps> = ({
  state,
  onUpdatePricingRule
}) => {
  const { campuses, subjects, facilities, timeSlots, terms, pricingRules } = state;
  const [activeCatalogTab, setActiveCatalogTab] = useState<'pricing' | 'campuses' | 'facilities' | 'slots'>('pricing');

  // Editing pricing rule state
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);

  const handleSavePriceOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    onUpdatePricingRule(editingRule);
    setEditingRule(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white">
                Danh Mục Đào Tạo & Ma Trận Biểu Phí Động
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Cấu hình Ma trận: Khóa Học &times; Cơ Sở &times; Môn Học &bull; Đơn giá làm tròn hàng nghìn &bull; Tài khoản ngân hàng Napas247 từng cơ sở
              </p>
            </div>
          </div>

          {/* Sub Navigation */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl">
            <button
              onClick={() => setActiveCatalogTab('pricing')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeCatalogTab === 'pricing'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Ma Trận Biểu Phí
            </button>
            <button
              onClick={() => setActiveCatalogTab('campuses')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeCatalogTab === 'campuses'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cơ Sở & Ngân Hàng
            </button>
            <button
              onClick={() => setActiveCatalogTab('facilities')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeCatalogTab === 'facilities'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Phòng Học & Sân Bãi
            </button>
            <button
              onClick={() => setActiveCatalogTab('slots')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeCatalogTab === 'slots'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Khung Giờ Học (TKB)
            </button>
          </div>
        </div>
      </div>

      {/* Tab: Ma Trận Biểu Phí */}
      {activeCatalogTab === 'pricing' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-xl space-y-4 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-base font-extrabold text-white">
                Biểu Phí Khóa Học & Quy Tắc Tính Đơn Giá Buổi
              </h3>
              <p className="text-xs text-slate-400">
                Đơn giá 1 buổi = Làm tròn lên (Ceil) hàng nghìn đồng &bull; Cho phép Học vụ / Kế toán ghi đè
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F19]/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Cơ Sở Áp Dụng</th>
                  <th className="py-3 px-4">Môn Ngoại Khóa</th>
                  <th className="py-3 px-4">Học Phí Gốc</th>
                  <th className="py-3 px-4">Chính Sách Ưu Đãi Cơ Sở</th>
                  <th className="py-3 px-4">Học Phí Thực Thu</th>
                  <th className="py-3 px-4">Số Buổi</th>
                  <th className="py-3 px-4">Đơn Giá 1 Buổi Chuẩn</th>
                  <th className="py-3 px-4 text-center">Ghi Đè (Override)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pricingRules.map((rule) => {
                  const camp = campuses.find(c => c.id === rule.campus_id);
                  const subj = subjects.find(s => s.id === rule.subject_id);

                  return (
                    <tr key={rule.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">
                        {camp?.name}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-200">
                        {subj?.name}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {(rule.base_price || 0).toLocaleString('vi-VN')} đ
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {rule.discount_type === 'percentage' 
                            ? `Giảm ${rule.discount_value || 0}%` 
                            : `Giảm ${(rule.discount_value || 0).toLocaleString('vi-VN')} đ`}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        {rule.final_price.toLocaleString('vi-VN')} đ
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {rule.total_sessions} buổi
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-mono font-extrabold text-emerald-400 text-sm">
                          {(rule.custom_session_rate || rule.session_rate).toLocaleString('vi-VN')} đ
                        </div>
                        {rule.custom_session_rate && (
                          <div className="text-[10px] text-amber-400 font-semibold">
                            (Đã ghi đè thủ công)
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setEditingRule({ ...rule })}
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
                          title="Điều chỉnh ghi đè đơn giá"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Cơ Sở & Ngân Hàng */}
      {activeCatalogTab === 'campuses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {campuses.map((c) => (
            <div
              key={c.id}
              className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                    Cơ sở: {c.code}
                  </span>
                  <h3 className="text-lg font-extrabold text-white mt-2">{c.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{c.address}</span>
                  </p>
                </div>

                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Hoạt động
                </span>
              </div>

              {/* Bank Account Config */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Tài Khoản Nhận Học Phí (VietQR)
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-500">Ngân hàng:</span>
                  <span className="font-semibold text-white">{c.bank_name}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-500">Số tài khoản:</span>
                  <span className="font-mono font-bold text-emerald-400">{c.bank_account}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-500">Chủ tài khoản:</span>
                  <span className="font-medium text-slate-200">{c.bank_owner}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Phòng Học & Sân Bãi */}
      {activeCatalogTab === 'facilities' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {facilities.map((f) => {
            const camp = campuses.find(c => c.id === f.campus_id);
            return (
              <div
                key={f.id}
                className="rounded-2xl bg-[#111827]/80 border border-slate-800 p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{f.name}</span>
                  <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40">
                    {f.type}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Thuộc: <strong className="text-slate-200">{camp?.name}</strong>
                </div>
                <div className="text-xs text-slate-400">
                  Sức chứa tiêu chuẩn: <strong className="text-amber-400">{f.capacity} học sinh</strong>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Khung Giờ Học (TKB) */}
      {activeCatalogTab === 'slots' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {timeSlots.map((ts) => (
            <div
              key={ts.id}
              className="rounded-2xl bg-[#111827]/80 border border-slate-800 p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{ts.name}</span>
                <span className="text-[10px] font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/20">
                  {ts.slot_type === 'after_school' ? 'Sau giờ học' : 'Cuối tuần'}
                </span>
              </div>
              <div className="text-xs text-slate-300 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>{ts.start_time} &mdash; {ts.end_time}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Lịch tuần: <span className="font-semibold text-slate-200">{ts.days_of_week.join(', ')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Ghi Đè Đơn Giá Buổi */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#111827] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-white">Ghi Đè Đơn Giá 1 Buổi Học</h3>
              </div>
              <button
                onClick={() => setEditingRule(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePriceOverride} className="space-y-3.5 text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-1">
                <div className="text-slate-400">Đơn giá chuẩn tự động tính (làm tròn lên):</div>
                <div className="text-base font-extrabold text-white font-mono">
                  {editingRule.session_rate.toLocaleString('vi-VN')} đ / buổi
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Đơn giá buổi điều chỉnh (Ghi đè thủ công)
                </label>
                <input
                  type="number"
                  step="1000"
                  value={editingRule.custom_session_rate || editingRule.session_rate}
                  onChange={(e) => setEditingRule({ ...editingRule, custom_session_rate: Number(e.target.value) })}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  Lưu Đơn Giá Ghi Đè
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
