-- UCAPSA Rango 1 — ajustes Admin dog-specific por temporada
--
-- Dami/Admin puede sumar o restar puntos directamente a un perro sin motivo
-- obligatorio. Nunca se sobrescribe un total: cada cambio es un movimiento
-- append-only. Una correccion se hace con un movimiento inverso.
--
-- Este producto NO usa ni migra ucapsa_points_* (sistema legado) y todavía no
-- define la escala de Rango/Ranking.

-- ---------------------------------------------------------------------------
-- Integridad append-only.
-- ---------------------------------------------------------------------------

create unique index if not exists ucapsa_competition_adjustments_one_reversal_idx
  on public.ucapsa_competition_adjustments (reversal_of_id)
  where reversal_of_id is not null;

create or replace function public.ucapsa_guard_competition_adjustment_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Los ajustes UCAPSA son append-only. Crea un movimiento inverso para corregirlos.'
    using errcode = '55000';
end;
$$;

revoke all on function public.ucapsa_guard_competition_adjustment_append_only()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_adjustment_append_only
  on public.ucapsa_competition_adjustments;
create trigger trg_ucapsa_guard_adjustment_append_only
before update or delete on public.ucapsa_competition_adjustments
for each row execute function public.ucapsa_guard_competition_adjustment_append_only();

-- ---------------------------------------------------------------------------
-- Resumen derivado. El total de ajustes nunca se captura manualmente.
-- ---------------------------------------------------------------------------

create or replace view public.ucapsa_competition_adjustment_summary
with (security_invoker = true)
as
select
  a.season_id,
  a.dog_id,
  d.name as dog_name,
  count(*) as movement_count,
  sum(a.points) as adjustment_points,
  max(a.occurred_at) as last_adjustment_at
from public.ucapsa_competition_adjustments a
join public.dogs d on d.id = a.dog_id
group by a.season_id, a.dog_id, d.name;

revoke all on table public.ucapsa_competition_adjustment_summary
  from public, anon, authenticated;
grant select on table public.ucapsa_competition_adjustment_summary
  to authenticated;
grant select on table public.ucapsa_competition_adjustment_summary
  to service_role;

-- ---------------------------------------------------------------------------
-- Movimiento manual Admin.
-- ---------------------------------------------------------------------------

create or replace function public.admin_add_ucapsa_competition_adjustment(
  p_season_id uuid,
  p_dog_id uuid,
  p_points numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_season_status text;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede ajustar puntos UCAPSA.';
  end if;

  if p_points is null or p_points = 0 then
    raise exception 'El ajuste debe ser distinto de cero.';
  end if;

  if not exists (
    select 1 from public.dogs d where d.id = p_dog_id
  ) then
    raise exception 'Perro UCAPSA no encontrado.';
  end if;

  select s.status into v_season_status
  from public.ucapsa_competition_seasons s
  where s.id = p_season_id;

  if not found then
    raise exception 'Temporada UCAPSA no encontrada.';
  end if;

  if v_season_status not in ('active', 'reopened') then
    raise exception 'Los ajustes solo pueden registrarse en una temporada activa o reabierta.'
      using errcode = '55000';
  end if;

  perform public.ucapsa_assert_competition_season_mutable(p_season_id);

  insert into public.ucapsa_competition_adjustments (
    season_id,
    dog_id,
    points,
    note,
    occurred_at,
    created_by
  ) values (
    p_season_id,
    p_dog_id,
    p_points,
    nullif(btrim(p_note), ''),
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
    'ucapsa_competition_adjustment.create',
    'ucapsa_competition_adjustment',
    v_id,
    jsonb_build_object(
      'season_id', p_season_id,
      'dog_id', p_dog_id,
      'points', p_points
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reversion: no modifica el movimiento original; inserta su opuesto.
-- ---------------------------------------------------------------------------

create or replace function public.admin_reverse_ucapsa_competition_adjustment(
  p_adjustment_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.ucapsa_competition_adjustments%rowtype;
  v_reversal_id uuid;
  v_season_status text;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede revertir ajustes UCAPSA.';
  end if;

  select *
  into v_original
  from public.ucapsa_competition_adjustments
  where id = p_adjustment_id
  for share;

  if not found then
    raise exception 'Ajuste UCAPSA no encontrado.';
  end if;

  if v_original.reversal_of_id is not null then
    raise exception 'Un movimiento de reversión no puede revertirse otra vez.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.ucapsa_competition_adjustments a
    where a.reversal_of_id = p_adjustment_id
  ) then
    raise exception 'Este ajuste UCAPSA ya fue revertido.'
      using errcode = '55000';
  end if;

  select s.status into v_season_status
  from public.ucapsa_competition_seasons s
  where s.id = v_original.season_id;

  if v_season_status not in ('active', 'reopened') then
    raise exception 'Reabre la temporada antes de revertir un ajuste.'
      using errcode = '55000';
  end if;

  perform public.ucapsa_assert_competition_season_mutable(v_original.season_id);

  insert into public.ucapsa_competition_adjustments (
    season_id,
    dog_id,
    points,
    note,
    reversal_of_id,
    occurred_at,
    created_by
  ) values (
    v_original.season_id,
    v_original.dog_id,
    -v_original.points,
    coalesce(
      nullif(btrim(p_note), ''),
      format('Reversión de ajuste %s', p_adjustment_id)
    ),
    p_adjustment_id,
    now(),
    auth.uid()
  )
  returning id into v_reversal_id;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_competition_adjustment.reverse',
    'ucapsa_competition_adjustment',
    v_reversal_id,
    jsonb_build_object(
      'reversal_of_id', p_adjustment_id,
      'season_id', v_original.season_id,
      'dog_id', v_original.dog_id,
      'points', -v_original.points
    )
  );

  return v_reversal_id;
end;
$$;

revoke all on function public.admin_add_ucapsa_competition_adjustment(uuid,uuid,numeric,text)
  from public, anon, authenticated;
revoke all on function public.admin_reverse_ucapsa_competition_adjustment(uuid,text)
  from public, anon, authenticated;

grant execute on function public.admin_add_ucapsa_competition_adjustment(uuid,uuid,numeric,text)
  to authenticated;
grant execute on function public.admin_reverse_ucapsa_competition_adjustment(uuid,text)
  to authenticated;
