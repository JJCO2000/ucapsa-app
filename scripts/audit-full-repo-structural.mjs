import fs from 'node:fs';
import path from 'node:path';

const roots = [
  'src',
  'supabase/functions',
  'supabase/sql',
  'scripts',
  '.github/workflows',
];
const extensions = /\.(ts|tsx|js|jsx|mjs|sql|yml|yaml|json)$/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return extensions.test(entry.name) ? [full.replaceAll('\\', '/')] : [];
  });
}

const files = roots.flatMap(walk).sort();
const routeFiles = files.filter((file) => /^src\/app\/.*\.tsx?$/.test(file));
const serviceFiles = files.filter((file) => /^src\/services\/.*\.tsx?$/.test(file));

const findings = {
  todo: [],
  tsSuppressions: [],
  eslintDisable: [],
  console: [],
  emptyCatch: [],
  swallowedCatch: [],
  any: [],
  hexOutsideBrand: [],
  urls: [],
  localhost: [],
  mathRandom: [],
  legacyPoints: [],
  legacyDeletion: [],
  rawSupabaseInScreens: [],
  businessDeleteCalls: [],
  serviceComplexity: [],
  screenComplexity: [],
  routeRefsMissing: [],
};

const routeSet = new Set();
for (const file of routeFiles) {
  const rel = file.replace(/^src\/app/, '').replace(/\.(tsx?|jsx?)$/, '');
  const route = rel
    .replace(/\/index$/, '')
    .replace(/\/_layout$/, '')
    .replace(/\([^/]+\)\//g, '/');
  if (route && route !== '/') routeSet.add(route);
}

function lineNumbers(text, regex) {
  const out = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    regex.lastIndex = 0;
    if (regex.test(line)) out.push(index + 1);
  });
  return out.slice(0, 20);
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const rec = (bucket, regex) => {
    if (!regex.test(text)) return;
    findings[bucket].push({ file, lines: lineNumbers(text, regex) });
  };

  rec('todo', /\b(?:TODO|FIXME|HACK|XXX)\b/i);
  rec('tsSuppressions', /@ts-ignore|@ts-nocheck/i);
  rec('eslintDisable', /eslint-disable/i);
  rec('console', /\bconsole\.(?:log|warn|error|debug)\b/);
  rec('emptyCatch', /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\n\s*)?\}/m);
  rec('swallowedCatch', /catch\s*(?:\([^)]*\))?\s*\{[\s\S]{0,240}?(?:ignore|silenc|best effort|optional|fallback|continue)[\s\S]{0,240}?\}/i);
  rec('any', /\bas any\b|:\s*any\b|<any>/);
  if (file !== 'src/constants/brand.ts') rec('hexOutsideBrand', /#[0-9a-fA-F]{6,8}\b/);
  rec('urls', /https?:\/\/[^\s'")`]+/);
  rec('localhost', /localhost|127\.0\.0\.1/);
  rec('mathRandom', /\bMath\.random\s*\(/);
  rec('legacyPoints', /ucapsa-points\.service|Puntos UCAPSA|Perro del A[nñ]o/i);
  rec('legacyDeletion', /deletion_requested_at|deletion_request_reason/i);
  if (/^src\/app\//.test(file) && (/(?:from|require\()\s*['"][^'"]*lib\/supabase['"]/.test(text) || /\bsupabase\.(?:from|rpc|auth|storage)\b/.test(text) || /\bcreateClient\s*\(/.test(text))) {
    findings.rawSupabaseInScreens.push({ file });
  }
  if (/^src\/services\//.test(file) && /\.delete\(\)/.test(text)) {
    findings.businessDeleteCalls.push({ file, lines: lineNumbers(text, /\.delete\(\)/) });
  }

  if (/^src\/services\//.test(file)) {
    const exports = (text.match(/export\s+(?:async\s+)?function\s+/g) || []).length;
    const supabaseCalls = (text.match(/\bsupabase\.(?:from|rpc|auth|storage)\b/g) || []).length;
    if (lines.length >= 350 || exports >= 18 || supabaseCalls >= 25) {
      findings.serviceComplexity.push({ file, lineCount: lines.length, exportedFunctions: exports, supabaseCalls });
    }
  }

  if (/^src\/app\//.test(file)) {
    const states = (text.match(/\buseState\s*(?:<|\()/g) || []).length;
    const modals = (text.match(/<KeyboardAwareModal|<Modal\b/g) || []).length;
    const effects = (text.match(/\buseEffect\s*\(/g) || []).length + (text.match(/\buseFocusEffect\s*\(/g) || []).length;
    if (lines.length >= 650 || states >= 18 || modals >= 3) {
      findings.screenComplexity.push({ file, lineCount: lines.length, states, modals, effects });
    }

    const refs = [...text.matchAll(/(?:router\.(?:push|replace)|href=)\s*\(?\s*(?:`|'|")([^'"`?#]+)/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (!ref.startsWith('/')) continue;
      if (/\$\{/.test(ref)) continue;
      const normalized = ref.replace(/\?.*$/, '').replace(/\/$/, '') || '/';
      if (!routeSet.has(normalized) && normalized !== '/' && !normalized.includes('[')) {
        findings.routeRefsMissing.push({ file, route: normalized });
      }
    }
  }
}

for (const key of Object.keys(findings)) {
  if (Array.isArray(findings[key])) {
    findings[key] = findings[key]
      .sort((a,b) => String(a.file).localeCompare(String(b.file)))
      .slice(0, 200);
  }
}

const summary = {
  filesRead: files.length,
  bytesRead: files.reduce((sum, file) => sum + fs.statSync(file).size, 0),
  routeFiles: routeFiles.length,
  serviceFiles: serviceFiles.length,
  findingCounts: Object.fromEntries(Object.entries(findings).map(([k,v]) => [k, v.length])),
  findings,
};

console.log('=== UCAPSA_FULL_STRUCTURAL_AUDIT_BEGIN ===');
console.log(JSON.stringify(summary, null, 2));
console.log('=== UCAPSA_FULL_STRUCTURAL_AUDIT_END ===');
