const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const TextFieldTemplate = require('./text.template');
const { isPlaceholder } = require('../../script_build');

class TextFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.currentValue = '';
    this.onApply = null;
  }

  render() {
    const value = isPlaceholder(this.currentValue) ? '' : String(this.currentValue ?? '');
    this.overlay.show(TextFieldTemplate(value));
    this.attachEvents();
  }

  attachEvents() {
    const host = this.overlay.overlay || document;
    const root = host.querySelector('.rs-prompt-generic');
    const input = root?.querySelector('.rs-prompt-value');
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

    input.addEventListener('input', clearError);

    root.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
      const next = input.value ?? '';
      if (!next || isPlaceholder(next)) {
        showError('A value is required');
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

module.exports = TextFieldOverlay;
