import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (text, pattern, message) => {
  if (!pattern.test(text)) failures.push(message);
};
const mustNot = (text, pattern, message) => {
  if (pattern.test(text)) failures.push(message);
};

const doc = read('docs/UCAPSA_RANGO_1.md');
const sql = read('supabase/sql/ucapsa-rango-1-foundation.sql');
const oldPointsDoc = read('docs/UCAPSA_POINTS.md');
const oldUxDoc = read('docs/UCAPSA_POINTS_UX_AUDIT.md');

must(doc, /General → particular/, 'Rango 1 perdió la regla general → particular.');
must(doc, /No saturar/, 'Rango 1 perdió la regla de no saturar pantallas.');
must(doc, /Una sola fuente verdadera por producto/, 'Rango 1 perdió el contrato SSOT.');
must(doc, /dog_id \+ season_id/, 'Rango 1 dejó de ser dog-specific por temporada.');
must(doc, /Constancia[\s\S]*Exámenes oficiales[\s\S]*Ajustes Admin/, 'Rango 1 perdió la separación constancia + exámenes + ajustes.');

must(oldPointsDoc, /SUPERADO por Plan UCAPSA Rango 1/, 'El plan viejo de Puntos volvió a parecer vigente.');
must(oldUxDoc, /SUPERADA por Plan UCAPSA Rango 1/, 'La UX vieja de Puntos volvió a parecer vigente.');

must(sql, /create table if not exists public\.ucapsa_competition_seasons/, 'Falta la fuente canónica de temporadas.');
must(sql, /exclude using gist \(tstzrange\(starts_at, ends_at, '\[\)'\) with &&\)/, 'Temporadas ya no bloquean solapamientos.');
must(sql, /where status = 'active'/, 'Temporadas perdieron la unicidad de temporada activa.');

must(sql, /create table if not exists public\.member_visit_dogs/, 'Falta el snapshot multi-perro de visitas de socio.');
must(sql, /primary key \(visit_id, dog_id\)/, 'Una visita puede duplicar crédito al mismo perro.');
must(sql, /ucapsa_validate_member_visit_dog_owner/, 'Visitas de socio no validan que el perro pertenezca a la misma cuenta.');

for (const table of [
  'ucapsa_exams',
  'ucapsa_exam_items',
  'ucapsa_exam_attempts',
  'ucapsa_exam_item_results',
]) {
  must(sql, new RegExp(`create table if not exists public\\.${table}`), `Falta ${table} en la estructura granular de exámenes.`);
}
must(sql, /is_required_for_ranking boolean/, 'Exámenes perdieron la bandera de elegibilidad.');
must(sql, /ucapsa_exam_attempts_one_official_idx/, 'Exámenes ya no garantizan un solo intento oficial por perro/examen.');
must(sql, /check \(not is_official or status = 'published'\)/, 'Un intento oficial podría quedar sin publicar.');
must(sql, /ucapsa_validate_exam_item_result/, 'Resultados de examen perdieron validación contra ejercicio/máximo.');
mustNot(sql, /\btotal_score\b|\bexam_total\b/, 'La fundación volvió a guardar un total editable de examen.');

must(sql, /create table if not exists public\.ucapsa_import_batches/, 'Falta trazabilidad de importaciones Excel.');
must(sql, /'exam_results', 'admin_adjustments', 'attendance_history'/, 'Importaciones perdieron los tipos estructurales de Rango 1.');

must(sql, /create table if not exists public\.ucapsa_competition_adjustments/, 'Faltan ajustes administrativos dog-specific.');
must(sql, /points numeric\(12,2\) not null check \(points <> 0\)/, 'Ajustes Admin perdieron movimientos firmados positivos/negativos.');
must(sql, /note text,/, 'Ajustes Admin dejaron de permitir nota opcional.');
mustNot(sql, /reason text not null/, 'Rango 1 volvió a exigir justificación obligatoria a Admin.');

must(sql, /create table if not exists public\.ucapsa_award_definitions/, 'Falta catálogo de premios permanentes.');
must(sql, /create table if not exists public\.dog_awards/, 'Faltan premios permanentes dog-specific.');
must(sql, /'dog_of_year'/, 'Falta la definición estructural de Perro del Año.');

mustNot(sql, /create table if not exists public\.ucapsa_points_participants/, 'Rango 1 volvió al modelo de un perro representante por socio.');
mustNot(sql, /create table if not exists public\.(?:ucapsa_)?(?:ranking|leaderboard|podium)/, 'Ranking/podio volvió a persistirse como fuente paralela.');
mustNot(sql, /default_points/, 'La fundación adelantó la escala de puntos antes de definirla.');

if (failures.length) {
  console.error('RANGO 1 FOUNDATION FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('RANGO 1 FOUNDATION OK: SSOT, multi-perro, temporadas, exámenes, imports, ajustes y premios protegidos.');
