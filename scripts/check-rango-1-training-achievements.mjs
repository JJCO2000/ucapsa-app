import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-rango-1-training-achievements.sql', 'utf8');
const service = fs.readFileSync('src/services/achievements.service.ts', 'utf8');
const adminUi = fs.readFileSync('src/app/admin/customer-achievements.tsx', 'utf8');

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

if (/create\s+or\s+replace\s+function\s+public\.admin_revoke_ucapsa_training_achievement/i.test(sql) ||
    /grant\s+execute\s+on\s+function\s+public\.admin_revoke_ucapsa_training_achievement/i.test(sql)) {
  throw new Error('Training achievements must not expose a destructive revoke RPC.');
}

if (/delete\s+from\s+public\.user_achievements\b/i.test(sql)) {
  throw new Error('Training achievements must preserve awarded history instead of deleting it.');
}

if (/insert\s+into\s+public\.(?!user_achievements|admin_audit_logs)/i.test(sql)) {
  throw new Error('Training achievement RPCs must write only canonical achievements plus audit.');
}

for (const token of [
  'grantTrainingAchievementToDog',
  "supabase.rpc('admin_grant_ucapsa_training_achievement'",
  'isProgramCompletionAchievementCode(achievementCode)',
  'clearAchievementCacheForUser',
]) {
  if (!service.includes(token)) {
    throw new Error('Training achievement service contract missing: ' + token);
  }
}

if (!/awardAchievementToUser[\s\S]{0,260}isProgramCompletionAchievementCode\(achievementCode\)[\s\S]{0,260}throw new Error/.test(service)) {
  throw new Error('Generic achievement grant can still bypass dog-specific training history.');
}

for (const token of [
  'getDogsForUser',
  'getAchievementsForDog',
  'grantTrainingAchievementToDog',
  'selectedDogId',
  'Logros de entrenamiento',
]) {
  if (!adminUi.includes(token)) {
    throw new Error('Admin training achievement UI contract missing: ' + token);
  }
}

if (/awardAchievementToUser\(userId, item\.definition\.code\)/.test(adminUi)
    && !/globalItems\.map/.test(adminUi)) {
  throw new Error('Admin UI can still route formal training achievements through the global grant.');
}

console.log('Rango 1 formal dog training achievements: PASS');
