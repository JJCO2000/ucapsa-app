import fs from 'node:fs';
import assert from 'node:assert/strict';

// Tres reglas: general -> detalle; una única pantalla de examen; BD como SSOT.
const read = (path) => fs.readFileSync(path, 'utf8');
const sql = read('supabase/sql/ucapsa-staff-edit-exam-drafts.sql');
const migration = read('supabase/migrations/20261018183000_staff_edit_exam_drafts.sql');
const ui = read('src/app/(tabs)/trainer-exams.tsx');
const service = read('src/services/trainer-staff.service.ts');
const types = read('src/types/database.generated.ts');

assert.equal(migration, sql, 'El SQL fuente y la migración deben coincidir');
for (const token of [
  'create or replace function public.get_staff_editable_ucapsa_exam_draft',
  'create or replace function public.staff_update_ucapsa_exam_draft',
  'if not public.is_ucapsa_staff() then',
  "v_exam.status <> 'draft'",
  "v_season_status not in ('active', 'reopened')",
  'p_expected_updated_at',
  'for update;',
  'p_items is null',
  'jsonb_typeof(p_items)',
  'jsonb_array_length(p_items) not between 1 and 100',
  'ucapsa_exam_attempts a where a.exam_id = p_exam_id',
  'update public.ucapsa_exams',
  'delete from public.ucapsa_exam_items',
  'insert into public.ucapsa_exam_items',
  'insert into public.admin_audit_logs',
  'revoke all on function public.staff_update_ucapsa_exam_draft',
  'to authenticated, service_role',
]) assert.ok(sql.includes(token), 'Guard faltante: ' + token);
assert.ok(sql.includes('p_expected_updated_at is null') &&
  sql.includes('v_exam.updated_at is distinct from p_expected_updated_at'),
  'No se pueden sobrescribir cambios concurrentes sin recargar');
assert.ok(sql.includes("if v_exam.status <> 'draft'") || sql.includes("or v_exam.status <> 'draft'"),
  'No se puede modificar un examen publicado');
for (const forbidden of [
  /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.ucapsa_exam_attempts/i,
  /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.ucapsa_exam_item_results/i,
  /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.payments/i,
]) {
  assert.ok(!forbidden.test(sql), 'El editor no puede alterar intentos/resultados/pagos');
}
for (const token of [
  'getStaffEditableExamDraft(draft.examId)',
  'updateStaffExamDraft({',
  'setEditingDraft({ examId: definition.examId, updatedAt: definition.updatedAt })',
  'setDraftItems(definition.items)',
  'editManualExamItem',
  'removeManualExamItem',
  'Guardar cambios',
  'Publicar',
  'Borradores',
]) assert.ok(ui.includes(token), 'Editor incompleto: ' + token);
for (const token of [
  "supabase.rpc('get_staff_editable_ucapsa_exam_draft'",
  "supabase.rpc('staff_update_ucapsa_exam_draft'",
]) assert.ok(service.includes(token), 'SSOT de servicio incompleta: ' + token);
assert.ok(types.includes('get_staff_editable_ucapsa_exam_draft:') &&
  types.includes('staff_update_ucapsa_exam_draft:'),
  'Los tipos deben coincidir con los RPC');
console.log('UCAPSA edición de borradores, SSOT, permisos y estructura publicada: PASS');
