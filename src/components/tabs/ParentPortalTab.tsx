import React, { useState } from 'react';
import { 
  Users, 
  Send, 
  CheckCircle2, 
  PhoneCall, 
  GraduationCap, 
  School, 
  Clock, 
  HeartHandshake, 
  Sparkles,
  Search
} from 'lucide-react';
import { AppStore, generateStudentCode, formatVND } from '../../lib/storage';
import { ParentRegistration, Student, UserRole } from '../../types';
import { ViewToggle, ViewMode } from '../ViewToggle';
import { RoyalLogo } from '../RoyalLogo';

interface ParentPortalTabProps {
  store: AppStore;
  currentRole: UserRole;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
}

export const ParentPortalTab: React.FC<ParentPortalTabProps> = ({
  store,
  currentRole,
  onUpdateStore,
}) => {
  const [activeTab, setActiveTab] = useState<'portal_form' | 'admin_leads'>('admin_leads');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [submittedBanner, setSubmittedBanner] = useState(false);

  // Parent Public Portal Registration Form State
  const [form, setForm] = useState({
    parent_name: '',
    parent_phone: '',
    student_name: '',
    student_dob: '2016-05-10',
    desired_campus_id: store.campuses[0]?.id || '',
    desired_subject_id: store.subjects[0]?.id || '',
    desired_time_slot_type: 'after_school' as 'after_school' | 'weekend',
    is_royal_student: true,
    medical_notes: '',
    notes: '',
  });

  // Handle Parent Submission
  const handleSubmitLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.parent_name || !form.parent_phone || !form.student_name) return;

    const newLead: ParentRegistration = {
      id: `preg_${Date.now()}`,
      parent_name: form.parent_name,
      parent_phone: form.parent_phone,
      student_name: form.student_name,
      student_dob: form.student_dob,
      desired_campus_id: form.desired_campus_id,
      desired_subject_id: form.desired_subject_id,
      desired_time_slot_type: form.desired_time_slot_type,
      is_royal_student: form.is_royal_student,
      medical_notes: form.medical_notes,
      notes: form.notes,
      status: 'pending',
      created_at: new Date().toISOString().split('T')[0],
    };

    onUpdateStore(prev => ({
      ...prev,
      parentRegistrations: [newLead, ...prev.parentRegistrations],
      notifications: [
        {
          id: `notif_lead_${Date.now()}`,
          type: 'enrollment_over_quota',
          title: 'Đơn đăng ký mới từ Cổng Phụ Huynh',
          message: `Phụ huynh ${form.parent_name} đăng ký môn ${store.subjects.find(s => s.id === form.desired_subject_id)?.name} cho bé ${form.student_name}.`,
          date: new Date().toISOString().split('T')[0],
          severity: 'medium',
          read: false,
        },
        ...prev.notifications,
      ],
    }));

    setSubmittedBanner(true);
    setForm({
      parent_name: '',
      parent_phone: '',
      student_name: '',
      student_dob: '2016-05-10',
      desired_campus_id: store.campuses[0]?.id || '',
      desired_subject_id: store.subjects[0]?.id || '',
      desired_time_slot_type: 'after_school',
      is_royal_student: true,
      medical_notes: '',
      notes: '',
    });
    setTimeout(() => setSubmittedBanner(false), 5000);
  };

  // Admissions convert lead to student
  const handleEnrollLead = (lead: ParentRegistration) => {
    const code = generateStudentCode(lead.is_royal_student, store.students);
    const newStudent: Student = {
      id: `std_${Date.now()}`,
      code,
      name: lead.student_name,
      dob: lead.student_dob,
      gender: 'Nam',
      parent_name: lead.parent_name,
      parent_phone: lead.parent_phone,
      school_name: lead.is_royal_student ? 'Royal School' : 'Trường ngoài',
      regular_class: '',
      is_royal_student: lead.is_royal_student,
      medical_notes: lead.medical_notes,
      status: 'active',
      created_at: new Date().toISOString().split('T')[0],
    };

    onUpdateStore(prev => ({
      ...prev,
      students: [newStudent, ...prev.students],
      parentRegistrations: prev.parentRegistrations.map(r => 
        r.id === lead.id ? { ...r, status: 'enrolled' as const } : r
      ),
    }));

    alert(`Đã tiếp nhận hồ sơ thành công! Cấp mã định danh học viên: ${code}`);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Toggle Switch */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('admin_leads')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'admin_leads'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Hồ Sơ Chờ Tiếp Nhận & Tư Vấn ({store.parentRegistrations.length})
          </button>
          <button
            onClick={() => setActiveTab('portal_form')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'portal_form'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Mô Phỏng Cổng Đăng Ký Trực Tuyến Của Phụ Huynh (Public Portal)
          </button>
        </div>
      </div>

      {/* VIEW 1: ADMIN LEADS QUEUE */}
      {activeTab === 'admin_leads' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-md shadow-xl">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <span>Danh Sách Đơn Đăng Ký Ngoại Khóa Từ Cổng Phụ Huynh ({store.parentRegistrations.length} hồ sơ)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Phụ huynh chỉ đăng ký môn và khung giờ mong muốn. Học vụ & Tuyển sinh liên hệ tư vấn, xếp lớp chính thức và gắn cờ Royal.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
            </div>
          </div>

          {/* VIEW 1: LEADS CARDS VIEW */}
          {viewMode === 'cards' && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {store.parentRegistrations.map(lead => {
                const campus = store.campuses.find(c => c.id === lead.desired_campus_id);
                const subject = store.subjects.find(s => s.id === lead.desired_subject_id);

                return (
                  <div 
                    key={lead.id}
                    className="rounded-2xl p-4 bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col justify-between shadow-lg shadow-black/20"
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-white text-sm">{lead.student_name}</h4>
                            {lead.is_royal_student ? (
                              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold">
                                Royal
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 text-[9px]">
                                Trường ngoài
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500">Sinh: {lead.student_dob} &bull; Đăng ký: {lead.created_at}</span>
                        </div>

                        {lead.status === 'enrolled' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            Đã ghi danh
                          </span>
                        ) : lead.status === 'contacted' ? (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                            Đã liên hệ
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                            Chờ liên hệ
                          </span>
                        )}
                      </div>

                      {/* Parent details */}
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 mb-3 text-xs space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Phụ huynh:</span>
                          <span className="text-white font-semibold">{lead.parent_name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Số điện thoại:</span>
                          <span className="font-mono text-amber-400 font-bold">{lead.parent_phone}</span>
                        </div>
                      </div>

                      {/* Course Preferences */}
                      <div className="text-xs space-y-1.5 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Môn học:</span>
                          <span className="font-semibold text-amber-300">{subject?.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Cơ sở:</span>
                          <span className="text-slate-200">{campus?.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Khung giờ:</span>
                          <span className="text-slate-300">
                            {lead.desired_time_slot_type === 'after_school' ? 'Sau giờ học (16:30)' : 'Cuối tuần'}
                          </span>
                        </div>
                        {lead.medical_notes && (
                          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 font-medium">
                            Y tế: {lead.medical_notes}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action */}
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-end">
                      {lead.status !== 'enrolled' ? (
                        <button
                          onClick={() => handleEnrollLead(lead)}
                          className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-amber-500/20"
                        >
                          Tiếp Nhận & Cấp Mã Học Sinh
                        </button>
                      ) : (
                        <span className="text-emerald-400 text-xs font-semibold">Đã hoàn tất thủ tục hồ sơ</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 2: LEADS TABLE VIEW */}
          {viewMode === 'table' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Ngày Đăng Ký</th>
                    <th className="py-3 px-4">Phụ Huynh</th>
                    <th className="py-3 px-4">Học Sinh</th>
                    <th className="py-3 px-4">Cơ Sở & Môn Đăng Ký</th>
                    <th className="py-3 px-4">Khung Giờ Nguyện Vọng</th>
                    <th className="py-3 px-4">Phân Loại / Bánh Sữa</th>
                    <th className="py-3 px-4">Lưu Ý Sức Khỏe</th>
                    <th className="py-3 px-4 text-center">Trạng Thái</th>
                    <th className="py-3 px-4 text-right">Hành Động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {store.parentRegistrations.map(lead => {
                    const campus = store.campuses.find(c => c.id === lead.desired_campus_id);
                    const subject = store.subjects.find(s => s.id === lead.desired_subject_id);

                    return (
                      <tr key={lead.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-400">{lead.created_at}</td>
                        
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{lead.parent_name}</div>
                          <div className="text-[10px] text-amber-400 font-mono">{lead.parent_phone}</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200">{lead.student_name}</div>
                          <div className="text-[10px] text-slate-500">Sinh: {lead.student_dob}</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{subject?.name}</div>
                          <div className="text-[10px] text-slate-400">{campus?.name}</div>
                        </td>

                        <td className="py-3 px-4 text-slate-300">
                          {lead.desired_time_slot_type === 'after_school' ? 'Sau giờ học các ngày trong tuần' : 'Cuối tuần (Thứ 7 / CN)'}
                        </td>

                        <td className="py-3 px-4">
                          {lead.is_royal_student ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                              HS Royal (Có bánh sữa)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">
                              HS Ngoài trường
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-rose-300 text-[11px]">
                          {lead.medical_notes || 'Bình thường'}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {lead.status === 'enrolled' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              Đã ghi danh
                            </span>
                          ) : lead.status === 'contacted' ? (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                              Đã liên hệ
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                              Chờ liên hệ
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {lead.status !== 'enrolled' && (
                            <button
                              onClick={() => handleEnrollLead(lead)}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] transition-colors"
                            >
                              Tiếp Nhận & Cấp Mã
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: PUBLIC PARENT PORTAL SIMULATION */}
      {activeTab === 'portal_form' && (
        <div className="max-w-2xl mx-auto rounded-3xl bg-[#111827]/90 border border-amber-500/40 p-6 md:p-8 backdrop-blur-md shadow-2xl space-y-6">
          <div className="text-center flex flex-col items-center">
            <RoyalLogo size="lg" className="mb-3" />
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold uppercase tracking-wider">
              ROYAL SCHOOL PARENT PORTAL
            </span>
            <h2 className="mt-2 text-2xl font-extrabold text-white">Đăng Ký Khóa Học Ngoại Khóa Hoàng Gia</h2>
            <p className="mt-1 text-xs text-slate-400">
              Quý Phụ huynh chỉ cần chọn môn học và khung giờ mong muốn; bộ phận Học vụ sẽ liên hệ xác nhận và sắp xếp lớp học phù hợp nhất cho bé.
            </p>
          </div>

          {submittedBanner && (
            <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Gửi thông tin đăng ký thành công! Đội ngũ tư vấn Royal School sẽ liên hệ trong vòng 24 giờ.</span>
            </div>
          )}

          <form onSubmit={handleSubmitLead} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Họ tên Phụ huynh *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Văn Hưng"
                  value={form.parent_name}
                  onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Số điện thoại liên hệ *</label>
                <input
                  type="tel"
                  required
                  placeholder="Ví dụ: 0909 123 456"
                  value={form.parent_phone}
                  onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Họ tên học sinh *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Hoàng Khang"
                  value={form.student_name}
                  onChange={(e) => setForm({ ...form, student_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Ngày sinh của bé</label>
                <input
                  type="date"
                  value={form.student_dob}
                  onChange={(e) => setForm({ ...form, student_dob: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Cơ sở mong muốn học</label>
                <select
                  value={form.desired_campus_id}
                  onChange={(e) => setForm({ ...form, desired_campus_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                >
                  {store.campuses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Môn ngoại khóa đăng ký</label>
                <select
                  value={form.desired_subject_id}
                  onChange={(e) => setForm({ ...form, desired_subject_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                >
                  {store.subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Khung giờ mong muốn</label>
                <select
                  value={form.desired_time_slot_type}
                  onChange={(e) => setForm({ ...form, desired_time_slot_type: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="after_school">Sau giờ học chính khóa (16:45 - 18:15)</option>
                  <option value="weekend">Cuối tuần (Sáng Thứ Bảy / Chủ Nhật)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Bé hiện là học sinh trường nào?</label>
                <select
                  value={form.is_royal_student ? 'true' : 'false'}
                  onChange={(e) => setForm({ ...form, is_royal_student: e.target.value === 'true' })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                >
                  <option value="true">Đang học chính khóa tại Royal School (Được cấp suất bánh sữa)</option>
                  <option value="false">Đang học tại trường khác (Học viên ngoại khóa)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-rose-400 font-semibold mb-1">Lưu ý sức khỏe & Thực phẩm (Nếu có)</label>
              <input
                type="text"
                placeholder="Ví dụ: Uống sữa không đường, dị ứng phấn hoa hoặc đậu phộng..."
                value={form.medical_notes}
                onChange={(e) => setForm({ ...form, medical_notes: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-rose-500/30 text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Ghi chú thêm cho Nhà trường</label>
              <textarea
                rows={2}
                placeholder="Mong muốn cụ thể của phụ huynh..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm shadow-xl shadow-amber-500/25 transition-all flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4 text-slate-950" />
              <span>Gửi Đăng Ký Ngoại Khóa</span>
            </button>
          </form>
        </div>
      )}

    </div>
  );
};
