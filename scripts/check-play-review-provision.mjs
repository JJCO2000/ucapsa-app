import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const path = 'scripts/provision-google-play-review.mjs';
const src = fs.readFileSync(path, 'utf8');
for (const text of [
  'admin.auth.admin.createUser({',
  'email_confirm: true',
  'randomBytes(24)',
  'app_metadata:',
  'tester.auth.signInWithPassword',
  "tester.rpc('get_my_role')",
  "tester.auth.signOut()",
  "--acknowledge-staff-access",
  "mode !== 'apply'",
  "existing.some(",
]) if (!src.includes(text)) throw Error('Falta control de seguridad en revisión Play: ' + text);
if (/['"](?:sb_secret_|eyJ[A-Za-z0-9_-]{30})/.test(src)) {
  throw Error('Credenciales sospechosas en script de revisión.');
}

const env = {
  ...process.env,
  PLAY_REVIEW_INBOX: 'mockreview@gmail.com',
  SUPABASE_URL: 'https://hrfecmviyiluubymsoeq.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: '',
  SUPABASE_SECRET_KEY: '',
};
const preview = execFileSync(process.execPath, [path], { env, encoding: 'utf8' });
for (const role of ['client', 'member', 'trainer', 'admin']) {
  if (!preview.includes('ucapsa-play-' + role)) throw Error('Falta una cuenta: ' + role);
}
if (!preview.includes('Simulación: ningún cambio.')) {
  throw Error('El script debe arrancar siempre en modo simulación.');
}
console.log('UCAPSA Play provisioning safe dry-run: PASS');
