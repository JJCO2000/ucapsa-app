type DiagnosticShape = {
  name?: string;
  message?: string;
  code?: string;
};

function sanitizeDiagnostic(detail: unknown): DiagnosticShape | string | number | boolean | null {
  if (detail == null) return null;
  if (typeof detail === 'string' || typeof detail === 'number' || typeof detail === 'boolean') {
    return detail;
  }
  if (detail instanceof Error) {
    return {
      name: detail.name,
      message: detail.message,
    };
  }
  if (typeof detail === 'object') {
    const candidate = detail as { name?: unknown; message?: unknown; code?: unknown };
    const sanitized: DiagnosticShape = {};
    if (typeof candidate.name === 'string') sanitized.name = candidate.name;
    if (typeof candidate.message === 'string') sanitized.message = candidate.message;
    if (typeof candidate.code === 'string') sanitized.code = candidate.code;
    return Object.keys(sanitized).length > 0 ? sanitized : 'non-serializable diagnostic';
  }
  return String(detail);
}

export function devWarn(message: string, detail?: unknown) {
  if (!__DEV__) return;
  if (detail === undefined) {
    console.warn(`[UCAPSA] ${message}`);
    return;
  }
  console.warn(`[UCAPSA] ${message}`, sanitizeDiagnostic(detail));
}
