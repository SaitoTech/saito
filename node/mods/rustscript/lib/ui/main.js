const MainTemplate = require('./main.template');
const RustscriptEditor = require('./editor');
const RustscriptPanel = require('./panel');
const WelcomeOverlay = require('./overlays/welcome');
const PublicKeyFieldOverlay = require('./overlays/fields/publickey');
const SignatureFieldOverlay = require('./overlays/fields/signature');
const TextFieldOverlay = require('./overlays/fields/text');
const HashFieldOverlay = require('./overlays/fields/hash');
const LogicalFieldOverlay = require('./overlays/fields/logical');
const OpcodesOverlay = require('./overlays/opcodes');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const { evaluateWorkspaceStatus, evaluateScriptStatus, validateScriptStructure } = require('./script_validate');
const {
  build_test_script_from_create,
  defaultStarterScript,
  getContractTemplates
} = require('./script_build');

class RustscriptMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.container = '.saito-container';
    this.workspaceMode = 'locked';
    this.testingUnlocked = false;
    this.scriptReady = false;
    this.executionStatus = { attempted: false, success: false };
    this.lastScriptSource = '';

    this.createEditor = new RustscriptEditor(app, mod, '#rustscript-editor-create', 'create');
    this.testEditor = new RustscriptEditor(app, mod, '#rustscript-editor-test', 'test');
    this.panel = new RustscriptPanel(app, mod, '#rustscript-panel', this);
    this.welcomeOverlay = new WelcomeOverlay(app, mod, this);
    this.opcodesOverlay = new OpcodesOverlay(app, mod);
    this.generateExpertOverlay = new SaitoOverlay(app, mod, false);

    this.fieldOverlays = {
      publickey: new PublicKeyFieldOverlay(app, mod),
      signature: new SignatureFieldOverlay(app, mod),
      text: new TextFieldOverlay(app, mod),
      hash: new HashFieldOverlay(app, mod),
      logical: new LogicalFieldOverlay(app, mod)
    };
  }

  render() {
    if (document.querySelector('.rustscript')) {
      this.app.browser.replaceElementBySelector(MainTemplate(), '.rustscript');
    } else {
      this.app.browser.addElementToSelector(MainTemplate(), this.container);
    }

    document.body.classList.add('rustscript');

    if (!this.mod.getScript()?.op) {
      this.mod.setScript(defaultStarterScript(this.mod.opcodes));
    }

    this.syncEditorModes();
    this.mountTemplateMenu();
    this.createEditor.render();
    this.testEditor.render();
    this.panel.render();
    this.applyWorkspaceUI();
    this.attachEvents();

    if (WelcomeOverlay.shouldShow(this.app)) {
      this.welcomeOverlay.render();
    }
  }

  syncEditorModes() {
    const mode = this.workspaceMode === 'locked' ? 'guided' : 'expert';
    this.createEditor.displayMode = mode;
    this.testEditor.displayMode = mode;
  }

  mountTemplateMenu() {
    const inner = document.querySelector('.rs-template-menu-inner');
    if (!inner) {
      return;
    }
    const templates = getContractTemplates(this.mod.opcodes);
    inner.innerHTML = templates
      .map(
        (t) =>
          `<button type="button" class="rs-template-pick" data-template-id="${t.id}">${t.name}</button>`
      )
      .join('');

    inner.querySelectorAll('.rs-template-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tpl = templates.find((t) => t.id === btn.dataset.templateId);
        if (tpl) {
          this.loadTemplate(tpl.locking);
        }
        document.querySelector('.rs-template-menu')?.setAttribute('hidden', '');
      });
    });
  }

  attachEvents() {
    const openWelcome = () => {
      this.welcomeOverlay.render('splash');
    };

    document.querySelector('.rs-new-script')?.addEventListener('click', openWelcome);

    document.querySelector('.rs-workspace-toggle')?.addEventListener('click', () => {
      this.setWorkspaceMode(this.workspaceMode === 'locked' ? 'unlocked' : 'locked');
    });

    document.querySelector('.rs-import-script')?.addEventListener('click', () => {
      document.querySelector('.rs-import-file')?.click();
    });

    document.querySelector('.rs-import-file')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = this.parseImportedContract(String(reader.result || ''));
          this.executionStatus = { attempted: false, success: false };
          if (parsed.locking) {
            this.mod.setScript(stripWitnessForLocking(parsed.locking));
          }
          if (parsed.unlocking) {
            this.testingUnlocked = true;
            this.mod.setScript(parsed.unlocking);
          } else {
            this.testingUnlocked = false;
          }
          this.refresh();
          siteMessage('Script imported');
        } catch (err) {
          siteMessage(err.message);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    document.querySelector('.rs-templates')?.addEventListener('click', () => {
      const menu = document.querySelector('.rs-template-menu');
      if (menu) {
        menu.toggleAttribute('hidden');
      }
    });

    document.querySelector('.rs-expert-syntax')?.addEventListener('click', () => {
      this.renderGenerateExpertOverlay();
    });

    document.querySelector('.rs-run-validate')?.addEventListener('click', () => {
      this.validateLockingScript();
    });

    if (!this._templateMenuOutsideClick) {
      this._templateMenuOutsideClick = (e) => {
        const menu = document.querySelector('.rs-template-menu');
        if (!menu || menu.hasAttribute('hidden')) {
          return;
        }
        if (e.target.closest('.rs-template-menu') || e.target.closest('.rs-templates')) {
          return;
        }
        menu.setAttribute('hidden', '');
      };
      document.addEventListener('click', this._templateMenuOutsideClick);
    }
  }

  setWorkspaceMode(mode) {
    this.workspaceMode = mode === 'unlocked' ? 'unlocked' : 'locked';
    if (this.workspaceMode === 'unlocked') {
      this.testingUnlocked = true;
      const locking = stripWitnessForLocking(this.mod.getScript());
      const merged = build_test_script_from_create(locking, this.mod.getScript(), this.mod.opcodes);
      this.mod.setScript(merged);
    }
    this.syncEditorModes();
    this.applyWorkspaceUI();
    this.refresh();
  }

  enterCreateGuided(lockingScript) {
    this.testingUnlocked = false;
    this.executionStatus = { attempted: false, success: false };
    this.workspaceMode = 'locked';
    this.mod.setScript(stripWitnessForLocking(lockingScript || defaultStarterScript(this.mod.opcodes)));
    this.syncEditorModes();
    this.applyWorkspaceUI();
    this.refresh();
  }

  enterInteractGuided(parsed) {
    this.testingUnlocked = true;
    this.executionStatus = { attempted: false, success: false };
    this.workspaceMode = 'locked';
    if (parsed.locking) {
      this.mod.setScript(stripWitnessForLocking(parsed.locking));
    }
    if (parsed.unlocking) {
      const merged = build_test_script_from_create(
        stripWitnessForLocking(parsed.locking || this.mod.getScript()),
        parsed.unlocking,
        this.mod.opcodes
      );
      this.mod.setScript(merged);
    } else if (parsed.locking) {
      const merged = build_test_script_from_create(
        stripWitnessForLocking(parsed.locking),
        this.mod.getScript(),
        this.mod.opcodes
      );
      this.mod.setScript(merged);
    }
    this.syncEditorModes();
    this.applyWorkspaceUI();
    this.refresh();
  }

  enterExpertMode() {
    this.testingUnlocked = true;
    this.executionStatus = { attempted: false, success: false };
    this.setWorkspaceMode('unlocked');
  }

  parseImportedContract(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('Contract must be a JSON object');
    }
    return { locking: obj, unlocking: null };
  }

  applyWorkspaceUI() {
    const root = document.querySelector('.rustscript');
    if (!root) {
      return;
    }

    const guided = this.workspaceMode === 'locked';
    root.classList.toggle('rs-workspace-guided', guided);
    root.classList.toggle('rs-workspace-locked', guided);
    root.classList.toggle('rs-workspace-unlocked', !guided);
    document.body.classList.toggle('rs-workspace-guided', guided);
    document.body.classList.toggle('rs-workspace-unlocked', !guided);

    const locking = stripWitnessForLocking(this.mod.getScript());
    const unlocking = this.testingUnlocked ? this.mod.getScript() : {};
    const status = evaluateWorkspaceStatus(
      locking,
      unlocking,
      this.executionStatus,
      this.mod.opcodes
    );

    this.scriptReady = status.script.state === 'ready';
    const testLive = guided ? this.testingUnlocked && this.scriptReady : this.scriptReady;
    const showMoveToTesting = guided && this.scriptReady && !this.testingUnlocked;

    this.updateWorkspaceToggle();
    this.refreshStatusIndicators(status, { testLive, showMoveToTesting });

    const testEditor = root.querySelector('#rustscript-editor-test');
    if (testEditor) {
      testEditor.hidden = !testLive;
    }
  }

  updateWorkspaceToggle() {
    const toggle = document.querySelector('.rs-workspace-toggle');
    if (!toggle) {
      return;
    }
    const guided = this.workspaceMode === 'locked';
    toggle.classList.toggle('is-guided', guided);
    toggle.classList.toggle('is-expert', !guided);
    const thumbLabel = toggle.querySelector('.rs-workspace-toggle-label');
    const inactiveLabel = toggle.querySelector('.rs-workspace-toggle-inactive');
    if (thumbLabel) {
      thumbLabel.textContent = guided ? 'GUIDED' : 'EXPERT';
    }
    if (inactiveLabel) {
      inactiveLabel.textContent = guided ? 'EXPERT' : 'GUIDED';
    }
    toggle.setAttribute('aria-checked', guided ? 'true' : 'false');
    toggle.setAttribute(
      'aria-label',
      guided
        ? 'Guided mode — step-by-step semantic editing. Switch to Expert for raw JSON.'
        : 'Expert mode — direct JSON editing. Switch to Guided for assisted editing.'
    );
  }

  refreshStatusIndicators(statusIn, options = {}) {
    const status =
      statusIn ||
      evaluateWorkspaceStatus(
        stripWitnessForLocking(this.mod.getScript()),
        this.testingUnlocked ? this.mod.getScript() : {},
        this.executionStatus,
        this.mod.opcodes
      );

    const testLive = options.testLive ?? (this.testingUnlocked && this.scriptReady);
    const execSuccess = this.executionStatus?.success === true;
    const scriptState = status.script.state === 'ready' ? 'ready' : status.script.state;
    const requiredState = execSuccess && this.scriptReady ? 'ready' : status.required.state;
    const validState = execSuccess && status.script.state === 'ready' ? 'ready' : status.valid.state;

    this.setStatusReactor('.rs-status-script', scriptState, {
      idle: 'No script defined',
      warn: 'Script incomplete or unresolved placeholders',
      ready: 'Script complete'
    });

    if (!this.scriptReady || (this.workspaceMode === 'locked' && !testLive)) {
      this.setStatusReactor('.rs-status-required', 'inactive', {
        inactive: options.showMoveToTesting
          ? 'Script complete — move into testing to fill required fields'
          : 'Waiting for script — required fields unlock when script is complete'
      });
    } else {
      this.setStatusReactor('.rs-status-required', requiredState, {
        idle: 'No required fields yet',
        warn: 'Required fields have unresolved placeholders',
        ready: 'Required fields complete'
      });
    }

    this.setStatusReactor('.rs-status-valid', validState, {
      idle: 'Script incomplete',
      warn: 'Script complete — ready to validate',
      ready: 'Execution succeeded'
    });
  }

  setStatusReactor(selector, state, titles) {
    const el = document.querySelector(selector);
    if (!el) {
      return;
    }
    el.dataset.state = state;
    if (titles?.[state]) {
      el.title = titles[state];
    }
  }

  refresh() {
    if (this.testingUnlocked && this.workspaceMode === 'locked') {
      const locking = stripWitnessForLocking(this.mod.getScript());
      const merged = build_test_script_from_create(locking, this.mod.getScript(), this.mod.opcodes);
      this.mod.setScript(merged);
    }
    this.createEditor.render();
    if (this.testingUnlocked) {
      this.testEditor.render();
    }
    this.applyWorkspaceUI();
    this.panel.render();
  }

  loadTemplate(locking) {
    if (!locking || typeof locking !== 'object') {
      return;
    }
    this.executionStatus = { attempted: false, success: false };
    this.testingUnlocked = false;
    this.mod.setScript(stripWitnessForLocking(locking));
    this.applyWorkspaceUI();
    this.refresh();
    siteMessage('Template loaded');
  }

  openFieldOverlay(path) {
    if (!path) {
      return;
    }
    const current = this.mod.getField(path);
    const kind = fieldOverlayKind(current, path);
    const overlay = this.fieldOverlays[kind] || this.fieldOverlays.text;
    overlay.path = path;
    overlay.currentValue = current;
    overlay.onApply = (next) => {
      this.mod.setField(path, next);
      this.refresh();
    };
    overlay.render();
  }

  openOpcodeReference(key) {
    this.opcodesOverlay.open(key);
  }

  renderGenerateExpertOverlay() {
    const html = `
      <div class="rustscript-overlay">
        <h2>Generate Expert Script</h2>
        <p class="rs-overlay-hint">The only place to author symbolic human-readable scripts.</p>
        <label>Expert script</label>
        <textarea class="rs-expert-input" spellcheck="false" placeholder="CHECKSIG[publickey=&quot;alice&quot;]&#10;AND&#10;IMPORTFIELD[field=&quot;duration&quot;]"></textarea>
        <div class="overlay-actions overlay-actions-apply-only">
          <button type="button" class="rs-expert-generate-btn rs-prompt-primary">Generate</button>
        </div>
      </div>
    `;
    this.generateExpertOverlay.show(html);
    const input = document.querySelector('.rs-expert-input');
    if (input) {
      input.value = this.lastScriptSource || '';
    }
    document.querySelector('.rs-expert-generate-btn')?.addEventListener('click', () => {
      const text = document.querySelector('.rs-expert-input')?.value?.trim();
      if (!text) {
        return;
      }
      try {
        const result = this.mod.parseExpertScript(text);
        this.executionStatus = { attempted: false, success: false };
        this.mod.setScript(stripWitnessForLocking(result.lockingScript));
        if (result.unlockingScript && Object.keys(result.unlockingScript).length) {
          this.testingUnlocked = true;
          this.mod.setScript(result.unlockingScript);
        }
        this.lastScriptSource = text;
        this.generateExpertOverlay.hide();
        this.refresh();
        siteMessage('Expert script parsed');
      } catch (err) {
        siteMessage(err.message || 'Failed to parse expert script');
      }
    });
  }

  validateLockingScript() {
    try {
      const locking = stripWitnessForLocking(this.mod.getScript());
      const validation = validateScriptStructure(locking, { locking: true });
      if (!validation.valid) {
        throw new Error(validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '));
      }
      siteMessage('Script structure is valid');
      this.applyWorkspaceUI();
    } catch (err) {
      siteMessage(`Validation failed: ${err.message}`);
      this.applyWorkspaceUI();
    }
  }

  runExecution() {
    if (!this.scriptReady) {
      siteMessage('Complete your script in Create Script before executing');
      return;
    }
    if (this.workspaceMode === 'locked' && !this.testingUnlocked) {
      siteMessage('Move into testing before executing');
      return;
    }

    try {
      const success =
        this.mod.execute({
          app: this.app,
          opcodes: this.mod.opcodes,
          tx: {},
          block: {}
        }) === true;
      this.executionStatus = { attempted: true, success };
      if (success) {
        siteMessage('Execution simulation succeeded');
      } else {
        siteMessage('Execution simulation returned false');
      }
      this.refresh();
    } catch (err) {
      this.executionStatus = { attempted: true, success: false };
      siteMessage(`Execution error: ${err.message}`);
      this.refresh();
    }
  }
}

function stripWitnessForLocking(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(stripWitnessForLocking);
  }
  const out = {};
  for (const key of Object.keys(node)) {
    if (key === 'witness') {
      continue;
    }
    out[key] = stripWitnessForLocking(node[key]);
  }
  return out;
}

function fieldOverlayKind(value, path) {
  const last = String(path || '')
    .split('.')
    .pop()
    .toLowerCase();
  if (last === 'op' && typeof value === 'string') {
    const v = value.trim().toUpperCase();
    if (v === 'AND' || v === 'OR' || v === 'NOT' || v === 'THEN') {
      return 'logical';
    }
  }
  if (typeof value !== 'string') {
    return 'text';
  }
  const m = value.match(/^<([^<>]+)>$/);
  if (!m) {
    if (last === 'publickey' || last === 'publickeys') {
      return 'publickey';
    }
    if (last === 'signature' || last === 'signatures') {
      return 'signature';
    }
    if (last === 'hash') {
      return 'hash';
    }
    return 'text';
  }
  const tag = m[1].toLowerCase();
  if (tag === 'signature' || tag === 'sig') {
    return 'signature';
  }
  if (tag === 'publickey' || tag === 'pubkey') {
    return 'publickey';
  }
  if (tag === 'hash') {
    return 'hash';
  }
  if (tag === 'and' || tag === 'or' || tag === 'not' || tag === 'then') {
    return 'logical';
  }
  return 'text';
}

module.exports = RustscriptMain;
