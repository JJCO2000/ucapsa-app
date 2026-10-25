import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/components/ui/OfflineDataNotice.tsx', 'utf8');
const parsed = ts.createSourceFile('OfflineDataNotice.tsx', source,
  ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length, 0,
  parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '));

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const module = { exports: {} };
const element = (type, props) => ({ type, props });
const colors = new Proxy({}, { get: () => '#222222' });
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (name) => {
    if (name === 'react/jsx-runtime') return {
      jsx: element, jsxs: element, Fragment: 'Fragment',
    };
    if (name === 'react-native') return {
      Pressable: 'Pressable',
      Text: 'Text',
      StyleSheet: { create: styles => styles },
    };
    if (name === '@expo/vector-icons/MaterialIcons') return {
      __esModule: true, default: 'MaterialIcons',
    };
    if (name === '../../constants/brand') return { ucapsaBrand: { colors } };
    throw new Error('Unexpected UI dependency: ' + name);
  },
});
const OfflineDataNotice = module.exports.OfflineDataNotice;
assert.equal(typeof OfflineDataNotice, 'function');

const labels = node => [node.props.children].flat().filter(x => x?.type === 'Text')
  .map(x => x.props.children);
const retry = () => {};
const displayed = OfflineDataNotice({
  label: 'Mostrando resultado guardado',
  savedAt: '2026-10-23T13:15:00Z',
  onRetry: retry,
});
assert.equal(displayed.type, 'Pressable');
assert.equal(displayed.props.accessibilityRole, 'button');
assert.equal(displayed.props.disabled, false);
assert.equal(displayed.props.onPress, retry,
  'The existing refresh callback must remain wired to the whole notice');
assert.deepEqual(JSON.parse(JSON.stringify(labels(displayed))),
  ['Mostrando resultado guardado', 'Actualizar']);
assert.match(displayed.props.accessibilityLabel,
  /Mostrando resultado guardado.*Actualizar información/);
assert.ok(!displayed.props.accessibilityLabel.includes('Sin conexión'),
  'A saved fallback is not evidence of a lost connection');

const nonInteractive = OfflineDataNotice({ label: 'Datos guardados', premium: true });
assert.equal(nonInteractive.props.disabled, true);
assert.equal(nonInteractive.props.accessibilityRole, undefined);
assert.deepEqual(JSON.parse(JSON.stringify(labels(nonInteractive))), ['Datos guardados']);
assert.equal(nonInteractive.props.onPress, undefined);
assert.deepEqual(JSON.parse(JSON.stringify(labels(OfflineDataNotice({})))),
  ['Mostrando información guardada']);

const ranking = fs.readFileSync('src/app/client/competition-ranking.tsx', 'utf8');
for (const required of [
  'No pudimos cargar tus puntos. Conéctate y actualiza.',
  'Esta temporada no tiene exámenes obligatorios.',
  'Mostrando Ranking guardado',
]) {
  assert.ok(ranking.includes(required), 'Ranking lost clear, accurate message: ' + required);
}
for (const forbidden of [
  'Puntaje no disponible en este dispositivo.',
  'ningún examen bloquea el ranking.',
  'El Ranking permanece visible:',
]) {
  assert.ok(!ranking.includes(forbidden), 'Ranking recovered technical or redundant text: ' + forbidden);
}
console.log('UCAPSA saved-data notice and Ranking copy: visible context, accessible update, preserved action, accurate state PASS');
