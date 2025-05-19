import type { WasmPeer, WasmPeerService } from "saito-wasm/pkg/node/index";
import WasmWrapper from "./wasm_wrapper";

export default class Peer extends WasmWrapper<WasmPeer> {
    public static Type: any;

    constructor(peer?: WasmPeer, peerIndex?: bigint) {
        if (!peer) {
            peer = new Peer.Type(peerIndex);
        }
        super(peer!);
    }

    public get publicKey(): string {
        return this.instance.public_key;
    }

    // public set publicKey(key: string) {
    //     this.peer.public_key = key;
    // }

    public get keyList(): Array<string> {
        return this.instance.key_list;
    }

    public get peerIndex(): bigint {
        return this.instance.peer_index;
    }

    public get synctype(): string {
        return this.instance.sync_type;
    }

    public get services(): WasmPeerService[] {
        return this.instance.services;
    }

    public set services(s: WasmPeerService[]) {
        this.instance.services = s;
    }

    public hasService(service: string): boolean {
        return this.instance.has_service(service);
    }
    public get status(): string {
        return this.instance.status;
    }
}