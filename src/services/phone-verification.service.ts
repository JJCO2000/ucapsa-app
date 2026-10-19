import { supabase } from '../lib/supabase';
import { phoneVerificationEnabled } from '../constants/phoneVerification';

export function normalizePhoneE164(input: string): string {
  const phone = input.trim().replace(/[ ()-]/g, '');
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
    throw new Error('Usa el formato internacional, por ejemplo +525512345678.');
  }
  return phone;
}

/** Solo la cuenta ya autenticada puede iniciar el cambio de teléfono. */
export async function requestVerifiedPhoneCode(rawPhone: string): Promise<string> {
  if (!phoneVerificationEnabled) {
    throw new Error('El envío de códigos SMS aún no está habilitado por UCAPSA.');
  }
  const phone = normalizePhoneE164(rawPhone);
  const { data: current, error: authError } = await supabase.auth.getUser();
  if (authError || !current.user) throw new Error('Inicia sesión para verificar tu celular.');
  // Al ser una RPC nueva, el tipo estará disponible tras aplicar la migración.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: 'can_request_my_phone_verification',
    args: { p_phone: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const checked = await rpc('can_request_my_phone_verification', { p_phone: phone });
  if (checked.error) throw new Error(checked.error.message);
  if (checked.data !== true) {
    throw new Error('Este celular está asociado a otra verificación. Solicita revisión a Administración.');
  }
  const { error } = await supabase.auth.updateUser({ phone });
  if (error) throw error;
  return phone;
}

/** El código SMS se comprueba contra Auth, jamás en tablas públicas. */
export async function confirmVerifiedPhoneCode(
  phone: string,
  token: string,
  expectedUserId: string,
): Promise<void> {
  if (!phoneVerificationEnabled) throw new Error('Verificación de celular no habilitada.');
  const verifiedPhone = normalizePhoneE164(phone);
  if (!/^\d{6}$/.test(token.trim())) throw new Error('Escribe el código de seis dígitos.');
  const before = await supabase.auth.getUser();
  if (before.error || before.data.user?.id !== expectedUserId) {
    throw new Error('La cuenta cambió antes de confirmar el celular. Inicia sesión nuevamente.');
  }
  const { error } = await supabase.auth.verifyOtp({
    phone: verifiedPhone,
    token: token.trim(),
    type: 'phone_change',
  });
  if (error) throw error;
  const after = await supabase.auth.getUser();
  if (after.error || after.data.user?.id !== expectedUserId ||
      after.data.user?.phone !== verifiedPhone ||
      !after.data.user.phone_confirmed_at) {
    throw new Error('La verificación no quedó asociada a esta cuenta. Solicita revisión; no se vincularon expedientes.');
  }
  // Actualiza los datos Auth usados por el listener de sesión y su intento
  // posterior de reclamar el expediente por teléfono confirmado.
  const refresh = await supabase.auth.refreshSession();
  if (refresh.error) throw refresh.error;
}
