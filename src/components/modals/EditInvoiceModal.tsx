import React, { useState, useMemo } from 'react';
import { Edit3, Sparkles, Calculator } from 'lucide-react';
import { getEffectivePrice } from '../../lib/storage';
import { supabase, getSupabaseClient } from '../../supabaseClient';
import { AppStore, TuitionInvoice } from '../../types';
import { showToast } from '../../lib/toast';

export interface EditInvoiceModalProps {
  invoice: TuitionInvoice | any;
  onClose: () => void;
  onUpdateStore: any;
  store: AppStore;
}

export const EditInvoiceModal: React.FC<EditInvoiceModalProps> = ({
  invoice,
  onClose,
  onUpdateStore,
  store,
}) => {
  const currentClass = useMemo(() => {
    return (store.classes || []).find(c => c.id === invoice.class_id);
  }, [store.classes, invoice.class_id]);

  const currentStudent = useMemo(() => {
    return (store.students || []).find(
      s => s.id === invoice.student_id || s.code === invoice.student_id
    );
  }, [store.students, invoice.student_id]);

  // 1. Phân giải biểu phí chuẩn xác của môn học theo Cơ sở (PL hoặc PMH)
  const campusPricing = useMemo(() => {
    if (!currentClass) {
      return {
        standardSessions: 16,
        standardFee: 2400000,
        sessionRate: 150000,
        campusName: 'PMH',
      };
    }
    const cCampus = String(currentClass.campus_id || '').toLowerCase();
    const isPL = cCampus.includes('pl') || currentClass.name.toUpperCase().includes('PL');
    const campusId = isPL ? 'pl' : 'pmh';
    const termId = currentClass.term_id || (currentClass as any).primary_term_id || 'KHOA-03';

    const priceResult = getEffectivePrice(termId, campusId, currentClass.subject_id, store);
    const standardSessions = Number(
      currentClass.total_sessions || priceResult.total_sessions || 16
    );
    const standardFee = Number(
      (currentClass as any).course_fee ||
        (currentClass as any).price ||
        priceResult.course_fee ||
        priceResult.base_course_fee ||
        currentClass.full_course_fee ||
        2040000
    );
    const sessionRate = Number(
      Math.round(standardFee / standardSessions) ||
        priceResult.session_rate ||
        currentClass.price_per_session
    );

    return {
      standardSessions,
      standardFee,
      sessionRate,
      campusName: isPL ? 'Phú Lâm (PL)' : 'Phú Mỹ Hưng (PMH)',
    };
  }, [currentClass, store]);

  // 2. Khởi tạo State Form
  const [sessionsCount, setSessionsCount] = useState<number>(() => {
    return Number(
      invoice.sessions_count || invoice.registered_sessions || campusPricing.standardSessions
    );
  });

  const [grossAmount, setGrossAmount] = useState<number>(() => {
    return Number(invoice.gross_amount || campusPricing.standardFee);
  });

  const [discountAmount, setDiscountAmount] = useState<number>(() => {
    return Number(
      invoice.discount_amount || invoice.credit_deduction || invoice.credit_deducted || 0
    );
  });

  const [dueDate, setDueDate] = useState<string>(() => {
    return invoice.due_date ? invoice.due_date.split('T')[0] : '2026-11-09';
  });

  const [notes, setNotes] = useState<string>(invoice.notes || invoice.prorated_note || '');
  const [isSaving, setIsSaving] = useState(false);

  // 3. Hàm tính lại học phí khi thay đổi số buổi thực học
  const handleSessionsChange = (newCount: number) => {
    const validCount = Math.max(1, newCount);
    setSessionsCount(validCount);

    // Nếu số buổi bằng số buổi chuẩn của môn -> lấy nguyên học phí trọn gói
    if (validCount === campusPricing.standardSessions) {
      setGrossAmount(campusPricing.standardFee);
    } else {
      // Nếu số buổi ít hơn (hoặc nhiều hơn) -> tính theo số buổi * đơn giá buổi cơ sở
      const autoCalculated = Math.round(validCount * campusPricing.sessionRate);
      setGrossAmount(autoCalculated);
    }
  };

  // 4. Nút bấm 1 chạm: Áp dụng lại toàn bộ biểu phí chuẩn cơ sở
  const handleResetToCampusPrice = () => {
    setSessionsCount(campusPricing.standardSessions);
    setGrossAmount(campusPricing.standardFee);
    showToast(
      `Đã áp dụng biểu phí chuẩn ${campusPricing.campusName}: ${campusPricing.standardSessions} buổi - ${campusPricing.standardFee.toLocaleString('vi-VN')} đ!`,
      'info'
    );
  };

  // Tính toán các số liệu công nợ
  const netPayable = Math.max(0, grossAmount - discountAmount);
  const paidAmount = Number(invoice.paid_amount || 0);
  const remainingAmount = Math.max(0, netPayable - paidAmount);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const client = getSupabaseClient() || supabase;

    const validSessions = Math.max(1, Number(sessionsCount) || 1);
    const computedSessionRate = Math.round(Number(grossAmount) / validSessions);
    const nextPaymentStatus =
      invoice.payment_status === 'cancelled'
        ? 'cancelled'
        : remainingAmount === 0 && netPayable > 0
        ? 'paid'
        : paidAmount > 0
        ? 'partial'
        : 'unpaid';

    const payload = {
      sessions_count: validSessions,
      registered_sessions: validSessions,
      session_rate: computedSessionRate,
      gross_amount: Number(grossAmount),
      discount_amount: Number(discountAmount),
      net_payable: netPayable,
      remaining_amount: remainingAmount,
      outstanding_amount: remainingAmount,
      payment_status: nextPaymentStatus,
      due_date: dueDate,
      notes: notes,
      updated_at: new Date().toISOString(),
    };

    try {
      if (client) {
        const { error } = await client
          .from('tuition_invoices')
          .update(payload)
          .eq('id', invoice.id);
        if (error) {
          await client
            .from('tuition_invoices')
            .update({
              registered_sessions: validSessions,
              session_rate: computedSessionRate,
              gross_amount: Number(grossAmount),
              discount_amount: Number(discountAmount),
              net_payable: netPayable,
              outstanding_amount: remainingAmount,
              payment_status: nextPaymentStatus,
              due_date: dueDate || null,
              updated_at: payload.updated_at,
            })
            .eq('id', invoice.id);
        }
      }

      onUpdateStore((prev: AppStore) => ({
        ...prev,
        invoices: (prev.invoices || []).map(inv =>
          inv.id === invoice.id ? { ...inv, ...payload } : inv
        ),
      }));

      showToast(
        `Đã cập nhật biểu phí hóa đơn ${invoice.invoice_code || invoice.id} thành công!`,
        'success'
      );
      onClose();
    } catch (err: any) {
      showToast('Lỗi lưu hóa đơn: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-slate-800 p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-amber-400" />
              <span>Chỉnh Sửa Biểu Phí Hóa Đơn</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Mã HĐ:{' '}
              <span className="font-mono text-amber-400 font-bold">
                {invoice.invoice_code || invoice.id}
              </span>{' '}
              &bull; {currentStudent?.name || invoice.students?.name || invoice.student_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Khối Thông Tin Môn Học & Biểu Phí Cơ Sở Đã Phân Giải */}
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-white text-sm">
                {currentClass?.name || invoice.extracurricular_classes?.name || invoice.class_id}
              </div>
              <div className="text-xs text-cyan-400 font-semibold mt-0.5">
                Cơ sở: {campusPricing.campusName}
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetToCampusPrice}
              className="px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Lấy Chuẩn Khóa ({campusPricing.standardSessions}b)</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
            <div className="text-slate-400">
              Quy định môn:{' '}
              <strong className="text-white">{campusPricing.standardSessions} buổi</strong>
            </div>
            <div className="text-right text-slate-400">
              Đơn giá cơ sở:{' '}
              <strong className="text-emerald-400">
                {campusPricing.sessionRate.toLocaleString('vi-VN')} đ/buổi
              </strong>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Số Buổi Thực Học *
              </label>
              <input
                type="number"
                min="1"
                required
                value={sessionsCount}
                onChange={(e) => handleSessionsChange(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold text-xs focus:border-amber-500 focus:outline-none"
              />
              {sessionsCount < campusPricing.standardSessions && (
                <div className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                  <span>
                    ⚠ Học ít hơn chuẩn {campusPricing.standardSessions - sessionsCount} buổi
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Hạn Nộp Học Phí
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-amber-400">
                  Học Phí Gốc (VNĐ) *
                </label>
                <span className="text-[10px] text-slate-500 font-mono">(Tự động tính)</span>
              </div>
              <input
                type="number"
                step="5000"
                required
                value={grossAmount}
                onChange={(e) => setGrossAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-amber-300 font-mono font-black text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Trừ Bảo Lưu / Giảm Trừ
              </label>
              <input
                type="number"
                step="10000"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 font-mono text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Dòng công thức giải trình chi tiết */}
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 font-mono space-y-1">
            <div className="flex items-center gap-2 text-slate-300">
              <span>
                * Đơn giá cơ sở: {campusPricing.sessionRate.toLocaleString('vi-VN')} đ/buổi (Chuẩn
                lớp {campusPricing.standardSessions} buổi ={' '}
                {campusPricing.standardFee.toLocaleString('vi-VN')} đ)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                * Tính học phí: {sessionsCount} buổi ×{' '}
                {campusPricing.sessionRate.toLocaleString('vi-VN')} đ/buổi ={' '}
                <strong>{grossAmount.toLocaleString('vi-VN')} đ</strong>
              </span>
            </div>
          </div>

          {/* Khối Tóm Tắt Số Tiền Phải Đóng & Còn Nợ */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Số tiền phải đóng:</span>
              <strong className="text-white font-mono">
                {netPayable.toLocaleString('vi-VN')} đ
              </strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Đã thanh toán:</span>
              <span className="text-emerald-400 font-mono">
                {paidAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>
            <div className="flex justify-between text-rose-400 font-bold border-t border-slate-800/80 pt-1.5">
              <span>Còn nợ cần thu:</span>
              <span className="font-mono text-sm">
                {remainingAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              Ghi Chú Điều Chỉnh
            </label>
            <input
              type="text"
              placeholder="VD: Học sinh vào trễ học 15 buổi, tính theo đơn giá cơ sở Phú Lâm..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              {isSaving ? 'Đang lưu...' : 'Lưu Thay Đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
