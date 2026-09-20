import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return extensions.has(path.extname(entry.name)) ? [full] : [];
  });
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim();
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function findCatchBlocks(text) {
  const results = [];
  const re = /catch\s*(?:\([^)]*\))?\s*\{/g;
  let match;
  while ((match = re.exec(text))) {
    const open = text.indexOf('{', match.index);
    let depth = 0;
    let end = -1;
    let quote = null;
    let escaped = false;

    for (let i = open; i < text.length; i += 1) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end < 0) continue;
    results.push({
      offset: match.index,
      line: lineNumber(text, match.index),
      body: text.slice(open + 1, end - 1),
    });
    re.lastIndex = end;
  }
  return results;
}


function findPromiseCatchHandlers(text) {
  const results = [];
  const re = /\.catch\s*\(/g;
  let match;

  while ((match = re.exec(text))) {
    const open = text.indexOf('(', match.index);
    let depth = 0;
    let end = -1;
    let quote = null;
    let escaped = false;

    for (let i = open; i < text.length; i += 1) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '(') depth += 1;
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end < 0) continue;
    results.push({
      offset: match.index,
      line: lineNumber(text, match.index),
      handler: text.slice(open + 1, end - 1),
    });
    re.lastIndex = end;
  }

  return results;
}

function classifyPromiseCatch(handler) {
  const code = stripComments(handler);
  if (!code) return 'PROMISE_EMPTY_REVIEW';

  if (/devWarn|reportClientDiagnostic|capture|track|console\.(?:warn|error)/i.test(code)) {
    return 'PROMISE_DIAGNOSTIC';
  }
  if (/\bthrow\b/.test(code)) return 'PROMISE_RETHROW';
  if (/Alert\.|toast|Snackbar|showMessage|setError\s*\(|setFeedback\s*\(|setUsingSavedData\s*\(\s*true\s*\)|set[A-Z]\w*(?:Error|Notice|Warning|Message)\s*\(/i.test(code)) {
    return 'PROMISE_VISIBLE';
  }
  if (/\bisLikelyNetworkError\s*\(/.test(code)) return 'PROMISE_RETRY_POLICY';
  if (/\b(?:status|state)\s*:\s*['"](?:error|failed|pending|rejected|needs_confirmation)['"]/i.test(code)) {
    return 'PROMISE_EXPLICIT_STATE';
  }

  if (/=>\s*(?:undefined|void\s+0)\s*;?\s*$/.test(code)) return 'PROMISE_SILENT_REVIEW';
  if (/=>\s*null\s*;?\s*$/.test(code)) return 'PROMISE_NULL_FALLBACK_REVIEW';
  if (/=>\s*(?:false|true|\[\])\s*;?\s*$/.test(code)) return 'PROMISE_LITERAL_FALLBACK_REVIEW';

  return 'PROMISE_HANDLER_REVIEW';
}

function classify(body, rel) {
  const code = stripComments(body);
  if (!code) return 'COMMENT_ONLY_OR_EMPTY';

  const signals = {
    throws: /\bthrow\b/.test(code),
    returns: /\breturn\b/.test(code),
    visibleUi: /Alert\.|toast|Snackbar|showMessage|setError\s*\(|setFeedback\s*\(|setOfflineEmpty\s*\(\s*true\s*\)|setUsingSavedData\s*\(\s*true\s*\)|setIsOfflineFallback\s*\(\s*true\s*\)|setReminderLoadState\s*\(\s*['"]failed['"]\s*\)|set[A-Z]\w*(?:Error|Notice|Warning|Message)\s*\(/i.test(code),
    diagnostics: /devWarn|reportClientDiagnostic|capture|track|console\.(?:warn|error)/i.test(code),
    explicitState: /\b(?:status|state)\s*:\s*['"](?:error|failed|pending|rejected|needs_confirmation)['"]/i.test(code),
    retryPolicy: /\bisLikelyNetworkError\s*\(/.test(code),
    state: /\bset[A-Z]\w*\s*\(/.test(code),
    fallback: /\b(?:fallback|cached|cache|offline|default)\b/i.test(code),
  };

  if (signals.throws) return 'RETHROW';
  if (signals.visibleUi || signals.diagnostics) return 'VISIBLE_OR_DIAGNOSTIC';
  if (signals.explicitState) return 'EXPLICIT_STATE';
  if (signals.retryPolicy) return 'EXPLICIT_RETRY_POLICY';
  if (rel === 'src/services/payment-settings.service.ts' && /^return\s+false\s*;?$/.test(code)) return 'EXPECTED_VALIDATION_REJECTION';
  if (signals.returns && signals.fallback) return 'EXPLICIT_FALLBACK';
  if (signals.returns) return 'RETURN_ONLY_REVIEW';
  if (signals.state) return 'STATE_ONLY_REVIEW';
  return 'SILENT_REVIEW';
}

const findings = [];
const promiseFindings = [];
let filesScanned = 0;
let catches = 0;
let promiseCatches = 0;

for (const absolute of walk(sourceRoot)) {
  filesScanned += 1;
  const text = fs.readFileSync(absolute, 'utf8');
  const rel = path.relative(root, absolute).replaceAll('\\', '/');

  for (const block of findCatchBlocks(text)) {
    catches += 1;
    const kind = classify(block.body, rel);
    if ([
      'RETHROW',
      'VISIBLE_OR_DIAGNOSTIC',
      'EXPLICIT_STATE',
      'EXPLICIT_RETRY_POLICY',
      'EXPECTED_VALIDATION_REJECTION',
      'EXPLICIT_FALLBACK',
    ].includes(kind)) continue;

    const compact = block.body
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 260);

    findings.push({ file: rel, line: block.line, kind, body: compact });
  }

  for (const handler of findPromiseCatchHandlers(text)) {
    promiseCatches += 1;
    const kind = classifyPromiseCatch(handler.handler);
    if ([
      'PROMISE_DIAGNOSTIC',
      'PROMISE_RETHROW',
      'PROMISE_VISIBLE',
      'PROMISE_RETRY_POLICY',
      'PROMISE_EXPLICIT_STATE',
    ].includes(kind)) continue;

    const compact = handler.handler
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 260);

    promiseFindings.push({ file: rel, line: handler.line, kind, body: compact });
  }
}

console.log('SILENT CATCH AUDIT');
console.log(JSON.stringify({
  filesScanned,
  catches,
  reviewCount: findings.length,
  promiseCatches,
  promiseReviewCount: promiseFindings.length,
}, null, 2));

for (const item of findings) {
  console.log(`- ${item.kind} ${item.file}:${item.line} :: ${item.body || '(empty after comments)'}`);
}

for (const item of promiseFindings) {
  console.log(`- ${item.kind} ${item.file}:${item.line} :: ${item.body || '(empty after comments)'}`);
}

if (findings.length > 0) {
  console.error('SILENT CATCH AUDIT FAIL: cada catch debe relanzar, comunicar degradación, registrar diagnóstico o expresar fallback/estado/retry de forma explícita.');
  process.exit(1);
}

console.log('SILENT CATCH AUDIT PASS: todos los catch tienen una salida explícita o diagnóstica.');
