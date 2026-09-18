-- UCAPSA account deletion / ARCO cancellation workflow foundation.
--
-- This is intentionally separate from membership_delete_requests:
-- membership cancellation is a product/benefit workflow; account deletion is a
-- personal-data lifecycle request that can require review, blocking and later
-- suppression.
--
-- No destructive deletion is performed by this migration. It creates the
-- canonical request ledger and controlled RPCs so the operational process can
-- be audited without inventing a retention period.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'blocked', 'rejected', 'completed')),
  reason text,
  resolution_note text,
  retention_until date,
  snapshot_name text,
  snapshot_email text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_deletion_one_open_request_per_user_idx
  on public.account_deletion_requests(user_id)
  where user_id is not null
    and status in ('pending', 'in_review', 'blocked');

create index if not exists account_deletion_requests_status_requested_idx
  on public.account_deletion_requests(status, requested_at);

alter table public.account_deletion_requests enable row level security;

drop policy if exists "Users read own account deletion requests"
  on public.account_deletion_requests;
create policy "Users read own account deletion requests"
  on public.account_deletion_requests
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_ucapsa_admin()
  );

revoke all on table public.account_deletion_requests from public, anon;
grant select on table public.account_deletion_requests to authenticated;
grant all on table public.account_deletion_requests to service_role;

create or replace function public.request_my_account_deletion(
  p_reason text default null
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_existing public.account_deletion_requests%rowtype;
  v_created public.account_deletion_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'No hay sesion activa.';
  end if;

  select *
    into v_profile
  from public.profiles
  where user_id = v_user_id
  limit 1;

  if v_profile.role in ('admin', 'super_admin') then
    raise exception 'Las cuentas administrativas requieren un proceso interno separado.';
  end if;

  select *
    into v_existing
  from public.account_deletion_requests
  where user_id = v_user_id
    and status in ('pending', 'in_review', 'blocked')
  order by requested_at desc
  limit 1;

  if found then
    return v_existing;
  end if;

  insert into public.account_deletion_requests (
    user_id,
    requested_by,
    status,
    reason,
    snapshot_name,
    snapshot_email
  ) values (
    v_user_id,
    v_user_id,
    'pending',
    nullif(btrim(coalesce(p_reason, '')), ''),
    v_profile.full_name,
    v_profile.email
  )
  returning * into v_created;

  return v_created;
end;
$$;

revoke all on function public.request_my_account_deletion(text)
  from public, anon;
grant execute on function public.request_my_account_deletion(text)
  to authenticated, service_role;

create or replace function public.admin_update_account_deletion_request(
  p_request_id uuid,
  p_status text,
  p_resolution_note text default null,
  p_retention_until date default null
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.account_deletion_requests%rowtype;
  v_now timestamptz := now();
begin
  if not public.is_super_admin() then
    raise exception 'Solo super_admin puede resolver solicitudes de eliminacion de cuenta.';
  end if;

  if p_status not in ('in_review', 'blocked', 'rejected', 'completed') then
    raise exception 'Estado de solicitud no valido.';
  end if;

  if p_status = 'blocked' and p_retention_until is null then
    raise exception 'El periodo de bloqueo necesita una fecha de fin.';
  end if;

  if p_status = 'completed'
     and p_retention_until is not null
     and p_retention_until > current_date then
    raise exception 'No se puede cerrar antes de concluir el periodo de bloqueo.';
  end if;

  update public.account_deletion_requests
  set
    status = p_status,
    resolution_note = nullif(btrim(coalesce(p_resolution_note, '')), ''),
    retention_until = case
      when p_status = 'blocked' then p_retention_until
      when p_status = 'completed' then coalesce(p_retention_until, retention_until)
      else retention_until
    end,
    resolved_by = case
      when p_status in ('rejected', 'completed') then auth.uid()
      else null
    end,
    resolved_at = case
      when p_status in ('rejected', 'completed') then v_now
      else null
    end,
    updated_at = v_now
  where id = p_request_id
  returning * into v_row;

  if not found then
    raise exception 'Solicitud no encontrada.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_account_deletion_request(uuid, text, text, date)
  from public, anon;
grant execute on function public.admin_update_account_deletion_request(uuid, text, text, date)
  to authenticated, service_role;
