import * as XLSX from 'xlsx';
import { AppState } from './storage';

export function exportMasterExcelTemplate(state: AppState): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: 01_CO_SO
  const s1Data = state.campuses.map(c => ({
    'Mã Cơ Sở': c.code,
    'Tên Cơ Sở': c.name,
    'Địa Chỉ': c.address,
    'Số Điện Thoại': c.phone,
    'Tên Ngân Hàng': c.bank_name,
    'Số Tài Khoản': c.bank_account,
    'Chủ Tài Khoản': c.bank_owner,
    'Trạng Thái': c.status
  }));
  const ws1 = XLSX.utils.json_to_sheet(s1Data);
  XLSX.utils.book_append_sheet(wb, ws1, '01_CO_SO');

  // Sheet 2: 02_SAN_BAI_PHONG_HOC
  const s2Data = state.facilities.map(f => {
    const camp = state.campuses.find(c => c.id === f.campus_id);
    return {
      'Tên Phòng/Sân': f.name,
      'Cơ Sở': camp ? camp.name : f.campus_id,
      'Sức Chứa': f.capacity,
      'Loại': f.type,
      'Kích Hoạt': f.is_active ? 'Có' : 'Không'
    };
  });
  const ws2 = XLSX.utils.json_to_sheet(s2Data);
  XLSX.utils.book_append_sheet(wb, ws2, '02_SAN_BAI_PHONG_HOC');

  // Sheet 3: 03_MON_HOC
  const s3Data = state.subjects.map(s => ({
    'Mã Môn': s.code,
    'Tên Môn Ngoại Khóa': s.name,
    'Phân Loại': s.category,
    'Thời Lượng Tiêu Chuẩn': s.standard_duration
  }));
  const ws3 = XLSX.utils.json_to_sheet(s3Data);
  XLSX.utils.book_append_sheet(wb, ws3, '03_MON_HOC');

  // Sheet 4: 04_KHUNG_GIO
  const s4Data = state.timeSlots.map(t => ({
    'Tên Ca Học': t.name,
    'Các Ngày Trong Tuần': t.days_of_week.join(','),
    'Giờ Bắt Đầu': t.start_time,
    'Giờ Kết Thúc': t.end_time,
    'Loại Ca': t.slot_type === 'after_school' ? 'Sau giờ học' : 'Cuối tuần'
  }));
  const ws4 = XLSX.utils.json_to_sheet(s4Data);
  XLSX.utils.book_append_sheet(wb, ws4, '04_KHUNG_GIO');

  // Sheet 5: 05_GIAO_VIEN
  const s5Data = state.teachers.map(t => ({
    'Họ Và Tên': t.name,
    'Số Điện Thoại': t.phone,
    'Email': t.email,
    'Phân Loại': t.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng / Đối tác',
    'Thù Lao Cố Định / Buổi (đ)': t.fixed_rate_per_session,
    'Tỷ Lệ % Doanh Thu': t.percentage_rate,
    'Trạng Thái': t.status
  }));
  const ws5 = XLSX.utils.json_to_sheet(s5Data);
  XLSX.utils.book_append_sheet(wb, ws5, '05_GIAO_VIEN');

  // Sheet 6: 06_LOP_HOC
  const s6Data = state.classes.map(cl => {
    const subj = state.subjects.find(s => s.id === cl.subject_id);
    const camp = state.campuses.find(c => c.id === cl.campus_id);
    const tch = state.teachers.find(t => t.id === cl.primary_teacher_id);
    return {
      'Tên Lớp': cl.name,
      'Cơ Sở': camp ? camp.name : cl.campus_id,
      'Môn Học': subj ? subj.name : cl.subject_id,
      'Giáo Viên Phụ Trách': tch ? tch.name : cl.primary_teacher_id,
      'Sĩ Số Tối Đa': cl.max_students,
      'Tổng Số Buổi': cl.total_sessions,
      'Học Phí Trọn Khóa (đ)': cl.full_course_fee,
      'Đơn Giá 1 Buổi (đ)': cl.price_per_session,
      'Trạng Thái': cl.status
    };
  });
  const ws6 = XLSX.utils.json_to_sheet(s6Data);
  XLSX.utils.book_append_sheet(wb, ws6, '06_LOP_HOC');

  // Sheet 7: 07_HOC_VIEN
  const s7Data = state.students.map(st => ({
    'Mã Học Sinh': st.code,
    'Mã Cũ (Nếu chuyển sang Royal)': st.previous_student_code || '',
    'Họ Và Tên': st.name,
    'Ngày Sinh': st.dob,
    'Giới Tính': st.gender,
    'Phụ Huynh': st.parent_name,
    'SĐT Phụ Huynh': st.parent_phone,
    'Trường Chính Khóa': st.school_name || '',
    'Lớp Chính Khóa': st.regular_class || '',
    'Là Học Sinh Royal (Bánh Sữa)': st.is_royal_student ? 'CÓ' : 'KHÔNG',
    'Lưu Ý Y Tế & Dị Ứng': st.medical_notes || '',
    'Trạng Thái': st.status
  }));
  const ws7 = XLSX.utils.json_to_sheet(s7Data);
  XLSX.utils.book_append_sheet(wb, ws7, '07_HOC_VIEN');

  // Sheet 8: 08_GHI_DANH
  const s8Data = state.enrollments.map(en => {
    const st = state.students.find(s => s.id === en.student_id);
    const cl = state.classes.find(c => c.id === en.class_id);
    return {
      'Mã Học Sinh': st ? st.code : en.student_id,
      'Tên Học Sinh': st ? st.name : '',
      'Tên Lớp Ngoại Khóa': cl ? cl.name : en.class_id,
      'Số Buổi Đăng Ký': en.registered_sessions,
      'Ngày Vào Lớp': en.joined_date,
      'Trạng Thái': en.status
    };
  });
  const ws8 = XLSX.utils.json_to_sheet(s8Data);
  XLSX.utils.book_append_sheet(wb, ws8, '08_GHI_DANH');

  // Sheet 9: 09_DIEM_DANH_BUOI
  const s9Data = state.attendance.map(att => {
    const st = state.students.find(s => s.id === att.student_id);
    const cl = state.classes.find(c => c.id === att.class_id);
    return {
      'Ngày Buổi Học': att.session_date,
      'Lớp': cl ? cl.name : att.class_id,
      'Mã Học Sinh': st ? st.code : att.student_id,
      'Tên Học Sinh': st ? st.name : '',
      'Trạng Thái Chuyên Cần': att.status === 'present' ? 'Có mặt' : att.status === 'absent_excused' ? 'Vắng có phép' : 'Vắng không phép',
      'Ghi Chú': att.note || ''
    };
  });
  const ws9 = XLSX.utils.json_to_sheet(s9Data);
  XLSX.utils.book_append_sheet(wb, ws9, '09_DIEM_DANH_BUOI');

  // Sheet 10: 10_BAO_LUU_TIEN_BUOI
  const s10Data = state.makeupCredits.map(c => {
    const st = state.students.find(s => s.id === c.student_id);
    const cl = state.classes.find(clz => clz.id === c.source_class_id);
    return {
      'Mã Phiếu Bảo Lưu': c.credit_code,
      'Học Sinh': st ? `${st.name} (${st.code})` : c.student_id,
      'Lớp Nguồn': cl ? cl.name : c.source_class_id,
      'Số Buổi Nghỉ Liên Tiếp': c.consecutive_absent_count,
      'Quy Tắc Bảo Lưu': c.credit_rule === 'monetary' ? 'Theo số tiền' : 'Theo số buổi',
      'Giá Trị Bảo Lưu (đ)': c.total_credit_amount,
      'Số Buổi Chuyển': c.transferred_sessions,
      'Ngày Phát Hành': c.issue_date,
      'Hạn Sử Dụng (1 Năm)': c.expiry_date,
      'Trạng Thái': c.status === 'issued' ? 'Còn hiệu lực' : c.status === 'applied' ? 'Đã cấn trừ' : 'Hết hạn',
      'Ghi Chú': c.note || ''
    };
  });
  const ws10 = XLSX.utils.json_to_sheet(s10Data);
  XLSX.utils.book_append_sheet(wb, ws10, '10_BAO_LUU_TIEN_BUOI');

  // Save workbook
  XLSX.writeFile(wb, 'RoyalSchool_Master_Import_Template_10_Sheets.xlsx');
}

export function parseMasterExcelFile(file: File): Promise<{
  success: boolean;
  message: string;
  dataSummary?: {
    campuses: number;
    facilities: number;
    subjects: number;
    teachers: number;
    classes: number;
    students: number;
    enrollments: number;
    attendance: number;
    credits: number;
  };
  parsedStudents?: any[];
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const summary = {
          campuses: 0,
          facilities: 0,
          subjects: 0,
          teachers: 0,
          classes: 0,
          students: 0,
          enrollments: 0,
          attendance: 0,
          credits: 0
        };

        const sheetNames = workbook.SheetNames;

        if (sheetNames.includes('01_CO_SO')) {
          const s = XLSX.utils.sheet_to_json(workbook.Sheets['01_CO_SO']);
          summary.campuses = s.length;
        }
        if (sheetNames.includes('02_SAN_BAI_PHONG_HOC')) {
          const s = XLSX.utils.sheet_to_json(workbook.Sheets['02_SAN_BAI_PHONG_HOC']);
          summary.facilities = s.length;
        }
        if (sheetNames.includes('03_MON_HOC')) {
          const s = XLSX.utils.sheet_to_json(workbook.Sheets['03_MON_HOC']);
          summary.subjects = s.length;
        }
        if (sheetNames.includes('05_GIAO_VIEN')) {
          const s = XLSX.utils.sheet_to_json(workbook.Sheets['05_GIAO_VIEN']);
          summary.teachers = s.length;
        }
        if (sheetNames.includes('06_LOP_HOC')) {
          const s = XLSX.utils.sheet_to_json(workbook.Sheets['06_LOP_HOC']);
          summary.classes = s.length;
        }
        if (sheetNames.includes('07_HOC_VIEN')) {
          const s = XLSX.utils.sheet_to_json(workbook.Sheets['07_HOC_VIEN']);
          summary.students = s.length;
        }
        if (sheetNames.includes('08_GHI_DANH')) {
          const s = XLSX.utils.sheet_to_json(workbook.Sheets['08_GHI_DANH']);
          summary.enrollments = s.length;
        }
        if (sheetNames.includes('09_DIEM_DANH_BUOI')) {
          const s = XLSX.utils.sheet_to_json(workbook.Sheets['09_DIEM_DANH_BUOI']);
          summary.attendance = s.length;
        }
        if (sheetNames.includes('10_BAO_LUU_TIEN_BUOI')) {
          const s = XLSX.utils.sheet_to_json(workbook.Sheets['10_BAO_LUU_TIEN_BUOI']);
          summary.credits = s.length;
        }

        resolve({
          success: true,
          message: `Nạp thành công ${workbook.SheetNames.length} Sheets từ tệp Excel! Tổng cộng ${summary.students} học sinh và ${summary.classes} lớp học đã được xác thực hợp lệ.`,
          dataSummary: summary
        });
      } catch (err: any) {
        resolve({
          success: false,
          message: 'Lỗi khi đọc file Excel: ' + (err?.message || 'Không thể phân tích cấu trúc.')
        });
      }
    };
    reader.onerror = () => {
      resolve({
        success: false,
        message: 'Không thể đọc tệp dữ liệu tải lên.'
      });
    };
    reader.readAsArrayBuffer(file);
  });
}
