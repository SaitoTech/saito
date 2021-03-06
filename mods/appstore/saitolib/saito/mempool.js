'use strict';
const Big = require('big.js')
const saito = require('./saito');
const path = require('path');
const axios = require('axios');

/**
 * Mempool Constructor
 * @param {*} app
 */
function Mempool(app) {

  if (!(this instanceof Mempool)) {
    return new Mempool(app);
  }

  this.app                      = app || {};

  this.directory                = path.join(__dirname, '../../data/');
  this.blocks                   = [];
  this.downloads                = {};
  this.downloads_hmap           = {};
  this.transactions             = [];
  this.goldentickets            = [];
  this.recovered                = [];
  this.transactions_hmap        = [];  // index is tx.transaction.sig
  this.transactions_inputs_hmap = [];  // index is slip returnIndex()

  this.bundling_fees_needed     = "-1";


  //
  // mempool safety caps
  //
  // temporary safety limits designed to help avoid
  // spam attacks taking down everyone in the network
  // by preventing propagation past a certain point
  //
  this.transaction_size_cap       = 1024000000;// bytes hardcap 1GB
  this.transaction_size_current   = 0.0;
  this.block_size_cap             = 1024000000; // bytes hardcap 1GB
  this.block_size_current         = 0.0;

  // how many blocks can we request in one HTTP call
  this.block_sample_size          = 50;


  this.bundling_active          = false;
  this.bundling_speed           = 1000;
  this.bundling_timer           = null;

  this.processing_active        = false;

  this.clearing_active          = false;

  return this;

}
module.exports = Mempool;


/**
 * Initializes mempool and starts trying to bundle blocks
 */
Mempool.prototype.initialize = function initialize() {
  if (this.app.BROWSER == 1) { return; }
  if (this.app.SPVMODE == 1) { return; }
  try {
    this.bundling_timer = setInterval(() => {
      this.bundleBlock();
    }, this.bundling_speed);
  } catch (err) {
    console.log(err);
  }
}

/**
 * Add block hash to downloads queue based on peer. Updates download hashmap to track blocks in queue
 *
 * @param {saito.peer} peer who we're getting our block from
 * @param {string} bhash block hash
 */
Mempool.prototype.addBlockToQueue = function addBlockToQueue(peer, bhash) {
  //
  // avoid dupes
  //
  if (this.app.blockchain.isHashIndexed(bhash) == 1) {
    return;
  }
  if (this.downloads_hmap[bhash] == 1) {
    return;
  }

  let peer_publickey = peer.returnPublicKey();

  if (this.downloads[peer_publickey] == null) {
    this.downloads[peer_publickey] = [];
    this.downloads[peer_publickey].push(bhash)
  } else {
    this.downloads[peer_publickey].push(bhash)
  }
  this.downloads_hmap[bhash] = 1;
}

/**
 * Fetches blocks in our download queue then processes downloaded blocks
 */
Mempool.prototype.fetchBlocks = async function fetchBlocks() {
  // blocks are being fetched already
  if (this.downloading_active == 1) {
    return;
  }

  this.downloading_active = 1;

  // iterate through our download que. Key is peer publickey
  for (var key in this.downloads) {
    while (this.downloads[key].length > 0) {
      let block_hashes = this.downloads[key].splice(0, this.block_sample_size);
      let peer = this.app.network.returnPeerByPublicKey(key)
      if (peer != null) {
        let block_to_download_url = peer.returnBlockURL(block_hashes)

        if (block_hashes.length > 1) {
          await this.fetchMultipleBlocks(block_to_download_url, block_hashes, [this.app.wallet.returnPublicKey()]);
        } else {
          await this.fetchSingleBlock(block_to_download_url, block_hashes[0]);
        }
      } else {
        console.log("Couldn't find peer by key, attemping to re-establish peer connections");
        this.app.network.initialize();
      }
    }
    delete this.downloads[key];
  }
  this.downloading_active = 0;

  await this.processBlocks();
}

/**
 * Fetches single block from endpoint
 *
 * @param {URL} block_to_download_url url endpoint to fetch from
 * @param {string} bhash fetched block hash
 **/
Mempool.prototype.fetchSingleBlock = async function fetchSingleBlock(block_to_download_url, bhash) {
  if ( this.block_size_current <= this.block_size_cap ) {

    try {
      let options = {
        method: 'GET',
        headers: {'content-type': 'application/json' },
        // data: { blocks, publickeys },
        proxy: false,
        url: block_to_download_url
      }
      let response = await axios(options);
      let body = response.data;

      let blk = new saito.block(this.app, body);

      if (blk.block.ts > new Date().getTime() + 60000) {
        console.log("block appears to be from the future, dropping...");
        return;
      }

      if (blk.is_valid == 0 && this.app.BROWSER == 0) {
        return;
      }

      this.addBlock(blk)
    } catch(err) {
      console.error(err);
    }

    delete this.downloads_hmap[bhash];
  }
}

/**
 * Fetch multiple blocks from endpoint
 *
 * @param {URL} block_to_download_url url endpoint to fetch from
 * @param {Array.<saito.block>} blocks list of bhashes being fetched
 * @param {Array.string} publickeys list of keys we want transactions for
 */
Mempool.prototype.fetchMultipleBlocks = async function fetchMultipleBlocks(block_to_download_url, blocks, publickeys=[]) {
  try {
    let options = {
      method: 'POST',
      headers: {'content-type': 'application/json' },
      data: { blocks, publickeys },
      proxy: false,
      url: block_to_download_url
    }
    let response = await axios(options);
    //let response = await axios.post(block_to_download_url, { blocks, publickeys });
    response.data.payload.blocks.forEach((body, index) => {
      let blk = new saito.block(this.app, body);

      if (blk.block.ts > new Date().getTime() + 60000) {
        console.log("block appears to be from the future, dropping...");
        return;
      }

      if (blk.is_valid == 0 && this.app.BROWSER == 0) {
        return;
      }

      this.addBlock(blk);

      delete this.downloads_hmap[blocks[index]];
    });
  } catch(err) {
    console.log(err);
  }
}



/**
 * Adds block to Mempool queue
 */
Mempool.prototype.addBlock = function addBlock(blk) {
  if (blk == null) { return false; }
  if (!blk.is_valid) { return false; }

  //
  // confirm this will not cause memory-exhaustion attacks
  //
  if ( (this.block_size_current + blk.size) > this.block_size_cap) { return false; }

  for (let i = 0; i < this.blocks.length; i++) {
    if (this.blocks[i].returnHash() == blk.returnHash()) { return false; }
  }

  this.blocks.push(blk);
  this.block_size_current += blk.size;

  return true;
}





/**
 * return fees needed to produce a block. used when
 * checking if a new transaction pushes us over the edge
 *
 * @returns {string} bundling_fees_needed
 */
Mempool.prototype.returnBundlingFeesNeeded = function returnBundlingFeesNeeded() {
  return this.bundling_fees_needed;
}


/**
 * Starts bundling block if there is enough available funds and if bundling_active is false
 */
Mempool.prototype.bundleBlock = async function bundleBlock() {

  // ensure not bundling
  if (this.app.monitor.canMempoolBundleBlock() == false) { return; }
  this.bundling_active = true;

  let prevblk = this.app.blockchain.returnLatestBlock();
  let vote    = 0;
  let credits = "0.0";

  if (prevblk != null) {
    vote = this.app.voter.returnPaysplitVote(prevblk.block.paysplit);
    credits = this.returnAvailableFees(vote, prevblk.returnHash());
    console.log(`${new Date()} : ${this.app.burnfee.returnMovingBurnFeeNow(prevblk).toFixed(8)} ---- ${credits} ( ${this.transactions.length} / ${this.containsGoldenTicket()} / ${this.app.wallet.returnBalance() } ) MA? + ${this.app.miner.mining_active}`);
  }

  this.bundling_fees_needed = this.app.burnfee.returnMovingBurnFeeNow(prevblk);

  if (Big(this.bundling_fees_needed).lte(Big(credits))) {

    if (
      (
        this.app.network.isPrivateNetwork() &&
        !this.app.network.isProductionNetwork()
      ) ||
      this.transactions.length > 0
    ) {

      if (this.transactions.length == 1) {
        let is_private_network = this.app.network.isPrivateNetwork()
        let is_prod_network = this.app.network.isProductionNetwork()
        if (!this.app.network.isPrivateNetwork() ||
            this.app.network.isProductionNetwork()) {
          if (this.transactions[0].transaction.type == 1) {
            this.bundling_active = false;
            return;
          }
        }
      }

      try {

        //
        // create block
        //
        var blk = new saito.block(this.app);
        blk.block.creator = this.app.wallet.returnPublicKey();
        //
        // used elsewhere in mempool to ensure that we are
        // adding our block as the longest chain and that the
        // transactions will not be orphaned
        //
        blk.created_on_empty_mempool = 1;
        if (prevblk != null) {
          blk.block.prevhash = prevblk.returnHash();
          blk.block.vote = this.app.voter.returnPaysplitVote(prevblk.block.paysplit);
        }

        //
        // add mempool transactions
        //
        for (let i = 0; i < this.transactions.length; i++) {
          let addtx = 1;
          if (this.transactions[i].transaction.type == 1) {

            //
            // we hit this when we include a solution for a previous
            // golden ticket that is not correct. in this case we want
            // to just quit, and delete this transaction from our
            // mempool.
            //
            if (this.transactions[i].transaction.msg.target != prevblk.returnHash()) {
              this.removeGoldenTicket();
              this.bundling_active = false;
              return;
            }
          }
          if (this.transactions[i].is_valid == 0) {
            addtx = 0;
          }
          if (blk.block.vote == -1) {
            if (this.transactions[i].transaction.ps == 1) {
              addtx = 0;
           }
          }
          if (blk.block.vote == 1) {
            if (this.transactions[i].transaction.ps == -1) {
              addtx = 0;
            }
          }
          if (addtx == 1) {
            blk.transactions.push(this.transactions[i]);
          } else {
            if (this.transactions[i].is_valid == 0) {
              this.transactions.splice(i, 1);
              i--;
            }
          }
        }


        //
        // sanity check
        //
        // if the number of transactions in the block == 0 then
         // we have put together a block with NOTHING and there
        // has been some sort of error. In this case we empty
        // our entire mempool as a sanity check, and print out
        // an error message....
        //
        if (blk.transactions.length == 0 && blk.block.id > 1) {
          console.log("\nProducing a block with ZERO transactions? EMPTYING MEMPOOL in response\n");
          this.transactions = [];
          this.app.miner.stopMining();
          this.app.miner.startMining(this.app.blockchain.returnLatestBlock());
          this.bundling_active = false;
          return;
        }

        //
        // add fee-capture transaction
        //
        //
        // we use "Usable Surplus" because we expect all transactions
        // in our mempool to be either path-free (originating from us)
        // or signed and sent to us.
        //

        if (prevblk != null) {

          let total_fees_needed = this.app.burnfee.returnMovingBurnFee(prevblk, (blk.block.ts - prevblk.block.ts));
          let total_fees_available = blk.returnAvailableFees();
          let surplus_fees = Big(total_fees_available).minus(Big(total_fees_needed));

          // add fee surplus
          let tx = new saito.transaction();
          tx.transaction.ts  = new Date().getTime();
          tx.transaction.type = 2;

          // from slips
          tx.transaction.from = [];
          tx.transaction.from.push(new saito.slip(this.app.wallet.returnPublicKey(), 0.0, 2));

          // to slips
          tx.transaction.to.push(new saito.slip(this.app.wallet.returnPublicKey(), surplus_fees.toFixed(8), 2));
          tx = this.app.wallet.signTransaction(tx);
          blk.transactions.push(tx);

        }

        //
        // queue and process
        //
        await blk.bundle(prevblk);
	if (blk.is_valid == 0) {
	  console.log("Block is invalid when bundling. Aborting to prevent ghost-block...");
	  return;
	}

        //
        // propagate our block
        //
        // we have moved this into the addBlockToBlockchain function
        // to avoid needing to keep a full copy of the raw block data
        // in the block itself, as we otherwise cannot guarantee that
        // the block is saved to disk by the time another machine asks
        // to sync it.
        //
        //this.app.network.propagateBlock(blk);

        //
        // add it to mempool and process
        //
        this.addBlock(blk);

        await this.processBlocks();

      } catch(err) {
        console.log("ERROR: bundling block together: " + err);
      }

    }
  }

  // reset for next loop
  this.bundling_active = false;

}


/**
 * Attempts to process blocks and add them to blockchain
 */
Mempool.prototype.processBlocks = async function processBlocks() {

  if (this.processing_active) {
    console.log("Mempool processing.... not adding new block to blockchain");
    return;
  }

  if (this.blocks.length == 0) {
    console.log("Mempool processing.... no blocks to add to blockchain");
    this.processing_active = false;
    return;
  }

  this.processing_active = true;

  while(this.blocks.length > 0 && this.app.monitor.canBlockchainAddBlockToBlockchain()) {
    console.log("CAN ADD BLOCK TO BLOCKCHAIN")
    let block_to_add = this.blocks.shift();
    if (block_to_add.created_on_empty_mempool &&
      this.app.blockchain.returnLatestBlockHash() != block_to_add.block.prevhash) {

      //
      // check it is still getting added to the longest chain, otherwise
      // we will need to dissolve it to recapture the transactions as
      // we will not notice if this block is pushed off the longest-chain
      // by someone else
      //

      for (let i = 0; i < block_to_add.transactions.length; i++) {
        console.log("RECOVERING TRANSACTIONS FROM BADLY-TIMED BLOCK WE PRODUCED: ");
        this.app.mempool.recoverTransaction(block_to_add.transactions[i]);
        this.app.mempool.reinsertRecoveredTransactions();
      }
    } else {
      await this.app.blockchain.addBlockToBlockchain(block_to_add);
    }
  }

  this.processing_active = false;
}



/**
 * Returns the "usable value" of the transaction fees in the mempool
 * that can be used to produce a block with a given paysplit vote
 *
 * Note the submission of our own wallet publickey into the transaction
 * class' returnFeesUsable function. This is unnecessary since the default
 * behavior of the function is to examine the transaction from our own
 * perspective. When the same function is called to verify the fees for
 * a block the creator publickey should be called.
 *
 * @param {vote} paysplit vote
 * @returns {string} credits available
 */
Mempool.prototype.returnAvailableFees = function returnAvailableFees(vote=0, prevblk_hash="") {

  var v = Big(0);

  for (let i = 0; i < this.transactions.length; i++) {

    if (this.transactions[i].is_valid == 1) {

      var usable_fees = Big(this.transactions[i].returnFeesUsable(this.app, this.app.wallet.returnPublicKey()));

      // verify that the golden ticket is assigned to the right block before calculating
      if (this.transactions[i].transaction.type == 1) {
        if (this.transactions[i].transaction.msg.target != prevblk_hash) { usable_fees = Big(0); }
      }

      switch(vote) {
        case -1:
          if (this.transactions[i].transaction.ps <= 0) {
            v = v.plus(usable_fees);
          }
          break;
        case 1:
          if (this.transactions[i].transaction.ps >= 0) {
            v = v.plus(usable_fees);
          }
          break;
        default:
          v = v.plus(usable_fees);
          break;
      }
    }
  }

  return v.toFixed(8);
}




/**
 * return 1 if mempool already contains this transaction or a transaction
 * with any UTXO inputs contained in this transaction.
 *
 * @params {saito.transaction} transaction to check
 * @returns {boolean} is transaction in mempool?
 */
Mempool.prototype.containsTransaction = function containsTransaction(tx) {

  if (tx == null)                  { return 0; }
  if (tx.transaction == null)      { return 0; }
  if (tx.transaction.from == null) { return 0; }

  if (this.transactions_hmap[tx.transaction.sig] == 1) { return 1; }
  for (let i = 0; i < tx.transaction.from.length; i++) {
    var slip_index = tx.transaction.from[i].returnIndex();
    if (this.transactions_inputs_hmap[slip_index] == 1) {
      return 1;
    }
  }

  return 0;

}


/**
 *
 * return 1 if mempool already contains a Golden Ticket
 *
 * @param {saito.transaction} transaction to check
 * @returns {boolean} is transaction in mempool?
 */
Mempool.prototype.containsGoldenTicket = function containsGoldenTicket() {
  for (let m = 0; m < this.transactions.length; m++) {
    if (this.transactions[m].isGoldenTicket() == 1) { return 1; }
  }
  return 0;
}



/**
 * add transaction to mempool if provided with tx json
 *
 */
Mempool.prototype.importTransaction = function importTransaction(txjson) {
  var tx = new saito.transaction(txjson);
  if (tx == null) { return; }
  if (tx.is_valid == 0) { return; }
  tx.size = txjson.length;
  try {
    this.addTransaction(tx);
  } catch(err) {
    console.log(err)
  }
}
/**
 * add transaction to mempool if it does not already exist
 *
 */
Mempool.prototype.addTransaction = async function addTransaction(tx, relay_on_validate=0) {

  let transaction_imported = 0;

  //
  // avoid adding if there is an obvious problem
  //
  if (this.containsTransaction(tx) == 1) { console.error("ALREADY CONTAIN TRANSACTION"); return; }
  if (tx == null)                        { console.error("NULL TX"); return; }
  if (tx.transaction == null)            { console.error("NULL TRANSACTION BODY"); return; }
  if (tx.is_valid == 0)                  { console.error("INVALID TX"); return; }
  //
  // do not add if it pushes us past our limit
  //
  if ( (tx.size + this.transaction_size_current) > this.transaction_size_cap) {
    console.error("TRANSACTION SIZE TOO LARGE")
    return;
  }

  //
  // check inputs all on longest chain
  //
  for (let z = 0; z < tx.transaction.from.length; z++) {
    if (tx.transaction.from[z].bhash != "") {
      if (this.app.blockchain.isBlockHashOnLongestChain(tx.transaction.from[z].bhash) != 1) {
        console.log(JSON.stringify(tx.transaction));
        console.log("received transaction with inputs not on longest chain. rejecting");
        return;
      }
    }
  }

  //
  // only accept one golden ticket
  //
  if (tx.isGoldenTicket()) {

    //
    // ensure golden ticket is for the latest block
    //
    if (tx.transaction.msg.target != this.app.blockchain.returnLatestBlockHash()) {
      return;
    }

    for (let z = 0; z < this.transactions.length; z++) {

      if (this.transactions[z].isGoldenTicket()) {

	//
	// double-check existing slip is for the right block
	//
        if (this.transactions[z].transaction.msg.target == this.app.blockchain.returnLatestBlockHash()) {

          //
          // if we already have a golden ticket solution, we will
          // replace it with this new one if the new one pays us
          // more in fees and/or is going to pay us money.
          //
          if (
            Big(tx.returnFeesUsable(this.app, this.app.wallet.returnPublicKey())).gt(Big(this.transactions[z].returnFeesUsable(this.app, this.app.wallet.returnPublicKey()))) || (
              this.transactions[z].transaction.from[0].add != this.app.wallet.returnPublicKey() &&
              tx.transaction.from[0].add == this.app.wallet.returnPublicKey()
            )
          ) {
            this.removeGoldenTicket();
            z = this.transactions.length+1;
          } else {
            transaction_imported = 1;
          }
        } else {
          this.removeGoldenTicket();
        }
      }
    }
  }


  if (transaction_imported === 0) {

    //
    // sending NULL as the block is used when adding to the mempool
    // the transaction validation function will by default then check
    // only for a transaction that is being added to the mempool, and
    // not for a transaction getting validated as part of a specific
    // block (i.e. vote consistency, etc.)
    //
    if (tx.validate(this.app, null)) {

      //
      // the slip validation code by default is checking to see if the slip is spend <= current_block_id
      // so that it can handle chain-reorganizations, but here we only want to make sure the slip is 
      // unspent, because a block we create should not be triggering a chain reorganization. So we 
      // have this extra function. In the next version we should fold this into transaction validation.
      //
      if (!tx.validateSlipsForMempool(this.app)) { return; }

      //
      // propagate if we can't use tx to create a block
      //
      if ( Big(this.bundling_fees_needed).gt(Big(tx.returnFeesUsable(this.app, this.app.wallet.returnPublicKey()))) ) {

        //
        // add to mempool before propagating
        //
        // console.log("ADDING TO MEMPOOL", JSON.stringify(tx));
        this.transactions.push(tx);
        this.transactions_size_current += tx.size;
        this.transactions_hmap[tx.transaction.sig] = 1;
        for (let i = 0; i < tx.transaction.from.length; i++) {
          // console.log("ADDING TO HMAP: ", tx.transaction.from[i].returnIndex());
          this.transactions_inputs_hmap[tx.transaction.from[i].returnIndex()] = 1;
        }

        if (relay_on_validate == 1) {
          this.app.network.propagateTransaction(tx);
        }
        return;

      } else {

        // propagate if we are a lite-client (not block-producer)
        if (this.app.BROWSER == 1 || this.app.SPVMODE == 1) {
          if (relay_on_validate == 1) {
            this.app.network.propagateTransaction(tx);
          }
        } else {


          //
          // add to mempool before propagating
          //
          this.transactions_size_current += tx.size;
          this.transactions.push(tx);

          // console.log("ADDING TO MEMPOOL", JSON.stringify(tx));
          this.transactions_hmap[tx.transaction.sig] = 1;
          for (let i = 0; i < tx.transaction.from.length; i++) {
            // console.log("ADDING TO HMAP: ", tx.transaction.from[i].returnIndex());
            this.transactions_inputs_hmap[tx.transaction.from[i].returnIndex()] = 1;
          }

        }
      }
    } else {
      console.log("totally failed to validate tx....");
      console.log("TX: ", JSON.stringify(tx));
      tx.is_valid = 0;
    }
  }
}






/**
 * Remove the block from the mempool
 */
Mempool.prototype.removeBlock = function removeBlock(blk=null) {
  if (blk == null) { return; }
  for (let b = this.blocks.length-1; b >= 0; b--) {
    if (this.blocks[b].returnHash() == blk.returnHash()) {
      this.block_size_current -= this.blocks[b].size;
      this.blocks.splice(b, 1);
    }
  }
}


/**
 * Remove the block and all of its transactions from the mempool
 *
 * We do not use the simple version of this which calls removeTransactions as
 * that involves splicing the mempool transactions array once for each tx
 * that we want to remove.
 */
Mempool.prototype.removeBlockAndTransactions = function removeBlockAndTransactions(blk=null) {

  if (blk == null) { return; }

  this.clearing_active = true;

  // console.log("CURRENT TX IN MEMPOOL", this.transactions);

  //
  // lets make some hmaps
  //
  let mempool_transactions = [];
  let replacement          = [];

  //
  // create hashmap for mempool transactions
  //
  for (let b = 0; b < this.transactions.length; b++) {
    mempool_transactions[this.transactions[b].transaction.sig] = b;
  }

  //
  // find location of block transactions in mempool
  //
  for (let b = 0; b < blk.transactions.length; b++) {
    let location_in_mempool = mempool_transactions[blk.transactions[b].transaction.sig];
    if (location_in_mempool != undefined) {
      console.log("DEEMING TRANSACTION AS INVALID");
      this.transactions[location_in_mempool].is_valid = 0;
      this.transaction_size_current -= this.transactions[location_in_mempool].size;
    }
  }

  //
  // fill our replacement array
  //
  for (let t = 0; t < this.transactions.length; t++) {
    if (this.transactions[t].is_valid != 0) {
      console.log("TX RE-ADDED to REPLACEMENT ARRAY");
      console.log(this.transactions[t]);
      replacement.push(this.transactions[t]);
    } else {
      // console.log("TX DROPPED");
      // console.log(this.transactions[t]);
    }
  }

  this.transactions = replacement;

  //
  // and delete UTXO too
  //
  for (let b = 0; b < blk.transactions.length; b++) {
    //console.log("TX WE'RE REMOVING SLIPS FROM");
    //console.log(JSON.stringify(blk.transactions[b]));
    delete this.transactions_hmap[blk.transactions[b].transaction.sig];
    for (let i = 0; i < blk.transactions[b].transaction.from.length; i++) {
      //console.log("REMOVING: ", blk.transactions[b].transaction.from[i].returnIndex());
      //console.log(JSON.stringify(blk.transactions[b].transaction.from[i]));
      delete this.transactions_inputs_hmap[blk.transactions[b].transaction.from[i].returnIndex()];
    }
  }

  this.clearing_active = false;

  this.removeBlock(blk);

  // console.log("TX IN MEMPOOL", this.transactions.length);
  // console.log("TX INPUTS IN HMAP");
  // console.log(JSON.stringify(this.transactions_inputs_hmap));
}



/**
 * Remove the golden ticket from the mempool
 */
Mempool.prototype.removeGoldenTicket = function removeGoldenTicket() {
  for (let i = this.transactions.length-1; i >= 0; i--) {
    if (this.transactions[i].transaction.type == 1) {
      //console.log("REMOVE GOLDEN TICKET");
      //console.log(JSON.stringify(this.transactions[i]));
      this.removeTransaction(this.transactions[i]);
      return;
    }
  }
}

/**
 * Purges all expired golden tickets from the mempool
 *
 * @param {string} prevblk_hash
 */
Mempool.prototype.purgeExpiredGoldenTickets = function purgeExpiredGoldenTickets(prevblk_hash="") {
  for (let i = this.transactions.length - 1; i >= 0; i--) {
    if (this.transactions[i].transaction.type === 1) {
      if (this.transactions[i].transaction.msg.target != prevblk_hash) {
        this.removeTransaction(this.transactions[i]);
      }
    }
  }

  // Guaruntee that if we have no transactions in our mempool, then our inputs hmap is reset
  if (this.transactions.length == 0) { this.transactions_inputs_hmap = []; }
}


/**
 * remove the transaction from the mempool
 *
 * @param {saito.transaction} tx to remove
 */
Mempool.prototype.removeTransaction = function removeTransaction(tx=null) {
  if (tx == null) { return; }

  //
  // remove transactions from queue
  //
  for (let t = this.transactions.length-1; t >= 0; t--) {
    if (this.transactions[t].transaction.sig == tx.transaction.sig) {
      this.transaction_size_current -= this.transactions[t].size;


      //
      // we safeguard to make sure we are not removing blocks
      // right now. If we ARE we just mark the transaction as
      // invalid so that it will be purged the next time a block
      // is added to our blockchain.
      //
      if (this.clearing_active == true) {
        this.transactions[t].is_valid == 0;
      } else {
        this.transactions.splice(t, 1);
      }
    }
  }

  //
  // and delete their UTXO too
  //
  delete this.transactions_hmap[tx.transaction.sig];
  for (let i = 0; i < tx.transaction.from.length; i++) {
    //console.log("REMOVING: ", tx.transaction.from[i].returnIndex());
    //console.log(JSON.stringify(tx.transaction.from[i]));
    delete this.transactions_inputs_hmap[tx.transaction.from[i].returnIndex()];
  }

}



/**
 * when the chain is reorganized, any nodes that created
 * transactions on the outdated chain will look to see what
 * transactions are still valid and add them to their mempool
 * this provides some continuity over reorgs.
 *
 * @param {saito.transaction} tx
 */
Mempool.prototype.recoverTransaction = function recoverTransaction(tx) {

  if (tx == null) { return; }
  if (tx.is_valid == 0) { return; }
  if (tx.type != 0) { return; }
  if (!tx.validate(this.app)) { return; }
  console.log("RECOVERING TX");
  this.recovered.push(tx);

}


/**
 * when the chain is reorganized, any nodes that created
 * transactions on the outdated chain will look to see what
 * transactions are still valid and add them to their mempool
 * this provides some continuity over reorgs.
 */
Mempool.prototype.reinsertRecoveredTransactions = function reinsertRecoveredTransactions() {

  if (this.recovered.length == 0) { return; }

  //
  // loop through recovered, getting txs
  //
  console.log("REINSERTING INTO MEMPOOL");
  while (this.recovered.length > 0) {
    var tx2insert = this.recovered[0];
    this.recovered.splice(0, 1);
    console.log(tx2insert);
    if (tx2insert.transaction.type == 0) {
      try {
        console.log("ADDING TX BACK");
        this.addTransaction(tx2insert, 0);
      } catch(err) {
        console.log(err);
      }
    }
  }

  //
  // should already be empty
  //
  this.recovered = [];

}

// https://www.youtube.com/watch?v=2k0SmqbBIpQ
Mempool.prototype.stop = function stop() {
 clearInterval(this.bundling_timer);
}

