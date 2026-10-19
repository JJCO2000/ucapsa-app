\set ON_ERROR_STOP on
DO $guard$ BEGIN
 IF current_database()<>'ucapsa_exam_draft_test' THEN
  RAISE EXCEPTION 'Never run outside isolated fixture';
 END IF;
 IF has_function_privilege('anon','public.staff_update_ucapsa_exam_draft(uuid,text,text,date,jsonb,timestamptz)','EXECUTE') THEN
  RAISE EXCEPTION 'Anonymous should not execute draft updates';
 END IF;
 IF has_function_privilege('anon','public.get_staff_editable_ucapsa_exam_draft(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Anonymous should not read exam drafts';
 END IF;
END $guard$;
SET ROLE authenticated;
DO $denials$
DECLARE v_user text;
BEGIN
 FOR v_user IN SELECT unnest(ARRAY[
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002'
 ]) LOOP
  PERFORM set_config('request.jwt.claim.sub',v_user,true);
  BEGIN
   PERFORM public.get_staff_editable_ucapsa_exam_draft('00000000-0000-4000-8000-000000000020');
   RAISE EXCEPTION 'Client/member could read staff draft';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
   PERFORM public.staff_update_ucapsa_exam_draft(
    '00000000-0000-4000-8000-000000000020','FAIL','Denied',null,
    '[{"title":"Unsafe","max_points":10}]'::jsonb,'2026-10-01T00:00:00Z');
   RAISE EXCEPTION 'Client/member could edit staff draft';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
 END LOOP;
END $denials$;
DO $staff$
DECLARE
  v_def jsonb;
  v_old timestamptz;
  v_updated uuid;
  v_user text;
BEGIN
 FOR v_user IN SELECT unnest(ARRAY[
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005'
 ]) LOOP
  PERFORM set_config('request.jwt.claim.sub',v_user,true);
  v_def:=public.get_staff_editable_ucapsa_exam_draft('00000000-0000-4000-8000-000000000020');
  IF jsonb_array_length(v_def->'items')<>2 OR v_def->>'code'<>'EX-A' THEN
   RAISE EXCEPTION 'Staff draft not loaded correctly';
  END IF;
 END LOOP;

 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
 v_old:=(v_def->>'updated_at')::timestamptz;
 BEGIN
   PERFORM public.get_staff_editable_ucapsa_exam_draft('00000000-0000-4000-8000-000000000021');
   RAISE EXCEPTION 'Published exam exposed as editable';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 BEGIN
   PERFORM public.staff_update_ucapsa_exam_draft(
    '00000000-0000-4000-8000-000000000021','BAD','Published',null,
    '[{"title":"Bad","max_points":10}]'::jsonb,v_old);
   RAISE EXCEPTION 'Published exam mutation succeeded';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 BEGIN
   PERFORM public.staff_update_ucapsa_exam_draft(
    '00000000-0000-4000-8000-000000000022','BAD','Closed',null,
    '[{"title":"Bad","max_points":10}]'::jsonb,v_old);
   RAISE EXCEPTION 'Closed-season mutation succeeded';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 BEGIN
   PERFORM public.staff_update_ucapsa_exam_draft(
    '00000000-0000-4000-8000-000000000023','BAD','Has attempt',null,
    '[{"title":"Bad","max_points":10}]'::jsonb,v_old);
   RAISE EXCEPTION 'Draft with attempts mutated';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 BEGIN
   PERFORM public.staff_update_ucapsa_exam_draft(
    '00000000-0000-4000-8000-000000000020','EX-A','Bad points',null,
    '[{"title":"Bad","max_points":-1}]'::jsonb,v_old);
   RAISE EXCEPTION 'Invalid points accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 BEGIN
   PERFORM public.staff_update_ucapsa_exam_draft(
    '00000000-0000-4000-8000-000000000020','ex-other','Duplicate code',null,
    '[{"title":"Bad","max_points":1}]'::jsonb,v_old);
   RAISE EXCEPTION 'Duplicate exam code accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;

 v_updated:=public.staff_update_ucapsa_exam_draft(
    '00000000-0000-4000-8000-000000000020','EX-REVISED','Revised',
    DATE '2026-10-25',
    '[{"title":"First","description":"Proof","max_points":12.5},{"title":"Second","max_points":25}]'::jsonb,
    v_old);
 IF v_updated<>'00000000-0000-4000-8000-000000000020'::uuid THEN
  RAISE EXCEPTION 'Unexpected edited draft id';
 END IF;
 BEGIN
   PERFORM public.staff_update_ucapsa_exam_draft(
    '00000000-0000-4000-8000-000000000020','EX-STALE','Stale',null,
    '[{"title":"Bad","max_points":10}]'::jsonb,v_old);
   RAISE EXCEPTION 'Concurrent stale draft overwrote new content';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
 v_def:=public.get_staff_editable_ucapsa_exam_draft('00000000-0000-4000-8000-000000000020');
 IF v_def->>'code'<>'EX-REVISED' OR jsonb_array_length(v_def->'items')<>2 THEN
   RAISE EXCEPTION 'Draft read after edit failed';
 END IF;
END $staff$;
RESET ROLE;
DO $integrity$
BEGIN
 IF (SELECT count(*) FROM public.ucapsa_exam_items
   WHERE exam_id='00000000-0000-4000-8000-000000000020')<>2 THEN
   RAISE EXCEPTION 'Draft items lost';
 END IF;
 IF (SELECT coalesce(sum(max_points),0) FROM public.ucapsa_exam_items
   WHERE exam_id='00000000-0000-4000-8000-000000000020')<>37.5 THEN
   RAISE EXCEPTION 'Draft item values incorrect';
 END IF;
 IF (SELECT count(*) FROM public.ucapsa_exam_items
   WHERE exam_id='00000000-0000-4000-8000-000000000021')<>1 THEN
   RAISE EXCEPTION 'Published exam mutated';
 END IF;
 IF (SELECT count(*) FROM public.ucapsa_exam_attempts)<>1 THEN
   RAISE EXCEPTION 'Attempts mutated';
 END IF;
 IF (SELECT count(*) FROM public.admin_audit_logs WHERE action='ucapsa_exam.staff_draft_edit')<>1 THEN
   RAISE EXCEPTION 'Expected exactly one real write and audit';
 END IF;
END $integrity$;
SELECT 'UCAPSA exam-draft SQL authorization, atomicity and audit PASS' AS result;