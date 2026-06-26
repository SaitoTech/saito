const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PublicKeyFieldTemplate = require('./publickey.template');
const { isPlaceholder } = require('../../script_build');

class PublicKeyFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.currentValue = '';
    this.onApply = null;
  }

  render() {
    const value = isPlaceholder(this.currentValue) ? '' : String(this.currentValue ?? '');
    this.overlay.show(PublicKeyFieldTemplate(value));
    this.attachEvents();
  }

  attachEvents() {
    const host = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    const root = host?.querySelector('.rs-prompt-publickey-panel');
    const input = root?.querySelector('.rs-prompt-publickey-input');
    if (!root || !input) {
      return;
    }

    input.focus({ preventScroll: true });

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

    input.addEventListener('input', clearError);

    root.querySelector('.rs-prompt-use-mine')?.addEventListener('click', async () => {
      try {
        let pk = '';
        if (typeof this.app.wallet?.getPublicKey === 'function') {
          pk = await this.app.wallet.getPublicKey();
        } else if (typeof this.app.wallet?.returnPublicKey === 'function') {
          pk = this.app.wallet.returnPublicKey();
        }
        input.value = String(pk || '');
        clearError();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      } catch (err) {
        showError(err.message || 'Could not read wallet public key');
      }
    });

    root.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
      const next = String(input.value ?? '').trim();
      if (!next || isPlaceholder(next)) {
        showError('A value is required');
        return;
      }
      const ok =
        (this.app?.crypto?.isPublicKey && this.app.crypto.isPublicKey(next)) ||
        (/^[A-HJ-NP-Za-km-z1-9]+$/.test(next) && next.length >= 40 && next.length <= 50);
      if (!ok) {
        showError('Expected a Saito public key');
        return;
      }
      clearError();
      if (typeof this.onApply === 'function') {
        this.onApply(next);
      }
      this.overlay.hide();
    });
  }
}

module.exports = PublicKeyFieldOverlay;
