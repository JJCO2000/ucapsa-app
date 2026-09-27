import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-client-followups.sql', 'utf8');
const service = fs.readFileSync('src/services/admin-client-followups.service.ts', 'utf8');
const home = fs.readFileSync('src/app/(tabs)/admin-home.tsx', 'utf8');
const clients = fs.readFileSync('src/app/(tabs)/admin-clients.tsx', 'utf8');
const screen = fs.readFileSync('src/app/admin/client-followups.tsx', 'utf8');

for (const token of [
  'get_admin_client_followups',
  "pr.code = 'puppy'",
  'v_today - 14',
  'v_today - 30',
  'public.is_ucapsa_admin()',
  'security definer',
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Client follow-up SQL contract missing: ' + token);
  }
}

for (const token of [
  "supabase.rpc('get_admin_client_followups')",
  'puppyNoContinuity',
  'inactive30d',
]) {
  if (!service.includes(token)) throw new Error('Client follow-up service missing: ' + token);
}

for (const token of [
  'clientFollowups',
  'Seguimiento de clientes',
  '/admin/client-followups',
]) {
  if (!home.includes(token)) throw new Error('Admin home follow-up decision missing: ' + token);
}

for (const token of [
  'followupDogNamesByUser',
  'Seguimiento:',
  'rowFollowup',
]) {
  if (!clients.includes(token)) throw new Error('Admin clients follow-up highlighting missing: ' + token);
}

for (const token of [
  'Puppy sin continuidad',
  '30 días sin asistencia',
  'Abrir cliente',
]) {
  if (!screen.includes(token)) throw new Error('Follow-up detail screen missing: ' + token);
}

console.log('UCAPSA admin client follow-ups: PASS');
