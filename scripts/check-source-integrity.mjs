import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function must(rel, pattern, label) { if (!pattern.test(read(rel))) failures.push(label); }
function mustNot(rel, pattern, label) { if (pattern.test(read(rel))) failures.push(label); }

must('src/lib/supabase.ts', /createClient<Database>/, 'Supabase client no está tipado con Database.');
mustNot('src/constants/ucapsaFormats.ts', /#[0-9a-f]{6}/i, 'ucapsaFormats.ts repite HEX; debe consumir tokens de brand.ts.');
must('AGENTS.md', /versions\/v57\.0\.0/, 'AGENTS.md no apunta a la documentación de Expo SDK 57.');
const generated = read('src/types/database.generated.ts');
if (!/export (type|interface) Database/.test(generated)) failures.push('Falta Database generado desde Supabase.');
mustNot('src/types/database.types.ts', /Record<string,\s*never>/, 'Sigue activo el placeholder Record<string, never>.');
must('src/app/(tabs)/dog.tsx', /account-settings\?section=profile/, 'La pata con lápiz no abre Mis datos.');
mustNot('src/app/admin/classes.tsx', /TextInput\s+value=\{form\.dogName\}/, 'Admin Clases aún usa perro como texto libre al crear.');
mustNot('src/app/admin/classes.tsx', /TextInput\s+value=\{editForm\.dogName\}/, 'Admin Clases aún usa perro como texto libre al editar.');
mustNot('src/app/admin/customer-class.tsx', /<Field label="Perro"/, 'Ficha de clase aún usa perro como texto libre.');

mustNot('src/services/notifications.service.ts', /p_(device_name|device_id|app_ownership|app_version|project_id):[^\r\n]*\?\? null/, 'RPC de notificaciones envía null a argumentos opcionales tipados.');
mustNot('src/services/programs.service.ts', /p_(cycle_start_date|schedule_id|change_note|notes):[^\r\n]*(\?\? null|\|\| null)/, 'RPC de programas envía null a argumentos opcionales tipados.');

for (const rel of ['src/app/admin/classes.tsx', 'src/app/admin/customer-class.tsx', 'src/services/programs.service.ts']) {
  must(rel, /dogId/, `${rel} no conserva dogId como relación explícita.`);
}

must('src/constants/programCompletion.ts', /PROGRAM_COMPLETION_ACHIEVEMENT_CODES/, 'Falta el registro central de logros por programa.');
must('src/services/achievements.service.ts', /getProgramCompletionAchievementCode/, 'Logros no usa el registro central de finalización de programas.');
mustNot('src/services/achievements.service.ts', /function\s+programCompletionAchievementCode/, 'Logros volvió a duplicar el mapeo programa -> medalla.');
must('src/services/memberships.service.ts', /getMyMembershipEligibility/, 'Membresía no tiene una consulta canónica de elegibilidad.');
must('src/app/(tabs)/admin-home.tsx', /getAdminDashboardStats/, 'Admin Home no usa el servicio canónico de resumen.');
mustNot('src/app/(tabs)/admin-home.tsx', /supabase\.from\(/, 'Admin Home volvió a consultar tablas directamente.');
must('src/services/memberships.service.ts', /program_completion_achievement/, 'Membresía perdió el fallback de evidencia histórica por logro de programa.');
must('src/app/client/membership.tsx', /getMyMembershipEligibility/, 'Pantalla de membresía no usa la elegibilidad canónica.');
must('src/components/ui/Screen.tsx', /edges = \['top', 'right', 'bottom', 'left'\]/, 'Screen perdió el safe-area inferior global.');
must('src/components/ui/KeyboardAwareModal.tsx', /useSafeAreaInsets/, 'Los modales no protegen la barra de navegación inferior.');
must('scripts/capture-supabase-source-of-truth.ps1', /supabase','db','dump','--linked','--schema','public'/, 'Captura Supabase no guarda el esquema remoto public.');
mustNot('src/app/client/membership.tsx', /isMembershipEligibleFromPrograms\(programs\)/, 'Pantalla de membresía volvió a decidir elegibilidad desde una lista local de programas.');
must('src/app/attendance.tsx', /isMembershipActiveToday/, 'Escáner de socio no valida vigencia efectiva de la membresía.');
mustNot('src/app/client/attendance-history.tsx', /!enrollmentId\)\s*return/, 'Historial de asistencias volvió a exigir enrollmentId y rompe APROVECHASTE desde Home.');
must('src/app/client/attendance-history.tsx', /Historial de asistencias/, 'Falta la vista agregada de asistencias desde APROVECHASTE.');
mustNot('src/components/domain/CustomerValueSnapshotCard.tsx', /parts\.push\(`Membresía vencida/, 'TIENES volvió a presentar una membresía vencida como valor disponible.');
must('src/services/customer-value.service.ts', /membership\?\.status === 'active' && !membership\.isValidToday/, 'SIGUE no prioriza una membresía activa fuera de vigencia.');

const scanRoots = ['src', 'scripts'];
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const scanRoot of scanRoots) {
  const absoluteRoot = path.join(root, scanRoot);
  for (const file of walk(absoluteRoot).filter((value) => /\.(ts|tsx|mjs|js)$/.test(value))) {
    const relFile = path.relative(root, file).replaceAll('\\', '/');
    const text = fs.readFileSync(file, 'utf8');
    if (/\d{18}/.test(text)) failures.push(`CLABE de 18 dígitos hardcodeada en ${relFile}.`);
    if (relFile.startsWith('src/') && relFile !== 'src/constants/brand.ts' && /#[0-9a-f]{6}/i.test(text)) failures.push(`Color HEX fuera de brand.ts en ${relFile}.`);
    const replacementChar = String.fromCharCode(0xfffd);
    const mojibakeLead = new RegExp(`[${String.fromCharCode(0xc3)}${String.fromCharCode(0xc2)}].`);
    if (text.includes(replacementChar) || mojibakeLead.test(text)) failures.push(`Texto UTF-8 dañado o mojibake detectado en ${relFile}.`);
    const missingEnye = new RegExp('\\ba' + 'nos?\\b', 'i');
    if (missingEnye.test(text)) failures.push(`Texto sin eñe detectado en ${relFile}; usa año/años.`);
  }
}

if (failures.length) {
  console.error('SOURCE INTEGRITY FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('SOURCE INTEGRITY OK: tipos, perros, rutas críticas, UTF-8, textos y CLABE revisados.');
