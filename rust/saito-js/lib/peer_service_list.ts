import WasmWrapper from "./wasm_wrapper";
import type { WasmPeerServiceList } from "saito-wasm/pkg/node/index";
import PeerService from "./peer_service";

export default class PeerServiceList extends WasmWrapper<WasmPeerServiceList> {
  public static Type: any;

  constructor() {
    super(new PeerServiceList.Type());
  }

  public push(service: PeerService) {
    let s = new PeerService();
    s.instance.service = service.instance.service;
    s.instance.domain = service.instance.domain;
    s.instance.name = service.instance.name;
    this.instance.push(s.instance);
  }
}
