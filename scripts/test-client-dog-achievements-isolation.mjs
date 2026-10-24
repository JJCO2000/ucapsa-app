import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path = 'src/app/client/dog-achievements.tsx';
const source = fs.readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0,
  ast.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '));
let loadInitializer;
function walk(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'load') {
    loadInitializer = node.initializer;
  }
  ts.forEachChild(node, walk);
}
walk(ast);
assert.ok(loadInitializer && ts.isCallExpression(loadInitializer));
const callback = loadInitializer.arguments[0];
assert.ok(callback && ts.isArrowFunction(callback));
const js = ts.transpileModule('exports.makeLoad = () => (' + callback.getText(ast) + ');', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness({ userId = 'A', dogId = 'dogA', isAdmin = false } = {}) {
  const scopeKey = !isAdmin && userId && dogId ? userId + ':' + dogId : '';
  const activeScopeKeyRef = { current: scopeKey }, loadRunRef = { current: 0 };
  const state = { items: [], name: null, key: null, ready: null,
    error: null, saved: false, selected: null };
  const achievementCache = [], dogCache = [], remote = [];
  const exports = {};
  vm.runInNewContext(js, {
    exports, Error, userId, dogId, isAdmin, scopeKey, activeScopeKeyRef, loadRunRef,
    setItems: value => { state.items = value; },
    setDogName: value => { state.name = value; },
    setLoadedForKey: value => { state.key = value; },
    setReadyForKey: value => { state.ready = value; },
    setError: value => { state.error = value; },
    setUsingSavedData: value => { state.saved = value; },
    setSelectedAchievement: value => {
      state.selected = typeof value === 'function' ? value(state.selected) : value;
    },
    getCachedAchievementsForDog: () => {
      const entry = deferred(); achievementCache.push(entry); return entry.promise;
    },
    readClientResource: () => {
      const entry = deferred(); dogCache.push(entry); return entry.promise;
    },
    clientReadKeys: { dogs: 'dogs' },
    getMyDogAchievements: () => {
      const entry = deferred(); remote.push(entry); return entry.promise;
    },
    getNewlyAwardedAchievement: (old, fresh) =>
      old?.length && fresh?.[0]?.newAward ? { title: 'new-award' } : null,
  });
  return { load: exports.makeLoad(), state, scopeKey, activeScopeKeyRef,
    loadRunRef, achievementCache, dogCache, remote };
}
function cache(h, index, achievements = [], name = 'Firulais') {
  h.achievementCache[index].resolve(achievements);
  h.dogCache[index].resolve({ data: [{ id: 'dogA', name }] });
}
async function flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); }

async function run() {
  {
    const h = harness(); const pending = h.load();
    h.activeScopeKeyRef.current = 'B:dogB'; h.loadRunRef.current++;
    cache(h, 0, [{ title: 'A private award' }]);
    await pending;
    assert.equal(h.remote.length, 0, 'Stale cache must not start a new server fetch.');
    assert.equal(h.state.key, null, 'Never show a different account\'s awards.');
    assert.equal(h.state.ready, null);
  }
  {
    const h = harness(); const old = h.load(), newest = h.load();
    cache(h, 1, [{ title: 'recent-cached' }]);
    await flush();
    assert.equal(h.remote.length, 1);
    h.remote[0].resolve([{ title: 'recent-server' }]); await newest;
    cache(h, 0, [{ title: 'obsolete' }]); await old;
    assert.equal(h.state.items[0].title, 'recent-server');
    assert.equal(h.state.key, h.scopeKey);
    assert.equal(h.state.ready, h.scopeKey);
  }
  {
    const h = harness(); const pending = h.load();
    h.achievementCache[0].reject(new Error('corrupt cache'));
    h.dogCache[0].reject(new Error('corrupt dog cache'));
    await flush();
    assert.equal(h.remote.length, 1, 'Offline cache failure cannot block official results.');
    h.remote[0].resolve([{ title: 'official' }]); await pending;
    assert.equal(h.state.items[0].title, 'official');
    assert.equal(h.state.error, null);
  }
  {
    const h = harness(); const pending = h.load();
    cache(h, 0, [{ title: 'offline' }]); await flush();
    h.remote[0].reject(new Error('offline')); await pending;
    assert.equal(h.state.items[0].title, 'offline');
    assert.equal(h.state.saved, true);
    assert.equal(h.state.ready, h.scopeKey);
  }
  {
    const h = harness(); const pending = h.load();
    cache(h, 0, null); await flush();
    h.remote[0].reject(new Error('offline')); await pending;
    assert.equal(h.state.items.length, 0);
    assert.equal(h.state.key, null);
    assert.match(h.state.error, /No pudimos cargar los logros/);
  }
  {
    const h = harness(); const pending = h.load();
    cache(h, 0, [{ title: 'earlier' }]); await flush();
    h.activeScopeKeyRef.current = 'A:another-dog'; h.loadRunRef.current++;
    h.remote[0].resolve([{ title: 'late', newAward: true }]); await pending;
    assert.equal(h.state.items[0].title, 'earlier', 'Late remote results cannot replace scoped cache.');
    assert.equal(h.state.selected, null, 'Late celebrations cannot open private medals.');
  }
  {
    const h = harness(); const pending = h.load();
    cache(h, 0, [{ title: 'earlier' }]); await flush();
    h.remote[0].resolve([{ title: 'fresh', newAward: true }]); await pending;
    assert.equal(h.state.selected.key, h.scopeKey);
    assert.equal(h.state.selected.item.title, 'new-award');
  }
  const tokens = [
    'const items = loadedForKey === scopeKey ? storedItems : []',
    'const dogName = loadedForKey === scopeKey ? storedDogName : null',
    'const selectedAchievement = selectedAward?.key === scopeKey ? selectedAward.item : null',
    'activeScopeKeyRef.current === scopeKey',
    'if (!isCurrentRun()) return;',
    'setLoadedForKey(null)',
    'setReadyForKey(null)',
    'onSelect={(item) => setSelectedAchievement({ key: scopeKey, item })}',
    'return () => { loadRunRef.current += 1; };',
  ];
  for (const token of tokens) assert.ok(source.includes(token),
    'Dog achievements scope invariant missing: ' + token);
  console.log('UCAPSA dog achievements: account/dog isolation, out-of-order results, cache fallback and scoped modal PASS');
}
await run();
