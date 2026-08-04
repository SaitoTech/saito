const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ImportContinueUnlockTemplate = require('./import-continue-unlock.template');
const { applyPublishOverlayShell } = require('./overlay.shell');
const { parseTransactionFile } = require('../../transaction_io');
const { bindDropzone } = require('./import-dropzone');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Minimum spinner visibility — deliberate processing feedback. */
const MIN_LOAD_MS = 1500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Import an in-progress unlock transaction into the existing Unlock workspace.
 * Initialization differs from locking-tx import; the workspace does not.
 */
class ContinueUnlockImportFlow {
  constructor(app, mod, mainUi) {
    this.app = app;
    this.mod = mod;
    this.mainUi = mainUi;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.overlay.class = 'saito-overlay rs-publish-overlay-shell';
    this.overlay.clickBackdropToClose = true;
    this.overlay.nonBlocking = false;

    this.step = null;
    this.errorMessage = '';
    this.blockedRoot = null;
    this._processing = false;

    this.onEscapeKey = (event) => {
      if (event.key === 'Escape' && this.step && this.step !== 'loading') {
        this.hide();
      }
    };
  }

  open() {
    this.errorMessage = '';
    this.step = 'idle';
    this.show(ImportContinueUnlockTemplate.idleOverlay());
    this.bindIdleEvents();
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
    this.applyOverlayLayout();
  }

  hide() {
    if (this.step) {
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
    this.step = null;
    this._processing = false;
  }

  applyOverlayLayout() {
    applyPublishOverlayShell(this.overlay);
  }

  bindIdleEvents() {
    const root = document.querySelector(
      '.rs-import-continue-unlock-overlay:not(.rs-import-loading)'
    );
    if (!root) {
      return;
    }

    bindDropzone(root, {
      onFile: (file) => this.readAndProcessFile(file)
    });
  }

  readAndProcessFile(file) {
    if (this._processing) {
      return;
    }
    this._processing = true;

    const reader = new FileReader();
    reader.addEventListener('error', () => {
      this._processing = false;
      this.errorMessage = 'Could not read the selected file.';
      this.step = 'idle';
      this.show(ImportContinueUnlockTemplate.idleOverlay({ error: escapeHtml(this.errorMessage) }));
      this.bindIdleEvents();
    });
    reader.addEventListener('load', (event) => {
      const text = event.target?.result;
      this.processFileText(text);
    });
    reader.readAsText(file);
  }

  async processFileText(text) {
    this.step = 'loading';
    this.show(ImportContinueUnlockTemplate.loadingOverlay());

    let error = null;
    try {
      const tx = parseTransactionFile(this.app, text);
      await this.mod.loadUnlockContinuation(tx);
      await delay(MIN_LOAD_MS);
      this.hide();
    } catch (err) {
      error = err?.message || 'Could not load unlock transaction.';
      await delay(MIN_LOAD_MS);
      this._processing = false;
      this.errorMessage = error;
      this.step = 'idle';
      this.show(ImportContinueUnlockTemplate.idleOverlay({ error: escapeHtml(this.errorMessage) }));
      this.bindIdleEvents();
    } finally {
      if (this.step !== 'idle') {
        this._processing = false;
      }
    }
  }
}

module.exports = ContinueUnlockImportFlow;
