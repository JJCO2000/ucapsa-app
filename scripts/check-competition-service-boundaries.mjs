import fs from 'node:fs';

const corePath = 'src/services/admin-competition-core.service.ts';
const seasonsPath = 'src/services/admin-competition-seasons.service.ts';
const adjustmentsPath = 'src/services/admin-competition-adjustments.service.ts';
const awardsPath = 'src/services/admin-competition-awards.service.ts';
const examsBarrelPath = 'src/services/admin-competition-exams.service.ts';
const examDefinitionPath = 'src/services/admin-competition-exam-definition.service.ts';
const examAttemptsPath = 'src/services/admin-competition-exam-attempts.service.ts';
const examImportsPath = 'src/services/admin-competition-exam-imports.service.ts';
const readPath = 'src/services/admin-competition-read.service.ts';
const barrelPath = 'src/services/ucapsa-competition.service.ts';

const core = fs.readFileSync(corePath, 'utf8');
const seasons = fs.readFileSync(seasonsPath, 'utf8');
const adjustments = fs.readFileSync(adjustmentsPath, 'utf8');
const awards = fs.readFileSync(awardsPath, 'utf8');
const examsBarrel = fs.readFileSync(examsBarrelPath, 'utf8');
const examDefinition = fs.readFileSync(examDefinitionPath, 'utf8');
const examAttempts = fs.readFileSync(examAttemptsPath, 'utf8');
const examImports = fs.readFileSync(examImportsPath, 'utf8');
const read = fs.readFileSync(readPath, 'utf8');
const barrel = fs.readFileSync(barrelPath, 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const line of [
  "export * from './admin-competition-core.service';",
  "export * from './admin-competition-exams.service';",
  "export * from './admin-competition-read.service';",
]) {
  if (!barrel.includes(line)) {
    throw new Error('Competition compatibility barrel lost export: ' + line);
  }
}

for (const line of [
  "export * from './admin-competition-seasons.service';",
  "export * from './admin-competition-adjustments.service';",
  "export * from './admin-competition-awards.service';",
]) {
  if (!core.includes(line)) {
    throw new Error('Competition core compatibility barrel lost export: ' + line);
  }
}

for (const line of [
  "export * from './admin-competition-exam-definition.service';",
  "export * from './admin-competition-exam-attempts.service';",
  "export * from './admin-competition-exam-imports.service';",
]) {
  if (!examsBarrel.includes(line)) {
    throw new Error('Competition exams compatibility barrel lost export: ' + line);
  }
}

for (const [name, text] of [
  ['competition barrel', barrel],
  ['competition core barrel', core],
  ['competition exams barrel', examsBarrel],
]) {
  if (/\bsupabase\b|function\s+|type\s+[A-Za-z0-9_]+\s*=/.test(text)) {
    throw new Error(name + ' must remain a compatibility barrel without implementation.');
  }
}

for (const token of [
  'getAdminCompetitionHubSummary',
  'getAdminCompetitionSeasons',
  'getAdminCompetitionSeason',
  'createCompetitionSeason',
  'updateCompetitionSeason',
  'activateCompetitionSeason',
  'closeCompetitionSeason',
  'reopenCompetitionSeason',
]) {
  if (!seasons.includes(token)) {
    throw new Error('Competition seasons boundary lost operation: ' + token);
  }
}

for (const token of [
  'getAdminCompetitionAdjustmentOverview',
  'getAdminCompetitionAdjustmentDetail',
  'addCompetitionAdjustment',
  'reverseCompetitionAdjustment',
]) {
  if (!adjustments.includes(token)) {
    throw new Error('Competition adjustments boundary lost operation: ' + token);
  }
}

for (const token of [
  'getAdminCompetitionAwardWorkspace',
  'awardRequiresSeason',
  'grantCompetitionDogAward',
  'revokeCompetitionDogAward',
]) {
  if (!awards.includes(token)) {
    throw new Error('Competition awards boundary lost operation: ' + token);
  }
}

if (/admin-competition-(?:adjustments|awards|exams|read|exam-definition|exam-attempts|exam-imports)\.service/.test(seasons)) {
  throw new Error('Competition seasons must remain the dependency base.');
}

if (!/from ['"]\.\/admin-competition-seasons\.service['"]/.test(adjustments)) {
  throw new Error('Competition adjustments must depend on canonical seasons.');
}
if (!/from ['"]\.\/admin-competition-seasons\.service['"]/.test(awards)) {
  throw new Error('Competition awards must depend on canonical seasons.');
}

for (const [name, text] of [
  ['exam definition', examDefinition],
  ['exam attempts', examAttempts],
  ['exam imports', examImports],
]) {
  if (!/from ['"]\.\/admin-competition-seasons\.service['"]/.test(text)) {
    throw new Error('Competition ' + name + ' must depend explicitly on seasons.');
  }
  if (/from ['"]\.\/admin-competition-core\.service['"]/.test(text)) {
    throw new Error('Competition ' + name + ' must not depend on the core compatibility barrel.');
  }
}

if (!/from ['"]\.\/admin-competition-seasons\.service['"]/.test(read)) {
  throw new Error('Competition read service must depend explicitly on seasons.');
}
if (!/from ['"]\.\/admin-competition-adjustments\.service['"]/.test(read)) {
  throw new Error('Competition read service must consume canonical ranking/range types from adjustments.');
}
if (/from ['"]\.\/admin-competition-core\.service['"]/.test(read)) {
  throw new Error('Competition read service must not depend on the core compatibility barrel.');
}

if (!/from ['"]\.\/admin-competition-exam-definition\.service['"]/.test(examAttempts)) {
  throw new Error('Exam attempts must consume canonical exam definition types.');
}

if (!/from ['"]\.\/admin-competition-exam-definition\.service['"]/.test(examImports)
  || !/from ['"]\.\/admin-competition-exam-attempts\.service['"]/.test(examImports)) {
  throw new Error('Exam imports must consume canonical definition/attempt types.');
}

for (const [name, text, maxLines] of [
  ['competition core barrel', core, 12],
  ['competition seasons', seasons, 230],
  ['competition adjustments', adjustments, 190],
  ['competition awards', awards, 190],
  ['exam definition', examDefinition, 280],
  ['exam attempts', examAttempts, 340],
  ['exam imports', examImports, 320],
  ['competition read', read, 270],
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

console.log('UCAPSA admin competition responsibility boundaries: PASS');
