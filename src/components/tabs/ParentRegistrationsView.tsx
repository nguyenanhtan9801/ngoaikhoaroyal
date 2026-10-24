import React from 'react';
import { ParentPortalTab } from './ParentPortalTab';
import { AppStore } from '../../lib/storage';
import { UserRole, AppUser } from '../../types';

export interface ParentRegistrationsViewProps {
  store: AppStore;
  currentRole: UserRole;
  currentUser?: AppUser | null;
  onUpdateStore: (updater: (prev: AppStore) => AppStore) => void;
  onOpenParentPortal?: () => void;
  onNavigateToStudents?: (studentCode?: string) => void;
}

/**
 * Màn hình Quản trị Đơn Đăng Ký Tuyển Sinh (Leads) từ Cổng Phụ Huynh
 * Đọc trực tiếp từ bảng public.parent_registrations trên CSDL Supabase
 */
export const ParentRegistrationsView: React.FC<ParentRegistrationsViewProps> = (props) => {
  return <ParentPortalTab {...props} />;
};

export default ParentRegistrationsView;
