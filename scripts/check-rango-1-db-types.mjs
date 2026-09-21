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
  'ucapsa_competition_scores:',
  'ucapsa_competition_ranges:',
  'ucapsa_competition_leaderboard:',
  'get_ucapsa_competition_leaderboard:',
  'ranking_position: number | null',
  'range_code: string | null',
  'range_name: string | null',
  'range_level: number | null',
  'is_constancy_outstanding: boolean | null',
  'ucapsa_value_exposures:',
  'ucapsa_continuity_observations:',
  'record_ucapsa_value_exposure:',
  'get_ucapsa_continuity_observations:',
  'has_value_exposure: boolean | null',
  'activity_events_after_exposure: number | null',
  'paid_payments_after_exposure: number | null',
  'constancy_population_count: number | null',
  'has_sufficient_constancy_population: boolean | null',
  'cohort_followup_complete: boolean | null',
  'early_value_exposure: boolean | null',
  'membership_payment_within_30d_after_exposure: number | null',
  'p_occurred_at?: string',
  'competitive_score: number | null',
  'constancy_points: number | null',
  'exam_points: number | null',
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
  'client_event_id: string | null',
  'dog_id: string | null',
  'register_member_visit_from_qr:',
  'register_program_attendance_from_qr:',
  'event_occurrence_cancellations:',
  'admin_archive_notification_campaign:',
  'admin_replace_announcement_reminders:',
];

for (const token of required) {
  if (!generated.includes(token)) {
    throw new Error(`database.generated.ts is missing deployed Rango 1 contract: ${token}`);
  }
}

const retired = [
  'admin_revoke_ucapsa_training_achievement:',
  'ucapsa_unlock_next_comandos_level:',
];

for (const token of retired) {
  if (generated.includes(token)) {
    throw new Error(`database.generated.ts contains retired production RPC: ${token}`);
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
