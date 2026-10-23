import { supabase } from '../lib/supabase';

type RpcResult = { data: unknown; error: { message: string } | null };
const rpc = supabase.rpc.bind(supabase) as unknown as
  (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('No pudimos consultar la información familiar.');
  }
  return value as Record<string, unknown>;
}
async function call(name: string, args?: Record<string, unknown>) {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export type FamilyAccountPreview = {
  status: 'head_not_linked'|'already_requested'|'no_account'|'conflict'|'available';
  accountName: string;
};
export type FamilyAccountLink = {
  id: string;
  otherName: string;
  myRole: 'titular'|'familiar';
  myAccepted: boolean;
  otherAccepted: boolean;
  active: boolean;
};
export type FamilyProgress = {
  ownerName: string;
  dogName: string;
  programName: string | null;
  programLevel: string | null;
  attendancesCount: number | null;
};

export async function previewAdminFamilyAccount(memberId: string): Promise<FamilyAccountPreview> {
  const data = object(await call('admin_preview_family_account', {
    p_family_member_id: memberId,
  }));
  const status = data.status;
  if (!['head_not_linked','already_requested','no_account','conflict','available'].includes(String(status))) {
    throw new Error('No se pudo revisar la cuenta del familiar.');
  }
  return { status: status as FamilyAccountPreview['status'],
    accountName: typeof data.account_name === 'string' ? data.account_name : '' };
}

export async function authorizeAdminFamilyAccount(memberId: string, reason: string): Promise<void> {
  const data = object(await call('admin_authorize_family_account', {
    p_family_member_id: memberId, p_verification_note: reason.trim(),
  }));
  if (data.status !== 'pending_acceptance') throw new Error('No se confirmó la autorización.');
}

export async function revokeAdminFamilyAccount(memberId: string, reason: string): Promise<void> {
  const data = object(await call('admin_revoke_family_account', {
    p_family_member_id: memberId, p_reason: reason.trim(),
  }));
  if (data.status !== 'revoked') throw new Error('No se confirmó la revocación.');
}

export async function getMyFamilyAccountLinks(): Promise<FamilyAccountLink[]> {
  const result = await call('get_my_family_account_links');
  if (!Array.isArray(result)) throw new Error('No se pudo leer tu familia.');
  return result.map((entry) => {
    const r = object(entry);
    if (typeof r.id !== 'string' || typeof r.other_name !== 'string'
      || !['titular','familiar'].includes(String(r.my_role))) {
      throw new Error('La información de un vínculo familiar es inválida.');
    }
    return {
      id: r.id, otherName: r.other_name, myRole: r.my_role as FamilyAccountLink['myRole'],
      myAccepted: r.my_accepted === true,
      otherAccepted: r.other_accepted === true, active: r.active === true,
    };
  });
}

export async function setMyFamilyConsent(linkId: string, accept: boolean): Promise<void> {
  const data = object(await call('set_my_family_progress_consent', {
    p_link_id: linkId, p_accept: accept,
  }));
  if (data.status !== 'updated') throw new Error('No se pudo actualizar tu decisión.');
}

export async function getMyFamilyProgress(): Promise<FamilyProgress[]> {
  const result = await call('get_my_family_progress');
  if (!Array.isArray(result)) throw new Error('No se pudo consultar el progreso compartido.');
  return result.map((entry) => {
    const r = object(entry);
    if (typeof r.owner_name !== 'string' || typeof r.dog_name !== 'string') {
      throw new Error('La información del progreso no es válida.');
    }
    return {
      ownerName: r.owner_name, dogName: r.dog_name,
      programName: typeof r.program_name === 'string' ? r.program_name : null,
      programLevel: typeof r.program_level === 'string' ? r.program_level : null,
      attendancesCount: typeof r.attendances_count === 'number' ? r.attendances_count : null,
    };
  });
}
