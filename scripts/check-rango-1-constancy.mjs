import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, 'supabase/sql/ucapsa-rango-1-constancy-views.sql'), 'utf8');
const failures = [];
const must = (pattern, message) => {
  if (!pattern.test(sql)) failures.push(message);
};
const mustNot = (pattern, message) => {
  if (pattern.test(sql)) failures.push(message);
};

must(/ucapsa_competition_seasons_local_day_bounds/, 'Temporadas perdieron límites diarios deterministas.');
must(/starts_at at time zone 'America\/Mexico_City'[\s\S]*time '00:00:00'[\s\S]*ends_at at time zone 'America\/Mexico_City'/, 'Temporadas dejaron de exigir medianoche local CDMX.');
must(/create or replace view public\.ucapsa_constancy_events[\s\S]*security_invoker = true/, 'Constancia perdió la vista de hechos security_invoker.');
must(/create or replace view public\.ucapsa_constancy_summary[\s\S]*security_invoker = true/, 'Constancia perdió la vista resumen security_invoker.');
must(/program_attendances pa[\s\S]*program_enrollments pe[\s\S]*pe\.dog_id/, 'Constancia dejó de atribuir Comandos por dog_id del enrollment.');
must(/member_visit_dogs mvd[\s\S]*member_visits mv/, 'Constancia dejó de consumir el snapshot dog-specific de visitas.');
must(/pa\.attendance_date >=[\s\S]*s\.starts_at[\s\S]*pa\.attendance_date <[\s\S]*s\.ends_at/, 'Comandos perdió la asignación por fecha canónica de temporada.');
must(/mv\.visit_date >=[\s\S]*s\.starts_at[\s\S]*mv\.visit_date <[\s\S]*s\.ends_at/, 'Visitas perdió la asignación por fecha canónica de temporada.');
must(/row_number\(\) over[\s\S]*s\.id,[\s\S]*pe\.dog_id,[\s\S]*session:/, 'Comandos perdió deduplicación dog-specific por sesión.');
must(/where occurrence_rank = 1/, 'Comandos volvió a contar filas duplicadas de la misma sesión.');
must(/count\(\*\) filter \(where event_type = 'command_attendance'\)/, 'Resumen perdió el conteo separado de Comandos.');
must(/count\(\*\) filter \(where event_type = 'member_visit'\)/, 'Resumen perdió el conteo separado de visitas.');
must(/group by season_id, dog_id/, 'Resumen dejó de ser dog-specific por temporada.');
must(/grant select on public\.ucapsa_constancy_events to authenticated;/, 'Cliente perdió lectura de hechos de constancia.');
must(/grant select on public\.ucapsa_constancy_summary to authenticated;/, 'Cliente perdió lectura del resumen de constancia.');

mustNot(/create table if not exists public\.ucapsa_constancy/, 'Constancia volvió a persistir un resumen editable.');
mustNot(/\b(total_points?|score|rank_position|podium_medal|range_override)\b/i, 'Constancia adelantó campos de puntos/rango/ranking/podio antes de definir la escala.');
mustNot(/program_enrollments\.attendances_count|pe\.attendances_count/, 'Constancia volvió a usar attendances_count legado en vez de asistencias reales.');

if (failures.length) {
  console.error('RANGO 1 CONSTANCY FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('RANGO 1 CONSTANCY OK: hechos y resumen dog-specific derivados, por temporada y sin doble conteo de sesión.');
