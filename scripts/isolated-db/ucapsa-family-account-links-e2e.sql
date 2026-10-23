-- Isolated PostgreSQL: mutual family consent never transfers ownership or permissions.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'ucapsa_test' THEN
  RAISE EXCEPTION 'Refusing production test';
END IF; END $$;

-- Preinscribe BEFORE creating separate Auth accounts (canonical invariant).

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT public.admin_preregister_dog_with_family(
  'Head Person','family-head@test.invalid','','Kira','puppy','base','',null,
  0,array[]::date[],'A real-looking synthetic record',false,
  '[{"full_name":"Other Person","email":"family-other@test.invalid"}]'::jsonb
);
RESET ROLE;
SELECT set_config('test.family_member_id',(
  SELECT f.id::text FROM ucapsa_intake.family_members f
  JOIN ucapsa_intake.people p ON p.id=f.person_id
  WHERE p.email_key='family-head@test.invalid' LIMIT 1
),false);

-- The head and relative each own independent accounts.
INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES ('00000000-0000-4000-8000-000000000971','family-head@test.invalid',now()),
       ('00000000-0000-4000-8000-000000000972','family-other@test.invalid',now());
INSERT INTO public.profiles(user_id,full_name,email,role)
VALUES ('00000000-0000-4000-8000-000000000971','Head Person','family-head@test.invalid','client'),
       ('00000000-0000-4000-8000-000000000972','Other Person','family-other@test.invalid','client');

-- Family name/contact alone is NOT permission to claim head's dogs.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',false);
DO $no_claim$
DECLARE response jsonb;
BEGIN
  response:=public.claim_my_first_preregistered_dogs();
  IF response->>'status' NOT IN ('none','unverified','not_applicable') THEN
    RAISE EXCEPTION 'Relative claimed head dogs: %',response;
  END IF;
END $no_claim$;
RESET ROLE;

-- Head claims only their own pre-enrollment.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000971',false);
DO $head_claim$
DECLARE response jsonb;
BEGIN
  response:=public.claim_my_first_preregistered_dogs();
  IF response->>'status'<>'linked' THEN
    RAISE EXCEPTION 'Owner claim not linked: %',response;
  END IF;
END $head_claim$;
RESET ROLE;

-- Even if the titular is already linked, Administración may add another relative.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $late_family$
DECLARE v_id uuid; created integer;
BEGIN
  SELECT intake_program_id INTO v_id
    FROM public.admin_get_preregistered_program_records(null::uuid)
    WHERE owner_email='family-head@test.invalid' LIMIT 1;
  created:=public.admin_add_preregistered_family_members(v_id,
    '[{"full_name":"Late Relative","phone":"+525555533344"}]'::jsonb);
  IF created<>1 OR
     (SELECT count(*) FROM public.admin_get_preregistered_family_members(v_id))<>2 THEN
    RAISE EXCEPTION 'Cannot add family after titular account linked';
  END IF;
END $late_family$;
RESET ROLE;

-- Relative can own a completely separate dog and progress history.
INSERT INTO public.dogs(user_id,name)
VALUES ('00000000-0000-4000-8000-000000000972','Rex');
INSERT INTO public.program_enrollments(
  user_id,dog_id,program_id,schedule_id,program_level,status,attendances_count
)
SELECT '00000000-0000-4000-8000-000000000972',d.id,p.id,s.id,
  'avanzado','active',2
FROM public.dogs d,public.programs p,public.program_schedules s
WHERE d.user_id='00000000-0000-4000-8000-000000000972'
  AND p.code='comandos' AND s.program_id=p.id LIMIT 1;

-- Nobody can see family progress before permission.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000971',false);
DO $no_data$
BEGIN
  IF (SELECT count(*) FROM public.get_my_family_progress())<>0 THEN
    RAISE EXCEPTION 'Private dogs visible before approval';
  END IF;
END $no_data$;
RESET ROLE;

-- Clients cannot approve a link by supplying a guessed member ID.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',false);
DO $client_denied$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.admin_authorize_family_account(
      current_setting('test.family_member_id')::uuid,'Met personally, checked identity');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'User forged admin authorization'; END IF;
END $client_denied$;
RESET ROLE;

-- Admin checks unambiguous identity and approves the request.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $approve$
DECLARE preview jsonb; result jsonb;
BEGIN
  preview:=public.admin_preview_family_account(current_setting('test.family_member_id')::uuid);
  IF preview->>'status'<>'available' THEN
    RAISE EXCEPTION 'Unexpected candidate preview: %',preview;
  END IF;
  result:=public.admin_authorize_family_account(
    current_setting('test.family_member_id')::uuid,
    'Checked both physical identities in person');
  IF result->>'status'<>'pending_acceptance' THEN
    RAISE EXCEPTION 'Family authorization failed';
  END IF;
END $approve$;
RESET ROLE;

-- Published notice 1.2 does not permit this new cross-account purpose.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000971',false);
DO $reject_old_notice$
DECLARE v_link_id uuid; denied boolean:=false;
BEGIN
 SELECT id INTO v_link_id FROM public.get_my_family_account_links() LIMIT 1;
 BEGIN
   PERFORM public.set_my_family_progress_consent(v_link_id,true);
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Old notice accidentally enabled family sharing'; END IF;
 IF EXISTS (SELECT 1 FROM public.get_my_family_progress()) THEN
   RAISE EXCEPTION 'Progress leaked under privacy notice 1.2';
 END IF;
END $reject_old_notice$;
RESET ROLE;

UPDATE public.privacy_notices SET status='retired' WHERE version='1.2-test';
INSERT INTO public.privacy_notices(version,status,integral_notice,simplified_notice,published_at)
VALUES ('1.4-family-test','published',
  'La consulta del progreso familiar es voluntaria y podrás revocar el consentimiento desde Perfil.',
  'Opcional: permitir consulta del progreso familiar entre dos cuentas que lo autoricen.',now());

-- Head can see one pending request; nobody can see a dog yet.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000971',false);
DO $head_approval$
DECLARE v_link_id uuid;
BEGIN
  IF (SELECT count(*) FROM public.get_my_family_account_links())<>1 THEN
    RAISE EXCEPTION 'Head has no family request';
  END IF;
  IF (SELECT count(*) FROM public.get_my_family_progress())<>0 THEN
    RAISE EXCEPTION 'Head sees other dog before both accepted';
  END IF;
  SELECT id INTO v_link_id FROM public.get_my_family_account_links() LIMIT 1;
  PERFORM public.set_my_family_progress_consent(v_link_id,true);
END $head_approval$;
RESET ROLE;

-- Only head consent: relative still cannot inspect head's progress.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',false);
DO $relative_approval$
DECLARE v_link_id uuid;
BEGIN
  IF (SELECT count(*) FROM public.get_my_family_progress())<>0 THEN
    RAISE EXCEPTION 'Relative sees head dog before accepting';
  END IF;
  SELECT id INTO v_link_id FROM public.get_my_family_account_links() LIMIT 1;
  IF v_link_id IS NULL THEN RAISE EXCEPTION 'Relative did not receive request'; END IF;
  PERFORM public.set_my_family_progress_consent(v_link_id,true);
END $relative_approval$;
RESET ROLE;

-- Both have opted in: read-only progress without photos, payments or editing.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000971',false);
DO $read_relative$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_my_family_progress()
    WHERE dog_name='Rex' AND program_level='avanzado' AND attendances_count=2) THEN
    RAISE EXCEPTION 'Head cannot read relative progress after mutual consent';
  END IF;
END $read_relative$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',false);
DO $read_head$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_my_family_progress()
    WHERE dog_name='Kira') THEN
    RAISE EXCEPTION 'Relative cannot read head dog after mutual consent';
  END IF;
END $read_head$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $stranger$
BEGIN
  IF (SELECT count(*) FROM public.get_my_family_account_links())<>0
     OR (SELECT count(*) FROM public.get_my_family_progress())<>0 THEN
    RAISE EXCEPTION 'Unrelated user accessed family progress';
  END IF;
END $stranger$;
RESET ROLE;

-- Publishing a NEW notice expires both earlier acceptances, even when purpose remains.
UPDATE public.privacy_notices SET status='retired' WHERE version='1.4-family-test';
INSERT INTO public.privacy_notices(version,status,integral_notice,simplified_notice,published_at)
VALUES ('1.5-family-test','published',
  'Seguimos permitiendo consultar el progreso familiar con autorización de ambas cuentas; puedes revocar el permiso.',
  'La consulta del progreso familiar es opcional.',now()+interval '1 second');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000971',false);
DO $invalidate_old_consent$
BEGIN
 IF EXISTS (SELECT 1 FROM public.get_my_family_progress()) THEN
  RAISE EXCEPTION 'Previously accepted policy permitted exposure after notice change';
 END IF;
 IF EXISTS (SELECT 1 FROM public.get_my_family_account_links() WHERE active OR my_accepted) THEN
  RAISE EXCEPTION 'Old notice consent still appears active';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.get_my_family_account_links() WHERE my_consent_recorded) THEN
  RAISE EXCEPTION 'Old revocable consent was hidden';
 END IF;
END $invalidate_old_consent$;
RESET ROLE;
-- A user can withdraw the old consent, even after the notice was replaced.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',false);
DO $revoke_obsolete_notice$
DECLARE v_id uuid;
BEGIN
 SELECT id INTO v_id FROM public.get_my_family_account_links() LIMIT 1;
 PERFORM public.set_my_family_progress_consent(v_id,false);
 IF EXISTS (SELECT 1 FROM public.get_my_family_account_links()
            WHERE my_consent_recorded) THEN
  RAISE EXCEPTION 'Old consent could not be revoked';
 END IF;
END $revoke_obsolete_notice$;
RESET ROLE;

-- Re-accept new version individually; one side alone cannot reveal anything.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000971',false);
SELECT public.set_my_family_progress_consent(
 (SELECT id FROM public.get_my_family_account_links() LIMIT 1),true);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',false);
DO $no_partial_renewal$
BEGIN
 IF EXISTS (SELECT 1 FROM public.get_my_family_progress()) THEN
   RAISE EXCEPTION 'One renewed consent exposed another user after privacy change';
 END IF;
END $no_partial_renewal$;
SELECT public.set_my_family_progress_consent(
 (SELECT id FROM public.get_my_family_account_links() LIMIT 1),true);
RESET ROLE;

-- Withdrawal from either side immediately closes both directions.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000972',false);
SELECT public.set_my_family_progress_consent(
  (SELECT id FROM public.get_my_family_account_links() LIMIT 1), false);
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000971',false);
DO $withdrawn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_my_family_progress()) THEN
    RAISE EXCEPTION 'Head still sees progress after relative withdrawal';
  END IF;
END $withdrawn$;
RESET ROLE;

-- Admin revokes and logs, leaving independent dogs, enrollment and memberships intact.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT public.admin_revoke_family_account(
  current_setting('test.family_member_id')::uuid,'Request retracted after identity review');
RESET ROLE;
DO $final$
BEGIN
  IF EXISTS (SELECT 1 FROM public.dogs WHERE name='Rex'
    AND user_id<>'00000000-0000-4000-8000-000000000972') OR
     NOT EXISTS (SELECT 1 FROM public.dogs WHERE name='Kira'
       AND user_id='00000000-0000-4000-8000-000000000971') THEN
    RAISE EXCEPTION 'Family relationship changed dog ownership';
  END IF;
  IF (SELECT count(*) FROM public.program_enrollments
    WHERE user_id='00000000-0000-4000-8000-000000000972')<>1 THEN
    RAISE EXCEPTION 'Independent enrollment was altered';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_logs
    WHERE action='family.account_revoked') THEN
    RAISE EXCEPTION 'Revocation audit missing';
  END IF;
END $final$;
SELECT 'UCAPSA mutual family authorization and isolated progress: PASS' AS result;
