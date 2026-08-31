import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  Announcement,
  EventOccurrence,
  MembershipStatus,
  ProgramCode,
  ProgramEnrollmentStatus,
  ProgramSchedule,
} from '../types/app.types';

export type HomeProgramSummary = {
  enrollment_id: string;
  enrollment_status: ProgramEnrollmentStatus;
  program_code: ProgramCode;
  program_name?: string;
  required_attendances?: number;
  attendances_count?: number;
  dog_id?: string | null;
  dog_name?: string | null;
  schedule: ProgramSchedule;
};

export type HomePracticeSummary = {
  week_start: string;
  counts: Array<{ enrollment_id: string | null; dog_id: string | null; count: number }>;
};

export type HomePaymentSummary = {
  attention_total: number;
  legacy_membership_pending: boolean;
};

export type HomeCacheSource<T> = {
  saved_at: string;
  data: T;
};

export type HomeReadCache = {
  version: 1;
  scope: string;
  announcements?: HomeCacheSource<Announcement[]>;
  events?: HomeCacheSource<EventOccurrence[]>;
  membership_status?: HomeCacheSource<MembershipStatus | null>;
  programs?: HomeCacheSource<HomeProgramSummary[]>;
  payments?: HomeCacheSource<HomePaymentSummary>;
  practice?: HomeCacheSource<HomePracticeSummary>;
};

export type HomeCacheUpdates = Partial<
  Pick<HomeReadCache, 'announcements' | 'events' | 'membership_status' | 'programs' | 'payments' | 'practice'>
>;

const HOME_CACHE_PREFIX = 'ucapsa:home:v1:';

function homeCacheKey(scope: string) {
  return `${HOME_CACHE_PREFIX}${scope}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSource(value: unknown): value is HomeCacheSource<unknown> {
  if (!isObject(value)) return false;
  return typeof value.saved_at === 'string' && Object.prototype.hasOwnProperty.call(value, 'data');
}

function isValidCache(value: unknown, scope: string): value is HomeReadCache {
  if (!isObject(value) || value.version !== 1 || value.scope !== scope) return false;

  const sourceKeys: Array<keyof HomeCacheUpdates> = [
    'announcements',
    'events',
    'membership_status',
    'programs',
    'payments',
    'practice',
  ];

  return sourceKeys.every((key) => value[key] === undefined || isSource(value[key]));
}

export function createHomeCacheSource<T>(data: T): HomeCacheSource<T> {
  return {
    saved_at: new Date().toISOString(),
    data,
  };
}

export async function readHomeCache(scope: string): Promise<HomeReadCache | null> {
  try {
    const raw = await AsyncStorage.getItem(homeCacheKey(scope));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isValidCache(parsed, scope)) {
      await AsyncStorage.removeItem(homeCacheKey(scope));
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function mergeHomeCache(scope: string, updates: HomeCacheUpdates): Promise<HomeReadCache> {
  const previous = await readHomeCache(scope);
  const next: HomeReadCache = {
    version: 1,
    scope,
    ...(previous ?? {}),
    ...updates,
  };

  try {
    await AsyncStorage.setItem(homeCacheKey(scope), JSON.stringify(next));
  } catch {
    // La cache offline es una mejora. Nunca debe convertir una lectura remota correcta en error.
  }

  return next;
}

export async function clearHomeCache(scope: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(homeCacheKey(scope));
  } catch {
    // No bloquear logout ni otros flujos por un fallo del almacenamiento local.
  }
}
