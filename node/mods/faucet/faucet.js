const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const PeerService = require('saito-js/lib/peer_service').default;
const FaucetHome = require('./faucet.template');
const FaucetDB = require('./lib/db');
const FaucetWallet = require('./lib/wallet');
const FaucetOAuth = require('./lib/oauth');
const Auth = require('./lib/ui/auth');
const Waiting = require('./lib/ui/waiting');
const Success = require('./lib/ui/success');
const Main = require('./lib/ui/main');
const ConfigTemplate = require('./lib/ui/config.template');

class Faucet extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Faucet';
    this.slug = 'faucet';

    this.description = 'Testnet Faucet for Testing and Application Development';
    this.categories = 'Utility Ecommerce NFTs';

    this.icon_fa = 'fa-solid fa-faucet';
    this.styles = ['/faucet/style.css'];

    this.amount = BigInt(100) * BigInt(100000000);

    this.db = new FaucetDB(app, this);
    this.wallet = new FaucetWallet(app, this);
    this.oauth = new FaucetOAuth(app, this);
    this.main = new Main(app, this);
    this.auth_overlay = new Auth(app, this);
    this.waiting_overlay = new Waiting(app, this);
    this.success_overlay = new Success(app, this);

    // Server Faucet capability as last reported to this browser. Unavailable
    // until a successful `faucet available` reply from a discovered Faucet peer.
    this.server_faucet_available = false;
    this.server_faucet_amount = 0;
    this.server_faucet_free_use = false;
    this.faucet_peer_public_key = '';

    // Re-check when the user asks to see acquisition options. This is
    // event-driven: no polling or timer-based retries.
    app.connection.on('saito-purchase-overlay-open', () => {
      this.checkFaucetAvailability();
    });

    // Server Faucet modes. OAuth secrets remain in memory, but the enabled
    // mode flags are persisted in app.options.faucet.mode.
    this.mode = {
      free: false,
      github: false,
      twitter: false
    };
    this.free_use = false;

    this.social = this.buildSocial({
      twitter: '@SaitoOfficial',
      title: '🟥 Saito Faucet',
      url: '/faucet/',
      description: 'Get Testnet Saito',
      image: 'https://saito.tech/wp-content/uploads/2023/11/faucet-300x300.png'
    });
  }

  async initialize(app) {
    await super.initialize(app);

    if (!this.app.BROWSER) {
      const savedMode = this.app.options?.faucet?.mode;
      if (savedMode && typeof savedMode === 'object') {
        this.mode = {
          free: savedMode.free === true || savedMode.free_use === true,
          github: savedMode.github === true,
          twitter: savedMode.twitter === true
        };
      }
      this.free_use = this.mode.free;

      await this.db.initialize();
      await this.wallet.initialize();
    }
  }

  returnServices() {
    const services = [];
    if (!this.app.BROWSER) {
      services.push(new PeerService(null, 'faucet'));
    }
    return services;
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (!this.app.BROWSER) {
      return;
    }
    if (service.service !== 'faucet') {
      return;
    }
    const dest = String(peer?.publicKey || '').trim();
    if (!dest) {
      return;
    }

    this.faucet_peer_public_key = dest;

    await this.checkFaucetAvailability(dest);
  }

  async onConnectionStable(app, peer) {
    if (!this.app.BROWSER) {
      return;
    }

    const dest = String(peer?.publicKey || '').trim();
    if (!dest || dest !== this.faucet_peer_public_key) {
      return;
    }

    await this.checkFaucetAvailability(dest);
  }

  async checkFaucetAvailability(publicKey = '') {
    if (!this.app.BROWSER) {
      return;
    }

    const dest = String(publicKey || this.faucet_peer_public_key || '').trim();
    if (!dest) {
      return;
    }

    // Unsigned peer request (not an on-chain fee transaction). Asks whether
    // this Faucet peer has OAuth configured — that is what BuySaito uses to
    // show the faucet option. Same pattern as Giphy `get giphy auth`.
    try {
      await this.app.network.sendRequestAsTransaction(
        'faucet available',
        {},
        (res_tx) => {
          let res = {};
          try {
            if (res_tx && typeof res_tx.returnMessage === 'function') {
              res = res_tx.returnMessage() || {};
            } else if (res_tx && typeof res_tx === 'object') {
              res = res_tx;
            }
          } catch (err) {
            return;
          }

          if (res.err || typeof res.available !== 'boolean') {
            return;
          }

          this.server_faucet_available = res.available === true;
          this.server_faucet_amount = this.server_faucet_available
            ? Number(res.amount) || 0
            : 0;
          this.server_faucet_free_use = res.free_use === true;

          try {
            const buysaito = this.app.modules.returnModule('BuySaito');
            const purchase = buysaito?.purchase_overlay;
            if (
              purchase?.active &&
              typeof purchase.renderAcquisitionOptions === 'function' &&
              document.querySelector('#purchase-container')
            ) {
              purchase.renderAcquisitionOptions();
            }
          } catch (err) {
            // BuySaito may be absent; availability still lives on this module.
          }
        },
        dest
      );
    } catch (err) {
      // Leave unavailable: install in the browser is not proof the server Faucet is up.
    }
  }

  respondTo(type = '', obj) {
    if (type === 'buysaito-options') {
      if (!this.app.BROWSER || this.server_faucet_available !== true) {
        return null;
      }

      const free_use = this.server_faucet_free_use === true;

      return {
        id: 'faucet',
        title: 'Request SAITO tokens from the server faucet...',
        description: free_use
          ? 'You may request a small amount to try the network. No registration is required.'
          : 'You may request a small amount to try the network. Registration with a Github or Twitter account is needed to ensure our limited supply goes to real users and developers.',
        icon: this.icon_fa,
        rank: 1,
        option_class: 'buysaito-option-faucet',
        inline_stage: 'faucet-auth',
        available: true,
        amount: this.server_faucet_amount,
        auth_message: free_use
          ? 'The SAITO Faucet exists to help new users try the advanced features of the network. No registration is required.'
          : '',
        providers: free_use
          ? [{ id: 'free_use', name: 'No Registration Required', label: 'Get Testnet Tokens' }]
          : [
              { id: 'twitter', name: 'X', icon: 'fa-brands fa-x-twitter' },
              { id: 'github', name: 'GitHub', icon: 'fa-brands fa-github' }
            ],
        beginProviderAuth: (providerId) => {
          const id = String(providerId || '')
            .trim()
            .toLowerCase();
          if (!id) {
            return;
          }
          if (id === 'free_use') {
            this.requestFreeUse();
            return;
          }
          this.auth_overlay.authenticate({ id });
        }
      };
    }

    return super.respondTo(type, obj);
  }

  /**
   * Browser: ask the Faucet peer to register this wallet without OAuth.
   * Server replies on the existing faucet-oauth-result path.
   */
  async requestFreeUse() {
    if (!this.app.BROWSER || this.server_faucet_free_use !== true) {
      return;
    }
    const dest = String(this.faucet_peer_public_key || '').trim();
    if (!dest) {
      console.error('[Faucet] requestFreeUse: no faucet peer');
      return;
    }
    try {
      await this.app.network.sendRequestAsTransaction('faucet free use', {}, null, dest);
    } catch (err) {
      console.error('[Faucet] requestFreeUse failed', err);
    }
  }

  /**
   * Bind an authenticated identity to a Faucet record.
   * Existing record → already registered. New record → browser auto-claims.
   */
  async acceptAuthenticatedIdentity(identity = {}) {
    console.log(
      '[Faucet] acceptAuthenticatedIdentity provider=' +
        (identity.provider || '') +
        ' provider_user_id=' +
        (identity.provider_user_id || '') +
        ' publickey=' +
        (identity.publickey || '')
    );

    const record = await this.db.getRecord(identity);
    console.log(
      '[Faucet] acceptAuthenticatedIdentity record=' +
        (record ? 'found status=' + (record.issuance_status || '') : 'none')
    );

    if (record) {
      let peer = await this.app.network.getPeer(identity.publickey);
      if (!peer?.publicKey) {
        const peers = await this.app.network.getPeers();
        peer = peers.find(
          (p) => p?.publicKey === identity.publickey && p?.status !== 'disconnected'
        );
      }
      console.log('[Faucet] acceptAuthenticatedIdentity already registered — not issuing');
      if (peer?.publicKey) {
        await this.app.network.sendRequestAsTransaction(
          'faucet-oauth-result',
          {
            success: true,
            already_issued: true,
            publickey: identity.publickey,
            message: 'This Saito public key is already registered for the Faucet.'
          },
          null,
          peer.publicKey
        );
      }
      return {
        status: 200,
        popup: {
          ok: true,
          title: 'Already registered',
          message:
            'This Saito public key is already registered for the Faucet. You can close this window.'
        }
      };
    }

    if (!(await this.db.insertRecord(identity))) {
      console.log('[Faucet] acceptAuthenticatedIdentity insert failed');
      return {
        status: 500,
        popup: {
          ok: false,
          title: 'Registration failed',
          message: 'Could not create a Faucet registration. Please try again.'
        }
      };
    }

    let peer = await this.app.network.getPeer(identity.publickey);
    if (!peer?.publicKey) {
      const peers = await this.app.network.getPeers();
      peer = peers.find(
        (p) => p?.publicKey === identity.publickey && p?.status !== 'disconnected'
      );
    }
    console.log('[Faucet] acceptAuthenticatedIdentity inserted — will issue after faucet request confirms');
    if (!peer?.publicKey) {
      console.log('[Faucet] acceptAuthenticatedIdentity no connected peer for ' + identity.publickey);
      return {
        status: 200,
        popup: {
          ok: true,
          title: 'Registration complete',
          message:
            'Registration succeeded, but your Saito browser was not connected. Return to Get SAITO and try again, or keep that window open while signing in.'
        }
      };
    }

    console.log('[Faucet] acceptAuthenticatedIdentity notifying browser already_issued=false');
    await this.app.network.sendRequestAsTransaction(
      'faucet-oauth-result',
      {
        success: true,
        already_issued: false,
        publickey: identity.publickey,
        message: 'Faucet OAuth registration succeeded.'
      },
      null,
      peer.publicKey
    );

    return {
      status: 200,
      popup: {
        ok: true,
        title: 'Account verified',
        message:
          'Your account was verified. You can close this window — Get SAITO will continue automatically.'
      }
    };
  }

  async render() {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    this.header = new SaitoHeader(this.app, this);
    await this.header.initialize(this.app);
    this.header.header_class = 'arcade';
    this.addComponent(this.header);

    await super.render();

    this.main.render();
  }

  async createFaucetClaimTransaction() {
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
    newtx.msg = {
      module: 'Faucet',
      request: 'faucet request'
    };
    await newtx.sign();
    return newtx;
  }

  async receiveFaucetClaimTransaction(tx = null, blk = null) {
    if (tx == null || blk == null) {
      return;
    }

    let receiver = tx.from[0].publicKey;
    console.log('[Faucet] receiveFaucetClaimTransaction receiver=' + receiver);

    const began = await this.db.updateRecord(
      { publickey: receiver, issuance_status: 'eligible' },
      { issuance_status: 'pending' }
    );
    if (!began) {
      console.log('[Faucet] receiveFaucetClaimTransaction refused — no eligible registration for ' + receiver);
      return;
    }

    console.log('[Faucet] receiveFaucetClaimTransaction queueing payment for ' + receiver);
    try {
      const newtx = await this.wallet.queuePayment({
        publickey: receiver
      });

      const completed = await this.db.updateRecord(
        { publickey: receiver, issuance_status: 'pending' },
        {
          issuance_status: 'issued',
          issuance_amount: this.amount.toString(),
          issuance_tx_signature: newtx.signature,
          issued_at: Date.now()
        }
      );

      console.log(
        '[Faucet] receiveFaucetClaimTransaction payout queued/created signature=' +
          (newtx?.signature || '')
      );
      if (!completed) {
        console.error(
          '[Faucet] issuance propagated but failed to mark registration issued for ' +
            receiver +
            ' sig=' +
            newtx.signature
        );
      }
    } catch (err) {
      console.error('[Faucet] payout failed after pending claim; reverting to eligible', err);
      await this.db.updateRecord(
        { publickey: receiver, issuance_status: 'pending' },
        { issuance_status: 'eligible' }
      );
    }
  }

  async receiveFaucetIssuanceTransaction(tx) {
    if (!this.app.BROWSER || !tx?.isTo(this.publicKey)) {
      return;
    }
    console.log(
      '[Faucet] receiveFaucetIssuanceTransaction telling waiting UI issuance completed signature=' +
        (tx.signature || '')
    );
    this.waiting_overlay.close();
    this.success_overlay.render({ tx });
  }

  async onConfirmation(blk, tx, conf = 0) {
    if (conf != 0) {
      return;
    }

    if (this.hasSeenTransaction(tx, blk)) {
      return;
    }

    let txmsg = tx.returnMessage();

    if (txmsg.request === 'faucet request') {
      console.log(
        '[Faucet] onConfirmation faucet request from=' + (tx.from?.[0]?.publicKey || '')
      );
      if (!this.app.BROWSER) {
        await this.receiveFaucetClaimTransaction(tx, blk);
      }
      return;
    }

    if (txmsg.request === 'faucet issuance') {
      console.log(
        '[Faucet] onConfirmation faucet issuance to=' +
          (tx.to || [])
            .map((s) => s.publicKey + ':' + String(s.amount || ''))
            .join(',')
      );
      await this.receiveFaucetIssuanceTransaction(tx);
    }
  }

  async onNewBlock(blk, lc) {
    await this.wallet.onNewBlock(blk, lc);
  }

  onChainReorganization(block_id, block_hash, lc) {
    this.wallet.onChainReorganization(block_id, block_hash, lc);
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
    if (tx == null) {
      return 0;
    }

    let txmsg;
    try {
      txmsg = tx.returnMessage();
    } catch (err) {
      return 0;
    }

    if (txmsg?.request === 'faucet available') {
      if (this.app.BROWSER) {
        return 0;
      }

      const available = !!(
        this.free_use ||
        this.oauth.secret_github ||
        this.oauth.secret_twitter
      );
      const amount = available
        ? Number(this.app.wallet.convertNolanToSaito(this.amount))
        : 0;
      if (typeof mycallback === 'function') {
        mycallback({ available, amount, free_use: this.free_use === true });
      }
      return 1;
    }

    if (txmsg?.request === 'faucet free use') {
      if (this.app.BROWSER) {
        return 0;
      }
      if (this.free_use !== true) {
        console.log('[Faucet] faucet free use refused — free_use is off');
        return 1;
      }
      const publickey = String(tx.from?.[0]?.publicKey || '').trim();
      if (!publickey) {
        console.log('[Faucet] faucet free use refused — no sender publickey');
        return 1;
      }
      console.log('[Faucet] faucet free use publickey=' + publickey);
      await this.acceptAuthenticatedIdentity({
        provider: 'free_use',
        provider_user_id: publickey,
        provider_username: '',
        provider_display_name: '',
        provider_account_created_at: 0,
        publickey
      });
      return 1;
    }

    if (txmsg?.request === 'faucet-oauth-result') {
      if (!this.app.BROWSER) {
        return 0;
      }

      const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};

      if (data.already_issued) {
        try {
          const purchase = this.app.modules.returnModule('BuySaito')?.purchase_overlay;
          if (purchase && typeof purchase.showFaucetAlreadyIssuedNotice === 'function') {
            if (!document.querySelector('#purchase-container') && purchase.active) {
              purchase.render();
            }
            purchase.showFaucetAlreadyIssuedNotice();
          }
        } catch (err) {
          console.error('FAUCET: failed to show already-issued notice', err);
        }
        return 1;
      }

      try {
        const purchase = this.app.modules.returnModule('BuySaito')?.purchase_overlay;
        if (purchase) {
          purchase.acquisition_stage = 'default';
          purchase.stage1_html = null;
          if (purchase.overlay) {
            purchase.overlay.close();
          }
          purchase.active = false;
        }
      } catch (err) {
        console.error('FAUCET: failed to dismiss Get SAITO UI', err);
      }

      this.waiting_overlay.render();
      if (this.waiting_overlay.dev_mode) {
        return 1;
      }

      try {
        const claim_tx = await this.createFaucetClaimTransaction();
        console.log(
          '[Faucet] faucet-oauth-result propagating faucet request signature=' +
            (claim_tx?.signature || '')
        );
        this.app.network.propagateTransaction(claim_tx);
      } catch (err) {
        console.error('[Faucet] failed to create/propagate request', err);
        this.waiting_overlay.render({ timeout: true });
      }
      return 1;
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  webServer(app, expressapp, express) {
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let faucet_self = this;
    const slug = encodeURI(this.returnSlug());

    this.oauth.attachRoutes(expressapp);

    const renderConfig = (opts = {}) =>
      ConfigTemplate({
        publickey: faucet_self.wallet.publickey || faucet_self.app.options.faucet?.publickey || '',
        slips: faucet_self.wallet.slips,
        queue: faucet_self.wallet.queue,
        githubConfigured: !!faucet_self.oauth.secret_github,
        twitterConfigured: !!faucet_self.oauth.secret_twitter,
        free_use: faucet_self.free_use === true,
        ...opts
      });

    const sendConfig = (res, opts = {}) => {
      res.setHeader('Content-type', 'text/html; charset=UTF-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(renderConfig(opts));
    };

    expressapp.get('/' + slug + '/oauth/config', (req, res) => {
      if (res.finished) {
        return;
      }
      return res.redirect(302, '/' + slug + '/config');
    });

    expressapp.get('/' + slug + '/config', async (req, res) => {
      if (res.finished) {
        return;
      }
      await faucet_self.wallet.getSnapshotBalance();
      return sendConfig(res);
    });

    expressapp.post('/' + slug + '/config', async (req, res) => {
      if (res.finished) {
        return;
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const githubSecret = String(body.github_secret || '');
      const twitterSecret = String(body.twitter_secret || '');
      if (githubSecret) {
        faucet_self.oauth.secret_github = githubSecret;
      }
      if (twitterSecret) {
        faucet_self.oauth.secret_twitter = twitterSecret;
      }
      faucet_self.free_use = body.free_use === '1' || body.free_use === 'on';
      faucet_self.mode = {
        free: faucet_self.free_use,
        github: !!faucet_self.oauth.secret_github,
        twitter: !!faucet_self.oauth.secret_twitter
      };

      if (
        !faucet_self.app.options.faucet ||
        typeof faucet_self.app.options.faucet !== 'object'
      ) {
        faucet_self.app.options.faucet = {};
      }
      faucet_self.app.options.faucet.mode = { ...faucet_self.mode };
      faucet_self.app.storage.saveOptions();

      console.log(
        'FAUCET CONFIG: OAuth updated — GitHub:',
        faucet_self.oauth.secret_github ? 'configured' : 'not set',
        '| X:',
        faucet_self.oauth.secret_twitter ? 'configured' : 'not set',
        '| Free Use:',
        faucet_self.free_use ? 'on' : 'off'
      );

      await faucet_self.wallet.getSnapshotBalance();
      return sendConfig(res, { saved: true });
    });

    expressapp.get('/' + slug, async function (req, res) {
      let updatedSocial = Object.assign({}, faucet_self.social);

      let html = FaucetHome(app, faucet_self, app.build_number, updatedSocial);
      if (!res.finished) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(html);
      }
      return;
    });

    expressapp.use('/' + slug, express.static(webdir));
  }
}

module.exports = Faucet;
