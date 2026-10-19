import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const sources = {
  home: fs.readFileSync('src/screens/home/HomeExperienceScreen.tsx','utf8'),
  trainer: fs.readFileSync('src/app/(tabs)/trainer-home.tsx','utf8'),
  customer: fs.readFileSync('src/services/customer-value.service.ts','utf8'),
};
for (const [name, source] of Object.entries(sources)) {
  const parsed = ts.createSourceFile(name.endsWith('customer') ? 'test.ts' : 'test.tsx',
    source, ts.ScriptTarget.ES2022, true, name==='customer'
      ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
  assert.equal(parsed.parseDiagnostics.length,0,
    name+': '+parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
}
assert.equal((sources.home.match(/accessibilityLabel="Consultar menú del restaurante UCAPSA"/g)||[]).length,1,
  'Restaurante debe tener un único acceso en el encabezado');
assert.ok(sources.home.includes("router.push('/restaurant' as never)"),
  'Acceso independiente de membresía');
assert.equal((sources.home.match(/onPress=\{\(\) => router\.push\('\/restaurant' as never\)\}/g)||[]).length,1,
  'Evitar botones de restaurante duplicados');
assert.ok(sources.trainer.includes("label: 'HOY' | 'MAÑANA'"));
assert.ok(sources.trainer.includes('getStaffClassSummary(today)') &&
  sources.trainer.includes('getStaffClassSummary(tomorrow)'));
assert.ok(sources.trainer.includes('isProgramScheduleActiveOnDate(schedule, dateKey)'),
  'No mostrar clases fuera del horario/ciclo');
assert.ok(sources.trainer.includes('cancellation_date === dateKey'),
  'Respetar cancelaciones al listar horarios');
assert.ok(sources.trainer.includes('getProgramSchedules(today)') &&
  sources.trainer.includes('getProgramSchedules(tomorrow)'),
  'Incluir horarios oficiales sin inscritos');
assert.ok(sources.trainer.includes("['Básico','Intermedio','Avanzado']"),
  'Los tres niveles de Comandos permanecen en un horario');
assert.ok(sources.customer.includes("source: 'obligation'"),
  'Las deudas documentadas deben continuar visibles');
assert.ok(!sources.customer.includes('if (snapshot.whatIsNext.legacyMembershipPaymentPending)'),
  'No generar falsa alerta por membresía otorgada');
console.log('UCAPSA UI audit: restaurante, pagos reales y entrenador hoy/mañana PASS');
