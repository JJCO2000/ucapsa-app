import AsyncStorage from '@react-native-async-storage/async-storage';

export type ValidatedQueueReadMode = 'tolerant' | 'strict';

function localStorageError(label: string, detail: string) {
  return new Error(`${label}: ${detail}`);
}

export async function readValidatedAsyncStorageQueue<T>(input: {
  storageKey: string;
  label: string;
  isValid: (value: unknown) => value is T;
  mode: ValidatedQueueReadMode;
}): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(input.storageKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      if (input.mode === 'strict') {
        throw localStorageError(input.label, 'la cola local tiene un formato no reconocido y no se sobrescribirá.');
      }
      return [];
    }

    const valid = parsed.filter(input.isValid);
    if (input.mode === 'strict' && valid.length !== parsed.length) {
      throw localStorageError(input.label, 'la cola local contiene operaciones no reconocidas y no se sobrescribirá.');
    }

    return valid;
  } catch (error) {
    if (input.mode === 'strict') {
      if (error instanceof Error && error.message.startsWith(`${input.label}:`)) throw error;
      const detail = error instanceof Error ? error.message : 'falló la lectura del almacenamiento local.';
      throw localStorageError(input.label, `no se pudo leer la cola local: ${detail}`);
    }
    return [];
  }
}
