import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('docs/legal/BORRADOR_AVISO_PRIVACIDAD_UCAPSA_APP_1_4_NO_VIGENTE.md','utf8');
const module=fs.readFileSync('src/constants/privacy-notice-1-4.generated.ts','utf8');
const form=fs.readFileSync('src/app/admin/privacy-notice-form.tsx','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')).scripts;

const start=module.indexOf(' = ')+3,end=module.lastIndexOf(' as const;');
assert.ok(start>2&&end>start,'Generated legal constant missing');
const actual=JSON.parse(module.slice(start,end));
const segment=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
  assert.ok(i>=0&&j>i,'Missing legal section '+a);return source.slice(i+a.length,j).trim();};
const heading=(name)=>{
  const m=source.match(new RegExp('^\\*\\*'+name+':\\*\\*\\s*(.+)$','m'));
  assert.ok(m?.[1]);return m[1].trim();
};
const integral=segment('## Aviso integral','## ANEXO DE CONTROL INTERNO').replace(/\n---\s*$/,'').trim();
const matches=[...integral.matchAll(/^(\d{1,2})\. ([^\n]+)\n/gm)];
assert.equal(matches.length,18);
const parts=new Map(matches.map((m,i)=>[Number(m[1]),{
  title:m[2].trim(),
  body:integral.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:integral.length).trim(),
}]));
const body=(n)=>parts.get(n).body;
const expected={
  responsibleName:heading('Responsable'),
  responsibleAddress:heading('Domicilio'),
  contactEmail:heading('Correo'),
  simplifiedNotice:segment('## Aviso simplificado','## Aviso integral'),
  dataCategories:body(3),
  sensitiveDataCategories:body(4),
  purposes:body(5),
  consentRequiredPurposes:body(6),
  limitationMechanisms:body(12),
  arcoProcedure:body(11),
  changeNoticeMethod:body(15),
  transferClause:body(13),
  integralNotice:'AVISO DE PRIVACIDAD INTEGRAL DE UCAPSA APP\n\n'
    +matches.map(m=>Number(m[1])+'. '+parts.get(Number(m[1])).title+'\n'+body(Number(m[1]))).join('\n\n'),
};
assert.deepEqual(actual,expected,'Editor proposal diverged from the SINGLE legal source');
assert.ok(actual.integralNotice.includes('Pendiente de aprobación, publicación y fecha de entrada en vigor'));
assert.ok(!actual.integralNotice.includes('ANEXO DE CONTROL INTERNO'));
for(const token of [
  "import { privacyNotice14Candidate } from '../../constants/privacy-notice-1-4.generated'",
  'function validEffectiveDate(value: string)',
  'function loadReviewedCandidate()',
  'effectiveFrom:',
  'T00:00:00-06:00',
  'const saved = await save();',
  'await publishPrivacyNotice(targetId as string)',
  'Cargar propuesta 1.4 para revisión',
  'Fecha de vigencia (AAAA-MM-DD)',
]){
  assert.ok(form.includes(token),'Superadmin editor guard missing '+token);
}
assert.ok(!form.includes('effectiveFrom: null'), 'Saving must not discard effective date');
assert.equal(pkg['check:privacy-1-4-candidate'],'node scripts/check-privacy-1-4-candidate.mjs');
assert.ok(pkg.verify.includes('npm run check:privacy-1-4-candidate &&'));
console.log('UCAPSA privacy 1.4 single legal source, Superadmin prefill, version date and publication gate PASS');
