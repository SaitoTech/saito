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
    const items = this.buildItems(phase, remaining, context);

    this.container.innerHTML = `
      <div class="rs-panel-ref rs-panel-ref-${phase}">
        <ul class="rs-panel-ref-list">
          ${items.join('')}
        </ul>
      </div>
    `;

    this.bindEvents();
  }

  buildItems(phase, remaining, context) {
    const fieldLabel = remaining === 1 ? 'field' : 'fields';
    const countText = `<span class="rs-panel-ref-count">${remaining}</span> ${fieldLabel} remaining`;

    if (phase === 'required-help') {
      return [`<li class="rs-panel-ref-status-text">${countText}</li>`];
    }

    if (phase === 'required-complete') {
      return [
        '<li class="rs-panel-ref-success-msg">✓ Script successfully validates.</li>',
        '<li class="rs-panel-ref-ready-msg rs-panel-ref-success-sub">This script is ready to upload to the network.</li>',
        `<li class="rs-panel-ref-actions">
          <button type="button" class="rs-panel-ref-action rs-panel-ref-action-tx" data-action="create-transaction">Create Transaction</button>
        </li>`
      ];
    }

    if (phase === 'script-ready') {
      return [
        '<li class="rs-panel-ref-success-msg">✓ Your script is ready!</li>',
        '<li class="rs-panel-ref-ready-msg rs-panel-ref-success-sub">Would you like to test it or upload it to the network?</li>',
        `<li class="rs-panel-ref-actions">
          <button type="button" class="rs-panel-ref-action rs-panel-ref-action-test" data-action="move-to-testing">Proceed to Test</button>
          <button type="button" class="rs-panel-ref-action rs-panel-ref-action-tx" data-action="create-transaction">Create Transaction</button>
        </li>`
      ];
    }

    return [`<li>• ${countText}</li>`, '<li>test mode will enable when complete</li>'];
  }

  bindEvents() {
    this.container?.querySelector('[data-action="move-to-testing"]')?.addEventListener('click', () => {
      if (typeof this.lastContext?.onMoveToTesting === 'function') {
        this.lastContext.onMoveToTesting();
      }
    });

    this.container?.querySelector('[data-action="create-transaction"]')?.addEventListener('click', () => {
      if (typeof this.lastContext?.onCreateTransaction === 'function') {
        this.lastContext.onCreateTransaction();
      }
    });
  }
}

module.exports = PanelReferenceView;
