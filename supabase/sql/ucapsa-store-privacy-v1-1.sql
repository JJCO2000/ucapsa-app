-- UCAPSA — cross-store privacy v1.1 (Google Play + App Store)
-- Clarifies existing internal analytics and adds a public external account-deletion route.
-- No new category of product data is enabled by this migration.

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
  '1.1-appstores-2026-09-22',
  'published',
  responsible_name,
  responsible_address,
  contact_email,
  data_categories ||
    ' Datos de uso interno: exposición a determinadas superficies de Competencia/Constancia, perro y temporada vinculados, fecha y hora de la interacción. Datos técnicos de operación: sistema operativo, versión de la app, identificadores aleatorios o técnicos necesarios para actualizaciones y notificaciones y, cuando la infraestructura integrada los procese, registros de fallos.',
  sensitive_data_categories,
  purposes ||
    ' UCAPSA realiza analítica interna de uso y continuidad para evaluar y mejorar el servicio, incluyendo la relación temporal entre exposición a determinadas funciones, actividad y pagos posteriores. Esta analítica no se utiliza para publicidad dirigida, venta de datos ni tracking entre aplicaciones o sitios de terceros.',
  consent_required_purposes,
  limitation_mechanisms,
  arco_procedure ||
    ' Si la persona titular ya no puede acceder a la app, puede iniciar una solicitud de eliminación desde https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/account-deletion-request o escribir a ucapsa84@gmail.com.',
  change_notice_method,
  transfer_clause ||
    ' Expo EAS Update puede procesar datos técnicos como sistema operativo, project ID y un token aleatorio de instalación o actualización. La infraestructura integrada puede procesar registros de fallos técnicos necesarios para operación y mejora.',
  simplified_notice ||
    ' UCAPSA también registra determinadas interacciones con funciones de Competencia/Constancia para analítica interna de continuidad y mejora del servicio; no se usan para publicidad ni tracking entre apps.',
  integral_notice ||
    E'\n\n17. Analítica interna de continuidad\nUCAPSA registra de forma vinculada a la cuenta la exposición a determinadas superficies de Competencia/Constancia, incluyendo el perro, temporada y fecha/hora de la interacción. Estos hechos pueden relacionarse internamente con actividad y pagos posteriores para medir continuidad y evaluar el valor de las funciones. Esta analítica no se utiliza para publicidad dirigida, venta de datos ni tracking entre aplicaciones o sitios de terceros.\n\n18. Recurso externo de eliminación\nAdemás de la eliminación disponible dentro de la app, la persona titular puede iniciar una solicitud externa sin reinstalar UCAPSA App desde https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/account-deletion-request o escribiendo a ucapsa84@gmail.com.',
  timestamptz '2026-09-22 00:00:00-06',
  now(),
  null,
  null,
  now(),
  now()
from public.privacy_notices
where version = '1.0-appstore-2026-09-22'
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
  published_by = null,
  updated_at = now();

do $$
begin
  if not exists (
    select 1
    from public.privacy_notices
    where version = '1.1-appstores-2026-09-22'
      and status = 'published'
  ) then
    raise exception 'Privacy notice v1.1 could not be published from the canonical v1.0 notice.';
  end if;
end;
$$;
