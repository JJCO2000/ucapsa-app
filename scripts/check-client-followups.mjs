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


// The home decision badge is labeled "clientes" whereas the RPC returns dogs.
// Exercise the exact expression used by the screen, rather than a test-only copy.
const countExpression = home.match(/clientFollowups:\s*(new Set\(clientFollowups\.map\(\(row\) => row\.userId\)\)\.size)/)?.[1];
if (!countExpression) throw new Error('Admin Home must count distinct customers, not dog rows.');
const syntheticDogRows = [
  { userId: 'client-a', dogId: 'dog-1' },
  { userId: 'client-a', dogId: 'dog-2' },
  { userId: 'client-b', dogId: 'dog-3' },
];
const actualCount = Function('clientFollowups', 'return ' + countExpression)(syntheticDogRows);
if (actualCount !== 2) throw new Error('Follow-up badge inflated the count for multi-dog customers.');

console.log('UCAPSA admin client follow-ups: PASS');
