const { getHoldersPage } = require('../holders');
const { success, failure, requestParams } = require('./response');

async function handleRequestHolders(app, mod, txmsg) {
  try {
    return success(await getHoldersPage(mod, requestParams(txmsg)));
  } catch (err) {
    return {
      ...failure(err?.message || 'Unable to load holders.'),
      code: err?.code || 'HOLDERS_UNAVAILABLE'
    };
  }
}

module.exports = { handleRequestHolders };
