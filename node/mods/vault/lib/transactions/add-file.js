/**
 * Vault add-file transaction: create signed upload tx and receive/store it.
 *
 * Client: createVaultAddFileTransaction → peer request "vault add file"
 * Server: receiveVaultAddFileTransaction (via Vault.handlePeerTransaction)
 */

const Transaction = require('../../../../lib/saito/transaction').default;
const { buildDefaultAccessScript } = require('../contracts');

/**
 * Build and sign a vault add-file transaction for the given NFT id.
 * File bytes/name are taken from the Vault module instance (mod.file / mod.filename).
 *
 * @param {object} app
 * @param {object} mod Vault module instance
 * @param {string|null} nftid
 * @param {object|string|null} access_script_obj
 * @returns {Promise<object|null>} signed transaction, or null on failure
 */
async function createVaultAddFileTransaction(app, mod, nftid = null, access_script_obj = null) {
  let newtx = await app.wallet.createUnsignedTransaction();

  try {
    if (!app.core?.scripting?.hash) {
      return null;
    }

    if (!nftid) {
      console.warn('Vault: createVaultAddFileTransaction missing nftid');
      return null;
    }

    if (access_script_obj == null) {
      access_script_obj = buildDefaultAccessScript({ nftid });
    }

    let access_script =
      typeof access_script_obj === 'string'
        ? access_script_obj
        : JSON.stringify(access_script_obj);
    let access_hash = app.core.scripting.hash(access_script);

    let msg = {
      request: 'vault add file',
      access_script: access_script,
      access_hash: access_hash,
      data: { file: mod.file, name: mod.filename }
    };

    newtx.msg = msg;
    await newtx.sign();
  } catch (err) {}

  return newtx;
}

/**
 * Peer receive path for "vault add file": deserialize payload and save to Archive.
 *
 * @param {object} app
 * @param {object} mod Vault module instance
 * @param {object} tx peer request transaction
 * @param {function} mycallback
 * @returns {Promise<number>} 1 when handled
 */
async function receiveVaultAddFileTransaction(app, mod, tx, mycallback) {
  try {
    let archive_mod = app.modules.returnModule('Archive');
    archive_mod.access_hash = 1; // ownership restricted

    let peer_tx = new Transaction();
    peer_tx.deserialize_from_web(app, tx.returnMessage().data);
    let peer_txmsg = peer_tx.returnMessage();

    let access_hash = peer_txmsg.access_hash || '';

    let data = {};
    data.owner = access_hash;
    data.preserve = 1;

    app.storage.saveTransaction(peer_tx, data, 'localhost');
    mycallback({ status: 'success', err: '' });
  } catch (err) {
    console.error('Vault add file error:', err);
    mycallback({ status: 'err', err: JSON.stringify(err) });
  }

  return 1;
}

module.exports = {
  createVaultAddFileTransaction,
  receiveVaultAddFileTransaction
};
