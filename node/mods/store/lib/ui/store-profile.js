const StoreProfileTemplate = require('./store-profile.template');

const DEFAULT_OWN_PROFILE_PLACEHOLDER =
  'This is your profile. Stay anonymous or provide an image or comment introducing yourself.';
const DEFAULT_OTHER_PROFILE_PLACEHOLDER = 'No profile description yet.';

/**
 * Store user-store profile card.
 * Copied from Red Square's profile presentation, owned by Store (no Red Square dependency).
 * Compact Posts/Replies/Likes nav is omitted — Store vertical nav lives in UserStoreSidebar.
 */
class StoreProfile {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.profile = null;
    this.profiles = {};
    this._dom_bound = false;
  }

  hasProfileDescription(value) {
    return String(value ?? '').trim().length > 0;
  }

  emptyBioPlaceholderText(canEdit = false) {
    return canEdit ? DEFAULT_OWN_PROFILE_PLACEHOLDER : DEFAULT_OTHER_PROFILE_PLACEHOLDER;
  }

  emptyBioPlaceholderHtml(canEdit = false) {
    const text = this.emptyBioPlaceholderText(canEdit);
    const safe =
      typeof this.app.browser?.sanitize === 'function'
        ? this.app.browser.sanitize(text, true)
        : String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    const editHtml = canEdit
      ? `<div class="store-profile-description-edit"><i class="fas fa-pen"></i></div>`
      : '';

    return `<div class="store-profile-description-placeholder">${safe}</div>${editHtml}`;
  }

  buildProfileData(publicKey = '') {
    const key = publicKey || this.mod.publicKey || '';
    const avatar = (key && this.app.keychain.returnIdenticon(key)) || '/saito/img/dreamscape.png';

    let name = 'Anonymous';
    if (key) {
      name = this.app.keychain.returnUsername(key) || `Anon-${key.slice(0, 6)}`;
    }

    const existing =
      key === this.mod.publicKey ? this.mod.profile || {} : this.profiles[key] || {};
    const can_edit = this.canEditProfile(key);
    const rawBio = existing.bio || existing.description || '';
    let bio = this.hasProfileDescription(rawBio) ? rawBio : '';
    if (bio && this.app.browser?.sanitize) {
      bio = this.app.browser.sanitize(bio, true);
    }

    return {
      publicKey: key,
      name,
      handle: existing.handle || '',
      bio,
      avatar: existing.avatar || avatar,
      banner: existing.banner || '',
      can_edit
    };
  }

  canEditProfile(publicKey) {
    if (!publicKey || !this.mod.enable_profile_edits) {
      return false;
    }
    if (!this.app.modules.returnModule('Profile')) {
      return false;
    }
    return publicKey === this.mod.publicKey;
  }

  render(container = '', publicKey = '') {
    if (container) {
      this.container = container;
    }

    const key = publicKey || this.mod.publicKey || '';
    this.profile = this.buildProfileData(key);
    this.profiles[key] = Object.assign({}, this.profiles[key] || {}, this.profile);

    if (key === this.mod.publicKey) {
      this.mod.profile = Object.assign({}, this.mod.profile || {}, this.profile);
    }

    this.app.browser.replaceElementContentBySelector(StoreProfileTemplate(this), this.container);
    this.attachEvents();

    if (this.profile.publicKey) {
      this.app.connection.emit('profile-fetch-content-and-update-dom', this.profile.publicKey);
    }
  }

  attachEvents() {
    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    if (!this._dom_bound) {
      this._dom_bound = true;

      this.app.connection.on('profile-update-dom', (publicKey, data) => {
        this.applyProfileDomUpdate(publicKey, data);
      });
    }

    if (root.dataset.storeProfileBound) {
      return;
    }

    root.dataset.storeProfileBound = '1';

    root.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.copy-key');
      if (copyBtn && root.contains(copyBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const key =
          copyBtn.getAttribute('data-profile-key') ||
          this.profile?.publicKey ||
          this.mod.publicKey ||
          '';
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
          navigator.clipboard
            .writeText(key)
            .then(done)
            .catch(() => {});
        }
        return;
      }

      const bannerEdit = e.target.closest('.store-profile-banner-edit');
      if (bannerEdit && root.contains(bannerEdit)) {
        e.preventDefault();
        e.stopPropagation();
        const key = this.profile?.publicKey || this.mod.publicKey;
        if (this.canEditProfile(key)) {
          this.app.connection.emit('profile-edit-banner', key);
        }
        return;
      }

      const descEdit = e.target.closest('.store-profile-description.can-edit');
      if (descEdit && root.contains(descEdit)) {
        e.preventDefault();
        e.stopPropagation();
        const key = this.profile?.publicKey || this.mod.publicKey;
        if (this.canEditProfile(key)) {
          this.app.connection.emit('profile-edit-description', key);
        }
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') {
        return;
      }

      const item = e.target.closest('.store-profile-banner-edit, .copy-key');

      if (!item || !root.contains(item)) {
        return;
      }

      e.preventDefault();
      item.click();
    });
  }

  /**
   * Apply Profile-module content updates to the Store profile card.
   */
  applyProfileDomUpdate(publicKey, data) {
    if (!publicKey || !data) {
      return;
    }

    const shown = this.profile?.publicKey || this.mod.publicKey;
    if (shown && publicKey !== shown) {
      return;
    }

    const { banner, description, image } = data;

    this.profiles[publicKey] = Object.assign({}, this.profiles[publicKey] || {}, {
      banner: banner || '',
      bio: description || ''
    });

    if (publicKey === this.mod.publicKey && this.mod.profile) {
      this.mod.profile.banner = banner || '';
      this.mod.profile.bio = description || '';
    }

    document.querySelectorAll(`${this.container} .banner-${publicKey}`).forEach((el) => {
      el.style.backgroundImage = banner ? `url('${banner}')` : '';
    });

    const container = document.querySelector(`${this.container} .store-profile-description`);
    if (container) {
      const canEdit = this.canEditProfile(publicKey);
      container.classList.toggle('can-edit', canEdit);
      container.classList.toggle('empty', !this.hasProfileDescription(description));

      if (!this.hasProfileDescription(description)) {
        container.innerHTML = this.emptyBioPlaceholderHtml(canEdit);
      } else {
        const sanitized = this.app.browser.sanitize(description, true).replaceAll('\n', '<br>');
        container.innerHTML = `
            <div class="profile-description-${publicKey}" data-id="${publicKey}">
              ${sanitized}
            </div>
            ${canEdit ? `<div class="store-profile-description-edit"><i class="fas fa-pen"></i></div>` : ''}
          `;
      }
    }

    const avatarNodes = document.querySelectorAll(`${this.container} .avatar`);
    if (image) {
      avatarNodes.forEach((el) => {
        el.src = image;
      });
      this.profiles[publicKey].avatar = image;
      if (publicKey === this.mod.publicKey && this.mod.profile) {
        this.mod.profile.avatar = image;
      }
    } else {
      const fallback = this.app.keychain.returnIdenticon(publicKey) || '/saito/img/dreamscape.png';
      avatarNodes.forEach((el) => {
        el.src = fallback;
      });
      this.profiles[publicKey].avatar = fallback;
      if (publicKey === this.mod.publicKey && this.mod.profile) {
        this.mod.profile.avatar = fallback;
      }
    }
  }
}

module.exports = StoreProfile;
