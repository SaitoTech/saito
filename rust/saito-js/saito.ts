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
    sockets: Map<bigint, any> = new Map<bigint, any>();
    private stunPeers: Map<bigint, { peerConnection: RTCPeerConnection, publicKey: string }> = new Map();
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
            send_message: (peer_index: bigint, buffer: Uint8Array) => {
                sharedMethods.sendMessage(peer_index, buffer);
            },
            send_message_to_all: (buffer: Uint8Array, exceptions: Array<bigint>) => {
                sharedMethods.sendMessageToAll(buffer, exceptions);
            },
            connect_to_peer: (url: string, peer_index: bigint) => {
                sharedMethods.connectToPeer(url, peer_index);
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
            ensure_block_directory_exists: (path: string) => {
                return sharedMethods.ensureBlockDirExists(path);
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
            disconnect_from_peer: (peer_index: bigint) => {
                return sharedMethods.disconnectFromPeer(peer_index);
            },
            fetch_block_from_peer: (
                hash: Uint8Array,
                peer_index: bigint,
                url: string,
                block_id: bigint
            ) => {
                sharedMethods
                    .fetchBlockFromPeer(url)
                    .then((buffer: Uint8Array) => {
                        return Saito.getLibInstance().process_fetched_block(buffer, hash, block_id, peer_index);
                    })
                    .catch((error: any) => {
                        console.log(
                            "failed fetching block for url : " +
                            url +
                            " from peer : " +
                            peer_index +
                            ", block id = " +
                            block_id
                        );
                        console.error(error);
                        return Saito.getLibInstance().process_failed_block_fetch(hash, block_id, peer_index);
                    });
            },
            process_api_call: (buffer: Uint8Array, msgIndex: number, peerIndex: bigint) => {
                return sharedMethods.processApiCall(buffer, msgIndex, peerIndex).then(() => {
                });
            },
            process_api_success: (buffer: Uint8Array, msgIndex: number, peerIndex: bigint) => {
                return sharedMethods.processApiSuccess(buffer, msgIndex, peerIndex);
            },
            process_api_error: (buffer: Uint8Array, msgIndex: number, peerIndex: bigint) => {
                return sharedMethods.processApiError(buffer, msgIndex, peerIndex);
            },
            send_interface_event: (event: string, peerIndex: bigint, public_key: string) => {
                return sharedMethods.sendInterfaceEvent(event, peerIndex, public_key);
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
            send_new_version_alert: (major: number, minor: number, patch: number, peerIndex: bigint) => {
                return sharedMethods.sendNewVersionAlert(major, minor, patch, peerIndex);
            },
        };
        if (privateKey === "") {
            privateKey = DefaultEmptyPrivateKey;
        }

        let configStr = JSON.stringify(configs);
        await Saito.getLibInstance().initialize(configStr, privateKey, logLevel, haste_multiplier, deleteOldBlocks);

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

    public addNewSocket(socket: any, peer_index: bigint) {
        this.sockets.set(peer_index, socket);
        console.log("adding socket : " + peer_index + ". total sockets : " + this.sockets.size);
    }


    public async addStunPeer(publicKey: string, peerConnection: RTCPeerConnection) {
        await this.stunManager.addStunPeer(publicKey, peerConnection);
    }


    public getSocket(index: bigint): any | null {
        return this.sockets.get(index);
    }

    public removeSocket(index: bigint) {
        try {
            console.log(
                "Removing socket for : " + index + " out of " + this.sockets.size + " total sockets"
            );
            let socket = this.sockets.get(index);
            this.sockets.delete(index);
            if (socket) {
                console.log("closing socket for peer index : " + index);
                socket.close();
            } else {
                console.log("no socket found for index : " + index);
            }
        } catch (error) {
            console.error(error);
        }
    }

    public async initialize(configs: any): Promise<any> {
        return Saito.getLibInstance().initialize(configs);
    }

    public async getLatestBlockHash(): Promise<string> {
        return Saito.getLibInstance().get_latest_block_hash();
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

    public async processNewPeer(index: bigint, ip: string): Promise<void> {
        return Saito.getLibInstance().process_new_peer(index, ip);
    }


    public async processPeerDisconnection(peer_index: bigint): Promise<void> {
        return Saito.getLibInstance().process_peer_disconnection(peer_index);
    }

    public async processMsgBufferFromPeer(buffer: Uint8Array, peer_index: bigint): Promise<void> {
        return Saito.getLibInstance().process_msg_buffer_from_peer(buffer, peer_index);
    }

    public async processFetchedBlock(
        buffer: Uint8Array,
        hash: Uint8Array,
        block_id: bigint,
        peer_index: bigint
    ): Promise<void> {
        return Saito.getLibInstance().process_fetched_block(buffer, hash, block_id, peer_index);
    }

    public async processTimerEvent(duration_in_ms: bigint): Promise<void> {
        return Saito.getLibInstance().process_timer_event(duration_in_ms);
    }

    public hash(buffer: Uint8Array): string {
        return Saito.getLibInstance().hash(buffer);
    }

    public signBuffer(buffer: Uint8Array, privateKey: String): string {
        return Saito.getLibInstance().sign_buffer(buffer, privateKey);
    }

    public verifySignature(buffer: Uint8Array, signature: string, publicKey: string): boolean {
        return Saito.getLibInstance().verify_signature(buffer, signature, publicKey);
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
        amt: bigint,   
        bid: number,           
        tid: number,           
        sid: number,           
        num: bigint,           
        deposit: bigint,
        change: bigint,        
        data: string = "",
        fee: bigint,
        recipient_public_key: string,     
        nft_type: string, 
    ): Promise<T> {

        console.log("saito.ts num: ", num);

        let wasmTx = await Saito.getLibInstance().create_bound_transaction(
            amt,
            bid,
            tid,
            sid,
            num,
            deposit,
            change,
            data,
            fee,
            recipient_public_key,
            nft_type
        );

        console.log("saito.ts tx: ", wasmTx);

        let tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;
        tx.timestamp = new Date().getTime();

        return tx;
    }

    public async createSendBoundTransaction<T extends Transaction>(
        amt: bigint,
        slip1UtxoKey: string,
        slip2UtxoKey: string,
        slip3UtxoKey: string,
        data: string = "",
        recipientPublicKey: string
    ): Promise<T> {
        const wasmTx = await Saito.getLibInstance().create_send_bound_transaction(
          amt,
          slip1UtxoKey,
          slip2UtxoKey,
          slip3UtxoKey,
          data,
          recipientPublicKey
        );
        console.log("WASM NFT transfer transaction:", wasmTx);

        const tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;
        tx.timestamp = Date.now();
        return tx;
    }


    public async createSplitBoundTransaction<T extends Transaction>(
      nftId: string,
      leftCount: number,
      rightCount: number
    ): Promise<T> {
      console.log("wallet.ts createSplitBoundTransaction:", nftId, leftCount, rightCount);

      const wasmTx = await Saito.getLibInstance().create_split_bound_transaction(
        nftId,
        leftCount,
        rightCount
      );

      console.log("wallet.ts wasmTx:", wasmTx);

      const tx = Saito.getInstance().factory.createTransaction(wasmTx) as T;
      tx.timestamp = Date.now();

      return tx;
    }



    public async getPeers(): Promise<Array<Peer>> {
        let peers = await Saito.getLibInstance().get_peers();
        return peers.map((peer: any) => {
            return this.factory.createPeer(peer);
        });
    }

    public async getPeer(index: bigint): Promise<Peer | null> {
        let peer = await Saito.getLibInstance().get_peer(index);
        if (!peer) {
            return null;
        }
        return this.factory.createPeer(peer);
    }

    public generatePrivateKey(): string {
        return Saito.getLibInstance().generate_private_key();
    }

    public generatePublicKey(privateKey: string): string {
        let key = Saito.getLibInstance().generate_public_key(privateKey);
        return key;
    }

    public async propagateTransaction(tx: Transaction) {
        let tx2 = tx.clone();
        return Saito.getLibInstance().propagate_transaction(tx2.wasmTransaction);
    }

    public async sendApiCall(
        buffer: Uint8Array,
        peerIndex: bigint,
        waitForReply: boolean
    ): Promise<Uint8Array> {
        if (peerIndex !== BigInt(0)) {
            let peer = await this.getPeer(peerIndex);
            if (peer === null) {
                throw new Error("peer not found");
            }
            if (peer.status !== "connected") {
                throw new Error(`peer : ${peer.peerIndex} not connected. status : ${peer.status}`);
            }
        }

        if (waitForReply) {
            return new Promise(async (resolve, reject) => {
                this.callbackIndex++;
                await this.promises.set(this.callbackIndex, {
                    resolve,
                    reject,
                });
                Saito.getLibInstance().send_api_call(buffer, this.callbackIndex, peerIndex);
            });
        } else {
            return Saito.getLibInstance().send_api_call(buffer, this.callbackIndex, peerIndex);
        }
    }


    public async sendApiSuccess(msgId: number, buffer: Uint8Array, peerIndex: bigint) {
        return Saito.getLibInstance().send_api_success(buffer, msgId, peerIndex);
    }

    public async sendApiError(msgId: number, buffer: Uint8Array, peerIndex: bigint) {
        return Saito.getLibInstance().send_api_error(buffer, msgId, peerIndex);
    }

    public async sendTransactionWithCallback(
        transaction: Transaction,
        callback?: any,
        peerIndex?: bigint
    ): Promise<any> {
        // TODO : implement retry on fail
        // TODO : stun code goes here probably???
        // console.log(
        //   "saito.sendTransactionWithCallback : peer = " + peerIndex + " sig = " + transaction.signature
        // );
        let buffer = transaction.wasmTransaction.serialize();

        await this.sendApiCall(buffer, peerIndex || BigInt(0), !!callback)
            .then((buffer: Uint8Array) => {
                if (callback) {
                    // console.log("sendTransactionWithCallback. buffer length = " + buffer.byteLength);

                    let tx = this.factory.createTransaction();
                    tx.data = buffer;
                    tx.unpackData();
                    return callback(tx);
                }
            })
            .catch((error) => {
                console.info("couldn't send api call : ", error);
                if (callback) {
                    return callback({ err: error.toString() });
                }
            });
    }

    public async sendRequest(
        message: string,
        data: any = "",
        callback?: any,
        peerIndex?: bigint
    ): Promise<any> {
        console.log("sending request : peer = " + peerIndex);
        let wallet = await this.getWallet();
        let publicKey = await wallet.getPublicKey();
        let tx = await this.createTransaction(publicKey, BigInt(0), BigInt(0));
        tx.msg = {
            request: message,
            data: data,
        };
        tx.packData();
        return this.sendTransactionWithCallback(
            tx,
            (tx: Transaction) => {
                if (callback) {
                    return callback(tx.msg);
                }
            },
            peerIndex
        );
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
        return Saito.getLibInstance().get_mempool_txs();
    }

    public async getAccountSlips(publicKey: string) {
        return Saito.getLibInstance().get_account_slips(publicKey);
    }

    public async getBalanceSnapshot(keys: string[]): Promise<BalanceSnapshot> {
        let snapshot = await Saito.getLibInstance().get_balance_snapshot(keys);
        return new BalanceSnapshot(snapshot);
    }

    public async getNftList(): Promise<string> {
        const raw = await Saito.getLibInstance().get_nft_list();

        const arr = Array.from(raw) as any[];
        const json = JSON.stringify(arr.map(w => new Nft(w).toJSON()));

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

    public async writeIssuanceFile(threshold: bigint) {
        try {
            return Saito.getLibInstance().write_issuance_file(threshold);
        } catch (error) {
            console.warn("failed writing issuance file");
            console.error(error);
        }
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
