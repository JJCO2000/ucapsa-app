import fs from 'node:fs';

const facade = fs.readFileSync('src/services/achievements.service.ts', 'utf8');
const domain = fs.readFileSync('src/services/achievements.domain.ts', 'utf8');
const cache = fs.readFileSync('src/services/achievements-cache.service.ts', 'utf8');
const read = fs.readFileSync('src/services/achievements-read.service.ts', 'utf8');
const admin = fs.readFileSync('src/services/achievements-admin.service.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const line of [
  "export * from './achievements.domain';",
  "export * from './achievements-cache.service';",
  "export * from './achievements-read.service';",
  "export * from './achievements-admin.service';",
]) {
  if (!facade.includes(line)) {
    throw new Error('Achievement compatibility facade lost export: ' + line);
  }
}

if (/AsyncStorage|lib\/supabase|\bsupabase\.|\bfunction\s+|\bconst\s+/.test(facade)) {
  throw new Error('achievements.service.ts must remain a compatibility facade without implementation.');
}

if (/AsyncStorage|lib\/supabase|\bsupabase\./.test(domain)) {
  throw new Error('achievements.domain.ts must remain pure.');
}

for (const token of [
  'mergeDefinitionsWithStoredAchievements',
  'countUnlockedAchievements',
  'formatAchievementDate',
  'AchievementDefinition',
  'UserAchievement',
  'AchievementWithState',
]) {
  if (!domain.includes(token)) {
    throw new Error('Achievement domain contract missing: ' + token);
  }
}

for (const token of [
  'ACHIEVEMENT_CACHE_PREFIX',
  'getCachedAchievementsForUser',
  'getCachedAchievementsForDog',
  'persistAchievementCache',
  'clearAchievementCacheForUser',
]) {
  if (!cache.includes(token)) {
    throw new Error('Achievement cache contract missing: ' + token);
  }
}

if (/\.from\(|\.rpc\(|\bsupabase\b/.test(cache)) {
  throw new Error('Achievement cache must not perform remote I/O.');
}

for (const token of [
  'getAchievementsForUser',
  'getAchievementsForDog',
  'refreshAchievementsForUser',
  'refreshAchievementsForDog',
  'getMyAchievements',
  'getMyDogAchievements',
  "from './achievements-cache.service'",
  "from './achievements.domain'",
]) {
  if (!read.includes(token)) {
    throw new Error('Achievement read contract missing: ' + token);
  }
}

for (const token of [
  'grantTrainingAchievementToDog',
  'awardAchievementToUser',
  "admin_grant_ucapsa_training_achievement",
  "from './achievements-cache.service'",
]) {
  if (!admin.includes(token)) {
    throw new Error('Achievement admin contract missing: ' + token);
  }
}

for (const [name, text] of [
  ['achievement domain', domain],
  ['achievement cache', cache],
  ['achievement reads', read],
  ['achievement admin', admin],
]) {
  if (/from ['"]\.\/achievements\.service['"]/.test(text)) {
    throw new Error(name + ' created a reverse dependency through achievements.service.ts.');
  }
}

if (/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(['"]admin_/.test(read)) {
  throw new Error('Achievement read service regained write/admin operations.');
}
if (/AsyncStorage/.test(read) || /AsyncStorage/.test(admin)) {
  throw new Error('Achievement cache persistence leaked outside the cache service.');
}

for (const [name, text, maxLines] of [
  ['achievement facade', facade, 20],
  ['achievement domain', domain, 110],
  ['achievement cache', cache, 180],
  ['achievement reads', read, 240],
  ['achievement admin', admin, 120],
]) {
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) {
    throw new Error(name + ' grew past its responsibility boundary: ' + lines + ' > ' + maxLines + '.');
  }
}

if (!pkg.includes('"check:achievement-service-boundaries"')) {
  throw new Error('npm verify does not include the achievement service boundary guard.');
}

console.log('UCAPSA achievement domain/cache/read/admin boundaries: PASS');
