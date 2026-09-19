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
const clientDiagnostics = 'src/lib/client-diagnostics.ts';

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

const safeRawDeleteCounts = new Map();

function registerSafeRawDeleteContract(file, expectedCount, checks) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    addCritical(file, 'Contrato de DELETE transitorio perdió su archivo canónico.');
    return;
  }

  const text = fs.readFileSync(absolute, 'utf8');
  const deleteCount = countMatches(text, /\bdelete\s+from\s+public\./gi);
  if (deleteCount !== expectedCount) {
    addCritical(file, `Contrato de DELETE transitorio esperaba ${expectedCount} DELETE físico(s) y encontró ${deleteCount}.`);
    return;
  }

  for (const check of checks) {
    const sourceFile = check.file ?? file;
    const sourcePath = path.join(root, sourceFile);
    if (!fs.existsSync(sourcePath)) {
      addCritical(sourceFile, 'Protección requerida para DELETE transitorio perdió su archivo.');
      continue;
    }
    const source = fs.readFileSync(sourcePath, 'utf8');
    if (!check.pattern.test(source)) {
      addCritical(sourceFile, check.label);
    }
  }

  safeRawDeleteCounts.set(file, expectedCount);
}

registerSafeRawDeleteContract(
  'supabase/sql/ucapsa-rango-1-exam-admin-rpcs.sql',
  2,
  [
    {
      file: 'supabase/sql/ucapsa-rango-1-foundation.sql',
      pattern: /references\s+public\.ucapsa_exam_items\(id\)\s+on\s+delete\s+restrict/i,
      label: 'Resultados de examen perdieron ON DELETE RESTRICT hacia exam_items.',
    },
    {
      file: 'supabase/sql/ucapsa-rango-1-exam-derivations.sql',
      pattern: /v_exam_status\s+is\s+distinct\s+from\s+'draft'[\s\S]{0,500}a\.status\s+in\s*\('reviewed',\s*'published',\s*'voided'\)/i,
      label: 'Estructura de examen dejó de congelarse al publicar o perdió protección de intentos voided.',
    },
    {
      pattern: /admin_delete_ucapsa_exam_item[\s\S]{0,1800}v_exam_status\s+is\s+distinct\s+from\s+'draft'[\s\S]{0,500}delete\s+from\s+public\.ucapsa_exam_items/i,
      label: 'Eliminar ejercicios dejó de estar limitado a exámenes draft.',
    },
    {
      file: 'supabase/sql/ucapsa-rango-1-exam-derivations.sql',
      pattern: /if\s+tg_op\s*=\s*'DELETE'\s+and\s+v_has_locked_attempt[\s\S]{0,260}No se pueden eliminar ejercicios/i,
      label: 'Eliminar ejercicios dejó de bloquearse cuando existe historia reviewed/published/voided.',
    },
    {
      pattern: /if\s+v_attempt\.status\s*<>\s*'draft'[\s\S]{0,260}delete\s+from\s+public\.ucapsa_exam_item_results/i,
      label: 'Eliminar resultados dejó de estar limitado a intentos draft.',
    },
    {
      pattern: /ucapsa_exam_result\.delete[\s\S]{0,220}ucapsa_exam_admin_audit|ucapsa_exam_admin_audit[\s\S]{0,220}ucapsa_exam_result\.delete/i,
      label: 'Eliminar resultado draft perdió auditoría administrativa.',
    },
  ],
);

const importRowSafetyChecks = [
  {
    file: 'supabase/sql/ucapsa-rango-1-exam-excel-import.sql',
    pattern: /if\s+v_status\s+not\s+in\s*\('draft','validated'\)[\s\S]{0,220}Las filas de un lote/i,
    label: 'Staging de importación dejó de limitar mutaciones a draft/validated.',
  },
  {
    file: 'supabase/sql/ucapsa-rango-1-exam-excel-import.sql',
    pattern: /before\s+insert\s+or\s+update\s+or\s+delete\s+on\s+public\.ucapsa_exam_import_rows[\s\S]{0,160}ucapsa_guard_exam_import_row_state/i,
    label: 'Staging de importación perdió el trigger que protege su ciclo de vida.',
  },
];

registerSafeRawDeleteContract(
  'supabase/sql/ucapsa-rango-1-exam-excel-import.sql',
  1,
  importRowSafetyChecks,
);

registerSafeRawDeleteContract(
  'supabase/sql/ucapsa-rango-1-exam-import-dog-resolution-hardening.sql',
  1,
  importRowSafetyChecks,
);

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

  if (file.startsWith('src/') && file !== clientDiagnostics &&
      /\bconsole\.(?:log|warn|error|debug)\s*\(/.test(text)) {
    addCritical(file, 'Console runtime fuera del diagnóstico cliente centralizado.');
  }

  if (file === clientDiagnostics) {
    const devOnlyGuards = countMatches(text, /if\s*\(\s*!__DEV__\s*\)\s*return\s*;/g);
    if (devOnlyGuards < 1) {
      addCritical(file, 'Diagnóstico cliente perdió su guarda __DEV__.');
    }
    if (!/sanitizeDiagnostic\s*\(/.test(text)) {
      addCritical(file, 'Diagnóstico cliente perdió sanitización de detalles.');
    }
  }

  if (file === self) continue;

  const runtimeCode = file.startsWith('src/') || file.startsWith('supabase/functions/');

  const anyCasts = runtimeCode ? countMatches(text, /\bas\s+any\b|:\s*any\b/g) : 0;
  if (anyCasts) addReview(file, 'Uso de any', anyCasts);

  const consoles = (file.startsWith('supabase/functions/') || (file.startsWith('src/') && file !== clientDiagnostics))
    ? countMatches(text, /\bconsole\.(?:log|warn|error|debug)\s*\(/g)
    : 0;
  if (consoles) addReview(file, 'Console call', consoles);

  const clientDeletes = file.startsWith('src/') ? countMatches(text, /\.delete\s*\(\s*\)/g) : 0;
  if (clientDeletes) addReview(file, 'DELETE desde código cliente/servicio', clientDeletes);

  const rawDeletes = file.endsWith('.sql') ? countMatches(text, /\bdelete\s+from\s+public\./gi) : 0;
  const safeRawDeletes = safeRawDeleteCounts.get(file) ?? 0;
  if (rawDeletes > safeRawDeletes) {
    addReview(file, 'DELETE físico SQL', rawDeletes - safeRawDeletes);
  }

  const randomCalls = runtimeCode ? countMatches(text, /\bMath\.random\s*\(/g) : 0;
  if (randomCalls) addReview(file, 'Math.random()', randomCalls);

  const httpScanText = text
    // OOXML relationship namespaces are identifiers, not outbound network URLs.
    .replaceAll('http://schemas.openxmlformats.org/', 'urn:ooxml:');
  const insecureHttp = file.startsWith('src/')
    ? countMatches(httpScanText, /http:\/\/(?!localhost|127\.0\.0\.1)/g)
    : 0;
  if (insecureHttp) addReview(file, 'URL http no local', insecureHttp);
}

const sourceFiles = files.filter((file) => file.startsWith('src/') && /\.(ts|tsx|js|jsx)$/.test(file));
const sourceSet = new Set(sourceFiles);
const imported = new Set();

function resolveImport(fromFile, specifier) {
  const base = specifier.startsWith('@/')
    ? path.posix.normalize(path.posix.join('src', specifier.slice(2)))
    : specifier.startsWith('.')
      ? path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier))
      : null;

  if (!base) return null;

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.posix.join(base, 'index.ts'),
    path.posix.join(base, 'index.tsx'),
    path.posix.join(base, 'index.js'),
    path.posix.join(base, 'index.jsx'),
  ];
  return candidates.find((candidate) => sourceSet.has(candidate)) ?? null;
}

for (const file of sourceFiles) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const importPatterns = [
    /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of importPatterns) {
    for (const match of text.matchAll(pattern)) {
      const target = resolveImport(file, match[1]);
      if (target) imported.add(target);
    }
  }
}

const orphanCandidates = sourceFiles
  .filter((file) => /^(src\/(?:services|components|hooks|utils|screens)\/)/.test(file))
  .filter((file) => !/\.d\.ts$/.test(file))
  .filter((file) => !imported.has(file))
  .sort();

for (const file of orphanCandidates) {
  addCritical(file, 'Módulo huérfano sin importador interno detectado.');
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
  orphanCandidates: orphanCandidates.length,
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
