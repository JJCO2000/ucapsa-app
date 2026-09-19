import { supabase } from '../lib/supabase';
import type { TableUpdate } from '../types/database.helpers';
import type { PaymentSettings } from '../types/app.types';

export type UpdatePaymentSettingsInput = {
  bankName?: string | null;
  accountHolder?: string | null;
  clabe?: string | null;
  transferInstructions?: string | null;
  clipUrl?: string | null;
  isActive?: boolean;
};

export function normalizeClabe(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '');
}

export function isValidClabe(value: string | null | undefined) {
  return normalizeClabe(value).length === 18;
}

export function isValidPaymentLink(value: string | null | undefined) {
  const candidate = String(value ?? '').trim();
  if (!candidate) return false;

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export async function getPaymentSettings(): Promise<PaymentSettings | null> {
  const { data, error } = await supabase
    .from('payment_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  return (data as PaymentSettings | null) ?? null;
}

export async function updatePaymentSettings(
  input: UpdatePaymentSettingsInput,
): Promise<PaymentSettings> {
  const normalizedClabe = normalizeClabe(input.clabe);
  const clabe = normalizedClabe || null;
  const clipUrl = input.clipUrl?.trim() || null;

  if (clabe && !isValidClabe(clabe)) {
    throw new Error('La CLABE debe tener exactamente 18 digitos.');
  }
  if (clipUrl && !isValidPaymentLink(clipUrl)) {
    throw new Error('El enlace de pago debe usar HTTPS y tener un dominio válido.');
  }

  const payload: Record<string, unknown> = {};
  if ('bankName' in input) payload.bank_name = input.bankName?.trim() || null;
  if ('accountHolder' in input) payload.account_holder = input.accountHolder?.trim() || null;
  if ('clabe' in input) payload.clabe = clabe;
  if ('transferInstructions' in input) {
    payload.transfer_instructions = input.transferInstructions?.trim() || null;
  }
  if ('clipUrl' in input) payload.clip_url = clipUrl;
  if ('isActive' in input) payload.is_active = Boolean(input.isActive);

  const { data, error } = await supabase
    .from('payment_settings')
    .update(payload as TableUpdate<'payment_settings'>)
    .eq('id', 1)
    .select('*')
    .single();

  if (error) throw error;
  return data as PaymentSettings;
}
