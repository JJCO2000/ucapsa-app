/**
 * Verifies the FINISHED AAB on EAS after build --wait, not just the Expo build
 * exit code (which can be success even when Play already used the versionCode).
 */
import fs from 'node:fs';
import { assertAndroidVersionCode, KNOWN_PLAY_USED_VERSION_CODE, requiredEasRemoteFloor } from './aab-version-policy.mjs';

const path = process.argv[2];
if (!path) throw new Error('Falta la ruta JSON de eas build:list.');
const builds = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!Array.isArray(builds)) throw new Error('La lista de EAS builds no es un arreglo JSON.');
const expectedCommit = String(process.env.BUILD_SOURCE_SHA ?? '').trim();
if (!/^[a-f0-9]{40}$/.test(expectedCommit)) throw new Error('BUILD_SOURCE_SHA inválido.');
const requiredVersion = requiredEasRemoteFloor(process.env.GITHUB_RUN_NUMBER) + 1;
const matches = builds
  .filter((build) =>
    String(build.gitCommitHash ?? '') === expectedCommit
    && String(build.buildProfile ?? '').toLowerCase() === 'production'
    && String(build.platform ?? '').toUpperCase() === 'ANDROID'
    && String(build.status ?? '').toUpperCase() === 'FINISHED')
  .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')));
const latest = matches[0];
if (!latest) throw new Error('No se encontró un Android Production AAB terminado de este commit en EAS.');
const code = assertAndroidVersionCode(latest.appBuildVersion, 'versionCode AAB');
if (code <= KNOWN_PLAY_USED_VERSION_CODE || code < requiredVersion) {
  throw new Error(`AAB inválido: versionCode ${code}, mínimo esperado ${requiredVersion}.`);
}
const artifactUrl = latest.artifacts?.buildUrl ?? latest.artifacts?.applicationArchiveUrl ?? '';
if (!/^https:\/\//.test(artifactUrl) || !/\.aab(?:\?|$)/i.test(artifactUrl)) {
  throw new Error('EAS no devolvió un vínculo .aab descargable para este build.');
}
console.log(`AAB VERIFIED: versionCode ${code}, commit ${expectedCommit.slice(0, 12)}, archivo .aab disponible.`);
console.log(`EAS Build ID: ${latest.id}`);
console.log(`AAB: ${artifactUrl}`);
