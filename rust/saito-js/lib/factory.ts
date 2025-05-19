import Block from "./block";
import Transaction from "./transaction";
import Slip from "./slip";
import Peer from "./peer";
import Wallet from "./wallet";
import Blockchain from "./blockchain";
import Hop from "./hop";

export default class Factory {
  constructor() { }

  public createBlock(data?: any): Block {
    return new Block(data);
  }

  public createTransaction<T extends Transaction>(data?: any): Transaction {
    return new Transaction(data);
  }

  public createSlip(data?: any): Slip {
    return new Slip(data);
  }

  public createPeer(data?: any): Peer {
    return new Peer(data);
  }

  public createRoutingPath(data?: any): Hop {
    return new Hop(data);
  }

  public createWallet(data: any): Wallet {
    return new Wallet(data);
  }

  public createBlockchain(data: any): Blockchain {
    return new Blockchain(data);
  }
}
