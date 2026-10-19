-- First claim: automatic by phone OR email. Later competing claims:
-- never transfer another user's linked dossier; open an Admin review ticket.
create table if not exists ucapsa_intake.owner_link_requests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references ucapsa_intake.people(id) on delete restrict,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','reviewed','rejected')),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique(person_id, requester_user_id)
);
create index if not exists owner_link_requests_pending_idx
  on ucapsa_intake.owner_link_requests (status,created_at desc);
alter table ucapsa_intake.owner_link_requests enable row level security;
revoke all on ucapsa_intake.owner_link_requests from public,anon,authenticated;
grant select,insert,update on ucapsa_intake.owner_link_requests to service_role;

create or replace function public.request_my_preregistration_link_review()
returns jsonb language plpgsql security definer set search_path=''
as $request$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_phone text;
  v_person_id uuid;
  v_matches integer;
  v_status text;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesion.' using errcode='42501';
  end if;
  select nullif(pg_catalog.lower(pg_catalog.btrim(u.email)),''),
         ucapsa_intake.normalize_profile_phone(coalesce(nullif(p.phone,''),nullif(u.phone,'')))
    into v_email,v_phone
  from auth.users u join public.profiles p on p.user_id=u.id
  where u.id=v_user;
  if v_email is null and v_phone is null then
    return pg_catalog.jsonb_build_object('status','no_contact');
  end if;
  -- Only a ALREADY LINKED preregistration, owned by a different user, can
  -- generate a request. No person name, dog name, or contact is returned.
  select count(*),min(p.id::text)::uuid into v_matches,v_person_id
  from ucapsa_intake.people p
  where p.status='linked' and p.linked_user_id is distinct from v_user
    and ((v_email is not null and p.email_key=v_email)
         or (v_phone is not null and p.phone_e164=v_phone));
  if v_matches=0 then
    return pg_catalog.jsonb_build_object('status','none');
  end if;
  if v_matches>1 then
    return pg_catalog.jsonb_build_object('status','conflict');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ucapsa-review:'||v_person_id::text||':'||v_user::text,0));
  insert into ucapsa_intake.owner_link_requests(person_id,requester_user_id)
  values(v_person_id,v_user)
  on conflict(person_id,requester_user_id) do nothing;
  select r.status into v_status from ucapsa_intake.owner_link_requests r
  where r.person_id=v_person_id and r.requester_user_id=v_user;
  return pg_catalog.jsonb_build_object('status',
    case when v_status='pending' then 'requested' else 'already_resolved' end);
end;
$request$;
revoke all on function public.request_my_preregistration_link_review() from public,anon;
grant execute on function public.request_my_preregistration_link_review() to authenticated;

create or replace function public.admin_list_preregistration_link_requests()
returns jsonb language plpgsql stable security definer set search_path=''
as $list$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Acceso exclusivo de Administracion.' using errcode='42501';
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id',r.id,'status',r.status,'requested_at',r.created_at,
      'person_id',r.person_id,'owner_name',p.owner_name,
      'requester_user_id',r.requester_user_id,
      'requester_name',pr.full_name,'requester_email',u.email,
      'dog_count',(select count(*) from ucapsa_intake.dogs d where d.person_id=p.id)
    ) order by r.created_at desc), '[]'::jsonb)
  into v_result
  from ucapsa_intake.owner_link_requests r
  join ucapsa_intake.people p on p.id=r.person_id
  join auth.users u on u.id=r.requester_user_id
  left join public.profiles pr on pr.user_id=r.requester_user_id
  where r.status='pending';
  return v_result;
end;
$list$;
revoke all on function public.admin_list_preregistration_link_requests() from public,anon;
grant execute on function public.admin_list_preregistration_link_requests() to authenticated;

-- Acknowledgment or rejection only. Reassignment of an ALREADY LINKED
-- record requires a separate reviewed transaction across all dependent data.
create or replace function public.admin_close_preregistration_link_request(
  p_request_id uuid,p_decision text
) returns jsonb language plpgsql security definer set search_path=''
as $close$
declare v_changed integer;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Acceso exclusivo de Administracion.' using errcode='42501';
  end if;
  if p_decision not in ('reviewed','rejected') or p_request_id is null then
    raise exception 'Decision invalida.' using errcode='22023';
  end if;
  update ucapsa_intake.owner_link_requests r
  set status=p_decision, resolved_at=clock_timestamp(),resolved_by=auth.uid()
  where r.id=p_request_id and r.status='pending';
  get diagnostics v_changed=row_count;
  if v_changed<>1 then raise exception 'La solicitud ya no esta pendiente.' using errcode='23505'; end if;
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'dog_preregistration.link_review_'||p_decision,
      'dog_preregistration',p_request_id,
      pg_catalog.jsonb_build_object('decision',p_decision));
  return pg_catalog.jsonb_build_object('status',p_decision);
end;
$close$;
revoke all on function public.admin_close_preregistration_link_request(uuid,text) from public,anon;
grant execute on function public.admin_close_preregistration_link_request(uuid,text) to authenticated;
