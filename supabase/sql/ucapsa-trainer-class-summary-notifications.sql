-- UCAPSA — resumen operativo para Entrenadores
--
-- El recordatorio de clientes corre por la mañana del día anterior.
-- Este lock protege un segundo envío, sólo para Entrenadores, al cierre del día
-- anterior con el aforo esperado ya actualizado.

create table if not exists public.notification_trainer_summary_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_date date not null,
  summary_type text not null default 'next_day_classes',
  campaign_id uuid references public.notification_campaigns(id) on delete set null,
  status text not null default 'locked',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_trainer_summary_locks_status_check
    check (status = any (array['locked'::text, 'sent'::text, 'failed'::text]))
);

create unique index if not exists notification_trainer_summary_locks_unique
  on public.notification_trainer_summary_locks (user_id, class_date, summary_type);

alter table public.notification_trainer_summary_locks enable row level security;

revoke all on table public.notification_trainer_summary_locks from public, anon, authenticated;
grant select, insert, update on table public.notification_trainer_summary_locks to service_role;

grant select on public.program_class_rsvps to service_role;
