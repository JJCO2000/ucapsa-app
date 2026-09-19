import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-training-achievements.sql', 'utf8');

const required = [
  'ucapsa_validate_dog_achievement_owner',
  'trg_ucapsa_validate_dog_achievement_owner',
  'admin_grant_ucapsa_training_achievement',
  "'puppy_completed'",
  "'comandos_basico_completed'",
  "'comandos_medio_completed'",
  "'comandos_avanzado_completed'",
  "'manual_admin'",
  'ucapsa_training_achievement.grant',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`Rango 1 training achievement contract missing: ${token}`);
  }
}

if (/create\s+table/i.test(sql)) {
  throw new Error('Training achievements must reuse user_achievements; do not create a second medal table.');
}

if (/admin_revoke_ucapsa_training_achievement/i.test(sql)) {
  throw new Error('Training achievements must not expose a destructive revoke RPC.');
}

if (/delete\s+from\s+public\.user_achievements\b/i.test(sql)) {
  throw new Error('Training achievements must preserve awarded history instead of deleting it.');
}

if (/insert\s+into\s+public\.(?!user_achievements|admin_audit_logs)/i.test(sql)) {
  throw new Error('Training achievement RPCs must write only canonical achievements plus audit.');
}

console.log('Rango 1 formal dog training achievements: PASS');
