import AsyncStorage from '@react-native-async-storage/async-storage';

import { devWarn } from '../lib/client-diagnostics';

import type {
  MemberVisit,
  Membership,
  MembershipStatus,
  MyPaymentOverview,
  ProgramClassCancellation,
  ProgramEnrollmentWithDetails,
  ProgramSchedule,
  UcapsaProgram,
} from '../types/app.types';

export type CachedResource<T> = {
  version: 1;
  scope: string;
  resource: string;
  saved_at: string;
  data: T;
};

export type CalendarClassesOfflineSnapshot = {
  programs: UcapsaProgram[];
  schedules: ProgramSchedule[];
  cancellations: ProgramClassCancellation[];
};

export type MembershipOfflineSummary = {
  member_number: string | null;
  status: MembershipStatus | null;
  start_date: string | null;
  end_date: string | null;
  current_payment_status: Membership['current_payment_status'];
  last_payment_at: string | null;
  updated_at: string | null;
};

export type PaymentOfflineSummary = Pick<
  MyPaymentOverview,
  | 'outstanding_total'
  | 'attention_total'
  | 'future_total'
  | 'overdue_count'
  | 'legacy_membership_pending'
>;

export type MemberVisitOfflineSummary = Pick<MemberVisit, 'id' | 'visit_date' | 'visited_at' | 'source'>;

const CACHE_PREFIX = 'ucapsa:client-read:v1:';

export const clientReadKeys = {
  announcements: 'announcements',
  calendarEvents: 'calendar-events',
  calendarEventCancellations: 'calendar-event-cancellations',
  calendarClasses: 'calendar-classes',
  programs: 'programs',
  dogs: 'dogs',
  membership: 'membership',
  paymentSummary: 'payment-summary',
  memberVisits: 'member-visits',
} as const;

function key(scope: string, resource: string) {
  return `${CACHE_PREFIX}${scope}:${resource}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function readClientResource<T>(scope: string, resource: string): Promise<CachedResource<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key(scope, resource));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || parsed.version !== 1 || parsed.scope !== scope || parsed.resource !== resource || typeof parsed.saved_at !== 'string' || !Object.prototype.hasOwnProperty.call(parsed, 'data')) {
      await AsyncStorage.removeItem(key(scope, resource));
      return null;
    }
    return parsed as CachedResource<T>;
  } catch (error) {
    devWarn('Could not read client resource cache.', error);
    return null;
  }
}

export async function writeClientResource<T>(scope: string, resource: string, data: T): Promise<CachedResource<T>> {
  const payload: CachedResource<T> = {
    version: 1,
    scope,
    resource,
    saved_at: new Date().toISOString(),
    data,
  };
  try {
    await AsyncStorage.setItem(key(scope, resource), JSON.stringify(payload));
  } catch (error) {
    // La cache offline nunca debe convertir una lectura remota correcta en error.
    devWarn('Could not persist client resource cache.', error);
  }
  return payload;
}

export async function clearClientReadCache(scope: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = `${CACHE_PREFIX}${scope}:`;
    const matches = keys.filter((item) => item.startsWith(prefix));
    if (matches.length > 0) await AsyncStorage.multiRemove(matches);
  } catch (error) {
    // No bloquear logout por un fallo del almacenamiento local.
    devWarn('Could not clear client resource cache.', error);
  }
}

export function sanitizeProgramRowsForCache(rows: ProgramEnrollmentWithDetails[]): ProgramEnrollmentWithDetails[] {
  return rows.map((row) => ({
    ...row,
    enrollment: {
      ...row.enrollment,
      qr_token: '',
      notes: null,
    },
    profile: row.profile
      ? {
          ...row.profile,
          email: '',
          phone: null,
        }
      : null,
    attendances: row.attendances.map((attendance) => ({
      ...attendance,
      notes: null,
    })),
  }));
}

export function createMembershipOfflineSummary(membership: Membership | null): MembershipOfflineSummary {
  return {
    member_number: membership?.member_number ?? null,
    status: membership?.status ?? null,
    start_date: membership?.start_date ?? null,
    end_date: membership?.end_date ?? null,
    current_payment_status: membership?.current_payment_status ?? null,
    last_payment_at: membership?.last_payment_at ?? null,
    updated_at: membership?.updated_at ?? null,
  };
}

export function createPaymentOfflineSummary(overview: MyPaymentOverview): PaymentOfflineSummary {
  return {
    outstanding_total: overview.outstanding_total,
    attention_total: overview.attention_total,
    future_total: overview.future_total,
    overdue_count: overview.overdue_count,
    legacy_membership_pending: overview.legacy_membership_pending,
  };
}
