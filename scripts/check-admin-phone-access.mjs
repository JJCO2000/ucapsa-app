import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(path, 'utf8');
const edge = read('supabase/functions/admin-bind-phone/index.ts');
const ui = read('src/app/admin/customer-phone-access.tsx');
const service = read('src/services/admin-phone-access.service.ts');
const edit = read('src/app/admin/customer-profile-edit.tsx');
const auth = read('src/services/auth.service.ts');
for (const clause of [
  "admin.auth.getUser(token)", "actor?.role !== 'super_admin'",
  "!['member','client'].includes(target.role)", "userId === actorId",
  "admin.auth.admin.getUserById(userId)", "samePhone(entry.phone, phone)",
  "can_request_my_phone_verification", "if (canReserve !== true)",
  "payload.verifiedByOutboundCall !== true", "admin_audit_logs",
  "'phone_auth_bind_authorized'", "if (preAuditError)",
  "admin.auth.admin.updateUserById(", "phone_confirm: true",
  "updated.user?.phone_confirmed_at", "'phone_auth_bind_completed'",
]) assert.ok(edge.includes(clause), 'Missing protected admin phone binding boundary: ' + clause);
assert.ok(edge.indexOf("if (preAuditError)") < edge.indexOf('admin.auth.admin.updateUserById('),
  'No Auth write can happen before the audit succeeds.');
assert.ok(!edge.includes('auth.admin.createUser') && !edge.includes('password:') && !edge.includes('signInWithOtp'),
  'Manual phone association must never create users, touch passwords or send SMS.');
assert.ok(edit.includes("role === 'super_admin'") && edit.includes('admin/customer-phone-access'),
  'Only Superadmin should see the phone-association action.');
assert.ok(ui.includes("role !== 'super_admin'") && ui.includes('Confirmo que hablé con el titular') &&
  ui.includes('approveAdminPhoneAccess'), 'Staff confirmation must be explicit and gated.');
assert.ok(service.includes("supabase.functions.invoke('admin-bind-phone'"), 'Client must call an audited server boundary.');
assert.ok(auth.includes('supabase.auth.signInWithPassword({ phone, password })'),
  'Login must remain on native Supabase Auth, not on a public phone-to-email lookup.');
console.log('UCAPSA restricted admin-assisted phone login: PASS');
