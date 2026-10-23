import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const sharing = fs.readFileSync('src/utils/achievement-sharing.ts','utf8');
const action = fs.readFileSync('src/components/domain/AchievementShareAction.tsx','utf8');
const grid = fs.readFileSync('src/components/domain/AchievementBadgeGrid.tsx','utf8');
const activity = fs.readFileSync('src/app/client/activity-achievements.tsx','utf8');
const defs = fs.readFileSync('src/constants/activityAchievements.ts','utf8');
const detector = fs.readFileSync('src/services/achievement-celebration.domain.ts','utf8');
const allAchievements = fs.readFileSync('src/app/achievements.tsx','utf8');
const dogAchievements = fs.readFileSync('src/app/client/dog-achievements.tsx','utf8');

const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(sharing, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, {module:mod,exports:mod.exports});
const build = mod.exports.buildAchievementShareMessage;
assert.ok(typeof build === 'function');
const shareText = build('Primera clase');
assert.match(shareText, /Primera clase.*UCAPSA/);
assert.ok(!shareText.includes('correo') && !shareText.includes('user_id'));
assert.ok(!/[\r\n]/.test(build('Una medalla\n con saltos')));
assert.ok(build('').includes('un logro'));
assert.ok(build('A'.repeat(100)).length < 150);
assert.ok(action.includes('Platform.OS === \'web\'') && action.includes('Clipboard.setStringAsync')
  && action.includes('Share.share({ message })'), 'Web must copy and mobile must use native share sheet.');
assert.ok(action.includes('onPress={() => { void share(); }}')
  && action.includes('disabled={sharing}'), 'Sharing requires a deliberate user action.');
assert.ok(!action.includes('useEffect(') && !action.includes('console.log('),
  'Never share automatically or print private data.');
assert.ok(grid.includes('item.unlocked ? <AchievementShareAction')
  && grid.includes('Medalla pendiente')
  && grid.includes('¡Felicidades! Medalla conseguida')
  && grid.includes('CONTINUAR'), 'Official medals celebrate ONLY unlocked canonical awards.');
assert.ok(activity.includes('collection.earnedDefinition ? (')
  && activity.includes('<AchievementShareAction title={collection.earnedDefinition.title} />')
  && activity.includes('collections.filter((item) => item.currentLevel > 0).length'),
  'Activity milestones use canonical collection, no new counters or fake awards.');
assert.ok(defs.includes('buildActivityAchievementCollections')
  && defs.includes('activityAchievementDefinitions'), 'Canonical thresholds must remain unchanged.');
assert.ok(!grid.includes('Share.share({') && !activity.includes('Share.share({'),
  'Sharing implementation must be centralized.');
const rewardMod = { exports: {} };
vm.runInNewContext(ts.transpileModule(detector, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { module: rewardMod, exports: rewardMod.exports });
const newAward = rewardMod.exports.getNewlyAwardedAchievement;
const row = (id, unlocked, awardDate) => ({
  definition: { code: id, title: id },
  unlocked,
  achievement: unlocked ? { id: 'award-' + id, awarded_at: awardDate } : null,
});
const before = [row('puppy_completed', false, ''), row('comandos_basico_completed', false, '')];
const after = [row('puppy_completed', true, '2026-10-22T22:00:00Z'), row('comandos_basico_completed', false, '')];
assert.equal(newAward(null, after), null, 'No past awards on first load.');
assert.equal(newAward(before, after)?.definition.code, 'puppy_completed');
assert.equal(newAward(after, after), null, 'Same award must never celebrate twice.');
assert.equal(newAward(after, before), null, 'Revoked/unlocked false is not new award.');
assert.equal(newAward(before, [row('program_definition_only',true,'')].map(r => ({
  ...r, achievement:null,
}))), null, 'Derived or fake state cannot trigger award celebration.');
assert.equal(newAward(before, [
  row('puppy_completed',true,'2026-10-20T00:00:00Z'),
  row('comandos_basico_completed',true,'2026-10-22T00:00:00Z'),
])?.definition.code, 'comandos_basico_completed','Most recent official award has priority.');
assert.ok(allAchievements.includes('getNewlyAwardedAchievement(cached, fresh)')
  && dogAchievements.includes('getNewlyAwardedAchievement(cachedAchievements, fresh)'),
  'Both personal award screens must celebrate new, stored awards only.');
assert.ok(allAchievements.includes('requestId !== requestIdRef.current')
  && dogAchievements.includes('if (!isCurrentRun()) return;'),
  'Obsolete requests cannot open a false celebration.');
console.log('UCAPSA achievement celebration: canonical awards, new-award detection, optional share PASS');
