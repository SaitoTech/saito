const ModTemplate = require('../../lib/templates/modtemplate');
const JSON = require('json-bigint'); // Add require for json-bigint

class Memento extends ModTemplate {
  constructor(app) {
    super(app);
    this.app = app;
    this.name = 'Memento';
    this.slug = 'memento';
    this.description =
      'Saito "Way Back Machine" to process and store block, transaction, and UTXO information';
    this.categories = 'Utilities Information';

    return this;
  }

  async initialize(app) {
    await super.initialize(app);
  }

  onNewBlock(blk, lc) {
    // It's good practice to call super if ModTemplate might have base logic
    super.onNewBlock(blk, lc);

    if (blk?.id) {
      try {
        var block = JSON.parse(blk.toJson());
        var transblock = [];
        blk.transactions.forEach((transaction) => {
          let tx = transaction.toJson();
          /////////////////////////////////////
          // toJson() deletes some fields...
          ////////////////////////////////////
          tx.msg = transaction.returnMessage();
          tx.work_available_to_me = transaction.work_available_to_me;
          tx.work_available_to_creator = transaction.work_available_to_creator;
          tx.work_cumulative = transaction.work_cumulative;
          transblock.push(tx);
        });
        block.transactions = transblock;
        this.addBlockToDatabase(block, lc);
      } catch (error) {
        console.log(error);
      }
    }
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx == null) {
      return 0;
    }
    let message = tx.returnMessage();

    if (message.request == 'memento') {
      let results = await this.fetchDataForPeer(message.data);

      if (mycallback) {
        return mycallback(results);
      }
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  //async onConfirmation(blk, tx, conf) {}

  async addBlockToDatabase(blk, lc) {
    try {
      console.info(Date() + '[ INFO | memento ] - block added : ' + blk.hash);
      // Insert block data
      let blockSql = `INSERT OR IGNORE INTO blocks (
                                id,
                                timestamp,
                                type,
                                hash,
                                previous_block_hash,
                                creator,
                                merkle_root,
                                signature,
                                graveyard,
                                treasury,
                                total_fees,
                                total_fees_new,
                                total_fees_atr,
                                total_fees_cumulative,
                                avg_total_fees,
                                avg_total_fees_new,
                                avg_total_fees_atr,
                                total_payout_routing,
                                total_payout_mining,
                                total_payout_treasury,
                                total_payout_graveyard,
                                total_payout_atr,
                                avg_payout_routing,
                                avg_payout_mining,
                                avg_payout_treasury,
                                avg_payout_graveyard,
                                avg_payout_atr,
                                avg_fee_per_byte,
                                fee_per_byte,
                                avg_nolan_rebroadcast_per_block,
                                burnfee,
                                difficulty,
                                previous_block_unpaid,
                                lc
                            )
                             VALUES (
                                $id,
                                $timestamp,
                                $type,
                                $hash,
                                $previous_block_hash,
                                $creator,
                                $merkle_root,
                                $signature,
                                $graveyard,
                                $treasury,
                                $total_fees,
                                $total_fees_new,
                                $total_fees_atr,
                                $total_fees_cumulative,
                                $avg_total_fees,
                                $avg_total_fees_new,
                                $avg_total_fees_atr,
                                $total_payout_routing,
                                $total_payout_mining,
                                $total_payout_treasury,
                                $total_payout_graveyard,
                                $total_payout_atr,
                                $avg_payout_routing,
                                $avg_payout_mining,
                                $avg_payout_treasury,
                                $avg_payout_graveyard,
                                $avg_payout_atr,
                                $avg_fee_per_byte,
                                $fee_per_byte,
                                $avg_nolan_rebroadcast_per_block,
                                $burnfee,
                                $difficulty,
                                $previous_block_unpaid,
                                $lc
                            )`;
      let blockParams = {
        $id: blk.id,
        $timestamp: blk.timestamp,
        $type: blk.type.toString(),
        $hash: blk.hash,
        $previous_block_hash: blk.previous_block_hash,
        $creator: blk.creator,
        $graveyard: blk.graveyard,
        $treasury: blk.treasury,
        $lc: lc,
        /**** None of these appear to be defined ******/
        $merkle_root: blk.merkle_root,
        $signature: blk.signature,
        $total_fees: blk.total_fees,
        $total_fees_new: blk.total_fees_new,
        $total_fees_atr: blk.total_fees_atr,
        $total_fees_cumulative: blk.total_fees_cumulative,
        $avg_total_fees: blk.avg_total_fees,
        $avg_total_fees_new: blk.avg_total_fees_new,
        $avg_total_fees_atr: blk.avg_total_fees_atr,
        $total_payout_routing: blk.total_payout_routing,
        $total_payout_mining: blk.total_payout_mining,
        $total_payout_treasury: blk.total_payout_treasury,
        $total_payout_graveyard: blk.total_payout_graveyard,
        $total_payout_atr: blk.total_payout_atr,
        $avg_payout_routing: blk.avg_payout_routing,
        $avg_payout_mining: blk.avg_payout_mining,
        $avg_payout_treasury: blk.avg_payout_treasury,
        $avg_payout_graveyard: blk.avg_payout_graveyard,
        $avg_payout_atr: blk.avg_payout_atr,
        $avg_fee_per_byte: blk.avg_fee_per_byte,
        $fee_per_byte: blk.fee_per_byte,
        $avg_nolan_rebroadcast_per_block: blk.avg_nolan_rebroadcast_per_block,
        $burnfee: blk.burnfee,
        $difficulty: blk.difficulty,
        $previous_block_unpaid: blk.previous_block_unpaid
        /***************************/
      };

      await this.app.storage.runDatabase(blockSql, blockParams, 'memento');

      ///////////////////////////////
      // Insert transaction data
      ///////////////////////////////
      blk.transactions.forEach(async (transaction) => {
        //console.log('Adding block ', transaction);
        let total_in = BigInt(0); // from
        let total_out = BigInt(0); // to

        let ledger = null;
        if (transaction.from.length == 1) {
          ledger = {};
        }

        /////////////////////////////////
        // Insert from slip data
        /////////////////////////////////
        transaction.from.forEach(async (fromSlip) => {
          total_in += fromSlip.amount;

          let fromSql = `INSERT OR IGNORE INTO froms (
                                  utxo_key,
                                  tx_sig,
                                  public_key,
                                  amount,
                                  slip_type,
                                  slip_index,
                                  block_id,
                                  tx_ordinal,
                                  lc
                              )
                               VALUES (
                                  $utxo_key,
                                  $tx_sig,
                                  $public_key,
                                  $amount,
                                  $slip_type,
                                  $slip_index,
                                  $block_id,
                                  $tx_ordinal,
                                  $lc
                              )`;
          let fromParams = {
            $utxo_key: fromSlip.utxoKey || '',
            $tx_sig: transaction.signature,
            $public_key: fromSlip.public_key || fromSlip.publicKey,
            $amount: Number(fromSlip.amount),
            $slip_type: fromSlip.slip_type || fromSlip.type,
            $slip_index: fromSlip.slip_index || fromSlip.index,
            $block_id: blk.id,
            $tx_ordinal: Number(fromSlip.tx_ordinal || fromSlip.txOrdinal),
            $lc: lc
          };

          if (ledger) {
            ledger.tos = new Array();
            ledger.from_key = fromSlip.publicKey;
            ledger.total = Number(fromSlip.amount);
            ledger.change = 0;
          }

          await this.app.storage.runDatabase(fromSql, fromParams, 'memento');
        });

        /////////////////////////////////
        // Insert to slip data
        //////////////////////////////////
        transaction.to.forEach(async (toSlip) => {
          total_out += toSlip.amount;

          let toSql = `INSERT OR IGNORE INTO tos (
                                  utxo_key,
                                  tx_sig,
                                  public_key,
                                  amount,
                                  slip_type,
                                  slip_index,
                                  block_id,
                                  tx_ordinal,
                                  lc
                              )
                               VALUES (
                                  $utxo_key,
                                  $tx_sig,
                                  $public_key,
                                  $amount,
                                  $slip_type,
                                  $slip_index,
                                  $block_id,
                                  $tx_ordinal,
                                  $lc
                              )`;
          let toParams = {
            $utxo_key: toSlip.utxoKey || '',
            $tx_sig: transaction.signature,
            $public_key: toSlip.public_key || toSlip.publicKey,
            $amount: Number(toSlip.amount),
            $slip_type: toSlip.slip_type || toSlip.type,
            $slip_index: toSlip.slip_index || toSlip.index,
            $block_id: blk.id,
            $tx_ordinal: Number(toSlip.tx_ordinal || toSlip.txOrdinal),
            $lc: lc
          };

          if (ledger) {
            if (toSlip.publicKey == ledger.from_key) {
              ledger.change += Number(toSlip.amount);
            } else {
              ledger.tos.push({ publicKey: toSlip.publicKey, amount: Number(toSlip.amount) });
            }
          }

          await this.app.storage.runDatabase(toSql, toParams, 'memento');
        });

        let txSql = `INSERT OR IGNORE INTO txs (
                                signature,
                                block_id,
                                timestamp,
                                transaction_type,
                                total_in,
                                total_out,
                                total_fees,
                                work_available_to_creator,
                                work_available_to_me,
                                work_cumulative,
                                txs_replacements,
                                lc
                            )
                             VALUES (
                                $signature,
                                $block_id,
                                $timestamp,
                                $transaction_type,
                                $total_in,
                                $total_out,
                                $total_fees,
                                $work_available_to_creator,
                                $work_available_to_me,
                                $work_cumulative,
                                $txs_replacements,
                                $lc
                            )`;
        let txParams = {
          $signature: transaction.signature,
          $block_id: blk.id,
          $timestamp: transaction.timestamp,
          $transaction_type: transaction.type,
          $total_in: Number(total_in),
          $total_out: Number(total_out),
          $total_fees: Number(transaction.total_fees),
          $work_available_to_creator: Number(transaction.work_available_to_creator),
          $work_available_to_me: Number(transaction.work_available_to_me),
          $work_cumulative: Number(transaction.work_cumulative),
          $txs_replacements: transaction.txs_replacements,
          $lc: lc
        };

        if (ledger) {
          ledger.fees = Number(transaction.total_fees);
          ledger.timestamp = transaction.timestamp;
          ledger.tx_sig = transaction.signature;
        }
        await this.app.storage.runDatabase(txSql, txParams, 'memento');

        if (ledger?.tos?.length > 0) {
          for (let payee of ledger.tos) {
            let ledgerSql = `INSERT OR IGNORE INTO ledger (
                                    block_id,
                                    tx_sig,
                                    timestamp,
                                    from_key,
                                    to_key,
                                    amount 
                                    )
                                    VALUES (
                                    $block_id,
                                    $tx_sig,
                                    $timestamp,
                                    $from_key,
                                    $to_key,
                                    $amount 
                                    )`;
            let ledgerParams = {
              $block_id: blk.id,
              $tx_sig: ledger.tx_sig,
              $timestamp: ledger.timestamp,
              $from_key: ledger.from_key,
              $to_key: payee.publicKey,
              $amount: payee.amount
            };

            if (payee.amount > 0) {
              await this.app.storage.runDatabase(ledgerSql, ledgerParams, 'memento');
            }
          }
        }
      });

      return;
    } catch (err) {
      console.error(
        '[ ERROR | MEMENTO ] *** ERROR ***\n' + err + '\n[ MEMENTO ] *** END OF ERROR ***'
      );
    }
  }

  /****
   * Search params
   *
   * publicKey:
   * offset: minimum ts
   *
   */
  async fetchDataForPeer(params) {
    let sql =
      'SELECT * FROM ledger WHERE timestamp > $timestamp AND (from_key = $from_key OR to_key = $to_key) ORDER BY timestamp ASC';
    let sql_params = {
      $timestamp: params.offset || 0,
      $from_key: params.publicKey,
      $to_key: params.publicKey
    };

    try {
      let sqlResults = await this.app.storage.queryDatabase(sql, sql_params, 'memento');
      return sqlResults;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  shouldAffixCallbackToModule() {
    return 1;
  }
}

module.exports = Memento;
