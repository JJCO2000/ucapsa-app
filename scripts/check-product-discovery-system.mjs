import fs from 'node:fs';

const root = 'docs/product/discovery/';
const files = {
  readme: fs.readFileSync(root + 'README.md', 'utf8'),
  ost: fs.readFileSync(root + 'OST_UCAPSA.md', 'utf8'),
  guide: fs.readFileSync(root + 'GUIA_ENTREVISTA.md', 'utf8'),
  snapshot: fs.readFileSync(root + 'INTERVIEW_SNAPSHOT_TEMPLATE.md', 'utf8'),
  papa: fs.readFileSync(root + 'INTERVIEW_001_PAPA.md', 'utf8'),
  results: fs.readFileSync(root + 'RESULTADOS.csv', 'utf8'),
  int002: fs.readFileSync(root + 'INTERVIEW_002_OPERACION.md', 'utf8'),
  opsResearch: fs.readFileSync(root + 'RESEARCH_OPERATIONS_SYSTEM.md', 'utf8'),
  int011: fs.readFileSync(root + 'INTERVIEW_011_SOCIA_PUPPY_COMANDOS.md', 'utf8'),
  consolidated: fs.readFileSync(root + 'DISCOVERY_STATE_2026-10-04.md', 'utf8'),
};

for (const token of [
  'April Dunford',
  'Teresa Torres',
  'Regla de evidencia',
  'INT-001',
]) {
  if (!files.readme.includes(token)) throw new Error('Discovery README missing: ' + token);
}

for (const token of [
  'Que el cliente pueda saber por sí mismo',
  'CLIENT-OPP-001',
  'CLIENT-CAND-002',
  'HYP-CLIENT-01',
  'Outcome de operación separado',
]) {
  if (!files.ost.includes(token)) throw new Error('OST guard missing: ' + token);
}

for (const token of [
  'Si UCAPSA App no existiera',
  'Prueba de comprensión de Home',
  'Prueba de tareas',
  'Confianza',
  'Matriz de diagnóstico',
  '¿Te gusta la app?',
]) {
  if (!files.guide.includes(token)) throw new Error('Interview guide missing: ' + token);
}

for (const token of [
  'Alternativa actual — Dunford',
  'Oportunidades candidatas',
  'Evidencia que lo contradice',
  'Próxima prueba',
]) {
  if (!files.snapshot.includes(token)) throw new Error('Snapshot template missing: ' + token);
}

for (const token of [
  'preparada, no realizada',
  'No mezclar ambas capas',
  'Hipótesis previas',
  'No llenar.',
]) {
  if (!files.papa.includes(token)) throw new Error('INT-001 anti-bias guard missing: ' + token);
}

if (!files.results.startsWith('interview_id,date,segment')) {
  throw new Error('Results register schema changed unexpectedly.');
}

for (const token of [
  'CAND-001',
  'No convertir todavía en oportunidades confirmadas',
  'Próxima pregunta obligatoria',
]) {
  if (!files.int002.includes(token)) throw new Error('INT-002 evidence guard missing: ' + token);
}

for (const token of [
  'Single Source of Truth',
  'No comprar todavía HubSpot/Salesforce/MoeGo/Gingr',
  'hotel / boarding / hospedaje',
  'Consultas a Secretaría',
]) {
  if (!files.opsResearch.includes(token)) throw new Error('Operations research guard missing: ' + token);
}

for (const token of [
  'fácil de usar',
  'A mí se me perdió esa tarjetita',
  'cambios de horarios',
  'pago en línea',
  'preferencia de personalización',
]) {
  if (!files.int011.includes(token)) throw new Error('INT-011 evidence missing: ' + token);
}

for (const token of [
  'CLIENT-OPP-001',
  'CLIENT-CAND-002',
  'CLIENT-CAND-003',
  'CLIENT-CAND-004',
  'HYP-CLIENT-01',
  'Una futura UCAPSA Staff es una **solución candidata**',
]) {
  if (!files.consolidated.includes(token)) throw new Error('Consolidated discovery state missing: ' + token);
}

if (!files.ost.includes('CAND-001') || !files.ost.includes('INT-002')) {
  throw new Error('INT-002 operational evidence must remain separated from the client OST.');
}

if (!files.results.includes('INT-011,2026-10-04,member,puppy_to_comandos')) {
  throw new Error('INT-011 must be present in the structured results register.');
}

console.log('UCAPSA product discovery system: PASS');
