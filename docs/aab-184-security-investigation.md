# AAB #184 — release security gate investigation

## Verified failure

GitHub Actions run https://github.com/JJCO2000/ucapsa-app/actions/runs/41332449909 failed in `Release gates` before building Android. `npm run check:npm-advisory-baseline` reported 19 vulnerabilities in the production dependency audit: 0 critical, 5 high, 12 moderate and 2 low. The moderate count exceeded the configured maximum of zero. Fourteen advisory IDs were outside the reviewed allowlist.

## Safe remediation procedure

1. Reproduce with the exact checked-in lockfile: `npm ci && npm audit --omit=dev --json` in an isolated environment. Capture each advisory's package, affected range, patched range, dependency path and runtime/build-time exposure.
2. Prefer targeted compatible fixes to `package-lock.json` and, where required, `package.json`. Inspect Expo SDK 57 / React Native 0.86 compatibility before overriding transitive dependency versions. Do not run `npm audit fix --force` blindly.
3. If an advisory has no compatible fix, perform a documented risk assessment with package/version, dependency boundary and time-limited re-review. Do not merely increase severity thresholds or add an advisory to the allowlist.
4. Validate `npm ci`, `npm run verify:release`, relevant Android compatibility checks and GitHub CI before merging. Keep production AAB workflow gated until checks pass.
5. Note the existing time-limited `zod` exception review deadline of 2026-11-01; revisit it rather than extending without evidence.

No application code, security gates, package versions, or lockfile are changed by this investigation note. No production build was triggered.

## Additional verified workflow and dependency facts

- `.github/workflows/build-production-aab.yml` checks out canonical `main`, runs `npm ci`, then `npm run verify:release`, and only afterwards starts `eas build`. Thus changes in this PR branch cannot fix a production build until safely reviewed and merged.
- The workflow has an explicit `Critical vulnerability gate` after Expo Doctor, but the earlier npm advisory baseline blocks first. Do not bypass either gate.
- `packages/decode-uri-component-compat/package.json` already wraps `decode-uri-component@0.5.0` through the `upstream-decoder` npm alias. Investigate whether the audit finding is for another transitive copy before changing this wrapper.
- Dependabot PR #565 proposes Expo SDK 58 across 31 packages, a broad major SDK upgrade, not a suitable minimal fix for the SDK 57 AAB incident.
- GitHub Actions run #184 has zero uploaded artifacts. Do not label it a successful AAB build.

## Public advisory research (2026-11-01)

Published fixes now exist for previously unreviewed advisories:

| Package | Patched version | Advisory / evidence |
| --- | --- | --- |
| `decode-uri-component` | `0.5.1` | https://github.com/advisories/GHSA-qr28-fpjm-wq7f |
| `node-forge` | `1.4.1` | https://github.com/advisories/GHSA-4487-j8r4-4g2f |
| `glob` | `14.0.2` | https://github.com/advisories/GHSA-3g3m-2fjr-6pw4 |
| `minimatch` | `11.0.1` | https://github.com/advisories/GHSA-g3hv-75wg-m249 |

Expo SDK 58 upstream issue https://github.com/expo/expo/issues/52735 documents Expo tooling dependency pins on `glob@^13` and `minimatch@^10`. This is evidence of a build-tooling dependency constraint, not proof that an override is compatible with UCAPSA SDK 57. The issue specifically warns that a global minimatch 11 override may break eslint plugins using `minimatch.makeRe`.

### Narrow patch candidate (not applied)

- Change the internal compatibility wrapper `packages/decode-uri-component-compat/package.json` from `upstream-decoder: npm:decode-uri-component@0.5.0` to `npm:decode-uri-component@0.5.1`, then regenerate and verify lockfile. Check that the audit reports no other vulnerable nested decoder copy.
- Evaluate `node-forge@1.4.1` only after confirming its exact dependency tree and Expo code-signing compatibility.
- Investigate which SDK 57 Expo packages pin `glob` and `minimatch`; avoid global overrides that could break ESLint or CLI APIs. Test any scoped replacement before acceptance.
- Reproduce the full audit after each narrow fix. There are 14 previously unreviewed advisory IDs; these four package families do not establish that all findings are resolved.

No dependency changes have been made or tested. The current environment cannot clone the repository directly, so this research does not establish a passing build.

## Verified public security references and implementation constraints

- `decode-uri-component` <=0.5.0 is vulnerable; 0.5.1 is patched: https://github.com/advisories/GHSA-qr28-fpjm-wq7f
- `node-forge` <=1.4.0 is vulnerable to persistent CA-store mutation; 1.4.1 is patched: https://github.com/advisories/GHSA-4487-j8r4-4g2f
- `glob` 9.0.0–14.0.1 has cancellation bypass; 14.0.2 is patched: https://github.com/advisories/GHSA-3g3m-2fjr-6pw4
- `minimatch` 10.2.6 has globparts amplification; 11.0.1 is patched: https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249
- Expo's upstream report on `glob` and `minimatch` constraints is open: https://github.com/expo/expo/issues/52735

**Implementation prerequisite:** a valid lockfile must be generated by npm for each targeted dependency change. Do not edit `package.json` or the local decoder wrapper alone: the production workflow runs `npm ci` and would reject inconsistent lockfile metadata. Do not hand-edit integrity hashes or claim a fix based solely on advisory versions. Validate the transitive package graph and the full release gate before requesting another production AAB.
