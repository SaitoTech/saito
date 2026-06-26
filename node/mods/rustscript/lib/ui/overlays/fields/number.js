const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const NumberFieldTemplate = require('./number.template');
const { isPlaceholder } = require('../../script_build');

class NumberFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.currentValue = '';
    this.title = 'Number';
    this.placeholder = '0';
    this.onApply = null;
  }

  render() {
    const raw = isPlaceholder(this.currentValue) ? '' : String(this.currentValue ?? '');
    this.overlay.show(
      NumberFieldTemplate({
        title: this.title,
        value: raw,
        placeholder: this.placeholder
      })
    );
    this.attachEvents();
  }

  attachEvents() {
    const host = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    const root = host?.querySelector('.rs-prompt-number-panel');
    const input = root?.querySelector('.rs-prompt-number-input');
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
      const next = String(input.value ?? '').trim();
      if (!next || isPlaceholder(next)) {
        showError('A value is required');
        return;
      }
      if (!/^-?\d+$/.test(next)) {
        showError('Expected an integer');
        return;
      }
      clearError();
      if (typeof this.onApply === 'function') {
        this.onApply(Number(next));
      }
      this.overlay.hide();
    });
  }
}

module.exports = NumberFieldOverlay;
