const { resolve_symbol } = require('../rustscript/ast_execute');

/**
 * @param {object} app
 * @param {object} opcode
 * @param {object} context
 * @returns {boolean}
 */
function checktime(app, opcode, context) {
  const ts_raw = resolve_symbol(context, opcode.timestamp);
  if (ts_raw === undefined || ts_raw === null || ts_raw === '') {
    return false;
  }

  const ts = parseInt(ts_raw, 10);
  if (!Number.isFinite(ts)) {
    return false;
  }

  const blk_ts = context.blk?.timestamp ?? context.blk?.ts;
  if (blk_ts === undefined || blk_ts === null) {
    return true;
  }

  const blkNum = Number(blk_ts);
  const op = String(opcode.operator || '<=').toLowerCase();

  switch (op) {
    case '<=':
      return blkNum <= ts;
    case '<':
      return blkNum < ts;
    case '>=':
      return blkNum >= ts;
    case '>':
      return blkNum > ts;
    case '==':
      return blkNum === ts;
    default:
      return true;
  }
}

module.exports = checktime;
