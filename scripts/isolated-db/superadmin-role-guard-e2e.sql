\set ON_ERROR_STOP on
DO $guard$ BEGIN
  IF current_database() <> 'ucapsa_role_guard_test' THEN
    RAISE EXCEPTION 'Refuse non-test database';
  END IF;
END $guard$;

-- Synthetic users only. This is a focused authorization regression test,
-- not a simulation of every production trigger or RLS policy.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM ('client','member','trainer','admin','super_admin');
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $uid$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$uid$;
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  role public.app_role NOT NULL,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.admin_audit_logs (
  admin_user_id uuid REFERENCES auth.users(id),
  action text, entity_type text, entity_id uuid, details jsonb
);
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id), status text NOT NULL
);
CREATE TABLE public.program_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid REFERENCES public.memberships(id), status text NOT NULL
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid REFERENCES public.memberships(id), amount numeric NOT NULL
);
INSERT INTO auth.users(id) VALUES
  ('00000000-0000-4000-8000-000000000001'), -- superadmin
  ('00000000-0000-4000-8000-000000000002'), -- client
  ('00000000-0000-4000-8000-000000000003'), -- member
  ('00000000-0000-4000-8000-000000000004'), -- trainer
  ('00000000-0000-4000-8000-000000000005'), -- admin
  ('00000000-0000-4000-8000-000000000006'); -- authenticated but no profile
INSERT INTO public.profiles(user_id,role) VALUES
  ('00000000-0000-4000-8000-000000000001','super_admin'),
  ('00000000-0000-4000-8000-000000000002','client'),
  ('00000000-0000-4000-8000-000000000003','member'),
  ('00000000-0000-4000-8000-000000000004','trainer'),
  ('00000000-0000-4000-8000-000000000005','admin');
INSERT INTO public.memberships(user_id,status) VALUES
  ('00000000-0000-4000-8000-000000000003','active');
INSERT INTO public.program_enrollments(membership_id,status)
  SELECT id,'active' FROM public.memberships;
INSERT INTO public.payments(membership_id,amount)
  SELECT id,123 FROM public.memberships;

GRANT USAGE ON SCHEMA auth, public TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

\i supabase/migrations/20261019064812_superadmin_operational_role_null_guard.sql

DO $privileges$ BEGIN
  IF has_function_privilege('anon', 'public.superadmin_set_profile_role(uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.superadmin_set_profile_role(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Unexpected RPC grants'; END IF;
END $privileges$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
DO $null_actor$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.superadmin_set_profile_role(
      '00000000-0000-4000-8000-000000000002','admin');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Missing JWT identity was allowed'; END IF;
END $null_actor$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',false);
DO $missing_profile$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.superadmin_set_profile_role(
      '00000000-0000-4000-8000-000000000006','admin');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Authenticated user with no profile promoted itself'; END IF;
END $missing_profile$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $client_denied$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.superadmin_set_profile_role(
      '00000000-0000-4000-8000-000000000002','admin');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Client escalated own role'; END IF;
END $client_denied$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
DO $trainer_denied$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.superadmin_set_profile_role(
      '00000000-0000-4000-8000-000000000002','admin');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Trainer assigned staff role'; END IF;
END $trainer_denied$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
DO $admin_denied$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.superadmin_set_profile_role(
      '00000000-0000-4000-8000-000000000002','trainer');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Admin assigned staff role'; END IF;
END $admin_denied$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT public.superadmin_set_profile_role('00000000-0000-4000-8000-000000000003','trainer');
SELECT public.superadmin_set_profile_role('00000000-0000-4000-8000-000000000003','client');
SELECT public.superadmin_set_profile_role('00000000-0000-4000-8000-000000000003','admin');

DO $super_denied$
DECLARE denied_self boolean := false; denied_promote boolean := false;
BEGIN
  BEGIN
    PERFORM public.superadmin_set_profile_role(
      '00000000-0000-4000-8000-000000000001','client');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied_self := true;
  END;
  BEGIN
    PERFORM public.superadmin_set_profile_role(
      '00000000-0000-4000-8000-000000000002','super_admin');
  EXCEPTION WHEN SQLSTATE '22023' THEN denied_promote := true;
  END;
  IF NOT denied_self OR NOT denied_promote THEN
    RAISE EXCEPTION 'Superadmin protection or permitted-role allowlist broken';
  END IF;
END $super_denied$;
RESET ROLE;
DO $assertions$
BEGIN
  IF (SELECT role FROM public.profiles WHERE user_id='00000000-0000-4000-8000-000000000002') <> 'client'
  OR (SELECT role FROM public.profiles WHERE user_id='00000000-0000-4000-8000-000000000003') <> 'admin'
  OR (SELECT role FROM public.profiles WHERE user_id='00000000-0000-4000-8000-000000000001') <> 'super_admin'
  THEN RAISE EXCEPTION 'Role transition incorrect'; END IF;
  IF (SELECT count(*) FROM public.memberships WHERE status='active') <> 1
    OR (SELECT count(*) FROM public.program_enrollments WHERE status='active') <> 1
    OR (SELECT count(*) FROM public.payments WHERE amount=123) <> 1
  THEN RAISE EXCEPTION 'Operational role changes affected commercial/program data'; END IF;
  IF (SELECT count(*) FROM public.admin_audit_logs WHERE action='profile.staff_role_change') <> 3
  THEN RAISE EXCEPTION 'Expected three authorized audit events'; END IF;
END $assertions$;
SELECT 'Superadmin operational role guard: PASS' AS result;
