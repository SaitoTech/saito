const Decimal = require('decimal.js');
const { v4 } = require('uuid');
const {
  MixinApi,
  getED25519KeyPair,
  base64RawURLEncode,
  MixinCashier,
  buildSafeTransactionRecipient,
  getUnspentOutputsForRecipients,
  buildSafeTransaction,
  encodeSafeTransaction,
  signSafeTransaction,
  blake3Hash
} = require('@mixin.dev/mixin-node-sdk');

function createAppSession() {
  if (typeof process === 'undefined' || typeof process.env.MIXIN === 'undefined') {
    return null;
  }

  let config = null;
  try {
    config = JSON.parse(process.env.MIXIN);
  } catch (err) {
    return null;
  }

  if (!config) {
    return null;
  }

  return MixinApi({
    keystore: {
      app_id: config.app_id,
      session_id: config.session_id,
      server_public_key: config.server_public_key,
      session_private_key: config.session_private_key
    }
  });
}

function createUserSession(credentials = {}) {
  const keystore = {
    app_id: credentials.user_id,
    session_id: credentials.session_id,
    pin_token_base64: credentials.tip_key_base64 || credentials.pin_token_base64,
    session_private_key: credentials.session_seed || credentials.session_private_key
  };
  const spendPrivateKey = credentials.spend_private_key;
  const missing = [];

  for (const [name, value] of Object.entries({ ...keystore, spend_private_key: spendPrivateKey })) {
    if (!value) {
      missing.push(name);
    }
  }

  if (missing.length) {
    throw new Error(`Mixin account configuration is incomplete (missing: ${missing.join(', ')})`);
  }

  return MixinApi({ keystore });
}

function getWithdrawalFeeQuote(quotes, assetId, chainAssetId) {
  const list = Array.isArray(quotes) ? quotes : quotes ? [quotes] : [];
  const assetQuote = list.find((quote) => quote.asset_id === assetId);
  const chainQuote = list.find((quote) => quote.asset_id === chainAssetId);
  return assetQuote ?? chainQuote ?? (list.length === 1 ? list[0] : null);
}

function memoBytes(memo = '') {
  if (Buffer.isBuffer(memo)) {
    return memo;
  }
  return Buffer.from(String(memo), 'utf8');
}

function pendingBalance(balance, ...deductions) {
  let pending = new Decimal(balance);
  for (const deduction of deductions) {
    pending = pending.minus(deduction);
  }
  return Number(pending.toFixed(8));
}

function formatMixinError(err) {
  const apiError = err?.response?.data?.error;
  if (apiError?.description || apiError?.code) {
    return [apiError.code, apiError.description].filter(Boolean).join(': ');
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  try {
    const serialized = JSON.stringify(err);
    return serialized === undefined ? String(err) : serialized;
  } catch (jsonError) {
    return String(err);
  }
}

function snapshotOffset(createdAt = 0) {
  let offset = new Date(createdAt).toISOString();
  offset = offset.substring(0, offset.length - 1);
  return offset + '000000Z';
}

class Api {
  createAppSession() {
    return createAppSession();
  }

  async createAccount(displayName) {
    const appSession = createAppSession();
    if (!appSession) {
      throw new Error('Cannot process Mixin account request for peer');
    }

    const { seed: sessionSeed, publicKey: sessionPublicKey } = getED25519KeyPair();
    const sessionPrivateKey = sessionSeed.toString('hex');
    const user = await appSession.user.createBareUser(
      displayName,
      base64RawURLEncode(sessionPublicKey)
    );

    // This session exists only long enough to set the first spend key.
    // createUserSession requires that key, so it cannot build this session.
    const session = MixinApi({
      keystore: {
        app_id: user.user_id,
        session_id: user.session_id,
        pin_token_base64: user.pin_token_base64,
        session_private_key: sessionPrivateKey
      }
    });

    const { publicKey: spendPublicKey, seed: spendPrivateKey } = getED25519KeyPair();
    const spendPrivateKeyHex = spendPrivateKey.toString('hex');

    await session.pin.updateTipPin('', spendPublicKey.toString('hex'), user.tip_counter + 1);
    await session.pin.verifyTipPin(spendPrivateKey);
    const account = await session.safe.register(user.user_id, spendPrivateKeyHex, spendPrivateKey);

    return {
      user_id: account.user_id,
      full_name: account.full_name,
      session_id: account.session_id,
      tip_key_base64: account.tip_key_base64,
      spend_private_key: spendPrivateKeyHex,
      spend_public_key: spendPublicKey.toString('hex'),
      session_seed: sessionPrivateKey,
      backed_up: true
    };
  }

  async createAddress(credentials, chainId) {
    if (!chainId) {
      console.error('ERROR: Cannot create Mixin deposit address without a chain ID');
      return false;
    }

    try {
      const session = createUserSession(credentials);
      const address = await session.safe.createDeposit(chainId);
      const destination = address?.[0]?.destination;
      if (!destination) {
        console.error('ERROR: Mixin error create deposit address: Deposit Address undefined!');
        return false;
      }
      console.log('New MIXIN deposit address:', address);
      return destination;
    } catch (err) {
      console.error('ERROR: Mixin error create deposit address: ' + formatMixinError(err));
      return false;
    }
  }

  async fetchBalance(credentials, assetId) {
    try {
      const session = createUserSession(credentials);
      return await session.utxo.safeAssetBalance({
        members: [credentials.user_id],
        threshold: 1,
        asset: assetId
      });
    } catch (err) {
      console.error('ERROR: Mixin error fetch safe utxo: ' + err);
      return false;
    }
  }

  async fetchHistory(credentials, assetId, since = 0) {
    try {
      const session = createUserSession(credentials);
      return await session.safe.fetchSafeSnapshots({
        asset: assetId,
        limit: 500,
        offset: snapshotOffset(since)
      });
    } catch (err) {
      console.error('ERROR: Mixin error fetch safe snapshots: ' + err);
      return false;
    }
  }

  async fetchDeposits(credentials, assetId, address) {
    try {
      if (!address) {
        return [];
      }
      const session = createUserSession(credentials);
      return await session.safe.pendingDeposits({
        asset: assetId,
        destination: address
      });
    } catch (err) {
      console.error('ERROR: Mixin error fetch fetchPendingDeposits: ' + err);
      return false;
    }
  }

  async fetchAsset(credentials, assetId) {
    try {
      const session = createUserSession(credentials);
      return await session.network.fetchAsset(assetId);
    } catch (err) {
      console.error('ERROR: Mixin error check network fee: ' + err);
      return false;
    }
  }

  async fetchWithdrawalFee(credentials, assetId, address) {
    try {
      const session = createUserSession(credentials);
      const asset = await session.safe.fetchAsset(assetId);
      const chain =
        asset.chain_id === asset.asset_id ? asset : await session.safe.fetchAsset(asset.chain_id);
      const quotes = await session.safe.fetchFee(asset.asset_id, address);
      const quote = getWithdrawalFeeQuote(quotes, asset.asset_id, chain.asset_id);

      if (!quote?.asset_id || quote.amount == null) {
        throw new Error(`No withdrawal fee available for ${assetId}`);
      }

      const feeAsset =
        quote.asset_id === asset.asset_id
          ? asset
          : quote.asset_id === chain.asset_id
            ? chain
            : await session.safe.fetchAsset(quote.asset_id);

      return {
        ...quote,
        amount: quote.amount,
        assetId: quote.asset_id,
        ticker: feeAsset.display_symbol || feeAsset.symbol
      };
    } catch (err) {
      console.error('ERROR: Mixin error check withdrawl fee: ' + err);
      return false;
    }
  }

  async sendToUser(credentials, assetId, mixinUserId, amount, memo = '') {
    const session = createUserSession(credentials);
    const spendPrivateKey = credentials.spend_private_key;
    const members = [mixinUserId];
    const threshold = 1;
    const recipients = [buildSafeTransactionRecipient(members, threshold, amount)];
    const outputs = await session.utxo.safeOutputs({
      members: [credentials.user_id],
      threshold: 1,
      asset: assetId,
      state: 'unspent'
    });
    const balance = await session.utxo.safeAssetBalance({
      members: [credentials.user_id],
      threshold: 1,
      asset: assetId,
      state: 'unspent'
    });
    const { utxos, change } = getUnspentOutputsForRecipients(outputs, recipients);

    if (!change.isZero() && !change.isNegative()) {
      recipients.push(
        buildSafeTransactionRecipient(
          outputs[0].receivers,
          outputs[0].receivers_threshold,
          change.toString()
        )
      );
    }

    const requestId = v4();
    const ghosts = await session.utxo.ghostKey(recipients, requestId, spendPrivateKey);
    const tx = buildSafeTransaction(utxos, recipients, ghosts, memoBytes(memo));
    let raw;
    try {
      raw = encodeSafeTransaction(tx);
    } catch (err) {
      throw new Error(
        `Unable to encode Mixin Safe transaction (${tx.inputs.length} input(s), ${tx.outputs.length} output(s), asset ${tx.asset}): ${formatMixinError(err)}`
      );
    }

    const verifiedTx = await session.utxo.verifyTransaction([{ raw, request_id: requestId }]);
    const signedRaw = signSafeTransaction(tx, verifiedTx[0].views, spendPrivateKey);
    const sent = await session.utxo.sendTransactions([{ raw: signedRaw, request_id: requestId }]);

    return {
      hash: sent?.[0]?.transaction_hash || '',
      pendingBalance: pendingBalance(balance, amount)
    };
  }

  async sendToAddress(credentials, assetId, address, amount, memo = '') {
    const session = createUserSession(credentials);
    const spendPrivateKey = credentials.spend_private_key;
    const balance = await session.utxo.safeAssetBalance({
      members: [credentials.user_id],
      threshold: 1,
      asset: assetId,
      state: 'unspent'
    });
    const asset = await session.safe.fetchAsset(assetId);
    const chain =
      asset.chain_id === asset.asset_id ? asset : await session.safe.fetchAsset(asset.chain_id);
    const quotes = await session.safe.fetchFee(asset.asset_id, address);
    const quote = getWithdrawalFeeQuote(quotes, asset.asset_id, chain.asset_id);

    if (!quote?.asset_id || quote.amount == null) {
      throw new Error(`No withdrawal fee available for ${assetId}`);
    }

    const assetTicker = asset.display_symbol || asset.symbol;
    const feeAsset =
      quote.asset_id === asset.asset_id
        ? asset
        : quote.asset_id === chain.asset_id
          ? chain
          : await session.safe.fetchAsset(quote.asset_id);
    const feeTicker = feeAsset.display_symbol || feeAsset.symbol;
    const assetRequired = new Decimal(amount).plus(
      quote.asset_id === asset.asset_id ? quote.amount : 0
    );

    if (new Decimal(balance).lessThan(assetRequired)) {
      throw new Error(
        `Insufficient ${assetTicker} balance: ${assetRequired.toString()} required, ${balance} available.`
      );
    }

    if (quote.asset_id !== asset.asset_id) {
      const outputs = await session.utxo.safeOutputs({ asset: assetId, state: 'unspent' });
      const feeOutputs = await session.utxo.safeOutputs({
        asset: quote.asset_id,
        state: 'unspent'
      });
      const feeBalance = await session.utxo.safeAssetBalance({
        members: [credentials.user_id],
        threshold: 1,
        asset: quote.asset_id,
        state: 'unspent'
      });

      if (new Decimal(feeBalance).lessThan(quote.amount)) {
        throw new Error(
          `A ${feeTicker} balance is required to withdraw ${assetTicker}. ` +
            `The network fee is ${quote.amount} ${feeTicker}, but only ${feeBalance} ${feeTicker} is available.`
        );
      }

      const recipients = [{ amount, destination: address }];
      const { utxos, change } = getUnspentOutputsForRecipients(outputs, recipients);
      if (!change.isZero() && !change.isNegative()) {
        recipients.push(
          buildSafeTransactionRecipient(
            outputs[0].receivers,
            outputs[0].receivers_threshold,
            change.toString()
          )
        );
      }

      const txId = v4();
      const ghosts = await session.utxo.ghostKey(recipients, txId, spendPrivateKey);
      const tx = buildSafeTransaction(utxos, recipients, ghosts, memoBytes(memo));
      const raw = encodeSafeTransaction(tx);
      const ref = blake3Hash(Buffer.from(raw, 'hex')).toString('hex');
      const feeRecipients = [buildSafeTransactionRecipient([MixinCashier], 1, quote.amount)];
      const { utxos: feeUtxos, change: feeChange } = getUnspentOutputsForRecipients(
        feeOutputs,
        feeRecipients
      );

      if (!feeChange.isZero() && !feeChange.isNegative()) {
        feeRecipients.push(
          buildSafeTransactionRecipient(
            feeOutputs[0].receivers,
            feeOutputs[0].receivers_threshold,
            feeChange.toString()
          )
        );
      }

      const feeId = v4();
      const feeGhosts = await session.utxo.ghostKey(feeRecipients, feeId, spendPrivateKey);
      const feeTx = buildSafeTransaction(feeUtxos, feeRecipients, feeGhosts, memoBytes(), [ref]);
      const feeRaw = encodeSafeTransaction(feeTx);
      const txs = await session.utxo.verifyTransaction([
        { raw, request_id: txId },
        { raw: feeRaw, request_id: feeId }
      ]);
      const signedRaw = signSafeTransaction(tx, txs[0].views, spendPrivateKey);
      const signedFeeRaw = signSafeTransaction(feeTx, txs[1].views, spendPrivateKey);
      const sent = await session.utxo.sendTransactions([
        { raw: signedRaw, request_id: txId },
        { raw: signedFeeRaw, request_id: feeId }
      ]);

      return {
        hash: sent?.[0]?.transaction_hash || '',
        pendingBalance: pendingBalance(balance, amount)
      };
    }

    const outputs = await session.utxo.safeOutputs({ asset: assetId, state: 'unspent' });
    const recipients = [
      { amount, destination: address },
      buildSafeTransactionRecipient([MixinCashier], 1, quote.amount)
    ];
    const { utxos, change } = getUnspentOutputsForRecipients(outputs, recipients);
    if (!change.isZero() && !change.isNegative()) {
      recipients.push(
        buildSafeTransactionRecipient(
          outputs[0].receivers,
          outputs[0].receivers_threshold,
          change.toString()
        )
      );
    }

    const requestId = v4();
    const ghosts = await session.utxo.ghostKey(recipients, requestId, spendPrivateKey);
    const tx = buildSafeTransaction(utxos, recipients, ghosts, memoBytes(memo));
    const raw = encodeSafeTransaction(tx);
    const txs = await session.utxo.verifyTransaction([{ raw, request_id: requestId }]);
    const signedRaw = signSafeTransaction(tx, txs[0].views, spendPrivateKey);
    const sent = await session.utxo.sendTransactions([{ raw: signedRaw, request_id: requestId }]);

    return {
      hash: sent?.[0]?.transaction_hash || '',
      pendingBalance: pendingBalance(balance, amount, quote.amount)
    };
  }
}

module.exports = Api;
module.exports.createAppSession = createAppSession;
module.exports.createUserSession = createUserSession;
module.exports.getWithdrawalFeeQuote = getWithdrawalFeeQuote;
module.exports.formatMixinError = formatMixinError;
