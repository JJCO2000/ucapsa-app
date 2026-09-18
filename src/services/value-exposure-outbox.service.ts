import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import {
  DEFAULT_WRITE_TIMEOUT_MS,
  withOperationTimeout,
} from '../utils/async.utils';

export type ValueExposureSurface = 'constancy_summary' | 'constancy_detail';

export type PendingValueExposure = {
  version: 1;
  id: string;
  userId: string;
  dogId: string;
  seasonId: string;
  surface: ValueExposureSurface;
  occurredAt: string;
};

export type ValueExposureSyncResult = {
  operationId: string;
  status: 'synced' | 'pending';
};

const VALUE_EXPOSURE_OUTBOX_PREFIX = 'ucapsa:value-exposure-outbox:v1:';
const mutationChains = new Map<string, Promise<unknown>>();
const syncInFlight = new Map<string, Promise<ValueExposureSyncResult>>();

function key(userId: string) {
  return `${VALUE_EXPOSURE_OUTBOX_PREFIX}${userId}`;
}

function createOperationId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function mexicoCityDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fallback estable si el runtime no expone timeZone/formatToParts.
  }

  return value.slice(0, 10);
}

function isValidOperation(value: unknown, userId: string): value is PendingValueExposure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<PendingValueExposure>;
  return Boolean(
    item.version === 1
    && item.userId === userId
    && typeof item.id === 'string'
    && typeof item.dogId === 'string'
    && typeof item.seasonId === 'string'
    && (item.surface === 'constancy_summary' || item.surface === 'constancy_detail')
    && typeof item.occurredAt === 'string',
  );
}

export async function getPendingValueExposures(userId: string): Promise<PendingValueExposure[]> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => isValidOperation(item, userId));
  } catch {
    return [];
  }
}

async function writeOutbox(userId: string, items: PendingValueExposure[]) {
  if (items.length === 0) {
    await AsyncStorage.removeItem(key(userId));
    return;
  }
  await AsyncStorage.setItem(key(userId), JSON.stringify(items));
}

function serializeMutation<T>(userId: string, mutation: () => Promise<T>): Promise<T> {
  const previous = mutationChains.get(userId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(mutation);
  mutationChains.set(userId, current);
  current.finally(() => {
    if (mutationChains.get(userId) === current) mutationChains.delete(userId);
  });
  return current;
}

async function discardValueExposure(userId: string, operationId: string) {
  await serializeMutation(userId, async () => {
    const current = await getPendingValueExposures(userId);
    await writeOutbox(userId, current.filter((item) => item.id !== operationId));
  });
}

export async function clearValueExposureOutbox(userId: string): Promise<void> {
  await serializeMutation(userId, async () => {
    try {
      await AsyncStorage.removeItem(key(userId));
    } catch {
      // No bloquear logout por un fallo local de telemetría.
    }
  });
}

export async function queueValueExposure(input: {
  userId: string;
  dogId: string;
  seasonId: string;
  surface: ValueExposureSurface;
  occurredAt?: string;
}): Promise<PendingValueExposure> {
  return serializeMutation(input.userId, async () => {
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const current = await getPendingValueExposures(input.userId);
    const day = mexicoCityDateKey(occurredAt);

    const existing = current.find((item) => (
      item.dogId === input.dogId
      && item.seasonId === input.seasonId
      && item.surface === input.surface
      && mexicoCityDateKey(item.occurredAt) === day
    ));
    if (existing) return existing;

    const operation: PendingValueExposure = {
      version: 1,
      id: createOperationId(),
      userId: input.userId,
      dogId: input.dogId,
      seasonId: input.seasonId,
      surface: input.surface,
      occurredAt,
    };

    await writeOutbox(input.userId, [...current, operation]);
    return operation;
  });
}

async function syncOnce(operation: PendingValueExposure): Promise<ValueExposureSyncResult> {
  try {
    const response = await withOperationTimeout(
      supabase.rpc('record_ucapsa_value_exposure', {
        p_dog_id: operation.dogId,
        p_season_id: operation.seasonId,
        p_surface: operation.surface,
        p_occurred_at: operation.occurredAt,
      }),
      DEFAULT_WRITE_TIMEOUT_MS,
      'value-exposure-outbox',
    );

    if (response.error) throw response.error;
    await discardValueExposure(operation.userId, operation.id);
    return { operationId: operation.id, status: 'synced' };
  } catch {
    return { operationId: operation.id, status: 'pending' };
  }
}

function syncOperation(operation: PendingValueExposure): Promise<ValueExposureSyncResult> {
  const operationKey = `${operation.userId}:${operation.id}`;
  const inFlight = syncInFlight.get(operationKey);
  if (inFlight) return inFlight;

  const current = syncOnce(operation);
  syncInFlight.set(operationKey, current);
  current.finally(() => {
    if (syncInFlight.get(operationKey) === current) syncInFlight.delete(operationKey);
  });
  return current;
}

export async function recordValueExposureDurably(input: {
  userId: string;
  dogId: string;
  seasonId: string;
  surface: ValueExposureSurface;
  occurredAt?: string;
}): Promise<ValueExposureSyncResult> {
  const operation = await queueValueExposure(input);
  return syncOperation(operation);
}

export async function flushPendingValueExposures(userId: string): Promise<{
  synced: number;
  pending: number;
}> {
  const current = await getPendingValueExposures(userId);
  let synced = 0;

  for (const operation of current) {
    const result = await syncOperation(operation);
    if (result.status === 'synced') {
      synced += 1;
      continue;
    }
    break;
  }

  return {
    synced,
    pending: (await getPendingValueExposures(userId)).length,
  };
}
