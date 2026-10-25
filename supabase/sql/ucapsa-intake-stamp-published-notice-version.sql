-- UCAPSA: record WHICH published privacy notice was current at contact intake.
-- This is a version/provenance record. It is NOT evidence of individual
-- delivery, agreement, identity verification or consent by family members.
-- It does NOT activate the draft per-person receipt barrier.
-- Safe to install with the existing Admin/Trainer intake RPC contract.
--
-- Rollback: drop the two triggers and this helper; retain provenance columns
-- for legal record retention, unless a reviewed migration authorizes removal.

alter table ucapsa_intake.people
  add column if not exists capture_notice_id uuid
    references public.privacy_notices(id) on delete restrict;

alter table ucapsa_intake.family_members
  add column if not exists capture_notice_id uuid
    references public.privacy_notices(id) on delete restrict;

comment on column ucapsa_intake.people.capture_notice_id is
  'Published privacy notice at creation/contact edit; not evidence of delivery or consent.';
comment on column ucapsa_intake.family_members.capture_notice_id is
  'Published privacy notice at creation/contact edit; not evidence of delivery or consent.';

create or replace function ucapsa_intake.stamp_published_capture_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notice_id uuid;
begin
  select n.id into v_notice_id
  from public.privacy_notices n
  where n.status = 'published'
    and n.published_at is not null
    and n.effective_from is not null
    and n.effective_from <= pg_catalog.clock_timestamp()
    and pg_catalog.position('preinscripci' in pg_catalog.lower(n.simplified_notice)) > 0
    and pg_catalog.position('familia' in pg_catalog.lower(n.simplified_notice)) > 0
    and pg_catalog.position('preinscripci' in pg_catalog.lower(n.integral_notice)) > 0
    and pg_catalog.position('familia' in pg_catalog.lower(n.integral_notice)) > 0
  limit 1;

  if v_notice_id is null then
    raise exception 'No existe aviso publicado vigente que informe de preinscripciones y familiares.'
      using errcode = '23514';
  end if;

  -- This value must never originate in the client. The server stamps it
  -- during a genuine INSERT or when somebody edits identity/contact data.
  new.capture_notice_id := v_notice_id;
  return new;
end;
$$;

revoke all on function ucapsa_intake.stamp_published_capture_notice()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_intake_notice_version_people on ucapsa_intake.people;
create trigger trg_intake_notice_version_people
  before insert or update of owner_name, email_key, phone_e164
  on ucapsa_intake.people
  for each row execute function ucapsa_intake.stamp_published_capture_notice();

drop trigger if exists trg_intake_notice_version_family on ucapsa_intake.family_members;
create trigger trg_intake_notice_version_family
  before insert or update of full_name, email_key, phone_e164
  on ucapsa_intake.family_members
  for each row execute function ucapsa_intake.stamp_published_capture_notice();

-- When deploying the per-person receipt migration, merge/replace these
-- triggers atomically with the reviewed receipt RPC contract. Never infer
-- "notice_delivery_attested" from capture_notice_id.
