const Transaction = require('../../../lib/saito/transaction').default;

// A submitted amount may differ from the cached quote by this fraction.
// One basis point of floating-point noise is inside this band; a different rate is not.
const QUOTE_TOLERANCE = 0.01;

function saitoPublicKey(app, value) {
  const key = String(value || '').trim();
  if (!key || typeof app?.crypto?.isPublicKey !== 'function' || !app.crypto.isPublicKey(key)) {
    return '';
  }
  return key;
}

function storePurchaseMessage(app, raw) {
  if (!raw) {
    return null;
  }
  try {
    const tx = new Transaction();
    if (typeof tx.deserialize_from_web === 'function') {
      tx.deserialize_from_web(app, raw);
    }
    const message = typeof tx.returnMessage === 'function' ? tx.returnMessage() : null;
    if (message?.module === 'Store' && message?.request === 'purchase-asset') {
      return message;
    }
  } catch (err) {
    return null;
  }
  return null;
}

function storePurchaseRecipient(app, message) {
  return saitoPublicKey(app, message?.refund) || saitoPublicKey(app, message?.buyer);
}

class BuySaitoService {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.quote_tolerance = QUOTE_TOLERANCE;
  }

  /**
   * Start a normal SAITO purchase or a Store purchase. Distinguishes the two
   * from the request payload, computes the quote, then asks Transfers for a
   * purpose-aware deposit-address reservation.
   */
  async startPurchase(requesterPublickey, request = {}) {
    const ticker = request.ticker;
    const crypto = this.mod.crypto_mods.find((item) => item.ticker === ticker);
    if (!crypto) {
      throw new Error(`Unsupported payment ticker: ${ticker}`);
    }
    if (!crypto.last_update || Date.now() - crypto.last_update > 300000) {
      await crypto.returnMixinNetworkInfo();
    }
    const erc = this.mod.crypto_mods.find((item) => item.ticker === 'ERC-SAITO');
    if (erc && (!erc.last_update || Date.now() - erc.last_update > 300000)) {
      await erc.returnMixinNetworkInfo();
    }

    if (
      request.price_usd != null ||
      request.usd_price != null ||
      request.saito_price != null ||
      request.rate != null ||
      request.exchange_rate != null
    ) {
      throw new Error('BuySaito: the exchange rate is set by the server');
    }
    const ercPrice = Number(erc?.price_usd);
    const usdPrice = Number(crypto.price_usd);
    const priceFresh = (item) => item?.last_update && Date.now() - item.last_update <= 300000;
    if (
      !priceFresh(crypto) ||
      !priceFresh(erc) ||
      !Number.isFinite(usdPrice) ||
      usdPrice <= 0 ||
      !Number.isFinite(ercPrice) ||
      ercPrice <= 0
    ) {
      throw new Error(`No price is available for ${ticker}`);
    }
    // The same spread and six-decimal deposit rounding used when the client quoted.
    const saitoPrice = Math.max(0.001, 1.1 * ercPrice);
    const submittedIssue = Number(request.issue_amount);
    const submittedDeposit = Number(request.expected_deposit);
    const hasIssue = Number.isFinite(submittedIssue) && submittedIssue > 0;
    const hasDeposit = Number.isFinite(submittedDeposit) && submittedDeposit > 0;
    if (!hasIssue && !hasDeposit) {
      throw new Error('BuySaito: invalid payment amount');
    }
    const depositForIssue = (issue) =>
      Math.ceil(((issue * saitoPrice) / usdPrice) * 1000000) / 1000000;
    const issueForDeposit = (deposit) => Math.floor((deposit * usdPrice) / saitoPrice);
    const closeEnough = (submitted, expected) =>
      Number.isFinite(submitted) &&
      Number.isFinite(expected) &&
      expected > 0 &&
      Math.abs(submitted - expected) <= expected * this.quote_tolerance;
    let issueAmount = 0;
    let expectedDeposit = 0;
    if (
      hasIssue &&
      closeEnough(
        hasDeposit ? submittedDeposit : depositForIssue(submittedIssue),
        depositForIssue(submittedIssue)
      )
    ) {
      issueAmount = submittedIssue;
      expectedDeposit = depositForIssue(submittedIssue);
    } else if (
      hasDeposit &&
      closeEnough(
        hasIssue ? submittedIssue : issueForDeposit(submittedDeposit),
        issueForDeposit(submittedDeposit)
      )
    ) {
      expectedDeposit = submittedDeposit;
      issueAmount = issueForDeposit(submittedDeposit);
    } else {
      throw new Error('BuySaito: the order does not match the current exchange rate');
    }
    if (
      !Number.isFinite(issueAmount) ||
      issueAmount <= 0 ||
      !Number.isFinite(expectedDeposit) ||
      expectedDeposit <= 0
    ) {
      throw new Error('BuySaito: invalid payment amount');
    }

    const purchase = storePurchaseMessage(this.app, request.tx);
    let purpose = 'buysaito';
    let inboundConfirmationsRequired = Number(crypto.confirmations || 0);
    if (purchase) {
      if (!storePurchaseRecipient(this.app, purchase)) {
        throw new Error('Store purchase refund recipient is missing');
      }
      purpose = 'store-purchase';
      inboundConfirmationsRequired = 0;
    }

    const recipient =
      request.recipient_pubkey || request.recipient_publickey || requesterPublickey;
    const reserved = await this.mod.transfers.reserveAddress(requesterPublickey, {
      purpose,
      ticker,
      recipient_publickey: recipient,
      inbound_amount: String(expectedDeposit),
      outbound_amount: String(issueAmount),
      inbound_confirmations_required: inboundConfirmationsRequired,
      payload: request.tx || '',
      request_id: request.request_id || '',
      outbound_address: recipient
    });
    return this.buildDepositReservationResponse(reserved);
  }

  async releasePurchaseReservation(requesterPublickey, ticker) {
    return this.mod.transfers.releaseAddress(requesterPublickey, ticker, 'buysaito');
  }

  buildDepositReservationResponse(row) {
    let status = 'new';
    if (row.status === 'inbound_broadcast') {
      status = 'pending';
    } else if (row.status === 'inbound_confirmed') {
      status = 'confirmed';
    } else if (row.outbound_tx_sig && row.status !== 'outbound_confirmed') {
      status = 'issuing';
    }
    return {
      id: row.id,
      status,
      initiator_pubkey: row.requester_publickey,
      recipient_pubkey: row.recipient_publickey,
      issue_amount: row.outbound_amount,
      ticker: row.inbound_ticker || row.ticker,
      address: row.inbound_address || row.address,
      mixin_id: row.inbound_mixin_user_id || row.mixin_id,
      expected_deposit: row.inbound_amount,
      reserved_until:
        row.reserved_until != null
          ? Number(row.reserved_until)
          : Number(row.created_at) + this.mod.transfers.reservation_ms
    };
  }
}

module.exports = BuySaitoService;
module.exports.QUOTE_TOLERANCE = QUOTE_TOLERANCE;
module.exports.storePurchaseMessage = storePurchaseMessage;
module.exports.storePurchaseRecipient = storePurchaseRecipient;
