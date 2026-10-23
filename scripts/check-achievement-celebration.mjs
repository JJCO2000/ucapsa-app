import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const sharing = fs.readFileSync('src/utils/achievement-sharing.ts','utf8');
const action = fs.readFileSync('src/components/domain/AchievementShareAction.tsx','utf8');
const grid = fs.readFileSync('src/components/domain/AchievementBadgeGrid.tsx','utf8');
const activity = fs.readFileSync('src/app/client/activity-achievements.tsx','utf8');
const defs = fs.readFileSync('src/constants/activityAchievements.ts','utf8');

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
console.log('UCAPSA achievement celebration: canonical awards, optional share and cross-platform PASS');
