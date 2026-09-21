import fs from 'node:fs';
import path from 'node:path';

const sqlRoot = path.join(process.cwd(), 'supabase', 'sql');
const files = fs.readdirSync(sqlRoot)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const failures = [];

for (const name of files) {
  const full = path.join(sqlRoot, name);
  const text = fs.readFileSync(full, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (/^\s*(?:as|do)\s+\$\s*$/i.test(line)) {
      failures.push(`${name}:${index + 1} usa un delimitador dollar-quote incompleto: ${line.trim()}`);
    }
    if (/^\s*\$;\s*$/.test(line)) {
      failures.push(`${name}:${index + 1} cierra un dollar-quote incompleto: ${line.trim()}`);
    }
  });
}

if (failures.length) {
  console.error('UCAPSA SQL SYNTAX SMOKE FAIL:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log(`UCAPSA SQL syntax smoke: PASS (${files.length} archivos SQL revisados).`);
