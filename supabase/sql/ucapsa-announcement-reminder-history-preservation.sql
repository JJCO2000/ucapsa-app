-- Preserve reminder replacement history without changing active scheduling semantics.
-- Old draft reminder campaigns are retired atomically instead of physically deleted.

create or replace function public.admin_replace_announcement_reminders(
  p_announcement_id uuid,
  p_reminders jsonb
)
returns table(status text, metadata jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_announcement public.announcements%rowtype;
  v_event_date date;
  v_invalid_count integer := 0;
  v_reminders jsonb := coalesce(p_reminders, '[]'::jsonb);
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden gestionar recordatorios.';
  end if;

  if jsonb_typeof(v_reminders) <> 'array' then
    raise exception 'Los recordatorios deben enviarse como arreglo.';
  end if;

  if jsonb_array_length(v_reminders) > 5 then
    raise exception 'Solo se permiten hasta 5 recordatorios por anuncio.';
  end if;

  select *
    into v_announcement
  from public.announcements
  where id = p_announcement_id
  for share;

  if not found then
    raise exception 'No se encontro el anuncio.';
  end if;

  if v_announcement.announcement_date is not null then
    v_event_date := (v_announcement.announcement_date at time zone 'America/Mexico_City')::date;
  end if;

  select count(*)
    into v_invalid_count
  from jsonb_to_recordset(v_reminders) as r(days_before integer, hour integer, minute integer)
  where r.days_before is null
     or r.hour is null
     or r.minute is null
     or r.days_before < 0
     or r.days_before > 60
     or r.hour < 0
     or r.hour > 23
     or r.minute < 0
     or r.minute > 59;

  if v_invalid_count > 0 then
    raise exception 'Configuracion de recordatorio invalida.';
  end if;

  if jsonb_array_length(v_reminders) > 0 and v_event_date is null then
    raise exception 'El anuncio necesita una fecha para programar recordatorios.';
  end if;

  update public.notification_campaigns c
  set
    status = 'no_targets',
    archived_at = coalesce(c.archived_at, now()),
    metadata = c.metadata || jsonb_build_object(
      'retired_reason', 'announcement_reminder_replaced'
    ),
    updated_at = now()
  where c.category = 'announcements_events'
    and c.status = 'draft'
    and c.metadata @> jsonb_build_object(
      'source', 'announcement_reminder',
      'announcement_id', v_announcement.id::text
    );

  if jsonb_array_length(v_reminders) = 0 then
    return;
  end if;

  return query
  with normalized as (
    select distinct on (r.days_before, r.hour, r.minute)
      r.days_before,
      r.hour,
      r.minute
    from jsonb_to_recordset(v_reminders) as r(days_before integer, hour integer, minute integer)
    order by r.days_before, r.hour, r.minute
  ),
  inserted as (
    insert into public.notification_campaigns (
      title,
      body,
      audience,
      category,
      status,
      total_targets,
      created_by,
      metadata
    )
    select
      'Recordatorio: ' || v_announcement.title,
      left(coalesce(v_announcement.content, ''), 220),
      v_announcement.audience,
      'announcements_events',
      'draft',
      0,
      auth.uid(),
      jsonb_build_object(
        'source', 'announcement_reminder',
        'announcement_id', v_announcement.id::text,
        'announcement_date', v_event_date::text,
        'days_before', n.days_before,
        'hour', n.hour,
        'minute', n.minute,
        'remind_at',
          (
            make_timestamptz(
              extract(year from v_event_date)::integer,
              extract(month from v_event_date)::integer,
              extract(day from v_event_date)::integer,
              n.hour,
              n.minute,
              0,
              'America/Mexico_City'
            ) - make_interval(days => n.days_before)
          )::text
      )
    from normalized n
    returning notification_campaigns.status, notification_campaigns.metadata
  )
  select inserted.status, inserted.metadata
  from inserted
  order by
    (inserted.metadata ->> 'days_before')::integer desc,
    (inserted.metadata ->> 'hour')::integer,
    (inserted.metadata ->> 'minute')::integer;
end;
$$;

revoke all on function public.admin_replace_announcement_reminders(uuid, jsonb)
  from public, anon;
grant execute on function public.admin_replace_announcement_reminders(uuid, jsonb)
  to authenticated, service_role;
