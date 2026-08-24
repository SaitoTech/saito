const { evaluateWorkspaceStatus } = require('./script_validate');
const { lockingView } = require('./script_build');
const PanelMenu = require('./panel_menu');
const {
  unlockInputRows,
  unlockOutputRows,
  unlockTransactionPanelMarkup
} = require('./unlock_tx_panel');
const { removeOutputAt } = require('./unlock_tx_edit');

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

    let ref = this.container.querySelector(':scope > .rs-panel-ref');
    if (!ref) {
      ref = document.createElement('div');
      this.container.appendChild(ref);
    }
    ref.className = `rs-panel-ref rs-panel-ref-${phase}`;
    ref.innerHTML = `
      <ul class="rs-panel-ref-list">
        ${items.join('')}
      </ul>
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
      const isUnlock = this.mod?.workflow === 'unlock';
      const action = isUnlock ? 'unlock-solution' : 'publish';
      const label = isUnlock ? 'spend script' : 'use script';
      return [
        `<li class="rs-panel-ref-ready-banner" role="status">
          <div class="rs-panel-ref-ready-banner-inner">your script is ready</div>
        </li>`,
        '<li class="rs-panel-ref-ready-prompt">What would you like to do now?</li>',
        `<li class="rs-panel-ref-actions rs-panel-ref-actions-stack">
          <button type="button" class="rs-btn rs-btn-primary rs-panel-ref-action rs-panel-ref-action-publish" data-action="${action}">${label}</button>
          <button type="button" class="saito-text-link rs-panel-ref-save-later" data-action="save-later">or save for later...</button>
        </li>`
      ];
    }

    if (phase === 'script-ready') {
      return [
        `<li class="rs-panel-ref-ready-banner" role="status">
          <div class="rs-panel-ref-ready-banner-inner">your script is ready</div>
        </li>`,
        `<li class="rs-panel-ref-ready-copy">
          Scripts control who can spend digital assets. The next step is to specify whether you want your script to protect a SAITO balance or an NFT.
        </li>`,
        `<li class="rs-panel-ref-actions rs-panel-ref-actions-stack">
          <button type="button" class="rs-btn rs-btn-primary rs-panel-ref-action rs-panel-ref-action-publish" data-action="publish">Choose Asset to Protect</button>
          <button type="button" class="saito-text-link rs-panel-ref-action" data-action="move-to-testing">or test this script…</button>
          <button type="button" class="saito-text-link rs-panel-ref-save-later" data-action="save-later">or save for later...</button>
        </li>`
      ];
    }

    return [`<li>${countText}</li>`];
  }

  bindEvents() {
    this.container
      ?.querySelector('[data-action="move-to-testing"]')
      ?.addEventListener('click', () => {
        if (typeof this.lastContext?.onMoveToTesting === 'function') {
          this.lastContext.onMoveToTesting();
        }
      });

    this.container?.querySelector('[data-action="publish"]')?.addEventListener('click', () => {
      if (typeof this.lastContext?.onPublish === 'function') {
        this.lastContext.onPublish();
      }
    });

    this.container?.querySelector('[data-action="save-later"]')?.addEventListener('click', () => {
      if (typeof this.lastContext?.onSaveLater === 'function') {
        this.lastContext.onSaveLater();
      }
    });

    this.container
      ?.querySelector('[data-action="unlock-solution"]')
      ?.addEventListener('click', () => {
        if (typeof this.lastContext?.onUnlockSolution === 'function') {
          this.lastContext.onUnlockSolution();
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

    el.innerHTML = '';
    this.referenceView.mount(el);

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

    if (this.shouldRenderUnlockTransactionPanel(testLive)) {
      this.renderUnlockTransactionPanel(el);
      return;
    }

    if (PanelMenu.shouldShowForWitnessPanel(phase)) {
      el.insertAdjacentHTML(
        'afterbegin',
        `<header class="rs-panel-header rs-panel-header-status">${PanelMenu.markup('witness')}</header>`
      );
      this.main?.bindPanelMenu(el, 'witness');
    }

    this.referenceView.render({
      phase,
      remainingCount: testLive ? remainingRequired : remainingScript,
      onMoveToTesting: () => this.moveToTesting(),
      onPublish: () => this.openPublish(),
      onSaveLater: () => this.openSaveLater(),
      onUnlockSolution: () => this.openUnlockSolution()
    });
  }

  shouldRenderUnlockTransactionPanel(testLive) {
    return this.mod?.workflow === 'unlock' && !!testLive;
  }

  renderUnlockTransactionPanel(el) {
    el.innerHTML = unlockTransactionPanelMarkup({
      inputs: unlockInputRows(this.app, this.mod),
      outputs: unlockOutputRows(this.app, this.mod),
      selectedInputIndex: this.main?.selectedUnlockInputIndex ?? null,
      mod: this.mod
    });

    el.querySelector('[data-action="set-fee"]')?.addEventListener('click', () => {
      this.main?.unlockFeeFlow?.open?.();
    });

    el.querySelectorAll('.rs-tx-input[data-input-index]').forEach((card) => {
      const activate = () => {
        const index = Number(card.dataset.inputIndex) || 0;
        const kind = card.dataset.kind === 'nft' ? 'nft' : 'saito';
        this.selectUnlockInput(index, kind);
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });

    el.querySelectorAll('.rs-tx-output[role="button"]').forEach((card) => {
      const activate = () => {
        const index = Number(card.dataset.outputIndex);
        this.confirmDeleteUnlockOutput(index);
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });
  }

  selectUnlockInput(index, kind) {
    const { isUnlockEditable, UNLOCK_SIGNED_ERROR } = require('./unlock_tx_fee');
    if (!isUnlockEditable(this.mod)) {
      window.alert(UNLOCK_SIGNED_ERROR);
      return;
    }
    if (this.main) {
      this.main.selectedUnlockInputIndex = index;
    }
    this.render();
    this.main?.spendOutputFlow?.openForInput({ kind, inputIndex: index });
  }

  confirmDeleteUnlockOutput(index) {
    if (!Number.isInteger(index) || index < 0) {
      return;
    }
    const { isUnlockEditable, UNLOCK_SIGNED_ERROR } = require('./unlock_tx_fee');
    if (!isUnlockEditable(this.mod)) {
      window.alert(UNLOCK_SIGNED_ERROR);
      return;
    }
    if (!window.confirm('Delete this output?')) {
      return;
    }
    try {
      if (removeOutputAt(this.mod, index, this.main)) {
        this.render();
        this.main?.refresh?.({ skipTestSync: true });
      }
    } catch (err) {
      window.alert(err?.message || String(err));
    }
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

  openSaveLater() {
    try {
      const scriptPayload = this.mod.getScript();
      this.mod.exportScriptDraft(scriptPayload);
    } catch (_err) {
      /* export failed */
    }
  }

  openUnlockSolution() {
    if (this.main?.unlockFlow && this.mod.workflow === 'unlock') {
      this.main.unlockFlow.openSolution();
    }
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = RustscriptPanel;
