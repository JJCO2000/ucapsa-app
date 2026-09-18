-- UCAPSA account deletion audit trail and completion evidence.
--
-- Strengthens the ARCO cancellation workflow without inventing retention periods:
-- - every state transition is append-only auditable;
-- - completion is a separate RPC that requires notification evidence;
-- - the generic status RPC can no longer mark a request completed.

alter table public.account_deletion_requests
  add column if not exists notification_method text,
  add column if not exists notification_reference text,
  add column if not exists notified_at timestamptz;

create table if not exists public.account_deletion_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.account_deletion_requests(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null
    check (event_type in ('requested', 'status_changed', 'completed', 'snapshot')),
  from_status text,
  to_status text,
  note text,
  retention_until date,
  notification_method text,
  notification_reference text,
  created_at timestamptz not null default now()
);

create index if not exists account_deletion_request_events_request_created_idx
  on public.account_deletion_request_events(request_id, created_at);

alter table public.account_deletion_request_events enable row level security;

drop policy if exists "Users read own account deletion request events"
  on public.account_deletion_request_events;
create policy "Users read own account deletion request events"
  on public.account_deletion_request_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.account_deletion_requests r
      where r.id = account_deletion_request_events.request_id
        and (
          r.user_id = (select auth.uid())
          or public.is_ucapsa_admin()
        )
    )
  );

revoke all on table public.account_deletion_request_events from public, anon, authenticated;
grant select on table public.account_deletion_request_events to authenticated;
grant all on table public.account_deletion_request_events to service_role;

insert into public.account_deletion_request_events (
  request_id,
  actor_user_id,
  event_type,
  from_status,
  to_status,
  note,
  retention_until,
  notification_method,
  notification_reference,
  created_at
)
select
  r.id,
  coalesce(r.resolved_by, r.requested_by),
  'snapshot',
  null,
  r.status,
  coalesce(r.resolution_note, r.reason),
  r.retention_until,
  r.notification_method,
  r.notification_reference,
  r.updated_at
from public.account_deletion_requests r
where not exists (
  select 1
  from public.account_deletion_request_events e
  where e.request_id = r.id
);

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

  insert into public.account_deletion_request_events (
    request_id,
    actor_user_id,
    event_type,
    from_status,
    to_status,
    note
  ) values (
    v_created.id,
    v_user_id,
    'requested',
    null,
    'pending',
    v_created.reason
  );

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
  v_before public.account_deletion_requests%rowtype;
  v_after public.account_deletion_requests%rowtype;
  v_now timestamptz := now();
begin
  if not public.is_super_admin() then
    raise exception 'Solo super_admin puede resolver solicitudes de eliminacion de cuenta.';
  end if;

  if p_status not in ('in_review', 'blocked', 'rejected') then
    raise exception 'Estado de solicitud no valido para esta operacion.';
  end if;

  select *
    into v_before
  from public.account_deletion_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada.';
  end if;

  if v_before.status in ('rejected', 'completed') then
    raise exception 'La solicitud ya esta resuelta.';
  end if;

  if p_status = 'blocked' and p_retention_until is null then
    raise exception 'El periodo de bloqueo necesita una fecha de fin.';
  end if;

  if p_status = 'rejected'
     and length(btrim(coalesce(p_resolution_note, ''))) < 5 then
    raise exception 'La resolucion requiere una nota suficiente.';
  end if;

  update public.account_deletion_requests
  set
    status = p_status,
    resolution_note = nullif(btrim(coalesce(p_resolution_note, '')), ''),
    retention_until = case
      when p_status = 'blocked' then p_retention_until
      else retention_until
    end,
    resolved_by = case
      when p_status = 'rejected' then auth.uid()
      else null
    end,
    resolved_at = case
      when p_status = 'rejected' then v_now
      else null
    end,
    updated_at = v_now
  where id = p_request_id
  returning * into v_after;

  insert into public.account_deletion_request_events (
    request_id,
    actor_user_id,
    event_type,
    from_status,
    to_status,
    note,
    retention_until
  ) values (
    v_after.id,
    auth.uid(),
    'status_changed',
    v_before.status,
    v_after.status,
    v_after.resolution_note,
    v_after.retention_until
  );

  return v_after;
end;
$$;

revoke all on function public.admin_update_account_deletion_request(uuid, text, text, date)
  from public, anon;
grant execute on function public.admin_update_account_deletion_request(uuid, text, text, date)
  to authenticated, service_role;

create or replace function public.admin_complete_account_deletion_request(
  p_request_id uuid,
  p_resolution_note text,
  p_notification_method text,
  p_notification_reference text
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.account_deletion_requests%rowtype;
  v_after public.account_deletion_requests%rowtype;
  v_now timestamptz := now();
  v_note text := nullif(btrim(coalesce(p_resolution_note, '')), '');
  v_method text := nullif(btrim(coalesce(p_notification_method, '')), '');
  v_reference text := nullif(btrim(coalesce(p_notification_reference, '')), '');
begin
  if not public.is_super_admin() then
    raise exception 'Solo super_admin puede cerrar solicitudes de eliminacion de cuenta.';
  end if;

  select *
    into v_before
  from public.account_deletion_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada.';
  end if;

  if v_before.status <> 'blocked' then
    raise exception 'La solicitud debe estar bloqueada antes de cerrarse.';
  end if;

  if v_before.retention_until is null then
    raise exception 'La solicitud no tiene fecha de fin de bloqueo.';
  end if;

  if v_before.retention_until > current_date then
    raise exception 'No se puede cerrar antes de concluir el periodo de bloqueo.';
  end if;

  if v_note is null or length(v_note) < 5 then
    raise exception 'La resolucion requiere evidencia de supresion.';
  end if;

  if v_method is null then
    raise exception 'Debes registrar el medio de notificacion al titular.';
  end if;

  if v_reference is null then
    raise exception 'Debes registrar una referencia de la notificacion al titular.';
  end if;

  update public.account_deletion_requests
  set
    status = 'completed',
    resolution_note = v_note,
    notification_method = v_method,
    notification_reference = v_reference,
    notified_at = v_now,
    resolved_by = auth.uid(),
    resolved_at = v_now,
    updated_at = v_now
  where id = p_request_id
  returning * into v_after;

  insert into public.account_deletion_request_events (
    request_id,
    actor_user_id,
    event_type,
    from_status,
    to_status,
    note,
    retention_until,
    notification_method,
    notification_reference
  ) values (
    v_after.id,
    auth.uid(),
    'completed',
    v_before.status,
    v_after.status,
    v_after.resolution_note,
    v_after.retention_until,
    v_after.notification_method,
    v_after.notification_reference
  );

  return v_after;
end;
$$;

revoke all on function public.admin_complete_account_deletion_request(uuid, text, text, text)
  from public, anon;
grant execute on function public.admin_complete_account_deletion_request(uuid, text, text, text)
  to authenticated, service_role;
