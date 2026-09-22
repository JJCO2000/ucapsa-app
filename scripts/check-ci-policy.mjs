import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const automaticTriggers = new Set(['push', 'pull_request', 'pull_request_target', 'workflow_run', 'repository_dispatch', 'schedule', 'issue_comment']);
const ignoredDirs = new Set(['.git', '.expo', '.next', 'node_modules', 'dist', 'dist-ci', 'coverage', 'build']);

function normalizeRel(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walkFiles(relDir, predicate = () => true) {
  const start = path.join(root, relDir);
  if (!fs.existsSync(start)) return [];
  const output = [];
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && predicate(full)) output.push(normalizeRel(full));
    }
  }
  return output.sort();
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

function parseOnEvents(source) {
  const lines = source.split(/\r?\n/);
  const onIndex = lines.findIndex((line) => /^\s*(?:"on"|'on'|on)\s*:\s*/.test(line) && (line.length - line.trimStart().length) === 0);
  if (onIndex < 0) return new Set();

  const inline = lines[onIndex].replace(/^\s*(?:"on"|'on'|on)\s*:\s*/, '').trim();
  if (inline) {
    if (inline.startsWith('[') && inline.endsWith(']')) {
      return new Set(inline.slice(1, -1).split(',').map((item) => stripQuotes(item)).filter(Boolean));
    }
    return new Set([stripQuotes(inline)]);
  }

  const candidates = [];
  for (let index = onIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break;
    candidates.push({ line, indent });
  }
  if (candidates.length === 0) return new Set();

  const minIndent = Math.min(...candidates.map(({ indent }) => indent));
  const events = new Set();
  for (const { line, indent } of candidates) {
    if (indent !== minIndent) continue;
    const trimmed = line.trim();
    const listMatch = /^-\s*([^:#\s]+)\s*$/.exec(trimmed);
    const keyMatch = /^([^:#\s]+)\s*:/.exec(trimmed);
    const value = listMatch?.[1] ?? keyMatch?.[1];
    if (value) events.add(stripQuotes(value));
  }
  return events;
}

function extractRunBlocks(source) {
  const lines = source.split(/\r?\n/);
  const runs = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)(?:-\s*)?run\s*:\s*(.*)$/.exec(lines[index]);
    if (!match) continue;
    const indent = match[1].length;
    const inline = match[2].trim();
    if (inline && !['|', '>', '|-', '>-'].includes(inline)) {
      runs.push(stripQuotes(inline));
      continue;
    }
    const block = [];
    let last = index;
    for (let child = index + 1; child < lines.length; child += 1) {
      const line = lines[child];
      if (!line.trim()) {
        block.push('');
        last = child;
        continue;
      }
      const childIndent = line.length - line.trimStart().length;
      if (childIndent <= indent) break;
      block.push(line.trimStart());
      last = child;
    }
    index = last;
    runs.push(block.join('\n'));
  }
  return runs;
}

function extractUses(source) {
  const uses = [];
  const regex = /^\s*(?:-\s*)?uses\s*:\s*['"]?([^'"\s#]+)['"]?/gmi;
  let match;
  while ((match = regex.exec(source)) !== null) uses.push(match[1]);
  return uses;
}

function stripShellComment(line) {
  if (/^\s*(?:REM\b|::)/i.test(line)) return '';
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '#') return line.slice(0, index);
  }
  return line;
}

function splitShellSegments(source) {
  const segments = [];
  let current = '';
  let quote = null;
  let escaped = false;
  function flush() {
    const cleaned = stripShellComment(current).trim();
    if (cleaned) segments.push(cleaned);
    current = '';
  }
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '\n' || char === ';' || (char === '&' && next === '&') || char === '|') {
      flush();
      if ((char === '&' && next === '&') || (char === '|' && next === '|')) index += 1;
      continue;
    }
    current += char;
  }
  flush();
  return segments;
}

function normalizeShellSegment(segment) {
  let value = segment.trim();
  value = value.replace(/^(?:then|do|else)\s+/i, '');
  value = value.replace(/^(?:if|while|until)\s+/i, '');
  value = value.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*/, '');
  value = value.replace(/^env\s+(?:(?:-i|--ignore-environment)\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*/i, '');
  value = value.replace(/^sudo\s+/, '');
  return value.trim();
}

const directRules = [
  ['eas update/build/submit/workflow', /^(?:(?:npx|bunx)\s+|(?:pnpm|yarn)\s+(?:dlx|exec)\s+|npm\s+exec\s+(?:--\s+)?)?(?:eas|eas-cli)(?:\s+--)?\s+(?:update|build|submit|workflow(?::run|\s+run)?)\b/i],
  ['expo upload', /^(?:(?:npx|bunx)\s+|(?:pnpm|yarn)\s+(?:dlx|exec)\s+|npm\s+exec\s+(?:--\s+)?)?expo(?:\s+--)?\s+upload\b/i],
  ['gradlew bundle', /^(?:\.\/)?gradlew(?:\.bat)?\s+bundle\w*\b/i],
  ['gh workflow run', /^gh\s+workflow\s+run\b/i],
  ['GitHub dispatch API', /^gh\s+api\b.*(?:actions\/workflows\/.+\/dispatches|repos\/.+\/dispatches)\b/i],
  ['GitHub dispatch HTTP call', /^(?:curl|wget)\b.*(?:actions\/workflows\/.+\/dispatches|repos\/.+\/dispatches)\b/i],
];

function detectExecutableShell(source) {
  const labels = new Set();
  for (const raw of splitShellSegments(source)) {
    const segment = normalizeShellSegment(raw);
    if (!segment || /^(?:echo|printf|Write-(?:Host|Output)|console\.log)\b/i.test(segment)) continue;
    for (const [label, pattern] of directRules) if (pattern.test(segment)) labels.add(label);
    const wrapped = segment.match(/^(?:bash|sh|zsh|cmd(?:\.exe)?|powershell|pwsh)\s+.*?(?:-c|-command)\s+(.+)$/i);
    if (wrapped) {
      const nested = wrapped[1].replace(/^['"]|['"]$/g, '');
      for (const label of detectExecutableShell(nested)) labels.add(label);
    }
  }
  return [...labels];
}

function stripJsComments(source) {
  let out = '';
  let state = 'code';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'line') {
      if (char === '\n') {
        state = 'code';
        out += char;
      } else out += ' ';
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') {
        out += '  ';
        index += 1;
        state = 'code';
      } else out += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (state === 'string') {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) state = 'code';
      continue;
    }
    if (char === '/' && next === '/') {
      out += '  ';
      index += 1;
      state = 'line';
      continue;
    }
    if (char === '/' && next === '*') {
      out += '  ';
      index += 1;
      state = 'block';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      state = 'string';
      quote = char;
    }
    out += char;
  }
  return out;
}

function runnerProvider(source) {
  return /(?:from\s*['"](?:node:)?child_process['"]|require\(\s*['"](?:node:)?child_process['"]\s*\)|from\s*['"](?:execa|shelljs|cross-spawn|zx)['"]|require\(\s*['"](?:execa|shelljs|cross-spawn|zx)['"]\s*\)|\bBun\.spawn|\bnew\s+Deno\.Command)/i.test(source);
}

function extractStringLiterals(source) {
  const values = [];
  const regex = /(['"`])([^'"`\n${}]*)\1/g;
  let match;
  while ((match = regex.exec(source)) !== null) values.push(match[2]);
  return values;
}

function detectExecutableJavaScript(source) {
  const clean = stripJsComments(source);
  if (!runnerProvider(clean)) return [];
  const labels = new Set();
  const constants = new Map();
  const constantPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`\n${}]*)\2/g;
  let match;
  while ((match = constantPattern.exec(clean)) !== null) constants.set(match[1], match[3]);

  const calls = /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync|execa|execaSync|execaCommand|execaCommandSync|shelljs\.exec|shell\.exec|crossSpawn|spawnCommand|[A-Za-z_$][\w$]*\.(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)|Bun\.spawn(?:Sync)?|new\s+Deno\.Command)\s*\(/g;
  while ((match = calls.exec(clean)) !== null) {
    const slice = clean.slice(match.index, Math.min(clean.length, match.index + 1200));
    const literal = slice.match(/\(\s*(['"`])([^'"`\n${}]*)\1/);
    const argv = slice.match(/\(\s*(['"`])([^'"`\n${}]*)\1\s*,\s*\[([\s\S]{0,650}?)\]/);
    const variable = slice.match(/\(\s*([A-Za-z_$][\w$]*)\b/);

    if (argv) {
      const command = [argv[2], ...extractStringLiterals(argv[3])].join(' ');
      for (const label of detectExecutableShell(command)) labels.add(label);
    } else if (literal) {
      for (const label of detectExecutableShell(literal[2])) labels.add(label);
    } else if (variable && constants.has(variable[1])) {
      for (const label of detectExecutableShell(constants.get(variable[1]))) labels.add(label);
    } else if (variable) {
      labels.add(`dynamic process runner (${variable[1]})`);
    }
  }

  if (/from\s*['"]zx['"]|require\(\s*['"]zx['"]\s*\)/.test(clean)) {
    for (const tagged of clean.matchAll(/\$\s*`([^`\n${}]*)`/g)) {
      for (const label of detectExecutableShell(tagged[1])) labels.add(label);
    }
  }
  return [...labels];
}

function isAuthorizedPreviewCommentWorkflow(rel, source, events) {
  if (rel !== '.github/workflows/publish-preview.yml') return false;
  if (!events.has('workflow_dispatch') || !events.has('issue_comment')) return false;
  if ([...events].some((event) => !['workflow_dispatch', 'issue_comment'].includes(event))) return false;

  const required = [
    "github.event_name == 'issue_comment'",
    "github.event.action == 'created'",
    'github.event.issue.number == 28',
    "github.event.comment.user.login == 'JJCO2000'",
    "github.actor == 'JJCO2000'",
    "github.event.comment.body == '/publish-preview'",
    'ref: main',
    'persist-credentials: false',
    'environment:',
    'name: preview',
    'eas update --channel preview --platform android',
  ];

  return required.every((token) => source.includes(token));
}

function isAuthorizedProductionAabCommentWorkflow(rel, source, events) {
  if (rel !== '.github/workflows/build-production-aab.yml') return false;
  if (!events.has('workflow_dispatch') || !events.has('issue_comment')) return false;
  if ([...events].some((event) => !['workflow_dispatch', 'issue_comment'].includes(event))) return false;

  const required = [
    "github.event_name == 'issue_comment'",
    "github.event.action == 'created'",
    'github.event.issue.number == 260',
    "github.event.comment.user.login == 'JJCO2000'",
    "github.actor == 'JJCO2000'",
    "github.event.comment.body == '/build-production-aab'",
    'ref: main',
    'persist-credentials: false',
    'environment:',
    'name: production',
    'eas build --platform android --profile production --non-interactive --wait',
  ];

  return required.every((token) => source.includes(token));
}

function inspectWorkflow(rel) {
  const source = read(rel);
  const events = parseOnEvents(source);
  const automatic = [...events].filter((event) => automaticTriggers.has(event));
  const authorizedPreviewComment = isAuthorizedPreviewCommentWorkflow(rel, source, events);
  const authorizedProductionAabComment = isAuthorizedProductionAabCommentWorkflow(rel, source, events);
  const authorizedManualComment = authorizedPreviewComment || authorizedProductionAabComment;
  const disallowedAutomatic = automatic.filter(
    (event) => event !== 'issue_comment' || !authorizedManualComment,
  );
  const commands = new Set();
  for (const run of extractRunBlocks(source)) for (const label of detectExecutableShell(run)) commands.add(label);

  if (commands.size > 0 && (disallowedAutomatic.length > 0 || (!events.has('workflow_dispatch') && !authorizedManualComment))) {
    failures.push(`${rel}: comandos de publicacion/build/dispatch (${[...commands].join(', ')}) requieren workflow_dispatch o la excepcion exacta /publish-preview autorizada.`);
  }

  const uses = extractUses(source);
  for (const value of uses) {
    if (value.startsWith('./')) continue;
    if (!/@[0-9a-f]{40}$/i.test(value)) {
      failures.push(`${rel}: action externa sin pin SHA inmutable (${value}).`);
    }
  }

  if (/eas-version:\s*latest\b/i.test(source)) {
    failures.push(`${rel}: EAS CLI no puede usar latest en un workflow con secretos.`);
  }

  if (commands.has('eas update/build/submit/workflow')) {
    if (!source.includes("github.actor == 'JJCO2000'")) {
      failures.push(`${rel}: workflow EAS con secretos debe restringirse al actor JJCO2000.`);
    }
    if (rel === '.github/workflows/build-production-aab.yml') {
      if (!/environment:\s*\n\s*name:\s*production\b/i.test(source)) {
        failures.push(`${rel}: workflow AAB Production debe usar el environment protegido production.`);
      }
    } else if (!/environment:\s*\n\s*name:\s*preview\b/i.test(source)) {
      failures.push(`${rel}: workflow EAS Preview debe usar el environment protegido preview.`);
    }
  }

  const runText = extractRunBlocks(source).join('\n');
  if (/\beas(?:-cli)?\s+submit\b/i.test(runText) || /\bgradlew(?:\.bat)?\s+bundle\w*\b/i.test(runText)) {
    failures.push(`${rel}: submit directo y gradle bundle local permanecen prohibidos; el AAB Production sólo se genera mediante el workflow manual autorizado.`);
  }

  if (/\beas(?:-cli)?\s+build\b/i.test(runText)) {
    if (rel === '.github/workflows/build-preview-android.yml') {
      for (const token of [
        "github.ref == 'refs/heads/main'",
        "github.actor == 'JJCO2000'",
        '--platform android',
        '--profile preview',
        '--non-interactive',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${rel}: contrato Build Preview incompleto: ${token}`);
        }
      }
    } else if (rel === '.github/workflows/build-production-aab.yml') {
      for (const token of [
        "github.ref == 'refs/heads/main'",
        "github.actor == 'JJCO2000'",
        '--platform android',
        '--profile production',
        '--non-interactive',
        '--wait',
        'name: production',
      ]) {
        if (!source.includes(token)) {
          failures.push(`${rel}: contrato AAB Production incompleto: ${token}`);
        }
      }
    } else {
      failures.push(`${rel}: EAS Build sólo puede existir en los workflows manuales Android autorizados.`);
    }
  }

  if (/\beas(?:-cli)?\s+update\b/i.test(runText)) {
    if (rel !== '.github/workflows/publish-preview.yml') {
      failures.push(`${rel}: EAS Update solo puede existir en publish-preview.yml.`);
    }
    for (const token of [
      'eas-version: 20.3.0',
      '--channel preview',
      '--platform android',
      '--environment preview',
      '--non-interactive',
    ]) {
      if (!source.includes(token)) {
        failures.push(`${rel}: contrato OTA Preview incompleto: ${token}`);
      }
    }
  }

  const reusable = uses.filter((value) => value.includes('.github/workflows/'));
  if (disallowedAutomatic.length > 0 && reusable.length > 0) {
    failures.push(`${rel}: workflow automatico (${disallowedAutomatic.join(', ')}) encadena workflow reutilizable (${reusable.join(', ')}).`);
  }
}

function inspectEasWorkflow(rel) {
  const events = parseOnEvents(read(rel));
  const automatic = [...events].filter((event) => automaticTriggers.has(event));
  if (automatic.length > 0) failures.push(`${rel}: EAS Workflow automatico detectado (${automatic.join(', ')}).`);
}

function runSelfTests() {
  assert.deepEqual(detectExecutableShell('# eas build --platform android\necho "EAS Update docs"'), []);
  assert(detectExecutableShell('eas update --channel preview').length > 0);
  assert(detectExecutableShell('npx eas build --platform android').length > 0);
  assert(detectExecutableShell('./gradlew bundleRelease').includes('gradlew bundle'));
  assert(detectExecutableShell('gh workflow run publish.yml').includes('gh workflow run'));
  assert(detectExecutableShell('bash -c "eas submit --platform android"').length > 0);

  assert.deepEqual(detectExecutableJavaScript('const note = "EAS Build"; console.log(note);'), []);
  assert(detectExecutableJavaScript("import { execSync } from 'node:child_process'; execSync('eas update --channel preview');").length > 0);
  assert(detectExecutableJavaScript("import { spawn } from 'node:child_process'; spawn('eas', ['build', '--platform', 'android']);").length > 0);
  assert(detectExecutableJavaScript("import { exec } from 'node:child_process'; const cmd = 'eas submit --platform android'; exec(cmd);").length > 0);
  assert(detectExecutableJavaScript("import { exec } from 'node:child_process'; exec(command);").some((label) => label.startsWith('dynamic process runner')));

  const auto = 'on:\n  push:\n    branches: [main]\njobs:\n  x:\n    steps:\n      - run: eas update --channel preview\n';
  const manual = 'on:\n  workflow_dispatch:\njobs:\n  x:\n    steps:\n      - run: eas update --channel preview\n';
  assert(parseOnEvents(auto).has('push'));
  assert(parseOnEvents(manual).has('workflow_dispatch'));

  const previewComment = `on:
  workflow_dispatch:
  issue_comment:
    types: [created]
jobs:
  publish:
    if: github.event_name == 'issue_comment' && github.event.action == 'created' && github.event.issue.number == 28 && github.event.comment.user.login == 'JJCO2000' && github.event.comment.body == '/publish-preview'
    environment:
      name: preview
    steps:
      - uses: actions/checkout@v5
        with:
          ref: main
          persist-credentials: false
      - run: eas update --channel preview --platform android
`;
  const previewCommentOwnerOnly = previewComment.replace(
    "github.event.comment.user.login == 'JJCO2000'",
    "github.event.comment.user.login == 'JJCO2000' && github.actor == 'JJCO2000'",
  );
  assert(isAuthorizedPreviewCommentWorkflow(
    '.github/workflows/publish-preview.yml',
    previewCommentOwnerOnly,
    parseOnEvents(previewCommentOwnerOnly),
  ));
  assert(!isAuthorizedPreviewCommentWorkflow('.github/workflows/other.yml', previewComment, parseOnEvents(previewComment)));
  const productionAabComment = `on:
  workflow_dispatch:
  issue_comment:
    types: [created]
jobs:
  build:
    if: github.event_name == 'issue_comment' && github.event.action == 'created' && github.event.issue.number == 260 && github.event.comment.user.login == 'JJCO2000' && github.actor == 'JJCO2000' && github.event.comment.body == '/build-production-aab'
    environment:
      name: production
    steps:
      - uses: actions/checkout@v5
        with:
          ref: main
          persist-credentials: false
      - run: eas build --platform android --profile production --non-interactive --wait
`;
  assert(isAuthorizedProductionAabCommentWorkflow(
    '.github/workflows/build-production-aab.yml',
    productionAabComment,
    parseOnEvents(productionAabComment),
  ));
  assert(!isAuthorizedProductionAabCommentWorkflow(
    '.github/workflows/other.yml',
    productionAabComment,
    parseOnEvents(productionAabComment),
  ));
  assert(detectExecutableShell(extractRunBlocks(auto)[0]).length > 0);
  assert(detectExecutableShell(extractRunBlocks(manual)[0]).length > 0);
  assert(extractUses('steps:\n  - uses: ./.github/actions/release').includes('./.github/actions/release'));
}

runSelfTests();

const easWorkflows = walkFiles('.eas/workflows', (file) => /\.ya?ml$/i.test(file));
for (const rel of easWorkflows) inspectEasWorkflow(rel);

const githubWorkflows = walkFiles('.github/workflows', (file) => /\.ya?ml$/i.test(file));
for (const rel of githubWorkflows) inspectWorkflow(rel);

const localActionYaml = walkFiles('.github/actions', (file) => /(?:action\.)?ya?ml$/i.test(file));
for (const rel of localActionYaml) {
  const commands = new Set();
  for (const run of extractRunBlocks(read(rel))) for (const label of detectExecutableShell(run)) commands.add(label);
  if (commands.size > 0) failures.push(`${rel}: una action local oculta comandos de publicacion/build/dispatch (${[...commands].join(', ')}). Mantener esas acciones visibles en un workflow manual.`);
}

const packageJson = JSON.parse(read('package.json'));
for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (typeof command !== 'string') continue;
  const matches = detectExecutableShell(command);
  if (matches.length > 0) failures.push(`package.json script "${name}": comando de publicacion/build/dispatch detectado (${matches.join(', ')}).`);
}

const shellFiles = walkFiles('.', (file) => /\.(?:sh|ps1|cmd|bat)$/i.test(file));
for (const rel of shellFiles) {
  const matches = detectExecutableShell(read(rel));
  if (matches.length > 0) failures.push(`${rel}: comando ejecutable de publicacion/build/dispatch detectado (${matches.join(', ')}).`);
}

const jsRoots = ['scripts', '.husky', '.github/actions'];
const jsFiles = new Set();
for (const relDir of jsRoots) for (const rel of walkFiles(relDir, (file) => /\.(?:mjs|cjs|js|ts)$/i.test(file))) jsFiles.add(rel);
for (const rel of jsFiles) {
  if (rel === 'scripts/check-ci-policy.mjs') continue;
  const matches = detectExecutableJavaScript(read(rel));
  if (matches.length > 0) failures.push(`${rel}: process runner peligroso o no auditable detectado (${matches.join(', ')}).`);
}

if (failures.length > 0) {
  console.error('CI POLICY FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`CI POLICY OK: ${easWorkflows.length} EAS workflow(s), ${githubWorkflows.length} GitHub workflow(s), ${localActionYaml.length} local action YAML(s), ${shellFiles.length} shell script(s) y ${jsFiles.size} JS/TS automation file(s) revisados.`);
