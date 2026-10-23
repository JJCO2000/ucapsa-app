-- Synthetic only. Do not execute in production.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'ucapsa_test' THEN
    RAISE EXCEPTION 'Ranking-photo test refuses non-test database';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.dogs(
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
  photo_path text, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.privacy_notices(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL, status text NOT NULL,
  integral_notice text NOT NULL, simplified_notice text NOT NULL,
  published_at timestamptz
);
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
INSERT INTO public.dogs(id,user_id,photo_path,is_active) VALUES
 ('00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000002','source-one.jpg',true),
 ('00000000-0000-4000-8000-000000000052','00000000-0000-4000-8000-000000000003',null,true);
INSERT INTO public.privacy_notices(version,status,integral_notice,simplified_notice,published_at)
VALUES('1.2-appstores-2026-09-27','published','Privacidad previa','Privacidad previa',now()-interval '2 days');

\ir ../../supabase/migrations/20261021183000_private_ranking_photo_consent.sql

-- The private consent tables are never exposed directly to clients.
DO $permissions$
BEGIN
  IF has_table_privilege('authenticated','public.dog_ranking_photo_consents','SELECT')
    OR has_table_privilege('anon','public.dog_ranking_photo_consents','SELECT')
    OR has_table_privilege('authenticated','public.dog_ranking_photo_consent_events','SELECT')
    OR has_function_privilege('anon',
        'public.set_my_dog_ranking_photo_consent(uuid,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'Photo consent table or privileged RPC leaked';
  END IF;
END $permissions$;

-- Client cannot use someone else's dog's ID. Pre-1.4 consent cannot grant photo.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $old_notice$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.set_my_dog_ranking_photo_consent(
      '00000000-0000-4000-8000-000000000051',true);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Consent accepted with obsolete notice'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.set_my_dog_ranking_photo_consent(
      '00000000-0000-4000-8000-000000000052',true);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Client consented to another dog'; END IF;
END $old_notice$;
RESET ROLE;

-- New notice text and explicit institutional approval both required.
UPDATE public.privacy_notices SET status='retired' WHERE version LIKE '1.2%';
INSERT INTO public.privacy_notices(version,status,integral_notice,simplified_notice,published_at)
VALUES('1.4-current','published','Se permite foto pública voluntaria','foto pública opcional',now());
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $no_flag$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.set_my_dog_ranking_photo_consent(
      '00000000-0000-4000-8000-000000000051',true);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Version 1.4 without flag was accepted'; END IF;
END $no_flag$;
RESET ROLE;

UPDATE public.privacy_notices
SET ranking_photo_publication_approved=true WHERE version='1.4-current';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $approved$
BEGIN
  IF NOT public.set_my_dog_ranking_photo_consent(
      '00000000-0000-4000-8000-000000000051',true) THEN
    RAISE EXCEPTION 'Owner was not able to consent';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.get_my_dog_ranking_photo_consents()
    WHERE dog_id='00000000-0000-4000-8000-000000000051' AND enabled
  ) THEN
    RAISE EXCEPTION 'Owner cannot read consent after authorization';
  END IF;
END $approved$;
RESET ROLE;

-- Another user must not see or revoke this grant by RPC.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
DO $other_user$
DECLARE denied boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.get_my_dog_ranking_photo_consents()
       WHERE dog_id='00000000-0000-4000-8000-000000000051') THEN
    RAISE EXCEPTION 'Other user read owner consent';
  END IF;
  BEGIN
    PERFORM public.set_my_dog_ranking_photo_consent(
      '00000000-0000-4000-8000-000000000051',false);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Other user revoked owner consent'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.set_my_dog_ranking_photo_consent(
      '00000000-0000-4000-8000-000000000052',true);
  EXCEPTION WHEN raise_exception THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Photo-free dog was authorized'; END IF;
END $other_user$;
RESET ROLE;

-- New source photo revokes immediately; nothing gets automatically re-authorized.
UPDATE public.dogs SET photo_path='source-two.jpg'
WHERE id='00000000-0000-4000-8000-000000000051';
DO $photo_changed$
BEGIN
 IF EXISTS(SELECT 1 FROM public.dog_ranking_photo_consents WHERE revoked_at IS NULL) THEN
  RAISE EXCEPTION 'Changed source photo preserved public permission';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dog_ranking_photo_consent_events
   WHERE action='photo_changed') THEN
  RAISE EXCEPTION 'Source change was not audited';
 END IF;
END $photo_changed$;

-- An updated privacy notice disables the old consent. Revocation ALWAYS works.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT public.set_my_dog_ranking_photo_consent(
  '00000000-0000-4000-8000-000000000051',true);
RESET ROLE;
UPDATE public.privacy_notices SET status='retired' WHERE version='1.4-current';
INSERT INTO public.privacy_notices(version,status,integral_notice,simplified_notice,published_at)
VALUES('1.5-replacement','published','New notice','New summary',now()+interval '1 second');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $replacement$
BEGIN
 IF EXISTS(SELECT 1 FROM public.get_my_dog_ranking_photo_consents() WHERE enabled) THEN
   RAISE EXCEPTION 'Old consent remained enabled after notice replacement';
 END IF;
 IF public.set_my_dog_ranking_photo_consent(
  '00000000-0000-4000-8000-000000000051',false) THEN
   RAISE EXCEPTION 'Revocation did not return false';
 END IF;
END $replacement$;
RESET ROLE;
DO $final$
BEGIN
 IF (SELECT count(*) FROM public.dog_ranking_photo_consent_events
   WHERE action='grant')<>2 THEN RAISE EXCEPTION 'Unexpected grants'; END IF;
 IF (SELECT count(*) FROM public.dog_ranking_photo_consents WHERE revoked_at IS NULL)<>0 THEN
   RAISE EXCEPTION 'Authorized photos left published'; END IF;
END $final$;
SELECT 'Ranking private photo consent isolated DB e2e: PASS' AS result;
