import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const edgeSource = fs.readFileSync('supabase/functions/phone-password-login/index.ts', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');
const service = fs.readFileSync('src/services/auth.service.ts', 'utf8');
const screen = fs.readFileSync('src/app/auth/login.tsx', 'utf8');
assert.match(config, /\[functions\.phone-password-login\]\s*verify_jwt\s*=\s*false/);
assert.ok(!service.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Never ship the privileged key to the app');
assert.ok(service.includes("'phone-password-login'") && service.includes('supabase.auth.setSession('));
assert.ok(screen.includes('signInWithVerifiedContact'), 'Login must use the same Auth service');
assert.ok(!/console\.(log|error)\s*\(/.test(edgeSource), 'Credentials must not enter function logs');

// Deno import is replaced with an isolated mock. Never write to production during CI.
const offline = edgeSource.replace(
  /^import \{ createClient \} from '[^']+';\s*/m, '',
);
assert.notEqual(offline, edgeSource, 'Expected the pinned remote dependency import');
const compiled = ts.transpileModule(offline, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function exercise({ profiles = [], accounts = {}, phone, password = 'abcdef', method = 'POST',
                         authPassword = 'abcdef', envReady = true } = {}) {
  const observed = { passwordAttempts: 0, signupAttempts: 0, accountLookups: 0 };
  let handler;
  const admin = {
    from(name) {
      assert.equal(name, 'profiles');
      return {
        select(cols) {
          assert.equal(cols, 'user_id,phone');
          return {
            in(column, candidates) {
              assert.equal(column, 'phone');
              return {
                async limit(max) {
                  assert.equal(max, 2);
                  return { data: profiles.filter(p => candidates.includes(p.phone)).slice(0, 2), error: null };
                },
              };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        async getUserById(id) {
          observed.accountLookups++;
          return { data: { user: accounts[id] ? { email: accounts[id] } : null }, error: null };
        },
      },
    },
  };
  const anonymous = {
    auth: {
      async signInWithPassword(input) {
        observed.passwordAttempts++;
        const identity = Object.entries(accounts).find(([,email]) => email === input.email);
        if (!identity || input.password !== authPassword) return { data: {}, error: new Error('Invalid login') };
        return {
          data: { user: { id: identity[0] }, session: { access_token: 'jwt-for-tests', refresh_token: 'refresh-for-tests' } },
          error: null,
        };
      },
    },
  };
  vm.runInNewContext(compiled, {
    Response,
    Deno: {
      env: { get(name) {
        if (!envReady) return null;
        return ({ SUPABASE_URL: 'https://mock.invalid', SUPABASE_ANON_KEY: 'anon-test',
          SUPABASE_SERVICE_ROLE_KEY: 'service-test' })[name] ?? null;
      } },
      serve(fn) { handler = fn; },
    },
    createClient(url, key) {
      assert.equal(url, 'https://mock.invalid');
      if (key === 'service-test') return admin;
      assert.equal(key, 'anon-test');
      return anonymous;
    },
  });
  assert.equal(typeof handler, 'function');
  const req = { method, text: async () => JSON.stringify({ phone, password }) };
  const response = await handler(req);
  return { status: response.status, body: await response.json(), observed };
}

const base = { profiles: [{ user_id: 'u1', phone: '5535100214' }],
  accounts: { u1: 'owner@example.test' }, phone: '+525535100214' };
const valid = await exercise(base);
assert.equal(valid.status, 200);
assert.equal(valid.body.user_id, 'u1');
assert.equal(valid.body.access_token, 'jwt-for-tests');
assert.equal(valid.body.refresh_token, 'refresh-for-tests');
assert.equal(valid.observed.passwordAttempts, 1);

const normalized = await exercise({ ...base, profiles: [{ user_id: 'u1', phone: '+525535100214' }] });
assert.equal(normalized.status, 200, 'Current E.164 profiles must work too');

const duplicate = await exercise({ ...base,
  profiles: [{ user_id: 'u1', phone: '5535100214' }, { user_id: 'u2', phone: '+525535100214' }],
  accounts: { u1: 'one@example.test', u2: 'two@example.test' } });
assert.equal(duplicate.status, 401, 'A duplicate number must never arbitrarily select an account');
assert.equal(duplicate.observed.passwordAttempts, 0);
assert.ok(!JSON.stringify(duplicate.body).includes('@'));

const missing = await exercise({ ...base, profiles: [] });
assert.equal(missing.status, 401);
assert.deepEqual(missing.body, duplicate.body, 'Never enumerate the existence of a phone number');

const wrongPassword = await exercise({ ...base, password: 'incorrect' });
assert.equal(wrongPassword.status, 401);
assert.deepEqual(wrongPassword.body, missing.body);
assert.equal(wrongPassword.observed.passwordAttempts, 1, 'GoTrue must validate the password');

const malformed = await exercise({ ...base, phone: 'abc' });
assert.equal(malformed.status, 401);
assert.equal(malformed.observed.passwordAttempts, 0);

const configError = await exercise({ ...base, envReady: false });
assert.equal(configError.status, 503);
const methodError = await exercise({ ...base, method: 'GET' });
assert.equal(methodError.status, 405);
assert.equal(valid.observed.signupAttempts, 0, 'Login may not create new accounts');
console.log('UCAPSA phone + password alias: 8 isolated security and functional checks PASS');
