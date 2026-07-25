const Transaction = require('../../../lib/saito/transaction').default;
const { success, failure, requestParams } = require('./peer/response');
const { ensureExplorerTestModeForManualAction } = require('./explorer-test-mode');

/**
 * Server: receive a signed fee transaction from the browser and retain it for
 * the next manual block production call.
 */
async function handleExplorerSubmitFeeTransaction(app, mod, txmsg, mycallback) {
  const gate = ensureExplorerTestModeForManualAction(app, mod);
  if (!gate.ok) {
    if (mycallback) {
      mycallback(failure(gate.error));
    }
    return;
  }

  const serial = requestParams(txmsg)?.serial_transaction;
  if (!serial) {
    if (mycallback) {
      mycallback(failure('Missing signed transaction.'));
    }
    return;
  }

  try {
    const feeTx = new Transaction();
    const payload = typeof serial === 'string' ? serial : JSON.stringify(serial);
    feeTx.deserialize_from_web(app, payload);

    if (!feeTx.signature) {
      if (mycallback) {
        mycallback(failure('Transaction is not signed.'));
      }
      return;
    }

    if (!Array.isArray(mod.pendingManualProduceTransactions)) {
      mod.pendingManualProduceTransactions = [];
    }
    mod.pendingManualProduceTransactions.push(feeTx);

    if (mycallback) {
      mycallback(
        success({
          accepted: true,
          signature: String(feeTx.signature)
        })
      );
    }
  } catch (err) {
    if (mycallback) {
      mycallback(failure(err?.message || 'Failed to submit fee transaction.'));
    }
  }
}

module.exports = {
  handleExplorerSubmitFeeTransaction
};
