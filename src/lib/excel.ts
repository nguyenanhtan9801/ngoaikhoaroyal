import * as XLSX from 'xlsx';
import { AppStore } from './storage';

export function exportMasterWorkbook(store: AppStore, filename = 'RoyalSchool_Master_Export.xlsx') {
  const wb = XLSX.utils.book_new();

  // 1. 01_CO_SO
  const ws1Data = store.campuses.map(c => ({
    'Mã Cơ Sở': c.code,
    'Tên Cơ Sở': c.name,
    'Địa Chỉ': c.address,
    'Hotline': c.phone,
    'Ngân Hàng': c.bank_name,
    'Số Tài Khoản': c.bank_account,
    'Chủ Tài Khoản': c.bank_owner,
    'Trạng Thái': c.status === 'active' ? 'Hoạt động' : 'Tạm dừng',
  }));
  const ws1 = XLSX.utils.json_to_sheet(ws1Data);
  XLSX.utils.book_append_sheet(wb, ws1, '01_CO_SO');

  // 2. 02_SAN_BAI_PHONG_HOC
  const ws2Data = store.facilities.map(f => {
    const campus = store.campuses.find(c => c.id === f.campus_id);
    return {
      'Tên Phòng/Sân': f.name,
      'Mã Cơ Sở': campus?.code || '',
      'Sức Chứa': f.capacity,
      'Phân Loại': f.type,
      'Trạng Thái': f.is_active ? 'Khả dụng' : 'Bảo trì',
    };
  });
  const ws2 = XLSX.utils.json_to_sheet(ws2Data);
  XLSX.utils.book_append_sheet(wb, ws2, '02_SAN_BAI_PHONG_HOC');

  // 3. 03_MON_HOC
  const ws3Data = store.subjects.map(s => ({
    'Mã Môn': s.code,
    'Tên Môn Ngoại Khóa': s.name,
    'Phân Loại': s.category,
    'Thời Lượng Chuẩn': s.standard_duration,
  }));
  const ws3 = XLSX.utils.json_to_sheet(ws3Data);
  XLSX.utils.book_append_sheet(wb, ws3, '03_MON_HOC');

  // 4. 04_KHUNG_GIO
  const ws4Data = store.timeSlots.map(t => ({
    'Tên Khung Giờ': t.name,
    'Các Ngày Trong Tuần': t.days_of_week.join(', '),
    'Giờ Bắt Đầu': t.start_time,
    'Giờ Kết Thúc': t.end_time,
    'Phân Loại Ca': t.slot_type === 'after_school' ? 'Sau giờ học' : 'Cuối tuần',
  }));
  const ws4 = XLSX.utils.json_to_sheet(ws4Data);
  XLSX.utils.book_append_sheet(wb, ws4, '04_KHUNG_GIO');

  // 5. 05_GIAO_VIEN
  const ws5Data = store.teachers.map(tc => ({
    'Họ Tên Giáo Viên': tc.name,
    'Số Điện Thoại': tc.phone,
    'Email': tc.email,
    'Hình Thức Hợp Đồng': tc.teacher_type === 'permanent' ? 'Cơ hữu' : 'Thỉnh giảng',
    'Thù Lao Cố Định Buổi (VND)': tc.fixed_rate_per_session,
    'Tỷ Lệ Thù Lao (%)': tc.percentage_rate,
    'Trạng Thái': tc.status,
  }));
  const ws5 = XLSX.utils.json_to_sheet(ws5Data);
  XLSX.utils.book_append_sheet(wb, ws5, '05_GIAO_VIEN');

  // 6. 06_LOP_HOC
  const ws6Data = store.classes.map(cl => {
    const campus = store.campuses.find(c => c.id === cl.campus_id);
    const subject = store.subjects.find(s => s.id === cl.subject_id);
    const teacher = store.teachers.find(t => t.id === cl.primary_teacher_id);
    return {
      'Mã Lớp': cl.id,
      'Tên Lớp Học': cl.name,
      'Cơ Sở': campus?.code || '',
      'Môn Học': subject?.name || '',
      'Giáo Viên Chính': teacher?.name || '',
      'Sĩ Số Tối Đa': cl.max_students,
      'Tổng Số Buổi': cl.total_sessions,
      'Học Phí Trọn Khóa': cl.full_course_fee,
      'Đơn Giá 1 Buổi (Ceil)': cl.price_per_session,
      'Trạng Thái': cl.status,
    };
  });
  const ws6 = XLSX.utils.json_to_sheet(ws6Data);
  XLSX.utils.book_append_sheet(wb, ws6, '06_LOP_HOC');

  // 7. 07_HOC_VIEN
  const ws7Data = store.students.map(st => ({
    'Mã Học Viên': st.code,
    'Mã Cũ (Nếu chuyển từ Ngoài vào)': st.previous_student_code || '',
    'Họ Và Tên': st.name,
    'Ngày Sinh': st.dob,
    'Giới Tính': st.gender,
    'Phụ Huynh': st.parent_name,
    'SĐT Phụ Huynh': st.parent_phone,
    'Trường Đang Học': st.school_name || '',
    'Lớp Chính Khóa': st.regular_class || '',
    'Học Sinh Royal (Cấp Bánh Sữa)': st.is_royal_student ? 'CÓ (Royal)' : 'KHÔNG (Ngoài)',
    'Lưu Ý Y Tế & Thực Phẩm': st.medical_notes || '',
    'Trạng Thái': st.status,
  }));
  const ws7 = XLSX.utils.json_to_sheet(ws7Data);
  XLSX.utils.book_append_sheet(wb, ws7, '07_HOC_VIEN');

  // 8. 08_GHI_DANH
  const ws8Data = store.enrollments.map(en => {
    const student = store.students.find(s => s.id === en.student_id);
    const cls = store.classes.find(c => c.id === en.class_id);
    return {
      'Mã Học Viên': student?.code || '',
      'Tên Học Viên': student?.name || '',
      'Lớp Học': cls?.name || '',
      'Số Buổi Đăng Ký': en.registered_sessions,
      'Ngày Bắt Đầu': en.joined_date,
      'Trạng Thái': en.status,
    };
  });
  const ws8 = XLSX.utils.json_to_sheet(ws8Data);
  XLSX.utils.book_append_sheet(wb, ws8, '08_GHI_DANH');

  // 9. 09_DIEM_DANH_BUOI
  const ws9Data = store.attendance.map(at => {
    const student = store.students.find(s => s.id === at.student_id);
    const cls = store.classes.find(c => c.id === at.class_id);
    return {
      'Ngày Buổi Học': at.session_date,
      'Lớp Học': cls?.name || '',
      'Mã Học Viên': student?.code || '',
      'Tên Học Viên': student?.name || '',
      'Chuyên Cần': at.status === 'present' ? 'Có mặt' : at.status === 'absent_excused' ? 'Vắng Có phép' : 'Vắng Không phép',
      'Ghi Chú': at.note || '',
    };
  });
  const ws9 = XLSX.utils.json_to_sheet(ws9Data);
  XLSX.utils.book_append_sheet(wb, ws9, '09_DIEM_DANH_BUOI');

  // 10. 10_BAO_LUU_TIEN_BUOI
  const ws10Data = store.makeupCredits.map(cr => {
    const student = store.students.find(s => s.id === cr.student_id);
    const subject = store.subjects.find(sb => sb.id === cr.subject_id);
    return {
      'Mã Phiếu Bảo Lưu': cr.credit_code,
      'Mã Học Viên': student?.code || '',
      'Tên Học Viên': student?.name || '',
      'Môn Học': subject?.name || '',
      'Số Buổi Nghỉ Liên Tiếp': cr.consecutive_absent_count,
      'Các Ngày Nghỉ': cr.consecutive_dates.join(', '),
      'Đơn Giá Buổi Cũ': cr.source_rate,
      'Hình Thức Bảo Lưu': cr.credit_rule === 'monetary' ? 'Tiền bảo lưu cấn trừ' : 'Bảo lưu số buổi',
      'Tổng Tiền Bảo Lưu': cr.total_credit_amount,
      'Số Buổi Chuyển': cr.transferred_sessions,
      'Ngày Cấp': cr.issue_date,
      'Hạn Hiệu Lực (1 Năm)': cr.expiry_date,
      'Trạng Thái': cr.status === 'issued' ? 'Chưa sử dụng' : cr.status === 'applied' ? 'Đã cấn trừ' : 'Đã hết hạn',
    };
  });
  const ws10 = XLSX.utils.json_to_sheet(ws10Data);
  XLSX.utils.book_append_sheet(wb, ws10, '10_BAO_LUU_TIEN_BUOI');

  XLSX.writeFile(wb, filename);
}

export function downloadSampleTemplate() {
  exportMasterWorkbook(
    {
      users: [],
      campuses: [
        {
          id: 'camp_pmh',
          code: 'PMH',
          name: 'Cơ sở Phú Mỹ Hưng',
          address: '08 Đặng Đại Độ, Q7, TP.HCM',
          phone: '028 7100 7878',
          bank_name: 'Vietcombank',
          bank_account: '0181003456789',
          bank_owner: 'CONG TY CP GD QUOC TE HOANG GIA',
          status: 'active'
        }
      ],
      terms: [
        {
          id: 'term_fall_2026',
          code: 'FALL-2026',
          name: 'Khóa Mùa Thu 2026',
          academic_year: '2026-2027',
          start_date: '2026-09-01',
          end_date: '2026-12-15',
          is_active: true,
          status: 'open_enrollment'
        }
      ],
      subjectCategories: [
        {
          id: 'cat_sports',
          code: 'SPORTS',
          name: 'Thể thao',
          color: 'amber',
          icon: 'Activity',
          description: 'Rèn luyện thể lực và tinh thần đồng đội',
          status: 'active',
          order: 1
        }
      ],
      subjects: [
        {
          id: 'sub_bask',
          code: 'BASK',
          name: 'Bóng rổ Hoàng Gia',
          category: 'Thể thao',
          standard_duration: '90 phút'
        }
      ],
      termSubjects: [
        {
          id: 'ts_01',
          term_id: 'term_fall_2026',
          subject_id: 'sub_bask',
          is_active: true,
          standard_sessions: 24,
          standard_course_fee: 3600000,
          standard_session_rate: 150000
        }
      ],
      campusPricings: [
        {
          id: 'cp_01',
          term_id: 'term_fall_2026',
          campus_id: 'camp_pmh',
          subject_id: 'sub_bask',
          override_pricing: false,
          is_offered_at_campus: true
        }
      ],
      pricings: [],
      facilities: [
        {
          id: 'fac_01',
          name: 'Sân bóng rổ nhà thi đấu A',
          campus_id: 'camp_pmh',
          capacity: 25,
          type: 'field',
          is_active: true
        }
      ],
      timeSlots: [
        {
          id: 'slot_01',
          name: 'Thứ 2 & Thứ 4 (16:45 - 18:15)',
          days_of_week: ['T2', 'T4'],
          start_time: '16:45',
          end_time: '18:15',
          slot_type: 'after_school'
        }
      ],
      teachers: [
        {
          id: 'tch_01',
          name: 'Thầy Nguyễn Văn Tuấn',
          phone: '0908 123 456',
          email: 'tuan.nv@royal.edu.vn',
          teacher_type: 'permanent',
          fixed_rate_per_session: 260000,
          percentage_rate: 0,
          status: 'active'
        }
      ],
      classes: [],
      students: [
        {
          id: 'std_01',
          code: 'RY-2026-00101',
          name: 'Nguyễn Hoàng Bảo Long',
          dob: '2015-06-12',
          gender: 'Nam',
          parent_name: 'Nguyễn Văn Minh',
          parent_phone: '0903 889 911',
          school_name: 'Royal School PMH',
          regular_class: 'Grade 5A1',
          is_royal_student: true,
          medical_notes: 'Uống sữa không đường',
          status: 'active',
          created_at: '2026-08-20'
        }
      ],
      enrollments: [],
      invoices: [],
      sessions: [],
      attendance: [],
      makeupCredits: [],
      transfers: [],
      payrollSettlements: [],
      parentRegistrations: [],
      notifications: [],
      telecomConfig: { zaloZnsEnabled: true, smsBrandnameEnabled: true, emailEnabled: true, brandName: 'ROYAL SCHOOL' },
      supabaseConfig: { url: '', anonKey: '', isConnected: false }
    },
    'RoyalSchool_Master_Import_Template_10_Sheets.xlsx'
  );
}

export async function parseMasterExcelFile(file: File): Promise<{ success: boolean; message: string; data?: Partial<AppStore> }> {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });

    const sheetNames = wb.SheetNames;
    const importedData: Partial<AppStore> = {};
    let parsedCount = 0;

    // Check if students sheet exists
    const studentSheetName = sheetNames.find(s => s.includes('07_HOC_VIEN') || s.toLowerCase().includes('hoc_vien'));
    if (studentSheetName) {
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[studentSheetName]);
      if (rows && rows.length > 0) {
        importedData.students = rows.map((r, idx) => {
          const rawRoyal = String(r['Học Sinh Royal (Cấp Bánh Sữa)'] || r['is_royal_student'] || '').toLowerCase();
          const isRoyal = rawRoyal.includes('có') || rawRoyal.includes('yes') || rawRoyal.includes('true') || rawRoyal.includes('royal');
          return {
            id: `std_imp_${Date.now()}_${idx}`,
            code: String(r['Mã Học Viên'] || `RY-2026-${String(900 + idx).padStart(5, '0')}`).trim(),
            previous_student_code: r['Mã Cũ (Nếu chuyển từ Ngoài vào)'] ? String(r['Mã Cũ (Nếu chuyển từ Ngoài vào)']).trim() : undefined,
            name: String(r['Họ Và Tên'] || r['name'] || 'Học viên mới').trim(),
            dob: String(r['Ngày Sinh'] || '2016-01-01').trim(),
            gender: String(r['Giới Tính'] || 'Nam').includes('Nữ') ? 'Nữ' : 'Nam',
            parent_name: String(r['Phụ Huynh'] || 'Phụ huynh').trim(),
            parent_phone: String(r['SĐT Phụ Huynh'] || '0900000000').trim(),
            school_name: String(r['Trường Đang Học'] || 'Royal School').trim(),
            regular_class: String(r['Lớp Chính Khóa'] || '').trim(),
            is_royal_student: isRoyal,
            medical_notes: String(r['Lưu Ý Y Tế & Thực Phẩm'] || '').trim(),
            status: 'active',
            created_at: new Date().toISOString().split('T')[0],
          };
        });
        parsedCount += importedData.students.length;
      }
    }

    return {
      success: true,
      message: `Đã đọc thành công tệp Excel Master! Phát hiện ${sheetNames.length} sheet, nạp ${parsedCount} bản ghi học viên.`,
      data: importedData,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi đọc tệp Excel: ${err?.message || 'Định dạng tệp không hợp lệ'}`,
    };
  }
}
