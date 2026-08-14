const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');
const AuthTemplate = require('./auth.template');

const AUTH_STATUS = {
  SUCCESS: 'success',
  CANCELLED: 'cancelled',
  ERROR: 'error',
  REJECTED: 'rejected'
};

/**
 * Identity-acquisition overlay (module-local until a second consumer exists).
 *
 * Acquires an abstract identity via a configured provider list.
 * Does not evaluate eligibility, issue tokens, or enforce onboarding policy —
 * callers own those decisions after receiving the result.
 *
 * Callback result:
 *   {
 *     status: 'success' | 'cancelled' | 'error' | 'rejected',
 *     provider: string | null,
 *     identity: {
 *       provider, provider_id, username, display_name, email, avatar, metadata
 *     } | null,
 *     error: string | null
 *   }
 */
class Auth {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    if (app?.browser?.addStylesheet) {
      app.browser.addStylesheet('/faucet/style.css');
    }
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.callback = null;
    this.title = '';
    this.message = '';
    this.activeProviders = [];

    /** Full registry — filter via render({ providers: [...] }). */
    this.providers = [
      {
        id: 'github',
        name: 'GitHub',
        icon: 'fa-brands fa-github'
      },
      {
        id: 'twitter',
        name: 'X',
        icon: 'fa-brands fa-x-twitter'
      }
    ];
  }

  /**
   * Show the auth overlay.
   *
   * @param {object|function} [options]
   * @param {string} [options.title]
   * @param {string} [options.message] Plain text; blank lines become separate paragraphs
   * @param {string[]} [options.providers] Provider ids to show (subset of registry)
   * @param {function} [options.callback]
   */
  render(options = {}) {
    // Back-compat: render(callback)
    if (typeof options === 'function') {
      options = { callback: options };
    }

    const opts = options && typeof options === 'object' ? options : {};

    this.title = String(opts.title || 'Welcome to Saito').trim() || 'Welcome to Saito';
    this.message = String(
      opts.message ||
        `To continue, please verify one of your existing online accounts.

We never post on your behalf.`
    );
    this.callback = typeof opts.callback === 'function' ? opts.callback : null;
    this.activeProviders = this.resolveProviders(opts.providers);

    this.overlay.show(
      AuthTemplate({
        title: this.title,
        message: this.message,
        providers: this.activeProviders
      }),
      () => {
        this.finish({
          status: AUTH_STATUS.CANCELLED,
          provider: null,
          identity: null,
          error: null
        });
      }
    );

    this.attachEvents();
  }

  resolveProviders(requested) {
    const ids =
      Array.isArray(requested) && requested.length
        ? requested.map((id) => String(id || '').trim()).filter(Boolean)
        : this.providers.map((p) => p.id);

    const resolved = [];
    for (const id of ids) {
      const provider = this.providers.find((p) => p.id === id);
      if (provider) {
        resolved.push(provider);
      }
    }
    return resolved.length ? resolved : [...this.providers];
  }

  attachEvents() {
    const root = document.querySelector('.auth');
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-auth-provider]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-auth-provider');
        const provider = this.activeProviders.find((p) => p.id === id);
        if (provider) {
          this.authenticate(provider);
        }
      };
    });

    const cancelBtn = root.querySelector('[data-auth-cancel]');
    if (cancelBtn) {
      cancelBtn.onclick = (e) => {
        e.preventDefault();
        this.cancel();
      };
    }
  }

  /**
   * Begin provider authentication.
   * GitHub and X open a Faucet-owned OAuth initiation popup (does not navigate Saito).
   * @param {{ id: string, name?: string, icon?: string }} provider
   */
  authenticate(provider) {
    if (!provider?.id) {
      this.finish({
        status: AUTH_STATUS.ERROR,
        provider: null,
        identity: null,
        error: 'Unknown authentication provider'
      });
      this.overlay.close();
      return;
    }

    if (provider.id === 'github' || provider.id === 'twitter') {
      if (typeof window === 'undefined' || typeof window.open !== 'function') {
        this.finish({
          status: AUTH_STATUS.ERROR,
          provider: provider.id,
          identity: null,
          error: 'Browser cannot open an OAuth window'
        });
        return;
      }

      const slug =
        typeof this.mod?.returnSlug === 'function' ? this.mod.returnSlug() : 'faucet';
      const oauthUrl = new URL(
        `/${encodeURI(slug)}/oauth/${encodeURI(provider.id)}`,
        window.location.origin
      );
      const publickey = String(this.mod?.publicKey || '').trim();
      if (publickey) {
        oauthUrl.searchParams.set('publickey', publickey);
      }

      const popup = window.open(
        oauthUrl.toString(),
        'saito_faucet_oauth_' + provider.id,
        'popup=yes,width=560,height=720,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes'
      );
      if (!popup) {
        siteMessage(
          'Please allow popups to continue with ' +
            (provider.name || provider.id) +
            ' authentication.',
          4000
        );
      }
      return;
    }

    siteMessage('That authentication provider is not available yet.', 3000);
  }

  /**
   * Close without treating it as user cancel (null callback first).
   */
  close() {
    this.callback = null;
    if (this.overlay) {
      this.overlay.close();
    }
  }

  cancel() {
    this.finish({
      status: AUTH_STATUS.CANCELLED,
      provider: null,
      identity: null,
      error: null
    });
    this.overlay.close();
  }

  /**
   * Invoke the caller callback once. Nulls the callback before close so the
   * overlay dismiss hook does not double-fire (Create NFT pattern).
   */
  finish(result) {
    if (typeof this.callback !== 'function') {
      return;
    }
    const cb = this.callback;
    this.callback = null;
    cb({
      status: result.status || AUTH_STATUS.ERROR,
      provider: result.provider ?? null,
      identity: result.identity ?? null,
      error: result.error ?? null
    });
  }
}

Auth.STATUS = AUTH_STATUS;

module.exports = Auth;
