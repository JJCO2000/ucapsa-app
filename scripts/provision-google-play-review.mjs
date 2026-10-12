/**
 * One-time UCAPSA Play reviewer account provisioning.
 * Run LOCALLY, never through GitHub Actions or an Expo client.
 * Requires credentials for a data-less Supabase review branch only.
 *
 * Usage: node scripts/provision-google-play-review.mjs
 *        node scripts/provision-google-play-review.mjs --apply
 *
 * Production access is forbidden. These accounts belong to an isolated branch
 * with zero copied production customer data.
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const roles = [
  ['client', 'Client', 'Demo Cliente UCAPSA'],
  ['member', 'Member', 'Demo Socio UCAPSA'],
  ['trainer', 'Trainer', 'Demo Entrenador UCAPSA'],
  ['admin', 'Admin', 'Demo Administrador UCAPSA'],
];
const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';


function controlledEmails(inbox) {
  if (typeof inbox !== 'string' || !/^[^\s@+]+@(?:gmail|googlemail)\.com$/i.test(inbox)) {
    throw Error('Define PLAY_REVIEW_INBOX con un correo Gmail bajo tu control (sin alias +).');
  }
  const [name, domain] = inbox.trim().toLowerCase().split('@');
  return roles.map(([role, label, fullName]) => ({
    role, label, fullName,
    email: name + '+ucapsa-play-' + role + '@' + domain,
  }));
}

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const inbox = process.env.PLAY_REVIEW_INBOX;
const users = controlledEmails(inbox);

if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  throw Error('Configura SUPABASE_URL con la URL real del proyecto UCAPSA.');
}
const branchRef = process.env.PLAY_REVIEW_PROJECT_REF?.trim();
if (!branchRef || !/^[a-z0-9]{20}$/.test(branchRef) ||
    branchRef === 'hrfecmviyiluubymsoeq' ||
    new URL(url).hostname !== branchRef + '.supabase.co') {
  throw Error('BLOQUEADO: define PLAY_REVIEW_PROJECT_REF para la rama aislada. Producción nunca es válida.');
}

console.log('UCAPSA Google Play review accounts, mode =', mode);
console.table(users.map(({ role, email }) => ({ role, email })));
console.log('Seguridad: las cuatro cuentas se crean SOLO en la rama aislada de revisión.');
console.log('No se crean clases, pagos, membresías ni registros artificiales de asistencia.');
if (mode !== 'apply') {
  console.log('Simulación: ningún cambio. Para proceder, usa --apply tras comprobar aislamiento.');
  process.exit(0);
}
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!key) throw Error('Falta SUPABASE_SERVICE_ROLE_KEY; consérvala SOLO en la terminal local.');
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const testAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
if (!testAnonKey) throw Error('Falta EXPO_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_PUBLISHABLE_KEY para probar el inicio de sesión.');
const tester = createClient(url, testAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const existing = [];
let page = 1;
for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  existing.push(...(data.users ?? []));
  if (!data.users || data.users.length < 1000) break;
  page++;
  if (page > 50) throw Error('ListUsers superó el límite permitido.');
}
const collision = users.filter(x => existing.some(y => y.email?.toLowerCase() === x.email));
if (collision.length) {
  throw Error('Se encontraron correos ya registrados; no se modificarán contraseñas ni roles existentes: '
    + collision.map(x => x.role).join(', '));
}
console.log('Validación: no hay cuentas preexistentes con esos correos.');

const credentials = [];
for (const account of users) {
  const password = randomBytes(24).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: account.fullName },
    app_metadata: { ucapsa_play_review: true, ucapsa_review_role: account.role },
  });
  if (error || !data?.user?.id) {
    console.error('Alta interrumpida en', account.role, ':', error?.message);
    console.error('Revisa usuarios creados antes de intentar de nuevo; nunca se borran automáticamente.');
    process.exitCode = 1;
    break;
  }
  const id = data.user.id;
  const { data: profiles, error: profileError } = await admin.from('profiles')
    .update({ role: account.role, full_name: account.fullName })
    .eq('user_id', id)
    .select('user_id,role');
  if (profileError || profiles?.length !== 1 || profiles[0].role !== account.role) {
    console.error('Cuenta Auth creada, pero perfil no validado:', account.role, profileError?.message);
    console.error('Requiere reparación administrativa; no se entregarán credenciales no verificadas.');
    process.exitCode = 1;
    break;
  }
  // Never sign a user in with the elevated admin client.
  const { data: session, error: signInError } = await tester.auth.signInWithPassword({
    email: account.email,
    password,
  });
  if (signInError || !session?.user?.id) {
    console.error('Inicio de sesión falló para', account.role, signInError?.message);
    process.exitCode = 1;
    break;
  }
  const { data: role, error: roleError } = await tester.rpc('get_my_role');
  await tester.auth.signOut();
  if (roleError || role !== account.role) {
    console.error('El rol de sesión no coincide:', account.role, roleError?.message);
    process.exitCode = 1;
    break;
  }
  credentials.push({ role: account.role, email: account.email, password });
  console.log('Cuenta comprobada:', account.role);
}
if (credentials.length) {
  console.log('\nCREDENCIALES DE REVISIÓN — GUÁRDALAS AHORA EN UN GESTOR DE CONTRASEÑAS.');
  console.log('No pegues esta salida en GitHub, issues, logs compartidos ni un chat público.');
  for (const x of credentials) console.log(x.role + ' | ' + x.email + ' | ' + x.password);
}
if (credentials.length !== users.length) {
  throw Error('Alta parcial. No ejecutes otra vez a ciegas: revisa el estado de Auth y perfiles.');
}
console.log('4/4 accesos y roles comprobados. Configura los datos demo y audita exposición de datos antes de Play Console.');
