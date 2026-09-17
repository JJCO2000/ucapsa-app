import fs from 'node:fs';

const file = 'src/types/database.generated.ts';
const text = fs.readFileSync(file, 'utf8');

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
];

for (const token of required) {
  if (!text.includes(token)) {
    throw new Error(`database.generated.ts is missing deployed Rango 1 contract: ${token}`);
  }
}

console.log('Rango 1 generated database types contract: PASS');
