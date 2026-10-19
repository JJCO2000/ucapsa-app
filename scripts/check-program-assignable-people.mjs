import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const service=readFileSync('src/services/program-enrollments.service.ts','utf8');
const screen=readFileSync('src/app/admin/classes.tsx','utf8');
const capabilities=readFileSync('src/constants/roleCapabilities.ts','utf8');

for (const [name,source,kind] of [
 ['service',service,ts.ScriptKind.TS],
 ['screen',screen,ts.ScriptKind.TSX],
]) {
 const tree=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,kind);
 assert.equal(tree.parseDiagnostics.length,0,name+' syntactic regression');
}
assert.ok(service.includes('export async function getProgramAssignableProfiles()'));
const start=service.indexOf('export async function getProgramAssignableProfiles()');
const end=service.indexOf('export async function createProgramEnrollment',start);
assert.ok(start>=0 && end>start,'Canonical profile lookup missing');
const query=service.slice(start,end);
assert.ok(query.includes(".from('profiles')") && query.includes(".select('*')"));
assert.ok(!query.includes(".in('role'")&&!query.includes(".eq('role'"),
 'An Entrenador/Superadmin también puede ser tutor de Puppy y Comandos');
assert.ok(screen.includes('getProgramAssignableProfiles()'),
 'Admin must be able to select any existing tutor');
assert.ok(screen.includes('Persona responsable del perro'));
assert.ok(screen.includes("program.code === 'comandos'") || screen.includes("selectedProgram?.code === 'comandos'"),
 'Comandos levels must remain a single program, separate from the user role');
assert.ok(capabilities.includes("if (role === 'trainer') return TRAINER;"));
assert.ok(!query.includes(".from('memberships')"),
 'A program enrollment cannot depend on being Socio');
console.log('UCAPSA: staff may also own dogs, program enrollment independent of operational role PASS');
