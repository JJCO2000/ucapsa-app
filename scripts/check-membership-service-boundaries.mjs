import fs from 'node:fs';

const service = fs.readFileSync('src/services/memberships.service.ts', 'utf8');
const domain = fs.readFileSync('src/services/memberships.domain.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

if (/lib\/supabase|\bsupabase\.(?:from|rpc|auth|storage)\b|\bcreateClient\s*\(/.test(domain)) {
  throw new Error('memberships.domain.ts must stay pure and Supabase-free.');
}

for (const token of [
  'getMembershipEffectiveStatus',
  'isMembershipActiveToday',
  'getMembershipStatusLabel',
  'getPaymentStatusLabel',
  'formatDate',
]) {
  if (!domain.includes('export function ' + token)) {
    throw new Error('Membership domain contract missing: ' + token);
  }
  if (!service.includes(token)) {
    throw new Error('memberships.service.ts stopped re-exporting/using domain contract: ' + token);
  }
}

for (const token of [
  'export function getMembershipEffectiveStatus',
  'export function isMembershipActiveToday',
  'export function getMembershipStatusLabel',
  'export function getPaymentStatusLabel',
]) {
  if (service.includes(token)) {
    throw new Error('Pure membership rule moved back into memberships.service.ts: ' + token);
  }
}

if (/from ['"]\.\/memberships\.service['"]/.test(domain)) {
  throw new Error('Membership domain has a reverse dependency on memberships.service.ts.');
}

if (/membership_delete_requests|requestPermanentMembershipDeletion|approveMembershipDeleteRequest|rejectMembershipDeleteRequest|MembershipDeleteRequestRow/.test(service)) {
  throw new Error('Membership service reintroduced the retired deletion-request runtime.');
}

if (/end_date[\s\S]{0,200}(?:expired|Vencid)/i.test(domain)) {
  throw new Error('Membership domain reintroduced active expiry by historical end_date.');
}

const serviceLines = service.split(/\r?\n/).length;
if (serviceLines > 500) {
  throw new Error('memberships.service.ts grew past the current boundary: ' + serviceLines + ' lines.');
}

if (!pkg.includes('"check:membership-service-boundaries"')) {
  throw new Error('npm verify does not include the membership service-boundary guard.');
}

console.log('UCAPSA membership domain/service boundary: PASS');
