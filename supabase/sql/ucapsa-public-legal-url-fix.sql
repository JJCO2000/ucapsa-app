-- UCAPSA — correct public legal URLs.
-- Supabase shared Edge Function domains rewrite HTML to text/plain, so public
-- store-facing legal documents use rendered GitHub Markdown instead.

do $$
declare
  v_privacy_old text := 'https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/privacy-policy';
  v_delete_old text := 'https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/account-deletion-request';
  v_privacy_new text := 'https://github.com/JJCO2000/ucapsa-app/blob/main/docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md';
  v_delete_new text := 'https://github.com/JJCO2000/ucapsa-app/blob/main/docs/legal/ELIMINAR_CUENTA_UCAPSA_APP.md';
begin
  update public.privacy_notices
  set
    simplified_notice = replace(replace(simplified_notice, v_privacy_old, v_privacy_new), v_delete_old, v_delete_new),
    data_categories = replace(replace(data_categories, v_privacy_old, v_privacy_new), v_delete_old, v_delete_new),
    purposes = replace(replace(purposes, v_privacy_old, v_privacy_new), v_delete_old, v_delete_new),
    consent_required_purposes = replace(replace(consent_required_purposes, v_privacy_old, v_privacy_new), v_delete_old, v_delete_new),
    limitation_mechanisms = replace(replace(limitation_mechanisms, v_privacy_old, v_privacy_new), v_delete_old, v_delete_new),
    arco_procedure = replace(replace(arco_procedure, v_privacy_old, v_privacy_new), v_delete_old, v_delete_new),
    change_notice_method = replace(replace(change_notice_method, v_privacy_old, v_privacy_new), v_delete_old, v_delete_new),
    transfer_clause = replace(replace(transfer_clause, v_privacy_old, v_privacy_new), v_delete_old, v_delete_new),
    integral_notice = replace(replace(integral_notice, v_privacy_old, v_privacy_new), v_delete_old, v_delete_new),
    updated_at = now()
  where version = '1.1-appstores-2026-09-22'
    and status = 'published';

  if not found then
    raise exception 'Published privacy notice v1.1 not found.';
  end if;

  if exists (
    select 1
    from public.privacy_notices
    where version = '1.1-appstores-2026-09-22'
      and status = 'published'
      and concat_ws(' ',
        simplified_notice,
        data_categories,
        purposes,
        consent_required_purposes,
        limitation_mechanisms,
        arco_procedure,
        change_notice_method,
        transfer_clause,
        integral_notice
      ) like '%hrfecmviyiluubymsoeq.supabase.co/functions/v1/%'
  ) then
    raise exception 'Legacy Supabase store-facing legal URL remains in published notice.';
  end if;
end;
$$;
