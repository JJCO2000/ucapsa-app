import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const helper=fs.readFileSync('supabase/functions/_shared/account-deletion-storage.ts','utf8');
const edge=fs.readFileSync('supabase/functions/delete-account/index.ts','utf8');
const preflight=fs.readFileSync('supabase/sql/ucapsa-account-deletion-restrict-preflight.sql','utf8');
const exports={};
vm.runInNewContext(ts.transpileModule(helper,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText,{exports,Set,Error,RegExp});
const {listOwnedDogPhotoPaths,removeOwnedDogPhotos}=exports;
assert.equal(typeof removeOwnedDogPhotos,'function');
assert.ok(edge.includes("import { removeOwnedDogPhotos } from '../_shared/account-deletion-storage.ts';"));
assert.ok(edge.indexOf("await userClient.rpc(")<edge.indexOf("await removeOwnedDogPhotos("));
assert.ok(edge.indexOf("await removeOwnedDogPhotos(")<edge.indexOf("admin.auth.admin.signOut("));

assert.ok(edge.includes("admin.rpc(\n    'account_deletion_has_blocking_references'"));
assert.ok(edge.indexOf("'account_deletion_has_blocking_references'") <
  edge.indexOf("await removeOwnedDogPhotos("));
assert.ok(edge.includes('preflightError || hasBlockingReferences !== false'));
assert.ok(preflight.includes("returns boolean") && preflight.includes("security definer"));
assert.ok(preflight.includes("set search_path = pg_catalog"));
assert.ok(preflight.includes("request.jwt.claim.role") && preflight.includes("service_role"));
assert.ok(preflight.includes("con.confdeltype in ('r', 'a')"));
assert.ok(preflight.includes("pg_catalog.array_length(con.conkey, 1) = 1"));
assert.ok(preflight.includes("grant execute on function public.account_deletion_has_blocking_references(uuid)"));
assert.doesNotMatch(preflight,/\b(delete|update|insert|truncate)\s+(from|into|table|public\.)\b/i);

assert.ok(edge.indexOf("await removeOwnedDogPhotos(")<edge.indexOf("admin.auth.admin.deleteUser("));
assert.match(edge,/storage_cleanup_failed[\s\S]*}, 409\);/);
assert.doesNotMatch(helper,/\.from\(['"]objects['"]\)|delete from storage\.objects/i);

const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
function fakeBucket(initial,{failList=false,failRemove=false,ignoreRemoval=false}={}) {
  const files=new Set(initial),calls=[];
  return {
    files,calls,
    async list(prefix,{limit,offset}) {
      calls.push(['list',prefix,offset]);
      if(failList)return {data:null,error:{message:'listing failed'}};
      const found=new Map();
      for (const path of files) {
        if (!path.startsWith(prefix+'/')) continue;
        const rest=path.slice(prefix.length+1);
        const first=rest.split('/')[0];
        found.set(first,rest.includes('/')
          ?{name:first,id:null,metadata:null}
          :{name:first,id:'object-'+first,metadata:{}});
      }
      return {data:[...found.values()].sort((a,b)=>a.name.localeCompare(b.name))
        .slice(offset,offset+limit),error:null};
    },
    async remove(paths) {
      calls.push(['remove',...paths]);
      if(failRemove)return {error:{message:'storage failure'}};
      if(!ignoreRemoval)for(const path of paths)files.delete(path);
      return {error:null};
    },
  };
}
{
  const paths=[owner+'/dog1/1.jpg',owner+'/dog1/old.jpg',owner+'/dog2/2.webp',
    other+'/dog1/secret.jpg'];
  const bucket=fakeBucket(paths);
  const found=await listOwnedDogPhotoPaths(bucket,owner);
  assert.equal(found.length,3);
  assert.ok(found.every(path=>path.startsWith(owner+'/')));
  assert.equal(await removeOwnedDogPhotos(bucket,owner),3);
  assert.deepEqual([...bucket.files],[other+'/dog1/secret.jpg']);
  assert.ok(bucket.calls.filter(c=>c[0]==='remove').every(c=>c.slice(1)
    .every(path=>path.startsWith(owner+'/'))));
}
{
  const bucket=fakeBucket([other+'/anything.jpg']);
  assert.equal(await removeOwnedDogPhotos(bucket,owner),0);
  assert.equal(bucket.files.size,1);
  assert.equal(bucket.calls.some(c=>c[0]==='remove'),false);
}
{
  const paths=Array.from({length:217},(_,i)=>owner+'/dog1/'+i+'.jpg');
  const bucket=fakeBucket(paths);
  assert.equal(await removeOwnedDogPhotos(bucket,owner),217);
  const removes=bucket.calls.filter(c=>c[0]==='remove');
  assert.equal(removes.length,3,'Batch size must be bounded.');
  assert.deepEqual(removes.map(c=>c.length-1),[100,100,17]);
}
{
  const bucket=fakeBucket([owner+'/dog/1.jpg'],{failList:true});
  await assert.rejects(removeOwnedDogPhotos(bucket,owner),/enumerate/);
  assert.equal(bucket.calls.some(c=>c[0]==='remove'),false);
}
{
  const bucket=fakeBucket([owner+'/dog/1.jpg'],{failRemove:true});
  await assert.rejects(removeOwnedDogPhotos(bucket,owner),/delete private dog photos/);
  assert.equal(bucket.files.size,1);
}
{
  const bucket=fakeBucket([owner+'/dog/1.jpg'],{ignoreRemoval:true});
  await assert.rejects(removeOwnedDogPhotos(bucket,owner),/photos remain/);
}
{
  const bucket=fakeBucket([other+'/dog/1.jpg']);
  await assert.rejects(removeOwnedDogPhotos(bucket,other+'evil'),/Invalid Auth user/);
}
console.log('UCAPSA ACCOUNT DELETE STORAGE: owner-only, orphan cleanup, pagination, API batching, read/remove failures, verification, Auth ordering PASS');
