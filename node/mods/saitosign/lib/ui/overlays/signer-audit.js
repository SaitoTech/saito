const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const signerAuditTemplate = require('./signer-audit.template');
const { signerAudit } = require('./signer-audit.model');

class SignerAudit {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-audit-host';
    this.userIndex = null;
    this.viewer = null;
  }

  open(userIndex) {
    const view = signerAudit(this.app, this.mod.document, userIndex);
    if (!view) {
      return;
    }
    this.userIndex = view.index;
    this.viewer = null;
    this.overlay.show(this.markup(), () => {});
    this.bind();
  }

  markup() {
    const view = signerAudit(this.app, this.mod.document, this.userIndex);
    if (!view) {
      return '';
    }
    return signerAuditTemplate(view, this.viewer);
  }

  bind() {
    const root = document.querySelector('.saitosign-audit');
    if (!root || root.dataset.bound === '1') {
      return;
    }
    root.dataset.bound = '1';
    root.addEventListener('click', (event) => this.onClick(root, event));
  }

  refresh() {
    const root = document.querySelector('.saitosign-audit');
    if (!root) {
      return;
    }
    const holder = document.createElement('div');
    holder.innerHTML = this.markup();
    const next = holder.firstElementChild;
    if (!next) {
      return;
    }
    root.replaceWith(next);
    this.bind();
  }

  onClick(root, event) {
    const close = event.target.closest('[data-audit="close"]');
    if (close) {
      event.preventDefault();
      this.overlay.close();
      return;
    }

    const photo = event.target.closest('[data-audit-photo]');
    if (photo) {
      event.preventDefault();
      const choice = photo.dataset.auditPhoto;
      const view = signerAudit(this.app, this.mod.document, this.userIndex);
      const count = view?.images?.length || 0;
      if (choice === 'back') {
        this.viewer = null;
      } else if (choice === 'prev' && count) {
        this.viewer = (Number(this.viewer) - 1 + count) % count;
      } else if (choice === 'next' && count) {
        this.viewer = (Number(this.viewer) + 1) % count;
      } else if (Number.isInteger(Number(choice)) && view?.images?.[Number(choice)]) {
        this.viewer = Number(choice);
      }
      this.refresh();
      return;
    }

    const copy = event.target.closest('[data-audit-copy]');
    if (!copy) {
      return;
    }
    event.preventDefault();
    const source = root.querySelector(`[data-audit-value="${CSS.escape(copy.dataset.auditCopy)}"]`);
    const value = source?.textContent || '';
    if (!value) {
      return;
    }
    const done = () => {
      copy.textContent = 'Copied';
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(() => selectText(source));
      return;
    }
    selectText(source);
  }
}

function selectText(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

module.exports = SignerAudit;
