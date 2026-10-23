import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('supabase/functions/dog-ranking-photo/index.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const DOG = '00000000-0000-4000-8000-000000000051';
const OWNER = '00000000-0000-4000-8000-000000000002';

function handlerFor(overrides = {}) {
  let handler;
  const s = {
    validSession: true, authorized: true, validNotice: true,
    afterDownloadRevoked: false, transformAvailable: true,
    downloadCalls: [], queries: 0, ...overrides,
  };
  function chain(table) {
    const query = {
      select: () => query, eq: () => query, is: () => query,
      order: () => query, limit: () => query,
      maybeSingle: async () => {
        if(table === 'dog_ranking_photo_consents') {
          s.queries++;
          return { data: s.authorized && !(s.afterDownloadRevoked && s.downloadCalls.length)
            ? { user_id:OWNER, notice_version:'1.4-current' } : null, error:null };
        }
        if(table === 'dogs') return {
          data: { user_id:OWNER, photo_path:'owner/dog/photo.jpg', is_active:true }, error:null,
        };
        if(table === 'privacy_notices') return { data: s.validNotice ? {
          version:'1.4-current',ranking_photo_publication_approved:true,
          integral_notice:'autorización para foto pública',
          simplified_notice:'foto pública opcional',
        } : { version:'1.2-old',ranking_photo_publication_approved:false,
          integral_notice:'',simplified_notice:'' }, error:null };
        throw new Error('Unexpected table '+table);
      },
    };
    return query;
  }
  const service = {
    from: chain,
    storage:{ from:(bucket) => {
      assert.equal(bucket,'dog-photos');
      return { download: async(path,options)=>{
        s.downloadCalls.push({path,options});
        return s.transformAvailable
          ? {data:new Blob(['safe thumb'],{type:'image/jpeg'}),error:null}
          : {data:null,error:{message:'Resize not enabled'}};
      }};
    }},
  };
  const auth = {
    auth:{ getUser: async token => ({
      data:{user:s.validSession && token==='valid' ? {id:OWNER} : null},
      error:s.validSession ? null : {message:'invalid'},
    }) },
  };
  const module = {exports:{}};
  vm.runInNewContext(js,{
    module,exports:module.exports,Response,URL,Blob,
    require:(id)=>{
      assert.match(id,/supabase-js/);
      return { createClient:(_url,key)=>key==='service-key'?service:auth };
    },
    Deno:{
      env:{get:(k)=>({
        SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'anon-key',
        SUPABASE_SERVICE_ROLE_KEY:'service-key',
        UCAPSA_RANKING_IMAGE_ALLOWED_ORIGINS:'https://ucapsa.test',
      })[k]},
      serve:(fn)=>{handler=fn;},
    },
  });
  assert.equal(typeof handler,'function');
  return {handler,state:s};
}
async function request(handler,opts={}) {
  return handler(new Request('https://test.invalid/functions/v1/dog-ranking-photo?dog_id='+DOG,{
    method:opts.method??'GET',headers:{
      Authorization:'Bearer '+(opts.token??'valid'),
      ...(opts.origin?{Origin:opts.origin}:{}),
    },
  }));
}
const ok=handlerFor();
let response=await request(ok.handler);
assert.equal(response.status,200);
assert.equal(response.headers.get('cache-control').includes('no-store'),true);
assert.equal(response.headers.get('content-type'),'image/jpeg');
assert.equal(ok.state.downloadCalls.length,1);
assert.deepEqual(JSON.parse(JSON.stringify(ok.state.downloadCalls[0].options)),
  { transform:{width:256,height:256,resize:'cover',quality:70} });
assert.equal(ok.state.queries,2,'Permissions must be rechecked after conversion');

for (const [name,flags,status] of [
  ['revoked', {authorized:false},404],
  ['old privacy notice', {validNotice:false},404],
  ['invalid JWT', {validSession:false},401],
  ['transform off', {transformAvailable:false},404],
  ['race during transform', {afterDownloadRevoked:true},404],
]) {
  const t=handlerFor(flags);
  response=await request(t.handler);
  assert.equal(response.status,status,name);
  if (name==='revoked'||name==='old privacy notice'||name==='invalid JWT')
    assert.equal(t.state.downloadCalls.length,0,'No download for '+name);
}
const cors=handlerFor();
response=await request(cors.handler,{origin:'https://not-ucapsa.test'});
assert.equal(response.status,403);
assert.equal(cors.state.downloadCalls.length,0);
const allowed=handlerFor();
response=await request(allowed.handler,{origin:'https://ucapsa.test'});
assert.equal(response.status,200);
assert.equal(response.headers.get('access-control-allow-origin'),'https://ucapsa.test');
const badMethod=handlerFor();
response=await request(badMethod.handler,{method:'DELETE'});
assert.equal(response.status,405);
assert.equal(badMethod.state.downloadCalls.length,0);
console.log('Ranking photo Edge: auth, CORS, resize, notice, revoke-race and no-source-fallback PASS');
