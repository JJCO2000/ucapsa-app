type DiagnosticError = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
};

function summarizeError(error: unknown) {
  if (error == null) return null;

  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message,
    };
  }

  if (typeof error === 'object') {
    const details = error as DiagnosticError;
    return {
      name: typeof details.name === 'string' ? details.name : null,
      code: typeof details.code === 'string' ? details.code : null,
      message: typeof details.message === 'string' ? details.message : 'Unknown error',
    };
  }

  return { message: String(error) };
}

export function devWarn(message: string, error?: unknown) {
  if (!__DEV__) return;

  if (arguments.length < 2) {
    console.warn(message);
    return;
  }

  console.warn(message, summarizeError(error));
}

export function devLog(message: string, details?: unknown) {
  if (!__DEV__) return;

  if (arguments.length < 2) {
    console.log(message);
    return;
  }

  console.log(message, details);
}
