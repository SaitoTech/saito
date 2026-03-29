import SharedMethods from "./shared_methods";
import Transaction from "./lib/transaction";
import Block from "./lib/block";
import Factory from "./lib/factory";
import Peer from "./lib/peer";
import StunPeer from "./lib/stun_peer";
import Wallet, { DefaultEmptyPrivateKey } from "./lib/wallet";
import Blockchain from "./lib/blockchain";
import BalanceSnapshot from "./lib/balance_snapshot";
import Nft from "./lib/nft";
import NetworkPeer from "./lib/network_peer";

export enum LogLevel {
  Error = 0,
  Warn,
  Info,
  Debug,
  Trace,
}

export default class Saito {
  private static instance: Saito;
  private static libInstance: any;
  peers: Map<string, NetworkPeer> = new Map<string, NetworkPeer>();
  private stunPeers: Map<bigint, { peerConnection: RTCPeerConnection; publicKey: string }> =
    new Map();
  stunManager: StunPeer;
  factory = new Factory();
  promises = new Map<number, any>();
  private callbackIndex: number = 0;
  private wallet: Wallet | null = null;
  private blockchain: Blockchain | null = null;
  private static wasmMemory: WebAssembly.Memory | null = null;

  public static async initialize(
    configs: any,
    sharedMethods: SharedMethods,
    factory = new Factory(),
    privateKey: string,
    logLevel: LogLevel,
    haste_multiplier: bigint,
    deleteOldBlocks: boolean
  ) {
    console.log("initializing saito lib");
    Saito.instance = new Saito(factory);

    // @ts-ignore
    globalThis.shared_methods = {
      send_message: (public_key: string, buffer: Uint8Array) => {
        sharedMethods.sendMessage(public_key, buffer);
      },
      send_message_to_all: (buffer: Uint8Array, exceptions: Array<string>) => {
        sharedMethods.sendMessageToAll(buffer, exceptions);
      },
      connect_to_peer: (url: string) => {
        sharedMethods.connectToPeer(url);
      },
      write_value: (key: string, value: Uint8Array) => {
        return sharedMethods.writeValue(key, value);
      },
      append_value: (key: string, value: Uint8Array) => {
        return sharedMethods.appendValue(key, value);
      },
      flush_data: (key: string) => {
        return sharedMethods.flushData(key);
      },
      ensure_directory_exists: (path: string) => {
        return sharedMethods.ensureDirExists(path);
      },
      read_value: (key: string) => {
        return sharedMethods.readValue(key);
      },
      load_block_file_list: () => {
        return sharedMethods.loadBlockFileList();
      },
      is_existing_file: (key: string) => {
        return sharedMethods.isExistingFile(key);
      },
      remove_value: (key: string) => {
        return sharedMethods.removeValue(key);
      },
      disconnect_from_peer: (public_key: string) => {
        return sharedMethods.disconnectFromPeer(public_key);
      },
      fetch_block_from_peer: (
        hash: Uint8Array,
        public_key: string,
        url: string,
        block_id: bigint
      ) => {
        sharedMethods
          .fetchBlockFromPeer(url)
          .then((buffer: Uint8Array) => {
            return Saito.getLibInstance().process_fetched_block(buffer, hash, block_id, public_key);
          })
          .catch((error: any) => {
            console.log(
              "failed fetching block for url : " +
                url +
                " from peer : " +
                public_key +
                ", block id = " +
                block_id
            );
            console.error(error);
            return Saito.getLibInstance().process_failed_block_fetch(hash, block_id, public_key);
          });
      },
      process_api_call: (buffer: Uint8Array, msgIndex: number, public_key: string) => {
        return sharedMethods.processApiCall(buffer, msgIndex, public_key).then(() => {});
      },
      process_api_success: (buffer: Uint8Array, msgIndex: number, public_key: string) => {
        return sharedMethods.processApiSuccess(buffer, msgIndex, public_key);
      },
      process_api_error: (buffer: Uint8Array, msgIndex: number, public_key: string) => {
        return sharedMethods.processApiError(buffer, msgIndex, public_key);
      },
      send_interface_event: (event: string, public_key: string) => {
        return sharedMethods.sendInterfaceEvent(event, public_key);
      },
      send_block_fetch_status_event: (count: bigint) => {
        return sharedMethods.sendBlockFetchStatus(count);
      },
      send_block_success: (hash: string, blockId: bigint) => {
        return sharedMethods.sendBlockSuccess(hash, blockId);
      },
      send_wallet_update: () => {
        return sharedMethods.sendWalletUpdate();
      },
      save_wallet: (wallet: any) => {
        return sharedMethods.saveWallet(wallet);
      },
      load_wallet: (wallet: any) => {
        return sharedMethods.loadWallet(wallet);
      },
      save_blockchain: (blockchain: any) => {
        return sharedMethods.saveBlockchain(blockchain);
      },
      load_blockchain: (blockchain: any) => {
        return sharedMethods.loadBlockchain(blockchain);
      },
      get_my_services: () => {
        return sharedMethods.getMyServices().instance;
      },
      send_new_version_alert: (major: number, minor: number, patch: number, public_key: string) => {
        return sharedMethods.sendNewVersionAlert(major, minor, patch, public_key);
      },
      send_new_chain_detected_event: () => {
        return sharedMethods.sendNewChainDetectedEvent();
      },
    };
    if (privateKey === "") {
      privateKey = DefaultEmptyPrivateKey;
    }

    let configStr = JSON.stringify(configs);
    await Saito.getLibInstance().initialize(
      configStr,
      privateKey,
      logLevel,
      haste_multiplier,
      deleteOldBlocks
    );

    let blockchain = await Saito.getInstance().getBlockchain();
    console.log("last callback block id set as : " + configs.blockchain?.last_block_id);
    blockchain.last_callback_block_id = configs.blockchain?.last_block_id || 0;

    console.log("saito initialized");
  }

  public start() {
    console.log("starting saito threads");
    let intervalTime = 100;
    Saito.getInstance().call_timed_functions(intervalTime, Date.now() - intervalTime);
    Saito.getInstance().call_stat_functions(5000);
  }

  public call_timed_functions(interval: number, lastCalledTime: number) {
    setTimeout(() => {
      let time = Date.now();
      Saito.getLibInstance()
        .process_timer_event(BigInt(time - lastCalledTime))
        .then(() => {
          this.call_timed_functions(interval, time);
        });
    }, interval);
  }

  public call_stat_functions(interval: number) {
    setTimeout(() => {
      let time = Date.now();
      Saito.getLibInstance()
        .process_stat_interval(BigInt(time))
        .then(() => {
          this.call_stat_functions(interval);
        });
    }, interval);
  }

  constructor(factory: Factory) {
    this.factory = factory;
    this.stunManager = new StunPeer(this);
  }

  //
  // our main entry point for JS calls to Saito-Core via Saito-WASM
  //
  // for ease of understanding, we separate system components into
  //
  public getCore() {
    //
    // throw an error explicitly if these variables are uninitialized
    // as that can result in very difficult problems to debug later
    // if we run into them. better to exit now and get an immediate
    // notification of the problem.
    //
    if (!this.wallet || !this.blockchain) {
      throw new Error("Core not initialized yet");
    }

    const self = this;
    const wasm = Saito.getLibInstance();
    const core: any = {};

const wasmNetwork = wasm.get_network();
const wasmApi = wasmNetwork.api;

// -------------------------
// API (safe wrapper, no mutation)
// -------------------------
const api = Object.create(wasmApi);

api.call = async (
  buffer: Uint8Array,
  publicKey?: string,
  waitForReply?: boolean
): Promise<Uint8Array> => {
  if (!!publicKey) {
    const peer = await core.network.getPeer(publicKey);
    if (peer === null) {
      throw new Error("peer not found. public key : " + publicKey);
    }
    if (peer.status !== "connected") {
      throw new Error(`peer : ${peer.publicKey} not connected`);
    }
  }

  self.callbackIndex++;

  if (waitForReply) {
    return new Promise(async (resolve, reject) => {
      self.promises.set(self.callbackIndex, { resolve, reject });
      wasmApi.send(buffer, self.callbackIndex, publicKey || "");
    });
  } else {
    return wasmApi.send(buffer, self.callbackIndex, publicKey || "");
  }
};

// -------------------------
// NETWORK (facade, no WASM mutation)
// -------------------------
core.network = {
  api,

  getPeers: async () => {
    const peers = await wasmNetwork.getPeers();
    return peers.map((peer: any) => {
      return self.factory.createPeer(peer);
    });
  },

  getPeer: async (publicKey: string) => {
    const peer = await wasmNetwork.getPeer(publicKey);
    if (!peer) return null;
    return self.factory.createPeer(peer);
  },

  propagateTransaction: async (tx: any) => {
    return wasmNetwork.propagateTransaction(tx.wasmTransaction);
  },

};

// -------------------------
// HIGH-LEVEL NETWORK CALLS
// -------------------------

core.network.sendTransactionWithCallback = async (
  transaction: any,
  callback?: any,
  publicKey?: string
) => {
  const buffer = transaction.wasmTransaction.serialize();

  await api
    .call(buffer, publicKey, !!callback)
    .then((buffer: Uint8Array) => {
      if (callback) {
        const tx = self.factory.createTransaction();
        tx.data = buffer;
        tx.unpackData();
        return callback(tx);
      }
    })
    .catch((error: any) => {
      console.info("couldn't send api call : ", error);
      if (callback) {
        return callback({ err: error.toString() });
      }
    });
};

core.network.sendRequest = async (
  message: string,
  data: any = "",
  callback?: any,
  publicKey?: string,
  signature_required?: boolean
) => {
  console.info("sending request : " + message + ", peer = " + publicKey);

  const wallet = await self.getWallet();
  const myPublicKey = await wallet.getPublicKey();

  const tx = await wasm.create_transaction(myPublicKey, BigInt(0), BigInt(0), false);

  const txObj = self.factory.createTransaction(tx);
  txObj.msg = {
    request: message,
    data: data,
  };

  txObj.packData();

  if (signature_required) {
    await txObj.sign();
  }

  return core.network.sendTransactionWithCallback(
    txObj,
    (tx: any) => {
      if (callback) {
        return callback(tx.msg);
      }
    },
    publicKey
  );
};



    return {
      //
      // why? because network defined outside
      //
      ...core,

      //
      // ROOT STATE OBJECTS (singletons backed by Rust)
      //
      blockchain: this.blockchain?.instance,
      wallet: this.wallet?.instance,

      //
      // OBJECT CLASSES (constructors from WASM)
      //
      transaction: wasm.WasmTransaction,
      block: wasm.WasmBlock,
      slip: wasm.WasmSlip,
      peer: wasm.WasmPeer,
      hop: wasm.WasmHop,

      //
      // SYSTEM COMPONENTS / PLACEHOLDERS
      //

      storage: null,

      //
      // CRYPTO
      //
      crypto: {
        hash: wasm.hash?.bind(wasm),
        signBuffer: wasm.sign_buffer?.bind(wasm),
        verifySignature: wasm.verify_signature?.bind(wasm),
        generatePrivateKey: wasm.generate_private_key?.bind(wasm),
        generatePublicKey: wasm.generate_public_key?.bind(wasm),
      },

      //
      // ADMIN / MISC (unstructured)
      //
      admin: {
        writeIssuanceFile: wasm.write_issuance_file?.bind(wasm),
      },
    };
  }

  public static getInstance(): Saito {
    return Saito.instance;
  }

  public static getLibInstance(): any {
    return Saito.libInstance;
  }

  public static setLibInstance(instance: any) {
    Saito.libInstance = instance;
  }

  public static setWasmMemory(memory: any) {
    Saito.wasmMemory = memory;
  }

  public static getWasmMemory(): WebAssembly.Memory | null {
    return Saito.wasmMemory;
  }

  // public addNewSocket(peer: NetworkPeer, public_key: bigint) {
  //   this.sockets.set(public_key, socket);
  //   console.log("adding socket : " + public_key + ". total sockets : " + this.sockets.size);
  // }

  public async addStunPeer(publicKey: string, peerConnection: RTCPeerConnection) {
    await this.stunManager.addStunPeer(publicKey, peerConnection);
  }

  public getSocket(publicKey: string): any | null {
    return this.peers.get(publicKey)?.socket;
  }

  public removeSocket(publicKey: string) {
    try {
      console.log(
        "Removing socket for : " + publicKey + " out of " + this.peers.size + " total sockets"
      );
      let peer = this.peers.get(publicKey);
      let socket = peer?.socket;
      this.peers.delete(publicKey);
      if (socket) {
        console.info("closing socket for peer  : " + publicKey);

        // @ts-ignore
        if (socket.readyState !== 1 && socket.terminate) {
          // @ts-ignore
          socket.terminate();
        } else {
          // @ts-ignore
          socket.close();
        }
      } else {
        console.info("no socket found for index : " + publicKey);
      }
    } catch (error) {
      console.error("failed removing socket", error);
    }
  }

  public async initialize(configs: any): Promise<any> {
    return Saito.getLibInstance().initialize(configs);
  }

  public async getBlock<B extends Block>(blockHash: string): Promise<B | null> {
    try {
      let block = await Saito.getLibInstance().get_block(blockHash);
      return Saito.getInstance().factory.createBlock(block) as B;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  public async processMsgBufferFromPeer(buffer: Uint8Array, peer: NetworkPeer): Promise<void> {
    return Saito.getLibInstance().process_msg_buffer_from_peer(buffer, peer.instance);
  }

  public async createTransaction<T extends Transaction>(
    publickey = "",
    amount = BigInt(0),
    fee = BigInt(0),
    force_merge = false
  ): Promise<T> {
    let wasmTx = await Saito.getLibInstance().create_transaction(
      publickey,
      amount,
      fee,
      force_merge
    );
    let tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;
    tx.timestamp = new Date().getTime();
    return tx;
  }

  public async createTransactionWithMultiplePayments<T extends Transaction>(
    keys: string[],
    amounts: bigint[],
    fee: bigint
  ): Promise<T> {
    let wasmTx = await Saito.getLibInstance().create_transaction_with_multiple_payments(
      keys,
      amounts,
      fee
    );

    let tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;
    tx.timestamp = new Date().getTime();

    return tx;
  }

  public async createBoundTransaction<T extends Transaction>(
    num: bigint,
    deposit: bigint,
    tx_msg: any,
    fee: bigint,
    recipient_public_key: string,
    nft_type: string
  ): Promise<T> {
    let tx_msg_arr = new Uint8Array(Buffer.from(JSON.stringify(tx_msg), "utf-8"));

    let wasmTx = await Saito.getLibInstance().create_bound_transaction(
      num,
      deposit,
      new Uint8Array(tx_msg_arr),
      fee,
      recipient_public_key,
      nft_type
    );

    let tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;
    tx.timestamp = new Date().getTime();

    return tx;
  }

  public async createSendBoundTransaction<T extends Transaction>(
    amt: bigint,
    slip1UtxoKey: string,
    slip2UtxoKey: string,
    slip3UtxoKey: string,
    recipientPublicKey: string,
    tx_msg: any
  ): Promise<T> {
    let tx_msg_arr = new Uint8Array(Buffer.from(JSON.stringify(tx_msg), "utf-8"));

    const wasmTx = await Saito.getLibInstance().create_send_bound_transaction(
      amt,
      slip1UtxoKey,
      slip2UtxoKey,
      slip3UtxoKey,
      recipientPublicKey,
      new Uint8Array(tx_msg_arr)
    );

    const tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;
    tx.timestamp = Date.now();
    return tx;
  }

  public async createAtomizeBoundTransaction<T extends Transaction>(
    slip1UtxoKey: string,
    slip2UtxoKey: string,
    slip3UtxoKey: string,
    tx_msg: any
  ): Promise<T> {
    const tx_msg_arr = Buffer.from(JSON.stringify(tx_msg), "utf-8");

    const wasmTx = await Saito.getLibInstance().create_atomize_bound_transaction(
      slip1UtxoKey,
      slip2UtxoKey,
      slip3UtxoKey,
      new Uint8Array(tx_msg_arr)
    );

    const tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;

    tx.timestamp = Date.now();

    return tx;
  }

  public async createSplitBoundTransaction<T extends Transaction>(
    slip1UtxoKey: string,
    slip2UtxoKey: string,
    slip3UtxoKey: string,
    leftCount: number,
    rightCount: number,
    tx_msg: any
  ): Promise<T> {
    let tx_msg_arr = new Uint8Array(Buffer.from(JSON.stringify(tx_msg), "utf-8"));

    const wasmTx = await Saito.getLibInstance().create_split_bound_transaction(
      slip1UtxoKey,
      slip2UtxoKey,
      slip3UtxoKey,
      leftCount,
      rightCount,
      new Uint8Array(tx_msg_arr)
    );

    const tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;
    tx.timestamp = Date.now();

    return tx;
  }

  public async createMergeBoundTransaction<T extends Transaction>(
    nftId: string,
    tx_msg: any
  ): Promise<T> {
    let tx_msg_arr = new Uint8Array(Buffer.from(JSON.stringify(tx_msg), "utf-8"));

    const wasmTx = await Saito.getLibInstance().create_merge_bound_transaction(
      nftId,
      new Uint8Array(tx_msg_arr)
    );

    const tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;
    tx.timestamp = Date.now();

    return tx;
  }

  public async createRemoveBoundTransaction<T extends Transaction>(
    slip1UtxoKey: string,
    slip2UtxoKey: string,
    slip3UtxoKey: string,
    tx_msg: any // ADD THIS
  ): Promise<T> {
    let tx_msg_arr = new Uint8Array(Buffer.from(JSON.stringify(tx_msg), "utf-8"));

    const wasmTx = await Saito.getLibInstance().create_remove_bound_transaction(
      slip1UtxoKey,
      slip2UtxoKey,
      slip3UtxoKey,
      new Uint8Array(tx_msg_arr) // SEND IT TO WASM
    );

    const tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;
    tx.timestamp = Date.now();
    return tx;
  }

  public async getWallet() {
    if (!this.wallet) {
      let w = await Saito.getLibInstance().get_wallet();
      this.wallet = this.factory.createWallet(w);
    }
    return this.wallet;
  }

  public async getBlockchain() {
    if (!this.blockchain) {
      let b = await Saito.getLibInstance().get_blockchain();
      this.blockchain = this.factory.createBlockchain(b);
    }
    return this.blockchain;
  }

  public async getMempoolTxs() {
    let txs = await Saito.getLibInstance().get_mempool_txs();
    return Promise.all(
      txs.map(async (tx: any) => {
        let txObj = await Saito.getInstance().factory.createTransaction(tx);
        return txObj.toJson();
      })
    );
  }

  public async getBalanceSnapshot(keys: string[]): Promise<BalanceSnapshot> {
    let snapshot = await Saito.getLibInstance().get_balance_snapshot(keys);
    return new BalanceSnapshot(snapshot);
  }

  public async getNftList(): Promise<string> {
    const raw = await Saito.getLibInstance().get_nft_list();

    const arr = Array.from(raw) as any[];
    const json = JSON.stringify(arr.map((w) => new Nft(w).toJSON()));

    return json;
  }

  public async updateBalanceFrom(snapshot: BalanceSnapshot) {
    await Saito.getLibInstance().update_from_balance_snapshot(snapshot.instance);
  }

  public async setWalletVersion(major: number, minor: number, patch: number) {
    await Saito.getLibInstance().set_wallet_version(major, minor, patch);
  }

  public isValidPublicKey(key: string): boolean {
    try {
      return Saito.getLibInstance().is_valid_public_key(key);
    } catch (e) {
      // console.debug(e);
    }
    return false;
  }

  public async addPendingTx(tx: Transaction) {
    try {
      let wallet = await this.getWallet();
      return wallet.addToPending(tx);
    } catch (e) {
      console.error(e);
    }
  }

  public async disableProducingBlocksByTimer() {
    try {
      return Saito.getLibInstance().disable_producing_blocks_by_timer();
    } catch (e) {
      console.error(e);
    }
  }

  public async produceBlockWithGt(): Promise<boolean> {
    try {
      return Saito.getLibInstance().produce_block_with_gt();
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  public async produceBlockWithoutGt(): Promise<boolean> {
    try {
      return Saito.getLibInstance().produce_block_without_gt();
    } catch (error) {
      console.error(error);
      return false;
    }
  }
}
