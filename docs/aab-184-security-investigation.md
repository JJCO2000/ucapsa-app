# AAB #184 — release security remediation

## Incident and root cause

Production workflow [#184](https://github.com/JJCO2000/ucapsa-app/actions/runs/41332449909) failed before EAS build: `check:npm-advisory-baseline` rejected 19 audit findings (5 high, 12 moderate, 2 low; 0 critical), including newly disclosed unreviewed advisories. No AAB artifact was produced.

## Validated corrections (PR #580)

- Updated the existing CommonJS-compatible decoder wrapper from `decode-uri-component@0.5.0` to `0.5.1`, including the nested npm alias lockfile entry and the existing security guard.
- Pinned `node-forge@1.4.2` and *only Expo-specific* `glob@14.0.2` and `@expo/fingerprint` `minimatch@11.0.1`, leaving unrelated tooling unaffected. All occurrences of those three packages in the lockfile now have enforced security minimums.
- Retired the fixed `node-forge` no-fix exception. Re-reviewed the **existing** `zod@3.25.76` exception, which is restricted to Expo CLI's build tooling, against [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Zod 3 has no patched release; forcing Zod 4 into Expo CLI risks incompatibility. Short re-review deadline: **2026-11-08**. Do not describe it as patched.

## Evidence

- [Targeted dependency compatibility experiment](https://github.com/JJCO2000/ucapsa-app/actions/runs/41377669022): installed with `npm ci`, regenerated the lockfile with npm, tested scoped overrides, passed UCAPSA verification and SDK dependency checks.
- [Full release-gate experiment](https://github.com/JJCO2000/ucapsa-app/actions/runs/41377903777): passed `npm ci`, `npm run verify:release`, pinned SDK dependency checks, Expo Doctor, and critical audit. GitHub Actions committed the tested `package.json` and `package-lock.json` to the PR branch.
- Before targeted fixes: **19 findings**. After fixes: **9 findings** (**0 critical, 4 high, 0 moderate, 5 low**) as reported by `npm audit --omit=dev`.

## Explicit residual risk and follow-up

All remaining findings are bounded to dependency chains in Expo/Metro tooling: two `image-size` high advisories (no published fixed version compatible with Metro), one `zod` high advisory (fix only in Zod 4, incompatible-risk for Expo CLI 57), and one `deepmerge` low advisory propagated to tooling. Package vulnerability counts include propagation through dependents, so four high findings are not four independent high-severity CVEs.

The existing audit gate **does not ignore these indiscriminately**: it accepts only named, reviewed advisories with pinned versions, exact dependent packages, severity maximums, and dated review deadlines. Deepmerge review is due **2026-11-05**; Zod due **2026-11-08**; image-size review due **2026-11-15**. These dates require a new review before future production builds.

Upstream constraints and references:
- https://github.com/expo/expo/issues/52735
- https://github.com/advisories/GHSA-qr28-fpjm-wq7f
- https://github.com/advisories/GHSA-3g3m-2fjr-6pw4
- https://github.com/advisories/GHSA-g3hv-75wg-m249
- https://github.com/advisories/GHSA-w3rx-r6r6-pgpr
- https://github.com/advisories/GHSA-5p2g-fcmc-qvqq

**Release:** verify final branch CI after removing experiment workflows, then merge PR #580 into `main` and initiate the owner-gated production AAB workflow. An EAS build and its generated artifact still require separate verification.
