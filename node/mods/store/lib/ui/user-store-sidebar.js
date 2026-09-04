const UserStoreNavTemplate = require('./user-store-sidebar.template');
const SaitoProfile = require('../../../../lib/saito/ui/saito-profile/saito-profile');

const INSECURE_SEND_CONFIRM =
  'You have not yet created a secure key for encrypting communications with this seller. This normally takes a minute or two if the seller is online, or longer if they are offline. Until this process is finished any message you send to this seller will be publicly-visible by default.';

/**
 * User-store profile context: shared SaitoProfile (read-only) with Store nav
 * injected into the profile card footer slot, plus Store-owned attribution
 * below the card (outside SaitoProfile).
 *
 * Footer follows the Red Square pattern: host owns the slot; Chat/Encrypt are
 * invoked only via connection events + keychain (no hard module APIs).
 */
class UserStoreSidebar {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.publicKey = '';
    this.profile = new SaitoProfile(app, mod, '');
    // Public storefront is always read-only (no camera / pencil).
    this.profile.editable = false;
    /** @type {Set<string>} optimistic Add Contact clicks before keychain catches up */
    this._contact_started = new Set();
    this._encrypt_confirm_bound = false;
  }

  hasChat() {
    return Boolean(this.app.modules?.returnModuleBySlug?.('chat'));
  }

  hasEncrypt() {
    return Boolean(this.app.modules?.returnModuleBySlug?.('encrypt'));
  }

  isOwnStore(publicKey = this.publicKey) {
    return Boolean(publicKey && this.mod.publicKey && publicKey === this.mod.publicKey);
  }

  isPendingKeyExchange(publicKey = this.publicKey) {
    const key = this.app.keychain?.returnKey?.(publicKey, true);
    if (!key) {
      return false;
    }
    return Boolean((key.aes_privatekey || key.aes_publicKey) && !key.aes_secret);
  }

  hasSecureChannel(publicKey = this.publicKey) {
    return Boolean(this.app.keychain?.hasSharedSecret?.(publicKey));
  }

  /**
   * @returns {{ action: string, state: string, label: string, icon: string } | null}
   */
  returnContactItem(publicKey = this.publicKey) {
    const key = String(publicKey || '').trim();
    if (!key || !this.hasChat() || this.isOwnStore(key)) {
      return null;
    }

    if (this.hasSecureChannel(key)) {
      return {
        action: 'send-message',
        state: 'secure',
        label: 'Send Message',
        icon: 'fa-solid fa-lock'
      };
    }

    const started =
      this._contact_started.has(key) || this.isPendingKeyExchange(key);

    if (started || !this.hasEncrypt()) {
      return {
        action: 'send-message',
        state: 'insecure',
        label: 'Send Message',
        icon: 'fa-solid fa-lock-open'
      };
    }

    return {
      action: 'add-contact',
      state: 'add',
      label: 'Add Contact',
      icon: 'fa-solid fa-user-lock'
    };
  }

  /** Canonical marketplace path — same slug routing as Store header / setBrowseUrl. */
  marketplacePath() {
    return `/${encodeURI(this.mod.returnSlug?.() || 'store')}`;
  }

  openMarketplace(e) {
    if (e) {
      e.preventDefault();
    }
    const path = this.marketplacePath();
    if (typeof navigateWindow === 'function') {
      navigateWindow(path);
    } else {
      window.location.assign(path);
    }
  }

  openChat(publicKey = this.publicKey) {
    const key = String(publicKey || '').trim();
    if (!key || !this.hasChat()) {
      return;
    }
    // ChatManager owns the open-chat-with listener; create it if needed
    // (same side-effect Chat's user-menu uses before emitting).
    this.app.modules.returnFirstRespondTo('chat-manager');
    this.app.connection.emit('open-chat-with', {
      key,
      activate: true
    });
  }

  ensureEncryptConfirmListener() {
    if (this._encrypt_confirm_bound) {
      return;
    }
    this._encrypt_confirm_bound = true;

    this.app.connection.on('encrypt-key-exchange-confirm', (data) => {
      const members = Array.isArray(data?.members) ? data.members : [];
      const key = String(this.publicKey || '').trim();
      if (!key || !members.includes(key)) {
        return;
      }
      this._contact_started.delete(key);
      this.renderContactNav();
    });
  }

  renderContactNav() {
    const footer = this.profile.getFooterEl();
    if (!footer) {
      return;
    }

    footer.innerHTML = UserStoreNavTemplate(this.returnContactItem(this.publicKey));
    this.attachContactEvents();
  }

  render(container = '', publicKey = '') {
    if (container) {
      this.container = container;
    }

    const key = String(publicKey || this.publicKey || '').trim();
    if (!this.container || !key) {
      return;
    }

    this.publicKey = key;
    this.ensureEncryptConfirmListener();

    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    const marketPath = this.marketplacePath();

    root.innerHTML = `
      <div class="user-store-profile"></div>
      <p class="user-store-attribution">
        Listings indexed on the
        <a href="${marketPath}" data-store-attribution="marketplace">Saito Store</a>
      </p>
    `;

    this.profile.editable = false;
    this.profile.container = `${this.container} .user-store-profile`;
    this.profile.reset(key);
    this.profile.editable = false;
    this.profile.render();

    this.renderContactNav();
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(this.container);
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-store-attribution="marketplace"]').forEach((link) => {
      link.onclick = (e) => this.openMarketplace(e);
    });

    this.attachContactEvents();
  }

  attachContactEvents() {
    const footer = this.profile.getFooterEl();
    if (!footer) {
      return;
    }

    footer.querySelectorAll('.user-store-nav .item[data-contact-action]').forEach((item) => {
      item.onclick = (e) => {
        e.preventDefault();
        void this.activateContact(item.getAttribute('data-contact-action') || '');
      };
      item.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void this.activateContact(item.getAttribute('data-contact-action') || '');
        }
      };
    });
  }

  async activateContact(action = '') {
    const key = String(this.publicKey || '').trim();
    if (!key || this.isOwnStore(key) || !this.hasChat()) {
      return;
    }

    if (action === 'add-contact') {
      this._contact_started.add(key);
      this.app.connection.emit('encrypt-key-exchange', key);
      this.renderContactNav();
      return;
    }

    if (action !== 'send-message') {
      return;
    }

    if (this.hasSecureChannel(key)) {
      this.openChat(key);
      return;
    }

    let confirmed = true;
    if (typeof sconfirm === 'function') {
      confirmed = await sconfirm(INSECURE_SEND_CONFIRM);
    }
    if (!confirmed) {
      return;
    }
    this.openChat(key);
  }
}

module.exports = UserStoreSidebar;
