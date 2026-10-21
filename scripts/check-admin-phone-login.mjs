import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

function read(file) { return fs.readFileSync(file, 'utf8'); }
const edge = read('supabase/functions/admin-activate-phone-login/index.ts');
const service = read('src/services/admin-phone-login.service.ts');
const ui = read('src/app/admin/customer-profile-edit.tsx');
const pkg = read('package.json');
for (const [name, code] of [
  ['Edge Function', edge], ['Client service', service], ['Admin UI', ui],
]) {
  const file = name === 'Admin UI' ? 'input.tsx' : 'input.ts';
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  assert.equal(parsed.parseDiagnostics.length, 0, name + ' syntax must parse');
}
assert.ok(edge.includes("operator?.role !== 'super_admin'"), 'Only Superadmin may approve identity');
assert.ok(edge.includes("target.role !== 'client' && target.role !== 'member'"), 'Staff targets forbidden');
assert.ok(edge.includes('confirmedByStaff !== true'), 'Staff must attest to manual contact check');
assert.ok(edge.includes("contacts.some(row => row.user_id !== userId"), 'Duplicate contacts must fail closed');
assert.ok(edge.includes('count > contacts.length'), 'Pagination must fail closed');
assert.ok(edge.includes('auth.admin.updateUserById(userId'), 'Must update existing Auth user via admin API');
assert.ok(edge.includes('phone_confirm: true'), 'Admin approval must set Auth-confirmed phone');
assert.ok(edge.includes("phone_login_activation_requested") && edge.includes("phone_login_activation_completed"), 'Audit request and success');
assert.ok(edge.indexOf("phone_login_activation_requested") < edge.indexOf('auth.admin.updateUserById(userId'), 'Audit first');
assert.ok(!edge.includes('auth.admin.createUser') && !edge.includes('SUPABASE_ANON_KEY'), 'No account creation or anonymous trust');
assert.ok(service.includes("supabase.functions.invoke('admin-activate-phone-login'"), 'Must call server endpoint');
assert.ok(ui.includes("role === 'super_admin'") && ui.includes('staffConfirmedPhone') &&
  ui.includes('sameContactPhone(profile.phone, phone)'), 'Superadmin must confirm stored contact, not unsaved phone');
assert.ok(pkg.includes('"check:admin-phone-login"') &&
  pkg.includes('npm run check:admin-phone-login &&'), 'Guard must be in verification pipeline');

// Exercise the Edge normalizer, and enforce parity with the mobile shared normalizer.
const slice = edge.match(/function canonicalPhone\(raw: string\): string \| null \{[\s\S]*?\n\}/);
assert.ok(slice, 'Pure server phone normalizer should be testable');
const serverJS = ts.transpileModule(slice[0] + '\nexports.canonicalPhone = canonicalPhone;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports1 = {};
vm.runInNewContext(serverJS, { exports: exports1 });
const mobile = { exports: {} };
const mobileJS = ts.transpileModule(read('src/utils/phone-contact.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(mobileJS, { exports: mobile.exports, module: mobile });
for (const value of ['5535100214', '+525535100214', '52 55 35 100 214', '55,3510-0214', '+34911222333']) {
  assert.equal(exports1.canonicalPhone(value), mobile.exports.normalizeContactPhone(value));
}
for (const value of ['', 'abc', '123', '+0012345678']) {
  assert.equal(exports1.canonicalPhone(value), null);
}
console.log('UCAPSA superadmin-assisted phone login: PASS');


// Exercise the actual Edge handler with isolated Supabase Auth/database doubles.
// No network, credentials, customer data, or SMS are used by these scenarios.
const operatorId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';
function edgeHarness(options = {}) {
  const state = {
    role: options.role ?? 'super_admin',
    targetRole: options.targetRole ?? 'client',
    phone: options.phone ?? '5535100214',
    duplicate: options.duplicate ?? false,
    confirmed: options.confirmed ?? false,
    authPhone: options.authPhone ?? '',
    updates: [],
    audit: [],
  };
  const profileRows = [
    { user_id: customerId, phone: state.phone },
    ...(state.duplicate ? [{ user_id: '33333333-3333-4333-8333-333333333333', phone: '+525535100214' }] : []),
  ];
  const admin = {
    auth: {
      getUser: async jwt => ({ data: { user: jwt === 'valid' ? { id: operatorId } : null }, error: jwt === 'valid' ? null : { message: 'Unauthorized' } }),
      admin: {
        getUserById: async id => ({ data: { user: id === customerId ? {
          id, phone: state.authPhone, phone_confirmed_at: state.confirmed ? '2026-01-01T00:00:00Z' : null,
        } : null }, error: null }),
        updateUserById: async (id, update) => {
          state.updates.push({ id, update });
          state.authPhone = update.phone;
          state.confirmed = update.phone_confirm === true;
          return { data: {}, error: null };
        },
      },
    },
    from: table => {
      if (table === 'admin_audit_logs') return {
        insert: async row => { state.audit.push(row.action); return { error: null }; },
      };
      if (table === 'profiles') return {
        select: () => ({
          eq: (_key, id) => ({
            maybeSingle: async () => ({ data: id === operatorId ? { role: state.role } :
              id === customerId ? { user_id: customerId, role: state.targetRole, phone: state.phone } : null, error: null }),
          }),
          not: () => ({ limit: async () => ({ data: profileRows, count: profileRows.length, error: null }) }),
        }),
      };
      throw new Error('Unexpected table: ' + table);
    },
  };
  let handler;
  const edgeJS = ts.transpileModule(edge.replace(/^import \{ createClient \} from [^\n]+\n/, ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(edgeJS, {
    createClient: () => admin,
    Deno: { env: { get: key => key === 'SUPABASE_URL' ? 'https://example.supabase.co' :
      key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fake-server-key' : undefined }, serve: fn => { handler = fn; } },
    Request, Response, console,
  });
  assert.equal(typeof handler, 'function');
  async function call({ jwt = 'valid', confirmedByStaff = true, targetUserId = customerId } = {}) {
    const request = new Request('https://example.supabase.co/functions/v1/admin-activate-phone-login', {
      method: 'POST', headers: { Authorization: 'Bearer ' + jwt },
      body: JSON.stringify({ targetUserId, confirmedByStaff }),
    });
    const response = await handler(request);
    return { status: response.status, body: await response.json() };
  }
  return { state, call };
}
{
  const x = edgeHarness();
  assert.equal((await x.call({ jwt: 'invalid' })).status, 401);
  assert.equal(x.state.updates.length, 0);
}
{
  const x = edgeHarness({ role: 'admin' });
  assert.equal((await x.call()).status, 403);
  assert.equal(x.state.updates.length, 0);
}
{
  const x = edgeHarness({ targetRole: 'trainer' });
  assert.equal((await x.call()).status, 403);
  assert.equal(x.state.updates.length, 0);
}
{
  const x = edgeHarness({ duplicate: true });
  assert.equal((await x.call()).status, 409);
  assert.equal(x.state.updates.length, 0);
}
{
  const x = edgeHarness({ phone: 'incorrecto' });
  assert.equal((await x.call()).status, 409);
  assert.equal(x.state.updates.length, 0);
}
{
  const x = edgeHarness();
  assert.equal((await x.call({ confirmedByStaff: false })).status, 400);
  assert.equal(x.state.updates.length, 0);
}
{
  const x = edgeHarness();
  const response = await x.call();
  assert.equal(response.status, 200);
  assert.equal(response.body.activated, true);
  assert.equal(response.body.alreadyActive, false);
  assert.equal(x.state.updates.length, 1);
  assert.equal(x.state.updates[0].id, customerId);
  assert.equal(x.state.updates[0].update.phone, '+525535100214');
  assert.equal(x.state.updates[0].update.phone_confirm, true);
  assert.deepEqual(x.state.audit, ['phone_login_activation_requested', 'phone_login_activation_completed']);
  const repeated = await x.call();
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.alreadyActive, true);
  assert.equal(x.state.updates.length, 1);
}
console.log('UCAPSA simulated phone login approval scenarios: PASS');
