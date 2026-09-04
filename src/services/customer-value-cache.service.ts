import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CustomerValueSnapshot } from './customer-value.service';

type CustomerValueCachePayload = {
  version: 1;
  user_id: string;
  saved_at: string;
  snapshot: CustomerValueSnapshot;
};

const CUSTOMER_VALUE_CACHE_PREFIX = 'ucapsa:customer-value:v1:';

function cacheKey(userId: string) {
  return `${CUSTOMER_VALUE_CACHE_PREFIX}${userId}`;
}

function isCachePayload(value: unknown, userId: string): value is CustomerValueCachePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CustomerValueCachePayload>;
  return Boolean(
    candidate.version === 1 &&
    candidate.user_id === userId &&
    typeof candidate.saved_at === 'string' &&
    candidate.snapshot &&
    candidate.snapshot.version === 1 &&
    candidate.snapshot.userId === userId,
  );
}

export async function readCustomerValueSnapshotCache(
  userId: string,
): Promise<{ savedAt: string; snapshot: CustomerValueSnapshot } | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isCachePayload(parsed, userId)) {
      await AsyncStorage.removeItem(cacheKey(userId));
      return null;
    }

    return {
      savedAt: parsed.saved_at,
      snapshot: parsed.snapshot,
    };
  } catch {
    return null;
  }
}

export async function writeCustomerValueSnapshotCache(snapshot: CustomerValueSnapshot): Promise<void> {
  const payload: CustomerValueCachePayload = {
    version: 1,
    user_id: snapshot.userId,
    saved_at: new Date().toISOString(),
    snapshot,
  };

  try {
    await AsyncStorage.setItem(cacheKey(snapshot.userId), JSON.stringify(payload));
  } catch {
    // La cache local es una mejora. Nunca convierte una lectura correcta en error.
  }
}

export async function clearCustomerValueSnapshotCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey(userId));
  } catch {
    // No bloquear logout ni otros flujos por un fallo de almacenamiento local.
  }
}
