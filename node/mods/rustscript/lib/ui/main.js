const MainTemplate = require('./main.template');
const RustscriptEditor = require('./editor');
const RustscriptPanel = require('./panel');
const WelcomeOverlay = require('./overlays/welcome');
const PublicKeyFieldOverlay = require('./overlays/fields/publickey');
const SignatureFieldOverlay = require('./overlays/fields/signature');
const TextFieldOverlay = require('./overlays/fields/text');
const HashFieldOverlay = require('./overlays/fields/hash');
const LogicalFieldOverlay = require('./overlays/fields/logical');
const NumberFieldOverlay = require('./overlays/fields/number');
const OpcodesOverlay = require('./overlays/opcodes');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const { evaluateWorkspaceStatus, resolveFieldOverlayKind } = require('./script_validate');
const {
  build_test_script_from_create,
  lockingView
} = require('./script_build');

class RustscriptMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.container = '.saito-container';
    this.workspaceMode = 'locked';
    this.testingUnlocked = false;
    this.executionStatus = { attempted: false, success: false };
    this.validationDisplay = null;
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
      message: new TextFieldOverlay(app, mod),
      hash: new HashFieldOverlay(app, mod),
      logical: new LogicalFieldOverlay(app, mod),
      number: new NumberFieldOverlay(app, mod)
    };
  }

  render() {
    if (document.querySelector('.rustscript')) {
      this.app.browser.replaceElementBySelector(MainTemplate(), '.rustscript');
    } else {
      this.app.browser.addElementToSelector(MainTemplate(), this.container);
    }

    document.body.classList.add('rustscript');

    this.syncEditorModes();
    this.attachEvents();
    this.refresh();

    if (WelcomeOverlay.shouldShow(this.app)) {
      this.welcomeOverlay.render();
    }
  }

  syncEditorModes() {
    const mode = this.workspaceMode === 'locked' ? 'guided' : 'expert';
    this.createEditor.displayMode = mode;
    this.testEditor.displayMode = mode;
  }

  attachEvents() {
    const openWelcome = () => {
      this.welcomeOverlay.render('splash');
    };

    document.querySelector('.rs-new-script')?.addEventListener('click', openWelcome);

    document.querySelector('.rs-workspace-toggle')?.addEventListener('click', () => {
      this.setWorkspaceMode(this.workspaceMode === 'locked' ? 'unlocked' : 'locked');
    });
  }

  setWorkspaceMode(mode) {
    this.workspaceMode = mode === 'unlocked' ? 'unlocked' : 'locked';
    if (this.workspaceMode === 'unlocked') {
      this.testingUnlocked = true;
      this.syncTestScriptFromLocking();
    }
    this.syncEditorModes();
    this.applyWorkspaceUI();
    this.refresh();
  }

  enterCreateGuided(lockingScript) {
    this.testingUnlocked = false;
    this.executionStatus = { attempted: false, success: false };
    this.validationDisplay = null;
    this.workspaceMode = 'locked';
    this.mod.setScript(lockingView(lockingScript || {}));
    this.syncEditorModes();
    this.applyWorkspaceUI();
    this.refresh();
  }

  enterCreateFromScratch() {
    this.testingUnlocked = false;
    this.executionStatus = { attempted: false, success: false };
    this.validationDisplay = null;
    this.workspaceMode = 'locked';
    this.lastScriptSource = '';
    this.mod.setScript({});
    this.syncEditorModes();
    this.applyWorkspaceUI();
    this.refresh();
    this.renderGenerateExpertOverlay();
  }

  enterExpertMode() {
    this.testingUnlocked = true;
    this.executionStatus = { attempted: false, success: false };
    this.validationDisplay = null;
    this.setWorkspaceMode('unlocked');
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

    const locking = lockingView(this.mod.getScript());
    const unlocking = this.testingUnlocked ? this.mod.getScript() : {};
    const status = evaluateWorkspaceStatus(
      locking,
      unlocking,
      this.executionStatus,
      this.mod.opcodes
    );

    const scriptReady = status.script.state === 'ready';
    const testLive = guided ? this.testingUnlocked && scriptReady : scriptReady;
    const showMoveToTesting = guided && scriptReady && !this.testingUnlocked;

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
    toggle.setAttribute('aria-checked', guided ? 'true' : 'false');
    const thumbText = toggle.querySelector('.rs-workspace-toggle-thumb-text');
    if (thumbText) {
      thumbText.textContent = guided ? 'GUIDED' : 'EXPERT';
    }
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
        lockingView(this.mod.getScript()),
        this.testingUnlocked ? this.mod.getScript() : {},
        this.executionStatus,
        this.mod.opcodes
      );

    const scriptReady = status.script.state === 'ready';
    const testLive = options.testLive ?? (this.testingUnlocked && scriptReady);
    const execSuccess = this.executionStatus?.success === true;
    const scriptState = scriptReady ? 'ready' : status.script.state;
    const requiredState = execSuccess && scriptReady ? 'ready' : status.required.state;
    let validState = execSuccess && scriptReady ? 'ready' : status.valid.state;
    if (this.validationDisplay === 'valid') {
      validState = 'ready';
    } else if (this.validationDisplay === 'invalid' || this.validationDisplay === 'invalid_json') {
      validState = 'warn';
    }

    this.setStatusReactor('.rs-status-script', scriptState, {
      idle: 'No script defined',
      warn: 'Script incomplete or unresolved placeholders',
      ready: 'Script complete'
    });

    if (!scriptReady || (this.workspaceMode === 'locked' && !testLive)) {
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
      warn: 'Script validation failed',
      ready: 'Script validated successfully'
    });

    const validEl = document.querySelector('.rs-status-valid');
    if (validEl) {
      const label = validEl.querySelector('.rs-status-reactor-label');
      if (label) {
        if (this.validationDisplay === 'invalid_json') {
          label.textContent = 'INVALID JSON';
        } else if (this.validationDisplay === 'valid') {
          label.textContent = 'VALID';
        } else if (this.validationDisplay === 'invalid') {
          label.textContent = 'INVALID';
        } else {
          label.textContent = 'VALID';
        }
      }
    }
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

  syncTestScriptFromLocking() {
    const merged = build_test_script_from_create(
      lockingView(this.mod.getScript()),
      this.mod.getScript(),
      this.mod.opcodes
    );
    this.mod.setScript(merged);
  }

  refresh() {
    if (this.testingUnlocked) {
      this.syncTestScriptFromLocking();
    }
    this.createEditor.render();
    if (this.testingUnlocked) {
      this.testEditor.render();
      this.autoValidateTestScript();
    } else {
      this.validationDisplay = null;
      this.executionStatus = { attempted: false, success: false };
    }
    this.applyWorkspaceUI();
    this.panel.render();
  }

  openFieldOverlay(path) {
    if (!path) {
      return;
    }
    const current = this.mod.getField(path);
    const kind = resolveFieldOverlayKind(current, path);
    const overlay = this.fieldOverlays[kind] || this.fieldOverlays.text;
    overlay.path = path;
    overlay.currentValue = current;
    overlay.onApply = (next) => {
      this.mod.setField(path, next);
      this.refresh();
    };

    if (kind === 'text' || kind === 'message') {
      overlay.title = kind === 'message' ? 'Message' : 'Text';
      overlay.multiline = kind !== 'message';
      overlay.placeholder = kind === 'message' ? 'Message to sign or verify' : '';
      overlay.submitLabel = 'Apply';
    }

    if (kind === 'number') {
      const key = String(path).split('.').pop().toLowerCase();
      overlay.title = key === 'm' ? 'Threshold (M)' : key === 'n' ? 'Total Keys (N)' : 'Number';
      overlay.placeholder = '0';
    }

    const result = overlay.render();
    if (result && typeof result.then === 'function') {
      result.catch((err) => {
        siteMessage(err.message || 'Could not open field editor');
      });
    }
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
        this.validationDisplay = null;
        this.mod.setScript(lockingView(result.lockingScript));
        this.testingUnlocked = false;
        if (result.unlockingScript && Object.keys(result.unlockingScript).length) {
          this.testingUnlocked = true;
          this.mod.setScript(result.unlockingScript);
        }
        this.lastScriptSource = text;
        this.generateExpertOverlay.hide();
        this.refresh();
      } catch (err) {
        siteMessage(err.message || 'Failed to parse expert script');
      }
    });
  }

  autoValidateTestScript() {
    const testEl = document.querySelector('#rustscript-editor-test');
    if (!testEl) {
      this.validationDisplay = null;
      this.executionStatus = { attempted: false, success: false };
      return;
    }
    if (testEl.hidden) {
      this.validationDisplay = null;
      this.executionStatus = { attempted: false, success: false };
      return;
    }

    const scriptReady =
      evaluateWorkspaceStatus(
        lockingView(this.mod.getScript()),
        this.mod.getScript(),
        this.executionStatus,
        this.mod.opcodes
      ).script.state === 'ready';
    if (!scriptReady) {
      this.validationDisplay = null;
      this.executionStatus = { attempted: false, success: false };
      return;
    }

    const isExpert = testEl.classList.contains('is-expert');
    const scriptText = isExpert
      ? testEl.querySelector('.rustscript-editor-expert')?.value
      : JSON.stringify(this.mod.getScript());

    let scriptJson;
    try {
      scriptJson = JSON.parse(scriptText);
    } catch (err) {
      this.validationDisplay = 'invalid_json';
      this.executionStatus = { attempted: true, success: false };
      return;
    }

    const evaluate = this.app?.core?.scripting?.evaluate;
    if (typeof evaluate !== 'function') {
      return;
    }

    const result = evaluate(scriptJson);

    const success = result === 1;
    this.validationDisplay = success ? 'valid' : 'invalid';
    this.executionStatus = { attempted: true, success };
  }
}

module.exports = RustscriptMain;
