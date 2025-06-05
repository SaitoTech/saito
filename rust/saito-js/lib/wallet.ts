import type {WasmWallet} from "saito-wasm/pkg/node/index";
import {WasmWalletSlip} from "saito-wasm/pkg/node/index";
import Saito from "../saito";
import WasmWrapper from "./wasm_wrapper";
import {toBase58} from "./util";
import Transaction from "./transaction";

export const DefaultEmptyPrivateKey =
    "0000000000000000000000000000000000000000000000000000000000000000";

export const DefaultEmptyPublicKey =
    toBase58("000000000000000000000000000000000000000000000000000000000000000000");

export const DefaultEmptyBlockHash =
    "0000000000000000000000000000000000000000000000000000000000000000";

export default class Wallet extends WasmWrapper<WasmWallet> {
    public static Type: any;

    constructor(wallet: WasmWallet) {
        super(wallet);
    }

    public async save() {
        return this.instance.save();
    }

    public async load() {
        return this.instance.load();
    }

    public async reset(keepKeys: boolean) {
        return this.instance.reset(keepKeys);
    }

    public async getPublicKey() {
        let key = await this.instance.get_public_key();
        return key === DefaultEmptyPublicKey ? "" : key;
    }

    public async setPublicKey(key: string) {
        if (key === "") {
            key = DefaultEmptyPublicKey;
        }
        return this.instance.set_public_key(key);
    }

    public async getPrivateKey() {
        let key = await this.instance.get_private_key();
        return key === DefaultEmptyPrivateKey ? "" : key;
    }

    public async setPrivateKey(key: string) {
        if (key === "") {
            key = DefaultEmptyPrivateKey;
        }
        return this.instance.set_private_key(key);
    }

    public async getBalance() {
        return this.instance.get_balance();
    }

    public async getPendingTxs() {
        let txs = await this.instance.get_pending_txs();
        return txs.map((tx: any) => Saito.getInstance().factory.createTransaction(tx));
    }

    public async getSlips(): Promise<WalletSlip[]> {
        return this.instance.get_slips().then(slips => {
            return slips.map(slip => new WalletSlip(slip));
        });
    }

    public async addSlips(slips: WalletSlip[]) {
        for (const slip of slips) {
            await this.instance.add_slip(slip.instance);
        }
    }

    public async getKeyList(): Promise<string[]> {
        return this.instance.get_key_list();
    }

    public async setKeyList(keylist: string[]) {
        await this.instance.set_key_list(keylist);
    }

    public async addToPending(tx: Transaction) {
        let tx2 = tx.clone();
        await this.instance.add_to_pending(tx2.wasmTransaction);
    }

    public async addNft(
      slip1UtxoKeyHex: string,
      slip2UtxoKeyHex: string,
      slip3UtxoKeyHex: string,
      idHex: string,
      txSigHex: string,
    ): Promise<void> {
      try {

        console.log("wallet.ts addNft:");
        console.log(slip1UtxoKeyHex);
        console.log(slip2UtxoKeyHex);
        console.log(slip3UtxoKeyHex);
        console.log(idHex);
        console.log(txSigHex);

        await this.instance.add_nft(
          slip1UtxoKeyHex,
          slip2UtxoKeyHex,
          slip3UtxoKeyHex,
          idHex,
          txSigHex,
        );
      } catch (err) {
        console.error("wasm add_nft failed:", err);
        throw err;
      }
    }

}

export class WalletSlip extends WasmWrapper<WasmWalletSlip> {
    public static Type: any;

    public constructor(slip?: WasmWalletSlip) {
        if (!slip) {
            slip = new WalletSlip.Type();
        }
        super(slip!);
    }

    public toJson() {
        return {
            utxokey: this.instance.get_utxokey(),
            lc: this.instance.is_lc(),
            spent: this.instance.is_spent(),
            blockId: this.instance.get_block_id(),
            txIndex: this.instance.get_tx_ordinal(),
            slipIndex: this.instance.get_slip_index(),
            amount: this.instance.get_amount(),
            slipType: this.instance.get_slip_type(),
        };
    }

    public copyFrom(json: any) {
        this.instance.set_utxokey(json.utxokey);
        this.instance.set_lc(json.lc);
        this.instance.set_spent(json.spent);
        this.instance.set_block_id(BigInt(json.blockId));
        this.instance.set_tx_ordinal(BigInt(json.txIndex));
        this.instance.set_slip_index(json.slipIndex);
        this.instance.set_amount(BigInt(json.amount));
        this.instance.set_slip_type(json.slipType);
    }
}
