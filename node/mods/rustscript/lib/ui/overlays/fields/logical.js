const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const LogicalFieldTemplate = require('./logical.template');

const LOGICAL_OPERATORS = ['AND', 'OR', 'NOT', 'THEN'];

const LOGICAL_EXPLANATIONS = {
  AND: 'All conditions must be true.',
  OR: 'At least one condition must be true.',
  NOT: 'Inverts the result of a condition.',
  THEN: 'Execute the next condition only if the previous succeeds.'
};

function normalizeLogicalOperator(value) {
  const upper = String(value || '')
    .trim()
    .toUpperCase();
  return LOGICAL_OPERATORS.includes(upper) ? upper : 'AND';
}

function explainLogicalOperator(op) {
  return LOGICAL_EXPLANATIONS[normalizeLogicalOperator(op)] || '';
}

class LogicalFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.currentValue = '';
    this.onApply = null;
  }

  render() {
    const current = normalizeLogicalOperator(this.currentValue || 'AND');
    const optionsHtml = LOGICAL_OPERATORS.map(
      (op) => `<option value="${op}"${op === current ? ' selected' : ''}>${op}</option>`
    ).join('');

    this.overlay.show(LogicalFieldTemplate(current, optionsHtml, explainLogicalOperator(current)));
    this.attachEvents();
  }

  attachEvents() {
    const host = this.overlay.overlay || document;
    const root = host.querySelector('.rs-prompt-logical');
    const select = root?.querySelector('.rs-prompt-logical-select');
    const title = root?.querySelector('.rs-prompt-title');
    const explainEl = root?.querySelector('.rs-prompt-logical-explain');
    if (!root || !select) {
      return;
    }

    const updateExplain = () => {
      const op = normalizeLogicalOperator(select.value);
      if (title) {
        title.textContent = op;
      }
      if (explainEl) {
        explainEl.textContent = explainLogicalOperator(op);
      }
    };

    select.addEventListener('change', updateExplain);

    root.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
      const op = normalizeLogicalOperator(select.value);
      if (typeof this.onApply === 'function') {
        this.onApply(op);
      }
      this.overlay.hide();
    });
  }
}

module.exports = LogicalFieldOverlay;
