const MixinModule = require('./mixinmodule');
const { quoteIsExpired, verifyQuote } = require('../../store/lib/withdrawal-quote');

function authorizedSigners(mod) {
  const signers = [];
  const own = String(mod.publicKey || '').trim();
  if (own) {
    signers.push(own);
  }
  const configured = mod.delegated_payment_publickeys;
  const options = mod.app?.options?.mixin?.delegated_payment_publickeys;
  const allowed = Array.isArray(configured) ? configured : Array.isArray(options) ? options : [];
  for (const candidate of allowed) {
    const key = String(candidate || '').trim();
    if (key && !signers.includes(key)) {
      signers.push(key);
    }
  }
  return signers;
}

function verifiedQuoteSigner(mod, data, signature) {
  for (const key of authorizedSigners(mod)) {
    if (verifyQuote(mod.app, data, signature, key)) {
      return key;
    }
  }
  return '';
}

function decimalUnits(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return null;
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100000000n + BigInt((fraction + '00000000').slice(0, 8));
}

function paidToTreasury(tx, treasury) {
  let total = 0n;
  let addressed = false;
  for (const slip of tx?.to || []) {
    if (String(slip?.publicKey || '') !== treasury) {
      continue;
    }
    addressed = true;
    try {
      total += BigInt(slip.amount ?? 0);
    } catch (err) {
      return { addressed: false, total: 0n };
    }
  }
  return { addressed, total };
}

function pairsFromQuote(data) {
  const transfers = Array.isArray(data?.transfer_uuids) ? data.transfer_uuids : null;
  const payments = Array.isArray(data?.payment_uuids) ? data.payment_uuids : null;
  if (!transfers || !payments || transfers.length !== payments.length || !transfers.length) {
    return null;
  }
  const pairs = [];
  const seenTransfers = new Set();
  const seenPayments = new Set();
  for (let i = 0; i < transfers.length; i += 1) {
    const transfer = String(transfers[i] || '').trim();
    const payment = String(payments[i] || '').trim();
    if (!transfer || !payment || seenTransfers.has(transfer) || seenPayments.has(payment)) {
      return null;
    }
    if (!/^[1-9]\d*$/.test(transfer)) {
      return null;
    }
    seenTransfers.add(transfer);
    seenPayments.add(payment);
    pairs.push({ transfer, payment });
  }
  return pairs;
}

function addressIsValid(mod, ticker, address) {
  const probe = {
    ticker,
    chain_id: '',
    mixin: mod
  };
  try {
    return MixinModule.prototype.validateAddress.call(probe, address) === true;
  } catch (err) {
    return false;
  }
}

async function receiveStoreWithdrawal(mod, tx, peer) {
  const message = tx?.returnMessage?.() || {};
  if (message.request !== 'store-withdrawal' || !message.data) {
    return { err: 'That transaction is not a store withdrawal.' };
  }
  const sender = String(tx.from?.[0]?.publicKey || '').trim();
  if (!tx.signature || !sender) {
    return { err: 'The withdrawal transaction is not signed.' };
  }
  if (typeof tx.isValid === 'function' && tx.isValid() !== true) {
    return { err: 'The withdrawal transaction signature is not valid.' };
  }
  const data = message.data;
  const claimed = String(data.publickey || '').trim();
  const signer = verifiedQuoteSigner(mod, data, message.signature);
  if (!signer) {
    const selfSigned = claimed && verifyQuote(mod.app, data, message.signature, claimed);
    console.error('Mixin store withdrawal quote was rejected', {
      claimed_publickey: claimed,
      delivering_peer: String(peer?.publicKey || ''),
      transaction_signer: sender,
      reason: selfSigned ? 'signer is not an authorized store' : 'signature is not valid'
    });
    return {
      err: selfSigned
        ? 'The store that signed this withdrawal quote is not authorized.'
        : 'The store withdrawal quote signature is not valid.'
    };
  }
  if (quoteIsExpired(data.timestamp)) {
    return { err: 'The withdrawal quote has expired.' };
  }
  const treasury = String(mod.publicKey || '').trim();
  if (!claimed || (claimed !== treasury && claimed !== signer)) {
    console.error('Mixin store withdrawal quote was rejected', {
      claimed_publickey: claimed,
      signer,
      reason: 'payment recipient is not the treasury or the authorized signer'
    });
    return { err: 'The withdrawal is not addressed to an authorized treasury.' };
  }
  const ticker = String(data.ticker || '').trim();
  const address = String(data.withdrawal_address || '').trim();
  if (!ticker || data.ticker !== ticker.toUpperCase()) {
    return { err: 'The withdrawal ticker is not valid.' };
  }
  if (!addressIsValid(mod, ticker, address)) {
    return { err: 'The withdrawal address is not valid for this cryptocurrency.' };
  }
  const pairs = pairsFromQuote(data);
  if (!pairs) {
    return { err: 'The withdrawal quote identifiers are not valid.' };
  }
  const required = BigInt(mod.app.wallet.convertSaitoToNolan(data.amount) ?? 0);
  const paid = paidToTreasury(tx, data.publickey);
  if (!paid.addressed || paid.total < required) {
    return { err: 'The transaction does not pay the treasury the required SAITO amount.' };
  }

  try {
    const recorded = await mod.database.recordStoreWithdrawal({
      request_id: String(data.timestamp),
      sender,
      ticker,
      saito_amount: String(data.amount),
      withdrawal_amount: String(data.withdrawal_amount),
      withdrawal_address: address,
      saito_tx_sig: tx.signature,
      saito_tx: typeof tx.serialize_to_web === 'function' ? tx.serialize_to_web(mod.app) || '' : '',
      outbound_sender: await sendingAddress(mod, ticker),
      pairs,
      payload: JSON.stringify({
        transfer_uuids: data.transfer_uuids,
        payment_uuids: data.payment_uuids,
        quote_signature: String(message.signature || '')
      })
    });
    return {
      transfer_id: recorded.transfer_id,
      replayed: recorded.replayed === true,
      message: 'A manual store withdrawal was recorded. The external cryptocurrency has not been sent.'
    };
  } catch (err) {
    return { err: err?.message || 'The withdrawal could not be recorded.' };
  }
}

async function sendingAddress(mod, ticker) {
  const crypto = (mod.crypto_mods || []).find((item) => item.ticker === ticker);
  if (!crypto?.asset_id || typeof mod.database?.findAddress !== 'function') {
    return '';
  }
  try {
    const found = await mod.database.findAddress({
      assetId: crypto.asset_id,
      publicKey: mod.publicKey
    });
    return String(found?.address || '');
  } catch (err) {
    return '';
  }
}

module.exports = { receiveStoreWithdrawal, authorizedSigners, decimalUnits };
