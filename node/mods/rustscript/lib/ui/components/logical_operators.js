/** UI-only — logical combinator reference for guided overlays */

const LOGICAL_OPERATORS = ['AND', 'OR', 'NOT', 'THEN'];

const LOGICAL_EXPLANATIONS = {
  AND: 'All conditions must be true.',
  OR: 'At least one condition must be true.',
  NOT: 'Inverts the result of a condition.',
  THEN: 'Execute the next condition only if the previous succeeds.'
};

function isLogicalOperator(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return LOGICAL_OPERATORS.includes(value.trim().toUpperCase());
}

function normalizeLogicalOperator(value) {
  const upper = String(value || '')
    .trim()
    .toUpperCase();
  return LOGICAL_OPERATORS.includes(upper) ? upper : 'AND';
}

function explainLogicalOperator(op) {
  return LOGICAL_EXPLANATIONS[normalizeLogicalOperator(op)] || '';
}

module.exports = {
  LOGICAL_OPERATORS,
  isLogicalOperator,
  normalizeLogicalOperator,
  explainLogicalOperator
};
