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
