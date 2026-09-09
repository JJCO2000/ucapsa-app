import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function must(rel, pattern, message) {
  if (!pattern.test(read(rel))) failures.push(message);
}

function mustNot(rel, pattern, message) {
  if (pattern.test(read(rel))) failures.push(message);
}

const criticalTabs = {
  'src/app/(tabs)/announcements.tsx': 'anuncios',
  'src/app/(tabs)/classes.tsx': 'clases',
  'src/app/(tabs)/dog.tsx': 'perros',
  'src/app/(tabs)/payments.tsx': 'pagos',
};

for (const [rel, label] of Object.entries(criticalTabs)) {
  mustNot(rel, new RegExp(`Cargando\\s+${label}`, 'i'), `${rel} volvió a bloquear la UI con “Cargando ${label}”.`);
  mustNot(rel, /ActivityIndicator/, `${rel} volvió a usar un spinner bloqueante en la vista crítica.`);
}

must('src/app/_layout.tsx', /warmClientOfflineData\(user\.id\)/, 'El arranque autenticado ya no prepara la instantánea offline completa.');
must('src/services/client-offline-sync.service.ts', /Promise\.allSettled/, 'La sincronización offline dejó de aislar fallos por recurso.');
must('src/services/client-offline-sync.service.ts', /clientReadKeys\.dogs/, 'La preparación offline ya no incluye perros.');
must('src/services/client-offline-sync.service.ts', /clientReadKeys\.programs/, 'La preparación offline ya no incluye clases/programas.');
must('src/services/client-offline-sync.service.ts', /clientReadKeys\.paymentSummary/, 'La preparación offline ya no incluye el resumen de pagos.');
must('src/services/client-offline-sync.service.ts', /clientReadKeys\.announcements/, 'La preparación offline ya no incluye anuncios.');

must('src/components/ui/UcapsaDetailModal.tsx', /justifyContent:\s*'center'/, 'El modal de detalle dejó de estar centrado.');
must('src/components/ui/UcapsaDetailModal.tsx', /maxWidth:\s*560/, 'El modal de detalle perdió su límite adaptable para tablet.');
must('src/components/ui/UcapsaDetailModal.tsx', /width:\s*48[\s\S]*height:\s*48/, 'El botón de cierre del modal volvió a quedar debajo de 48dp.');
must('src/components/ui/OfflineDataNotice.tsx', /width:\s*48[\s\S]*height:\s*48/, 'Reintentar sincronización volvió a quedar debajo de 48dp.');
must('src/components/ui/Screen.tsx', /maxWidth:\s*820/, 'El contenedor principal perdió su límite adaptable en pantallas anchas.');
must('src/app/(tabs)/_layout.tsx', /tabBarLabelStyle:\s*\{\s*fontSize:\s*11/, 'La barra inferior volvió a usar etiquetas demasiado pequeñas.');

mustNot(
  'src/app/(tabs)/announcements.tsx',
  /sectionTitle[^\n]*ucapsaBrand\.colors\.surface/,
  'Anuncios volvió a dibujar “Avisos publicados” casi blanco sobre el fondo premium.',
);

function token(source, name) {
  const match = new RegExp(`${name}:\\s*['\"](#[0-9A-Fa-f]{6})['\"]`).exec(source);
  if (!match) throw new Error(`No se encontró el token ${name}.`);
  return match[1];
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const raw = hex.slice(1);
  const r = channel(Number.parseInt(raw.slice(0, 2), 16));
  const g = channel(Number.parseInt(raw.slice(2, 4), 16));
  const b = channel(Number.parseInt(raw.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const high = Math.max(l1, l2);
  const low = Math.min(l1, l2);
  return (high + 0.05) / (low + 0.05);
}

const brand = read('src/constants/brand.ts');
const premiumAction = token(brand, 'premiumAction');
const premiumMuted = token(brand, 'premiumMuted');
const premiumBackground = token(brand, 'premiumBackground');
const premiumSurface = token(brand, 'premiumSurface');
const premiumHero = token(brand, 'premiumHero');

for (const [foregroundName, foreground] of [['premiumAction', premiumAction], ['premiumMuted', premiumMuted]]) {
  for (const [backgroundName, background] of [['premiumBackground', premiumBackground], ['premiumSurface', premiumSurface], ['premiumHero', premiumHero]]) {
    const ratio = contrast(foreground, background);
    if (ratio < 4.5) {
      failures.push(`${foregroundName} sobre ${backgroundName} tiene contraste ${ratio.toFixed(2)}:1; mínimo requerido para texto normal: 4.5:1.`);
    }
  }
}

if (failures.length) {
  console.error('UI QUALITY FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('UI QUALITY OK: offline-first crítico, contraste AA, modal, tamaños táctiles y layout adaptable revisados.');
