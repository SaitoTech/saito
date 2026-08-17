/**
 * Vault rental checkout transactions.
 *
 * createCheckOutRentalTransaction — package file_id + reconstructed access script
 * (file_access_script + CHECKPATHHOP hops from tx.msg.data.path) for the Vault server.
 *
 * receiveCheckOutRentalTransaction — instantiate LOAN_SCRIPT from the FIRST
 * hop with value.delegated == 0, hash it, and submit that hash as Archive
 * owner. FILE_SCRIPT remains the access_script Archive evaluates.
 *
 * Mixed onto the Vault module instance (same pattern as Store lib/transactions).
 */

const Transaction = require('../../../../lib/saito/transaction').default;
const loan = require('../contracts/loan');

/**
 * Build and sign a Vault checkout transaction for a received rental NFT transfer.
 * Does not mutate the NFT transfer `tx`.
 *
 * @param {object} tx received store-nft-rental Bound transfer (list-asset / fulfillment)
 * @returns {Promise<object|null>} signed checkout transaction, or null
 */
async function createCheckOutRentalTransaction(tx) {
  console.log('[VAULT CHECKOUT] Received NFT transfer', {
    signature: tx?.signature || null
  });

  if (!tx) {
    console.log('[VAULT CHECKOUT] Creating checkout transaction FAILED — missing source tx');
    return null;
  }

  const source_msg =
    typeof tx.returnMessage === 'function' ? tx.returnMessage() || {} : tx.msg || {};
  const file_id = String(source_msg?.data?.file_id || '').trim();
  const routing_path = Array.isArray(source_msg?.data?.path) ? source_msg.data.path : [];
  let file_access_script = source_msg?.data?.file_access_script;

  console.log('[VAULT CHECKOUT] Extracted file_id:', file_id || '(missing)');
  console.log('[VAULT CHECKOUT] Extracted routing path:', routing_path);
  console.log(
    '[VAULT CHECKOUT] Extracted file access script',
    file_access_script
      ? typeof file_access_script === 'string'
        ? file_access_script
        : JSON.stringify(file_access_script)
      : '(missing)'
  );

  if (!file_id) {
    console.log('[VAULT CHECKOUT] Creating checkout transaction FAILED — missing file_id');
    return null;
  }
  if (!file_access_script) {
    console.log(
      '[VAULT CHECKOUT] Creating checkout transaction FAILED — missing file_access_script'
    );
    return null;
  }

  console.log('[VAULT CHECKOUT] Constructing checkout transaction');

  let locking_script;
  try {
    locking_script =
      typeof file_access_script === 'string'
        ? JSON.parse(file_access_script)
        : JSON.parse(JSON.stringify(file_access_script));
  } catch (err) {
    console.log(
      '[VAULT CHECKOUT] Creating checkout transaction FAILED — file_access_script is not valid JSON',
      err?.message || err
    );
    return null;
  }

  //
  // Attach NFT transfer path as CHECKPATHHOP.witness.hops (same hop objects
  // written by Store saito-nft-transfer). Walk OR/AND so the nested rental
  // CHECKPATHHOP receives the witness; do not invent a new hop format.
  //
  const attach_path_witness = (node) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const op = String(node.op || '').toUpperCase();
    if ((op === 'AND' || op === 'OR' || op === 'NOT') && Array.isArray(node.args)) {
      for (let i = 0; i < node.args.length; i++) {
        attach_path_witness(node.args[i]);
      }
      return;
    }
    if (op === 'CHECKPATHHOP') {
      node.witness = { hops: routing_path };
    }
  };
  attach_path_witness(locking_script);

  const access_script = JSON.stringify(locking_script);

  const newtx = await this.app.wallet.createUnsignedTransaction();
  newtx.msg = {
    module: 'Vault',
    request: 'vault checkout rental',
    access_script: access_script,
    data: {
      file_id: file_id,
      path: routing_path
    }
  };
  await newtx.sign();

  console.log('[VAULT CHECKOUT] Checkout transaction created', {
    signature: newtx.signature,
    signed: !!(newtx.signature && String(newtx.signature).length > 0),
    from0: newtx.from?.[0]?.publicKey || newtx.from?.[0]?.public_key || null,
    request: newtx.msg?.request,
    file_id: file_id,
    path_hop_count: routing_path.length,
    path_tos: routing_path.map((h) => h?.to || null)
  });
  return newtx;
}

/**
 * Server-side receive path for peer request "vault checkout rental".
 *
 * Structural checks only (file_id / access_script). Authorization is performed
 * solely inside Archive.updateTransaction, which builds context.db from the
 * actual SET fields and evaluates access_script once with request_tx.
 *
 * @param {object} tx peer-request transaction (data = serialized checkout tx)
 * @param {function} mycallback
 * @returns {Promise<number>} 1 when handled
 */
async function receiveCheckOutRentalTransaction(tx, mycallback) {
  console.log('[VAULT CHECKOUT] receiveCheckOutRentalTransaction()');

  try {
    const peer_tx = new Transaction();
    peer_tx.deserialize_from_web(this.app, tx.returnMessage().data);
    const peer_txmsg = peer_tx.returnMessage() || {};

    const file_id = String(peer_txmsg?.data?.file_id || '').trim();
    const access_script =
      peer_txmsg.access_script != null
        ? typeof peer_txmsg.access_script === 'string'
          ? peer_txmsg.access_script
          : JSON.stringify(peer_txmsg.access_script)
        : '';

    console.log('[VAULT CHECKOUT] Server received checkout transaction', {
      peer_request_sig: tx?.signature || null,
      checkout_tx_sig: peer_tx.signature || null,
      request: peer_txmsg.request || null
    });
    console.log('[VAULT CHECKOUT] file_id:', file_id || '(missing)');
    console.log('[VAULT CHECKOUT] Authorization script received', access_script || '(missing)');

    const peer_from0 = tx?.from?.[0]?.publicKey || tx?.from?.[0]?.public_key || null;
    const checkout_from0 =
      peer_tx?.from?.[0]?.publicKey || peer_tx?.from?.[0]?.public_key || null;
    const path = Array.isArray(peer_txmsg?.data?.path) ? peer_txmsg.data.path : [];

    let selected_hop_to = null;
    let selected_hop_value = null;
    let decoded_hops = [];
    let creator_pk = null;
    try {
      const script_obj = JSON.parse(access_script);
      const find_checkpathhop = (node) => {
        if (!node || typeof node !== 'object') {
          return null;
        }
        if (String(node.op || '').toUpperCase() === 'CHECKPATHHOP') {
          return node;
        }
        if (Array.isArray(node.args)) {
          for (let i = 0; i < node.args.length; i++) {
            const found = find_checkpathhop(node.args[i]);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };
      const cph = find_checkpathhop(script_obj);
      creator_pk = cph?.publickey || null;
      const hops = Array.isArray(cph?.witness?.hops) ? cph.witness.hops : path;
      let expected_from = creator_pk;
      for (let i = 0; i < hops.length; i++) {
        const hop = hops[i] || {};
        let value_obj = null;
        try {
          value_obj = JSON.parse(Buffer.from(String(hop.value || ''), 'base64').toString('utf8'));
        } catch (err) {
          value_obj = null;
        }
        decoded_hops.push({
          i,
          from: expected_from,
          to: hop.to || null,
          timestamp: value_obj?.timestamp ?? null,
          expires_at: value_obj?.expires_at ?? null,
          delegated: value_obj?.delegated ?? null
        });
        expected_from = hop.to || expected_from;
      }
      // Same selector as FILE_SCRIPT CHECKPATHHOP: FIRST where value.delegated == 0
      const selected = decoded_hops.find((h) => h.delegated === 0) || null;
      selected_hop_to = selected?.to || null;
      selected_hop_value = selected || null;
    } catch (err) {
      console.log('[VAULT CHECKOUT] CHECKPATHHOP hop decode failed', err?.message || err);
    }

    console.log('[VAULT CHECKOUT] CHECKPATHHOP DEBUG', {
      peer_request_signature: tx?.signature || null,
      peer_request_signed: !!(tx?.signature && String(tx.signature).length > 0),
      peer_request_from0: peer_from0,
      checkout_tx_signature: peer_tx?.signature || null,
      checkout_tx_signed: !!(peer_tx?.signature && String(peer_tx.signature).length > 0),
      checkout_tx_from0: checkout_from0,
      REQUESTER_as_used_by_evaluateWithTransaction: peer_from0,
      creator_publickey_in_script: creator_pk,
      path_hop_count: decoded_hops.length,
      decoded_hops,
      selected_hop_FIRST_where_delegated_eq_0: selected_hop_value,
      hop_to: selected_hop_to,
      hop_to_equals_REQUESTER:
        selected_hop_to != null && peer_from0 != null && selected_hop_to === peer_from0
    });

    if (!file_id) {
      console.log('[VAULT CHECKOUT] Authorization FAILED — missing file_id');
      console.log('[VAULT CHECKOUT] Archive UPDATE NOT PERFORMED');
      if (mycallback) {
        mycallback({ status: 'err', err: 'missing_file_id' });
      }
      return 1;
    }
    if (!access_script) {
      console.log('[VAULT CHECKOUT] Authorization FAILED — missing access_script');
      console.log('[VAULT CHECKOUT] Archive UPDATE NOT PERFORMED');
      if (mycallback) {
        mycallback({ status: 'err', err: 'missing_access_script' });
      }
      return 1;
    }

    const expires_at = selected_hop_value?.expires_at;
    if (!creator_pk || !selected_hop_to || expires_at == null) {
      console.log('[VAULT CHECKOUT] Authorization FAILED — cannot instantiate LOAN_SCRIPT', {
        creator_pk,
        selected_hop_to,
        expires_at
      });
      console.log('[VAULT CHECKOUT] Archive UPDATE NOT PERFORMED');
      if (mycallback) {
        mycallback({ status: 'err', err: 'loan_script_instantiation_failed', file_id: file_id });
      }
      return 1;
    }
    if (!this.app.core?.scripting?.hash) {
      console.log('[VAULT CHECKOUT] Authorization FAILED — scripting.hash unavailable');
      console.log('[VAULT CHECKOUT] Archive UPDATE NOT PERFORMED');
      if (mycallback) {
        mycallback({ status: 'err', err: 'scripting_unavailable', file_id: file_id });
      }
      return 1;
    }

    const loan_script = loan.instantiate({
      creator_publickey: creator_pk,
      renter_publickey: selected_hop_to,
      expires_at: expires_at
    });
    const loan_script_json = JSON.stringify(loan_script);
    const loan_access_hash = this.app.core.scripting.hash(loan_script_json);

    console.log('[VAULT LOAN SCRIPT]\n' + JSON.stringify(loan_script, null, 2));
    console.log('[VAULT LOAN SCRIPT HASH]\n' + loan_access_hash);
    console.log('[VAULT CHECKOUT] Archive owner will be hash of instantiated LOAN_SCRIPT above');

    console.log('[VAULT CHECKOUT] Preparing Archive update');
    console.log('[VAULT CHECKOUT] Requested owner:', loan_access_hash);
    console.log('[VAULT CHECKOUT] Identified Archive record (lookup sig/file_id):', file_id);
    console.log(
      '[VAULT CHECKOUT] Skipping Vault-side access-script evaluation; Archive.updateTransaction is the sole authorizer'
    );

    //
    // Metadata-only update: tx === null so archives.tx is not rewritten.
    // obj.sig is the WHERE lookup key only (Archive excludes it from SET).
    // request_tx = peer request for Archive script evaluation (REQUESTER).
    // Do NOT evaluate access_script here — Archive builds context.db from the
    // actual SET fields and evaluates once inside updateTransaction().
    //
    console.log('[VAULT CHECKOUT] Archive UPDATE BEGIN');
    console.log('[VAULT CHECKOUT] target transaction/file/access record:', file_id);
    console.log('[VAULT CHECKOUT] requested owner value:', loan_access_hash);

    let result;
    try {
      result = await this.app.storage.updateTransaction(
        null,
        {
          sig: file_id,
          owner: loan_access_hash,
          access_script: access_script,
          request_tx: tx
        },
        'localhost'
      );
    } catch (err) {
      console.log('[VAULT CHECKOUT] Archive UPDATE FAILED');
      console.log('[VAULT CHECKOUT] error:', err?.message || err);
      if (mycallback) {
        mycallback({
          status: 'err',
          err: String(err?.message || err),
          file_id: file_id,
          result: 0
        });
      }
      return 1;
    }

    if (!result) {
      console.log('[VAULT CHECKOUT] Authorization FAILED (Archive denied)');
      console.log('[VAULT CHECKOUT] Archive UPDATE NOT PERFORMED');
      if (mycallback) {
        mycallback({
          status: 'err',
          err: 'archive_update_denied',
          file_id: file_id,
          result: 0
        });
      }
      return 1;
    }

    console.log('[VAULT CHECKOUT] Archive UPDATE COMPLETE');
    console.log('[VAULT CHECKOUT] target:', file_id);
    console.log('[VAULT CHECKOUT] result:', result);

    if (mycallback) {
      mycallback({ status: 'ok', file_id: file_id, result: result });
    }
  } catch (err) {
    console.error('[VAULT CHECKOUT] receiveCheckOutRentalTransaction FAILED', err);
    console.log('[VAULT CHECKOUT] Archive UPDATE FAILED');
    console.log('[VAULT CHECKOUT] error:', err?.message || err);
    if (mycallback) {
      mycallback({ status: 'err', err: String(err?.message || err) });
    }
  }

  return 1;
}

module.exports = {
  createCheckOutRentalTransaction,
  receiveCheckOutRentalTransaction
};
