// Import the necessary WebAssembly functionality
import type { WasmHop } from "saito-wasm/pkg/node/index";
import WasmWrapper from "./wasm_wrapper";

export default class Hop extends WasmWrapper<WasmHop> {
    public static Type: any;

    constructor(hop?: WasmHop, json?: any) {
        if (!hop) {
            hop = new Hop.Type();
        }
        super(hop!);
    }



    public get from(): string {
        return this.instance.from;
    }



    public get to(): string {
        return this.instance.to;
    }


    public get sig(): string {
        return this.instance.sig;
    }
    public toJson(): {
        from: string;
        to: string;
        sig: string;
    } {
        return {
            from: this.from,
            to: this.to,
            sig: this.sig,

        };
    }
}
