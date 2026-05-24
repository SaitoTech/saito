const SemanticScriptView = require('./semantic_script_view');
const PlaceholderPrompt = require('./placeholder_prompt');
const { setAtPath } = require('./placeholder_utils');
const { isWitnessPath } = require('./workspace_sync');
const { inferFieldKindFromPath } = require('./field_validation');

class RustScriptPanel {
  constructor(app, mod, options = {}) {
    this.app = app;
    this.mod = mod;
    this.side = options.side === 'unlocking' ? 'unlocking' : 'locking';
    this.workspaceMode = 'locked';
    this.unlockActive = true;
    this.script = options.script || {};
    this.onChange = options.onChange || null;
    this.onOpcodeClick = options.onOpcodeClick || null;
    this.getLockingScript = options.getLockingScript || (() => ({}));

    this.mountEl = null;
    this.root = null;
    this.textarea = null;
    this.semanticEl = null;

    this.prompt = new PlaceholderPrompt(app, mod, {
      getLockingScript: () => this.getLockingScript()
    });
    this.semanticView = new SemanticScriptView(app, mod, {
      panelRole: this.side,
      witnessOnlyEditable: this.side === 'unlocking',
      interactionEnabled: true,
      onPlaceholderClick: (path, value, meta) => this.openValueEditor(path, value, meta),
      onFieldClick: (path, value, meta, fieldKind) => this.openValueEditor(path, value, meta, fieldKind),
      onOpcodeClick: (key) => this.handleOpcodeClick(key)
    });
  }

  handleOpcodeClick(key) {
    if (typeof this.onOpcodeClick === 'function') {
      this.onOpcodeClick(key);
    }
  }

  renderShell() {
    const title = this.side === 'locking' ? 'Script' : 'Unlock Script';
    const subtitle =
      this.side === 'locking'
        ? 'define the ownership rules'
        : 'proof data that satisfies those rules';

    return `
      <div class="rs-panel-root rs-panel-${this.side}" data-rs-side="${this.side}">
        <div class="rs-panel-header">
          <div class="rs-panel-titles">
            <span class="rs-editor-title rs-panel-title">${title}</span>
            <span class="rs-editor-subtitle rs-panel-subtitle">${subtitle}</span>
          </div>
        </div>
        <div class="rs-panel-body">
          <div class="rs-panel-gate">
            <p class="rs-panel-gate-icon" aria-hidden="true">◇</p>
            <p class="rs-panel-gate-title">Waiting for script</p>
            <p class="rs-panel-gate-text">Finish defining your script first. Witness structure and proof fields will appear here automatically.</p>
          </div>
          <div class="rs-panel-semantic"></div>
          <textarea class="rs-textarea rs-panel-textarea" spellcheck="false"></textarea>
        </div>
      </div>
    `;
  }

  mount(container) {
    this.mountEl = container;
    container.innerHTML = this.renderShell();
    this.root = container.querySelector('.rs-panel-root');
    this.textarea = container.querySelector('.rs-panel-textarea');
    this.semanticEl = container.querySelector('.rs-panel-semantic');

    if (this.side === 'locking') {
      this.textarea.classList.add('rs-locking-script');
    } else {
      this.textarea.classList.add('rs-unlocking-script');
    }

    this.semanticView.mount(this.semanticEl);
    this.bindEvents();
    this.setScript(this.script);
    this.applyWorkspaceState();
  }

  bindEvents() {
    this.textarea?.addEventListener('input', () => {
      if (this.workspaceMode !== 'unlocked') {
        return;
      }
      try {
        this.script = JSON.parse(this.textarea.value || '{}');
        this.notifyChange();
      } catch (err) {
        // allow invalid JSON while typing in source mode
      }
    });
  }

  applyWorkspaceState(options = {}) {
    if (options.workspaceMode !== undefined) {
      this.workspaceMode = options.workspaceMode === 'unlocked' ? 'unlocked' : 'locked';
    }
    if (options.unlockActive !== undefined) {
      this.unlockActive = options.unlockActive !== false;
    }

    if (!this.root) {
      return;
    }

    const locked = this.workspaceMode === 'locked';
    const waiting = this.side === 'unlocking' && !this.unlockActive;

    this.root.classList.toggle('rs-panel-locked', locked);
    this.root.classList.toggle('rs-panel-unlocked', !locked);
    this.root.classList.toggle('rs-panel-waiting', waiting);

    const gate = this.root.querySelector('.rs-panel-gate');
    if (gate) {
      gate.hidden = !waiting;
    }

    const witnessEditable = this.side === 'unlocking';
    const interactionEnabled = this.side === 'locking' || this.unlockActive;

    this.semanticView.setRenderOptions({
      panelRole: this.side,
      witnessOnlyEditable: witnessEditable,
      interactionEnabled
    });

    this.syncTextareaFromScript();
    if (locked) {
      this.renderSemantic();
    }
  }

  clearUnlockPreview() {
    if (this.side !== 'unlocking') {
      return;
    }
    this.script = {};
    if (this.textarea) {
      this.textarea.value = '{}';
    }
    if (this.semanticEl) {
      this.semanticEl.innerHTML = '';
    }
  }

  setScript(script, options = {}) {
    const waiting =
      this.side === 'unlocking' && !this.unlockActive && this.workspaceMode === 'locked' && !options.force;

    if (waiting) {
      if (!options.silent) {
        this.notifyChange();
      }
      return;
    }

    this.script = script && typeof script === 'object' ? script : {};
    this.syncTextareaFromScript();
    if (this.workspaceMode === 'locked') {
      this.renderSemantic();
    }
    if (!options.silent) {
      this.notifyChange();
    }
  }

  getScript() {
    if (this.workspaceMode === 'unlocked') {
      const text = this.textarea?.value || '{}';
      try {
        this.script = JSON.parse(text);
      } catch (err) {
        throw new Error(`Invalid ${this.side} script JSON: ${err.message}`);
      }
    }
    return this.script;
  }

  syncTextareaFromScript() {
    if (this.textarea) {
      if (this.side === 'unlocking' && !this.unlockActive && this.workspaceMode === 'locked') {
        this.textarea.value = '{}';
        return;
      }
      this.textarea.value = JSON.stringify(this.script, null, 2);
    }
  }

  renderSemantic() {
    if (!this.semanticEl) {
      return;
    }

    if (this.side === 'unlocking' && !this.unlockActive) {
      this.semanticEl.innerHTML = '';
      this.semanticEl.classList.add('rs-semantic-empty');
      return;
    }

    this.semanticEl.classList.remove('rs-semantic-empty');
    this.semanticView.render(this.script);
  }

  openValueEditor(path, value, meta, fieldKind) {
    if (this.side === 'unlocking' && !isWitnessPath(path)) {
      return;
    }
    if (this.side === 'unlocking' && !this.unlockActive) {
      return;
    }

    const kind = fieldKind || inferFieldKindFromPath(path);
    const resolvedMeta = meta || {
      label: String(path[path.length - 1] || 'Value'),
      hint: 'Edit field value',
      action: kind === 'message' ? 'text' : kind
    };

    this.prompt.open(
      {
        meta: resolvedMeta,
        currentValue: value,
        fieldKind: kind,
        context: {
          script: this.script,
          path,
          lockingScript: this.getLockingScript()
        }
      },
      (newValue) => {
        setAtPath(this.script, path, newValue);
        this.syncTextareaFromScript();
        this.renderSemantic();
        this.notifyChange();
      }
    );
  }

  notifyChange() {
    if (typeof this.onChange === 'function') {
      this.onChange(this.script, this.side);
    }
  }
}

module.exports = RustScriptPanel;
