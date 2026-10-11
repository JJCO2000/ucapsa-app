import type { AppRole } from '../types/app.types';

export type UcapsaCapabilities = {
  isCustomer: boolean;
  isStaff: boolean;
  canUseTrainingWorkspace: boolean;
  canSwitchStaffWorkspace: boolean;
  canManageClassRoster: boolean;
  canRecordAttendance: boolean;
  canUploadExamDefinition: boolean;
  canPublishExamDefinition: boolean;
  canCaptureExamResults: boolean;
  canUploadExamResults: boolean;
  canViewOperationalDogData: boolean;
  canViewInternalDogNotes: boolean;
  canEditInternalDogNotes: boolean;
  canRequestMembershipReview: boolean;
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
  canManageClassRoster: false,
  canRecordAttendance: false,
  canUploadExamDefinition: false,
  canPublishExamDefinition: false,
  canCaptureExamResults: false,
  canUploadExamResults: false,
  canViewOperationalDogData: false,
  canViewInternalDogNotes: false,
  canEditInternalDogNotes: false,
  canRequestMembershipReview: false,
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
  canManageClassRoster: true,
  canRecordAttendance: true,
  canUploadExamDefinition: true,
  canPublishExamDefinition: true,
  canCaptureExamResults: true,
  canUploadExamResults: true,
  canViewOperationalDogData: true,
  canViewInternalDogNotes: true,
  canEditInternalDogNotes: true,
  canRequestMembershipReview: true,
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
