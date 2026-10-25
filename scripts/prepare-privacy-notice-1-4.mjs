#!/usr/bin/env node
// Review-only mapping for proposed UCAPSA privacy notice 1.4.
// Reads ONE legal source. No network calls, Supabase writes or publication.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'docs/legal/BORRADOR_AVISO_PRIVACIDAD_UCAPSA_APP_1_4_NO_VIGENTE.md';
const source = fs.readFileSync(sourcePath, 'utf8');

function segment(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Missing legal notice boundary: ' + start);
  return text.slice(a + start.length, b).trim();
}

const simplifiedNotice = segment(source, '## Aviso simplificado', '## Aviso integral');
const integralSource = segment(source, '## Aviso integral', '## ANEXO DE CONTROL INTERNO')
  .replace(/\n---\s*$/, '').trim();
const sections = new Map();
const expression = /^(\d{1,2})\. ([^\n]+)\n/gm;
const matches = [...integralSource.matchAll(expression)];
for (let i = 0; i < matches.length; i += 1) {
  const [full, num, title] = matches[i];
  const from = matches[i].index + full.length;
  const to = i + 1 < matches.length ? matches[i+1].index : integralSource.length;
  sections.set(Number(num), { title: title.trim(), body: integralSource.slice(from, to).trim() });
}
for (let i = 1; i <= 18; i += 1) {
  assert.ok(sections.has(i) && sections.get(i).body.length > 45,
    'Section ' + i + ' is absent or incomplete.');
}
assert.equal(sections.size, 18, 'Unexpected notice section (annex contamination or numbering).');

function heading(name) {
  const match = source.match(new RegExp('^\\*\\*' + name + ':\\*\\*\\s*(.+)$', 'm'));
  assert.ok(match?.[1]?.trim(), 'Missing identity field: ' + name);
  return match[1].trim();
}
function body(i) {return sections.get(i).body;}
const identity = {
  responsibleName: heading('Responsable'),
  responsibleAddress: heading('Domicilio'),
  contactEmail: heading('Correo'),
};
assert.match(identity.contactEmail, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
assert.ok(!/NO VIGENTE|BORRADOR|ANEXO DE CONTROL INTERNO/i.test(simplifiedNotice),
  'Simplified notice includes internal draft instructions.');
assert.ok(/personas titulares y familiares/i.test(integralSource),
  'Pre-account contacts must be included in the integral notice.');
assert.ok(/no se debe presumir el consentimiento/i.test(body(6)),
  'Third-party records must not be treated as consent.');
assert.ok(/Para limitar el uso o divulgación/i.test(simplifiedNotice)
  && /derechos ARCO/i.test(simplifiedNotice),
  'Simplified notice must explain limitation and ARCO options.');
assert.ok(/sin crearles una cuenta/i.test(body(3))
  && /sin acceso automático|no equivale|no autoriza/i.test(integralSource),
  'Pre-registration cannot create access to family data.');
assert.ok(!/foto pública|fotos públicas.*ranking/i.test(simplifiedNotice),
  'Do not advertise optional public ranking photos before activation.');

const effectiveArg = process.argv.find(arg => arg.startsWith('--effective-date='));
const date = effectiveArg?.slice('--effective-date='.length) ?? '';
const checkOnly = process.argv.includes('--check');
const json = process.argv.includes('--json');
if (!checkOnly && !json) {
  throw new Error('Use --check for CI, or --json --effective-date=YYYY-MM-DD only AFTER legal approval.');
}
if (json && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z'))
  || new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date)) {
  throw new Error('Provide a real --effective-date=YYYY-MM-DD AFTER approval; no date will be invented.');
}

const expectedDraftStatus = 'Borrador de versión 1.4 App Stores. Pendiente de aprobación, publicación y fecha de entrada en vigor.';
assert.ok(body(16).includes(expectedDraftStatus),
  'Draft section 16 changed: do not silently publish a provisional legal clause.');
const assembled = matches.map((match) => {
  const num = Number(match[1]);
  const section = sections.get(num);
  const content = num === 16 && json
    ? section.body.replace(expectedDraftStatus,
        'Versión 1.4 App Stores. Entrada en vigor: ' + date + '.')
    : section.body;
  return num + '. ' + section.title + '\n' + content;
}).join('\n\n');
const integralNotice = 'AVISO DE PRIVACIDAD INTEGRAL DE UCAPSA APP\n\n' + assembled;

const draft = {
  id: null,
  version: json ? '1.4-appstores-' + date : '',
  ...identity,
  dataCategories: body(3),
  sensitiveDataCategories: body(4),
  purposes: body(5),
  consentRequiredPurposes: body(6),
  limitationMechanisms: body(12),
  arcoProcedure: body(11),
  changeNoticeMethod: body(15),
  transferClause: body(13),
  simplifiedNotice,
  integralNotice,
  effectiveFrom: json ? date + 'T00:00:00-06:00' : null,
};
const required = [
  'responsibleName','responsibleAddress','contactEmail','dataCategories',
  'sensitiveDataCategories','purposes','consentRequiredPurposes','limitationMechanisms',
  'arcoProcedure','changeNoticeMethod','transferClause','simplifiedNotice','integralNotice',
];
for (const field of required) {
  assert.equal(typeof draft[field], 'string', 'Invalid field: ' + field);
  assert.ok(draft[field].length >= 7, 'Missing field: ' + field);
}
assert.ok(!/ANEXO DE CONTROL INTERNO|NO VIGENTE \/ NO PUBLICAR/.test(integralNotice),
  'Internal annex must never reach the legal form.');
if (json) {
  assert.ok(!integralNotice.includes(expectedDraftStatus)
    && integralNotice.includes('Entrada en vigor: ' + date),
  'Approval date must replace the draft caveat in the published candidate.');
  console.log(JSON.stringify({
    warning: 'CANDIDATO PARA REVISIÓN. NO PUBLICADO. Requiere aprobación jurídica y operación manual por Superadmin.',
    source: sourcePath,
    status: 'draft',
    fields_for_superadmin: draft,
  }, null, 2));
} else {
  console.log('UCAPSA 1.4 proposal: 18 sections, 13 required fields, abbreviated+integral notices, family limits, internal annex excluded. REVIEW ONLY; production remains unchanged.');
}
