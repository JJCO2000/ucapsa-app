import type {
  Membership,
  MembershipPaymentStatus,
  MembershipStatus,
  Profile,
} from '../types/app.types';

export type MembershipEffectiveStatus = MembershipStatus | 'scheduled';

type MembershipValidityInput = Pick<Membership, 'status' | 'start_date'>;

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizedDateKey(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

export function getMembershipEffectiveStatus(
  membership: MembershipValidityInput | null | undefined,
  todayKey = localDateKey(),
): MembershipEffectiveStatus {
  if (!membership) return 'none';
  if (membership.status !== 'active') return membership.status;

  const start = normalizedDateKey(membership.start_date);

  // Active memberships are lifetime memberships. Historical end_date values are
  // deliberately not part of effective-status calculation; PostgreSQL also
  // normalizes active rows to end_date = null.
  if (start && todayKey < start) return 'scheduled';
  return 'active';
}

export function isMembershipActiveToday(membership: MembershipValidityInput | null | undefined) {
  return getMembershipEffectiveStatus(membership) === 'active';
}

export function getDisplayName(profile: Profile | null | undefined) {
  return profile?.full_name?.trim() || profile?.email?.trim() || 'Usuario';
}

export function getMembershipStatusLabel(status: MembershipStatus) {
  const labels: Record<MembershipStatus, string> = {
    none: 'Sin membresia',
    pending: 'Pendiente',
    active: 'Activo',
    expired: 'Vencido',
    rejected: 'Rechazado',
    cancelled: 'Cancelado',
  };

  return labels[status] ?? status;
}

export function getMembershipEffectiveStatusLabel(status: MembershipEffectiveStatus) {
  if (status === 'scheduled') return 'Programada';
  return getMembershipStatusLabel(status);
}

export function getPaymentStatusLabel(status: MembershipPaymentStatus | null | undefined) {
  const labels: Record<MembershipPaymentStatus, string> = {
    none: 'Sin pago',
    pending: 'Pendiente',
    paid: 'Pagado',
    not_required: 'No aplica',
    overdue: 'Pago vencido',
  };

  return status ? labels[status] ?? status : 'Sin registro';
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const dateKey = normalizedDateKey(value);
  const date = dateKey ? new Date(`${dateKey}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** @deprecated Active memberships do not expire by date. Kept for legacy status compatibility only. */
export function isMembershipDateExpired(membership: Membership | null | undefined) {
  return membership?.status === 'expired';
}
