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
  const count = Math.min(Number(params.count ?? 20), 50);
  const includeOffchain = Boolean(params.include_offchain ?? false);
  const beforeId = params.before_id != null ? Number(params.before_id) : null;

  if (!Number.isFinite(count) || count <= 0) {
    return failure('invalid count');
  }

  if (beforeId != null && Number.isFinite(beforeId) && beforeId > 0) {
    const results = [];
    for (let id = beforeId - 1; id > 0 && results.length < count; id--) {
      try {
        const block = await app.core.blockchain.getBlock(BigInt(id), false);
        if (block) {
          results.push(blockHeaderToJson(block));
        }
      } catch (err) {
        break;
      }
    }
    return success(results);
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

// Number of recent longest-chain blocks sampled for the dashboard's rolling
// statistics (Golden Ticket coverage in particular). This is a rolling window,
// so coverage is an estimate over the most recent blocks rather than the chain.
const INFO_BLOCK_WINDOW = 20;

function bigIntToNumber(value) {
  try {
    return value == null ? null : Number(value);
  } catch (err) {
    return null;
  }
}

function bigIntToString(value) {
  try {
    return value == null ? null : value.toString();
  } catch (err) {
    return null;
  }
}

// Returns a summary of the serving node's blockchain for the explorer dashboard.
// Chain-level values (latest/genesis block ids) and per-block consensus values
// (burn fee, difficulty, fees) are read directly from this full node, so they
// are exact for the node answering the request.
async function handleRequestInfo(app) {
  let blocks = [];
  try {
    blocks = await app.core.blockchain.getBlocks(INFO_BLOCK_WINDOW, false);
  } catch (err) {
    blocks = [];
  }
  if (!Array.isArray(blocks)) {
    blocks = [];
  }

  let genesisBlockId = null;
  try {
    genesisBlockId = bigIntToNumber(await app.core.blockchain.get_genesis_block_id());
  } catch (err) {
    genesisBlockId = null;
  }

  const latest = blocks.length ? blocks[0] : null;

  let goldenTicketCount = 0;
  for (let i = 0; i < blocks.length; i++) {
    try {
      if (blocks[i]?.hasGoldenTicket) {
        goldenTicketCount++;
      }
    } catch (err) {
      // ignore blocks that cannot report golden-ticket state
    }
  }

  const readBlockNumber = (getter) => {
    if (!latest) {
      return null;
    }
    try {
      return bigIntToNumber(latest[getter]);
    } catch (err) {
      return null;
    }
  };

  const readBlockString = (getter) => {
    if (!latest) {
      return null;
    }
    try {
      return bigIntToString(latest[getter]);
    } catch (err) {
      return null;
    }
  };

  return success({
    latest_block_id: readBlockNumber('id'),
    genesis_block_id: genesisBlockId,
    burnfee: readBlockString('burnFee'),
    difficulty: readBlockNumber('difficulty'),
    fees_last_block: readBlockString('totalFees'),
    atr_fees_last_block: readBlockString('totalFeesAtr'),
    golden_ticket_window: blocks.length,
    golden_ticket_count: goldenTicketCount,
  });
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
    case 'request info':
      return handleRequestInfo(app);
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
