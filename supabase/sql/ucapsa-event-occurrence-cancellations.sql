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
