import type { WasmPeerService } from "saito-wasm/pkg/node/index";
import WasmWrapper from "./wasm_wrapper";

export default class PeerService extends WasmWrapper<WasmPeerService> {
  public static Type: any;

  constructor(data?: any, service?: string, name?: string, domain?: string) {
    if (!data) {
      data = new PeerService.Type();
      data.service = service || "";
      data.name = name || "";
      data.domain = domain || "";
    }
    super(data);
  }
}
