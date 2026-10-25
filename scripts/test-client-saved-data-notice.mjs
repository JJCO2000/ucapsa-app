import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Render the actual shared notice component without an emulator. This validates
// its visible copy and tap wiring; it is NOT a physical device interaction test.
const source = fs.readFileSync('src/components/ui/OfflineDataNotice.tsx', 'utf8');
const file = ts.createSourceFile('OfflineDataNotice.tsx', source, ts.ScriptTarget.ES2022,
  true, ts.ScriptKind.TSX);
assert.equal(file.parseDiagnostics.length, 0, 'Offline notice JSX must parse');

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  },
}).outputText;

const jsx = (type, props) => ({ type, props: props ?? {} });
const brand = {
  colors: {
    premiumAction: '#0f0', premiumMuted: '#0d0', premiumBorder: '#010',
    premiumSurface: '#020', warningDark: '#a10', warningBorder: '#a20',
    warningSoft: '#a30',
  },
};
const output = { exports: {} };
vm.runInNewContext(compiled, {
  module: output, exports: output.exports,
  require(path) {
    if (path === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (path === '@expo/vector-icons/MaterialIcons') return { __esModule: true, default: 'MaterialIcons' };
    if (path === 'react-native') return {
      Pressable: 'Pressable', Text: 'Text', StyleSheet: { create: (v) => v },
    };
    if (path === '../../constants/brand') return { ucapsaBrand: brand };
    throw new Error('Unexpected module: ' + path);
  },
  Object,
  String,
  Boolean,
});
const render = output.exports.OfflineDataNotice;
assert.equal(typeof render, 'function', 'Actual shared offline component must render');

function children(node) {
  const items = node.props.children;
  return Array.isArray(items) ? items : [items];
}
{
  let updates = 0;
  const node = render({ onRetry: () => { updates += 1; }, premium: false,
    label: '  Mostrando resultado guardado  ' });
  assert.equal(node.type, 'Pressable');
  assert.equal(node.props.accessibilityRole, 'button');
  assert.equal(node.props.accessibilityLabel,
    'Mostrando resultado guardado. Actualizar datos.');
  assert.equal(node.props.disabled, false);
  const [icon, message, action] = children(node);
  assert.equal(icon.type, 'MaterialIcons');
  assert.equal(message.type, 'Text');
  assert.equal(message.props.children, 'Mostrando resultado guardado');
  assert.equal(action.props.children, 'Actualizar');
  assert.equal(node.props.style({ pressed: true }).at(-1).opacity, 0.72);
  node.props.onPress();
  assert.equal(updates, 1, 'The update control must invoke the supplied refresh callback');
}
{
  const node = render({ premium: true });
  assert.equal(node.props.disabled, true);
  assert.equal(node.props.accessibilityRole, 'text');
  assert.equal(node.props.accessibilityLabel, 'Datos guardados');
  const [icon, message] = children(node);
  assert.equal(icon.props.color, brand.colors.premiumAction);
  assert.equal(message.props.children, 'Datos guardados');
  assert.equal(children(node).filter(Boolean).length, 2, 'No inert update button without callback');
}
{
  const node = render({ onRetry: () => {}, label: ' ' });
  assert.equal(children(node)[1].props.children, 'Datos guardados');
  assert.ok(!node.props.accessibilityLabel.includes('Sin conexión'),
    'The server can fail without the device being offline.');
}
console.log('UCAPSA saved-data notice: visible plain language, accessible refresh, premium and no misleading offline claim PASS');
