import fs from 'node:fs';

const home = fs.readFileSync('src/screens/home/HomeExperienceScreen.tsx', 'utf8');
const strategy = fs.readFileSync('docs/product/VALOR_UCAPSA_APP.md', 'utf8');

for (const token of [
  'Tu próxima clase · asistencias · logros · siguiente paso',
  'Sabe qué toca y cómo va tu perro',
  'consulta en segundos tu próxima clase, asistencias, logros y siguiente paso',
]) {
  if (!home.includes(token)) throw new Error('Customer value clarity missing from Home: ' + token);
}

for (const token of [
  'TIENES → APROVECHASTE → CONSEGUISTE → SIGUE',
  'Resultado antes que función',
  'No sobreprometer aprendizaje',
  'Admin por excepción',
]) {
  if (!strategy.includes(token)) throw new Error('Product value strategy missing: ' + token);
}

console.log('UCAPSA product value clarity: PASS');
