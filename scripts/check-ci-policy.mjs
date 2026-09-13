import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const automaticTriggers = [
  'push',
  'pull_request',
  'pull_request_target',
  'workflow_run',
  'repository_dispatch',
  'schedule',
];

const dangerousCommands = [
  { label: 'eas update', pattern: /\b(?:npx\s+)?eas(?:-cli)?\s+update\b/i },
  { label: 'eas build', pattern: /\b(?:npx\s+)?eas(?:-cli)?\s+build\b/i },
  { label: 'eas submit', pattern: /\b(?:npx\s+)?eas(?:-cli)?\s+submit\b/i },
  { label: 'expo upload', pattern: /\b(?:npx\s+)?expo\s+upload\b/i },
  { label: 'gradlew bundle', pattern: /(?:^|\s)(?:\.\/)?gradlew(?:\.bat)?\s+bundle\w*/i },
];

const chainedDispatchCommands = [
  { label: 'gh workflow run', pattern: /\bgh\s+workflow\s+run\b/i },
  { label: 'GitHub workflow dispatch API', pattern: /actions\/workflows\/.+\/dispatches/i },
  { label: 'GitHub repository dispatch API', pattern: /repos\/.+\/dispatches/i },
];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function listYamlFiles(relDir) {
  const dir = path.join(root, relDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(relDir, entry.name).replaceAll('\\', '/'));
}

function hasTrigger(source, trigger) {
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*(?:-\\s*)?${escaped}\\s*:`, 'mi').test(source)
    || new RegExp(`on\\s*:\\s*\\[[^\\]]*\\b${escaped}\\b[^\\]]*\\]`, 'mi').test(source);
}

function automaticTriggerList(source) {
  return automaticTriggers.filter((trigger) => hasTrigger(source, trigger));
}

function hasWorkflowDispatch(source) {
  return hasTrigger(source, 'workflow_dispatch');
}

function matchedLabels(source, definitions) {
  return definitions.filter(({ pattern }) => pattern.test(source)).map(({ label }) => label);
}

for (const rel of listYamlFiles('.eas/workflows')) {
  const source = read(rel);
  const triggers = automaticTriggerList(source);
  if (triggers.length > 0) {
    failures.push(`${rel}: EAS Workflow automatico detectado (${triggers.join(', ')}). Los pushes/PR/schedules normales no deben consumir EAS Workflows.`);
  }
}

for (const rel of listYamlFiles('.github/workflows')) {
  const source = read(rel);
  const triggers = automaticTriggerList(source);
  const publishCommands = matchedLabels(source, dangerousCommands);
  const dispatchCommands = matchedLabels(source, chainedDispatchCommands);

  if (publishCommands.length > 0) {
    if (!hasWorkflowDispatch(source) || triggers.length > 0) {
      failures.push(`${rel}: ${publishCommands.join(', ')} solo puede vivir en un workflow manual workflow_dispatch, sin triggers automaticos.`);
    }
  }

  if (dispatchCommands.length > 0 && triggers.length > 0) {
    failures.push(`${rel}: un workflow automatico intenta encadenar otro workflow (${dispatchCommands.join(', ')}).`);
  }
}

const packageJson = JSON.parse(read('package.json'));
for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (typeof command !== 'string') continue;
  const matches = matchedLabels(command, [...dangerousCommands, ...chainedDispatchCommands]);
  if (matches.length > 0) {
    failures.push(`package.json script "${name}": comando prohibido para scripts normales (${matches.join(', ')}).`);
  }
}

const scriptsDir = path.join(root, 'scripts');
if (fs.existsSync(scriptsDir)) {
  for (const entry of fs.readdirSync(scriptsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const rel = `scripts/${entry.name}`;
    if (rel === 'scripts/check-ci-policy.mjs') continue;
    if (!/\.(?:mjs|cjs|js|ts|sh|ps1|cmd|bat)$/i.test(entry.name)) continue;
    const source = read(rel);
    const matches = matchedLabels(source, [...dangerousCommands, ...chainedDispatchCommands]);
    if (matches.length > 0) {
      failures.push(`${rel}: comando oculto de publicacion/build/dispatch detectado (${matches.join(', ')}).`);
    }
  }
}

if (failures.length > 0) {
  console.error('CI POLICY FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('CI POLICY OK: push normal solo usa GitHub CI; EAS/OTA/build/submit permanecen manuales y deliberados.');
