import * as XLSX from 'xlsx';
import { AppStore } from './storage';
import { formatCapitalizedName } from './formatters';
import {
  Campus,
  AcademicTerm,
  Subject,
  TermSubjectConfig,
  CampusTermPricing,
  Teacher,
  ExtracurricularClass,
  Student,
  Enrollment,
  AttendanceRecord,
  TeacherAttendanceRecord,
  TuitionInvoice,
} from '../types';

/**
 * XUẤT BẢNG TÍNH TỔNG THỂ 10 BẢNG DỮ LIỆU CHUẨN HÓA (10-SHEET MASTER WORKBOOK)
 * Đồng bộ 1-1 với 10 bảng CSDL PostgreSQL / Supabase
 */
export function exportMasterWorkbook(
  store: AppStore,
  filename = `RoyalSchool_CSDL_TongThe_10Bang_${new Date().toISOString().split('T')[0]}.xlsx`
) {
  const wb = XLSX.utils.book_new();

  // 01. 01_CO_SO (campuses)
  const ws1Headers = [
    'ID Cơ Sở',
    'Mã Cơ Sở',
    'Tên Cơ Sở',
    'Địa Chỉ',
    'Hotline',
    'Ngân Hàng',
    'Số Tài Khoản',
    'Chủ Tài Khoản',
    'Trạng Thái',
  ];
  const ws1Data = (store.campuses || []).map(c => ({
    'ID Cơ Sở': c.id,
    'Mã Cơ Sở': c.code,
    'Tên Cơ Sở': c.name,
    'Địa Chỉ': c.address,
    'Hotline': c.phone,
    'Ngân Hàng': c.bank_name,
    'Số Tài Khoản': c.bank_account,
    'Chủ Tài Khoản': c.bank_owner,
    'Trạng Thái': c.status === 'active' ? 'Hoạt động' : 'Tạm dừng',
  }));
  const ws1 = XLSX.utils.json_to_sheet(ws1Data, { header: ws1Headers });
  XLSX.utils.book_append_sheet(wb, ws1, '01_CO_SO');

  // 02. 02_KHOA_HOC (academic_terms)
  const ws2Headers = [
    'ID Khóa Học',
    'Mã Khóa Học',
    'Tên Khóa Học',
    'Năm Học',
    'Ngày Bắt Đầu',
    'Ngày Kết Thúc',
    'Trạng Thái Khóa',
    'Đang Kích Hoạt',
    'Mô Tả',
  ];
  const ws2Data = (store.terms || []).map(t => ({
    'ID Khóa Học': t.id,
    'Mã Khóa Học': t.code,
    'Tên Khóa Học': t.name,
    'Năm Học': t.academic_year,
    'Ngày Bắt Đầu': t.start_date,
    'Ngày Kết Thúc': t.end_date,
    'Trạng Thái Khóa': t.status,
    'Đang Kích Hoạt': t.is_active ? 'CÓ' : 'KHÔNG',
    'Mô Tả': t.description || '',
  }));
  const ws2 = XLSX.utils.json_to_sheet(ws2Data, { header: ws2Headers });
  XLSX.utils.book_append_sheet(wb, ws2, '02_KHOA_HOC');

  // 03. 03_MON_HOC_BIEU_PHI (subjects + termSubjects + campusPricings)
  const ws3Headers = [
    'ID Môn Học',
    'Mã Môn',
    'Tên Môn Ngoại Khóa',
    'Phân Loại Môn',
    'Thời Lượng Chuẩn',
    'Số Buổi Chuẩn',
    'Học Phí Chuẩn (VNĐ)',
    'Đơn Giá Buổi (VNĐ)',
    'Học Phí Cơ Sở PMH (VNĐ)',
    'Học Phí Cơ Sở PL (VNĐ)',
    'Mô Tả Chương Trình',
  ];
  const ws3Data = (store.subjects || []).map(s => {
    const ts = (store.termSubjects || []).find(item => item.subject_id === s.id);
    const pmh = (store.campusPricings || []).find(cp => cp.subject_id === s.id && cp.campus_id === 'camp_pmh');
    const pl = (store.campusPricings || []).find(cp => cp.subject_id === s.id && cp.campus_id === 'camp_pl');
    const stdSessions = ts?.standard_sessions || 24;
    const stdFee = ts?.standard_course_fee || 3990000;
    const stdRate = ts?.standard_session_rate || Math.ceil(stdFee / Math.max(1, stdSessions));
    return {
      'ID Môn Học': s.id,
      'Mã Môn': s.code,
      'Tên Môn Ngoại Khóa': s.name,
      'Phân Loại Môn': s.category,
      'Thời Lượng Chuẩn': s.standard_duration || '90 phút',
      'Số Buổi Chuẩn': stdSessions,
      'Học Phí Chuẩn (VNĐ)': stdFee,
      'Đơn Giá Buổi (VNĐ)': stdRate,
      'Học Phí Cơ Sở PMH (VNĐ)': pmh?.custom_course_fee || stdFee,
      'Học Phí Cơ Sở PL (VNĐ)': pl?.custom_course_fee || stdFee,
      'Mô Tả Chương Trình': s.description || '',
    };
  });
  const ws3 = XLSX.utils.json_to_sheet(ws3Data, { header: ws3Headers });
  XLSX.utils.book_append_sheet(wb, ws3, '03_MON_HOC_BIEU_PHI');

  // 04. 04_GIAO_VIEN (teachers)
  const ws4Headers = [
    'ID Giáo Viên',
    'Mã Giáo Viên',
    'Họ Tên Giáo Viên',
    'Số Điện Thoại',
    'Email Công Vụ',
    'Mã Cơ Sở Chính',
    'Phân Loại Nhân Sự',
    'Đơn Giá Thù Lao / Buổi (VNĐ)',
    'Số Tiết / Buổi',
    'Đơn Giá / Tiết (VNĐ)',
    'Ngân Hàng Nhận Lương',
    'Số Tài Khoản NH',
    'Chủ Tài Khoản NH',
    'Trạng Thái',
  ];
  const ws4Data = (store.teachers || []).map(tc => {
    const campus = (store.campuses || []).find(c => c.id === tc.campus_id);
    const isVisiting = (tc.type || tc.teacher_type) === 'visiting';
    return {
      'ID Giáo Viên': tc.id,
      'Mã Giáo Viên': tc.code || tc.id,
      'Họ Tên Giáo Viên': tc.name,
      'Số Điện Thoại': tc.phone,
      'Email Công Vụ': tc.email,
      'Mã Cơ Sở Chính': campus?.code || tc.campus_id || 'PMH',
      'Phân Loại Nhân Sự': isVisiting ? 'Thỉnh giảng' : 'Cơ hữu',
      'Đơn Giá Thù Lao / Buổi (VNĐ)': tc.fixed_rate_per_session || (isVisiting ? 270000 : 300000),
      'Số Tiết / Buổi': tc.periods_per_session || 2,
      'Đơn Giá / Tiết (VNĐ)': tc.default_rate_per_period || (isVisiting ? 135000 : 150000),
      'Ngân Hàng Nhận Lương': tc.bank_account?.bank_name || '',
      'Số Tài Khoản NH': tc.bank_account?.account_number || '',
      'Chủ Tài Khoản NH': tc.bank_account?.account_holder || '',
      'Trạng Thái': tc.status || 'active',
    };
  });
  const ws4 = XLSX.utils.json_to_sheet(ws4Data, { header: ws4Headers });
  XLSX.utils.book_append_sheet(wb, ws4, '04_GIAO_VIEN');

  // 05. 05_LOP_HOC (extracurricular_classes)
  const ws5Headers = [
    'Mã Lớp (ID)',
    'Tên Lớp Học',
    'Mã Khóa Học',
    'Mã Cơ Sở',
    'Mã Môn Học',
    'Mã Giáo Viên Chính',
    'Tên Giáo Viên Chính',
    'Các Thứ Học Trong Tuần',
    'Ngày Khai Giảng',
    'Ngày Kết Thúc',
    'Sĩ Số Tối Đa',
    'Tổng Số Buổi',
    'Học Phí Trọn Khóa (VNĐ)',
    'Đơn Giá 1 Buổi (VNĐ)',
    'Trạng Thái Lớp',
  ];
  const ws5Data = (store.classes || []).map(cl => {
    const campus = (store.campuses || []).find(c => c.id === cl.campus_id);
    const term = (store.terms || []).find(t => t.id === cl.term_id);
    const subject = (store.subjects || []).find(s => s.id === cl.subject_id);
    const teacher = (store.teachers || []).find(t => t.id === cl.primary_teacher_id);
    return {
      'Mã Lớp (ID)': cl.id,
      'Tên Lớp Học': cl.name,
      'Mã Khóa Học': term?.code || cl.term_id,
      'Mã Cơ Sở': campus?.code || cl.campus_id,
      'Mã Môn Học': subject?.code || cl.subject_id,
      'Mã Giáo Viên Chính': teacher?.code || cl.primary_teacher_id,
      'Tên Giáo Viên Chính': teacher?.name || '',
      'Các Thứ Học Trong Tuần': (cl.days_of_week || ['T2', 'T4']).join(', '),
      'Ngày Khai Giảng': cl.start_date || '',
      'Ngày Kết Thúc': cl.end_date || '',
      'Sĩ Số Tối Đa': cl.max_students,
      'Tổng Số Buổi': cl.total_sessions,
      'Học Phí Trọn Khóa (VNĐ)': cl.full_course_fee,
      'Đơn Giá 1 Buổi (VNĐ)': cl.price_per_session,
      'Trạng Thái Lớp': cl.status,
    };
  });
  const ws5 = XLSX.utils.json_to_sheet(ws5Data, { header: ws5Headers });
  XLSX.utils.book_append_sheet(wb, ws5, '05_LOP_HOC');

  // 06. 06_HOC_SINH (students)
  const ws6Headers = [
    'ID Học Sinh',
    'Mã Học Viên',
    'Mã Cũ (Nếu Có)',
    'Họ Và Tên Học Sinh',
    'Ngày Sinh',
    'Giới Tính',
    'Học Sinh Royal (Cấp Bánh Sữa)',
    'Trường Đang Học',
    'Lớp Chính Khóa',
    'Họ Tên Phụ Huynh',
    'SĐT Phụ Huynh',
    'Lưu Ý Y Tế & Thực Phẩm',
    'Trạng Thái',
    'Ngày Tạo Hồ Sơ',
  ];
  const ws6Data = (store.students || []).map(st => ({
    'ID Học Sinh': st.id,
    'Mã Học Viên': st.code,
    'Mã Cũ (Nếu Có)': st.previous_student_code || '',
    'Họ Và Tên Học Sinh': st.name,
    'Ngày Sinh': st.dob,
    'Giới Tính': st.gender,
    'Học Sinh Royal (Cấp Bánh Sữa)': st.is_royal_student ? 'CÓ' : 'KHÔNG',
    'Trường Đang Học': st.school_name || '',
    'Lớp Chính Khóa': st.regular_class || '',
    'Họ Tên Phụ Huynh': st.parent_name,
    'SĐT Phụ Huynh': st.parent_phone,
    'Lưu Ý Y Tế & Thực Phẩm': st.medical_notes || '',
    'Trạng Thái': st.status,
    'Ngày Tạo Hồ Sơ': st.created_at || '',
  }));
  const ws6 = XLSX.utils.json_to_sheet(ws6Data, { header: ws6Headers });
  XLSX.utils.book_append_sheet(wb, ws6, '06_HOC_SINH');

  // 07. 07_GHI_DANH (enrollments)
  const ws7Headers = [
    'ID Ghi Danh',
    'Mã Học Viên',
    'Tên Học Viên',
    'Mã Lớp Học',
    'Tên Lớp Học',
    'Số Buổi Đăng Ký',
    'Ngày Bắt Đầu Học',
    'Thứ Đăng Ký Học',
    'Học Bán Phần Tuần',
    'Đăng Ký Học Thử',
    'Ngày Học Thử',
    'Trạng Thái Ghi Danh',
  ];
  const ws7Data = (store.enrollments || []).map(en => {
    const student = (store.students || []).find(s => s.id === en.student_id);
    const cls = (store.classes || []).find(c => c.id === en.class_id);
    return {
      'ID Ghi Danh': en.id,
      'Mã Học Viên': student?.code || en.student_id,
      'Tên Học Viên': student?.name || '',
      'Mã Lớp Học': cls?.id || en.class_id,
      'Tên Lớp Học': cls?.name || '',
      'Số Buổi Đăng Ký': en.registered_sessions,
      'Ngày Bắt Đầu Học': en.joined_date,
      'Thứ Đăng Ký Học': (en.enrolled_days_of_week || cls?.days_of_week || []).join(', '),
      'Học Bán Phần Tuần': en.is_partial_schedule ? 'CÓ' : 'KHÔNG',
      'Đăng Ký Học Thử': en.is_trial ? 'CÓ' : 'KHÔNG',
      'Ngày Học Thử': en.trial_session_date || '',
      'Trạng Thái Ghi Danh': en.status,
    };
  });
  const ws7 = XLSX.utils.json_to_sheet(ws7Data, { header: ws7Headers });
  XLSX.utils.book_append_sheet(wb, ws7, '07_GHI_DANH');

  // 08. 08_DIEM_DANH_HS (attendance_records)
  const ws8Headers = [
    'ID Điểm Danh',
    'Mã Buổi Học',
    'Ngày Buổi Học',
    'Mã Lớp Học',
    'Tên Lớp Học',
    'Mã Học Viên',
    'Tên Học Viên',
    'Trạng Thái Chuyên Cần',
    'Ghi Chú Điểm Danh',
    'Tệp Minh Chứng',
    'Link Minh Chứng',
    'Người Xác Nhận',
  ];
  const ws8Data = (store.attendance || []).map(at => {
    const student = (store.students || []).find(s => s.id === at.student_id);
    const cls = (store.classes || []).find(c => c.id === at.class_id);
    return {
      'ID Điểm Danh': at.id,
      'Mã Buổi Học': at.session_id || '',
      'Ngày Buổi Học': at.session_date,
      'Mã Lớp Học': cls?.id || at.class_id,
      'Tên Lớp Học': cls?.name || '',
      'Mã Học Viên': student?.code || at.student_id,
      'Tên Học Viên': student?.name || '',
      'Trạng Thái Chuyên Cần':
        at.status === 'present'
          ? 'Có mặt'
          : at.status === 'absent_excused'
          ? 'Vắng Có phép'
          : 'Vắng Không phép',
      'Ghi Chú Điểm Danh': at.note || '',
      'Tệp Minh Chứng': at.proof_file_name || '',
      'Link Minh Chứng': at.proof_url && !at.proof_url.startsWith('data:') ? at.proof_url : '',
      'Người Xác Nhận': at.uploaded_by || '',
    };
  });
  const ws8 = XLSX.utils.json_to_sheet(ws8Data, { header: ws8Headers });
  XLSX.utils.book_append_sheet(wb, ws8, '08_DIEM_DANH_HS');

  // 09. 09_CHAM_CONG_GV (teacher_work_sessions)
  const ws9Headers = [
    'ID Ca Dạy',
    'Ngày Giảng Dạy',
    'Buổi Thứ',
    'Mã Khóa Học',
    'Mã Cơ Sở',
    'Mã Lớp Học',
    'Tên Lớp Học',
    'Mã GV Phân Công',
    'Tên GV Phân Công',
    'Mã GV Thực Dạy',
    'Tên GV Thực Dạy',
    'Là Ca Dạy Thay',
    'Trạng Thái Chấm Công',
    'Giờ Check-in',
    'Số Tiết Quy Đổi',
    'Đơn Giá Buổi Áp Dụng (VNĐ)',
    'Thành Tiền Thù Lao (VNĐ)',
    'Người Đối Soát',
    'Ghi Chú Ca Dạy',
  ];
  const ws9Data = (store.teacherAttendance || []).map(ta => {
    const cls = (store.classes || []).find(c => c.id === ta.class_id);
    const campus = (store.campuses || []).find(cp => cp.id === ta.campus_id);
    const term = (store.terms || []).find(tm => tm.id === ta.term_id);
    const assignedT = (store.teachers || []).find(t => t.id === ta.assigned_teacher_id);
    const actualT = (store.teachers || []).find(t => t.id === ta.actual_teacher_id);
    return {
      'ID Ca Dạy': ta.id,
      'Ngày Giảng Dạy': ta.session_date,
      'Buổi Thứ': ta.session_number,
      'Mã Khóa Học': term?.code || ta.term_id,
      'Mã Cơ Sở': campus?.code || ta.campus_id,
      'Mã Lớp Học': cls?.id || ta.class_id,
      'Tên Lớp Học': cls?.name || '',
      'Mã GV Phân Công': assignedT?.code || ta.assigned_teacher_id,
      'Tên GV Phân Công': assignedT?.name || '',
      'Mã GV Thực Dạy': actualT?.code || ta.actual_teacher_id,
      'Tên GV Thực Dạy': actualT?.name || '',
      'Là Ca Dạy Thay': ta.is_substitute ? 'CÓ' : 'KHÔNG',
      'Trạng Thái Chấm Công': ta.status,
      'Giờ Check-in': ta.check_in_time || '16:40',
      'Số Tiết Quy Đổi': ta.periods_count || 2,
      'Đơn Giá Buổi Áp Dụng (VNĐ)': ta.rate_applied || ta.total_payout || 300000,
      'Thành Tiền Thù Lao (VNĐ)': ta.total_payout || 0,
      'Người Đối Soát': ta.verified_by || '',
      'Ghi Chú Ca Dạy': ta.notes || '',
    };
  });
  const ws9 = XLSX.utils.json_to_sheet(ws9Data, { header: ws9Headers });
  XLSX.utils.book_append_sheet(wb, ws9, '09_CHAM_CONG_GV');

  // 10. 10_HOA_DON_BAO_LUU (tuition_invoices & credit_notes)
  const ws10Headers = [
    'ID Hóa Đơn',
    'Số Hóa Đơn',
    'Mã Học Viên',
    'Tên Học Viên',
    'Mã Lớp Học',
    'Tên Lớp Học',
    'Số Buổi Tính Phí',
    'Đơn Giá 1 Buổi (VNĐ)',
    'Học Phí Gốc (VNĐ)',
    'Cấn Trừ Bảo Lưu (VNĐ)',
    'Ưu Đãi Giảm Trừ (VNĐ)',
    'Thực Thu Phải Đóng (VNĐ)',
    'Đã Thanh Toán (VNĐ)',
    'Còn Nợ (VNĐ)',
    'Trạng Thái Thanh Toán',
    'Hạn Thanh Toán',
    'Mã Giao Dịch Ngân Hàng',
    'Kế Toán Xác Nhận',
    'Ngày Lập Hóa Đơn',
  ];
  const ws10Data = (store.invoices || []).map(inv => {
    const student = (store.students || []).find(s => s.id === inv.student_id);
    const cls = (store.classes || []).find(c => c.id === inv.class_id);
    return {
      'ID Hóa Đơn': inv.id,
      'Số Hóa Đơn': inv.invoice_code,
      'Mã Học Viên': student?.code || inv.student_id,
      'Tên Học Viên': student?.name || '',
      'Mã Lớp Học': cls?.id || inv.class_id,
      'Tên Lớp Học': cls?.name || '',
      'Số Buổi Tính Phí': inv.registered_sessions || cls?.total_sessions || 24,
      'Đơn Giá 1 Buổi (VNĐ)': inv.session_rate || cls?.price_per_session || 166250,
      'Học Phí Gốc (VNĐ)': inv.gross_amount,
      'Cấn Trừ Bảo Lưu (VNĐ)': inv.credit_deducted || 0,
      'Ưu Đãi Giảm Trừ (VNĐ)': inv.discount_amount || 0,
      'Thực Thu Phải Đóng (VNĐ)': inv.net_payable,
      'Đã Thanh Toán (VNĐ)': inv.paid_amount,
      'Còn Nợ (VNĐ)': inv.outstanding_amount,
      'Trạng Thái Thanh Toán': inv.payment_status,
      'Hạn Thanh Toán': inv.due_date,
      'Mã Giao Dịch Ngân Hàng': inv.payment_reference || '',
      'Kế Toán Xác Nhận': inv.verified_by || '',
      'Ngày Lập Hóa Đơn': inv.created_at,
    };
  });
  const ws10 = XLSX.utils.json_to_sheet(ws10Data, { header: ws10Headers });
  XLSX.utils.book_append_sheet(wb, ws10, '10_HOA_DON_BAO_LUU');

  XLSX.writeFile(wb, filename);
}

/**
 * TẢI TỆP MẪU CHUẨN 10 BẢNG DỮ LIỆU CSDL (DÙNG ĐỂ NHẬP LIỆU HÀNG LOẠT)
 */
export function downloadSampleTemplate() {
  const sampleStore: AppStore = {
    users: [],
    campuses: [
      {
        id: 'camp_pmh',
        code: 'PMH',
        name: 'Cơ sở Phú Mỹ Hưng (Quận 7)',
        address: '08 Đặng Đại Độ, P. Tân Phong, Quận 7, TP.HCM',
        phone: '028 7100 7878',
        bank_name: 'Vietcombank - CN Nam Sài Gòn',
        bank_account: '0181003456789',
        bank_owner: 'CONG TY CP GD QUOC TE HOANG GIA PMH',
        status: 'active',
      },
      {
        id: 'camp_pl',
        code: 'PL',
        name: 'Cơ sở Phú Lâm (Quận 6)',
        address: '02 Đường số 2D, P. An Lạc, Quận Bình Tân - Phú Lâm, TP.HCM',
        phone: '028 7101 2345',
        bank_name: 'BIDV - CN Tây Sài Gòn',
        bank_account: '1301000987654',
        bank_owner: 'CONG TY CP GD QUOC TE HOANG GIA PHU LAM',
        status: 'active',
      },
    ],
    terms: [
      {
        id: 'term_fall_2026',
        code: 'FALL-2026',
        name: 'Khóa Mùa Thu 2026 (HK1)',
        academic_year: '2026-2027',
        start_date: '2026-09-01',
        end_date: '2026-12-25',
        is_active: true,
        status: 'open_enrollment',
        description: 'Khóa ngoại khóa học kỳ 1 năm học 2026-2027',
      },
    ],
    subjectCategories: [],
    subjects: [
      {
        id: 'sub_swim',
        code: 'SWIM',
        name: 'Bơi Lội Hoàng Gia (Royal Swimming)',
        category: 'Thể Thao & Vận Động',
        standard_duration: '90 phút',
        description: 'Kỹ năng bơi lội an toàn chuẩn Olympic',
      },
    ],
    termSubjects: [
      {
        id: 'ts_fall_swim',
        term_id: 'term_fall_2026',
        subject_id: 'sub_swim',
        is_active: true,
        standard_sessions: 24,
        standard_course_fee: 3990000,
        standard_session_rate: 166250,
      },
    ],
    campusPricings: [
      {
        id: 'cp_pmh_fall_swim',
        campus_id: 'camp_pmh',
        term_id: 'term_fall_2026',
        subject_id: 'sub_swim',
        override_pricing: true,
        custom_course_fee: 3990000,
        custom_sessions: 24,
        custom_session_rate: 166250,
        is_offered_at_campus: true,
      },
      {
        id: 'cp_pl_fall_swim',
        campus_id: 'camp_pl',
        term_id: 'term_fall_2026',
        subject_id: 'sub_swim',
        override_pricing: true,
        custom_course_fee: 3800000,
        custom_sessions: 24,
        custom_session_rate: 158333,
        is_offered_at_campus: true,
      },
    ],
    pricings: [],
    facilities: [],
    timeSlots: [],
    teachers: [
      {
        id: 'tea_1',
        code: 'GV-PMH-001',
        name: 'ThS. Đỗ Thu Hương',
        phone: '0908 554 433',
        email: 'huong.do@royal.edu.vn',
        campus_id: 'camp_pmh',
        type: 'permanent',
        teacher_type: 'permanent',
        fixed_rate_per_session: 300000,
        default_rate_per_period: 150000,
        periods_per_session: 2,
        percentage_rate: 0,
        bank_account: {
          bank_name: 'Vietcombank',
          account_number: '0181009988771',
          account_holder: 'DO THU HUONG',
        },
        status: 'active',
      },
    ],
    classes: [
      {
        id: 'cls_swim_pmh_01',
        name: 'Bơi Lội Sơ Cấp Cá Heo - PMH (T2-T4)',
        term_id: 'term_fall_2026',
        campus_id: 'camp_pmh',
        subject_id: 'sub_swim',
        facility_id: 'fac_pool_pmh',
        time_slot_id: 'slot_weekday_1',
        days_of_week: ['T2', 'T4'],
        start_date: '2026-09-01',
        end_date: '2026-11-25',
        primary_teacher_id: 'tea_1',
        max_students: 20,
        total_sessions: 24,
        full_course_fee: 3990000,
        price_per_session: 166250,
        status: 'active',
      },
    ],
    students: [
      {
        id: 'std_01',
        code: 'RY-2026-00001',
        name: 'Lương Gia Bảo',
        dob: '2016-05-14',
        gender: 'Nam',
        parent_name: 'Lương Minh Trí',
        parent_phone: '0935 443 322',
        school_name: 'Royal School PMH',
        regular_class: 'Grade 4A1',
        is_royal_student: true,
        medical_notes: '',
        status: 'active',
        created_at: '2026-08-25',
      },
    ],
    enrollments: [
      {
        id: 'enr_01',
        student_id: 'std_01',
        class_id: 'cls_swim_pmh_01',
        registered_sessions: 24,
        joined_date: '2026-09-01',
        enrolled_days_of_week: ['T2', 'T4'],
        is_partial_schedule: false,
        is_trial: false,
        status: 'active',
      },
    ],
    attendance: [
      {
        id: 'att_01',
        session_id: 'ses_swim_pmh_01',
        class_id: 'cls_swim_pmh_01',
        student_id: 'std_01',
        session_date: '2026-09-01',
        status: 'present',
        note: 'Đi học đúng giờ',
        uploaded_by: 'ThS. Đỗ Thu Hương',
      },
    ],
    teacherAttendance: [
      {
        id: 'tatt_01',
        class_id: 'cls_swim_pmh_01',
        term_id: 'term_fall_2026',
        campus_id: 'camp_pmh',
        session_date: '2026-09-01',
        session_number: 1,
        periods_count: 2,
        assigned_teacher_id: 'tea_1',
        actual_teacher_id: 'tea_1',
        is_substitute: false,
        status: 'present',
        check_in_time: '16:35',
        rate_per_period: 150000,
        rate_applied: 300000,
        earned_amount: 300000,
        total_payout: 300000,
        verified_by: 'Ban Học Vụ PMH',
        notes: 'Hoàn thành tốt ca dạy',
      },
    ],
    invoices: [
      {
        id: 'inv_01',
        invoice_code: 'INV-2026-0001',
        student_id: 'std_01',
        class_id: 'cls_swim_pmh_01',
        registered_sessions: 24,
        total_class_sessions: 24,
        session_rate: 166250,
        gross_amount: 3990000,
        credit_deducted: 0,
        discount_amount: 0,
        net_payable: 3990000,
        paid_amount: 3990000,
        outstanding_amount: 0,
        payment_status: 'paid',
        due_date: '2026-09-05',
        payment_reference: 'VCB-FT2624599881',
        verified_by: 'Cô Lê Thị Kim Cúc',
        created_at: '2026-08-26',
      },
    ],
    sessions: [],
    makeupCredits: [],
    transfers: [],
    payrollSettlements: [],
    parentRegistrations: [],
    notifications: [],
    auditLogs: [],
    telecomConfig: { zaloZnsEnabled: true, smsBrandnameEnabled: true, emailEnabled: true, brandName: 'ROYAL SCHOOL' },
    supabaseConfig: { url: '', anonKey: '', isConnected: false },
  };

  exportMasterWorkbook(sampleStore, 'RoyalSchool_Master_Template_10_Bang_Chuan_CSDL.xlsx');
}

export interface ExcelParseSheetStat {
  sheetName: string;
  tableName: string;
  rowsCount: number;
}

/**
 * ĐỌC VÀ ĐỒNG BỘ TỆP EXCEL BẢNG TÍNH TỔNG THỂ (10 BẢNG DỮ LIỆU)
 * Hỗ trợ đọc đầy đủ cả 10 sheet và tự động ánh xạ khóa ngoại
 */
export async function parseMasterExcelFile(
  file: File,
  currentStore?: AppStore
): Promise<{
  success: boolean;
  message: string;
  data?: Partial<AppStore>;
  sheetStats?: ExcelParseSheetStat[];
}> {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });

    const sheetNames = wb.SheetNames;
    const importedData: Partial<AppStore> = {};
    const sheetStats: ExcelParseSheetStat[] = [];
    let totalRowsParsed = 0;

    const findSheet = (keywords: string[]) =>
      sheetNames.find(s => keywords.some(kw => s.toUpperCase().includes(kw.toUpperCase())));

    // 01. 01_CO_SO -> campuses
    const s1 = findSheet(['01_CO_SO', 'CAMPUSES']);
    if (s1) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s1]);
      if (rows.length > 0) {
        importedData.campuses = rows
          .filter(r => r['Mã Cơ Sở'] || r['code'] || r['Tên Cơ Sở'])
          .map((r, idx): Campus => {
            const code = String(r['Mã Cơ Sở'] || r['code'] || `CS${idx + 1}`).trim().toUpperCase();
            return {
              id: String(r['ID Cơ Sở'] || r['id'] || (code === 'PMH' ? 'camp_pmh' : code === 'PL' ? 'camp_pl' : `camp_${code.toLowerCase()}`)).trim(),
              code,
              name: String(r['Tên Cơ Sở'] || r['name'] || `Cơ sở ${code}`).trim(),
              address: String(r['Địa Chỉ'] || r['address'] || '').trim(),
              phone: String(r['Hotline'] || r['phone'] || '').trim(),
              bank_name: String(r['Ngân Hàng'] || r['bank_name'] || 'Vietcombank').trim(),
              bank_account: String(r['Số Tài Khoản'] || r['bank_account'] || '').trim(),
              bank_owner: String(r['Chủ Tài Khoản'] || r['bank_owner'] || '').trim(),
              status: String(r['Trạng Thái'] || 'active').toLowerCase().includes('tạm') ? 'inactive' : 'active',
            };
          });
        totalRowsParsed += importedData.campuses.length;
        sheetStats.push({ sheetName: s1, tableName: 'campuses', rowsCount: importedData.campuses.length });
      }
    }

    const activeCampuses = importedData.campuses || currentStore?.campuses || [];

    // 02. 02_KHOA_HOC -> terms
    const s2 = findSheet(['02_KHOA_HOC', 'ACADEMIC_TERMS', 'KHOA_HOC']);
    if (s2) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s2]);
      if (rows.length > 0) {
        importedData.terms = rows
          .filter(r => r['Mã Khóa Học'] || r['code'] || r['Tên Khóa Học'])
          .map((r, idx): AcademicTerm => {
            const code = String(r['Mã Khóa Học'] || r['code'] || `TERM-${idx + 1}`).trim().toUpperCase();
            const rawActive = String(r['Đang Kích Hoạt'] ?? r['is_active'] ?? 'CÓ').toUpperCase();
            const isActive = rawActive.includes('CÓ') || rawActive === 'TRUE' || rawActive === '1';
            return {
              id: String(r['ID Khóa Học'] || r['id'] || `term_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`).trim(),
              code,
              name: String(r['Tên Khóa Học'] || r['name'] || code).trim(),
              academic_year: String(r['Năm Học'] || r['academic_year'] || '2026-2027').trim(),
              start_date: String(r['Ngày Bắt Đầu'] || r['start_date'] || '2026-09-01').trim(),
              end_date: String(r['Ngày Kết Thúc'] || r['end_date'] || '2026-12-25').trim(),
              is_active: isActive,
              status: (r['Trạng Thái Khóa'] || (isActive ? 'open_enrollment' : 'draft')) as any,
              description: String(r['Mô Tả'] || r['description'] || '').trim(),
            };
          });
        totalRowsParsed += importedData.terms.length;
        sheetStats.push({ sheetName: s2, tableName: 'academic_terms', rowsCount: importedData.terms.length });
      }
    }

    const activeTerms = importedData.terms || currentStore?.terms || [];
    const primaryTermId = activeTerms[0]?.id || 'term_fall_2026';

    // 03. 03_MON_HOC_BIEU_PHI -> subjects + termSubjects + campusPricings
    const s3 = findSheet(['03_MON_HOC', 'SUBJECTS', 'MON_HOC']);
    if (s3) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s3]);
      if (rows.length > 0) {
        const newSubjects: Subject[] = [];
        const newTermSubjects: TermSubjectConfig[] = [];
        const newCampusPricings: CampusTermPricing[] = [];

        rows
          .filter(r => r['Mã Môn'] || r['code'] || r['Tên Môn Ngoại Khóa'])
          .forEach((r, idx) => {
            const code = String(r['Mã Môn'] || r['code'] || `SUB${idx + 1}`).trim().toUpperCase();
            const subId = String(r['ID Môn Học'] || r['id'] || `sub_${code.toLowerCase()}`).trim();
            const name = String(r['Tên Môn Ngoại Khóa'] || r['name'] || code).trim();
            const category = String(r['Phân Loại Môn'] || r['Phân Loại'] || r['category'] || 'Thể Thao & Vận Động').trim();
            const duration = String(r['Thời Lượng Chuẩn'] || r['standard_duration'] || '90 phút').trim();
            const stdSessions = Number(r['Số Buổi Chuẩn'] || 24) || 24;
            const stdFee = Number(r['Học Phí Chuẩn (VNĐ)'] || 3990000) || 3990000;
            const stdRate = Number(r['Đơn Giá Buổi (VNĐ)']) || Math.ceil(stdFee / Math.max(1, stdSessions));
            const pmhFee = Number(r['Học Phí Cơ Sở PMH (VNĐ)']) || stdFee;
            const plFee = Number(r['Học Phí Cơ Sở PL (VNĐ)']) || stdFee;

            newSubjects.push({
              id: subId,
              code,
              name,
              category,
              standard_duration: duration,
              description: String(r['Mô Tả Chương Trình'] || '').trim(),
            });

            newTermSubjects.push({
              id: `ts_${primaryTermId}_${subId}`,
              term_id: primaryTermId,
              subject_id: subId,
              is_active: true,
              standard_sessions: stdSessions,
              standard_course_fee: stdFee,
              standard_session_rate: stdRate,
            });

            newCampusPricings.push(
              {
                id: `cp_pmh_${primaryTermId}_${subId}`,
                campus_id: 'camp_pmh',
                term_id: primaryTermId,
                subject_id: subId,
                override_pricing: true,
                custom_course_fee: pmhFee,
                custom_sessions: stdSessions,
                custom_session_rate: Math.ceil(pmhFee / Math.max(1, stdSessions)),
                is_offered_at_campus: true,
              },
              {
                id: `cp_pl_${primaryTermId}_${subId}`,
                campus_id: 'camp_pl',
                term_id: primaryTermId,
                subject_id: subId,
                override_pricing: true,
                custom_course_fee: plFee,
                custom_sessions: stdSessions,
                custom_session_rate: Math.ceil(plFee / Math.max(1, stdSessions)),
                is_offered_at_campus: true,
              }
            );
          });

        importedData.subjects = newSubjects;
        importedData.termSubjects = newTermSubjects;
        importedData.campusPricings = newCampusPricings;
        totalRowsParsed += newSubjects.length;
        sheetStats.push({ sheetName: s3, tableName: 'subjects', rowsCount: newSubjects.length });
      }
    }

    const activeSubjects = importedData.subjects || currentStore?.subjects || [];

    // 04. 04_GIAO_VIEN -> teachers
    const s4 = findSheet(['04_GIAO_VIEN', '05_GIAO_VIEN', 'TEACHERS', 'GIAO_VIEN']);
    if (s4) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s4]);
      if (rows.length > 0) {
        importedData.teachers = rows
          .filter(r => r['Họ Tên Giáo Viên'] || r['name'])
          .map((r, idx): Teacher => {
            const rawType = String(r['Phân Loại Nhân Sự'] || r['Hình Thức Hợp Đồng'] || r['type'] || 'Cơ hữu').toLowerCase();
            const isVisiting = rawType.includes('thỉnh') || rawType.includes('visiting');
            const sessionRate = Number(r['Đơn Giá Thù Lao / Buổi (VNĐ)'] || r['Thù Lao Cố Định Buổi (VND)']) || (isVisiting ? 270000 : 300000);
            const periods = Number(r['Số Tiết / Buổi']) || 2;
            const periodRate = Number(r['Đơn Giá / Tiết (VNĐ)']) || Math.round(sessionRate / periods);
            const rawCampus = String(r['Mã Cơ Sở Chính'] || 'PMH').trim().toUpperCase();
            const matchedCampus = activeCampuses.find(c => c.code.toUpperCase() === rawCampus || c.id === rawCampus);
            const name = formatCapitalizedName(String(r['Họ Tên Giáo Viên'] || r['name']).trim());

            return {
              id: String(r['ID Giáo Viên'] || r['id'] || `tea_imp_${idx + 1}`).trim(),
              code: String(r['Mã Giáo Viên'] || r['code'] || `GV-${rawCampus}-${String(idx + 1).padStart(3, '0')}`).trim(),
              name,
              phone: String(r['Số Điện Thoại'] || r['phone'] || '').trim(),
              email: String(r['Email Công Vụ'] || r['Email'] || r['email'] || '').trim(),
              campus_id: matchedCampus?.id || 'camp_pmh',
              type: isVisiting ? 'visiting' : 'permanent',
              teacher_type: isVisiting ? 'visiting' : 'permanent',
              fixed_rate_per_session: sessionRate,
              default_rate_per_period: periodRate,
              periods_per_session: periods,
              percentage_rate: 60,
              bank_account: {
                bank_name: String(r['Ngân Hàng Nhận Lương'] || 'Vietcombank').trim(),
                account_number: String(r['Số Tài Khoản NH'] || '').trim(),
                account_holder: String(r['Chủ Tài Khoản NH'] || name.toUpperCase()).trim(),
              },
              status: 'active',
            };
          });
        totalRowsParsed += importedData.teachers.length;
        sheetStats.push({ sheetName: s4, tableName: 'teachers', rowsCount: importedData.teachers.length });
      }
    }

    const activeTeachers = importedData.teachers || currentStore?.teachers || [];

    // 05. 05_LOP_HOC -> classes
    const s5 = findSheet(['05_LOP_HOC', '06_LOP_HOC', 'CLASSES', 'LOP_HOC']);
    if (s5) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s5]);
      if (rows.length > 0) {
        importedData.classes = rows
          .filter(r => r['Tên Lớp Học'] || r['name'])
          .map((r, idx): ExtracurricularClass => {
            const rawCampus = String(r['Mã Cơ Sở'] || r['Cơ Sở'] || 'PMH').trim();
            const matchedCampus = activeCampuses.find(c => c.code.toUpperCase() === rawCampus.toUpperCase() || c.id === rawCampus);
            const rawTerm = String(r['Mã Khóa Học'] || primaryTermId).trim();
            const matchedTerm = activeTerms.find(t => t.code.toUpperCase() === rawTerm.toUpperCase() || t.id === rawTerm);
            const rawSub = String(r['Mã Môn Học'] || r['Môn Học'] || '').trim();
            const matchedSub = activeSubjects.find(
              s => s.code.toUpperCase() === rawSub.toUpperCase() || s.id === rawSub || s.name.toLowerCase() === rawSub.toLowerCase()
            );
            const rawTeacher = String(r['Mã Giáo Viên Chính'] || r['Giáo Viên Chính'] || '').trim();
            const matchedTeacher = activeTeachers.find(
              t => (t.code || '').toUpperCase() === rawTeacher.toUpperCase() || t.id === rawTeacher || t.name.toLowerCase() === rawTeacher.toLowerCase()
            );
            const rawDays = String(r['Các Thứ Học Trong Tuần'] || 'T2, T4')
              .split(/[,;&]/)
              .map(d => d.trim().toUpperCase())
              .filter(Boolean);
            const totalSessions = Number(r['Tổng Số Buổi'] || 24) || 24;
            const fullFee = Number(r['Học Phí Trọn Khóa (VNĐ)'] || r['Học Phí Trọn Khóa'] || 3990000) || 3990000;
            const rate = Number(r['Đơn Giá 1 Buổi (VNĐ)'] || r['Đơn Giá 1 Buổi']) || Math.ceil(fullFee / Math.max(1, totalSessions));

            return {
              id: String(r['Mã Lớp (ID)'] || r['Mã Lớp'] || r['id'] || `cls_imp_${idx + 1}`).trim(),
              name: String(r['Tên Lớp Học'] || r['name']).trim(),
              term_id: matchedTerm?.id || primaryTermId,
              campus_id: matchedCampus?.id || 'camp_pmh',
              subject_id: matchedSub?.id || activeSubjects[0]?.id || 'sub_swim',
              facility_id: 'fac_01',
              time_slot_id: 'slot_weekday_1',
              days_of_week: rawDays.length > 0 ? rawDays : ['T2', 'T4'],
              start_date: String(r['Ngày Khai Giảng'] || matchedTerm?.start_date || '2026-09-01').trim(),
              end_date: String(r['Ngày Kết Thúc'] || matchedTerm?.end_date || '2026-12-25').trim(),
              primary_teacher_id: matchedTeacher?.id || activeTeachers[0]?.id || '',
              max_students: Number(r['Sĩ Số Tối Đa'] || 25) || 25,
              total_sessions: totalSessions,
              full_course_fee: fullFee,
              price_per_session: rate,
              status: (r['Trạng Thái Lớp'] || r['Trạng Thái'] || 'active') as any,
            };
          });
        totalRowsParsed += importedData.classes.length;
        sheetStats.push({ sheetName: s5, tableName: 'extracurricular_classes', rowsCount: importedData.classes.length });
      }
    }

    const activeClasses = importedData.classes || currentStore?.classes || [];

    // 06. 06_HOC_SINH -> students
    const s6 = findSheet(['06_HOC_SINH', '07_HOC_VIEN', 'STUDENTS', 'HOC_SINH', 'HOC_VIEN']);
    if (s6) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s6]);
      if (rows.length > 0) {
        importedData.students = rows
          .filter(r => r['Họ Và Tên Học Sinh'] || r['Họ Và Tên'] || r['name'])
          .map((r, idx): Student => {
            const rawRoyal = String(r['Học Sinh Royal (Cấp Bánh Sữa)'] ?? r['is_royal_student'] ?? 'CÓ').toLowerCase();
            const isRoyal = rawRoyal.includes('có') || rawRoyal.includes('yes') || rawRoyal.includes('true') || rawRoyal.includes('royal');
            const code = String(r['Mã Học Viên'] || r['code'] || `RY-2026-${String(idx + 1).padStart(5, '0')}`).trim();
            return {
              id: String(r['ID Học Sinh'] || r['id'] || `std_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`).trim(),
              code,
              previous_student_code: r['Mã Cũ (Nếu Có)'] || r['Mã Cũ (Nếu chuyển từ Ngoài vào)']
                ? String(r['Mã Cũ (Nếu Có)'] || r['Mã Cũ (Nếu chuyển từ Ngoài vào)']).trim()
                : undefined,
              name: formatCapitalizedName(String(r['Họ Và Tên Học Sinh'] || r['Họ Và Tên'] || r['name']).trim()),
              dob: String(r['Ngày Sinh'] || r['dob'] || '2016-01-01').trim(),
              gender: String(r['Giới Tính'] || 'Nam').includes('Nữ') ? 'Nữ' : 'Nam',
              parent_name: formatCapitalizedName(String(r['Họ Tên Phụ Huynh'] || r['Phụ Huynh'] || '').trim()),
              parent_phone: String(r['SĐT Phụ Huynh'] || '').trim(),
              school_name: String(r['Trường Đang Học'] || (isRoyal ? 'Royal School' : 'Trường ngoài')).trim(),
              regular_class: String(r['Lớp Chính Khóa'] || '').trim(),
              is_royal_student: isRoyal,
              medical_notes: String(r['Lưu Ý Y Tế & Thực Phẩm'] || '').trim(),
              status: 'active',
              created_at: String(r['Ngày Tạo Hồ Sơ'] || new Date().toISOString().split('T')[0]).trim(),
            };
          });
        totalRowsParsed += importedData.students.length;
        sheetStats.push({ sheetName: s6, tableName: 'students', rowsCount: importedData.students.length });
      }
    }

    const activeStudents = importedData.students || currentStore?.students || [];

    // 07. 07_GHI_DANH -> enrollments
    const s7 = findSheet(['07_GHI_DANH', '08_GHI_DANH', 'ENROLLMENTS', 'GHI_DANH']);
    if (s7) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s7]);
      if (rows.length > 0) {
        importedData.enrollments = rows
          .filter(r => r['Mã Học Viên'] || r['student_id'])
          .map((r, idx): Enrollment => {
            const rawStu = String(r['Mã Học Viên'] || r['student_id'] || '').trim();
            const matchedStu = activeStudents.find(s => s.code === rawStu || s.id === rawStu || s.name === rawStu);
            const rawCls = String(r['Mã Lớp Học'] || r['Lớp Học'] || r['class_id'] || '').trim();
            const matchedCls = activeClasses.find(c => c.id === rawCls || c.name === rawCls || c.code === rawCls);
            const rawDays = String(r['Thứ Đăng Ký Học'] || '')
              .split(/[,;&]/)
              .map(d => d.trim().toUpperCase())
              .filter(Boolean);
            const isPartial = String(r['Học Bán Phần Tuần'] || '').toUpperCase().includes('CÓ');
            const isTrial = String(r['Đăng Ký Học Thử'] || '').toUpperCase().includes('CÓ');

            return {
              id: String(r['ID Ghi Danh'] || r['id'] || `enr_imp_${idx + 1}`).trim(),
              student_id: matchedStu?.id || rawStu,
              class_id: matchedCls?.id || rawCls,
              registered_sessions: Number(r['Số Buổi Đăng Ký'] || matchedCls?.total_sessions || 24) || 24,
              joined_date: String(r['Ngày Bắt Đầu Học'] || r['Ngày Bắt Đầu'] || '2026-09-01').trim(),
              enrolled_days_of_week: rawDays.length > 0 ? rawDays : matchedCls?.days_of_week,
              is_partial_schedule: isPartial,
              is_trial: isTrial,
              trial_session_date: r['Ngày Học Thử'] ? String(r['Ngày Học Thử']).trim() : undefined,
              status: (r['Trạng Thái Ghi Danh'] || r['Trạng Thái'] || 'active') as any,
            };
          });
        totalRowsParsed += importedData.enrollments.length;
        sheetStats.push({ sheetName: s7, tableName: 'enrollments', rowsCount: importedData.enrollments.length });
      }
    }

    // 08. 08_DIEM_DANH_HS -> attendance
    const s8 = findSheet(['08_DIEM_DANH_HS', '09_DIEM_DANH_BUOI', 'ATTENDANCE_RECORDS']);
    if (s8) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s8]);
      if (rows.length > 0) {
        importedData.attendance = rows
          .filter(r => r['Ngày Buổi Học'] && (r['Mã Học Viên'] || r['student_id']))
          .map((r, idx): AttendanceRecord => {
            const rawStu = String(r['Mã Học Viên'] || r['student_id'] || '').trim();
            const matchedStu = activeStudents.find(s => s.code === rawStu || s.id === rawStu);
            const rawCls = String(r['Mã Lớp Học'] || r['Lớp Học'] || r['class_id'] || '').trim();
            const matchedCls = activeClasses.find(c => c.id === rawCls || c.name === rawCls);
            const rawStatus = String(r['Trạng Thái Chuyên Cần'] || r['Chuyên Cần'] || 'present').toLowerCase();
            const status =
              rawStatus.includes('có phép') || rawStatus === 'absent_excused'
                ? 'absent_excused'
                : rawStatus.includes('không phép') || rawStatus === 'absent_unexcused'
                ? 'absent_unexcused'
                : 'present';

            return {
              id: String(r['ID Điểm Danh'] || r['id'] || `att_imp_${idx + 1}`).trim(),
              session_id: String(r['Mã Buổi Học'] || `ses_${idx + 1}`).trim(),
              class_id: matchedCls?.id || rawCls,
              student_id: matchedStu?.id || rawStu,
              session_date: String(r['Ngày Buổi Học']).trim(),
              status,
              note: String(r['Ghi Chú Điểm Danh'] || r['Ghi Chú'] || '').trim(),
              proof_file_name: r['Tệp Minh Chứng'] ? String(r['Tệp Minh Chứng']).trim() : undefined,
              proof_url: r['Link Minh Chứng'] ? String(r['Link Minh Chứng']).trim() : undefined,
              uploaded_by: r['Người Xác Nhận'] ? String(r['Người Xác Nhận']).trim() : undefined,
            };
          });
        totalRowsParsed += importedData.attendance.length;
        sheetStats.push({ sheetName: s8, tableName: 'attendance_records', rowsCount: importedData.attendance.length });
      }
    }

    // 09. 09_CHAM_CONG_GV -> teacherAttendance
    const s9 = findSheet(['09_CHAM_CONG_GV', 'TEACHER_WORK_SESSIONS', 'CHAM_CONG_GV']);
    if (s9) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s9]);
      if (rows.length > 0) {
        importedData.teacherAttendance = rows
          .filter(r => r['Ngày Giảng Dạy'])
          .map((r, idx): TeacherAttendanceRecord => {
            const rawCls = String(r['Mã Lớp Học'] || r['class_id'] || '').trim();
            const matchedCls = activeClasses.find(c => c.id === rawCls || c.name === rawCls);
            const rawAssigned = String(r['Mã GV Phân Công'] || '').trim();
            const matchedAssigned = activeTeachers.find(t => t.code === rawAssigned || t.id === rawAssigned || t.name === rawAssigned);
            const rawActual = String(r['Mã GV Thực Dạy'] || rawAssigned).trim();
            const matchedActual = activeTeachers.find(t => t.code === rawActual || t.id === rawActual || t.name === rawActual);
            const rateApplied = Number(r['Đơn Giá Buổi Áp Dụng (VNĐ)'] || 300000) || 300000;
            const totalPayout = Number(r['Thành Tiền Thù Lao (VNĐ)'] ?? rateApplied);

            return {
              id: String(r['ID Ca Dạy'] || r['id'] || `tatt_imp_${idx + 1}`).trim(),
              class_id: matchedCls?.id || rawCls,
              term_id: matchedCls?.term_id || primaryTermId,
              campus_id: matchedCls?.campus_id || 'camp_pmh',
              session_date: String(r['Ngày Giảng Dạy']).trim(),
              session_number: Number(r['Buổi Thứ'] || idx + 1) || 1,
              periods_count: Number(r['Số Tiết Quy Đổi'] || 2) || 2,
              assigned_teacher_id: matchedAssigned?.id || rawAssigned,
              actual_teacher_id: matchedActual?.id || rawActual,
              is_substitute: String(r['Là Ca Dạy Thay'] || '').toUpperCase().includes('CÓ'),
              status: (r['Trạng Thái Chấm Công'] || 'present') as any,
              check_in_time: String(r['Giờ Check-in'] || '16:40').trim(),
              rate_per_period: Math.round(rateApplied / 2),
              rate_applied: rateApplied,
              earned_amount: totalPayout,
              total_payout: totalPayout,
              verified_by: String(r['Người Đối Soát'] || 'Ban Học Vụ').trim(),
              notes: String(r['Ghi Chú Ca Dạy'] || '').trim(),
            };
          });
        totalRowsParsed += importedData.teacherAttendance.length;
        sheetStats.push({ sheetName: s9, tableName: 'teacher_work_sessions', rowsCount: importedData.teacherAttendance.length });
      }
    }

    // 10. 10_HOA_DON_BAO_LUU -> invoices
    const s10 = findSheet(['10_HOA_DON_BAO_LUU', 'TUITION_INVOICES', 'HOA_DON']);
    if (s10) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s10]);
      if (rows.length > 0) {
        importedData.invoices = rows
          .filter(r => r['Số Hóa Đơn'] || r['invoice_code'])
          .map((r, idx): TuitionInvoice => {
            const rawStu = String(r['Mã Học Viên'] || r['student_id'] || '').trim();
            const matchedStu = activeStudents.find(s => s.code === rawStu || s.id === rawStu);
            const rawCls = String(r['Mã Lớp Học'] || r['class_id'] || '').trim();
            const matchedCls = activeClasses.find(c => c.id === rawCls || c.name === rawCls);
            const gross = Number(r['Học Phí Gốc (VNĐ)'] || 0);
            const creditDed = Number(r['Cấn Trừ Bảo Lưu (VNĐ)'] || 0);
            const discount = Number(r['Ưu Đãi Giảm Trừ (VNĐ)'] || 0);
            const net = Number(r['Thực Thu Phải Đóng (VNĐ)'] ?? Math.max(0, gross - creditDed - discount));
            const paid = Number(r['Đã Thanh Toán (VNĐ)'] || 0);
            const debt = Number(r['Còn Nợ (VNĐ)'] ?? Math.max(0, net - paid));

            return {
              id: String(r['ID Hóa Đơn'] || r['id'] || `inv_imp_${idx + 1}`).trim(),
              invoice_code: String(r['Số Hóa Đơn'] || `INV-2026-${String(idx + 1).padStart(4, '0')}`).trim(),
              student_id: matchedStu?.id || rawStu,
              class_id: matchedCls?.id || rawCls,
              registered_sessions: Number(r['Số Buổi Tính Phí'] || 24),
              session_rate: Number(r['Đơn Giá 1 Buổi (VNĐ)'] || 166250),
              gross_amount: gross,
              credit_deducted: creditDed,
              discount_amount: discount,
              net_payable: net,
              paid_amount: paid,
              outstanding_amount: debt,
              payment_status: (r['Trạng Thái Thanh Toán'] || (debt === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid')) as any,
              due_date: String(r['Hạn Thanh Toán'] || '2026-09-10').trim(),
              payment_reference: r['Mã Giao Dịch Ngân Hàng'] ? String(r['Mã Giao Dịch Ngân Hàng']).trim() : undefined,
              verified_by: r['Kế Toán Xác Nhận'] ? String(r['Kế Toán Xác Nhận']).trim() : undefined,
              created_at: String(r['Ngày Lập Hóa Đơn'] || new Date().toISOString().split('T')[0]).trim(),
            };
          });
        totalRowsParsed += importedData.invoices.length;
        sheetStats.push({ sheetName: s10, tableName: 'tuition_invoices', rowsCount: importedData.invoices.length });
      }
    }

    return {
      success: true,
      message: `Đã đọc và chuẩn hóa thành công tệp Excel Master (${sheetStats.length}/10 bảng có dữ liệu, tổng cộng ${totalRowsParsed} bản ghi)!`,
      data: importedData,
      sheetStats,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi đọc tệp Excel: ${err?.message || 'Định dạng tệp không hợp lệ'}`,
    };
  }
}

export interface TeacherPayrollSummaryExcelRow {
  code: string;
  name: string;
  typeLabel: string;
  campusLabel: string;
  ratePerPeriod: number;
  ratePerSession: number;
  taughtSessions: number;
  totalPeriods: number;
  substitutePeriodsAdded: number;
  absentPeriodsDeducted: number;
  totalPayout: number;
  isSettled: boolean;
  bankInfo: string;
}

export function exportTeacherPayrollWorkbook(
  store: AppStore,
  termId: string,
  campusId: string,
  summaryRows: TeacherPayrollSummaryExcelRow[]
) {
  const wb = XLSX.utils.book_new();
  const termName = store.terms.find(t => t.id === termId)?.name || 'Toàn khóa';
  const campusName = campusId === 'all' ? 'Toàn hệ thống (PMH & PL)' : (store.campuses.find(c => c.id === campusId)?.name || campusId);

  // Sheet 1: Tổng hợp thù lao
  const sheet1Data = summaryRows.map((r, idx) => ({
    'STT': idx + 1,
    'Khóa Học': termName,
    'Phạm Vi Cơ Sở': campusName,
    'Mã Giáo Viên': r.code,
    'Họ Tên Giáo Viên': r.name,
    'Phân Loại Nhân Sự': r.typeLabel,
    'Cơ Sở Hoạt Động': r.campusLabel,
    'Đơn Giá / Tiết (VNĐ)': r.ratePerPeriod,
    'Quy Đổi / Buổi (VNĐ)': r.ratePerSession,
    'Tổng Số Buổi Đã Dạy': r.taughtSessions,
    'Tổng Số Tiết Quy Đổi': r.totalPeriods,
    'Tiết Dạy Thay Nhận Thêm (+)': r.substitutePeriodsAdded,
    'Tiết Vắng / Chuyển Giao (-)': r.absentPeriodsDeducted,
    'Tổng Thù Lao Thực Nhận (VNĐ)': r.totalPayout,
    'Thông Tin Tài Khoản NH': r.bankInfo,
    'Trạng Thái Quyết Toán': r.isSettled ? 'Đã chi trả quyết toán' : 'Chờ kế toán duyệt chi',
  }));
  const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
  XLSX.utils.book_append_sheet(wb, ws1, 'Tong_Hop_Thu_Lao');

  // Sheet 2: Chi tiết ca dạy
  const allRecords = (store.teacherAttendance || []).filter(rec => {
    const matchTerm = termId === 'all' || rec.term_id === termId;
    const matchCampus = campusId === 'all' || rec.campus_id === campusId;
    return matchTerm && matchCampus;
  }).sort((a, b) => a.session_date.localeCompare(b.session_date));

  const sheet2Data = allRecords.map((rec, idx) => {
    const cls = store.classes.find(c => c.id === rec.class_id);
    const assignedTeacher = store.teachers.find(t => t.id === rec.assigned_teacher_id);
    const actualTeacher = store.teachers.find(t => t.id === rec.actual_teacher_id);
    const campus = store.campuses.find(cp => cp.id === rec.campus_id);
    const timeSlot = store.timeSlots.find(ts => ts.id === cls?.time_slot_id);
    const statusLabel =
      rec.status === 'present'
        ? 'Đúng giờ'
        : rec.status === 'late'
        ? `Đi muộn (${rec.late_minutes || 0}p)`
        : rec.status === 'absent_excused'
        ? 'Vắng có phép'
        : 'Vắng không phép';

    return {
      'STT': idx + 1,
      'Ngày Giảng Dạy': rec.session_date,
      'Buổi Thứ': rec.session_number,
      'Cơ Sở': campus?.code || '',
      'Lớp Ngoại Khóa': cls?.name || '',
      'Ca Học': timeSlot ? `${timeSlot.start_time} - ${timeSlot.end_time}` : '16:45 - 18:15',
      'GV Phân Công Chính': assignedTeacher?.name || '',
      'GV Thực Dạy': actualTeacher?.name || '',
      'Vai Trò Ca Dạy': rec.is_substitute ? 'GV Dạy Thay' : 'GV Chính Thức',
      'Trạng Thái Chấm Công': statusLabel,
      'Giờ Check-in': rec.check_in_time || '16:40',
      'Số Tiết Thực Dạy': rec.periods_count,
      'Đơn Giá / Tiết (VNĐ)': rec.rate_per_period,
      'Thành Tiền Buổi Dạy (VNĐ)': rec.total_payout,
      'Người Xác Nhận': rec.verified_by || 'Ban Học Vụ',
      'Ghi Chú Đối Soát': rec.notes || '',
    };
  });
  const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
  XLSX.utils.book_append_sheet(wb, ws2, 'Chi_Tiet_Ca_Day');

  const safeTermCode = store.terms.find(t => t.id === termId)?.code || 'ALL';
  XLSX.writeFile(wb, `QuyetToan_ThuLao_GiaoVien_${safeTermCode}_${new Date().toISOString().split('T')[0]}.xlsx`);
}
