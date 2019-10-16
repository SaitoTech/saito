'use strict';

const saito = require('./saito');
const Big      = require('big.js');

/**
 * Mempool Constructor
 * @param {*} app
 */
function Wallet(app) {

  if (!(this instanceof Wallet)) {
    return new Wallet(app);
  }

  this.app     = app || {};

  // options vars
  this.wallet                       = {};
  this.wallet.balance               = "0.0";
  this.wallet.privatekey            = "";
  this.wallet.publickey             = "";
  this.wallet.identifier            = "";
  this.wallet.inputs                = [];
  this.wallet.outputs               = [];
  this.wallet.spends                = [];
  this.wallet.default_fee           = 2;
  this.wallet.version               = 2.19;
  this.wallet.pending               = []; 	// sent but not seen

  this.inputs_hmap                  = [];
  this.inputs_hmap_counter 	    = 0;

  this.recreate_pending             = 0;	// create new transaction (slip) for anything in 
						// the pending array so that they can be properly
						// rebroadcast (happens in event of chain reorg)

  this.inputs_hmap_counter_limit    = 100000;
  this.outputs_hmap                 = [];
  this.outputs_hmap_counter 	    = 0;
  this.outputs_hmap_counter_limit   = 100000;

  this.store_outputs                = 0;
  this.is_testing                   = false;
  this.is_fastload		    = false; 	// used when loading blocks from disk -- we skip
						// wallet inserts block-by-block and check the 
						// integrity of our wallet slips after-the-fact
						// against the Google Dense Hashmap

}
module.exports = Wallet;

/**
 * Initialize Wallet
 */
Wallet.prototype.initialize = function initialize(app) {

  if (this.wallet.privatekey == "") {

    ///////////////////
    // wallet exists //
    ///////////////////
    if (this.app.options.wallet != null) {

      //////////////////
      // testing mode //
      //////////////////
      if ( this.app.options.wallet.is_testing != undefined) {
        this.is_testing = this.app.options.wallet.is_testing;
        console.log("is testing: ", this.is_testing);
      }


      //////////////////////////
      // reset if out-of-date //
      //////////////////////////
      //
      // we keep our public and private keys, but reset the
      // UTXI and UTXO data and force a clean reset of the
      // blockchain tracking information
      //
      if (this.app.options.wallet.version != this.wallet.version) {

        if (this.app.BROWSER == 1) {

          this.app.options.wallet.version = this.wallet.version;

          let tmpprivkey = this.app.options.wallet.privatekey;
          let tmppubkey = this.app.options.wallet.publickey;
          let tmpid = this.app.options.wallet.identifier;

          // specify before reset to avoid archives reset problem
          this.wallet.publickey = tmppubkey;
          this.wallet.privatekey = tmpprivkey;
          this.wallet.identifier = tmpid;

          // reset and save
          this.app.storage.resetOptions();
          this.app.storage.saveOptions();

          // re-specify after reset
          this.wallet.publickey = tmppubkey;
          this.wallet.privatekey = tmpprivkey;
          this.wallet.identifier = tmpid;

          this.app.options.wallet = this.wallet;
          this.saveWallet();

          //
          // TODO: reimplement resetting archives
          //
          this.app.archives.resetArchives();

          // reset blockchain
          this.app.options.blockchain.last_bid = "";
          this.app.options.blockchain.last_hash = "";
          this.app.options.blockchain.last_ts = "";

          alert("Saito Upgrade: Wallet Reset");

        }
      }
      this.wallet = Object.assign(this.wallet, this.app.options.wallet);
    }

    //////////////////////////
    // wallet doesn't exist //
    //////////////////////////
    if (this.wallet.privatekey == "") {
      // generate random keys
      this.wallet.privatekey            = this.app.crypto.generateKeys();
      this.wallet.publickey             = this.app.crypto.returnPublicKey(this.wallet.privatekey);
    }
  }


  //////////////////
  // import slips //
  //////////////////
  this.wallet.spends = []
  if (this.app.options.wallet != null) {

    if (this.app.options.wallet.inputs != null) {
      for (let i = 0; i < this.app.options.wallet.inputs.length; i++) {
        this.wallet.inputs[i] = new saito.slip(
          this.app.options.wallet.inputs[i].add,
          this.app.options.wallet.inputs[i].amt,
          this.app.options.wallet.inputs[i].type,
          this.app.options.wallet.inputs[i].bid,
          this.app.options.wallet.inputs[i].tid,
          this.app.options.wallet.inputs[i].sid,
          this.app.options.wallet.inputs[i].bhash,
          this.app.options.wallet.inputs[i].lc,
          this.app.options.wallet.inputs[i].rn
        );
        this.wallet.spends.push(0);

        ////////////////////
        // update hashmap //
        ////////////////////
        let hmi = this.wallet.inputs[i].returnIndex();
        this.inputs_hmap[hmi] = 1;
        this.inputs_hmap_counter++;

      }
    }
    if (this.app.options.wallet.outputs != null) {
      for (let i = 0; i < this.app.options.wallet.outputs.length; i++) {
        this.wallet.outputs[i] = new saito.slip(
          this.app.options.wallet.outputs[i].add,
          this.app.options.wallet.outputs[i].amt,
          this.app.options.wallet.outputs[i].type,
          this.app.options.wallet.outputs[i].bid,
          this.app.options.wallet.outputs[i].tid,
          this.app.options.wallet.outputs[i].sid,
          this.app.options.wallet.outputs[i].bhash,
          this.app.options.wallet.outputs[i].lc,
          this.app.options.wallet.outputs[i].rn
        );


        ////////////////////
        // update hashmap //
        ////////////////////
        let hmi = this.wallet.outputs[i].returnIndex();
        this.outputs_hmap[hmi] = 1;
        this.outputs_hmap_counter++;

      }
    }
  }


  //
  // check pending transactions and update spent slips
  //
  for (let z = 0; z < this.wallet.pending.length; z++) {
    let ptx = new saito.transaction(this.wallet.pending[z]);

    for (let y = 0; y < ptx.transaction.from.length; y++) {

      let spent_slip = ptx.transaction.from[y];

      let ptx_bhash = spent_slip.bhash;
      let ptx_bid = spent_slip.bid;
      let ptx_tid = spent_slip.tid;
      let ptx_sid = spent_slip.sid;

      for (let x = 0; x < this.wallet.inputs.length; x++) {
        if (this.wallet.inputs[x].bid == ptx_bid) {
          if (this.wallet.inputs[x].tid == ptx_tid) {
            if (this.wallet.inputs[x].sid == ptx_sid) {
              if (this.wallet.inputs[x].bhash == ptx_bhash) {
let d = new Date().getTime();
console.log("\n\n\nWE ARE UPDATING OUR PENDING SLIP so it is spent: " + d);
console.log(JSON.stringify(this.wallet.pending[z]));
	        this.wallet.spends[x] = 1;
	        x = this.wallet.inputs.length;
	      }
	    }
	  }
        }
      }
    }
  }



  //
  // re-implement
  //
  this.purgeExpiredSlips();
  this.updateBalance();
  this.saveWallet();

}



/**
 * counts up the amount of SAITO tokens we have in our wallet
 * and returns that. If this function is provided with a decimal
 * indicating the limit, we stop and report the total value of
 * the UTXI slips we have sufficient to cover that limit.
 *
 * @param  {decimal} amount of tokens needed
 * @returns {decimal} value of tokens in wallet
 **/
Wallet.prototype.returnAvailableInputs = function returnAvailableInputs(limit=0) {

  var value   = Big(0.0);

  this.purgeExpiredSlips();
  // lowest acceptable block_id for security (+1 because is next block, +1 for safeguard)
  var lowest_block = this.app.blockchain.returnLatestBlockId() - this.app.blockchain.returnGenesisPeriod();
      lowest_block = lowest_block+2;

  // calculate value
  for (let i = 0; i < this.wallet.inputs.length; i++) {
    if (this.wallet.spends[i] == 0) {
      if (this.wallet.inputs[i].lc == 1 && this.wallet.inputs[i].bid >= lowest_block) {
        value = value.plus(Big(this.wallet.inputs[i].amt));
        if (value.gte(limit) && limit != 0) {
          return value.toFixed(8);
        }
      }
    }
  }

  return value.toFixed(8);

}



/**
 * create a transaction with the appropriate slips given
 * the desired fee and payment to associate with the
 * transaction, and a change address to receive any
 * surplus tokens.
 *
 * @param {string} recipient publickey
 * @param {decimal} payment amount
 * @param {decimal} fee to send with tx
 *
 * @returns {saito.transaction} if successful
 * @returns {null} if inadequate inputs
 **/
Wallet.prototype.createUnsignedTransaction = function createUnsignedTransaction(publickey, amt = 0.0, fee = 0.0) {

  var tx           = new saito.transaction();
  var total_fees   = Big(amt).plus(Big(fee));
  var wallet_avail = Big(this.returnBalance());

  //
  // check to-address is ok -- this just keeps a server
  // that receives an invalid address from forking off
  // the main chain because it creates its own invalid
  // transaction.
  //
  // this is not strictly necessary, but useful for the demo
  // server during testnet, which produces a majority of
  // blocks.
  //
  if (!this.app.crypto.isPublicKey(publickey)) {
    console.log("trying to send message to invalid address");
    return null;
  }


  if (total_fees.gt(wallet_avail)) {
    return null;
  }


  //
  // zero-fee transactions have fake inputs
  //
  if (total_fees == 0.0) {
    tx.transaction.from = [];
    tx.transaction.from.push(new saito.slip(this.returnPublicKey()));
  } else {
    tx.transaction.from = this.returnAdequateInputs(total_fees);
  }
  tx.transaction.ts   = new Date().getTime();
  tx.transaction.to.push(new saito.slip(publickey, amt));

  // specify that this is a normal transaction
  tx.transaction.to[tx.transaction.to.length-1].type = 0;
  if (tx.transaction.from == null) {
    return null;
  }

  // add change input
  var total_inputs = Big(0.0);
  for (let ii = 0; ii < tx.transaction.from.length; ii++) {
    total_inputs = total_inputs.plus(Big(tx.transaction.from[ii].amt));
  }

  //
  // generate change address(es)
  //
  var change_amount = total_inputs.minus(total_fees);

  if (Big(change_amount).gt(0)) {

    //
    // if we do not have many slips left, generate a few extra inputs
    //
    if (this.wallet.inputs.length < 8) {

      //
      // split change address
      //
      // this prevents some usability issues with APPS
      // by making sure there are usually at least 3 
      // utxo available for spending.
      //
      let half_change_amount = change_amount.div(2);

      tx.transaction.to.push(new saito.slip(this.returnPublicKey(), half_change_amount.toFixed(8)));
      tx.transaction.to[tx.transaction.to.length-1].type = 0;
      tx.transaction.to.push(new saito.slip(this.returnPublicKey(), change_amount.minus(half_change_amount).toFixed(8)));
      tx.transaction.to[tx.transaction.to.length-1].type = 0;

    } else {

      //
      // single change address
      //
      tx.transaction.to.push(new saito.slip(this.returnPublicKey(), change_amount.toFixed(8)));
      tx.transaction.to[tx.transaction.to.length-1].type = 0;
    }
  }


  //
  // we save here so that we don't create another transaction
  // with the same inputs after broadcasting on reload
  //
  this.saveWallet();

  return tx;

}


/**
 * create a transaction to replace oldtx slips with 
 * new inputs that the wallet deems valid. this is 
 * used to resend pending transactions that have been
 * created on a chain
 *
 * @param {tx} old bad transaction
 *
 * @returns {saito.transaction} if successful
 * @returns {null} if inadequate inputs
 **/
Wallet.prototype.createReplacementTransaction = function createReplacementTransaction(oldtx) {

  let recipients = [];
  let outputs    = [];
  let inputs     = Big(0.0);
  let fee        = Big(0.0);

  //
  // calculate inputs
  //
  for (let z = 0; z < oldtx.transaction.from.length; z++) {
    inputs = inputs.plus(Big(oldtx.transaction.from[z].amt));
  }

  //
  // calculate outputs
  //
  for (let z = 0; z < oldtx.transaction.to.length; z++) {

    if (!recipients.includes(oldtx.transaction.to[z].add)) {
      recipients.push(oldtx.transaction.to[z].add);
      outputs.push(Big(0.0));
    }

    let ridx = 0;
    for (let zz = 0; zz < recipients.length; zz++) {
      if (recipients[zz] === oldtx.transaction.to[z].add) {
	ridx = zz;
	zz = recipients.length+1;
      }
    }

    outputs[ridx] = outputs[ridx].plus(Big(oldtx.transaction.to[z].amt));

  }


  //
  // calculate total fees paid
  //
  let total_fees = Big(0.0);
  for (let z = 0; z < outputs.length; z++) { total_fees = total_fees.plus(outputs[z]); }
  total_fees = total_fees.minus(inputs).times(-1);


  //
  // subtract outputs I am paying myself to figure out actual amount needed...
  //
  for (let z = 0; z < recipients.length; z++) {
    if (recipients[z] == this.returnPublicKey()) {
      inputs = inputs.minus(outputs[z]);
      outputs[z] = outputs[z].minus(outputs[z]);
    }
  }

  //
  // subtract fees from inputs
  //
  inputs = inputs.minus(total_fees);

  //
  // create the transaction
  //
  var tx           = new saito.transaction();

  let our_idx = 0;
  for (let z = 0; z < recipients.length; z++) {
    if (recipients[z] == this.returnPublicKey()) {
      our_idx = z; z = recipients.length+1;
    }
  }

  let newtx = this.createUnsignedTransaction(this.returnPublicKey(), outputs[our_idx].toString(), total_fees.toString());
  if (newtx == null) { return null; }

  //
  // add slips for other users / recipients
  //
  for (let z = 0; z < recipients.length; z++) {
    if (recipients[z] != this.returnPublicKey()) {

      if (outputs[z].eq(Big(0.0))) {
        newtx.transaction.to.push(new saito.slip(recipients[z]));
      } else {
        let newtx2 = this.createUnsignedTransaction(recipients[z], outputs[z].toString(), 0);
	if (newtx2 == null) { return null; }
	for (let z = 0; z < newtx2.transaction.from.length; z++) {
	  newtx.transaction.from.push(newtx2.transaction.from[z]);
        }
	for (let z = 0; z < newtx2.transaction.to.length; z++) {
	  newtx.transaction.to.push(newtx2.transaction.to[z]);
        }
      }
    }
  }

  newtx.transaction.ts = oldtx.transaction.ts;
  newtx.transaction.msg = oldtx.transaction.msg;
  newtx.transaction.msg.recreated = 1;

  //
  // we save here so that we don't create another transaction
  // with the same inputs after broadcasting on reload
  //
  this.saveWallet();



  return newtx;

}


/**
 * create a transaction with the appropriate slips given
 * the desired fee and payment to associate with the
 * transaction, and a change address to receive any
 * surplus tokens. Use the default wallet fee.
 *
 * @param {string} recipient publickey
 * @param {decimal} fee to send with tx
 *
 * @returns {saito.transaction} if successful
 * @returns {null} if inadequate inputs
 **/
Wallet.prototype.createUnsignedTransactionWithDefaultFee = function createUnsignedTransactionWithDefaultFee(publickey, amt = 0.0) {
  return this.createUnsignedTransaction(publickey, amt, this.returnDefaultFee());
}



/**
 * signs a transaction using the wallet private key.
 *
 * @param {saito.transaction} tx transaction to sign
 * @returns {saito.transaction} signed transaction
 **/
Wallet.prototype.signTransaction = function signTransaction(tx) {

  if (tx == null) { return null; }

  // ensure slip ids are properly sequential
  for (var i = 0; i < tx.transaction.to.length; i++) {
    tx.transaction.to[i].sid = i;
  }

  //
  // ensure message hash is generated (self-assignment)
  //
  tx.transaction.mhash  = tx.returnMessageHash(this.app);
  tx.transaction.sig    = tx.returnSignature(this.app);

  return tx;
}


/**
 * signs a msg string using the wallet private key.
 *
 * @param {string} msg message to sign
 * @returns {string} public key
 **/
Wallet.prototype.signMessage = function signMessage(msg) {
  return saito.crypto().signMessage(msg, this.returnPrivateKey());
}



/**
 *
 * create a special "golden ticket transaction" that claims
 * the reward offered by a golden ticket. this function is
 * used by miners. the two UTXO slips are the winners of the
 * golden ticket.
 *
 * @param {array} winners winnning nodes
 * @param {object} solution golden ticket solution
 *
 * @returns {saito.transaction} tx
 **/
//
// TODO: -- needs to create based on addresses, not on precreated slips
//
Wallet.prototype.createGoldenTransaction = function createGoldenTransaction(winners, solution) {

  var tx = new saito.transaction();
  tx.transaction.from.push(new saito.slip(this.returnPublicKey(), 0.0, 1));

  tx.transaction.to.push(winners[0]);
  tx.transaction.to.push(winners[1]);
  tx.transaction.ts  = new Date().getTime();
  tx.transaction.gt  = solution;
  tx.transaction.msg = "golden ticket";

  tx = this.signTransaction(tx);

  return tx;

}






/**
 * given an amount of SAITO tokens, fetches an adequate number of
 * UTXI slips and returns them as part of an array. If there are
 * not enough tokens in the wallet, returns null.
 *
 * @params  {demical} amount of tokens needed
 * @returns {array} array of saito.slips
 * @returns null if insufficient UTXI
 **/
Wallet.prototype.returnAdequateInputs = function returnAdequateInputs(amt) {

  var utxiset = [];
  var value   = Big(0.0);
  var bigamt  = Big(amt);

  var lowest_block = this.app.blockchain.returnLatestBlockId() - this.app.blockchain.returnGenesisPeriod();

  //
  // this adds a 1 block buffer so that inputs are valid in the future block included
  //
  lowest_block = lowest_block+2;

  this.purgeExpiredSlips();

  //
  // check pending txs to avoid slip reuse if necessary
  //
  if (this.wallet.pending.length > 0) {
    for (let i = 0; i < this.wallet.pending.length; i++) {
      let ptx = new saito.transaction(this.wallet.pending[i]);
      for (let k = 0; k < ptx.transaction.from.length; k++) {
	let slipIndex = ptx.transaction.from[k].returnIndex();
        for (let m = 0; m < this.wallet.inputs; m++) {
	  let thisSlipIndex = this.wallet.inputs[m].returnIndex();
	  if (thisSlipIndex === slipIndex) {
	    while (this.wallet.spends.length < m) {
	      this.wallet.spends.push(0);
	    }
	    this.wallet.spends[m] = 1;
	  }
	}
      }
    }
  }


  for (let i = 0; i < this.wallet.inputs.length; i++) {
    if (this.wallet.spends[i] == 0 || i >= this.wallet.spends.length) {
      var slip = this.wallet.inputs[i];
      if (slip.lc == 1 && slip.bid >= lowest_block) {
        if (this.app.mempool.transactions_inputs_hmap[slip.returnIndex()] != 1) {
          this.wallet.spends[i] = 1;
          utxiset.push(slip);
          value = value.plus(Big(slip.amt));
          if (value.gt(bigamt) || value.eq(bigamt)) {
            return utxiset;
          }
        }
      }
    }
  }

  return null;
}



/**
 * calculates the wallet balance and updates the modules
 *
 **/
Wallet.prototype.updateBalance = function updateBalance() {
  this.wallet.balance = this.calculateBalance();
  this.app.modules.updateBalance();
}


/**
 * Goes through our list of input slips and calculates the total
 * value of the spendable SAITO slips stored in this wallet.
 *
 * @returns {string} balance_of_wallet
 **/
Wallet.prototype.calculateBalance = function calculateBalance() {
  let b = Big(0.0);
  let minid = this.app.blockchain.returnLatestBlockId() - this.app.blockchain.returnGenesisPeriod() + 1;
  for (let x = 0; x < this.wallet.inputs.length; x++) {
    let s = this.wallet.inputs[x];
    if (s.lc == 1 && s.bid >= minid) {
      b = b.plus(Big(s.amt));
    }
  }
  return b.toFixed(8);
}



/**
 * Returns wallet balance
 * @returns {string} publickey (hex)
 */
Wallet.prototype.returnBalance = function returnBalance() {
  return this.wallet.balance;
}

/**
 * Returns default fee
 * @returns {decimal} default_fee
 */
Wallet.prototype.returnDefaultFee = function returnDefaultFee() {
  return this.wallet.default_fee;
}

/**
 * saves wallet to options file
 * @returns {string} publickey (hex)
 */
Wallet.prototype.saveWallet = function saveWallet() {
  this.app.options.wallet = this.wallet;
  this.app.storage.saveOptions();
}

/**
 * Returns wallet publickey
 * @returns {string} publickey (hex)
 */
Wallet.prototype.returnPublicKey = function returnPublicKey() {
  return this.wallet.publickey;
}

/**
 * Returns wallet privatekey
 * @returns {string} privatekey (hex)
 */
Wallet.prototype.returnPrivateKey = function returnPrivateKey() {
  return this.wallet.privatekey;
}

/**
 * return the default identifier associated with a wallet, if exists.
**/
Wallet.prototype.returnIdentifier = function returnIdentifier() {
  return this.wallet.identifier;
}

/**
 * Updates the default identifier associated with the wallet. this
 * is the human-readable name that can be set by DNS modules. saves
 * the wallet to ensure persistence.
 *
 * @param {string} id
 */
Wallet.prototype.updateIdentifier = function updateIdentifier(id) {
  this.wallet.identifier = id;
  this.saveWallet();
}


/**
 * Purges all expired slips from the wallet
 */
Wallet.prototype.purgeExpiredSlips = function purgeExpiredSlips() {

  let gid = this.app.blockchain.returnGenesisBlockId();
  for (let m = this.wallet.inputs.length-1; m >= 0; m--) {
    if (this.wallet.inputs[m].bid < gid) {
      this.wallet.inputs.splice(m, 1);
      this.wallet.spends.splice(m, 1);
    }
  }
  for (let m = this.wallet.outputs.length-1; m >= 0; m--) {
    if (this.wallet.outputs[m].bid < gid) {
      this.wallet.outputs.splice(m, 1);
    }
  }
}


/**
 * This function is triggered whenever we add a new block or 
 * undergo a chain reorganization which puts a new block at 
 * the tip of the chain. It is also triggered whenever we 
 * remove a block from the chain.
 *
 * @param {integer} block_id
 * @param {integer} block_hash
 * @param {integer} am_i_the_longest_chain
 */
//
// TODO: - can we make these more efficient by referencing our hashmaps
// instead of looping through our inputs? These were originally separate
// functions that were individually called, but if we can make it efficient
// it may be easier cognitively for people to just run them this way.
//
// doing this may be more computationally intensive, but it will be easier
// for developers to understand, so perhaps it is a good idea to keep all
// of these in one place.
//
Wallet.prototype.onChainReorganization = function onChainReorganization(block_id, block_hash, lc) {

  if (lc == 1) {

    this.purgeExpiredSlips();
    this.resetSpentInputs();

    //
    // recreate pending slips
    //
    if (this.recreate_pending == 1) {

      for (let i = 0; i < this.wallet.pending.length; i++) {
        let ptx = new saito.transaction(this.wallet.pending[i]);
        let newtx = this.createReplacementTransaction(ptx);
        if (newtx != null) { 
	  newtx = this.signTransaction(newtx);
	  if (newtx != null) {
if (this.app.BROWSER == 1) { alert("Re-adding the Pending Transaction in recreated: " + JSON.stringify(newtx.transaction)); }
	    this.wallet.pending[i] = JSON.stringify(newtx); 
	  }
	}
      }
      this.recreate_pending = 0;
    }

  } else {
    if (this.doesSlipInPendingTransactionsSpendBlockHash(block_hash)) {
      this.recreate_pending = 1;
    }
  }

  this.resetExistingSlips(block_id, block_hash, lc); 
}


Wallet.prototype.resetExistingSlips = function resetExistingSlips(block_id, block_hash, lc=0) {

  //
  // this is an edge case that may be unnecessary. if
  // blocks receive their first block containing a payment
  // but they already have this payment indexed, we may
  // need to tell our wallet that all of those slips are
  // longest chain.
  //
  for (let m = this.wallet.inputs.length-1; m >= 0; m--) {
    if (this.wallet.inputs[m].bid == block_id && this.wallet.inputs[m].bhash == block_hash) {
      this.wallet.inputs[m].lc = lc;
    }
    else {
      if (this.wallet.inputs[m].bid < block_id) {
        return;
      }
    }
  }

}

Wallet.prototype.isSlipInPendingTransactions = function isSlipInPendingTransactions(slip=null) {

  if (slip == null) { return false; }

  let slipidx = slip.returnIndex();

  for (let i = 0; i < this.wallet.pending.length; i++) {
    let ptx = new saito.transaction(this.wallet.pending[i]);
    for (let k = 0; k < ptx.transaction.from.length; k++) {
      let fslip = ptx.transaction.from[k];
      if (fslip.returnIndex() === slipidx) {
	return true;
      }
    }
  }

  return false;

}


Wallet.prototype.doesSlipInPendingTransactionsSpendBlockHash = function doesSlipInPendingTransactionsSpendBlockHash(bhash="") {

  if (bhash == "") { return false; }

  for (let i = 0; i < this.wallet.pending.length; i++) {
    let ptx = new saito.transaction(this.wallet.pending[i]);
    for (let k = 0; k < ptx.transaction.from.length; k++) {
      if (ptx.transaction.from[k].bhash == bhash) {
	return true;
      }
    }
  }

  return false;

}
Wallet.prototype.resetSpentInputs = function resetSpentInputs(bid=0) {

  if (bid == 0) {

    ////////////////////////
    // reset spent inputs //
    ////////////////////////
    //
    // this means we have a new block, which means
    // that we can reset our SPEND array. TODO: make
    // this more sophisticated so that we wait a certain
    // number of blocks more than 1 before clearing the
    // spend array.
    //
    for (let i = 0; i < this.wallet.inputs.length; i++) {
      if (this.isSlipInPendingTransactions(this.wallet.inputs[i]) == false) {
        this.wallet.spends[i] = 0;
      }
    }

  } else {

    let target_bid = this.app.blockchain.returnLatestBlockId() - bid;

    for (let i = 0; i < this.wallet.inputs.length; i++) {
      if (this.wallet.inputs[i].bid <= target_bid) {
        if (this.isSlipInPendingTransactions(this.wallet.inputs[i]) == false) {
          this.wallet.spends[i] = 0;
        }
      }
    }
  }

}



/**
 * Adds input to wallet.inputs
 * @param {saito.slip} input_slip
 */
Wallet.prototype.addInput = function addInput(x) {

  //////////////
  // add slip //
  //////////////
  //
  // we keep our slip array sorted according to block_id
  // so that we can (1) spend the earliest slips first,
  // and (2) simplify deleting expired slips
  //
  let pos = this.wallet.inputs.length;
  while (pos > 0 && this.wallet.inputs[pos-1].bid > x.bid) { pos--; }
  if (pos == -1) { pos = 0; }

  this.wallet.inputs.splice(pos, 0, x);
  this.wallet.spends.splice(pos, 0, 0);

  let hmi = x.returnIndex(x);
  this.inputs_hmap[hmi] = 1;
  this.inputs_hmap_counter++;


  ////////////////////////
  // regenerate hashmap //
  ////////////////////////
  //
  // we want to periodically re-generate our hashmaps
  // that help us check if inputs and outputs are already
  // in our wallet for memory-management reasons and
  // to maintain reasonable accuracy.
  //
  if (this.inputs_hmap_counter > this.inputs_hmap_counter_limit) {
    this.inputs_hmap = [];
    this.outputs_hmap = [];
    this.inputs_hmap_counter = 0;
    this.outputs_hmap_counter = 0;

    for (let i = 0; i < this.wallet.inputs.length; i++) {
      let hmi = this.wallet.inputs[i].returnIndex();
      this.inputs_hmap[hmi] = 1;
    }

    for (let i = 0; i < this.wallet.outputs.length; i++) {
      let hmi = this.wallet.outputs[i].returnIndex();
      this.outputs_hmap[hmi] = 1;
    }
  }

  return;
}


/**
 *
 * Adds a reference to a spent UTXO slip to our wallet.
 *
 * @param {saito.slip} output_slip
 *
 */
Wallet.prototype.addOutput = function addOutput(x) {

  if (this.is_testing == true) { return; }

  //////////////
  // add slip //
  //////////////
  //
  // we don't bother storing UTXO outputs in any specific
  // order as we more rarely need to search through them
  //
  this.wallet.outputs.push(x);

  let hmi = x.returnIndex();
  this.outputs_hmap[hmi] = 1;
  this.outputs_storage_counter++;


  ///////////////////////
  // purge old outputs //
  ///////////////////////
  //
  // delete excessive outputs to prevent options file expanding
  // uncontrollably. the downside is the potential for funds loss
  // with chain-reorganizations
  //
  if (this.output_storage_counter >= this.output_storage_limit) {
    console.log("Deleting Excessive outputs from heavy-spend wallet...");
    this.wallet.output.splice(0, this.wallet.output.length-this.output_storage_limit);
    this.output_storage_counter = 0;
  }
  return;
}


/**
 * Does our wallet contain an input slip?
 *
 * @param {saito.slip} slip
 * @returns {boolean}
 */
Wallet.prototype.containsInput = function containsUtxi(s) {
  let hmi = s.returnIndex();
  if (this.inputs_hmap[hmi] == 1) { return true; }
  return false;
}


/**
 * Does our wallet contain a output slip?
 *
 * @param {saito.slip} slip
 * @returns {boolean}
 */
Wallet.prototype.containsOutput = function containsUtxo(s) {
  if (this.store_outputs == 0) { return false; }
  let hmi = s.returnIndex();
  if (this.outputs_hmap[hmi] == 1) { return true; }
  return false;
}


/**
 * This is triggered (by the blockchain object) whenever we
 * receive a block that has a transaction to or from us. we
 * check to make sure we have not already processed it, as
 * sometimes that can happen if we are resyncing the chain,
 * and if we have not we add it to our UTXI or UTXO stores.
 *
 * note that this function needs to keep track of whether this
 * block is part of the longest chain in order to know whether
 * our wallet has received spendable money.
 *
 * @param {saito.block} blk
 * @param {saito.transaction} tx
 * @param {integer} lchain
 */
Wallet.prototype.processPayment = function processPayment(blk, tx, to_slips, from_slips, lc) {

  if (this.is_fastload == true) { return; }

  //
  // any txs in pending should be checked to see if
  // we can remove them now that we have received
  // a transaction that might be it....
  //
  if (this.wallet.pending.length > 0) {
    for (let i = 0; i < this.wallet.pending.length; i++) {
      if (this.wallet.pending[i].indexOf(tx.transaction.sig) > 0) {
      //if (this.app.BROWSER == 1) { alert("Deleting Pending TX in Wallet Error 1: " + JSON.stringify(this.wallet.pending[i])); }
	this.wallet.pending.splice(i, 1);
	i--;
      } else {

	//
	// 10% chance of deletion
	//
	if (Math.random() <= 0.1) {

	  //
	  // check that at least 200 minutes have passed
	  //
	  let ptx = new saito.transaction(this.wallet.pending[i]);
	  let ptx_ts = ptx.transaction.ts;
	  let blk_ts = blk.block.ts;

	  //
	  // ensures we do not delete pending for 200 minutes
	  //
	  if ((ptx_ts + 12000000) < blk_ts) {
console.log("DELETING PENDING TX FROM OVERTIME: " + JSON.stringify(this.wallet.pending[i]));
//if (this.app.BROWSER == 1) { alert("Deleting Pending TX in Wallet Error 2: " + JSON.stringify(this.wallet.pending[i])); }
	    this.wallet.pending.splice(i, 1);
	    i--;
	  }
	}
      }
    }
  }


  //
  // if this is a speed test, delete all previous inputs
  // in order to avoid the software needing to iterate
  // through loops to check for duplicate inserts.
  //
  if (this.is_testing == true) {
    if (this.wallet.inputs.length > 0) {
      if (this.wallet.inputs[0].bid < blk.block.id) {
        this.wallet.inputs = [];
        this.wallet.spends = [];
        this.wallet.outputs = [];
	this.inputs_hmap                  = [];
	this.inputs_hmap_counter          = 0;
  	this.outputs_hmap                 = [];
  	this.outputs_hmap_counter         = 0;
      }
    }
  }


  //
  // inbound payments
  //
  if (to_slips.length > 0) {
    for (let m = 0; m < to_slips.length; m++) {

      if (to_slips[m].amt > 0) {

        //
        // if we are testing speed inserts, just
        // push to the back of the UTXI chain without
        // verifying anything
        //
        // this should not be run in production code
        // but lets us minimize wallet checks taking
        // up significant time during capacity tests
        // on other network code.
        //
        if (this.is_testing == true) {
          this.addInput(to_slips[m]);
        } else {
          if (this.containsInput(to_slips[m]) == 0) {
            if (this.containsOutput(to_slips[m]) == 0) {
              this.addInput(to_slips[m]);
            }
          } else {

	    //
	    // it is possible we have slips marked as unspent for lite-clients
	    // because we have marked stuff as unspent in our initial blockchain
	    // sync.
	    //
	    if (lc == 1) {

	      //
	      // make sure slip is spendable
	      //
	      let our_index = to_slips[m].returnIndex();
  	      for (let n = this.wallet.inputs.length-1; n >= 0; n--) {
  	        if (this.wallet.inputs[n].returnIndex() === our_index) {
      		  this.wallet.inputs[n].lc = lc;
    		}
	      }

	    }
	  }
        }
      }
    }
  }

  // don't care about UTXO in speed tests
  if (this.is_testing == true) { return; }


  //
  // outbound payments
  //
  if (from_slips.length > 0) {
    for (var m = 0; m < from_slips.length; m++) {

      var s = from_slips[m];

      //
      // TODO: optimize search based on BID
      //
      for (var c = 0; c < this.wallet.inputs.length; c++) {
        var qs = this.wallet.inputs[c];
        if (
          s.bid   == qs.bid &&
          s.tid   == qs.tid &&
          s.sid   == qs.sid &&
          s.bhash == qs.bhash &&
          s.amt   == qs.amt &&
          s.add   == qs.add &&
          s.rn    == qs.rn
        ) {
          if (this.containsOutput(s) == 0) {
            this.addOutput(this.wallet.inputs[c]);
          }
          this.wallet.inputs.splice(c, 1);
          this.wallet.spends.splice(c, 1);
          c = this.wallet.inputs.length+2;
        }
      }
    }
  }
}


/**
 * Check the slips in our wallet one-by-one and purge 
 * any that are considered invalid according to our 
 * Google Dense Hash Map. This function is used by servers
 * reloading the blockchain to avoid their need to regenerate
 * their wallet in real-time as blocks are added -- speeding
 * up the process of syncing blocks.
 *
 */
Wallet.prototype.validateWalletSlips = function validateWalletSlips(peer) {

  let latest_bid = this.app.blockchain.returnLatestBlockId();
  let slips_to_check = this.wallet.inputs;

  if (this.app.BROWSER == 1 && slips_to_check.length > 0) {
    // we need to check with a full node that our chain is valid
    peer.sendRequestWithCallback("slip check multiple", { slips: slips_to_check }, (res) => {
      // returns an array of which slips are valid
      if (res == null) { return; }
      let valid_array = res;

      // set our new inputs, create new spends, and save
      this.wallet.inputs = this.wallet.inputs.map((slip, index) => {
        slip.lc = valid_array[index]
        return slip;
      });

      this.saveWallet();
    });
  }


  //
  // delete all previous inputs in order to avoid the 
  // software needing to iterate through loops to check
  // for duplicate inserts.
  //
  this.wallet.inputs = [];
  this.wallet.spends = [];
  this.wallet.outputs = [];
  this.inputs_hmap                  = [];
  this.inputs_hmap_counter          = 0;
  this.outputs_hmap                 = [];
  this.outputs_hmap_counter         = 0;

  //
  // go through slips and check them one-by-one
  // only adding to our wallet if valid according
  // to the hashmap
  //
  for (let i = 0; i < slips_to_check.length; i++) {
    let slip = slips_to_check[i];
    if (this.app.storage.validateTransactionInput(slip, latest_bid)) {
      this.addInput(slip);
    }
  }

  //
  // wallet should now be clean
  //
  this.saveWallet();

}











/**
 * Resets any slips from the block_id provided as being off
 * the longest chain. This is used primarily by lite-clients
 * that are connecting but do not have a history of the longest
 * chain to use to validate their slips on restart.
 *
 * {integer} block_id
 */
Wallet.prototype.resetSlipsOffLongestChain = function resetSlipsOffLongestChain(bid=0) {

  for (let i = 0; i < this.wallet.inputs.length; i++) {
    if (this.wallet.inputs[i].bid >= bid) {
      this.wallet.inputs[i].lc = 0;
    }
  }

}


Wallet.prototype.unspendInputSlips = function unspendInputSlips(tmptx=null) {

  if (tmptx == null) { return; }

  for (let i = 0; i < tmptx.transaction.from.length; i++) {

    let fsidx = tmptx.transaction.from[i].returnIndex();

    for (let z = 0; z < this.wallet.inputs.length; z++) {
      if (fsidx == this.wallet.inputs[z].returnIndex()) {
	this.wallet.spends[z] = 0;
      }
    }
  }

}

