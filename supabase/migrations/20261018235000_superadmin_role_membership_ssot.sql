-- UCAPSA: un rol efectivo por perfil. Socio es membresía comercial, no Comandos.
-- No aplicar a producción antes de CI aislado, integración y revisión de permisos.
create or replace function public.superadmin_set_profile_role(
  p_user_id uuid, p_role text
) returns text
language plpgsql security definer set search_path=''
as $fn$
declare
  v_actor uuid := auth.uid();
  v_target_role text := lower(btrim(coalesce(p_role,'')));
  v_previous text;
  v_membership public.memberships%rowtype;
  v_membership_action text := 'none';
  v_member_number text;
begin
  if v_actor is null or not exists(
    select 1 from public.profiles p
    where p.user_id=v_actor and p.role='super_admin'
  ) then
    raise exception 'Solo Superadmin puede gestionar roles.' using errcode='42501';
  end if;
  if v_target_role not in ('client','member','trainer','admin','super_admin') then
    raise exception 'Rol no permitido.' using errcode='22023';
  end if;
  select p.role::text into v_previous
  from public.profiles p where p.user_id=p_user_id for update;
  if v_previous is null then
    raise exception 'Perfil no encontrado.' using errcode='22023';
  end if;
  if v_previous='super_admin' and v_target_role<>'super_admin' then
    -- La vista previa de roles es otro flujo; jamás retirar Superadmin
    -- accidentalmente desde el selector operativo.
    raise exception 'No se puede degradar una cuenta Superadmin desde este selector.'
      using errcode='42501';
  end if;
  if p_user_id=v_actor and v_previous<>v_target_role then
    raise exception 'No cambies el acceso de la sesión actual desde este selector.'
      using errcode='42501';
  end if;
  if v_target_role=v_previous then return v_target_role; end if;

  -- Un cambio a Socio concede membresía, sin fabricar un pago.
  -- El estado "not_required" distingue la concesión administrativa.
  select * into v_membership from public.memberships
    where user_id=p_user_id for update;
  if v_target_role='member' then
    v_member_number:=coalesce(nullif(btrim(v_membership.member_number),''),
      'SOC-' || replace(p_user_id::text,'-',''));
    insert into public.memberships(
      user_id,member_number,status,start_date,end_date,
      approved_by,current_payment_status
    ) values (
      p_user_id,v_member_number,'active',current_date,null,
      v_actor,'not_required'
    )
    on conflict(user_id) do update set
      member_number=coalesce(public.memberships.member_number,excluded.member_number),
      status='active',
      start_date=coalesce(public.memberships.start_date,excluded.start_date),
      end_date=null,
      approved_by=v_actor,
      current_payment_status=case
        when public.memberships.current_payment_status='paid' then 'paid'
        else 'not_required'
      end,
      updated_at=clock_timestamp();
    v_membership_action:='granted';
  elsif v_membership.id is not null and v_membership.status='active' then
    -- Revocar beneficios sin borrar ningún pago ni historial.
    update public.memberships set status='cancelled',
      end_date=greatest(current_date,coalesce(start_date,current_date)),
      updated_at=clock_timestamp()
    where id=v_membership.id;
    v_membership_action:='deactivated';
  end if;

  update public.profiles set role=v_target_role::public.app_role,
    updated_at=clock_timestamp() where user_id=p_user_id;

  insert into public.admin_audit_logs(
    admin_user_id,action,entity_type,entity_id,details
  ) values (
    v_actor,'profile.staff_role_change','profile',p_user_id,
    pg_catalog.jsonb_build_object(
      'before_role',v_previous,'after_role',v_target_role,
      'membership_action',v_membership_action,
      'authorization','superadmin_operator'
    )
  );
  return v_target_role;
end;
$fn$;
revoke all on function public.superadmin_set_profile_role(uuid,text)
  from public,anon;
grant execute on function public.superadmin_set_profile_role(uuid,text)
  to authenticated,service_role;
