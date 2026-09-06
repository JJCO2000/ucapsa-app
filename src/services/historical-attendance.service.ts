import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import type { ProgramCode } from '../types/app.types';
import type { RegisterAttendanceFromQrResult } from './programs.service';

export type HistoricalAttendanceCandidate = {
  attendance_date: string;
  schedule_id: string;
  program_code: ProgramCode;
  program_name: string;
  schedule_name: string;
  scheduled_start_time: string;
};

export type SavedAttendanceQr = {
  programCode: ProgramCode;
  token: string;
  scannedAt: string;
};

type SavedAttendanceQrPayload = {
  version: 1;
  userId: string;
  items: SavedAttendanceQr[];
};

const SAVED_QR_PREFIX = 'ucapsa:attendance-qr-saved:v1:';

function storageKey(userId: string) {
  return `${SAVED_QR_PREFIX}${userId}`;
}

function isProgramCode(value: unknown): value is ProgramCode {
  return value === 'puppy' || value === 'comandos';
}

export async function getSavedAttendanceQrs(userId: string): Promise<SavedAttendanceQr[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<SavedAttendanceQrPayload>;
    if (parsed.version !== 1 || parsed.userId !== userId || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter((item): item is SavedAttendanceQr => (
      Boolean(item)
      && isProgramCode(item.programCode)
      && typeof item.token === 'string'
      && item.token.trim().length > 0
      && typeof item.scannedAt === 'string'
    ));
  } catch {
    return [];
  }
}

export async function saveAttendanceQrForLater(userId: string, programCode: ProgramCode, token: string): Promise<void> {
  const cleanToken = token.trim();
  if (!cleanToken) return;
  const current = await getSavedAttendanceQrs(userId);
  const next: SavedAttendanceQr[] = [
    { programCode, token: cleanToken, scannedAt: new Date().toISOString() },
    ...current.filter((item) => item.programCode !== programCode),
  ];
  const payload: SavedAttendanceQrPayload = { version: 1, userId, items: next };
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(payload));
}

export async function clearSavedAttendanceQr(userId: string, programCode: ProgramCode): Promise<void> {
  const current = await getSavedAttendanceQrs(userId);
  const next = current.filter((item) => item.programCode !== programCode);
  if (next.length === 0) {
    await AsyncStorage.removeItem(storageKey(userId));
    return;
  }
  const payload: SavedAttendanceQrPayload = { version: 1, userId, items: next };
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(payload));
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  // Estas RPC ya existen en el esquema remoto. El cast se elimina en la siguiente
  // regeneracion de database.generated.ts contra Supabase.
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as unknown as T;
}

export async function getMyHistoricalAttendanceDates(enrollmentId: string, limit = 12): Promise<HistoricalAttendanceCandidate[]> {
  const cleanEnrollmentId = enrollmentId.trim();
  if (!cleanEnrollmentId) return [];
  const rows = await rpc<HistoricalAttendanceCandidate[]>('get_my_program_attendance_backfill_dates', {
    p_enrollment_id: cleanEnrollmentId,
    p_limit: Math.max(1, Math.min(20, Math.floor(limit))),
  });
  return Array.isArray(rows) ? rows : [];
}

export async function registerMyHistoricalAttendanceFromQr(input: {
  token: string;
  enrollmentId: string;
  attendanceDate: string;
}): Promise<RegisterAttendanceFromQrResult> {
  const rows = await rpc<RegisterAttendanceFromQrResult[]>('register_program_attendance_from_qr_for_date', {
    p_qr_token: input.token.trim(),
    p_enrollment_id: input.enrollmentId,
    p_attendance_date: input.attendanceDate,
  });
  const first = Array.isArray(rows) ? rows[0] : null;
  if (!first) throw new Error('Supabase no devolvio resultado del registro historico.');
  return first;
}
