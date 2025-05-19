import type {WasmSlip} from "saito-wasm/pkg/node/index";
import WasmWrapper from "./wasm_wrapper";
import {DefaultEmptyPublicKey} from "./wallet";

export enum SlipType {
    Normal = 0,
    ATR = 1,
    VipInput = 2,
    VipOutput = 3,
    MinerInput = 4,
    MinerOutput = 5,
    RouterInput = 6,
    RouterOutput = 7,
    BlockStake = 8,
    Bound = 9,
}

export default class Slip extends WasmWrapper<WasmSlip> {
    // private slip: WasmSlip;
    public static Type: any;

    constructor(slip?: WasmSlip, json?: any) {
        if (!slip) {
            slip = new Slip.Type();
        }
        super(slip!);

        if (json) {
            this.publicKey = json.publicKey;
            this.type = json.type;
            this.amount = json.amount;
            this.index = json.index;
            this.blockId = json.blockId;
            this.txOrdinal = json.txOrdinal;
            this.utxoKey = json.utxoKey;
        }
    }

    public get wasmSlip(): WasmSlip {
        return this.instance;
    }

    public get type(): SlipType {
        return this.instance.slip_type as SlipType;
    }

    public set type(type: SlipType) {
        this.instance.slip_type = type as number;
    }

    public get amount(): bigint {
        return this.instance.amount;
    }

    public set amount(amount: bigint | number) {
        this.instance.amount = BigInt(amount);
    }

    public get publicKey(): string {
        if (this.instance.public_key == DefaultEmptyPublicKey) {
            return "";
        }
        return this.instance.public_key;
    }

    public set publicKey(key: string) {
        if (key === "") {
            this.instance.public_key = DefaultEmptyPublicKey;
        }
        this.instance.public_key = key;
    }

    public set index(index: number) {
        this.instance.slip_index = index;
    }

    public get index(): number {
        return this.instance.slip_index;
    }

    public set blockId(id: bigint) {
        this.instance.block_id = id;
    }

    public get blockId(): bigint {
        return this.instance.block_id;
    }

    public set txOrdinal(ordinal: bigint) {
        this.instance.tx_ordinal = ordinal;
    }

    public get txOrdinal(): bigint {
        return this.instance.tx_ordinal;
    }

    public set utxoKey(key: string) {
        this.instance.utxo_key = key;
    }

    public get utxoKey(): string {
        return this.instance.utxo_key;
    }

    public toJson(): {
        blockId: bigint;
        utxoKey: string;
        amount: bigint;
        index: number;
        publicKey: string;
        txOrdinal: bigint;
        type: any;
    } {
        return {
            publicKey: this.publicKey,
            type: this.type,
            amount: this.amount,
            index: this.index,
            blockId: this.blockId,
            txOrdinal: this.txOrdinal,
            utxoKey: this.utxoKey
        };
    }

    public clone() {
        return new Slip(undefined, this.toJson());
    }
}
