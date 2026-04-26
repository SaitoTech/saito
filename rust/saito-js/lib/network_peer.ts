import Saito from "../saito";
import { WasmNetworkPeer, WasmPeer, WasmPeerService } from "saito-wasm/pkg/node/index";
import WasmWrapper from "./wasm_wrapper";

export default class NetworkPeer extends WasmWrapper<WasmNetworkPeer> {
  public socket: any;
  private _publicKey: string = "";
  private _url: string = "";
  private readonly _peerId: bigint;

  constructor(peer: WasmNetworkPeer) {
    super(peer);
    this._peerId = peer.get_id();
  }

  static async create(url?: string): Promise<NetworkPeer> {
    const wasm = await Saito.getLibInstance();
    const u = url ?? null;
    const s = u === null || u === undefined ? "" : String(u).trim();
    console.log("[SAITO CONNECT] NetworkPeer.create → Rust create_network_peer", {
      hasUrl: s.length > 0,
      urlLength: s.length,
      url: s || "(null/undefined/empty)"
    });
    const peer = await wasm.create_network_peer(u);
    return new NetworkPeer(peer);
  }

  public get peerId(): bigint {
    return this._peerId;
  }

  public get publicKey(): string {
    return this._publicKey;
  }

  public get url(): string {
    return this._url;
  }

  public async syncFromRust(): Promise<void> {
    this._publicKey = await this.instance.get_public_key();
    this._url = await this.instance.get_url();
  }

}

