import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Production Android source maps record the modules Metro actually bundled.
// This guard is intentionally fail-closed if maps are absent/unreadable.
// They are generated only in CI; never publish source maps or Atlas exports.
const dir = path.resolve(process.argv[2] || 'dist-ci-android');

function findMaps(folder) {
  if (!fs.existsSync(folder)) throw new Error(`Falta la exportación Android: ${folder}`);
  const result = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const absolute = path.join(folder, entry.name);
    if (entry.isDirectory()) result.push(...findMaps(absolute));
    else if (entry.isFile() && absolute.endsWith('.map')) result.push(absolute);
  }
  return result;
}

const maps = findMaps(dir);
assert.ok(maps.length > 0, 'No hay source maps Android; no podemos verificar aislamiento web.');

const allModules = new Set();
for (const mapFile of maps) {
  const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  assert.ok(Array.isArray(map.sources), `Mapa inválido: ${mapFile}`);
  for (const source of map.sources) {
    if (typeof source === 'string') allModules.add(source.replaceAll('\\', '/'));
  }
}

const sources = [...allModules];
assert.ok(sources.length > 0, 'Source maps vacíos: no se pudo auditar el bundle.');
// Third-party modules (for example react-native-reanimated) can bundle helper files
// named .web.ts without originating from UCAPSA's web application. Audit our
// first-party tree separately rather than weakening the exclusion requirement.
const firstParty = sources.filter((source) =>
  !source.includes('/node_modules/') && /(?:^|\/)src\//.test(source)
);
const unintendedWeb = firstParty.filter((source) => /\.web\.[cm]?[jt]sx?(?:\?|$)/i.test(source));
assert.deepEqual(unintendedWeb, [], 'El paquete Android está importando módulos web propios de UCAPSA.');

const mobileRouter = sources.some((source) =>
  /(?:^|\/)src\/app\/\(tabs\)\/_layout\.tsx(?:\?|$)/.test(source)
);
assert.ok(mobileRouter, 'No se encontró el layout móvil en el bundle Android; revisar resolución Metro.');

console.log(
  `ANDROID WEB ISOLATION PASS: ${sources.length} módulos totales, ${firstParty.length} propios; ` +
  '0 módulos .web.* y navegación nativa comprobada.'
);
