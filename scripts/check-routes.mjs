import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appRoot = path.join(root, 'src', 'app');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function routeForFile(file) {
  const rel = path.relative(appRoot, file).replaceAll('\\', '/').replace(/\.tsx?$/, '');
  const parts = rel.split('/').filter((part) => !/^\(.+\)$/.test(part));
  if (parts.at(-1) === '_layout' || parts.at(-1)?.startsWith('+')) return null;
  if (parts.at(-1) === 'index') parts.pop();
  return '/' + parts.join('/');
}

const appFiles = walk(appRoot).filter((file) => /\.tsx?$/.test(file));
const routes = new Set(appFiles.map(routeForFile).filter(Boolean));
routes.add('/');

const sourceFiles = walk(path.join(root, 'src')).filter((file) => /\.(ts|tsx)$/.test(file));
const refs = [];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/['"`]\/(?!\/)([^'"`\s]*)['"`]/g)) {
    const raw = '/' + match[1];
    if (raw.includes('${') || raw.includes('://')) continue;
    const route = raw.split('?')[0].replace(/\/$/, '') || '/';
    if (route.startsWith('/api/')) continue;
    refs.push({ file: path.relative(root, file), route });
  }
}

const missing = refs.filter(({ route }) => !routes.has(route));
if (missing.length) {
  console.error('Rutas estaticas sin destino:');
  for (const item of missing) console.error(`- ${item.route} <- ${item.file}`);
  process.exit(1);
}
console.log(`ROUTES OK: ${routes.size} rutas; ${refs.length} referencias estaticas revisadas.`);
