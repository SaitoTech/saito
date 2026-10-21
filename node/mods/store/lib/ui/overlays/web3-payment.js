const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const Web3PaymentTemplate = require('./web3-payment.template');
const { sendInsufficientFundsFollowup } = require('../../email');

const INSTRUCTION_TIMEOUT_MS = 35000;

function isWeb3Ticker(ticker = '') {
  const symbol = String(ticker || '').trim().toUpperCase();
  return symbol !== '' && symbol !== 'SAITO';
}

function scaleAmount(amount, quantity) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const raw = String(amount ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return '';
  }
  const [whole, fraction = ''] = raw.split('.');
  const digits = `${whole}${fraction}`.replace(/^0+/, '') || '0';
  const product = (BigInt(digits) * BigInt(qty)).toString().padStart(fraction.length + 1, '0');
  if (!fraction.length) {
    return product;
  }
  const cut = product.length - fraction.length;
  const head = product.slice(0, cut);
  const tail = product.slice(cut).replace(/0+$/, '');
  return tail ? `${head}.${tail}` : head;
}

class Web3PaymentOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true, true);
    this.overlay.clickBackdropToClose = false;
    this.session = 0;
    this.active = false;
    this.resetState();

    app.connection.on('saito-purchase-address-reserved', (data) => {
      this.receiveAddress(data);
    });
    app.connection.on('saito-purchase-payment-detected', (data) => {
      this.receivePaymentDetected(data);
    });
    app.connection.on('saito-purchase-error-notification', (data = {}) => {
      this.receiveError(data);
    });
    app.connection.on('saito-purchase-saito-issued', (data = {}) => {
      this.receiveIssued(data);
    });
    app.connection.on('store-purchase-asset', (data) => {
      this.receiveStorePurchase(data);
    });
  }

  resetState() {
    this.summary = null;
    this.quantity = 1;
    this.note = '';
    this.title = '';
    this.ticker = '';
    this.expected_deposit = '';
    this.destination = '';
    this.mixin_id = '';
    this.reserved_until = 0;
    this.reservation = null;
    this.payer = '';
    this.crypto_selected = null;
    this.purchase_tx = null;
    this.payment_detected = false;
    this.internal_payment_pending = false;
    this.internal_payment_sending = false;
    this.statusLead = '';
    this.fundsNotice = false;
    this.followupSent = false;
    this.followupEmail = '';
    this.followupError = '';
    this.instruction_timer = null;
    this.reservation_timer = null;
  }

  isWeb3Summary(summary) {
    return isWeb3Ticker(summary?.web3_ticker);
  }

  async start(summary, quantity = 1, { note = '' } = {}) {
    const ticker = String(summary?.web3_ticker || '').trim().toUpperCase();
    const unitAmount = String(summary?.web3_amount || '').trim();
    const deposit = scaleAmount(unitAmount, quantity);
    if (!summary?.nft_id || !isWeb3Ticker(ticker) || !deposit) {
      salert('This item does not have a valid crypto price.');
      return;
    }

    this.session += 1;
    const session = this.session;
    this.clearTimers();
    this.active = true;
    this.resetState();
    this.summary = summary;
    this.quantity = Math.max(1, Math.floor(Number(quantity) || 1));
    this.note = String(note || '').trim();
    this.title = summary.returnTitle?.() || summary.title || 'this item';
    this.ticker = ticker;
    this.expected_deposit = deposit;
    this.statusLead = 'Requesting a payment address...';

    this.mod.main?.listing_detail?.overlay?.close?.();
    this.mod.purchase_lifecycle?.hideListing?.(summary);
    this.render();

    try {
      this.crypto_selected = this.cachedCurrency() || { ticker };
      await this.checkForLocalCrypto(session);
      if (!this.active || this.session !== session) {
        return;
      }

      this.purchase_tx = await this.mod.createPurchaseAssetTransaction(
        summary,
        {
          price: '0',
          fee: String(this.mod.fee || 0),
          quantity: this.quantity,
          note: this.note,
          web3: true
        },
        0n
      );
      await this.requestAddress();
    } catch (err) {
      console.error('Store: web3 payment failed to start', err);
      if (this.active && this.session === session) {
        this.fail(err?.message || 'Could not start this payment.');
      }
    }
  }

  cachedCurrency() {
    const buysaito = this.app.modules?.returnModule?.('BuySaito');
    const currencies = Array.isArray(buysaito?.available_currencies) ? buysaito.available_currencies : [];
    return (
      currencies.find(
        (currency) => String(currency?.ticker || '').trim().toUpperCase() === this.ticker
      ) || null
    );
  }

  async checkForLocalCrypto(session) {
    const currency = this.crypto_selected;
    if (!currency) {
      return;
    }
    try {
      const cm = this.app.wallet.returnCryptoModuleByTicker(currency.ticker);
      if (!cm?.options?.isActivated) {
        return;
      }
      await cm.activate();
      const balance = Number(await cm.getAvailableBalance());
      if (this.session === session && this.crypto_selected === currency && Number.isFinite(balance)) {
        currency.available_balance = balance;
      }
    } catch (err) {
      console.error('Store: web3 wallet balance check failed', err);
    }
  }

  canPayFromWallet() {
    const balance = Number(this.crypto_selected?.available_balance);
    const deposit = Number(this.expected_deposit);
    return (
      !!this.destination &&
      Number.isFinite(balance) &&
      Number.isFinite(deposit) &&
      deposit > 0 &&
      balance >= deposit
    );
  }

  async requestAddress() {
    const buysaito = this.app.modules?.returnModule?.('BuySaito');
    const deposit = Number(this.expected_deposit);
    const initiator = await this.app.wallet.getPublicKey();
    this.payer = initiator;
    if (
      !buysaito?.authorized_public_key ||
      !initiator ||
      !this.purchase_tx ||
      !Number.isFinite(deposit) ||
      deposit <= 0
    ) {
      this.fail('A valid payment amount is required.');
      return;
    }

    this.clearInstructionTimer();
    const session = this.session;
    this.instruction_timer = setTimeout(() => {
      if (!this.active || this.session !== session || this.destination) {
        return;
      }
      this.fail(
        'The payment service did not return instructions. Please check your connection and try again.'
      );
    }, INSTRUCTION_TIMEOUT_MS);

    this.app.connection.emit('relay-send-message', {
      recipient: buysaito.authorized_public_key,
      request: 'buysaito reserve address',
      data: {
        initiator_pubkey: initiator,
        recipient_pubkey: initiator,
        ticker: this.ticker,
        expected_deposit: deposit,
        tx: this.purchase_tx.serialize_to_web(this.app)
      }
    });
  }

  receiveAddress(data) {
    if (!this.active || !this.ticker) {
      return;
    }
    if (String(data?.ticker || '').trim().toUpperCase() !== this.ticker) {
      return;
    }
    this.clearInstructionTimer();
    if (!data?.destination || !data?.mixin_id) {
      this.fail('The payment service returned incomplete deposit instructions.');
      return;
    }

    if (
      !this.reservation ||
      this.reservation.id !== data.id ||
      this.reservation.destination !== data.destination
    ) {
      this.reservation = data;
      this.payment_detected = false;
      this.internal_payment_pending = false;
      this.internal_payment_sending = false;
    }
    this.destination = data.destination;
    this.mixin_id = data.mixin_id;
    if (data.expected_deposit) {
      this.expected_deposit = data.expected_deposit;
    }
    this.reserved_until = Number(data.reserved_until) || 0;
    this.statusLead = '';

    if (['pending', 'confirmed', 'issuing'].includes(data.status)) {
      this.receivePaymentDetected(data);
      return;
    }
    this.startReservationTimeout(this.reserved_until);
    this.render();
  }

  receivePaymentDetected(data) {
    if (
      !this.active ||
      !this.reservation ||
      data?.id !== this.reservation.id ||
      data?.destination !== this.destination ||
      String(data?.ticker || '').trim().toUpperCase() !== this.ticker ||
      !['pending', 'confirmed', 'issuing'].includes(data.status)
    ) {
      return;
    }
    this.payment_detected = true;
    this.clearReservationTimer();
    this.statusLead =
      data.status === 'pending'
        ? 'Payment detected. Completing your purchase...'
        : 'Payment received. Completing your purchase...';
    this.render();
  }

  receiveIssued(data = {}) {
    if (
      !this.active ||
      !this.reservation ||
      data.id !== this.reservation.id ||
      data.destination !== this.reservation.destination ||
      String(data.ticker || '').trim().toUpperCase() !== this.ticker
    ) {
      return;
    }
    this.payment_detected = true;
    this.fundsNotice = false;
    this.clearTimers();
    this.statusLead = 'Payment received. Completing your purchase...';
    this.render();
  }

  showInsufficientFunds() {
    this.clearTimers();
    this.fundsNotice = true;
    this.followupError = '';
    this.render();
  }

  submitFollowupEmail(raw) {
    const email = String(raw || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.followupError = 'Enter an email address to be notified.';
      this.render();
      return;
    }

    const sent = sendInsufficientFundsFollowup(this.app, {
      email,
      title: this.title,
      payment: this.amountLabel(),
      nftId: this.summary?.nft_id,
      publicKey: this.payer,
      reservationId: this.reservation?.id
    });
    if (!sent) {
      this.followupError = 'The notice could not be sent. Email info@saito.io for assistance.';
      this.render();
      return;
    }

    this.followupEmail = email;
    this.followupSent = true;
    this.followupError = '';
    this.render();
  }

  receiveError(data = {}) {
    if (!this.active) {
      return;
    }
    if (data?.code === 'insufficient_funds') {
      if (
        !this.reservation ||
        data.id !== this.reservation.id ||
        data.ticker !== this.ticker ||
        data.destination !== this.destination
      ) {
        return;
      }
      this.showInsufficientFunds();
      return;
    }
    if (!data?.message) {
      return;
    }
    this.clearTimers();
    this.reservation = null;
    this.fail(data.message);
  }

  receiveStorePurchase({ conf, tx } = {}) {
    if (!this.active || Number(conf) !== 0 || !tx) {
      return;
    }
    const txmsg = tx.returnMessage?.() || {};
    if (txmsg.module !== 'Store' || txmsg.request !== 'purchase-asset') {
      return;
    }
    if (String(txmsg.nft_id || '') !== String(this.summary?.nft_id || '')) {
      return;
    }
    if (String(txmsg.web3_ticker || '').trim().toUpperCase() !== this.ticker) {
      return;
    }
    const buyer = String(txmsg.buyer || '').trim();
    if (buyer && this.payer && buyer !== this.payer) {
      return;
    }

    const signature = tx.signature || '';
    const title = this.title;
    const summary = this.summary;
    const quantity = this.quantity;
    this.active = false;
    this.clearTimers();
    this.overlay.close();

    const lifecycle = this.mod.purchase_lifecycle;
    if (lifecycle && signature) {
      lifecycle.begin({ summary, purchaseTxSignature: signature, quantity });
      lifecycle.markPaymentConfirmed(signature);
    }
    const purchase = this.mod.main?.purchase_overlay;
    if (purchase) {
      purchase.listingTitle = title;
      purchase.pendingTxSignature = signature;
      purchase.nft_id = String(summary?.nft_id || '');
      purchase.quantity = quantity;
      purchase.openFulfilling();
    }
  }

  async payFromWallet() {
    const reservation = this.reservation;
    if (
      !this.active ||
      !reservation ||
      this.payment_detected ||
      this.internal_payment_pending ||
      Date.now() >= Number(this.reserved_until) ||
      !this.canPayFromWallet()
    ) {
      return;
    }

    this.internal_payment_pending = true;
    this.internal_payment_sending = true;
    this.render();
    const sent = await this.sendFromWallet();
    if (!this.active || this.reservation !== reservation || this.payment_detected) {
      return;
    }
    this.internal_payment_sending = false;
    this.internal_payment_pending = sent;
    if (!sent) {
      this.statusLead = 'The wallet payment could not be sent. You can still pay the address below.';
    }
    this.render();
  }

  async sendFromWallet() {
    try {
      const cm = this.app.wallet.returnCryptoModuleByTicker(this.ticker);
      if (!cm || !this.destination || !this.mixin_id) {
        return false;
      }
      const toAddress = `${this.destination}|${this.mixin_id}|mixin`;
      const result = await cm.sendPayment(this.expected_deposit, toAddress, 'success');
      return typeof result === 'string' && result.trim().length > 0;
    } catch (err) {
      console.error('Store: web3 wallet payment failed', err);
      return false;
    }
  }

  fail(message) {
    this.statusLead = message;
    this.destination = '';
    this.render();
    salert(message);
  }

  amountLabel() {
    const amount = this.app.browser.formatDecimals(this.expected_deposit, true);
    return `${amount} ${this.ticker}`;
  }

  productLabel() {
    const name = this.title || 'this item';
    return this.quantity > 1 ? `Purchase ${name} × ${this.quantity}` : `Purchase ${name}`;
  }

  render() {
    if (!this.active) {
      return;
    }
    const canPayFromWallet = this.canPayFromWallet();
    const balance = this.crypto_selected?.available_balance;
    this.overlay.show(
      Web3PaymentTemplate(this.app, {
        amountLabel: this.amountLabel(),
        productLabel: this.productLabel(),
        destination: this.destination,
        canPayFromWallet,
        walletBalanceLabel: canPayFromWallet
          ? `${this.app.browser.formatDecimals(balance, true)} ${this.ticker}`
          : '',
        processing: this.internal_payment_pending,
        statusLead: this.statusLead,
        fundsNotice: this.fundsNotice,
        followupSent: this.followupSent,
        followupEmail: this.followupEmail,
        followupError: this.followupError
      }),
      () => {
        this.active = false;
        this.clearTimers();
      }
    );
    if (this.destination && !this.fundsNotice) {
      this.overlay.blockClose();
      this.app.browser.generateQRCode(this.destination, 'store-web3-qrcode');
    }
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector('.store-web3-payment');
    if (!root) {
      return;
    }
    root.querySelector('#store-web3-pay')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.payFromWallet();
    });
    root.querySelector('.funds-notice-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = root.querySelector('#store-web3-followup-email');
      this.submitFollowupEmail(input?.value);
    });
    root.querySelector('.address')?.addEventListener('click', async () => {
      if (!this.destination) {
        return;
      }
      try {
        await navigator.clipboard.writeText(this.destination);
      } catch (err) {
        console.warn('Store: copy payment address failed', err?.message || err);
        return;
      }
      const icon = root.querySelector('.address i');
      if (!icon) {
        return;
      }
      icon.classList.toggle('fa-copy');
      icon.classList.toggle('fa-check');
      setTimeout(() => {
        icon.classList.toggle('fa-copy');
        icon.classList.toggle('fa-check');
      }, 800);
    });
  }

  startReservationTimeout(expiryMs) {
    this.clearReservationTimer();
    if (this.payment_detected || !Number.isFinite(Number(expiryMs))) {
      return;
    }
    const session = this.session;
    this.reservation_timer = setTimeout(
      () => {
        if (!this.active || this.session !== session || this.payment_detected) {
          return;
        }
        const message = 'The payment time has timed out. Please try again.';
        this.active = false;
        this.clearTimers();
        this.overlay.close();
        salert(message);
      },
      Math.max(0, Number(expiryMs) - Date.now())
    );
  }

  clearInstructionTimer() {
    clearTimeout(this.instruction_timer);
    this.instruction_timer = null;
  }

  clearReservationTimer() {
    clearTimeout(this.reservation_timer);
    this.reservation_timer = null;
  }

  clearTimers() {
    this.clearInstructionTimer();
    this.clearReservationTimer();
  }
}

module.exports = Web3PaymentOverlay;
