const Order = require('./order');
const Slip = require('../../../lib/saito/slip').default;
const Transaction = require('../../../lib/saito/transaction').default;
const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const { SlipType } = require('saito-js/lib/slip');
const { TransactionType } = require('saito-js/lib/transaction');
const {
  createListingScript,
  createPurchaseScript,
  executeListingScript,
  returnCreatedNftTuples,
  returnSpentNftTuples,
  signAccessScriptWitness
} = require('./scripting');
const {
  transactionIndexInBlock,
  returnAmountPaidInPurchase,
  returnPaymentUtxoFromPurchase,
  slipPublicKey,
  serializeSlip,
  paymentInputFromOrder,
  listingInputSlipJsonFromRecord,
  listingTxmsg,
  listRustP2shInputIndexes
} = require('./helpers');

function partitionCustodyDeposit(row_custody, take_qty, row_qty) {
  const buyer = row_qty > 0 ? (row_custody * BigInt(take_qty)) / BigInt(row_qty) : 0n;
  return { buyer, remaining: row_custody - buyer };
}

function p2shPaymentRecipient(app, p2sh_address, context) {
  const recipient = slipPublicKey(app, p2sh_address) || p2sh_address;
  if (
    !recipient ||
    (recipient === p2sh_address && p2sh_address?.length === 66 && p2sh_address?.startsWith('00'))
  ) {
    const log = context === 'createPurchaseAssetTransaction' ? console.error : console.log;
    log(`Store: ${context} slipPublicKey failed`, p2sh_address, recipient);
    throw new Error('invalid recipient public key');
  }
  return recipient;
}

module.exports = {
  async createListAssetTransaction(nft, listing = {}) {
    //
    // Wallet NFT records keep slips + tx_sig only. Listing needs the mint/transfer
    // tx (txmsg). Prefer a tx already attached; otherwise hydrate from Archive.
    //
    if (!nft?.tx && typeof nft?.fetchTransaction === 'function') {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        nft.fetchTransaction(finish);
        setTimeout(finish, 8000);
      });
    }

    if (!nft?.tx) {
      throw new Error('NFT transaction is missing — cannot list without original NFT data');
    }

    if (!nft.txmsg && typeof nft.buildNFTData === 'function') {
      nft.buildNFTData(nft.tx);
    }

    if (!nft.txmsg) {
      throw new Error('NFT transaction message is missing — cannot list without original NFT data');
    }

    //
    // create the listing script
    //
    const script_info = createListingScript(this.app, {
      seller_publickey: await this.app.wallet.getPublicKey(),
      store_publickey: this.store_public_key
    });

    //
    // create the listing txmsg
    //
    const txmsg = JSON.parse(JSON.stringify(nft.txmsg));
    txmsg.module = 'Store';
    txmsg.request = 'list-asset';
    txmsg.access_script = script_info.access_script;
    txmsg.access_hash = script_info.access_hash;
    txmsg.p2sh_address = script_info.p2sh_address;
    txmsg.listing = listing;

    //
    // create the listing tx
    //
    const slip_public_key = p2shPaymentRecipient(
      this.app,
      script_info.p2sh_address,
      'createListAssetTransaction'
    );
    let newtx = await this.app.wallet.createNFTTransaction(
      nft,
      slip_public_key,
      listing.quantity_total ?? nft.amount,
      BigInt(0),
      BigInt(0),
      txmsg
    );
    // Listing user → Store for store-nft-rental is the authorized/delegated hop.
    // Other NFT types leave data default (no delegated flag).
    const is_store_rental =
      (typeof nft.returnType === 'function' && nft.returnType() === 'store-nft-rental') ||
      String(listing?.listing_mode || '').toLowerCase() === 'rent';
    if (is_store_rental) {
      nft.nft_type = 'store-nft-rental';
    }
    const listing_transfer_data = is_store_rental ? { delegated: true } : {};
    newtx = await nft.modifyBeforeSend(newtx, this.store_public_key, listing_transfer_data);
    await newtx.sign();

    console.log('Store: createListAssetTransaction complete', newtx.signature);
    return newtx;
  },

  async receiveListAssetTransaction(blk, tx) {
    console.log('Store: receiveListAssetTransaction start', tx.signature);

    const nft = new SaitoNFT(this.app, this, tx, null);
    const txmsg = tx.returnMessage();

    if (txmsg.fulfill_sale) {
      await this.receiveFulfillmentTransaction(blk, tx);
    } else {
      //
      // determine if existing inventory is being modified
      //
      try {
        const spent_tuples = returnSpentNftTuples(tx);
        const created_tuples = returnCreatedNftTuples(tx);
        const slip_key =
          slipPublicKey(this.app, txmsg.p2sh_address || '') || txmsg.p2sh_address || '';

        //
        // inventory moved from one listing position to another
        //
        if (
          spent_tuples.some((tuple) => tuple.custody_public_key === slip_key) &&
          created_tuples.some((tuple) => tuple.custody_public_key === slip_key) &&
          (await executeListingScript(this.app, txmsg.access_script || '', this.store_public_key))
        ) {
          await this.warehouse.removeListing(nft, tx, txmsg, blk);
        }

        //
        // new inventory position observed
        //
        await this.warehouse.addListing(nft, tx, txmsg, blk);
      } catch (err) {
        console.error('Store: receiveListAssetTransaction failed', err);
        if (err?.stack) {
          console.error(err.stack);
        }
      }
    }

    //
    // Stage 1 rental checkout: if this list-asset transfers a store-nft-rental
    // to the current user, ask Vault to build a checkout tx and submit it.
    //
    try {
      const my_key = String(this.publicKey || '').trim();
      const nft_type =
        (typeof nft.returnType === 'function' ? nft.returnType() : '') || nft.nft_type || '';
      const is_store_rental =
        nft_type === 'store-nft-rental' ||
        String(txmsg?.listing?.listing_mode || '').toLowerCase() === 'rent';

      if (!is_store_rental || !my_key) {
        return;
      }

      const created_tuples = returnCreatedNftTuples(tx);
      const to_me =
        String(txmsg?.fulfill_sale?.buyer || '') === my_key ||
        created_tuples.some((tuple) => tuple.custody_public_key === my_key);

      if (!to_me) {
        return;
      }

      console.log(
        '[VAULT CHECKOUT] Store detected rental transfer',
        {
          list_asset_tx: tx.signature,
          nft_type,
          recipient: my_key,
          fulfill_sale_buyer: txmsg?.fulfill_sale?.buyer || null
        }
      );

      const vault_mod = this.app.modules.returnModule('Vault');
      if (!vault_mod || typeof vault_mod.createCheckOutRentalTransaction !== 'function') {
        console.log(
          '[VAULT CHECKOUT] Store skipped — Vault module not installed or missing createCheckOutRentalTransaction'
        );
        return;
      }

      console.log(
        '[VAULT CHECKOUT] Store invoking vault_mod.createCheckOutRentalTransaction(tx)',
        tx.signature
      );
      const newTx = await vault_mod.createCheckOutRentalTransaction(tx);
      if (!newTx) {
        console.log('[VAULT CHECKOUT] Store skipped — Vault returned no checkout transaction');
        return;
      }

      console.log('[VAULT CHECKOUT] Store received checkout transaction from Vault', {
        checkout_tx_sig: newTx.signature,
        request: newTx.msg?.request || newTx.returnMessage?.()?.request,
        data: newTx.msg?.data || newTx.returnMessage?.()?.data
      });

      if (!vault_mod.peer?.publicKey) {
        console.log(
          '[VAULT CHECKOUT] Store skipped send — Vault peer not connected; checkout tx',
          newTx.signature
        );
        return;
      }

      console.log(
        '[VAULT CHECKOUT] Sending checkout transaction to Vault server',
        {
          checkout_tx_sig: newTx.signature,
          checkout_tx_signed: !!(newTx.signature && String(newTx.signature).length > 0),
          vault_peer: vault_mod.peer.publicKey,
          request: 'vault checkout rental',
          note: 'sendRequestAsTransaction outer peer-request is signed only if signature_required=true (currently omitted)'
        }
      );
      this.app.network.sendRequestAsTransaction(
        'vault checkout rental',
        newTx.serialize_to_web(this.app),
        (res) => {
          console.log('[VAULT CHECKOUT] Store received Vault server response', res);
        },
        vault_mod.peer.publicKey
      );
    } catch (err) {
      console.error('[VAULT CHECKOUT] Store rental checkout wiring failed', err);
      if (err?.stack) {
        console.error(err.stack);
      }
    }
  },

  async receiveFulfillmentTransaction(blk, tx) {
    console.log('Store: receiveFulfillmentTransaction start', tx.signature);

    const nft = new SaitoNFT(this.app, this, tx, null);
    const txmsg = tx.returnMessage();

    await this.warehouse.confirmSettlement(blk, tx);
    await this.warehouse.addListing(nft, tx, txmsg, blk);
  },

  attachFulfillmentTxmsg(fulfillment_tx, order_row, listing_rows = [], listing_tx = null) {
    if (!fulfillment_tx || !order_row || !listing_rows.length || !listing_tx) {
      throw new Error('fulfillment transaction, order, listing rows, and listing tx are required');
    }

    const primary_listing_row = listing_rows[0];
    const listing_txmsg = listingTxmsg(listing_tx);
    const buyer = order_row.buyer || '';
    const buy_qty = Number(order_row.quantity) || 1;
    const unit_price = Number(order_row.price ?? primary_listing_row.price ?? 0);

    let relist_listing_row = primary_listing_row;
    let relist_remainder = 0;
    for (const listing_row of listing_rows) {
      const row_qty = Number(listing_row.quantity ?? 1);
      const take_qty = Number(listing_row.take_qty ?? row_qty);
      const remainder = row_qty - take_qty;
      if (remainder > 0) {
        relist_listing_row = listing_row;
        relist_remainder = remainder;
        break;
      }
    }

    const pay_descriptor =
      relist_listing_row.p2sh_address || primary_listing_row.p2sh_address || '';
    const base_listing = listing_txmsg.listing || {
      nft_id: primary_listing_row.nft_id,
      price: String(this.app.wallet.convertNolanToSaito(BigInt(unit_price)) ?? unit_price),
      denomination: 'SAITO',
      pay_descriptor
    };

    const existing_access_scripts = Array.isArray(fulfillment_tx.msg?.access_scripts)
      ? fulfillment_tx.msg.access_scripts
      : null;

    fulfillment_tx.msg = {
      ...JSON.parse(JSON.stringify(listing_txmsg || {})),
      ...(fulfillment_tx.msg || {})
    };
    fulfillment_tx.msg.module = 'Store';
    fulfillment_tx.msg.request = 'list-asset';
    fulfillment_tx.msg.fulfill_sale = {
      sale_signature: order_row.order_tx_sig || order_row.signature,
      prior_inventory: primary_listing_row.signature,
      listing_signatures: listing_rows.map((row) => row.signature).filter(Boolean),
      buyer,
      quantity: buy_qty,
      seller: relist_listing_row.seller || primary_listing_row.seller || ''
    };

    if (relist_remainder > 0) {
      fulfillment_tx.msg.access_script = relist_listing_row.access_script || '';
      fulfillment_tx.msg.access_hash = relist_listing_row.access_hash || '';
      fulfillment_tx.msg.p2sh_address = relist_listing_row.p2sh_address || '';
      fulfillment_tx.msg.listing = {
        ...base_listing,
        nft_id: primary_listing_row.nft_id || base_listing.nft_id,
        denomination: base_listing.denomination || 'SAITO',
        pay_descriptor,
        nft_amount: relist_remainder,
        quantity: relist_remainder
      };
    } else {
      fulfillment_tx.msg.access_script = primary_listing_row.access_script || '';
      fulfillment_tx.msg.access_hash = primary_listing_row.access_hash || '';
      fulfillment_tx.msg.p2sh_address = primary_listing_row.p2sh_address || '';
      fulfillment_tx.msg.listing = {
        ...base_listing,
        nft_id: primary_listing_row.nft_id || base_listing.nft_id,
        denomination: base_listing.denomination || 'SAITO',
        pay_descriptor: primary_listing_row.p2sh_address || pay_descriptor,
        nft_amount: 0,
        quantity: 0
      };
    }

    if (existing_access_scripts) {
      fulfillment_tx.msg.access_scripts = existing_access_scripts;
    }

    return fulfillment_tx;
  },

  /**
   * Build a fulfillment transaction from order and listing database rows.
   * Witnesses attach only to payment escrow and NFT custody slips (never Bound).
   */
  async createFulfillmentTransaction(order_row, listing_rows = [], listing_tx = null) {
    if (!order_row) {
      throw new Error('order_row is required');
    }
    if (!listing_rows.length) {
      throw new Error('listing rows are required');
    }

    const buyer = order_row.buyer || '';
    const buy_qty = Number(order_row.quantity) || 1;
    const allocated_total = listing_rows.reduce(
      (sum, row) => sum + Number(row.take_qty ?? row.quantity ?? 0),
      0
    );
    if (buy_qty <= 0 || allocated_total !== buy_qty) {
      throw new Error('invalid fulfillment quantity');
    }

    const primary_listing_row = listing_rows[0];
    const buyer_template_json = listingInputSlipJsonFromRecord(primary_listing_row);
    if (!buyer_template_json) {
      throw new Error('listing utxo slips not available');
    }

    const payment_input = paymentInputFromOrder(order_row);
    if (!payment_input) {
      throw new Error('payment utxo slip not available');
    }

    const payment_access_script = order_row.access_script || '';
    if (!payment_access_script) {
      throw new Error('payment access script not available on order');
    }

    const payment_utxo_key = String(payment_input.utxoKey || '');
    if (!payment_utxo_key) {
      throw new Error('P2SH input is missing utxoset key');
    }

    const access_script_jobs = [];
    const fulfillment_tx = new Transaction();
    fulfillment_tx.timestamp = Date.now();
    fulfillment_tx.type = TransactionType.Bound;
    fulfillment_tx.msg = {};

    const payment_pubkey =
      slipPublicKey(this.app, order_row.p2sh_address) || order_row.p2sh_address || '';

    const witness_log = (role) => ({
      logP2shScript: true,
      context: `createFulfillmentTransaction:${role}`
    });

    fulfillment_tx.addFromSlip(payment_input);
    access_script_jobs.push({
      access_script: payment_access_script,
      message: payment_utxo_key,
      role: 'payment'
    });

    const partial_relists = [];

    for (const listing_row of listing_rows) {
      const take_qty = Number(listing_row.take_qty ?? listing_row.quantity ?? 0);
      const row_qty = Number(listing_row.quantity ?? 1);
      const listing_access_script = listing_row.access_script || '';

      if (!listing_access_script) {
        throw new Error('listing access script not available');
      }

      if (take_qty <= 0 || take_qty > row_qty) {
        throw new Error('invalid fulfillment quantity');
      }

      const row_triple_json = listingInputSlipJsonFromRecord(listing_row);
      if (!row_triple_json) {
        throw new Error('listing utxo slips not available');
      }

      const listing_p2sh_public_key =
        slipPublicKey(this.app, listing_row.p2sh_address) || listing_row.p2sh_address;

      for (let j = 0; j < row_triple_json.length; j++) {
        const slip_json = row_triple_json[j];
        const listing_utxo_key = String(slip_json?.utxoKey || '');
        const listing_input = new Slip(undefined, slip_json);
        const is_custody = j === 1;

        if (is_custody && !listing_utxo_key) {
          throw new Error('P2SH input is missing utxoset key');
        }

        fulfillment_tx.addFromSlip(listing_input);

        if (is_custody) {
          access_script_jobs.push({
            access_script: listing_access_script,
            message: listing_utxo_key,
            role: `listing-custody-${listing_row.signature || listing_rows.indexOf(listing_row)}`
          });
        }
      }

      const remainder = row_qty - take_qty;
      if (remainder > 0) {
        if (partial_relists.length) {
          throw new Error('multiple partial listing consumptions are not supported');
        }
        partial_relists.push({
          listing_row,
          row_triple_json,
          listing_p2sh_public_key,
          remainder
        });
      }
    }

    let buyer_custody_total = 0n;
    for (const listing_row of listing_rows) {
      const take_qty = Number(listing_row.take_qty ?? listing_row.quantity ?? 0);
      const row_qty = Number(listing_row.quantity ?? 1);
      const row_triple_json = listingInputSlipJsonFromRecord(listing_row);
      if (!row_triple_json || row_qty <= 0 || take_qty <= 0) {
        continue;
      }
      const row_custody = BigInt(row_triple_json[1]?.amount ?? 0);
      const { buyer } = partitionCustodyDeposit(row_custody, take_qty, row_qty);
      buyer_custody_total += buyer;
    }

    {
      const buyer_out1 = new Slip(undefined, buyer_template_json[0]);
      buyer_out1.amount = BigInt(buy_qty);
      fulfillment_tx.addToSlip(buyer_out1);
    }
    {
      const buyer_out2 = new Slip(undefined, buyer_template_json[1]);
      buyer_out2.publicKey = buyer;
      buyer_out2.amount = buyer_custody_total;
      fulfillment_tx.addToSlip(buyer_out2);
    }
    {
      const buyer_out3 = new Slip(undefined, buyer_template_json[2]);
      fulfillment_tx.addToSlip(buyer_out3);
    }

    for (const relist of partial_relists) {
      {
        const relist_out1 = new Slip(undefined, relist.row_triple_json[0]);
        relist_out1.amount = BigInt(relist.remainder);
        fulfillment_tx.addToSlip(relist_out1);
      }
      {
        const relist_out2 = new Slip(undefined, relist.row_triple_json[1]);
        relist_out2.publicKey = relist.listing_p2sh_public_key;
        const row_custody = BigInt(relist.row_triple_json[1]?.amount ?? 0);
        const row_qty = Number(relist.listing_row.quantity ?? 1);
        const take_qty = row_qty - relist.remainder;
        const { remaining } = partitionCustodyDeposit(row_custody, take_qty, row_qty);
        relist_out2.amount = remaining;
        fulfillment_tx.addToSlip(relist_out2);
      }
      {
        const relist_out3 = new Slip(undefined, relist.row_triple_json[2]);
        fulfillment_tx.addToSlip(relist_out3);
      }
    }

    const unit_price = BigInt(order_row.price ?? primary_listing_row.price ?? 0);
    const seller_amounts = new Map();
    for (const listing_row of listing_rows) {
      const seller = listing_row.seller || '';
      if (!seller) {
        continue;
      }
      const take_qty = Number(listing_row.take_qty ?? listing_row.quantity ?? 0);
      const prior = seller_amounts.get(seller) || 0n;
      seller_amounts.set(seller, prior + unit_price * BigInt(take_qty));
    }
    for (const [seller, amount] of seller_amounts.entries()) {
      if (amount <= 0n) {
        continue;
      }
      const seller_slip = new Slip();
      seller_slip.publicKey = seller;
      seller_slip.amount = amount;
      seller_slip.type = SlipType.Normal;
      fulfillment_tx.addToSlip(seller_slip);
    }

    // Finalize output slip indices the same way Transaction::sign does.
    const outputs = fulfillment_tx.to || [];
    for (let i = 0; i < outputs.length; i++) {
      outputs[i].index = i;
    }

    // Blake3 over concat(serialize_output_for_signature) for every output.
    // Spec: saito-core get_p2sh_auth_hash / Slip::serialize_output_for_signature —
    //   public_key || amount_be_u64 || slip_index_u8 || slip_type_u8
    const auth_parts = [];
    for (let i = 0; i < outputs.length; i++) {
      const slip = outputs[i];
      const pk_b58 = String(slip?.publicKey || '');
      if (!pk_b58) {
        throw new Error('fulfillment output is missing a public key');
      }
      const pk_bytes = Buffer.from(this.app.crypto.fromBase58(pk_b58), 'hex');
      const amount_buf = Buffer.alloc(8);
      amount_buf.writeBigUInt64BE(BigInt(slip?.amount ?? 0));
      auth_parts.push(pk_bytes);
      auth_parts.push(amount_buf);
      auth_parts.push(Buffer.from([Number(slip.index) & 0xff]));
      auth_parts.push(Buffer.from([Number(slip.type ?? 0) & 0xff]));
    }
    const p2sh_auth_hash = String(this.app.crypto.hash(Buffer.concat(auth_parts)));

    // CHECKMULTISIG verifies signatures over: utxoset_key|p2sh_auth_hash
    const access_scripts = [];
    for (const job of access_script_jobs) {
      const auth_message = `${job.message}|${p2sh_auth_hash}`;
      access_scripts.push(
        await signAccessScriptWitness(
          this.app,
          job.access_script,
          auth_message,
          witness_log(job.role)
        )
      );
    }

    fulfillment_tx.msg.access_scripts = access_scripts;

    const p2sh_indexes = listRustP2shInputIndexes(this.app, fulfillment_tx);
    if (access_scripts.length !== p2sh_indexes.length) {
      throw new Error(
        `access script count ${access_scripts.length} does not match P2SH input count ${p2sh_indexes.length}`
      );
    }

    if (listing_tx) {
      this.attachFulfillmentTxmsg(fulfillment_tx, order_row, listing_rows, listing_tx);
    }

    // Store → renter: append hop with delegated = 0 via the same transfer hook.
    // Does not create a second transaction; mutates fulfillment_tx before sign.
    if (listing_tx) {
      const listing_txmsg = listingTxmsg(listing_tx);
      const rental_nft = new SaitoNFT(this.app, this, listing_tx, null);
      const is_store_rental =
        (typeof rental_nft.returnType === 'function' &&
          rental_nft.returnType() === 'store-nft-rental') ||
        String(listing_txmsg?.listing?.listing_mode || '').toLowerCase() === 'rent';
      if (is_store_rental) {
        // Ensure hook class match even if slip type parsing fell back to "image".
        rental_nft.nft_type = 'store-nft-rental';
        const buyer = String(order_row?.buyer || '').trim();
        const mutated = await rental_nft.modifyBeforeSend(fulfillment_tx, buyer);
        if (!mutated) {
          throw new Error('store-nft-rental fulfillment transfer hop blocked');
        }
      }
    }

    const { dumpFulfillmentAccessScripts } = require('./fulfillment-trace');
    dumpFulfillmentAccessScripts(this.app, fulfillment_tx, payment_pubkey);

    await fulfillment_tx.sign();
    return fulfillment_tx;
  },

  async createPurchaseAssetTransaction(summary, sale = {}, nolan_to_send = 0n) {
    if (!this.store_public_key) {
      throw new Error('Store public key is not configured');
    }

    if (!summary?.nft_id) {
      throw new Error('Summary nft_id is required for purchase');
    }

    const bucket_price = Number(summary.price ?? 0);
    if (!Number.isFinite(bucket_price) || bucket_price <= 0) {
      throw new Error('Summary price is required for purchase');
    }

    const buyer_publickey = await this.app.wallet.getPublicKey();

    const script_info = createPurchaseScript(this.app, {
      buyer_publickey,
      store_publickey: this.store_public_key
    });
    const payment_recipient = p2shPaymentRecipient(
      this.app,
      script_info.p2sh_address,
      'createPurchaseAssetTransaction'
    );

    const newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      payment_recipient,
      nolan_to_send
    );

    newtx.msg = {
      module: 'Store',
      request: 'purchase-asset',
      buyer: buyer_publickey,
      refund: buyer_publickey,
      nft_id: summary.nft_id,
      quantity: Number(sale.quantity) || 1,
      price: String(sale.price),
      fee: String(sale.fee),
      access_script: script_info.access_script,
      access_hash: script_info.access_hash,
      p2sh_address: script_info.p2sh_address
    };

    await newtx.sign();
    return newtx;
  },

  orderFromPurchaseTx(
    tx,
    txmsg,
    payment_utxo,
    { received_block_id = 0, received_block_hash = '', received_transaction_id = 0 } = {}
  ) {
    const buyer = txmsg.buyer || tx.from?.[0]?.publicKey || '';
    const payment_slip = tx.to?.[payment_utxo.payment_output_index];
    return new Order({
      order_tx_sig: tx.signature,
      buyer,
      payment_tx_sig: payment_utxo.payment_tx_sig,
      payment_output_index: payment_utxo.payment_output_index,
      payment_amount: Number(payment_utxo.payment_amount),
      utxo_slip: payment_slip ? serializeSlip(payment_slip) : '',
      access_hash: txmsg.access_hash || '',
      access_script: payment_utxo.access_script || txmsg.access_script || '',
      p2sh_address: payment_utxo.p2sh_address || txmsg.p2sh_address || '',
      block_id_received: Number(received_block_id ?? 0),
      block_hash_received: String(received_block_hash || ''),
      transaction_id_received: Number(received_transaction_id ?? 0),
      longest_chain_received: 1
    });
  },

  async createOrderRefundTransaction({
    order_row,
    refund_public_key = '',
    reason = 'unable-to-fulfill'
  } = {}) {
    const order = order_row;
    if (!order) {
      return null;
    }

    const payment_input = paymentInputFromOrder(order);
    if (!payment_input) {
      throw new Error('payment input not available');
    }

    const payment_access_script = order.access_script || '';
    if (!payment_access_script) {
      throw new Error('payment access script not available on order');
    }

    const refund_to = refund_public_key || order.buyer || '';
    if (!refund_to) {
      throw new Error('refund recipient not available');
    }

    const amount = BigInt(order.payment_amount ?? payment_input.amount ?? 0);
    if (amount <= 0n) {
      throw new Error('refund amount not available');
    }

    const tx = new Transaction();
    tx.timestamp = Date.now();

    tx.addFromSlip(payment_input);

    const refund_slip = new Slip();
    refund_slip.publicKey = refund_to;
    refund_slip.amount = amount;
    refund_slip.type = SlipType.Normal;
    tx.addToSlip(refund_slip);

    tx.msg = {
      module: 'Store',
      request: 'order-refund',
      type: 'order-refund',
      order_tx_sig: order.order_tx_sig || order.signature || '',
      buyer: order.buyer || '',
      refund: refund_to,
      reason,
      payment_tx_sig: order.payment_tx_sig || order.order_tx_sig || '',
      payment_output_index: Number(order.payment_output_index ?? 0),
      payment_amount: String(order.payment_amount ?? 0)
    };

    // Finalize output slip indices the same way Transaction::sign does.
    const refund_outputs = tx.to || [];
    for (let i = 0; i < refund_outputs.length; i++) {
      refund_outputs[i].index = i;
    }

    // Blake3 over concat(serialize_output_for_signature) for every output.
    // Spec: saito-core get_p2sh_auth_hash / Slip::serialize_output_for_signature —
    //   public_key || amount_be_u64 || slip_index_u8 || slip_type_u8
    const refund_auth_parts = [];
    for (let i = 0; i < refund_outputs.length; i++) {
      const slip = refund_outputs[i];
      const pk_b58 = String(slip?.publicKey || '');
      if (!pk_b58) {
        throw new Error('refund output is missing a public key');
      }
      const pk_bytes = Buffer.from(this.app.crypto.fromBase58(pk_b58), 'hex');
      const amount_buf = Buffer.alloc(8);
      amount_buf.writeBigUInt64BE(BigInt(slip?.amount ?? 0));
      refund_auth_parts.push(pk_bytes);
      refund_auth_parts.push(amount_buf);
      refund_auth_parts.push(Buffer.from([Number(slip.index) & 0xff]));
      refund_auth_parts.push(Buffer.from([Number(slip.type ?? 0) & 0xff]));
    }
    const refund_p2sh_auth_hash = String(this.app.crypto.hash(Buffer.concat(refund_auth_parts)));

    const payment_utxo_key = String(payment_input.utxoKey || '');
    if (!payment_utxo_key) {
      throw new Error('P2SH input is missing utxoset key');
    }
    const refund_auth_message = `${payment_utxo_key}|${refund_p2sh_auth_hash}`;

    tx.msg.access_scripts = [
      await signAccessScriptWitness(this.app, payment_access_script, refund_auth_message)
    ];

    const payment_pubkey = slipPublicKey(this.app, order.p2sh_address) || order.p2sh_address || '';

    const { logAccessScriptsForP2sh } = require('./fulfillment-trace');
    logAccessScriptsForP2sh(this.app, tx, {
      operation: 'order-refund',
      payment_pubkey
    });

    return tx;
  },

  async propagateOrderRefund(order, { refund_public_key = '', reason = 'unable-to-fulfill' } = {}) {
    if (this.app.BROWSER) {
      return;
    }

    const refund_tx = await this.createOrderRefundTransaction({
      order_row: order,
      refund_public_key,
      reason
    });
    if (!refund_tx) {
      return;
    }

    await refund_tx.sign();
    this.app.network.propagateTransaction(refund_tx);
    console.log('Store: propagating order refund', refund_tx.signature, reason);
  },

  async receivePurchaseAssetTransaction(blk, tx) {
    if (this.app.BROWSER) {
      return;
    }

    const txmsg = tx.returnMessage?.() || {};

    if (txmsg.module !== 'Store' || txmsg.request !== 'purchase-asset') {
      return;
    }

    const buyer = txmsg.buyer || tx.from?.[0]?.publicKey;
    const nft_id = String(txmsg.nft_id || '').trim();
    const quantity = Number(txmsg.quantity) || 1;
    const unit_price = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.price) ?? 0);
    const fee = BigInt(this.app.wallet.convertSaitoToNolan(txmsg.fee) ?? 0);
    const total = unit_price * BigInt(quantity) + fee;
    const received_block_id = Number(blk?.id ?? 0);
    const received_block_hash = String(blk?.hash ?? '');
    const received_transaction_id = transactionIndexInBlock(blk, tx);
    const refund_public_key = txmsg.refund || buyer;

    if (!buyer || !nft_id) {
      console.warn('Store: purchase missing buyer or nft_id');
      return;
    }

    if (unit_price <= 0n) {
      console.warn('Store: purchase invalid price');
      return;
    }

    const amount_paid = returnAmountPaidInPurchase(tx, txmsg, this.app);
    const payment_utxo = returnPaymentUtxoFromPurchase(tx, txmsg, this.app);
    const refund_order = payment_utxo
      ? this.orderFromPurchaseTx(tx, txmsg, payment_utxo, {
          received_block_id,
          received_block_hash,
          received_transaction_id
        })
      : null;

    const refund = async (reason) => {
      if (!refund_order) {
        console.warn('Store: cannot refund purchase without payment UTXO', reason);
        return;
      }
      try {
        await this.propagateOrderRefund(refund_order, {
          refund_public_key,
          reason
        });
      } catch (err) {
        console.warn('Store: purchase refund failed', reason, err?.message);
      }
    };

    if (amount_paid < total) {
      console.warn(`Store: purchase underpaid. got=${amount_paid} need=${total}`);
      await refund('underpaid');
      return;
    }

    if (!payment_utxo) {
      console.warn('Store: purchase payment UTXO not found');
      return;
    }

    const summary = await this.warehouse.returnSummaryByBucket(nft_id, Number(unit_price));
    const available = summary
      ? await this.warehouse.returnAvailableQuantity(summary.nft_id, summary.price)
      : 0;

    if (!summary || available <= 0) {
      console.warn('Store: purchase summary inactive or missing', nft_id, unit_price.toString());
      await refund('listing-inactive');
      return;
    }

    if (available < quantity) {
      console.warn(
        'Store: purchase insufficient available quantity',
        nft_id,
        unit_price.toString()
      );
      await refund('insufficient-quantity');
      return;
    }

    const now = Date.now();

    try {
      const order = this.orderFromPurchaseTx(tx, txmsg, payment_utxo, {
        received_block_id,
        received_block_hash,
        received_transaction_id
      });
      order.nft_id = summary.nft_id;
      order.price = Number(summary.price ?? 0);
      order.quantity = quantity;
      order.created_at = now;
      order.updated_at = now;
      await this.warehouse.addOrder(order);
      console.log('Store: escrow payment recorded', tx.signature);
    } catch (err) {
      if (String(err?.message || err).includes('UNIQUE')) {
        console.log('Store: escrow payment already recorded', tx.signature);
        return;
      }
      console.warn('Store: escrow payment record failed', err?.message);
      await refund('queue-failed');
    }
  }
};
