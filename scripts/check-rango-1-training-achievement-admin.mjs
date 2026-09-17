import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-training-achievement-admin.sql', 'utf8');

const required = [
  'admin_grant_ucapsa_training_achievement',
  'admin_revoke_ucapsa_training_achievement',
  "'puppy_completed'",
  "'comandos_basico_completed'",
  "'comandos_medio_completed'",
  "'comandos_avanzado_completed'",
  "'manual_admin'",
  "insert into public.user_achievements",
  "delete from public.user_achievements",
  "'ucapsa_training_achievement.grant'",
  "'ucapsa_training_achievement.revoke'",
  'from public, anon, authenticated',
];

for (const token of required) {
  if (!sql.includes(token)) {
    throw new Error(`Rango 1 training achievement contract missing: ${token}`);
  }
}

if (/insert\s+into\s+public\.dog_awards/i.test(sql)) {
  throw new Error('Training achievements must not use dog_awards.');
}

if (/insert\s+into\s+public\.ucapsa_competition_adjustments/i.test(sql)) {
  throw new Error('Training achievements must not create competitive point adjustments.');
}

if (!/where\s+ua\.dog_id\s*=\s*p_dog_id[\s\S]*?ua\.achievement_code\s*=\s*p_achievement_code/i.test(sql)) {
  throw new Error('Training achievement operations must stay dog-specific.');
}

console.log('Rango 1 training achievement Admin contract: PASS');
