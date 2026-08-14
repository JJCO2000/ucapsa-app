import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const lockPath = path.join(root, 'package-lock.json');
if (!fs.existsSync(lockPath)) {
  console.error('NANOID SECURITY FAIL: falta package-lock.json.');
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages ?? {};
const found = [];

function parse(version) {
  const m = String(version ?? '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1).map(Number) : null;
}
function cmp(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}
function vulnerable(version) {
  const v = parse(version);
  if (!v) return true;
  const v3311 = [3, 3, 11];
  const v400 = [4, 0, 0];
  const v5110 = [5, 1, 10];
  if (v[0] <= 3 && cmp(v, v3311) <= 0) return true;
  if (cmp(v, v400) >= 0 && cmp(v, v5110) <= 0) return true;
  return false;
}

for (const [location, meta] of Object.entries(packages)) {
  if (!/(^|\/)node_modules\/nanoid$/.test(location)) continue;
  const version = meta?.version;
  found.push({ location, version });
}

if (!found.length) {
  console.log('NANOID SECURITY OK: nanoid no aparece en package-lock.json.');
  process.exit(0);
}

const bad = found.filter((item) => vulnerable(item.version));
if (bad.length) {
  console.error('NANOID SECURITY FAIL: versiones vulnerables en lockfile:');
  for (const item of bad) console.error(`- ${item.version ?? 'unknown'} @ ${item.location}`);
  process.exit(1);
}

console.log(`NANOID SECURITY OK: ${found.length} instalacion(es) revisadas; ninguna en rangos vulnerables.`);
for (const item of found) console.log(`- ${item.version} @ ${item.location}`);
