const RustscriptMainTemplate = require('./main.template.js');
const GenerateExpertOverlay = require('./overlays/generate_expert.js');
const ast_execute = require('../rustscript/ast_execute');

const LOGICAL_OPS = new Set(['and', 'or', 'then', 'not', 'AND', 'OR', 'THEN', 'NOT']);

const EMPTY_CONTEXT = {
  witness: {},
  tx: {},
  blk: {}
};

function normalize_op(op) {
  return String(op || '').toLowerCase();
}

function is_logical(node) {
  return node && LOGICAL_OPS.has(node.op);
}

function set_nested_empty(obj, path) {
  const parts = String(path).split('.').filter(Boolean);
  if (parts.length === 0) {
    return;
  }
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  if (cur[parts[parts.length - 1]] === undefined) {
    cur[parts[parts.length - 1]] = '';
  }
}

function collect_ref_from_string(value, buckets) {
  if (typeof value !== 'string') {
    return;
  }

  let ref = value;
  if (ref.startsWith('context.')) {
    ref = ref.slice('context.'.length);
  }

  if (ref.startsWith('witness.')) {
    set_nested_empty(buckets.witness, ref.slice('witness.'.length));
    return;
  }
  if (ref.startsWith('tx.')) {
    set_nested_empty(buckets.tx, ref.slice('tx.'.length));
    return;
  }
  if (ref.startsWith('blk.')) {
    set_nested_empty(buckets.blk, ref.slice('blk.'.length));
  }
}

function witness_fields_for_node(node, opcodes) {
  const op = normalize_op(node.op);
  const handler = opcodes[op];
  if (!handler) {
    return [];
  }
  const execNode = node.bindings ? { op, ...node.bindings } : node;
  if (typeof handler.resolve_witness_fields === 'function') {
    return handler.resolve_witness_fields(execNode);
  }
  return Array.isArray(handler.witness_fields) ? handler.witness_fields : [];
}

function walk_locking_node(node, buckets, opcodes) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (is_logical(node)) {
    const args = Array.isArray(node.args) ? node.args : [];
    args.forEach((child) => walk_locking_node(child, buckets, opcodes));
    return;
  }

  const bindings = node.bindings || {};
  for (const val of Object.values(bindings)) {
    collect_ref_from_string(val, buckets);
  }

  for (const field of witness_fields_for_node(node, opcodes)) {
    set_nested_empty(buckets.witness, field);
  }
}

function build_execution_context_template(lockingScript, opcodes = {}) {
  const buckets = { witness: {}, tx: {}, blk: {} };
  walk_locking_node(lockingScript, buckets, opcodes);
  return {
    witness: buckets.witness,
    tx: buckets.tx,
    blk: buckets.blk
  };
}

class RustscriptMain {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.generate_expert_overlay = new GenerateExpertOverlay(this.app, this.mod);
    this.lastScriptSource = '';
    this.mode = 'expert';
  }

  render(container = '') {
    if (container !== '') {
      this.container = container;
    }
    if (!this.container || this.container.trim() === '') {
      this.container = '.saito-container';
    }

    const html = RustscriptMainTemplate(this.app, this.mod);

    if (!document.querySelector('.saito-rustscript')) {
      this.app.browser.addElementToSelector(html, this.container);
    } else {
      this.app.browser.replaceElementBySelector(html, '.saito-rustscript');
    }

    document.body.classList.add('rustscript');
    this.enableExpertMode();
    this.attachEvents();
    this.setExecutionContextJson(EMPTY_CONTEXT);
  }

  attachEvents() {
    document.querySelector('.rs-generate-expert')?.addEventListener('click', () => {
      this.generate_expert_overlay.render(this.lastScriptSource);
    });

    document.querySelector('.rs-generate-context')?.addEventListener('click', () => {
      this.generateContextFromLockingScript();
    });

    document.querySelector('.rs-validate-script')?.addEventListener('click', () => {
      this.validateLockingScript();
    });

    document.querySelector('.rs-execute-script')?.addEventListener('click', () => {
      this.runExecution();
    });

    document.querySelector('.rs-mode-expert')?.addEventListener('click', () => {
      this.enableExpertMode();
    });

    document.querySelector('.rs-mode-basic')?.addEventListener('click', () => {
      this.enableBasicMode();
    });
  }

  getLockingTextarea() {
    return document.querySelector('.rs-locking-script');
  }

  getContextTextarea() {
    return document.querySelector('.rs-execution-context');
  }

  formatJson(obj) {
    return JSON.stringify(obj, null, 2);
  }

  parseJson(text, label) {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`Invalid ${label} JSON: ${err.message}`);
    }
  }

  setLockingScriptJson(obj) {
    const el = this.getLockingTextarea();
    if (el) {
      el.value = this.formatJson(obj);
    }
  }

  setExecutionContextJson(obj) {
    const el = this.getContextTextarea();
    if (el) {
      el.value = this.formatJson(obj);
    }
  }

  applyModeToEditors() {
    const lock = this.getLockingTextarea();
    const ctx = this.getContextTextarea();
    if (!lock || !ctx) {
      return;
    }

    const basic = this.mode === 'basic';
    lock.readOnly = basic;
    lock.classList.toggle('rs-readonly', basic);
    ctx.readOnly = false;
    ctx.classList.remove('rs-readonly');
  }

  enableExpertMode() {
    this.mode = 'expert';
    document.querySelector('.saito-rustscript')?.classList.remove('rs-mode-basic');
    document.querySelector('.saito-rustscript')?.classList.add('rs-mode-expert');
    document.querySelector('.rs-mode-expert')?.classList.add('active');
    document.querySelector('.rs-mode-basic')?.classList.remove('active');
    this.applyModeToEditors();
    this.updateParseState('gray');
  }

  enableBasicMode() {
    this.mode = 'basic';
    document.querySelector('.saito-rustscript')?.classList.remove('rs-mode-expert');
    document.querySelector('.saito-rustscript')?.classList.add('rs-mode-basic');
    document.querySelector('.rs-mode-basic')?.classList.add('active');
    document.querySelector('.rs-mode-expert')?.classList.remove('active');
    this.applyModeToEditors();
  }

  async parseSemanticScript(source) {
    const result = await this.mod.parseExpertScript(source);
    this.setLockingScriptJson(result.lockingScript);
    this.lastScriptSource = source;
    this.generateContextFromLockingScript(true);
    this.updateParseState('ok');
    return result;
  }

  onParseSuccess(source, result) {
    this.setLockingScriptJson(result.lockingScript);
    this.lastScriptSource = source;
    this.generateContextFromLockingScript(true);
    this.updateParseState('ok');
  }

  generateContextFromLockingScript(silent = false) {
    try {
      const locking = this.parseJson(this.getLockingTextarea()?.value || '{}', 'locking script');
      const template = build_execution_context_template(locking, this.mod.opcodes);
      this.setExecutionContextJson(template);
      if (!silent) {
        siteMessage('Execution context generated');
      }
      document.querySelector('.rs-eval-ctx')?.classList.add('green');
    } catch (err) {
      this.updateParseState('error', err.message);
      if (!silent) {
        siteMessage(err.message);
      }
    }
  }

  validateLockingScript() {
    try {
      const locking = this.parseJson(this.getLockingTextarea()?.value || '{}', 'locking script');
      const validation = ast_execute.validate(locking);
      if (!validation.valid) {
        throw new Error(validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '));
      }
      siteMessage('Locking script structure is valid');
      this.updateParseState('ok');
    } catch (err) {
      this.updateParseState('error', err.message);
      siteMessage(`Validation failed: ${err.message}`);
    }
  }

  async runExecution() {
    try {
      const locking = this.parseJson(this.getLockingTextarea()?.value || '{}', 'locking script');
      const ctxPayload = this.parseJson(this.getContextTextarea()?.value || '{}', 'execution context');

      const execution = await this.mod.runAst(locking, {
        witness: ctxPayload.witness ?? {},
        tx: ctxPayload.tx ?? {},
        blk: ctxPayload.blk ?? {},
        ...ctxPayload
      });

      if (execution.success) {
        siteMessage('Execution succeeded');
        this.updateParseState('ok');
      } else {
        siteMessage('Execution returned false');
        this.updateParseState('error', execution.errors?.join('; ') || 'execution failed');
      }
      console.log('[rustscript] execution', execution);
    } catch (err) {
      this.updateParseState('error', err.message);
      siteMessage(`Execution error: ${err.message}`);
    }
  }

  updateParseState(state, message = '') {
    const lockEl = document.querySelector('.rs-eval-lock');
    const ctxEl = document.querySelector('.rs-eval-ctx');
    const parseEl = document.querySelector('.rs-eval-parse');

    for (const el of [lockEl, ctxEl, parseEl]) {
      el?.classList.remove('green', 'yellow', 'red', 'gray');
    }

    if (state === 'ok') {
      lockEl?.classList.add('green');
      ctxEl?.classList.add('green');
      parseEl?.classList.add('green');
    } else if (state === 'error') {
      lockEl?.classList.add('red');
      ctxEl?.classList.add('red');
      parseEl?.classList.add('red');
      if (message) {
        console.warn('[rustscript]', message);
      }
    } else {
      lockEl?.classList.add('gray');
      ctxEl?.classList.add('gray');
      parseEl?.classList.add('gray');
    }
  }
}

module.exports = RustscriptMain;
