const { success, failure, requestParams } = require('./response');

const DEFAULT_ADDRESS_LIMIT = 100;

async function handleRequestAddress(app, mod, txmsg) {
  const params = requestParams(txmsg);
  const publickey = params.publickey || params.public_key || params.address;

  if (!publickey) {
    return failure('publickey required');
  }

  const requestedLimit = Number(params.count ?? params.limit ?? DEFAULT_ADDRESS_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 500)
    : DEFAULT_ADDRESS_LIMIT;

  if (!mod?.database) {
    return failure('explorer database unavailable');
  }

  const rows = await mod.database.getAddressActivity(String(publickey), limit);

  return success({
    publickey: String(publickey),
    count: rows.length,
    rows
  });
}

module.exports = {
  handleRequestAddress,
  DEFAULT_ADDRESS_LIMIT
};
