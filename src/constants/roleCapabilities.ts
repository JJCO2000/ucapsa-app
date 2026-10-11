import type { AppRole } from '../types/app.types';

export type UcapsaCapabilities = {
  isCustomer: boolean;
  isStaff: boolean;
  canUseTrainingWorkspace: boolean;
  canSwitchStaffWorkspace: boolean;

  canViewClassRoster: boolean;
  canRecordAttendance: boolean;
  canViewOperationalDogData: boolean;
  canWriteInternalDogHistory: boolean;
  canUploadExamDefinition: boolean;
  canCaptureExamResults: boolean;
  canUploadExamResults: boolean;
  canExportOperationalReports: boolean;

  canManageCustomers: boolean;
  canManageMemberships: boolean;
  canManagePayments: boolean;
  canManageCommunications: boolean;
  canManageSchedules: boolean;
  canConfigureExamStructure: boolean;
  canPublishExamResults: boolean;
  canManageStaffRoles: boolean;
  canViewGlobalAnalytics: boolean;
};

const CUSTOMER: UcapsaCapabilities = {
  isCustomer: true,
  isStaff: false,
  canUseTrainingWorkspace: false,
  canSwitchStaffWorkspace: false,

  canViewClassRoster: false,
  canRecordAttendance: false,
  canViewOperationalDogData: false,
  canWriteInternalDogHistory: false,
  canUploadExamDefinition: false,
  canCaptureExamResults: false,
  canUploadExamResults: false,
  canExportOperationalReports: false,

  canManageCustomers: false,
  canManageMemberships: false,
  canManagePayments: false,
  canManageCommunications: false,
  canManageSchedules: false,
  canConfigureExamStructure: false,
  canPublishExamResults: false,
  canManageStaffRoles: false,
  canViewGlobalAnalytics: false,
};

const TRAINER: UcapsaCapabilities = {
  ...CUSTOMER,
  isCustomer: false,
  isStaff: true,
  canUseTrainingWorkspace: true,

  canViewClassRoster: true,
  canRecordAttendance: true,
  canViewOperationalDogData: true,
  canWriteInternalDogHistory: true,
  canUploadExamDefinition: true,
  canCaptureExamResults: true,
  canUploadExamResults: true,
  canExportOperationalReports: true,
};

const ADMIN: UcapsaCapabilities = {
  ...TRAINER,
  canSwitchStaffWorkspace: true,

  canManageCustomers: true,
  canManageMemberships: true,
  canManagePayments: true,
  canManageCommunications: true,
  canManageSchedules: true,
  canConfigureExamStructure: true,
  canPublishExamResults: true,
  canViewGlobalAnalytics: true,
};

const SUPER_ADMIN: UcapsaCapabilities = {
  ...ADMIN,
  canManageStaffRoles: true,
};

export function getRoleCapabilities(role: AppRole | null | undefined): UcapsaCapabilities {
  if (role === 'super_admin') return SUPER_ADMIN;
  if (role === 'admin') return ADMIN;
  if (role === 'trainer') return TRAINER;
  return CUSTOMER;
}
