-- UCAPSA Rango 1 — premios permanentes dog-specific
--
-- Los premios son reconocimientos institucionales explícitos, no estados
-- derivados. Perro del Año NO se asigna automáticamente desde Ranking/Podio.
-- Una revocación conserva la fila histórica y la auditoría.

-- ---------------------------------------------------------------------------
-- Integridad del premio.
-- ---------------------------------------------------------------------------

create unique index if not exists dog_awards_one_dog_of_year_per_season_idx
  on public.dog_awards (season_id)
  where award_code = 'dog_of_year'
    and season_id is not null
    and revoked_at is null;

create or replace function public.ucapsa_validate_dog_award()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award_active boolean;
  v_season_status text;
begin
  if tg_op = 'UPDATE' then
    if new.dog_id is distinct from old.dog_id
      or new.award_code is distinct from old.award_code
      or new.season_id is distinct from old.season_id
      or new.awarded_at is distinct from old.awarded_at
      or new.awarded_by is distinct from old.awarded_by
      or new.note is distinct from old.note then
      raise exception 'La identidad de un premio UCAPSA es inmutable. Revoca y vuelve a otorgar si necesitas corregirlo.'
        using errcode = '55000';
    end if;

    if old.revoked_at is not null and (
      new.revoked_at is distinct from old.revoked_at
      or new.revoked_by is distinct from old.revoked_by
    ) then
      raise exception 'Un premio ya revocado no puede modificarse.'
        using errcode = '55000';
    end if;
  end if;

  select d.is_active into v_award_active
  from public.ucapsa_award_definitions d
  where d.code = new.award_code;

  if not found then
    raise exception 'Definición de premio UCAPSA no encontrada.';
  end if;

  if tg_op = 'INSERT' and v_award_active is not true then
    raise exception 'No se puede otorgar un premio UCAPSA inactivo.';
  end if;

  if new.award_code = 'dog_of_year' and new.season_id is null then
    raise exception 'Perro del Año debe estar asociado a una temporada UCAPSA.'
      using errcode = '23514';
  end if;

  if new.season_id is not null then
    select s.status into v_season_status
    from public.ucapsa_competition_seasons s
    where s.id = new.season_id;

    if not found then
      raise exception 'Temporada UCAPSA no encontrada.';
    end if;

    if tg_op = 'INSERT' and v_season_status = 'draft' then
      raise exception 'No se puede otorgar un premio sobre una temporada en borrador.'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.ucapsa_validate_dog_award()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_validate_dog_award on public.dog_awards;
create trigger trg_ucapsa_validate_dog_award
before insert or update on public.dog_awards
for each row execute function public.ucapsa_validate_dog_award();

-- Los clientes sólo ven premios vigentes de sus propios perros.
drop policy if exists "Users read own dog awards" on public.dog_awards;
create policy "Users read own active dog awards"
on public.dog_awards
for select
to authenticated
using (
  (select public.is_ucapsa_admin())
  or (
    revoked_at is null
    and exists (
      select 1
      from public.dogs d
      where d.id = dog_awards.dog_id
        and d.user_id = (select auth.uid())
    )
  )
);

-- ---------------------------------------------------------------------------
-- Vista de consumo: activa, enriquecida y dog-specific.
-- ---------------------------------------------------------------------------

create or replace view public.ucapsa_dog_award_summary
with (security_invoker = true)
as
select
  a.id as award_id,
  a.dog_id,
  d.name as dog_name,
  a.award_code,
  def.title,
  def.description,
  def.icon_key,
  a.season_id,
  s.name as season_name,
  a.awarded_at,
  a.note
from public.dog_awards a
join public.dogs d on d.id = a.dog_id
join public.ucapsa_award_definitions def on def.code = a.award_code
left join public.ucapsa_competition_seasons s on s.id = a.season_id
where a.revoked_at is null;

revoke all on table public.ucapsa_dog_award_summary
  from public, anon, authenticated;
grant select on table public.ucapsa_dog_award_summary
  to authenticated;
grant select on table public.ucapsa_dog_award_summary
  to service_role;

-- ---------------------------------------------------------------------------
-- Admin: otorgar / revocar. Sin justificación obligatoria.
-- ---------------------------------------------------------------------------

create or replace function public.admin_grant_ucapsa_dog_award(
  p_dog_id uuid,
  p_award_code text,
  p_season_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := nullif(btrim(p_award_code), '');
  v_season_status text;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede otorgar premios UCAPSA.';
  end if;

  if v_code is null then
    raise exception 'El código de premio es obligatorio.';
  end if;

  if not exists (select 1 from public.dogs d where d.id = p_dog_id) then
    raise exception 'Perro UCAPSA no encontrado.';
  end if;

  if not exists (
    select 1
    from public.ucapsa_award_definitions d
    where d.code = v_code and d.is_active = true
  ) then
    raise exception 'Premio UCAPSA no encontrado o inactivo.';
  end if;

  if p_season_id is not null then
    select s.status into v_season_status
    from public.ucapsa_competition_seasons s
    where s.id = p_season_id;

    if not found then
      raise exception 'Temporada UCAPSA no encontrada.';
    end if;

    if v_season_status = 'draft' then
      raise exception 'No se puede otorgar un premio sobre una temporada en borrador.';
    end if;
  end if;

  if v_code = 'dog_of_year' and p_season_id is null then
    raise exception 'Perro del Año requiere temporada.';
  end if;

  if exists (
    select 1
    from public.dog_awards a
    where a.dog_id = p_dog_id
      and a.award_code = v_code
      and a.season_id is not distinct from p_season_id
      and a.revoked_at is null
  ) then
    raise exception 'El perro ya tiene este premio UCAPSA vigente para esa temporada.'
      using errcode = '23505';
  end if;

  if v_code = 'dog_of_year' and exists (
    select 1
    from public.dog_awards a
    where a.award_code = 'dog_of_year'
      and a.season_id = p_season_id
      and a.revoked_at is null
  ) then
    raise exception 'Ya existe un Perro del Año vigente para esa temporada.'
      using errcode = '23505';
  end if;

  insert into public.dog_awards (
    dog_id,
    award_code,
    season_id,
    awarded_at,
    awarded_by,
    note
  ) values (
    p_dog_id,
    v_code,
    p_season_id,
    now(),
    auth.uid(),
    nullif(btrim(p_note), '')
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
    'ucapsa_dog_award.grant',
    'dog_award',
    v_id,
    jsonb_build_object(
      'dog_id', p_dog_id,
      'award_code', v_code,
      'season_id', p_season_id
    )
  );

  return v_id;
end;
$$;

create or replace function public.admin_revoke_ucapsa_dog_award(
  p_award_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award public.dog_awards%rowtype;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede revocar premios UCAPSA.';
  end if;

  select *
  into v_award
  from public.dog_awards
  where id = p_award_id
  for update;

  if not found then
    raise exception 'Premio UCAPSA no encontrado.';
  end if;

  if v_award.revoked_at is not null then
    raise exception 'El premio UCAPSA ya está revocado.';
  end if;

  update public.dog_awards
  set revoked_at = now(),
      revoked_by = auth.uid()
  where id = p_award_id;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_dog_award.revoke',
    'dog_award',
    p_award_id,
    jsonb_build_object(
      'dog_id', v_award.dog_id,
      'award_code', v_award.award_code,
      'season_id', v_award.season_id,
      'note', nullif(btrim(p_note), '')
    )
  );

  return p_award_id;
end;
$$;

revoke all on function public.admin_grant_ucapsa_dog_award(uuid,text,uuid,text)
  from public, anon, authenticated;
revoke all on function public.admin_revoke_ucapsa_dog_award(uuid,text)
  from public, anon, authenticated;

grant execute on function public.admin_grant_ucapsa_dog_award(uuid,text,uuid,text)
  to authenticated;
grant execute on function public.admin_revoke_ucapsa_dog_award(uuid,text)
  to authenticated;
