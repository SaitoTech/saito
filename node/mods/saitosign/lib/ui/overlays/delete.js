const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const DeleteTemplate = require('./delete.template');

class DeletePrompt {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-overlay';
    this.hooks = {};
    this.alive = false;
  }

  render(view = {}, hooks = {}) {
    this.hooks = hooks;
    this.alive = true;
    this.overlay.show(DeleteTemplate(view), () => {
      if (!this.alive) {
        return;
      }
      this.alive = false;
      if (this.hooks.onDismiss) {
        this.hooks.onDismiss();
      }
    });
    this.bind();
  }

  bind() {
    const form = document.querySelector('.saitosign-delete');
    if (!form) {
      return;
    }

    form.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-delete-scope]');
      if (choice) {
        event.preventDefault();
        this.choose(choice.dataset.deleteScope);
        return;
      }
      if (event.target.closest('[data-delete-cancel]')) {
        event.preventDefault();
        this.close();
      }
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
    });
  }

  choose(scope) {
    if (!this.alive) {
      return;
    }
    if (scope !== 'all' && scope !== 'document' && scope !== 'instance') {
      return;
    }
    this.alive = false;
    const onChoose = this.hooks.onChoose;
    this.overlay.close();
    if (onChoose) {
      onChoose(scope);
    }
  }

  close() {
    this.overlay.close();
  }
}

module.exports = DeletePrompt;
