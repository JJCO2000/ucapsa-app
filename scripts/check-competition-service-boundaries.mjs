import fs from 'node:fs';

const corePath = 'src/services/admin-competition-core.service.ts';
const examsPath = 'src/services/admin-competition-exams.service.ts';
const readPath = 'src/services/admin-competition-read.service.ts';
const barrelPath = 'src/services/ucapsa-competition.service.ts';

const core = fs.readFileSync(corePath, 'utf8');
const exams = fs.readFileSync(examsPath, 'utf8');
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

if (/\bsupabase\b|function\s+|type\s+[A-Za-z0-9_]+\s*=/.test(barrel)) {
  throw new Error('ucapsa-competition.service.ts must remain a compatibility barrel without implementation.');
}

if (/ucapsa-competition\.service/.test(core + exams + read)) {
  throw new Error('A split competition module imports the compatibility barrel, creating a reverse dependency.');
}

if (/admin-competition-(?:exams|read)\.service/.test(core)) {
  throw new Error('Competition core must not depend on higher-level competition modules.');
}

for (const [name, text, tokens] of [
  ['core', core, ['getAdminCompetitionSeasons', 'addCompetitionAdjustment', 'grantCompetitionDogAward']],
  ['exams', exams, ['getAdminCompetitionExamWorkspace', 'createCompetitionExamAttempt', 'createCompetitionExamImportBatch']],
  ['read', read, ['getAdminCompetitionConstancyOverview', 'getAdminCompetitionRankingOverview']],
]) {
  for (const token of tokens) {
    if (!text.includes(token)) {
      throw new Error('Competition ' + name + ' boundary lost expected operation: ' + token);
    }
  }
}

if (!/from ['"]\.\/admin-competition-core\.service['"]/.test(exams)) {
  throw new Error('Competition exams must depend explicitly on core seasons.');
}

if (!/from ['"]\.\/admin-competition-core\.service['"]/.test(read)) {
  throw new Error('Competition read service must depend explicitly on core seasons/types.');
}

if (core.split(/\r?\n/).length > 550) {
  throw new Error('Competition core grew beyond its responsibility boundary.');
}

if (read.split(/\r?\n/).length > 260) {
  throw new Error('Competition read service grew beyond its responsibility boundary.');
}

if (!pkg.includes('"check:competition-service-boundaries"')) {
  throw new Error('npm verify does not include the competition service boundary guard.');
}

console.log('UCAPSA admin competition service boundaries: PASS');
