import { supabase } from '../lib/supabase';
import type { TableRow } from '../types/database.helpers';

export type AccountDeletionRequest = TableRow<'account_deletion_requests'>;
export type AccountDeletionStatus = 'pending' | 'in_review' | 'blocked' | 'rejected' | 'completed';

const OPEN_STATUSES: AccountDeletionStatus[] = ['pending', 'in_review', 'blocked'];

export function isAccountDeletionOpen(request: AccountDeletionRequest | null | undefined) {
  return Boolean(request && OPEN_STATUSES.includes(request.status as AccountDeletionStatus));
}

export function getAccountDeletionStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'pending':
      return 'Pendiente de revisión';
    case 'in_review':
      return 'En revisión';
    case 'blocked':
      return 'Datos bloqueados';
    case 'rejected':
      return 'No procedente';
    case 'completed':
      return 'Atendida';
    default:
      return 'Sin solicitud';
  }
}

export async function getMyAccountDeletionRequest(): Promise<AccountDeletionRequest | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('*')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function requestMyAccountDeletion(reason?: string): Promise<AccountDeletionRequest> {
  const { data, error } = await supabase.rpc('request_my_account_deletion', {
    p_reason: reason?.trim() || undefined,
  });
  if (error) throw error;
  if (!data) throw new Error('Supabase no devolvió la solicitud de eliminación.');
  return data;
}

export async function getOpenAccountDeletionRequests(): Promise<AccountDeletionRequest[]> {
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('*')
    .in('status', OPEN_STATUSES)
    .order('requested_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function updateAccountDeletionRequest(input: {
  requestId: string;
  status: Exclude<AccountDeletionStatus, 'pending'>;
  resolutionNote?: string | null;
  retentionUntil?: string | null;
}): Promise<AccountDeletionRequest> {
  const { data, error } = await supabase.rpc('admin_update_account_deletion_request', {
    p_request_id: input.requestId,
    p_status: input.status,
    p_resolution_note: input.resolutionNote?.trim() || undefined,
    p_retention_until: input.retentionUntil || undefined,
  });

  if (error) throw error;
  if (!data) throw new Error('Supabase no devolvió la solicitud actualizada.');
  return data;
}
