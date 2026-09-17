-- UCAPSA Rango 1 — logros históricos de entrenamiento operables por Admin
--
-- Puppy/Básico/Medio/Avanzado siguen viviendo en user_achievements.
-- Esta capa sólo permite a Admin otorgar/revocar esos logros dog-specific
-- para reconocer perros históricos sin crear una segunda fuente de verdad.
--
-- No toca premios permanentes, Rango, Ranking ni puntos.

create or replace function public.admin_grant_ucapsa_training_achievement(
  p_dog_id uuid,
  p_achievement_code text,
  p_awarded_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_id uuid;
  v_created boolean := false;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede otorgar logros de entrenamiento UCAPSA.';
  end if;

  if p_achievement_code is null or p_achievement_code not in (
    'puppy_completed',
    'comandos_basico_completed',
    'comandos_medio_completed',
    'comandos_avanzado_completed'
  ) then
    raise exception 'Ese código no es un logro de entrenamiento UCAPSA.'
      using errcode = '22023';
  end if;

  select d.user_id
  into v_user_id
  from public.dogs d
  where d.id = p_dog_id;

  if not found then
    raise exception 'Perro UCAPSA no encontrado.';
  end if;

  if not exists (
    select 1
    from public.achievement_definitions ad
    where ad.code = p_achievement_code
      and ad.is_active = true
  ) then
    raise exception 'La definición del logro no está activa.';
  end if;

  insert into public.user_achievements (
    user_id,
    dog_id,
    achievement_code,
    source_type,
    source_id,
    awarded_at,
    awarded_by
  ) values (
    v_user_id,
    p_dog_id,
    p_achievement_code,
    'manual_admin',
    null,
    coalesce(p_awarded_at, now()),
    auth.uid()
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select ua.id
    into v_id
    from public.user_achievements ua
    where ua.user_id = v_user_id
      and ua.dog_id = p_dog_id
      and ua.achievement_code = p_achievement_code;

    if v_id is null then
      raise exception 'No se pudo resolver el logro existente.';
    end if;
  else
    v_created := true;
  end if;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_training_achievement.grant',
    'user_achievement',
    v_id,
    jsonb_build_object(
      'dog_id', p_dog_id,
      'user_id', v_user_id,
      'achievement_code', p_achievement_code,
      'created', v_created,
      'awarded_at', coalesce(p_awarded_at, now())
    )
  );

  return v_id;
end;
$$;

create or replace function public.admin_revoke_ucapsa_training_achievement(
  p_dog_id uuid,
  p_achievement_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_achievements%rowtype;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede revocar logros de entrenamiento UCAPSA.';
  end if;

  if p_achievement_code is null or p_achievement_code not in (
    'puppy_completed',
    'comandos_basico_completed',
    'comandos_medio_completed',
    'comandos_avanzado_completed'
  ) then
    raise exception 'Ese código no es un logro de entrenamiento UCAPSA.'
      using errcode = '22023';
  end if;

  select ua.*
  into v_row
  from public.user_achievements ua
  where ua.dog_id = p_dog_id
    and ua.achievement_code = p_achievement_code
  for update;

  if not found then
    raise exception 'El perro no tiene ese logro de entrenamiento.';
  end if;

  delete from public.user_achievements
  where id = v_row.id;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_training_achievement.revoke',
    'user_achievement',
    v_row.id,
    jsonb_build_object(
      'dog_id', v_row.dog_id,
      'user_id', v_row.user_id,
      'achievement_code', v_row.achievement_code,
      'previous_source_type', v_row.source_type,
      'previous_awarded_at', v_row.awarded_at,
      'previous_awarded_by', v_row.awarded_by
    )
  );

  return v_row.id;
end;
$$;

revoke all on function public.admin_grant_ucapsa_training_achievement(uuid,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_revoke_ucapsa_training_achievement(uuid,text)
  from public, anon, authenticated;

grant execute on function public.admin_grant_ucapsa_training_achievement(uuid,text,timestamptz)
  to authenticated;
grant execute on function public.admin_revoke_ucapsa_training_achievement(uuid,text)
  to authenticated;
