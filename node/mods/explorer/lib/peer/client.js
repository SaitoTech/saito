/**
 * Send a "request blocks" off-chain request to an Explorer peer.
 */
function requestBlocksFromPeer(app, peer, options = {}, callback = null) {
  const count = options.count ?? 10;
  const includeOffchain = options.include_offchain ?? true;

  return app.network.sendRequestAsTransaction(
    'request blocks',
    {
      request: 'request blocks',
      count,
      include_offchain: includeOffchain,
    },
    callback,
    peer.publicKey
  );
}

/**
 * Send a "request block" off-chain request to an Explorer peer.
 */
function requestBlockFromPeer(app, peer, identifier, includeTransactions = true, callback = null) {
  const data = {
    request: 'request block',
    include_transactions: includeTransactions,
  };

  if (typeof identifier === 'bigint' || typeof identifier === 'number') {
    data.block_id = String(identifier);
  } else {
    data.hash = String(identifier);
  }

  return app.network.sendRequestAsTransaction('request block', data, callback, peer.publicKey);
}

/**
 * Send a "request supply" off-chain request to an Explorer peer.
 */
function requestSupplyFromPeer(app, peer, options = {}, callback = null) {
  const count = options.count ?? 8;

  return app.network.sendRequestAsTransaction(
    'request supply',
    {
      request: 'request supply',
      count,
    },
    callback,
    peer.publicKey
  );
}

/**
 * Send a "request address" off-chain request to an Explorer peer.
 */
function requestAddressFromPeer(app, peer, publickey, options = {}, callback = null) {
  const count = options.count ?? options.limit ?? 100;

  return app.network.sendRequestAsTransaction(
    'request address',
    {
      request: 'request address',
      publickey: String(publickey),
      count,
    },
    callback,
    peer.publicKey
  );
}

module.exports = {
  requestBlocksFromPeer,
  requestBlockFromPeer,
  requestSupplyFromPeer,
  requestAddressFromPeer,
};
