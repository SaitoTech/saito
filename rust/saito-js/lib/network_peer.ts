import { WasmNetworkPeer, WasmPeer, WasmPeerService } from "saito-wasm/pkg/node/index";
import WasmWrapper from "./wasm_wrapper";

export default class NetworkPeer extends WasmWrapper<WasmNetworkPeer> {
  public static Type: any;
  public socket: any;

  constructor(peer?: WasmNetworkPeer, url?: string) {
    if (!peer) {
      peer = new NetworkPeer.Type(url);
    }
    super(peer!);
  }

  public get publicKey(): string {
    return this.instance.get_public_key();
  }

  public get_handshake_challenge_buffer() {
    return this.instance.get_handshake_challenge_buffer();
  }
}
