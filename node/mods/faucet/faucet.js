const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const SaitoOverlay = require('./../../lib/saito/ui/saito-overlay/saito-overlay');
const FaucetHome = require('./index');
const FaucetMainTemplate = require('./lib/faucet-main.template');
const FaucetOverlayTemplate = require('./lib/faucet-overlay.template');
const Auth = require('./lib/ui/auth');
const OAuthGithubInitiateTemplate = require('./lib/ui/oauth-github-initiate.template');
const OAuthConfigTemplate = require('./lib/ui/oauth-config.template');
const crypto = require('crypto');

//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
//
class Faucet extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Faucet';
    this.slug = 'faucet';

    this.description = 'Testnet Faucet for Testing and Application Development';
    this.categories = 'Utility Ecommerce NFTs';

    this.icon_fa = 'fa-solid fa-faucet';
    this.styles = ['/faucet/style.css'];

    this.amount = BigInt(10000000000);
    // Closebox enabled — acquisition overlay uses the standard upper-left close control.
    this.overlay = new SaitoOverlay(app, this, true);
    this.auth = null;

    // Browser acquisition UI / confirmation tracking
    this.claimTimeoutMs = 120000;
    this.claimStartedAt = 0;
    this.claimTimeoutId = null;
    this.claimProgressIntervalId = null;
    this.claimMonitorPhase = '';
    this.acquisitionMessageShown = false;
    this.lastIssuanceAmount = null;
    this.claimCountdownIntervalId = null;
    this.autoClaimPending = false;

    // BEGIN TEMP_OAUTH_CONFIG — runtime OAuth client secrets + config gate.
    // Remove with /faucet/oauth/config when production env secrets are available.
    // Secrets are never committed; they are set after deploy via the config endpoint.
    this.oauth_secret_github = null;
    this.oauth_secret_twitter = null;
    // Shared key required on POST /faucet/oauth/config (NOT an OAuth client secret).
    // Change before deploying to test.saito.io. Anyone with the repo can see this value —
    // it is only a temporary gate, not production credential storage.
    this.oauth_config_key = 'faucet-oauth-config-temp';
    // END TEMP_OAUTH_CONFIG

    // BEGIN DEV_MODE_UI — temporary faucet UI-flow test (no real issuance).
    // Remove this.dev_mode, startDevUiSuccessTimer(), clearDevUiSuccessTimer(),
    // and the DEV branches in submitFaucetClaim / clearClaimMonitoring
    // when UI work is finished.
    this.dev_mode = 1;
    this.devUiSuccessTimerId = null;
    // END DEV_MODE_UI

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

    // Existing faucet.sq3 installs skip installModule; ensure registrations exists
    // and drop obsolete empty identity/auth/claim/issuance tables.
    if (!this.app.BROWSER) {
      await this.ensureRegistrationsSchema();
    }
  }

  /**
   * Contribute an acquisition option to BuySaito.
   * Declares `inline_stage` so BuySaito transitions its own overlay's
   * lower section — does NOT open another SaitoOverlay.
   */
  respondTo(type = '', obj) {
    if (type === 'buysaito-options') {
      if (!this.app.BROWSER) {
        return null;
      }

      return {
        id: 'faucet',
        title: 'Request SAITO tokens from the server faucet...',
        description:
          'You may request a small amount to try the network. Registration with a Github or Twitter account is needed to ensure our limited supply goes to real users and developers.',
        icon: this.icon_fa,
        rank: 1,
        option_class: 'buysaito-option-faucet',
        // BuySaito hosts this stage inside the existing GET SAITO overlay.
        inline_stage: 'faucet-auth',
        providers: [
          { id: 'twitter', name: 'X', icon: 'fa-brands fa-x-twitter' },
          { id: 'github', name: 'GitHub', icon: 'fa-brands fa-github' }
        ],
        beginProviderAuth: (providerId) => {
          this.beginProviderAuthentication(providerId);
        }
      };
    }

    return super.respondTo(type, obj);
  }

  /**
   * Start provider authentication without opening a Faucet/Auth overlay.
   * Used by BuySaito's in-overlay faucet-auth stage.
   * GitHub uses the existing OAuth initiation popup; other providers stub for now.
   */
  beginProviderAuthentication(providerId = '') {
    const id = String(providerId || '')
      .trim()
      .toLowerCase();

    if (!id) {
      return;
    }

    if (id === 'github') {
      if (!this.auth) {
        this.auth = new Auth(this.app, this);
      }
      // Popup only — does not show Auth's SaitoOverlay.
      this.auth.openGithubOAuthPopup();
      return;
    }

    if (id === 'twitter') {
      siteMessage('X authentication will be available soon.', 3000);
      return;
    }

    siteMessage('That authentication provider is not available yet.', 3000);
  }

  /**
   * Open the Faucet-owned Auth overlay above the current acquisition host
   * (BuySaito). Kept for standalone/dev paths; BuySaito acquisition uses
   * beginProviderAuthentication via the in-overlay faucet-auth stage.
   */
  openAuthOverlay() {
    this.attachStyleSheets();

    if (!this.auth) {
      this.auth = new Auth(this.app, this);
    }

    this.auth.render({
      title: 'Welcome to Saito',
      message: `To continue, please verify one of your existing online accounts.

We never post on your behalf.`,
      providers: ['twitter', 'github'],
      callback: (result) => {
        if (result?.status === Auth.STATUS.SUCCESS) {
          console.debug('Faucet Auth success (issuance not wired):', result);
        }
      }
    });
  }

  async render() {
    //
    // browsers only!
    //
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    this.header = new SaitoHeader(this.app, this);
    await this.header.initialize(this.app);
    this.header.header_class = 'arcade';
    this.addComponent(this.header);

    await super.render();

    this.app.browser.addElementToDom(FaucetMainTemplate(this.app, this));

    this.setFaucetState('eligible');
    this.attachEvents();
  }

  canRenderInto(querySelector = '') {
    console.log('Faucet: canRenderInto -- ', querySelector);
    if (!this.browser_active) {
      if (querySelector == '.get-saito-tokens') {
        return true;
      }
    }

    return false;
  }

  async renderInto(querySelector = '') {
    if (querySelector == '.get-saito-tokens') {
      this.styles = ['/faucet/style.css'];
      this.attachStyleSheets();
      this.app.browser.addElementToSelector(
        `<div class='saito-faucet-button saito-button-secondary'><i class='${this.icon_fa}'></i></div>`,
        querySelector
      );

      setTimeout(() => {
        document.querySelector('.saito-faucet-button').onclick = (e) => {
          this.openFaucetOverlay();
        };
      }, 50);
    }
  }

  openFaucetOverlay(opts = {}) {
    const autoClaim = !!opts.autoClaim;

    this.attachStyleSheets();
    this.clearClaimMonitoring();
    this.acquisitionMessageShown = false;
    this.lastIssuanceAmount = null;
    this.autoClaimPending = autoClaim;
    this.overlay.show(FaucetOverlayTemplate(this.app, this), () => {
      // DEV UI TEST — remove after faucet UI testing
      this.clearDevUiSuccessTimer();
    });
    this.attachEvents();

    if (autoClaim) {
      // OAuth / faucet callback: skip eligible screen → pending immediately.
      this.submitFaucetClaim();
      return;
    }

    this.setFaucetState('eligible');
  }

  /**
   * Close Get SAITO / BuySaito purchase UI so the claim overlay does not stack
   * on top of the registration screen. Leaves the original application alone.
   */
  dismissGetSaitoRegistrationUi() {
    try {
      const buysaito = this.app.modules.returnModule('BuySaito');
      const purchase = buysaito?.purchase_overlay;
      if (!purchase) {
        return;
      }
      purchase.acquisition_stage = 'default';
      purchase.stage1_html = null;
      if (purchase.overlay) {
        purchase.overlay.close();
      }
      purchase.active = false;
    } catch (err) {
      console.error('FAUCET: failed to dismiss Get SAITO UI', err);
    }
  }

  /**
   * Keep / restore Get SAITO and show the already-issued notice instead of claim UI.
   */
  showAlreadyIssuedOnGetSaito() {
    try {
      const buysaito = this.app.modules.returnModule('BuySaito');
      const purchase = buysaito?.purchase_overlay;
      if (!purchase) {
        return;
      }

      if (typeof purchase.showFaucetAlreadyIssuedNotice === 'function') {
        // Ensure Get SAITO is visible if OAuth returned while it was still open.
        if (!document.querySelector('#purchase-container') && purchase.active) {
          purchase.render();
        }
        purchase.showFaucetAlreadyIssuedNotice();
      }
    } catch (err) {
      console.error('FAUCET: failed to show already-issued notice', err);
    }
  }

  /**
   * Acquisition UI state machine.
   * States: eligible | pending | success | timeout
   * ('idle' is accepted as an alias for eligible.)
   */
  setFaucetState(state = 'eligible', opts = {}) {
    if (state === 'idle') {
      state = 'eligible';
    }

    const root = document.getElementById('faucet-request-container');
    if (!root) {
      return;
    }

    root.dataset.faucetState = state;

    const title = document.getElementById('faucet_title');
    const message = document.getElementById('faucet_message');
    const amountEl = document.getElementById('faucet_amount');
    const progress = document.getElementById('faucet_progress');
    const claimBtn = document.getElementById('faucet-button');
    const closeBtn = document.getElementById('faucet-close-btn');
    const spinner = document.getElementById('faucet_spinner');
    const successIcon = document.getElementById('faucet_success_icon');
    const errorIcon = document.getElementById('faucet_error_icon');

    const amountLabel =
      opts.amountLabel ||
      (this.lastIssuanceAmount != null
        ? `${this.app.wallet.convertNolanToSaito(this.lastIssuanceAmount)} SAITO`
        : `${this.app.wallet.convertNolanToSaito(this.amount)} SAITO`);

    const copy = {
      eligible: {
        title: "You're Eligible for Free SAITO",
        message: opts.fromOAuth
          ? 'Registration succeeded. You are eligible for your one-time faucet allocation. Requesting SAITO from the network…'
          : 'You can receive enough free SAITO to try the network.',
        progress: '',
        claimLabel: 'Claim My SAITO',
        closeLabel: 'Close',
        showAmount: true,
        showClaim: !opts.fromOAuth && !this.autoClaimPending,
        showClose: false,
        showCountdown: false,
        showSpinner: false
      },
      pending: {
        title: 'Please Be Patient',
        message:
          'Our server is processing your request for SAITO tokens. It may take a few blocks for the transfer to complete. This screen will update when the tokens arrive.',
        progress: '',
        claimLabel: 'Claim My SAITO',
        closeLabel: 'Close',
        showAmount: false,
        showClaim: false,
        showClose: false,
        showCountdown: true,
        showSpinner: false
      },
      success: {
        title: 'Your SAITO Has Arrived',
        message: `You've received ${amountLabel} in your wallet.\n\nPlease click the button below to return to your previous action.`,
        progress: '',
        claimLabel: 'Claim My SAITO',
        closeLabel: 'Continue',
        showAmount: false,
        showClaim: false,
        showClose: true,
        showCountdown: false,
        showSpinner: false
      },
      timeout: {
        title: 'SAITO Could Not Be Received',
        message:
          'We were not able to confirm your faucet transaction yet. You can close this window and try again.',
        progress: '',
        claimLabel: 'Claim My SAITO',
        closeLabel: 'Close',
        showAmount: false,
        showClaim: false,
        showClose: true,
        showCountdown: false,
        showSpinner: false
      }
    };

    const ui = copy[state] || copy.eligible;

    if (title) {
      title.textContent = ui.title;
    }
    if (message) {
      message.textContent = ui.message;
    }
    if (amountEl) {
      amountEl.textContent = amountLabel;
      amountEl.hidden = !ui.showAmount;
    }
    if (progress) {
      // Pending uses only the block countdown — no duplicate status line.
      if (ui.progress && state !== 'pending') {
        progress.hidden = false;
        progress.textContent = ui.progress;
      } else {
        progress.hidden = true;
        progress.textContent = '';
      }
    }
    if (claimBtn) {
      claimBtn.textContent = ui.claimLabel;
      claimBtn.hidden = !ui.showClaim;
      claimBtn.disabled = state === 'pending' || this.autoClaimPending;
    }
    if (closeBtn) {
      closeBtn.textContent = ui.closeLabel;
      closeBtn.hidden = !ui.showClose;
      // Success Continue is the primary action; other states keep secondary Close.
      if (state === 'success') {
        closeBtn.classList.remove('saito-button-secondary');
        closeBtn.classList.add('saito-button-primary', 'fat');
      } else {
        closeBtn.classList.remove('saito-button-primary', 'fat');
        closeBtn.classList.add('saito-button-secondary');
      }
    }
    if (spinner) {
      spinner.hidden = !ui.showSpinner;
    }
    if (successIcon) {
      // Checkmark for eligible (standalone) and success (tokens arrived).
      successIcon.hidden = state !== 'eligible' && state !== 'success';
    }
    if (errorIcon) {
      errorIcon.hidden = state !== 'timeout';
    }

    const countdown = document.getElementById('faucet_countdown');
    if (countdown) {
      countdown.hidden = !ui.showCountdown;
    }
    if (ui.showCountdown) {
      this.startBlockCountdown();
    } else {
      this.stopBlockCountdown();
    }
  }

  updateClaimProgress(text = '') {
    // Keep phase text for internal monitoring; pending UI no longer displays it.
    this.claimMonitorPhase = text;
  }

  clearClaimMonitoring() {
    if (this.claimTimeoutId) {
      clearTimeout(this.claimTimeoutId);
      this.claimTimeoutId = null;
    }
    if (this.claimProgressIntervalId) {
      clearInterval(this.claimProgressIntervalId);
      this.claimProgressIntervalId = null;
    }
    this.stopBlockCountdown();
    this.claimStartedAt = 0;
    this.claimMonitorPhase = '';
    // DEV UI TEST — remove after faucet UI testing
    this.clearDevUiSuccessTimer();
  }

  // DEV UI TEST — remove after faucet UI testing
  clearDevUiSuccessTimer() {
    if (this.devUiSuccessTimerId) {
      clearTimeout(this.devUiSuccessTimerId);
      this.devUiSuccessTimerId = null;
    }
  }

  // DEV UI TEST — remove after faucet UI testing
  // After pending, simulate a real issuance confirmation using the existing success path.
  startDevUiSuccessTimer() {
    this.clearDevUiSuccessTimer();
    this.devUiSuccessTimerId = setTimeout(() => {
      this.devUiSuccessTimerId = null;

      const root = document.getElementById('faucet-request-container');
      if (!root || root.dataset.faucetState !== 'pending') {
        return;
      }

      // Same transition path as onConfirmation() for request === 'faucet issuance'.
      // Amount fallback: configured faucet amount (no fabricated tx / wallet credit).
      this.clearClaimMonitoring();
      this.lastIssuanceAmount = this.amount;
      this.setFaucetState('success', {
        amountLabel: `${this.app.wallet.convertNolanToSaito(this.lastIssuanceAmount)} SAITO`
      });
      this.showAcquisitionSiteMessageOnce();
    }, 10000);
  }

  startClaimMonitoring() {
    this.clearClaimMonitoring();
    this.claimStartedAt = Date.now();
    this.claimMonitorPhase =
      'Broadcasting your faucet request. Waiting for network confirmation...';

    this.claimProgressIntervalId = setInterval(() => {
      this.updateClaimProgress(this.claimMonitorPhase);
    }, 1000);

    this.claimTimeoutId = setTimeout(() => {
      const root = document.getElementById('faucet-request-container');
      if (root && root.dataset.faucetState === 'pending') {
        this.clearClaimMonitoring();
        this.setFaucetState('timeout');
      }
    }, this.claimTimeoutMs);

    this.updateClaimProgress(this.claimMonitorPhase);
    this.startBlockCountdown();
  }

  /**
   * Same “expected time to next block” countdown pattern as SaitoTransactionMonitor.
   */
  getHeartbeatIntervalMs() {
    const raw = Number(this.app?.options?.consensus?.heartbeat_interval);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 30000;
    }
    if (raw < 1000) {
      return Math.round(raw * 1000);
    }
    return Math.round(raw);
  }

  getSecondsUntilNextBlockWindow(blockWindowSeconds) {
    const lastTs = Number(this.app?.options?.blockchain?.last_timestamp || 0);
    if (!Number.isFinite(lastTs) || lastTs <= 0) {
      return blockWindowSeconds;
    }

    const elapsedSec = Math.max(0, Math.floor((Date.now() - lastTs) / 1000));
    const intoWindow = elapsedSec % blockWindowSeconds;
    if (elapsedSec > 0 && intoWindow === 0) {
      return blockWindowSeconds;
    }
    const remaining = blockWindowSeconds - intoWindow;
    return remaining > 0 ? remaining : blockWindowSeconds;
  }

  startBlockCountdown() {
    this.stopBlockCountdown();

    const heartbeatMs = this.getHeartbeatIntervalMs();
    const blockWindowSeconds = Math.max(1, Math.round((2 * heartbeatMs) / 1000));
    let seconds = this.getSecondsUntilNextBlockWindow(blockWindowSeconds);

    const renderSeconds = () => {
      const el = document.getElementById('faucet_countdown_seconds');
      if (el) {
        el.textContent = String(seconds);
      }
    };

    renderSeconds();

    this.claimCountdownIntervalId = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        seconds = blockWindowSeconds;
      }
      renderSeconds();
    }, 1000);
  }

  stopBlockCountdown() {
    if (this.claimCountdownIntervalId) {
      clearInterval(this.claimCountdownIntervalId);
      this.claimCountdownIntervalId = null;
    }
  }

  closeFaucetOverlay() {
    this.autoClaimPending = false;
    this.clearClaimMonitoring();
    if (document.querySelector('.saito-overlay #faucet-request-container')) {
      this.overlay.close();
    }
  }

  /**
   * Close Auth without treating it as user cancel (null callback first).
   * Does not modify Auth.js.
   */
  closeAuthOverlayQuietly() {
    if (!this.auth) {
      return;
    }
    this.auth.callback = null;
    if (this.auth.overlay) {
      this.auth.overlay.close();
    }
  }

  /**
   * Unwind nested acquisition overlays only:
   * Faucet claim → Auth (if open) → BuySaito.
   * Leaves the original application overlay untouched.
   */
  closeAcquisitionOverlays() {
    this.closeFaucetOverlay();
    this.closeAuthOverlayQuietly();

    try {
      const buysaito = this.app.modules.returnModule('BuySaito');
      if (buysaito?.purchase_overlay && typeof buysaito.purchase_overlay.close === 'function') {
        buysaito.purchase_overlay.close();
      }
    } catch (err) {
      console.error('FAUCET: failed to close BuySaito overlay', err);
    }
  }

  showAcquisitionSiteMessageOnce() {
    if (this.acquisitionMessageShown) {
      return;
    }
    this.acquisitionMessageShown = true;
    siteMessage('Your SAITO is now in your wallet. Please continue.', 5000);
  }

  amountReceivedFromIssuance(tx) {
    let total = 0n;
    const pk = this.publicKey;
    if (!tx?.to || !pk) {
      return this.amount;
    }
    for (const slip of tx.to) {
      if (slip.publicKey === pk) {
        try {
          total += BigInt(slip.amount || 0);
        } catch (err) {
          // ignore malformed slip amounts
        }
      }
    }
    return total > 0n ? total : this.amount;
  }

  attachEvents() {
    let btn = document.getElementById('faucet-button');
    if (btn) {
      btn.onclick = async (e) => {
        e.preventDefault();
        if (btn.disabled) {
          return;
        }
        await this.submitFaucetClaim();
      };
    }

    let closeBtn = document.getElementById('faucet-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        const root = document.getElementById('faucet-request-container');
        const state = root?.dataset?.faucetState;

        if (state === 'success') {
          this.closeAcquisitionOverlays();
          this.showAcquisitionSiteMessageOnce();
          return;
        }

        // timeout / other — exit claim overlay only
        this.closeFaucetOverlay();
      };
    }
  }

  /**
   * Create and propagate the real faucet request transaction.
   * Shared by manual Claim click and OAuth auto-submit.
   */
  async submitFaucetClaim() {
    this.autoClaimPending = false;
    this.setFaucetState('pending');
    this.startClaimMonitoring();

    // DEV UI TEST — remove after faucet UI testing
    // Skip real request tx; after 10s invoke the existing success UI path.
    if (this.dev_mode) {
      this.startDevUiSuccessTimer();
      return;
    }

    try {
      let tx = await this.createFaucetTransaction();
      this.app.network.propagateTransaction(tx);
      this.claimMonitorPhase =
        'Faucet request sent. Waiting for the transaction to be confirmed...';
      this.updateClaimProgress(this.claimMonitorPhase);
    } catch (err) {
      console.error('FAUCET: failed to create/propagate request', err);
      this.clearClaimMonitoring();
      this.setFaucetState('timeout');
    }
  }

  async onConfirmation(blk, tx, conf = 0) {
    //
    // only process the first conf
    //
    if (conf != 0) {
      return;
    }

    //
    // sanity check
    //
    if (this.hasSeenTransaction(tx, blk)) {
      return;
    }

    let txmsg = tx.returnMessage();

    if (txmsg.request === 'faucet request') {
      if (!this.app.BROWSER) {
        await this.receiveFaucetRequestTransaction(tx, blk);
      } else {
        if (tx.isFrom(this.publicKey)) {
          this.claimMonitorPhase =
            'Your faucet request is on chain. Waiting for the faucet to issue SAITO...';
          this.updateClaimProgress(this.claimMonitorPhase);
        }
      }
      return;
    }

    if (txmsg.request === 'faucet issuance') {
      if (!this.app.BROWSER) {
        // Server may also see its own issuance confirm; recording is done at
        // propagate time so the financial path is not delayed by DB work.
        return;
      }

      if (tx.isTo(this.publicKey)) {
        this.clearClaimMonitoring();
        this.lastIssuanceAmount = this.amountReceivedFromIssuance(tx);
        this.setFaucetState('success', {
          amountLabel: `${this.app.wallet.convertNolanToSaito(this.lastIssuanceAmount)} SAITO`
        });
        this.showAcquisitionSiteMessageOnce();
      }
      return;
    }
  }

  async createFaucetTransaction() {
    //
    // create the wrapper transaction
    //
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
    newtx.msg = {
      module: 'Faucet',
      request: 'faucet request'
    };
    await newtx.sign();
    return newtx;
  }

  async receiveFaucetRequestTransaction(tx = null, blk = null) {
    //
    // sanity check transaction is valid
    //
    if (tx == null || blk == null) {
      return;
    }

    let receiver = tx.from[0].publicKey;

    // Authoritative eligibility: registrations.issuance_status (not in-memory rate limit).
    // Atomically claim eligible → pending before any payout work.
    const began = await this.beginIssuance(receiver);
    if (!began) {
      console.log(
        'FAUCET: refusing payout — no eligible registration for ' + receiver
      );
      return;
    }

    try {
      let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
        receiver,
        this.amount
      );
      newtx.msg = {
        module: 'Faucet',
        request: 'faucet issuance'
      };
      await newtx.sign();
      this.app.network.propagateTransaction(newtx);

      // Payout propagated — permanently mark issued on the same registration row.
      const completed = await this.completeIssuance({
        publickey: receiver,
        amount: this.amount.toString(),
        tx_signature: newtx.signature,
        issued_at: Date.now()
      });

      if (!completed) {
        console.error(
          'FAUCET: issuance propagated but failed to mark registration issued for ' +
            receiver +
            ' sig=' +
            newtx.signature
        );
      }
    } catch (err) {
      console.error('FAUCET: payout failed after pending claim; reverting to eligible', err);
      await this.revertIssuanceToEligible(receiver);
    }
  }

  /**
   * Ensure the single registrations table exists and remove obsolete empty
   * identity / auth / claim / issuance tables from earlier schema drafts.
   */
  async ensureRegistrationsSchema() {
    try {
      const filesystem = this.app.storage.returnFileSystem();
      if (!filesystem) {
        return;
      }
      const sqlPath = `${__dirname}/sql/01_registrations.sql`;
      if (!filesystem.existsSync(sqlPath)) {
        return;
      }
      const data = filesystem.readFileSync(sqlPath, 'utf8');
      await this.app.storage.executeDatabase(data, this.returnSlug());

      // Development DBs may still contain empty obsolete tables from the
      // four-table draft. Drop them so registrations is the only Faucet table.
      await this.app.storage.executeDatabase(
        `DROP TABLE IF EXISTS claims;
         DROP TABLE IF EXISTS auth_requests;
         DROP TABLE IF EXISTS identities;
         DROP TABLE IF EXISTS issuances;`,
        this.returnSlug()
      );
    } catch (err) {
      console.error('FAUCET: ensureRegistrationsSchema failed', err);
    }
  }

  faucetDb() {
    return this.returnSlug();
  }

  /**
   * Look up the single registration row for a Saito public key.
   * @returns {object|null}
   */
  async getRegistration(publickey = '') {
    if (this.app.BROWSER) {
      return null;
    }
    const pk = String(publickey || '').trim();
    if (!pk) {
      return null;
    }
    const rows = await this.app.storage.queryDatabase(
      `SELECT * FROM registrations WHERE publickey = $publickey LIMIT 1`,
      { $publickey: pk },
      this.faucetDb()
    );
    return rows?.[0] || null;
  }

  /**
   * Create a Faucet registration after verified OAuth (future callback path).
   * UNIQUE(publickey) prevents duplicate registration for the same key.
   * Does not store OAuth tokens. Returns the row, or existing row if already present.
   */
  async createRegistration({
    publickey = '',
    provider = '',
    provider_user_id = '',
    provider_username = '',
    provider_display_name = '',
    provider_account_created_at = 0,
    authenticated_at = 0
  } = {}) {
    if (this.app.BROWSER) {
      return null;
    }

    const pk = String(publickey || '').trim();
    const prov = String(provider || '').trim();
    const puid = String(provider_user_id || '').trim();
    if (!pk || !prov || !puid) {
      console.error('FAUCET: createRegistration missing publickey/provider/provider_user_id');
      return null;
    }

    const existing = await this.getRegistration(pk);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const authAt = Number(authenticated_at) || now;
    const sql = `INSERT INTO registrations (
                   publickey,
                   provider,
                   provider_user_id,
                   provider_username,
                   provider_display_name,
                   provider_account_created_at,
                   authenticated_at,
                   issuance_status,
                   issuance_amount,
                   issuance_tx_signature,
                   issued_at,
                   created_at,
                   updated_at)
                 VALUES (
                   $publickey,
                   $provider,
                   $provider_user_id,
                   $provider_username,
                   $provider_display_name,
                   $provider_account_created_at,
                   $authenticated_at,
                   'eligible',
                   '',
                   '',
                   0,
                   $created_at,
                   $updated_at)`;

    try {
      await this.app.storage.runDatabase(
        sql,
        {
          $publickey: pk,
          $provider: prov,
          $provider_user_id: puid,
          $provider_username: String(provider_username || ''),
          $provider_display_name: String(provider_display_name || ''),
          $provider_account_created_at: Number(provider_account_created_at) || 0,
          $authenticated_at: authAt,
          $created_at: now,
          $updated_at: now
        },
        this.faucetDb()
      );
    } catch (err) {
      // Concurrent insert on same publickey — return the winner.
      console.log('FAUCET: createRegistration insert raced or failed', err);
    }

    return await this.getRegistration(pk);
  }

  /**
   * Atomically claim the one-time issuance slot: eligible → pending.
   * Returns true only if this caller won the transition (changes === 1).
   * Rejects missing registration, already-pending, and already-issued keys.
   */
  async beginIssuance(publickey = '') {
    if (this.app.BROWSER) {
      return false;
    }

    const pk = String(publickey || '').trim();
    if (!pk) {
      return false;
    }

    const now = Date.now();
    const res = await this.app.storage.runDatabase(
      `UPDATE registrations
         SET issuance_status = 'pending',
             updated_at = $updated_at
       WHERE publickey = $publickey
         AND issuance_status = 'eligible'`,
      {
        $publickey: pk,
        $updated_at: now
      },
      this.faucetDb()
    );

    return Number(res?.changes || 0) === 1;
  }

  /**
   * After a payout transaction has been propagated: pending → issued.
   * Records amount and tx signature on the same registration row.
   */
  async completeIssuance({ publickey, amount, tx_signature, issued_at } = {}) {
    if (this.app.BROWSER) {
      return false;
    }

    const pk = String(publickey || '').trim();
    const sig = String(tx_signature || '').trim();
    if (!pk || !sig) {
      console.error('FAUCET: completeIssuance missing publickey or tx_signature');
      return false;
    }

    const now = Date.now();
    const res = await this.app.storage.runDatabase(
      `UPDATE registrations
         SET issuance_status = 'issued',
             issuance_amount = $issuance_amount,
             issuance_tx_signature = $issuance_tx_signature,
             issued_at = $issued_at,
             updated_at = $updated_at
       WHERE publickey = $publickey
         AND issuance_status = 'pending'`,
      {
        $publickey: pk,
        $issuance_amount: String(amount ?? this.amount.toString()),
        $issuance_tx_signature: sig,
        $issued_at: Number(issued_at) || now,
        $updated_at: now
      },
      this.faucetDb()
    );

    return Number(res?.changes || 0) === 1;
  }

  /**
   * If payout creation/propagation fails before send, return pending → eligible
   * so the user may try again. Never call after a successful propagate.
   */
  async revertIssuanceToEligible(publickey = '') {
    if (this.app.BROWSER) {
      return false;
    }

    const pk = String(publickey || '').trim();
    if (!pk) {
      return false;
    }

    const now = Date.now();
    const res = await this.app.storage.runDatabase(
      `UPDATE registrations
         SET issuance_status = 'eligible',
             updated_at = $updated_at
       WHERE publickey = $publickey
         AND issuance_status = 'pending'`,
      {
        $publickey: pk,
        $updated_at: now
      },
      this.faucetDb()
    );

    return Number(res?.changes || 0) === 1;
  }

  /**
   * True when this public key has already received its one-time allocation.
   */
  async hasReceivedIssuance(publickey = '') {
    const row = await this.getRegistration(publickey);
    return row?.issuance_status === 'issued';
  }

  /**
   * Browser receives off-chain peer messages here.
   * OAuth success bridges into the existing Faucet claim overlay (no alert).
   */
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

    if (txmsg?.request === 'faucet-oauth-result') {
      if (this.app.BROWSER) {
        const data = txmsg.data && typeof txmsg.data === 'object' ? txmsg.data : {};
        const alreadyIssued = !!data.already_issued;

        if (alreadyIssued) {
          // Stay on Get SAITO; replace green card with already-issued notice.
          this.showAlreadyIssuedOnGetSaito();
          return 1;
        }

        // Registration succeeded → close Get SAITO registration UI, open claim overlay.
        this.dismissGetSaitoRegistrationUi();
        this.openFaucetOverlay({ autoClaim: true });
        return 1;
      }
      return 0;
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  /**
   * Browser path for a provider's OAuth initiation page (Faucet-owned, no Saito).
   * Production will redirect from this route to the provider authorize URL.
   */
  returnOAuthInitiatePath(provider = '') {
    const id = String(provider || '')
      .trim()
      .toLowerCase();
    if (id === 'github') {
      return `/${encodeURI(this.returnSlug())}/oauth/github`;
    }
    return null;
  }

  /**
   * TEMP OAUTH CONFIG — runtime client secret for token exchange.
   * Prefer these in-memory values; do not log or return them.
   */
  getOAuthClientSecret(provider = '') {
    const id = String(provider || '')
      .trim()
      .toLowerCase();
    if (id === 'github') {
      return this.oauth_secret_github || null;
    }
    if (id === 'twitter' || id === 'x') {
      return this.oauth_secret_twitter || null;
    }
    return null;
  }

  /** TEMP OAUTH CONFIG — constant-time compare for the config gate key. */
  oauthConfigKeyMatches(submitted = '') {
    const expected = String(this.oauth_config_key || '');
    const got = String(submitted || '');
    if (!expected || got.length !== expected.length) {
      return false;
    }
    try {
      return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    } catch (err) {
      return false;
    }
  }

  webServer(app, expressapp, express) {
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let faucet_self = this;
    const slug = encodeURI(this.returnSlug());

    // BEGIN TEMP_OAUTH_CONFIG — browser form to set in-memory OAuth client secrets.
    // Protect with oauth_config_key. Never echo secrets. Remove with constructor block.
    const renderOAuthConfigPage = (opts = {}) =>
      OAuthConfigTemplate({
        githubConfigured: !!faucet_self.oauth_secret_github,
        twitterConfigured: !!faucet_self.oauth_secret_twitter,
        ...opts
      });

    expressapp.get(`/${slug}/oauth/config`, (req, res) => {
      if (res.finished) {
        return;
      }
      res.setHeader('Content-type', 'text/html; charset=UTF-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(renderOAuthConfigPage());
    });

    expressapp.post(`/${slug}/oauth/config`, (req, res) => {
      if (res.finished) {
        return;
      }

      res.setHeader('Content-type', 'text/html; charset=UTF-8');
      res.setHeader('Cache-Control', 'no-store');

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const configKey = String(body.config_key || '');
      if (!faucet_self.oauthConfigKeyMatches(configKey)) {
        res.status(403);
        return res.send(
          renderOAuthConfigPage({
            error: 'Invalid config key. Secrets were not updated.'
          })
        );
      }

      // Only overwrite when a non-empty value is submitted (partial updates).
      const githubSecret = String(body.github_secret || '');
      const twitterSecret = String(body.twitter_secret || '');
      if (githubSecret) {
        faucet_self.oauth_secret_github = githubSecret;
      }
      if (twitterSecret) {
        faucet_self.oauth_secret_twitter = twitterSecret;
      }

      console.log(
        'FAUCET OAUTH CONFIG: updated — GitHub:',
        faucet_self.oauth_secret_github ? 'configured' : 'not set',
        '| X:',
        faucet_self.oauth_secret_twitter ? 'configured' : 'not set'
      );

      return res.send(renderOAuthConfigPage({ saved: true }));
    });
    // END TEMP_OAUTH_CONFIG

    // Plain HTML OAuth initiation page — must NOT load Saito.
    // Register before the /faucet Saito app route and static assets.
    expressapp.get(`/${slug}/oauth/github`, (req, res) => {
      if (res.finished) {
        return;
      }

      const publickey = String(req.query?.publickey || '').trim();
      const baseUrl = `${req.protocol}://${req.headers.host}`;
      const callbackUrl = publickey
        ? `${baseUrl}/${slug}/oauth?publickey=${encodeURIComponent(publickey)}`
        : `${baseUrl}/${slug}/oauth`;

      res.setHeader('Content-type', 'text/html; charset=UTF-8');
      return res.send(
        OAuthGithubInitiateTemplate({
          publickey,
          callbackUrl
        })
      );
    });

    // Temporary local OAuth-callback test route.
    // Production will use OAuth state instead of a publickey query param.
    expressapp.get(`/${slug}/oauth`, async (req, res) => {
      if (res.finished) {
        return;
      }

      console.log('========================================');
      console.log('FAUCET OAUTH CALLBACK');
      console.log('========================================');

      const publickey = String(req.query?.publickey || '').trim();
      console.log('Public Key: ' + (publickey || '(missing)'));
      console.log('========================================');

      if (!publickey) {
        console.log('FAUCET OAUTH: missing public key');
        res.status(400);
        res.setHeader('Content-type', 'text/plain; charset=UTF-8');
        return res.send('SAITO Faucet OAuth callback error: missing public key.');
      }

      console.log('FAUCET OAUTH: searching for connected peer ' + publickey);

      try {
        let peer = await faucet_self.app.network.getPeer(publickey);

        if (!peer?.publicKey) {
          const peers = await faucet_self.app.network.getPeers();
          peer = peers.find(
            (p) => p?.publicKey === publickey && p?.status !== 'disconnected'
          );
        }

        if (!peer?.publicKey) {
          console.log('FAUCET OAUTH: NO CONNECTED PEER FOUND ' + publickey);
          res.status(404);
          res.setHeader('Content-type', 'text/plain; charset=UTF-8');
          return res.send(
            'SAITO Faucet OAuth callback: no connected SAITO client found for that public key.'
          );
        }

        console.log('FAUCET OAUTH: FOUND PEER ' + peer.publicKey);

        // Look up / create registration so the subsequent claim path can issue.
        // Real OAuth verification still belongs to the provider integration task;
        // this test callback only ensures a registration row exists when needed.
        let registration = await faucet_self.getRegistration(publickey);
        if (!registration) {
          registration = await faucet_self.createRegistration({
            publickey,
            provider: 'github',
            provider_user_id: `oauth-test:${publickey}`,
            provider_username: '',
            provider_display_name: '',
            authenticated_at: Date.now()
          });
        }

        const issuance_status = registration?.issuance_status || null;
        const already_issued = issuance_status === 'issued';

        await faucet_self.app.network.sendRequestAsTransaction(
          'faucet-oauth-result',
          {
            success: true,
            message: already_issued
              ? 'This Saito public key has already received its Faucet allocation.'
              : 'Faucet OAuth callback received successfully.',
            publickey: publickey,
            issuance_status: issuance_status,
            already_issued: already_issued
          },
          null,
          peer.publicKey
        );

        res.status(200);
        res.setHeader('Content-type', 'text/plain; charset=UTF-8');
        return res.send(
          already_issued
            ? 'SAITO Faucet: public key already issued.'
            : 'SAITO Faucet OAuth callback received.'
        );
      } catch (err) {
        console.log('FAUCET OAUTH: failed to notify peer', err);
        res.status(500);
        res.setHeader('Content-type', 'text/plain; charset=UTF-8');
        return res.send(
          'SAITO Faucet OAuth callback error: failed to notify SAITO client.'
        );
      }
    });

    expressapp.get('/' + slug, async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

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
