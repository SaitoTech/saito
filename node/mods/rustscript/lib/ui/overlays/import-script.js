const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ImportScriptTemplate = require('./import-script.template');
const { applyPublishOverlayShell } = require('./overlay.shell');
const { parseTransactionFile } = require('../../transaction_io');
const { lockingView } = require('../script_build');
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
 * Extract the locking/access script from a Save-for-Later draft transaction export.
 */
function extractSavedScript(tx) {
  const txmsg = typeof tx.returnMessage === 'function' ? tx.returnMessage() : tx.msg || {};
  const accessScriptRaw =
    Array.isArray(txmsg.access_scripts) && txmsg.access_scripts.length > 0
      ? txmsg.access_scripts[0]
      : txmsg.access_script || txmsg.accessScript || '';

  if (!accessScriptRaw) {
    throw new Error('This file does not contain a saved script.');
  }

  let script;
  try {
    script =
      typeof accessScriptRaw === 'string' ? JSON.parse(accessScriptRaw) : accessScriptRaw;
  } catch (_err) {
    throw new Error('Saved script is not valid JSON.');
  }

  if (!script || typeof script !== 'object' || Array.isArray(script)) {
    throw new Error('Saved script is not a valid script object.');
  }

  return lockingView(script);
}

class ScriptImportFlow {
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
    this.show(ImportScriptTemplate.idleOverlay());
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
    const root = document.querySelector('.rs-import-script-overlay:not(.rs-import-loading)');
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
      this.show(ImportScriptTemplate.idleOverlay({ error: escapeHtml(this.errorMessage) }));
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
    this.show(ImportScriptTemplate.loadingOverlay());

    let locking = null;
    let error = null;
    try {
      const tx = parseTransactionFile(this.app, text);
      locking = extractSavedScript(tx);
    } catch (err) {
      error = err?.message || 'Could not parse saved script file.';
    }

    await delay(MIN_LOAD_MS);

    if (error) {
      this._processing = false;
      this.errorMessage = error;
      this.step = 'idle';
      this.show(ImportScriptTemplate.idleOverlay({ error: escapeHtml(this.errorMessage) }));
      this.bindIdleEvents();
      return;
    }

    try {
      if (typeof this.mod.resetUnlockWorkflow === 'function') {
        this.mod.resetUnlockWorkflow();
      } else {
        this.mod.workflow = 'create';
        this.mod.unlockContext = null;
      }
      this.mainUi.enterCreateGuided(locking);
      this.hide();
    } catch (err) {
      this._processing = false;
      this.errorMessage = err?.message || 'Could not load saved script.';
      this.step = 'idle';
      this.show(ImportScriptTemplate.idleOverlay({ error: escapeHtml(this.errorMessage) }));
      this.bindIdleEvents();
    } finally {
      if (this.step !== 'idle') {
        this._processing = false;
      }
    }
  }
}

module.exports = ScriptImportFlow;
