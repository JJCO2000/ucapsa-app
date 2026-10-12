import fs from 'node:fs';
import path from 'node:path';

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
  /onPress=\{\(\) => onSelect\(definition\)\}/,
  'Las insignias individuales dejaron de abrir detalle.',
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

// Presentación compacta: los badges de actividad siguen siendo específicos
// por perro, sin mezclar visitas de socio y sin la nota técnica en la interfaz.
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /styles\.badgeGrid[\s\S]*definitions\.map\(\(definition\)/,
  'Actividad perdió la colección de insignias en cuadrícula.',
);
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /accessibilityLabel=\{definition\.title[\s\S]*onSelect\(definition\)/,
  'Las insignias individuales perdieron su detalle navegable.',
);
requirePattern(
  'src/app/client/activity-achievements.tsx',
  /Modal visible=\{Boolean\(selectedDefinition\)\}/,
  'El detalle de insignia dejó de abrirse como pantalla inmersiva.',
);
if (read('src/app/client/activity-achievements.tsx').includes('las visitas de socio son métricas de la cuenta')) {
  failures.push('Se reintrodujo la explicación técnica rechazada en Insignias de actividad.');
}

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
