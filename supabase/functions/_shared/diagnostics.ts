type SafeDiagnostic = string | number | boolean | null | Record<string, string | number | boolean | null>;

const SAFE_KEYS = new Set([
  'name',
  'message',
  'code',
  'status',
  'statusCode',
  'id',
  'token_id',
]);

function trim(value: string) {
  return value.slice(0, 500);
}

export function sanitizeEdgeDiagnostic(value: unknown): SafeDiagnostic {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return trim(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (value instanceof Error) {
    return {
      name: trim(value.name || 'Error'),
      message: trim(value.message || 'Unknown error'),
    };
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const safe: Record<string, string | number | boolean | null> = {};
    for (const [key, item] of Object.entries(source)) {
      if (!SAFE_KEYS.has(key)) continue;
      if (item === null || typeof item === 'number' || typeof item === 'boolean') {
        safe[key] = item;
      } else if (typeof item === 'string') {
        safe[key] = trim(item);
      }
    }
    return safe;
  }

  return trim(String(value));
}

export function edgeWarn(event: string, details?: unknown) {
  console.warn(trim(event), sanitizeEdgeDiagnostic(details));
}

export function edgeError(event: string, details?: unknown) {
  console.error(trim(event), sanitizeEdgeDiagnostic(details));
}
