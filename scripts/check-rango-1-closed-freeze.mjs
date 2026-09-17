import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-freeze-closed-seasons.sql', 'utf8');

const required = [
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

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`Rango 1 closed-season freeze contract missing: ${token}`);
  }
}

if (/dog_awards/i.test(sql)) {
  throw new Error('dog_awards must remain outside the closed-season freeze so post-close awards stay possible.');
}

if (!sql.includes("new.dog_id is not distinct from old.dog_id")) {
  throw new Error('Enrollment dog reassignment must be protected for closed-season attendance history.');
}

console.log('Rango 1 closed-season freeze contract: PASS');
