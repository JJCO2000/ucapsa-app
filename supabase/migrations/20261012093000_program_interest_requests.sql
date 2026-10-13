-- Solicitudes comerciales de Puppy/Comandos: no son inscripciones ni asistencias.
-- Aplicar solo después de revisar permisos y regenerar database.generated.ts.
begin;

create table if not exists public.program_interest_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  dog_id uuid not null references public.dogs(id) on delete restrict,
  program_code text not null check (program_code in ('puppy', 'comandos')),
  status text not null default 'pending' check (status in ('pending', 'contacted', 'closed')),
  priority text not null default 'urgent' check (priority = 'urgent'),
  followup_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists program_interest_one_open_per_dog_program
  on public.program_interest_requests (user_id, dog_id, program_code)
  where status in ('pending','contacted');
create index if not exists program_interest_pending_order
  on public.program_interest_requests (status, created_at desc);

alter table public.program_interest_requests enable row level security;
revoke all on public.program_interest_requests from public, anon, authenticated;
grant select on public.program_interest_requests to authenticated;
grant insert (user_id, dog_id, program_code) on public.program_interest_requests to authenticated;
grant update (status, followup_note) on public.program_interest_requests to authenticated;

drop policy if exists program_interest_select on public.program_interest_requests;
create policy program_interest_select on public.program_interest_requests
for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists program_interest_client_create on public.program_interest_requests;
create policy program_interest_client_create on public.program_interest_requests
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.dogs d
    where d.id = dog_id and d.user_id = (select auth.uid()) and d.is_active = true
  )
);

drop policy if exists program_interest_admin_followup on public.program_interest_requests;
create policy program_interest_admin_followup on public.program_interest_requests
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

commit;
