import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.resolve(process.argv[2] || 'dist-ci-web');

function gather(current) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((item) => {
    const target = path.join(current, item.name);
    if (item.isDirectory()) return gather(target);
    return item.isFile() && /\.(?:js|html)$/.test(item.name) ? [target] : [];
  });
}

assert.ok(fs.existsSync(path.join(outputDir, 'index.html')),
  'La vista web no generó index.html.');
const files = gather(outputDir);
assert.ok(files.length > 0, 'La exportación web no contiene scripts para auditar.');

let containsBanner = false;
let containsDisabledSignIn = false;
let containsFakeEndpoint = false;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('DEMO VISUAL')) containsBanner = true;
  if (source.includes('DEMO SIN INGRESO')) containsDisabledSignIn = true;
  if (source.includes('ci-web-export.invalid')) containsFakeEndpoint = true;
}

assert.ok(containsBanner, 'La compilación web no está marcada como demo visual.');
assert.ok(containsDisabledSignIn,
  'La compilación demo perdió el bloqueo visual de ingreso.');
assert.ok(containsFakeEndpoint,
  'La compilación demo no usa el endpoint aislado y ficticio.');

console.log('UCAPSA GitHub demo bundle: PASS (visual-only / no login / no real data).');
