const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const HomePage = require('./index');

//
// CRYPTPAD_URL — the origin of the CryptPad instance.
// Update this to match config/config.js httpUnsafeOrigin.
//
const CRYPTPAD_URL = 'https://cp.hda0.net';

//
// SAITO_AUTH_RELAY — the relay page on CryptPad's origin that accepts the
// auth fragment, writes to sessionStorage, and redirects to /login.
// Served from CryptPad's customize/saito-auth.html.
//
const SAITO_AUTH_RELAY = `${CRYPTPAD_URL}/saito-auth.html`;

class Docs extends ModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.appname = 'Saito Docs';
    this.name = 'Docs';
    this.slug = 'docs';
    this.description = 'End-to-end encrypted collaborative documents, powered by CryptPad';
    this.categories = 'Utilities Productivity';
    this.icon = 'fa-solid fa-file-lines';

    this.styles = ['/docs/style.css'];

    this.social = {
      twitter: '@SaitoOfficial',
      title: 'Saito Docs',
      url: 'https://saito.io/docs/',
      description: 'End-to-end encrypted collaborative documents on Saito',
      image: '/docs/img/splash.png',
    };

    // Auth state
    this._authReady = false;
    this._pubkey = null;
  }

  // ---------------------------------------------------------------------------
  // render() — called when the user navigates to /docs
  // ---------------------------------------------------------------------------

  async render() {
    if (!this.browser_active) return;

    // Inject our stylesheet
    this.attachStyleSheets();

    // Render the page shell
    document.querySelector('body').innerHTML = this._buildShell();

    // Resolve wallet keys, derive CryptPad keypairs, hand off auth,
    // then load the iframe.
    await this._initAuth();

    // Wire up the header interactions
    this._attachHeaderEvents();
  }

  // ---------------------------------------------------------------------------
  // Auth handoff
  // ---------------------------------------------------------------------------

  async _initAuth() {
    this._showStatus('Connecting wallet…');

    try {
      this._pubkey = await this.app.wallet.getPublicKey();
      const privkey = await this.app.wallet.getPrivateKey();

      if (!this._pubkey || !privkey) {
        this._showStatus('No wallet found — opening CryptPad normally');
        this._loadIframe(CRYPTPAD_URL);
        return;
      }

      // Derive CryptPad keypairs from Saito keys.
      // saito-cryptpad-keys.js is loaded on the CryptPad origin — we perform
      // the derivation here using the same algorithm so we don't need to
      // load cross-origin scripts.
      const keys = await this._deriveKeys(privkey, this._pubkey);

      // Encode keys as base64 JSON and pass via the relay page fragment.
      // The fragment is NEVER sent to the server.
      const payload = btoa(JSON.stringify(keys));

      // Render the username in the strip
      this._renderUsername();

      // Load the relay page first. It will write to sessionStorage on
      // cp.hda0.net and redirect to /login automatically.
      this._showStatus('Authenticating…');
      this._loadIframe(`${SAITO_AUTH_RELAY}#${payload}`);

    } catch (err) {
      console.error('[Docs] Auth error:', err);
      this._showStatus('Auth failed — opening CryptPad normally');
      this._loadIframe(CRYPTPAD_URL);
    }
  }

  // ---------------------------------------------------------------------------
  // Key material for CryptPad auth handoff.
  //
  // Saito private key format: 128-char hex string = 64 bytes (seed || pubkey).
  // We send the raw 64-byte key as a plain array to the relay page, which
  // stores it in sessionStorage. CryptPad's customize/login.js then derives
  // 192 bytes of deterministic entropy via BLAKE2b (libsodium on CryptPad's
  // origin), bypassing scrypt. Same wallet → same CryptPad identity.
  // ---------------------------------------------------------------------------

  async _deriveKeys(privkeyHex, pubkeyBase58) {
    // Convert hex private key to Uint8Array (64 bytes)
    const privBytes = new Uint8Array(
      privkeyHex.match(/.{1,2}/g).map((b) => parseInt(b, 16))
    );

    return {
      signingKey: Array.from(privBytes),   // Ed25519 secret key (64 bytes) as plain array
      publicKey:  pubkeyBase58,            // Saito base58 public key (for username derivation)
    };
  }

  // ---------------------------------------------------------------------------
  // iframe management
  // ---------------------------------------------------------------------------

  _loadIframe(url) {
    const iframe = document.getElementById('docs-iframe');
    if (!iframe) return;

    iframe.addEventListener('load', () => {
      this._hideStatus();
      // Once the relay page has fired and redirected, the iframe will reload
      // on the CryptPad login/drive URL — at that point we're done.
    }, { once: true });

    iframe.src = url;
  }

  // ---------------------------------------------------------------------------
  // Header strip
  // ---------------------------------------------------------------------------

  _buildShell() {
    return `
      <div id="docs-header">
        <div id="docs-header-inner">
          <a class="docs-header-left" href="/docs">
            <img class="docs-header-logo" src="/saito/img/logo.svg" alt="Saito" />
            <span class="docs-header-title">Docs</span>
          </a>
          <div class="docs-header-centre">
            <span id="docs-username">…</span>
          </div>
          <div class="docs-header-right">
            <div id="docs-hamburger" title="Wallet &amp; Navigation">
              <i class="fa-solid fa-bars"></i>
              <span class="docs-notif-badge"></span>
            </div>
          </div>
        </div>
      </div>

      <div id="docs-sidebar-backdrop"></div>

      <div id="docs-sidebar">
        <!-- SaitoHeader hamburger contents rendered here -->
      </div>

      <iframe
        id="docs-iframe"
        src="about:blank"
        allow="clipboard-read; clipboard-write; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals allow-top-navigation-by-user-activation"
      ></iframe>

      <div id="docs-auth-status"></div>
    `;
  }

  _renderUsername() {
    const el = document.getElementById('docs-username');
    if (!el || !this._pubkey) return;

    const identifier = this.app.keychain.returnIdentifierByPublicKey(this._pubkey, true);
    el.textContent = identifier && identifier !== this._pubkey
      ? identifier
      : 'Anonymous';
  }

  _attachHeaderEvents() {
    const header = document.getElementById('docs-header');
    const hamburger = document.getElementById('docs-hamburger');
    const backdrop = document.getElementById('docs-sidebar-backdrop');
    const sidebar = document.getElementById('docs-sidebar');

    if (!header || !hamburger) return;

    // Touch support — tap the strip to expand/collapse
    header.addEventListener('click', (e) => {
      // Only toggle on click of the strip itself (not inner controls)
      if (e.target === header || e.target.closest('#docs-header') === header) {
        if (!header.classList.contains('expanded')) {
          header.classList.add('expanded');
        }
      }
    });

    // Hamburger — open wallet/nav sidebar
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openSidebar();
    });

    // Backdrop — close sidebar
    if (backdrop) {
      backdrop.addEventListener('click', () => this._closeSidebar());
    }

    // Keyboard — Escape closes sidebar
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._closeSidebar();
    });

    // Listen for SaitoHeader notification events so we can badge the hamburger
    this.app.connection.on('saito-header-notification', (source_mod, unread) => {
      this._updateNotifBadge();
    });
  }

  _openSidebar() {
    const sidebar = document.getElementById('docs-sidebar');
    const backdrop = document.getElementById('docs-sidebar-backdrop');

    // Instantiate SaitoHeader into the sidebar if not already done
    if (!this._header) {
      this._header = new SaitoHeader(this.app, this);
      this._header.initialize(this.app).then(() => {
        // Render SaitoHeader's hamburger contents into our sidebar
        // by temporarily injecting a wrapper element it can prepend into,
        // then moving the hamburger contents node into our sidebar.
        this._renderHeaderIntoSidebar();
      });
    } else {
      sidebar?.classList.add('open');
      backdrop?.classList.add('visible');
    }
  }

  _renderHeaderIntoSidebar() {
    const sidebar = document.getElementById('docs-sidebar');
    const backdrop = document.getElementById('docs-sidebar-backdrop');

    if (!sidebar) return;

    // Render the full SaitoHeader into a hidden temp container,
    // then extract just the hamburger contents into our sidebar.
    const tmp = document.createElement('div');
    tmp.id = 'docs-header-tmp';
    tmp.style.display = 'none';
    document.body.appendChild(tmp);

    this._header.render().then(() => {
      const hamburgerContents = document.querySelector('.saito-header-hamburger-contents');
      if (hamburgerContents) {
        // Detach from the standard header and place in our sidebar
        sidebar.appendChild(hamburgerContents);
        hamburgerContents.classList.add('show-menu');
      }

      // Remove the temp header from DOM (we only wanted its hamburger panel)
      const fullHeader = document.getElementById('saito-header');
      if (fullHeader) fullHeader.remove();
      tmp.remove();

      sidebar.classList.add('open');
      backdrop?.classList.add('visible');
    });
  }

  _closeSidebar() {
    document.getElementById('docs-sidebar')?.classList.remove('open');
    document.getElementById('docs-sidebar-backdrop')?.classList.remove('visible');
    document.getElementById('docs-header')?.classList.remove('expanded');
  }

  _updateNotifBadge() {
    // Count unread notifications across all modules
    const hamburger = document.getElementById('docs-hamburger');
    if (!hamburger) return;

    // SaitoHeader tracks these on the header component — mirror it
    let total = 0;
    if (this._header?.notifications) {
      for (const m in this._header.notifications) {
        total += this._header.notifications[m];
      }
    }

    const badge = hamburger.querySelector('.docs-notif-badge');
    if (badge) badge.textContent = total > 0 ? total : '';
    hamburger.classList.toggle('has-notif', total > 0);
  }

  // ---------------------------------------------------------------------------
  // Status toast
  // ---------------------------------------------------------------------------

  _showStatus(msg) {
    const el = document.getElementById('docs-auth-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
  }

  _hideStatus() {
    const el = document.getElementById('docs-auth-status');
    if (!el) return;
    el.classList.remove('visible');
  }

  // ---------------------------------------------------------------------------
  // respondTo — register in the Saito header nav on other pages
  // ---------------------------------------------------------------------------

  respondTo(type) {
    if (type === 'saito-header') {
      return [
        {
          text: 'Docs',
          icon: this.icon,
          rank: 60,
          type: 'module',
          navigation: true,
          callback: (app) => {
            window.location = '/docs';
          },
        },
      ];
    }
    return super.respondTo(type);
  }
}

module.exports = Docs;
