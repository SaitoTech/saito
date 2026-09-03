const SaitoOverlay = require('../saito-overlay/saito-overlay');

const DEFAULT_OWN_DESCRIPTION_PLACEHOLDER =
  'This is your profile. Stay anonymous or provide an image or comment introducing yourself.';
const DEFAULT_OTHER_DESCRIPTION_PLACEHOLDER = 'No profile description yet.';

/**
 * Modern shared profile card.
 *
 * Display data (always available, no Profile module required):
 *   - publicKey
 *   - host overrides: name, description, banner, avatar, mask_key, icon
 *   - keychain: identicon, returnUsername
 *
 * Profile module (optional enhancement via returnModule('Profile')):
 *   - fetch / live DOM updates
 *   - banner + description editing
 */
class SaitoProfile {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.publicKey = null;
    this.ordinal = 0;
    this.menu = {};
    this.active_tab = '';
    this.tab_container = null;
    this._dom_listener_bound = false;

    // Host overrides (optional)
    // this.name, this.description, this.banner, this.avatar, this.mask_key, this.icon
    // this.editable — set false for read-only; omit/true to use Profile + mod.enable_profile_edits
  }

  hasProfileModule() {
    return Boolean(this.app.modules?.returnModule?.('Profile'));
  }

  hasDescription(value) {
    return String(value ?? '').trim().length > 0;
  }

  escapeAttr(value) {
    if (this.app.browser?.escapeHTML) {
      return this.app.browser.escapeHTML(String(value ?? ''));
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  escapeText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  classSafe(value) {
    return String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  }

  safeImgSrc(url, fallback) {
    const trimmed = String(url || '').trim();
    if (this.app.browser?.isSafeMediaUrl?.(trimmed)) {
      return trimmed;
    }
    if (/^data:image\/svg\+xml[;,]/i.test(trimmed) && !/[\s<>]/.test(trimmed)) {
      return trimmed;
    }
    return fallback;
  }

  safeBannerUrl(url) {
    const trimmed = String(url || '').trim();
    return this.app.browser?.isSafeMediaUrl?.(trimmed) ? trimmed : '';
  }

  /**
   * Resolve what the card should show from publicKey + host + keychain only.
   * Profile module never required here.
   */
  buildDisplayData(publicKey = '') {
    const key = String(publicKey || this.publicKey || '').trim();
    const identicon =
      (key && this.app.keychain?.returnIdenticon?.(key)) || '/saito/img/dreamscape.png';

    let name = 'Anonymous';
    if (typeof this.name === 'string' && this.name.trim()) {
      name = this.name.trim();
    } else if (key && this.app.keychain?.returnUsername) {
      name = this.app.keychain.returnUsername(key) || `Anon-${key.slice(0, 6)}`;
    } else if (key) {
      name = `Anon-${key.slice(0, 6)}`;
    }

    const avatar =
      (typeof this.avatar === 'string' && this.avatar.trim()) ||
      identicon;

    const banner = typeof this.banner === 'string' ? this.banner : '';
    const description =
      typeof this.description === 'string' ? this.description : undefined;

    return {
      publicKey: key,
      name,
      avatar,
      banner,
      description,
      mask_key: Boolean(this.mask_key),
      icon: this.icon || '',
      can_edit: this.canEdit(key),
      can_edit_help: this.canEditHelp(key)
    };
  }

  canEdit(publicKey) {
    // Host may force read-only (e.g. public Store view) without changing mod flags.
    if (this.editable === false) {
      return false;
    }
    if (!publicKey || !this.hasProfileModule() || !this.mod?.enable_profile_edits) {
      return false;
    }
    return publicKey === this.mod.publicKey;
  }

  /**
   * Keychain holds another profile's private key — show help, not direct edit.
   */
  canEditHelp(publicKey) {
    if (this.editable === false) {
      return false;
    }
    if (!publicKey || !this.hasProfileModule() || !this.mod?.enable_profile_edits) {
      return false;
    }
    if (publicKey === this.mod.publicKey) {
      return false;
    }
    const localKey = this.app.keychain?.returnKey?.(publicKey, true);
    return Boolean(localKey?.privateKey);
  }

  emptyDescriptionPlaceholderHtml(canEdit = false) {
    const text = canEdit
      ? DEFAULT_OWN_DESCRIPTION_PLACEHOLDER
      : DEFAULT_OTHER_DESCRIPTION_PLACEHOLDER;
    const safe = this.app.browser?.sanitize
      ? this.app.browser.sanitize(text, true)
      : this.escapeText(text);
    return `<div class="saito-profile-description-placeholder">${safe}</div>`;
  }

  rootSelector() {
    return this.ordinal ? `#saito-profile${this.ordinal}` : null;
  }

  queryRoot() {
    const sel = this.rootSelector();
    return sel ? document.querySelector(sel) : null;
  }

  getFooterEl() {
    return this.queryRoot()?.querySelector('.saito-profile-footer') || null;
  }

  getControlsEl() {
    return this.queryRoot()?.querySelector('.saito-profile-controls') || null;
  }

  getMenuEl() {
    return this.queryRoot()?.querySelector('.saito-profile-menu') || null;
  }

  remove() {
    const root = this.queryRoot();
    if (root) {
      root.remove();
    }
  }

  reset(publicKey, active_tab = '', tabs = []) {
    this.remove();

    if (!this.active_tab || !tabs.includes(this.active_tab)) {
      this.active_tab = active_tab;
    }

    this.resetMenuTabs(tabs);
    this.publicKey = publicKey;

    delete this.description;
    delete this.name;
    delete this.mask_key;
    delete this.banner;
    delete this.avatar;
    delete this.icon;

    this.ordinal = 0;
  }

  resetMenuTabs(tabs = []) {
    this.menu = {};
    for (const t of tabs) {
      this.menu[t] = [];
    }
  }

  /**
   * @param {string} [container]
   * @param {string} [publicKey]
   */
  render(container = '', publicKey = '') {
    if (container) {
      this.container = container;
    }
    if (publicKey) {
      this.publicKey = publicKey;
    }

    if (!this.publicKey) {
      return;
    }

    if (this.ordinal == 0) {
      let max = 0;
      Array.from(document.querySelectorAll('.saito-profile')).forEach((ov) => {
        const temp = parseInt(ov.id.replace('saito-profile', ''), 10);
        if (temp > max) {
          max = temp;
        }
      });
      this.ordinal = max + 1;
    }

    const myqs = `#saito-profile${this.ordinal}`;
    const content = this.buildTemplateHtml();

    if (document.querySelector(myqs)) {
      this.app.browser.replaceElementBySelector(content, myqs);
    } else if (this.container) {
      this.app.browser.prependElementToSelector(content, this.container);
    } else {
      this.app.browser.addElementToDom(content);
    }

    if (this.hasProfileModule()) {
      this.app.connection.emit('profile-fetch-content-and-update-dom', this.publicKey);
    }

    this.renderMenuTabs();
    this.attachEvents();
  }

  buildTemplateHtml() {
    const d = this.buildDisplayData(this.publicKey);
    const safeKey = this.escapeAttr(d.publicKey);
    const keyClass = this.classSafe(d.publicKey);
    const safeName = this.escapeText(d.name);
    const safeAvatar = this.escapeAttr(
      this.safeImgSrc(d.avatar, '/saito/img/dreamscape.png')
    );
    const bannerUrl = this.safeBannerUrl(d.banner);
    const bannerStyle = bannerUrl
      ? ` style="background-image: url('${this.escapeAttr(bannerUrl).replace(/'/g, '%27')}')"`
      : '';

    const canEdit = d.can_edit;
    const canEditHelp = d.can_edit_help;

    let bannerControl = '';
    if (canEditHelp) {
      bannerControl = `<i id="saito-profile-help" class="saito-profile-banner-edit fa-regular fa-circle-question" role="button" tabindex="0" aria-label="Profile editing help"></i>`;
    } else if (canEdit) {
      bannerControl = `<i class="saito-profile-banner-edit fas fa-camera" role="button" tabindex="0" aria-label="Edit banner"></i>`;
    }

    const keyHtml =
      d.publicKey && !d.mask_key
        ? `
      <div class="saito-profile-key-row">
        <span class="saito-profile-public-key" title="${safeKey}">${safeKey}</span>
        <button
          class="saito-profile-copy-key"
          type="button"
          data-profile-key="${safeKey}"
          aria-label="Copy address"
          title="Copy address"
        >
          <i class="fas fa-copy" aria-hidden="true"></i>
        </button>
      </div>`
        : d.publicKey && d.mask_key
          ? ''
          : '';

    const hasBio = this.hasDescription(d.description);
    const descriptionClass = [
      'saito-profile-description',
      canEdit ? 'can-edit' : '',
      !hasBio ? 'empty' : ''
    ]
      .filter(Boolean)
      .join(' ');

    let descriptionInner = '';
    if (hasBio) {
      const bioHtml = this.app.browser?.sanitize
        ? this.app.browser.sanitize(d.description, true).replaceAll('\n', '<br>')
        : this.escapeText(d.description);
      descriptionInner = `
        <div id="profile-description-${safeKey}" class="profile-description-${keyClass}" data-id="${safeKey}">${bioHtml}</div>
      `;
    } else if (canEdit) {
      descriptionInner = this.emptyDescriptionPlaceholderHtml(true);
    } else {
      // Non-editable + no host description: keep empty (hidden via CSS).
      descriptionInner = '';
    }

    const iconHtml = d.icon || '';

    return `
      <div id="saito-profile${this.ordinal}" class="saito-profile" data-id="${safeKey}">
        <div class="saito-profile-card" data-profile-key="${safeKey}">
          <div id="profile-banner-${safeKey}" class="saito-profile-banner profile-banner-${keyClass} banner-${keyClass}" data-id="${safeKey}"${bannerStyle}>
            ${bannerControl}
          </div>
          <div class="saito-profile-body">
            <div class="saito-profile-identity">
              <div class="saito-profile-avatar-wrap">
                <img class="saito-profile-avatar" src="${safeAvatar}" alt="${this.escapeAttr(d.name)}" />
                ${iconHtml}
              </div>
              <div class="saito-profile-text">
                <span class="saito-profile-name">${safeName}</span>
                ${keyHtml}
              </div>
            </div>
            <div class="${descriptionClass}">${descriptionInner}</div>
            <div class="saito-profile-controls saito-menu-select-subtle"></div>
            <div class="saito-profile-menu"></div>
            <div class="saito-profile-footer"></div>
          </div>
        </div>
      </div>
    `;
  }

  renderMenuTabs() {
    const menu = this.getMenuEl();
    if (!menu) {
      this.renderTab();
      return;
    }

    menu.innerHTML = '';

    if (Object.keys(this.menu).length > 0) {
      for (const i in this.menu) {
        const class1 = i == this.active_tab ? ' active' : '';
        const class2 = this.menu[i].length > 0 ? '' : 'hidden';
        const html = `<div class="saito-profile-tab${class1}" data-id="${i}">
                  ${i}
                  <span class="${class2}"> (${this.menu[i].length})</span>
                </div>`;
        this.app.browser.addElementToSelector(html, `${this.rootSelector()} .saito-profile-menu`);
      }
    }

    this.renderTab();
  }

  renderTab() {
    if (!this.tab_container) {
      return;
    }
    const el = document.querySelector(this.tab_container);
    if (el) {
      el.innerHTML = '';
    }
    if (this.active_tab && this.menu[this.active_tab]) {
      for (const p of this.menu[this.active_tab]) {
        p.render();
      }
    }
  }

  ensureDomListener() {
    if (this._dom_listener_bound) {
      return;
    }
    this._dom_listener_bound = true;

    this.app.connection.on('profile-update-dom', (publicKey, data) => {
      this.applyProfileDomUpdate(publicKey, data);
    });
  }

  attachEvents() {
    this.ensureDomListener();

    const root = this.queryRoot();
    if (!root) {
      return;
    }

    if (this.tab_container) {
      root.querySelectorAll('.saito-profile-tab').forEach((el) => {
        el.onclick = (e) => {
          if (this.active_tab != e.currentTarget.dataset.id) {
            this.active_tab = e.currentTarget.dataset.id;
            this.renderMenuTabs();
            this.attachEvents();
          }
        };
      });
    }

    root.querySelectorAll('.saito-profile-copy-key').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const key =
          btn.getAttribute('data-profile-key') || this.publicKey || '';
        if (!key) {
          return;
        }
        const done = () => {
          if (typeof siteMessage === 'function') {
            siteMessage('Address copied', 1200);
          } else if (this.app.browser?.siteMessage) {
            this.app.browser.siteMessage('Address copied', 1200);
          }
        };
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(key).then(done).catch(() => {});
        }
      };
    });

    const camera = root.querySelector('.saito-profile-banner-edit.fa-camera');
    if (camera && this.canEdit(this.publicKey)) {
      camera.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.app.connection.emit('profile-edit-banner', this.publicKey);
      };
    }

    const help = root.querySelector('#saito-profile-help');
    if (help) {
      help.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const overlay = new SaitoOverlay(this.app, this.mod);
        const html = `<div class="saito-modal">
                <div class="saito-modal-title">Profile Editing</div>
                <div class="saito-profile-note">You have the private key for this profile in your keychain.</div>
                <div class="saito-profile-note">You can edit it by importing that private key in a private browser
                  directed to saito.io/profile</div>
              </div>`;
        overlay.show(html, () => {
          const localKey = this.app.keychain.returnKey(this.publicKey, true);
          if (localKey?.privateKey) {
            const obj = {
              publicKey: localKey.publicKey,
              privateKey: localKey.privateKey
            };
            const base64obj = this.app.crypto.stringToBase64(JSON.stringify(obj));
            const link = window.location.origin + '/profile?load_key=' + base64obj;
            navigator.clipboard.writeText(link);
            siteMessage('Private URL copied', 5000);
          }
        });
      };
    }

    const desc = root.querySelector('.saito-profile-description.can-edit');
    if (desc && this.canEdit(this.publicKey)) {
      desc.onclick = (e) => {
        e.preventDefault();
        this.app.connection.emit('profile-edit-description', this.publicKey);
      };
    }

    root.querySelectorAll('.saito-profile-banner-edit, .saito-profile-copy-key').forEach((item) => {
      item.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      };
    });
  }

  applyProfileDomUpdate(publicKey, data) {
    if (!publicKey || !data || !this.hasProfileModule()) {
      return;
    }
    if (this.publicKey && publicKey !== this.publicKey) {
      return;
    }

    const root = this.queryRoot();
    if (!root) {
      return;
    }

    const { banner, description, image } = data;
    const keyClass = this.classSafe(publicKey);

    root.querySelectorAll(`.banner-${keyClass}, .profile-banner-${keyClass}`).forEach((el) => {
      el.style.backgroundImage = banner ? `url('${banner}')` : '';
    });

    const container = root.querySelector('.saito-profile-description');
    if (container) {
      const canEdit = this.canEdit(publicKey);
      container.classList.toggle('can-edit', canEdit);
      container.classList.toggle('empty', !this.hasDescription(description));

      if (!this.hasDescription(description)) {
        container.innerHTML = canEdit ? this.emptyDescriptionPlaceholderHtml(true) : '';
      } else {
        const sanitized = this.app.browser
          .sanitize(description, true)
          .replaceAll('\n', '<br>');
        container.innerHTML = `
            <div id="profile-description-${publicKey}" class="profile-description-${keyClass}" data-id="${publicKey}">
              ${sanitized}
            </div>
          `;
      }

      if (canEdit) {
        container.onclick = (e) => {
          e.preventDefault();
          this.app.connection.emit('profile-edit-description', publicKey);
        };
      } else {
        container.onclick = null;
      }
    }

    const avatarNodes = root.querySelectorAll('.saito-profile-avatar');
    if (image) {
      avatarNodes.forEach((el) => {
        el.src = image;
      });
    } else if (!this.avatar) {
      const fallback =
        this.app.keychain.returnIdenticon(publicKey) || '/saito/img/dreamscape.png';
      avatarNodes.forEach((el) => {
        el.src = fallback;
      });
    }
  }
}

module.exports = SaitoProfile;
