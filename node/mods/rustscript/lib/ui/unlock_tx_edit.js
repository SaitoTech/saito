/**
 * UI helpers for editing unlock_transaction_base outputs.
 * Does not attach fee funding; that lives on unlock_transaction_final.
 */

const Slip = require('./../../../../lib/saito/slip').default;
const { SlipType } = require('saito-js/lib/slip');
const {
  assertUnlockEditable,
  invalidateUnlockSignatures,
  isUnlockEditable
} = require('./unlock_tx_fee');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNolanAmount(app, amount) {
  try {
    const nolan = BigInt(amount || 0);
    if (typeof app?.wallet?.convertNolanToSaito === 'function') {
      return app.wallet.convertNolanToSaito(nolan);
    }
    return String(nolan);
  } catch (_err) {
    return String(amount || '0');
  }
}

function isNftSlip(slip) {
  const type = Number(slip?.type ?? slip?.slip_type);
  return type === SlipType.Bound || type === 9;
}

function unlockBaseOutputs(mod) {
  return Array.isArray(mod?.unlock_transaction_base?.to) ? mod.unlock_transaction_base.to : [];
}

/** User-created outputs on the editable base (fee change is never shown here). */
function unlockUserOutputs(mod) {
  return unlockBaseOutputs(mod);
}

function assignedSaitoNolan(mod) {
  let sum = BigInt(0);
  for (const slip of unlockUserOutputs(mod)) {
    if (isNftSlip(slip)) {
      continue;
    }
    try {
      sum += BigInt(slip.amount || 0);
    } catch (_err) {
      /* ignore */
    }
  }
  return sum;
}

function lockedSaitoNolan(mod) {
  try {
    return BigInt(mod?.unlockContext?.lockedSlip?.amount || 0);
  } catch (_err) {
    return BigInt(0);
  }
}

function remainingSaitoNolan(mod) {
  const rem = lockedSaitoNolan(mod) - assignedSaitoNolan(mod);
  return rem > BigInt(0) ? rem : BigInt(0);
}

function hasNftOutput(mod) {
  return unlockUserOutputs(mod).some(isNftSlip);
}

function nftUnits(mod) {
  const ctx = mod?.unlockContext;
  if (!ctx) {
    return BigInt(0);
  }
  if (ctx.nftAmount != null && ctx.nftAmount !== '') {
    try {
      return BigInt(ctx.nftAmount);
    } catch (_err) {
      /* fall through */
    }
  }
  try {
    return BigInt(ctx.lockedNftSlips?.[1]?.amount || 1);
  } catch (_err) {
    return BigInt(1);
  }
}

function remainingNftUnits(mod) {
  return hasNftOutput(mod) ? BigInt(0) : nftUnits(mod);
}

function refreshUnlockCandidate(mod, mainUi = null) {
  // Editable base changed — discard any stale funded clone (should not exist while editable).
  if (mod && isUnlockEditable(mod)) {
    mod.unlock_transaction_final = null;
  }
  if (typeof mod?.cloneUnlockCandidate === 'function') {
    mod.cloneUnlockCandidate();
  }
  // Outputs are part of the signed transaction — clear CHECKSIG / CHECKMULTISIG witnesses.
  invalidateUnlockSignatures(mod, mainUi);
}

function addSaitoOutput(app, mod, { recipient, amountSaito, amountNolan }, mainUi = null) {
  assertUnlockEditable(mod);

  const base = mod?.unlock_transaction_base;
  if (!base) {
    throw new Error('Unlock transaction is not ready.');
  }
  if (!recipient) {
    throw new Error('Recipient address is required.');
  }
  if (!app?.crypto?.isPublicKey?.(recipient)) {
    throw new Error('Enter a valid recipient address.');
  }

  let nolan;
  if (amountNolan != null && amountNolan !== '') {
    try {
      nolan = BigInt(amountNolan);
    } catch (_err) {
      throw new Error('Enter an amount greater than zero.');
    }
  } else {
    nolan = app.wallet.convertSaitoToNolan(String(amountSaito || '').trim());
  }
  if (nolan <= BigInt(0)) {
    throw new Error('Enter an amount greater than zero.');
  }

  const available = remainingSaitoNolan(mod);
  if (nolan > available) {
    throw new Error('Amount exceeds the remaining balance.');
  }

  const output = new Slip();
  output.publicKey = recipient;
  output.amount = nolan;
  output.type = SlipType.Normal;
  base.addToSlip(output);
  refreshUnlockCandidate(mod, mainUi);
  return output;
}

function addNftOutput(app, mod, { recipient }, mainUi = null) {
  assertUnlockEditable(mod);

  const base = mod?.unlock_transaction_base;
  const ctx = mod?.unlockContext;
  if (!base || !ctx) {
    throw new Error('Unlock transaction is not ready.');
  }
  if (!recipient) {
    throw new Error('Recipient address is required.');
  }
  if (!app?.crypto?.isPublicKey?.(recipient)) {
    throw new Error('Enter a valid recipient address.');
  }
  if (hasNftOutput(mod)) {
    throw new Error('This NFT already has an output.');
  }

  const output = new Slip();
  output.publicKey = recipient;
  output.amount = nftUnits(mod);
  output.type = SlipType.Bound;
  base.addToSlip(output);
  refreshUnlockCandidate(mod, mainUi);
  return output;
}

function removeOutputAt(mod, index, mainUi = null) {
  assertUnlockEditable(mod);

  const base = mod?.unlock_transaction_base;
  const outputs = unlockBaseOutputs(mod);
  if (!base || index < 0 || index >= outputs.length) {
    return false;
  }
  outputs.splice(index, 1);
  refreshUnlockCandidate(mod, mainUi);
  return true;
}

function parsePositiveSaitoAmount(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return null;
  }
  const num = Number(text);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return text;
}

module.exports = {
  escapeHtml,
  formatNolanAmount,
  isNftSlip,
  unlockBaseOutputs,
  unlockUserOutputs,
  remainingSaitoNolan,
  remainingNftUnits,
  hasNftOutput,
  addSaitoOutput,
  addNftOutput,
  removeOutputAt,
  parsePositiveSaitoAmount
};
