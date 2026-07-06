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
  peersByPeerId: Map<bigint, NetworkPeer> = new Map();
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
      send_message_by_peer_id: (peer_id: bigint, buffer: Uint8Array) => {
        return sharedMethods.sendMessageByPeerId(peer_id, buffer);
      },
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
      disconnect_from_peer: (peer_id: bigint) => {
        return sharedMethods.disconnectFromPeer(peer_id);
      },
      fetch_block_from_peer: (hash: Uint8Array, peer_id: bigint, url: string, block_id: bigint) => {
        const expectedHash = Array.from(hash)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        console.info(
          "[TRACE_SYNC] js_fetch_dispatch peer_id=%s block_id=%s expected_hash=%s url=%s",
          peer_id.toString(),
          block_id.toString(),
          expectedHash,
          url
        );
        sharedMethods
          .fetchBlockFromPeer(url)
          .then((buffer: Uint8Array) => {
            const prefix = Array.from(buffer.slice(0, 32))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
            console.info(
              "[TRACE_SYNC] js_fetch_completed peer_id=%s block_id=%s expected_hash=%s bytes=%s prefix32=%s",
              peer_id.toString(),
              block_id.toString(),
              expectedHash,
              buffer.byteLength,
              prefix
            );
            return Saito.getLibInstance().process_fetched_block(buffer, hash, block_id, peer_id);
          })
          .catch((error: any) => {
            console.log(
              "failed fetching block for url : " +
                url +
                " from peer : " +
                peer_id +
                ", block id = " +
                block_id
            );
            console.error(error);
            return Saito.getLibInstance().process_failed_block_fetch(hash, block_id, peer_id);
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
      emit_interface_event: (event_name: string, payload_json: string) => {
        return sharedMethods.emitInterfaceEvent(event_name, payload_json);
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
      let delta = time - lastCalledTime;
      if (delta < 0) {
        delta = 0;
      }

      if (delta > 60000) {
        delta = 60000;
      }

      Saito.getLibInstance()
        .process_timer_event(BigInt(delta))
        .then(() => {
          this.call_timed_functions(interval, time);
        })
        .catch((err: any) => {
          console.error("timer error:", err);
          this.call_timed_functions(interval, Date.now());
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
  // core.wallet
  // core.blockchain
  // core.network
  // ...
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
    if (!this.wallet?.instance) {
      throw new Error("Wallet instance not initialized");
    }

    const self = this;
    const wasm = Saito.getLibInstance();
    const core: any = {};
    let modified_wallet: any = {};

    // --------------------------
    // WALLET
    // --------------------------
    const wasmWallet: any = this.wallet.instance;
    const factory = this.factory;
    let wallet = undefined;
    if (wasmWallet) {
      const wrapTx = <T extends Transaction>(fn: Function) => {
        return async (...args: any[]): Promise<T> => {
          const wasmTx = await fn(...args);
          const tx = factory.createTransaction(wasmTx) as T;
          tx.timestamp = Date.now();
          return tx;
        };
      };

      const bindAndConvert = (fn: Function, argNames: string[]) => {
        const boundFn = fn.bind(wasmWallet);
        const payloadArgNames = new Set(["tx_msg", "msg"]);
        return (...args: any[]) => {
          const convertedArgs = args.map((arg, index) => {
            const argName = argNames[index];
            if (!payloadArgNames.has(argName)) {
              return arg;
            }
            return new Uint8Array(Buffer.from(JSON.stringify(arg), "utf-8"));
          });
          return boundFn(...convertedArgs);
        };
      };
      wallet = Object.create(wasmWallet);
      wallet.createTransaction = wrapTx(wasmWallet.createTransaction.bind(wasmWallet));

      wallet.createTransactionWithMultiplePayments = wrapTx(
        wasmWallet.createTransactionWithMultiplePayments.bind(wasmWallet)
      );

      wallet.createBoundTransaction = wrapTx(
        bindAndConvert(wasmWallet.createBoundTransaction, [
          "num",
          "deposit",
          "tx_msg",
          "fee",
          "recipient_public_key",
          "nft_type",
        ])
      );

      wallet.createSendBoundTransaction = wrapTx(
        bindAndConvert(wasmWallet.createSendBoundTransaction, [
          "amt",
          "slip1",
          "slip2",
          "slip3",
          "recipient",
          "tx_msg",
        ])
      );

      wallet.createSplitBoundTransaction = wrapTx(
        bindAndConvert(wasmWallet.createSplitBoundTransaction, [
          "slip1",
          "slip2",
          "slip3",
          "left",
          "right",
          "tx_msg",
        ])
      );

      wallet.createMergeBoundTransaction = wrapTx(
        bindAndConvert(wasmWallet.createMergeBoundTransaction, ["nft_id_hex", "tx_msg"])
      );

      wallet.createAtomizeBoundTransaction = wrapTx(
        bindAndConvert(wasmWallet.createAtomizeBoundTransaction, [
          "slip1_utxo_key",
          "slip2_utxo_key",
          "slip3_utxo_key",
          "tx_msg",
        ])
      );

      wallet.createNFTTransaction = wrapTx(
        bindAndConvert(wasmWallet.createNFTTransaction, [
          "recipient_public_key",
          "nft_amount",
          "nft_uuid",
          "fee",
          "saito_deposit",
          "tx_msg",
        ])
      );

      wallet.createRemoveBoundTransaction = wrapTx(
        bindAndConvert(wasmWallet.createRemoveBoundTransaction, [
          "slip1_utxo_key",
          "slip2_utxo_key",
          "slip3_utxo_key",
          "tx_msg",
        ])
      );
    }
    modified_wallet = wallet;

    // -------------------------
    // NETWORK
    // -------------------------
    const wasmNetwork = wasm.get_network();
    const wasmApi = wasmNetwork.api;
    const api = Object.create(wasmApi);

    api.call = async (
      buffer: Uint8Array,
      publicKey?: string,
      waitForReply?: boolean
    ): Promise<Uint8Array> => {
      publicKey = typeof publicKey === "string" ? publicKey : (publicKey as any)?.publicKey;

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

    core.network = {
      api,

      peers: wasmNetwork.peers,

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

      getPeerByPeerId: async (peer_id: bigint) => {
        const peer = await wasmNetwork.getPeerByPeerId(peer_id);
        if (!peer) return null;
        return self.factory.createPeer(peer);
      },

      propagateTransaction: async (tx: any) => {
        return wasmNetwork.propagateTransaction(tx.clone().wasmTransaction);
      },
    };

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

      const tx = await modified_wallet.createTransaction(myPublicKey, BigInt(0), BigInt(0), false);
      const txObj = tx;
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

    const coreObject = {
      //
      // why? because network defined outside
      //
      ...core,

      //
      // ROOT STATE OBJECTS (singletons backed by Rust)
      //
      blockchain: this.blockchain?.instance,
      wallet,

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
        generatePrivateKey: wasm.generate_private_key?.bind(wasm),
        generatePublicKey: wasm.generate_public_key?.bind(wasm),
        hash: wasm.hash?.bind(wasm),
        isPublicKey: wasm.isPublicKey?.bind(wasm),
        signBuffer: wasm.sign_buffer?.bind(wasm),
        verifySignature: wasm.verify_signature?.bind(wasm),
      },

      //
      // SCRIPTING
      //
      scripting: {
        evaluate: async (script: any , tx?: Transaction): Promise<number> => {
          if (typeof script !== "string") {
            script = JSON.stringify(script);
          }
	  if (tx) {
    	    tx.packData();
    	    return await wasm.evaluate_script(script, tx.wasmTransaction);
  	  }

          return await wasm.evaluate_script(script);
        },

        hash: (script: any): string => {
          if (typeof script !== "string") {
            script = JSON.stringify(script);
          }
          return wasm.get_script_hash(script);
        },

        address: (script: any): string => {
          if (typeof script !== "string") {
            script = JSON.stringify(script);
          }
          return wasm.get_script_address(script);
        },
      },

      //
      // ADMIN / MISC (unstructured)
      //
      admin: {
        writeIssuanceFile: wasm.write_issuance_file?.bind(wasm),
      },
    };

    //
    // add functions to core.blockchain
    //
    if (coreObject.blockchain) {

      const blockchain = coreObject.blockchain;
      const wrapper = this.blockchain;

      blockchain.get = async () => {
        return wrapper.get();
      };

      blockchain.getBlock = async (
        idOrHash: string | number | bigint,
        includeTransactions: boolean = false
      ) => {
        return wrapper.getBlock(
          idOrHash,
          includeTransactions
        );
      };

      blockchain.getBlocks = async (
        count: number,
        includeOffchain: boolean = false
      ) => {
        return wrapper.getBlocks(
          count,
          includeOffchain
        );
      };

    }

    console.log("CORE OBJECT");
    console.log(coreObject);
    console.log("CORE SCRIPTING", coreObject.scripting);

    return coreObject;
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

  public disconnectPeer(peer: NetworkPeer) {
    this.peersByPeerId.delete(peer.peerId);

    if (peer.publicKey) {
      this.removeSocket(peer.peerId);
      return;
    }

    if (peer.socket) {
      // @ts-ignore
      if (peer.socket.readyState !== 1 && peer.socket.terminate) {
        // @ts-ignore
        peer.socket.terminate();
      } else {
        // @ts-ignore
        peer.socket.close();
      }
    }
  }
  public async addStunPeer(publicKey: string, peerConnection: RTCPeerConnection) {
    await this.stunManager.addStunPeer(publicKey, peerConnection);
  }

  public getSocketByPeerId(peer_id: bigint): any | null {
    return this.peersByPeerId.get(peer_id)?.socket || null;
  }

  public getSocket(publicKey: string): any | null {
    return this.peers.get(publicKey)?.socket;
  }

  public removeSocket(peer_id: bigint) {
    try {
      console.log(
        "Removing socket for : " + peer_id + " out of " + this.peers.size + " total sockets"
      );

      const peer = this.peersByPeerId.get(peer_id);

      if (!peer) {
        return;
      }

      const socket = peer.socket;

      this.peersByPeerId.delete(peer_id);

      if (peer.publicKey) {
        const current = this.peers.get(peer.publicKey);
        if (current?.peerId === peer_id) {
          this.peers.delete(peer.publicKey);
        }
      }

      if (socket) {
        // @ts-ignore
        if (socket.readyState !== 1 && socket.terminate) {
          // @ts-ignore
          socket.terminate();
        } else {
          // @ts-ignore
          socket.close();
        }
      } else {
        console.info("no socket on peer for peer_id : " + peer_id);
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
    // initialize per-peer chain once
    const inflight = peer._inflight ?? Promise.resolve();
    peer._inflight = inflight
      .then(() => {
        return Saito.getLibInstance().process_msg_buffer_from_peer(buffer, peer.instance);
      })
      .catch((err: any) => {
        console.error("process_msg_buffer_from_peer failed for peer:", peer.publicKey, err);
      });
    return peer._inflight;
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
    console.info("[IMPORT_TRACE] before updateBalanceFrom (saito.ts)");
    await Saito.getLibInstance().update_from_balance_snapshot(snapshot.instance);
    console.info("[IMPORT_TRACE] after updateBalanceFrom (saito.ts)");
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
