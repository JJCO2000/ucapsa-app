-- UCAPSA: enlazar prueba documental de asistencias sin fechas inventadas.
-- NO aplicar hasta superar pruebas SQL aisladas con roles, concurrencia y RLS.
alter table public.program_enrollments
  add column if not exists intake_program_id uuid unique
    references ucapsa_intake.programs(id) on delete restrict;

create table if not exists public.program_attendance_historical_evidence (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments(id) on delete restrict,
  intake_evidence_id uuid not null unique references ucapsa_intake.attendance_evidence(id) on delete restrict,
  evidence_kind text not null check(evidence_kind in ('dated','undated_balance')),
  evidence_source text not null default 'admin_history'
    check(evidence_source in ('admin_history','staff_roster')),
  attendance_date date,
  quantity integer not null check(quantity between 1 and 500),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null,
  source_note text,
  constraint historical_evidence_provenance check (
    (evidence_kind='dated' and attendance_date is not null and quantity=1)
    or (evidence_kind='undated_balance' and attendance_date is null)
  )
);
create unique index if not exists historical_evidence_one_date
  on public.program_attendance_historical_evidence(enrollment_id,attendance_date)
  where evidence_kind='dated';
create unique index if not exists historical_evidence_one_balance
  on public.program_attendance_historical_evidence(enrollment_id)
  where evidence_kind='undated_balance';

alter table public.program_attendance_historical_evidence enable row level security;
revoke all on public.program_attendance_historical_evidence from public,anon,authenticated;
grant select,insert,update,delete on public.program_attendance_historical_evidence to service_role;

-- Evitar que una fecha histórica se vuelva a contabilizar como asistencia QR.
create or replace function public.guard_attendance_not_already_historical()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  -- Misma clave de bloqueo en ambos orígenes: impide carrera entre QR e historia.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ucapsa-attendance:' || new.enrollment_id::text ||
      ':' || new.attendance_date::text,0));
  if exists (
    select 1 from public.program_attendance_historical_evidence h
    where h.enrollment_id=new.enrollment_id
      and h.evidence_kind='dated' and h.attendance_date=new.attendance_date
  ) then
    raise exception 'Esta fecha ya está en el historial reconocido; corrige esa fuente antes de añadir otra asistencia.'
      using errcode='23505';
  end if;
  return new;
end;
$fn$;
drop trigger if exists trg_guard_attendance_history_duplicate on public.program_attendances;
create trigger trg_guard_attendance_history_duplicate before insert or update of enrollment_id,attendance_date
on public.program_attendances for each row
execute function public.guard_attendance_not_already_historical();

-- El trigger funciona también si se importan correcciones futuras.
create or replace function public.guard_history_not_already_attended()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if new.evidence_kind='dated' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ucapsa-attendance:' || new.enrollment_id::text ||
        ':' || new.attendance_date::text,0));
  end if;
  if new.evidence_kind='dated' and exists(
    select 1 from public.program_attendances a
    where a.enrollment_id=new.enrollment_id and a.attendance_date=new.attendance_date
  ) then
    raise exception 'Esta fecha ya fue registrada como asistencia ordinaria.' using errcode='23505';
  end if;
  return new;
end;
$fn$;
drop trigger if exists trg_guard_historical_date_duplicate on public.program_attendance_historical_evidence;
create trigger trg_guard_historical_date_duplicate before insert or update of enrollment_id,attendance_date
on public.program_attendance_historical_evidence for each row
execute function public.guard_history_not_already_attended();

-- No se toca el historial oficial existente. Se suma historial avalado por Admin.

CREATE OR REPLACE FUNCTION public.refresh_program_enrollment_progress(p_enrollment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_program_id uuid;
  v_required integer;
  v_count integer;
  v_latest date;
  v_schedule_count integer;
  v_target_offset integer;
  v_next_schedule_id uuid;
begin
  select e.program_id, p.required_attendances
    into v_program_id, v_required
  from public.program_enrollments e
  join public.programs p on p.id = e.program_id
  where e.id = p_enrollment_id;

  if v_program_id is null then
    return;
  end if;

  -- La fuente canónica de progreso combina asistencias fechadas ordinarias
  -- con evidencia histórica identificada. La parte sin fecha suma SOLO cantidad.
  select coalesce(sum(a.qty),0)::int, max(a.attendance_date)
    into v_count, v_latest
  from (
    select 1::integer as qty, attendance_date
    from public.program_attendances where enrollment_id = p_enrollment_id
    union all
    select h.quantity as qty, h.attendance_date
    from public.program_attendance_historical_evidence h
    where h.enrollment_id = p_enrollment_id
  ) a;

  select count(*)::int
    into v_schedule_count
  from public.program_schedules s
  join lateral public.get_effective_program_schedule(s.id, (clock_timestamp() at time zone 'America/Mexico_City')::date) e on true
  where s.program_id = v_program_id
    and e.is_active = true;

  if v_schedule_count > 0 then
    v_target_offset := least(v_count, v_schedule_count - 1);

    select s.id
      into v_next_schedule_id
    from public.program_schedules s
    join lateral public.get_effective_program_schedule(s.id, (clock_timestamp() at time zone 'America/Mexico_City')::date) e on true
    where s.program_id = v_program_id
      and e.is_active = true
    order by e.sequence_order, e.day_of_week, e.start_time
    offset v_target_offset
    limit 1;
  end if;

  update public.program_enrollments
  set attendances_count = v_count,
      last_attendance_at = v_latest,
      schedule_id = coalesce(v_next_schedule_id, schedule_id),
      requirements_met_at = case
        when v_count >= greatest(1, v_required) and not exists (
          select 1 from public.program_attendance_historical_evidence h
          where h.enrollment_id=p_enrollment_id
        ) then coalesce(requirements_met_at, now())
        -- El saldo legado permite acreditar avance, no inventar la fecha de logro.
        when v_count >= greatest(1, v_required) then requirements_met_at
        else null
      end,
      updated_at = now()
  where id = p_enrollment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_program_enrollment_card_validity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- Tarjetas antiguas preinscritas sin fecha: jamás crear un inicio falso.
  if new.intake_program_id is not null and new.started_at is null
     and new.card_started_on is null then
    new.card_expires_on := null;
    return new;
  end if;
  -- En nuevas inscripciones sí podemos fijar el inicio si la app no lo manda.
  if tg_op = 'INSERT' and new.card_started_on is null then
    new.card_started_on := coalesce(new.started_at::date, current_date);
  elsif tg_op = 'UPDATE' and new.card_started_on is null and new.started_at is not null then
    -- Para legados solo usamos started_at real; nunca created_at como sustituto.
    new.card_started_on := new.started_at::date;
  end if;

  if new.card_expires_on is null and new.card_started_on is not null then
    new.card_expires_on := (new.card_started_on + interval '1 year')::date;
  end if;

  if new.card_started_on is not null
     and new.card_expires_on is not null
     and new.card_expires_on < new.card_started_on then
    raise exception 'La fecha de vencimiento no puede ser anterior al inicio de la tarjeta.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_program_historical_refresh on public.program_attendance_historical_evidence;
create trigger trg_program_historical_refresh after insert or update or delete
on public.program_attendance_historical_evidence for each row
execute function public.trg_refresh_program_enrollment_progress();
revoke all on function public.guard_attendance_not_already_historical() from public,anon;
revoke all on function public.guard_history_not_already_attended() from public,anon;

-- Reemplazar la reclamación SOLO tras crear staging + ledger permanente.
create or replace function public.claim_my_preregistered_dogs()
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_phone text;
  v_profile_role public.app_role;
  v_count integer;
  v_person ucapsa_intake.people%rowtype;
  v_dog record;
  v_dog_id uuid;
  v_linked integer := 0;
  v_linked_programs integer := 0;
  v_stage ucapsa_intake.programs%rowtype;
  v_enrollment_id uuid;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.' using errcode='42501';
  end if;
  select p.role into v_profile_role from public.profiles p where p.user_id=v_user;
  -- Rol de Staff no impide reclamar su propia ficha con contacto verificado.
  if v_profile_role is null or v_profile_role = 'visitor' then
    return pg_catalog.jsonb_build_object('status','not_applicable','linked_dogs',0);
  end if;

  select case when u.email_confirmed_at is not null
       then nullif(lower(btrim(u.email)),'') else null end,
       case when u.phone_confirmed_at is not null
       then nullif(btrim(u.phone),'') else null end
  into v_email,v_phone
  from auth.users u where u.id=v_user;
  if v_email is null and v_phone is null then
    return pg_catalog.jsonb_build_object('status','unverified','linked_dogs',0);
  end if;
  -- No basta con un candidato provisional único: exigir identidad única
  -- entre TODAS las cuentas Auth verificadas. Un teléfono compartido o
  -- reasignado no puede transferir un expediente a la cuenta equivocada.
  if exists (
    select 1 from auth.users u
    where u.id<>v_user
      and (
        (v_email is not null and u.email_confirmed_at is not null
          and lower(btrim(u.email))=v_email)
        or
        (v_phone is not null and u.phone_confirmed_at is not null
          and btrim(u.phone)=v_phone)
      )
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;

  -- Bloquea solicitudes simultáneas de la misma cuenta.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ucapsa-claim:'||v_user::text,0));

  select count(*) into v_count from ucapsa_intake.people p
  where p.status='pending' and (
    (v_email is not null and p.email_key=v_email) or
    (v_phone is not null and p.phone_e164=v_phone)
  );
  if v_count=0 then
    return pg_catalog.jsonb_build_object('status','none','linked_dogs',0);
  end if;
  if v_count<>1 then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;

  select * into v_person from ucapsa_intake.people p
  where p.status='pending' and (
    (v_email is not null and p.email_key=v_email) or
    (v_phone is not null and p.phone_e164=v_phone)
  ) for update;

  -- Un contacto verificado que contradiga la ficha impide reclamación.
  if (v_email is not null and v_person.email_key is not null and v_email<>v_person.email_key)
    or (v_phone is not null and v_person.phone_e164 is not null and v_phone<>v_person.phone_e164) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;

  -- Evitar reasignación y asociación de fichas de otras identidades.
  if exists (
    select 1 from ucapsa_intake.people p
    where p.linked_user_id=v_user and p.id<>v_person.id
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;
  if exists (
    select 1 from ucapsa_intake.dogs staged
    join public.dogs d on d.user_id=v_user and d.is_active
     and lower(btrim(d.name))=lower(btrim(staged.dog_name))
    where staged.person_id=v_person.id
  ) then
    return pg_catalog.jsonb_build_object('status','conflict','linked_dogs',0);
  end if;

  for v_dog in select d.id,d.dog_name from ucapsa_intake.dogs d
    where d.person_id=v_person.id order by d.id for update
  loop
    insert into public.dogs(user_id,name,is_active)
    values(v_user,v_dog.dog_name,true)
    returning id into v_dog_id;
    update ucapsa_intake.dogs set linked_dog_id=v_dog_id where id=v_dog.id;

    -- Conserva la fecha histórica conocida o, si no existe, utiliza la fecha
    -- verificable de autorización de Admin como inicio operativo del acceso.
    -- No inventa fecha de asistencia ni registro financiero.
    for v_stage in
      select st.* from ucapsa_intake.programs st
      where st.dog_id=v_dog.id
      order by st.program_id for update
    loop
      if v_stage.linked_enrollment_id is not null then
        raise exception 'La tarjeta provisional ya está vinculada.'
          using errcode='23505';
      end if;
      if not exists (
        select 1 from public.program_schedules sch
        where sch.id=v_stage.schedule_id and sch.program_id=v_stage.program_id
      ) then
        raise exception 'No se encontró el horario oficial original.'
          using errcode='55000';
      end if;
      insert into public.program_enrollments(
        user_id,program_id,schedule_id,dog_id,dog_name,
        physical_card_number,program_level,access_mode,status,
        started_at,card_started_on,intake_program_id
      ) values (
        v_user,v_stage.program_id,v_stage.schedule_id,v_dog_id,v_dog.dog_name,
        v_stage.physical_card_number,v_stage.program_level,'card','active',
        coalesce(v_stage.card_started_on,v_stage.authorized_on),
        coalesce(v_stage.card_started_on,v_stage.authorized_on),v_stage.id
      ) returning id into v_enrollment_id;

      update ucapsa_intake.programs
      set linked_enrollment_id=v_enrollment_id where id=v_stage.id;

      insert into public.program_attendance_historical_evidence (
        enrollment_id,intake_evidence_id,evidence_kind,evidence_source,
        attendance_date,quantity,recorded_by,recorded_at,source_note
      )
      select
        v_enrollment_id,h.id,h.evidence_kind,h.evidence_source,
        h.attendance_date,h.quantity,h.recorded_by,h.recorded_at,h.source_note
      from ucapsa_intake.attendance_evidence h
      where h.intake_program_id=v_stage.id;

      -- Idempotencia: la fuente del balance mantiene un único ID histórico.
      perform public.refresh_program_enrollment_progress(v_enrollment_id);
      v_linked_programs:=v_linked_programs+1;
    end loop;

    v_linked:=v_linked+1;
  end loop;
  update ucapsa_intake.people
    set status='linked', linked_user_id=v_user, linked_at=clock_timestamp()
    where id=v_person.id and status='pending';

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(v_user,'dog_preregistration.claimed','dog_preregistration',v_person.id,
    pg_catalog.jsonb_build_object('dogs',v_linked,'programs',v_linked_programs));
  return pg_catalog.jsonb_build_object('status','linked','linked_dogs',v_linked,'linked_programs',v_linked_programs);
end;
$fn$;




-- Consulta auditable para Administración. No permite modificar hechos históricos.
create or replace function public.admin_get_program_historical_evidence(p_enrollment_id uuid)
returns table (
  evidence_id uuid,
  attendance_date date,
  quantity integer,
  evidence_kind text,
  evidence_source text,
  source_note text,
  recorded_at timestamptz
)
language sql stable security definer set search_path=''
as $fn$
  select h.id,h.attendance_date,h.quantity,h.evidence_kind,h.evidence_source,h.source_note,h.recorded_at
  from public.program_attendance_historical_evidence h
  where h.enrollment_id=p_enrollment_id
    and auth.uid() is not null
    and public.is_ucapsa_admin()
  order by h.attendance_date desc nulls last,h.id
$fn$;
revoke all on function public.admin_get_program_historical_evidence(uuid) from public,anon;
grant execute on function public.admin_get_program_historical_evidence(uuid) to authenticated,service_role;
