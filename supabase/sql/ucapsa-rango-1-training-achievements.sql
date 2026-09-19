-- UCAPSA Rango 1 — logros formales de entrenamiento dog-specific
--
-- Reutiliza user_achievements como única fuente verdadera.
-- Admin puede otorgar/revocar Puppy, Básico, Intermedio y Avanzado a un perro
-- concreto, incluidos socios históricos. No crea otra tabla de medallas.

-- ---------------------------------------------------------------------------
-- Integridad general: user_id debe ser el dueño real del dog_id.
-- ---------------------------------------------------------------------------

create or replace function public.ucapsa_validate_dog_achievement_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.dog_id is null then
    return new;
  end if;

  select d.user_id into v_owner
  from public.dogs d
  where d.id = new.dog_id;

  if not found then
    raise exception 'Perro UCAPSA no encontrado.';
  end if;

  if new.user_id is distinct from v_owner then
    raise exception 'El logro dog-specific debe pertenecer al dueño real del perro.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.ucapsa_validate_dog_achievement_owner()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_validate_dog_achievement_owner
  on public.user_achievements;
create trigger trg_ucapsa_validate_dog_achievement_owner
before insert or update of user_id, dog_id
on public.user_achievements
for each row execute function public.ucapsa_validate_dog_achievement_owner();

-- ---------------------------------------------------------------------------
-- Admin: otorgar logro formal de entrenamiento.
-- ---------------------------------------------------------------------------

create or replace function public.admin_grant_ucapsa_training_achievement(
  p_dog_id uuid,
  p_achievement_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_owner uuid;
  v_code text := nullif(btrim(p_achievement_code), '');
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede otorgar logros de entrenamiento UCAPSA.';
  end if;

  if v_code not in (
    'puppy_completed',
    'comandos_basico_completed',
    'comandos_medio_completed',
    'comandos_avanzado_completed'
  ) then
    raise exception 'Ese código no es un logro formal de entrenamiento UCAPSA.';
  end if;

  select d.user_id into v_owner
  from public.dogs d
  where d.id = p_dog_id;

  if not found then
    raise exception 'Perro UCAPSA no encontrado.';
  end if;

  if exists (
    select 1
    from public.user_achievements ua
    where ua.user_id = v_owner
      and ua.dog_id = p_dog_id
      and ua.achievement_code = v_code
  ) then
    raise exception 'El perro ya tiene este logro de entrenamiento.'
      using errcode = '23505';
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
    v_owner,
    p_dog_id,
    v_code,
    'manual_admin',
    null,
    now(),
    auth.uid()
  )
  returning id into v_id;

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
      'user_id', v_owner,
      'achievement_code', v_code
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Historial de logros formales.
-- Los otorgamientos son evidencia histórica: no existe RPC destructiva de revocación.
-- Correcciones futuras deben usar un lifecycle explícito, no DELETE.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_revoke_ucapsa_training_achievement(uuid,text);

revoke all on function public.admin_grant_ucapsa_training_achievement(uuid,text)
  from public, anon, authenticated;
grant execute on function public.admin_grant_ucapsa_training_achievement(uuid,text)
  to authenticated;

