const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ImportTemplate = require('./import.template');
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

class ImportFlow {
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
    this._completed = false;

    this.onEscapeKey = (event) => {
      if (event.key === 'Escape' && this.step && this.step !== 'loading') {
        this.hide();
      }
    };
  }

  open() {
    this.errorMessage = '';
    this._completed = false;
    this.step = 'idle';
    this.show(ImportTemplate.idleOverlay());
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

  hide({ completed = false } = {}) {
    if (completed) {
      this._completed = true;
    }
    if (this.step) {
      this.overlay.close();
    }
  }

  onOverlayClosed() {
    const returnToImportMenu = this.step != null && !this._completed;
    document.body.classList.remove('rs-publish-modal-open');
    document.removeEventListener('keydown', this.onEscapeKey);
    if (this.blockedRoot) {
      this.blockedRoot.inert = false;
      this.blockedRoot = null;
    }
    this.step = null;
    this._processing = false;
    this._completed = false;
    if (returnToImportMenu) {
      this.mainUi?.welcomeOverlay?.render('import-choice');
    }
  }

  applyOverlayLayout() {
    applyPublishOverlayShell(this.overlay);
  }

  bindIdleEvents() {
    const root = document.querySelector('.rs-import-overlay:not(.rs-import-loading):not(.rs-import-script-overlay)');
    if (!root) {
      return;
    }

    bindDropzone(root, {
      onFile: (file) => this.readAndProcessFile(file)
    });

    root.querySelector('[data-action="import-p2sh-link"]')?.addEventListener('click', () => {
      if (this._processing) {
        return;
      }
      const input = root.querySelector('.rs-import-p2sh-input');
      const raw = String(input?.value || '').trim();
      if (!raw) {
        this.errorMessage = 'Paste a P2SH link to import.';
        this.step = 'idle';
        this.show(ImportTemplate.idleOverlay({ error: escapeHtml(this.errorMessage) }));
        this.bindIdleEvents();
        return;
      }
      this.processP2shLink(raw);
    });
  }

  async processP2shLink(rawLink) {
    if (this._processing) {
      return;
    }
    this._processing = true;
    this.step = 'loading';
    this.show(ImportTemplate.loadingOverlay());

    let error = null;
    try {
      await this.mod.importP2shShareLink(rawLink);
      await delay(MIN_LOAD_MS);
      this.hide({ completed: true });
    } catch (err) {
      await delay(MIN_LOAD_MS);
      error = err?.message || 'Could not import P2SH link.';
      this._processing = false;
      this.errorMessage = error;
      this.step = 'idle';
      this.show(ImportTemplate.idleOverlay({ error: escapeHtml(this.errorMessage) }));
      this.bindIdleEvents();
    } finally {
      if (this.step !== 'idle') {
        this._processing = false;
      }
    }
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
      this.show(ImportTemplate.idleOverlay({ error: escapeHtml(this.errorMessage) }));
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
    this.show(ImportTemplate.loadingOverlay());

    let tx = null;
    let error = null;
    try {
      tx = parseTransactionFile(this.app, text);
    } catch (err) {
      error = err?.message || 'Could not parse transaction file.';
    }

    await delay(MIN_LOAD_MS);

    if (error) {
      this._processing = false;
      this.errorMessage = error;
      this.step = 'idle';
      this.show(ImportTemplate.idleOverlay({ error: escapeHtml(this.errorMessage) }));
      this.bindIdleEvents();
      return;
    }

    try {
      await this.mod.loadTransactionForWitness(tx);
      this.hide({ completed: true });
    } catch (err) {
      this._processing = false;
      this.errorMessage = err?.message || 'Could not load transaction into witness mode.';
      this.step = 'idle';
      this.show(ImportTemplate.idleOverlay({ error: escapeHtml(this.errorMessage) }));
      this.bindIdleEvents();
    } finally {
      if (this.step !== 'idle') {
        this._processing = false;
      }
    }
  }
}

module.exports = ImportFlow;
