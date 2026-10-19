import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code=fs.readFileSync('src/services/admin-directory-classification.domain.ts','utf8');
const compiled=ts.transpileModule(code,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const module={exports:{}};
vm.runInNewContext(compiled,{module,exports:module.exports});
const { getDirectoryCounts, matchesDirectoryFilter, directoryStatusLabel }=module.exports;
const profiles=[
 {user_id:'c',role:'client'},
 {user_id:'m',role:'member'},
 {user_id:'t',role:'trainer'},
 {user_id:'a',role:'admin'},
 {user_id:'s',role:'super_admin'},
 {user_id:'x',role:'member'}, // legacy member role, membership cancelled
];
const active=new Set(['m','t','a']);
const counts=getDirectoryCounts(profiles,active);
assert.equal(counts.total,6);
assert.equal(counts.clients,2); // c and x
assert.equal(counts.members,3); // m, trainer t, admin a
assert.equal(counts.staff,3); // t,a,s
assert.equal(matchesDirectoryFilter(profiles[2],'members',active),true);
assert.equal(matchesDirectoryFilter(profiles[2],'admins',active),true);
assert.equal(matchesDirectoryFilter(profiles[2],'clients',active),false);
assert.equal(matchesDirectoryFilter(profiles[5],'members',active),false);
assert.equal(matchesDirectoryFilter(profiles[5],'clients',active),true);
assert.equal(matchesDirectoryFilter(profiles[4],'clients_and_members',active),true);
assert.equal(directoryStatusLabel(profiles[2],active),'Entrenador · Socio');
assert.equal(directoryStatusLabel(profiles[3],active),'Admin · Socio');
assert.equal(directoryStatusLabel(profiles[5],active),'Cliente');
const screen=fs.readFileSync('src/app/admin/users.tsx','utf8');
const membershipService=fs.readFileSync('src/services/memberships-admin.service.ts','utf8');
for(const item of [
  'getAdminActiveMembershipUserIds',
  'getDirectoryCounts(profiles, activeMemberIds)',
  'directoryStatusLabel(item, activeMemberIds)',
  'matchesDirectoryFilter(profile, filter, activeMemberIds)',
  'value={counts.total}',
  'value={counts.members}',
]) assert.ok(screen.includes(item), 'Directory UI missing '+item);
assert.ok(membershipService.includes(".eq('status', 'active')"),
  'Socio must come from actual active memberships');
assert.ok(!screen.includes("members: profiles.filter((profile) => profile.role === 'member')"),
  'Legacy role-only Socio count is forbidden');
console.log('UCAPSA directory counts: SSOT, overlap, cancelled, filters PASS');
