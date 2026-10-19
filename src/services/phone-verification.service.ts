import { phoneOtpEnabled } from '../constants/preregistrationFeature';
import { supabase } from '../lib/supabase';

export function normalizeVerificationPhone(input: string): string {
  const result = input.trim().replace(/[\s()\-]/g, '');
  if (!/^\+[1-9][0-9]{7,14}$/.test(result)) {
    throw new Error('Escribe el celular en formato internacional, por ejemplo +525512345678.');
  }
  return result;
}

/**
 * El perfil de UCAPSA no confirma propiedad del celular. Únicamente Auth
 * phone_confirmed_at, tras un OTP del proveedor, puede habilitar una
 * vinculación automática. No crear otro Auth user con signInWithOtp:
 * aquí siempre se asocia el teléfono a la cuenta que ya inició sesión.
 */
export async function requestPhoneVerification(phoneText: string, expectedUserId: string) {
  if (!phoneOtpEnabled) throw new Error('La verificación SMS aún no está habilitada.');
  const phone = normalizeVerificationPhone(phoneText);
  const { data: current, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!current.user || current.user.id !== expectedUserId) {
    throw new Error('La cuenta cambió. Vuelve a iniciar sesión.');
  }
  if (current.user.phone === phone && current.user.phone_confirmed_at) {
    return { phone, alreadyVerified: true };
  }
  const { error } = await supabase.auth.updateUser({ phone });
  if (error) throw error;
  return { phone, alreadyVerified: false };
}

export async function confirmPhoneVerification(
  phoneText: string, code: string, expectedUserId: string,
) {
  if (!phoneOtpEnabled) throw new Error('La verificación SMS aún no está habilitada.');
  const phone = normalizeVerificationPhone(phoneText);
  const token = code.trim();
  if (!/^\d{6}$/.test(token)) throw new Error('Introduce los seis dígitos del SMS.');

  const { data: before, error: beforeError } = await supabase.auth.getUser();
  if (beforeError) throw beforeError;
  if (before.user?.id !== expectedUserId) {
    throw new Error('La cuenta cambió. No se verificó el celular.');
  }
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'phone_change' });
  if (error) throw error;

  // Consultar Auth de servidor, no inferir verificación desde el código enviado.
  const { data: after, error: afterError } = await supabase.auth.getUser();
  if (afterError) throw afterError;
  if (after.user?.id !== expectedUserId ||
    after.user.phone !== phone || !after.user.phone_confirmed_at) {
    throw new Error('Supabase aún no confirmó este celular en tu cuenta.');
  }
  return after.user;
}
