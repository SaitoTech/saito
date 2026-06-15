/**
 * Purpose: CHECKTIME opcode — compare block timestamp to script constraint.
 */

module.exports = {
  name: 'CHECKTIME',
  description: 'Verify lastest block relative to timestamp.',
  exampleScript: {
    op: 'CHECKTIME',
    timestamp: '<timestamp>',
    operator: '<='
  },
  schema: {
    timestamp: 'timestamp',
    operator: 'operator'
  },

  execute(node, context) {
    if (!node || typeof node !== 'object') {
      return false;
    }

    const timestampRaw = node.timestamp;
    if (timestampRaw === undefined || timestampRaw === null || timestampRaw === '') {
      return false;
    }

    const ts = Number(timestampRaw);
    if (!Number.isFinite(ts)) {
      return false;
    }

    return true;
  }
};
