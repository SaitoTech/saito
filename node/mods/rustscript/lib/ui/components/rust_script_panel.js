const SemanticScriptView = require('./semantic_script_view');
const PanelReferenceView = require('./panel_reference_view');
const PlaceholderPrompt = require('./placeholder_prompt');
const { setAtPath } = require('./placeholder_utils');
const { isRequiredPath } = require('./workspace_sync');
const { inferFieldKindFromPath } = require('./field_validation');
const { isLogicalOperator, normalizeLogicalOperator } = require('./logical_operators');

/**
 * Contextual workspace panel.
 * displayMode: semantic | source | reference
 * role: create | test  (maps to legacy side locking | unlocking)
 */
class RustScriptPanel {
  constructor(app, mod, options = {}) {
    this.app = app;
    this.mod = mod;
    this.role = options.role || (options.side === 'unlocking' ? 'test' : 'create');
    this.side = this.role === 'test' ? 'unlocking' : 'locking';

    this.workspaceMode = 'locked';
    this.testActive = false;
    this.displayMode = 'semantic';
    this.referenceContext = null;

    this.script = options.script || {};
    this.onChange = options.onChange || null;
    this.onOpcodeClick = options.onOpcodeClick || null;
    this.getLockingScript = options.getLockingScript || (() => ({}));

    this.mountEl = null;
    this.root = null;
    this.textarea = null;
    this.semanticEl = null;
    this.referenceEl = null;

    this.prompt = new PlaceholderPrompt(app, mod, {
      getLockingScript: () => this.getLockingScript()
    });
    this.semanticView = new SemanticScriptView(app, mod, {
      panelRole: this.side,
      requiredOnlyEditable: this.role === 'test',
      interactionEnabled: true,
      onPlaceholderClick: (path, value, meta) => this.openValueEditor(path, value, meta),
      onFieldClick: (path, value, meta, fieldKind) => this.openValueEditor(path, value, meta, fieldKind),
      onOpcodeClick: (key) => this.handleOpcodeClick(key)
    });
    this.referenceView = new PanelReferenceView(app, mod);
  }

  handleOpcodeClick(key) {
    if (typeof this.onOpcodeClick === 'function') {
      this.onOpcodeClick(key);
    }
  }

  renderShell() {
    const title = this.role === 'create' ? 'Create Script' : 'Test Script';

    return `
      <div class="rs-panel-root rs-panel-${this.side} rs-panel-role-${this.role}" data-rs-role="${this.role}" data-rs-side="${this.side}">
        <div class="rs-panel-header" hidden>
          <span class="rs-editor-title rs-panel-title">${title}</span>
        </div>
        <div class="rs-panel-body">
          <div class="rs-panel-reference"></div>
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
    this.referenceEl = container.querySelector('.rs-panel-reference');

    if (this.role === 'create') {
      this.textarea.classList.add('rs-locking-script');
    } else {
      this.textarea.classList.add('rs-unlocking-script');
    }

    this.semanticView.mount(this.semanticEl);
    this.referenceView.mount(this.referenceEl);
    this.bindEvents();
    this.setScript(this.script);
    this.applyWorkspaceState();
  }

  bindEvents() {
    this.textarea?.addEventListener('input', () => {
      if (this.displayMode !== 'source') {
        return;
      }
      try {
        this.script = JSON.parse(this.textarea.value || '{}');
        this.notifyChange();
      } catch (err) {
        /* allow invalid JSON while typing in source mode */
      }
    });
  }

  resolveDisplayMode() {
    if (this.role === 'create') {
      return this.workspaceMode === 'unlocked' ? 'source' : 'semantic';
    }
    if (this.workspaceMode === 'unlocked') {
      return 'source';
    }
    if (!this.testActive) {
      return 'reference';
    }
    if (this.referenceContext?.phase === 'required-complete') {
      return 'reference';
    }
    return 'semantic';
  }

  applyWorkspaceState(options = {}) {
    if (options.workspaceMode !== undefined) {
      this.workspaceMode = options.workspaceMode === 'unlocked' ? 'unlocked' : 'locked';
    }
    if (options.unlockActive !== undefined) {
      this.testActive = options.unlockActive !== false;
    }
    if (options.testActive !== undefined) {
      this.testActive = options.testActive !== false;
    }
    if (options.referenceContext !== undefined) {
      this.referenceContext = options.referenceContext;
    }

    if (!this.root) {
      return;
    }

    const displayMode = this.resolveDisplayMode();
    this.setDisplayMode(displayMode);

    if (this.workspaceMode === 'unlocked') {
      this.syncExpertTextarea();
    }

    const requiredEditable = this.role === 'test';
    const interactionEnabled = this.role === 'create' || this.testActive;

    this.semanticView.setRenderOptions({
      panelRole: this.side,
      requiredOnlyEditable: requiredEditable,
      interactionEnabled
    });

    this.root.classList.toggle('rs-panel-test-live', this.role === 'test' && this.testActive);
    this.root.classList.toggle('rs-panel-test-guidance', this.role === 'test' && !this.testActive);

    this.updatePanelHeader(displayMode);

    this.updateRequiredBar();
    this.refreshGuidance();
  }

  updateRequiredBar() {
    const phase = this.referenceContext?.phase;
    const showRequiredBar =
      this.role === 'test' &&
      this.testActive &&
      this.workspaceMode === 'locked' &&
      phase === 'required-help';

    this.root?.classList.toggle('rs-panel-has-required-bar', showRequiredBar);

    if (showRequiredBar && this.referenceEl) {
      this.referenceView.render(this.referenceContext || {});
    }
  }

  setDisplayMode(mode) {
    this.displayMode = mode;

    this.root.classList.toggle('rs-panel-mode-semantic', mode === 'semantic');
    this.root.classList.toggle('rs-panel-mode-source', mode === 'source');
    this.root.classList.toggle('rs-panel-mode-reference', mode === 'reference');

    this.updatePanelHeader(mode);

    if (this.workspaceMode === 'unlocked') {
      this.syncExpertTextarea();
    } else {
      this.syncTextareaFromScript();
    }
    this.updateRequiredBar();

    if (mode === 'semantic') {
      this.renderSemantic();
    } else if (mode === 'reference') {
      this.renderReference();
    }

    this.refreshGuidance();
  }

  clearUnlockPreview() {
    if (this.role !== 'test') {
      return;
    }
    this.script = {};
    if (this.textarea) {
      this.textarea.value = '{}';
    }
    if (this.semanticEl) {
      this.semanticEl.innerHTML = '';
    }
    if (this.displayMode === 'reference') {
      this.renderReference();
    }
  }

  setScript(script, options = {}) {
    const defer =
      this.role === 'test' &&
      !this.testActive &&
      this.workspaceMode === 'locked' &&
      this.resolveDisplayMode() === 'reference' &&
      !options.force;

    if (defer) {
      if (!options.silent) {
        this.notifyChange();
      }
      if (this.displayMode === 'reference') {
        this.renderReference();
      }
      return;
    }

    this.script = script && typeof script === 'object' ? script : {};
    if (this.workspaceMode === 'unlocked') {
      this.syncExpertTextarea();
    } else {
      this.syncTextareaFromScript();
    }

    if (this.displayMode === 'semantic') {
      this.renderSemantic();
    } else if (this.displayMode === 'reference') {
      this.renderReference();
    }

    if (!options.silent) {
      this.notifyChange();
    }
  }

  getScript() {
    if (this.displayMode === 'source') {
      const text = this.textarea?.value || '{}';
      try {
        const parsed = JSON.parse(text);
        this.script = parsed && typeof parsed === 'object' ? parsed : {};
      } catch (err) {
        throw new Error(`Invalid ${this.role} script JSON: ${err.message}`);
      }
    }
    return this.script;
  }

  updatePanelHeader(displayMode) {
    const header = this.root?.querySelector('.rs-panel-header');
    const guided = this.workspaceMode === 'locked';
    const expert = this.workspaceMode === 'unlocked';
    const infoMode = this.role === 'test' && displayMode === 'reference';

    let showHeader = false;
    if (this.role === 'create') {
      showHeader = true;
    } else if (this.role === 'test') {
      showHeader = expert || (guided && this.testActive);
    }

    if (header) {
      header.hidden = !showHeader;
    }

    this.root?.classList.toggle('rs-panel-no-header', infoMode);
    this.root?.classList.toggle('rs-panel-info-mode', infoMode);
  }

  syncTextareaFromScript() {
    if (!this.textarea) {
      return;
    }
    if (this.role === 'test' && !this.testActive && this.workspaceMode === 'locked') {
      this.textarea.value = '{}';
      return;
    }
    this.textarea.value = JSON.stringify(this.script, null, 2);
  }

  syncExpertTextarea() {
    if (!this.textarea || this.workspaceMode !== 'unlocked') {
      return;
    }
    this.textarea.value = JSON.stringify(this.script, null, 2);
  }

  renderSemantic() {
    if (!this.semanticEl) {
      return;
    }
    this.semanticView.render(this.script);
  }

  renderReference() {
    if (!this.referenceEl) {
      return;
    }
    this.referenceView.render(this.referenceContext || {});
  }

  openValueEditor(path, value, meta, fieldKind) {
    if (this.role === 'test' && !isRequiredPath(path)) {
      return;
    }
    if (this.role === 'test' && !this.testActive) {
      return;
    }

    const kind = fieldKind || inferFieldKindFromPath(path);
    const lastKey = path.length ? path[path.length - 1] : '';
    const isLogicalOpField = lastKey === 'op' && isLogicalOperator(value);

    const resolvedMeta =
      meta ||
      (isLogicalOpField
        ? {
            label: normalizeLogicalOperator(value),
            hint: 'Choose how conditions combine',
            action: 'logical'
          }
        : {
            label: String(lastKey || 'Value'),
            hint: 'Edit field value',
            action: kind === 'message' ? 'text' : kind
          });

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
        this.applyFieldValue(path, newValue);
      }
    );
  }

  applyFieldValue(path, newValue) {
    if (!path || !path.length) {
      return;
    }

    setAtPath(this.script, path, newValue);

    if (this.workspaceMode === 'unlocked') {
      this.syncExpertTextarea();
    } else {
      this.syncTextareaFromScript();
    }

    if (this.displayMode === 'semantic') {
      this.renderSemantic();
    }

    this.notifyChange();
  }

  refreshGuidance() {
    if (this.role !== 'test') {
      return;
    }
    if (this.displayMode === 'reference') {
      this.renderReference();
      return;
    }
    if (this.root?.classList.contains('rs-panel-has-required-bar') && this.referenceContext) {
      this.referenceView.render(this.referenceContext);
    }
  }

  notifyChange() {
    if (typeof this.onChange === 'function') {
      this.onChange(this.script, this.side);
    }
  }
}

module.exports = RustScriptPanel;
