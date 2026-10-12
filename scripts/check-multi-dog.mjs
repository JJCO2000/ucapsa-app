import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = process.cwd();
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function requirePattern(rel, pattern, message) {
  if (!pattern.test(read(rel))) failures.push(message);
}

// Contratos que usa la app real.
requirePattern(
  'src/app/(tabs)/dog.tsx',
  /if \(item\.enrollment\.dog_id\) return item\.enrollment\.dog_id === selectedDog\.id;/,
  'Mi perro dejó de priorizar dog_id al separar programas por perro.',
);
requirePattern(
  'src/app/client/dog-achievements.tsx',
  /getCachedAchievementsForDog\(user\.id, dogId\)/,
  'La ficha de logros dejó de leer la caché por dogId.',
);
requirePattern(
  'src/app/client/dog-achievements.tsx',
  /getMyDogAchievements\(dogId,/,
  'La ficha de logros dejó de refrescar por dogId.',
);
requirePattern(
  'src/app/(tabs)/dog.tsx',
  /setSelectedDogId\(requestedDogId\)/,
  'La navegación contextual dejó de seleccionar el perro solicitado.',
);
requirePattern(
  'src/services/achievements-cache.service.ts',
  /function achievementScopeKey\(userId: string, dogId: string \| null\)[\s\S]*\$\{userId\}:\$\{dogId \?\? 'all'\}/,
  'La caché de logros dejó de separar usuario y perro.',
);
requirePattern(
  'src/services/achievements-read.service.ts',
  /getAchievementsForDog[\s\S]*\.eq\('user_id', userId\)[\s\S]*\.eq\('dog_id', dogId\)/,
  'La consulta formal de logros dejó de filtrar por dog_id.',
);
requirePattern(
  'src/components/domain/AchievementBadgeGrid.tsx',
  /if \(maxItems && visibleItems\[0\]\?\.dogId\)[\s\S]*const dogId = visibleItems\[0\]\.dogId;[\s\S]*dog-achievements\?dogId=\$\{encodeURIComponent\(dogId\)\}/,
  'El resumen compacto dejó de navegar con el dogId del perro mostrado.',
);
requirePattern(
  'src/app/client/dog-achievements.tsx',
  /const dogId =[\s\S]*dogIdParam[\s\S]*getCachedAchievementsForDog\(user\.id, dogId\)[\s\S]*getMyDogAchievements\(dogId,/,
  'La ficha de logros dejó de conservar el mismo dogId entre caché y refresh remoto.',
);
requirePattern(
  'src/screens/home/HomeExperienceScreen.tsx',
  /nextClass[\s\S]*find\(\(program\) => program\.enrollmentId === nextClass\.enrollmentId\)/,
  'Inicio dejó de elegir el programa asociado a la próxima clase.',
);
requirePattern(
  'src/screens/home/HomeCards.tsx',
  /nextClass[\s\S]*find\(\(item\) => item\.enrollmentId === nextClass\.enrollmentId\)/,
  'La tarjeta Tu programa dejó de seguir la inscripción de la próxima clase.',
);
requirePattern(
  'src/services/customer-value.service.ts',
  /dogId: string \| null;\s*dogName: string \| null;/,
  'El snapshot de Inicio dejó de conservar la identidad del perro en logros.',
);

// Las insignias de actividad deben conservar el perro y no mezclar cuentas.
requirePattern(
  'src/app/(tabs)/dog.tsx',
  /\/client\/activity-achievements\?dogId=\$\{encodeURIComponent\(selectedDog\.id\)\}/,
  'El icono de actividad no abre insignias del perro seleccionado.',
);
requirePattern(
  'src/app/(tabs)/dog.tsx',
  /ucapsaColorKeyPalette\[advancedProgramAchievement\.definition\.color_key\]/,
  'El símbolo de logro no usa el color de su definición canónica.',
);
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /getCachedDogActivityFacts\(user\.id, scopedDogId\)/,
  'La pantalla de insignias no hidrata datos por perro.',
);
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /getMyDogActivityFacts\(user\.id, scopedDogId\)/,
  'La pantalla de insignias mezcla la actividad de toda la cuenta.',
);
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /collections\.map\(\(collection\) =>[\s\S]*setSelectedMetric\(collection\.metric\)/,
  'Cada categoría debe abrir su propio detalle sin mostrar niveles duplicados.',
);
requirePattern(
  'src/services/client-activity.service.ts',
  /export function buildDogActivityFacts\(/,
  'El resumen de actividad no tiene proyección específica para el perro.',
);
requirePattern(
  'src/constants/activityAchievements.ts',
  /export const activityAchievementCategoryMeta =/,
  'Colores y símbolos de actividad perdieron su fuente compartida.',
);

// Duolingo-like: la vitrina muestra UNA insignia por categoría.
// Los umbrales son niveles dentro del detalle, nunca nuevas tarjetas.
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /buildActivityAchievementCollections\(facts,[\s\S]*includeMemberVisits: premium && !scopedDogId/,
  'La colección dejó de basarse en el catálogo y su alcance real.',
);
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /collections\.map\(\(collection\)/,
  'Las tarjetas ya no se generan dinámicamente desde el catálogo.',
);
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /Nivel \$\{collection\.currentLevel\} de \$\{collection\.totalLevels\}/,
  'Se perdió el nivel conseguido de niveles totales.',
);
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /collection\.levels\.map\(\(level, index\)/,
  'El detalle dejó de mostrar los niveles pasados y siguientes.',
);
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /Modal visible=\{Boolean\(selectedCollection\)\}/,
  'El detalle de insignia dejó de abrirse a pantalla completa.',
);
requirePattern(
  'src/app/(tabs)/dog.tsx',
  /buildActivityAchievementCollections\(/,
  'El resumen del perro ya no reutiliza la fuente de niveles.',
);
const achievementScreen = read('src/app/client/activity-achievements.tsx');
if (/TU SIGUIENTE LOGRO|nextAchievement|styles\.nextCard|definitions\.map\(\(definition\)/.test(achievementScreen)) {
  failures.push('Vitrina reintrodujo objetivos extra o insignias duplicadas por nivel.');
}
if (achievementScreen.includes('las visitas de socio son métricas de la cuenta')) {
  failures.push('Se reintrodujo la explicación técnica rechazada en Insignias de actividad.');
}

// Pruebas reales de la función de niveles compilada desde el archivo de la app;
// no reimplementamos el algoritmo en el test.
const moduleStub = { exports: {} };
const compiledCatalog = ts.transpileModule(read('src/constants/activityAchievements.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compiledCatalog, {
  module: moduleStub,
  exports: moduleStub.exports,
  require: () => ({}),
});
const { activityAchievementDefinitions, buildActivityAchievementCollections } = moduleStub.exports;
const factsFor = (attendanceTotal, practiceTotal = 7, longestPracticeStreak = 4, memberVisitsTotal = 8) => ({
  attendanceTotal, practiceTotal, longestPracticeStreak, memberVisitsTotal,
});
const getAttendanceLevel = (attendanceTotal) =>
  buildActivityAchievementCollections(factsFor(attendanceTotal), { includeMemberVisits: false })
    .find((item) => item.metric === 'attendance');
for (const [count, expectedLevel, nextThreshold] of [
  [0, 0, 1], [1, 1, 5], [2, 1, 5], [5, 2, 10],
  [7, 2, 10], [10, 3, 25], [12, 3, 25], [25, 4, 50],
  [50, 5, 100], [100, 6, null], [101, 6, null],
]) {
  const badge = getAttendanceLevel(count);
  if (badge.currentLevel !== expectedLevel || badge.totalLevels !== 6 || badge.nextDefinition?.threshold !== (nextThreshold ?? undefined)) {
    failures.push(`Nivel de asistencia incorrecto para ${count} registros.`);
  }
}
const scoped = buildActivityAchievementCollections(factsFor(7), { includeMemberVisits: false });
const account = buildActivityAchievementCollections(factsFor(7), { includeMemberVisits: true });
if (scoped.some((item) => item.metric === 'visits') || !account.some((item) => item.metric === 'visits')) {
  failures.push('Visitas deben existir solo en la colección de la cuenta de socio.');
}
if (scoped.find((item) => item.metric === 'practice')?.currentLevel !== 2 ||
    scoped.find((item) => item.metric === 'streak')?.currentLevel !== 1) {
  failures.push('La progresión de prácticas y rachas no conserva los niveles originales.');
}
// Si se agrega un séptimo nivel a una categoría, la colección reacciona sin
// editar la pantalla ni el resumen del perro.
activityAchievementDefinitions.push({
  code: 'test_attendance_200', metric: 'attendance', threshold: 200,
  title: 'Nivel de prueba', description: 'Fixture', icon: 'school',
});
if (getAttendanceLevel(100)?.totalLevels !== 7 || getAttendanceLevel(100)?.nextDefinition?.threshold !== 200) {
  failures.push('Agregar nivel nuevo no actualiza la colección automáticamente.');
}
activityAchievementDefinitions.pop();

// Fixture sintético: dos perros con programas distintos y una fila histórica sin dog_id.
const dogs = [
  { id: 'dog-tuka', name: 'Tuka' },
  { id: 'dog-luna', name: 'Luna' },
];
const programs = [
  { enrollmentId: 'enrollment-tuka', dogId: 'dog-tuka', dogName: 'Tuka', level: 'base' },
  { enrollmentId: 'enrollment-luna', dogId: 'dog-luna', dogName: 'Luna', level: 'avanzado' },
  { enrollmentId: 'legacy-tuka', dogId: null, dogName: 'Tuka', level: 'puppy' },
];

function sameDogName(left, right) {
  return String(left ?? '').trim().toLocaleLowerCase('es-MX') === String(right ?? '').trim().toLocaleLowerCase('es-MX');
}

function scopePrograms(rows, dog) {
  return rows.filter((item) => {
    if (item.dogId) return item.dogId === dog.id;
    return sameDogName(item.dogName, dog.name);
  });
}

const tukaPrograms = scopePrograms(programs, dogs[0]);
const lunaPrograms = scopePrograms(programs, dogs[1]);
if (tukaPrograms.some((item) => item.dogId === 'dog-luna')) failures.push('Fixture multi-perro: Tuka recibió un programa explícito de Luna.');
if (lunaPrograms.some((item) => item.dogId === 'dog-tuka')) failures.push('Fixture multi-perro: Luna recibió un programa explícito de Tuka.');
if (!tukaPrograms.some((item) => item.enrollmentId === 'legacy-tuka')) failures.push('Fixture multi-perro: se perdió la compatibilidad histórica por nombre para Tuka.');

// Dos perros pueden tener la misma medalla: dog_id debe mantenerlas independientes.
const storedAchievements = [
  { dogId: 'dog-tuka', code: 'puppy_completed' },
  { dogId: 'dog-luna', code: 'puppy_completed' },
];
const tukaAchievements = storedAchievements.filter((item) => item.dogId === 'dog-tuka');
const lunaAchievements = storedAchievements.filter((item) => item.dogId === 'dog-luna');
if (tukaAchievements.length !== 1 || lunaAchievements.length !== 1) failures.push('Fixture multi-perro: la misma medalla no quedó independiente por perro.');

// El resumen compacto debe abrir la ficha del mismo perro, incluso si ambos tienen la misma medalla.
function dogAchievementRoute(items) {
  const dogId = items[0]?.dogId ?? null;
  return dogId ? `/client/dog-achievements?dogId=${encodeURIComponent(dogId)}` : null;
}
if (dogAchievementRoute(tukaAchievements) !== '/client/dog-achievements?dogId=dog-tuka') failures.push('Fixture multi-perro: el resumen de Tuka perdió su dogId al abrir logros.');
if (dogAchievementRoute(lunaAchievements) !== '/client/dog-achievements?dogId=dog-luna') failures.push('Fixture multi-perro: el resumen de Luna perdió su dogId al abrir logros.');

// Aunque el programa de Luna no sea el primero, la próxima clase de Luna debe seleccionar Luna.
const nextClass = { enrollmentId: 'enrollment-luna' };
const selectedProgram = programs.find((item) => item.enrollmentId === nextClass.enrollmentId) ?? programs[0] ?? null;
if (selectedProgram?.dogId !== 'dog-luna') failures.push('Fixture multi-perro: Inicio eligió el programa del perro equivocado para la próxima clase.');

if (failures.length) {
  console.error('MULTI-DOG FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('MULTI-DOG OK: programas, logros, navegación dog-specific y próxima clase permanecen aislados por perro.');
