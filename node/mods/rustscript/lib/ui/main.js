const RustscriptMainTemplate = require('./main.template.js');
const GenerateExpertOverlay = require('./overlays/generate_expert.js');
const OnboardingOverlay = require('./overlays/onboarding.js');
const RustScriptPanel = require('./components/rust_script_panel');
const OpcodeReferenceOverlay = require('./components/opcode_reference_overlay');
const { evaluateWorkspaceStatus, evaluateScriptStatus } = require('./components/script_status');
const { materializeUnlockFromScript } = require('./components/workspace_sync');
const { getContractTemplates, scratchContract } = require('./onboarding/contract_templates.js');
const ast_execute = require('../rustscript/ast_execute');

class RustscriptMain {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.generate_expert_overlay = new GenerateExpertOverlay(this.app, this.mod);
    this.onboarding_overlay = null;
    this.lastScriptSource = '';
    this.executionStatus = { attempted: false, success: false };
    this.workspaceMode = 'locked';
    this.scriptReady = false;
    this.testingUnlocked = false;

    this.lockingPanel = null;
    this.unlockingPanel = null;
    this.opcodeReferenceOverlay = null;
    this.guidedMode = null;
    this.guidedStep = 0;
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
    this.workspaceMode = 'locked';
    this.mountPanels();
    this.initOpcodeReferenceOverlay();
    this.mountTemplateMenu();
    this.attachEvents();

    const showOnboarding = OnboardingOverlay.shouldShow(this.app);
    const checksig = this.mod.opcodes?.checksig;
    if (checksig && !this.guidedMode && !showOnboarding) {
      this.setLockingScriptJson(ast_execute.template_locking(checksig));
    }

    this.applyWorkspaceUI();

    if (showOnboarding) {
      this.showOnboarding();
    }
  }

  showOnboarding(options = {}) {
    if (this.onboarding_overlay?.overlay) {
      try {
        this.onboarding_overlay.overlay.remove();
      } catch (err) {
        /* fresh instance */
      }
    }

    this.onboarding_overlay = new OnboardingOverlay(this.app, this.mod, this);
    if (options.step) {
      this.onboarding_overlay.step = options.step;
    }
    this.onboarding_overlay.render();
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

  enterCreateGuided(lockingScript) {
    this.guidedMode = 'create';
    this.guidedStep = 1;
    this.testingUnlocked = false;
    this.executionStatus = { attempted: false, success: false };
    this.setWorkspaceMode('locked');
    this.setLockingScriptJson(lockingScript);
    this.applyWorkspaceUI();
  }

  enterInteractGuided(parsed) {
    this.guidedMode = 'interact';
    this.guidedStep = 2;
    this.testingUnlocked = true;
    this.executionStatus = { attempted: false, success: false };
    this.setWorkspaceMode('locked');

    if (parsed.locking) {
      this.setLockingScriptJson(parsed.locking);
    }
    if (parsed.unlocking) {
      this.setUnlockingScriptJson(parsed.unlocking);
    } else if (parsed.locking) {
      this.syncUnlockFromScript();
    }

    this.applyWorkspaceUI();
  }

  enterExpertMode() {
    this.guidedMode = null;
    this.guidedStep = 0;
    this.testingUnlocked = true;
    this.executionStatus = { attempted: false, success: false };

    const checksig = this.mod.opcodes?.checksig;
    if (checksig) {
      this.setLockingScriptJson(ast_execute.template_locking(checksig));
      this.syncUnlockFromScript();
    }
    this.setWorkspaceMode('unlocked');
  }

  parseImportedContract(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('Contract must be a JSON object');
    }

    if (obj.witness && typeof obj.witness === 'object') {
      const unlocking = { ...obj };
      const witness = unlocking.witness;
      delete unlocking.witness;
      const locking = { ...unlocking };
      return { locking, unlocking: { ...unlocking, witness } };
    }

    return { locking: obj, unlocking: null };
  }

  getLockingScriptSafe() {
    try {
      return this.lockingPanel?.getScript() || {};
    } catch (err) {
      return this.lockingPanel?.script || {};
    }
  }

  getUnlockingScriptSafe() {
    try {
      return this.unlockingPanel?.getScript() || {};
    } catch (err) {
      return this.unlockingPanel?.script || {};
    }
  }

  moveIntoTesting() {
    if (!this.scriptReady) {
      siteMessage('Complete your script in Create Script first');
      return;
    }
    this.testingUnlocked = true;
    this.syncUnlockFromScript();
    this.applyWorkspaceUI();
  }

  returnToScript() {
    this.testingUnlocked = false;
    this.applyWorkspaceUI();
  }

  createTransaction() {
    if (!this.scriptReady) {
      siteMessage('Complete your script in Create Script first');
      return;
    }

    const locking = this.getLockingScriptSafe();
    const json = JSON.stringify(locking, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rustscript-locking.json';
    link.click();
    URL.revokeObjectURL(url);
    siteMessage('Locking script exported — use in your transaction builder');
  }

  syncUnlockFromScript() {
    const locking = this.getLockingScriptSafe();
    const scriptStatus = evaluateScriptStatus(locking);
    const guided = this.workspaceMode === 'locked';
    const expert = this.workspaceMode === 'unlocked';
    const maySync = expert || (scriptStatus.state === 'ready' && (!guided || this.testingUnlocked));

    if (!maySync) {
      this.unlockingPanel?.clearUnlockPreview();
      return;
    }

    try {
      const current = this.getUnlockingScriptSafe();
      const merged = materializeUnlockFromScript(locking, current, this.mod.opcodes);
      this.unlockingPanel?.setScript(merged, { silent: true, force: true });
    } catch (err) {
      console.warn('[rustscript] sync unlock', err.message);
    }
  }

  applyWorkspaceUI() {
    const locking = this.getLockingScriptSafe();
    const unlocking = this.getUnlockingScriptSafe();
    const status = evaluateWorkspaceStatus(locking, unlocking, this.executionStatus);

    const wasReady = this.scriptReady;
    this.scriptReady = status.script.state === 'ready';
    const guided = this.workspaceMode === 'locked';

    if (!this.scriptReady) {
      this.testingUnlocked = false;
    }

    const expert = this.workspaceMode === 'unlocked';
    const showMoveToTesting = guided && this.scriptReady && !this.testingUnlocked;
    const testLive = expert ? true : guided ? this.testingUnlocked && this.scriptReady : this.scriptReady;

    const remainingScript = status.script.placeholders?.length ?? 0;
    const remainingWitness = status.witness.placeholders?.length ?? 0;

    let referencePhase = 'script-help';
    if (testLive && guided) {
      referencePhase = 'witness-help';
    } else if (showMoveToTesting) {
      referencePhase = 'script-ready';
    }

    const referenceContext = {
      lockingScript: locking,
      scriptStatus: status.script,
      guidedMode: this.guidedMode,
      phase: referencePhase,
      remainingCount: testLive ? remainingWitness : remainingScript,
      scriptStructurallyValid: status.script.state === 'ready',
      showMoveToTesting,
      onMoveToTesting: () => this.moveIntoTesting(),
      onCreateTransaction: () => this.createTransaction(),
      onReturnToScript: () => this.returnToScript()
    };

    this.lockingPanel?.applyWorkspaceState({
      workspaceMode: this.workspaceMode,
      testActive: true,
      referenceContext
    });
    this.unlockingPanel?.applyWorkspaceState({
      workspaceMode: this.workspaceMode,
      testActive: testLive,
      unlockActive: testLive,
      referenceContext
    });

    if (!testLive) {
      if (guided) {
        this.unlockingPanel?.clearUnlockPreview();
      }
    } else if (testLive) {
      this.syncUnlockFromScript();
    }

    const root = document.querySelector('.saito-rustscript');
    root?.classList.toggle('rs-workspace-guided', guided);
    root?.classList.toggle('rs-workspace-locked', guided);
    root?.classList.toggle('rs-workspace-unlocked', !guided);
    root?.classList.toggle('rs-script-not-ready', !this.scriptReady);
    root?.classList.toggle('rs-script-ready', this.scriptReady);
    root?.classList.toggle('rs-create-focused', guided && !testLive);
    root?.classList.toggle('rs-guided-create-only', guided && !testLive);
    root?.classList.toggle('rs-guided-test-only', guided && testLive);
    root?.classList.toggle('rs-test-live', testLive);

    const testPane = document.querySelector('.rs-test-pane');
    const createPane = document.querySelector('.rs-create-pane');
    testPane?.classList.toggle('rs-test-guidance', guided && !testLive);
    testPane?.classList.toggle('rs-test-active', testLive);
    createPane?.classList.toggle('rs-create-primary', guided && !testLive);
    createPane?.classList.toggle('rs-create-script-ready', guided && this.scriptReady);

    if (guided) {
      const entering = testLive ? testPane : createPane;
      const leaving = testLive ? createPane : testPane;
      leaving?.classList.remove('rs-panel-active');
      if (entering) {
        entering.classList.remove('rs-panel-active');
        void entering.offsetWidth;
        entering.classList.add('rs-panel-active');
      }
    } else {
      createPane?.classList.remove('rs-panel-active');
      testPane?.classList.remove('rs-panel-active');
    }

    if (guided && this.scriptReady && !wasReady) {
      createPane?.classList.remove('rs-create-complete-flash');
      void createPane?.offsetWidth;
      createPane?.classList.add('rs-create-complete-flash');
      window.setTimeout(() => createPane?.classList.remove('rs-create-complete-flash'), 1100);
    }

    this.updateWorkspaceToggle();
    this.refreshStatusIndicators(status, { testLive, showMoveToTesting });
  }

  setWorkspaceMode(mode) {
    const next = mode === 'unlocked' ? 'unlocked' : 'locked';
    if (next === 'unlocked') {
      this.testingUnlocked = true;
      this.syncUnlockFromScript();
    }
    this.workspaceMode = next;
    this.syncPanelsFromTextareas();
    this.applyWorkspaceUI();
  }

  syncPanelsFromTextareas() {
    for (const panel of [this.lockingPanel, this.unlockingPanel]) {
      if (!panel?.textarea) {
        continue;
      }
      try {
        panel.script = JSON.parse(panel.textarea.value || '{}');
      } catch (err) {
        /* keep in-memory script until JSON is valid */
      }
    }
  }

  updateWorkspaceToggle() {
    const toggle = document.querySelector('.rs-workspace-toggle');
    const thumb = toggle?.querySelector('.rs-workspace-toggle-thumb');
    if (!toggle || !thumb) {
      return;
    }
    const guided = this.workspaceMode === 'locked';
    toggle.classList.toggle('is-guided', guided);
    toggle.classList.toggle('is-expert', !guided);
    toggle.classList.remove('is-locked', 'is-unlocked');
    thumb.textContent = guided ? 'GUIDED' : 'EXPERT';
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
        this.getLockingScriptSafe(),
        this.getUnlockingScriptSafe(),
        this.executionStatus
      );

    const testLive = options.testLive ?? (this.testingUnlocked && this.scriptReady);

    this.setStatusReactor('.rs-status-script', status.script.state, {
      idle: 'No script defined',
      warn: 'Script incomplete or unresolved placeholders',
      ready: 'Script complete'
    });

    if (!this.scriptReady || (this.workspaceMode === 'locked' && !testLive)) {
      this.setStatusReactor('.rs-status-witness', 'inactive', {
        inactive: options.showMoveToTesting
          ? 'Script complete — move into testing to activate witness'
          : 'Waiting for script — witness unlocks when script is complete'
      });
    } else {
      this.setStatusReactor('.rs-status-witness', status.witness.state, {
        idle: 'No witness data yet',
        warn: 'Witness has unresolved placeholders',
        ready: 'Witness data complete'
      });
    }

    this.setStatusReactor('.rs-status-valid', status.valid.state, {
      idle: 'Not ready to evaluate',
      warn: 'Execution failed',
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

  onPanelChange(script, side) {
    this.executionStatus = { attempted: false, success: false };

    if (side === 'locking') {
      const scriptStatus = evaluateScriptStatus(this.getLockingScriptSafe());
      if (scriptStatus.state === 'ready' && this.testingUnlocked) {
        this.syncUnlockFromScript();
      } else if (this.workspaceMode === 'locked' && scriptStatus.state !== 'ready') {
        this.unlockingPanel?.clearUnlockPreview();
      }
    } else if (side === 'unlocking') {
      const locking = this.getLockingScriptSafe();
      const scriptStatus = evaluateScriptStatus(locking);
      if (scriptStatus.state === 'ready' && this.testingUnlocked) {
        this.syncUnlockFromScript();
      }
    }

    this.applyWorkspaceUI();
    this.unlockingPanel?.refreshGuidance();
    this.lockingPanel?.refreshGuidance();
  }

  mountPanels() {
    const lockMount = document.getElementById('rs-locking-panel-mount');
    const unlockMount = document.getElementById('rs-unlocking-panel-mount');
    const opcodeLink = (key) => this.focusOpcodeReference(key);

    const getLockingScript = () => this.getLockingScriptSafe();

    this.lockingPanel = new RustScriptPanel(this.app, this.mod, {
      role: 'create',
      side: 'locking',
      onOpcodeClick: opcodeLink,
      getLockingScript,
      onChange: (s, side) => this.onPanelChange(s, side)
    });
    this.unlockingPanel = new RustScriptPanel(this.app, this.mod, {
      role: 'test',
      side: 'unlocking',
      onOpcodeClick: opcodeLink,
      getLockingScript,
      onChange: (s, side) => this.onPanelChange(s, side),
      onReturnToScript: () => this.returnToScript()
    });

    if (lockMount) {
      this.lockingPanel.mount(lockMount);
    }
    if (unlockMount) {
      this.unlockingPanel.mount(unlockMount);
    }
  }

  initOpcodeReferenceOverlay() {
    this.opcodeReferenceOverlay = new OpcodeReferenceOverlay(this.app, this.mod);
  }

  openOpcodeReference(key) {
    if (!this.opcodeReferenceOverlay) {
      this.initOpcodeReferenceOverlay();
    }
    this.opcodeReferenceOverlay.open(key);
  }

  focusOpcodeReference(key) {
    this.openOpcodeReference(key);
  }

  loadTemplate(lockingScript) {
    this.executionStatus = { attempted: false, success: false };
    this.testingUnlocked = false;
    this.setLockingScriptJson(lockingScript);
    this.applyWorkspaceUI();
    siteMessage('Template loaded');
  }

  loadOpcodeExample(op) {
    if (!op) {
      return;
    }
    this.executionStatus = { attempted: false, success: false };
    this.testingUnlocked = false;
    this.setLockingScriptJson(ast_execute.template_locking(op));
    this.applyWorkspaceUI();
    siteMessage(`${op.name} example loaded`);
  }

  attachEvents() {
    document.querySelector('.rs-welcome-tour')?.addEventListener('click', () => {
      this.showOnboarding({ step: 'splash' });
    });

    document.querySelector('.rs-workspace-toggle')?.addEventListener('click', () => {
      this.setWorkspaceMode(this.workspaceMode === 'locked' ? 'unlocked' : 'locked');
    });

    document.querySelector('.rs-new-script')?.addEventListener('click', () => {
      this.executionStatus = { attempted: false, success: false };
      this.testingUnlocked = false;
      this.setLockingScriptJson(scratchContract());
      this.applyWorkspaceUI();
      siteMessage('New script started');
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
            this.setLockingScriptJson(parsed.locking);
          }
          if (parsed.unlocking) {
            this.setUnlockingScriptJson(parsed.unlocking);
          } else {
            this.syncUnlockFromScript();
          }
          this.applyWorkspaceUI();
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
      this.generate_expert_overlay.render(this.lastScriptSource);
    });

    document.querySelector('.rs-run-validate')?.addEventListener('click', () => {
      this.validateLockingScript();
    });

    document.querySelector('.rs-run-execute')?.addEventListener('click', () => {
      this.runExecution();
    });

    document.addEventListener('click', (e) => {
      const menu = document.querySelector('.rs-template-menu');
      if (!menu || menu.hasAttribute('hidden')) {
        return;
      }
      if (e.target.closest('.rs-template-menu') || e.target.closest('.rs-templates')) {
        return;
      }
      menu.setAttribute('hidden', '');
    });
  }

  setLockingScriptJson(obj) {
    this.lockingPanel?.setScript(obj, { silent: true });
  }

  setUnlockingScriptJson(obj) {
    this.unlockingPanel?.setScript(obj, { silent: true });
  }

  async parseSemanticScript(source) {
    const result = await this.mod.parseExpertScript(source);
    this.onParseSuccess(source, result);
    return result;
  }

  onParseSuccess(source, result) {
    this.executionStatus = { attempted: false, success: false };
    this.setLockingScriptJson(result.lockingScript);
    this.setUnlockingScriptJson(result.unlockingScript);
    this.lastScriptSource = source;
    this.applyWorkspaceUI();
  }

  generateUnlockingFromLocking(silent = false) {
    this.syncUnlockFromScript();
    if (!silent) {
      siteMessage('Unlock script synchronized from script');
    }
    this.applyWorkspaceUI();
  }

  validateLockingScript() {
    try {
      const locking = this.lockingPanel.getScript();
      const validation = ast_execute.validate(locking);
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

  async runExecution() {
    if (!this.scriptReady) {
      siteMessage('Complete your script in Create Script before executing');
      return;
    }
    if (this.workspaceMode === 'locked' && !this.testingUnlocked) {
      siteMessage('Move into testing before executing');
      return;
    }

    try {
      const unlocking = this.unlockingPanel.getScript();
      const execution = await this.mod.runAst(unlocking, this.mod.buildContext({}));

      this.executionStatus = {
        attempted: true,
        success: Boolean(execution.success)
      };

      if (execution.success) {
        siteMessage('Execution simulation succeeded');
      } else {
        siteMessage('Execution simulation returned false');
      }
      console.log('[rustscript] execution', execution);
      this.applyWorkspaceUI();
    } catch (err) {
      this.executionStatus = { attempted: true, success: false };
      siteMessage(`Execution error: ${err.message}`);
      this.applyWorkspaceUI();
    }
  }

  updateParseState(state, message = '') {
    if (message) {
      console.warn('[rustscript]', state, message);
    }
    this.applyWorkspaceUI();
  }
}

module.exports = RustscriptMain;
