#!/usr/bin/env node
/**
 * Quick parser smoke test: node mods/rustscript/lib/parser/test-parse.js
 */

const scripts = require('../../examples/scripts');
const { parseExpertScript } = require('./index');

let failed = 0;

for (const [name, source] of Object.entries(scripts)) {
  try {
    const result = parseExpertScript(source);
    console.log(`OK  ${name}`);
    console.log(result.asciiTree);
    console.log('---');
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}:`, err.message);
  }
}

process.exit(failed > 0 ? 1 : 0);
