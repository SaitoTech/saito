import Saito, { LogLevel } from "./saito";
import SharedMethods from "./shared_methods";
import Transaction from "./lib/transaction";
import Slip from "./lib/slip";
import Block from "./lib/block";
import Peer from "./lib/peer";
import Factory from "./lib/factory";
import Wallet, { WalletSlip } from "./lib/wallet";
import Blockchain from "./lib/blockchain";
import PeerService from "./lib/peer_service";
import PeerServiceList from "./lib/peer_service_list";
import BalanceSnapshot from "./lib/balance_snapshot";

// import Config from "./lib/config";

/**
 *
 * @param configs
 * @param sharedMethods
 * @param factory
 * @param privateKey
 * @param logLevel
 */
export async function initialize(
  configs: any,
  sharedMethods: SharedMethods,
  factory: Factory,
  privateKey: string,
  logLevel: LogLevel = LogLevel.Info,
  haste_multiplier: bigint,
  delete_old_blocks: boolean
) {
  if (Saito.getLibInstance()) {
    console.error("saito already initialized");
    return;
  }
  console.log("initializing saito-js");

  return import("saito-wasm/pkg/web")
    .then((s: any) => {
      return s.default().then(() => {
        return s;
      });
    })
    .then((s) => {
      Saito.setLibInstance(s);

      Transaction.Type = s.WasmTransaction;
      Slip.Type = s.WasmSlip;
      Block.Type = s.WasmBlock;
      Peer.Type = s.WasmPeer;
      Wallet.Type = s.WasmWallet;
      Blockchain.Type = s.WasmBlockchain;
      PeerService.Type = s.WasmPeerService;
      PeerServiceList.Type = s.WasmPeerServiceList;
      BalanceSnapshot.Type = s.WasmBalanceSnapshot;
      WalletSlip.Type = s.WasmWalletSlip;
      // Config.Type = s.WasmConfiguration;

      console.log("init output = ", s);
      Saito.setWasmMemory(s.memory);

      return Saito.initialize(
        configs,
        sharedMethods,
        factory,
        privateKey,
        logLevel,
        haste_multiplier,
        delete_old_blocks
      );
    });
}

export default Saito;
