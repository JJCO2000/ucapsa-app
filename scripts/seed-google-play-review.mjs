/**
 * Demo fixture for the isolated Supabase review branch.
 * Does NOT copy production data and MUST NEVER run against production.
 * Local run: node scripts/seed-google-play-review.mjs [--apply]
 * Required: PLAY_REVIEW_PROJECT_REF, SUPABASE_URL, PLAY_REVIEW_INBOX.
 * Only --apply requires a locally-held SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const PROD = 'hrfecmviyiluubymsoeq';
const ref = String(process.env.PLAY_REVIEW_PROJECT_REF ?? '');
const url = String(process.env.SUPABASE_URL ?? '');
const inbox = String(process.env.PLAY_REVIEW_INBOX ?? '');
if (!/^[a-z0-9]{20}$/.test(ref) || ref === PROD || url !== 'https://' + ref + '.supabase.co') {
  throw Error('BLOQUEADO: únicamente una rama Supabase aislada está autorizada.');
}
if (!/^[^\\s@+]+@(gmail|googlemail)\\.com$/i.test(inbox)) {
  throw Error('Define PLAY_REVIEW_INBOX con la bandeja Gmail controlada por ti.');
}
const prefix = inbox.split('@')[0].toLowerCase();
const domain = inbox.split('@')[1].toLowerCase();
const emails = Object.fromEntries(['client','member','trainer','admin'].map(role => [
  role, prefix + '+ucapsa-play-' + role + '@' + domain,
]));
console.log('Destino: rama aislada', ref, '| roles: client, member, trainer, admin');
if (!process.argv.includes('--apply')) {
  console.log('DRY RUN: sin mutaciones; esquema de demostración con 2 programas, 2 perros y 4 usuarios.');
  process.exit(0);
}
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!key) throw Error('Falta la clave administrativa LOCAL de la rama de revisión.');
const admin = createClient(url, key, { auth: {
  persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
}});
async function rows(table) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (error) throw Error(table + ': ' + error.message);
  return count ?? 0;
}
// Prevent duplicates and never erase rows. Reapply only in a freshly reset,
// data-less review branch that holds the four new review accounts.
for (const table of ['dogs','program_enrollments','memberships','payments','member_visits','programs']) {
  const count = await rows(table);
  if (count !== 0) throw Error('Rama de prueba no vacía: ' + table + ' (' + count + ' filas). Abortado.');
}
const { data: page, error: authError } = await admin.auth.admin.listUsers({page:1,perPage:100});
if (authError) throw authError;
if (page.users.length !== 4) throw Error('La rama debe contener exactamente 4 cuentas de revisión, sin otras cuentas.');
const reviewers = {};
for (const [role,email] of Object.entries(emails)) {
  const user = page.users.find(item=>item.email?.toLowerCase()===email);
  if (!user || user.app_metadata?.ucapsa_play_review !== true ||
      user.app_metadata?.ucapsa_review_role !== role) throw Error('Identidad de revisión inválida: ' + role);
  const { data: profile, error } = await admin.from('profiles')
    .select('role').eq('user_id',user.id).single();
  if (error || profile?.role !== role) throw Error('Perfil inconsistente: ' + role);
  reviewers[role]=user.id;
}
const insert = async (table, rows) => {
  const {data,error}=await admin.from(table).insert(rows).select();
  if(error)throw Error(table+': '+error.message);
  if(data?.length!==rows.length)throw Error('Cantidad incorrecta en '+table);
  return data;
};
const [puppy,commands] = await insert('programs', [
  {code:'puppy',name:'Puppy - DEMO',description:'Clase de muestra para revisión de Google Play',required_attendances:10,color_key:'yellow',is_active:true},
  {code:'comandos',name:'Comandos - DEMO',description:'Horario único de Comandos para revisión',required_attendances:10,color_key:'purple',is_active:true},
]);
const schedules=await insert('program_schedules',[
  {program_id:puppy.id,name:'Puppy sábado - DEMO',day_of_week:6,start_time:'10:00:00',repeat_type:'weekly',is_active:true},
  {program_id:commands.id,name:'Comandos domingo - DEMO',day_of_week:0,start_time:'11:30:00',repeat_type:'weekly',is_active:true},
]);
const dogs=await insert('dogs',[
  {user_id:reviewers.client,name:'Milo Demo',breed:'Mestizo',sex:'male',avatar_key:'dog_face',avatar_color:'#D4A62A'},
  {user_id:reviewers.member,name:'Luna Demo',breed:'Mestiza',sex:'female',avatar_key:'cartoon_dog',avatar_color:'#4D857A'},
]);
const today=new Date().toISOString().slice(0,10);
const membership=(await insert('memberships',[{
  user_id:reviewers.member,member_number:'DEMO-PLAY-0001',status:'active',
  start_date:today,current_payment_status:'paid',
}]))[0];
await insert('membership_dog_access',[{
  membership_id:membership.id,user_id:reviewers.member,dog_id:dogs[1].id,is_covered:true,
}]);
await insert('program_enrollments',[
  {user_id:reviewers.client,dog_id:dogs[0].id,dog_name:dogs[0].name,
   program_id:commands.id,schedule_id:schedules[1].id,
   status:'active',program_level:'principiante',access_mode:'card',attendances_count:0},
  {user_id:reviewers.member,dog_id:dogs[1].id,dog_name:dogs[1].name,
   program_id:puppy.id,schedule_id:schedules[0].id,
   status:'active',program_level:'base',access_mode:'membership',
   membership_id:membership.id,attendances_count:0},
]);
await insert('payments',[{
  user_id:reviewers.member,amount:350,concept:'Membresía DEMO (sin cobro real)',
  status:'paid',payment_method:'demo',registered_by:reviewers.admin,
  notes:'DATOS FICTICIOS / GOOGLE PLAY REVIEW',
}]);
await insert('member_visits',[{
  user_id:reviewers.member,membership_id:membership.id,
  source:'admin_manual',recorded_by:reviewers.admin,notes:'Visita ficticia para revisión',
}]);
await insert('announcements',[{
  title:'Bienvenido a UCAPSA - DEMO',
  content:'Este entorno contiene exclusivamente datos de demostración para Google Play.',
  audience:'public',is_published:true,created_by:reviewers.admin,
}]);
const result=await Promise.all(['dogs','programs','program_schedules','program_enrollments','memberships','payments','announcements'].map(async table => [table,await rows(table)]));
console.log('SEED COMPLETADO, SOLO EN RAMA AISLADA: ',Object.fromEntries(result));
console.log('No se copiaron cuentas ni información de producción.');
