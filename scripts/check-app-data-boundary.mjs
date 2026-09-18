import fs from 'node:fs';
import path from 'node:path';

const root = 'src/app';
const pkg = fs.readFileSync('package.json', 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : [];
  });
}

const violations = [];
for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8');
  if (
    /(?:from|require\()\s*['"][^'"]*lib\/supabase['"]/.test(text) ||
    /\bsupabase\.(?:from|rpc|auth|storage)\b/.test(text) ||
    /\bcreateClient\s*\(/.test(text)
  ) {
    violations.push(file);
  }
}

if (violations.length) {
  throw new Error(
    'App screen bypassed the service/data boundary:\n' + violations.map((file) => ' - ' + file).join('\n'),
  );
}

if (!pkg.includes('"check:app-data-boundary"')) {
  throw new Error('npm verify does not include the app data-boundary guard.');
}

console.log('UCAPSA app screens -> service/data boundary: PASS');
