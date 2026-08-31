export const DEFAULT_READ_TIMEOUT_MS = 6000;
// Usar solo en escrituras idempotentes o protegidas contra duplicados.
// Promise.race no cancela por sí mismo una solicitud ya enviada.
export const DEFAULT_WRITE_TIMEOUT_MS = 10000;

export function createOperationTimeoutError(label: string) {
  return new Error(`${label}_timeout`);
}

export async function withOperationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(createOperationTimeoutError(label)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function isOperationTimeoutError(error: unknown) {
  return error instanceof Error && /_timeout$/.test(error.message);
}

type ErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  name?: unknown;
};

export function getErrorMessage(error: unknown, fallback = 'Intenta de nuevo.') {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === 'object') {
    const value = error as ErrorLike;
    if (typeof value.message === 'string' && value.message.trim()) return value.message.trim();
    if (typeof value.details === 'string' && value.details.trim()) return value.details.trim();
  }
  return fallback;
}

export function isLikelyNetworkError(error: unknown) {
  if (isOperationTimeoutError(error)) return true;
  const message = getErrorMessage(error, '').toLowerCase();
  if (!message) return false;
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('network error') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('socket') ||
    message.includes('connection') ||
    message.includes('conexión') ||
    message.includes('offline') ||
    message.includes('internet')
  );
}

export function friendlyReadError(fallback: string) {
  return `${fallback} Revisa tu conexión e intenta de nuevo.`;
}

export function friendlyWriteError(error: unknown, fallback = 'Intenta de nuevo.') {
  if (isOperationTimeoutError(error)) {
    return 'La operación tardó demasiado. Revisa tu conexión antes de volver a intentarlo.';
  }
  return getErrorMessage(error, fallback);
}
