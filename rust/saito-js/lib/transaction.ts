import type {WasmTransaction} from "saito-wasm/pkg/node/index";
import Slip from "./slip";
import Saito from "../saito";
import WasmWrapper from "./wasm_wrapper";
import Hop from "./hop";

export enum TransactionType {
    Normal = 0,
    Fee = 1,
    GoldenTicket = 2,
    ATR = 3,
    Vip = 4,
    SPV = 5,
    Issuance = 6,
    BlockStake = 7,
    Bound = 8,
}

export default class Transaction extends WasmWrapper<WasmTransaction> {
    public static Type: any;
    public msg: any = {};

    // TODO : factory pattern might be useful here to remove unnecessary wrappings
    constructor(tx?: WasmTransaction, json?: any) {
        super(tx || new Transaction.Type());
        if (json) {
            for (let slip of json.to) {
                let s = new Slip(undefined, slip);
                this.addToSlip(s);
            }
            for (let slip of json.from) {
                let s = new Slip(undefined, slip);
                this.addFromSlip(s);
            }
            this.timestamp = json.timestamp;
            this.type = json.type;
            this.signature = json.signature;
            this.data = new Uint8Array(Buffer.from(json.buffer, "base64"));
            this.txs_replacements = json.txs_replacements;
        }
    }

    public get wasmTransaction(): WasmTransaction {
        return this.instance;
    }

    public addFromSlip(slip: Slip) {
        this.instance.add_from_slip(slip.wasmSlip);
    }

    public addToSlip(slip: Slip) {
        this.instance.add_to_slip(slip.wasmSlip);
    }

    public get to(): Array<Slip> {
        return this.instance.to.map((slip) => {
            return Saito.getInstance().factory.createSlip(slip);
        });
    }

    public get from(): Array<Slip> {
        return this.instance.from.map((slip) => {
            return Saito.getInstance().factory.createSlip(slip);
        });
    }

    public get routing_path(): Array<Hop> {
        return this.instance.routing_path.map(path => {
            return Saito.getInstance().factory.createRoutingPath(path)
        })
    }


    public get type(): TransactionType {
        return this.instance.type as TransactionType;
    }

    public set type(type: TransactionType) {
        this.instance.type = type as number;
    }

    public get timestamp(): number {
        return Number(this.instance.timestamp);
    }

    public set timestamp(timestamp: bigint | number) {
        this.instance.timestamp = BigInt(timestamp);
    }

    public set signature(sig: string) {
        this.instance.signature = sig;
    }

    public get signature(): string {
        return this.instance.signature;
    }

    public set data(buffer: Uint8Array) {
        this.instance.data = buffer;
    }

    public get data(): Uint8Array {
        return this.instance.data;
    }

    public set txs_replacements(r: number) {
        this.instance.txs_replacements = r;
    }

    public get txs_replacements(): number {
        return this.instance.txs_replacements;
    }

    public get total_fees(): bigint {
        return this.instance.total_fees;
    }

    public async sign() {
        this.packData();
        return this.instance.sign();
    }

    public isFrom(key: string): boolean {
        return this.instance.is_from(key);
    }

    public isTo(key: string): boolean {
        return this.instance.is_to(key);
    }

    public toJson() {
        this.packData();
        return {
            to: this.to.map((slip) => slip.toJson()),
            from: this.from.map((slip) => slip.toJson()),
            type: this.type,
            timestamp: this.timestamp,
            signature: this.signature,
            buffer: Buffer.from(this.data).toString("base64"),
            txs_replacements: this.txs_replacements,
            total_fees: this.total_fees,
            routing_path: this.routing_path.map(path => path.toJson())
        };
    }

    public deserialize(buffer: Uint8Array) {
        try {
            this.instance = Transaction.Type.deserialize(buffer);
            this.unpackData();
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    public serialize(): Uint8Array {
        return this.instance.serialize();
    }

    public packData() {
        if (Object.keys(this.msg).length === 0) {
            this.data = new Uint8Array(Buffer.alloc(0));
        } else {
            this.data = new Uint8Array(Buffer.from(JSON.stringify(this.msg), "utf-8"));
        }
        // console.log("msg = ", this.msg);
        // console.log("tx packed to buffer with length : " + this.data.byteLength, this.data);
    }

    public unpackData() {
        if (this.data.byteLength === 0 || this.type !== TransactionType.Normal) {
            this.msg = {};
        } else {
            try {
                this.msg = JSON.parse(Buffer.from(this.data).toString("utf-8"));
            } catch (error) {
                // console.log("tx type = " + this.type);
                // console.log("buffer : " + this.data.byteLength, this.data);
                // console.log("failed parsing tx buffer into msg", Buffer.from(this.data).toString("utf-8"));
                // console.error(error);
                this.msg = {};
            }
        }
    }

    public clone() {
        let tx = new Transaction(undefined, this.toJson());
        tx.unpackData();
        return tx;
    }
}
