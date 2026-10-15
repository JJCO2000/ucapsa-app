import fs from 'node:fs';
import assert from 'node:assert/strict';

// SDK 57 / RN 0.86: baseline que pasó doctor, Android e iOS en main
// (GitHub Actions 38498450205). Cambios de paquetes requieren una
// actualización deliberada y nueva validación, no un fallo por deriva
// del catálogo remoto de parches de Expo.
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const validated = {
  'expo': '57.0.28',
  '@expo/ui': '57.0.23',
  'expo-constants': '57.0.21',
  'expo-linking': '57.0.12',
  'expo-notifications': '57.0.22',
  'expo-router': '57.0.26',
  'react-native': '0.86.3',
};
for (const [name, version] of Object.entries(validated)) {
  assert.equal(lock.packages?.[`node_modules/${name}`]?.version, version,
    `Cambió ${name}: revisar compatibilidad con Expo SDK 57 y actualizar baseline.`);
  assert.equal(lock.packages?.['']?.dependencies?.[name], pkg.dependencies?.[name],
    `Manifiesto y lock de ${name} no coinciden.`);
}
assert.equal(lock.lockfileVersion, 3, 'Revisar cambio de versión del lockfile.');
console.log('UCAPSA Expo SDK 57 baseline validado: PASS (7 paquetes, lockfile reproducible)');
