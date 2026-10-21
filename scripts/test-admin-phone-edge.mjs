import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real Edge Function handler in a closed VM with simulated Supabase.
// No network, phone messages, production credentials or user data involved.
const src = fs.readFileSync('supabase/functions/admin-bind-phone/index.ts', 'utf8')
  .replace(/^import \{ createClient \} from [^\n]+\n/, '');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;

const actorId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000002';
const phone = '+525535100214';
const preset = {
  role: 'super_admin', dupes: [], canReserve: true, auditFails: false,
  authUpdateFails: false, authPhone: '', phoneConfirmed: null,
};
const effects = [];
function adminClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: actorId } }, error: null }),
      admin: {
        getUserById: async () => ({
          data: { user: { id: customerId, phone: preset.authPhone, phone_confirmed_at: preset.phoneConfirmed } },
          error: null,
        }),
        updateUserById: async (id, attrs) => {
          effects.push('auth-update');
          assert.equal(id, customerId);
          assert.equal(attrs.phone, phone);
          assert.equal(attrs.phone_confirm, true);
          if (preset.authUpdateFails) return { data: { user: null }, error: { message: 'simulated' } };
          return { data: { user: { phone, phone_confirmed_at: '2026-10-20T18:00:00Z' } }, error: null };
        },
      },
    },
    from: (table) => {
      if (table === 'admin_audit_logs') return { insert: async (row) => {
        effects.push('audit:' + row.action);
        return { error: preset.auditFails ? { message: 'audit unavailable' } : null };
      } };
      if (table !== 'profiles') throw new Error('Unexpected table: ' + table);
      const builder = {
        id: null,
        select() { return this; },
        eq(_col, id) { this.id = id; return this; },
        async maybeSingle() {
          return this.id === actorId
            ? { data: { role: preset.role }, error: null }
            : { data: { role: 'client', phone }, error: null };
        },
        not() { return this; },
        async range() { return { data: preset.dupes, error: null }; },
      };
      return builder;
    },
  };
}
function userClient() {
  return { rpc: async () => ({ data: preset.canReserve, error: null }) };
}
let handler = null;
vm.runInNewContext(js, {
  createClient: (_url, key) => key === 'private' ? adminClient() : userClient(),
  Deno: { env: { get: (name) => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'private',
    SUPABASE_ANON_KEY: 'public',
  })[name] }, serve: (fn) => { handler = fn; } },
  Request, Response, console: { error: () => {} },
}, { timeout: 2000 });
assert.equal(typeof handler, 'function');

async function call(body, withToken = true) {
  const response = await handler(new Request('https://example.com', {
    method: 'POST',
    headers: withToken ? { Authorization: 'Bearer token' } : {},
    body: JSON.stringify({ userId: customerId, ...body }),
  }));
  return { status: response.status, body: await response.json() };
}
function reset() {
  effects.length = 0;
  preset.role = 'super_admin'; preset.dupes = []; preset.canReserve = true;
  preset.auditFails = false; preset.authUpdateFails = false;
  preset.authPhone = ''; preset.phoneConfirmed = null;
}

reset();
assert.equal((await call({ action: 'approve', verifiedByOutboundCall: true, proofNote: 'Verified by callback and matched member.' }, false)).status, 401);
assert.equal(effects.length, 0);
reset(); preset.role = 'client';
assert.equal((await call({ action: 'approve', verifiedByOutboundCall: true, proofNote: 'Verified by callback and matched member.' })).status, 403);
assert.equal(effects.length, 0);
reset(); preset.dupes = [{ user_id: 'someone-else', phone: '5535100214' }];
assert.equal((await call({ action: 'approve', verifiedByOutboundCall: true, proofNote: 'Verified by callback and matched member.' })).body.status, 'conflict');
assert.equal(effects.length, 0);
reset(); preset.canReserve = false;
assert.equal((await call({ action: 'status' })).body.status, 'conflict');
assert.equal(effects.length, 0);
reset();
assert.equal((await call({ action: 'approve', verifiedByOutboundCall: false, proofNote: 'No outgoing call was made.' })).status, 422);
assert.equal(effects.length, 0);
reset(); preset.auditFails = true;
assert.equal((await call({ action: 'approve', verifiedByOutboundCall: true, proofNote: 'Verified by callback and matched member.' })).status, 503);
assert.deepEqual(effects, ['audit:phone_auth_bind_authorized']);
reset();
assert.equal((await call({ action: 'status' })).body.status, 'ready');
assert.equal(effects.length, 0);
reset();
const success = await call({ action: 'approve', verifiedByOutboundCall: true, proofNote: 'Verified by callback and matched member.' });
assert.equal(success.status, 200);
assert.equal(success.body.status, 'enabled');
assert.deepEqual(effects, [
  'audit:phone_auth_bind_authorized',
  'auth-update',
  'audit:phone_auth_bind_completed',
]);
reset(); preset.authUpdateFails = true;
assert.equal((await call({ action: 'approve', verifiedByOutboundCall: true, proofNote: 'Verified by callback and matched member.' })).status, 503);
assert.deepEqual(effects, ['audit:phone_auth_bind_authorized', 'auth-update']);
console.log('UCAPSA admin phone Edge function permission, duplicate, audit, and update simulations: PASS');
