import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const allowedAdvisories = new Set([
  'GHSA-W3RX-R6R6-PGPR', // image-size: ICNS parser DoS; no published patched release yet
  'GHSA-5P2G-FCMC-QVQQ', // image-size: JXL/HEIF parser DoS; no published patched release yet
  'GHSA-VCC3-GHJQ-M6FR', // decode-uri-component DoS; safe remediation depends on upstream chain
  'GHSA-W5HQ-G745-H8PQ', // uuid bounds check; transitive build-tool chain
  'GHSA-VFJ7-8CJW-P6XM', // braces <=3.0.3; no patched release as of 2026-10-05; constrained to Metro glob tooling
  'GHSA-86W9-CPQP-85RV', // node-forge 1.4.0 follow-up; no published patched npm version; constrained to Expo code-signing certificates
]);

const baselineMaximums = {
  critical: 0,
  high: 21,
  moderate: 12,
  low: 0,
  total: 33,
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
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

function directDependentsOf(packageName) {
  const result = [];
  for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
    const ranges = {
      ...(metadata.dependencies ?? {}),
      ...(metadata.optionalDependencies ?? {}),
      ...(metadata.devDependencies ?? {}),
    };
    if (ranges[packageName]) result.push(packagePath || '(root)');
  }
  return result.sort();
}

const reviewedNoFixBoundaries = {
  braces: {
    version: '3.0.3',
    allowedDependents: ['node_modules/micromatch'],
  },
  'node-forge': {
    version: '1.4.0',
    allowedDependents: [
      'node_modules/@expo/code-signing-certificates',
      'node_modules/expo/node_modules/@expo/cli',
    ],
  },
};

for (const [packageName, boundary] of Object.entries(reviewedNoFixBoundaries)) {
  const installed = lock.packages?.[`node_modules/${packageName}`]?.version ?? null;
  if (installed !== boundary.version) {
    throw new Error(
      `Reviewed no-fix boundary changed for ${packageName}: installed ${installed ?? 'missing'}, expected ${boundary.version}.`,
    );
  }
  const dependents = directDependentsOf(packageName);
  const unexpected = dependents.filter((item) => !boundary.allowedDependents.includes(item));
  if (unexpected.length || dependents.length !== boundary.allowedDependents.length) {
    throw new Error(
      `Reviewed no-fix dependency boundary changed for ${packageName}: ${JSON.stringify(dependents)}.`,
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

const diagnostic = {
  counts,
  observedAdvisories: [...observed].sort(),
  unreviewedAdvisories: [...new Set(unknown)].sort(),
  reviewedAllowlist: [...allowedAdvisories].sort(),
};

console.log('UCAPSA npm advisory diagnostic');
console.log(JSON.stringify(diagnostic, null, 2));

for (const [severity, maximum] of Object.entries(baselineMaximums)) {
  const actual = Number(counts[severity] ?? 0);
  if (actual > maximum) {
    throw new Error(
      `npm audit ${severity} vulnerabilities increased: ${actual} > baseline ${maximum}.`,
    );
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
