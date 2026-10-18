-- UCAPSA · Rol Socio desde Superadmin: operación única, sin pagos inventados.
-- Reglas: general -> particular; una acción por pantalla; SSOT memberships.status + profiles.role.
-- Despliegue: aplicar SOLO después de CI y pruebas de permisos aisladas. No muta miembros al instalar.
-- No cambia pagos, asistencias, obligaciones, perfiles existentes ni niveles.
--
-- 1. Mantener staff independiente de cambios comerciales de membresía.
create or replace function public.sync_membership_status_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_actor uuid := auth.uid();
  v_has_active boolean;
  v_next_role public.app_role;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  else
    v_user_id := new.user_id;
  end if;

  -- Ignore ordinary edits that do not change membership state.
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  -- A cancellation stops only future obligations that still have an unpaid
  -- balance. This preserves paid evidence plus debt due today or already due.
  -- "Future" matches the canonical client payments rule: due_date > current_date.
  if tg_op <> 'DELETE'
     and new.status = 'cancelled'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.payment_obligations o
    set
      cancelled_at = v_now,
      cancelled_by = coalesce(o.cancelled_by, v_actor),
      updated_at = v_now
    where o.membership_id = new.id
      and o.cancelled_at is null
      and o.due_date > current_date
      and (
        o.amount - coalesce((
          select sum(p.amount)
          from public.payments p
          where p.obligation_id = o.id
            and p.status = 'paid'
            and p.voided_at is null
        ), 0)
      ) > 0.005;
  end if;

  select exists (
    select 1
    from public.memberships m
    where m.user_id = v_user_id
      and m.status = 'active'
  )
  into v_has_active;

  v_next_role := case
    when v_has_active then 'member'::public.app_role
    else 'client'::public.app_role
  end;

  update public.profiles p
  set
    role = v_next_role,
    updated_at = v_now
  where p.user_id = v_user_id
    and p.role not in ('trainer', 'admin', 'super_admin')
    and p.role is distinct from v_next_role;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;


-- 2. Extender el RPC canónico de Superadmin; nunca hacer dos escrituras separadas desde la app.
create or replace function public.superadmin_set_profile_role(
  p_user_id uuid,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_before_role text;
  v_before_membership_status text;
  v_role text := lower(btrim(coalesce(p_role, '')));
begin
  select p.role::text into v_actor_role
  from public.profiles p
  where p.user_id = auth.uid();

  if v_actor_role <> 'super_admin' then
    raise exception 'Solo Superadmin puede administrar roles.'
      using errcode = '42501';
  end if;

  if v_role not in ('client', 'member', 'trainer', 'admin') then
    raise exception 'Rol no permitido desde esta herramienta.'
      using errcode = '22023';
  end if;

  select p.role::text into v_before_role
  from public.profiles p
  where p.user_id = p_user_id
  for update;

  if v_before_role is null then
    raise exception 'Perfil no encontrado.' using errcode = '22023';
  end if;

  if v_before_role = 'super_admin' then
    raise exception 'Una cuenta Superadmin no se modifica desde esta herramienta.'
      using errcode = '42501';
  end if;

  -- La membresía es la fuente canónica de Socio; el perfil no genera pagos.
  -- Bloqueamos la ficha primero para serializar promociones simultáneas.
  select m.status::text
  into v_before_membership_status
  from public.memberships m
  where m.user_id = p_user_id
  for update;

  if v_role = 'member' then
    -- Reutiliza la única membresía de la cuenta. Nunca inventa folio, cuota
    -- pagada, comprobante o una obligación. El QR se genera con el default oficial.
    insert into public.memberships as m
      (user_id, status, start_date, end_date, approved_by)
    values (
      p_user_id,
      'active'::public.membership_status,
      (clock_timestamp() at time zone 'America/Mexico_City')::date,
      null,
      auth.uid()
    )
    on conflict (user_id) do update
    set status = 'active'::public.membership_status,
        start_date = coalesce(m.start_date, excluded.start_date),
        end_date = null,
        approved_by = auth.uid()
    where m.status is distinct from 'active'::public.membership_status;
  elsif v_role = 'client' and v_before_membership_status = 'active' then
    -- La baja comercial puede alterar obligaciones futuras: requiere su flujo
    -- administrativo separado y explícito, nunca se cancela silenciosamente.
    raise exception 'La membresía sigue activa. Gestiona su cancelación antes de cambiar a Cliente.'
      using errcode = '23514';
  end if;

  update public.profiles
  set role = v_role::public.app_role,
      updated_at = clock_timestamp()
  where user_id = p_user_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'profile.staff_role_change',
    'profile',
    p_user_id,
    jsonb_build_object('before_role', v_before_role, 'after_role', v_role, 'prior_membership_status', v_before_membership_status, 'membership_activated', v_role = 'member' AND v_before_membership_status IS DISTINCT FROM 'active')
  );

  return v_role;
end;
$$;


-- La función SECURITY DEFINER valida auth.uid() internamente.
revoke all on function public.superadmin_set_profile_role(uuid,text) from public, anon;
grant execute on function public.superadmin_set_profile_role(uuid,text) to authenticated, service_role;
