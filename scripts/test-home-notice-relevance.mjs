import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Ejecuta el selector real, no una copia de su lógica. Sin conexión a Supabase.
const source = fs.readFileSync('src/services/announcements.reads.ts', 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const result = {};
vm.runInNewContext(code, {
  exports: result,
  require: (id) => {
    if (id === '../lib/supabase') return { supabase: {} };
    throw new Error('Dependencia no esperada: ' + id);
  },
  Date,
  Math,
  Number,
}, { timeout: 1000 });
assert.equal(typeof result.rankHomeAnnouncements, 'function');

const now = new Date(2026, 9, 21, 12, 0, 0);
const base = {
  id: 'base', is_published: true, is_pinned: false,
  priority: 'normal', archived_at: null, event: null,
  announcement_date: null, created_at: '2026-10-21T12:00:00',
};
function notice(id, patch = {}) { return { ...base, id, ...patch }; }
const rows = [
  notice('future-pinned-cancellation', { priority: 'high', is_pinned: true, announcement_date: '2026-12-27T12:00:00' }),
  notice('expired-cancellation', { priority: 'high', is_pinned: true, announcement_date: '2026-07-05T12:00:00' }),
  notice('restored-archived', { priority: 'high', is_pinned: true, announcement_date: '2026-10-22T12:00:00', archived_at: '2026-10-21T13:00:00' }),
  notice('unpublished', { priority: 'urgent', announcement_date: '2026-10-22T12:00:00', is_published: false }),
  notice('tomorrow-cancellation', { priority: 'high', is_pinned: true, announcement_date: '2026-10-22T12:00:00' }),
  notice('within-14-days', { announcement_date: '2026-11-03T12:00:00' }),
  notice('after-14-days', { priority: 'urgent', is_pinned: true, announcement_date: '2026-11-06T12:00:00' }),
  notice('fresh-undated-urgent', { priority: 'urgent', created_at: '2026-10-19T12:00:00' }),
  notice('stale-undated-pinned', { priority: 'high', is_pinned: true, created_at: '2026-09-01T12:00:00' }),
  notice('normal-undated', { priority: 'normal' }),
];
const chosen = result.rankHomeAnnouncements(rows, 20, now);
const ids = Array.from(chosen, row => row.id);
assert.deepEqual(ids.slice().sort(), ['tomorrow-cancellation', 'within-14-days', 'fresh-undated-urgent'].sort());
assert.equal(ids[0], 'tomorrow-cancellation', 'Una cancelación próxima debe tener prioridad.');
assert.equal(result.rankHomeAnnouncements(rows, 1, now).length, 1);
console.log('UCAPSA Inicio: relevancia, vigencia y cancelaciones próximas PASS');
