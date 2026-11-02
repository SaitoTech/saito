const Decimal = require('decimal.js');
const MixinModule = require('./lib/mixinmodule');
const ModTemplate = require('../../lib/templates/modtemplate');
const PeerService = require('saito-js/lib/peer_service').default;
const Database = require('./lib/database');
const Api = require('./lib/api');
const { formatMixinError, MIXIN_APP_KEY_FIELDS, mixinAppKeystore, mixinAppKeystoreFromEnv } = Api;
const Accounts = require('./lib/accounts');
const Transfers = require('./lib/transfers');
const TransferTesting = require('./lib/testing');
const MigrationService = require('./lib/migration');
const BuySaitoService = require('./lib/buysaito');
const migrationClient = require('./lib/ui/migration/client');
const MixinAdmin = require('./lib/admin/mixin-admin');

const MIXIN_CREDENTIAL_FIELDS = [
  'user_id',
  'full_name',
  'session_id',
  'tip_key_base64',
  'pin_token_base64',
  'session_seed',
  'session_private_key',
  'spend_private_key',
  'spend_public_key',
  'backed_up'
];

const PROVIDER_UNAVAILABLE =
  "Sorry, payment provider isn't available right now — try again later.";

class Mixin extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Mixin';
    this.slug = 'mixin';
    this.appname = 'Mixin';
    this.description = 'Adding support for Web3 Crypto transfers on Saito';
    this.categories = 'Finance Utilities';
    this.icon = 'fas fa-wallet';
    this.class = 'utility';
    this.status = 'prod';

    this.MixinModule = MixinModule;
    this.credentials = {};
    this.api_key = null;
    this.deposit_addresses = [];
    this.mixin_peer = null;
    this.buysaito_peer = null;
    this.available_currencies = [];
    this.erc_saito = null;
    this.pending_payments = [];
    this.purchase_overlay = null;
    this.main = null;
    this.styles = ['/mixin/style.css'];
    this.appSession = null;
    this.account_created = 0;
    this.account_creation_promise = null;
    this.crypto_mods = [];
    this.transfers = null;
    this.transfer_timer = null;
    this.migration = null;
    this.buysaito = null;
    this.ADDRESS_RESERVATION_PERIOD_IN_MINUTES = 40;
    this.wrapped_saito_ticker = 'ERC-SAITO';
    this.migration_page = null;
    this.migration_header = null;
    this.fulfillment_mode = 'local';
    this.payout_mode = 'local';
    this.treasury_provider_publickeys = [];
    this.treasury_delegate_publickeys = [];
    this.cached_treasury_provider_publickey = '';
    this.load();
  }

  /**
   * Load the complete Mixin configuration from app.options.mixin into runtime state.
   * This is the only Mixin-module function that reads configuration from options.
   */
  load() {
    const stored = this.app?.options?.mixin;
    const options =
      stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};

    const credentials = {};
    for (const field of MIXIN_CREDENTIAL_FIELDS) {
      if (options[field] !== undefined) {
        credentials[field] = options[field];
      }
    }
    this.credentials = credentials;
    this.account_created = credentials.user_id ? 1 : 0;

    const keystore = mixinAppKeystore(options.api_key);
    this.api_key =
      keystore ||
      (options.api_key && typeof options.api_key === 'object' && !Array.isArray(options.api_key)
        ? options.api_key
        : null);

    this.deposit_addresses = Array.isArray(options.deposit_addresses)
      ? options.deposit_addresses.map((item) => ({ ...item }))
      : [];

    const keys = (value) =>
      Array.isArray(value) ? value.map((key) => String(key || '').trim()).filter(Boolean) : [];
    this.treasury_provider_publickeys = keys(options.treasury_provider_publickeys);
    this.treasury_delegate_publickeys = keys(options.treasury_delegate_publickeys);

    const migrated = this.migrateLegacyModes(options);
    this.fulfillment_mode = migrated.fulfillment_mode;
    this.payout_mode = migrated.payout_mode;
  }

  /**
   * Persist the complete Mixin runtime configuration to app.options.mixin.
   * This is the only Mixin-module function that writes Mixin options and saveOptions().
   * Writes only fulfillment_mode and payout_mode (not legacy operation_mode/execution_mode).
   */
  save() {
    if (!this.app) {
      return;
    }
    if (!this.app.options || typeof this.app.options !== 'object' || Array.isArray(this.app.options)) {
      this.app.options = {};
    }

    const next = {};
    for (const field of MIXIN_CREDENTIAL_FIELDS) {
      if (this.credentials && this.credentials[field] !== undefined) {
        next[field] = this.credentials[field];
      }
    }

    if (this.api_key && typeof this.api_key === 'object' && !Array.isArray(this.api_key)) {
      next.api_key = this.api_key;
    }

    next.deposit_addresses = Array.isArray(this.deposit_addresses)
      ? this.deposit_addresses.map((item) => ({ ...item }))
      : [];
    next.fulfillment_mode = this.fulfillment_mode;
    next.payout_mode = this.payout_mode === 'remote' ? 'remote' : 'local';
    next.treasury_provider_publickeys = [...(this.treasury_provider_publickeys || [])];
    next.treasury_delegate_publickeys = [...(this.treasury_delegate_publickeys || [])];

    this.app.options.mixin = next;
    this.app.storage?.saveOptions?.();
  }

  /**
   * Map known legacy operation_mode values, or keep an explicit fulfillment_mode as stored.
   * Does not infer modes from execution_mode or delegate key presence.
   */
  migrateLegacyModes(options = {}) {
    const payout_mode = options.payout_mode === 'remote' ? 'remote' : 'local';
    if (
      options.fulfillment_mode === 'local' ||
      options.fulfillment_mode === 'remote' ||
      options.fulfillment_mode === 'treasury'
    ) {
      return { fulfillment_mode: options.fulfillment_mode, payout_mode };
    }

    const legacy = String(options.operation_mode || '').trim();
    if (legacy === 'local') {
      return { fulfillment_mode: 'local', payout_mode: 'local' };
    }
    if (legacy === 'local_remote') {
      return { fulfillment_mode: 'local', payout_mode: 'remote' };
    }
    if (legacy === 'remote_remote') {
      return { fulfillment_mode: 'remote', payout_mode: 'remote' };
    }
    if (legacy === 'treasury') {
      return { fulfillment_mode: 'treasury', payout_mode: 'local' };
    }

    if (options.fulfillment_mode != null && String(options.fulfillment_mode).trim() !== '') {
      return {
        fulfillment_mode: String(options.fulfillment_mode).trim(),
        payout_mode
      };
    }

    return { fulfillment_mode: 'local', payout_mode };
  }

  performsLocalFulfillment() {
    return this.fulfillment_mode === 'local' || this.fulfillment_mode === 'treasury';
  }

  normalizePublicKeyList(value, label) {
    const list = Array.isArray(value) ? value : [];
    const seen = new Set();
    const keys = [];
    for (const entry of list) {
      const key = String(entry || '').trim();
      if (!key) {
        continue;
      }
      if (typeof this.app?.crypto?.isPublicKey !== 'function' || !this.app.crypto.isPublicKey(key)) {
        throw new Error(`${label} contains an invalid Saito public key.`);
      }
      if (seen.has(key)) {
        throw new Error(`${label} contains a duplicate public key.`);
      }
      seen.add(key);
      keys.push(key);
    }
    return keys;
  }

  syncFulfillmentQueue() {
    if (this.app?.BROWSER || !this.transfers) {
      return;
    }
    if (this.performsLocalFulfillment()) {
      if (!this.transfer_timer) {
        this.transfers.processTransferQueue().catch((err) => {
          console.error('Mixin transfer queue failed:', err);
        });
        this.transfer_timer = setInterval(() => {
          this.transfers.processTransferQueue().catch((err) => {
            console.error('Mixin transfer queue failed:', err);
          });
        }, 10000);
        this.transfer_timer.unref?.();
      }
      return;
    }
    clearInterval(this.transfer_timer);
    this.transfer_timer = null;
  }

  isHandshakeVerifiedPeer(peer) {
    if (!peer) {
      return false;
    }
    try {
      const snapshot = typeof peer.get === 'function' ? peer.get() : null;
      return snapshot?.is_verified === true;
    } catch (err) {
      return false;
    }
  }

  configuredTreasuryProviderPublickey() {
    const own = String(this.publicKey || '').trim();
    return (
      (this.treasury_provider_publickeys || [])
        .map((key) => String(key || '').trim())
        .find((key) => key && key !== own) || ''
    );
  }

  configuredTreasuryDelegatePublickey() {
    return String(this.treasury_delegate_publickeys?.[0] || '').trim();
  }

  isAuthorizedForwardingPeer(peer, expectedPublickey) {
    const expected = String(expectedPublickey || '').trim();
    const key = String(peer?.publicKey || '').trim();
    return !!expected && !!key && key === expected && this.isHandshakeVerifiedPeer(peer);
  }

  /**
   * Remote fulfillment: forward the original request tx to the configured treasury.
   * Returns 0 when this node should handle the request locally.
   * Returns 1 when the helper has taken responsibility (including unreachable errors).
   */
  offersTreasuryBackedServices() {
    return this.fulfillment_mode === 'remote' && !!this.configuredTreasuryProviderPublickey();
  }

  /**
   * Peer authorized to request local fulfillment on this node.
   * treasury: only the verified configured delegate.
   * local: the verified direct requester (browser/buyer).
   */
  isAuthorizedFulfillmentPeer(peer, requesterPublickey) {
    if (this.fulfillment_mode === 'treasury') {
      return this.isAuthorizedForwardingPeer(
        peer,
        this.configuredTreasuryDelegatePublickey()
      );
    }
    const from = String(requesterPublickey || '').trim();
    return !!from && peer?.publicKey === from && this.isHandshakeVerifiedPeer(peer);
  }

  async tunnelRequestToTreasury(tx, mycallback) {
    if (this.fulfillment_mode !== 'remote') {
      return 0;
    }

    const reportUnavailable = () => {
      if (typeof mycallback === 'function') {
        mycallback({ message: PROVIDER_UNAVAILABLE, err: PROVIDER_UNAVAILABLE });
      }
    };

    const configured = this.configuredTreasuryProviderPublickey();
    let provider = String(this.cached_treasury_provider_publickey || '').trim();
    if (!provider || provider !== configured) {
      provider = configured;
    }

    if (!provider) {
      this.cached_treasury_provider_publickey = '';
      reportUnavailable();
      return 1;
    }

    let live = null;
    try {
      live = await this.app.network.getPeer(provider);
    } catch (err) {
      live = null;
    }
    if (!live || !this.isHandshakeVerifiedPeer(live)) {
      this.cached_treasury_provider_publickey = '';
      reportUnavailable();
      return 1;
    }

    this.cached_treasury_provider_publickey = provider;

    try {
      await this.app.network.sendTransactionWithCallback(
        tx,
        (response) => {
          const result =
            response && typeof response === 'object' && response.err && response.msg == null
              ? response
              : response?.msg ?? response;
          if (typeof mycallback === 'function') {
            mycallback(result);
          }
        },
        provider
      );
    } catch (err) {
      reportUnavailable();
    }
    return 1;
  }

  /**
   * Deliver a server→browser payment notice.
   * In treasury mode, relay through the sole configured delegate; otherwise send directly.
   * Kept synchronous so queue processing does not race past the send.
   */
  notifyBrowser(notification_request, notification_data, destination_publickey) {
    const destination = String(destination_publickey || '').trim();
    if (!destination || this.app?.BROWSER) {
      return;
    }

    if (this.fulfillment_mode === 'treasury') {
      const delegate = this.configuredTreasuryDelegatePublickey();
      if (
        delegate &&
        (typeof this.app?.crypto?.isPublicKey !== 'function' ||
          this.app.crypto.isPublicKey(destination))
      ) {
        try {
          this.app.network.sendRequestAsTransaction(
            'mixin treasury forwarding request',
            {
              destination_publickey: destination,
              notification_request,
              notification_data
            },
            null,
            delegate
          );
          return;
        } catch (err) {
          console.error('Mixin treasury notification relay failed:', err);
        }
      }
    }

    this.app.network?.sendRequestAsTransaction?.(
      notification_request,
      notification_data,
      null,
      destination
    );
  }

  isSlug(slug) {
    return slug === this.returnSlug() || slug === 'migration';
  }

  shouldAffixCallbackToModule(modname) {
    if (modname === this.name || modname === 'ERC-SAITO' || modname === 'BEP-SAITO') {
      return 1;
    }
    return 0;
  }

  returnServices() {
    this.services = [];
    const canServe = !!this.appSession || this.offersTreasuryBackedServices();
    if (canServe) {
      this.services.push(new PeerService(null, 'mixin'));
      const buysaito = this.app.modules?.returnModule?.('BuySaito');
      if (!buysaito || buysaito.publicKey === buysaito.authorized_public_key) {
        this.services.push(new PeerService(null, 'buysaito'));
      }
    }
    return this.services;
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (service.service === 'buysaito' && this.app.BROWSER) {
      this.buysaito_peer = peer;
      this.app.network.sendRequestAsTransaction(
        'buysaito available currencies',
        null,
        (response) => this.receiveAvailableCurrencies(response),
        peer.publicKey
      );
    }

    if (service.service === 'mixin') {
      console.info('Mixin Module: API online!');
      this.mixin_peer = peer;

      if (this.credentials?.user_id && !this.credentials.backed_up) {
        console.info('Need to back up my mixin');
        const accountHash = this.accounts.encryptCredentials(this.credentials, this.publicKey);
        this.app.network.sendRequestAsTransaction(
          'mixin account backup',
          { account_hash: accountHash },
          () => {
            this.credentials.backed_up = true;
            this.accounts.saveCredentials(this.credentials);
          },
          peer.publicKey
        );
      }
    }
  }

  async initialize(app) {
    await super.initialize(app);
    this.load();

    this.database = new Database(app, this);
    this.api = new Api();
    this.accounts = new Accounts(app, this);

    if (!app.BROWSER) {
      this.api.appKeystore = this.api_key || null;
      this.appSession = this.api.createAppSession();
      await this.database.ensureAccountsSchema();
      await this.database.ensureTransfersSchema();
      await this.database.ensureTreasurySchema();
      await this.database.copyLegacyTables();
      this.transfers = new Transfers(app, this);
      this.migration = new MigrationService(app, this);
      this.buysaito = new BuySaitoService(app, this);
    }

    if (this.credentials?.user_id && this.accounts.areCredentialsDeprecated(this.credentials)) {
      app.options.mixin_legacy = { ...(app.options.mixin || {}) };
      this.credentials = {};
      this.account_created = 0;
      this.save();
      await app.wallet.setPreferredCrypto('SAITO', 1);
    }

    this.installCryptos();

    if (!app.BROWSER) {
      await this.syncDepositAddresses();
    }

    if (app.BROWSER) {
      const SaitoPurchaseOverlay = require('./lib/ui/overlays/buysaito-purchase');
      const Main = require('./lib/ui/main');
      this.purchase_overlay = new SaitoPurchaseOverlay(app, this);
      this.main = new Main(app, this);
    }

    if (!app.BROWSER) {
      const buysaito = this.app.modules?.returnModule?.('BuySaito');
      const buysaitoProvider = !buysaito || buysaito.publicKey === buysaito.authorized_public_key;
      console.log('Mixin buysaito service', {
        app_session: !!this.appSession,
        transfers: !!this.transfers,
        fulfillment_mode: this.fulfillment_mode,
        payout_mode: this.payout_mode,
        buysaito_provider: buysaitoProvider,
        advertised: !!(buysaitoProvider && (!!this.appSession || this.offersTreasuryBackedServices()))
      });
    }

    if (!app.BROWSER && this.transfers && this.performsLocalFulfillment()) {
      this.transfers.processTransferQueue().catch((err) => {
        console.error('Mixin transfer queue failed:', err);
      });
      this.transfer_timer = setInterval(() => {
        this.transfers.processTransferQueue().catch((err) => {
          console.error('Mixin transfer queue failed:', err);
        });
      }, 10000);
      this.transfer_timer.unref?.();
    }
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
    if (tx == null) {
      return 0;
    }

    const message = tx.returnMessage();

    if (
      this.app.BROWSER &&
      typeof message.request === 'string' &&
      message.request.startsWith('buysaito ')
    ) {
      // sendRequest addresses the slip to its sender and routes the message to
      // the peer, so a service notice is not isTo(this.publicKey).
      const serviceKey = this.buysaito_peer?.publicKey;
      if (!serviceKey || peer?.publicKey !== serviceKey) {
        return 0;
      }
      return this.receiveBuySaitoReply(tx, message);
    }

    //
    // lite-client wants to create an account
    //
    if (this.app.BROWSER && message.request === 'migration request') {
      const serviceKey = this.mixin_peer?.publicKey;
      if (!serviceKey || peer?.publicKey !== serviceKey) {
        return 0;
      }
      this.receiveMigrationInstructions(message.data);
      return 1;
    }

    if (this.app.BROWSER && message.request === 'migration failure') {
      const serviceKey = this.mixin_peer?.publicKey;
      if (tx.isTo(this.publicKey) || (serviceKey && peer?.publicKey === serviceKey)) {
        salert(
          'Uh oh, something went wrong with the automated migration. Please back up your wallet to ensure the security of your tokens and contact the team for a manual resolution.'
        );
        return 1;
      }
      return 0;
    }

    // Services: treasury → browser notification relay
    if (!this.app.BROWSER && message.request === 'mixin treasury forwarding request') {
      const provider = this.configuredTreasuryProviderPublickey();
      if (!this.isAuthorizedForwardingPeer(peer, provider)) {
        if (mycallback) {
          mycallback({ err: 'Unauthorized treasury forwarding request.' });
        }
        return 1;
      }
      const data = message.data || {};
      const destination = String(data.destination_publickey || '').trim();
      const notification_request = String(data.notification_request || '').trim();
      const allowed = new Set([
        'buysaito payment detected',
        'buysaito saito issued',
        'buysaito report error',
        'migration failure'
      ]);
      if (
        !destination ||
        !allowed.has(notification_request) ||
        (typeof this.app?.crypto?.isPublicKey === 'function' &&
          !this.app.crypto.isPublicKey(destination))
      ) {
        if (mycallback) {
          mycallback({ err: 'Invalid treasury forwarding request.' });
        }
        return 1;
      }
      this.app.network.sendRequestAsTransaction(
        notification_request,
        data.notification_data,
        null,
        destination
      );
      if (mycallback) {
        mycallback({ ok: true });
      }
      return 1;
    }

    if (!this.app.BROWSER && message.request === 'migration request') {
      if (await this.tunnelRequestToTreasury(tx, mycallback)) {
        return 1;
      }
      const from = tx.from?.[0]?.publicKey;
      const directPeer =
        !!from && peer?.publicKey === from && this.isHandshakeVerifiedPeer(peer);
      if (!this.isAuthorizedFulfillmentPeer(peer, from) || !this.migration) {
        return 0;
      }
      const data = message.data || {};
      let result;
      try {
        if (data.publickey && data.publickey !== from) {
          result = { error: 'The Saito address must be the key that signed this request' };
        } else {
          result = await this.migration.startMigration(from, data.ticker);
        }
      } catch (err) {
        result = { error: err?.message || String(err), ticker: data.ticker };
      }
      if (directPeer) {
        this.app.network.sendRequestAsTransaction('migration request', result, null, from);
      }
      if (mycallback) {
        mycallback(result);
      }
      return 1;
    }

    if (!this.app.BROWSER && message.request === 'migration status') {
      if (await this.tunnelRequestToTreasury(tx, mycallback)) {
        return 1;
      }
      const from = tx.from?.[0]?.publicKey;
      const directPeer =
        !!from && peer?.publicKey === from && this.isHandshakeVerifiedPeer(peer);
      if (!this.isAuthorizedFulfillmentPeer(peer, from) || !this.migration) {
        return 0;
      }
      let result;
      try {
        result = await this.migration.getMigrationStatus(from, message.data?.id);
      } catch (err) {
        result = { error: err?.message || String(err) };
      }
      if (directPeer) {
        this.app.network.sendRequestAsTransaction('migration status', result, null, from);
      }
      if (mycallback) {
        mycallback(result);
      }
      return 1;
    }

    if (!this.app.BROWSER && message.request === 'migration extend') {
      if (await this.tunnelRequestToTreasury(tx, mycallback)) {
        return 1;
      }
      const from = tx.from?.[0]?.publicKey;
      const directPeer =
        !!from && peer?.publicKey === from && this.isHandshakeVerifiedPeer(peer);
      if (!this.isAuthorizedFulfillmentPeer(peer, from) || !this.migration) {
        return 0;
      }
      let result;
      try {
        result = await this.migration.extendReservation(from, message.data?.id);
      } catch (err) {
        result = { error: err?.message || String(err) };
      }
      if (directPeer) {
        this.app.network.sendRequestAsTransaction('migration extend', result, null, from);
      }
      if (mycallback) {
        mycallback(result);
      }
      return 1;
    }

    if (this.app.BROWSER && message.request === 'migration status') {
      this.receiveMigrationStatusUpdate(message.data);
      return 1;
    }

    if (this.app.BROWSER && message.request === 'migration extend') {
      this.receiveMigrationInstructions(message.data);
      return 1;
    }

    if (!this.app.BROWSER && message.request === 'mixin-issue-treasury-payout') {
      const { receiveTreasuryPayout } = require('./lib/treasury');
      const result = await receiveTreasuryPayout(this, tx);
      if (mycallback) {
        mycallback(result);
      }
      if (result?.request_status === 'accepted' && this.transfers) {
        this.transfers.processTransferQueue().catch((err) => {
          console.error('Mixin transfer queue failed:', err);
        });
      }
      return 1;
    }

    if (!this.app.BROWSER && message.request === 'store-withdrawal') {
      if (await this.tunnelRequestToTreasury(tx, mycallback)) {
        return 1;
      }
      const { receiveStoreWithdrawal } = require('./lib/store-withdrawal');
      const embedded = message.data?.transaction ?? message.transaction;
      let withdrawalTx = tx;
      if (embedded && typeof embedded === 'object') {
        withdrawalTx = embedded;
      } else if (typeof embedded === 'string' && embedded) {
        try {
          const Transaction = require('../../lib/saito/transaction').default;
          withdrawalTx = new Transaction();
          withdrawalTx.deserialize_from_web(this.app, embedded);
        } catch (err) {
          withdrawalTx = null;
        }
      }
      const result = withdrawalTx
        ? await receiveStoreWithdrawal(this, withdrawalTx, peer)
        : { err: 'The withdrawal transaction could not be read.' };
      if (mycallback) {
        mycallback(result);
      }
      return 1;
    }

    if (message.request === 'mixin create account') {
      if (await this.tunnelRequestToTreasury(tx, mycallback)) {
        return 1;
      }
      const from = tx.from?.[0]?.publicKey;
      if (!this.isAuthorizedFulfillmentPeer(peer, from)) {
        return 0;
      }
      try {
        const created = await this.accounts.createAccount(from);
        if (mycallback) {
          mycallback({ res: created.ciphertext, restored: created.restored });
        }
      } catch (err) {
        console.error('Mixin Create Account Error', err);
        if (mycallback) {
          mycallback({ err: formatMixinError(err) || 'Mixin create account error' });
        }
      }
      return 1;
    }

    //
    // lite-client wants to create new web3 crypto address
    //
    if (message.request === 'mixin save new deposit address') {
      if (await this.tunnelRequestToTreasury(tx, mycallback)) {
        return 1;
      }
      const from = tx.from?.[0]?.publicKey;
      if (!this.isAuthorizedFulfillmentPeer(peer, from)) {
        return 0;
      }
      const data = message.data || {};
      await this.database.insertAddress({
        mixinUserId: data.user_id,
        publicKey: data.publickey,
        assetId: data.asset_id,
        address: data.address,
        createdAt: tx.timestamp
      });
      if (mycallback) {
        mycallback(true);
      }
      return 1;
    }

    //
    // asking for payment info for another user
    //
    if (message.request === 'mixin fetch user') {
      if (await this.tunnelRequestToTreasury(tx, mycallback)) {
        return 1;
      }
      const from = tx.from?.[0]?.publicKey;
      if (!this.isAuthorizedFulfillmentPeer(peer, from)) {
        return 0;
      }
      const data = message.data || {};
      if (!data.asset_id || (!data.address && !data.publicKey && !data.user_id)) {
        if (mycallback) {
          mycallback([]);
        }
        return 1;
      }

      try {
        const row = await this.database.findAddress({
          assetId: data.asset_id,
          mixinUserId: data.user_id,
          publicKey: data.publicKey,
          address: data.address
        });
        if (mycallback) {
          mycallback(row ? [row] : []);
        }
      } catch (err) {
        console.error(err);
        if (mycallback) {
          mycallback([]);
        }
      }
      return 1;
    }

    if (
      !this.app.BROWSER &&
      typeof message.request === 'string' &&
      message.request.startsWith('buysaito ')
    ) {
      if (
        message.request === 'buysaito available currencies' ||
        message.request === 'buysaito reserve address' ||
        message.request === 'buysaito release address'
      ) {
        if (await this.tunnelRequestToTreasury(tx, mycallback)) {
          return 1;
        }
      }

      const from = tx.from?.[0]?.publicKey;
      const direct_peer =
        !!from && peer?.publicKey === from && this.isHandshakeVerifiedPeer(peer);
      const delegated_peer = this.isAuthorizedForwardingPeer(
        peer,
        this.configuredTreasuryDelegatePublickey()
      );
      // Off-chain requests are routed to the peer, while the transaction's
      // recipient slip remains the buyer. Buyer identity stays tx.from.
      const buysaito = this.app.modules?.returnModule?.('BuySaito');
      const buysaitoProvider = !buysaito || buysaito.publicKey === buysaito.authorized_public_key;
      const authorized_peer = this.isAuthorizedFulfillmentPeer(peer, from);
      const can_fulfill = !!this.appSession && !!this.transfers && buysaitoProvider;
      const accepted = can_fulfill && authorized_peer;
      console.log('Mixin buysaito request', {
        request: message.request,
        app_session: !!this.appSession,
        transfers: !!this.transfers,
        fulfillment_mode: this.fulfillment_mode,
        server: this.publicKey,
        addressed_to_server: tx.isTo(this.publicKey),
        buysaito_provider: buysaitoProvider,
        buyer: from || '',
        connected_peer: peer?.publicKey || '',
        direct_peer,
        delegated_peer,
        accepted
      });
      if (!authorized_peer) {
        return 0;
      }
      if (!accepted) {
        if (mycallback) {
          mycallback({ message: PROVIDER_UNAVAILABLE, err: PROVIDER_UNAVAILABLE });
        }
        return 1;
      }
      const data = message.data || {};

      if (message.request === 'buysaito available currencies') {
        const currencies = [];
        let erc = null;
        try {
          for (const crypto of this.crypto_mods) {
            if (!crypto.last_update || Date.now() - crypto.last_update > 300000) {
              console.log('Mixin buysaito refreshing price', crypto.ticker);
              await crypto.returnMixinNetworkInfo();
            }
            const price = Number(crypto.price_usd);
            const priced = Number.isFinite(price) && price > 0;
            if (crypto.ticker === 'ERC-SAITO') {
              if (priced) {
                erc = crypto;
              }
            } else if (priced && crypto.ticker && crypto.ticker !== 'BEP-SAITO') {
              currencies.push({
                ticker: crypto.ticker,
                chain_id: crypto.chain_id,
                price_usd: price,
                last_update: crypto.last_update,
                icon_url: crypto.icon_url
              });
            }
          }
        } catch (err) {
          console.log('Mixin buysaito available currencies failed', err);
          if (mycallback) {
            mycallback({ message: PROVIDER_UNAVAILABLE, err: PROVIDER_UNAVAILABLE });
          }
          return 1;
        }
        const response = {
          ac: currencies,
          erc: Number.isFinite(Number(erc?.price_usd)) && Number(erc.price_usd) > 0 ? Number(erc.price_usd) : null
        };
        console.log('Mixin buysaito available currencies reply', {
          count: currencies.length,
          tickers: currencies.map((currency) => currency.ticker),
          erc: response.erc,
          callback: typeof mycallback === 'function',
          buyer: from
        });
        if (direct_peer) {
          this.app.network.sendRequestAsTransaction(
            'buysaito available currencies',
            response,
            null,
            from
          );
        }
        if (mycallback) {
          mycallback(response);
        }
        return 1;
      }

      if (message.request === 'buysaito reserve address') {
        if (!from || from !== (data.initiator_publickey || data.initiator_pubkey)) {
          const response = {
            message:
              'The payment service could not generate a deposit address. Please try again shortly.'
          };
          if (direct_peer) {
            this.app.network.sendRequestAsTransaction('buysaito report error', response, null, from);
          }
          if (mycallback) {
            mycallback(response);
          }
          return 1;
        }
        try {
          const instructions = await this.buysaito.startPurchase(from, data);
          if (direct_peer) {
            this.app.network.sendRequestAsTransaction(
              'buysaito reserve address',
              instructions,
              null,
              from
            );
          }
          if (mycallback) {
            mycallback(instructions);
          }
        } catch (err) {
          console.error('BuySaito reservation failed:', err);
          const response = {
            message:
              'The payment service could not generate a deposit address. Please try again shortly.'
          };
          if (direct_peer) {
            this.app.network.sendRequestAsTransaction('buysaito report error', response, null, from);
          }
          if (mycallback) {
            mycallback({ err: err.message });
          }
        }
        return 1;
      }

      if (message.request === 'buysaito release address') {
        if (from && data.ticker) {
          await this.buysaito.releasePurchaseReservation(from, data.ticker);
        }
        if (mycallback) {
          mycallback(true);
        }
        return 1;
      }
    }

    //
    // requesting storage of encrypted account information
    //
    if (message.request === 'mixin account backup') {
      if (await this.tunnelRequestToTreasury(tx, mycallback)) {
        return 1;
      }
      const owner = tx.from?.[0]?.publicKey || '';
      if (!this.isAuthorizedFulfillmentPeer(peer, owner)) {
        return 0;
      }
      if (!owner) {
        if (mycallback) {
          mycallback({ err: 'Missing account owner public key.' });
        }
        return 1;
      }
      await this.database.saveCredentials(owner, message.data.account_hash);
      if (mycallback) {
        mycallback();
      }
      return 1;
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  async approveManualMigration(id) {
    const rows = await this.database.getTransfers({ id: Number(id) });
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
    if (row.status !== 'inbound_confirmed') {
      throw new Error('Migration deposit is not confirmed.');
    }
    this.migration.allocationForDeposit(row.outbound_amount);
    let payload = {};
    try {
      payload = row.payload ? JSON.parse(row.payload) : {};
    } catch (err) {
      payload = {};
    }
    payload.approved_by = this.publicKey || '';
    payload.approved_at = Date.now();
    await this.database.updateTransfer(row.id, { payload: JSON.stringify(payload) });
    row.payload = JSON.stringify(payload);
    const signed = await this.transfers.issueOutboundTransfer(row);
    await this.transfers.rebroadcastSavedOutboundTransfers();
    return signed;
  }

  async onConfirmation() {
    return;
  }

  accountSummary() {
    const credentials = this.accounts?.getCredentials?.() || {};
    if (!credentials.user_id) {
      return null;
    }
    const backup = {
      user_id: credentials.user_id,
      full_name: credentials.full_name || '',
      session_id: credentials.session_id || '',
      tip_key_base64: credentials.tip_key_base64 || '',
      session_seed: credentials.session_seed || '',
      spend_private_key: credentials.spend_private_key || '',
      spend_public_key: credentials.spend_public_key || ''
    };
    return {
      user_id: backup.user_id,
      full_name: backup.full_name,
      backup: JSON.stringify(backup)
    };
  }

  restoreAccount(raw) {
    if (this.accountSummary()) {
      throw new Error('A Mixin account is already configured on this server');
    }

    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw.trim());
      } catch (err) {
        throw new Error('Mixin account backup is not valid JSON');
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Mixin account backup must be a JSON object');
    }

    const credentials = {
      user_id: String(parsed.user_id || '').trim(),
      full_name: String(parsed.full_name || ''),
      session_id: String(parsed.session_id || '').trim(),
      tip_key_base64: String(parsed.tip_key_base64 || '').trim(),
      session_seed: String(parsed.session_seed || parsed.session_private_key || '').trim(),
      spend_private_key: String(parsed.spend_private_key || '').trim(),
      spend_public_key: String(parsed.spend_public_key || ''),
      backed_up: true
    };
    const missing = ['user_id', 'session_id', 'tip_key_base64', 'session_seed', 'spend_private_key'].filter(
      (name) => !credentials[name]
    );
    if (missing.length) {
      throw new Error(`Mixin account backup is incomplete (missing: ${missing.join(', ')})`);
    }

    this.credentials = credentials;
    this.account_created = 1;
    this.accounts.saveCredentials(credentials);
    return credentials;
  }

  depositAddresses() {
    return Array.isArray(this.deposit_addresses) ? this.deposit_addresses : [];
  }

  rememberDepositAddress({ address, assetId = '', ticker = '', mixinUserId = '' } = {}) {
    const value = String(address || '').trim();
    if (!value) {
      return;
    }
    const list = this.depositAddresses().map((item) => ({ ...item }));
    const asset = String(assetId || '');
    const existing = list.find((item) => {
      if (item.address !== value) {
        return false;
      }
      return !asset || !item.asset_id || item.asset_id === asset;
    });
    if (existing) {
      if (asset && !existing.asset_id) {
        existing.asset_id = asset;
      }
      if (ticker && !existing.ticker) {
        existing.ticker = ticker;
      }
      if (mixinUserId && existing.mixin_user_id !== mixinUserId) {
        existing.mixin_user_id = mixinUserId;
      }
      existing.balance = existing.balance || '0';
      existing.credited = Array.isArray(existing.credited) ? existing.credited : [];
    } else {
      list.push({
        address: value,
        asset_id: asset,
        ticker: ticker || '',
        mixin_user_id: mixinUserId || '',
        balance: '0',
        credited: []
      });
    }
    if (JSON.stringify(list) === JSON.stringify(this.depositAddresses())) {
      return;
    }
    this.deposit_addresses = list;
    this.save();
  }

  creditDepositAddress(address, amount, hash) {
    const value = String(address || '').trim();
    const id = String(hash || '').trim();
    let credit;
    try {
      credit = new Decimal(amount);
    } catch (err) {
      return;
    }
    if (!value || !id || !credit.isFinite() || !credit.greaterThan(0)) {
      return;
    }
    const list = this.depositAddresses().map((item) => ({
      ...item,
      credited: Array.isArray(item.credited) ? item.credited.slice() : []
    }));
    let entry = list.find((item) => item.address === value);
    if (!entry) {
      entry = {
        address: value,
        asset_id: '',
        ticker: '',
        mixin_user_id: '',
        balance: '0',
        credited: []
      };
      list.push(entry);
    }
    if (entry.credited.includes(id)) {
      return;
    }
    let balance;
    try {
      balance = new Decimal(entry.balance || 0);
    } catch (err) {
      balance = new Decimal(0);
    }
    entry.balance = balance.plus(credit).toFixed(8).replace(/\.?0+$/, '') || '0';
    entry.credited.push(id);
    this.deposit_addresses = list;
    this.save();
  }

  async syncDepositAddresses() {
    if (typeof this.database?.listAddresses !== 'function' || !this.publicKey) {
      return;
    }
    let rows = [];
    try {
      rows = await this.database.listAddresses(this.publicKey);
    } catch (err) {
      return;
    }
    for (const row of rows || []) {
      if (!row?.address) {
        continue;
      }
      const ticker = (this.crypto_mods || []).find((item) => item.asset_id === row.asset_id)?.ticker || '';
      this.rememberDepositAddress({
        address: row.address,
        assetId: row.asset_id,
        ticker,
        mixinUserId: row.mixin_user_id
      });
    }
  }

  async depositAddressReport() {
    await this.syncDepositAddresses();
    let reserved = [];
    if (typeof this.database?.listReservedInboundAddresses === 'function') {
      reserved = (await this.database.listReservedInboundAddresses()) || [];
    }
    const reservationMs = Number(
      this.transfers?.reservation_ms ||
        Number(this.ADDRESS_RESERVATION_PERIOD_IN_MINUTES || 40) * 60 * 1000
    );
    const held = new Map();
    for (const row of reserved) {
      if (typeof row === 'string') {
        held.set(row, null);
        continue;
      }
      const address = row?.inbound_address || row?.address;
      if (!address) {
        continue;
      }
      const created = Number(row.created_at);
      const reservedUntil =
        Number.isFinite(created) && created > 0 && reservationMs > 0
          ? created + reservationMs
          : null;
      held.set(address, reservedUntil);
    }
    return this.depositAddresses().map((item) => ({
      address: item.address,
      asset_id: item.asset_id || '',
      ticker: item.ticker || '',
      mixin_user_id: item.mixin_user_id || '',
      balance: item.balance || '0',
      reservable: !held.has(item.address),
      reserved_until: held.has(item.address) ? held.get(item.address) : null
    }));
  }

  mixinApiKeyConfigured() {
    return !!(mixinAppKeystoreFromEnv() || mixinAppKeystore(this.api_key));
  }

  saveMixinApiKey(raw) {
    if (mixinAppKeystoreFromEnv()) {
      throw new Error('The Mixin API key is already supplied by the server environment');
    }

    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw.trim());
      } catch (err) {
        throw new Error('Mixin API key is not valid JSON');
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Mixin API key must be a JSON object');
    }

    const missing = MIXIN_APP_KEY_FIELDS.filter(
      (field) => typeof parsed[field] !== 'string' || !parsed[field].trim()
    );
    if (missing.length) {
      throw new Error(`Mixin API key is incomplete (missing: ${missing.join(', ')})`);
    }

    const keystore = mixinAppKeystore(parsed);
    this.api_key = keystore;
    this.save();
    if (this.api) {
      this.api.appKeystore = keystore;
      this.appSession = this.api.createAppSession();
    }
  }

  respondTo(type = '', obj) {
    if (type === 'admin-config') {
      const testing = new TransferTesting(this.app, this);
      const getConfig = async (request = {}) => {
        const fulfillment_mode = this.fulfillment_mode;
        const payout_mode = this.payout_mode === 'remote' ? 'remote' : 'local';
        const treasury_provider_publickeys = [...(this.treasury_provider_publickeys || [])];
        const treasury_delegate_publickeys = [...(this.treasury_delegate_publickeys || [])];
        const api_key_configured = this.mixinApiKeyConfigured();
        if (!api_key_configured) {
          return {
            transfers: [],
            total: 0,
            page: 1,
            page_size: 20,
            account: this.accountSummary(),
            api_key_configured: false,
            fulfillment_mode,
            payout_mode,
            treasury_provider_publickeys,
            treasury_delegate_publickeys
          };
        }

        const listed = await testing.listOutstandingTransfers({
          search: request.search || '',
          page: request.page || 1,
          purpose: request.purpose || ''
        });
        return {
          ...listed,
          account: this.accountSummary(),
          api_key_configured: true,
          deposit_addresses: await this.depositAddressReport(),
          fulfillment_mode,
          payout_mode,
          treasury_provider_publickeys,
          treasury_delegate_publickeys
        };
      };

      return {
        id: this.returnSlug(),
        name: this.name,
        getConfig,
        updateConfig: async (config = {}) => {
          if (config.action === 'save-api-key') {
            this.saveMixinApiKey(config.api_key);
            return getConfig(config);
          }
          if (config.action === 'save-config') {
            const fulfillment_mode = String(config.fulfillment_mode || '').trim();
            const payout_mode = config.payout_mode === 'remote' ? 'remote' : 'local';
            const supported =
              (fulfillment_mode === 'local' &&
                (payout_mode === 'local' || payout_mode === 'remote')) ||
              (fulfillment_mode === 'remote' && payout_mode === 'remote') ||
              (fulfillment_mode === 'treasury' && payout_mode === 'local');
            if (!supported) {
              throw new Error('Unsupported fulfillment_mode and payout_mode combination.');
            }

            let providers = [];
            let delegates = [];
            const own = String(this.publicKey || '').trim();

            if (fulfillment_mode === 'local' && payout_mode === 'local') {
              providers = [];
              delegates = [];
            } else if (fulfillment_mode === 'treasury' && payout_mode === 'local') {
              providers = [];
              delegates = this.normalizePublicKeyList(
                config.treasury_delegate_publickeys,
                'Treasury delegate keys'
              );
              if (delegates.length !== 1) {
                throw new Error('Treasury mode requires exactly one authorized delegate public key.');
              }
              if (own && delegates[0] === own) {
                throw new Error('The treasury delegate public key must not be this server.');
              }
            } else {
              providers = this.normalizePublicKeyList(
                config.treasury_provider_publickeys,
                'Treasury provider keys'
              );
              delegates = [];
              const usable = providers.filter((key) => key !== own);
              if (!usable.length) {
                throw new Error(
                  'This mode requires at least one valid Treasury provider public key that is not this server.'
                );
              }
            }

            this.fulfillment_mode = fulfillment_mode;
            this.payout_mode = payout_mode;
            this.treasury_provider_publickeys = providers;
            this.treasury_delegate_publickeys = delegates;
            this.save();
            this.syncFulfillmentQueue();
            return getConfig(config);
          }
          if (config.action === 'create-account') {
            const created = await this.createAccount();
            if (created?.err || !this.accountSummary()) {
              throw new Error(created?.err || 'Mixin account was not created');
            }
            return getConfig(config);
          }
          if (config.action === 'restore-account') {
            this.restoreAccount(config.account);
            return getConfig(config);
          }
          if (config.action === 'exclude-transfer') {
            await testing.excludeTransfer(config.id);
            return getConfig(config);
          }
          if (config.action === 'verify-migration') {
            await this.migration.confirmManualMigrationDeposit(
              config.id,
              config.amount,
              config.tx_hash
            );
            return getConfig(config);
          }
          if (config.action === 'approve-migration') {
            await this.approveManualMigration(config.id);
            return getConfig(config);
          }
          await testing.advanceTransfer(config.id, config.action);
          return getConfig(config);
        }
      };
    }

    if (type === 'admin-sidebar') {
      if (!this.app.BROWSER) {
        return null;
      }

      return {
        id: 'payments',
        name: 'Payments',
        render: () => {
          if (!this.admin_ui) {
            this.admin_ui = new MixinAdmin(this.app, this);
          }
          this.admin_ui.render();
        }
      };
    }

    if (type == 'crypto-logo') {
      const ticker = obj.ticker;
      for (const cryptoModule of this.crypto_mods) {
        if (ticker == cryptoModule.ticker) {
          if (cryptoModule.respondTo('crypto-logo', obj)) {
            return cryptoModule.respondTo('crypto-logo', obj);
          }

          const logo = {};
          if (cryptoModule.icon_url) {
            logo.img = cryptoModule.icon_url;
            logo.alt_img = `/${ticker.toLowerCase()}/img/logo.png`;
          } else {
            logo.img = `/${ticker.toLowerCase()}/img/logo.png`;
          }

          if (cryptoModule.chain_id !== cryptoModule.asset_id) {
            for (let i = 0; i < this.crypto_mods.length; i++) {
              if (this.crypto_mods[i].asset_id == cryptoModule.chain_id) {
                logo.sub_logo = `/${this.crypto_mods[i].ticker.toLowerCase()}/img/logo.png`;
              }
            }
          }

          return logo;
        }
      }
    }

    return null;
  }

  installCryptos() {
    const mixinSelf = this;
    const modules = this.app.modules.respondTo('mixin-crypto');

    for (let i = 0; i < modules.length; i++) {
      const cryptoModule = new MixinModule(
        this.app,
        mixinSelf,
        modules[i].ticker,
        modules[i].asset_id,
        modules[i].chain_id
      );

      if (modules[i].returnBalance) {
        cryptoModule.returnBalance = modules[i].returnBalance;
      }

      if (this.app.BROWSER) {
        if (!this.app.browser.returnURLParameter('withdraw')) {
          if (modules[i].name !== modules[i].ticker) {
            console.warn('Installing a ghost crypto module: ', modules[i].name, modules[i].ticker);
            cryptoModule.hide_me = true;
          }
        }
      }

      this.crypto_mods.push(cryptoModule);
      this.app.modules.mods.push(cryptoModule);

      setTimeout(async () => {
        if (typeof cryptoModule?.returnMixinNetworkInfo === 'function') {
          await cryptoModule.returnMixinNetworkInfo();
        }

        await cryptoModule.installModule(mixinSelf.app);

        if (mixinSelf.account_created) {
          if (cryptoModule.isActivated() || cryptoModule.address) {
            await cryptoModule.activate();
          }
        }
      }, 250);
    }
  }

  fetchCredentials() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (res) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(res);
        }
      };
      const timeout = setTimeout(() => finish({ err: 'Mixin account service timed out' }), 30000);

      try {
        Promise.resolve(
          this.app.network.sendRequestAsTransaction(
            'mixin create account',
            {},
            finish,
            this.mixin_peer?.publicKey
          )
        ).catch((err) => finish({ err: formatMixinError(err) }));
      } catch (err) {
        finish({ err: formatMixinError(err) });
      }
    });
  }

  async createAccount() {
    if (this.account_created && this.credentials?.user_id) {
      console.warn('You already have a Mixin Account created...');
      return { keys: this.credentials, existing: true };
    }

    if (this.account_creation_promise) {
      return this.account_creation_promise;
    }

    this.account_creation_promise = (async () => {
      const privateKey = await this.app.wallet.getPrivateKey();
      let response;

      if (this.mixin_peer) {
        console.log('Request remote node to create Mixin User Account', this.mixin_peer.publicKey);
        response = await this.fetchCredentials();
      } else if (this.app.BROWSER) {
        response = { err: 'Mixin account service is unavailable' };
      } else {
        console.log('==> Create Mixin User Account on Same Node as API Keys');
        try {
          const created = await this.accounts.createAccount(this.publicKey);
          response = { res: created.ciphertext, restored: created.restored };
        } catch (err) {
          response = { err: formatMixinError(err) };
        }
      }

      if (typeof response !== 'object' || !response?.res) {
        const error = response?.err || 'Mixin account service returned no account';
        console.error('Mixin Account Error:', error);
        return { err: error };
      }

      try {
        const keys = this.accounts.decryptCredentials(response.res, privateKey);
        if (response.restored) {
          console.log('Successfully Restored Mixin Account!');
        } else {
          console.log('Successfully Created Mixin Account!');
        }
        this.credentials = keys;
        this.account_created = 1;
        this.accounts.saveCredentials(keys);
        return { keys, restored: !!response.restored };
      } catch (err) {
        const error = `Unable to decrypt Mixin account: ${formatMixinError(err)}`;
        console.error(error);
        return { err: error };
      }
    })();

    try {
      return await this.account_creation_promise;
    } finally {
      this.account_creation_promise = null;
    }
  }

  render() {
    if (!this.browser_active) {
      return;
    }
    if (this.isMigrationRoute()) {
      this.renderMigrationPage();
      return;
    }
    if (this.main) {
      this.main.render();
    }
  }

  webServer(app, expressapp, express) {
    const MainTemplate = require('./lib/ui/main.template');
    const webdir = `${__dirname}/web`;
    const sendPage = (res) => {
      const card = this.social || {
        twitter: '',
        title: 'Buy SAITO',
        url: '/mixin',
        description: this.description,
        image: ''
      };
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(MainTemplate(app, this, app.build_number, card));
    };

    const migrationDocument = require('./lib/ui/migration/document.template');
    expressapp.get(['/migration', '/migration/'], (req, res) => {
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(migrationDocument(app.build_number));
    });

    expressapp.get('/' + encodeURI(this.returnSlug()), (req, res) => {
      sendPage(res);
    });

    // The old purchase page lived at /buy. Keep that entry point when BuySaito
    // is not installed to register it itself.
    if (!app.modules?.returnModule?.('BuySaito')) {
      expressapp.get('/buy', (req, res) => {
        sendPage(res);
      });
    }

    expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
  }

  receiveAvailableCurrencies(response) {
    const data = response?.request ? response.data : response;
    if (!data || data.err) {
      const message = data?.message || data?.err || 'empty reply';
      console.log('Mixin buysaito available currencies error', message);
      this.available_currencies = null;
      if (data?.message || data?.err) {
        this.app.connection.emit('saito-purchase-error-notification', {
          message: data.message || data.err
        });
      }
      this.app.connection.emit('saito-purchase-cryptos');
      return;
    }
    const excluded = new Set(['ERC-SAITO', 'BEP-SAITO']);
    this.available_currencies = Array.isArray(data.ac)
      ? data.ac.filter((currency) => {
          const price = Number(currency?.price_usd);
          return currency?.ticker && !excluded.has(currency.ticker) && Number.isFinite(price) && price > 0;
        })
      : null;
    const ercPrice = Number(data.erc);
    this.erc_saito = Number.isFinite(ercPrice) && ercPrice > 0 ? { price_usd: ercPrice } : null;
    if (this.browser_active) {
      this.purchase_overlay?.renderAmountPage();
    }
    this.app.connection.emit('saito-purchase-cryptos');
  }

  receiveBuySaitoReply(tx, message) {
    const peerKey = this.buysaito_peer?.publicKey;
    if (!peerKey || !tx.isFrom(peerKey)) {
      return 0;
    }

    const data = message.data;

    if (message.request === 'buysaito available currencies') {
      this.receiveAvailableCurrencies(data);
      return 1;
    }

    if (message.request === 'buysaito report error') {
      this.app.connection.emit('saito-purchase-error-notification', data || {});
      return 1;
    }

    if (message.request === 'buysaito reserve address') {
      this.pending_payments.push(data);
      this.app.connection.emit('saito-purchase-address-reserved', data);
      return 1;
    }

    if (message.request === 'buysaito payment detected') {
      const payment = this.pending_payments.find(
        (row) => row.id === data?.id && row.address === data?.address && row.ticker === data?.ticker
      );
      if (payment && ['pending', 'confirmed'].includes(data.status)) {
        payment.status = data.status;
        this.app.connection.emit('saito-purchase-payment-detected', data);
      }
      return 1;
    }

    if (message.request === 'buysaito saito issued') {
      const index = this.pending_payments.findIndex((row) => row.address === data?.address);
      if (index >= 0) {
        this.pending_payments.splice(index, 1);
        this.app.connection.emit('saito-purchase-saito-issued', data);
      }
      return 1;
    }

    return 0;
  }

  convertSaitoToOther(amount, ticker = null) {
    const ercPrice = Number(this.erc_saito?.price_usd);
    const usdPrice = Number(
      (this.available_currencies || []).find((currency) => currency.ticker == ticker)?.price_usd
    );
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(ercPrice) ||
      ercPrice <= 0 ||
      !Number.isFinite(usdPrice) ||
      usdPrice <= 0
    ) {
      return NaN;
    }
    const saitoPrice = Math.max(0.001, 1.1 * ercPrice);
    return Math.ceil(((amount * saitoPrice) / usdPrice) * 1000000) / 1000000;
  }

  convertToSaito(amount, ticker = null) {
    const ercPrice = Number(this.erc_saito?.price_usd);
    const usdPrice = Number(
      (this.available_currencies || []).find((currency) => currency.ticker == ticker)?.price_usd
    );
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(ercPrice) ||
      ercPrice <= 0 ||
      !Number.isFinite(usdPrice) ||
      usdPrice <= 0
    ) {
      return NaN;
    }
    const saitoPrice = Math.max(0.001, 1.1 * ercPrice);
    return Math.floor((amount * usdPrice) / saitoPrice);
  }

  async onNewBlock(block, longestChain) {
    if (!this.app.BROWSER && this.transfers && this.performsLocalFulfillment()) {
      await this.transfers.onNewBlock(block, longestChain);
    }
  }

  async onChainReorganization(blockId, blockHash, longestChain) {
    if (!this.app.BROWSER && this.transfers && this.performsLocalFulfillment()) {
      await this.transfers.onChainReorganization(blockId, blockHash, longestChain);
    }
  }

  destroy(app) {
    clearInterval(this.transfer_timer);
    this.transfer_timer = null;
    super.destroy(app);
  }

  fetchMixinUser(query) {
    if (this.app.BROWSER) {
      return new Promise((resolve) => {
        this.app.network.sendRequestAsTransaction(
          'mixin fetch user',
          query,
          (res) => {
            resolve(Array.isArray(res) && res.length ? res[0] : null);
          },
          this.mixin_peer?.publicKey
        );
      });
    }

    return this.database.findAddress({
      assetId: query.asset_id,
      mixinUserId: query.user_id,
      publicKey: query.publicKey,
      address: query.address
    });
  }
}

Object.assign(Mixin.prototype, migrationClient);

module.exports = Mixin;

