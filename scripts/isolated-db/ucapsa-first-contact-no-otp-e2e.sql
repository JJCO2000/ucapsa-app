-- EXCLUSIVAMENTE PostgreSQL sintético UCAPSA. Nunca ejecutar en producción.
\set ON_ERROR_STOP on
do $$begin if current_database()<>'ucapsa_test'
  then raise exception 'Rechazada ejecución fuera del entorno aislado'; end if; end $$;

-- Administración registra dos tutores ANTES de que creen sus cuentas.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Primer Celular','','+525511100010','Max',
  'puppy','base','P-NO-SMS-001',null,1,array[]::date[],
  'Synthetic phone first claim without SMS'
);
select public.admin_preregister_dog_with_program(
  'Primer Correo','sin-sms-correo@test.invalid','','Luna',
  'comandos','principiante','',null,2,array[]::date[],
  'Synthetic email first claim without verification'
);
reset role;

insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
values
 ('00000000-0000-4000-8000-000000000010','phone-unverified@test.invalid',null,null,null),
 ('00000000-0000-4000-8000-000000000011','other-phone@test.invalid',null,null,null),
 ('00000000-0000-4000-8000-000000000012','sin-sms-correo@test.invalid',null,null,null);
insert into public.profiles(user_id,email,phone,role)
values
 ('00000000-0000-4000-8000-000000000010','phone-unverified@test.invalid','55 1110 0010','client'),
 ('00000000-0000-4000-8000-000000000011','other-phone@test.invalid',null,'client'),
 ('00000000-0000-4000-8000-000000000012','sin-sms-correo@test.invalid',null,'client');

-- El teléfono del perfil SIN SMS permite reclamar UNA única primera vez.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',false);
do $first_phone$
declare j jsonb;
begin
  j:=public.preview_my_preregistered_dogs();
  if j->>'status'<>'available' or j->>'auto_first'<>'true' or
     (j->>'count')::integer<>1 then
    raise exception 'Primer teléfono no ofrecido: %',j;
  end if;
  j:=public.claim_my_first_preregistered_dogs();
  if j->>'status'<>'linked' or (j->>'linked_dogs')::integer<>1 then
    raise exception 'Primer teléfono no vinculado: %',j;
  end if;
  j:=public.claim_my_first_preregistered_dogs();
  if j->>'status'<>'requires_approval' then
    raise exception 'Segunda vinculación automática incorrecta: %',j;
  end if;
end $first_phone$;
reset role;

-- La otra cuenta que escriba el mismo teléfono queda bloqueada.
update public.profiles set phone='5511100010'
where user_id='00000000-0000-4000-8000-000000000011';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false);
do $second_phone$
declare j jsonb;
begin
  j:=public.preview_my_preregistered_dogs();
  if j->>'status'='available' then
    raise exception 'Otra cuenta ve expediente del primer titular: %',j;
  end if;
  j:=public.claim_my_first_preregistered_dogs();
  if j->>'status'='linked' then
    raise exception 'Otra cuenta reclamó el teléfono ya reservado: %',j;
  end if;
end $second_phone$;
reset role;

-- Lo mismo para un correo de Auth SIN email_confirmed_at.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',false);
do $first_email$
declare j jsonb;
begin
  j:=public.preview_my_preregistered_dogs();
  if j->>'status'<>'available' or j->>'auto_first'<>'true' then
    raise exception 'Correo único sin SMS no se ofreció: %',j;
  end if;
  j:=public.claim_my_first_preregistered_dogs();
  if j->>'status'<>'linked' or (j->>'linked_dogs')::integer<>1 then
    raise exception 'Primer correo no vinculado: %',j;
  end if;
end $first_email$;
reset role;

-- Los contactos quedan reservados a la primera cuenta, incluso sin fecha OTP.
do $verify_claims$
begin
  if not exists (
    select 1 from ucapsa_intake.claimed_contacts c
    where c.kind='phone' and c.contact_key='+525511100010'
      and c.user_id='00000000-0000-4000-8000-000000000010'
  ) then raise exception 'No se reservó el primer celular'; end if;
  if not exists (
    select 1 from ucapsa_intake.claimed_contacts c
    where c.kind='email' and c.contact_key='sin-sms-correo@test.invalid'
      and c.user_id='00000000-0000-4000-8000-000000000012'
  ) then raise exception 'No se reservó el primer correo'; end if;
  if not exists (
    select 1 from public.program_enrollments e
    join public.dogs d on d.id=e.dog_id
    where e.user_id='00000000-0000-4000-8000-000000000012'
      and d.name='Luna' and e.program_level='principiante'
      and e.attendances_count=2
  ) then raise exception 'Se perdió Comandos o historial'; end if;
  if (select count(*) from public.admin_audit_logs
      where action='dog_preregistration.claimed'
        and details->>'link_method'='first_contact_unverified') < 2 then
    raise exception 'Falta auditoría del primer contacto'; end if;
  if has_table_privilege('authenticated','ucapsa_intake.claimed_contacts','SELECT') then
    raise exception 'Contactos reclamados accesibles sin autorización'; end if;
end $verify_claims$;
select 'UCAPSA primera vinculación sin OTP y bloqueo posterior: PASS';
