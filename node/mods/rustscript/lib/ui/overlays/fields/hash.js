const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const HashFieldTemplate = require('./hash.template');

class HashFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.liveHash = '';
    this.onApply = null;
  }

  render() {
    this.liveHash = '';
    this.overlay.show(HashFieldTemplate());
    this.attachEvents();
  }

  attachEvents() {
    const host = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    const root = host?.querySelector('.rs-prompt-hash');
    const input = root?.querySelector('.rs-prompt-hash-input');
    const output = root?.querySelector('.rs-prompt-hash-output');
    if (!root || !input) {
      return;
    }

    const validation = root.querySelector('.rs-prompt-validation');

    const showError = (message) => {
      if (!validation) {
        siteMessage(message);
        return;
      }
      validation.hidden = false;
      validation.textContent = message;
    };

    const clearError = () => {
      if (validation) {
        validation.hidden = true;
        validation.textContent = '';
      }
    };

    const refreshHash = () => {
      const text = input.value ?? '';
      if (!text.trim() || !this.app?.crypto?.hash) {
        this.liveHash = '';
        if (output) {
          output.textContent = '—';
        }
        return;
      }
      this.liveHash = this.app.crypto.hash(text);
      if (output) {
        output.textContent = this.liveHash;
      }
    };

    input.addEventListener('input', () => {
      clearError();
      refreshHash();
    });
    refreshHash();

    root.querySelector('.rs-prompt-copy-hash')?.addEventListener('click', async () => {
      if (!this.liveHash) {
        return;
      }
      try {
        await navigator.clipboard.writeText(this.liveHash);
        siteMessage('Hash copied');
      } catch (err) {
        siteMessage('Could not copy hash');
      }
    });

    root.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
      refreshHash();
      if (!this.liveHash) {
        showError('Enter text to hash — a digest will be generated above');
        return;
      }
      const digest = this.liveHash;
      if (!/^[0-9a-fA-F]{64}$/.test(digest)) {
        showError('Expected 64-character hex hash (Blake3)');
        return;
      }
      clearError();
      if (typeof this.onApply === 'function') {
        this.onApply(digest);
      }
      this.overlay.hide();
    });
  }
}

module.exports = HashFieldOverlay;
