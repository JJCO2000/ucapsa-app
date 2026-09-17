import fs from 'node:fs';

const freezeSql = fs.readFileSync('supabase/sql/ucapsa-rango-1-freeze-closed-seasons.sql', 'utf8');
const stateSql = fs.readFileSync('supabase/sql/ucapsa-rango-1-season-state-machine.sql', 'utf8');

const requiredFreeze = [
  'ucapsa_assert_competition_date_mutable',
  'ucapsa_assert_competition_season_mutable',
  'trg_ucapsa_guard_closed_season_definition',
  'trg_ucapsa_guard_program_attendance_closed_season',
  'trg_ucapsa_guard_enrollment_closed_attendance',
  'trg_ucapsa_guard_member_visit_closed_season',
  'trg_ucapsa_guard_member_visit_dog_closed_season',
  'trg_ucapsa_guard_exam_closed_season',
  'trg_ucapsa_guard_exam_item_closed_season',
  'trg_ucapsa_guard_exam_attempt_closed_season',
  'trg_ucapsa_guard_exam_result_closed_season',
  'trg_ucapsa_guard_adjustment_closed_season',
  'trg_ucapsa_guard_import_batch_closed_season',
  "s.status = 'closed'",
  "old.status = 'closed'",
  "from public, anon, authenticated",
];

for (const token of requiredFreeze) {
  if (!freezeSql.includes(token)) {
    throw new Error(`Rango 1 closed-season freeze contract missing: ${token}`);
  }
}

if (/on\s+public\.dog_awards\b/i.test(freezeSql)) {
  throw new Error('dog_awards must remain outside the closed-season freeze so post-close awards stay possible.');
}

if (!freezeSql.includes("new.dog_id is not distinct from old.dog_id")) {
  throw new Error('Enrollment dog reassignment must be protected for closed-season attendance history.');
}

const requiredState = [
  'trg_ucapsa_guard_season_state_machine',
  "old.status = 'draft' and new.status = 'active'",
  "old.status = 'active' and new.status = 'closed'",
  "old.status = 'closed' and new.status = 'reopened'",
  "old.status = 'reopened' and new.status = 'closed'",
  "old.status <> 'draft'",
];

for (const token of requiredState) {
  if (!stateSql.includes(token)) {
    throw new Error(`Rango 1 season state-machine contract missing: ${token}`);
  }
}

console.log('Rango 1 closed-season freeze contract: PASS');
