const SaitoProfile = require('../../../lib/saito/ui/saito-profile/saito-profile');

/**
 * Red Square profile chrome: shared SaitoProfile card + RS-specific footer nav
 * (Posts / Replies / Likes + respondTo('redsquare-profile') ext links).
 */
class Profile {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.publicKey = '';
    this.ext_links = [];
    this._nav_bound = false;
    this.saito_profile = new SaitoProfile(app, mod, container);
  }

  collectProfileExtLinks(publicKey = '', profileData = null) {
    const key = String(publicKey || '').trim();
    if (!key || !this.app.modules?.getRespondTos) {
      return [];
    }

    const profile = profileData && typeof profileData === 'object' ? profileData : {};
    const peers = this.app.modules.getRespondTos('redsquare-profile', {
      publicKey: key,
      profile
    });

    const out = [];
    const seen = new Set();
    for (const item of peers || []) {
      const text = String(item?.text || '').trim();
      const link = String(item?.link || item?.url || '').trim();
      if (!text || !link) {
        continue;
      }
      const id = text.toLowerCase();
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      out.push({ text, link });
    }
    return out;
  }

  renderNavHtml(extLinks = []) {
    const browser = this.app.browser;
    const escapeAttr = (value) =>
      browser?.escapeHTML
        ? browser.escapeHTML(String(value ?? ''))
        : String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    const escapeText = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const extLinksHtml = (extLinks || [])
      .map((item) => {
        const text = escapeText(item?.text);
        const rawLink = item?.link;
        if (!text || !rawLink || !browser?.isSafeHref?.(rawLink)) {
          return '';
        }
        return `<a class="item" href="${escapeAttr(rawLink)}" data-profile-ext="1">${text}</a>`;
      })
      .join('');

    return `
      <nav class="nav redsquare-profile-nav" aria-label="Posts, replies, and likes">
        <div class="item" role="link" tabindex="0" data-profile-nav="posts">Posts</div>
        <div class="item" role="link" tabindex="0" data-profile-nav="replies">Replies</div>
        <div class="item" role="link" tabindex="0" data-profile-nav="likes">Likes</div>
        ${extLinksHtml}
      </nav>
    `;
  }

  syncProfileExtLinks(publicKey = '', profileData = null) {
    const footer = this.saito_profile.getFooterEl();
    const nav = footer?.querySelector?.('.nav');
    if (!nav) {
      return;
    }

    nav.querySelectorAll('[data-profile-ext]').forEach((el) => el.remove());

    this.ext_links = this.collectProfileExtLinks(publicKey, profileData);
    for (const item of this.ext_links) {
      if (!this.app.browser?.isSafeHref?.(item.link)) {
        continue;
      }
      const a = document.createElement('a');
      a.className = 'item';
      a.href = item.link;
      a.setAttribute('data-profile-ext', '1');
      a.textContent = item.text;
      nav.appendChild(a);
    }
  }

  render(container = '', publicKey = '') {
    if (container) {
      this.container = container;
      this.saito_profile.container = container;
    }

    const key = publicKey || this.mod.publicKey || '';
    this.publicKey = key;
    this.ext_links = this.collectProfileExtLinks(key);

    // Clear host mount then render shared card into it.
    const host = document.querySelector(this.container);
    if (host) {
      host.innerHTML = '';
    }

    this.saito_profile.ordinal = 0;
    this.saito_profile.reset(key);
    this.saito_profile.container = this.container;
    this.saito_profile.render();

    const footer = this.saito_profile.getFooterEl();
    if (footer) {
      footer.innerHTML = this.renderNavHtml(this.ext_links);
    }

    this.attachNavEvents();
    this.syncActiveNav(this.mod.manager?.mode || 'timeline');

    // When Profile updates arrive on the shared card, refresh ext links + mod.profile cache.
    if (!this._profile_dom_hooked) {
      this._profile_dom_hooked = true;
      this.app.connection.on('profile-update-dom', (pk, data) => {
        if (!pk || !data) {
          return;
        }
        if (this.publicKey && pk === this.publicKey) {
          this.syncProfileExtLinks(pk, data);
        }
        if (pk === this.mod.publicKey && this.mod.profile) {
          this.mod.profile.banner = data.banner || '';
          this.mod.profile.bio = data.description || '';
          if (data.image) {
            this.mod.profile.avatar = data.image;
          }
        }
      });
    }
  }

  attachEvents() {
    // Compatibility for main.js callers; nav is bound in attachNavEvents.
    this.attachNavEvents();
  }

  attachNavEvents() {
    const footer = this.saito_profile.getFooterEl();
    if (!footer || footer.dataset.redsquareNavBound) {
      return;
    }
    footer.dataset.redsquareNavBound = '1';

    footer.addEventListener('click', (e) => {
      const item = e.target.closest('.nav .item');
      if (!item || !footer.contains(item)) {
        return;
      }

      const view = item.getAttribute('data-profile-nav') || '';
      if (!view) {
        if (item.matches('a[href][data-profile-ext]')) {
          e.preventDefault();
          const href = item.getAttribute('href');
          if (!href) {
            return;
          }
          if (typeof navigateWindow === 'function') {
            navigateWindow(href);
          } else {
            window.location.assign(href);
          }
        }
        return;
      }

      e.preventDefault();

      const publicKey = this.publicKey || this.mod.publicKey || '';
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

    footer.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') {
        return;
      }
      const item = e.target.closest('.nav .item');
      if (!item || !footer.contains(item)) {
        return;
      }
      e.preventDefault();
      item.click();
    });
  }

  syncActiveNav(mode = '') {
    const footer = this.saito_profile.getFooterEl();
    if (!footer) {
      return;
    }

    const activeView = mode === 'posts' || mode === 'replies' || mode === 'likes' ? mode : '';

    footer.querySelectorAll('.nav .item').forEach((item) => {
      const view = item.getAttribute('data-profile-nav') || '';
      const active = Boolean(activeView) && view === activeView;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }
}

module.exports = Profile;
