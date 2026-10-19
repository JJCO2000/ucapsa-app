-- Synthetic-only fixture. Never run outside PostgreSQL ephemeral CI database.
DO $guard$ BEGIN
  IF current_database() <> 'ucapsa_exam_draft_test' THEN
    RAISE EXCEPTION 'Refusing non-test database';
  END IF;
END $guard$;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid STABLE LANGUAGE sql AS $uid$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$uid$;
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id), role text NOT NULL
);
CREATE FUNCTION public.is_ucapsa_staff() RETURNS boolean STABLE SECURITY DEFINER
LANGUAGE sql SET search_path = '' AS $staff$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role IN ('trainer','admin','super_admin'));
$staff$;
CREATE TABLE public.ucapsa_competition_seasons (
  id uuid PRIMARY KEY, status text NOT NULL
);
CREATE TABLE public.ucapsa_exams (
  id uuid PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES public.ucapsa_competition_seasons(id),
  code text NOT NULL, title text NOT NULL, exam_date date,
  status text NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.ucapsa_exam_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.ucapsa_exams(id),
  item_number integer NOT NULL,
  title text NOT NULL, description text, max_points numeric NOT NULL,
  sort_order integer NOT NULL
);
CREATE TABLE public.ucapsa_exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), exam_id uuid REFERENCES public.ucapsa_exams(id)
);
CREATE TABLE public.admin_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id uuid NOT NULL, action text NOT NULL,
  entity_type text NOT NULL, entity_id uuid, details jsonb
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ucapsa_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ucapsa_exam_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ucapsa_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003'),
 ('00000000-0000-4000-8000-000000000004'),
 ('00000000-0000-4000-8000-000000000005');
INSERT INTO public.profiles(user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001','client'),
 ('00000000-0000-4000-8000-000000000002','member'),
 ('00000000-0000-4000-8000-000000000003','trainer'),
 ('00000000-0000-4000-8000-000000000004','admin'),
 ('00000000-0000-4000-8000-000000000005','super_admin');
INSERT INTO public.ucapsa_competition_seasons(id,status) VALUES
 ('00000000-0000-4000-8000-000000000010','active'),
 ('00000000-0000-4000-8000-000000000011','closed');
INSERT INTO public.ucapsa_exams(id,season_id,code,title,status,updated_at) VALUES
 ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','EX-A','Editable','draft','2026-10-01 00:00:00+00'),
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000010','EX-PUB','Published','published','2026-10-01 00:00:00+00'),
 ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000011','EX-CLOSED','Closed','draft','2026-10-01 00:00:00+00'),
 ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000010','EX-ATT','Attempt exists','draft','2026-10-01 00:00:00+00'),
 ('00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000010','EX-OTHER','Other','draft','2026-10-01 00:00:00+00');
INSERT INTO public.ucapsa_exam_items(exam_id,item_number,title,description,max_points,sort_order) VALUES
 ('00000000-0000-4000-8000-000000000020',1,'Sit','Baseline',10,1),
 ('00000000-0000-4000-8000-000000000020',2,'Stay','Baseline',20,2),
 ('00000000-0000-4000-8000-000000000021',1,'Frozen',null,12,1),
 ('00000000-0000-4000-8000-000000000022',1,'Closed',null,5,1),
 ('00000000-0000-4000-8000-000000000023',1,'Attempt',null,5,1);
INSERT INTO public.ucapsa_exam_attempts(id,exam_id) VALUES
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000023');