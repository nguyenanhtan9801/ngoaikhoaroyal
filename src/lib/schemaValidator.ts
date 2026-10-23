import {
  Student,
  ExtracurricularClass,
  Enrollment,
  TuitionInvoice,
  AttendanceRecord,
  CreditNote,
  MakeupCredit,
  ClassTransfer,
  AppStore,
  Campus,
  AcademicTerm,
  Subject,
  Teacher,
} from '../types';

/**
 * Chuẩn hóa chuỗi họ tên: bỏ dấu tiếng Việt, viết thường, loại bỏ khoảng trắng thừa
 */
export function normalizeVietnameseName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Chuẩn hóa số điện thoại: chỉ giữ lại các chữ số
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) {
    return '0' + digits.slice(2);
  }
  return digits;
}

export interface StudentMatchResult {
  matched: Student | null;
  confidence: number; // 0 - 100
  criteria: string;
  isSiblingCandidate?: boolean;
}

export interface CreditEligibilityResult {
  isEligible: boolean;
  consecutiveCount: number;
  dates: string[];
  records: AttendanceRecord[];
  error?: string;
  creditRule: 'monetary' | 'sessions';
}

export interface TransferCalculationResult {
  surchargeAmount: number;
  surplusAmount: number;
  convertedSessions: number;
  netPayable: number;
  description: string;
  isUpgrade: boolean;
}

export interface IntegrityCheckResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * DatabaseIntegrityManager: Đảm bảo tính toàn vẹn 3NF, ràng buộc quan hệ & kế thừa phân cấp
 */
export class DatabaseIntegrityManager {
  /**
   * 1. Đối chiếu học sinh cũ/mới (Tránh tạo trùng lặp học sinh)
   * Kiểm tra theo composite key: Tên chuẩn hóa + SĐT phụ huynh / Ngày sinh
   */
  static matchExistingStudent(
    incomingName: string,
    incomingPhone: string,
    existingStudents: Student[],
    incomingDob?: string
  ): StudentMatchResult {
    const normName = normalizeVietnameseName(incomingName);
    const normPhone = normalizePhoneNumber(incomingPhone);
    const cleanDob = (incomingDob || '').trim();

    if (!normName) {
      return { matched: null, confidence: 0, criteria: 'Không có thông tin họ tên học sinh' };
    }

    let siblingCandidate: Student | null = null;

    for (const student of existingStudents) {
      const sName = normalizeVietnameseName(student.name);
      const sPhone = normalizePhoneNumber(student.parent_phone);
      const sDob = (student.dob || student.date_of_birth || '').trim();

      const isNameMatch = normName === sName;
      const isPhoneMatch = normPhone && sPhone && normPhone === sPhone;
      const isDobMatch = cleanDob && sDob && cleanDob === sDob;

      // 100% Khớp Họ tên + SĐT + Ngày sinh
      if (isNameMatch && isPhoneMatch && isDobMatch) {
        return {
          matched: student,
          confidence: 100,
          criteria: 'Khớp 100% Họ tên, Số điện thoại và Ngày sinh',
        };
      }

      // 95% Khớp Họ tên + SĐT Phụ huynh
      if (isNameMatch && isPhoneMatch) {
        return {
          matched: student,
          confidence: 95,
          criteria: 'Khớp Họ tên học sinh và Số điện thoại phụ huynh',
        };
      }

      // 90% Khớp Họ tên + Ngày tháng năm sinh
      if (isNameMatch && isDobMatch) {
        return {
          matched: student,
          confidence: 90,
          criteria: 'Khớp Họ tên học sinh và Ngày tháng năm sinh',
        };
      }

      // Phát hiện anh chị em ruột: Trùng SĐT phụ huynh nhưng khác họ tên
      if (isPhoneMatch && !isNameMatch && !siblingCandidate) {
        siblingCandidate = student;
      }
    }

    if (siblingCandidate) {
      return {
        matched: null,
        confidence: 40,
        criteria: `Phát hiện phụ huynh chung SĐT với học sinh ${siblingCandidate.name} (${siblingCandidate.code}) - Khả năng là anh/chị/em ruột`,
        isSiblingCandidate: true,
      };
    }

    return { matched: null, confidence: 0, criteria: 'Học sinh mới hoàn toàn' };
  }

  /**
   * 2. Ràng buộc điều kiện cấp Phiếu bảo lưu (Credit Note)
   * - Nghỉ có phép liên tục >= 3 buổi (status === 'absent_excused') không ngắt quãng
   * - Ngày vắng không được nằm trong tương lai
   * - Đã đính kèm minh chứng / lý do y tế hợp lệ
   * - Định mức tối đa 1 lần / 1 môn / 1 khóa học
   */
  static validateCreditEligibility(
    studentId: string,
    classId: string,
    attendanceRecords: AttendanceRecord[],
    existingCreditNotes: (CreditNote | MakeupCredit)[],
    currentDate?: string,
    targetSubjectId?: string,
    targetTermId?: string
  ): CreditEligibilityResult {
    const today = currentDate || new Date().toISOString().split('T')[0];

    // Kiểm tra định mức 1 lần / môn / khóa
    const hasExisting = existingCreditNotes.some(cn => {
      if (cn.student_id !== studentId || cn.status === 'cancelled') return false;
      if (cn.source_class_id === classId) return true;
      if (targetSubjectId && targetTermId) {
        const cnTermId = cn.source_term_id || cn.term_id;
        if (cn.subject_id === targetSubjectId && cnTermId === targetTermId) return true;
      }
      return false;
    });

    if (hasExisting) {
      return {
        isEligible: false,
        consecutiveCount: 0,
        dates: [],
        records: [],
        creditRule: 'sessions',
        error: 'Môn học này đã được cấp phiếu bảo lưu trong khóa học hiện tại (Định mức tối đa 1 lần/môn/khóa).',
      };
    }

    // Lọc lịch sử điểm danh của học sinh trong lớp, sắp xếp theo ngày tăng dần
    const studentHistory = attendanceRecords
      .filter(a => a.student_id === studentId && a.class_id === classId)
      .sort((a, b) => a.session_date.localeCompare(b.session_date));

    let maxStreak = 0;
    let maxDates: string[] = [];
    let maxRecords: AttendanceRecord[] = [];

    let currentStreak = 0;
    let currentDates: string[] = [];
    let currentRecords: AttendanceRecord[] = [];

    for (const rec of studentHistory) {
      // Bỏ qua nếu là ngày tương lai (vi phạm ràng buộc thời gian)
      if (rec.session_date > today) continue;

      if (rec.status === 'absent_excused') {
        currentStreak++;
        currentDates.push(rec.session_date);
        currentRecords.push(rec);

        if (currentStreak >= maxStreak) {
          maxStreak = currentStreak;
          maxDates = [...currentDates];
          maxRecords = [...currentRecords];
        }
      } else {
        // Có mặt hoặc vắng không phép -> chuỗi bị ngắt quãng
        currentStreak = 0;
        currentDates = [];
        currentRecords = [];
      }
    }

    if (maxStreak < 3) {
      return {
        isEligible: false,
        consecutiveCount: maxStreak,
        dates: maxDates,
        records: maxRecords,
        creditRule: 'sessions',
        error: `Không đủ điều kiện: Cần vắng có phép liên tục từ 3 buổi trở lên không ngắt quãng (Hiện tại dài nhất: ${maxStreak} buổi).`,
      };
    }

    return {
      isEligible: true,
      consecutiveCount: maxStreak,
      dates: maxDates,
      records: maxRecords,
      creditRule: 'sessions',
    };
  }

  /**
   * 3. Tính toán chênh lệch & phụ thu chuyển lớp 2 chiều (Transfer Surcharge)
   * - newRate > oldRate: Thu thêm = (newRate - oldRate) * remainingSessions
   * - newRate <= oldRate: Chuyển ngang, không hoàn tiền mặt theo quy định Royal School
   */
  static calculateTransferSurcharge(
    oldRate: number,
    newRate: number,
    remainingSessions: number,
    handlingOption: 'standard_no_refund' | 'issue_credit_note' | 'convert_sessions' = 'standard_no_refund'
  ): TransferCalculationResult {
    const validSessions = Math.max(0, remainingSessions);
    const isUpgrade = newRate > oldRate;

    if (isUpgrade) {
      const surcharge = (newRate - oldRate) * validSessions;
      return {
        surchargeAmount: surcharge,
        surplusAmount: 0,
        convertedSessions: 0,
        netPayable: surcharge,
        isUpgrade: true,
        description: `Chuyển sang lớp đơn giá cao hơn: Phụ thu thêm ${(newRate - oldRate).toLocaleString('vi-VN')} đ/buổi × ${validSessions} buổi = ${surcharge.toLocaleString('vi-VN')} đ`,
      };
    }

    // Đơn giá mới thấp hơn hoặc bằng đơn giá cũ
    const surplus = (oldRate - newRate) * validSessions;
    let convertedSessions = 0;

    if (handlingOption === 'convert_sessions' && newRate > 0) {
      convertedSessions = Math.floor(surplus / newRate);
    }

    let desc = 'Chuyển ngang: Giữ nguyên số buổi, không phát sinh phụ thu và không hoàn tiền chênh lệch theo quy chế.';
    if (handlingOption === 'issue_credit_note' && surplus > 0) {
      desc = `Bảo lưu chênh lệch: Cấp Phiếu bảo lưu phụ trị giá ${surplus.toLocaleString('vi-VN')} đ cấn trừ khóa sau.`;
    } else if (handlingOption === 'convert_sessions' && convertedSessions > 0) {
      desc = `Quy đổi buổi: Chênh lệch ${surplus.toLocaleString('vi-VN')} đ được quy đổi thêm ${convertedSessions} buổi ở lớp mới.`;
    }

    return {
      surchargeAmount: 0,
      surplusAmount: surplus,
      convertedSessions,
      netPayable: 0,
      isUpgrade: false,
      description: desc,
    };
  }

  /**
   * 4. Ràng buộc Khóa & Lịch học lớp: Mỗi lớp đúng 2 ngày trong tuần
   */
  static validateClassScheduleConstraint(cls: Partial<ExtracurricularClass>): { valid: boolean; error?: string } {
    if (!cls.days_of_week || cls.days_of_week.length !== 2) {
      return {
        valid: false,
        error: `Ràng buộc lịch học vi phạm: Lớp ngoại khóa phải có đúng 2 buổi/tuần (Hiện tại: ${cls.days_of_week?.length || 0} buổi).`,
      };
    }
    if (!cls.time_slot_id) {
      return {
        valid: false,
        error: 'Ràng buộc khung giờ vi phạm: Lớp phải gắn liền với một Time Slot hợp lệ.',
      };
    }
    return { valid: true };
  }

  /**
   * 5. Ràng buộc Sĩ số tối đa lớp học
   */
  static validateClassCapacity(
    classId: string,
    enrollments: Enrollment[],
    maxStudents: number,
    allowOverQuota: boolean = false
  ): { valid: boolean; currentCount: number; maxCount: number; error?: string } {
    const activeCount = enrollments.filter(
      e => e.class_id === classId && (e.status === 'active' || e.status === 'trial')
    ).length;

    if (activeCount >= maxStudents && !allowOverQuota) {
      return {
        valid: false,
        currentCount: activeCount,
        maxCount: maxStudents,
        error: `Lớp đã đủ sĩ số tối đa (${activeCount}/${maxStudents} học viên). Không thể tiếp nhận thêm học sinh nếu chưa bật chế độ cho phép vượt sĩ số.`,
      };
    }

    return {
      valid: true,
      currentCount: activeCount,
      maxCount: maxStudents,
    };
  }

  /**
   * 6. Ràng buộc Ngày điểm danh không được ở tương lai
   */
  static validateAttendanceDate(sessionDate: string, today?: string): { valid: boolean; error?: string } {
    const currentDay = today || new Date().toISOString().split('T')[0];
    if (sessionDate > currentDay) {
      return {
        valid: false,
        error: `RÀNG BUỘC THỜI GIAN: Ngày ${sessionDate} là ngày tương lai. Hệ thống khóa chức năng điểm danh trước ngày thực học!`,
      };
    }
    return { valid: true };
  }

  /**
   * 7. Ràng buộc Số học Hóa đơn học phí (Financial Arithmetic Integrity)
   * gross_amount - credit_deducted - discount_amount = net_payable
   * net_payable - paid_amount = outstanding_amount
   */
  static validateInvoiceArithmetic(inv: TuitionInvoice): { valid: boolean; error?: string } {
    const discount = inv.discount_amount || 0;
    const credit = inv.credit_deducted || 0;
    const expectedNet = Math.max(0, inv.gross_amount - credit - discount);

    if (Math.abs(expectedNet - inv.net_payable) > 100) {
      return {
        valid: false,
        error: `Sai lệch số học hóa đơn ${inv.invoice_code}: Học phí gốc (${inv.gross_amount}) - Bảo lưu (${credit}) - Giảm giá (${discount}) = ${expectedNet}, khác Net Payable (${inv.net_payable}).`,
      };
    }

    const expectedOutstanding = Math.max(0, inv.net_payable - inv.paid_amount);
    if (Math.abs(expectedOutstanding - inv.outstanding_amount) > 100) {
      return {
        valid: false,
        error: `Sai lệch công nợ hóa đơn ${inv.invoice_code}: Cần thu (${inv.net_payable}) - Đã thu (${inv.paid_amount}) = ${expectedOutstanding}, khác Công nợ (${inv.outstanding_amount}).`,
      };
    }

    return { valid: true };
  }

  /**
   * 8. Kiểm tra toàn vẹn toàn bộ Database Store (Full Store Integrity Check)
   */
  static validateStoreIntegrity(store: AppStore): IntegrityCheckResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const campusIds = new Set((store.campuses || []).map((c: Campus) => c.id));
    const termIds = new Set((store.terms || []).map((t: AcademicTerm) => t.id));
    const subjectIds = new Set((store.subjects || []).map((s: Subject) => s.id));
    const teacherIds = new Set((store.teachers || []).map((t: Teacher) => t.id));
    const classIds = new Set((store.classes || []).map((c: ExtracurricularClass) => c.id));
    const studentIds = new Set((store.students || []).map((s: Student) => s.id));

    // Kiểm tra lớp học
    for (const cls of store.classes) {
      if (!termIds.has(cls.term_id)) {
        errors.push(`Lớp ${cls.name} (${cls.id}) tham chiếu term_id không tồn tại: ${cls.term_id}`);
      }
      if (!campusIds.has(cls.campus_id)) {
        errors.push(`Lớp ${cls.name} (${cls.id}) tham chiếu campus_id không tồn tại: ${cls.campus_id}`);
      }
      if (!subjectIds.has(cls.subject_id)) {
        errors.push(`Lớp ${cls.name} (${cls.id}) tham chiếu subject_id không tồn tại: ${cls.subject_id}`);
      }
      if (cls.primary_teacher_id && !teacherIds.has(cls.primary_teacher_id)) {
        warnings.push(`Lớp ${cls.name} (${cls.id}) tham chiếu giáo viên không có trong danh sách: ${cls.primary_teacher_id}`);
      }
    }

    // Kiểm tra ghi danh (Enrollments)
    for (const enr of store.enrollments) {
      if (!studentIds.has(enr.student_id)) {
        errors.push(`Ghi danh ${enr.id} tham chiếu student_id không tồn tại: ${enr.student_id}`);
      }
      if (!classIds.has(enr.class_id)) {
        errors.push(`Ghi danh ${enr.id} tham chiếu class_id không tồn tại: ${enr.class_id}`);
      }
    }

    // Kiểm tra hóa đơn (Invoices)
    for (const inv of store.invoices) {
      if (!studentIds.has(inv.student_id)) {
        errors.push(`Hóa đơn ${inv.invoice_code} tham chiếu student_id không tồn tại: ${inv.student_id}`);
      }
      if (!classIds.has(inv.class_id)) {
        warnings.push(`Hóa đơn ${inv.invoice_code} tham chiếu class_id không tồn tại: ${inv.class_id}`);
      }
      const arith = this.validateInvoiceArithmetic(inv);
      if (!arith.valid && arith.error) {
        warnings.push(arith.error);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
