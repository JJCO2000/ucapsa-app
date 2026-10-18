// Fail-closed guard for a Cloudflare Pages PRIVATE preview build.
// No token, account ID, password or production access is embedded in this file.
// Cloudflare Access is a separate REQUIRED step before sharing any preview URL.
export function validatePreviewEnvironment(env) {
  const errors = [];
  const url = env.EXPO_PUBLIC_SUPABASE_URL || '';
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

  if (env.CF_PAGES !== '1') errors.push('Build de prueba permitido sólo en Cloudflare Pages.');
  if (env.CF_PAGES_BRANCH !== 'feat/web-unified-portal-foundation') {
    errors.push('Rama no autorizada: únicamente feat/web-unified-portal-foundation.');
  }
  if (env.EXPO_PUBLIC_UCAPSA_REVIEW_BUILD !== 'true') {
    errors.push('El modo de revisión aislado es obligatorio.');
  }

  let hostname = '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') errors.push('Supabase de pruebas requiere HTTPS.');
    hostname = parsed.hostname.toLowerCase();
  } catch {
    errors.push('Falta una URL válida de Supabase de pruebas.');
  }

  // The production Supabase project must never be reachable from the preview.
  if (!hostname.endsWith('.supabase.co') || hostname === 'hrfecmviyiluubymsoeq.supabase.co') {
    errors.push('Supabase debe ser un proyecto de pruebas distinto de producción.');
  }

  // Public client keys are expected; service_role / secret keys MUST never appear.
  if (!key || key.length < 30) errors.push('Falta la clave pública de Supabase de pruebas.');
  if (/(service_role|sb_secret_)/i.test(key)) errors.push('Se detectó una clave privada; prohibido exponerla.');
  if (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY) {
    errors.push('Se detectaron credenciales secretas en el entorno de compilación web.');
  }
  return errors;
}

if (process.argv.includes('--self-test')) {
  const fake = {
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'feat/web-unified-portal-foundation',
    EXPO_PUBLIC_UCAPSA_REVIEW_BUILD: 'true',
    EXPO_PUBLIC_SUPABASE_URL: 'https://ucapsa-preview-sandbox.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_example_for_ci_only_000000000000',
  };
  const assert = (condition, label) => { if (!condition) throw new Error(label); };
  assert(validatePreviewEnvironment(fake).length === 0, 'La configuración válida debe pasar');
  assert(validatePreviewEnvironment({ ...fake, EXPO_PUBLIC_SUPABASE_URL: 'https://hrfecmviyiluubymsoeq.supabase.co' }).length > 0,
    'Debe rechazarse producción');
  assert(validatePreviewEnvironment({ ...fake, CF_PAGES_BRANCH: 'main' }).length > 0,
    'Debe rechazarse main');
  assert(validatePreviewEnvironment({ ...fake, EXPO_PUBLIC_UCAPSA_REVIEW_BUILD: '' }).length > 0,
    'Debe exigirse modo de revisión');
  assert(validatePreviewEnvironment({ ...fake, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_example0000000000000000' }).length > 0,
    'Debe rechazarse una clave secreta');
  assert(validatePreviewEnvironment({ ...fake, EXPO_PUBLIC_SUPABASE_URL: 'https://ci-web-export.invalid' }).length > 0,
    'Debe rechazarse un endpoint ficticio para publicación');
  console.log('UCAPSA preview environment guard: PASS');
} else {
  const errors = validatePreviewEnvironment(process.env);
  if (errors.length) {
    for (const error of errors) console.error('BLOQUEADO: ' + error);
    process.exit(1);
  }
  console.log('UCAPSA preview environment guard: PASS (Cloudflare Access requiere validación externa).');
}
