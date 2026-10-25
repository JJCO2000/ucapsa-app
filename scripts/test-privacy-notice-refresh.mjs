import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real async callback from PrivacyNoticeScreen against controlled
// Supabase results. No network, account or live legal notice is modified.
const path = 'src/app/privacy.tsx';
const source = fs.readFileSync(path, 'utf8');
const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length, 0,
  parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '));
let target;
function walk(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'load')
    target = node.initializer;
  ts.forEachChild(node, walk);
}
walk(parsed);
assert.ok(target && ts.isCallExpression(target), 'Load hook not found');
const callback = target.arguments[0];
assert.ok(callback && ts.isArrowFunction(callback), 'Actual load callback must be an arrow');
const compiled = ts.transpileModule('exports.makeLoad = () => (' + callback.getText(parsed) + ');',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const pending = [];
  const state = { notice: { version: 'obsolete' }, loading: false, error: 'older-error' };
  const loadRunRef = { current: 0 };
  const exports = {};
  vm.runInNewContext(compiled, {
    Error, exports, loadRunRef,
    getPublishedPrivacyNotice: () => {
      const response = deferred(); pending.push(response); return response.promise;
    },
    setLoading: v => { state.loading = v; },
    setNotice: v => { state.notice = v; },
    setError: v => { state.error = v; },
  });
  return { load: exports.makeLoad(), pending, state, loadRunRef };
}
async function run() {
  {
    const h = harness(), request = h.load();
    assert.equal(h.state.notice, null, 'Previously loaded notice must not remain visible during verification');
    assert.equal(h.state.loading, true);
    h.pending[0].resolve({ version: '1.2' }); await request;
    assert.equal(h.state.notice.version, '1.2');
    assert.equal(h.state.error, null);
    assert.equal(h.state.loading, false);
  }
  {
    const h = harness(), first = h.load(), second = h.load();
    h.pending[1].resolve({ version: 'new' }); await second;
    h.pending[0].resolve({ version: 'stale' }); await first;
    assert.equal(h.state.notice.version, 'new', 'Late responses must not replace the latest notice');
  }
  {
    const h = harness(), first = h.load();
    h.loadRunRef.current += 1; // screen loses focus
    h.pending[0].resolve({ version: 'hidden' }); await first;
    assert.equal(h.state.notice, null, 'Unfocused responses must not reveal content');
  }
  {
    const h = harness(), first = h.load();
    h.pending[0].reject(new Error('offline')); await first;
    assert.equal(h.state.notice, null);
    assert.equal(h.state.error, 'offline');
    assert.equal(h.state.loading, false);
    const retry = h.load();
    assert.equal(h.state.error, null);
    h.pending[1].resolve({ version: 'published' }); await retry;
    assert.equal(h.state.notice.version, 'published');
    assert.equal(h.state.error, null);
  }
  {
    const h = harness(), request = h.load();
    h.pending[0].resolve(null); await request;
    assert.equal(h.state.notice, null, 'No invented legal fallback');
    assert.equal(h.state.error, null);
  }
  for (const token of [
    'useFocusEffect(useCallback(() => {',
    'return () => { loadRunRef.current += 1; };',
    'const runId = ++loadRunRef.current',
    'setNotice(null)',
    'if (runId !== loadRunRef.current) return;',
    'refreshControl={<RefreshControl',
    'accessibilityLabel="Reintentar aviso de privacidad"',
    '!loading && !error && notice',
  ]) {
    assert.ok(source.includes(token), 'Published legal notice control missing: ' + token);
  }
  console.log('UCAPSA privacy notice reload: latest published only, concurrent refresh, lost focus, offline retry and null notice PASS');
}
await run();
