import fs from 'node:fs';
import assert from 'node:assert/strict';
import { KNOWN_PLAY_USED_VERSION_CODE, requiredEasRemoteFloor, assertAndroidVersionCode } from './aab-version-policy.mjs';

assert.equal(KNOWN_PLAY_USED_VERSION_CODE, 10);
assert.equal(requiredEasRemoteFloor(31), 41);
assert.equal(requiredEasRemoteFloor(32), 42);
assert.ok(requiredEasRemoteFloor(33) > requiredEasRemoteFloor(32));
assert.equal(assertAndroidVersionCode('42', 'test'), 42);
assert.throws(() => assertAndroidVersionCode('not numeric', 'test'));
assert.throws(() => requiredEasRemoteFloor(''));

const workflow = fs.readFileSync('.github/workflows/build-production-aab.yml', 'utf8');
const guard = fs.readFileSync('scripts/ensure-production-aab-version.mjs', 'utf8');
const verified = fs.readFileSync('scripts/verify-production-aab-version.mjs', 'utf8');
for (const token of [
  'npm run verify:release',
  'node scripts/check-expo-validated-deps.mjs',
  'EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1 npx --yes expo-doctor@1.20.4',
  'npm run audit:critical',
  'node scripts/ensure-production-aab-version.mjs',
  'eas build --platform android --profile production --non-interactive --wait',
  'node scripts/verify-production-aab-version.mjs',
  'EXPO_TOKEN',
  'Checkout canonical main',
]) {
  assert.ok(workflow.includes(token), `Missing production AAB guard: ${token}`);
}
assert.ok(workflow.indexOf('node scripts/check-expo-validated-deps.mjs') < workflow.indexOf('EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1 npx --yes expo-doctor@1.20.4'),
  'Production must validate the fixed Expo lockfile baseline before pinning Doctor');
assert.ok(workflow.indexOf('EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1 npx --yes expo-doctor@1.20.4') < workflow.indexOf('eas build --platform android'));
assert.ok(workflow.indexOf('node scripts/ensure-production-aab-version.mjs') < workflow.indexOf('eas build --platform android'));
assert.ok(workflow.indexOf('eas build --platform android') < workflow.indexOf('node scripts/verify-production-aab-version.mjs'));
assert.ok(guard.includes('latestAppVersionByPlatformAndApplicationIdentifier'));
assert.ok(guard.includes('createAppVersion'));
assert.ok(guard.includes("cli?.appVersionSource !== 'remote'"));
assert.ok(verified.includes('gitCommitHash'));
assert.ok(verified.includes('appBuildVersion'));
assert.ok(verified.includes('KNOWN_PLAY_USED_VERSION_CODE'));
console.log('Production AAB anti-duplicate version guard: PASS');
