-- UCAPSA pre-registration privacy boundary (draft; DO NOT deploy independently).
-- A privacy notice must be legally reviewed AND published before capturing
-- a new contact. Merely showing a UI disclaimer is not proof of delivery.
-- Designed to be installed only together with RPC + UI attestation changes.
-- Changes neither linked identities nor historical program/enrollment rows.

create table if not exists ucapsa_intake.approved_capture_notices (
  notice_id uuid primary key references public.privacy_notices(id) on delete restrict,
  review_reference text not null check(length(btrim(review_reference)) between 12 and 500),
  approved_at timestamptz not null default clock_timestamp(),
  approved_by uuid references auth.users(id) on delete set null
);
alter table ucapsa_intake.approved_capture_notices enable row level security;
revoke all on ucapsa_intake.approved_capture_notices from public, anon, authenticated, service_role;
-- No INSERT/UPDATE/DELETE grants, even for service_role. Approval is a
-- separate reviewed migration executed by the trusted migration role.
-- This table intentionally starts EMPTY: publishing alone never unlocks capture.

alter table ucapsa_intake.people
  add column if not exists capture_notice_id uuid references public.privacy_notices(id) on delete restrict,
  add column if not exists notice_delivery_method text,
  add column if not exists notice_delivery_attested boolean not null default false,
  add column if not exists notice_delivery_reported_by uuid references auth.users(id) on delete set null,
  add column if not exists notice_delivery_recorded_at timestamptz;

alter table ucapsa_intake.family_members
  add column if not exists capture_notice_id uuid references public.privacy_notices(id) on delete restrict,
  add column if not exists notice_delivery_method text,
  add column if not exists notice_delivery_attested boolean not null default false,
  add column if not exists notice_delivery_reported_by uuid references auth.users(id) on delete set null,
  add column if not exists notice_delivery_recorded_at timestamptz;

comment on column ucapsa_intake.people.notice_delivery_attested is
  'Staff attestation that the applicable notice was provided; NOT consent or identity verification.';
comment on column ucapsa_intake.family_members.notice_delivery_attested is
  'Staff attestation concerning this specific family member; NOT consent or permission to share other accounts.';

create or replace function ucapsa_intake.enforce_contact_notice_capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_is_contact_change boolean;
begin
  if TG_OP = 'UPDATE' then
    if TG_TABLE_NAME = 'people' then
      v_is_contact_change :=
        new.owner_name is distinct from old.owner_name
        or new.email_key is distinct from old.email_key
        or new.phone_e164 is distinct from old.phone_e164;
    else
      v_is_contact_change :=
        new.full_name is distinct from old.full_name
        or new.email_key is distinct from old.email_key
        or new.phone_e164 is distinct from old.phone_e164;
    end if;

    if v_is_contact_change
      and new.notice_delivery_recorded_at is not distinct from old.notice_delivery_recorded_at then
      raise exception 'Al cambiar el contacto se requiere una nueva constancia de entrega del aviso.'
        using errcode='23514';
    end if;
    if not v_is_contact_change then
      if new.capture_notice_id is distinct from old.capture_notice_id
        or new.notice_delivery_method is distinct from old.notice_delivery_method
        or new.notice_delivery_attested is distinct from old.notice_delivery_attested
        or new.notice_delivery_reported_by is distinct from old.notice_delivery_reported_by
        or new.notice_delivery_recorded_at is distinct from old.notice_delivery_recorded_at then
        raise exception 'No puedes modificar la constancia sin una nueva captura de contacto.'
          using errcode='23514';
      end if;
      -- Existing enrollment/link/status changes remain untouched.
      return new;
    end if;
  end if;

  if v_actor is null or not public.is_ucapsa_staff() then
    raise exception 'Solo personal autorizado puede registrar contactos.'
      using errcode='42501';
  end if;

  if new.capture_notice_id is null
    or new.notice_delivery_attested is distinct from true
    or new.notice_delivery_reported_by is distinct from v_actor
    or new.notice_delivery_method not in ('presencial', 'correo_entregado', 'otro_documentado')
    or new.notice_delivery_method is null then
    raise exception 'Se requiere constancia de entrega del aviso a esta persona antes de registrar el contacto.'
      using errcode='23514';
  end if;

  if not exists (
    select 1
    from public.privacy_notices n
    join ucapsa_intake.approved_capture_notices a on a.notice_id=n.id
    where n.id=new.capture_notice_id
      and n.status='published'
      and n.published_at is not null
      and (n.effective_from is null or n.effective_from <= pg_catalog.now())
  ) then
    raise exception 'El aviso publicado todavía no está autorizado para esta captura.'
      using errcode='23514';
  end if;

  -- Reject client-created timestamps, even if the client has a valid session.
  if TG_OP = 'INSERT' and new.notice_delivery_recorded_at is not null then
    raise exception 'La fecha de constancia debe generarla el servidor.'
      using errcode='23514';
  end if;
  -- Only the server records the current receipt of the staff attestation.
  new.notice_delivery_recorded_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

revoke all on function ucapsa_intake.enforce_contact_notice_capture() from public, anon, authenticated, service_role;

drop trigger if exists trg_capture_notice_people on ucapsa_intake.people;
create trigger trg_capture_notice_people
before insert or update of owner_name, email_key, phone_e164
on ucapsa_intake.people
for each row execute function ucapsa_intake.enforce_contact_notice_capture();

drop trigger if exists trg_capture_notice_family on ucapsa_intake.family_members;
create trigger trg_capture_notice_family
before insert or update of full_name, email_key, phone_e164
on ucapsa_intake.family_members
for each row execute function ucapsa_intake.enforce_contact_notice_capture();

-- Rollback in a reviewed migration:
-- DROP TRIGGER trg_capture_notice_people ON ucapsa_intake.people;
-- DROP TRIGGER trg_capture_notice_family ON ucapsa_intake.family_members;
-- DROP FUNCTION ucapsa_intake.enforce_contact_notice_capture();
-- UPDATE OF is limited to contact identity fields: PostgreSQL's foreign key
-- ON DELETE SET NULL may change notice_delivery_reported_by during account
-- deletion; that maintenance must not block Auth deletion. Ordinary clients
-- have no direct UPDATE grants to these private intake tables.
-- Historical attestation columns must be retained until data-retention review.
