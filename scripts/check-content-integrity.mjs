import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-content-text-integrity.sql', 'utf8');
const events = fs.readFileSync('src/services/events.service.ts', 'utf8');
const announcements = fs.readFileSync('src/services/announcements.mutations.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const token of [
  'events_title_not_blank',
  "check (btrim(title) <> '')",
  'announcements_title_not_blank',
  'announcements_content_not_blank',
  "check (btrim(content) <> '')",
]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) {
    throw new Error('Content DB invariant missing: ' + token);
  }
}

for (const token of [
  'normalizeRequiredEventTitle',
  "if (!title) throw new Error('Agrega un titulo al evento.')",
]) {
  if (!events.includes(token)) {
    throw new Error('Event service invariant missing: ' + token);
  }
}

for (const token of [
  'normalizeRequiredAnnouncementText',
  "normalizeRequiredAnnouncementText(input.title, 'titulo')",
  "normalizeRequiredAnnouncementText(input.content, 'contenido')",
]) {
  if (!announcements.includes(token)) {
    throw new Error('Announcement service invariant missing: ' + token);
  }
}

if (/title:\s*input\.title\.trim\(\)/.test(events)) {
  throw new Error('Event writes returned to trim-only title handling.');
}
if (/title:\s*input\.title\.trim\(\)|content:\s*input\.content\.trim\(\)/.test(announcements)) {
  throw new Error('Announcement writes returned to trim-only required text handling.');
}

if (!pkg.includes('"check:content-integrity"')) {
  throw new Error('npm verify does not include content integrity guard.');
}

console.log('UCAPSA event/announcement text invariants: PASS');
