import { AppUser, UserPermissionMatrix } from '../types';
import { getUserPermissions } from './storage';

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
export function isRouteAllowed(routeId: string, user?: Partial<AppUser> | null): boolean {
  if (!user || !user.role) return false;
  if (isUserSuperAdmin(user)) {
    return true;
  }

  const perms = getEffectivePermissions(user);

  switch (routeId) {
    case 'sub_kpi':
      return true;
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
    case 'sub_attendance':
    case 'sub_snacks':
      return Boolean(perms.can_take_attendance);
    case 'sub_finance':
    case 'sub_finance_invoices':
    case 'sub_finance_clearance':
    case 'sub_finance_transfer':
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
export function getDefaultRouteForUser(user?: Partial<AppUser> | null): string {
  if (!user || !user.role) return 'sub_kpi';
  if (user.role === 'teacher') return 'sub_attendance';
  if (user.role === 'admissions') return 'sub_parents';
  if (user.role === 'accountant') return 'sub_finance_invoices';
  return 'sub_kpi';
}
