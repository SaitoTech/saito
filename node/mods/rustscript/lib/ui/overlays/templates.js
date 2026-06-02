const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const TemplatesTemplate = require('./templates.template');

class TemplatesOverlay {
  constructor(app, mod, main) {
    this.app = app;
    this.mod = mod;
    this.main = main;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.templates = buildTemplates();
  }

  render() {
    this.overlay.show(TemplatesTemplate(this.templates));
    this.attachEvents();
  }

  attachEvents() {
    const host = this.overlay.overlay || document;

    host.querySelectorAll('.rustscript-template').forEach((btn) => {
      btn.onclick = () => {
        const tpl = this.templates.find((t) => t.id === btn.dataset.templateId);
        if (tpl && this.main) {
          this.main.loadTemplate(tpl.locking);
        }
        this.overlay.hide();
      };
    });

    const root = host.querySelector('.rustscript-templates');
    if (root) {
      root.querySelectorAll('.rustscript-button').forEach((btn) => {
        if (btn.textContent.trim() === 'Close') {
          btn.onclick = () => {
            this.overlay.hide();
          };
        }
      });
    }
  }
}

function buildTemplates() {
  return [
    {
      id: 'checksig',
      name: 'Signature check',
      description: 'Require a valid signature on a message.',
      locking: {
        op: 'CHECKSIG',
        msg: '<msg>',
        publickey: '<publickey>'
      }
    },
    {
      id: 'checkhash',
      name: 'Hash lock',
      description: 'Unlock when a preimage matches a hash.',
      locking: {
        op: 'CHECKHASH',
        hash: '<hash>',
        input: '<input>'
      }
    },
    {
      id: 'checkmultisig',
      name: 'Multisig',
      description: 'M-of-N signatures.',
      locking: {
        op: 'CHECKMULTISIG',
        m: 2,
        publickeys: ['<publickey>', '<publickey>'],
        msg: '<msg>'
      }
    },
    {
      id: 'checktime',
      name: 'Timed release',
      description: 'Unlock after a timestamp.',
      locking: {
        op: 'CHECKTIME',
        timestamp: '<timestamp>'
      }
    }
  ];
}

module.exports = TemplatesOverlay;
