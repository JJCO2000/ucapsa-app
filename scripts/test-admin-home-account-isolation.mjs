import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/app/(tabs)/admin-home.tsx', 'utf8');
const parsed = ts.createSourceFile('admin-home.tsx', source,
  ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length, 0,
  parsed.parseDiagnostics.map(x => ts.flattenDiagnosticMessageText(x.messageText, ' ')).join('; '));
let initializer;
function walk(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'load') initializer = node.initializer;
  ts.forEachChild(node, walk);
}
walk(parsed);
assert.ok(initializer && ts.isCallExpression(initializer), 'Expected actual Admin Home load callback');
const arrow = initializer.arguments[0];
assert.ok(arrow && ts.isArrowFunction(arrow), 'Admin Home load must remain an arrow callback');
const compiled = ts.transpileModule('exports.load = (' + arrow.getText(parsed) + ');', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const cats = ['memberships', 'payments', 'decisions', 'followups', 'interests', 'rsvp', 'schedules', 'programs', 'cancellations'];
function fixture(userId = 'A', isAdmin = true) {
  const loadRunRef = { current: 0 }, activeUserIdRef = { current: userId };
  const requests = Object.fromEntries(cats.map(k => [k, []]));
  const state = {
    stats: null, resolvedForUserId: null, loading: true, error: null,
    tomorrowClasses: ['stale'], tomorrowOfficial: null,
    tomorrowSummaryFailed: false, interestsUnavailable: false,
  };
  const exports = {};
  const request = name => {
    const d = deferred();
    requests[name].push(d);
    return d.promise;
  };
  vm.runInNewContext(compiled, {
    exports, userId, isAdmin, Error, loadRunRef, activeUserIdRef,
    emptyStats: {pendingRequests: 0, paymentAttention: 0, trainingDecisions: 0,
      clientFollowups: 0, programInterests: 0},
    setLoading: v => state.loading = v,
    setError: v => state.error = v,
    setResolvedForUserId: v => state.resolvedForUserId = v,
    setStats: v => state.stats = v,
    setTomorrowClasses: v => state.tomorrowClasses = v,
    setTomorrowOfficial: v => state.tomorrowOfficial = v,
    setTomorrowSummaryFailed: v => state.tomorrowSummaryFailed = v,
    setInterestRequestsUnavailable: v => state.interestsUnavailable = v,
    getAdminMembershipRows: () => request('memberships'),
    getAdminPaymentAttentionRows: () => request('payments'),
    getAdminTrainingDecisionRows: () => request('decisions'),
    getAdminClientFollowupRows: () => request('followups'),
    getAdminProgramInterestRequests: () => request('interests'),
    getAdminClassRsvpSummary: () => request('rsvp'),
    getProgramSchedules: () => request('schedules'),
    getPrograms: () => request('programs'),
    getProgramClassCancellations: () => request('cancellations'),
    tomorrowDateKey: () => '2026-10-26',
    withOperationTimeout: p => p,
    DEFAULT_READ_TIMEOUT_MS: 3000,
    friendlyReadError: v => v,
    devWarn: () => undefined,
  });
  return {load: exports.load, state, requests, loadRunRef, activeUserIdRef};
}
function completeCore(h, index = 0, counts = [1,2,3,4,5], interestFailure = false) {
  const [memberships, payments, decisions, followups, interests] = counts;
  h.requests.memberships[index].resolve(Array.from({length: memberships}, () => ({membership:{status:'pending'}})));
  h.requests.payments[index].resolve(Array.from({length:payments}, () => ({})));
  h.requests.decisions[index].resolve(Array.from({length:decisions}, () => ({})));
  h.requests.followups[index].resolve(Array.from({length:followups}, () => ({})));
  if (interestFailure) h.requests.interests[index].reject(new Error('optional RPC down'));
  else h.requests.interests[index].resolve(Array.from({length:interests}, () => ({})));
}
function completeTomorrow(h, index = 0) {
  h.requests.rsvp[index].resolve([{scheduleId:'real'}]);
  h.requests.schedules[index].resolve([]);
  h.requests.programs[index].resolve([]);
  h.requests.cancellations[index].resolve([]);
}
async function microtasks() { for(let i=0;i<9;i++)await Promise.resolve(); }

async function check() {
  {
    const h = fixture();const old = h.load();
    h.activeUserIdRef.current = 'B'; h.loadRunRef.current++;
    completeCore(h, 0);await old;
    assert.equal(h.state.resolvedForUserId, null, 'Prior account data cannot be committed');
    assert.equal(h.requests.rsvp.length, 0, 'Prior account cannot start a second batch of queries');
    assert.equal(h.state.tomorrowClasses.length, 0, 'Private old agenda cleared at start');
  }
  {
    const h = fixture();
    const stale = h.load(); const newest = h.load();
    completeCore(h, 1, [2,1,3,4,5]);await microtasks();
    assert.equal(h.requests.rsvp.length, 1);
    completeTomorrow(h);await newest;
    completeCore(h, 0, [10,9,8,7,6]);await stale;
    assert.equal(h.state.resolvedForUserId,'A');
    assert.equal(h.state.stats.pendingRequests,2);
    assert.equal(h.state.stats.clientFollowups,4);
    assert.equal(h.state.stats.programInterests,5);
    assert.equal(h.state.loading,false);
    assert.equal(h.state.tomorrowClasses[0].scheduleId,'real');
  }
  {
    const h = fixture();const job = h.load();
    h.requests.payments[0].reject(new Error('private overview offline'));
    h.requests.memberships[0].resolve([]);h.requests.decisions[0].resolve([]);
    h.requests.followups[0].resolve([]);h.requests.interests[0].resolve([]);
    await job;
    assert.equal(h.state.resolvedForUserId,null,'Never declare zero pending when main reads fail');
    assert.equal(h.state.stats.clientFollowups,0);
    assert.equal(h.state.error,'No se pudo actualizar el resumen administrativo.');
    assert.equal(h.state.loading,false);
  }
  {
    const h=fixture();const job=h.load();
    completeCore(h,0,[1,0,0,2,0],true);await microtasks();
    completeTomorrow(h);await job;
    assert.equal(h.state.interestsUnavailable,true,'Optional interest failure must remain visible');
    assert.equal(h.state.stats.clientFollowups,2);
    assert.equal(h.state.resolvedForUserId,'A');
  }
  {
    const h=fixture();const job=h.load();completeCore(h);await microtasks();
    h.requests.schedules[0].reject(new Error('calendar offline'));
    h.requests.rsvp[0].resolve([]);h.requests.programs[0].resolve([]);
    h.requests.cancellations[0].resolve([]);await job;
    assert.equal(h.state.tomorrowSummaryFailed,true);
    assert.equal(h.state.tomorrowOfficial,null,'Never claim an official schedule on failure');
    assert.equal(h.state.resolvedForUserId,'A','Verified pending decisions still remain available');
  }
  {
    const h=fixture('A',false);await h.load();
    assert.equal(h.requests.memberships.length,0,'No Admin cannot query privileged dashboard');
  }
  {
    const h=fixture();const job=h.load();completeCore(h);await microtasks();
    h.activeUserIdRef.current='B';h.loadRunRef.current++;
    completeTomorrow(h);await job;
    assert.equal(h.state.resolvedForUserId,null,'Old tomorrow result must not commit');
    assert.equal(h.state.tomorrowOfficial,null);
  }

  for(const token of [
    'const hasData = Boolean(userId) && resolvedForUserId === userId',
    'activeUserIdRef.current === userId',
    'loadRunRef.current === runId',
    'if (!isCurrentRun()) return;',
    'setResolvedForUserId(null)',
    'setStats(emptyStats)',
    'setTomorrowClasses([])',
    'setTomorrowOfficial(null)',
    'setResolvedForUserId(userId)',
    'return () => { loadRunRef.current += 1; activeUserIdRef.current = \'\'; }',
    'hasData && tomorrowSummaryFailed',
    'hasData && !loading && !error',
  ]) assert.ok(source.includes(token),'Missing Admin Home isolation invariant: '+token);
  assert.ok(source.includes('getAdminClientFollowupRows()'),
    'Existing source-of-truth client followups must be kept');
}
await check();
console.log('UCAPSA Admin Home isolation PASS: account switch, stale refresh, current decisions, invalid main read, optional interests, tomorrow error, no-admin guard.');
