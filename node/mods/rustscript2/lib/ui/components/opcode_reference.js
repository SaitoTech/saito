class OpcodeReference {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  getSortedOpcodes() {
    if (!this.mod.opcodes) {
      return [];
    }
    return Object.values(this.mod.opcodes).sort((a, b) => a.name.localeCompare(b.name));
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
          <p class="rs-ref-section-label">Witness fields:</p>
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

    if (op.schema?.script && typeof op.schema.script === 'object') {
      Object.keys(op.schema.script).forEach((k) => fields.add(k));
    }
    if (op.schema?.required && typeof op.schema.required === 'object') {
      Object.keys(op.schema.required).forEach((k) => fields.add(`required.${k}`));
    }

    if (!fields.size && op.exampleScript) {
      Object.keys(op.exampleScript).forEach((k) => {
        if (k !== 'op') {
          fields.add(k);
        }
      });
    }
    if (op.exampleRequired) {
      Object.keys(op.exampleRequired).forEach((k) => fields.add(k));
    }

    return Array.from(fields).sort();
  }

  returnsLine(op) {
    const name = String(op.name || '').toUpperCase();
    if (name === 'CHECKSIG') {
      return 'Returns true if signature validates against message and publickey.';
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
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

module.exports = OpcodeReference;
