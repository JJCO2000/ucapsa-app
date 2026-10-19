import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const read=(path)=>fs.readFileSync(path,'utf8');
const policy=read('supabase/functions/_shared/restaurant-sunday-reminder.ts');
const js=ts.transpileModule(policy,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{module,exports:module.exports,Date});
const accept=module.exports.isSaturdayForSundayMenu;
assert.equal(typeof accept,'function');

const cases=[
 ['2026-10-17','2026-10-18','class_24h',1,true],
 ['2026-10-24','2026-10-25','class_24h',1,true],
 ['2026-10-18','2026-10-19','class_24h',1,false],
 ['2026-10-17','2026-10-19','class_24h',1,false],
 ['2026-10-17','2026-10-18','class_72h',1,false],
 ['2026-10-17','2026-10-18','class_24h',2,false],
 ['2026-10-17','2026-10-11','class_24h',1,false],
 ['2026-02-30','2026-03-01','class_24h',1,false],
 ['','2026-10-18','class_24h',1,false],
];
for(const [today,next,type,days,expected] of cases){
 assert.equal(accept(today,next,type,days),expected,
  [today,next,type,days].join(' / '));
}
const edge=read('supabase/functions/send-class-reminders/index.ts');
const nav=read('src/hooks/useNotificationNavigation.ts');
const sql=read('supabase/migrations/20261019001500_restaurant_publication_ssot.sql');
const service=read('src/services/restaurant-menu.service.ts');
const publicScreen=read('src/app/restaurant.tsx');
const admin=read('src/app/admin/restaurant.tsx');

for(const token of [
  "isSaturdayForSundayMenu(",
  "serviceClient.rpc('is_restaurant_menu_published')",
  "sundayMenuPublished = publication.data === true",
  "restaurant_menu: sundayMenuPublished",
  "'¿Se te antoja algo para mañana?'",
  "const reminderTargets =",
  "'ucapsa-classes'",
  "'class_reminder'",
]) assert.ok(edge.includes(token),'Edge notification pipeline missing '+token);
assert.ok(nav.includes("source === 'class_reminder' && data?.restaurant_menu === true"),
 'Only menu-tagged Sunday reminder opens the menu');
assert.ok(nav.includes("return '/restaurant'"));
assert.ok(nav.includes("if (source === 'class_reminder') return '/home'"),
 'Normal class reminders retain their route');
assert.ok(sql.includes('select true, exists (') && sql.includes('on conflict(id) do nothing'),
 'Migración debe conservar el menú público existente sin reactivar productos ocultos');
assert.ok(sql.includes('Public can read published restaurant categories') &&
 sql.includes('Public can read published restaurant items') &&
 sql.includes('public.is_restaurant_menu_published()') &&
 sql.includes('drop policy if exists "Public can read restaurant items"'),
 'RLS debe ocultar la lectura directa de productos del restaurante');
assert.ok(sql.includes('public.is_ucapsa_admin()') &&
 sql.includes('ucapsa_config.restaurant_publication') &&
 sql.includes("to anon,authenticated,service_role"),
 'Publication requires private SSOT, Admin and service access');
assert.ok(publicScreen.includes('const published = await isRestaurantMenuPublished()') &&
 publicScreen.indexOf('await isRestaurantMenuPublished()') <
 publicScreen.indexOf('await getCachedRestaurantMenu()') &&
 publicScreen.includes('if (!published)') &&
 publicScreen.includes('setSections([]);') &&
 publicScreen.includes('await cacheRestaurantMenu([])'),
 'La caché pública no puede saltarse el control de publicación ni sobrevivir a una revocación');
assert.ok(service.includes('if (!published) return []'),
 'Public menu must honor global publication');
assert.ok(admin.includes('setRestaurantMenuPublished(value)') &&
 admin.includes('visibleProductCount === 0'),
 'Admin must control publication without showing an empty menu');
console.log('UCAPSA restaurant Saturday push, Sunday menu, routes, role and publication: PASS');
