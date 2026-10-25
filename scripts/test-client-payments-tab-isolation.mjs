import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path = 'src/app/(tabs)/payments.tsx';
const source = fs.readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0, 'Payments tab TSX must parse');
let initializer;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'load') initializer = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(initializer && ts.isCallExpression(initializer), 'Must use the actual Payments load callback');
const arrow = initializer.arguments[0];
assert.ok(arrow && ts.isArrowFunction(arrow), 'Expected actual async callback');
const compiled = ts.transpileModule(
  'exports.createLoad = () => (' + arrow.getText(ast) + ');',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function makeHarness(id = 'A') {
  const cache = [], remote = [], bank = [], writes = [];
  const state = {
    overview: null, bankSettings: null, bankUnavailable: false,
    localReady: false, usingSavedData: false, savedAt: null,
    detailsAvailable: false, overviewAvailable: false, loadedForScope: null,
  };
  const user = { id };
  const sessionScope = id;
  const activeScopeRef = { current: sessionScope };
  const cacheScopeRef = { current: null };
  const loadRunRef = { current: 0 };
  const emptyOverview = { payments: [], obligations: [], outstanding_total: 0 };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Promise, Error,
    isAdmin: false, user, sessionScope, activeScopeRef, cacheScopeRef, loadRunRef,
    emptyOverview, DEFAULT_READ_TIMEOUT_MS: 3000,
    clientReadKeys: { paymentSummary: 'paymentSummary' },
    setLoadedForScope: v => { state.loadedForScope = v; },
    setOverview: v => { state.overview = v; },
    setBankSettings: v => { state.bankSettings = v; },
    setBankUnavailable: v => { state.bankUnavailable = v; },
    setLocalReady: v => { state.localReady = v; },
    setUsingSavedData: v => { state.usingSavedData = v; },
    setSavedAt: v => { state.savedAt = v; },
    setDetailsAvailable: v => { state.detailsAvailable = v; },
    setOverviewAvailable: v => { state.overviewAvailable = v; },
    readClientResource: () => { const d = deferred(); cache.push(d); return d.promise; },
    getMyPaymentOverview: () => { const d = deferred(); remote.push(d); return d.promise; },
    getPaymentSettings: () => { const d = deferred(); bank.push(d); return d.promise; },
    withOperationTimeout: promise => promise,
    isValidClabe: x => x === 'valid-clabe',
    writeClientResource: async (userId, key, value) => {
      writes.push({ userId, key, value });
      return { saved_at: 'just-now' };
    },
    createPaymentOfflineSummary: v => v,
  });
  return { load: exports.createLoad(), state, cache, remote, bank,
    writes, activeScopeRef, cacheScopeRef, loadRunRef, sessionScope };
}
const overview = (label) => ({
  payments: [{ id: label }], obligations: [],
  outstanding_total: 100, attention_total: 100,
});
const settings = {
  is_active: true, clabe: 'valid-clabe',
  bank_name: 'Test bank', account_holder: 'Test holder',
};
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

{
  const h = makeHarness('A');
  const pending = h.load();
  h.activeScopeRef.current = 'B';
  h.cache[0].resolve({ data: overview('private-A'), saved_at: 'old-date' });
  await pending;
  assert.equal(h.state.loadedForScope, null, 'Another account cannot receive cached data');
  assert.equal(h.remote.length, 0, 'A stale cache result must not start new requests');
  assert.equal(h.state.overview.payments.length, 0);
}
{
  const h = makeHarness('A');
  const pending = h.load();
  h.cache[0].resolve(null); await flush();
  assert.equal(h.remote.length, 1);
  h.activeScopeRef.current = 'B';
  h.remote[0].resolve(overview('private-A'));
  h.bank[0].resolve(settings);
  await pending;
  assert.equal(h.state.loadedForScope, 'A',
    'The scope from the initial cache is retained in state, never reassigned to B');
  assert.equal(h.state.overview.payments.length, 0, 'Late server data must not be committed');
  assert.equal(h.state.bankSettings, null, 'Late bank data must not be committed');
  assert.equal(h.writes.length, 0);
}
{
  const h = makeHarness('A');
  const old = h.load(), latest = h.load();
  h.cache[1].resolve(null); await flush();
  h.remote[0].resolve(overview('latest'));
  h.bank[0].resolve(settings);
  await latest;
  h.cache[0].resolve({ data: overview('stale'), saved_at: 'old' }); await old;
  assert.equal(h.state.overview.payments[0].id, 'latest');
  assert.equal(h.state.bankSettings.account_holder, 'Test holder');
  assert.equal(h.state.loadedForScope, 'A');
  assert.equal(h.state.detailsAvailable, true);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].userId, 'A');
}
{
  const h = makeHarness('A');
  const pending = h.load();
  h.cache[0].resolve({ data: overview('offline'), saved_at: 'cached' }); await flush();
  h.remote[0].reject(new Error('offline'));
  h.bank[0].reject(new Error('offline'));
  await pending;
  assert.equal(h.state.overview.payments[0].id, 'offline');
  assert.equal(h.state.usingSavedData, true);
  assert.equal(h.state.bankSettings, null, 'Bank details must never be served from cache');
  assert.equal(h.state.bankUnavailable, true);
  assert.equal(h.state.detailsAvailable, false);
}

for (const text of [
  'activeScopeRef.current = sessionScope',
  'loadedForScope === sessionScope',
  'const overview = scopeReady ? storedOverview : emptyOverview',
  'const bankSettings = scopeReady ? storedBankSettings : null',
  'const localReady = scopeReady && storedLocalReady',
  'const detailsAvailable = scopeReady && storedDetailsAvailable',
  'activeScopeRef.current === scope',
  'setLoadedForScope(null)',
  'setLoadedForScope(scope)',
  'if (!scopeReady || activeScopeRef.current !== sessionScope) return;',
  'if (activeScopeRef.current !== sessionScope) return;',
]) {
  assert.ok(source.includes(text), 'Missing account isolation: ' + text);
}
assert.ok(!source.includes('supabase.from('), 'UI must not create parallel payment queries');
console.log('UCAPSA Payments tab account isolation: stale cache/server, concurrent requests, offline balance and bank details PASS');
