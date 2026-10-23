import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/utils/staff-dialog.ts','utf8');
const screen=fs.readFileSync('src/app/(tabs)/trainer-classes.tsx','utf8');
const rendered=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const events=[];
const platform={OS:'web'};
let accepted=false;
const context={exports:{},module:{exports:{}},
  require:(name)=>{
    assert.equal(name,'react-native');
    return {
      Platform:platform,
      Alert:{alert:(title,message,buttons)=>events.push(['native',title,message,buttons])},
    };
  },
  window:{
    confirm:(message)=>{events.push(['confirm',message]);return accepted;},
    alert:(message)=>events.push(['notice',message]),
  },
};
context.module.exports=context.exports;
vm.runInNewContext(rendered,context);
const show=context.exports.showStaffDialog;
assert.equal(typeof show,'function');
let called=0;
const options=[
  {text:'Cancelar',style:'cancel',onPress:()=>{throw Error('cancel invoked');}},
  {text:'Registrar',onPress:()=>{called++;}},
];
show('Asistencia','¿Confirmas asistencia?',options);
assert.equal(called,0,'Web rejection must never record attendance');
assert.deepEqual(events.map(x=>x[0]),['confirm']);
accepted=true;
show('Asistencia','¿Confirmas asistencia?',options);
assert.equal(called,1,'Web approval must call the affirmative action exactly once');
show('Notificación','Guardado correctamente');
assert.equal(events.at(-1)[0],'notice','Web success/failure messages must be visible');
const noButtons=[{text:'Cancelar',style:'cancel'}];
show('No permission','Cannot do this',noButtons);
assert.equal(called,1,'Do not choose any action without affirmative handler');
platform.OS='android';
show('Asistencia','¿Confirmas asistencia?',options);
assert.equal(events.at(-1)[0],'native','Native must preserve Alert.alert button modal');
assert.equal(events.at(-1)[3],options,'Native must preserve original button style/handlers');
assert.equal(called,1,'Native requires user action before recording');
const sourceCalls=screen.match(/showStaffDialog\(/g)||[];
assert.ok(sourceCalls.length>=8,'All trainer roster dialogs must use web/native helper.');
assert.ok(!screen.includes('Alert.alert('),'Trainer roster must not use unavailable web Alert API.');
for(const token of [
  'Registrar asistencia',
  'Registrar ausencia',
  'Enviar a revisión de socio',
  'Solicitar revisión de socio',
  'Registrar',
  'No asistió',
  'onPress: async () =>',
  'registerStaffPreregisteredAttendance',
  'registerStaffAttendance',
  'markStaffAbsence',
  'requestMembershipReviewFromStaff',
])assert.ok(screen.includes(token),'The existing trainer actions must remain connected: '+token);
console.log('UCAPSA Trainer roster dialogs: web reject/accept/notice and native buttons PASS');
