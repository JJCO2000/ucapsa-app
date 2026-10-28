import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// This is a regression gate, NOT a security waiver.
// At review time (2026-10-23), no patched npm release was available for
// GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr or GHSA-86w9-cpqp-85rv.
// Never weaken audit:critical or force an incompatible Expo downgrade.
const known = new Map([
  ['image-size', new Set(['GHSA-5p2g-fcmc-qvqq','GHSA-w3rx-r6r6-pgpr'])],
  ['node-forge', new Set(['GHSA-86w9-cpqp-85rv'])],
  ['zod', new Set(['GHSA-mrhx-c7xc-m3w5'])],
]);
// A reviewed LOW deepmerge advisory now flows via @expo/config into @expo/cli.
// This is only an indirect chain: direct high advisories still fail closed.
const inherited = new Set(['@expo/cli','@expo/config','deepmerge','@expo/code-signing-certificates','expo','expo-updates']);
const knownKeys = new Set([...known.keys(),...inherited]);
const MAX_KNOWN_HIGH_FINDINGS = 7;

function review(report) {
  if (!report || typeof report !== 'object' || !report.vulnerabilities
    || !report.metadata?.vulnerabilities) {
    throw new Error('npm audit JSON is incomplete; cannot evaluate dependencies.');
  }
  const totals = report.metadata.vulnerabilities;
  if (!Number.isInteger(totals.high) || !Number.isInteger(totals.critical)) {
    throw new Error('npm audit did not return severity counts.');
  }
  if (totals.critical !== 0 || totals.high > MAX_KNOWN_HIGH_FINDINGS) {
    throw new Error('Critical or additional high-severity dependency findings detected.');
  }
  for (const [name, finding] of Object.entries(report.vulnerabilities)) {
    if (!finding || !['high','critical'].includes(finding.severity)) continue;
    if (!knownKeys.has(name)) {
      throw new Error('New high/critical dependency advisory outside reviewed list: '+name);
    }
    const direct = (finding.via ?? []).filter(v => v && typeof v === 'object');
    if (known.has(name)) {
      if (direct.length === 0) {
        throw new Error('Unable to verify the actual advisory IDs for '+name);
      }
      for (const entry of direct) {
        if (![...known.get(name)].some(id => String(entry.url ?? '').includes(id))) {
          throw new Error('Unreviewed high-severity advisory on '+name+': '+(entry.url ?? entry.title));
        }
      }
    } else if (direct.length !== 0) {
      throw new Error('New direct advisory in previously indirect dependency: '+name);
    } else if (!(finding.via ?? []).every(v => typeof v === 'string' && knownKeys.has(v))) {
      throw new Error('Previously indirect risk has an unexpected dependency chain: '+name+' via '+JSON.stringify(finding.via));
    }
  }
  return { high: totals.high, critical: totals.critical };
}

function runSelfTest() {
  const base = {
    metadata:{vulnerabilities:{high:7,critical:0}},
    vulnerabilities:{
      'image-size':{severity:'high',via:[
        {url:'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq'},
        {url:'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr'},
      ]},
      'node-forge':{severity:'high',via:[
        {url:'https://github.com/advisories/GHSA-86w9-cpqp-85rv'},
      ]},
      'zod':{severity:'high',via:[{url:'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5'}]},
      '@expo/code-signing-certificates':{severity:'high',via:['node-forge']},
      '@expo/cli':{severity:'high',via:['node-forge','@expo/code-signing-certificates','@expo/config','deepmerge']},
      'expo':{severity:'high',via:['@expo/cli']},
      'expo-updates':{severity:'high',via:['@expo/code-signing-certificates']},
    },
  };
  assert.deepEqual(review(base),{high:7,critical:0});
  assert.deepEqual(review({metadata:{vulnerabilities:{high:0,critical:0}},vulnerabilities:{}}),{high:0,critical:0});
  assert.throws(() => review({...base,metadata:{vulnerabilities:{high:8,critical:0}}}),/additional high/);
  assert.throws(() => review({...base,metadata:{vulnerabilities:{high:7,critical:1}}}),/Critical/);
  assert.throws(() => review({...base,vulnerabilities:{...base.vulnerabilities,
    'unrelated':{severity:'high',via:[{url:'https://example.invalid'}]}}}),/New high/);
  assert.throws(() => review({...base,vulnerabilities:{...base.vulnerabilities,
    'node-forge':{severity:'high',via:[{url:'https://github.com/advisories/GHSA-NEW-2026'}]}}}),/Unreviewed/);
  assert.throws(() => review({...base,vulnerabilities:{...base.vulnerabilities,
    'zod':{severity:'high',via:[{url:'https://github.com/advisories/GHSA-UNREVIEWED-2026'}]}}}),/Unreviewed/);
  assert.throws(() => review({...base,vulnerabilities:{...base.vulnerabilities,
    '@expo/cli':{severity:'high',via:[{url:'https://github.com/advisories/GHSA-NEW-2026'}]}}}),/New direct/);
  assert.throws(() => review({}),/incomplete/);
  console.log('DEPENDENCY HIGH REGRESSION SELF-TEST PASS (new high, new advisory, critical, invalid output blocked).');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm,['audit','--omit=dev','--json'],{
    encoding:'utf8',maxBuffer:16*1024*1024,
  });
  if (result.error || ![0,1].includes(result.status)) {
    throw new Error('Could not run npm audit. No security conclusion possible: '
      +(result.error?.message ?? result.stderr ?? result.status));
  }
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { throw new Error('npm audit did not return valid JSON; security gate fails closed.'); }
  const { high, critical } = review(report);
  console.log('DEPENDENCY HIGH REGRESSION: '+high+' known high, '+critical+' critical; no unreviewed high advisory.');
  if (high) console.warn('ATTENTION: '+high+' HIGH vulnerabilities remain UNPATCHED in Expo/Metro tooling dependency chain. This is NOT a security approval. Reassess before production release.');
}
