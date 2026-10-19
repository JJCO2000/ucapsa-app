-- Pruebas aisladas: resultados oficiales y mínimo privilegio.
create role authenticated nologin;
create role anon nologin;
create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid stable language sql as $uid$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$uid$;
create table public.profiles (
  user_id uuid primary key references auth.users(id), role text not null,
  full_name text,email text
);
create table public.dogs (
  id uuid primary key,user_id uuid references auth.users(id),name text
);
create or replace function public.is_ucapsa_staff()
returns boolean stable security definer language sql set search_path='' as $staff$
 select exists (select 1 from public.profiles p where p.user_id=auth.uid()
 and p.role in ('trainer','admin','super_admin'))
$staff$;
create or replace function public.can_ucapsa_staff_access_dog(p_dog_id uuid)
returns boolean stable security definer language sql set search_path='' as $dog$
 select public.is_ucapsa_staff() and exists(
   select 1 from public.dogs d where d.id=p_dog_id and d.name<>'Outside')
$dog$;
create table public.ucapsa_exams (
 id uuid primary key,code text,title text,status text
);
create table public.ucapsa_exam_attempts (
 id uuid primary key,exam_id uuid references public.ucapsa_exams(id),
 dog_id uuid references public.dogs(id),attempt_number integer,
 presented_at timestamptz,status text,is_official boolean,voided_at timestamptz
);
create table public.ucapsa_exam_items (
 id uuid primary key,exam_id uuid references public.ucapsa_exams(id),
 item_number integer,title text,max_points numeric,sort_order integer
);
create table public.ucapsa_exam_item_results (
 attempt_id uuid references public.ucapsa_exam_attempts(id),
 exam_item_id uuid references public.ucapsa_exam_items(id),
 points_awarded numeric,evaluator_note text,
 primary key(attempt_id,exam_item_id)
);
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
insert into public.profiles(user_id,role,full_name,email) values
 ('00000000-0000-4000-8000-000000000001','trainer','Trainer','trainer@test.invalid'),
 ('00000000-0000-4000-8000-000000000002','client','Client','client@test.invalid'),
 ('00000000-0000-4000-8000-000000000003','admin','Admin','admin@test.invalid');
insert into public.dogs(id,user_id,name) values
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','Firulais'),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002','Outside');
insert into public.ucapsa_exams(id,code,title,status) values
 ('00000000-0000-4000-8000-000000000020','EX-A','Prueba','published');
insert into public.ucapsa_exam_items(id,exam_id,item_number,title,max_points,sort_order) values
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000020',1,'Sit',10,1),
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000020',2,'Stay',20,2);
insert into public.ucapsa_exam_attempts(id,exam_id,dog_id,attempt_number,presented_at,status,is_official,voided_at) values
 ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010',1,now(),'published',true,null),
 ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000011',1,now(),'published',true,null),
 ('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010',2,now(),'published',true,now());
insert into public.ucapsa_exam_item_results(attempt_id,exam_item_id,points_awarded) values
 ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030',8),
 ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000030',10);
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated;
