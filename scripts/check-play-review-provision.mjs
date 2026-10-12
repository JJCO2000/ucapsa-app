import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const provision='scripts/provision-google-play-review.mjs';
const seed='scripts/seed-google-play-review.mjs';
const source=fs.readFileSync(provision,'utf8');
const fixture=fs.readFileSync(seed,'utf8');
const envCheck=fs.readFileSync('scripts/check-build-env.mjs','utf8');
const client=fs.readFileSync('src/lib/supabase.ts','utf8');
const eas=JSON.parse(fs.readFileSync('eas.json','utf8'));
const review=eas.build.playReview;
assert.equal(review.extends,'production');
assert.equal(review.environment,'preview');
assert.equal(review.channel,'play-review');
assert.equal(review.env.EXPO_PUBLIC_UCAPSA_REVIEW_BUILD,'true');
assert.equal(review.android.buildType,'app-bundle');
assert.match(envCheck,/EXPO_PUBLIC_UCAPSA_REVIEW_BUILD/);
assert.match(envCheck,/hrfecmviyiluubymsoeq\.supabase\.co/);
assert.match(client,/Build de revision sin entorno de demostracion aislado/);
for (const text of [
  'admin.auth.admin.createUser({',
  'email_confirm: true',
  'randomBytes(24)',
  'app_metadata:',
  "tester.rpc('get_my_role')",
  'PLAY_REVIEW_PROJECT_REF',
  "branchRef === 'hrfecmviyiluubymsoeq'",
  "mode !== 'apply'",
  'existing.some(',
]) assert.ok(source.includes(text),'Falta control en alta: '+text);
for (const text of [
  'PLAY_REVIEW_PROJECT_REF',
  'if (!process.argv.includes',
  'page.users.length !== 4',
  'ucapsa_play_review',
  'program_enrollments',
  'membership_dog_access',
  'DEMO',
]) assert.ok(fixture.includes(text),'Falta control en seed: '+text);

const sandbox={
  ...process.env,
  PLAY_REVIEW_INBOX:'mockreview@gmail.com',
  PLAY_REVIEW_PROJECT_REF:'abcdefghijklmnopqrst',
  SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'',
  SUPABASE_SECRET_KEY:'',
};
for(const script of [provision,seed]){
  const result=execFileSync(process.execPath,[script],{env:sandbox,encoding:'utf8'});
  assert.match(result,/DRY RUN|Simulación: ningún cambio/);
}
const preview=execFileSync(process.execPath,[provision],{env:sandbox,encoding:'utf8'});
for(const role of ['client','member','trainer','admin'])assert.ok(preview.includes('ucapsa-play-'+role));

const forbidden={...sandbox,
  PLAY_REVIEW_PROJECT_REF:'hrfecmviyiluubymsoeq',
  SUPABASE_URL:'https://hrfecmviyiluubymsoeq.supabase.co'
};
for(const script of [provision,seed]){
  try {
    execFileSync(process.execPath,[script,'--apply'],{env:forbidden,stdio:'pipe'});
    throw Error('La ejecución en producción NO fue rechazada: '+script);
  }catch(error){
    if(String(error.message).includes('NO fue rechazada'))throw error;
    assert.notEqual(error.status,0);
  }
}
for(const [url,expectedSuccess] of [
  ['https://hrfecmviyiluubymsoeq.supabase.co',false],
  ['https://abcdefghijklmnopqrst.supabase.co',true]
]){
  const env={...sandbox,EXPO_PUBLIC_UCAPSA_REVIEW_BUILD:'true',
   EXPO_PUBLIC_SUPABASE_URL:url,EXPO_PUBLIC_SUPABASE_ANON_KEY:'fake-but-nonempty'};
  try {
    execFileSync(process.execPath,['scripts/check-build-env.mjs'],{env,stdio:'pipe'});
    if(!expectedSuccess)throw Error('Build de revision contra producción permitido');
  }catch(e){
    if(expectedSuccess||String(e.message).includes('permitido'))throw e;
    assert.notEqual(e.status,0);
  }
}
console.log('UCAPSA review isolation dry-run / negative production tests: PASS');
