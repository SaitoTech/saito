import type { WasmNFT } from "saito-wasm/pkg/node/index";
import WasmWrapper from "./wasm_wrapper";

export default class Nft extends WasmWrapper<WasmNFT> {
    public static Type: any;

    constructor(nft?: WasmNFT) {
        if (!nft) {
            nft = new Nft.Type();
        }
        super(nft!);
    }

    public get id(): Uint8Array {
        return this.instance.id;
    }

    public get slip1(): Uint8Array {
        return this.instance.slip1;
    }

    public get slip2(): Uint8Array {
        return this.instance.slip2;
    }

    public get slip3(): Uint8Array {
        return this.instance.slip3;
    }

    public get tx_sig(): Uint8Array {
        return this.instance.tx_sig;
    }

    public static fromString(str: string): Nft | null {
        try {
            let nft = this.Type.from_string?.(str);
            return nft ? new Nft(nft) : null;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    // Convert NFT data to a JSON-friendly format
    public toJSON(): Record<string, string> {
        return {
            id: Buffer.from(this.id).toString("hex"),
            slip1: Buffer.from(this.slip1).toString("hex"),
            slip2: Buffer.from(this.slip2).toString("hex"),
            slip3: Buffer.from(this.slip3).toString("hex"),
            tx_sig: Buffer.from(this.tx_sig).toString("hex"),
        };
    }
}
