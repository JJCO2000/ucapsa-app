-- Canonical UCAPSA practice-session RPC.
--
-- This file versions the function currently used by practice.service.ts.
-- The function is idempotent by (user_id, client_event_id), validates ownership
-- and active enrollment, and is executable only by authenticated clients.

create or replace function public.register_my_practice_session(
  p_client_event_id uuid,
  p_enrollment_id uuid,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_difficulty text,
  p_note text default null,
  p_duration_seconds integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.program_enrollments%rowtype;
  v_existing_id uuid;
  v_practice_id uuid;
begin
  if v_user_id is null then
    raise exception 'No hay sesión activa.';
  end if;

  if p_client_event_id is null then
    raise exception 'Falta el identificador de la práctica.';
  end if;

  if p_enrollment_id is null then
    raise exception 'Falta la inscripción de la práctica.';
  end if;

  if p_difficulty not in ('easy', 'good', 'hard') then
    raise exception 'La dificultad de la práctica no es válida.';
  end if;

  if p_started_at is null or p_completed_at is null or p_completed_at < p_started_at then
    raise exception 'Las horas de la práctica no son válidas.';
  end if;

  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception 'La duración de la práctica no es válida.';
  end if;

  select ps.id
    into v_existing_id
  from public.practice_sessions ps
  where ps.user_id = v_user_id
    and ps.client_event_id = p_client_event_id
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select *
    into v_enrollment
  from public.program_enrollments e
  where e.id = p_enrollment_id
    and e.user_id = v_user_id
    and e.status = 'active'
  limit 1;

  if not found then
    raise exception 'La inscripción ya no está activa o no pertenece a tu cuenta.';
  end if;

  begin
    insert into public.practice_sessions (
      user_id,
      dog_id,
      enrollment_id,
      client_event_id,
      started_at,
      completed_at,
      difficulty,
      note,
      duration_seconds
    ) values (
      v_user_id,
      v_enrollment.dog_id,
      v_enrollment.id,
      p_client_event_id,
      p_started_at,
      p_completed_at,
      p_difficulty,
      nullif(btrim(coalesce(p_note, '')), ''),
      p_duration_seconds
    )
    returning id into v_practice_id;
  exception
    when unique_violation then
      select ps.id
        into v_practice_id
      from public.practice_sessions ps
      where ps.user_id = v_user_id
        and ps.client_event_id = p_client_event_id
      limit 1;
  end;

  if v_practice_id is null then
    raise exception 'No se pudo confirmar la práctica.';
  end if;

  return v_practice_id;
end;
$$;

revoke all on function public.register_my_practice_session(
  uuid, uuid, timestamptz, timestamptz, text, text, integer
) from public, anon, service_role;

grant execute on function public.register_my_practice_session(
  uuid, uuid, timestamptz, timestamptz, text, text, integer
) to authenticated;
