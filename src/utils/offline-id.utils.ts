import Constants from 'expo-constants';

let lastTimestamp = 0;
let sequence = 0;

function hash128(input: string): [number, number, number, number] {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  let h3 = 0xc0decafe ^ input.length;
  let h4 = 0x9e3779b9 ^ input.length;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
    h3 = Math.imul(h3 ^ code, 2246822507);
    h4 = Math.imul(h4 ^ code, 3266489909);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function toHex32(value: number) {
  return value.toString(16).padStart(8, '0');
}

/**
 * Builds a collision-resistant UUID-shaped id for offline idempotency.
 *
 * This is not a secret/token generator. Uniqueness comes from Expo's per-session
 * Constants.sessionId, the current millisecond and a monotonic in-process
 * sequence. The 128-bit hash only encodes that unique material into PostgreSQL's
 * UUID shape without depending on Math.random().
 */
export function createOfflineUuid(scope: string) {
  const now = Date.now();
  if (now === lastTimestamp) {
    sequence += 1;
  } else {
    lastTimestamp = now;
    sequence = 0;
  }

  const material = `${Constants.sessionId}:${scope}:${now}:${sequence}`;
  const chars = hash128(material).map(toHex32).join('').split('');

  // UUID v8 marks application-defined bits while preserving the RFC variant.
  chars[12] = '8';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);

  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
