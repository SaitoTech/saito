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
    const countLine = `<li><span class="rs-panel-ref-count">${remaining}</span> ${fieldLabel} remaining</li>`;

    if (phase === 'witness-help') {
      return [countLine];
    }

    if (phase === 'script-ready') {
      const valid = context.scriptStructurallyValid !== false;
      const formatLine = valid
        ? '<li>your script is formatted correctly</li>'
        : '<li>your script is formatted incorrectly</li>';
      const enterLine = `<li><button type="button" class="rs-panel-ref-enter-test" data-action="move-to-testing">click here to enter test mode</button></li>`;
      return [formatLine, enterLine];
    }

    return [countLine, '<li>test mode will enable when complete</li>'];
  }

  bindEvents() {
    this.container?.querySelector('[data-action="move-to-testing"]')?.addEventListener('click', () => {
      if (typeof this.lastContext?.onMoveToTesting === 'function') {
        this.lastContext.onMoveToTesting();
      }
    });
  }
}

module.exports = PanelReferenceView;
