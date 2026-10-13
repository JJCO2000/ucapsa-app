import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const schema = read('supabase/migrations/20261013062000_program_interest_requests.sql');
const avatarSchema = read('supabase/migrations/20261013063000_expand_dog_avatars.sql');
const service = read('src/services/program-interest.service.ts');
const client = read('src/app/client/program-interest.tsx');
const admin = read('src/app/admin/program-interests.tsx');
const home = read('src/app/(tabs)/admin-home.tsx');
const classes = read('src/app/(tabs)/classes.tsx');
const cards = read('src/components/domain/TrainingAttendanceStamps.tsx');
const avatar = read('src/app/client/dog-profile.tsx');

for (const [label, contents, needles] of [
  ['RLS + propiedad', schema, [
    'enable row level security', 'revoke all on public.program_interest_requests',
    'for insert to authenticated', 'user_id = (select auth.uid())',
    'd.user_id = (select auth.uid())', 'd.is_active = true',
    'for update to authenticated', 'with check (public.is_admin())',
    'grant update (status)', 'program_interest_one_open_per_dog_program',
    "where status in ('pending','contacted')",
    'set_program_interest_updated_at', 'new.updated_at := clock_timestamp()',
    'on delete cascade',
  ]],
  ['Servicio acotado', service, ['requestProgramInterest', 'getMyProgramInterestRequests',
    'getAdminProgramInterestRequests', 'updateAdminProgramInterestRequest', "error?.code === '23505'"]],
  ['Cliente + alternativa', client, ['Promise.allSettled', 'Contactar a UCAPSA por WhatsApp',
    'no crea automáticamente un registro administrativo', 'alreadyEnrolled', 'current', 'requestProgramInterest']],
  ['Admin', admin, ["['pending', 'contacted']", 'changeStatus', 'Cerrar seguimiento', 'Abrir cliente']],
  ['Inicio admin', home, ['interestRequestsUnavailable', 'Solicitudes de entrenamiento sin verificar',
    'programInterests?.length ?? 0', '!interestRequestsUnavailable']],
  ['Clases', classes, ["'/client/program-interest?program=puppy'", "'/client/program-interest?program=comandos'"]],
  ['Progreso real', cards, ['attended', 'required', 'Sesión', 'asistencia registrada oficialmente']],
  ['Avatar', avatar, ['DOG_AVATAR_OPTIONS', 'DOG_AVATAR_COLORS', 'avatar_key: avatarKey']],
  ['Migración avatares', avatarSchema, ['dogs_avatar_key_check', 'update_my_basic_dog_profile']],
]) {
  for (const token of needles) {
    assert.ok(contents.includes(token), label + ' perdió contrato: ' + token);
  }
}

assert.ok(!schema.includes('followup_note'), 'No exponer notas de Administración al cliente.');
assert.ok(!schema.includes('on delete restrict'), 'Una solicitud no debe impedir eliminar una cuenta.');
assert.ok(!service.includes(".from('program_enrollments')"), 'Solicitar no puede escribir una inscripción.');
assert.ok(!service.includes(".from('program_attendances')"), 'Solicitar no puede escribir una asistencia.');
assert.match(schema, /status text not null default 'pending'/);
assert.match(schema, /check \(priority = 'urgent'\)/);
assert.match(schema, /old\.status = 'closed'/);
assert.match(schema, /new\.status <> 'contacted'/);
assert.match(schema, /new\.status <> 'closed'/);
assert.match(client, /disabled=\{loading \|\| Boolean\(error\)/);

const migrationNames = fs.readdirSync('supabase/migrations').filter((file) => /^\d{14}_.+\.sql$/.test(file));
const ownMigrations = migrationNames.filter((name) => name.includes('program_interest_requests') || name.includes('expand_dog_avatars'));
assert.deepEqual(ownMigrations, [
  '20261013062000_program_interest_requests.sql',
  '20261013063000_expand_dog_avatars.sql',
], 'Versiones de migración inesperadas o desordenadas');
assert.ok(ownMigrations.every((file) => file.slice(0, 14) > '20261012203322'),
  'Migraciones de esta funcionalidad fechadas antes de la última aplicada al iniciar la rama.');
console.log('UCAPSA solicitudes, privacidad, progreso y despliegue ordenado: PASS');
