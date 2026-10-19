-- Prevent commercial membership status changes from silently cancelling live Puppy/Comandos enrollments.
-- SSOT: membership entitlement != program enrollment; never fabricate card access or payments.
-- The existing AFTER UPDATE lifecycle and training-access triggers remain unchanged.
CREATE OR REPLACE FUNCTION public.guard_active_membership_program_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $guard$
BEGIN
  IF OLD.status = 'active'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND EXISTS (
       SELECT 1 FROM public.program_enrollments AS e
       WHERE e.membership_id = OLD.id
         AND e.status = 'active'
         AND e.access_mode = 'membership'
     )
  THEN
    RAISE EXCEPTION
      'No se puede desactivar esta membresía: existen clases Puppy/Comandos activas vinculadas. Administración debe revisar su acceso antes.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$guard$;

REVOKE ALL ON FUNCTION public.guard_active_membership_program_access()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_active_membership_program_access ON public.memberships;
CREATE TRIGGER trg_guard_active_membership_program_access
BEFORE UPDATE OF status ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.guard_active_membership_program_access();
