import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

if (pkg.overrides?.['decode-uri-component'] !== '$decode-uri-component') {
  throw new Error('Patched decode-uri-component override is missing.');
}
if (pkg.overrides?.xcode?.uuid !== '11.1.1') {
  throw new Error('xcode must stay pinned to patched uuid 11.1.1.');
}
if (lock.packages?.['node_modules/upstream-decoder']?.version !== '0.5.0') {
  throw new Error('Patched URI decoder 0.5.0 is not locked.');
}
if (lock.packages?.['node_modules/uuid']?.version !== '11.1.1') {
  throw new Error('Patched uuid 11.1.1 is not locked.');
}

const decodeUriComponent = require('decode-uri-component');
if (typeof decodeUriComponent !== 'function') {
  throw new Error('CommonJS decoder compatibility wrapper is broken.');
}
if (decodeUriComponent('caf%C3%A9') !== 'café' || decodeUriComponent('%') !== '%') {
  throw new Error('Patched URI decoder changed query-string compatible behavior.');
}

const uuid = require('uuid');
if (typeof uuid.v4 !== 'function' || !/^[0-9a-f-]{36}$/i.test(uuid.v4())) {
  throw new Error('Patched uuid no longer exposes the CommonJS v4 API used by xcode.');
}
const xcode = require('xcode');
if (!xcode || typeof xcode.project !== 'function') {
  throw new Error('xcode no longer loads after the uuid override.');
}

console.log('UCAPSA compatible dependency security overrides: PASS');
