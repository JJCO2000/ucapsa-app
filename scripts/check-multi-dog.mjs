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
  'src/app/(tabs)/dog.tsx',
  /getCachedAchievementsForDog\(userId, dogId\)/,
  'Mi perro dejó de leer la caché de logros por dogId.',
);
requirePattern(
  'src/app/(tabs)/dog.tsx',
  /getMyDogAchievements\(dogId,/,
  'Mi perro dejó de refrescar logros por dogId.',
);
requirePattern(
  'src/app/(tabs)/dog.tsx',
  /setSelectedDogId\(requestedDogId\)/,
  'La navegación contextual dejó de seleccionar el perro solicitado.',
);
requirePattern(
  'src/services/achievements.service.ts',
  /function achievementScopeKey\(userId: string, dogId: string \| null\)[\s\S]*\$\{userId\}:\$\{dogId \?\? 'all'\}/,
  'La caché de logros dejó de separar usuario y perro.',
);
requirePattern(
  'src/services/achievements.service.ts',
  /getAchievementsForDog[\s\S]*\.eq\('user_id', userId\)[\s\S]*\.eq\('dog_id', dogId\)/,
  'La consulta formal de logros dejó de filtrar por dog_id.',
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

// Aunque el programa de Luna no sea el primero, la próxima clase de Luna debe seleccionar Luna.
const nextClass = { enrollmentId: 'enrollment-luna' };
const selectedProgram = programs.find((item) => item.enrollmentId === nextClass.enrollmentId) ?? programs[0] ?? null;
if (selectedProgram?.dogId !== 'dog-luna') failures.push('Fixture multi-perro: Inicio eligió el programa del perro equivocado para la próxima clase.');

if (failures.length) {
  console.error('MULTI-DOG FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('MULTI-DOG OK: programas, logros y próxima clase permanecen aislados por perro.');
