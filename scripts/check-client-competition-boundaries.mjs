import fs from 'node:fs';

const barrelPath = 'src/services/client-competition.service.ts';
const typesPath = 'src/services/client-competition.types.ts';
const summaryPath = 'src/services/client-competition-summary.service.ts';
const accountPath = 'src/services/client-competition-account.service.ts';
const homePath = 'src/services/client-competition-home.service.ts';
const examPath = 'src/services/client-competition-exam.service.ts';
const constancyPath = 'src/services/client-competition-constancy.service.ts';
const rankingPath = 'src/services/client-competition-ranking.service.ts';

const barrel = fs.readFileSync(barrelPath, 'utf8');
const types = fs.readFileSync(typesPath, 'utf8');
const summary = fs.readFileSync(summaryPath, 'utf8');
const account = fs.readFileSync(accountPath, 'utf8');
const home = fs.readFileSync(homePath, 'utf8');
const exam = fs.readFileSync(examPath, 'utf8');
const constancy = fs.readFileSync(constancyPath, 'utf8');
const ranking = fs.readFileSync(rankingPath, 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

for (const line of [
  "export * from './client-competition.types';",
  "export * from './client-competition-summary.service';",
  "export * from './client-competition-account.service';",
  "export * from './client-competition-exam.service';",
  "export * from './client-competition-constancy.service';",
  "export * from './client-competition-ranking.service';",
  "export * from './client-competition-home.service';",
]) {
  if (!barrel.includes(line)) throw new Error('Client competition barrel lost export: ' + line);
}

if (/\bsupabase\b|function\s+|type\s+[A-Za-z0-9_]+\s*=/.test(barrel)) {
  throw new Error('Client competition compatibility barrel contains implementation.');
}

if (/\bsupabase\b|readClientResource|writeClientResource/.test(types)) {
  throw new Error('Client competition shared types must stay data-source agnostic.');
}

for (const [name,text,own,forbidden] of [
  ['summary', summary, ['getMyDogCompetition'], ['getMyOfficialExamDetail','getMyConstancyDetail','getCompetitionLeaderboard','getMyCompetitionAccount']],
  ['account', account, ['getMyCompetitionAccount','refreshMyCompetitionAccount'], ['getMyOfficialExamDetail','getMyConstancyDetail','getCompetitionLeaderboard']],
  ['home', home, ['getCachedCompetitionHomeSummary','refreshCompetitionHomeSummary'], ['supabase','getMyOfficialExamDetail','getMyConstancyDetail']],
  ['exam', exam, ['getMyOfficialExamDetail'], ['getMyDogCompetition','getMyCompetitionAccount','getMyConstancyDetail','getCompetitionLeaderboard']],
  ['constancy', constancy, ['getMyConstancyDetail'], ['getMyDogCompetition','getMyCompetitionAccount','getMyOfficialExamDetail','getCompetitionLeaderboard']],
  ['ranking', ranking, ['getCompetitionLeaderboard'], ['getMyDogCompetition','getMyCompetitionAccount','getMyOfficialExamDetail','getMyConstancyDetail']],
]) {
  for (const token of own) if (!text.includes(token)) throw new Error(name + ' boundary lost: ' + token);
  for (const token of forbidden) if (text.includes(token)) throw new Error(name + ' boundary leaked responsibility: ' + token);
  if (/from ['"]\.\/client-competition\.service['"]/.test(text)) {
    throw new Error(name + ' imports the compatibility barrel.');
  }
}

for (const [name,text,maxLines] of [
  ['types',types,80],
  ['summary',summary,150],
  ['account',account,160],
  ['home',home,120],
  ['exam',exam,180],
  ['constancy',constancy,170],
  ['ranking',ranking,140],
  ['barrel',barrel,14],
]) {
  const lines=text.split(/\r?\n/).length;
  if(lines>maxLines) throw new Error(name+' grew beyond boundary: '+lines+' > '+maxLines);
}

if (!pkg.includes('"check:client-competition-boundaries"')) {
  throw new Error('npm verify does not include client competition boundary guard.');
}

console.log('UCAPSA client competition service boundaries: PASS');
