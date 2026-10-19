import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTsModule(path, dependencies={}) {
  const js = ts.transpileModule(fs.readFileSync(path,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    reportDiagnostics:true,
  });
  assert.equal(js.diagnostics?.length ?? 0,0,'TypeScript transform failed for '+path);
  const mod={exports:{}};
  const require=(name)=>{
    if (!(name in dependencies)) throw new Error('unexpected dependency: '+name);
    return dependencies[name];
  };
  vm.runInNewContext(js.outputText,{module:mod,exports:mod.exports,require});
  return mod.exports;
}

const roles=loadTsModule('src/constants/roleCapabilities.ts');
const { projectUcapsaAccess }=loadTsModule(
  'src/services/access-projection.domain.ts',
  {'../constants/roleCapabilities':roles},
);
assert.equal(typeof projectUcapsaAccess,'function');

const membership=['none','pending','active','cancelled'];
const who=['client','member','trainer','admin','super_admin'];
for(const role of who) for(const membershipStatus of membership){
  const x=projectUcapsaAccess({
    actualRole:role,membershipStatus,programEnrollments:[],
    previewRole:'admin',
  });
  assert.equal(x.commercial.hasActiveSocioMembership,membershipStatus==='active');
  assert.equal(x.commercial.hasActivePuppyEnrollment,false);
  assert.equal(x.commercial.hasActiveComandosEnrollment,false);
  assert.equal(x.operational.capabilities.canManagePayments,
    role==='admin'||role==='super_admin');
  assert.equal(x.operational.capabilities.canManageStaffRoles,role==='super_admin');
  assert.equal(x.presentation.canPreview,role==='super_admin');
  assert.equal(x.presentation.displayRole,role==='super_admin'?'admin':role);
  assert.equal(x.identity.actualRole,role);
}
const trainerWithSocio=projectUcapsaAccess({
 actualRole:'trainer', membershipStatus:'active',
 programEnrollments:[{programCode:'comandos',status:'active'}],
});
assert.equal(trainerWithSocio.commercial.hasActiveSocioMembership,true);
assert.equal(trainerWithSocio.commercial.hasActiveComandosEnrollment,true);
assert.equal(trainerWithSocio.commercial.hasActivePuppyEnrollment,false);
assert.equal(trainerWithSocio.operational.capabilities.canManageMemberships,false);
assert.equal(trainerWithSocio.operational.capabilities.canRecordAttendance,true);

const clientWithTwoPrograms=projectUcapsaAccess({
 actualRole:'client', membershipStatus:'none',
 programEnrollments:[
   {programCode:'puppy',status:'completed'},
   {programCode:'comandos',status:'active'},
 ],
});
assert.equal(clientWithTwoPrograms.commercial.hasActiveSocioMembership,false);
assert.equal(clientWithTwoPrograms.commercial.hasHistoricalPuppyEnrollment,true);
assert.equal(clientWithTwoPrograms.commercial.hasActivePuppyEnrollment,false);
assert.equal(clientWithTwoPrograms.commercial.hasActiveComandosEnrollment,true);
assert.equal(clientWithTwoPrograms.operational.capabilities.canRecordAttendance,false);

const superPreview=projectUcapsaAccess({
 actualRole:'super_admin',membershipStatus:'active',programEnrollments:[],
 previewRole:'client',
});
assert.equal(superPreview.presentation.displayRole,'client');
assert.equal(superPreview.operational.capabilities.canManageStaffRoles,true,
 'Preview must never change actual permissions');
assert.equal(superPreview.identity.actualRole,'super_admin');

const noSession=projectUcapsaAccess({
 actualRole:null,membershipStatus:null,programEnrollments:[],
 previewRole:'super_admin',
});
assert.equal(noSession.presentation.canPreview,false);
assert.equal(noSession.operational.capabilities.canManageStaffRoles,false);
assert.equal(noSession.presentation.displayRole,null);

// Actual permissions always come from roleCapabilities, never from active
// membership, Puppy/Comandos or presentation mode.
for (const role of who) {
 const a=roles.getRoleCapabilities(role);
 const b=projectUcapsaAccess({actualRole:role,membershipStatus:'active',
   programEnrollments:[{programCode:'puppy',status:'active'}],
   previewRole:'super_admin'});
 assert.deepEqual(JSON.parse(JSON.stringify(b.operational.capabilities)),
   JSON.parse(JSON.stringify(a)));
}
// Admin must be able to select any existing account's dog for Puppy/Comandos,
// even if the owner is Trainer/Admin or has a separate Socio membership.
const enrollmentService = fs.readFileSync('src/services/program-enrollments.service.ts','utf8');
const candidates = enrollmentService.slice(
 enrollmentService.indexOf('export async function getProgramClientProfiles()'),
 enrollmentService.indexOf('export async function createProgramEnrollment('),
);
assert.ok(candidates.includes(".from('profiles')") && candidates.includes(".select('*')"),
  'Program candidates derive from canonical profiles');
assert.ok(!candidates.includes(".in('role'") && !candidates.includes(".eq('role'"),
  'Trainer, Admin, Superadmin and Socio cannot be excluded by operational role');
assert.ok(candidates.includes('if (error) throw error'),
  'RLS or database read failures must remain visible, never silently skip customers');

console.log('UCAPSA source separation: operational role vs Socio vs Puppy/Comandos vs preview PASS');
