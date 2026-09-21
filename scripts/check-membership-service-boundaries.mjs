import fs from 'node:fs';

const facade = fs.readFileSync('src/services/memberships.service.ts', 'utf8');
const domain = fs.readFileSync('src/services/memberships.domain.ts', 'utf8');
const eligibility = fs.readFileSync('src/services/memberships-eligibility.service.ts', 'utf8');
const client = fs.readFileSync('src/services/memberships-client.service.ts', 'utf8');
const admin = fs.readFileSync('src/services/memberships-admin.service.ts', 'utf8');
const lifecycleSql = fs.readFileSync('supabase/sql/ucapsa-membership-status-lifecycle.sql', 'utf8');
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
}

for (const line of [
  "export * from './memberships.domain';",
  "export * from './memberships-eligibility.service';",
  "export * from './memberships-client.service';",
  "export * from './memberships-admin.service';",
]) {
  if (!facade.includes(line)) {
    throw new Error('Membership compatibility facade lost export: ' + line);
  }
}

if (/lib\/supabase|\bsupabase\.|\bfunction\s+|\bconst\s+|\btype\s+[A-Za-z0-9_]+\s*=/.test(facade)) {
  throw new Error('memberships.service.ts must remain a compatibility facade without implementation.');
}

if (/from ['"]\.\/memberships\.service['"]/.test(domain)
    || /from ['"]\.\/memberships\.service['"]/.test(eligibility)
    || /from ['"]\.\/memberships\.service['"]/.test(client)
    || /from ['"]\.\/memberships\.service['"]/.test(admin)) {
  throw new Error('Focused membership modules must not depend back on memberships.service.ts.');
}

for (const token of [
  'getMembershipEligibilityForUser',
  'getMyMembershipEligibility',
  'program_completion_achievement',
  'PROGRAM_COMPLETION_ACHIEVEMENT_CODES',
]) {
  if (!eligibility.includes(token)) {
    throw new Error('Membership eligibility contract missing: ' + token);
  }
}
if (/\.insert\(|\.update\(|\.delete\(|\.rpc\(/.test(eligibility)) {
  throw new Error('Membership eligibility service regained write operations.');
}

for (const token of [
  'getMyMembership',
  'requestMembership',
  "from './memberships-eligibility.service'",
  "from './memberships.domain'",
]) {
  if (!client.includes(token)) {
    throw new Error('Membership client lifecycle contract missing: ' + token);
  }
}

for (const token of [
  'getAdminMembershipRows',
  'updateMembershipStatus',
  'updateMembershipDetails',
  'forceMembershipForProfile',
  'deactivateMembershipForProfile',
  'getMembershipByQrToken',
]) {
  if (!admin.includes(token)) {
    throw new Error('Membership admin contract missing: ' + token);
  }
}

const runtime = [eligibility, client, admin].join('\n');
if (/membership_delete_requests|requestPermanentMembershipDeletion|approveMembershipDeleteRequest|rejectMembershipDeleteRequest|MembershipDeleteRequestRow/.test(runtime)) {
  throw new Error('Membership runtime reintroduced the retired deletion-request flow.');
}
if (/\.from\(['"]payments['"]\)/.test(runtime)) {
  throw new Error('Membership services reintroduced payment-history reads instead of leaving payments in the payment domain.');
}
if (/payments\s*:\s*Payment\[\]/.test(runtime)) {
  throw new Error('Membership services reintroduced unused payment history payload.');
}
if (/syncProfileRoleForMembership/.test(runtime)) {
  throw new Error('Membership runtime reintroduced client-side profile-role synchronization.');
}
if (/\.from\(['"]profiles['"]\)[\s\S]{0,220}\.update\([\s\S]{0,160}role\s*:/.test(runtime)) {
  throw new Error('Membership services reintroduced direct profile-role mutation instead of the DB lifecycle SSOT.');
}
if (/\.from\(['"]memberships['"]\)[\s\S]{0,180}\.delete\(/.test(runtime)
    || /\.from\(['"]payments['"]\)[\s\S]{0,180}\.delete\(/.test(runtime)) {
  throw new Error('Membership runtime must preserve membership and payment history; physical DELETE is forbidden.');
}
if (/\bas never\b/.test(runtime)) {
  throw new Error('Membership services must not bypass generated Supabase types with "as never".');
}

if (!/updateMembershipStatus[\s\S]{0,900}status === 'active'[\s\S]{0,300}approved_by/.test(admin)) {
  throw new Error('Membership status activation lost the approving admin identity.');
}
if (!/updateMembershipDetails[\s\S]{0,700}input\.status === 'active'[\s\S]{0,300}approved_by/.test(admin)) {
  throw new Error('Membership detail activation can bypass the approving admin identity.');
}

if (/end_date[\s\S]{0,200}(?:expired|Vencid)/i.test(domain)) {
  throw new Error('Membership domain reintroduced active expiry by historical end_date.');
}

for (const token of [
  'drop trigger if exists trg_membership_lifetime_active',
  'drop function if exists public.enforce_lifetime_active_membership()',
  'create or replace function public.sync_membership_status_lifecycle()',
  'create trigger trg_membership_status_lifecycle',
  "new.status = 'cancelled'",
  'cancelled_at is null',
  'due_date > current_date',
  "m.status = 'active'",
  "p.role not in ('admin', 'super_admin')",
]) {
  if (!lifecycleSql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Membership lifecycle SQL contract missing: ' + token);
  }
}

if (/markMembershipPaidFast|updateMembershipPaymentStatus|registerMembershipPayment/.test(runtime)) {
  throw new Error('Membership runtime reintroduced a manual/fake payment-state shortcut.');
}
if (/currentPaymentStatus|lastPaymentAt|current_payment_status\s*:|last_payment_at\s*:|payment_notes\s*:/.test(runtime)) {
  throw new Error('Membership runtime reintroduced manual editing of derived payment summary fields.');
}

for (const [name, text, maxLines] of [
  ['membership facade', facade, 20],
  ['membership domain', domain, 140],
  ['membership eligibility', eligibility, 130],
  ['membership client', client, 130],
  ['membership admin', admin, 300],
]) {
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) {
    throw new Error(name + ' grew past its responsibility boundary: ' + lines + ' > ' + maxLines + '.');
  }
}

if (!pkg.includes('"check:membership-service-boundaries"')) {
  throw new Error('npm verify does not include the membership service boundary guard.');
}

console.log('UCAPSA membership domain/eligibility/client/admin boundaries: PASS');
