import fs from 'node:fs';
import path from 'node:path';

const lockPath = path.join(process.cwd(), 'package-lock.json');
if (!fs.existsSync(lockPath)) {
  console.error('XMLDOM SECURITY FAIL: falta package-lock.json.');
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages ?? {};
const found = [];

function parse(version) {
  const match = String(version ?? '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function vulnerable(version) {
  const parsed = parse(version);
  if (!parsed) return true;

  const [major, minor, patch] = parsed;
  if (major !== 0) return false;
  if (minor < 8) return true;
  if (minor === 8) return patch < 15;
  if (minor === 9) return patch < 12;
  return false;
}

for (const [location, meta] of Object.entries(packages)) {
  if (!/(^|\/)node_modules\/@xmldom\/xmldom$/.test(location)) continue;
  found.push({ location, version: meta?.version });
}

if (!found.length) {
  console.error('XMLDOM SECURITY FAIL: @xmldom/xmldom no aparece en package-lock.json.');
  process.exit(1);
}

const bad = found.filter((item) => vulnerable(item.version));
if (bad.length) {
  console.error('XMLDOM SECURITY FAIL: versiones vulnerables o desconocidas en lockfile:');
  for (const item of bad) console.error(`- ${item.version ?? 'unknown'} @ ${item.location}`);
  process.exit(1);
}

console.log(`XMLDOM SECURITY OK: ${found.length} instalacion(es) revisadas; todas están en versiones corregidas.`);
for (const item of found) console.log(`- ${item.version} @ ${item.location}`);
