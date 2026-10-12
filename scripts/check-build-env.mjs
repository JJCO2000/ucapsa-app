const required = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
];

const missing = required.filter((name) => !String(process.env[name] ?? '').trim());

if (missing.length) {
  console.error('BUILD ENV FAIL: faltan variables requeridas por UCAPSA en el entorno EAS:');
  for (const name of missing) console.error(`- ${name}`);
  process.exit(1);
}

const url = String(process.env.EXPO_PUBLIC_SUPABASE_URL);
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
  console.error('BUILD ENV FAIL: EXPO_PUBLIC_SUPABASE_URL no tiene el formato esperado.');
  process.exit(1);
}

// An isolated Google Play review build must NEVER target production.
if (process.env.EXPO_PUBLIC_UCAPSA_REVIEW_BUILD === 'true') {
  if (new URL(url).hostname === 'hrfecmviyiluubymsoeq.supabase.co') {
    console.error('BUILD ENV FAIL: el build de revision no puede conectarse a produccion.');
    process.exit(1);
  }
  if (process.env.EXPO_PUBLIC_UCAPSA_REVIEW_BUILD !== 'true') {
    console.error('BUILD ENV FAIL: revision no configurada.');
    process.exit(1);
  }
  console.log('BUILD ENV OK: revision aislada, URL distinta de produccion.');
}
console.log('BUILD ENV OK: Supabase URL y anon key estan disponibles para el bundle.');
