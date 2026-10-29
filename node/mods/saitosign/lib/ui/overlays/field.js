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
      const form = document.querySelector('.saitosign-field');
      if (!form || !form.isConnected || event.isComposing) {
        return;
      }
      const target = event.target;
      if (target && target.closest && target.closest('.saito-overlay-closebox')) {
        return;
      }

      if (event.key === 'Delete') {
        if (isTypingTarget(target) || !this.view?.existing || !this.view?.editable || !this.hooks.onRemove) {
          return;
        }
        if (form.dataset.deleting === '1') {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        form.dataset.deleting = '1';
        Promise.resolve(
          typeof sconfirm === 'function' ? sconfirm('Delete this?') : window.confirm('Delete this?')
        )
          .then((confirmed) => {
            if (confirmed && this.hooks.onRemove) {
              this.hooks.onRemove();
            }
          })
          .finally(() => {
            form.dataset.deleting = '';
          });
        return;
      }

      if (event.key !== 'Enter') {
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
    const type_select = form.querySelector('[data-field-type]');
    const extra = form.querySelector('.new-signer');
    const refreshMode = () => {
      const button = form.querySelector('.actions button.primary');
      const view = this.view;
      if (!button || !view?.can_sign) {
        return;
      }
      const type = type_select?.value;
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

    const refreshDisclosure = () => {
      const ready = signerReady(form);
      const what = form.querySelector('.what');
      if (what) {
        what.hidden = !ready;
      }
      if (type_select && !ready) {
        type_select.value = '';
      }
      refreshDetails(form);
      refreshMode();
      preview();
    };

    signer_select.addEventListener('change', () => {
      extra.hidden = signer_select.value !== 'new';
      showError(form, '');
      refreshDisclosure();
      if (!extra.hidden) {
        form.querySelector('[data-signer-name]')?.focus();
      }
    });

    form.querySelector('[data-signer-name]')?.addEventListener('input', () => {
      showError(form, '');
      refreshDisclosure();
    });
    form.querySelector('[data-signer-email]')?.addEventListener('input', () => {
      showError(form, '');
      refreshDisclosure();
    });

    type_select?.addEventListener('change', () => {
      showError(form, '');
      refreshDetails(form);
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
      if (mode !== 'sign') {
        const problem = validateFieldForm(form);
        if (problem) {
          showError(form, problem);
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

function signerReady(form) {
  const chosen = form.querySelector('[data-field-signer]')?.value;
  if (chosen === 'new') {
    const name = form.querySelector('[data-signer-name]')?.value.trim() || '';
    const email = form.querySelector('[data-signer-email]')?.value.trim() || '';
    return Boolean(name && isEmailAddress(email));
  }
  return chosen !== '' && chosen != null;
}

function refreshDetails(form) {
  const details = form.querySelector('[data-field-details]');
  const every = form.querySelector('[data-every-page]');
  const type = form.querySelector('[data-field-type]')?.value;
  const typeSelect = form.querySelector('[data-field-type]');
  const what = form.querySelector('.what');
  const allow = Boolean(every) && !what?.hidden && (type === 'signature' || type === 'initial');
  if (!details) {
    return;
  }
  details.hidden = !allow;
  if (!allow && every) {
    every.checked = false;
  }
}

function validateFieldForm(form) {
  const chosen = form.querySelector('[data-field-signer]')?.value;
  if (chosen === 'new') {
    const name = form.querySelector('[data-signer-name]')?.value.trim() || '';
    const email = form.querySelector('[data-signer-email]')?.value.trim() || '';
    if (!name || !email) {
      return 'Enter a name and email for the new signer.';
    }
    if (!isEmailAddress(email)) {
      return 'Enter a valid email address.';
    }
  } else if (chosen === '' || chosen == null) {
    return 'Choose who this field is for.';
  }

  const what = form.querySelector('.what');
  const typeSelect = form.querySelector('[data-field-type]');
  if (!typeSelect || what?.hidden) {
    return 'Choose who this field is for before selecting a field type.';
  }
  const type = typeSelect.value;
  if (type !== 'signature' && type !== 'date' && type !== 'initial') {
    return 'Please choose what this user should do.';
  }
  return '';
}

function showError(form, message) {
  const slot = form.querySelector('[data-form-error]');
  if (!slot) {
    return;
  }
  slot.hidden = !message;
  slot.textContent = message || '';
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isTypingTarget(target) {
  if (!target) {
    return false;
  }
  if (typeof target.matches === 'function' && target.matches('input, textarea, select')) {
    return true;
  }
  return Boolean(target.closest && target.closest('input, textarea, select'));
}

module.exports = FieldOverlay;
