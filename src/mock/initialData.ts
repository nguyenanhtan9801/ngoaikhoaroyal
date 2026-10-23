import { 
  Campus, 
  AcademicTerm, 
  Subject, 
  Facility, 
  TimeSlot, 
  Teacher, 
  ClassItem, 
  Student, 
  Enrollment, 
  TuitionInvoice, 
  ClassSession, 
  Attendance, 
  MakeupCredit, 
  ParentRegistration,
  PricingRule,
  NotificationItem
} from '../types';

export const initialCampuses: Campus[] = [
  {
    id: 'camp-pmh',
    code: 'PMH',
    name: 'Royal School - Cơ sở Phú Mỹ Hưng',
    address: '08 Đặng Đại Độ, P. Tân Phong, Quận 7, TP.HCM',
    phone: '028 7100 7878',
    bank_name: 'Vietcombank - CN Nam Sài Gòn',
    bank_account: '0181003456789',
    bank_owner: 'CONG TY CP GD QUOC TE HOANG GIA - PMH',
    status: 'active'
  },
  {
    id: 'camp-nsg',
    code: 'NSG',
    name: 'Royal School - Cơ sở Nam Sài Gòn',
    address: 'Đường D1, KDC Him Lam, Bình Hưng, Bình Chánh, TP.HCM',
    phone: '028 7101 6688',
    bank_name: 'BIDV - CN Chợ Lớn',
    bank_account: '1471000889922',
    bank_owner: 'CONG TY CP GD QUOC TE HOANG GIA - NSG',
    status: 'active'
  }
];

export const initialTerms: AcademicTerm[] = [
  {
    id: 'term-2026-h1',
    code: 'HK1-2026-2027',
    name: 'Học Kỳ 1 (Niên khóa 2026 - 2027)',
    academic_year: '2026-2027',
    start_date: '2026-09-01',
    end_date: '2027-01-15',
    is_active: true,
    status: 'open_enrollment'
  },
  {
    id: 'term-2026-sum',
    code: 'SUMMER-2026',
    name: 'Khóa Hè Rực Rỡ Summer Discovery 2026',
    academic_year: '2025-2026',
    start_date: '2026-06-01',
    end_date: '2026-08-15',
    is_active: false,
    status: 'closed'
  }
];

export const initialSubjects: Subject[] = [
  {
    id: 'sub-bk',
    code: 'BASKETBALL',
    name: 'Bóng rổ Hoàng Gia (Royal Basketball Elite)',
    category: 'Thể thao',
    standard_duration: '90 phút'
  },
  {
    id: 'sub-sw',
    code: 'SWIMMING',
    name: 'Bơi lội Thủy Tinh (Dolphin Swimming Club)',
    category: 'Thể thao',
    standard_duration: '90 phút'
  },
  {
    id: 'sub-pn',
    code: 'PIANO',
    name: 'Piano Cổ Điển & Phím Nghệ Thuật',
    category: 'Nghệ thuật',
    standard_duration: '60 phút'
  },
  {
    id: 'sub-art',
    code: 'FINE_ARTS',
    name: 'Hội Họa & Mỹ Thuật Đương Đại (Creative Arts)',
    category: 'Nghệ thuật',
    standard_duration: '90 phút'
  },
  {
    id: 'sub-rob',
    code: 'ROBOTICS_AI',
    name: 'Lập Trình Robotics & Trí Tuệ Nhân Tạo STEM',
    category: 'Học thuật',
    standard_duration: '90 phút'
  },
  {
    id: 'sub-ch',
    code: 'CHESS',
    name: 'Cờ Vua Tư Duy Chiến Thuật (Royal Chess)',
    category: 'Học thuật',
    standard_duration: '90 phút'
  },
  {
    id: 'sub-drm',
    code: 'ENG_DRAMA',
    name: 'Kịch Nghệ & Hùng Biện Tiếng Anh (English Drama)',
    category: 'Ngôn ngữ',
    standard_duration: '90 phút'
  }
];

export const initialFacilities: Facility[] = [
  {
    id: 'fac-bb-pmh',
    name: 'Sân bóng rổ trong nhà Hoàng Gia A1 (PMH)',
    campus_id: 'camp-pmh',
    capacity: 20,
    type: 'field',
    is_active: true
  },
  {
    id: 'fac-pool-pmh',
    name: 'Hồ bơi nước ấm 4 mùa Dolphin (PMH)',
    campus_id: 'camp-pmh',
    capacity: 18,
    type: 'pool',
    is_active: true
  },
  {
    id: 'fac-pno-pmh',
    name: 'Phòng hòa nhạc & Piano Studio 302 (PMH)',
    campus_id: 'camp-pmh',
    capacity: 10,
    type: 'music_hall',
    is_active: true
  },
  {
    id: 'fac-rob-pmh',
    name: 'Phòng Lab STEM & Robotics 401 (PMH)',
    campus_id: 'camp-pmh',
    capacity: 16,
    type: 'classroom',
    is_active: true
  },
  {
    id: 'fac-art-pmh',
    name: 'Xưởng Mỹ thuật Sáng tạo Leonardo (PMH)',
    campus_id: 'camp-pmh',
    capacity: 16,
    type: 'art_studio',
    is_active: true
  },
  {
    id: 'fac-bb-nsg',
    name: 'Sân bóng rổ đa năng tầng 2 (Nam Sài Gòn)',
    campus_id: 'camp-nsg',
    capacity: 20,
    type: 'field',
    is_active: true
  },
  {
    id: 'fac-pool-nsg',
    name: 'Khu bơi lội Olympia (Nam Sài Gòn)',
    campus_id: 'camp-nsg',
    capacity: 18,
    type: 'pool',
    is_active: true
  }
];

export const initialTimeSlots: TimeSlot[] = [
  {
    id: 'slot-t2t4-pm',
    code: 'T2T4_1630',
    name: 'Thứ 2 & Thứ 4 (16:30 - 18:00)',
    days_of_week: ['T2', 'T4'],
    start_time: '16:30',
    end_time: '18:00',
    duration_minutes: 90,
    status: 'active',
    slot_type: 'after_school'
  },
  {
    id: 'slot-t3t5-pm',
    code: 'T3T5_1630',
    name: 'Thứ 3 & Thứ 5 (16:30 - 18:00)',
    days_of_week: ['T3', 'T5'],
    start_time: '16:30',
    end_time: '18:00',
    duration_minutes: 90,
    status: 'active',
    slot_type: 'after_school'
  },
  {
    id: 'slot-t6-pm',
    code: 'T6_1630',
    name: 'Thứ 6 Chuyên Sâu (16:30 - 18:30)',
    days_of_week: ['T6'],
    start_time: '16:30',
    end_time: '18:30',
    duration_minutes: 120,
    status: 'active',
    slot_type: 'after_school'
  },
  {
    id: 'slot-sat-am',
    code: 'T7CN_0830',
    name: 'Thứ 7 & Chủ Nhật Sáng (08:30 - 10:00)',
    days_of_week: ['T7', 'CN'],
    start_time: '08:30',
    end_time: '10:00',
    duration_minutes: 90,
    status: 'active',
    slot_type: 'weekend'
  },
  {
    id: 'slot-sat-pm',
    code: 'T7CN_1500',
    name: 'Thứ 7 & Chủ Nhật Chiều (15:00 - 16:30)',
    days_of_week: ['T7', 'CN'],
    start_time: '15:00',
    end_time: '16:30',
    duration_minutes: 90,
    status: 'active',
    slot_type: 'weekend'
  }
];

export const initialTeachers: Teacher[] = [
  {
    id: 'tch-nam',
    name: 'Thầy Nguyễn Hoàng Nam',
    phone: '0908 123 456',
    email: 'nam.nh@royalschool.edu.vn',
    teacher_type: 'permanent',
    fixed_rate_per_session: 380000,
    percentage_rate: 0,
    status: 'active',
    subjects: ['Bóng rổ Hoàng Gia']
  },
  {
    id: 'tch-linh',
    name: 'Cô Trần Mai Linh',
    phone: '0912 345 678',
    email: 'linh.tm@royalschool.edu.vn',
    teacher_type: 'visiting',
    fixed_rate_per_session: 0,
    percentage_rate: 35,
    status: 'active',
    subjects: ['Piano Cổ Điển & Phím Nghệ Thuật']
  },
  {
    id: 'tch-huy',
    name: 'Thầy Đặng Quang Huy',
    phone: '0933 555 777',
    email: 'huy.dq@royalschool.edu.vn',
    teacher_type: 'permanent',
    fixed_rate_per_session: 400000,
    percentage_rate: 0,
    status: 'active',
    subjects: ['Bơi lội Thủy Tinh']
  },
  {
    id: 'tch-yen',
    name: 'Cô Lê Hoàng Yến',
    phone: '0988 222 333',
    email: 'yen.lh@royalschool.edu.vn',
    teacher_type: 'visiting',
    fixed_rate_per_session: 0,
    percentage_rate: 30,
    status: 'active',
    subjects: ['Hội Họa & Mỹ Thuật Đương Đại']
  },
  {
    id: 'tch-tuan',
    name: 'Thầy Phạm Minh Tuấn',
    phone: '0944 666 888',
    email: 'tuan.pm@royalschool.edu.vn',
    teacher_type: 'permanent',
    fixed_rate_per_session: 450000,
    percentage_rate: 0,
    status: 'active',
    subjects: ['Lập Trình Robotics & Trí Tuệ Nhân Tạo STEM']
  },
  {
    id: 'tch-michael',
    name: 'Thầy Michael Vance (B.A Drama)',
    phone: '0977 111 999',
    email: 'michael.v@royalschool.edu.vn',
    teacher_type: 'visiting',
    fixed_rate_per_session: 0,
    percentage_rate: 40,
    status: 'active',
    subjects: ['Kịch Nghệ & Hùng Biện Tiếng Anh']
  }
];

export const initialPricingRules: PricingRule[] = [
  {
    id: 'pr-pmh-bk',
    term_id: 'term-2026-h1',
    campus_id: 'camp-pmh',
    subject_id: 'sub-bk',
    base_price: 6000000,
    discount_type: 'percentage',
    discount_value: 10,
    final_price: 5400000,
    total_sessions: 30,
    session_rate: 180000 // 5.4m / 30
  },
  {
    id: 'pr-pmh-sw',
    term_id: 'term-2026-h1',
    campus_id: 'camp-pmh',
    subject_id: 'sub-sw',
    base_price: 6800000,
    discount_type: 'fixed_amount',
    discount_value: 500000,
    final_price: 6300000,
    total_sessions: 30,
    session_rate: 210000 // 6.3m / 30
  },
  {
    id: 'pr-pmh-pn',
    term_id: 'term-2026-h1',
    campus_id: 'camp-pmh',
    subject_id: 'sub-pn',
    base_price: 7500000,
    discount_type: 'percentage',
    discount_value: 15,
    final_price: 6375000,
    total_sessions: 30,
    session_rate: 213000 // Ceil(6375000 / 30 = 212500) -> 213000
  },
  {
    id: 'pr-pmh-art',
    term_id: 'term-2026-h1',
    campus_id: 'camp-pmh',
    subject_id: 'sub-art',
    base_price: 5000000,
    discount_type: 'percentage',
    discount_value: 10,
    final_price: 4500000,
    total_sessions: 30,
    session_rate: 150000
  },
  {
    id: 'pr-pmh-rob',
    term_id: 'term-2026-h1',
    campus_id: 'camp-pmh',
    subject_id: 'sub-rob',
    base_price: 7200000,
    discount_type: 'percentage',
    discount_value: 10,
    final_price: 6480000,
    total_sessions: 30,
    session_rate: 216000
  }
];

export const initialClasses: ClassItem[] = [
  {
    id: 'cls-bk-01',
    name: 'Bóng Rổ Hoàng Gia U11 (Lớp A1)',
    term_id: 'term-2026-h1',
    campus_id: 'camp-pmh',
    subject_id: 'sub-bk',
    facility_id: 'fac-bb-pmh',
    time_slot_id: 'slot-t2t4-pm',
    primary_teacher_id: 'tch-nam',
    max_students: 15,
    total_sessions: 30,
    full_course_fee: 5400000,
    price_per_session: 180000,
    status: 'active'
  },
  {
    id: 'cls-sw-01',
    name: 'Bơi Lội Kỹ Năng Dolphin Swim (Lớp S1)',
    term_id: 'term-2026-h1',
    campus_id: 'camp-pmh',
    subject_id: 'sub-sw',
    facility_id: 'fac-pool-pmh',
    time_slot_id: 'slot-t3t5-pm',
    primary_teacher_id: 'tch-huy',
    max_students: 12,
    total_sessions: 30,
    full_course_fee: 6300000,
    price_per_session: 210000,
    status: 'active'
  },
  {
    id: 'cls-pn-01',
    name: 'Piano Phím Vàng Căn Bản & Biểu Diễn',
    term_id: 'term-2026-h1',
    campus_id: 'camp-pmh',
    subject_id: 'sub-pn',
    facility_id: 'fac-pno-pmh',
    time_slot_id: 'slot-t2t4-pm',
    primary_teacher_id: 'tch-linh',
    max_students: 8,
    total_sessions: 30,
    full_course_fee: 6375000,
    price_per_session: 213000,
    status: 'active'
  },
  {
    id: 'cls-rob-01',
    name: 'Lập Trình Robot VEX & STEM Tương Lai',
    term_id: 'term-2026-h1',
    campus_id: 'camp-pmh',
    subject_id: 'sub-rob',
    facility_id: 'fac-rob-pmh',
    time_slot_id: 'slot-t3t5-pm',
    primary_teacher_id: 'tch-tuan',
    max_students: 14,
    total_sessions: 30,
    full_course_fee: 6480000,
    price_per_session: 216000,
    status: 'active'
  },
  {
    id: 'cls-art-01',
    name: 'Hội Họa Màu Nước & Tạo Hình Đương Đại',
    term_id: 'term-2026-h1',
    campus_id: 'camp-pmh',
    subject_id: 'sub-art',
    facility_id: 'fac-art-pmh',
    time_slot_id: 'slot-sat-am',
    primary_teacher_id: 'tch-yen',
    max_students: 15,
    total_sessions: 30,
    full_course_fee: 4500000,
    price_per_session: 150000,
    status: 'active'
  }
];

export const initialStudents: Student[] = [
  {
    id: 'stu-001',
    code: 'RY-2026-00101',
    name: 'Trần Gia Bảo',
    dob: '2016-04-12',
    gender: 'Nam',
    parent_name: 'Trần Quốc Tuấn',
    parent_phone: '0903 888 123',
    school_name: 'Royal School PMH',
    regular_class: 'Lớp 4A1',
    is_royal_student: true,
    medical_notes: 'Dị ứng hạt điều nặng, uống sữa tươi không đường',
    status: 'active',
    created_at: '2026-08-20'
  },
  {
    id: 'stu-002',
    code: 'RY-2026-00102',
    name: 'Nguyễn Ngọc Bảo Vy',
    dob: '2016-09-24',
    gender: 'Nữ',
    parent_name: 'Lê Phương Thảo',
    parent_phone: '0918 777 999',
    school_name: 'Royal School PMH',
    regular_class: 'Lớp 4A2',
    is_royal_student: true,
    medical_notes: 'Uống sữa không đường, mang bình nước ấm riêng',
    status: 'active',
    created_at: '2026-08-21'
  },
  {
    id: 'stu-003',
    code: 'RY-2026-00103',
    name: 'Lê Minh Khang',
    dob: '2015-11-05',
    gender: 'Nam',
    parent_name: 'Lê Quang Liêm',
    parent_phone: '0909 333 444',
    school_name: 'Royal School PMH',
    regular_class: 'Lớp 5B1',
    is_royal_student: true,
    medical_notes: 'Tiền sử hen suyễn khi vận động quá sức',
    status: 'active',
    created_at: '2026-08-22'
  },
  {
    id: 'stu-004',
    code: 'RY-2026-00104',
    name: 'Phạm Đăng Khôi',
    dob: '2017-02-18',
    gender: 'Nam',
    parent_name: 'Phạm Văn Hùng',
    parent_phone: '0938 123 789',
    school_name: 'Royal School PMH',
    regular_class: 'Lớp 3A3',
    is_royal_student: true,
    medical_notes: '',
    status: 'active',
    created_at: '2026-08-23'
  },
  {
    id: 'stu-005',
    code: 'EXT-2026-00201',
    name: 'Vũ Hoàng Quân',
    dob: '2016-06-30',
    gender: 'Nam',
    parent_name: 'Vũ Mạnh Cường',
    parent_phone: '0913 456 789',
    school_name: 'Tiểu học Lê Văn Tám',
    regular_class: 'Lớp 4/2',
    is_royal_student: false, // Học sinh ngoài, KHÔNG có bánh sữa
    medical_notes: 'Dị ứng phấn hoa',
    status: 'active',
    created_at: '2026-08-25'
  },
  {
    id: 'stu-006',
    code: 'EXT-2026-00202',
    name: 'Đặng Thảo Linh',
    dob: '2016-12-14',
    gender: 'Nữ',
    parent_name: 'Đặng Quốc Khánh',
    parent_phone: '0908 654 321',
    school_name: 'Tiểu học Võ Thị Sáu',
    regular_class: 'Lớp 4/1',
    is_royal_student: false,
    medical_notes: '',
    status: 'active',
    created_at: '2026-08-26'
  },
  {
    id: 'stu-007',
    code: 'RY-2026-00107',
    previous_student_code: 'EXT-2025-00088', // Lưu vết mã cũ khi chuyển sang Royal
    name: 'Hoàng Nhật Minh',
    dob: '2015-08-19',
    gender: 'Nam',
    parent_name: 'Hoàng Minh Châu',
    parent_phone: '0902 111 222',
    school_name: 'Royal School PMH',
    regular_class: 'Lớp 5A1',
    is_royal_student: true,
    medical_notes: 'Chuyển từ học sinh ngoài sang Royal tháng 9/2026. Uống sữa tươi ít đường.',
    status: 'active',
    created_at: '2026-08-28'
  },
  {
    id: 'stu-008',
    code: 'RY-2026-00108',
    name: 'Đỗ Tuấn Kiệt',
    dob: '2016-03-08',
    gender: 'Nam',
    parent_name: 'Đỗ Hải Đăng',
    parent_phone: '0907 999 555',
    school_name: 'Royal School PMH',
    regular_class: 'Lớp 4A1',
    is_royal_student: true,
    medical_notes: 'Vắng có phép liên tục 3 buổi (Bệnh viện Nhi Đồng) - Đủ điều kiện bảo lưu',
    status: 'active',
    created_at: '2026-08-29'
  },
  {
    id: 'stu-009',
    code: 'EXT-2026-00203',
    name: 'Ngô Khánh An',
    dob: '2017-05-20',
    gender: 'Nữ',
    parent_name: 'Ngô Trọng Nghĩa',
    parent_phone: '0919 444 666',
    school_name: 'Tiểu học Nguyễn Thái Học',
    regular_class: 'Lớp 3/4',
    is_royal_student: false,
    medical_notes: 'Vắng không phép 3 buổi liên tiếp - Cần kích hoạt liên hệ phụ huynh khẩn',
    status: 'active',
    created_at: '2026-08-30'
  }
];

export const initialEnrollments: Enrollment[] = [
  // Class cls-bk-01 (Bóng rổ)
  { id: 'enr-01', student_id: 'stu-001', class_id: 'cls-bk-01', registered_sessions: 30, joined_date: '2026-09-01', status: 'active' },
  { id: 'enr-02', student_id: 'stu-002', class_id: 'cls-bk-01', registered_sessions: 30, joined_date: '2026-09-01', status: 'active' },
  { id: 'enr-03', student_id: 'stu-003', class_id: 'cls-bk-01', registered_sessions: 30, joined_date: '2026-09-01', status: 'active' },
  { id: 'enr-04', student_id: 'stu-005', class_id: 'cls-bk-01', registered_sessions: 30, joined_date: '2026-09-01', status: 'active' }, // Ext
  { id: 'enr-05', student_id: 'stu-007', class_id: 'cls-bk-01', registered_sessions: 30, joined_date: '2026-09-01', status: 'active' },
  { id: 'enr-06', student_id: 'stu-008', class_id: 'cls-bk-01', registered_sessions: 30, joined_date: '2026-09-01', status: 'active' },
  { id: 'enr-07', student_id: 'stu-009', class_id: 'cls-bk-01', registered_sessions: 30, joined_date: '2026-09-01', status: 'active' },

  // Class cls-sw-01 (Bơi lội)
  { id: 'enr-08', student_id: 'stu-001', class_id: 'cls-sw-01', registered_sessions: 30, joined_date: '2026-09-02', status: 'active' },
  { id: 'enr-09', student_id: 'stu-004', class_id: 'cls-sw-01', registered_sessions: 30, joined_date: '2026-09-02', status: 'active' },
  { id: 'enr-10', student_id: 'stu-006', class_id: 'cls-sw-01', registered_sessions: 30, joined_date: '2026-09-02', status: 'active' },

  // Class cls-pn-01 (Piano)
  { id: 'enr-11', student_id: 'stu-002', class_id: 'cls-pn-01', registered_sessions: 30, joined_date: '2026-09-01', status: 'active' },
  { id: 'enr-12', student_id: 'stu-004', class_id: 'cls-pn-01', registered_sessions: 30, joined_date: '2026-09-01', status: 'active' }
];

export const initialInvoices: TuitionInvoice[] = [
  {
    id: 'inv-001',
    invoice_code: 'INV-2026-BK-001',
    student_id: 'stu-001',
    class_id: 'cls-bk-01',
    gross_amount: 5400000,
    credit_deducted: 0,
    net_payable: 5400000,
    paid_amount: 5400000,
    outstanding_amount: 0,
    payment_status: 'paid',
    due_date: '2026-09-08',
    vietqr_url: 'https://img.vietqr.io/image/970436-0181003456789-compact2.png?amount=5400000&addInfo=HP%20RY00101%20BongRoA1',
    payment_reference: 'FT262450892211',
    verified_by: 'Kế toán Lê Thị Hương',
    verified_at: '2026-09-03T10:15:00Z',
    created_at: '2026-09-01'
  },
  {
    id: 'inv-002',
    invoice_code: 'INV-2026-BK-002',
    student_id: 'stu-002',
    class_id: 'cls-bk-01',
    gross_amount: 5400000,
    credit_deducted: 0,
    net_payable: 5400000,
    paid_amount: 5400000,
    outstanding_amount: 0,
    payment_status: 'paid',
    due_date: '2026-09-08',
    vietqr_url: 'https://img.vietqr.io/image/970436-0181003456789-compact2.png?amount=5400000&addInfo=HP%20RY00102%20BongRoA1',
    payment_reference: 'FT262451998432',
    verified_by: 'Kế toán Lê Thị Hương',
    verified_at: '2026-09-04T14:30:00Z',
    created_at: '2026-09-01'
  },
  {
    id: 'inv-003',
    invoice_code: 'INV-2026-BK-003',
    student_id: 'stu-003',
    class_id: 'cls-bk-01',
    gross_amount: 5400000,
    credit_deducted: 540000, // Cấn trừ bảo lưu khóa trước
    net_payable: 4860000,
    paid_amount: 2000000,
    outstanding_amount: 2860000,
    payment_status: 'partial',
    due_date: '2026-09-15',
    vietqr_url: 'https://img.vietqr.io/image/970436-0181003456789-compact2.png?amount=2860000&addInfo=HP%20RY00103%20BongRoA1',
    payment_reference: 'FT262460111222',
    created_at: '2026-09-01'
  },
  {
    id: 'inv-004',
    invoice_code: 'INV-2026-BK-005',
    student_id: 'stu-005',
    class_id: 'cls-bk-01',
    gross_amount: 5400000,
    credit_deducted: 0,
    net_payable: 5400000,
    paid_amount: 0,
    outstanding_amount: 5400000,
    payment_status: 'unpaid', // Nợ phí quá hạn
    due_date: '2026-09-08',
    vietqr_url: 'https://img.vietqr.io/image/970436-0181003456789-compact2.png?amount=5400000&addInfo=HP%20EXT00201%20BongRoA1',
    created_at: '2026-09-01'
  },
  {
    id: 'inv-005',
    invoice_code: 'INV-2026-SW-001',
    student_id: 'stu-001',
    class_id: 'cls-sw-01',
    gross_amount: 6300000,
    credit_deducted: 0,
    net_payable: 6300000,
    paid_amount: 6300000,
    outstanding_amount: 0,
    payment_status: 'paid',
    due_date: '2026-09-08',
    vietqr_url: 'https://img.vietqr.io/image/970436-0181003456789-compact2.png?amount=6300000&addInfo=HP%20RY00101%20BoiLoiS1',
    payment_reference: 'FT262450892212',
    verified_by: 'Kế toán Lê Thị Hương',
    verified_at: '2026-09-03T10:20:00Z',
    created_at: '2026-09-01'
  }
];

export const initialClassSessions: ClassSession[] = [
  {
    id: 'ses-bk-01',
    class_id: 'cls-bk-01',
    session_number: 1,
    session_date: '2026-10-05',
    actual_teacher_id: 'tch-nam',
    is_substitute: false,
    snacks_allocated: 5, // Có 5 học sinh Royal trong lớp
    snacks_consumed: 5,  // Tất cả có mặt
    snacks_returned: 0,
    status: 'completed'
  },
  {
    id: 'ses-bk-02',
    class_id: 'cls-bk-01',
    session_number: 2,
    session_date: '2026-10-07',
    actual_teacher_id: 'tch-nam',
    is_substitute: false,
    snacks_allocated: 5,
    snacks_consumed: 4,  // 1 vắng có phép -> trả về bếp 1
    snacks_returned: 1,
    status: 'completed'
  },
  {
    id: 'ses-bk-03',
    class_id: 'cls-bk-01',
    session_number: 3,
    session_date: '2026-10-12',
    actual_teacher_id: 'tch-nam',
    is_substitute: false,
    snacks_allocated: 5,
    snacks_consumed: 4,  // 1 vắng có phép -> hoàn bếp 1
    snacks_returned: 1,
    status: 'completed'
  },
  {
    id: 'ses-bk-04',
    class_id: 'cls-bk-01',
    session_number: 4,
    session_date: '2026-10-14', // Hôm nay
    actual_teacher_id: 'tch-nam',
    is_substitute: false,
    snacks_allocated: 5,
    snacks_consumed: 4,
    snacks_returned: 1,
    status: 'completed'
  }
];

export const initialAttendance: Attendance[] = [
  // Session 1 (2026-10-05)
  { id: 'att-01', session_id: 'ses-bk-01', class_id: 'cls-bk-01', student_id: 'stu-001', session_date: '2026-10-05', status: 'present' },
  { id: 'att-02', session_id: 'ses-bk-01', class_id: 'cls-bk-01', student_id: 'stu-002', session_date: '2026-10-05', status: 'present' },
  { id: 'att-03', session_id: 'ses-bk-01', class_id: 'cls-bk-01', student_id: 'stu-003', session_date: '2026-10-05', status: 'present' },
  { id: 'att-04', session_id: 'ses-bk-01', class_id: 'cls-bk-01', student_id: 'stu-005', session_date: '2026-10-05', status: 'present' },
  { id: 'att-05', session_id: 'ses-bk-01', class_id: 'cls-bk-01', student_id: 'stu-007', session_date: '2026-10-05', status: 'present' },
  { id: 'att-06', session_id: 'ses-bk-01', class_id: 'cls-bk-01', student_id: 'stu-008', session_date: '2026-10-05', status: 'absent_excused', note: 'Phụ huynh báo bé sốt siêu vi' },
  { id: 'att-07', session_id: 'ses-bk-01', class_id: 'cls-bk-01', student_id: 'stu-009', session_date: '2026-10-05', status: 'absent_unexcused', note: 'Không liên lạc được phụ huynh' },

  // Session 2 (2026-10-07)
  { id: 'att-08', session_id: 'ses-bk-02', class_id: 'cls-bk-01', student_id: 'stu-001', session_date: '2026-10-07', status: 'present' },
  { id: 'att-09', session_id: 'ses-bk-02', class_id: 'cls-bk-01', student_id: 'stu-002', session_date: '2026-10-07', status: 'present' },
  { id: 'att-10', session_id: 'ses-bk-02', class_id: 'cls-bk-01', student_id: 'stu-003', session_date: '2026-10-07', status: 'present' },
  { id: 'att-11', session_id: 'ses-bk-02', class_id: 'cls-bk-01', student_id: 'stu-005', session_date: '2026-10-07', status: 'present' },
  { id: 'att-12', session_id: 'ses-bk-02', class_id: 'cls-bk-01', student_id: 'stu-007', session_date: '2026-10-07', status: 'present' },
  { id: 'att-13', session_id: 'ses-bk-02', class_id: 'cls-bk-01', student_id: 'stu-008', session_date: '2026-10-07', status: 'absent_excused', note: 'Nằm viện theo dõi ngày 2' },
  { id: 'att-14', session_id: 'ses-bk-02', class_id: 'cls-bk-01', student_id: 'stu-009', session_date: '2026-10-07', status: 'absent_unexcused', note: 'Vẫn không thấy có mặt' },

  // Session 3 (2026-10-12)
  { id: 'att-15', session_id: 'ses-bk-03', class_id: 'cls-bk-01', student_id: 'stu-001', session_date: '2026-10-12', status: 'present' },
  { id: 'att-16', session_id: 'ses-bk-03', class_id: 'cls-bk-01', student_id: 'stu-002', session_date: '2026-10-12', status: 'present' },
  { id: 'att-17', session_id: 'ses-bk-03', class_id: 'cls-bk-01', student_id: 'stu-003', session_date: '2026-10-12', status: 'present' },
  { id: 'att-18', session_id: 'ses-bk-03', class_id: 'cls-bk-01', student_id: 'stu-005', session_date: '2026-10-12', status: 'present' },
  { id: 'att-19', session_id: 'ses-bk-03', class_id: 'cls-bk-01', student_id: 'stu-007', session_date: '2026-10-12', status: 'present' },
  { id: 'att-20', session_id: 'ses-bk-03', class_id: 'cls-bk-01', student_id: 'stu-008', session_date: '2026-10-12', status: 'absent_excused', note: 'Vắng buổi thứ 3 liên tiếp có đơn bác sĩ' },
  { id: 'att-21', session_id: 'ses-bk-03', class_id: 'cls-bk-01', student_id: 'stu-009', session_date: '2026-10-12', status: 'absent_unexcused', note: 'Vắng không phép buổi thứ 3 liên tiếp' }
];

export const initialMakeupCredits: MakeupCredit[] = [
  {
    id: 'cred-001',
    credit_code: 'RS-CRED-2026-0042',
    student_id: 'stu-003',
    source_class_id: 'cls-bk-01',
    subject_id: 'sub-bk',
    term_id: 'term-2026-h1',
    consecutive_absent_count: 3,
    consecutive_dates: ['2026-09-15', '2026-09-17', '2026-09-22'],
    source_rate: 180000,
    credit_rule: 'monetary',
    total_credit_amount: 540000,
    transferred_sessions: 3,
    issue_date: '2026-09-23',
    expiry_date: '2027-09-23', // Hạn 1 năm chuẩn Royal
    status: 'applied', // Đã cấn trừ vào hóa đơn
    applied_class_id: 'cls-bk-01',
    applied_at: '2026-09-25T08:00:00Z',
    note: 'Đã cấn trừ vào hóa đơn INV-2026-BK-003'
  }
];

export const initialParentRegistrations: ParentRegistration[] = [
  {
    id: 'reg-001',
    code: 'REG-2026-001',
    registration_code: 'REG-2026-001',
    parent_name: 'Nguyễn Văn Thành',
    parent_phone: '0903 123 999',
    student_name: 'Nguyễn Hoàng Khôi',
    student_dob: '2016-07-15',
    dob: '2016-07-15',
    is_royal_student: true,
    is_royal: true,
    current_school: 'Royal School PMH',
    current_class: 'Lớp 4A3',
    desired_subject_id: 'sub-bk',
    preferred_subject_id: 'sub-bk',
    desired_time_slot_type: 'after_school',
    preferred_time_slot_id: 'slot-t2t4-pm',
    desired_campus_id: 'camp-pmh',
    campus_id: 'camp-pmh',
    medical_notes: 'Bé bị cận nhẹ, thích chơi bóng rổ vị trí hậu vệ',
    status: 'pending',
    notes: 'Phụ huynh gọi hỏi thêm về đồ bảo hộ bơi lội',
    created_at: '2026-10-13 14:20'
  },
  {
    id: 'reg-002',
    code: 'REG-2026-002',
    registration_code: 'REG-2026-002',
    parent_name: 'Lê Diệu Linh',
    parent_phone: '0912 888 666',
    student_name: 'Lê Gia Hân',
    student_dob: '2017-03-22',
    dob: '2017-03-22',
    is_royal_student: false,
    is_royal: false,
    current_school: 'Tiểu học Đinh Tiên Hoàng',
    current_class: 'Lớp 3/5',
    desired_subject_id: 'sub-pn',
    preferred_subject_id: 'sub-pn',
    desired_time_slot_type: 'weekend',
    preferred_time_slot_id: 'slot-sat-am',
    desired_campus_id: 'camp-pmh',
    campus_id: 'camp-pmh',
    medical_notes: '',
    status: 'contacted',
    notes: 'Đã gọi tư vấn, hẹn chiều thứ 7 đến test trình độ phím',
    created_at: '2026-10-12 09:15'
  }
];

export const initialNotifications: NotificationItem[] = [
  {
    id: 'notif-001',
    type: 'absence_alert',
    title: 'Cảnh báo vắng 3 buổi liên tiếp',
    message: 'Học sinh Đỗ Tuấn Kiệt (RY-2026-00108) vắng có phép liên tục 3 buổi lớp Bóng rổ A1. Đủ điều kiện lập Phiếu Bảo Lưu.',
    date: 'Hôm nay, 10:15',
    read: false
  },
  {
    id: 'notif-002',
    type: 'absence_alert',
    title: 'Cảnh báo vắng KHÔNG phép 3 buổi',
    message: 'Học sinh Ngô Khánh An (EXT-2026-00203) vắng không phép 3 buổi lớp Bóng rổ. Tuyển sinh/Học vụ cần liên hệ gấp!',
    date: 'Hôm nay, 09:30',
    read: false
  },
  {
    id: 'notif-003',
    type: 'debt_warning',
    title: 'Nhắc nhở nợ phí (Mốc 1/2 khóa)',
    message: 'Học sinh Vũ Hoàng Quân (EXT-2026-00201) còn nợ 5.400.000 đ lớp Bóng rổ A1. Hạn thanh toán đã quá 30 ngày.',
    date: 'Hôm qua, 16:45',
    read: false
  },
  {
    id: 'notif-004',
    type: 'new_registration',
    title: 'Đơn đăng ký mới từ Phụ huynh',
    message: 'Phụ huynh Nguyễn Văn Thành đăng ký môn Bóng rổ cho bé Nguyễn Hoàng Khôi (Lớp 4A3).',
    date: '13/10/2026',
    read: true
  }
];
