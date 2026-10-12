/**
 * AAB version policy for the single authorized GitHub production workflow.
 *
 * EAS remote versions alone may lag Google Play when bundles are uploaded
 * independently. The workflow's monotonically increasing run number creates
 * a minimum floor before EAS autoIncrement allocates the next versionCode.
 *
 * The last observed Play Console collision was versionCode 10. A separate
 * publishing pipeline must not mint versions outside this coordinated flow.
 */
export const KNOWN_PLAY_USED_VERSION_CODE = 10;
export const PRODUCTION_WORKFLOW_VERSION_OFFSET = 10;

export function assertAndroidVersionCode(value, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 2100000000) {
    throw new Error(`${label} debe ser un versionCode Android válido; recibido: ${value}`);
  }
  return n;
}

export function requiredEasRemoteFloor(runNumber) {
  const run = assertAndroidVersionCode(runNumber, 'GITHUB_RUN_NUMBER');
  return Math.max(
    KNOWN_PLAY_USED_VERSION_CODE,
    run + PRODUCTION_WORKFLOW_VERSION_OFFSET,
  );
}
