const email = require('./email');

const TICKERS = ['ERC-SAITO', 'BEP-SAITO'];
const MAX_DEPOSIT = 1000000;
const MIN_TREASURY = 1000;
const OPEN_STATUSES = [
  'inbound_awaiting',
  'inbound_broadcast',
  'inbound_confirmed',
  'outbound_awaiting',
  'outbound_broadcast',
  'treasury_submitted',
  'treasury_accepted'
];

class MigrationService {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  /**
   * Shared 1:1 issuance policy used by automatic matching, manual confirmation,
   * treasury payout signing, and admin approval.
   */
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

  /**
   * Start an automatic migration for the Migrate button: validate the request,
   * gate on treasury funds, reserve a Mixin deposit address, and return the
   * instructions the client displays.
   */
  async startMigration(publicKey, ticker) {
    if (!publicKey) {
      return { error: 'A Saito address is required', ticker };
    }
    if (!TICKERS.includes(ticker)) {
      return { error: `Unsupported wrapped SAITO ticker: ${ticker}`, ticker };
    }
    const crypto = (this.mod.crypto_mods || []).find((item) => item.ticker === ticker) || null;
    if (!crypto?.asset_id) {
      return { error: `${ticker} is not installed`, ticker };
    }

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
    if (available < MIN_TREASURY) {
      return {
        error: 'Insufficient balance in the Migration bot',
        ticker
      };
    }

    let reserved;
    try {
      reserved = await this.mod.transfers.reserveAddress(publicKey, {
        purpose: 'migration',
        ticker,
        recipient_publickey: publicKey,
        inbound_amount: '',
        outbound_amount: '',
        inbound_confirmations_required: 0,
        payload: '',
        request_id: '',
        outbound_address: publicKey
      });
    } catch (err) {
      return { error: err?.message || String(err), ticker };
    }
    return this.clientReservation(reserved);
  }

  async getMigrationStatus(publicKey, id) {
    if (!publicKey || !id) {
      return { error: 'Migration status requires an id' };
    }
    const rows = await this.mod.database.getTransfers({
      id: Number(id),
      purpose: 'migration',
      mode: 'automatic',
      requester_publickey: publicKey
    });
    const row = rows?.[0];
    if (!row) {
      return { error: 'Migration request not found' };
    }
    return this.clientReservation(row);
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

  async confirmManualMigrationDeposit(id, amount, txHash) {
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
    const claimed = await this.mod.database.claimInboundPayment(row.id, {
      status: 'inbound_confirmed',
      inbound_amount: String(allocated),
      outbound_amount: String(allocated),
      inbound_tx_hash: txHash,
      inbound_confirmations: 1,
      inbound_confirmations_required: 1
    });
    if (!claimed?.ok) {
      throw new Error('Migration deposit was already recorded.');
    }
    this.mod.creditDepositAddress?.(row.inbound_address, amount, txHash);
    return (await this.mod.database.getTransfers({ id: row.id }))[0];
  }

  clientReservation(row) {
    return {
      address: row.inbound_address || row.address,
      ticker: row.inbound_ticker || row.ticker,
      id: row.id,
      status: row.status,
      mixin_id: row.inbound_mixin_user_id || row.mixin_id,
      inbound_amount: row.inbound_amount || '',
      outbound_amount: row.outbound_amount || '',
      reserved_until:
        row.reserved_until != null
          ? Number(row.reserved_until)
          : Number(row.created_at) + this.mod.transfers.reservation_ms,
      error: null
    };
  }
}

module.exports = MigrationService;
