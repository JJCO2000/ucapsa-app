-- UCAPSA: histórico de preregistro SIN inventar fechas o ingresos.
-- Estado: SOLO PR. No aplicar hasta completar vinculación idempotente en BD.
-- SSOT staging: una ficha perro+programa, eventos fechados y saldo sin fecha.
create table if not exists ucapsa_intake.programs (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references ucapsa_intake.dogs(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete restrict,
  schedule_id uuid not null references public.program_schedules(id) on delete restrict,
  program_level text not null default 'base'
    check (program_level in ('base','principiante','medio','avanzado')),
  physical_card_number text,
  card_started_on date,
  -- La tarjeta entregada acredita compra según UCAPSA, NO crea movimiento
  -- financiero ni comprobante de pago sin evidencia contable.
  card_paid_attested_by uuid references auth.users(id) on delete restrict,
  card_paid_attested_at timestamptz,
  record_source text not null default 'admin_preregistered',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  linked_enrollment_id uuid unique references public.program_enrollments(id) on delete restrict,
  constraint prereg_one_program_per_dog unique (dog_id,program_id),
  constraint prereg_card_attestation check (
    (physical_card_number is null and card_paid_attested_by is null and card_paid_attested_at is null)
    or (physical_card_number is not null and card_paid_attested_by is not null and card_paid_attested_at is not null)
  )
);
create unique index if not exists prereg_card_number_unique
  on ucapsa_intake.programs (program_id,lower(btrim(physical_card_number)))
  where physical_card_number is not null and btrim(physical_card_number)<>'';

create table if not exists ucapsa_intake.attendance_evidence (
  id uuid primary key default gen_random_uuid(),
  intake_program_id uuid not null references ucapsa_intake.programs(id) on delete restrict,
  -- El saldo desconocido guarda SOLO la cantidad; jamás una fecha sintética.
  evidence_kind text not null check (evidence_kind in ('dated','undated_balance')),
  evidence_source text not null default 'admin_history'
    check (evidence_source in ('admin_history','staff_roster')),
  attendance_date date,
  quantity integer not null check (quantity between 1 and 500),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  source_note text,
  constraint intake_history_source_valid check (
    (evidence_kind='dated' and attendance_date is not null and quantity=1)
    or (evidence_kind='undated_balance' and attendance_date is null)
  )
);
create unique index if not exists intake_history_one_date
  on ucapsa_intake.attendance_evidence(intake_program_id,attendance_date)
  where evidence_kind='dated';
create unique index if not exists intake_history_one_undated_balance
  on ucapsa_intake.attendance_evidence(intake_program_id)
  where evidence_kind='undated_balance';

alter table ucapsa_intake.programs enable row level security;
alter table ucapsa_intake.attendance_evidence enable row level security;
revoke all on ucapsa_intake.programs, ucapsa_intake.attendance_evidence
  from public, anon, authenticated;
grant select, insert, update, delete on ucapsa_intake.programs, ucapsa_intake.attendance_evidence
  to service_role;

-- Reemplaza el histórico antes de vincular. Cada reemplazo deja bitácora.
-- Para "total 3, fechas [A,B]" se guardan dos fechas + saldo 1,
-- nunca 3 fechas inventadas ni 3 más 2.
create or replace function public.admin_save_preregistered_program_history(
  p_intake_dog_id uuid,
  p_program_code text,
  p_program_level text,
  p_card_number text,
  p_card_started_on date,
  p_total_attendances integer,
  p_known_dates date[],
  p_note text default null
) returns uuid
language plpgsql security definer set search_path=''
as $fn$
declare
  v_actor uuid := auth.uid();
  v_program public.programs%rowtype;
  v_schedule_id uuid;
  v_dog ucapsa_intake.dogs%rowtype;
  v_stage ucapsa_intake.programs%rowtype;
  v_level text := coalesce(nullif(btrim(p_program_level),''),'base');
  v_card text := nullif(btrim(coalesce(p_card_number,'')),'');
  v_dates date[] := coalesce(p_known_dates,array[]::date[]);
  v_unique_count integer;
  v_missing integer;
  v_previous_history jsonb;
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
begin
  if v_actor is null or not public.is_ucapsa_admin() then
    raise exception 'Se requiere Admin o Superadmin.' using errcode='42501';
  end if;
  if p_total_attendances is null or p_total_attendances not between 0 and 500 then
    raise exception 'Total de clases inválido.' using errcode='22023';
  end if;
  if coalesce(array_length(v_dates,1),0)>500 then
    raise exception 'Demasiadas fechas.' using errcode='22023';
  end if;
  select count(distinct dt) into v_unique_count from unnest(v_dates) as dates(dt);
  if exists (select 1 from unnest(v_dates) as dates(dt) where dt is null or dt>v_today) or
     v_unique_count <> coalesce(array_length(v_dates,1),0) then
    raise exception 'Las fechas deben ser reales, únicas y no futuras.' using errcode='22023';
  end if;
  if v_unique_count>p_total_attendances then
    raise exception 'Las fechas conocidas no pueden superar el total.' using errcode='22023';
  end if;
  v_missing:=p_total_attendances-v_unique_count;

  select * into v_dog from ucapsa_intake.dogs d
  where d.id=p_intake_dog_id for update;
  if not found or v_dog.linked_dog_id is not null then
    raise exception 'Perro provisional no disponible.' using errcode='55000';
  end if;
  if not exists (
    select 1 from ucapsa_intake.people p
    where p.id=v_dog.person_id and p.status='pending'
  ) then
    raise exception 'La cuenta provisional ya está vinculada.' using errcode='55000';
  end if;

  select * into v_program from public.programs p
  where p.code=lower(btrim(p_program_code)) and p.is_active
    and p.code in ('puppy','comandos');
  if not found then
    raise exception 'Programa no admitido.' using errcode='22023';
  end if;
  if v_program.code='puppy' and (v_level<>'base' or v_card is null) then
    raise exception 'Puppy requiere tarjeta física pagada y nivel base.' using errcode='22023';
  end if;
  if v_program.code='comandos' and v_level not in ('principiante','medio','avanzado') then
    raise exception 'Indica Básico, Intermedio o Avanzado.' using errcode='22023';
  end if;
  if v_card is not null and (length(v_card)>80 or v_card ~ '[[:cntrl:]]') then
    raise exception 'Número de tarjeta inválido.' using errcode='22023';
  end if;
  if p_card_started_on is not null and p_card_started_on>v_today then
    raise exception 'No se admite una fecha de tarjeta futura.' using errcode='22023';
  end if;
  if exists (
    select 1 from public.program_enrollments e
    where e.program_id=v_program.id and v_card is not null
      and lower(btrim(e.physical_card_number))=lower(v_card)
  ) then
    raise exception 'Tarjeta ya registrada en inscripciones oficiales.' using errcode='23505';
  end if;

  -- Se guarda un único horario oficial. Comandos nunca genera horario por nivel.
  select s.id into v_schedule_id
  from public.program_schedules s
  join lateral public.get_effective_program_schedule(s.id,v_today) e on true
  where s.program_id=v_program.id and e.is_active
  order by e.sequence_order,e.start_time,s.id limit 1;
  if v_schedule_id is null then
    raise exception 'No existe horario oficial activo para este programa.' using errcode='55000';
  end if;

  insert into ucapsa_intake.programs(
    dog_id,program_id,schedule_id,program_level,physical_card_number,
    card_started_on,card_paid_attested_by,card_paid_attested_at,created_by
  ) values (
    v_dog.id,v_program.id,v_schedule_id,
    case when v_level='principiante' then 'principiante' else v_level end,
    v_card,p_card_started_on,
    case when v_card is not null then v_actor else null end,
    case when v_card is not null then clock_timestamp() else null end,
    v_actor
  ) on conflict(dog_id,program_id) do update set
    program_level=excluded.program_level,
    physical_card_number=excluded.physical_card_number,
    card_started_on=excluded.card_started_on,
    card_paid_attested_by=excluded.card_paid_attested_by,
    card_paid_attested_at=excluded.card_paid_attested_at
  where ucapsa_intake.programs.linked_enrollment_id is null
  returning * into v_stage;

  if v_stage.id is null then
    raise exception 'La inscripción ya está vinculada.' using errcode='55000';
  end if;
  -- Conservar prueba exacta de la versión anterior antes de corregirla.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',h.id,'kind',h.evidence_kind,'date',h.attendance_date,
      'quantity',h.quantity,'actor',h.recorded_by,'recorded_at',h.recorded_at,
      'note',h.source_note
    ) order by h.recorded_at,h.id
  ),'[]'::jsonb) into v_previous_history
  from ucapsa_intake.attendance_evidence h where h.intake_program_id=v_stage.id;
  delete from ucapsa_intake.attendance_evidence h where h.intake_program_id=v_stage.id;

  insert into ucapsa_intake.attendance_evidence (
    intake_program_id,evidence_kind,attendance_date,quantity,recorded_by,source_note
  )
  select v_stage.id,'dated',dt,1,v_actor,nullif(btrim(p_note),'')
  from unnest(v_dates) dt;
  if v_missing>0 then
    insert into ucapsa_intake.attendance_evidence (
      intake_program_id,evidence_kind,attendance_date,quantity,recorded_by,source_note
    ) values (
      v_stage.id,'undated_balance',null,v_missing,v_actor,
      nullif(btrim(p_note),'')
    );
  end if;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(v_actor,'dog_preregistration.history_set','intake_program',v_stage.id,
    jsonb_build_object(
      'program_code',v_program.code,
      'before_evidence',coalesce(v_previous_history,'[]'::jsonb),
      'after_known_dates',to_jsonb(v_dates),
      'after_undated_balance',v_missing,
      'after_total',p_total_attendances,
      'source_note',nullif(btrim(p_note),''),
      'card_number_changed',v_card is not null
    ));
  return v_stage.id;
end;
$fn$;

revoke all on function public.admin_save_preregistered_program_history(
 uuid,text,text,text,date,integer,date[],text) from public,anon;
grant execute on function public.admin_save_preregistered_program_history(
 uuid,text,text,text,date,integer,date[],text) to authenticated,service_role;

-- Inscripción provisional y perro se crean en una sola transacción.
-- Si la tarjeta o el histórico falla, tampoco se crea una ficha huérfana.
create or replace function public.admin_preregister_dog_with_program(
  p_owner_name text,
  p_owner_email text,
  p_owner_phone text,
  p_dog_name text,
  p_program_code text,
  p_program_level text,
  p_card_number text,
  p_card_started_on date,
  p_total_attendances integer,
  p_known_dates date[],
  p_note text default null
) returns uuid
language plpgsql security definer set search_path=''
as $fn$
declare
  v_dog uuid;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Admin o Superadmin puede registrar.' using errcode='42501';
  end if;
  v_dog:=public.admin_preregister_dog(p_owner_name,p_owner_email,p_owner_phone,p_dog_name);
  perform public.admin_save_preregistered_program_history(
    v_dog,p_program_code,p_program_level,p_card_number,p_card_started_on,
    p_total_attendances,p_known_dates,p_note
  );
  return v_dog;
end;
$fn$;
revoke all on function public.admin_preregister_dog_with_program(
 text,text,text,text,text,text,text,date,integer,date[],text) from public,anon;
grant execute on function public.admin_preregister_dog_with_program(
 text,text,text,text,text,text,text,date,integer,date[],text) to authenticated,service_role;
