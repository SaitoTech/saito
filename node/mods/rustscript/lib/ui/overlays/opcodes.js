const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class OpcodeReference {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  getSortedOpcodes() {
    if (!this.mod.opcodes) {
      return [];
    }
    return Object.values(this.mod.opcodes)
      .map((handler) => handler?.opcode || handler)
      .filter((op) => op && op.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  buildDetailHtml(op) {
    const returns = this.returnsLine(op);
    const required = this.listRequiredFields(op);
    const example = this.compactExample(op);

    const requiredItems = required
      .map((f) => `<li><code>${this.escapeHtml(f)}</code></li>`)
      .join('');

    return `
      <div class="rs-ref-doc">
        <p class="rs-ref-lead">${this.escapeHtml(returns)}</p>
        ${
          required.length
            ? `
        <div class="rs-ref-section">
          <p class="rs-ref-section-label">Required fields:</p>
          <ul class="rs-ref-field-list">${requiredItems}</ul>
        </div>`
            : ''
        }
        ${
          example
            ? `
        <div class="rs-ref-section">
          <p class="rs-ref-section-label">Example:</p>
          <pre class="rs-ref-example">${this.escapeHtml(example)}</pre>
        </div>`
            : ''
        }
      </div>
    `;
  }

  listRequiredFields(op) {
    const fields = new Set();
    const witness = op.exampleScript?.witness;
    if (witness && typeof witness === 'object' && !Array.isArray(witness)) {
      Object.keys(witness).forEach((k) => fields.add(k));
    }
    return Array.from(fields).sort();
  }

  returnsLine(op) {
    const name = String(op.name || '').toUpperCase();
    if (name === 'CHECKSIG') {
      return 'Returns true if signature validates against message and publickey.';
    }
    if (name === 'IMPORTFIELD') {
      return 'Returns true if the signed witness value verifies, then stores it under key.';
    }
    if (name === 'IMPORTARRAY') {
      return 'Returns true if the signed witness array verifies, then stores it under key.';
    }
    if (name === 'SETFIELD') {
      return 'Returns true after copying value into a writable context.* destination.';
    }
    if (name === 'SETARRAY') {
      return 'Returns true after replacing a context location with a deep-cloned source array.';
    }
    if (name === 'SETARRAYFIELD') {
      return 'Returns true after writing a field on each destination object from a parallel source.';
    }
    if (name === 'ARRAYIFY') {
      return 'Returns true after replacing a context value with deep clones of itself.';
    }
    return 'Returns boolean — true when the opcode condition is satisfied.';
  }

  compactExample(op) {
    if (!op.exampleScript) {
      return '';
    }
    const sample = { ...op.exampleScript };
    delete sample.witness;
    delete sample.required;
    return JSON.stringify(sample, null, 2);
  }

  escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

class OpcodesOverlay {
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
      <div class="rustscript-overlay rs-overlay-panel rs-overlay-panel-wide rs-opcode-ref-overlay">
        <div class="rs-opcode-ref-overlay-head">
          <h2 class="rs-opcode-ref-overlay-title">Opcode Reference</h2>
          <select class="saito-form-select rs-opcode-ref-overlay-select" aria-label="Select opcode"></select>
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

  render() {
    this.open(null);
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
    const handler = this.mod.opcodes?.[normalized];
    const op = handler?.opcode || handler;
    if (!op || !op.name) {
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

module.exports = OpcodesOverlay;
