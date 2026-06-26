const { isPlaceholder, placeholderMeta, placeholderName } = require('./placeholder_utils');
const { isWitnessPath } = require('./workspace_sync');
const { inferFieldKindFromPath, validateField } = require('./field_validation');
const { isLogicalOperator, normalizeLogicalOperator } = require('./logical_operators');
const { witnessFieldNames, unlockWitnessFieldNames, isWitnessValueSupplied } = require('../script_build');

class SemanticScriptView {
  constructor(app, mod, options = {}) {
    this.app = app;
    this.mod = mod;
    this.onPlaceholderClick = options.onPlaceholderClick || null;
    this.onFieldClick = options.onFieldClick || null;
    this.onOpcodeClick = options.onOpcodeClick || null;
    this.panelRole = options.panelRole === 'unlocking' ? 'unlocking' : 'locking';
    this.requiredOnlyEditable = options.requiredOnlyEditable === true;
    this.interactionEnabled = options.interactionEnabled !== false;
    this.container = null;
  }

  setRenderOptions(options = {}) {
    if (options.panelRole) {
      this.panelRole = options.panelRole === 'unlocking' ? 'unlocking' : 'locking';
    }
    if (options.requiredOnlyEditable !== undefined) {
      this.requiredOnlyEditable = options.requiredOnlyEditable === true;
    }
    if (options.interactionEnabled !== undefined) {
      this.interactionEnabled = options.interactionEnabled !== false;
    }
  }

  isKnownOpcode(name) {
    const key = String(name || '').toLowerCase();
    return Boolean(key && this.mod?.opcodes?.[key]);
  }

  mount(container) {
    this.container = container;
  }

  render(script) {
    if (!this.container) {
      return;
    }
    this.container.innerHTML = '';

    if (!this.interactionEnabled && this.panelRole === 'unlocking') {
      return;
    }

    const tree = document.createElement('div');
    tree.className = 'rs-semantic-tree';
    tree.appendChild(this.renderValue(script, [], 0));
    this.container.appendChild(tree);
  }

  renderValue(value, path, depth) {
    if (value === null || typeof value !== 'object') {
      return this.renderPrimitiveRow(value, path, depth);
    }
    if (Array.isArray(value)) {
      return this.renderArray(value, path, depth);
    }
    return this.renderObject(value, path, depth);
  }

  renderPrimitiveRow(value, path, depth) {
    const row = this.createRow(depth, 'rs-semantic-row-value');
    row.appendChild(this.renderAtom(value, path));
    return row;
  }

  canEditPath(path) {
    if (!this.interactionEnabled) {
      return false;
    }
    if (!this.requiredOnlyEditable) {
      return true;
    }
    return isWitnessPath(path);
  }

  fieldKindFor(path, keyName = '') {
    const fromKey = keyName || (path.length ? path[path.length - 1] : '');
    return inferFieldKindFromPath(path.length ? path : [fromKey]);
  }

  renderAtom(value, path, keyName = '') {
    const readOnlyInherited = this.requiredOnlyEditable && !isWitnessPath(path);

    if (keyName === 'op' && typeof value === 'string' && isLogicalOperator(value)) {
      if (readOnlyInherited) {
        return this.span(String(value).toUpperCase(), 'rs-semantic-logical-readonly');
      }
      if (!this.canEditPath(path)) {
        return this.span(String(value).toUpperCase(), 'rs-semantic-logical-readonly');
      }
      return this.renderLogicalOpRef(value, path);
    }

    if (keyName === 'op' && typeof value === 'string' && this.isKnownOpcode(value)) {
      if (readOnlyInherited) {
        return this.span(String(value).toUpperCase(), 'rs-semantic-opcode-readonly');
      }
      return this.renderOpcodeRef(value);
    }

    if (value === true) {
      if (readOnlyInherited) {
        return this.span('required', 'rs-semantic-inherited');
      }
      if (!this.canEditPath(path)) {
        const fieldName = path.length ? String(path[path.length - 1]) : 'field';
        return this.span(`<${fieldName}>`, 'rs-semantic-placeholder-ghost');
      }
      const fieldName = path.length ? String(path[path.length - 1]) : 'field';
      return this.renderPlaceholderChip(`<${fieldName}>`, path);
    }

    if (typeof value === 'string' && isPlaceholder(value)) {
      if (readOnlyInherited) {
        return this.span(value, 'rs-semantic-inherited');
      }
      if (!this.canEditPath(path)) {
        return this.span(this.formatPlaceholderLabel(value), 'rs-semantic-placeholder-ghost');
      }
      return this.renderPlaceholderChip(value, path);
    }

    if (readOnlyInherited) {
      return this.renderInheritedValue(value);
    }

    if (typeof value === 'string' && this.canEditPath(path)) {
      return this.renderEditableValue(value, path, keyName);
    }

    if (typeof value === 'string') {
      return this.span(JSON.stringify(value), 'rs-semantic-string');
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      if (this.canEditPath(path)) {
        return this.renderEditableValue(String(value), path, keyName);
      }
      return this.span(String(value), 'rs-semantic-literal');
    }
    if (value === null) {
      return this.span('null', 'rs-semantic-literal');
    }
    return this.span(String(value), 'rs-semantic-literal');
  }

  renderInheritedValue(value) {
    if (typeof value === 'string') {
      return this.span(JSON.stringify(value), 'rs-semantic-inherited');
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      return this.span(String(value), 'rs-semantic-inherited');
    }
    if (value === null) {
      return this.span('null', 'rs-semantic-inherited');
    }
    return this.span(String(value), 'rs-semantic-inherited');
  }

  renderEditableValue(value, path, keyName) {
    const fieldKind = this.fieldKindFor(path, keyName);
    const placeholderKey =
      keyName === 'msg' ? 'text' : fieldKind === 'text' ? 'text' : String(keyName || 'input').toLowerCase();
    const meta = placeholderMeta(`<${placeholderKey}>`) || {
      label: String(keyName || 'Value'),
      hint: 'Click to edit',
      action: fieldKind === 'message' ? 'text' : fieldKind
    };

    const validation = validateField(
      meta.action === 'text' ? fieldKind : meta.action,
      value,
      this.app
    );
    const display = typeof value === 'string' ? JSON.stringify(value) : String(value);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rs-value-resolved';
    if (validation.state === 'warn') {
      btn.classList.add('rs-value-resolved-warn');
      btn.title = validation.message || 'Value may be malformed — click to edit';
    } else if (validation.state === 'valid') {
      btn.classList.add('rs-value-resolved-complete');
      btn.title = 'Complete — click to edit';
    } else {
      btn.title = meta.hint || 'Click to edit';
    }
    btn.textContent = display;
    btn.dataset.path = JSON.stringify(path);
    btn.dataset.fieldKind = fieldKind;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const raw = typeof value === 'string' ? value : String(value);
      if (this.onFieldClick) {
        this.onFieldClick(path, raw, meta, fieldKind);
      }
    });

    return btn;
  }

  formatPlaceholderLabel(value) {
    const name = placeholderName(value);
    if (name) {
      return `<${name}>`;
    }
    return String(value);
  }

  renderPlaceholderChip(value, path) {
    const meta = placeholderMeta(value);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rs-placeholder-chip';
    btn.textContent = this.formatPlaceholderLabel(value);
    btn.title = meta?.hint || value;
    btn.dataset.path = JSON.stringify(path);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.onPlaceholderClick) {
        this.onPlaceholderClick(path, value, meta);
      }
    });

    return btn;
  }

  renderOpcodeRef(opName) {
    const key = String(opName).toLowerCase();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rs-semantic-opcode';
    btn.textContent = String(opName).toUpperCase();
    btn.title = 'Open opcode reference';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onOpcodeClick) {
        this.onOpcodeClick(key);
      }
    });

    return btn;
  }

  renderLogicalOpRef(opName, path) {
    const normalized = normalizeLogicalOperator(opName);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rs-semantic-logical-op';
    btn.textContent = normalized;
    btn.title = 'Change logical operator';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onFieldClick) {
        this.onFieldClick(
          path,
          normalized,
          { action: 'logical', label: normalized, hint: 'Choose how conditions combine' },
          'logical'
        );
      }
    });

    return btn;
  }

  renderObject(obj, path, depth) {
    const block = document.createElement('div');
    block.className = 'rs-semantic-block';
    block.dataset.depth = String(depth);
    block.dataset.path = JSON.stringify(path);
    block.dataset.kind = 'object';

    const open = this.createRow(depth, 'rs-semantic-row-brace');
    open.appendChild(this.span('{', 'rs-semantic-brace'));
    block.appendChild(open);

    const inner = document.createElement('div');
    inner.className = 'rs-semantic-block-inner';

    const appendWitness = this.willAppendWitnessFields(obj);

    const keys = Object.keys(obj).filter((key) => {
      if (key === 'witness') {
        if (this.panelRole === 'locking') {
          return false;
        }
        if (this.panelRole === 'unlocking' && this.requiredOnlyEditable) {
          return false;
        }
      }
      if (key === 'required') {
        const val = obj[key];
        if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) {
          return false;
        }
      }
      return true;
    });

    keys.forEach((key, index) => {
      const childPath = path.concat(key);
      const child = obj[key];
      const isNestedObject = child !== null && typeof child === 'object' && !Array.isArray(child);
      const isNestedArray = Array.isArray(child);
      const needsTrailingComma = index < keys.length - 1 || appendWitness;

      if (isNestedObject || isNestedArray) {
        const section = document.createElement('div');
        section.className = 'rs-semantic-section';
        section.dataset.key = key;
        section.dataset.depth = String(depth + 1);
        section.dataset.path = JSON.stringify(childPath);
        section.dataset.kind = isNestedArray ? 'array' : 'object';

        const keyRow = this.createRow(depth + 1);
        keyRow.appendChild(this.span(JSON.stringify(key), 'rs-semantic-key'));
        keyRow.appendChild(this.span(':', 'rs-semantic-punct'));
        section.appendChild(keyRow);
        section.appendChild(this.renderValue(child, childPath, depth + 1));
        if (needsTrailingComma) {
          const commaRow = this.createRow(depth + 1);
          commaRow.appendChild(this.span(',', 'rs-semantic-punct'));
          section.appendChild(commaRow);
        }

        inner.appendChild(section);
      } else {
        const row = this.createRow(depth + 1, 'rs-semantic-row-value');
        row.appendChild(this.span(JSON.stringify(key), 'rs-semantic-key'));
        row.appendChild(this.span(':', 'rs-semantic-punct'));
        row.appendChild(this.renderAtom(child, childPath, key));
        if (needsTrailingComma) {
          row.appendChild(this.span(',', 'rs-semantic-punct'));
        }
        inner.appendChild(row);
      }
    });

    block.appendChild(inner);

    this.appendWitnessFields(block, obj, path, depth);

    const close = this.createRow(depth, 'rs-semantic-row-brace');
    close.appendChild(this.span('}', 'rs-semantic-brace'));
    block.appendChild(close);

    return block;
  }

  renderArray(arr, path, depth) {
    const block = document.createElement('div');
    block.className = 'rs-semantic-block rs-semantic-block-array';
    block.dataset.depth = String(depth);
    block.dataset.path = JSON.stringify(path);
    block.dataset.kind = 'array';

    const open = this.createRow(depth, 'rs-semantic-row-brace');
    open.appendChild(this.span('[', 'rs-semantic-brace'));
    block.appendChild(open);

    const inner = document.createElement('div');
    inner.className = 'rs-semantic-block-inner';

    arr.forEach((item, index) => {
      const childPath = path.concat(index);
      const isNested = item !== null && typeof item === 'object';

      if (isNested) {
        const section = document.createElement('div');
        section.className = 'rs-semantic-section';
        section.dataset.depth = String(depth + 1);
        section.dataset.path = JSON.stringify(childPath);
        section.dataset.kind = Array.isArray(item) ? 'array' : 'object';
        section.appendChild(this.renderValue(item, childPath, depth + 1));
        if (index < arr.length - 1) {
          const commaRow = this.createRow(depth + 1);
          commaRow.appendChild(this.span(',', 'rs-semantic-punct'));
          section.appendChild(commaRow);
        }
        inner.appendChild(section);
      } else {
        const row = this.createRow(depth + 1, 'rs-semantic-row-value');
        row.appendChild(this.renderAtom(item, childPath));
        if (index < arr.length - 1) {
          row.appendChild(this.span(',', 'rs-semantic-punct'));
        }
        inner.appendChild(row);
      }
    });

    block.appendChild(inner);

    const close = this.createRow(depth, 'rs-semantic-row-brace');
    close.appendChild(this.span(']', 'rs-semantic-brace'));
    block.appendChild(close);

    return block;
  }

  willAppendWitnessFields(obj) {
    if (this.panelRole !== 'unlocking' || !this.requiredOnlyEditable) {
      return false;
    }

    const op = String(obj.op || '').toLowerCase();
    if (op === 'and' || op === 'or' || op === 'then' || op === 'not') {
      return false;
    }

    const fields = unlockWitnessFieldNames(this.mod?.opcodes, op, obj);
    if (!fields.length) {
      return false;
    }

    const witness = obj.witness && typeof obj.witness === 'object' ? obj.witness : {};
    const missing = fields.filter((key) => !isWitnessValueSupplied(witness[key]));
    const supplied = fields.filter((key) => isWitnessValueSupplied(witness[key]));
    return missing.length > 0 || supplied.length > 0;
  }

  appendWitnessFields(block, obj, path, depth) {
    if (!this.willAppendWitnessFields(obj)) {
      return;
    }

    const op = String(obj.op || '').toLowerCase();
    const fields = unlockWitnessFieldNames(this.mod?.opcodes, op, obj);
    const witness = obj.witness && typeof obj.witness === 'object' ? obj.witness : {};
    const missing = fields.filter((key) => !isWitnessValueSupplied(witness[key]));
    const supplied = fields.filter((key) => isWitnessValueSupplied(witness[key]));

    const inner = block.querySelector('.rs-semantic-block-inner');
    if (!inner) {
      return;
    }

    const section = document.createElement('div');
    section.className = 'rs-semantic-section';
    section.dataset.key = 'witness';
    section.dataset.depth = String(depth + 1);
    section.dataset.path = JSON.stringify(path.concat('witness'));
    section.dataset.kind = 'object';

    const keyRow = this.createRow(depth + 1);
    keyRow.appendChild(this.span(JSON.stringify('witness'), 'rs-semantic-key'));
    keyRow.appendChild(this.span(':', 'rs-semantic-punct'));
    section.appendChild(keyRow);

    const witnessBlock = document.createElement('div');
    witnessBlock.className = 'rs-semantic-block';
    witnessBlock.dataset.depth = String(depth + 1);
    witnessBlock.dataset.kind = 'object';

    const witnessOpen = this.createRow(depth + 1, 'rs-semantic-row-brace');
    witnessOpen.appendChild(this.span('{', 'rs-semantic-brace'));
    witnessBlock.appendChild(witnessOpen);

    const witnessInner = document.createElement('div');
    witnessInner.className = 'rs-semantic-block-inner';

    const orderedFields = [...missing, ...supplied];
    orderedFields.forEach((fieldName, index) => {
      const fieldPath = path.concat('witness', fieldName);
      const row = this.createRow(depth + 2, 'rs-semantic-row-value');
      row.appendChild(this.span(JSON.stringify(fieldName), 'rs-semantic-key'));
      row.appendChild(this.span(':', 'rs-semantic-punct'));
      if (isWitnessValueSupplied(witness[fieldName])) {
        row.appendChild(this.renderAtom(witness[fieldName], fieldPath, fieldName));
      } else {
        row.appendChild(this.renderPlaceholderChip(`<${fieldName}>`, fieldPath));
      }
      if (index < orderedFields.length - 1) {
        row.appendChild(this.span(',', 'rs-semantic-punct'));
      }
      witnessInner.appendChild(row);
    });

    witnessBlock.appendChild(witnessInner);

    const witnessClose = this.createRow(depth + 1, 'rs-semantic-row-brace');
    witnessClose.appendChild(this.span('}', 'rs-semantic-brace'));
    witnessBlock.appendChild(witnessClose);

    section.appendChild(witnessBlock);
    inner.appendChild(section);
  }

  createRow(depth, extraClass = '') {
    const row = document.createElement('div');
    row.className = `rs-semantic-row ${extraClass}`.trim();
    row.style.setProperty('--rs-depth', String(depth));
    return row;
  }

  span(text, className) {
    const el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
  }
}

module.exports = SemanticScriptView;
