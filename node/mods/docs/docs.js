const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const HomePage = require('./index');

//
// CRYPTPAD_URL — the origin of the CryptPad instance.
// Update this to match config/config.js httpUnsafeOrigin.
//
const CRYPTPAD_URL = 'https://cryptpad.saito.io';

//
// SAITO_AUTH_RELAY — the relay page on CryptPad's origin that accepts the
// auth fragment, writes to sessionStorage, and redirects to /login.
// Served from CryptPad's customize/saito-auth.html.
//
const SAITO_AUTH_RELAY = `${CRYPTPAD_URL}/customize/saito-auth.html`;

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
      image: '/docs/img/splash.png'
    };

    // Auth state
    this._authReady = false;
    this._pubkey = null;
  }

  // ---------------------------------------------------------------------------
  // render() — follows standard Saito module pattern:
  //   1. Create SaitoHeader component (standard nav/wallet)
  //   2. Call super.render() to let framework render header + components
  //   3. Inject our CryptPad iframe below the header
  // ---------------------------------------------------------------------------

  async render() {
    if (!this.browser_active) return;

    // Set up the standard Saito header (once)
    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.addComponent(this.header);
    }

    // Let framework render the header and attach stylesheets
    await super.render();

    // Inject the CryptPad iframe container if not already present
    if (!document.getElementById('docs-main')) {
      const main = document.createElement('div');
      main.id = 'docs-main';
      main.innerHTML = `
        <iframe
          id="docs-iframe"
          src="about:blank"
          allow="clipboard-read; clipboard-write; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals allow-top-navigation-by-user-activation"
        ></iframe>
        <div id="docs-auth-status"></div>
      `;
      document.querySelector('body').appendChild(main);
    }

    // Tap-to-expand for the thin strip header (mobile + desktop click)
    this._attachStripEvents();

    // Start auth flow and load CryptPad
    await this._initAuth();
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

      const keys = await this._deriveKeys(privkey, this._pubkey);

      // Encode keys as base64 JSON and pass via the relay page fragment.
      // The fragment is NEVER sent to the server.
      const payload = btoa(JSON.stringify(keys));

      // Load the relay page. It writes to sessionStorage on cp.hda0.net
      // and redirects to /login automatically.
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
    const privBytes = new Uint8Array(privkeyHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));

    return {
      signingKey: Array.from(privBytes), // Ed25519 secret key (64 bytes) as plain array
      publicKey: pubkeyBase58 // Saito base58 public key (for username derivation)
    };
  }

  // ---------------------------------------------------------------------------
  // iframe management
  // ---------------------------------------------------------------------------

  _loadIframe(url) {
    const iframe = document.getElementById('docs-iframe');
    if (!iframe) return;

    iframe.addEventListener(
      'load',
      () => {
        this._hideStatus();
      },
      { once: true }
    );

    iframe.src = url;
  }

  // ---------------------------------------------------------------------------
  // Strip header — tap/click to expand on touch devices
  // ---------------------------------------------------------------------------

  _attachStripEvents() {
    const header = document.getElementById('saito-header');
    if (!header || header._docsEventsAttached) return;
    header._docsEventsAttached = true;

    header.addEventListener('click', (e) => {
      // Toggle expanded state on click (for touch devices where hover doesn't work)
      if (!header.classList.contains('docs-expanded')) {
        header.classList.add('docs-expanded');
      } else if (e.target === header || e.target.closest('#saito-header') === header) {
        // Click on the header itself (not inner controls) collapses it
        header.classList.remove('docs-expanded');
      }
    });

    // Click outside header collapses it
    document.addEventListener('click', (e) => {
      if (
        !e.target.closest('#saito-header') &&
        !e.target.closest('.saito-header-hamburger-contents')
      ) {
        header.classList.remove('docs-expanded');
      }
    });
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
  // webServer — serve the HTML page + static assets
  //
  // modtemplate.webServer only serves static OR HTML, not both.
  // We need both: static assets from web/ (CSS, images) AND the HTML shell.
  // Same pattern as RedSquare, Vault, Stack.
  // ---------------------------------------------------------------------------

  webServer(app, expressapp, express) {
    const webdir = `${__dirname}/web`;
    const slug = encodeURI(this.returnSlug());
    const mod_self = this;

    // 1. Static assets from web/ FIRST, but with redirect disabled
    //    so express.static doesn't redirect /docs → /docs/ for the directory
    expressapp.use('/' + slug, express.static(webdir, { redirect: false }));

    // 2. HTML page at /docs and /docs/
    expressapp.get(['/' + slug, '/' + slug + '/'], (req, res) => {
      const html = HomePage(app, mod_self, app.build_number, mod_self.social || {});
      if (!res.finished) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(html);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // respondTo — register "Docs" in the Saito header nav on other pages
  // ---------------------------------------------------------------------------
  /*
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
*/
}
module.exports = Docs;
