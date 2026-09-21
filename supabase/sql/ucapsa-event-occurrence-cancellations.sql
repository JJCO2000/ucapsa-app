-- UCAPSA — excepciones auditables para ocurrencias de eventos recurrentes
--
-- Los eventos recurrentes se expanden virtualmente desde public.events. Para
-- cancelar una sola ocurrencia (o un rango de ocurrencias) sin destruir la
-- serie completa se conserva una excepción por event_id + occurrence_start.
--
-- Las excepciones nunca se borran físicamente: restaurar una ocurrencia marca
-- restored_at/restored_by y conserva el historial administrativo.

create table if not exists public.event_occurrence_cancellations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  occurrence_start timestamptz not null,
  reason text,
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_occurrence_cancellations_event_start_unique
    unique (event_id, occurrence_start)
);

create index if not exists event_occurrence_cancellations_event_active_idx
  on public.event_occurrence_cancellations(event_id, occurrence_start)
  where restored_at is null;

create or replace function public.guard_event_occurrence_cancellation_update()
returns trigger
language plpgsql
set search_path = public
as $
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.id is distinct from new.id
     or old.event_id is distinct from new.event_id
     or old.occurrence_start is distinct from new.occurrence_start
     or old.created_at is distinct from new.created_at then
    raise exception 'No se puede cambiar la identidad histórica de una cancelación de evento.';
  end if;

  -- Mientras la cancelación sigue activa, quién/cuándo la creó son hechos
  -- históricos inmutables. Si estaba restaurada, una nueva cancelación puede
  -- reactivar la misma clave y registrar un nuevo actor/momento; el trigger de
  -- auditoría conserva el before/after de esa transición.
  if old.restored_at is null
     and (
       old.cancelled_at is distinct from new.cancelled_at
       or old.cancelled_by is distinct from new.cancelled_by
     ) then
    raise exception 'La autoría de una cancelación activa no se puede reescribir.';
  end if;

  return new;
end;
$;

revoke all on function public.guard_event_occurrence_cancellation_update()
  from public, anon, authenticated;

drop trigger if exists trg_guard_event_occurrence_cancellation_update
  on public.event_occurrence_cancellations;
create trigger trg_guard_event_occurrence_cancellation_update
before update on public.event_occurrence_cancellations
for each row
execute function public.guard_event_occurrence_cancellation_update();

create or replace function public.audit_event_occurrence_cancellation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'event_occurrence.cancel';
  elsif old.restored_at is null and new.restored_at is not null then
    v_action := 'event_occurrence.restore';
  elsif old.restored_at is not null and new.restored_at is null then
    v_action := 'event_occurrence.reactivate';
  else
    v_action := 'event_occurrence.update';
  end if;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    v_action,
    'event_occurrence_cancellation',
    new.id,
    jsonb_build_object(
      'before', case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      'after', to_jsonb(new)
    )
  );

  return new;
end;
$;

revoke all on function public.audit_event_occurrence_cancellation_change()
  from public, anon, authenticated;

drop trigger if exists trg_audit_event_occurrence_cancellation_change
  on public.event_occurrence_cancellations;
create trigger trg_audit_event_occurrence_cancellation_change
after insert or update on public.event_occurrence_cancellations
for each row
execute function public.audit_event_occurrence_cancellation_change();

alter table public.event_occurrence_cancellations enable row level security;

drop policy if exists "event_occurrence_cancellations_anon_select_public"
  on public.event_occurrence_cancellations;
create policy "event_occurrence_cancellations_anon_select_public"
on public.event_occurrence_cancellations
for select
to anon
using (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.is_published = true
      and e.archived_at is null
      and e.audience = 'public'
  )
);

drop policy if exists "event_occurrence_cancellations_authenticated_select_visible"
  on public.event_occurrence_cancellations;
create policy "event_occurrence_cancellations_authenticated_select_visible"
on public.event_occurrence_cancellations
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.is_published = true
      and e.archived_at is null
      and (
        e.audience = 'public'
        or e.audience = 'clients'
        or (e.audience = 'members' and public.has_active_membership())
      )
  )
);

drop policy if exists "event_occurrence_cancellations_admin_insert"
  on public.event_occurrence_cancellations;
create policy "event_occurrence_cancellations_admin_insert"
on public.event_occurrence_cancellations
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "event_occurrence_cancellations_admin_update"
  on public.event_occurrence_cancellations;
create policy "event_occurrence_cancellations_admin_update"
on public.event_occurrence_cancellations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.event_occurrence_cancellations
  from public, anon, authenticated;
grant select on table public.event_occurrence_cancellations to anon;
grant select, insert, update on table public.event_occurrence_cancellations to authenticated;
grant all on table public.event_occurrence_cancellations to service_role;
