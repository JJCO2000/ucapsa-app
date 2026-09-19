import fs from 'node:fs';

const floors = {
  'baseline-browser-mapping': '2.11.0',
  'browserslist': '4.28.7',
  'js-yaml': '4.3.2',
};

function parts(version) {
  return version.split('-')[0].split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function gte(actual, minimum) {
  const a = parts(actual);
  const b = parts(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

for (const [name, minimum] of Object.entries(floors)) {
  const file = `node_modules/${name}/package.json`;
  if (!fs.existsSync(file)) {
    throw new Error(`Security floor package missing: ${name}`);
  }
  const installed = JSON.parse(fs.readFileSync(file, 'utf8')).version;
  if (!gte(installed, minimum)) {
    throw new Error(`${name} is below security floor: installed ${installed}, required >= ${minimum}`);
  }
  console.log(`${name}: ${installed} (>= ${minimum})`);
}

console.log('UCAPSA compatible transitive security floors: PASS');
