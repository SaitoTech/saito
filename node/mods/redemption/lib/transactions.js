const REDEMPTION_NFT_TYPE = 'redemption-nft';
const REQUEST_REDEEM = 'redemption-request-redeem';
const REQUEST_STATUS = 'redemption-request-status';
const ACTIVE_STATUSES = ['new', 'pending', 'processed'];

function blocksSince(tipBlockId, custodyBlockId) {
  if (tipBlockId == null || tipBlockId === '' || custodyBlockId == null || custodyBlockId === '') {
    return null;
  }
  try {
    const tip = BigInt(tipBlockId);
    const created = BigInt(custodyBlockId);
    if (tip < created) {
      return null;
    }
    return tip - created;
  } catch (err) {
    return null;
  }
}

function normalizeAmount(value) {
  const text = String(value ?? '').trim();
  if (!/^[0-9]+$/.test(text)) {
    return '';
  }
  return text.replace(/^0+(?=\d)/, '');
}

function normalizeBlocksRequired(value) {
  if (typeof value === 'bigint') {
    return value < 0n ? '' : value.toString();
  }
  const text = String(value ?? '').trim();
  if (!/^[0-9]+$/.test(text)) {
    return '';
  }
  return text.replace(/^0+(?=\d)/, '');
}

function parseRedemptionTerms(message) {
  const data = message?.data && typeof message.data === 'object' ? message.data : message;
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'missing-terms' };
  }

  const ticker = String(data.ticker || '')
    .trim()
    .toUpperCase();
  const amount = normalizeAmount(data.amount);
  const server_publickey = String(data.server_publickey || '').trim();
  const blocks_required = normalizeBlocksRequired(data.blocks_required);
  const collateral_id = String(data.collateral_id ?? '').trim();

  if (!/^[A-Z0-9]{2,12}$/.test(ticker)) {
    return { ok: false, reason: 'invalid-ticker' };
  }
  if (!amount || amount === '0') {
    return { ok: false, reason: 'invalid-amount' };
  }
  if (!server_publickey || /\s/.test(server_publickey)) {
    return { ok: false, reason: 'invalid-server' };
  }
  if (blocks_required === '') {
    return { ok: false, reason: 'invalid-blocks-required' };
  }
  if (!collateral_id || collateral_id.length > 256 || /[\r\n]/.test(collateral_id)) {
    return { ok: false, reason: 'invalid-collateral-id' };
  }

  return {
    ok: true,
    terms: {
      ticker,
      amount,
      server_publickey,
      blocks_required,
      collateral_id
    }
  };
}

function authorizerPublicKey(tx) {
  const inputs = Array.isArray(tx?.from) ? tx.from : [];
  for (const slip of inputs) {
    const type = slip?.type;
    if (type === 9 || type === 'Bound') {
      continue;
    }
    if (slip?.publicKey) {
      return slip.publicKey;
    }
  }
  return '';
}

/**
 * The transaction signature covers hash(serialize_for_signature()), and that
 * preimage includes transaction.data. JavaScript verifySignature hashes its
 * buffer again, and serialize_for_signature() is not exposed to modules.
 * Transaction::validate exists in Rust and is also not exposed. This function
 * does not invent a second verifier.
 */
function transactionSignatureStatus(tx) {
  if (!tx?.signature) {
    return { ok: false, reason: 'missing-signature' };
  }
  if (typeof tx.generateHashForSignature !== 'function' || typeof tx.getHashForSignature !== 'function') {
    return { ok: false, reason: 'signature-api-missing' };
  }
  return { ok: false, reason: 'signature-preimage-unavailable' };
}

function issuerSignatureStatus(tx, creator) {
  const authorizer = authorizerPublicKey(tx);
  if (!creator || !authorizer) {
    return { ok: false, reason: 'issuer-unknown' };
  }
  if (authorizer !== creator) {
    return { ok: false, reason: 'authorizer-is-not-issuer' };
  }
  return transactionSignatureStatus(tx);
}

function isZeroHash(hash) {
  const text = String(hash || '');
  return text.length === 0 || /^0+$/.test(text);
}

function evaluateRedemption(input = {}) {
  const parsed = parseRedemptionTerms(input.terms || input.message);
  const reasons = [];

  if (input.nft_type !== REDEMPTION_NFT_TYPE) {
    reasons.push('unexpected-type');
  }
  if (!parsed.ok) {
    reasons.push(parsed.reason || 'missing-terms');
  }

  const terms = parsed.ok ? parsed.terms : null;
  const signature = input.signature || { ok: false, reason: 'missing-signature' };
  if (!signature.ok) {
    reasons.push(signature.reason || 'missing-signature');
  }

  if (terms && input.processing_server && terms.server_publickey !== input.processing_server) {
    reasons.push('server-mismatch');
  }
  if (input.server_connected === false) {
    reasons.push('server-not-connected');
  }

  if (input.spendable === false) {
    reasons.push('not-spendable');
  } else if (input.spendable == null) {
    reasons.push('spendability-unknown');
  }

  if (input.on_longest_chain === false) {
    reasons.push('not-on-longest-chain');
  } else if (input.on_longest_chain == null) {
    reasons.push('longest-chain-unknown');
  }

  const required = terms ? terms.blocks_required : '';
  const elapsed = blocksSince(input.tip_block_id, input.custody_block_id);
  let remaining = null;
  if (required !== '' && elapsed != null) {
    const gap = BigInt(required) - elapsed;
    remaining = gap > 0n ? gap : 0n;
    if (gap > 0n) {
      reasons.push('immature');
    }
  } else {
    reasons.push('maturity-unknown');
  }

  const existing = input.existing_status || '';
  if (existing === 'processed') {
    reasons.push('already-redeemed');
  } else if (existing === 'new' || existing === 'pending') {
    reasons.push('redemption-pending');
  }

  let status = 'eligible';
  if (
    reasons.includes('unexpected-type') ||
    reasons.includes('invalid-ticker') ||
    reasons.includes('invalid-amount') ||
    reasons.includes('invalid-server') ||
    reasons.includes('invalid-blocks-required') ||
    reasons.includes('invalid-collateral-id') ||
    reasons.includes('missing-terms') ||
    reasons.includes('authorizer-is-not-issuer') ||
    reasons.includes('issuer-unknown') ||
    reasons.includes('missing-signature') ||
    reasons.includes('server-mismatch') ||
    reasons.includes('not-spendable') ||
    reasons.includes('not-on-longest-chain')
  ) {
    status = 'invalid';
  } else if (reasons.includes('already-redeemed')) {
    status = 'redeemed';
  } else if (reasons.includes('redemption-pending')) {
    status = 'pending';
  } else if (reasons.includes('signature-preimage-unavailable') || reasons.includes('signature-api-missing')) {
    status = 'unverified';
  } else if (reasons.includes('immature')) {
    status = 'immature';
  } else if (reasons.length) {
    status = 'unavailable';
  }

  return {
    eligible: status === 'eligible',
    status,
    reasons,
    terms,
    remaining_blocks: remaining == null ? null : remaining.toString(),
    elapsed_blocks: elapsed == null ? null : elapsed.toString()
  };
}

function duplicateResult(existing) {
  if (!existing || !ACTIVE_STATUSES.includes(existing.status)) {
    return null;
  }
  const redeemed = existing.status === 'processed';
  return {
    result: 'duplicate',
    status: redeemed ? 'redeemed' : 'pending',
    notice: redeemed
      ? 'This redemption NFT has already been redeemed.'
      : 'A redemption request for this NFT is already being processed.'
  };
}

async function defaultBlocksRequired(app) {
  const chain = app?.blockchain?.instance;
  if (typeof chain?.get_last_block_id !== 'function' || typeof chain?.get_genesis_block_id !== 'function') {
    return null;
  }
  const tip = BigInt(await chain.get_last_block_id());
  const genesis = BigInt(await chain.get_genesis_block_id());
  if (tip < genesis) {
    return null;
  }
  return (tip - genesis).toString();
}

function slipBlockId(slip) {
  const raw = slip?.block_id ?? slip?.blockId;
  if (raw == null || raw === '') {
    return null;
  }
  try {
    return BigInt(raw).toString();
  } catch (err) {
    return null;
  }
}

function parseCustodySlip(utxo) {
  if (!utxo) {
    return null;
  }
  let parsed = null;
  try {
    const Slip = require('saito-js/lib/slip').default;
    parsed = Slip?.Type?.parse_slip_from_utxokey?.(utxo) || null;
  } catch (err) {
    parsed = null;
  }
  if (!parsed) {
    return null;
  }
  return {
    block_id: slipBlockId(parsed),
    public_key: parsed.public_key || '',
    index: Number(parsed.slip_index)
  };
}

async function chainPosition(app, blockId) {
  const chain = app?.blockchain?.instance;
  if (blockId == null || blockId === '' || typeof chain?.get_last_block_id !== 'function') {
    return { tip_block_id: null, on_longest_chain: null };
  }
  try {
    const tip = (await chain.get_last_block_id()).toString();
    if (typeof chain.get_longest_chain_hash_at !== 'function') {
      return { tip_block_id: tip, on_longest_chain: null };
    }
    const hash = await chain.get_longest_chain_hash_at(BigInt(blockId));
    return { tip_block_id: tip, on_longest_chain: !isZeroHash(hash) };
  } catch (err) {
    return { tip_block_id: null, on_longest_chain: null };
  }
}

async function slipIsSpendable(app, utxo) {
  const chain = app?.blockchain?.instance;
  if (!utxo || typeof chain?.is_slip_spendable !== 'function') {
    return null;
  }
  try {
    return !!(await chain.is_slip_spendable(utxo));
  } catch (err) {
    return null;
  }
}

function nftTypeOf(app, nft) {
  const fromSlip = nft?.slip3?.utxo_key || nft?.slip3_utxo || '';
  if (fromSlip && typeof app?.wallet?.extractNFTType === 'function') {
    return app.wallet.extractNFTType(fromSlip) || '';
  }
  if (typeof nft?.returnType === 'function') {
    return nft.returnType() || '';
  }
  return nft?.nft_type || '';
}

async function inspectWalletNft(app, nft, options = {}) {
  const nft_type = nftTypeOf(app, nft);
  const creator = nft?.slip1?.public_key || nft?.creator || '';
  const message = typeof nft?.tx?.returnMessage === 'function' ? nft.tx.returnMessage() : nft?.txmsg;
  const parsed = parseRedemptionTerms(message);
  const custody = nft?.slip2 || null;
  const custody_block_id = slipBlockId(custody);
  const position = await chainPosition(app, custody_block_id);
  const spendable = await slipIsSpendable(app, custody?.utxo_key || '');
  const signature = issuerSignatureStatus(nft?.tx, creator);

  return {
    nft_id: nft?.id || '',
    tx_sig: nft?.tx_sig || nft?.tx?.signature || '',
    custody_utxo: custody?.utxo_key || '',
    slip1_utxo: nft?.slip1?.utxo_key || '',
    slip3_utxo: nft?.slip3?.utxo_key || '',
    creator,
    nft_type,
    ...evaluateRedemption({
      nft_type,
      terms: parsed.ok ? parsed.terms : message,
      processing_server: options.processing_server || '',
      server_connected: options.server_connected,
      signature,
      spendable,
      on_longest_chain: position.on_longest_chain,
      tip_block_id: position.tip_block_id,
      custody_block_id,
      existing_status: options.existing_status || ''
    })
  };
}

function loadArchivedTransaction(app, signature) {
  return new Promise((resolve) => {
    if (!signature || typeof app?.storage?.loadTransactions !== 'function') {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (tx) => {
      if (done) {
        return;
      }
      done = true;
      resolve(tx || null);
    };
    try {
      const pending = app.storage.loadTransactions({ sig: signature }, (txs) => {
        finish(Array.isArray(txs) && txs.length ? txs[0] : null);
      });
      if (pending && typeof pending.then === 'function') {
        pending.then(() => finish(null)).catch(() => finish(null));
      }
    } catch (err) {
      finish(null);
    }
    setTimeout(() => finish(null), 8000);
  });
}

async function tupleSpendable(app, utxos) {
  let seen = false;
  for (const utxo of utxos) {
    if (!utxo) {
      continue;
    }
    seen = true;
    const spendable = await slipIsSpendable(app, utxo);
    if (spendable === false) {
      return false;
    }
    if (spendable == null) {
      return null;
    }
  }
  return seen ? true : null;
}

async function inspectRedemptionRequest(app, payload = {}, processingServer = '') {
  const tx = await loadArchivedTransaction(app, payload.tx_sig);
  if (!tx) {
    return {
      eligible: false,
      status: 'unavailable',
      reasons: ['transaction-not-found'],
      terms: null,
      remaining_blocks: null,
      nft_id: payload.nft_id || '',
      tx_sig: payload.tx_sig || '',
      custody_utxo: payload.custody_utxo || ''
    };
  }

  const nft_id = app?.wallet?.computeNFTIdFromTx?.(tx) || '';
  const nft_type = nft_id && app?.wallet?.extractNFTType ? app.wallet.extractNFTType(nft_id) : '';
  const creator = tx.to?.[0]?.publicKey || '';
  const custody = parseCustodySlip(payload.custody_utxo);
  const spendable =
    !custody || custody.index !== 1
      ? false
      : await tupleSpendable(app, [payload.slip1_utxo, payload.custody_utxo, payload.slip3_utxo]);
  const position = await chainPosition(app, custody?.block_id);
  const decision = evaluateRedemption({
    nft_type: nft_id && nft_id === payload.nft_id ? nft_type : '',
    terms: typeof tx.returnMessage === 'function' ? tx.returnMessage() : null,
    processing_server: processingServer,
    signature: issuerSignatureStatus(tx, creator),
    spendable,
    on_longest_chain: position.on_longest_chain,
    tip_block_id: position.tip_block_id,
    custody_block_id: custody?.block_id || '',
    existing_status: payload.existing_status || ''
  });

  return {
    ...decision,
    nft_id: payload.nft_id || nft_id,
    tx_sig: payload.tx_sig || tx.signature || '',
    custody_utxo: payload.custody_utxo || '',
    custody_block_id: custody?.block_id || '',
    tip_block_id: position.tip_block_id || '',
    creator
  };
}

module.exports = {
  REDEMPTION_NFT_TYPE,
  REQUEST_REDEEM,
  REQUEST_STATUS,
  ACTIVE_STATUSES,
  blocksSince,
  parseRedemptionTerms,
  authorizerPublicKey,
  transactionSignatureStatus,
  issuerSignatureStatus,
  evaluateRedemption,
  duplicateResult,
  defaultBlocksRequired,
  slipBlockId,
  parseCustodySlip,
  chainPosition,
  slipIsSpendable,
  nftTypeOf,
  inspectWalletNft,
  loadArchivedTransaction,
  inspectRedemptionRequest
};
