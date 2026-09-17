import fs from 'node:fs';

const generatedFile = 'src/types/database.generated.ts';
const generated = fs.readFileSync(generatedFile, 'utf8');
const canonicalAlias = fs.readFileSync('src/types/database.types.ts', 'utf8');

const required = [
  'ucapsa_competition_seasons:',
  'ucapsa_exams:',
  'ucapsa_exam_items:',
  'ucapsa_exam_attempts:',
  'ucapsa_exam_item_results:',
  'ucapsa_import_batches:',
  'ucapsa_exam_import_rows:',
  'ucapsa_competition_adjustments:',
  'dog_awards:',
  'ucapsa_competition_inputs:',
  'ucapsa_constancy_summary:',
  'ucapsa_exam_eligibility:',
  'ucapsa_exam_official_results:',
  'ucapsa_competition_adjustment_summary:',
  'ucapsa_dog_award_summary:',
  'admin_add_ucapsa_competition_adjustment:',
  'admin_create_ucapsa_exam:',
  'admin_create_ucapsa_exam_import_batch:',
  'admin_grant_ucapsa_dog_award:',
  'admin_grant_ucapsa_training_achievement:',
  'admin_revoke_ucapsa_training_achievement:',
  'client_event_id: string | null',
  'dog_id: string | null',
  'register_member_visit_from_qr:',
  'register_program_attendance_from_qr:',
];

for (const token of required) {
  if (!generated.includes(token)) {
    throw new Error(`database.generated.ts is missing deployed Rango 1 contract: ${token}`);
  }
}

if (!/register_member_visit_from_qr:\s*\|/m.test(generated)) {
  throw new Error('Generated database types must preserve member visit QR overloads.');
}

if (!/register_program_attendance_from_qr:\s*\|/m.test(generated)) {
  throw new Error('Generated database types must preserve attendance QR overloads.');
}

const normalizedAlias = canonicalAlias.replace(/\/\*[\s\S]*?\*\//g, '').trim();
if (normalizedAlias !== "export type { Database } from './database.generated';") {
  throw new Error('database.types.ts must stay a thin alias of database.generated.ts; do not restore a manual schema overlay.');
}

console.log('Rango 1 generated database types contract: PASS');
