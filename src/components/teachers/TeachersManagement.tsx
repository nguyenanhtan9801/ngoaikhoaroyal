import React, { useState } from 'react';
import { 
  Users, 
  UserCheck, 
  PhoneCall, 
  Mail, 
  Coins, 
  Plus, 
  GraduationCap, 
  CheckCircle2, 
  Clock, 
  Calendar,
  Sparkles
} from 'lucide-react';
import { AppState } from '../../services/storage';
import { Teacher } from '../../types';
import { formatCapitalizedName } from '../../lib/formatters';

interface TeachersManagementProps {
  state: AppState;
  onAddTeacher: (teacher: Teacher) => void;
}

export const TeachersManagement: React.FC<TeachersManagementProps> = ({
  state,
  onAddTeacher
}) => {
  const { teachers, classes, sessions } = state;
  const [showAddModal, setShowAddModal] = useState(false);

  const [newTeacher, setNewTeacher] = useState<Partial<Teacher>>({
    name: '',
    phone: '',
    email: '',
    teacher_type: 'permanent',
    fixed_rate_per_session: 380000,
    percentage_rate: 35,
    status: 'active'
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacher.name || !newTeacher.phone) return;

    const teacherToAdd: Teacher = {
      id: 'tch-' + Date.now(),
      name: newTeacher.name || '',
      phone: newTeacher.phone || '',
      email: newTeacher.email || '',
      teacher_type: newTeacher.teacher_type || 'permanent',
      fixed_rate_per_session: newTeacher.teacher_type === 'permanent' ? (newTeacher.fixed_rate_per_session || 0) : 0,
      percentage_rate: newTeacher.teacher_type === 'visiting' ? (newTeacher.percentage_rate || 0) : 0,
      status: 'active',
      subjects: []
    };

    onAddTeacher(teacherToAdd);
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white">
                Hồ Sơ Nhân Sự & Đội Ngũ Giảng Dạy
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Giáo viên cơ hữu (mức cố định/buổi) &bull; Giáo viên thỉnh giảng (% doanh thu lớp) &bull; Quyết toán dạy thay
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Giáo Viên Mới</span>
          </button>
        </div>
      </div>

      {/* Teachers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teachers.map((t) => {
          const teacherClasses = classes.filter(c => c.primary_teacher_id === t.id);
          const taughtSessionsCount = sessions.filter(s => s.actual_teacher_id === t.id && s.status === 'completed').length;

          return (
            <div
              key={t.id}
              className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl space-y-4 hover:border-slate-700 transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-white">{t.name}</h3>
                  <div className="mt-1">
                    {t.teacher_type === 'permanent' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Giáo viên cơ hữu
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Thỉnh giảng / Đối tác
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-xs font-mono font-bold text-emerald-400">
                  {t.status === 'active' ? '● Đang dạy' : 'Tạm dừng'}
                </span>
              </div>

              {/* Contact info */}
              <div className="space-y-1.5 text-xs text-slate-400 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2 text-slate-300">
                  <PhoneCall className="w-3.5 h-3.5 text-cyan-400" />
                  <a href={`tel:${t.phone}`} className="hover:underline font-mono">{t.phone}</a>
                </div>
                {t.email && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Mail className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.email}</span>
                  </div>
                )}
              </div>

              {/* Rate configuration */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 space-y-1 text-xs">
                <span className="text-slate-500 text-[11px] block">Mức thù lao thỏa thuận:</span>
                <div className="font-mono font-extrabold text-amber-400 text-sm">
                  {t.teacher_type === 'permanent' 
                    ? `${t.fixed_rate_per_session.toLocaleString('vi-VN')} đ / buổi dạy`
                    : `${t.percentage_rate}% tổng doanh thu lớp`}
                </div>
              </div>

              {/* Classes and Taught sessions */}
              <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
                <span>Lớp phụ trách: <strong className="text-white">{teacherClasses.length} lớp</strong></span>
                <span>Đã dạy: <strong className="text-cyan-400">{taughtSessionsCount} buổi</strong></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Add Teacher */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#111827] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-white">Thêm Giáo Viên Mới</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Họ và tên giáo viên *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Thầy Lê Văn Hùng"
                  value={newTeacher.name}
                  onChange={(e) => setNewTeacher({ ...newTeacher, name: formatCapitalizedName(e.target.value) })}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white capitalize"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Số điện thoại *</label>
                  <input
                    type="text"
                    required
                    placeholder="09..."
                    value={newTeacher.phone}
                    onChange={(e) => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="hung.lv@..."
                    value={newTeacher.email}
                    onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Nhóm giáo viên</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewTeacher({ ...newTeacher, teacher_type: 'permanent' })}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      newTeacher.teacher_type === 'permanent'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Giáo Viên Cơ Hữu
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTeacher({ ...newTeacher, teacher_type: 'visiting' })}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      newTeacher.teacher_type === 'visiting'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Thỉnh Giảng / Đối Tác
                  </button>
                </div>
              </div>

              {newTeacher.teacher_type === 'permanent' ? (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Thù lao cố định (VNĐ / Buổi)</label>
                  <input
                    type="number"
                    step="10000"
                    value={newTeacher.fixed_rate_per_session}
                    onChange={(e) => setNewTeacher({ ...newTeacher, fixed_rate_per_session: Number(e.target.value) })}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tỷ lệ chia sẻ (% Doanh thu lớp)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newTeacher.percentage_rate}
                    onChange={(e) => setNewTeacher({ ...newTeacher, percentage_rate: Number(e.target.value) })}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  Lưu Hồ Sơ Giáo Viên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
