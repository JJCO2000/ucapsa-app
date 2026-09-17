import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, 'supabase/sql/ucapsa-rango-1-operational-seasons.sql'), 'utf8');
const failures = [];
const must = (pattern, message) => {
  if (!pattern.test(sql)) failures.push(message);
};
const mustNot = (pattern, message) => {
  if (pattern.test(sql)) failures.push(message);
};

must(/check \(status in \('draft', 'active', 'reopened', 'closed'\)\)/, 'Temporadas perdió el estado administrativo reopened.');
must(/status <> 'draft'[\s\S]*is_ucapsa_admin/, 'Los socios podrían volver a leer temporadas draft.');
must(/p_ends_on \+ 1/, 'La fecha final Admin dejó de tratarse como inclusiva.');
must(/America\/Mexico_City/, 'Temporadas perdió la normalización horaria CDMX.');

for (const fn of [
  'admin_create_ucapsa_competition_season',
  'admin_update_ucapsa_competition_season',
  'admin_activate_ucapsa_competition_season',
  'admin_close_ucapsa_competition_season',
  'admin_reopen_ucapsa_competition_season',
]) {
  must(new RegExp(`create or replace function public\\.${fn}\\(`), `Falta RPC ${fn}.`);
  must(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*from public, anon, authenticated;`), `${fn} volvió a quedar ejecutable por anon/public.`);
  must(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to authenticated;`), `${fn} perdió acceso para Admin autenticado.`);
}

must(/admin_create_ucapsa_competition_season[\s\S]*is_super_admin\(\)/, 'Crear temporada dejó de exigir Superadmin.');
must(/admin_update_ucapsa_competition_season[\s\S]*is_super_admin\(\)/, 'Configurar temporada dejó de exigir Superadmin.');
must(/admin_activate_ucapsa_competition_season[\s\S]*is_super_admin\(\)/, 'Activar temporada dejó de exigir Superadmin.');
must(/admin_reopen_ucapsa_competition_season[\s\S]*is_super_admin\(\)/, 'Reabrir temporada dejó de exigir Superadmin.');
must(/admin_close_ucapsa_competition_season[\s\S]*is_ucapsa_admin\(\)/, 'Cerrar temporada dejó de permitir Admin\/Superadmin.');

must(/status = 'active'[\s\S]*Ya existe una temporada UCAPSA activa/, 'Activación perdió la protección explícita de una sola temporada activa.');
must(/v_season\.status <> 'closed'[\s\S]*status = 'reopened'/, 'Reapertura dejó de ser closed → reopened.');
must(/v_season\.status not in \('active', 'reopened'\)[\s\S]*status = 'closed'/, 'Cierre dejó de soportar active\/reopened → closed.');

for (const action of ['create', 'update', 'activate', 'close', 'reopen']) {
  must(new RegExp(`ucapsa_competition_season\\.${action}`), `Falta auditoría automática de ${action}.`);
}
must(/insert into public\.admin_audit_logs/g, 'Temporadas perdió la auditoría canónica.');

must(/activated_at timestamptz[\s\S]*activated_by uuid/, 'Falta trazabilidad de activación.');
must(/reopened_at timestamptz[\s\S]*reopened_by uuid/, 'Falta trazabilidad de reapertura.');

mustNot(/\b(total_points?|score|rank_position|podium_medal|range_override)\b/i, 'Temporadas adelantó lógica competitiva que pertenece a otro producto.');
mustNot(/delete from public\.ucapsa_competition_seasons/i, 'Temporadas operativas introdujo borrado destructivo de historia.');

if (failures.length) {
  console.error('RANGO 1 SEASONS FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('RANGO 1 SEASONS OK: ciclo, permisos, visibilidad y auditoría protegidos.');
