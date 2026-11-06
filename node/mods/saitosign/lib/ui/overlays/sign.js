const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SignTemplate = require('./sign.template');

class SignOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-overlay';
    this.hooks = {};
    this.busy = false;
  }

  render(view, hooks = {}) {
    this.hooks = hooks;
    this.busy = false;
    this.overlay.show(SignTemplate(view), () => {
      if (this.hooks.onClose) {
        this.hooks.onClose();
      }
    });
    const form = document.querySelector('.saitosign-sign');
    if (!form) {
      return;
    }
    this.form = form;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.busy) {
        return;
      }
      this.busy = true;
      this.showSigning(form);
      waitForPaint()
        .then(() => Promise.resolve(this.hooks.onSign ? this.hooks.onSign() : false))
        .then((saved) => {
          if (saved) {
            return;
          }
          this.busy = false;
          this.showIdle(form, this.signError());
        })
        .catch((err) => {
          this.busy = false;
          this.showIdle(form, err?.message || 'Could not sign this item. Please try again.');
        });
    });
    form.querySelector('[data-sign-all]')?.addEventListener('click', () => {
      if (this.busy) {
        return;
      }
      this.busy = true;
      this.setProgress('Signing…');
      waitForPaint()
        .then(() => Promise.resolve(this.hooks.onSignAll ? this.hooks.onSignAll() : false))
        .then((saved) => {
          if (saved) {
            return;
          }
          this.busy = false;
          this.showIdle(form, this.signError());
        })
        .catch((err) => {
          this.busy = false;
          this.showIdle(form, err?.message || 'Could not sign the remaining pages. Please try again.');
        });
    });
  }

  setProgress(label) {
    const form = this.form;
    if (!form) {
      return;
    }
    const error = form.querySelector('[data-sign-error]');
    if (error) {
      error.textContent = '';
    }
    const sign = form.querySelector('[data-sign-button]');
    if (sign) {
      sign.disabled = true;
    }
    const all = form.querySelector('[data-sign-all]');
    if (!all) {
      return;
    }
    all.disabled = true;
    all.setAttribute('aria-busy', 'true');
    all.replaceChildren(spinner(), document.createTextNode(label));
  }

  signError() {
    return this.mod?.main?.workspace?.sign_error
      || 'Could not sign this item. Please try again.';
  }

  showSigning(form) {
    const button = form.querySelector('[data-sign-button]');
    const error = form.querySelector('[data-sign-error]');
    if (error) {
      error.textContent = '';
    }
    if (!button) {
      return;
    }
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.replaceChildren(spinner(), document.createTextNode('Signing Document'));
    const all = form.querySelector('[data-sign-all]');
    if (all) {
      all.disabled = true;
    }
  }

  showIdle(form, message) {
    const button = form.querySelector('[data-sign-button]');
    const error = form.querySelector('[data-sign-error]');
    if (error) {
      error.textContent = message || '';
    }
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'Sign';
    }
    const all = form.querySelector('[data-sign-all]');
    if (!all) {
      return;
    }
    all.disabled = false;
    all.removeAttribute('aria-busy');
    all.textContent = 'Sign All Pages';
  }

  close() {
    this.overlay.close();
  }
}

function spinner() {
  const node = document.createElement('span');
  node.className = 'spinner';
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

module.exports = SignOverlay;
