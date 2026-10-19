import { supabase } from '../lib/supabase';

export type ManualLinkStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'claimed';
export type AdminManualLinkRequest = {
  requestId: string;
  userId: string;
  accountName: string | null;
  accountEmail: string | null;
  accountPhone: string | null;
  ownerName: string | null;
  dogNames: string | null;
  requestedPhone: string | null;
  requestedEmail: string | null;
  status: 'pending';
  requestedAt: string;
};

type RpcAnswer = { data: unknown; error: { message: string } | null };
async function callManualRpc(name: string, params?: Record<string, unknown>): Promise<unknown> {
  // Keep undeployed RPC names isolated from generated Supabase types.
  const rpc = supabase.rpc.bind(supabase) as unknown as
    (functionName: string, args?: Record<string, unknown>) => PromiseLike<RpcAnswer>;
  const { data, error } = await rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}

export async function requestManualPreregistrationLink(): Promise<void> {
  const result = await callManualRpc('request_my_preregistration_link');
  if (result !== 'pending') throw new Error('La solicitud no fue confirmada.');
}
export async function getMyManualPreregistrationStatus(): Promise<ManualLinkStatus> {
  const result = await callManualRpc('get_my_preregistration_link_status');
  if (!['none','pending','approved','rejected','claimed'].includes(String(result))) {
    throw new Error('Estado de vinculación inesperado.');
  }
  return result as ManualLinkStatus;
}
export async function getAdminManualLinkRequests(): Promise<AdminManualLinkRequest[]> {
  const data = await callManualRpc('admin_get_preregistration_link_requests');
  if (!Array.isArray(data)) throw new Error('El directorio no respondió.');
  return data.map((raw: unknown): AdminManualLinkRequest => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Solicitud inválida.');
    const row = raw as Record<string, unknown>;
    if (typeof row.request_id !== 'string' || typeof row.account_user_id !== 'string'
      || row.request_status !== 'pending' || typeof row.requested_at !== 'string') {
      throw new Error('Datos de aprobación incompletos.');
    }
    const optional = (val: unknown) => typeof val === 'string' ? val : null;
    return {
      requestId: row.request_id, userId: row.account_user_id,
      accountName: optional(row.account_name), accountEmail: optional(row.account_email),
      accountPhone: optional(row.account_phone), ownerName: optional(row.owner_name),
      dogNames: optional(row.dog_names), requestedPhone: optional(row.requested_phone),
      requestedEmail: optional(row.requested_email), status: 'pending',
      requestedAt: row.requested_at,
    };
  });
}
export async function reviewAdminManualLink(requestId: string, approve: boolean, proofNote: string) {
  const result = await callManualRpc('admin_review_preregistration_link', {
    p_request_id: requestId, p_approve: approve, p_proof_note: proofNote.trim(),
  });
  if (result !== (approve ? 'approved' : 'rejected')) throw new Error('No se confirmó la revisión.');
}
