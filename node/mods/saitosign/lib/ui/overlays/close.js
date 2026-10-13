const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const CloseTemplate = require('./close.template');

class ClosePrompt {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-overlay';
    this.hooks = {};
    this.mode = 'ask';
    this.busy = false;
    this.alive = false;
  }

  render(hooks = {}) {
    this.hooks = hooks;
    this.mode = 'ask';
    this.busy = false;
    this.alive = true;
    this.overlay.show(CloseTemplate(this.mode, this.busy), () => {
      this.alive = false;
      if (this.hooks.onDismiss) {
        this.hooks.onDismiss();
      }
    });
    this.bind();
  }

  paint() {
    const form = document.querySelector('.saitosign-close');
    if (!form || !this.alive) {
      return;
    }
    form.outerHTML = CloseTemplate(this.mode, this.busy).trim();
    this.bind();
  }

  bind() {
    const form = document.querySelector('.saitosign-close');
    if (!form) {
      return;
    }
    form.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-close]');
      if (!choice || choice.disabled || this.busy) {
        return;
      }
      event.preventDefault();
      const action = choice.dataset.close;
      if (action === 'cancel') {
        this.overlay.close();
        return;
      }
      if (action === 'leave' && this.hooks.onLeave) {
        this.alive = false;
        this.overlay.close();
        this.hooks.onLeave();
        return;
      }
      if (action === 'export' && this.hooks.onExport) {
        this.busy = true;
        this.mode = 'exporting';
        this.paint();
        Promise.resolve(this.hooks.onExport())
          .then((saved) => {
            if (!this.alive) {
              return;
            }
            this.busy = false;
            this.mode = saved ? 'saved' : 'error';
            this.paint();
          })
          .catch(() => {
            if (!this.alive) {
              return;
            }
            this.busy = false;
            this.mode = 'error';
            this.paint();
          });
      }
    });
  }
}

module.exports = ClosePrompt;
