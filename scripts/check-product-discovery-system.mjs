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
  'OPORTUNIDADES CONFIRMADAS',
  '[vacío hasta que exista evidencia]',
  'No añadir soluciones antes de identificar la oportunidad',
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

if (!files.ost.includes('CAND-001') || !files.ost.includes('observación')) {
  throw new Error('INT-002 must remain an observed candidate in the OST until more evidence exists.');
}

console.log('UCAPSA product discovery system: PASS');
