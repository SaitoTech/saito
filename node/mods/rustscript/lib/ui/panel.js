const { evaluateWorkspaceStatus } = require('./script_validate');
const { lockingView } = require('./script_build');

class PanelReferenceView {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.container = null;
    this.lastContext = null;
  }

  mount(container) {
    this.container = container;
  }

  render(context = {}) {
    if (!this.container) {
      return;
    }

    this.lastContext = context;
    const phase = context.phase || 'script-help';
    const remaining = Number(context.remainingCount) || 0;
    const items = this.buildItems(phase, remaining);

    this.container.innerHTML = `
      <div class="rs-panel-ref rs-panel-ref-${phase}">
        <ul class="rs-panel-ref-list">
          ${items.join('')}
        </ul>
      </div>
    `;

    this.bindEvents();
  }

  buildItems(phase, remaining) {
    const fieldLabel = remaining === 1 ? 'field' : 'fields';
    const countText = `<span class="rs-panel-ref-count">${remaining}</span> ${fieldLabel} remaining`;

    if (phase === 'required-help') {
      return [`<li class="rs-panel-ref-status-text">${countText}</li>`];
    }

    if (phase === 'required-complete') {
      return [
        '<li class="rs-panel-ref-success-msg">✓ Script successfully validates.</li>',
        '<li class="rs-panel-ref-ready-msg rs-panel-ref-success-sub">This script is ready to publish to the network.</li>',
        `<li class="rs-panel-ref-actions">
          <button type="button" class="rs-panel-ref-action rs-panel-ref-action-publish" data-action="publish">Publish to Network</button>
        </li>`
      ];
    }

    if (phase === 'script-ready') {
      return [
        '<li class="rs-panel-ref-success-msg">✓ Your script is ready!</li>',
        '<li class="rs-panel-ref-ready-msg rs-panel-ref-success-sub">Publish when you are ready, or test first if you like.</li>',
        `<li class="rs-panel-ref-actions">
          <button type="button" class="rs-panel-ref-action rs-panel-ref-action-publish" data-action="publish">Publish to Network</button>
          <button type="button" class="rs-panel-ref-action rs-panel-ref-action-test" data-action="move-to-testing">Proceed to Test</button>
        </li>`
      ];
    }

    return [`<li>${countText}</li>`, '<li>test mode will enable when complete</li>'];
  }

  bindEvents() {
    this.container?.querySelector('[data-action="move-to-testing"]')?.addEventListener('click', () => {
      if (typeof this.lastContext?.onMoveToTesting === 'function') {
        this.lastContext.onMoveToTesting();
      }
    });

    this.container?.querySelector('[data-action="publish"]')?.addEventListener('click', () => {
      if (typeof this.lastContext?.onPublish === 'function') {
        this.lastContext.onPublish();
      }
    });
  }
}

class RustscriptPanel {
  constructor(app, mod, container = '', main = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.main = main;
    this.referenceView = new PanelReferenceView(app, mod);
  }

  render() {
    const el = document.querySelector(this.container);
    if (!el || !this.main) {
      return;
    }

    el.innerHTML = '<div class="rustscript-panel-reference"></div>';
    const refEl = el.querySelector('.rustscript-panel-reference');
    this.referenceView.mount(refEl);

    const locking = lockingView(deepClone(this.mod.getScript()));
    const unlocking = this.main.testingUnlocked ? this.mod.getScript() : {};
    const status = evaluateWorkspaceStatus(
      locking,
      unlocking,
      this.main.executionStatus,
      this.mod.opcodes
    );

    const remainingScript = status.script.placeholders?.length ?? 0;
    const remainingRequired = status.required.placeholders?.length ?? 0;
    const scriptReady = status.script.state === 'ready';
    const showMoveToTesting = !this.main.testingUnlocked && scriptReady;
    const testLive = this.main.testingUnlocked && scriptReady;

    let phase = 'script-help';
    if (testLive) {
      phase = this.main.executionStatus.success === true ? 'required-complete' : 'required-help';
    } else if (showMoveToTesting) {
      phase = 'script-ready';
    }

    this.referenceView.render({
      phase,
      remainingCount: testLive ? remainingRequired : remainingScript,
      onMoveToTesting: () => this.moveToTesting(),
      onPublish: () => this.openPublish()
    });
  }

  async moveToTesting() {
    this.main.testingUnlocked = true;
    await this.main.refresh();
  }

  openPublish() {
    if (this.main?.publishFlow && this.main.isScriptPublishable()) {
      this.main.publishFlow.openChoice();
    }
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = RustscriptPanel;
