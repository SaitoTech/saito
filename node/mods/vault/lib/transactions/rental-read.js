/**
 * Vault rental READ primitives.
 *
 * Existing Vault READ / DATA REQUEST architecture:
 *   client: Vault.sendAccessFileRequest(vault_data, access_script_override, cb)
 *        → network.sendRequestAsTransaction('vault access file', data, …)
 *   server: Vault.handlePeerTransaction for request === 'vault access file'
 *        → scripting.evaluateWithTransaction(access_script, tx)
 *        → Archive loadTransactions({ owner: access_hash, …, sig: file_id })
 *
 * Rental reads use the same peer request and validation. The rental locking
 * script (file_access_script on vault-nft-rental / store-nft-rental) is
 * supplied as access_script_override; Archive owner remains the script hash
 * set at vault add file time.
 */

const Transaction = require('../../../../lib/saito/transaction').default;

/**
 * Build vault_data for sendAccessFileRequest from a rental NFT (or explicit
 * fields). Requires current wallet slip utxokeys — sendAccessFileRequest
 * still validates them even when a full rental script is provided.
 *
 * @param {object} nft SaitoNFT carrying txmsg.data Vault fields
 * @returns {object} vault_data
 */
function vaultDataFromRentalNft(nft) {
  if (!nft) {
    throw new Error('Vault rental read requires an NFT');
  }

  const data = nft.tx?.returnMessage?.()?.data || nft.data || {};
  const file_id = data.file_id ? String(data.file_id) : '';
  if (!file_id) {
    throw new Error('Vault rental read requires file_id on the NFT');
  }

  return {
    nft_id: nft.id || '',
    file_id,
    filename: data.filename || '',
    link: data.link || '',
    nft_type: data.nft_type || (typeof nft.returnType === 'function' ? nft.returnType() : ''),
    file_access_script: data.file_access_script || null,
    slip1_utxokey: nft.slip1?.utxo_key || nft.slip1?.utxoKey || '',
    slip2_utxokey: nft.slip2?.utxo_key || nft.slip2?.utxoKey || '',
    slip3_utxokey: nft.slip3?.utxo_key || nft.slip3?.utxoKey || ''
  };
}

/**
 * Request the protected file from Vault using rental authorization.
 *
 * Delegates entirely to Vault.sendAccessFileRequest. Does not create a new
 * peer-request type. Signing of the off-chain request transaction is performed
 * inside sendRequestAsTransaction / wallet paths used by sendAccessFileRequest.
 *
 * Script validation occurs on the Vault server in handlePeerTransaction
 * (evaluateWithTransaction). Archive interaction occurs there via
 * storage.loadTransactions.
 *
 * @param {object} app
 * @param {object} mod Vault module instance
 * @param {object} opts
 * @param {object} [opts.nft] store-nft-rental / vault-nft-rental SaitoNFT
 * @param {object} [opts.vault_data] explicit vault_data (overrides nft)
 * @param {string|object} [opts.access_script] witnessed rental script;
 *   defaults to vault_data.file_access_script / nft data
 * @param {function} [opts.callback] receives base64 file bytes or null
 * @returns {Promise<*>} result of sendAccessFileRequest (often null; async via callback)
 */
async function createRentalReadTransaction(app, mod, opts = {}) {
  if (!app || !mod) {
    throw new Error('Vault rental read requires app and Vault module');
  }
  if (typeof mod.sendAccessFileRequest !== 'function') {
    throw new Error('Vault.sendAccessFileRequest is unavailable');
  }

  let vault_data = opts.vault_data || null;
  if (!vault_data) {
    vault_data = vaultDataFromRentalNft(opts.nft);
  }

  if (!vault_data.file_id) {
    throw new Error('Vault rental read requires file_id');
  }
  if (!vault_data.nft_id || !vault_data.slip1_utxokey || !vault_data.slip2_utxokey || !vault_data.slip3_utxokey) {
    throw new Error(
      'Vault rental read requires nft_id and slip utxokeys (sendAccessFileRequest invariant)'
    );
  }

  let access_script =
    opts.access_script != null ? opts.access_script : vault_data.file_access_script;
  if (!access_script) {
    throw new Error('Vault rental read requires file_access_script / access_script');
  }

  //
  // MISSING for a complete rental unlock: automatic merge of NFT txmsg.data.path
  // (and related hop witnesses) into the locking script before submit. Today
  // custom/rental downloads rely on Witness overlay (or a pre-witnessed script).
  // Callers must supply a script that already satisfies CHECKPATHHOP, or extend
  // this adapter later to mergeWitness(path) using Archive/Vault scripting helpers.
  //

  return mod.sendAccessFileRequest(vault_data, access_script, opts.callback || null);
}

/**
 * Process a successful Vault access-file response on the client.
 *
 * Server-side receive/validation remains Vault.handlePeerTransaction for
 * 'vault access file' (unchanged). This adapter mirrors the file-extraction
 * portion of sendAccessFileRequest's callback so rental callers can reuse it
 * without depending on the download UI.
 *
 * @param {object} app
 * @param {object} mod Vault module instance
 * @param {object} opts
 * @param {object|array} opts.response peer callback payload ({ status, txs } or txs[])
 * @param {boolean} [opts.download=false] trigger browser download when true
 * @returns {{ ok: boolean, files: Array<{ filename: string, mime: string, base64: string }>, error?: string }}
 */
function receiveRentalReadTransaction(app, mod, opts = {}) {
  const res = opts.response;
  if (!res) {
    return { ok: false, files: [], error: 'empty_response' };
  }
  if (res.status === 'err') {
    return { ok: false, files: [], error: res.err || 'access_denied' };
  }

  let txs = [];
  if (Array.isArray(res.txs)) {
    txs = res.txs;
  } else if (Array.isArray(res)) {
    txs = res;
  }

  if (!txs.length) {
    return { ok: false, files: [], error: 'no_transactions' };
  }

  const files = [];
  for (let i = 0; i < txs.length; i++) {
    try {
      const tx = new Transaction();
      tx.deserialize_from_web(app, txs[i]);
      const txmsg = tx.returnMessage() || {};
      const filename = txmsg.data?.name || 'vault.bin';
      const file = String(txmsg.data?.file || '');
      if (!file) {
        continue;
      }

      const parts = file.split(',');
      const header = parts[0] || '';
      const base64Data = parts[1] || '';
      const mimeMatch = header.match(/data:(.*);base64/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

      files.push({ filename, mime, base64: base64Data });

      if (opts.download && typeof document !== 'undefined') {
        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) {
          bytes[j] = binary.charCodeAt(j);
        }
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.log('VAULT: rental read response parse error:', err?.message || err);
    }
  }

  if (!files.length) {
    return { ok: false, files: [], error: 'parse_failed' };
  }

  return { ok: true, files };
}

module.exports = {
  createRentalReadTransaction,
  receiveRentalReadTransaction,
  vaultDataFromRentalNft
};
