-- UCAPSA Cambio 3.5 - Notificaciones por cancelacion de clase
-- Tabla anti-duplicados para no avisar dos veces la misma cancelacion al mismo inscrito.

create table if not exists public.notification_class_cancellation_locks (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  schedule_id uuid not null references public.program_schedules(id) on delete cascade,
  cancellation_date date not null,
  campaign_id uuid references public.notification_campaigns(id) on delete set null,
  status text not null default 'locked',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_class_cancellation_locks_status_check
    check (status = any (array['locked'::text, 'sent'::text, 'skipped'::text, 'failed'::text]))
);

create unique index if not exists notification_class_cancellation_locks_unique
  on public.notification_class_cancellation_locks (
    enrollment_id,
    schedule_id,
    cancellation_date
  );

grant usage on schema public to service_role;

grant select, insert, update on public.notification_class_cancellation_locks to service_role;
grant select on public.programs to service_role;
grant select on public.program_schedules to service_role;
grant select on public.program_enrollments to service_role;
grant select on public.program_class_cancellations to service_role;
grant select on public.profiles to service_role;
grant select on public.notification_preferences to service_role;
grant select on public.notification_tokens to service_role;
grant select, insert, update on public.notification_campaigns to service_role;
grant select, insert, update on public.notification_deliveries to service_role;
