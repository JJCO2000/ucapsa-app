/**
 * Read-only projection of UCAPSA's existing sources of truth.
 *
 * - Auth identifies a person.
 * - profiles.role and roleCapabilities determine OPERATIONAL tools.
 * - memberships and program_enrollments determine separate commercial statuses.
 * - Superadmin preview changes presentation ONLY, never database permissions.
 *
 * This module does not change or persist any source record, issue membership,
 * validate payments or establish eligibility to scan a class QR.
 */
import { getRoleCapabilities } from '../constants/roleCapabilities';
import type {
  AppRole,
  MembershipStatus,
  ProgramCode,
  ProgramEnrollmentStatus,
} from '../types/app.types';

export type ProgramAccessSummary = {
  programCode: ProgramCode;
  status: ProgramEnrollmentStatus;
};

export type AccessProjectionInput = {
  actualRole: AppRole | null;
  membershipStatus: MembershipStatus | null;
  programEnrollments: readonly ProgramAccessSummary[];
  /** Screen preview requested by Superadmin; not an authorization. */
  previewRole?: AppRole | null;
};

export function projectUcapsaAccess(input: AccessProjectionInput) {
  const actualRole = input.actualRole;
  const capabilities = getRoleCapabilities(actualRole);
  const canPreview = actualRole === 'super_admin';
  const previewRole = canPreview ? input.previewRole ?? null : null;

  return {
    identity: { actualRole },
    operational: { capabilities },
    commercial: {
      hasActiveSocioMembership: input.membershipStatus === 'active',
      hasActivePuppyEnrollment: input.programEnrollments.some(
        (item) => item.programCode === 'puppy' && item.status === 'active',
      ),
      hasActiveComandosEnrollment: input.programEnrollments.some(
        (item) => item.programCode === 'comandos' && item.status === 'active',
      ),
      hasHistoricalPuppyEnrollment: input.programEnrollments.some(
        (item) => item.programCode === 'puppy',
      ),
      hasHistoricalComandosEnrollment: input.programEnrollments.some(
        (item) => item.programCode === 'comandos',
      ),
    },
    presentation: {
      canPreview,
      previewRole,
      displayRole: previewRole ?? actualRole,
    },
  };
}
