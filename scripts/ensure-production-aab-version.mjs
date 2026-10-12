/**
 * Align EAS remote Android versionCode before a production bundle build.
 * Uses the same documented Expo GraphQL query/mutation as eas-cli itself;
 * the interactive "eas build:version:set" cannot be used in GitHub CI.
 *
 * The remote value remains the sole source; eas.json production.autoIncrement
 * advances it once again as EAS creates the build.
 * Fail closed when EAS cannot be verified, instead of shipping a duplicate.
 */
import fs from 'node:fs';
import { requiredEasRemoteFloor, assertAndroidVersionCode } from './aab-version-policy.mjs';

const token = String(process.env.EXPO_TOKEN ?? '').trim();
if (!token) throw new Error('EXPO_TOKEN requerido para comprobar la versión de EAS.');
const minimumRemoteVersion = requiredEasRemoteFloor(process.env.GITHUB_RUN_NUMBER);
const { expo } = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const { cli, build } = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
const appId = expo?.extra?.eas?.projectId;
const applicationIdentifier = expo?.android?.package;
if (!appId || applicationIdentifier !== 'com.jjcc2000.ucapsaapp') {
  throw new Error('El proyecto o paquete Android ya no coincide con UCAPSA Production.');
}
if (cli?.appVersionSource !== 'remote' || build?.production?.autoIncrement !== true) {
  throw new Error('EAS Production debe usar versionCode remoto con autoIncrement=true.');
}

async function graphql(query, variables) {
  const response = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Expo GraphQL HTTP ${response.status}; se cancela el build.`);
  const body = await response.json();
  if (body.errors?.length || !body.data) {
    throw new Error('Expo no aceptó la consulta/actualización de versión remota; se cancela el build.');
  }
  return body.data;
}

const variables = { appId, platform: 'ANDROID', applicationIdentifier };
const latestQuery = `query LatestAppVersion($appId: String!, $platform: AppPlatform!, $applicationIdentifier: String!) {
  app { byId(appId: $appId) {
    latestAppVersionByPlatformAndApplicationIdentifier(
      platform: $platform, applicationIdentifier: $applicationIdentifier
    ) { buildVersion storeVersion }
  } }
}`;

async function getCurrentVersion() {
  const data = await graphql(latestQuery, variables);
  const version = data.app?.byId?.latestAppVersionByPlatformAndApplicationIdentifier?.buildVersion;
  return version == null ? null : assertAndroidVersionCode(version, 'versionCode remoto');
}

const current = await getCurrentVersion();
if (current === null) {
  throw new Error('EAS aún no tiene versión remota inicializada. Requiere revisión, no se adivina.');
}
if (current < minimumRemoteVersion) {
  const mutation = `mutation CreateAppVersionMutation($appVersionInput: AppVersionInput!) {
    appVersion { createAppVersion(appVersionInput: $appVersionInput) { id } }
  }`;
  const data = await graphql(mutation, {
    appVersionInput: {
      appId,
      platform: 'ANDROID',
      applicationIdentifier,
      storeVersion: expo.version ?? '1.0.0',
      buildVersion: String(minimumRemoteVersion),
      runtimeVersion: expo.version ?? '1.0.0',
    },
  });
  if (!data.appVersion?.createAppVersion?.id) {
    throw new Error('EAS no confirmó el cambio de versionCode.');
  }
  console.log(`VERSION GUARD: EAS remoto ${current} -> ${minimumRemoteVersion} (sin tocar código fuente).`);
} else {
  console.log(`VERSION GUARD: EAS remoto ${current} ya supera el mínimo ${minimumRemoteVersion}.`);
}
const verified = await getCurrentVersion();
if (verified === null || verified < minimumRemoteVersion) {
  throw new Error('No se pudo comprobar versionCode remoto seguro; no generar AAB.');
}
console.log(`VERSION GUARD OK: EAS asignará un versionCode >= ${verified + 1} (> 10) por autoIncrement.`);
