const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaveLaterTemplate = require('./save-later.template');
const { applyPublishOverlayShell } = require('./overlay.shell');
const { lockingView } = require('../script_build');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatScriptForDisplay(script) {
  return JSON.stringify(script, null, 2);
}

class SaveLaterFlow {
  constructor(app, mod, mainUi) {
    this.app = app;
    this.mod = mod;
    this.mainUi = mainUi;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.class = 'saito-overlay rs-publish-overlay-shell';
    this.overlay.clickBackdropToClose = true;
    this.overlay.nonBlocking = false;
    this.open = false;

    this.onEscapeKey = (event) => {
      if (event.key === 'Escape' && this.open) {
        this.hide();
      }
    };
  }

  openOverlay() {
    const locking = lockingView(this.mod.getScript());
    this.open = true;
    this.show(
      SaveLaterTemplate.saveOverlay({
        scriptDisplay: escapeHtml(formatScriptForDisplay(locking))
      })
    );
    this.bindEvents();
  }

  show(html) {
    document.body.classList.add('rs-publish-modal-open');
    this.overlay.show(html);
    applyPublishOverlayShell(this.overlay);
    document.addEventListener('keydown', this.onEscapeKey);
  }

  hide() {
    this.open = false;
    document.body.classList.remove('rs-publish-modal-open');
    document.removeEventListener('keydown', this.onEscapeKey);
    this.overlay.hide();
  }

  bindEvents() {
    const root = document.querySelector('.rs-save-later');
    if (!root) {
      return;
    }

    root.querySelector('[data-action="save-later-download"]')?.addEventListener('click', () => {
      try {
        const locking = lockingView(this.mod.getScript());
        this.mod.exportScriptDraft(locking);
      } catch (_err) {
        /* export failed */
      }
    });

    root.querySelector('[data-action="save-later-home"]')?.addEventListener('click', () => {
      this.hide();
      this.mainUi?.welcomeOverlay?.render('splash');
    });
  }
}

module.exports = SaveLaterFlow;
