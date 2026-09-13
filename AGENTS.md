# UCAPSA project guardrails

## Expo version

This repository uses Expo SDK 57. Before changing Expo, EAS, native modules, runtime compatibility, or build configuration, read the exact versioned Expo documentation for the installed SDK and verify the current package versions in `package.json`.

## CI/CD and publishing policy

Normal development must stay on this path:

`edit -> local verification -> commit -> push -> GitHub Actions`

A normal push must cause:

- 0 EAS Workflows
- 0 EAS Build
- 0 EAS Update / OTA publication
- 0 AAB generation
- 0 Google Play submission

Rules:

1. Do not add automatic EAS Workflows for push, pull request, workflow_run, repository_dispatch, or schedule unless the user explicitly asks for that exact automation.
2. GitHub Actions may run normal code-quality checks on push/PR.
3. OTA publication is deliberate only. First verify runtime/native compatibility; even when compatible, wait for explicit authorization before publishing.
4. If a change needs a new native binary, report that OTA cannot deliver it and wait for explicit authorization before running EAS Build.
5. Never generate an AAB or submit to Google Play unless the user explicitly asks for that exact action.
6. Do not hide EAS/build/publish commands in npm scripts, post-push hooks, chained workflows, workflow_run, repository_dispatch, or other indirect automation.
7. Keep `npm run check:ci-policy` passing. Any intentional exception requires an explicit policy change, not a bypass.

The manual GitHub workflow `.github/workflows/publish-preview.yml` is allowed because it is `workflow_dispatch` only and still requires a deliberate user-triggered publication.
