const RustscriptMainTemplate = require('./main.template.js');
const GenerateExpertOverlay = require('./overlays/generate_expert.js');
const ast_execute = require('../rustscript/ast_execute');

const EMPTY_UNLOCKING = {
  op: 'CHECKSIG',
  args: {
    publickey: '',
    signature: 'context.witness.signature'
  },
  witness: {
    signature: ''
  }
};

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
    this.renderOpcodes();
    this.enableExpertMode();
    this.attachEvents();
    this.setUnlockingScriptJson(EMPTY_UNLOCKING);
  }

  renderOpcodes() {
    const select = document.querySelector('.rs-template-select');
    const list = document.querySelector('.rs-opcode-list');
    if (!this.mod.opcodes) {
      return;
    }

    if (select) {
      select.querySelectorAll('option:not([disabled])').forEach((opt) => opt.remove());
      const opEntries = Object.values(this.mod.opcodes).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      for (const op of opEntries) {
        const opt = document.createElement('option');
        opt.value = op.name.toLowerCase();
        opt.textContent = `${op.name} — ${op.description || 'No description'}`;
        select.appendChild(opt);
      }
    }

    if (list) {
      list.innerHTML = '';
      const opEntries = Object.values(this.mod.opcodes).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      for (const op of opEntries) {
        const item = document.createElement('div');
        item.className = 'rs-opcode-item';
        item.innerHTML = `<strong>${op.name}</strong><p>${op.description || ''}</p>`;
        list.appendChild(item);
      }
    }
  }

  attachEvents() {
    document.querySelector('.rs-template-select')?.addEventListener('change', (e) => {
      const selectedOp = e.target.value.toLowerCase();
      const op = this.mod.opcodes[selectedOp];
      if (!op) {
        return;
      }
      const locking = ast_execute.materialize(
        { op: op.name, bindings: {}, witnessDecl: {} },
        this.mod.opcodes,
        false
      );
      const unlocking = ast_execute.materialize(
        { op: op.name, bindings: {}, witnessDecl: {} },
        this.mod.opcodes,
        true
      );
      this.setLockingScriptJson(locking);
      this.setUnlockingScriptJson(unlocking);
      this.updateParseState('ok');
    });

    document.querySelector('.rs-generate-expert')?.addEventListener('click', () => {
      this.generate_expert_overlay.render(this.lastScriptSource);
    });

    document.querySelector('.rs-generate-unlocking')?.addEventListener('click', () => {
      this.generateUnlockingFromLocking();
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

  getUnlockingTextarea() {
    return document.querySelector('.rs-unlocking-script');
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

  setUnlockingScriptJson(obj) {
    const el = this.getUnlockingTextarea();
    if (el) {
      el.value = this.formatJson(obj);
    }
  }

  applyModeToEditors() {
    const lock = this.getLockingTextarea();
    const unlock = this.getUnlockingTextarea();
    if (!lock || !unlock) {
      return;
    }

    const basic = this.mode === 'basic';
    lock.readOnly = basic;
    lock.classList.toggle('rs-readonly', basic);
    unlock.readOnly = false;
    unlock.classList.remove('rs-readonly');
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
    this.onParseSuccess(source, result);
    return result;
  }

  onParseSuccess(source, result) {
    this.setLockingScriptJson(result.lockingScript);
    this.setUnlockingScriptJson(result.unlockingScript);
    this.lastScriptSource = source;
    this.updateParseState('ok');
  }

  generateUnlockingFromLocking(silent = false) {
    try {
      const locking = this.parseJson(this.getLockingTextarea()?.value || '{}', 'locking script');
      const unlocking = ast_execute.unlocking_from_locking(locking, this.mod.opcodes);
      this.setUnlockingScriptJson(unlocking);
      if (!silent) {
        siteMessage('Unlocking script generated');
      }
      document.querySelector('.rs-eval-unlock')?.classList.add('green');
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
      const unlocking = this.parseJson(this.getUnlockingTextarea()?.value || '{}', 'unlocking script');
      const execution = await this.mod.runAst(unlocking, this.mod.buildContext({}));

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
    const unlockEl = document.querySelector('.rs-eval-unlock');
    const parseEl = document.querySelector('.rs-eval-parse');

    for (const el of [lockEl, unlockEl, parseEl]) {
      el?.classList.remove('green', 'yellow', 'red', 'gray');
    }

    if (state === 'ok') {
      lockEl?.classList.add('green');
      unlockEl?.classList.add('green');
      parseEl?.classList.add('green');
    } else if (state === 'error') {
      lockEl?.classList.add('red');
      unlockEl?.classList.add('red');
      parseEl?.classList.add('red');
      if (message) {
        console.warn('[rustscript]', message);
      }
    } else {
      lockEl?.classList.add('gray');
      unlockEl?.classList.add('gray');
      parseEl?.classList.add('gray');
    }
  }
}

module.exports = RustscriptMain;
