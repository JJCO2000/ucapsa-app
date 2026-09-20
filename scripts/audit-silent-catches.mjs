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

function classify(body) {
  const code = stripComments(body);
  if (!code) return 'COMMENT_ONLY_OR_EMPTY';

  const signals = {
    throws: /\bthrow\b/.test(code),
    returns: /\breturn\b/.test(code),
    visibleUi: /Alert\.|toast|Snackbar|showMessage|setFeedback\s*\(|setReminderLoadState\s*\(|setOfflineEmpty\s*\(|setUsingSavedData\s*\(|setIsOfflineFallback\s*\(|setError\s*\(|set[A-Z]\w*(?:Error|Notice|Warning|Message)\s*\(/i.test(code),
    diagnostics: /devWarn\s*\(|reportClientDiagnostic|capture|track|console\.(?:warn|error)/i.test(code),
    explicitState: /(?:state|status)\s*:\s*['"](?:pending|rejected|failed|error)['"]|setReminderLoadState\s*\(\s*['"]failed['"]\s*\)/i.test(code),
    state: /\bset[A-Z]\w*\s*\(/.test(code),
    fallback: /\b(?:fallback|cached|cache|offline|default|networkFailure|isLikelyNetworkError)\b/i.test(code),
  };

  if (signals.throws) return 'RETHROW';
  if (signals.visibleUi || signals.diagnostics || signals.explicitState) return 'VISIBLE_OR_DIAGNOSTIC';
  if (signals.returns && signals.fallback) return 'EXPLICIT_FALLBACK';
  if (signals.returns) return 'RETURN_ONLY_REVIEW';
  if (signals.state) return 'STATE_ONLY_REVIEW';
  return 'SILENT_REVIEW';
}

const findings = [];
let filesScanned = 0;
let catches = 0;

for (const absolute of walk(sourceRoot)) {
  filesScanned += 1;
  const text = fs.readFileSync(absolute, 'utf8');
  const rel = path.relative(root, absolute).replaceAll('\\', '/');

  for (const block of findCatchBlocks(text)) {
    catches += 1;
    const kind = classify(block.body);
    if (kind === 'RETHROW' || kind === 'VISIBLE_OR_DIAGNOSTIC' || kind === 'EXPLICIT_FALLBACK') continue;

    const compact = block.body
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 260);

    findings.push({ file: rel, line: block.line, kind, body: compact });
  }
}

console.log('SILENT CATCH AUDIT');
console.log(JSON.stringify({
  filesScanned,
  catches,
  reviewCount: findings.length,
}, null, 2));

for (const item of findings) {
  console.log(`- ${item.kind} ${item.file}:${item.line} :: ${item.body || '(empty after comments)'}`);
}
