/**
 * Load a transaction from the Archive module (localhost first, then a remote peer).
 * Used for media/tx hydration and warehouse settlement — not as an inventory source.
 */
function loadTransactionFromPeer(app, signature, peer = 'localhost') {
  return new Promise((resolve) => {
    if (!signature || !app?.storage?.loadTransactions) {
      resolve(null);
      return;
    }

    app.storage.loadTransactions(
      { sig: signature },
      (txs) => {
        resolve(txs?.[0] || null);
      },
      peer
    );
  });
}

async function loadTransactionFromArchive(app, signature) {
  if (!signature) {
    return null;
  }

  let tx = await loadTransactionFromPeer(app, signature, 'localhost');
  if (tx) {
    return tx;
  }

  try {
    const peers = await app.network.getPeers();
    if (peers?.length) {
      tx = await loadTransactionFromPeer(app, signature, peers[0]);
    }
  } catch (err) {
    // fall through
  }

  return tx || null;
}

module.exports = {
  loadTransactionFromPeer,
  loadTransactionFromArchive
};
