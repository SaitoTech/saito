const ProfileTemplate = require('./profile.template');

const EMPTY_BIO_QUOTES = [
  "Once an idea has taken hold of the brain it's almost impossible to eradicate. An idea that is fully formed - fully understood - that sticks; right in there somewhere.",
  "Dreams feel real while we're in them. It's only when we wake up that we realize something was actually strange.",
  "They say we only use a fraction of our brain's true potential.",
  'Your condescension, as always, is much appreciated.',
  'My father accepts that I want to create for myself, not follow in his footsteps.',
  'The more you change things, the quicker the projections start to converge on you.',
  "These aren't just dreams. These are memories. And you said never to use memories."
];

class Profile {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.profile = null;
    this._dom_bound = false;
  }

  /**
   * Placeholder when the viewer’s own bio is empty — ambient quote, not a CTA.
   */
  returnEmptyBioQuote() {
    return EMPTY_BIO_QUOTES[Math.floor(Math.random() * EMPTY_BIO_QUOTES.length)];
  }

  emptyBioPlaceholderHtml() {
    const quote = this.returnEmptyBioQuote();
    const safe =
      typeof this.app.browser?.sanitize === 'function'
        ? this.app.browser.sanitize(quote, true)
        : String(quote)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    return `<div class="saito-description-edit placeholder">${safe}</div>`;
  }

  /**
   * Resolve what the sidebar profile card should show.
   * Edit controls only for the viewing user's own key (same contract as SaitoProfile).
   */
  buildProfileData(publicKey = '') {
    const key = publicKey || this.mod.publicKey || '';
    const avatar =
      (key && this.app.keychain.returnIdenticon(key)) || '/saito/img/dreamscape.png';

    // Display name from keychain: registered identifier, else Anon-xxxxxx.
    // Do not use returnIdentifierByPublicKey(..., true) alone — that returns the
    // raw public key when unnamed and would overflow the profile name slot.
    let name = 'Anonymous';
    if (key) {
      name = this.app.keychain.returnUsername(key) || `Anon-${key.slice(0, 6)}`;
    }

    const existing = this.mod.profile || {};
    const can_edit = this.canEditProfile(key);
    let bio = existing.bio || existing.description || '';
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

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.profile = this.buildProfileData(this.mod.publicKey);
    this.mod.profile = Object.assign({}, this.mod.profile || {}, this.profile);

    this.app.browser.replaceElementContentBySelector(ProfileTemplate(this), this.container);
    this.attachEvents();
    this.syncActiveNav(this.mod.manager?.mode || 'timeline');

    // Pull archived banner/description for the shown key (Profile module).
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

    if (root.dataset.profileBound) {
      return;
    }

    root.dataset.profileBound = '1';

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
          navigator.clipboard.writeText(key).then(done).catch(() => {});
        }
        return;
      }

      const bannerEdit = e.target.closest('#saito-banner-edit, .saito-banner-edit');
      if (bannerEdit && root.contains(bannerEdit)) {
        e.preventDefault();
        e.stopPropagation();
        const key = this.profile?.publicKey || this.mod.publicKey;
        if (this.canEditProfile(key)) {
          this.app.connection.emit('profile-edit-banner', key);
        }
        return;
      }

      const descEdit = e.target.closest('.saito-profile-description.can-edit');
      if (descEdit && root.contains(descEdit)) {
        e.preventDefault();
        e.stopPropagation();
        const key = this.profile?.publicKey || this.mod.publicKey;
        if (this.canEditProfile(key)) {
          this.app.connection.emit('profile-edit-description', key);
        }
        return;
      }

      const item = e.target.closest('.nav .item');

      if (!item || !root.contains(item)) {
        return;
      }

      e.preventDefault();

      const view = item.getAttribute('data-profile-nav') || '';
      const publicKey = this.profile?.publicKey || this.mod.publicKey || '';
      const manager = this.mod.manager;

      if (!manager) {
        return;
      }

      if (view === 'posts') {
        manager.renderPosts(publicKey);
      } else if (view === 'replies') {
        manager.renderReplies(publicKey);
      } else if (view === 'likes') {
        manager.renderLikes(publicKey);
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') {
        return;
      }

      const item = e.target.closest('.nav .item, .saito-banner-edit, .copy-key');

      if (!item || !root.contains(item)) {
        return;
      }

      e.preventDefault();
      item.click();
    });
  }

  /**
   * Profile module DOM updates — same selectors SaitoProfile listens for.
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

    if (banner) {
      if (this.mod.profile) {
        this.mod.profile.banner = banner;
      }
      document.querySelectorAll(`.banner-${publicKey}`).forEach((el) => {
        el.style.backgroundImage = `url('${banner}')`;
      });
    }

    if (typeof description !== 'undefined') {
      if (this.mod.profile) {
        this.mod.profile.bio = description;
      }

      const container = document.querySelector(
        `${this.container} .saito-profile-description, ${this.container} .bio`
      );
      if (container) {
        const canEdit = this.canEditProfile(publicKey);
        container.classList.toggle('can-edit', canEdit);
        container.classList.toggle('empty', !description && canEdit);

        if (!description) {
          container.innerHTML = canEdit ? this.emptyBioPlaceholderHtml() : '';
        } else {
          const sanitized = this.app.browser.sanitize(description, true).replaceAll('\n', '<br>');
          container.innerHTML = `
            <div id="profile-description-${publicKey}" class="profile-description-${publicKey}" data-id="${publicKey}">
              ${sanitized}
            </div>
            ${canEdit ? `<div class="saito-description-edit"><i class="fas fa-pen"></i></div>` : ''}
          `;
        }
      }
    }

    if (image) {
      document.querySelectorAll(`${this.container} .avatar`).forEach((el) => {
        el.src = image;
      });
      if (this.mod.profile) {
        this.mod.profile.avatar = image;
      }
    }
  }

  /**
   * Reflect Manager's current view. Nothing is active on the global timeline.
   */
  syncActiveNav(mode = '') {
    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    const activeView =
      mode === 'posts' || mode === 'replies' || mode === 'likes' ? mode : '';

    root.querySelectorAll('.nav .item').forEach((item) => {
      const view = item.getAttribute('data-profile-nav') || '';
      const active = Boolean(activeView) && view === activeView;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }
}

module.exports = Profile;
