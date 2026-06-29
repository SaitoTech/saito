const Saito = require('saito-js/saito').default;
const { handleRequestSupply } = require('./supply');
const { handleRequestAddress } = require('./address');
const { requestParams, success, failure } = require('./response');

function blockToJson(block) {
  const obj = JSON.parse(block.toJson());
  obj.transactions = (block.transactions || []).map((tx) => {
    const txjson = tx.toJson();
    txjson.msg = tx.returnMessage();
    return txjson;
  });
  return obj;
}

function blockHeaderToJson(block) {
  const obj = JSON.parse(block.toJson());
  obj.transactions = [];
  return obj;
}

async function handleRequestBlocks(app, txmsg) {
  const params = requestParams(txmsg);
  const count = Number(params.count ?? 20);
  const includeOffchain = Boolean(params.include_offchain ?? false);

  if (!Number.isFinite(count) || count <= 0) {
    return failure('invalid count');
  }

  const blocks = await app.core.blockchain.getBlocks(count, includeOffchain);
  return success(blocks.map((block) => blockHeaderToJson(block)));
}

async function handleRequestBlock(app, txmsg) {
  const params = requestParams(txmsg);
  const includeTransactions = Boolean(params.include_transactions ?? false);

  let identifier = null;
  if (params.hash !== undefined && params.hash !== null && params.hash !== '') {
    identifier = String(params.hash);
  } else if (params.block_id !== undefined && params.block_id !== null && params.block_id !== '') {
    identifier = BigInt(params.block_id);
  } else {
    return failure('hash or block_id required');
  }

  const block = await app.core.blockchain.getBlock(identifier, includeTransactions);
  if (!block) {
    return failure('block not found');
  }

  if (includeTransactions) {
    return success(blockToJson(block));
  }

  return success(blockHeaderToJson(block));
}

async function findTransactionInMempool(transactionHash) {
  const mempoolTxs = await Saito.getInstance().getMempoolTxs();
  for (let i = 0; i < mempoolTxs.length; i++) {
    const txjson = mempoolTxs[i];
    if (txjson?.signature === transactionHash) {
      return txjson;
    }
  }
  return null;
}

async function handleRequestTransaction(app, txmsg) {
  const params = requestParams(txmsg);
  const transactionHash = params.transaction_hash || params.hash || params.signature;

  if (!transactionHash) {
    return failure('transaction_hash required');
  }

  const mempoolTx = await findTransactionInMempool(String(transactionHash));
  if (mempoolTx) {
    return success(mempoolTx);
  }

  // TODO: on-chain transaction lookup requires a block/transaction index in the Rust API.
  // Scanning blocks is intentionally omitted here to avoid duplicating blockchain logic.
  return failure('transaction not found');
}

async function handleExplorerRequest(app, txmsg, mod = null) {
  if (!txmsg?.request) {
    return null;
  }

  switch (txmsg.request) {
    case 'request blocks':
      return handleRequestBlocks(app, txmsg);
    case 'request block':
      return handleRequestBlock(app, txmsg);
    case 'request transaction':
      return handleRequestTransaction(app, txmsg);
    case 'request supply':
      return handleRequestSupply(app, mod, txmsg);
    case 'request address':
      return handleRequestAddress(app, mod, txmsg);
    default:
      return null;
  }
}

module.exports = {
  handleExplorerRequest,
  requestParams,
  success,
  failure,
  blockToJson,
  blockHeaderToJson,
};
