import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
const forbidden = [
  /^\.ucapsa-backups\//,
  /^supabase\/\.temp\//,
  /(^|\/)node_modules\//,
  /(^|\/)dist(-ci)?\//,
  /(^|\/)build\//,
  /\.zip$/i,
  /\.log$/i,
  /(^|\/)\.env($|\.)/,
  /\.(jks|keystore|p8|p12|pem|key|mobileprovision)$/i,
];

for (const rel of tracked) {
  const normalized = rel.replaceAll('\\', '/');
  if (forbidden.some((pattern) => pattern.test(normalized)) && normalized !== '.env.example') {
    failures.push(`Archivo basura/secreto rastreado: ${normalized}`);
    continue;
  }
  const absolute = path.join(root, rel);
  if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
    const size = fs.statSync(absolute).size;
    if (size > 5 * 1024 * 1024) failures.push(`Archivo rastreado mayor a 5 MB: ${normalized}`);
    if (normalized.startsWith('supabase/sql/audit/') && size <= 3) failures.push(`Artefacto de auditoría vacío/inválido: ${normalized}`);
  }
}

if (failures.length) {
  console.error('REPO HYGIENE FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`REPO HYGIENE OK: ${tracked.length} archivos rastreados; sin backups, ZIPs, logs, secretos ni archivos >5 MB.`);
