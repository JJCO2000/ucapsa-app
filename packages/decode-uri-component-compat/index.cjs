// Preserve query-string 7's CommonJS function export while using patched decode-uri-component 0.5.0.
const decoder = require('upstream-decoder');

module.exports = decoder.default ?? decoder;
