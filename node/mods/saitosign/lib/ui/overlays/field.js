const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const FieldTemplate = require('./field.template');

class FieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-overlay';
    this.hooks = {};
  }

  render(view, hooks = {}) {
    this.hooks = hooks;
    this.view = view;
    this.overlay.show(FieldTemplate(view), () => {
      this.unbindKeys();
      if (this.hooks.onClose) {
        this.hooks.onClose();
      }
    });
    this.attachEvents();
    this.bindKeys();
  }

  close() {
    this.unbindKeys();
    this.overlay.close();
  }

  bindKeys() {
    this.unbindKeys();
    this.onKeyDown = (event) => {
      if (event.key !== 'Enter' || event.isComposing) {
        return;
      }
      const form = document.querySelector('.saitosign-field');
      if (!form || !form.isConnected) {
        return;
      }
      const target = event.target;
      if (target && target.closest && target.closest('.saito-overlay-closebox')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    };
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  unbindKeys() {
    if (!this.onKeyDown) {
      return;
    }
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.onKeyDown = null;
  }

  attachEvents() {
    const form = document.querySelector('.saitosign-field');
    if (!form) {
      return;
    }

    const signer_select = form.querySelector('[data-field-signer]');
    const extra = form.querySelector('.new-signer');
    const refreshMode = () => {
      const button = form.querySelector('.actions button.primary');
      const view = this.view;
      if (!button || !view?.can_sign) {
        return;
      }
      const type = form.querySelector('[data-field-type]')?.value;
      const chosen = signer_select.value;
      const sign =
        !view.already_signed &&
        (type === 'signature' || type === 'initial') &&
        chosen === String(view.sign_index);
      button.textContent = sign ? 'Sign' : 'Confirm';
      button.dataset.mode = sign ? 'sign' : 'confirm';
    };

    const preview = () => {
      if (this.hooks.onPreview) {
        this.hooks.onPreview(form);
      }
    };

    signer_select.addEventListener('change', () => {
      extra.hidden = signer_select.value !== 'new';
      showError(form, '');
      refreshMode();
      preview();
      if (!extra.hidden) {
        form.querySelector('[data-signer-name]')?.focus();
      }
    });
    form.querySelector('[data-field-type]')?.addEventListener('change', () => {
      refreshMode();
      preview();
    });

    if (!extra.hidden) {
      form.querySelector('[data-signer-name]')?.focus();
    }

    const remove = form.querySelector('[data-remove-field]');
    if (remove) {
      remove.onclick = () => {
        if (this.hooks.onRemove) {
          this.hooks.onRemove();
        }
      };
    }

    const commit = async (event) => {
      event.preventDefault();
      if (form.dataset.saving === '1') {
        return;
      }
      form.dataset.saving = '1';
      const mode = form.querySelector('.actions button.primary')?.dataset.mode;
      if (mode !== 'sign' && signer_select.value === 'new') {
        const name = form.querySelector('[data-signer-name]')?.value.trim();
        const email = form.querySelector('[data-signer-email]')?.value.trim();
        if (!name || !email) {
          showError(form, 'Enter a name and email for the new signer.');
          form.dataset.saving = '';
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showError(form, 'Enter a valid email address.');
          form.dataset.saving = '';
          return;
        }
      }
      showError(form, '');
      let saved = false;
      try {
        if (mode === 'sign' && this.hooks.onSign) {
          saved = await this.hooks.onSign();
        } else if (this.hooks.onSave) {
          saved = this.hooks.onSave(form);
        }
      } catch (err) {
        saved = false;
      }
      if (!saved) {
        form.dataset.saving = '';
      }
    };

    form.addEventListener('submit', commit);
    const place = form.querySelector('.actions button.primary');
    if (place) {
      place.addEventListener('click', commit);
    }
  }
}

function showError(form, message) {
  const slot = form.querySelector('[data-form-error]');
  if (!slot) {
    return;
  }
  slot.hidden = !message;
  slot.textContent = message || '';
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = FieldOverlay;
