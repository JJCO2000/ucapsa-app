import { supabase } from '../lib/supabase';

type PhoneActivationResult = {
  activated: true;
  alreadyActive: boolean;
  auditPending?: boolean;
};

/** Only Superadmin can request this; the Edge Function enforces role and collisions. */
export async function activateCustomerPhoneLogin(targetUserId: string): Promise<PhoneActivationResult> {
  if (!targetUserId.trim()) throw new Error('Selecciona un cliente.');
  const { data, error } = await supabase.functions.invoke('admin-activate-phone-login', {
    body: { targetUserId: targetUserId.trim(), confirmedByStaff: true },
  });
  if (error) {
    const response = error.context as Response | undefined;
    if (response && typeof response.json === 'function') {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object' && 'error' in payload &&
        typeof (payload as { error: unknown }).error === 'string') {
        throw new Error((payload as { error: string }).error);
      }
    }
    throw new Error('No se pudo habilitar el celular. Revisa la autorización o conexión.');
  }
  if (!data || data.activated !== true || typeof data.alreadyActive !== 'boolean') {
    throw new Error('Supabase no confirmó la habilitación del acceso telefónico.');
  }
  return data as PhoneActivationResult;
}
