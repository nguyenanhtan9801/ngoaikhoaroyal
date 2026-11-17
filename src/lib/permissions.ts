import { AppUser, Teacher, UserPermissionMatrix } from '../types';
import { getUserPermissions } from './storage';

export type ClassroomStaffKind = 'teacher' | 'nanny' | 'supervisor';

/**
 * Xác định phân loại nhân sự vận hành lớp học (Giáo viên / Bảo mẫu / Quản sinh)
 * dựa trên `user.role`, `user.department`, hoặc hồ sơ `teachers` liên kết.
 */
export function getClassroomStaffKind(
  user?: Partial<AppUser> | null,
  teachers?: Teacher[]
): ClassroomStaffKind | null {
  if (!user || !user.role) return null;
  const role = String(user.role).trim().toLowerCase();

  if (role === 'nanny') return 'nanny';
  if (role === 'supervisor') return 'supervisor';

  const linkedId = user.linked_teacher_id || user.teacher_id;
  const linkedTeacher =
    linkedId && Array.isArray(teachers)
      ? teachers.find(t => t.id === linkedId || t.code === linkedId)
      : undefined;

  const metaParts = [
    user.department || '',
    user.full_name || '',
    linkedTeacher?.notes || '',
    linkedTeacher?.name || '',
  ]
    .join(' ')
    .toLowerCase();

  const isNannyMeta =
    metaParts.includes('bảo mẫu') ||
    metaParts.includes('bao mau') ||
    metaParts.includes('nanny') ||
    /\bnvnd\b/i.test(metaParts);

  const isSupervisorMeta =
    metaParts.includes('quản sinh') ||
    metaParts.includes('quan sinh') ||
    metaParts.includes('supervisor');

  const rawPerms =
    user.permissions && !Array.isArray(user.permissions) ? user.permissions : null;

  if (
    role === 'teacher' ||
    role === 'academic_staff' ||
    Boolean(linkedId)
  ) {
    if (isNannyMeta) return 'nanny';
    if (isSupervisorMeta) return 'supervisor';
    if (rawPerms?.can_attend_all_classes) return 'supervisor';
  }

  if (role === 'teacher') {
    return 'teacher';
  }

  return null;
}

/**
 * Kiểm tra tài khoản đăng nhập có thuộc đối tượng vận hành lớp học (Giáo viên, Bảo mẫu, Quản sinh) hay không.
 */
export function isClassroomPortalUser(
  user?: Partial<AppUser> | null,
  teachers?: Teacher[]
): boolean {
  return getClassroomStaffKind(user, teachers) !== null;
}

export const isOperationalClassStaff = isClassroomPortalUser;

/**
 * Lấy nhãn hiển thị vai trò trên thẻ QR & Header Cổng Nhân Sự Lớp Học
 */
export function getClassroomStaffRoleLabel(kind: ClassroomStaffKind): string {
  if (kind === 'nanny') return 'BẢO MẪU';
  if (kind === 'supervisor') return 'QUẢN SINH';
  return 'GIÁO VIÊN ĐỨNG LỚP';
}

/**
 * Kiểm tra người dùng hiện tại có phải là Super Admin hay không.
 * Nguyên tắc phân quyền: luôn lấy từ currentUser.role / permissions của tài khoản đăng nhập,
 * KHÔNG BAO GIỜ lấy từ state giao diện.
 */
export function isUserSuperAdmin(user?: Partial<AppUser> | null): boolean {
  if (!user) return false;
  return user.role === 'super_admin';
}

/**
 * Lấy tập quyền hạn thực tế từ tài khoản đang đăng nhập
 */
export function getEffectivePermissions(user?: Partial<AppUser> | null): UserPermissionMatrix {
  return getUserPermissions(user as AppUser | null);
}

/**
 * Kiểm tra tài khoản đăng nhập có quyền truy cập routeId hay không
 */
export function isRouteAllowed(
  routeId: string,
  user?: Partial<AppUser> | null,
  teachers?: Teacher[]
): boolean {
  if (!user || !user.role) return false;
  if (isUserSuperAdmin(user)) {
    return true;
  }

  const perms = getEffectivePermissions(user);

  // Nhân sự vận hành lớp học (Giáo viên, Bảo mẫu, Quản sinh):
  // - Chặn tuyệt đối màn hình Tổng Quan Hiệu Suất & Thống Kê ('sub_kpi') dưới mọi hình thức
  // - Chỉ cho phép truy cập các route thuộc phạm vi Cổng Check-in & Điểm danh theo phân quyền
  if (isOperationalClassStaff(user, teachers)) {
    if (routeId === 'sub_kpi') {
      return false;
    }
    if (routeId === 'teacher_portal') {
      return true;
    }
    if (routeId === 'sub_attendance') {
      return Boolean(perms.can_take_attendance ?? true);
    }
    if (routeId === 'sub_teacher_checkin') {
      return Boolean(perms.can_scan_teacher_checkin);
    }
    return false;
  }

  switch (routeId) {
    case 'sub_kpi':
      return perms.can_view_kpi !== false;
    case 'sub_parents':
    case 'sub_students':
    case 'sub_students_health':
      return Boolean(
        perms.can_manage_enrollment ||
          perms.can_view_registrations ||
          perms.can_manage_classes
      );
    case 'sub_credits':
      return Boolean(perms.can_manage_credits || perms.can_manage_finance);
    case 'sub_term_subjects':
    case 'sub_pricing':
    case 'sub_settings':
    case 'sub_holidays':
    case 'sub_backup':
      return Boolean(perms.can_config_system || perms.can_manage_classes);
    case 'sub_classes':
    case 'sub_schedule':
      return Boolean(
        perms.can_manage_classes ||
          perms.can_view_classes ||
          perms.can_take_attendance
      );
    case 'sub_class_promotion':
      if (
        user.role === 'super_admin' ||
        user.role === 'campus_manager' ||
        user.role === 'academic_affairs' ||
        user.role === 'academic' ||
        user.role === 'academic_admissions' ||
        user.role === 'academic_accountant' ||
        user.role === 'academic_staff'
      ) {
        return true;
      }
      return Boolean(perms.can_manage_enrollment);
    case 'sub_teachers':
      // super_admin, campus_manager có quyền quản lý; academic & accountant được xem danh sách và lịch sử hợp đồng
      if (
        user.role === 'campus_manager' ||
        user.role === 'academic' ||
        user.role === 'accountant' ||
        user.role === 'academic_accountant' ||
        user.role === 'academic_admissions' ||
        user.role === 'academic_staff'
      ) {
        return true;
      }
      return Boolean(
        perms.can_manage_teachers ||
          perms.can_manage_classes ||
          perms.can_settle_payroll
      );
    case 'sub_attendance':
    case 'sub_snacks':
      return Boolean(perms.can_take_attendance);
    case 'sub_teacher_checkin':
      if (
        user.role === 'campus_manager' ||
        user.role === 'academic' ||
        user.role === 'academic_accountant' ||
        user.role === 'academic_admissions' ||
        user.role === 'academic_staff'
      ) {
        return true;
      }
      return Boolean(perms.can_scan_teacher_checkin);
    case 'sub_finance':
    case 'sub_finance_invoices':
    case 'sub_finance_clearance':
    case 'sub_finance_transfer':
    case 'sub_finance_partnership':
      return Boolean(perms.can_manage_finance);
    case 'sub_finance_payroll':
      return Boolean(perms.can_settle_payroll || perms.can_manage_finance);
    case 'sub_users':
    case 'sub_audit_logs':
      return Boolean(perms.can_manage_users);
    default:
      return true;
  }
}

/**
 * Lấy route mặc định phù hợp với vai trò của người dùng
 */
export function getDefaultRouteForUser(
  user?: Partial<AppUser> | null,
  teachers?: Teacher[]
): string {
  if (!user || !user.role) return 'sub_kpi';
  if (
    user.role === 'teacher' ||
    user.role === 'nanny' ||
    user.role === 'supervisor' ||
    isOperationalClassStaff(user, teachers)
  ) {
    return 'teacher_portal';
  }
  if (user.role === 'admissions') return 'sub_parents';
  if (user.role === 'accountant') return 'sub_finance_invoices';
  return 'sub_kpi';
}

