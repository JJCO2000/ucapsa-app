import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = [
  'src',
  'supabase/functions',
  'supabase/sql',
  'scripts',
  '.github/workflows',
];
const rootFiles = ['app.json', 'package.json', 'tsconfig.json', 'eas.json'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.sql', '.yml', '.yaml', '.json']);
const self = 'scripts/audit-full-source.mjs';

function walk(rel) {
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [rel];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.posix.join(rel.replaceAll('\\', '/'), entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });
}

const files = [
  ...scanRoots.flatMap(walk),
  ...rootFiles.filter((file) => fs.existsSync(path.join(root, file))),
]
  .filter((file) => extensions.has(path.extname(file)))
  .filter((file, index, all) => all.indexOf(file) === index)
  .sort();

if (files.length === 0) {
  throw new Error('Full-source audit found zero code/config files.');
}

const critical = [];
const review = [];
let totalLines = 0;
let totalBytes = 0;

function addCritical(file, label) {
  critical.push({ file, label });
}

function addReview(file, label, count) {
  review.push({ file, label, count });
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

for (const file of files) {
  const absolute = path.join(root, file);
  const text = fs.readFileSync(absolute, 'utf8');
  totalBytes += Buffer.byteLength(text, 'utf8');
  totalLines += text.split(/\r?\n/).length;

  // Avoid the auditor matching its own pattern definitions.
  const enforceMeta = file !== self;

  if (enforceMeta) {
    const debtMarker = new RegExp('(?:\\/\\/|\\/\\*)\\s*(?:TO' + 'DO|FIX' + 'ME|HA' + 'CK|X' + 'XX)\\b');
    if (debtMarker.test(text)) addCritical(file, 'Marcador explícito de deuda en comentario.');
  }

  if (/@ts-(?:ignore|nocheck)\b/.test(text)) {
    addCritical(file, 'Supresión global/local de TypeScript.');
  }

  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/m.test(text)) {
    addCritical(file, 'catch vacío que silencia el error sin evidencia.');
  }

  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(text)) {
    addCritical(file, 'Ejecución dinámica eval/new Function.');
  }

  if (file.startsWith('src/') && /SUPABASE_SERVICE_ROLE_KEY/.test(text)) {
    addCritical(file, 'Service role secret referenciado en código cliente.');
  }

  if (file.startsWith('src/app/') && (
    /lib\/supabase/.test(text) ||
    /\bsupabase\.(?:from|rpc|auth|storage)\b/.test(text) ||
    /\bcreateClient\s*\(/.test(text)
  )) {
    addCritical(file, 'Pantalla salta la frontera de servicios y toca Supabase directamente.');
  }

  if (file === self) continue;

  const anyCasts = countMatches(text, /\bas\s+any\b|:\s*any\b/g);
  if (anyCasts) addReview(file, 'Uso de any', anyCasts);

  const consoles = countMatches(text, /\bconsole\.(?:log|warn|error|debug)\s*\(/g);
  if (consoles) addReview(file, 'Console call', consoles);

  const clientDeletes = file.startsWith('src/') ? countMatches(text, /\.delete\s*\(\s*\)/g) : 0;
  if (clientDeletes) addReview(file, 'DELETE desde código cliente/servicio', clientDeletes);

  const rawDeletes = file.endsWith('.sql') ? countMatches(text, /\bdelete\s+from\s+public\./gi) : 0;
  if (rawDeletes) addReview(file, 'DELETE físico SQL', rawDeletes);

  const randomCalls = countMatches(text, /\bMath\.random\s*\(/g);
  if (randomCalls) addReview(file, 'Math.random()', randomCalls);

  const insecureHttp = file.startsWith('src/')
    ? countMatches(text, /http:\/\/(?!localhost|127\.0\.0\.1)/g)
    : 0;
  if (insecureHttp) addReview(file, 'URL http no local', insecureHttp);
}

const categoryCounts = files.reduce((acc, file) => {
  const category =
    file.startsWith('src/') ? 'src' :
    file.startsWith('supabase/functions/') ? 'edge-functions' :
    file.startsWith('supabase/sql/') ? 'sql' :
    file.startsWith('scripts/') ? 'scripts' :
    file.startsWith('.github/workflows/') ? 'workflows' :
    'root-config';
  acc[category] = (acc[category] ?? 0) + 1;
  return acc;
}, {});

console.log('FULL SOURCE AUDIT COVERAGE');
console.log(JSON.stringify({
  files: files.length,
  lines: totalLines,
  bytes: totalBytes,
  categories: categoryCounts,
  reviewFindings: review.length,
}, null, 2));

if (review.length) {
  console.log('FULL SOURCE AUDIT REVIEW FINDINGS');
  for (const item of review) {
    console.log(`- ${item.file}: ${item.label} x${item.count}`);
  }
}

if (critical.length) {
  console.error('FULL SOURCE AUDIT CRITICAL FAIL');
  for (const item of critical) {
    console.error(`- ${item.file}: ${item.label}`);
  }
  process.exit(1);
}

console.log('FULL SOURCE AUDIT CRITICAL: PASS');
