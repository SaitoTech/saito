/**
 * Unlock fee — amount locked at set-time; wallet funding attached silently
 * immediately before CHECKSIG / CHECKMULTISIG (and broadcast).
 *
 * UI-owned unlock_transaction_base stays free of fee inputs / change.
 * Funded slips live only on unlock_transaction_final.
 */

const Slip = require('./../../../../lib/saito/slip').default;
const { build_test_script_from_create, lockingView } = require('./script_build');

const UNLOCK_SIGNED_ERROR =
  'This transaction has already been signed and can no longer be modified. Restart Unlock Transaction to make changes.';

const UNLOCK_FEE_LOCKED_ERROR =
  'Transaction fee is already set and cannot be changed. Restart Unlock Transaction to choose a different fee.';

function hasUnlockFee(mod) {
  return !!(mod?.unlock_fee && mod.unlock_fee.feeSaito != null && String(mod.unlock_fee.feeSaito) !== '');
}

function isUnlockEditable(mod) {
  return mod?.unlock_transaction_editable !== false;
}

function assertUnlockEditable(mod) {
  if (!isUnlockEditable(mod)) {
    throw new Error(UNLOCK_SIGNED_ERROR);
  }
}

/** Witness signature field paths may still be filled after the tx is locked. */
function isWitnessSignaturePath(path) {
  const p = String(path || '');
  return /(^|\.)witness\.(signature|signatures)(\.|$)/.test(p);
}

function assertUnlockMutablePath(mod, path) {
  if (isUnlockEditable(mod)) {
    return;
  }
  if (isWitnessSignaturePath(path)) {
    return;
  }
  throw new Error(UNLOCK_SIGNED_ERROR);
}

function lockedInputCount(mod) {
  const ctx = mod?.unlockContext;
  if (
    ctx?.assetType === 'nft' &&
    Array.isArray(ctx.lockedNftSlips) &&
    ctx.lockedNftSlips.length === 3
  ) {
    return 3;
  }
  return ctx?.lockedSlip ? 1 : 0;
}

/** User-created outputs on the editable base (fee change is never attached here). */
function userOutputs(mod) {
  return Array.isArray(mod?.unlock_transaction_base?.to) ? mod.unlock_transaction_base.to : [];
}

function formatFeeAmount(app, amount) {
  try {
    if (typeof app?.wallet?.convertNolanToSaito === 'function') {
      return app.wallet.convertNolanToSaito(BigInt(amount || 0));
    }
    return String(amount || '0');
  } catch (_err) {
    return String(amount || '0');
  }
}

/** Normalize wallet balance / fee values that may arrive as bigint, number, or string. */
function toNolanBigInt(value) {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (value == null || value === '') {
    return BigInt(0);
  }
  try {
    return BigInt(String(value).trim());
  } catch (_err) {
    return BigInt(0);
  }
}

async function readSpendableWalletNolan(app) {
  // Same spendable pool the header uses (available / unspent Normal slips).
  // Locked P2SH inputs are NOT included — fees must come from the wallet.
  if (typeof app?.core?.wallet?.getAvailableBalance === 'function') {
    try {
      return toNolanBigInt(await app.core.wallet.getAvailableBalance());
    } catch (_err) {
      /* fall through */
    }
  }
  return toNolanBigInt(await app.wallet.getBalance());
}

/** Debug snapshot for fee-funding failures (safe to leave enabled while diagnosing). */
async function debugFeeFundWalletState(app, label, extra = {}) {
  const snap = {
    label,
    ...extra,
    ts: Date.now()
  };
  try {
    snap.publicKey =
      typeof app?.wallet?.getPublicKey === 'function' ? await app.wallet.getPublicKey() : null;
  } catch (err) {
    snap.publicKeyError = err?.message || String(err);
  }
  try {
    snap.balanceGetBalance =
      typeof app?.wallet?.getBalance === 'function'
        ? String(await app.wallet.getBalance())
        : null;
  } catch (err) {
    snap.balanceGetBalanceError = err?.message || String(err);
  }
  try {
    snap.balanceGetAvailable =
      typeof app?.core?.wallet?.getAvailableBalance === 'function'
        ? String(await app.core.wallet.getAvailableBalance())
        : typeof app?.wallet?.getAvailableBalance === 'function'
          ? String(await app.wallet.getAvailableBalance())
          : null;
  } catch (err) {
    snap.balanceGetAvailableError = err?.message || String(err);
  }
  try {
    const slips =
      typeof app?.wallet?.getSlips === 'function'
        ? await app.wallet.getSlips()
        : Array.isArray(app?.options?.wallet?.slips)
          ? app.options.wallet.slips
          : [];
    snap.slipCount = Array.isArray(slips) ? slips.length : 0;
    snap.slips = (Array.isArray(slips) ? slips : []).map((s) => {
      const j = typeof s?.toJson === 'function' ? s.toJson() : s;
      return {
        amount: j?.amount != null ? String(j.amount) : null,
        blockId: j?.blockId != null ? String(j.blockId) : j?.block_id != null ? String(j.block_id) : null,
        spent: j?.spent,
        slipType: j?.slipType ?? j?.slip_type,
        txIndex: j?.txIndex != null ? String(j.txIndex) : j?.tx_ordinal != null ? String(j.tx_ordinal) : null,
        slipIndex: j?.slipIndex ?? j?.slip_index,
        utxokey: j?.utxokey ? String(j.utxokey).slice(0, 24) + '…' : null
      };
    });
  } catch (err) {
    snap.slipsError = err?.message || String(err);
  }
  try {
    snap.optionsSlipCount = Array.isArray(app?.options?.wallet?.slips)
      ? app.options.wallet.slips.length
      : null;
  } catch (_err) {
    /* ignore */
  }
  console.warn('[RustScript fee-fund]', snap);
  return snap;
}

function slipToJson(slip) {
  if (!slip) {
    return null;
  }
  if (typeof slip.toJson === 'function') {
    return slip.toJson();
  }
  return {
    publicKey: slip.publicKey,
    amount: slip.amount,
    type: slip.type,
    blockId: slip.blockId,
    txOrdinal: slip.txOrdinal,
    index: slip.index
  };
}

function slipAmountPositive(slip) {
  try {
    return BigInt(slip?.amount || 0) > BigInt(0);
  } catch (_err) {
    return false;
  }
}

/**
 * Assign output slip_index values the same way Transaction::sign does,
 * so CHECKSIG's p2sh_auth_hash matches the broadcast transaction.
 */
function assignOutputSlipIndices(tx) {
  if (!tx) {
    return;
  }
  const outputs = Array.isArray(tx.to) ? tx.to : [];
  for (let i = 0; i < outputs.length; i++) {
    outputs[i].index = i;
  }
}

/**
 * Blake3 hex over concatenate(serialize_output_for_signature) for every output.
 * Mirrors saito-core get_p2sh_auth_hash / Slip::serialize_output_for_signature.
 */
function getP2shAuthHash(app, tx) {
  if (!tx || typeof app?.crypto?.hash !== 'function' || typeof app?.crypto?.fromBase58 !== 'function') {
    throw new Error('Cannot compute authorization hash for this transaction.');
  }

  assignOutputSlipIndices(tx);

  const parts = [];
  const outputs = Array.isArray(tx.to) ? tx.to : [];
  for (let i = 0; i < outputs.length; i++) {
    const slip = outputs[i];
    const pkB58 = String(slip?.publicKey || slip?.public_key || '');
    if (!pkB58) {
      throw new Error('Unlock output is missing a public key.');
    }
    const pkBytes = Buffer.from(app.crypto.fromBase58(pkB58), 'hex');
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64BE(toNolanBigInt(slip?.amount));
    parts.push(pkBytes);
    parts.push(amountBuf);
    parts.push(Buffer.from([Number(slip?.index ?? i) & 0xff]));
    parts.push(Buffer.from([Number(slip?.type ?? 0) & 0xff]));
  }

  return String(app.crypto.hash(Buffer.concat(parts)));
}

function buildP2shAuthMessage(app, message, tx) {
  const msg = String(message ?? '');
  if (!msg) {
    throw new Error('No signable message found for this opcode.');
  }
  const hash = getP2shAuthHash(app, tx);
  return `${msg}|${hash}`;
}

/**
 * Clear CHECKSIG / CHECKMULTISIG witness signatures (placeholders restored).
 */
function clearSignatureWitnesses(node) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach(clearSignatureWitnesses);
    return;
  }

  const op = String(node.op || '').toLowerCase();
  if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
    const args = Array.isArray(node.args) ? node.args : [];
    args.forEach(clearSignatureWitnesses);
    return;
  }

  if (!node.witness || typeof node.witness !== 'object' || Array.isArray(node.witness)) {
    return;
  }

  if (op === 'checksig' && Object.prototype.hasOwnProperty.call(node.witness, 'signature')) {
    node.witness.signature = '<signature>';
  }

  if (op === 'checkmultisig' && Array.isArray(node.witness.signatures)) {
    node.witness.signatures = node.witness.signatures.map(() => '<signature>');
  }
}

function invalidateUnlockSignatures(mod, mainUi) {
  if (!mod || typeof mod.getScript !== 'function') {
    return;
  }
  const script = mod.getScript();
  clearSignatureWitnesses(script);
  const opcodes = mod.opcodes;
  const merged = build_test_script_from_create(lockingView(script), script, opcodes);
  mod.setScript(merged);

  if (mainUi) {
    mainUi.executionStatus = { attempted: false, success: false };
    mainUi.validationDisplay = null;
  }
}

/**
 * Store and lock the fee amount only. Does not attach wallet UTXOs.
 */
async function lockUnlockFeeAmount(app, mod, feeSaito) {
  assertUnlockEditable(mod);

  if (hasUnlockFee(mod)) {
    throw new Error(UNLOCK_FEE_LOCKED_ERROR);
  }

  if (!mod?.unlock_transaction_base) {
    throw new Error('Unlock transaction is not ready.');
  }

  const feeText = String(feeSaito || '').trim();
  const feeNum = Number(feeText);
  if (!feeText || !Number.isFinite(feeNum) || feeNum <= 0) {
    throw new Error('Enter a valid fee greater than zero.');
  }

  const feeNolan = toNolanBigInt(app.wallet.convertSaitoToNolan(feeText));
  if (feeNolan <= BigInt(0)) {
    throw new Error('Enter a valid fee greater than zero.');
  }

  const balance = await readSpendableWalletNolan(app);
  if (balance < feeNolan) {
    const have = app.wallet.convertNolanToSaito(balance);
    throw new Error(
      `Insufficient wallet balance for this fee. Available: ${have} SAITO. Network fees are paid from your wallet, not from the locked script inputs.`
    );
  }

  mod.unlock_fee = {
    feeSaito: feeText,
    feeNolan: feeNolan.toString()
  };

  return mod.unlock_fee;
}

/** @deprecated Use lockUnlockFeeAmount — kept for callers during rename. */
async function applyUnlockFee(app, mod, feeSaito, _mainUi = null) {
  return lockUnlockFeeAmount(app, mod, feeSaito);
}

/**
 * Silently fund the stored fee onto a finalized clone.
 * Called once before the first CHECKSIG/CHECKMULTISIG; reused thereafter.
 */
async function ensureUnlockFeeFunded(app, mod) {
  if (!hasUnlockFee(mod)) {
    throw new Error('Set a transaction fee before signing.');
  }

  if (mod.unlock_transaction_final) {
    assignOutputSlipIndices(mod.unlock_transaction_final);
    return mod.unlock_transaction_final;
  }

  const base = mod.unlock_transaction_base;
  if (!base) {
    throw new Error('Unlock transaction is not ready.');
  }

  const feeNolan = toNolanBigInt(mod.unlock_fee.feeNolan);
  if (feeNolan <= BigInt(0)) {
    throw new Error('Transaction fee is invalid.');
  }

  const balance = await readSpendableWalletNolan(app);
  if (balance < feeNolan) {
    const have = app.wallet.convertNolanToSaito(balance);
    await debugFeeFundWalletState(app, 'precheck-insufficient', {
      unlockFee: mod.unlock_fee,
      feeNolan: feeNolan.toString(),
      feeNolanType: typeof feeNolan,
      balancePrecheck: balance.toString(),
      balanceSaito: have
    });
    throw new Error(
      `Insufficient wallet balance to fund this fee. Available: ${have} SAITO.`
    );
  }

  const me = await app.wallet.getPublicKey();
  if (!me) {
    throw new Error('Could not read your wallet public key.');
  }

  await debugFeeFundWalletState(app, 'before-createUnsignedTransaction', {
    unlockFee: mod.unlock_fee,
    feeSaito: mod.unlock_fee?.feeSaito,
    feeNolanStored: mod.unlock_fee?.feeNolan,
    feeNolan: feeNolan.toString(),
    feeNolanType: typeof feeNolan,
    amountArg: '0',
    amountArgType: typeof BigInt(0),
    me,
    meType: typeof me,
    balancePrecheck: balance.toString(),
    balancePrecheckSaito: app.wallet.convertNolanToSaito(balance),
    baseInputCount: Array.isArray(base?.from) ? base.from.length : null,
    baseOutputCount: Array.isArray(base?.to) ? base.to.length : null
  });

  let feeTx;
  try {
    // amount=0, fee=feeNolan → inputs cover the fee; change returns the remainder.
    feeTx = await app.wallet.createUnsignedTransaction(me, BigInt(0), feeNolan);
  } catch (err) {
    const balanceAfter = await readSpendableWalletNolan(app);
    const have = app.wallet.convertNolanToSaito(balanceAfter);
    const detail = err?.message ? ` (${err.message})` : '';
    await debugFeeFundWalletState(app, 'createUnsignedTransaction-threw', {
      unlockFee: mod.unlock_fee,
      feeNolan: feeNolan.toString(),
      feeNolanType: typeof feeNolan,
      me,
      balanceBefore: balance.toString(),
      balanceAfter: balanceAfter.toString(),
      balanceAfterSaito: have,
      errName: err?.name,
      errMessage: err?.message,
      errString: String(err),
      errStack: err?.stack,
      // Wasm / JS often stash the real cause here
      errCauseMessage: err?.cause?.message,
      errKeys: err && typeof err === 'object' ? Object.keys(err) : []
    });
    console.error('[RustScript fee-fund] createUnsignedTransaction raw err', err);
    throw new Error(
      `Could not fund the transaction fee from your wallet. Available: ${have} SAITO.${detail}`
    );
  }
  if (!feeTx) {
    await debugFeeFundWalletState(app, 'createUnsignedTransaction-returned-null', {
      feeNolan: feeNolan.toString(),
      me
    });
    throw new Error('Could not fund the transaction fee from your wallet.');
  }

  if (typeof mod.cloneTransactionSkeleton !== 'function') {
    throw new Error('Unlock transaction clone is unavailable.');
  }

  const finalTx = mod.cloneTransactionSkeleton(base);

  const feeInputs = Array.isArray(feeTx.from) ? feeTx.from : [];
  let fundedInputCount = 0;
  const skippedFeeInputs = [];
  for (let i = 0; i < feeInputs.length; i++) {
    const stored = slipToJson(feeInputs[i]);
    if (!stored || !slipAmountPositive(stored)) {
      skippedFeeInputs.push({
        index: i,
        reason: !stored ? 'no-json' : 'non-positive-amount',
        amount: stored?.amount != null ? String(stored.amount) : null
      });
      continue;
    }
    finalTx.addFromSlip(new Slip(undefined, stored));
    fundedInputCount += 1;
  }
  if (fundedInputCount === 0) {
    await debugFeeFundWalletState(app, 'no-positive-fee-inputs-on-feeTx', {
      feeNolan: feeNolan.toString(),
      feeTxFromCount: feeInputs.length,
      feeTxToCount: Array.isArray(feeTx.to) ? feeTx.to.length : 0,
      skippedFeeInputs,
      feeTxFrom: feeInputs.map((s, i) => {
        const j = slipToJson(s);
        return {
          i,
          amount: j?.amount != null ? String(j.amount) : null,
          publicKey: j?.publicKey || j?.public_key || null
        };
      })
    });
    throw new Error(
      'Wallet returned no spendable inputs for this fee. Check that your wallet has confirmed SAITO available.'
    );
  }

  const changeOuts = Array.isArray(feeTx.to) ? feeTx.to : [];
  for (let i = 0; i < changeOuts.length; i++) {
    const stored = slipToJson(changeOuts[i]);
    if (!stored || !slipAmountPositive(stored)) {
      continue;
    }
    finalTx.addToSlip(new Slip(undefined, stored));
  }

  assignOutputSlipIndices(finalTx);

  console.warn('[RustScript fee-fund]', {
    label: 'funded-ok',
    feeNolan: feeNolan.toString(),
    fundedInputCount,
    skippedFeeInputs,
    finalFrom: Array.isArray(finalTx.from) ? finalTx.from.length : 0,
    finalTo: Array.isArray(finalTx.to) ? finalTx.to.length : 0
  });

  mod.unlock_transaction_final = finalTx;
  if (typeof mod.cloneUnlockCandidate === 'function') {
    mod.cloneUnlockCandidate();
  }

  return finalTx;
}

/**
 * Prepare the finalized funded transaction for CHECKSIG / CHECKMULTISIG.
 * Returns the auth message (message|p2sh_auth_hash) to sign.
 */
async function prepareUnlockForSigning(app, mod, message) {
  const finalTx = await ensureUnlockFeeFunded(app, mod);
  const authMessage = buildP2shAuthMessage(app, message, finalTx);
  return { finalTx, authMessage };
}

function markUnlockImmutable(mod) {
  if (mod) {
    mod.unlock_transaction_editable = false;
  }
}

function clearUnlockFee(mod, mainUi = null) {
  if (!mod) {
    return;
  }
  mod.unlock_fee = null;
  mod.unlock_transaction_final = null;
  if (typeof mod.cloneUnlockCandidate === 'function' && mod.unlock_transaction_base) {
    mod.cloneUnlockCandidate();
  }
  if (mainUi) {
    mainUi.executionStatus = { attempted: false, success: false };
    mainUi.validationDisplay = null;
  }
}

module.exports = {
  UNLOCK_SIGNED_ERROR,
  UNLOCK_FEE_LOCKED_ERROR,
  hasUnlockFee,
  isUnlockEditable,
  assertUnlockEditable,
  assertUnlockMutablePath,
  isWitnessSignaturePath,
  lockedInputCount,
  userOutputs,
  formatFeeAmount,
  lockUnlockFeeAmount,
  applyUnlockFee,
  ensureUnlockFeeFunded,
  prepareUnlockForSigning,
  buildP2shAuthMessage,
  getP2shAuthHash,
  assignOutputSlipIndices,
  markUnlockImmutable,
  clearUnlockFee,
  invalidateUnlockSignatures,
  clearSignatureWitnesses,
  // Compatibility stubs — fee funding is no longer shown in the UI.
  isFeeInputSlip: () => false,
  isChangeOutputSlip: () => false,
  walletFeeInputRows: () => []
};
