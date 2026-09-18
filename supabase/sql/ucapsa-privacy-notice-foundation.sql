-- UCAPSA privacy notice SSOT.
--
-- Drafts may be incomplete, but a notice cannot be published until every
-- minimum legal field required by the current LFPDPPP workflow is present.
-- No legal identity, domicile or purpose is invented by this migration.

create table if not exists public.privacy_notices (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'retired')),
  responsible_name text,
  responsible_address text,
  contact_email text,
  data_categories text,
  sensitive_data_categories text,
  purposes text,
  consent_required_purposes text,
  limitation_mechanisms text,
  arco_procedure text,
  change_notice_method text,
  transfer_clause text,
  simplified_notice text,
  integral_notice text,
  effective_from timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists privacy_notices_one_published_idx
  on public.privacy_notices ((status))
  where status = 'published';

create index if not exists privacy_notices_status_updated_idx
  on public.privacy_notices(status, updated_at desc);

alter table public.privacy_notices enable row level security;

drop policy if exists "Read published privacy notice or superadmin"
  on public.privacy_notices;
create policy "Read published privacy notice or superadmin"
  on public.privacy_notices
  for select
  to anon, authenticated
  using (
    status = 'published'
    or (
      (select auth.uid()) is not null
      and public.is_super_admin()
    )
  );

revoke all on table public.privacy_notices from public, anon, authenticated;
grant select on table public.privacy_notices to anon, authenticated;
grant all on table public.privacy_notices to service_role;

create or replace function public.admin_save_privacy_notice(
  p_id uuid,
  p_version text,
  p_responsible_name text,
  p_responsible_address text,
  p_contact_email text,
  p_data_categories text,
  p_sensitive_data_categories text,
  p_purposes text,
  p_consent_required_purposes text,
  p_limitation_mechanisms text,
  p_arco_procedure text,
  p_change_notice_method text,
  p_transfer_clause text,
  p_simplified_notice text,
  p_integral_notice text,
  p_effective_from timestamptz default null
)
returns public.privacy_notices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.privacy_notices%rowtype;
  v_now timestamptz := now();
begin
  if not public.is_super_admin() then
    raise exception 'Solo super_admin puede editar avisos de privacidad.';
  end if;

  if nullif(btrim(coalesce(p_version, '')), '') is null then
    raise exception 'La version del aviso es obligatoria.';
  end if;

  if p_id is null then
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
      created_by,
      updated_at
    ) values (
      btrim(p_version),
      'draft',
      nullif(btrim(coalesce(p_responsible_name, '')), ''),
      nullif(btrim(coalesce(p_responsible_address, '')), ''),
      nullif(btrim(coalesce(p_contact_email, '')), ''),
      nullif(btrim(coalesce(p_data_categories, '')), ''),
      nullif(btrim(coalesce(p_sensitive_data_categories, '')), ''),
      nullif(btrim(coalesce(p_purposes, '')), ''),
      nullif(btrim(coalesce(p_consent_required_purposes, '')), ''),
      nullif(btrim(coalesce(p_limitation_mechanisms, '')), ''),
      nullif(btrim(coalesce(p_arco_procedure, '')), ''),
      nullif(btrim(coalesce(p_change_notice_method, '')), ''),
      nullif(btrim(coalesce(p_transfer_clause, '')), ''),
      nullif(btrim(coalesce(p_simplified_notice, '')), ''),
      nullif(btrim(coalesce(p_integral_notice, '')), ''),
      p_effective_from,
      auth.uid(),
      v_now
    )
    returning * into v_row;
  else
    update public.privacy_notices
    set
      version = btrim(p_version),
      responsible_name = nullif(btrim(coalesce(p_responsible_name, '')), ''),
      responsible_address = nullif(btrim(coalesce(p_responsible_address, '')), ''),
      contact_email = nullif(btrim(coalesce(p_contact_email, '')), ''),
      data_categories = nullif(btrim(coalesce(p_data_categories, '')), ''),
      sensitive_data_categories = nullif(btrim(coalesce(p_sensitive_data_categories, '')), ''),
      purposes = nullif(btrim(coalesce(p_purposes, '')), ''),
      consent_required_purposes = nullif(btrim(coalesce(p_consent_required_purposes, '')), ''),
      limitation_mechanisms = nullif(btrim(coalesce(p_limitation_mechanisms, '')), ''),
      arco_procedure = nullif(btrim(coalesce(p_arco_procedure, '')), ''),
      change_notice_method = nullif(btrim(coalesce(p_change_notice_method, '')), ''),
      transfer_clause = nullif(btrim(coalesce(p_transfer_clause, '')), ''),
      simplified_notice = nullif(btrim(coalesce(p_simplified_notice, '')), ''),
      integral_notice = nullif(btrim(coalesce(p_integral_notice, '')), ''),
      effective_from = p_effective_from,
      updated_at = v_now
    where id = p_id
      and status <> 'published'
    returning * into v_row;

    if not found then
      raise exception 'Aviso no encontrado o ya publicado. Crea una nueva version para modificarlo.';
    end if;
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_save_privacy_notice(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz
) from public, anon;
grant execute on function public.admin_save_privacy_notice(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz
) to authenticated, service_role;

create or replace function public.admin_publish_privacy_notice(
  p_id uuid
)
returns public.privacy_notices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.privacy_notices%rowtype;
  v_now timestamptz := now();
begin
  if not public.is_super_admin() then
    raise exception 'Solo super_admin puede publicar avisos de privacidad.';
  end if;

  select *
    into v_row
  from public.privacy_notices
  where id = p_id
  for update;

  if not found then
    raise exception 'Aviso no encontrado.';
  end if;

  if v_row.status = 'published' then
    return v_row;
  end if;

  if nullif(btrim(coalesce(v_row.version, '')), '') is null
     or nullif(btrim(coalesce(v_row.responsible_name, '')), '') is null
     or nullif(btrim(coalesce(v_row.responsible_address, '')), '') is null
     or nullif(btrim(coalesce(v_row.contact_email, '')), '') is null
     or nullif(btrim(coalesce(v_row.data_categories, '')), '') is null
     or nullif(btrim(coalesce(v_row.sensitive_data_categories, '')), '') is null
     or nullif(btrim(coalesce(v_row.purposes, '')), '') is null
     or nullif(btrim(coalesce(v_row.consent_required_purposes, '')), '') is null
     or nullif(btrim(coalesce(v_row.limitation_mechanisms, '')), '') is null
     or nullif(btrim(coalesce(v_row.arco_procedure, '')), '') is null
     or nullif(btrim(coalesce(v_row.change_notice_method, '')), '') is null
     or nullif(btrim(coalesce(v_row.transfer_clause, '')), '') is null
     or nullif(btrim(coalesce(v_row.simplified_notice, '')), '') is null
     or nullif(btrim(coalesce(v_row.integral_notice, '')), '') is null then
    raise exception 'El aviso esta incompleto y no puede publicarse.';
  end if;

  update public.privacy_notices
  set
    status = 'retired',
    updated_at = v_now
  where status = 'published'
    and id <> p_id;

  update public.privacy_notices
  set
    status = 'published',
    published_at = v_now,
    published_by = auth.uid(),
    effective_from = coalesce(effective_from, v_now),
    updated_at = v_now
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.admin_publish_privacy_notice(uuid)
  from public, anon;
grant execute on function public.admin_publish_privacy_notice(uuid)
  to authenticated, service_role;
