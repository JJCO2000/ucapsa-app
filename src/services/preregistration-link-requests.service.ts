import { supabase } from '../lib/supabase';

type RpcResponse = { data: unknown; error: { message: string } | null };
const rpc = supabase.rpc.bind(supabase) as unknown as
  (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResponse>;

export type LinkReviewRequest = {
  id: string;
  personId: string;
  ownerName: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string;
  dogCount: number;
  requestedAt: string;
};

export async function requestMyPreregistrationLinkReview():
  Promise<'requested' | 'already_resolved' | 'none' | 'conflict' | 'no_contact'> {
  const { data, error } = await rpc('request_my_preregistration_link_review');
  if (error) throw new Error(error.message);
  const status = (data as { status?: unknown } | null)?.status;
  if (status !== 'requested' && status !== 'already_resolved' &&
      status !== 'none' && status !== 'conflict' && status !== 'no_contact') {
    throw new Error('Respuesta inesperada del servidor.');
  }
  return status;
}

export async function getAdminPreregistrationLinkRequests(): Promise<LinkReviewRequest[]> {
  const { data, error } = await rpc('admin_list_preregistration_link_requests');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('Respuesta administrativa inválida.');
  return data.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Solicitud administrativa inválida.');
    }
    const r = raw as Record<string, unknown>;
    for (const name of ['id','person_id','owner_name','requester_user_id','requested_at']) {
      if (typeof r[name] !== 'string') throw new Error('Solicitud incompleta.');
    }
    if (!Number.isSafeInteger(r.dog_count) || Number(r.dog_count) < 0) {
      throw new Error('Conteo de perros inválido.');
    }
    return {
      id: r.id as string,
      personId: r.person_id as string,
      ownerName: r.owner_name as string,
      requesterUserId: r.requester_user_id as string,
      requesterName: typeof r.requester_name === 'string' ? r.requester_name : '',
      requesterEmail: typeof r.requester_email === 'string' ? r.requester_email : '',
      dogCount: r.dog_count as number,
      requestedAt: r.requested_at as string,
    };
  });
}

export async function closeAdminPreregistrationLinkRequest(
  requestId: string, decision: 'reviewed' | 'rejected',
): Promise<void> {
  const { data, error } = await rpc('admin_close_preregistration_link_request', {
    p_request_id: requestId, p_decision: decision,
  });
  if (error) throw new Error(error.message);
  if ((data as { status?: unknown } | null)?.status !== decision) {
    throw new Error('El servidor no confirmó la resolución.');
  }
}
