-- UCAPSA Paso 2: harden the EXISTING operational role RPC, independent of
-- commercial membership, Puppy/Comandos, payments and history.
-- Important: v_actor_role <> 'super_admin' is NULL (not TRUE) for a missing
-- profile. SECURITY DEFINER must deny absent/invalid actor identities.
CREATE OR REPLACE FUNCTION public.superadmin_set_profile_role(
  p_user_id uuid, p_role text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor_role text;
  v_before_role text;
  v_role text := lower(btrim(coalesce(p_role, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Solo Superadmin puede cambiar roles de staff.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.role::text INTO v_actor_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF v_actor_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Solo Superadmin puede cambiar roles de staff.'
      USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('client', 'trainer', 'admin') THEN
    RAISE EXCEPTION 'Rol no permitido desde esta herramienta.'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.role::text INTO v_before_role
  FROM public.profiles p
  WHERE p.user_id = p_user_id
  FOR UPDATE;

  IF v_before_role IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado.' USING ERRCODE = '22023';
  END IF;

  IF v_before_role = 'super_admin' THEN
    RAISE EXCEPTION 'Una cuenta Superadmin no se modifica desde esta herramienta.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET role = v_role::public.app_role,
      updated_at = clock_timestamp()
  WHERE user_id = p_user_id;

  INSERT INTO public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) VALUES (
    auth.uid(), 'profile.staff_role_change', 'profile', p_user_id,
    pg_catalog.jsonb_build_object('before_role', v_before_role, 'after_role', v_role)
  );

  RETURN v_role;
END;
$function$;

REVOKE ALL ON FUNCTION public.superadmin_set_profile_role(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_set_profile_role(uuid,text)
  TO authenticated, service_role;
