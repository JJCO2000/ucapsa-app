type DiagnosticObject = {
  name?: unknown;
  code?: unknown;
  message?: unknown;
};

function clip(value: string) {
  return value.length > 320 ? value.slice(0, 317) + '...' : value;
}

function sanitizeDiagnostic(detail: unknown): unknown {
  if (detail === null || detail === undefined) return null;
  if (typeof detail === 'string') return clip(detail);
  if (typeof detail === 'number' || typeof detail === 'boolean') return detail;

  if (detail instanceof Error) {
    return {
      name: clip(detail.name || 'Error'),
      message: clip(detail.message || 'Unknown error'),
    };
  }

  if (typeof detail === 'object') {
    const source = detail as DiagnosticObject;
    const safe: Record<string, string> = {};
    if (typeof source.name === 'string' && source.name) safe.name = clip(source.name);
    if (typeof source.code === 'string' && source.code) safe.code = clip(source.code);
    if (typeof source.message === 'string' && source.message) safe.message = clip(source.message);
    return Object.keys(safe).length > 0 ? safe : { type: 'opaque_error' };
  }

  return { type: typeof detail };
}

export function edgeWarn(event: string, detail?: unknown) {
  const safeEvent = clip(event);
  if (detail === undefined) console.warn(safeEvent);
  else console.warn(safeEvent, sanitizeDiagnostic(detail));
}

export function edgeError(event: string, detail?: unknown) {
  const safeEvent = clip(event);
  if (detail === undefined) console.error(safeEvent);
  else console.error(safeEvent, sanitizeDiagnostic(detail));
}
