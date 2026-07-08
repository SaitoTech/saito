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
const PublishFlow = require('./overlays/publish');
const PublishNFTFlow = require('./overlays/publish-nft');
const UnlockFlow = require('./overlays/unlock');
const ImportFlow = require('./overlays/import');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const {
  evaluateWorkspaceStatus,
  deriveWorkflowIndicator,
  isWitnessPhaseComplete,
  resolveFieldOverlayKind
} = require('./script_validate');
const {
  build_test_script_from_create,
  lockingView
} = require('./script_build');
const PanelMenu = require('./panel_menu');

const MOUNT_SELECTOR = '.saito-container';
const WORKSPACE_SELECTOR = 'main.rustscript';

class RustscriptMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.container = MOUNT_SELECTOR;
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
    this.publishFlow = new PublishFlow(app, mod, this);
    this.publishNftFlow = new PublishNFTFlow(app, mod, this, this.publishFlow);
    this.unlockFlow = new UnlockFlow(app, mod, this);
    this.importFlow = new ImportFlow(app, mod, this);
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
    const container = document.querySelector(MOUNT_SELECTOR);
    if (!container) {
      console.error(`RustScript: mount container not found: ${MOUNT_SELECTOR}`);
      return;
    }

    container.classList.add('rustscript');

    const workspaceQuery = `${MOUNT_SELECTOR} ${WORKSPACE_SELECTOR}`;
    if (container.querySelector(WORKSPACE_SELECTOR)) {
      this.app.browser.replaceElementBySelector(MainTemplate(), workspaceQuery);
    } else {
      this.app.browser.addElementToSelector(MainTemplate(), MOUNT_SELECTOR);
    }

    this.syncEditorModes();
    this.attachEvents();
    this.refresh();

    this.welcomeOverlay.render('splash');
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

    document.querySelectorAll('.rs-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === 'expert') {
          this.setWorkspaceMode('unlocked');
        } else if (mode === 'guided') {
          this.setWorkspaceMode('locked');
        }
      });
    });

    document.querySelector('.rs-publish-script')?.addEventListener('click', () => {
      if (!this.shouldShowPublishButton()) {
        return;
      }
      if (this.isUnlockCommandBarAction()) {
        this.unlockFlow.openSolution();
      } else {
        this.publishFlow.openChoice();
      }
    });
  }

  /** Loaded/imported on-chain script — unlock workflow, not a new publish. */
  isUnlockCommandBarAction() {
    return this.mod.workflow === 'unlock';
  }

  isScriptPublishable() {
    const status = evaluateWorkspaceStatus(
      lockingView(this.mod.getScript()),
      this.testingUnlocked ? this.mod.getScript() : {},
      this.executionStatus,
      this.mod.opcodes
    );
    return status.script.state === 'ready';
  }

  /**
   * Command-bar Publish — "Open Publish Overlay".
   * Stays visible once the locking script is publishable until invalidation or reset.
   */
  shouldShowPublishButton() {
    const locking = lockingView(this.mod.getScript());
    const unlocking = this.testingUnlocked ? this.mod.getScript() : {};
    const status = evaluateWorkspaceStatus(
      locking,
      unlocking,
      this.executionStatus,
      this.mod.opcodes
    );

    if (status.script.state !== 'ready') {
      return false;
    }

    if (status.script.validation && status.script.validation.valid === false) {
      return false;
    }

    if (this.validationDisplay === 'invalid_json') {
      return false;
    }

    if (
      isWitnessPhaseComplete(unlocking, this.mod.opcodes) &&
      this.executionStatus?.attempted &&
      this.executionStatus.success !== true
    ) {
      return false;
    }

    if (this.isUnlockCommandBarAction()) {
      if (!isWitnessPhaseComplete(unlocking, this.mod.opcodes)) {
        return false;
      }
      if (this.executionStatus?.success !== true) {
        return false;
      }
    }

    return true;
  }

  updatePublishButton() {
    const slot = document.querySelector('.rs-publish-slot');
    const btn = document.querySelector('.rs-publish-script');
    if (!slot || !btn) {
      return;
    }
    const visible = this.shouldShowPublishButton();
    const isUnlock = this.isUnlockCommandBarAction();
    slot.classList.toggle('is-visible', visible);
    slot.setAttribute('aria-hidden', visible ? 'false' : 'true');
    btn.textContent = isUnlock ? 'Unlock' : 'Publish';
    btn.tabIndex = visible ? 0 : -1;
  }

  exportPanelScript(scope) {
    try {
      let scriptPayload;
      if (scope === 'script-create') {
        scriptPayload = lockingView(this.mod.getScript());
      } else if (scope === 'script-test') {
        scriptPayload = this.mod.getScript();
      } else {
        scriptPayload = this.mod.getScript();
      }

      this.mod.exportScriptDraft(scriptPayload);
    } catch (_err) {
      /* export failed — no transient notification */
    }
  }

  bindPanelMenu(root, menuId) {
    PanelMenu.attach(root, {
      menuId,
      onAction: (action) => {
        if (action === 'export') {
          this.exportPanelScript(menuId);
        }
      }
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
    this.resetWorkspaceToFresh({ expertMode: false, workflow: 'create' }).then(() => {
      this.renderGenerateExpertOverlay();
    });
  }

  enterExpertMode() {
    this.resetWorkspaceToFresh({ expertMode: true, workflow: 'create' });
  }

  resetOverlayFlows() {
    this.generateExpertOverlay?.hide?.();
    this.publishFlow?.hide?.();
    this.publishNftFlow?.hide?.();
    this.unlockFlow?.hide?.();
    this.importFlow?.hide?.();

    if (this.publishFlow) {
      this.publishFlow.pendingTxSignature = '';
      this.publishFlow.p2shAddress = '';
      this.publishFlow.p2shHash = '';
      this.publishFlow.lastPublishedTx = null;
      this.publishFlow.confirmationWaiting?.stop?.();
      this.publishFlow.confirmationWaiting = null;
    }
    if (this.unlockFlow) {
      this.unlockFlow.pendingTxSignature = '';
      this.unlockFlow.confirmationWaiting?.stop?.();
      this.unlockFlow.confirmationWaiting = null;
    }
  }

  resetEditorShells() {
    const root = document.querySelector(`${MOUNT_SELECTOR} ${WORKSPACE_SELECTOR}`);
    if (!root) {
      return;
    }
    ['#rustscript-editor-create', '#rustscript-editor-test'].forEach((sel) => {
      const el = root.querySelector(sel);
      if (el) {
        el.innerHTML = '';
        delete el.dataset.rustscriptEventsAttached;
      }
    });
  }

  async resetWorkspaceToFresh({ expertMode = false, workflow = 'create' } = {}) {
    this.resetOverlayFlows();
    this.mod.resetUnlockWorkflow();
    if (workflow) {
      this.mod.workflow = workflow;
    }
    this.mod.setScript({});
    this.testingUnlocked = !!expertMode;
    this.executionStatus = { attempted: false, success: false };
    this.validationDisplay = null;
    this.lastScriptSource = '';
    this.workspaceMode = expertMode ? 'unlocked' : 'locked';
    this.resetEditorShells();
    this.syncEditorModes();
    this.applyWorkspaceUI();
    await this.refresh({ skipTestSync: true });
  }

  async enterUnlockGuided(lockingScript) {
    this.mod.workflow = 'unlock';
    this.testingUnlocked = true;
    this.executionStatus = { attempted: false, success: false };
    this.validationDisplay = null;
    this.workspaceMode = 'locked';
    const merged = build_test_script_from_create(
      lockingView(lockingScript || {}),
      {},
      this.mod.opcodes
    );
    this.mod.setScript(merged);
    this.syncEditorModes();
    this.applyWorkspaceUI();
    await this.refresh();
  }

  async enterUnlockExpert() {
    this.mod.workflow = 'unlock';
    this.testingUnlocked = true;
    this.executionStatus = { attempted: false, success: false };
    this.validationDisplay = null;
    this.mod.setScript({});
    this.setWorkspaceMode('unlocked');
    this.syncEditorModes();
    await this.refresh();
  }

  applyWorkspaceUI() {
    const root = document.querySelector(`${MOUNT_SELECTOR} ${WORKSPACE_SELECTOR}`);
    const container = document.querySelector(MOUNT_SELECTOR);
    if (!root || !container) {
      return;
    }

    const guided = this.workspaceMode === 'locked';
    root.classList.toggle('rs-workspace-guided', guided);
    root.classList.toggle('rs-workspace-locked', guided);
    root.classList.toggle('rs-workspace-unlocked', !guided);
    container.classList.toggle('rs-workspace-guided', guided);
    container.classList.toggle('rs-workspace-unlocked', !guided);

    const locking = lockingView(this.mod.getScript());
    const unlocking = this.testingUnlocked ? this.mod.getScript() : {};
    const status = evaluateWorkspaceStatus(
      locking,
      unlocking,
      this.executionStatus,
      this.mod.opcodes
    );

    const scriptReady = status.script.state === 'ready';
    const isExpert = !guided;
    const testLive = isExpert ? true : this.testingUnlocked && scriptReady;
    const showMoveToTesting = guided && scriptReady && !this.testingUnlocked;

    this.updateWorkspaceToggle();
    this.refreshStatusIndicators();

    const testEditor = root.querySelector('#rustscript-editor-test');
    if (testEditor) {
      testEditor.hidden = !testLive;
    }
  }

  updateWorkspaceToggle() {
    const guided = this.workspaceMode === 'locked';
    document.querySelector('.rs-mode-guided')?.classList.toggle('is-active', guided);
    document.querySelector('.rs-mode-expert')?.classList.toggle('is-active', !guided);
  }

  refreshStatusIndicators() {
    const locking = lockingView(this.mod.getScript());
    const unlocking = this.testingUnlocked ? this.mod.getScript() : {};

    const workflow = deriveWorkflowIndicator({
      lockingScript: locking,
      unlockingScript: unlocking,
      testingUnlocked: this.testingUnlocked,
      execution: this.executionStatus,
      opcodes: this.mod.opcodes,
      validationDisplay: this.validationDisplay
    });

    this.setStatusReactor('.rs-status-script', workflow.script, {
      idle: 'Script not yet complete',
      ready: 'Script complete'
    });

    this.setStatusReactor('.rs-status-required', workflow.witness, {
      idle: 'Witness step not entered',
      warn: 'Complete required witness fields',
      ready: 'Witness complete'
    });

    this.setStatusReactor('.rs-status-valid', workflow.valid, {
      idle: 'Script evaluation not started',
      warn: 'Witness supplied but script returned false',
      ready: 'Script validates successfully'
    });

    this.setProgressConnector('.rs-progress-connector-1', workflow.arrow1);
    this.setProgressConnector('.rs-progress-connector-2', workflow.arrow2);

    const validEl = document.querySelector('.rs-status-valid');
    if (validEl) {
      const label = validEl.querySelector('.rs-status-reactor-label');
      if (label) {
        if (this.validationDisplay === 'invalid_json') {
          label.textContent = 'Invalid JSON';
        } else if (workflow.phase === 'evaluation_failed') {
          label.textContent = 'Script Invalid';
        } else {
          label.textContent = 'Script Valid';
        }
      }
    }

    this.updatePublishButton();
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

  setProgressConnector(selector, state) {
    const el = document.querySelector(selector);
    if (!el) {
      return;
    }
    el.dataset.state = state;
  }

  syncTestScriptFromLocking() {
    const merged = build_test_script_from_create(
      lockingView(this.mod.getScript()),
      this.mod.getScript(),
      this.mod.opcodes
    );
    this.mod.setScript(merged);
  }

  async refresh({ skipTestSync = false } = {}) {
    if (this.testingUnlocked && !skipTestSync) {
      this.syncTestScriptFromLocking();
    }
    this.createEditor.render();
    if (this.testingUnlocked) {
      this.testEditor.render();
      await this.autoValidateTestScript();
    } else {
      this.validationDisplay = null;
      this.executionStatus = { attempted: false, success: false };
    }
    this.applyWorkspaceUI();
    this.panel.render();
    this.updatePublishButton();
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
      result.catch(() => {});
    }
  }

  openOpcodeReference(key) {
    this.opcodesOverlay.open(key);
  }

  renderGenerateExpertOverlay() {
    const html = `
      <div class="rustscript-overlay">
        <h2>Generate Expert Script</h2>
        <textarea class="rs-expert-input" spellcheck="false" placeholder="CHECKSIG[publickey=&quot;alice&quot;]&#10;AND&#10;IMPORTFIELD[field=&quot;duration&quot;]"></textarea>
        <p class="rs-prompt-validation rs-expert-generate-error" hidden role="alert"></p>
        <div class="overlay-actions overlay-actions-apply-only">
          <button type="button" class="rs-expert-generate-btn rs-prompt-primary">Generate</button>
        </div>
      </div>
    `;
    this.generateExpertOverlay.show(html);
    const input = document.querySelector('.rs-expert-input');
    if (input) {
      input.value = '';
      requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
      });
    }
    document.querySelector('.rs-expert-generate-btn')?.addEventListener('click', () => {
      const text = document.querySelector('.rs-expert-input')?.value?.trim();
      const errorEl = document.querySelector('.rs-expert-generate-error');
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }
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
        if (errorEl) {
          errorEl.textContent = err.message || 'Failed to parse expert script';
          errorEl.hidden = false;
        }
      }
    });
  }

  async autoValidateTestScript() {
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

    if (!isWitnessPhaseComplete(this.mod.getScript(), this.mod.opcodes)) {
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

    const result = await evaluate(scriptJson);

    const success = result === 1;
    this.validationDisplay = success ? 'valid' : 'invalid';
    this.executionStatus = { attempted: true, success };
  }
}

module.exports = RustscriptMain;
