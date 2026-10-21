import { supabase } from '../lib/supabase';

/** Estado administrativo; nunca identifica a un usuario ante el cliente público. */
export type AdminPhoneAccessStatus = 'ready' | 'already_active' | 'conflict' | 'missing' | 'invalid' | 'different_auth_phone';

export type AdminPhoneAccessResult = {
  status: AdminPhoneAccessStatus | 'enabled';
  phone: string | null;
};

async function invokePhoneAccess(body: Record<string, unknown>): Promise<AdminPhoneAccessResult> {
  const { data, error } = await supabase.functions.invoke('admin-bind-phone', { body });
  if (error) throw new Error('No fue posible consultar el acceso por celular. Verifica tu conexión o consulta a Superadmin.');
  const status = (data as AdminPhoneAccessResult | null)?.status;
  if (!['ready', 'already_active', 'conflict', 'missing', 'invalid', 'different_auth_phone', 'enabled'].includes(String(status))) {
    throw new Error('Supabase devolvió un estado inesperado. No se realizó ninguna autorización.');
  }
  return { status: status as AdminPhoneAccessResult['status'], phone: typeof data?.phone === 'string' ? data.phone : null };
}

export function getAdminPhoneAccessStatus(userId: string): Promise<AdminPhoneAccessResult> {
  return invokePhoneAccess({ action: 'status', userId });
}

/** Una llamada real y verificación presencial/administrativa preceden al acto. */
export function approveAdminPhoneAccess(userId: string, proofNote: string): Promise<AdminPhoneAccessResult> {
  const note = proofNote.trim();
  if (note.length < 20 || note.length > 300) {
    throw new Error('Describe la comprobación de identidad (20–300 caracteres), sin datos personales adicionales.');
  }
  return invokePhoneAccess({ action: 'approve', userId, verifiedByOutboundCall: true, proofNote: note });
}
