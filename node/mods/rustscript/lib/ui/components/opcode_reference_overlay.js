const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const OpcodeReference = require('./opcode_reference');

class OpcodeReferenceOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.doc = new OpcodeReference(app, mod);
    this.selectedKey = null;
  }

  open(initialKey) {
    this.selectedKey = initialKey ? String(initialKey).toLowerCase() : null;
    const html = `
      <div class="rustscript-overlay rs-opcode-ref-overlay">
        <div class="rs-opcode-ref-overlay-head">
          <h2 class="rs-opcode-ref-overlay-title">Opcode Reference</h2>
          <select class="rs-opcode-ref-overlay-select" aria-label="Select opcode"></select>
        </div>
        <div class="rs-opcode-ref-overlay-body" aria-live="polite"></div>
      </div>
    `;

    this.overlay.show(html);
    this.populateSelect();
    this.bindEvents();

    if (this.selectedKey) {
      this.selectOpcode(this.selectedKey);
    } else {
      const first = this.doc.getSortedOpcodes()[0];
      if (first) {
        this.selectOpcode(first.name.toLowerCase());
      }
    }
  }

  populateSelect() {
    const select = document.querySelector('.rs-opcode-ref-overlay-select');
    if (!select) {
      return;
    }

    select.innerHTML = '';
    for (const op of this.doc.getSortedOpcodes()) {
      const opt = document.createElement('option');
      const key = op.name.toLowerCase();
      opt.value = key;
      opt.textContent = op.name;
      select.appendChild(opt);
    }

    if (this.selectedKey) {
      select.value = this.selectedKey;
    }
  }

  bindEvents() {
    document.querySelector('.rs-opcode-ref-overlay-select')?.addEventListener('change', (e) => {
      const key = e.target.value;
      if (key) {
        this.selectOpcode(key);
      }
    });
  }

  selectOpcode(key) {
    const normalized = String(key || '').toLowerCase();
    const op = this.mod.opcodes?.[normalized];
    if (!op) {
      return;
    }
    this.selectedKey = normalized;
    const select = document.querySelector('.rs-opcode-ref-overlay-select');
    if (select) {
      select.value = normalized;
    }

    const body = document.querySelector('.rs-opcode-ref-overlay-body');
    if (!body) {
      return;
    }

    body.innerHTML = this.doc.buildDetailHtml(op);
  }
}

module.exports = OpcodeReferenceOverlay;
