const chatMenuTemplate = require('./chat-manager-menu.template');
const ContactsList = require('./../../../../lib/saito/ui/modals/saito-contacts/saito-contacts');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ChatList = require('./chat-list');
const ChatUserMenu = require('./chat-user-menu');

const EXCLUDED_KEY_TYPES = new Set(['group', 'event', 'scheduled_call']);

class ChatManagerMenu {
  constructor(app, mod, container = null, showCreationActions = !container) {
    this.app = app;
    this.mod = mod;

    this.container = container;
    this.usesOverlay = !container;
    this.showCreationActions = showCreationActions;

    this.contactList = new ContactsList(app, mod, true);
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.chatList = new ChatList(app, mod);
    this.chatList.callback = (gid) => {
      let chatMenu = new ChatUserMenu(this.app, this.mod, this.mod.returnGroup(gid));
      chatMenu.render();
    };

    this.selectedPublicKey = null;
    this.searchQuery = '';
    this._onKeychainUpdated = null;
    this._detailOptionCallbacks = {};
  }

  async render() {
    if (!this.container) {
      // Title lives inside each sliding stage — not a stationary overlay > h2.
      this.overlay.show(`<div class="module-settings-overlay"></div>`);
      this.container = '.module-settings-overlay';
    } else {
      // Remove any leftover outer title so it cannot sit outside the slider.
      const title = document.querySelector(`${this.container} > h2`);
      if (title) {
        title.remove();
      }
    }

    const container = document.querySelector(this.container);
    const settings = container?.querySelector('.saito-module-settings');
    const html = chatMenuTemplate(this.app, this.mod);

    if (settings) {
      settings.outerHTML = html;
    } else {
      this.app.browser.addElementToSelector(html, this.container);
    }

    this.renderContactList();
    if (this.selectedPublicKey) {
      this.showDetail(this.selectedPublicKey, false);
    } else {
      this.showHome(false);
    }

    this.attachEvents();
  }

  returnDirectoryKeys() {
    return this.app.keychain.returnKeys().filter((key) => {
      if (!key?.publicKey) {
        return false;
      }
      if (EXCLUDED_KEY_TYPES.has(key.type)) {
        return false;
      }
      // Legacy group marker (migrated to type on next keychain load).
      if (key.group) {
        return false;
      }
      return true;
    });
  }

  isBlocked(publicKey) {
    return Array.isArray(this.mod.black_list) && this.mod.black_list.includes(publicKey);
  }

  truncatePublicKey(publicKey = '', max = 20) {
    const key = String(publicKey);
    if (key.length <= max) {
      return key;
    }
    return `${key.slice(0, Math.max(6, Math.floor(max / 2) - 1))}…${key.slice(-(Math.floor(max / 2) - 1))}`;
  }

  escapeHtml(value = '') {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return '';
    }
    return this.app.browser.escapeHTML(String(value));
  }

  /**
   * Local display name for a contact public key.
   *
   * Keychain stores aliases on `identifier`; returnUsername() reads that field.
   * Only a non-empty string identifier is treated as a usable alias. Booleans
   * (and the historical string "false" from sprompt cancel → String(false))
   * are not names — fall through to the established Anon-xxxxxx fallback.
   */
  contactDisplayName(publicKey) {
    const key = this.app.keychain.returnKey(publicKey);
    const identifier = key?.identifier;

    if (typeof identifier === 'string') {
      const trimmed = identifier.trim();
      // "false" is the known corruption from String(boolean false) on cancel.
      if (trimmed && trimmed !== 'false') {
        return trimmed;
      }
    }

    const pk = String(publicKey || '');
    if (pk.length > 12) {
      return 'Anon-' + pk.substring(0, 6);
    }
    return pk;
  }

  matchesSearch(key, query) {
    if (!query) {
      return true;
    }
    const q = query.toLowerCase();
    const username = this.contactDisplayName(key.publicKey).toLowerCase();
    const identifier = typeof key.identifier === 'string' ? key.identifier.toLowerCase() : '';
    const publicKey = String(key.publicKey || '').toLowerCase();
    return username.includes(q) || identifier.includes(q) || publicKey.includes(q);
  }

  rootEl() {
    return document.querySelector(`${this.container} .chat-settings`);
  }

  setStage(stage, animate = true) {
    const root = this.rootEl();
    if (!root) {
      return;
    }
    if (!animate) {
      root.classList.add('chat-settings-no-anim');
    }
    root.dataset.chatSettingsStage = stage;
    if (!animate) {
      void root.offsetWidth;
      root.classList.remove('chat-settings-no-anim');
    }

    const home = root.querySelector('[data-chat-settings-view="home"]');
    const detail = root.querySelector('[data-chat-settings-view="detail"]');
    if (home) {
      home.setAttribute('aria-hidden', stage === 'home' ? 'false' : 'true');
    }
    if (detail) {
      detail.setAttribute('aria-hidden', stage === 'detail' ? 'false' : 'true');
    }
  }

  /**
   * Collect optional-module contact actions via respondTo('user-menu').
   * Remap known module labels to the Contacts copy requested for this UI.
   */
  returnExternalContactOptions(publicKey) {
    const mods = this.app.modules.returnModulesRespondingTo('user-menu', { publicKey }) || [];
    const options = [];

    for (const am of mods) {
      if (am.returnName?.() === this.mod.returnName?.()) {
        continue;
      }
      let item = am.respondTo('user-menu', { publicKey });
      if (!item) {
        continue;
      }
      const items = item instanceof Array ? item : [item];
      for (const entry of items) {
        if (!entry?.callback) {
          continue;
        }
        const slug = String(am.returnSlug?.() || am.name || '').toLowerCase();
        let text = entry.text || 'Open';
        if (slug === 'redsquare') {
          text = 'Visit RedSquare Profile';
        } else if (slug === 'store') {
          text = 'Visit Store';
        } else if (slug === 'stack') {
          text = 'Visit Blog Post';
        }
        options.push({
          id: `ext-${slug || options.length}`,
          text,
          icon: entry.icon || 'fa-solid fa-arrow-up-right-from-square',
          image: entry.image || '',
          callback: entry.callback
        });
      }
    }

    return options;
  }

  renderContactList() {
    const list = document.getElementById('chat-settings-list');
    if (!list) {
      return;
    }

    const keys = this.returnDirectoryKeys()
      .filter((key) => this.matchesSearch(key, this.searchQuery))
      .sort((a, b) => {
        const an = this.contactDisplayName(a.publicKey).toLowerCase();
        const bn = this.contactDisplayName(b.publicKey).toLowerCase();
        return an.localeCompare(bn);
      });

    if (!keys.length) {
      list.innerHTML = `<div class="chat-settings-empty">${
        this.searchQuery ? 'No contacts match your search' : 'No contacts in your keychain yet'
      }</div>`;
      return;
    }

    list.innerHTML = keys
      .map((key) => {
        const publicKey = key.publicKey;
        const name = this.contactDisplayName(publicKey);
        const identicon = this.app.keychain.returnIdenticon(publicKey);
        const secure = this.app.keychain.hasSharedSecret(publicKey);
        return `
          <button
            type="button"
            class="chat-settings-contact"
            role="listitem"
            data-publickey="${this.escapeHtml(publicKey)}"
          >
            <div class="saito-identicon-box">
              <img class="saito-identicon" src="${identicon}" alt="">
            </div>
            <div class="chat-settings-contact-meta">
              <div class="chat-settings-contact-name">
                <span>${this.escapeHtml(name)}</span>
                ${secure ? '<i class="fa-solid fa-lock chat-settings-contact-secure" title="Diffie-Hellman key established" aria-hidden="true"></i>' : ''}
              </div>
              <div class="chat-settings-contact-key">${this.escapeHtml(this.truncatePublicKey(publicKey))}</div>
            </div>
            <i class="fa-solid fa-chevron-right chat-settings-contact-chevron" aria-hidden="true"></i>
          </button>`;
      })
      .join('');
  }

  renderDetailBody(publicKey) {
    const body = document.getElementById('chat-settings-detail-body');
    if (!body) {
      return;
    }

    const name = this.contactDisplayName(publicKey);
    const identicon = this.app.keychain.returnIdenticon(publicKey);
    const hasDh = this.app.keychain.hasSharedSecret(publicKey);
    const blocked = this.isBlocked(publicKey);
    const external = this.returnExternalContactOptions(publicKey);

    this._detailOptionCallbacks = {};

    const optionRows = [];

    optionRows.push({
      id: 'chat-settings-open-chat',
      text: 'Open Chat',
      icon: 'fa-solid fa-comment',
      kind: 'open-chat'
    });

    for (const opt of external) {
      this._detailOptionCallbacks[opt.id] = opt.callback;
      optionRows.push(opt);
    }

    if (blocked) {
      optionRows.push({
        id: 'chat-settings-unblock-row',
        text: 'Unblock',
        icon: 'fa-regular fa-circle-check',
        kind: 'unblock'
      });
    } else {
      optionRows.push({
        id: 'chat-settings-block-row',
        text: 'Block',
        icon: 'fa-solid fa-ban',
        kind: 'block'
      });
    }

    optionRows.push({
      id: 'chat-settings-remove-row',
      text: 'Remove from Contacts',
      icon: 'fa-solid fa-trash',
      kind: 'remove',
      danger: true
    });

    const optionsHtml = optionRows
      .map((opt) => {
        const icon = opt.image
          ? `<span class="saito-modal-menu-option-icon" style="--saito-menu-icon: url('${opt.image}')" aria-hidden="true"></span>`
          : `<i class="${opt.icon}" aria-hidden="true"></i>`;
        return `<div id="${this.escapeHtml(opt.id)}" class="saito-modal-menu-option chat-settings-option${
          opt.danger ? ' chat-settings-option-danger' : ''
        }" data-kind="${this.escapeHtml(opt.kind || 'external')}" data-publickey="${this.escapeHtml(publicKey)}">${icon}<div class="saito-modal-menu-option-label">${this.escapeHtml(
          opt.text
        )}</div></div>`;
      })
      .join('');

    body.innerHTML = `
      <div class="chat-settings-identity">
        <div class="saito-identicon-box">
          <img class="saito-identicon" src="${identicon}" alt="">
        </div>
        <div class="chat-settings-identity-meta">
          <button type="button" class="chat-settings-identity-name" id="chat-settings-rename" data-publickey="${this.escapeHtml(publicKey)}" title="Provide alias for user">
            ${this.escapeHtml(name)}
          </button>
          <div class="chat-settings-identity-key-row">
            <div class="chat-settings-pubkey" title="${this.escapeHtml(publicKey)}">${this.escapeHtml(publicKey)}</div>
            <button type="button" class="saito-profile-copy-key" id="chat-settings-copy-key" data-publickey="${this.escapeHtml(publicKey)}" title="Copy public key" aria-label="Copy public key">
              <i class="fas fa-copy" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="chat-settings-section-divider"></div>

      <div class="chat-settings-options-block">
        <h3 class="chat-settings-section-heading">Contact Options</h3>
        <div class="chat-settings-options saito-menu-select-heavy">
          ${optionsHtml}
        </div>
      </div>

      <div class="chat-settings-section-divider"></div>

      <div class="chat-settings-encryption-block">
        ${
          hasDh
            ? `<h3 class="chat-settings-section-heading">Advanced Encryption</h3>
        <div class="chat-settings-encryption-note">Encryption uses a Diffie-Hellman shared secret on a separate key pair. Transactions to this public key are encrypted by default.</div>`
            : `<h3 class="chat-settings-section-heading">Standard Encryption</h3>
        <div class="chat-settings-encryption-note">Shared secrets are generated from the normal Saito key pairs. On-chain messages are only encrypted when applications specifically opt in.</div>
        <button type="button" class="saito-button-secondary compact" id="chat-settings-generate-dh" data-publickey="${this.escapeHtml(publicKey)}">
          Upgrade Encryption
        </button>`
        }
      </div>
    `;
  }

  showHome(animate = true) {
    this.selectedPublicKey = null;
    this.setStage('home', animate);
  }

  showDetail(publicKey, animate = true) {
    this.selectedPublicKey = publicKey;
    this.renderDetailBody(publicKey);
    this.setStage('detail', animate);
    this.attachDetailEvents();
  }

  unblockPublicKey(publicKey) {
    // Same persistence path as ChatUserMenu unblock / user-menu "Unblock and Chat":
    // mutate mod.black_list and saveOptions(). No dedicated unblock event exists.
    for (let i = this.mod.black_list.length - 1; i >= 0; i--) {
      if (this.mod.black_list[i] == publicKey) {
        this.mod.black_list.splice(i, 1);
        break;
      }
    }
    this.mod.saveOptions();
  }

  blockPublicKey(publicKey) {
    if (!this.mod.black_list.includes(publicKey)) {
      this.mod.black_list.push(publicKey);
    }
    this.mod.saveOptions();
  }

  async renameContact(publicKey) {
    const current = this.contactDisplayName(publicKey);
    const next = await sprompt('Provide alias for user', current);
    // sprompt cancel resolves to boolean false (not null) — must not String(false).
    if (next === false || next == null) {
      return;
    }
    if (typeof next !== 'string') {
      return;
    }
    const name = next.trim();
    if (!name) {
      return;
    }
    // Keychain stores display name as `identifier`; returnUsername() reads it.
    this.app.keychain.addKey(publicKey, { identifier: name });
    this.renderDetailBody(publicKey);
    this.attachDetailEvents();
    this.renderContactList();
  }

  attachEvents() {
    if (this._onKeychainUpdated) {
      this.app.connection.off('keychain-updated', this._onKeychainUpdated);
    }
    this._onKeychainUpdated = () => {
      this.renderContactList();
      if (this.selectedPublicKey) {
        if (this.app.keychain.hasPublicKey(this.selectedPublicKey)) {
          this.renderDetailBody(this.selectedPublicKey);
          this.attachDetailEvents();
        } else {
          this.showHome();
        }
      }
    };
    this.app.connection.on('keychain-updated', this._onKeychainUpdated);

    const search = document.getElementById('chat-settings-search');
    if (search) {
      search.value = this.searchQuery;
      search.oninput = (e) => {
        this.searchQuery = String(e.currentTarget.value || '').trim();
        this.renderContactList();
      };
    }

    const list = document.getElementById('chat-settings-list');
    if (list) {
      list.onclick = (e) => {
        const row = e.target.closest('.chat-settings-contact');
        if (!row) {
          return;
        }
        const publicKey = row.dataset.publickey;
        if (publicKey) {
          this.showDetail(publicKey);
        }
      };
    }

    const addContact = document.getElementById('chat-settings-add-contact');
    if (addContact) {
      addContact.onclick = (e) => {
        e.preventDefault();
        this.addContact();
      };
    }

    const audioToggle = document.getElementById('audio-notifications');
    if (audioToggle) {
      audioToggle.onchange = (e) => {
        if (e.currentTarget.checked) {
          this.mod.audio_notifications = true;
        } else {
          this.mod.audio_notifications = '';
        }
        this.mod.saveOptions();
      };
    }

    const autoOpen = document.getElementById('auto-open');
    if (autoOpen) {
      autoOpen.onchange = (e) => {
        this.mod.auto_open_community = Boolean(e.currentTarget.checked);
        this.mod.saveOptions();
      };
    }

    const back = document.getElementById('chat-settings-back');
    if (back) {
      back.onclick = () => this.showHome();
    }
  }

  attachDetailEvents() {
    const renameBtn = document.getElementById('chat-settings-rename');
    if (renameBtn) {
      renameBtn.onclick = () => this.renameContact(renameBtn.dataset.publickey);
    }

    const copyKey = document.getElementById('chat-settings-copy-key');
    if (copyKey) {
      copyKey.onclick = async () => {
        await navigator.clipboard.writeText(copyKey.dataset.publickey);
        const icon = copyKey.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-copy');
          icon.classList.add('fa-check');
          setTimeout(() => {
            icon.classList.remove('fa-check');
            icon.classList.add('fa-copy');
          }, 1500);
        }
      };
    }

    const generateDh = document.getElementById('chat-settings-generate-dh');
    if (generateDh) {
      generateDh.onclick = () => {
        const publicKey = generateDh.dataset.publickey;
        this.app.connection.emit('encrypt-key-exchange', publicKey);
        siteMessage('Diffie-Hellman key exchange started', 2000);
      };
    }

    document.querySelectorAll('.chat-settings-option').forEach((row) => {
      row.onclick = async () => {
        const publicKey = row.dataset.publickey;
        const kind = row.dataset.kind;
        const id = row.id;

        if (kind === 'open-chat') {
          this.app.connection.emit('open-chat-with', { key: publicKey });
          if (this.usesOverlay) {
            this.overlay.close();
          }
          return;
        }

        if (kind === 'block') {
          this.blockPublicKey(publicKey);
          siteMessage('Contact blocked', 1500);
          this.renderDetailBody(publicKey);
          this.attachDetailEvents();
          return;
        }

        if (kind === 'unblock') {
          this.unblockPublicKey(publicKey);
          siteMessage('Contact unblocked', 1500);
          this.renderDetailBody(publicKey);
          this.attachDetailEvents();
          return;
        }

        if (kind === 'remove') {
          const ok = await sconfirm('Remove this contact from your keychain?');
          if (!ok) {
            return;
          }
          this.app.keychain.removeKey(publicKey);
          this.showHome();
          this.renderContactList();
          return;
        }

        const callback = this._detailOptionCallbacks[id];
        if (typeof callback === 'function') {
          callback(this.app, publicKey);
        }
      };
    });
  }

  async addContact() {
    const address = await sprompt('Enter Address of Contact to Add:');
    if (!address) {
      return;
    }

    if (!this.app.crypto.isPublicKey(address)) {
      salert('Not a Network Address / Public Key');
      return;
    }

    salert(`Adding ${address} as Contact`);
    this.app.keychain.addKey(address);
    this.app.connection.emit('encrypt-key-exchange', address);
    this.renderContactList();
  }

  openNewChat() {
    this.contactList.multi_select = false;
    this.contactList.title = 'New Chat';
    this.contactList.callback = async (person) => {
      if (person) {
        this.app.connection.emit('open-chat-with', {
          key: person
        });
        if (this.usesOverlay) {
          this.overlay.close();
        }
      }
    };
    this.contactList.render();
  }

  async createGroup() {
    const name = await sprompt('Choose a name for the group');
    if (!name) {
      return;
    }

    this.contactList.multi_select = true;
    this.contactList.title = 'Invite Contacts';
    this.contactList.callback = (members) => {
      members.push(this.mod.publicKey);
      this.mod.sendCreateGroupTransaction(name, members);
    };

    if (this.app.keychain.returnKeys().length > 0) {
      this.contactList.render();
    } else {
      this.mod.sendCreateGroupTransaction(name);
    }

    if (this.usesOverlay) {
      this.overlay.close();
    }
  }

  markAllRead() {
    for (const group of this.mod.groups) {
      group.unread = 0;
      if (group.txs.length) {
        group.last_read_message = group.txs[group.txs.length - 1].signature;
      }
      this.mod.saveChatGroup(group);
      this.mod.chat_manager?.popups[group.id]?.updateNotification(0);
    }

    this.app.connection.emit('chat-manager-render-request');
    siteMessage('All chats marked as read', 1500);
  }
}

module.exports = ChatManagerMenu;
