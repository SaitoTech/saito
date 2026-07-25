const EditorTemplate = require('./editor.template');
const {
  isPlaceholder,
  placeholderMeta,
  isWitnessPath,
  isWitnessValueSupplied,
  lockingView
} = require('./script_build');
const { inferFieldKindFromPath, validateField, collectPlaceholders } = require('./script_validate');

const LOGICAL_OPERATORS = ['AND', 'OR', 'NOT', 'THEN'];
const LOGICAL_OPS = new Set(['and', 'or', 'then', 'not']);

function isLogicalOperator(value) {
  return typeof value === 'string' && LOGICAL_OPERATORS.includes(value.trim().toUpperCase());
}

function normalizeLogicalOperator(value) {
  const upper = String(value || '')
    .trim()
    .toUpperCase();
  return LOGICAL_OPERATORS.includes(upper) ? upper : 'AND';
}

function pathToDot(path) {
  if (typeof path === 'string') {
    return path;
  }
  if (!Array.isArray(path) || path.length === 0) {
    return '';
  }
  return path.map(String).join('.');
}

/** JSON object key — opcode field name, no casing or label transforms. */
function jsonKey(key) {
  return JSON.stringify(String(key));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Opcode definition object (exampleScript, schema). */
function resolveOpcode(mod, opName) {
  const key = String(opName || '').toLowerCase();
  const entry = mod?.opcodes?.[key];
  if (!entry) {
    return null;
  }
  if (entry.opcode && typeof entry.opcode === 'object') {
    return entry.opcode;
  }
  if (entry.name || entry.exampleScript) {
    return entry;
  }
  return null;
}

function isLogicalOpName(opName) {
  return LOGICAL_OPS.has(String(opName || '').toLowerCase());
}

function metaScriptKeys(opDef) {
  const order = [];
  const seen = new Set();
  const example = opDef?.exampleScript;
  if (example && typeof example === 'object' && !Array.isArray(example)) {
    for (const key of Object.keys(example)) {
      if (key === 'witness' || seen.has(key)) {
        continue;
      }
      order.push(key);
      seen.add(key);
    }
  }
  const witnessKeys = new Set(
    Object.keys(
      opDef?.exampleScript?.witness && typeof opDef.exampleScript.witness === 'object'
        ? opDef.exampleScript.witness
        : {}
    )
  );
  const schema = opDef?.schema;
  if (schema && typeof schema === 'object' && !Array.isArray(schema) && !schema.script) {
    for (const key of Object.keys(schema)) {
      if (witnessKeys.has(key) || seen.has(key)) {
        continue;
      }
      order.push(key);
      seen.add(key);
    }
  }
  return order;
}

function metaRequiredKeys(opDef) {
  const order = [];
  const seen = new Set();
  const witness = opDef?.exampleScript?.witness;
  if (witness && typeof witness === 'object' && !Array.isArray(witness)) {
    for (const key of Object.keys(witness)) {
      if (!seen.has(key)) {
        order.push(key);
        seen.add(key);
      }
    }
  }
  return order;
}

function unlockWitnessKeys(mod, opName, node) {
  const opDef = resolveOpcode(mod, opName);
  if (!opDef) {
    return [];
  }
  const embedded =
    node?.required && typeof node.required === 'object' && !Array.isArray(node.required)
      ? node.required
      : {};
  return metaRequiredKeys(opDef).filter((key) => !isWitnessValueSupplied(embedded[key]));
}

function witnessPlaceholderFromMeta(mod, opName, fieldName) {
  const opDef = resolveOpcode(mod, opName);
  const template = opDef?.exampleScript?.witness?.[fieldName];
  if (typeof template === 'string') {
    return template;
  }
  if (template === true) {
    return `<${fieldName}>`;
  }
  return `<${fieldName}>`;
}

function materializeNode(node, mod, role) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return node;
  }

  const opKey = String(node.op || '').toLowerCase();
  if (isLogicalOpName(opKey)) {
    const args = Array.isArray(node.args) ? node.args : [];
    return {
      op: node.op,
      args: args.map((child) => materializeNode(child, mod, role))
    };
  }

  const opDef = resolveOpcode(mod, node.op);
  const template =
    opDef?.exampleScript && typeof opDef.exampleScript === 'object' ? opDef.exampleScript : null;

  if (!template) {
    const passthrough = deepClone(node);
    if (role === 'locking') {
      delete passthrough.witness;
    }
    return passthrough;
  }

  const out = {};
  if (node.op !== undefined || template.op !== undefined) {
    out.op = node.op !== undefined ? node.op : template.op;
  }

  for (const key of metaScriptKeys(opDef)) {
    if (key === 'op') {
      continue;
    }
    if (key === 'witness') {
      continue;
    }
    if (key === 'required') {
      const reqTemplate = template.required;
      const reqNode = node.required;
      if (reqTemplate && typeof reqTemplate === 'object') {
        out.required = deepClone(reqNode !== undefined ? reqNode : reqTemplate);
      } else if (reqNode && typeof reqNode === 'object') {
        out.required = deepClone(reqNode);
      }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      out[key] = deepClone(node[key]);
    } else if (Object.prototype.hasOwnProperty.call(template, key)) {
      out[key] = deepClone(template[key]);
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'op' || key === 'witness' || key === 'required') {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = deepClone(node[key]);
    }
  }

  if (role === 'unlocking') {
    const witnessTemplate =
      opDef?.exampleScript?.witness && typeof opDef.exampleScript.witness === 'object'
        ? opDef.exampleScript.witness
        : null;
    if (witnessTemplate) {
      const witness =
        node.witness && typeof node.witness === 'object' && !Array.isArray(node.witness)
          ? deepClone(node.witness)
          : {};
      for (const wKey of metaRequiredKeys(opDef)) {
        if (
          witness[wKey] === undefined &&
          Object.prototype.hasOwnProperty.call(witnessTemplate, wKey)
        ) {
          witness[wKey] = deepClone(witnessTemplate[wKey]);
        }
      }
      if (Object.keys(witness).length > 0) {
        out.witness = witness;
      }
    } else if (node.witness && typeof node.witness === 'object' && !Array.isArray(node.witness)) {
      out.witness = deepClone(node.witness);
    }
    if (
      node.required &&
      typeof node.required === 'object' &&
      !Array.isArray(node.required) &&
      Object.keys(node.required).length > 0
    ) {
      out.required = deepClone(node.required);
    }
  }

  return out;
}

function materializeForRole(script, mod, role) {
  if (!script || typeof script !== 'object' || Array.isArray(script)) {
    return script;
  }
  return materializeNode(script, mod, role === 'create' ? 'locking' : 'unlocking');
}

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
    return Boolean(resolveOpcode(this.mod, name));
  }

  keysForRender(obj) {
    const opDef = resolveOpcode(this.mod, obj?.op);
    let keys;

    if (opDef && obj?.op && !isLogicalOpName(obj.op)) {
      keys = metaScriptKeys(opDef).filter((key) => {
        if (key === 'witness') {
          return false;
        }
        if (key === 'required') {
          const val = obj[key];
          if (
            val &&
            typeof val === 'object' &&
            !Array.isArray(val) &&
            Object.keys(val).length === 0
          ) {
            return false;
          }
        }
        return (
          Object.prototype.hasOwnProperty.call(obj, key) || opDef.exampleScript?.[key] !== undefined
        );
      });
      for (const key of Object.keys(obj)) {
        if (key === 'witness' || keys.includes(key)) {
          continue;
        }
        if (key === 'required') {
          const val = obj[key];
          if (
            !val ||
            typeof val !== 'object' ||
            Array.isArray(val) ||
            Object.keys(val).length === 0
          ) {
            continue;
          }
        }
        keys.push(key);
      }
    } else {
      keys = Object.keys(obj);
    }

    return keys.filter((key) => {
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
        if (
          val &&
          typeof val === 'object' &&
          !Array.isArray(val) &&
          Object.keys(val).length === 0
        ) {
          return false;
        }
      }
      return true;
    });
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

  renderValue(value, path, depth, trailingComma = false) {
    if (value === null || typeof value !== 'object') {
      return this.renderPrimitiveRow(value, path, depth, trailingComma);
    }
    if (Array.isArray(value)) {
      return this.renderArray(value, path, depth, trailingComma);
    }
    return this.renderObject(value, path, depth, trailingComma);
  }

  renderPrimitiveRow(value, path, depth, trailingComma = false) {
    const row = this.createRow(depth, 'rs-semantic-row-value');
    row.appendChild(this.renderAtom(value, path));
    if (trailingComma) {
      row.appendChild(this.span(',', 'rs-semantic-punct'));
    }
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
      if (readOnlyInherited || !this.canEditPath(path)) {
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
      keyName === 'msg'
        ? 'text'
        : fieldKind === 'text'
          ? 'text'
          : String(keyName || 'input').toLowerCase();
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
    if (typeof value === 'string') {
      return value.trim();
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

  renderObject(obj, path, depth, trailingComma = false) {
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

    const keys = this.keysForRender(obj);

    keys.forEach((key, index) => {
      const childPath = path.concat(key);
      const child = obj[key];
      const isNestedObject = child !== null && typeof child === 'object' && !Array.isArray(child);
      const isNestedArray = Array.isArray(child);
      const needsTrailingComma = index < keys.length - 1 || appendWitness;

      if (isNestedObject || isNestedArray) {
        inner.appendChild(
          this.renderNestedSection(key, child, childPath, depth, isNestedArray, needsTrailingComma)
        );
      } else {
        const row = this.createRow(depth + 1, 'rs-semantic-row-value');
        row.appendChild(this.span(jsonKey(key), 'rs-semantic-key'));
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

    const close = this.createRow(depth, 'rs-semantic-row-brace rs-semantic-row-close');
    close.appendChild(this.span('}', 'rs-semantic-brace'));
    if (trailingComma) {
      close.appendChild(this.span(',', 'rs-semantic-punct'));
    }
    block.appendChild(close);

    return block;
  }

  renderNestedSection(key, child, childPath, depth, isNestedArray, needsTrailingComma) {
    const section = document.createElement('div');
    section.className = 'rs-semantic-section';
    section.dataset.key = key;
    section.dataset.depth = String(depth + 1);
    section.dataset.path = JSON.stringify(childPath);
    section.dataset.kind = isNestedArray ? 'array' : 'object';

    const keyRow = this.createRow(depth + 1, 'rs-semantic-row-key');
    keyRow.appendChild(this.span(jsonKey(key), 'rs-semantic-key'));
    keyRow.appendChild(this.span(':', 'rs-semantic-punct'));
    section.appendChild(keyRow);
    section.appendChild(this.renderValue(child, childPath, depth + 1, needsTrailingComma));
    return section;
  }

  renderArray(arr, path, depth, trailingComma = false) {
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
        section.appendChild(this.renderValue(item, childPath, depth + 1, index < arr.length - 1));
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

    const close = this.createRow(depth, 'rs-semantic-row-brace rs-semantic-row-close');
    close.appendChild(this.span(']', 'rs-semantic-brace'));
    if (trailingComma) {
      close.appendChild(this.span(',', 'rs-semantic-punct'));
    }
    block.appendChild(close);

    return block;
  }

  willAppendWitnessFields(obj) {
    if (this.panelRole !== 'unlocking' || !this.requiredOnlyEditable) {
      return false;
    }

    const op = String(obj.op || '').toLowerCase();
    if (isLogicalOpName(op)) {
      return false;
    }

    const fields = unlockWitnessKeys(this.mod, obj.op, obj);
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

    const inner = block.querySelector('.rs-semantic-block-inner');
    if (!inner) {
      return;
    }

    const opDef = resolveOpcode(this.mod, obj.op);
    const fields = unlockWitnessKeys(this.mod, obj.op, obj);
    const witness = obj.witness && typeof obj.witness === 'object' ? obj.witness : {};
    const fieldSet = new Set(fields);
    const orderedFields = metaRequiredKeys(opDef).filter((key) => fieldSet.has(key));

    const witnessObj = {};
    for (const fieldName of orderedFields) {
      if (isWitnessValueSupplied(witness[fieldName])) {
        witnessObj[fieldName] = witness[fieldName];
      } else {
        const placeholder = witnessPlaceholderFromMeta(this.mod, obj.op, fieldName);
        witnessObj[fieldName] = typeof placeholder === 'string' ? placeholder : placeholder;
      }
    }

    const witnessPath = path.concat('witness');
    inner.appendChild(
      this.renderNestedSection('witness', witnessObj, witnessPath, depth, false, false)
    );
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

class RustscriptEditor {
  constructor(app, mod, container = '', role = 'create') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.role = role === 'test' ? 'test' : 'create';
    this.displayMode = 'guided';
    this.semanticView = new SemanticScriptView(app, mod, {
      panelRole: this.role === 'test' ? 'unlocking' : 'locking',
      requiredOnlyEditable: this.role === 'test',
      interactionEnabled: true,
      onPlaceholderClick: (path) => this.openField(path),
      onFieldClick: (path) => this.openField(path),
      onOpcodeClick: (key) => this.openOpcode(key)
    });
  }

  render() {
    const el = document.querySelector(this.container);
    if (!el) {
      return;
    }

    if (!el.querySelector('.rustscript-editor-guided')) {
      el.innerHTML = EditorTemplate(this.role);
      const menuId = this.role === 'test' ? 'script-test' : 'script-create';
      if (el.querySelector('.rs-panel-menu')) {
        this.mod.main?.bindPanelMenu(el, menuId);
      }
    }

    const guidedEl = el.querySelector('.rustscript-editor-guided');
    const expertEl = el.querySelector('.rustscript-editor-expert');
    if (!guidedEl || !expertEl) {
      return;
    }

    const isExpert = this.displayMode === 'expert';
    el.classList.toggle('is-expert', isExpert);
    el.classList.toggle('is-guided', !isExpert);
    el.classList.toggle('rustscript-editor-locking', this.role === 'create');
    el.classList.toggle('rustscript-editor-unlocking', this.role === 'test');

    guidedEl.hidden = isExpert;
    expertEl.hidden = !isExpert;

    const display = cloneForDisplay(this.mod, this.role);

    if (!isExpert) {
      this.semanticView.setRenderOptions({
        panelRole: this.role === 'test' ? 'unlocking' : 'locking',
        requiredOnlyEditable: this.role === 'test',
        interactionEnabled: true
      });
      this.semanticView.mount(guidedEl);
      this.semanticView.render(display);
    } else {
      expertEl.value = isEmptyScriptRoot(display) ? '' : JSON.stringify(display, null, 2);
    }

    this.attachEvents(el, expertEl);
  }

  openField(path) {
    const dot = pathToDot(path);
    if (!dot) {
      return;
    }
    const main = this.mod.main;
    if (main && typeof main.openFieldOverlay === 'function') {
      main.openFieldOverlay(dot);
    }
  }

  openOpcode(key) {
    const main = this.mod.main;
    if (main && typeof main.openOpcodeReference === 'function') {
      main.openOpcodeReference(key);
    }
  }

  attachEvents(el, expertEl) {
    if (!el || el.dataset.rustscriptEventsAttached === '1') {
      return;
    }
    el.dataset.rustscriptEventsAttached = '1';

    if (expertEl) {
      expertEl.onchange = () => {
        commitExpert(this, expertEl);
      };
      expertEl.onblur = () => {
        commitExpert(this, expertEl);
      };
    }
  }

  getPlaceholderCount() {
    const script = cloneForDisplay(this.mod, 'create');
    return collectPlaceholders(script, [], { skipRequired: true, skipWitness: true }).length;
  }
}

function isEmptyScriptRoot(value) {
  return (
    value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
  );
}

function cloneForDisplay(mod, role) {
  const script = deepClone(mod.getScript());
  return materializeForRole(script, mod, role);
}

async function commitExpert(editor, expertEl) {
  if (editor.displayMode !== 'expert') {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(expertEl.value);
  } catch (err) {
    return;
  }
  if (editor.role === 'create') {
    editor.mod.setScript(lockingView(parsed));
  } else {
    editor.mod.setScript(parsed);
  }
  if (editor.mod.main) {
    await editor.mod.main.refresh();
  }
}

module.exports = RustscriptEditor;
