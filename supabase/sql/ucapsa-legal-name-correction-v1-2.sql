-- UCAPSA — corrección de razón social en Aviso de Privacidad.
-- Razón social correcta confirmada por UCAPSA:
-- Universidad de Crianza y Adiestramiento S.A. de C.V.

begin;

update public.privacy_notices
set status = 'retired',
    updated_at = now()
where status = 'published';

insert into public.privacy_notices (
  version,
  status,
  responsible_name,
  responsible_address,
  contact_email,
  data_categories,
  sensitive_data_categories,
  purposes,
  consent_required_purposes,
  limitation_mechanisms,
  arco_procedure,
  change_notice_method,
  transfer_clause,
  simplified_notice,
  integral_notice,
  effective_from,
  published_at,
  created_by,
  published_by,
  created_at,
  updated_at
)
select
  '1.2-appstores-2026-09-27',
  'published',
  'Universidad de Crianza y Adiestramiento S.A. de C.V.',
  responsible_address,
  contact_email,
  data_categories,
  sensitive_data_categories,
  purposes,
  consent_required_purposes,
  limitation_mechanisms,
  arco_procedure,
  change_notice_method,
  transfer_clause,
  replace(
    simplified_notice,
    'Universidad de Crianza y Adiestramiento Peruano, S.A. de C.V.',
    'Universidad de Crianza y Adiestramiento S.A. de C.V.'
  ),
  replace(
    replace(
      integral_notice,
      'Universidad de Crianza y Adiestramiento Peruano, S.A. de C.V.',
      'Universidad de Crianza y Adiestramiento S.A. de C.V.'
    ),
    'Versión 1.1 App Stores. Vigente a partir del 22 de septiembre de 2026.',
    'Versión 1.2 App Stores. Vigente a partir del 27 de septiembre de 2026.'
  ),
  timestamptz '2026-09-27 00:00:00-06',
  now(),
  null,
  null,
  now(),
  now()
from public.privacy_notices
where version = '1.1-appstores-2026-09-22'
order by published_at desc
limit 1
on conflict (version) do update set
  status = 'published',
  responsible_name = excluded.responsible_name,
  responsible_address = excluded.responsible_address,
  contact_email = excluded.contact_email,
  data_categories = excluded.data_categories,
  sensitive_data_categories = excluded.sensitive_data_categories,
  purposes = excluded.purposes,
  consent_required_purposes = excluded.consent_required_purposes,
  limitation_mechanisms = excluded.limitation_mechanisms,
  arco_procedure = excluded.arco_procedure,
  change_notice_method = excluded.change_notice_method,
  transfer_clause = excluded.transfer_clause,
  simplified_notice = excluded.simplified_notice,
  integral_notice = excluded.integral_notice,
  effective_from = excluded.effective_from,
  published_at = now(),
  updated_at = now();

do $$
begin
  if not exists (
    select 1
    from public.privacy_notices
    where version = '1.2-appstores-2026-09-27'
      and status = 'published'
      and responsible_name = 'Universidad de Crianza y Adiestramiento S.A. de C.V.'
  ) then
    raise exception 'No se pudo publicar el aviso corregido 1.2.';
  end if;
end;
$$;

commit;
