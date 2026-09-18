'use strict';

/**
 * Build the .saito JSON payload using real Transaction serialization.
 * Requires initSaitoJsForCompile() to have been called first (in compile.js).
 * Output format matches Transaction#serialize_to_web(app): { t, m, opt }.
 */

const path = require('path');

const PROJECT_ROOT = path.resolve(path.join(__dirname, '..', '..', '..'));
const Transaction = require(path.join(PROJECT_ROOT, 'dist/ts/lib/saito/transaction')).default;
const { fromBase58 } = require('saito-js/lib/util');

const minimalApp = {
  crypto: {
    stringToBase64(s) {
      return Buffer.from(s, 'utf-8').toString('base64');
    }
  }
};

function u64be(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(n));
  return buf;
}

function u32be(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(Number(n) >>> 0);
  return buf;
}

function publicKeyBytes(publicKey) {
  const bytes = Buffer.from(fromBase58(publicKey), 'hex');
  if (bytes.length !== 33) {
    throw new Error(`public key decoded to ${bytes.length} bytes, expected 33`);
  }
  return bytes;
}

function serializeSlipForSignature(slip) {
  return Buffer.concat([
    publicKeyBytes(slip.publicKey),
    u64be(slip.amount || 0),
    Buffer.from([Number(slip.index || 0) & 0xff, Number(slip.type || 0) & 0xff])
  ]);
}

/**
 * JS mirror of rust Transaction::serialize_for_signature. WASM does not export that
 * buffer; sign_buffer hashes internally the same way Transaction.sign does.
 */
function serializeForSignature(jsonobj, data) {
  const from = (jsonobj.from || []).map(serializeSlipForSignature);
  const to = (jsonobj.to || []).map(serializeSlipForSignature);
  return Buffer.concat([
    u64be(jsonobj.timestamp),
    ...from,
    ...to,
    u32be(jsonobj.txs_replacements),
    u32be(jsonobj.type),
    Buffer.from(data)
  ]);
}

/**
 * Build serialized .saito string (JSON) for the given msg object.
 * Uses real Transaction so installer can deserialize_from_web() and returnMessage().
 * @param {object} msg - { module, request, bin, name, description, slug, image, version, publisher, categories }
 * @param {{ privateKey?: string, wasm?: object }} [opts]
 * @returns {string} JSON string to write to .saito file
 */
function buildSaitoPayload(msg, opts = {}) {
  const privateKey = typeof opts.privateKey === 'string' ? opts.privateKey.trim() : '';
  const wasm = opts.wasm;
  const from = [];

  if (privateKey) {
    if (!wasm) {
      throw new Error('signing requires saito-wasm (initSaitoJsForCompile)');
    }
    const publicKey = String(wasm.generate_public_key(privateKey));
    msg.publisher = publicKey;
    from.push({
      publicKey,
      amount: 0,
      type: 0,
      index: 0,
      blockId: 0,
      txOrdinal: 0
    });
  }

  const data = Buffer.from(JSON.stringify(msg), 'utf-8');
  const jsonobj = {
    from,
    to: [],
    timestamp: Date.now(),
    signature: '',
    type: 0,
    buffer: data.toString('base64'),
    txs_replacements: 1
  };

  if (privateKey) {
    jsonobj.signature = String(wasm.sign_buffer(new Uint8Array(serializeForSignature(jsonobj, data)), privateKey));
  }

  const tx = new Transaction(undefined, jsonobj);
  const result = tx.serialize_to_web(minimalApp);
  return typeof result === 'string' ? result : JSON.stringify(result);
}

module.exports = { buildSaitoPayload };
