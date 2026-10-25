import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/app/client/competition.tsx', 'utf8');
const file = ts.createSourceFile('competition.tsx', source, ts.ScriptTarget.ES2022,
  true, ts.ScriptKind.TSX);
assert.equal(file.parseDiagnostics.length, 0, 'Competition screen must parse as TSX');
function extractCallback(name) {
  let initializer;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) {
      initializer = node.initializer;
    }
    ts.forEachChild(node, walk);
  }
  walk(file);
  assert.ok(initializer && ts.isCallExpression(initializer), 'Expected callback '+name);
  const arrow = initializer.arguments[0];
  assert.ok(arrow && ts.isArrowFunction(arrow), 'Expected async arrow for '+name);
  return ts.transpileModule('exports.makeCallback = () => ('+arrow.getText(file)+');',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
}
const accountCode=extractCallback('loadAccount');
const rankingCode=extractCallback('loadRanking');
function deferred() {
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
async function tick() {for(let i=0;i<5;i++)await Promise.resolve();}
function harness() {
  const activeUserIdRef={current:'A'},accountRunRef={current:0},rankingRunRef={current:0};
  const state={snapshot:null,loadedFor:null,selectedSeasonId:null,localReady:false,
    error:null,savedAt:null,usingSaved:false,rows:[],rankingKey:null,rankingReady:false};
  const accountCache=[],accountRemote=[],rankingCache=[],rankingRemote=[],warnings=[];
  const ctx={
    Error,userId:'A',isAdmin:false,activeUserIdRef,accountRunRef,rankingRunRef,
    applySnapshot:v=>{state.snapshot=v;state.selectedSeasonId=v.season;},
    setLoadedForUserId:v=>state.loadedFor=v,
    setSnapshot:v=>state.snapshot=v,
    setSelectedSeasonId:v=>state.selectedSeasonId=v,
    setLocalReady:v=>state.localReady=v,
    setError:v=>state.error=v,
    setUsingSavedData:v=>state.usingSaved=v,
    setSavedAt:v=>state.savedAt=v,
    setRows:v=>state.rows=v,
    setLoadedRankingForKey:v=>state.rankingKey=v,
    setRankingReady:v=>state.rankingReady=v,
    devWarn:(...args)=>warnings.push(args),
    getCachedMyCompetitionAccount:()=>{const d=deferred();accountCache.push(d);return d.promise;},
    refreshMyCompetitionAccount:()=>{const d=deferred();accountRemote.push(d);return d.promise;},
    getCachedCompetitionLeaderboard:()=>{const d=deferred();rankingCache.push(d);return d.promise;},
    refreshCompetitionLeaderboard:()=>{const d=deferred();rankingRemote.push(d);return d.promise;},
  };
  const callbacks={};
  for(const [name,code] of [['account',accountCode],['ranking',rankingCode]]) {
    const exports={};
    vm.runInNewContext(code,{...ctx,exports});
    callbacks[name]=exports.makeCallback();
  }
  return {...callbacks,state,activeUserIdRef,accountRunRef,rankingRunRef,
    accountCache,accountRemote,rankingCache,rankingRemote,warnings};
}
function account(season) {return {data:{season,dogs:[]},saved_at:season+'-saved'};}
function ranking(mark) {return {data:[{dog_id:mark}],saved_at:mark+'-saved'};}
async function run() {
  {
    const h=harness();
    const pending=h.account();
    h.activeUserIdRef.current='B';h.accountRunRef.current++;
    h.accountCache[0].resolve(account('A-stale'));await pending;
    assert.equal(h.accountRemote.length,0);
    assert.equal(h.state.snapshot,null);
  }
  {
    const h=harness();const old=h.account(),latest=h.account();
    h.accountCache[1].resolve(null);await tick();
    h.accountRemote[0].resolve(account('new'));await latest;
    h.accountCache[0].resolve(account('old'));await old;
    assert.equal(h.state.snapshot.season,'new');
    assert.equal(h.state.loadedFor,'A');
    assert.equal(h.state.localReady,true);
  }
  {
    const h=harness();const pending=h.account();
    h.accountCache[0].resolve(account('saved'));await tick();
    h.accountRemote[0].reject(new Error('offline'));await pending;
    assert.equal(h.state.snapshot.season,'saved');
    assert.equal(h.state.usingSaved,true);
    assert.equal(h.state.error,null);
  }
  {
    const h=harness();const pending=h.account();
    h.accountCache[0].reject(new Error('bad cache'));await tick();
    assert.equal(h.accountRemote.length,1);
    h.accountRemote[0].resolve(account('online'));await pending;
    assert.equal(h.state.snapshot.season,'online');
    assert.equal(h.warnings.length,1);
  }
  {
    const h=harness();
    const first=h.ranking('season-A'),second=h.ranking('season-B');
    h.rankingCache[1].resolve(null);await tick();
    h.rankingRemote[0].resolve(ranking('new'));await second;
    h.rankingCache[0].resolve(ranking('old'));await first;
    assert.equal(h.state.rows[0].dog_id,'new');
    assert.equal(h.state.rankingKey,JSON.stringify(['A','season-B']));
    assert.equal(h.state.rankingReady,true);
  }
  {
    const h=harness();
    const pending=h.ranking('season-A');
    h.rankingCache[0].resolve(ranking('cached'));await tick();
    h.activeUserIdRef.current='B';h.rankingRunRef.current++;
    h.rankingRemote[0].resolve(ranking('private-old'));await pending;
    assert.equal(h.state.rows[0].dog_id,'cached',
      'Response from abandoned account must not replace data');
  }
  {
    const h=harness();const pending=h.ranking('season-A');
    h.rankingCache[0].resolve(null);await tick();
    h.rankingRemote[0].reject(new Error('offline'));await pending;
    assert.equal(h.state.rows.length,0);
    assert.equal(h.state.rankingReady,true);
  }
  for(const token of [
    'const snapshot = accountCurrent ? storedSnapshot : null',
    'const rows = rankingCurrent ? storedRows : []',
    'const selectedSeasonId = accountCurrent ? storedSelectedSeasonId : null',
    'activeUserIdRef.current === userId',
    'accountRunRef.current += 1',
    'rankingRunRef.current += 1',
    'if (activeUserIdRef.current !== userId) return;',
    'setLoadedForUserId(userId)',
  ]) assert.ok(source.includes(token),'Missing session/season guard '+token);
  console.log('UCAPSA client competition: account switch, concurrent summary/ranking, stale season, offline fallback, local failures and side effect guards PASS');
}
await run();
