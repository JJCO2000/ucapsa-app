import fs from 'node:fs';

const corePath = 'src/services/admin-competition-core.service.ts';
const examsBarrelPath = 'src/services/admin-competition-exams.service.ts';
const examDefinitionPath = 'src/services/admin-competition-exam-definition.service.ts';
const examAttemptsPath = 'src/services/admin-competition-exam-attempts.service.ts';
const examImportsPath = 'src/services/admin-competition-exam-imports.service.ts';
const readPath = 'src/services/admin-competition-read.service.ts';
const barrelPath = 'src/services/ucapsa-competition.service.ts';

const core = fs.readFileSync(corePath, 'utf8');
const examsBarrel = fs.readFileSync(examsBarrelPath, 'utf8');
const examDefinition = fs.readFileSync(examDefinitionPath, 'utf8');
const examAttempts = fs.readFileSync(examAttemptsPath, 'utf8');
const examImports = fs.readFileSync(examImportsPath, 'utf8');
const read = fs.readFileSync(readPath, 'utf8');
const barrel = fs.readFileSync(barrelPath, 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const expectedBarrel = [
  "export * from './admin-competition-core.service';",
  "export * from './admin-competition-exams.service';",
  "export * from './admin-competition-read.service';",
];

for (const line of expectedBarrel) {
  if (!barrel.includes(line)) {
    throw new Error('Competition compatibility barrel lost export: ' + line);
  }
}

const expectedExamBarrel = [
  "export * from './admin-competition-exam-definition.service';",
  "export * from './admin-competition-exam-attempts.service';",
  "export * from './admin-competition-exam-imports.service';",
];

for (const line of expectedExamBarrel) {
  if (!examsBarrel.includes(line)) {
    throw new Error('Competition exams compatibility barrel lost export: ' + line);
  }
}

for (const [name, text] of [
  ['competition barrel', barrel],
  ['competition exams barrel', examsBarrel],
]) {
  if (/\bsupabase\b|function\s+|type\s+[A-Za-z0-9_]+\s*=/.test(text)) {
    throw new Error(name + ' must remain a compatibility barrel without implementation.');
  }
}

const implementation = core + examDefinition + examAttempts + examImports + read;
if (/ucapsa-competition\.service/.test(implementation)) {
  throw new Error('A split competition module imports the compatibility barrel, creating a reverse dependency.');
}

if (/admin-competition-(?:exams|read|exam-definition|exam-attempts|exam-imports)\.service/.test(core)) {
  throw new Error('Competition core must not depend on higher-level competition modules.');
}

if (/admin-competition-exam-(?:attempts|imports)\.service/.test(examDefinition)) {
  throw new Error('Exam definition service must not depend on attempts/imports.');
}

if (/admin-competition-exam-imports\.service/.test(examAttempts)) {
  throw new Error('Exam attempts service must not depend on imports.');
}

for (const [name, text, tokens] of [
  ['core', core, ['getAdminCompetitionSeasons', 'addCompetitionAdjustment', 'grantCompetitionDogAward']],
  ['exam definition', examDefinition, ['getAdminCompetitionExamWorkspace', 'getAdminCompetitionExamDetail', 'deleteCompetitionExamItem']],
  ['exam attempts', examAttempts, ['getAdminCompetitionExamAttemptsWorkspace', 'createCompetitionExamAttempt', 'publishCompetitionExamAttempt']],
  ['exam imports', examImports, ['getAdminCompetitionExamImportWorkspace', 'createCompetitionExamImportBatch', 'revertCompetitionExamImportBatch']],
  ['read', read, ['getAdminCompetitionConstancyOverview', 'getAdminCompetitionRankingOverview']],
]) {
  for (const token of tokens) {
    if (!text.includes(token)) {
      throw new Error('Competition ' + name + ' boundary lost expected operation: ' + token);
    }
  }
}

for (const [name, text] of [
  ['exam definition', examDefinition],
  ['exam attempts', examAttempts],
  ['exam imports', examImports],
]) {
  if (!/from ['"]\.\/admin-competition-core\.service['"]/.test(text)) {
    throw new Error('Competition ' + name + ' must depend explicitly on core seasons.');
  }
}

if (!/from ['"]\.\/admin-competition-exam-definition\.service['"]/.test(examAttempts)) {
  throw new Error('Exam attempts must consume canonical exam definition types.');
}

if (!/from ['"]\.\/admin-competition-exam-definition\.service['"]/.test(examImports)
  || !/from ['"]\.\/admin-competition-exam-attempts\.service['"]/.test(examImports)) {
  throw new Error('Exam imports must consume canonical definition/attempt types.');
}

if (!/from ['"]\.\/admin-competition-core\.service['"]/.test(read)) {
  throw new Error('Competition read service must depend explicitly on core seasons/types.');
}

for (const [name, text, maxLines] of [
  ['competition core', core, 550],
  ['exam definition', examDefinition, 280],
  ['exam attempts', examAttempts, 340],
  ['exam imports', examImports, 320],
  ['competition read', read, 260],
  ['exam barrel', examsBarrel, 20],
]) {
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) {
    throw new Error(name + ' grew beyond its responsibility boundary: ' + lines + ' > ' + maxLines + '.');
  }
}

if (!pkg.includes('"check:competition-service-boundaries"')) {
  throw new Error('npm verify does not include the competition service boundary guard.');
}

console.log('UCAPSA admin competition service boundaries: PASS');
