import { spawnSync } from 'node:child_process';

const allowedAdvisories = new Set([
  'GHSA-w3rx-r6r6-pgpr', // image-size: ICNS parser DoS; no published patched release yet
  'GHSA-5p2g-fcmc-qvqq', // image-size: JXL/HEIF parser DoS; no published patched release yet
  'GHSA-vcc3-ghjq-m6fr', // decode-uri-component DoS; safe remediation depends on upstream chain
  'GHSA-w5hq-g745-h8pq', // uuid bounds check; transitive build-tool chain
]);

const baselineMaximums = {
  critical: 0,
  high: 4,
  moderate: 15,
  low: 0,
  total: 19,
};

const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const raw = result.stdout?.trim();
if (!raw) {
  throw new Error(`npm audit returned no JSON. stderr: ${result.stderr || 'empty'}`);
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  throw new Error('npm audit output was not valid JSON.');
}

const counts = report?.metadata?.vulnerabilities ?? {};
for (const [severity, maximum] of Object.entries(baselineMaximums)) {
  const actual = Number(counts[severity] ?? 0);
  if (actual > maximum) {
    throw new Error(
      `npm audit ${severity} vulnerabilities increased: ${actual} > baseline ${maximum}.`,
    );
  }
}

const observed = new Set();
const unknown = [];

for (const [pkg, vulnerability] of Object.entries(report?.vulnerabilities ?? {})) {
  for (const via of vulnerability?.via ?? []) {
    if (typeof via === 'string') continue;

    const haystack = [
      via?.url,
      via?.title,
      via?.name,
    ].filter(Boolean).join(' ');

    const ids = haystack.match(/GHSA-[a-z0-9-]+/gi) ?? [];
    if (ids.length === 0) {
      unknown.push(`${pkg}: ${via?.title ?? via?.url ?? via?.source ?? 'unknown advisory'}`);
      continue;
    }

    for (const rawId of ids) {
      const id = rawId.toUpperCase();
      observed.add(id);
      if (!allowedAdvisories.has(id)) {
        unknown.push(`${pkg}: ${id}`);
      }
    }
  }
}

if (unknown.length) {
  throw new Error(
    'npm audit contains advisory debt outside the reviewed baseline:\n' +
      [...new Set(unknown)].map((item) => ` - ${item}`).join('\n'),
  );
}

if (Number(counts.critical ?? 0) !== 0) {
  throw new Error('Critical npm vulnerability present.');
}

console.log('UCAPSA npm advisory baseline: PASS');
console.log(JSON.stringify({
  counts,
  observedAdvisories: [...observed].sort(),
  reviewedAllowlist: [...allowedAdvisories].sort(),
}, null, 2));
