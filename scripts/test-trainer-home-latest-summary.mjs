import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/app/(tabs)/trainer-home.tsx','utf8');
const parsed=ts.createSourceFile('trainer-home.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'Trainer home TSX syntax must be valid.');
let definition;
function find(node){
  if(ts.isVariableDeclaration(node) && node.name.getText(parsed)==='load') definition=node.initializer;
  ts.forEachChild(node,find);
}
find(parsed);
assert.ok(definition&&ts.isCallExpression(definition),'Real Trainer load callback must exist.');
const callback=definition.arguments[0];
assert.ok(callback && ts.isArrowFunction(callback));
const js=ts.transpileModule('exports.load = '+callback.getText(parsed)+';',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(){
  const calls=[];
  const state={days:[{label:'OLD',groups:['private']}],error:'old',loading:true};
  const loadRunRef={current:0};
  function call(name,date){
    const item=deferred();
    calls.push({name,date,...item});
    return item.promise;
  }
  const exports={};
  vm.runInNewContext(js,{
    exports,Error,
    capabilities:{canUseTrainingWorkspace:true},
    loadRunRef,today:'2026-10-23',tomorrow:'2026-10-24',
    getStaffClassSummary:day=>call('summary',day),
    getProgramSchedules:day=>call('schedules',day),
    getPrograms:()=>call('programs',''),
    getProgramClassCancellations:()=>call('cancellations',''),
    mergeOfficialSchedules:(rows,schedules)=>rows.map(r=>({scheduleId:r.id,official:schedules.length})),
    setDays:v=>{state.days=v;},setError:v=>{state.error=v;},setLoading:v=>{state.loading=v;},
  });
  function settle(begin,mark){
    for(let i=begin;i<begin+6;i++){
      const c=calls[i];
      assert.ok(c,'Expected six concurrent services in each loading pass');
      c.resolve(c.name==='summary'?[{id:mark}]:c.name==='schedules'?[{id:mark}]:[]);
    }
  }
  return {load:exports.load,calls,loadRunRef,state,settle};
}
// Late focus A cannot overwrite B after B has finished, even if A resolves last.
{
  const h=harness();
  const first=h.load(),second=h.load();
  h.settle(6,'new');await second;
  h.settle(0,'stale');await first;
  assert.equal(h.state.days[0].groups[0].scheduleId,'new');
  assert.equal(h.state.days[1].groups[0].scheduleId,'new');
  assert.equal(h.state.error,null);
  assert.equal(h.state.loading,false);
}
// Once the tab loses focus, neither data nor an error from its old request may appear.
{
  const h=harness();
  const p=h.load();
  h.loadRunRef.current+=1;
  h.settle(0,'private');await p;
  assert.equal(h.state.days[0].label,'OLD');
  assert.equal(h.state.loading,true);
}
{
  const h=harness();
  const p=h.load();
  h.loadRunRef.current+=1;
  h.calls[0].reject(new Error('old session failed'));
  for(let i=1;i<6;i++)h.calls[i].resolve([]);
  await p;
  assert.equal(h.state.error,null);
  assert.equal(h.state.days[0].label,'OLD');
}
// Current-session failure wipes old rows before showing a retryable error.
{
  const h=harness();
  const p=h.load();
  h.calls[0].reject(new Error('network error'));
  for(let i=1;i<6;i++)h.calls[i].resolve([]);
  await p;
  assert.equal(h.state.days.length,0);
  assert.equal(h.state.error,'network error');
  assert.equal(h.state.loading,false);
}
assert.ok(source.includes('return () => { loadRunRef.current += 1; };'),
  'Blur or unmount must invalidate in-flight requests.');
assert.ok(source.includes('setDays([]);') && source.includes('setLoading(true);'),
  'Reload must not show previous person or day data.');
assert.ok(source.includes('getStaffClassSummary(today)')&&source.includes('getStaffClassSummary(tomorrow)'),
  'Keep the two-day staff overview.');
assert.ok(source.includes('mergeOfficialSchedules(todayRows')&&source.includes('mergeOfficialSchedules(tomorrowRows'),
  'Keep canonical official schedule grouping.');
console.log('Trainer Home class summary: stale requests, focus cleanup, failure isolation and today/tomorrow PASS');
