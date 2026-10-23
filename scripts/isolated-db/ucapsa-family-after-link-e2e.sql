-- Synthetic only. Requires preregistration staging test and original family migration.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'ucapsa_test' THEN
    RAISE EXCEPTION 'Test must never run on production';
  END IF;
END $$;
BEGIN;
-- Simulate a valid existing official user who has linked the original intake.
-- Neither the dog nor the program is reassigned to the newly entered relative.
UPDATE ucapsa_intake.people
SET status = 'linked',
    linked_user_id = '00000000-0000-4000-8000-000000000996',
    linked_at = now()
WHERE email_key = 'admin-family@test.invalid' AND status = 'pending';
DO $setup$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ucapsa_intake.people
    WHERE email_key='admin-family@test.invalid'
      AND status='linked' AND linked_user_id='00000000-0000-4000-8000-000000000996'
  ) THEN
    RAISE EXCEPTION 'Test fixture was not successfully linked';
  END IF;
END $setup$;
SELECT set_config('test.linked_family_record',(
  SELECT ip.id::text FROM ucapsa_intake.programs ip
    JOIN ucapsa_intake.dogs d ON d.id=ip.dog_id
    JOIN ucapsa_intake.people p ON p.id=d.person_id
   WHERE p.email_key='admin-family@test.invalid'
   LIMIT 1
),false);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $admin_add$
DECLARE added integer;
BEGIN
  added:=public.admin_add_preregistered_family_members(
    current_setting('test.linked_family_record')::uuid,
    '[{"full_name":"Luisa Prueba","email":"luisa.test@example.invalid"}]'::jsonb);
  IF added<>1 THEN RAISE EXCEPTION 'Linked titular cannot add family'; END IF;
  added:=public.admin_add_preregistered_family_members(
    current_setting('test.linked_family_record')::uuid,
    '[{"full_name":"Luisa Prueba","email":"luisa.test@example.invalid"}]'::jsonb);
  IF added<>0 THEN RAISE EXCEPTION 'Duplicate was not ignored'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_get_preregistered_family_members(
      current_setting('test.linked_family_record')::uuid)
    WHERE full_name='Luisa Prueba'
  ) THEN
    RAISE EXCEPTION 'Family was not visible to Admin';
  END IF;
END $admin_add$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $client_denied$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.admin_add_preregistered_family_members(
      current_setting('test.linked_family_record')::uuid,
      '[{"full_name":"Hacker Persona","email":"hacker.test@example.invalid"}]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Client added relative without Admin permission'; END IF;
END $client_denied$;
RESET ROLE;

DO $no_transfer$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ucapsa_intake.people
    WHERE email_key='admin-family@test.invalid'
      AND status='linked' AND linked_user_id='00000000-0000-4000-8000-000000000996'
  ) THEN RAISE EXCEPTION 'Original owner was changed'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email='luisa.test@example.invalid') THEN
    RAISE EXCEPTION 'Adding family created an account'; END IF;
  IF EXISTS (
    SELECT 1 FROM ucapsa_intake.people WHERE email_key='luisa.test@example.invalid'
  ) THEN
    RAISE EXCEPTION 'Adding family created duplicate titular'; END IF;
END $no_transfer$;
ROLLBACK;
SELECT 'UCAPSA linked-titular family addition: PASS' AS result;
