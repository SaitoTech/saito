const crypto = require('crypto');
const { fromBase58 } = require('saito-js/lib/util');
const { TransactionType } = require('saito-js/lib/transaction');
const Transaction = require('saito-js/lib/transaction').default;
const Slip = require('saito-js/lib/slip').default;

const { logManualProduction } = require('./manual-production-log');

const MINING_YIELD_INTERVAL = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function leadingZeroBits(hashHex) {
  const bytes = Buffer.from(hashHex, 'hex');
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  if (value === 0n) {
    return 256;
  }

  let bits = 0;
  for (let i = 255; i >= 0; i--) {
    if ((value & (1n << BigInt(i))) !== 0n) {
      break;
    }
    bits++;
  }
  return bits;
}

function serializeGoldenTicket(targetHex, randomHex, publicKeyBase58) {
  const target = Buffer.from(targetHex, 'hex');
  const random = Buffer.from(randomHex, 'hex');
  const publicKey = Buffer.from(fromBase58(publicKeyBase58), 'hex');
  return Buffer.concat([target, random, publicKey]);
}

async function createGoldenTicketTransaction(app, goldenTicketBytes) {
  const publicKey = await app.wallet.getPublicKey();
  const tx = new Transaction();
  tx.type = TransactionType.GoldenTicket;
  tx.data = new Uint8Array(goldenTicketBytes);

  const input = new Slip();
  input.publicKey = publicKey;
  input.amount = 0n;
  input.blockId = 0n;
  input.txOrdinal = 0n;

  const output = new Slip();
  output.publicKey = publicKey;
  output.amount = 0n;
  output.blockId = 0n;
  output.txOrdinal = 0n;

  tx.addFromSlip(input);
  tx.addToSlip(output);
  tx.generateHashForSignature();
  await tx.instance.sign();
  return tx;
}

/**
 * Mine exactly one golden ticket for the current chain tip and propagate it.
 */
async function mineAndSubmitOneGoldenTicket(app, deadlineMs = Date.now() + 600_000) {
  const blocks = await app.core.blockchain.getBlocks(1, false);
  const latest = Array.isArray(blocks) && blocks.length ? blocks[0] : null;
  if (!latest?.hash) {
    throw new Error('Explorer: cannot mine golden ticket without a chain tip');
  }

  const targetHex = String(latest.hash);
  const difficulty = Number(latest.difficulty);
  if (!Number.isFinite(difficulty) || difficulty < 0) {
    throw new Error('Explorer: invalid golden ticket difficulty');
  }

  const publicKey = await app.wallet.getPublicKey();
  let attempts = 0;

  while (Date.now() < deadlineMs) {
    const randomBytes = crypto.randomBytes(32);
    const randomHex = app.crypto.hash(randomBytes);
    const goldenTicketBytes = serializeGoldenTicket(targetHex, randomHex, publicKey);
    const solutionHash = app.crypto.hash(goldenTicketBytes);

    if (leadingZeroBits(solutionHash) >= difficulty) {
      logManualProduction(
        `GT found after ${attempts} attempts (target=${targetHex.slice(0, 16)}...)`
      );
      logManualProduction('GT transaction created');
      const tx = await createGoldenTicketTransaction(app, goldenTicketBytes);
      logManualProduction('GT transaction submitted to network');
      await app.network.propagateTransaction(tx);
      logManualProduction('Mining completed — golden ticket propagated');
      return tx;
    }

    attempts++;
    if (attempts % MINING_YIELD_INTERVAL === 0) {
      await sleep(0);
    }
  }

  throw new Error('Explorer: golden ticket mining timed out');
}

module.exports = {
  mineAndSubmitOneGoldenTicket
};
