#!/usr/bin/env bash
set -euo pipefail
# Synthetic concurrency test ONLY: ephemeral GitHub Actions Postgres service.
[[ "${PGDATABASE:-}" == "ucapsa_test" ]] || { echo "Refusing non-test database" >&2; exit 1; }
query="set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_preregister_dog_with_program(
  'Race Tutor','race@test.invalid','','RaceDog','puppy','base',
  'P-900','2026-10-01',2,array[date '2026-10-04'],'concurrent test');"
psql -X -v ON_ERROR_STOP=1 -Atq -c "$query" > /tmp/ucapsa-race-1.out 2>&1 &
one=$!
psql -X -v ON_ERROR_STOP=1 -Atq -c "$query" > /tmp/ucapsa-race-2.out 2>&1 &
two=$!
wait "$one"
wait "$two"
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $ucapsa$
begin
  if (select count(*) from ucapsa_intake.people where email_key='race@test.invalid')<>1 then
    raise exception 'Concurrent pre-registration created duplicate people';
  end if;
  if (select count(*) from ucapsa_intake.dogs d join ucapsa_intake.people p
      on d.person_id=p.id where p.email_key='race@test.invalid')<>1 then
    raise exception 'Concurrent pre-registration created duplicate dog';
  end if;
  if (select coalesce(sum(h.quantity),0) from ucapsa_intake.attendance_evidence h
       join ucapsa_intake.programs e on e.id=h.intake_program_id
       join ucapsa_intake.dogs d on d.id=e.dog_id
       join ucapsa_intake.people p on p.id=d.person_id
       where p.email_key='race@test.invalid')<>2 then
    raise exception 'Concurrent pre-registration doubled attendance history';
  end if;
end
$ucapsa$;
SQL
echo 'UCAPSA concurrent admin registrations: PASS'
