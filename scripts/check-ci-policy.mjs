import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const automaticTriggers = new Set([
  'push',
  'pull_request',
  'pull_request_target',
  'workflow_run',
  'repository_dispatch',
  'schedule',
]);

const allowedManualOrReusableTriggers = new Set(['workflow_dispatch', 'workflow_call']);

const ignoredDirs = new Set([
  '.git',
  '.expo',
  '.next',
  'node_modules',
  'dist',
  'dist-ci',
  'coverage',
  'build',
]);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function normalizeRel(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function listFilesRecursive(relDir, predicate = () => true) {
  const start = path.join(root, relDir);
  if (!fs.existsSync(start)) return [];
  const output = [];
  const stack = [start];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && predicate(full)) output.push(normalizeRel(full));
    }
  }

  return output.sort();
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseOnEvents(source) {
  const lines = source.split(/\r?\n/);
  const onIndex = lines.findIndex((line) => /^on\s*:\s*/.test(line));
  if (onIndex < 0) return new Set();

  const inline = lines[onIndex].replace(/^on\s*:\s*/, '').trim();
  if (inline) {
    if (inline.startsWith('[') && inline.endsWith(']')) {
      return new Set(inline.slice(1, -1).split(',').map((item) => stripQuotes(item)).filter(Boolean));
    }
    return new Set([stripQuotes(inline)]);
  }

  const block = [];
  for (let index = onIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) {
      block.push(line);
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break;
    block.push(line);
  }

  const candidates = block
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'))
    .map((line) => ({ line, indent: line.length - line.trimStart().length }));
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
    const match = /^(\s*)run\s*:\s*(.*)$/.exec(lines[index]);
    if (!match) continue;

    const indent = match[1].length;
    const inline = match[2].trim();
    if (inline && inline !== '|' && inline !== '>' && inline !== '|-' && inline !== '>-') {
      runs.push(stripQuotes(inline));
      continue;
    }

    const block = [];
    for (let child = index + 1; child < lines.length; child += 1) {
      const line = lines[child];
      if (!line.trim()) {
        block.push('');
        index = child;
        continue;
      }
      const childIndent = line.length - line.trimStart().length;
      if (childIndent <= indent) break;
      block.push(line.slice(Math.min(line.length, indent + 2)));
      index = child;
    }
    runs.push(block.join('\n'));
  }

  return runs;
}

function stripShellComment(line) {
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
    if (char === '\n' || char === ';' || (char === '&' && next === '&') || (char === '|' && next === '|')) {
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
  value = value.replace(/^(?:then|do)\s+/i, '');
  value = value.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*/, '');
  value = value.replace(/^sudo\s+/, '');
  return value.trim();
}

function detectExecutableShell(source) {
  const labels = new Set();

  for (const rawSegment of splitShellSegments(source)) {
    const segment = normalizeShellSegment(rawSegment);
    if (!segment) continue;
    if (/^(?:echo|printf|Write-(?:Host|Output)|console\.log)\b/i.test(segment)) continue;

    if (/^(?:(?:npx|pnpm\s+dlx|yarn\s+dlx|npm\s+exec(?:\s+--)?)[ \t]+)?eas(?:-cli)?[ \t]+update\b/i.test(segment)) labels.add('eas update');
    if (/^(?:(?:npx|pnpm\s+dlx|yarn\s+dlx|npm\s+exec(?:\s+--)?)[ \t]+)?eas(?:-cli)?[ \t]+build\b/i.test(segment)) labels.add('eas build');
    if (/^(?:(?:npx|pnpm\s+dlx|yarn\s+dlx|npm\s+exec(?:\s+--)?)[ \t]+)?eas(?:-cli)?[ \t]+submit\b/i.test(segment)) labels.add('eas submit');
    if (/^(?:(?:npx|pnpm\s+dlx|yarn\s+dlx|npm\s+exec(?:\s+--)?)[ \t]+)?eas(?:-cli)?[ \t]+workflow(?::run|[ \t]+run)?\b/i.test(segment)) labels.add('eas workflow');
    if (/^(?:(?:npx|pnpm\s+dlx|yarn\s+dlx|npm\s+exec(?:\s+--)?)[ \t]+)?expo[ \t]+upload\b/i.test(segment)) labels.add('expo upload');
    if (/^(?:\.\/)?gradlew(?:\.bat)?[ \t]+bundle\w*\b/i.test(segment)) labels.add('gradlew bundle');
    if (/^gh[ \t]+workflow[ \t]+run\b/i.test(segment)) labels.add('gh workflow run');
    if (/\bcurl\b/i.test(segment) && /actions\/workflows\/.+\/dispatches\b/i.test(segment)) labels.add('GitHub workflow dispatch API');
    if (/\bcurl\b/i.test(segment) && /repos\/.+\/dispatches\b/i.test(segment)) labels.add('GitHub repository dispatch API');
  }

  return [...labels];
}

function extractStringLiterals(source) {
  const values = [];
  const regex = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match;
  while ((match = regex.exec(source)) !== null) values.push(match[2]);
  return values;
}

function commandFromProgramAndArgs(program, argsSource) {
  const args = extractStringLiterals(argsSource);
  return [program, ...args].join(' ');
}

function detectExecutableJavaScript(source) {
  const labels = new Set();

  const stringRunners = /(?:\b(?:exec|execSync|execaCommand|execaCommandSync)\s*\(|\b(?:child_process|childProcess|cp|shelljs)\.(?:exec|execSync)\s*\()\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match;
  while ((match = stringRunners.exec(source)) !== null) {
    for (const label of detectExecutableShell(match[2])) labels.add(label);
  }

  const argvRunners = /(?:\b(?:spawn|spawnSync|execFile|execFileSync|execa|execaSync)\s*\(|\b(?:child_process|childProcess|cp)\.(?:spawn|spawnSync|execFile|execFileSync)\s*\()\s*(['"`])([^'"`]+)\1\s*,\s*\[([\s\S]{0,1200}?)\]/g;
  while ((match = argvRunners.exec(source)) !== null) {
    for (const label of detectExecutableShell(commandFromProgramAndArgs(match[2], match[3]))) labels.add(label);
  }

  const taggedTemplates = /(?:\b(?:execaCommand|execaCommandSync)|\$)\s*`([^`]+)`/g;
  while ((match = taggedTemplates.exec(source)) !== null) {
    for (const label of detectExecutableShell(match[1])) labels.add(label);
  }

  const bunSpawn = /\bBun\.spawn(?:Sync)?\s*\(\s*\[([\s\S]{0,1200}?)\]/g;
  while ((match = bunSpawn.exec(source)) !== null) {
    const parts = extractStringLiterals(match[1]);
    for (const label of detectExecutableShell(parts.join(' '))) labels.add(label);
  }

  const denoCommand = /\bnew\s+Deno\.Command\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*\{([\s\S]{0,1600}?)\}\s*\)/g;
  while ((match = denoCommand.exec(source)) !== null) {
    const argsMatch = /args\s*:\s*\[([\s\S]{0,1000}?)\]/.exec(match[3]);
    const command = commandFromProgramAndArgs(match[2], argsMatch?.[1] ?? '');
    for (const label of detectExecutableShell(command)) labels.add(label);
  }

  return [...labels];
}

function extractLocalUses(source) {
  const uses = [];
  const regex = /^\s*uses\s*:\s*['"]?([^'"\s#]+)['"]?/gmi;
  let match;
  while ((match = regex.exec(source)) !== null) {
    if (match[1].startsWith('./.github/')) uses.push(match[1].replace(/^\.\//, ''));
  }
  return uses;
}

function resolveLocalUse(usePath) {
  const candidate = path.join(root, usePath);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return normalizeRel(candidate);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    for (const name of ['action.yml', 'action.yaml']) {
      const action = path.join(candidate, name);
      if (fs.existsSync(action)) return normalizeRel(action);
    }
  }
  return null;
}

function analyzeYamlFile(rel) {
  const source = read(rel);
  const commandLabels = new Set();
  for (const run of extractRunBlocks(source)) {
    for (const label of detectExecutableShell(run)) commandLabels.add(label);
  }
  return {
    source,
    events: parseOnEvents(source),
    commands: [...commandLabels],
    localUses: extractLocalUses(source),
  };
}

const yamlCache = new Map();
function yamlInfo(rel) {
  if (!yamlCache.has(rel)) yamlCache.set(rel, analyzeYamlFile(rel));
  return yamlCache.get(rel);
}

function collectIndirectCommands(rel, seen = new Set()) {
  if (seen.has(rel)) return [];
  seen.add(rel);
  const info = yamlInfo(rel);
  const labels = new Set(info.commands);

  for (const usePath of info.localUses) {
    const resolved = resolveLocalUse(usePath);
    if (!resolved || !/\.ya?ml$/i.test(resolved)) continue;
    for (const label of collectIndirectCommands(resolved, seen)) labels.add(label);
  }

  return [...labels];
}

const easWorkflows = listFilesRecursive('.eas/workflows', (file) => /\.ya?ml$/i.test(file));
for (const rel of easWorkflows) {
  const events = yamlInfo(rel).events;
  const automatic = [...events].filter((event) => automaticTriggers.has(event));
  if (automatic.length > 0) {
    failures.push(`${rel}: EAS Workflow automatico detectado (${automatic.join(', ')}). Ningun push/PR/schedule ordinario debe consumir EAS Workflows.`);
  }
}

const githubWorkflows = listFilesRecursive('.github/workflows', (file) => /\.ya?ml$/i.test(file));
for (const rel of githubWorkflows) {
  const info = yamlInfo(rel);
  const automatic = [...info.events].filter((event) => automaticTriggers.has(event));
  const permittedEntry = [...info.events].some((event) => allowedManualOrReusableTriggers.has(event));
  const commands = collectIndirectCommands(rel);
  const publishOrBuild = commands.filter((label) => !label.includes('dispatch'));
  const dispatching = commands.filter((label) => label.includes('dispatch') || label === 'gh workflow run');

  if (automatic.length > 0 && publishOrBuild.length > 0) {
    failures.push(`${rel}: workflow automatico (${automatic.join(', ')}) alcanza publicacion/build (${publishOrBuild.join(', ')}), directa o mediante action/workflow local.`);
  }
  if (automatic.length > 0 && dispatching.length > 0) {
    failures.push(`${rel}: workflow automatico (${automatic.join(', ')}) puede encadenar otro workflow (${dispatching.join(', ')}).`);
  }
  if (commands.length > 0 && automatic.length === 0 && !permittedEntry) {
    failures.push(`${rel}: contiene publicacion/build/dispatch pero no es una entrada manual workflow_dispatch ni un reusable workflow_call.`);
  }
}

const packageJson = JSON.parse(read('package.json'));
for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (typeof command !== 'string') continue;
  const matches = detectExecutableShell(command);
  if (matches.length > 0) {
    failures.push(`package.json script "${name}": comando de publicacion/build/dispatch detectado (${matches.join(', ')}). No debe esconderse en scripts npm normales.`);
  }
}

const executableFiles = listFilesRecursive('.', (file) => {
  const rel = normalizeRel(file);
  if (rel.startsWith('.github/workflows/') || rel.startsWith('.eas/workflows/')) return false;
  if (rel === 'package.json' || rel === 'package-lock.json') return false;
  if (rel.startsWith('.husky/')) return true;
  return /\.(?:mjs|cjs|js|ts|sh|ps1|cmd|bat)$/i.test(file);
});

for (const rel of executableFiles) {
  const source = read(rel);
  const isJavaScript = /\.(?:mjs|cjs|js|ts)$/i.test(rel);
  const matches = isJavaScript ? detectExecutableJavaScript(source) : detectExecutableShell(source);
  if (matches.length > 0) {
    failures.push(`${rel}: ejecucion real de publicacion/build/dispatch detectada (${matches.join(', ')}). Las menciones de texto no cuentan; los runners de procesos si.`);
  }
}

if (failures.length > 0) {
  console.error('CI POLICY FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`CI POLICY OK: ${easWorkflows.length} EAS workflow(s), ${githubWorkflows.length} GitHub workflow(s) y ${executableFiles.length} archivo(s) ejecutable(s) revisados; push normal no publica ni construye.`);
