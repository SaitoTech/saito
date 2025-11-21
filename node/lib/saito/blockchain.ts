import Saito from 'saito-js/saito';
import SaitoBlockchain from 'saito-js/lib/blockchain';
import Block from './block';
import { Saito as S } from '../../apps/core';
import { TransactionType } from 'saito-js/lib/transaction';
import Transaction from './transaction';
import { BlockType } from 'saito-js/lib/block';
import { DefaultEmptyBlockHash } from 'saito-js/lib/wallet';

export default class Blockchain extends SaitoBlockchain {
  public app: S;

  constructor(data) {
    super(data);
  }

  public async getBlock(blockHash: string): Promise<Block> {
    let block = await Saito.getInstance().getBlock(blockHash);

    return block as unknown as Block;
  }

  async resetBlockchain() {
    this.instance.reset();
    await this.saveBlockchain();
  }

  async saveBlockchain() {
    this.app.storage.saveOptions();
  }

  async loadBlockAsync(hash: string): Promise<Block | null> {
    let block: Block = await Saito.getInstance().getBlock(hash);
    if (block.block_type === BlockType.Full) {
      return block;
    } else if (block.block_type === BlockType.Pruned) {
      let block = await this.app.storage.loadBlockByHash(hash);
      if (!block || block.block_type === BlockType.Full) {
        return block;
      }
    }
    return null;
  }

  async initialize() {
    this.app.connection.on('add-block-success', async ({ blockId, hash }) => {
      // console.log("before onAddBlockSuccess...");
      // await this.onAddBlockSuccess(blockId, hash);
      // console.log("after onAddBlockSuccess...");
    });
    // this.app.connection.on('on-chain-reorg',async ()=>{
    //   await this.onChainReorganization(block_id, block_hash, lc, pos);
    // });
  }

  public async affixCallbacks(block: Block) {
    console.log('%%%%%%%%%%%%%%%%%%%%%%%%%');
    console.log('%%%% AFFIX CALLBACKS %%%%');
    console.log('%%%%%%%%%%%%%%%%%%%%%%%%%');
    console.log('%%%%%%%%%%%%%%%%%%%%%%%%%');
    console.log('for: block: ' + block.id);
    console.log('into affix callbacks... 1');

    if (this.callbacks.has(block.hash)) {
      console.info('nope out of affixing callbacks on block: ' + block.hash);
      return;
    }

    console.log('into affix callbacks... 2');

    let callbacks = [];
    let callbackIndices = [];

    console.log('affixing callbacks to block...');

    let txs: Transaction[] = block.transactions as Transaction[];

    let validTxs = 0;
    for (let z = 0; z < txs.length; z++) {
      if (txs[z].type === TransactionType.Normal || txs[z].type === TransactionType.Bound) {
        let txmsg2 = txs[z].returnMessage();

        const str_txmsg2 = JSON.stringify(txmsg2);
        const ellipsis = '\n...\n';
        const prefixLength = 500;
        const suffixLength = 500;
        const maxStrLength = prefixLength + ellipsis.length + suffixLength;

        await txs[z].decryptMessage(this.app);
        const txmsg = txs[z].returnMessage();

        //
        // NFT support
        //
        // this is the easiest place to put logic that requires examination of new transactions
        // in blocks only the first time they are processed. For this reason we save the NFTs
        // here by flagging the transactions which have them and sending them to teh wallet.
        //
        if (txs[z].type == TransactionType.Bound) {
          this.app.wallet.onNewBoundTransaction(txs[z]);
        }

        this.app.modules.affixCallbacks(txs[z], z, txmsg, callbacks, callbackIndices);

        console.assert(
          callbacks.length === callbackIndices.length,
          'callback lengths are not matching after block : ' + block.hash
        );
        validTxs++;
      }
    }

    console.info(
      `Affixed ${callbacks.length} callbacks for ${validTxs}/${txs.length} transactions`
    );
    this.callbacks.set(block.hash, callbacks);
    this.callbackIndices.set(block.hash, callbackIndices);

    await this.instance.set_safe_to_prune_transaction(block.id);
  }

  public async onNewBlock(block: Block, lc: boolean) {
    await this.saveBlockchain();
    this.app.modules.onNewBlock(block, lc);
  }

  public async getLastBlockHash() {
    let hash = await this.instance.get_last_block_hash();
    return hash;
  }
  async onChainReorganization(block_id: bigint, block_hash: string, longest_chain: boolean) {
    this.app.modules.onChainReorganization(block_id, block_hash, longest_chain);
  }
}
