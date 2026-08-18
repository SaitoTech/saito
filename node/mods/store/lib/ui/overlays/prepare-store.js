const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PrepareStoreTemplate = require('./prepare-store.template');
const { isSellableNftType, isVaultRentalNftType } = require('../../categories');

const PREPARE_MS = 1300;
const STATUS_MS = 250;
const POLL_MS = 3500;
const STATUS_MESSAGES = [
  'Checking store URL',
  'Verifying public key',
  'Preparing your store',
  'Checking availability',
  'Finalizing store configuration'
];

class PrepareStoreOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.defaults = {};
    this.has_nfts = false;
    this.has_tokens = false;
    this.wizard_state = 1;
    this.wizard_key = '';
    this.status_timer = null;
    this.poll_timer = null;
    this.prepare_token = 0;
    this.faucet_option = null;
    this.upload_action = null;
    this.onContinue = null;
    this.onCreateNft = null;
  }

  render(defaults = {}) {
    this.defaults = defaults || {};
    this.has_nfts = false;
    this.has_tokens = false;
    this.wizard_state = 1;
    this.wizard_key = '';
    this.faucet_option = null;
    this.upload_action = null;
    this.stopPreparation();
    this.stopPolling();

    this.overlay.show(PrepareStoreTemplate.overlay(), () => {
      this.stopPreparation();
      this.stopPolling();
    });

    this.startPreparation();
  }

  stopPreparation() {
    this.prepare_token += 1;
    if (this.status_timer) {
      clearInterval(this.status_timer);
      this.status_timer = null;
    }
  }

  stopPolling() {
    if (this.poll_timer) {
      clearInterval(this.poll_timer);
      this.poll_timer = null;
    }
  }

  startPreparation() {
    const token = ++this.prepare_token;
    let index = 0;
    this.setStatus(STATUS_MESSAGES[0]);

    this.status_timer = setInterval(() => {
      if (token !== this.prepare_token) {
        return;
      }
      index += 1;
      if (index < STATUS_MESSAGES.length) {
        this.setStatus(STATUS_MESSAGES[index]);
      }
    }, STATUS_MS);

    Promise.all([this.refreshWalletState(), this.publishStorefrontLink(), this.wait(PREPARE_MS)])
      .then(() => {
        if (token !== this.prepare_token) {
          return;
        }
        this.showReady();
      })
      .catch((err) => {
        console.warn('Store: prepare overlay failed', err?.message || err);
        if (token !== this.prepare_token) {
          return;
        }
        this.showReady();
      });
  }

  wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }

  setStatus(text = '') {
    const el = document.querySelector('.prepare-store [data-prepare-status]');
    if (!el) {
      return;
    }
    el.classList.add('is-exit');
    setTimeout(() => {
      el.textContent = text;
      el.classList.remove('is-exit');
    }, 120);
  }

  async refreshWalletState() {
    await Promise.all([this.loadWalletNfts(), this.loadWalletTokens()]);
    if (this.has_nfts) {
      this.wizard_state = 3;
      return;
    }
    this.wizard_state = this.has_tokens ? 2 : 1;
  }

  /**
   * Wallet NFT list — same source the NFT picker uses.
   */
  async loadWalletNfts() {
    if (typeof this.app.wallet?.updateNFTList === 'function') {
      await this.app.wallet.updateNFTList();
    }
    const nft_list = this.app.options?.wallet?.nfts || [];
    this.has_nfts = nft_list.some((rec) => {
      let nft_type = '';
      try {
        nft_type = this.app.wallet.extractNFTType(rec?.slip3?.utxo_key || '') || '';
      } catch (err) {
        nft_type = '';
      }
      return isSellableNftType(nft_type) || isVaultRentalNftType(nft_type);
    });
  }

  async loadWalletTokens() {
    try {
      const balance = await this.app.wallet.getBalance();
      this.has_tokens = typeof balance === 'bigint' ? balance > 0n : Number(balance) > 0;
    } catch (err) {
      this.has_tokens = false;
    }
  }

  /**
   * Existing store-creation side effect: publish the storefront URL to Profile.
   */
  async publishStorefrontLink() {
    if (!this.mod.publicKey || typeof this.mod.updateProfile !== 'function') {
      return;
    }
    const url = this.mod.returnStorefrontUrl?.(this.mod.publicKey);
    if (!url) {
      return;
    }
    if (this.mod.returnProfileStoreUrl?.() === url) {
      return;
    }
    await this.mod.updateProfile(url);
    this.app.connection.emit('store-profile-link-updated');
  }

  showReady() {
    this.stopPreparation();

    const root = document.querySelector('.prepare-store');
    const title = document.querySelector('.prepare-store [data-prepare-title]');
    const lede = document.querySelector('.prepare-store [data-prepare-lede]');
    const preparing = document.querySelector('.prepare-store .preparing-panel');
    const ready = document.querySelector('.prepare-store .ready-panel');
    if (!root || !ready) {
      return;
    }

    if (title) {
      title.textContent = 'Your Store is Ready!';
    }
    if (lede) {
      lede.hidden = false;
    }
    this.app.connection.emit('store-profile-link-updated');
    this.renderReadyPanel();

    preparing?.classList.add('is-exit');
    window.setTimeout(() => {
      if (!document.querySelector('.prepare-store')) {
        return;
      }
      if (preparing) {
        preparing.hidden = true;
        preparing.classList.remove('is-exit');
      }
      ready.hidden = false;
      root.classList.remove('preparing');
      root.classList.add('ready');
      this.startPolling();
    }, 180);
  }

  renderReadyPanel() {
    const ready = document.querySelector('.prepare-store .ready-panel');
    if (!ready) {
      return;
    }

    const actions = this.returnAvailableActions();
    const store_url = this.mod.returnStorefrontUrl?.(this.mod.publicKey) || '';
    const key = this.returnViewKey(this.wizard_state, actions, store_url);
    if (key === this.wizard_key && ready.innerHTML.trim()) {
      return;
    }

    this.wizard_key = key;
    ready.innerHTML = PrepareStoreTemplate.ready({
      state: this.wizard_state,
      actions,
      store_url
    });
    this.attachReadyEvents();
  }

  returnViewKey(state, actions = {}, store_url = '') {
    return [
      state,
      actions.get_saito ? 1 : 0,
      actions.faucet ? 1 : 0,
      actions.create_nft ? 1 : 0,
      actions.upload_media ? 1 : 0,
      actions.list_item ? 1 : 0,
      actions.visit_admin ? 1 : 0,
      store_url
    ].join('|');
  }

  /**
   * Discover optional actions through respondTo / existing connection events.
   * Missing modules simply omit their action.
   */
  returnAvailableActions() {
    const actions = {
      get_saito: false,
      faucet: false,
      create_nft: false,
      upload_media: false,
      list_item: false,
      visit_admin: false
    };

    this.faucet_option = null;
    this.upload_action = null;

    if (
      typeof this.app.connection?.listenerCount === 'function' &&
      this.app.connection.listenerCount('saito-purchase-launch') > 0
    ) {
      actions.get_saito = true;
    }

    const faucet = (this.app.modules.getRespondTos?.('buysaito-options') || []).find(
      (item) => item?.available && typeof item.beginProviderAuth === 'function'
    );
    if (faucet) {
      this.faucet_option = faucet;
      actions.faucet = true;
    }

    if (
      typeof this.onCreateNft === 'function' ||
      (typeof this.app.connection?.listenerCount === 'function' &&
        this.app.connection.listenerCount('saito-nft-create-render-request') > 0)
    ) {
      actions.create_nft = true;
    }

    const upload = (this.app.modules.getRespondTos?.('redsquare-create') || []).find(
      (item) => item?.id === 'vault-share' && typeof item.callback === 'function'
    );
    if (upload) {
      this.upload_action = upload;
      actions.upload_media = true;
    }

    if (typeof this.onContinue === 'function') {
      actions.list_item = true;
    }

    if (
      typeof this.mod.main?.openStorefront === 'function' ||
      typeof this.mod.returnAdminPath === 'function'
    ) {
      actions.visit_admin = true;
    }

    return actions;
  }

  startPolling() {
    this.stopPolling();
    if (this.wizard_state === 3) {
      return;
    }
    this.poll_timer = setInterval(() => {
      void this.pollWalletState();
    }, POLL_MS);
  }

  async pollWalletState() {
    if (!document.querySelector('.prepare-store.ready')) {
      this.stopPolling();
      return;
    }

    await this.refreshWalletState();
    if (!document.querySelector('.prepare-store.ready')) {
      this.stopPolling();
      return;
    }

    this.renderReadyPanel();

    if (this.wizard_state === 3) {
      this.stopPolling();
    }
  }

  attachReadyEvents() {
    const root = document.querySelector('.prepare-store');
    if (!root) {
      return;
    }

    const bind = (action, handler) => {
      root.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
        el.onclick = (e) => {
          e.preventDefault();
          handler();
        };
        if (el.tagName === 'A' || el.getAttribute('role') === 'button') {
          el.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handler();
            }
          };
        }
      });
    };

    bind('get-saito', () => this.openGetSaito());
    bind('faucet', () => this.openFaucet());
    bind('create-nft', () => this.openCreateNft());
    bind('upload-media', () => this.openUploadMedia());
    bind('list-item', () => this.openListItem());
    bind('visit-admin', () => this.openStoreAdmin());
    bind('copy-url', () => this.copyStoreUrl());
  }

  openGetSaito() {
    this.app.connection.emit('saito-purchase-launch');
  }

  openFaucet() {
    const faucet = this.faucet_option;
    if (!faucet || typeof faucet.beginProviderAuth !== 'function') {
      return;
    }
    const provider = faucet.providers?.[0]?.id || 'free_use';
    faucet.beginProviderAuth(provider);
  }

  openCreateNft() {
    if (typeof this.onCreateNft === 'function') {
      this.onCreateNft(this.defaults);
      return;
    }
    this.app.connection.emit('saito-nft-create-render-request', this.defaults);
  }

  openUploadMedia() {
    if (typeof this.upload_action?.callback === 'function') {
      this.upload_action.callback(this.app, this.mod);
    }
  }

  openListItem() {
    this.overlay.close();
    if (typeof this.onContinue === 'function') {
      this.onContinue(this.defaults);
    }
  }

  openStoreAdmin() {
    this.overlay.close();
    if (typeof this.mod.main?.openStorefront === 'function' && this.mod.publicKey) {
      void this.mod.main.openStorefront(this.mod.publicKey, { admin: true });
      return;
    }
    const path = this.mod.returnAdminPath?.(this.mod.publicKey);
    if (path && typeof navigateWindow === 'function') {
      navigateWindow(path);
    }
  }

  async copyStoreUrl() {
    const root = document.querySelector('.prepare-store');
    const urlEl = root?.querySelector('[data-storefront-url]');
    const raw = (
      urlEl?.getAttribute('href') ||
      urlEl?.textContent ||
      this.mod.returnStorefrontUrl?.(this.mod.publicKey) ||
      ''
    ).trim();
    if (!raw) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(raw);
      } else {
        const input = document.createElement('input');
        input.value = raw;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      if (typeof siteMessage === 'function') {
        siteMessage('Storefront URL copied', 1500);
      }
    } catch (err) {
      console.warn('Store: copy storefront URL failed', err?.message || err);
    }
  }
}

module.exports = PrepareStoreOverlay;
