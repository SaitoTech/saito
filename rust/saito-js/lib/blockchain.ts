import type { WasmBlockchain } from "saito-wasm/pkg/node/index";
import WasmWrapper from "./wasm_wrapper";
import Saito from "../saito";
import Block, { BlockType } from "./block";
import Transaction from "./transaction";
import { DefaultEmptyBlockHash } from "./wallet";

export default class Blockchain extends WasmWrapper<WasmBlockchain> {
  public static Type: any;
  public callbacks = new Map<string, Array<(_1: Block, _2: Transaction, _3: bigint) => {}>>();
  public callbackIndices = new Map<string, Array<number>>();
  public last_callback_block_id: number = 0;
  callback_limit: number = 2;
  prune_after_blocks: number = 6;

  constructor(blockchain: WasmBlockchain) {
    super(blockchain);
    blockchain
      .register_callback(
        this.onChainReorganization.bind(this),
        this.onAddBlockSuccess.bind(this),
        this.onConfirmation.bind(this)
      )
      .then(() => {});
  }

  public async reset() {
    return this.instance.reset();
  }

  public async affixCallbacks(block: Block) {}

  public async runCallbacks(block_hash: string, confirmations: bigint) {
    if (block_hash === DefaultEmptyBlockHash) {
      return;
    }
    try {
      let block;
      {
        let blk = await Saito.getInstance().getBlock(block_hash);
        if (!blk) {
          console.warn("block : " + block_hash + " not found to run callbacks");
          return;
        }
        block = blk!;
      }
      let callbacks = this.callbacks.get(block_hash);
      let callbackIndices = this.callbackIndices.get(block_hash);
      // console.debug(
      //   `running callbacks for ${block_hash}. callbacks : ${callbacks?.length} indexes : ${callbackIndices?.length} confirmations : ${confirmations} from_blocks_back : ${from_blocks_back}`
      // );
      if (callbacks && callbackIndices) {
        let txs = block.transactions;
        for (let j = 0; j < callbacks.length; j++) {
          try {
            if (
              callbacks[j] !== undefined &&
              callbackIndices[j] !== undefined &&
              txs !== undefined
            ) {
              // console.log(`run callback : ${j} for block : ${block.hash} with id : ${block.id} with confirmation : ${i} `);
              if (txs[callbackIndices[j]]) {
                await callbacks[j](block, txs[callbackIndices[j]], confirmations);
              } else {
                console.warn(
                  `transaction is undefined for index : ${j} in block : ${block.hash} with id ${block.id}`
                );
              }
            } else {
              console.log(
                `callback ${j} is ${!!callbacks[j]} callbackIndices is ${!!callbackIndices[j]}`
              );
            }
          } catch (error) {
            console.error(error);
            console.error("callback index : " + callbackIndices[j]);
            console.error("block type : " + block.block_type);
            console.error("block id : " + block.id);
            console.error("block hash : " + block.hash);
            // console.error("tx causing error", txs?[callbackIndices[j]]?.msg);
          }
        }
      } else {
        // console.log(`confirmations : ${confirmations}`);
      }
    } catch (error) {
      console.error(error);
    }
  }

  public async onAddBlockSuccess(block_id: bigint, hash: string) {
    console.debug("onAddBlockSuccess : " + hash + " at id : " + block_id);
    // TODO : there's currently no way of calling this method from saito-js itself. need to refactor the design related to onConfirmation() calls so a single place will handle all the callback functionality

    try {
      let block;
      {
        let blk = await Saito.getInstance().getBlock(hash);
        if (!blk) {
          console.warn("block " + hash + " at id : " + block_id + " not found for addBlockSuccess");
          return;
        }
        block = blk!;
      }
      // this block is initialized with zero-confs processed
      // console.log(`affix callbacks : ${block.id} with hash : ${block.hash}`);
      await this.affixCallbacks(block);

      // don't run callbacks if reloading (force!)
      //
      if (block.instance.in_longest_chain && !block.instance.force_loaded) {
        // let block_id_to_run_callbacks_from = block.id - BigInt(this.callback_limit + 1);
        let block_id_in_which_to_delete_callbacks = block.id - BigInt(this.prune_after_blocks);
        // if (block_id_to_run_callbacks_from <= BigInt(0)) {
        //   block_id_to_run_callbacks_from = BigInt(1);
        // }
        // if (block_id_to_run_callbacks_from <= block_id_in_which_to_delete_callbacks) {
        //   block_id_to_run_callbacks_from = block_id_to_run_callbacks_from + BigInt(1);
        // }

        // console.log("block_id_to_run_callbacks_from = " + block_id_to_run_callbacks_from);
        // console.log(
        //   "block_id_in_which_to_delete_callbacks = " + block_id_in_which_to_delete_callbacks
        // );
        // console.log("block.id = " + block.id);
        // if (block_id_to_run_callbacks_from > BigInt(0)) {
        //   for (let i = block_id_to_run_callbacks_from; i <= block.id; i += BigInt(1)) {
        //     // for (let i = block_id_to_run_callbacks_from; Number(i) <= Number(block.id); i++) {
        //     let confirmation_count = block.id - BigInt(i) + BigInt(1);
        //     let run_callbacks = true;
        //     // if bid is less than our last-bid, but it is still
        //     // the biggest BID we have, then we should avoid
        //     // running callbacks as we will have already run
        //     // them. We check TS as sanity check as well.
        //     if (block.id < (await this.instance.get_last_block_id())) {
        //       if (block.instance.timestamp < (await this.instance.get_last_timestamp())) {
        //         if (block.instance.in_longest_chain) {
        //           run_callbacks = false;
        //         }
        //       }
        //     }
        //
        //     // console.log(`i = ${i} confirmations = ${confirmation_count}`);
        //     if (run_callbacks) {
        //       let callback_block_hash = await this.instance.get_longest_chain_hash_at(i);
        //       if (callback_block_hash !== "" && callback_block_hash !== DefaultEmptyBlockHash) {
        //         await this.runCallbacks(callback_block_hash, confirmation_count);
        //       }
        //     }
        //   }
        // }

        //
        // delete callbacks as appropriate to save memory
        //
        if (block_id_in_which_to_delete_callbacks >= 0) {
          let callback_block_hash = await this.instance.get_longest_chain_hash_at(
            block_id_in_which_to_delete_callbacks + BigInt(1) // because block ring starts from 1
          );
          // console.debug(
          //   `deleting callbacks for ${block_id_in_which_to_delete_callbacks + BigInt(1)
          //   }: ${callback_block_hash}`
          // );
          this.callbacks.delete(callback_block_hash);
          this.callbackIndices.delete(callback_block_hash);
          // this.confirmations.delete(callback_block_hash);
        }
      }

      // console.debug("moving into onNewBlock : " + block.hash + " -- id : " + block.id);

      await this.onNewBlock(block, block.instance.in_longest_chain);
    } catch (error) {
      console.error("failed running callbacks");
      console.error(error);
    }
    console.debug(`onAddBlockSuccess : ${hash} complete`);
  }

  public async onChainReorganization(
    block_id: bigint,
    block_hash: string,
    longest_chain: boolean
  ) {}

  public async onConfirmation(block_id: bigint, block_hash: string, confirmations: bigint) {
    let block;
    {
      let blk = await Saito.getInstance().getBlock(block_hash);
      if (!blk) {
        console.warn(
          "block " + block_hash + " at id : " + block_id + " not found for onConfirmation"
        );
        return;
      }
      if (blk.block_type === BlockType.Pruned) {
        console.warn(
          "block " +
            block_hash +
            " at id : " +
            block_id +
            " is pruned. need transactions to call onConfirmation"
        );
        return;
      }
      block = blk!;
    }
    // need to affix callbacks here also because callbacks might be removed for older blocks at this point.
    await this.affixCallbacks(block);
    await this.runCallbacks(block_hash, confirmations);
  }

  public async onNewBlock(block: Block, lc: boolean) {}

  public async getLatestBlockId() {
    return this.instance.get_latest_block_id();
  }

  public async getLongestChainHashAtId(blockId: bigint) {
    return this.instance.get_longest_chain_hash_at_id(blockId);
  }

  public async getHashesAtId(blockId: bigint) {
    return this.instance.get_hashes_at_id(blockId);
  }

  public async getForkId() {
    return this.instance.get_fork_id();
  }

  public async setForkId(forkId: string) {
    return this.instance.set_fork_id(forkId);
  }

  public async setSafeToPruneTransaction(blockId: bigint) {
    return this.instance.set_safe_to_prune_transaction(blockId);
  }
}
