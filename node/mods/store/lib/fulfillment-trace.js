const { isP2shPublicKey, listRustP2shInputIndexes } = require('./helpers');

function logFulfillment(_stage, _message, _data = null) {}

function summarizeSlipForApp(app, slip, index = null) {
  if (!slip) {
    return null;
  }
  return {
    index,
    type: slip.type,
    publicKey: slip.publicKey || '',
    amount: String(slip.amount ?? 0),
    blockId: String(slip.blockId ?? 0),
    txOrdinal: String(slip.txOrdinal ?? 0),
    utxoKey: slip.utxoKey || '',
    p2sh: isP2shPublicKey(app, slip.publicKey || '')
  };
}

function summarizeOrder(order) {
  if (!order) {
    return null;
  }
  return {
    id: order.id,
    order_tx_sig: order.order_tx_sig || order.signature || '',
    buyer: order.buyer || '',
    nft_id: order.nft_id || '',
    price: Number(order.price ?? 0),
    quantity: Number(order.quantity ?? 1),
    payment_tx_sig: order.payment_tx_sig || '',
    payment_output_index: Number(order.payment_output_index ?? 0),
    payment_amount: Number(order.payment_amount ?? 0),
    access_hash: order.access_hash || '',
    p2sh_address: order.p2sh_address || '',
    has_access_script: Boolean(order.access_script),
    status: order.status || '',
    attempts: Number(order.attempts ?? 0)
  };
}

function listP2shInputIndexes(app, tx) {
  return listRustP2shInputIndexes(app, tx);
}

function dumpP2shScriptEngineCall() {}

function dumpFulfillmentAccessScripts() {}

function logAccessScriptsForP2sh() {}

module.exports = {
  logFulfillment,
  summarizeOrder,
  summarizeSlipForApp,
  listP2shInputIndexes,
  logAccessScriptsForP2sh,
  dumpFulfillmentAccessScripts,
  dumpP2shScriptEngineCall
};
