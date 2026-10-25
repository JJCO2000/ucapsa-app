import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const script = 'scripts/prepare-privacy-notice-1-4.mjs';
function run(...args) {
  return spawnSync(process.execPath,[script,...args],{encoding:'utf8',maxBuffer:3*1024*1024});
}
const check=run('--check');
assert.equal(check.status,0,'Review-only contract failed: '+check.stderr);
assert.match(check.stdout,/18 sections/);
assert.match(check.stdout,/REVIEW ONLY/);

const noApproval=run('--json');
assert.notEqual(noApproval.status,0,'Must not create publication candidate with no approved date');
assert.match(noApproval.stderr,/Provide a real --effective-date/);
const badDate=run('--json','--effective-date=2026-02-30');
assert.notEqual(badDate.status,0,'Invalid calendar date must be rejected');
const invalidDate=run('--json','--effective-date=not-approved');
assert.notEqual(invalidDate.status,0,'Arbitrary dates must be rejected');

const sampleDate='2026-10-25';
const dryRun=run('--json','--effective-date='+sampleDate);
assert.equal(dryRun.status,0,'Review packet output failed: '+dryRun.stderr);
const output=JSON.parse(dryRun.stdout);
assert.equal(output.status,'draft');
assert.match(output.warning,/NO PUBLICADO/);
assert.equal(output.fields_for_superadmin.version,'1.4-appstores-'+sampleDate);
assert.equal(output.fields_for_superadmin.effectiveFrom,sampleDate+'T00:00:00-06:00');
assert.equal(output.fields_for_superadmin.id,null);
for(const field of [
  'responsibleName','responsibleAddress','contactEmail','dataCategories',
  'sensitiveDataCategories','purposes','consentRequiredPurposes',
  'limitationMechanisms','arcoProcedure','changeNoticeMethod','transferClause',
  'simplifiedNotice','integralNotice',
]) {
  assert.ok(typeof output.fields_for_superadmin[field]==='string'
    && output.fields_for_superadmin[field].trim().length>20,
    'Missing material in Superadmin editor field: '+field);
}
const integral=output.fields_for_superadmin.integralNotice;
const simplified=output.fields_for_superadmin.simplifiedNotice;
assert.equal((integral.match(/^\d{1,2}\. /gm)??[]).length,18);
assert.match(integral,/18\. Recurso externo de eliminación/);
assert.match(integral,/Entrada en vigor: 2026-10-25/);
assert.doesNotMatch(integral,/ANEXO DE CONTROL INTERNO|BORRADOR PARA REVISIÓN|NO VIGENTE/);
assert.doesNotMatch(simplified,/ANEXO DE CONTROL INTERNO|BORRADOR|NO PUBLICAR/);
assert.match(simplified,/familiares/);
assert.match(simplified,/ARCO/);
const source=fs.readFileSync(script,'utf8');
for(const forbidden of ['@supabase/supabase-js','createClient(','.from(','.rpc(','node-fetch','https.request(','writeFileSync(']) {
  assert.ok(!source.includes(forbidden),'Reviewer generator unexpectedly gained write/network functionality: '+forbidden);
}
console.log('UCAPSA legal 1.4 packet: check, 18 sections, 13 fields, no annex, invalid dates rejected, draft-only JSON and no Supabase writes PASS.');
