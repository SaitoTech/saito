const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PostPublishTemplate = require('./post-publish.template');
const { applyPublishOverlayShell } = require('./overlay.shell');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class PostPublishFlow {
  constructor(app, mod, mainUi) {
    this.app = app;
    this.mod = mod;
    this.mainUi = mainUi;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.class = 'saito-overlay rs-publish-overlay-shell';
    this.overlay.clickBackdropToClose = true;
    this.overlay.nonBlocking = false;

    this.open = false;
    this.publishedTx = null;
    this.p2shAddress = '';
    this.p2shHash = '';
    this.p2shLink = '';
    this.blockedRoot = null;

    this.onEscapeKey = (event) => {
      if (event.key === 'Escape' && this.open) {
        this.hide();
      }
    };
  }

  /**
   * Final hand-off after on-chain confirmation — not part of the publish wizard.
   */
  openOverlay({ tx = null, p2shAddress = '', p2shHash = '' } = {}) {
    this.publishedTx = tx;
    this.p2shAddress = p2shAddress || '';
    this.p2shHash = p2shHash || '';
    this.p2shLink =
      typeof this.mod.buildP2shShareLink === 'function'
        ? this.mod.buildP2shShareLink({
            p2shHash: this.p2shHash,
            p2shAddress: this.p2shAddress
          })
        : this.p2shAddress;

    this.open = true;
    this.show(
      PostPublishTemplate.overlay({
        p2shLink: escapeHtml(this.p2shLink)
      })
    );
    this.bindEvents();
  }

  show(html) {
    document.body.classList.add('rs-publish-modal-open');
    this.blockedRoot = document.querySelector('main.rustscript');
    if (this.blockedRoot) {
      this.blockedRoot.inert = true;
    }
    document.addEventListener('keydown', this.onEscapeKey);
    this.overlay.show(html, () => {
      this.onOverlayClosed();
    });
    applyPublishOverlayShell(this.overlay);
  }

  hide() {
    if (this.open) {
      this.overlay.close();
    }
  }

  onOverlayClosed() {
    document.body.classList.remove('rs-publish-modal-open');
    document.removeEventListener('keydown', this.onEscapeKey);
    if (this.blockedRoot) {
      this.blockedRoot.inert = false;
      this.blockedRoot = null;
    }
    this.open = false;
    this.publishedTx = null;
    this.p2shAddress = '';
    this.p2shHash = '';
    this.p2shLink = '';
  }

  bindEvents() {
    const root = document.querySelector('.rs-post-publish');
    if (!root) {
      return;
    }

    root.querySelector('[data-action="post-publish-download"]')?.addEventListener('click', () => {
      const tx = this.publishedTx;
      if (!tx) {
        return;
      }
      try {
        this.mod.exportTransaction(tx, { prefix: 'rustscript-tx' });
      } catch (_err) {
        /* export failed */
      }
    });

    root.querySelector('.rs-post-publish-link')?.addEventListener('focus', (event) => {
      event.target.select?.();
    });

    root
      .querySelector('[data-action="post-publish-copy-link"]')
      ?.addEventListener('click', async () => {
        const btn = root.querySelector('[data-action="post-publish-copy-link"]');
        const link =
          root.querySelector('.rs-post-publish-link')?.value || this.p2shLink || this.p2shAddress;
        if (!link || !btn) {
          return;
        }
        try {
          await navigator.clipboard.writeText(link);
          btn.classList.add('is-copied');
          const icon = btn.querySelector('.rs-copy-btn-icon');
          if (icon) {
            icon.classList.remove('fa-copy');
            icon.classList.add('fa-check');
          }
          window.clearTimeout(this._copyResetTimer);
          this._copyResetTimer = window.setTimeout(() => {
            btn.classList.remove('is-copied');
            if (icon) {
              icon.classList.remove('fa-check');
              icon.classList.add('fa-copy');
            }
          }, 1400);
        } catch (_err) {
          /* clipboard unavailable */
        }
      });
  }
}

module.exports = PostPublishFlow;
