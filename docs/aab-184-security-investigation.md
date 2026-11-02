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
