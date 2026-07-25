'use strict';

/**
 * Build the .saito JSON payload using real Transaction serialization.
 * Requires initSaitoJsForCompile() to have been called first (in compile.js).
 * Output format matches Transaction#serialize_to_web(app): { t, m, opt }.
 */

const path = require('path');

const PROJECT_ROOT = path.resolve(path.join(__dirname, '..', '..', '..'));
const Transaction = require(path.join(PROJECT_ROOT, 'dist/ts/lib/saito/transaction')).default;

const minimalApp = {
  crypto: {
    stringToBase64(s) {
      return Buffer.from(s, 'utf-8').toString('base64');
    }
  }
};

/**
 * Build serialized .saito string (JSON) for the given msg object.
 * Uses real Transaction so installer can deserialize_from_web() and returnMessage().
 * @param {object} msg - { module, request, bin, name, description, slug, image, version, publisher, categories }
 * @returns {string} JSON string to write to .saito file
 */
function buildSaitoPayload(msg) {
  const jsonobj = {
    from: [],
    to: [],
    timestamp: Date.now(),
    signature: '',
    type: 0,
    buffer: Buffer.from(JSON.stringify(msg), 'utf-8').toString('base64'),
    txs_replacements: 1
  };
  const tx = new Transaction(undefined, jsonobj);
  const result = tx.serialize_to_web(minimalApp);
  return typeof result === 'string' ? result : JSON.stringify(result);
}

module.exports = { buildSaitoPayload };
