-- Prevent normal admins from promoting clients/members into Trainer.
-- Preserve legitimate client/member transitions and existing profile invariants.
-- Every transition into or out of trainer/admin/super_admin requires Superadmin.
BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Trusted service/SQL maintenance does not have an end-user auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'No puedes cambiar el id del perfil.';
  END IF;
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'No puedes cambiar el user_id del perfil.';
  END IF;
  IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'No puedes cambiar la fecha de creación del perfil.';
  END IF;
  IF OLD.deletion_requested_at IS DISTINCT FROM NEW.deletion_requested_at
     OR OLD.deletion_request_reason IS DISTINCT FROM NEW.deletion_request_reason THEN
    RAISE EXCEPTION 'La baja de cuenta debe gestionarse mediante el flujo canónico.';
  END IF;
  IF OLD.email IS DISTINCT FROM NEW.email AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No puedes cambiar el email del perfil.';
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'No tienes permiso para cambiar roles.';
    END IF;

    -- Sensitive role transitions must not bypass superadmin_set_profile_role
    -- through a direct profiles UPDATE by an ordinary admin.
    IF (
      OLD.role IN ('trainer', 'admin', 'super_admin')
      OR NEW.role IN ('trainer', 'admin', 'super_admin')
    ) AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Solo super_admin puede modificar roles de personal.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
