import type { WasmNFT, WasmSlip } from "saito-wasm/pkg/node/index";
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

  // ← change these three to return WasmSlip
  public get slip1(): WasmSlip {
    return (this.instance as any).slip1;
  }
  public get slip2(): WasmSlip {
    return (this.instance as any).slip2;
  }
  public get slip3(): WasmSlip {
    return (this.instance as any).slip3;
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

  // now we can drill into each slip’s fields in toJSON:
  public toJSON(): Record<string, any> {
    const sl1 = this.slip1;
    const sl2 = this.slip2;
    const sl3 = this.slip3;

    console.log("this.slip1", this.slip1);

    return {
      id: Buffer.from(this.id).toString("hex"),
      tx_sig: Buffer.from(this.tx_sig).toString("hex"),
      slip1: {
        amount: sl1.amount,
        slip_type: sl1.slip_type,
        public_key: sl1.public_key,
        block_id: sl1.block_id,
        tx_ordinal: sl1.tx_ordinal,
        slip_index: sl1.slip_index,
        utxo_key: sl1.utxo_key,
      },
      slip2: {
        amount: sl2.amount,
        slip_type: sl2.slip_type,
        public_key: sl2.public_key,
        block_id: sl2.block_id,
        tx_ordinal: sl2.tx_ordinal,
        slip_index: sl2.slip_index,
        utxo_key: sl2.utxo_key,
      },
      slip3: {
        amount: sl3.amount,
        slip_type: sl3.slip_type,
        public_key: sl3.public_key,
        block_id: sl3.block_id,
        tx_ordinal: sl3.tx_ordinal,
        slip_index: sl3.slip_index,
        utxo_key: sl3.utxo_key,
      },
    };
  }
}
