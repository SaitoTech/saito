'use strict';

/**
 * Build the .saito JSON payload (same shape as browser download).
 * Uses Transaction from dist/ts so the project must be built first.
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '../../..');

let Transaction;
try {
  Transaction = require(path.join(PROJECT_ROOT, 'dist/ts/lib/saito/transaction')).default;
} catch (err) {
  throw new Error(
    'Build the project first (e.g. npm run compile or npm run nuke) so dist/ts exists, then run the dynmod compiler.'
  );
}

const minimalCrypto = {
  stringToBase64(str) {
    return Buffer.from(str, 'utf-8').toString('base64');
  },
  base64ToString(str) {
    return Buffer.from(str, 'base64').toString('utf-8');
  },
};

const minimalApp = { crypto: minimalCrypto };

/**
 * Build serialized .saito string (JSON) for the given msg object.
 * @param {object} msg - { module, request, bin, name, description, slug, image, version, publisher, categories }
 * @returns {string} JSON string to write to .saito file
 */
function buildSaitoPayload(msg) {
  const msgBuffer = Buffer.from(JSON.stringify(msg), 'utf-8');
  const jsonobj = {
    from: [],
    to: [],
    timestamp: Date.now(),
    signature: '',
    type: 0,
    buffer: msgBuffer.toString('base64'),
  };
  const tx = new Transaction(undefined, jsonobj);
  const webObj = tx.serialize_to_web(minimalApp);
  return typeof webObj === 'string' ? webObj : JSON.stringify(webObj);
}

module.exports = { buildSaitoPayload };
