import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function must(rel, pattern, label) { if (!pattern.test(read(rel))) failures.push(label); }
function mustNot(rel, pattern, label) { if (pattern.test(read(rel))) failures.push(label); }

must('src/lib/supabase.ts', /createClient<Database>/, 'Supabase client no esta tipado con Database.');
const generated = read('src/types/database.generated.ts');
if (!/export (type|interface) Database/.test(generated)) failures.push('Falta Database generado desde Supabase.');
mustNot('src/types/database.types.ts', /Record<string,\s*never>/, 'Sigue activo el placeholder Record<string, never>.');
must('src/app/(tabs)/dog.tsx', /account-settings\?section=profile/, 'La pata con lapiz no abre Mis datos.');
mustNot('src/app/admin/classes.tsx', /TextInput\s+value=\{form\.dogName\}/, 'Admin Clases aun usa perro como texto libre al crear.');
mustNot('src/app/admin/classes.tsx', /TextInput\s+value=\{editForm\.dogName\}/, 'Admin Clases aun usa perro como texto libre al editar.');
mustNot('src/app/admin/customer-class.tsx', /<Field label="Perro"/, 'Ficha de clase aun usa perro como texto libre.');

mustNot('src/services/notifications.service.ts', /p_(device_name|device_id|app_ownership|app_version|project_id):[^\r\n]*\?\? null/, 'RPC de notificaciones envia null a argumentos opcionales tipados.');
mustNot('src/services/programs.service.ts', /p_(cycle_start_date|schedule_id|change_note|notes):[^\r\n]*(\?\? null|\|\| null)/, 'RPC de programas envia null a argumentos opcionales tipados.');

for (const rel of ['src/app/admin/classes.tsx', 'src/app/admin/customer-class.tsx', 'src/services/programs.service.ts']) {
  must(rel, /dogId/, `${rel} no conserva dogId como relacion explicita.`);
}

const srcRoot = path.join(root, 'src');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
for (const file of walk(srcRoot).filter((f) => /\.(ts|tsx)$/.test(f))) {
  const relFile = path.relative(root, file).replaceAll('\\', '/');
  const text = fs.readFileSync(file, 'utf8');
  if (/\d{18}/.test(text)) failures.push(`CLABE de 18 digitos hardcodeada en ${path.relative(root, file)}.`);
  if (!relFile.endsWith('src/types/database.generated.ts') && /[^\x00-\x7F]/.test(text)) failures.push(`Texto no ASCII detectado en ${relFile}.`);
}

if (failures.length) {
  console.error('SOURCE INTEGRITY FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('SOURCE INTEGRITY OK: tipos, perros, rutas criticas, ASCII y CLABE revisados.');
