import { supabase } from '../lib/supabase';
import type { TableRow } from '../types/database.helpers';

export type PrivacyNotice = TableRow<'privacy_notices'>;

export type PrivacyNoticeDraftInput = {
  id?: string | null;
  version: string;
  responsibleName: string;
  responsibleAddress: string;
  contactEmail: string;
  dataCategories: string;
  sensitiveDataCategories: string;
  purposes: string;
  consentRequiredPurposes: string;
  limitationMechanisms: string;
  arcoProcedure: string;
  changeNoticeMethod: string;
  transferClause: string;
  simplifiedNotice: string;
  integralNotice: string;
  effectiveFrom?: string | null;
};

export async function getPublishedPrivacyNotice(): Promise<PrivacyNotice | null> {
  const { data, error } = await supabase
    .from('privacy_notices')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getPrivacyNoticesAdmin(): Promise<PrivacyNotice[]> {
  const { data, error } = await supabase
    .from('privacy_notices')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function savePrivacyNoticeDraft(input: PrivacyNoticeDraftInput): Promise<PrivacyNotice> {
  const { data, error } = await supabase.rpc('admin_save_privacy_notice', {
    // PostgREST accepts null UUID here to create a new draft; generated types
    // cannot express nullable required function parameters, so keep this cast isolated.
    p_id: (input.id ?? null) as unknown as string,
    p_version: input.version.trim(),
    p_responsible_name: input.responsibleName.trim(),
    p_responsible_address: input.responsibleAddress.trim(),
    p_contact_email: input.contactEmail.trim(),
    p_data_categories: input.dataCategories.trim(),
    p_sensitive_data_categories: input.sensitiveDataCategories.trim(),
    p_purposes: input.purposes.trim(),
    p_consent_required_purposes: input.consentRequiredPurposes.trim(),
    p_limitation_mechanisms: input.limitationMechanisms.trim(),
    p_arco_procedure: input.arcoProcedure.trim(),
    p_change_notice_method: input.changeNoticeMethod.trim(),
    p_transfer_clause: input.transferClause.trim(),
    p_simplified_notice: input.simplifiedNotice.trim(),
    p_integral_notice: input.integralNotice.trim(),
    p_effective_from: input.effectiveFrom?.trim() || undefined,
  });

  if (error) throw error;
  if (!data) throw new Error('Supabase no devolvió el borrador del aviso.');
  return data;
}

export async function publishPrivacyNotice(id: string): Promise<PrivacyNotice> {
  const { data, error } = await supabase.rpc('admin_publish_privacy_notice', { p_id: id });
  if (error) throw error;
  if (!data) throw new Error('Supabase no devolvió el aviso publicado.');
  return data;
}
