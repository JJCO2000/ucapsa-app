import assert from 'node:assert/strict';
import fs from 'node:fs';

const notice = fs.readFileSync('src/components/domain/PreregistrationPrivacyNotice.tsx','utf8');
const proposal = fs.readFileSync('docs/legal/BORRADOR_AVISO_PRIVACIDAD_UCAPSA_APP_1_4_NO_VIGENTE.md','utf8');
const plan = fs.readFileSync('docs/legal/CIERRE_AVISO_1_4_GOOGLE_PLAY.md','utf8');
const official = fs.readFileSync('src/app/privacy.tsx','utf8');
const publishedDoc = fs.readFileSync('docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md','utf8');
const scripts = [
  'src/app/admin/preregister-dog.tsx',
  'src/app/staff/preregister-dog.tsx',
  'src/app/admin/preregistration.tsx',
];
for (const file of scripts) {
  const source = fs.readFileSync(file,'utf8');
  assert.ok(source.includes("import { PreregistrationPrivacyNotice } from '../../components/domain/PreregistrationPrivacyNotice';"),
    file+' must use shared disclosure component, never a copied privacy text');
  assert.ok(source.includes('<PreregistrationPrivacyNotice />'),
    file+' must display notice at the place where contacts are captured');
}
for (const text of [
  'Privacidad antes de registrar',
  'facilita el aviso',
  'cada persona involucrada',
  'no demuestra su consentimiento',
  'Si el aviso vigente no describe estos datos',
  "router.push('/privacy' as never)",
  'accessibilityRole="button"',
]) assert.ok(notice.includes(text),'Pre-registration privacy disclosure missing '+text);
assert.ok(official.includes('getPublishedPrivacyNotice'),
  'Privacy entry point must resolve the actual published Supabase notice');
for (const phrase of [
  'personas titulares y familiares cuyos datos',
  'antes de tener una cuenta',
  'no se debe presumir el consentimiento',
  'incluidas las de personas sin cuenta',
  'NO VIGENTE / NO PUBLICAR',
]) assert.ok(proposal.includes(phrase),'Legal proposal missing coverage for pre-account persons: '+phrase);
const simplified=proposal.split('## Aviso simplificado')[1]?.split('## Aviso integral')[0] ?? '';
for (const token of [
  'Para limitar el uso o divulgación de sus datos',
  'ejercer derechos ARCO',
  'Los familiares preinscritos no reciben automáticamente cuenta',
  'https://jjco2000.github.io/ucapsa-app/privacidad/',
]) assert.ok(simplified.includes(token), 'Legal candidate 1.4 simplified lacks the required limitation/notice: '+token);
assert.ok(!fs.existsSync('docs/legal/SECUENCIA_PUBLICACION_AVISO_1_4_Y_GOOGLE_PLAY.md'),
  'Do not maintain two competing privacy release instructions.');
assert.ok(plan.includes('1.2-appstores-2026-09-27')
  && plan.includes('1.3 App Stores')
  && plan.includes('1.4 App Stores — BORRADOR')
  && plan.includes('admin_publish_privacy_notice')
  && plan.includes('Reversión')
  && plan.includes('pendiente de revisión y publicación'),
  'Legal release plan must distinguish three states, release gate, and rollback');
assert.ok(publishedDoc.includes('Versión 1.3 App Stores')
  && !publishedDoc.includes('Versión 1.4 App Stores'),
  'Adding disclosure must not silently publish an unapproved notice');
console.log('UCAPSA privacy collection disclosure: Admin, Trainer, late family, one published-notice route, not-yet-published 1.4, release gate PASS');
