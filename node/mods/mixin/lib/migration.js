const email = require('./email');

const TICKERS = ['ERC-SAITO', 'BEP-SAITO'];
const MAX_DEPOSIT = 1000000;
const MIN_TREASURY = 1000;
const OPEN_STATUSES = [
  'inbound_awaiting',
  'inbound_broadcast',
  'inbound_confirmed',
  'outbound_awaiting',
  'outbound_broadcast'
];

class MigrationService {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.bot_wallet = {};
  }

  supportedTicker(ticker = '') {
    return TICKERS.includes(ticker);
  }

  recordMigrationBotWalletAddress(ticker, address) {
    if (ticker && address) {
      this.bot_wallet[ticker] = address;
    }
  }

  allocationForDeposit(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Migration amount must be positive');
    }
    if (value > MAX_DEPOSIT) {
      throw new Error('Migration amount exceeds the 1000000 cap');
    }
    return value;
  }

  async treasury() {
    const nolan = await this.app.wallet.getBalance('SAITO');
    let available = Number(this.app.wallet.convertNolanToSaito(nolan));
    if (!Number.isFinite(available) || available < 0) {
      available = 0;
    }
    if (available > MAX_DEPOSIT) {
      available = MAX_DEPOSIT;
    } else {
      email.sendLowBalanceEmail(this.app, available);
    }
    return { max_deposit: available, accepted: available >= MIN_TREASURY };
  }

  assetFor(ticker) {
    return (this.mod.crypto_mods || []).find((item) => item.ticker === ticker) || null;
  }

  async collectionAddress(ticker) {
    const crypto = this.assetFor(ticker);
    if (!crypto?.asset_id) {
      throw new Error(`${ticker} is not installed`);
    }
    const credentials = this.mod.accounts.getCredentials();
    if (!credentials?.user_id) {
      throw new Error('Server Mixin account is not configured');
    }
    let found = await this.mod.database.findAddress({
      assetId: crypto.asset_id,
      mixinUserId: credentials.user_id
    });
    if (!found?.address) {
      const created = await this.mod.accounts.createAddress(
        crypto.asset_id,
        crypto.chain_id,
        credentials
      );
      if (!created) {
        throw new Error(`Unable to create a ${ticker} deposit address`);
      }
      found = { address: created, user_id: credentials.user_id };
    }
    return {
      address: found.address,
      user_id: credentials.user_id,
      packed: `${found.address}|${credentials.user_id}|mixin`,
      asset_id: crypto.asset_id,
      chain_id: crypto.chain_id || ''
    };
  }

  async findByInboundHash(hash) {
    if (!hash) {
      return null;
    }
    const rows = await this.mod.database.query(
      `SELECT * FROM transfers WHERE purpose = 'migration' AND inbound_tx_hash = $hash LIMIT 1`,
      { $hash: hash }
    );
    return rows?.[0] || null;
  }

  async findByRequestId(hash) {
    if (!hash) {
      return null;
    }
    const rows = await this.mod.database.query(
      `SELECT * FROM transfers WHERE purpose = 'migration' AND request_id = $hash LIMIT 1`,
      { $hash: hash }
    );
    return rows?.[0] || null;
  }

  async claimsAnnouncement(txmsg) {
    const credentials = this.mod.accounts.getCredentials();
    const parts = String(txmsg?.to || '').split('|');
    if (credentials?.user_id && parts.includes(credentials.user_id)) {
      return true;
    }
    if (await this.findByInboundHash(txmsg?.hash)) {
      return true;
    }
    if (await this.findByRequestId(txmsg?.hash)) {
      return true;
    }
    return false;
  }

  normalizeChainAddress(address = '') {
    const value = String(address || '').trim();
    if (!/^0x[a-fA-F0-9]{40}$/i.test(value)) {
      throw new Error('A valid ERC20/BEP20 address is required');
    }
    return value.toLowerCase();
  }

  async openRequest(publicKey, ticker, chainAddress, email) {
    if (!publicKey) {
      return { error: 'A Saito address is required', ticker };
    }
    if (!this.supportedTicker(ticker)) {
      return { error: `Unsupported wrapped SAITO ticker: ${ticker}`, ticker };
    }
    const normalizedEmail = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      return { error: 'A valid email address is required', ticker };
    }
    let sender = '';
    try {
      sender = this.normalizeChainAddress(chainAddress);
    } catch (err) {
      return { error: err.message, ticker };
    }
    const treasury = await this.treasury();
    if (!treasury.accepted) {
      return {
        error: 'Insufficient balance in the Migration bot',
        ticker
      };
    }

    const existing = await this.mod.database.getTransfers({
      purpose: 'migration',
      mode: 'automatic',
      inbound_ticker: ticker
    });
    const open = (existing || []).filter(
      (row) => !Number(row.excluded) && OPEN_STATUSES.includes(row.status)
    );
    const conflict = open.find(
      (row) => row.inbound_sender === sender && row.requester_publickey !== publicKey
    );
    if (conflict) {
      return { error: 'That chain address already has an open migration request', ticker };
    }
    const mine = open.find((row) => row.requester_publickey === publicKey);
    if (mine) {
      if (!mine.inbound_tx_hash && (mine.inbound_sender !== sender || mine.email !== normalizedEmail)) {
        await this.mod.database.updateTransfer(mine.id, {
          inbound_sender: sender,
          email: normalizedEmail,
          recipient_publickey: publicKey,
          outbound_address: publicKey
        });
      }
      return {
        address: mine.inbound_address,
        ticker,
        id: mine.id,
        error: null
      };
    }

    const collection = await this.collectionAddress(ticker);
    const now = Date.now();
    let inboundConfirmationBlockId;
    try {
      const raw = await this.app.blockchain.getLatestBlockId();
      inboundConfirmationBlockId = typeof raw === 'bigint' ? Number(raw) : raw;
    } catch (err) {
      inboundConfirmationBlockId = null;
    }
    if (
      !Number.isInteger(inboundConfirmationBlockId) ||
      inboundConfirmationBlockId < 0 ||
      !Number.isSafeInteger(inboundConfirmationBlockId)
    ) {
      return { error: 'Saito block height is unavailable', ticker };
    }
    const id = await this.mod.database.insertTransfer({
      purpose: 'migration',
      mode: 'automatic',
      requester_publickey: publicKey,
      recipient_publickey: publicKey,
      status: 'inbound_awaiting',
      email: normalizedEmail,
      inbound_ticker: ticker,
      inbound_asset_id: collection.asset_id,
      inbound_chain_id: collection.chain_id,
      inbound_address: collection.address,
      inbound_sender: sender,
      inbound_mixin_user_id: collection.user_id,
      inbound_confirmations_required: 0,
      inbound_confirmation_block_id: inboundConfirmationBlockId,
      outbound_ticker: 'SAITO',
      outbound_address: publicKey,
      created_at: now
    });
    return {
      address: collection.address,
      ticker,
      id,
      error: null
    };
  }

  async recordManualMigration(tx) {
    const data = tx.returnMessage()?.data || {};
    const publicKey = data.pk || tx.from?.[0]?.publicKey || '';
    if (!publicKey) {
      return null;
    }
    const existing = await this.mod.database.getTransfers({
      requester_publickey: publicKey,
      purpose: 'migration',
      mode: 'manual'
    });
    const open = (existing || []).find(
      (row) =>
        !Number(row.excluded) && row.email === (data.email || '') && OPEN_STATUSES.includes(row.status)
    );
    if (open) {
      return open;
    }
    let inboundConfirmationBlockId;
    try {
      const raw = await this.app.blockchain.getLatestBlockId();
      inboundConfirmationBlockId = typeof raw === 'bigint' ? Number(raw) : raw;
    } catch (err) {
      inboundConfirmationBlockId = null;
    }
    if (
      !Number.isInteger(inboundConfirmationBlockId) ||
      inboundConfirmationBlockId < 0 ||
      !Number.isSafeInteger(inboundConfirmationBlockId)
    ) {
      return null;
    }
    const id = await this.mod.database.insertTransfer({
      purpose: 'migration',
      mode: 'manual',
      requester_publickey: publicKey,
      recipient_publickey: publicKey,
      status: 'inbound_awaiting',
      email: data.email || '',
      payload: JSON.stringify({
        erc20: data.erc20 || '',
        email: data.email || '',
        source: 'manual-request'
      }),
      inbound_sender: data.erc20 || '',
      inbound_confirmation_block_id: inboundConfirmationBlockId,
      outbound_ticker: 'SAITO',
      created_at: tx.timestamp || Date.now()
    });
    const rows = await this.mod.database.getTransfers({ id });
    return rows[0];
  }

  async verifyManualDeposit(id, amount, txHash) {
    const rows = await this.mod.database.getTransfers({ id: Number(id) });
    const row = rows?.[0];
    if (!row || row.purpose !== 'migration' || row.mode !== 'manual') {
      throw new Error('No manual migration matches that id.');
    }
    if (Number(row.excluded) === 1) {
      throw new Error('That transfer is excluded from processing.');
    }
    if (row.outbound_tx_sig) {
      return row;
    }
    if (!['inbound_awaiting', 'inbound_broadcast'].includes(row.status)) {
      throw new Error('Migration deposit cannot be verified from its current status.');
    }
    const allocated = this.allocationForDeposit(amount);
    if (!txHash) {
      throw new Error('Migration deposit hash is required.');
    }
    const duplicate = await this.findByInboundHash(txHash);
    if (duplicate && String(duplicate.id) !== String(row.id)) {
      throw new Error('Migration deposit was already recorded.');
    }
    await this.mod.database.updateTransfer(row.id, {
      status: 'inbound_confirmed',
      inbound_amount: String(allocated),
      outbound_amount: String(allocated),
      inbound_tx_hash: txHash,
      inbound_confirmations: 1,
      inbound_confirmations_required: 1
    });
    this.mod.creditDepositAddress?.(row.inbound_address, amount, txHash);
    return (await this.mod.database.getTransfers({ id: row.id }))[0];
  }
}

module.exports = MigrationService;
