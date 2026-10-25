import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const settings=fs.readFileSync('src/app/account-settings.tsx','utf8');
const platformDialog=fs.readFileSync('src/utils/staff-dialog.ts','utf8');
const notice=fs.readFileSync('docs/legal/BORRADOR_AVISO_PRIVACIDAD_UCAPSA_APP_1_4_NO_VIGENTE.md','utf8');
const safety=fs.readFileSync('docs/legal/GOOGLE_PLAY_DATA_SAFETY.md','utf8');
const play=fs.readFileSync('docs/legal/GOOGLE_PLAY_SUBMISSION.md','utf8');
const publicNotice=fs.readFileSync('docs/legal/AVISO_PRIVACIDAD_UCAPSA_APP.md','utf8');

for(const token of [
  "import { showPlatformDialog } from '../utils/staff-dialog'",
  "'Cerrar sesión'",
  "setSigningOut(true)",
  "await signOut()",
  "showPlatformDialog('No se pudo cerrar sesión'",
  "accessibilityLabel=\"Cerrar sesión\"",
  "disabled={signingOut}",
  "showPlatformDialog(\n      'Eliminar mi cuenta'",
  "showPlatformDialog('Cuenta eliminada'",
])assert.ok(settings.includes(token),'Missing Android/web session notice: '+token);
assert.ok(platformDialog.includes('window.confirm') && platformDialog.includes('Alert.alert'),
  'Confirmation must work on web and Android without a new dependency.');
for(const token of [
  'NO VIGENTE / NO PUBLICAR',
  'Para integrantes familiares preinscritos',
  'sin crearles una cuenta, membresía, historial o acceso',
  'La vinculación entre cuentas y la consulta de progreso ajeno **no están habilitadas**',
])assert.ok(notice.includes(token),'Draft privacy notice is missing: '+token);
assert.match(notice,/un dato de contacto no autoriza por sí solo acceso entre cuentas/i,
  'Draft must explicitly reject authorization from family contact alone.');
assert.ok(safety.includes('Preinscripciones y familiares sin cuenta'));
assert.ok(play.includes('Reconciliar versión 1.2 publicada en Supabase'));
assert.ok(publicNotice.includes('Versión 1.3 App Stores') && !publicNotice.includes('Versión 1.4 App Stores'),
  'The release must not silently claim privacy v1.4 is published.');

const parsed=ts.createSourceFile('settings.tsx',settings,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length,0,'Account settings TSX parse errors');
let target;
function walk(node) {
  if(ts.isFunctionDeclaration(node) && node.name?.text==='confirmSignOut')target=node;
  ts.forEachChild(node,walk);
}
walk(parsed);
assert.ok(target,'Must exercise the real confirmSignOut function');
const compiled=ts.transpileModule('exports.confirm = '+target.getText(parsed)+';',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function makeHarness({busy=false,rejectSignout=false}={}) {
  const events=[],dialogs=[];
  let signOutCount=0;
  const exports={};
  vm.runInNewContext(compiled,{
    exports,Error,signingOut:busy,
    showPlatformDialog:(title,message,buttons)=>{
      dialogs.push({title,message,buttons});events.push('dialog:'+title);
    },
    setSigningOut:v=>events.push('busy:'+v),
    signOut:async()=>{
      signOutCount++;events.push('signOut');
      if(rejectSignout)throw new Error('network outage');
    },
    router:{replace:path=>events.push('route:'+path)},
    devWarn:()=>events.push('warning'),
  });
  return {confirm:exports.confirm,dialogs,events,signOutCount:()=>signOutCount};
}
{
  const h=makeHarness();await h.confirm();
  assert.equal(h.dialogs.length,1);
  assert.equal(h.dialogs[0].title,'Cerrar sesión');
  assert.equal(h.dialogs[0].buttons[0].style,'cancel');
  assert.equal(h.signOutCount(),0,'Displaying confirmation does not close session');
  await h.dialogs[0].buttons[1].onPress();
  assert.deepEqual(h.events,['dialog:Cerrar sesión','busy:true','signOut',
    'route:/auth/login','busy:false']);
}
{
  const h=makeHarness({busy:true});await h.confirm();
  assert.equal(h.dialogs.length,0);
}
{
  const h=makeHarness({rejectSignout:true});await h.confirm();
  await h.dialogs[0].buttons[1].onPress();
  assert.equal(h.signOutCount(),1);
  assert.ok(h.dialogs.some(d=>d.title==='No se pudo cerrar sesión'));
  assert.ok(!h.events.some(e=>e.startsWith('route:')),
    'Failed signOut must not navigate as if it succeeded');
  assert.equal(h.events.at(-1),'busy:false');
}
console.log('UCAPSA Android/web legal/session notices: privacy draft separated, signout cancel/error/success, deletion web confirmation and release gap PASS');
