import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const svc = fs.readFileSync('src/services/ranking-photo-consent.service.ts','utf8');
const component = fs.readFileSync('src/components/domain/RankingPhotoChoice.tsx','utf8');
const profile = fs.readFileSync('src/app/client/dog-profile.tsx','utf8');
let notice = null;
const mock = { rpc: (name, params) => Promise.resolve({
  data: name === 'get_my_dog_ranking_photo_consents'
    ? [{ dog_id: 'dog-1', enabled: true }] : params?.p_enabled,
  error: null,
}) };
const out = { exports: {} };
vm.runInNewContext(ts.transpileModule(svc, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {
  exports:out.exports,module:out,
  require:(path)=>{
    if(path==='../lib/supabase') return {supabase:mock};
    if(path==='./privacy-notice.service')return {getPublishedPrivacyNotice:async()=>notice};
    throw new Error('Unknown import '+path);
  },
});
const choices=out.exports;
assert.equal(await choices.isRankingPhotoChoiceAvailable(),false,'Missing notice cannot authorize photos.');
notice={version:'1.2-appstores-2026-09-27'};
assert.equal(await choices.isRankingPhotoChoiceAvailable(),false,'Published 1.2 must not authorize.');
notice={version:'1.4-2026-10-23',ranking_photo_publication_approved:false};
assert.equal(await choices.isRankingPhotoChoiceAvailable(),false,'Version is not consent by itself.');
notice={version:'1.4-2026-10-23',ranking_photo_publication_approved:true};
assert.equal(await choices.isRankingPhotoChoiceAvailable(),true,'Approved notice can display choice.');
assert.equal(await choices.getMyRankingPhotoChoice('dog-1'),true);
assert.equal(await choices.getMyRankingPhotoChoice('dog-2'),false,'Cannot use another dog preference.');
assert.equal(await choices.setMyRankingPhotoChoice('dog-1',true),true);
notice={version:'1.2',ranking_photo_publication_approved:false};
await assert.rejects(()=>choices.setMyRankingPhotoChoice('dog-1',true),'Must reject before approved notice.');
assert.equal(await choices.setMyRankingPhotoChoice('dog-1',false),false,'Revocation must be possible without 1.4.');
for(const token of [
  'accessibilityRole="radio"',
  'visible={confirming}',
  'Sí, mostrar mi foto',
  'Cancelar',
  'Otros usuarios',
  'Puedes volver a mostrar el avatar',
  'setMyRankingPhotoChoice(dogId, nextEnabled)',
  '!imageEnabled',
]) assert.ok(component.includes(token),'Missing explicit choice guard: '+token);
for(const token of ['<RankingPhotoChoice','photoPath={profile.photo_path}','avatarKey={avatarKey}','photoUrl={photoUrl}']) {
  assert.ok(profile.includes(token),'Profile must connect choice to owned dog: '+token);
}
assert.ok(!svc.includes('createSignedUrl(') && !component.includes('getPublicUrl('),
  'No public bucket or signed photo URLs may be generated.');
console.log('UCAPSA Ranking photo choice: opt-in, legal gate, owner RPC and rollback PASS');
