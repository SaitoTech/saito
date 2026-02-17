"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const saito_1 = __importDefault(require("saito-js/saito"));
const blockchain_1 = __importDefault(require("saito-js/lib/blockchain"));
const transaction_1 = require("saito-js/lib/transaction");
const block_1 = require("saito-js/lib/block");
const wallet_1 = require("saito-js/lib/wallet");
class Blockchain extends blockchain_1.default {
    constructor(data) {
        super(data);
    }
    async getBlock(blockHash) {
        let block = await saito_1.default.getInstance().getBlock(blockHash);
        return block;
    }
    async resetBlockchain() {
        this.app.options.blockchain = {
            last_block_hash: wallet_1.DefaultEmptyBlockHash,
            last_block_id: 0,
            last_timestamp: 0,
            genesis_block_id: 0,
            genesis_timestamp: 0,
            lowest_acceptable_timestamp: 0,
            lowest_acceptable_block_hash: wallet_1.DefaultEmptyBlockHash,
            lowest_acceptable_block_id: 0,
            fork_id: wallet_1.DefaultEmptyBlockHash,
            confirmations: []
        };
        this.instance.reset();
        this.app.storage.saveOptions();
    }
    async saveBlockchain() {
        this.app.options.blockchain = {
            last_block_hash: await this.instance.get_last_block_hash(),
            last_block_id: Number(await this.instance.get_last_block_id()),
            last_timestamp: Number(await this.instance.get_last_timestamp()),
            genesis_block_id: Number(await this.instance.get_genesis_block_id()),
            genesis_timestamp: Number(await this.instance.get_genesis_timestamp()),
            lowest_acceptable_timestamp: Number(await this.instance.get_lowest_acceptable_timestamp()),
            lowest_acceptable_block_hash: await this.instance.get_lowest_acceptable_block_hash(),
            lowest_acceptable_block_id: Number(await this.instance.get_lowest_acceptable_block_id()),
            fork_id: await this.instance.get_fork_id(),
            confirmations: JSON.parse(await saito_1.default.getLibInstance().get_confirmations())
            // confirmations: []
        };
        this.app.storage.saveOptions();
    }
    async loadBlockAsync(hash) {
        let block = await saito_1.default.getInstance().getBlock(hash);
        if (block.block_type === block_1.BlockType.Full) {
            return block;
        }
        else if (block.block_type === block_1.BlockType.Pruned) {
            let block = await this.app.storage.loadBlockByHash(hash);
            if (!block || block.block_type === block_1.BlockType.Full) {
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
    async affixCallbacks(block) {
        console.log('%%%%%%%%%%%%%%%%%%%%%%%%%');
        console.log('%%%% AFFIX CALLBACKS %%%%');
        console.log('%%%%%%%%%%%%%%%%%%%%%%%%%');
        console.log('%%%%%%%%%%%%%%%%%%%%%%%%%');
        console.log('for: block: ' + block.id);
        console.log('into affix callbacks... 1');
        if (this.callbacks.has(block.hash)) {
            console.info('nope out of affix callbacks on block: ' + block.hash);
            return;
        }
        let callbacks = [];
        let callbackIndices = [];
        let txs = block.transactions;
        let validTxs = 0;
        for (let z = 0; z < txs.length; z++) {
            if (txs[z].type === transaction_1.TransactionType.Normal || txs[z].type === transaction_1.TransactionType.Bound) {
                let txmsg2 = txs[z].returnMessage();
                await txs[z].decryptMessage(this.app);
                const txmsg = txs[z].returnMessage();
                //
                // NFT support
                //
                // this is the easiest place to put logic that requires examination of new transactions
                // in blocks only the first time they are processed. For this reason we save the NFTs
                // here by flagging the transactions which have them and sending them to teh wallet.
                //
                if (txs[z].type == transaction_1.TransactionType.Bound) {
                    console.log('into wallet on new bound tx', txs[z].type, transaction_1.TransactionType.Bound);
                    this.app.wallet.onNewBoundTransaction(txs[z]);
                }
                this.app.modules.affixCallbacks(txs[z], z, txmsg, callbacks, callbackIndices);
                console.assert(callbacks.length === callbackIndices.length, 'callback lengths are not matching after block : ' + block.hash);
                validTxs++;
            }
        }
        console.info(`Affixed ${callbacks.length} callbacks for ${validTxs}/${txs.length} transactions`);
        this.callbacks.set(block.hash, callbacks);
        this.callbackIndices.set(block.hash, callbackIndices);
        await this.instance.set_safe_to_prune_transaction(block.id);
    }
    async onNewBlock(block, lc) {
        await this.saveBlockchain();
        this.app.modules.onNewBlock(block, lc);
    }
    async getLastBlockHash() {
        let hash = await this.instance.get_last_block_hash();
        return hash;
    }
    async onChainReorganization(block_id, block_hash, longest_chain) {
        this.app.modules.onChainReorganization(block_id, block_hash, longest_chain);
    }
}
exports.default = Blockchain;
//# sourceMappingURL=blockchain.js.map