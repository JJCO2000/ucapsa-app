\set ON_ERROR_STOP on
do $verify_database$ begin
 if current_database()<>'ucapsa_exam_report_test' then
   raise exception 'Solo base efímera de ensayo';
 end if;
end $verify_database$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $client_forbidden$
declare blocked boolean:=false;
begin
 begin
  perform * from public.get_staff_exam_report('00000000-0000-4000-8000-000000000020');
 exception when insufficient_privilege then blocked:=true;
 end;
 if not blocked then raise exception 'Un cliente pudo leer reporte staff'; end if;
end $client_forbidden$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $trainer_view$
declare n integer; pending_count integer; max_sum numeric;
begin
 select count(*),count(*) filter(where points_awarded is null),sum(max_points)
 into n,pending_count,max_sum
 from public.get_staff_exam_report('00000000-0000-4000-8000-000000000020');
 if n<>2 then raise exception 'El examen debe tener dos ejercicios, no %',n; end if;
 if pending_count<>1 then raise exception 'Calificación ausente jamás debe convertirse en 0'; end if;
 if max_sum<>30 then raise exception 'No se preservan puntos máximos 10+20'; end if;
 if exists(
  select 1 from public.get_staff_exam_report('00000000-0000-4000-8000-000000000020')
  where dog_name='Outside'
 ) then raise exception 'Exposición de perro fuera del alcance'; end if;
end $trainer_view$;
reset role;
do $grant_test$
begin
 if not has_function_privilege('authenticated','public.get_staff_exam_report(uuid)','EXECUTE') then
  raise exception 'Firma del grant no coincide con RPC cliente';
 end if;
 if has_function_privilege('anon','public.get_staff_exam_report(uuid)','EXECUTE') then
  raise exception 'Lectura anónima de exámenes'; end if;
end $grant_test$;
select 'UCAPSA reportes XLSX: RPC y seguridad PASS' result;
