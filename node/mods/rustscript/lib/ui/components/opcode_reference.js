class OpcodeReference {
  constructor(app, mod, options = {}) {
    this.app = app;
    this.mod = mod;
    this.onLoadExample = options.onLoadExample || null;
    this.mountEl = null;
    this.selectedKey = null;
  }

  mount(container) {
    this.mountEl = container;
    container.innerHTML = this.renderShell();
    this.bindEvents();
    this.populateOpcodeSelect();
  }

  renderShell() {
    return `
      <div class="rs-ref-root">
        <h3 class="rs-ref-title">Opcode Reference</h3>
        <select class="rs-ref-select" aria-label="Select opcode">
          <option value="" disabled selected>Select opcode…</option>
        </select>
        <div class="rs-ref-detail" aria-live="polite"></div>
      </div>
    `;
  }

  bindEvents() {
    this.mountEl?.querySelector('.rs-ref-select')?.addEventListener('change', (e) => {
      const key = e.target.value;
      if (key) {
        this.selectOpcode(key);
      }
    });
  }

  getSortedOpcodes() {
    if (!this.mod.opcodes) {
      return [];
    }
    return Object.values(this.mod.opcodes).sort((a, b) => a.name.localeCompare(b.name));
  }

  populateOpcodeSelect() {
    const select = this.mountEl?.querySelector('.rs-ref-select');
    if (!select) {
      return;
    }

    const prev = this.selectedKey;
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = !prev;
    placeholder.textContent = 'Select opcode…';
    select.appendChild(placeholder);

    for (const op of this.getSortedOpcodes()) {
      const opt = document.createElement('option');
      const key = op.name.toLowerCase();
      opt.value = key;
      opt.textContent = op.name;
      if (key === prev) {
        opt.selected = true;
        placeholder.selected = false;
      }
      select.appendChild(opt);
    }
  }

  selectOpcode(key) {
    const normalized = String(key || '').toLowerCase();
    const op = this.mod.opcodes?.[normalized];
    if (!op) {
      return;
    }
    this.selectedKey = normalized;
    const select = this.mountEl?.querySelector('.rs-ref-select');
    if (select) {
      select.value = normalized;
    }
    this.renderDetail(op);
  }

  focusOpcode(key) {
    const normalized = String(key || '').toLowerCase();
    if (!this.mod.opcodes?.[normalized]) {
      return;
    }

    this.selectOpcode(normalized);

    const root = this.mountEl?.querySelector('.rs-ref-root');
    const detail = this.mountEl?.querySelector('.rs-ref-detail');
    const sidebar = document.querySelector('.rs-sidebar');

    root?.classList.remove('rs-ref-pulse');
    void root?.offsetWidth;
    root?.classList.add('rs-ref-pulse');

    if (detail) {
      detail.scrollTop = 0;
    }
    sidebar?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    window.setTimeout(() => {
      root?.classList.remove('rs-ref-pulse');
    }, 900);
  }

  renderDetail(op) {
    const detail = this.mountEl?.querySelector('.rs-ref-detail');
    if (!detail) {
      return;
    }

    const desc = this.formatDescription(op.description);
    const required = this.listRequiredFields(op);
    const returns = this.returnsLine(op);
    const example = this.compactExample(op);

    detail.innerHTML = `
      <article class="rs-ref-doc" data-opcode="${op.name}">
        <h4 class="rs-ref-doc-name">${op.name}</h4>
        <p class="rs-ref-doc-summary">${desc}</p>

        ${
          required.length
            ? `
        <div class="rs-ref-block">
          <div class="rs-ref-block-label">Required</div>
          <ul class="rs-ref-field-list">${required.map((f) => `<li><code>${f}</code></li>`).join('')}</ul>
        </div>`
            : ''
        }

        <div class="rs-ref-block">
          <div class="rs-ref-block-label">Returns</div>
          <p class="rs-ref-returns">${returns}</p>
        </div>

        ${
          example
            ? `
        <div class="rs-ref-block">
          <div class="rs-ref-block-label">Example</div>
          <pre class="rs-ref-example">${this.escapeHtml(example)}</pre>
        </div>`
            : ''
        }

        <button type="button" class="rs-ref-load-example">load example</button>
      </article>
    `;

    detail.querySelector('.rs-ref-load-example')?.addEventListener('click', () => {
      if (typeof this.onLoadExample === 'function') {
        this.onLoadExample(op);
      }
    });
  }

  formatDescription(description) {
    if (!description) {
      return 'No description.';
    }
    return String(description).trim().replace(/\s+/g, ' ');
  }

  listRequiredFields(op) {
    const fields = new Set();

    if (op.schema?.script && typeof op.schema.script === 'object') {
      Object.keys(op.schema.script).forEach((k) => fields.add(k));
    }
    if (op.schema?.witness && typeof op.schema.witness === 'object') {
      Object.keys(op.schema.witness).forEach((k) => fields.add(k));
    }

    if (!fields.size && op.exampleScript) {
      Object.keys(op.exampleScript).forEach((k) => {
        if (k !== 'op') {
          fields.add(k);
        }
      });
    }
    if (op.exampleWitness) {
      Object.keys(op.exampleWitness).forEach((k) => fields.add(k));
    }

    return Array.from(fields).sort();
  }

  returnsLine(op) {
    const name = String(op.name || '').toUpperCase();
    if (name === 'CHECKSIG') {
      return 'true if signature validates against message and publickey.';
    }
    return 'boolean — true when the opcode condition is satisfied.';
  }

  compactExample(op) {
    if (!op.exampleScript) {
      return '';
    }
    const sample = { ...op.exampleScript };
    if (op.exampleWitness && Object.keys(op.exampleWitness).length) {
      sample.witness = op.exampleWitness;
    }
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
