const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ImportTemplate = require('./import.template');
const { applyPublishOverlayShell } = require('./overlay.shell');
const { parseTransactionFile } = require('../../transaction_io');

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

    this.onEscapeKey = (event) => {
      if (event.key === 'Escape' && this.step && this.step !== 'loading') {
        this.hide();
      }
    };
  }

  open() {
    this.errorMessage = '';
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
    const root = document.querySelector('.rs-import-overlay:not(.rs-import-loading)');
    if (!root) {
      return;
    }

    const dropZone = root.querySelector('#rs-import-drop-zone');
    const fileInput = root.querySelector('.rs-import-file-input');

    const setDragActive = (active) => {
      dropZone?.classList.toggle('is-dragover', active);
    };

    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    dropZone?.addEventListener('dragenter', (e) => {
      prevent(e);
      setDragActive(true);
    });
    dropZone?.addEventListener('dragover', (e) => {
      prevent(e);
      setDragActive(true);
    });
    dropZone?.addEventListener('dragleave', (e) => {
      prevent(e);
      setDragActive(false);
    });
    dropZone?.addEventListener('drop', (e) => {
      prevent(e);
      setDragActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        this.readAndProcessFile(file);
      }
    });

    dropZone?.addEventListener('click', () => {
      fileInput?.click();
    });
    dropZone?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput?.click();
      }
    });

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        this.readAndProcessFile(file);
      }
      fileInput.value = '';
    });

    root.querySelector('[data-action="import-p2sh-link"]')?.addEventListener('click', () => {
      alert('P2SH link import is coming soon.');
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
      this.hide();
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
