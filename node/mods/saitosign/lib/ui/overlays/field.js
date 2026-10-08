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
      if (target && target.closest && target.closest('[data-new-signer]')) {
        const create = form.querySelector('[data-create-signer]');
        if (create) {
          create.click();
          return;
        }
      }
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
      if (!button || !view?.existing || view.sign_index == null) {
        return;
      }
      const type = form.querySelector('[data-field-type]')?.value;
      const chosen = signer_select.value;
      const sign =
        !view.already_signed &&
        (type === 'signature' || type === 'initial') &&
        chosen === String(view.sign_index);
      button.textContent = sign ? 'Sign' : 'Update';
      button.dataset.mode = sign ? 'sign' : 'update';
    };

    signer_select.addEventListener('change', () => {
      extra.hidden = signer_select.value !== 'new';
      refreshMode();
      if (!extra.hidden) {
        form.querySelector('[data-new-signer]')?.focus();
      }
    });
    form.querySelector('[data-field-type]')?.addEventListener('change', refreshMode);

    const create = form.querySelector('[data-create-signer]');
    if (create) {
      create.onclick = () => {
        const name = form.querySelector('[data-new-signer]')?.value.trim();
        if (!name || !this.hooks.onCreateSigner) {
          return;
        }
        const added = this.hooks.onCreateSigner(name);
        if (!added || added.pending) {
          return;
        }
        if (added.existing) {
          signer_select.value = String(added.index);
          extra.hidden = true;
          form.querySelector('[data-new-signer]').value = '';
          return;
        }
        signer_select.insertAdjacentHTML(
          'beforeend',
          `<option value="${added.index}">${escapeHTML(added.name)}</option>`
        );
        const newest = signer_select.querySelector('option[value="new"]');
        signer_select.value = String(added.index);
        if (newest) {
          signer_select.appendChild(newest);
        }
        extra.hidden = true;
        form.querySelector('[data-new-signer]').value = '';
      };
    }

    if (!extra.hidden) {
      form.querySelector('[data-new-signer]')?.focus();
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

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = FieldOverlay;
