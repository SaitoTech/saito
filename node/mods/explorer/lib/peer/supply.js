const { SUPPLY_BLOCK_COUNT } = require('../supply-rows');
const { buildSupplyView } = require('../build-supply-view');
const { success, failure, requestParams } = require('./response');

async function handleRequestSupply(app, mod, txmsg) {
  const params = requestParams(txmsg);
  const requestedCount = Number(params.count ?? SUPPLY_BLOCK_COUNT);

  try {
    const view = await buildSupplyView(app, mod, requestedCount);
    return success(view);
  } catch (err) {
    const message = err?.message || 'failed to build supply view';
    if (message === 'explorer database unavailable') {
      return failure(message);
    }
    if (message === 'failed to read longest-chain blocks') {
      return failure(message);
    }
    console.error('Explorer: handleRequestSupply failed', err);
    return failure(message);
  }
}

module.exports = {
  handleRequestSupply
};
