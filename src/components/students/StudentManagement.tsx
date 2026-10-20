import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  Milk, 
  AlertCircle, 
  ArrowRightLeft, 
  PhoneCall, 
  CheckCircle, 
  Clock, 
  Calendar,
  Sparkles,
  Edit,
  GraduationCap
} from 'lucide-react';
import { AppState } from '../../services/storage';
import { Student, ParentRegistration } from '../../types';
import { formatCapitalizedName } from '../../lib/formatters';

interface StudentManagementProps {
  state: AppState;
  onAddStudent: (student: Student) => void;
  onUpdateStudent: (student: Student) => void;
  onConvertStudentToRoyal: (studentId: string, newCode: string) => void;
  onProcessRegistration: (registrationId: string, status: 'contacted' | 'enrolled' | 'cancelled') => void;
}

export const StudentManagement: React.FC<StudentManagementProps> = ({
  state,
  onAddStudent,
  onUpdateStudent,
  onConvertStudentToRoyal,
  onProcessRegistration
}) => {
  const { students, enrollments, classes, registrations } = state;

  const [activeTab, setActiveTab] = useState<'students' | 'registrations'>('students');
  const [filterType, setFilterType] = useState<string>('all'); // all, royal, external
  const [searchTerm, setSearchTerm] = useState('');

  // Convert modal
  const [convertingStudent, setConvertingStudent] = useState<Student | null>(null);
  const [newRoyalCode, setNewRoyalCode] = useState('');

  // Add / Edit modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStudent, setNewStudent] = useState<Partial<Student>>({
    name: '',
    dob: '2016-01-01',
    gender: 'Nam',
    parent_name: '',
    parent_phone: '',
    school_name: 'Royal School PMH',
    regular_class: 'Lớp 4A1',
    is_royal_student: true,
    medical_notes: ''
  });

  // Filter students
  const filteredStudents = students.filter(s => {
    const matchesType = filterType === 'all' || 
      (filterType === 'royal' && s.is_royal_student) || 
      (filterType === 'external' && !s.is_royal_student);
    
    const matchesSearch = !searchTerm ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.previous_student_code && s.previous_student_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
      s.parent_phone.includes(searchTerm);

    return matchesType && matchesSearch;
  });

  const handleOpenConvertModal = (st: Student) => {
    setConvertingStudent(st);
    setNewRoyalCode(`RY-2026-${Math.floor(10000 + Math.random() * 90000)}`);
  };

  const handleConfirmConvert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingStudent || !newRoyalCode) return;
    onConvertStudentToRoyal(convertingStudent.id, newRoyalCode);
    setConvertingStudent(null);
  };

  const handleAddStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.parent_phone) return;

    const prefix = newStudent.is_royal_student ? 'RY-2026' : 'EXT-2026';
    const code = `${prefix}-${Math.floor(10000 + Math.random() * 90000)}`;

    const studentToAdd: Student = {
      id: 'stu-' + Date.now(),
      code: code,
      name: newStudent.name || '',
      dob: newStudent.dob || '2016-01-01',
      gender: (newStudent.gender as 'Nam' | 'Nữ') || 'Nam',
      parent_name: newStudent.parent_name || '',
      parent_phone: newStudent.parent_phone || '',
      school_name: newStudent.school_name,
      regular_class: newStudent.regular_class,
      is_royal_student: Boolean(newStudent.is_royal_student),
      medical_notes: newStudent.medical_notes,
      status: 'active',
      created_at: new Date().toISOString().split('T')[0]
    };

    onAddStudent(studentToAdd);
    setShowAddModal(false);
    setNewStudent({
      name: '',
      dob: '2016-01-01',
      gender: 'Nam',
      parent_name: '',
      parent_phone: '',
      school_name: 'Royal School PMH',
      regular_class: 'Lớp 4A1',
      is_royal_student: true,
      medical_notes: ''
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 p-6 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white">
                Hồ Sơ Học Viên & Quản Lý Tuyển Sinh
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Phân loại Học sinh Royal (RY-) & Học sinh ngoài (EXT-) &bull; Chuyển đổi mã bảo toàn lịch sử &bull; Hồ sơ dị ứng y tế
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-2xl">
              <button
                onClick={() => setActiveTab('students')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'students'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Danh Sách Học Viên ({students.length})
              </button>
              <button
                onClick={() => setActiveTab('registrations')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'registrations'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Đơn Đăng Ký Phụ Huynh ({registrations.length})
              </button>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Ghi Danh Mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab: Student Directory */}
      {activeTab === 'students' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-xl">
          
          <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-white">Danh Mục Học Sinh Toàn Hệ Thống</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                {filteredStudents.length} học sinh
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Tìm mã HV, tên bé, SĐT..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2" />
              </div>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-[#0B0F19] border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white"
              >
                <option value="all">Tất cả phân loại</option>
                <option value="royal">Chỉ học sinh Royal (RY-)</option>
                <option value="external">Chỉ học sinh ngoài (EXT-)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F19]/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Mã Học Sinh</th>
                  <th className="py-3 px-4">Họ Và Tên</th>
                  <th className="py-3 px-4">Phân Loại & Bánh Sữa</th>
                  <th className="py-3 px-4">Trường & Lớp Chính Khóa</th>
                  <th className="py-3 px-4">Phụ Huynh & SĐT</th>
                  <th className="py-3 px-4">Lưu Ý Y Tế & Dị Ứng</th>
                  <th className="py-3 px-4 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStudents.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-amber-400">{st.code}</div>
                      {st.previous_student_code && (
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <span className="text-slate-500">Mã cũ:</span> {st.previous_student_code}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-white text-sm">{st.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {st.gender} &bull; Sinh: {st.dob}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {st.is_royal_student ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[11px]">
                          <Milk className="w-3.5 h-3.5 text-amber-400" />
                          Học sinh Royal
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium text-[11px]">
                          Học sinh ngoài
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-200">{st.school_name || 'N/A'}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{st.regular_class || '-'}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-300">{st.parent_name}</div>
                      <a 
                        href={`tel:${st.parent_phone}`}
                        className="text-cyan-400 hover:underline font-mono text-[11px] flex items-center gap-1 mt-0.5"
                      >
                        <PhoneCall className="w-3 h-3" />
                        {st.parent_phone}
                      </a>
                    </td>

                    <td className="py-3.5 px-4">
                      {st.medical_notes ? (
                        <div className="flex items-start gap-1 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 p-1.5 rounded-lg max-w-xs">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <span>{st.medical_notes}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Bình thường</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {!st.is_royal_student ? (
                        <button
                          onClick={() => handleOpenConvertModal(st)}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1 mx-auto transition-all"
                          title="Học sinh ngoài chuyển sang học Royal"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          <span>Chuyển sang Royal</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-400 font-semibold flex items-center justify-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Chính khóa
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* Main Tab: Parent Registrations Triage */}
      {activeTab === 'registrations' && (
        <div className="rounded-3xl bg-[#111827]/80 border border-slate-800/80 overflow-hidden backdrop-blur-xl">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-white">Đơn Đăng Ký Trực Tuyến Từ Phụ Huynh (Portal)</h3>
              <p className="text-xs text-slate-400">
                Phụ huynh chỉ chọn môn và khung giờ &bull; Tuyển sinh liên hệ xếp lớp thực tế
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F19]/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Mã Đơn</th>
                  <th className="py-3 px-4">Phụ Huynh & SĐT</th>
                  <th className="py-3 px-4">Tên Bé & Ngày Sinh</th>
                  <th className="py-3 px-4">Môn Học Yêu Cầu</th>
                  <th className="py-3 px-4">Ghi Chú Y Tế</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-center">Xử Lý Tuyển Sinh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {registrations.map((reg) => {
                  const subject = state.subjects.find(s => s.id === reg.preferred_subject_id);
                  const slot = state.timeSlots.find(t => t.id === reg.preferred_time_slot_id);

                  return (
                    <tr key={reg.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                        {reg.code}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{reg.parent_name}</div>
                        <a 
                          href={`tel:${reg.parent_phone}`}
                          className="text-cyan-400 hover:underline font-mono text-[11px] flex items-center gap-1 mt-0.5"
                        >
                          <PhoneCall className="w-3 h-3" />
                          {reg.parent_phone}
                        </a>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-white text-sm">{reg.student_name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Sinh: {reg.dob} &bull; {reg.is_royal ? 'Học sinh Royal' : 'Học sinh ngoài'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-200">{subject?.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{slot?.name}</div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        {reg.medical_notes || <span className="text-slate-500 italic">Không có</span>}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {reg.status === 'pending' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Chờ gọi tư vấn
                          </span>
                        )}
                        {reg.status === 'contacted' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Đã liên hệ
                          </span>
                        )}
                        {reg.status === 'enrolled' && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Đã xếp lớp
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onProcessRegistration(reg.id, 'contacted')}
                            className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                          >
                            Đã Gọi
                          </button>
                          <button
                            onClick={() => onProcessRegistration(reg.id, 'enrolled')}
                            className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                          >
                            Ghi Danh
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

      {/* Modal: Chuyển đổi thành học sinh Royal */}
      {convertingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#111827] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-white">Chuyển Đổi Thành Học Sinh Royal</h3>
              </div>
              <button
                onClick={() => setConvertingStudent(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmConvert} className="space-y-4 text-xs">
              <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-3.5 text-slate-300 space-y-1">
                <span className="font-bold text-amber-400">Bảo Toàn 100% Lịch Sử:</span>
                <p>
                  Mã cũ <strong className="text-white font-mono">{convertingStudent.code}</strong> sẽ được lưu vết tại cột <code>previous_student_code</code>. Mọi hóa đơn, phiếu bảo lưu và chuyên cần được giữ nguyên.
                </p>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Học sinh</label>
                <div className="text-sm font-extrabold text-white">{convertingStudent.name}</div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Mã Định Danh Royal Mới (RY-2026-xxxxx)
                </label>
                <input
                  type="text"
                  required
                  value={newRoyalCode}
                  onChange={(e) => setNewRoyalCode(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setConvertingStudent(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  Xác Nhận Nâng Cấp Mã
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ghi Danh Học Sinh Mới */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#111827] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-white">Thêm Hồ Sơ Học Viên Mới</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Họ và tên học sinh *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Hoàng Bảo Nam"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: formatCapitalizedName(e.target.value) })}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white capitalize"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Ngày sinh</label>
                  <input
                    type="date"
                    value={newStudent.dob}
                    onChange={(e) => setNewStudent({ ...newStudent, dob: e.target.value })}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Giới tính</label>
                  <select
                    value={newStudent.gender}
                    onChange={(e) => setNewStudent({ ...newStudent, gender: e.target.value as any })}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Họ tên phụ huynh</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Hoàng Đình Trọng"
                    value={newStudent.parent_name}
                    onChange={(e) => setNewStudent({ ...newStudent, parent_name: formatCapitalizedName(e.target.value) })}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white capitalize"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">SĐT phụ huynh *</label>
                  <input
                    type="text"
                    required
                    placeholder="090..."
                    value={newStudent.parent_phone}
                    onChange={(e) => setNewStudent({ ...newStudent, parent_phone: e.target.value })}
                    className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Phân loại học sinh</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewStudent({ ...newStudent, is_royal_student: true })}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      newStudent.is_royal_student
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Học Sinh Royal (Cấp Bánh Sữa)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewStudent({ ...newStudent, is_royal_student: false })}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      !newStudent.is_royal_student
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Học Sinh Ngoài Trường
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Lưu ý y tế, dị ứng thực phẩm</label>
                <textarea
                  rows={2}
                  placeholder="Ví dụ: Uống sữa không đường, dị ứng tôm cua..."
                  value={newStudent.medical_notes}
                  onChange={(e) => setNewStudent({ ...newStudent, medical_notes: e.target.value })}
                  className="w-full bg-[#0B0F19] border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

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
                  Lưu Hồ Sơ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
