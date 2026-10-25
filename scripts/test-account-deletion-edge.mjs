import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const edge=fs.readFileSync('supabase/functions/delete-account/index.ts','utf8');
const js=ts.transpileModule(edge,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const userId='00000000-0000-4000-8000-000000000001';

function createHarness(options={}) {
  const events=[];
  let handler;
  const admin={
    auth:{
      getUser:async(jwt)=>{
        events.push('verify-identity');
        return {data:{user:jwt==='good'?{id:userId}:null},error:null};
      },
      admin:{
        signOut:async()=>{events.push('sign-out');return {error:null};},
        deleteUser:async()=>{
          events.push('delete-auth');
          return {error:options.deleteError?{message:'fk constraint'}:null};
        },
      },
    },
    rpc:async(name,args)=>{
      events.push('preflight');
      assert.equal(name,'account_deletion_has_blocking_references');
      assert.equal(args.p_user_id,userId);
      return {data:options.blocked===true?true:false,
        error:options.preflightError?{message:'preflight unavailable'}:null};
    },
    storage:{
      from:(bucket)=>{assert.equal(bucket,'dog-photos');events.push('storage-bucket');return {};},
    },
    from:(table)=>{
      if(table==='profiles')return {
        select:()=>({eq:()=>({maybeSingle:async()=>{
          events.push('check-role');
          return {data:{role:options.role??'client'},error:null};
        }})}),
      };
      if(table==='account_deletion_requests')return {
        update:()=>({eq:async()=>{events.push('complete-ledger');return {error:null};}}),
      };
      if(table==='account_deletion_request_events')return {
        insert:async()=>{events.push('ledger-event');return {error:null};},
      };
      throw new Error('Unexpected admin table: '+table);
    },
  };
  const client={rpc:async(name)=>{
    assert.equal(name,'request_my_account_deletion');
    events.push('request-ledger');
    return {data:{id:'request-1',status:'pending'},error:null};
  }};
  const require=(name)=>{
    if(name.includes('@supabase/supabase-js'))return {
      createClient:(_url,key)=>key==='service-role'?admin:client,
    };
    if(name.includes('diagnostics.ts'))return{
      edgeError:()=>events.push('diagnostic-error'),
      edgeWarn:()=>events.push('diagnostic-warning'),
    };
    if(name.includes('account-deletion-storage.ts'))return{
      removeOwnedDogPhotos:async(_bucket,owner)=>{
        assert.equal(owner,userId);
        events.push('remove-owned-photos');
        if(options.photoError)throw new Error('storage error');
        return 2;
      },
    };
    throw new Error('Unexpected Edge dependency: '+name);
  };
  vm.runInNewContext(js,{
    exports:{},require,Response,Date,Error,
    Deno:{
      env:{get:(name)=>({
        SUPABASE_URL:'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY:'service-role',
        SUPABASE_ANON_KEY:'anon-key',
      })[name]},
      serve:(callback)=>{handler=callback;},
    },
  });
  assert.equal(typeof handler,'function');
  return {
    events,
    run:async(token='good')=>{
      const req=new Request('https://example.com/functions/v1/delete-account',{
        method:'POST',headers:{Authorization:'Bearer '+token},
        body:'{}',
      });
      const res=await handler(req);
      return {status:res.status,body:await res.json()};
    },
  };
}
{
  const h=createHarness();
  const res=await h.run();
  assert.equal(res.status,200);
  assert.equal(res.body.deleted,true);
  assert.deepEqual(h.events,[
    'verify-identity','check-role','request-ledger','preflight',
    'storage-bucket','remove-owned-photos','sign-out','delete-auth',
    'complete-ledger','ledger-event',
  ]);
}
for(const [scenario,opts] of [
  ['FK restriction',{blocked:true}],
  ['preflight unavailable',{preflightError:true}],
  ['private storage unavailable',{photoError:true}],
]) {
  const h=createHarness(opts);
  const res=await h.run();
  assert.equal(res.status,409,scenario);
  assert.notEqual(res.body.deleted,true,scenario);
  assert.ok(!h.events.includes('delete-auth'),scenario);
  assert.ok(!h.events.includes('sign-out'),scenario);
  if(!opts.photoError)assert.ok(!h.events.includes('remove-owned-photos'),scenario);
}
{
  const h=createHarness({deleteError:true});
  const res=await h.run();
  assert.equal(res.status,409,'Auth deletion error must not report success');
  assert.ok(h.events.includes('remove-owned-photos'));
  assert.ok(!h.events.includes('complete-ledger'));
}
{
  const h=createHarness({role:'admin'});
  const res=await h.run();
  assert.equal(res.status,403);
  assert.ok(!h.events.includes('request-ledger'));
  assert.ok(!h.events.includes('remove-owned-photos'));
}
{
  const h=createHarness();
  const res=await h.run('invalid');
  assert.equal(res.status,401);
  assert.deepEqual(h.events,['verify-identity']);
}
console.log('UCAPSA delete-account Edge runtime: success, FK block, preflight error, Storage error, Auth error, admin rejection, invalid JWT PASS');
