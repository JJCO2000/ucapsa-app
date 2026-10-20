import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PREVIEW_BRANCH = 'feat/web-unified-portal-foundation';
const OUTPUT_DIR = path.resolve('dist-github-preview');
const PORT = 8081;
const DEMO_SUPABASE_URL = 'https://ci-web-export.invalid';
const DEMO_PUBLIC_KEY = 'ci-only-no-access-key';

// This is ONLY a read-only visual preview of the existing Expo Web interface.
// No passwords, production user identities or production Supabase endpoint.
function isolatedBuildEnvironment(base) {
  const clean = Object.fromEntries(
    Object.entries(base).filter(([name]) => !name.startsWith('EXPO_PUBLIC_') &&
      !/^SUPABASE_(?:SERVICE_ROLE|SECRET)/.test(name)),
  );
  return {
    ...clean,
    CI: '1',
    EXPO_PUBLIC_UCAPSA_REVIEW_BUILD: 'true',
    EXPO_PUBLIC_UCAPSA_CODESPACES_DEMO: 'true',
    EXPO_PUBLIC_SUPABASE_URL: DEMO_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: DEMO_PUBLIC_KEY,
  };
}

if (process.argv.includes('--self-test')) {
  const result = isolatedBuildEnvironment({
    CODESPACES: 'true',
    EXPO_PUBLIC_SUPABASE_URL: 'https://hrfecmviyiluubymsoeq.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'prod-key',
    EXPO_PUBLIC_SENSITIVE_SAMPLE: 'must-not-leak',
    SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
  });
  assert.equal(result.EXPO_PUBLIC_SUPABASE_URL, DEMO_SUPABASE_URL);
  assert.equal(result.EXPO_PUBLIC_SUPABASE_ANON_KEY, DEMO_PUBLIC_KEY);
  assert.equal(result.EXPO_PUBLIC_UCAPSA_REVIEW_BUILD, 'true');
  assert.equal(result.EXPO_PUBLIC_UCAPSA_CODESPACES_DEMO, 'true');
  assert.equal(result.EXPO_PUBLIC_SENSITIVE_SAMPLE, undefined);
  assert.equal(result.SUPABASE_SERVICE_ROLE_KEY, undefined);
  console.log('UCAPSA GitHub browser demo environment isolation: PASS');
  process.exit(0);
}

if (process.env.CODESPACES !== 'true') {
  throw new Error('Esta vista está permitida únicamente dentro de GitHub Codespaces.');
}

const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
if (branch !== PREVIEW_BRANCH) {
  throw new Error('Vista detenida: sólo está permitida la rama del PR #346.');
}

const build = spawnSync('npx', [
  '--no-install', 'expo', 'export', '--platform', 'web',
  '--output-dir', OUTPUT_DIR, '--clear',
], {
  cwd: process.cwd(),
  env: isolatedBuildEnvironment(process.env),
  stdio: 'inherit',
});

if (build.error || build.status !== 0) {
  throw build.error || new Error('Expo Web no compiló; no se abrió una vista incompleta.');
}
if (!fs.existsSync(path.join(OUTPUT_DIR, 'index.html'))) {
  throw new Error('La exportación web no generó index.html.');
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  let requested;
  try {
    requested = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const candidate = path.resolve(OUTPUT_DIR, '.' + requested);
  if (candidate !== OUTPUT_DIR && !candidate.startsWith(OUTPUT_DIR + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  const choices = [
    candidate,
    candidate + '.html',
    path.join(candidate, 'index.html'),
  ];
  const file = choices.find((name) => {
    try { return fs.statSync(name).isFile(); } catch { return false; }
  }) ?? (path.extname(candidate) ? null : path.join(OUTPUT_DIR, 'index.html'));

  if (!file || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end('No encontrado');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log('UCAPSA demo web (SIN DATOS): abre el puerto privado ' + PORT + ' en GitHub Codespaces.');
  console.log('No marques el puerto como público. Detén el Codespace al finalizar.');
});
