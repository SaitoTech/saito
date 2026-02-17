"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeSharedMethods = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const index_node_1 = __importDefault(require("saito-js/index.node"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const body_parser_1 = __importDefault(require("body-parser"));
const ws_1 = __importDefault(require("ws"));
const process_1 = __importDefault(require("process"));
const custom_shared_methods_1 = __importDefault(require("saito-js/lib/custom/custom_shared_methods"));
const url_1 = require("url");
const transaction_1 = __importDefault(require("../transaction"));
const peer_service_list_1 = __importDefault(require("saito-js/lib/peer_service_list"));
const block_1 = __importDefault(require("../block"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const node_html_parser_1 = __importDefault(require("node-html-parser"));
const html_prettify_1 = __importDefault(require("html-prettify"));
const util_1 = require("saito-js/lib/util");
const transaction_2 = require("saito-js/lib/transaction");
const block_2 = require("saito-js/lib/block");
const JSON = require('json-bigint');
//
// CORS -- uncomment for local CORS Cross-Origin Requests by Default
//
var cors = require('cors');
const expressApp = (0, express_1.default)();
expressApp.use(cors());
const webserver = new http_1.Server(expressApp);
class NodeSharedMethods extends custom_shared_methods_1.default {
    constructor(app) {
        super();
        this.app = app;
    }
    sendMessage(peerIndex, buffer) {
        try {
            let socket = index_node_1.default.getInstance().getSocket(peerIndex);
            if (socket) {
                socket.send(buffer);
            }
        }
        catch (e) {
            console.error(e);
        }
    }
    sendMessageToAll(buffer, exceptions) {
        index_node_1.default.getInstance().sockets.forEach((socket, key) => {
            if (exceptions.includes(key)) {
                return;
            }
            try {
                socket.send(buffer);
            }
            catch (error) {
                console.error(error);
            }
        });
    }
    connectToPeer(url, peer_index) {
        try {
            console.log('connecting to ' + url + '....');
            let socket = new ws_1.default.WebSocket(url);
            index_node_1.default.getInstance().addNewSocket(socket, peer_index);
            socket.on('message', (buffer) => {
                try {
                    index_node_1.default.getLibInstance().process_msg_buffer_from_peer(buffer, peer_index);
                }
                catch (e) {
                    console.error(e);
                }
            });
            socket.on('close', () => {
                try {
                    index_node_1.default.getLibInstance().process_peer_disconnection(peer_index);
                }
                catch (e) {
                    console.error(e);
                }
            });
            socket.on('error', (error) => {
                console.error(error);
                try {
                    index_node_1.default.getLibInstance().process_peer_disconnection(peer_index);
                }
                catch (e) {
                    console.error(e);
                }
            });
            socket.on('open', () => {
                index_node_1.default.getLibInstance()
                    .process_new_peer(peer_index, url)
                    .then(() => {
                    console.log('connected to : ' + url + ' with peer index : ' + peer_index);
                });
            });
        }
        catch (e) {
            console.error(e);
        }
    }
    writeValue(key, value) {
        try {
            fs_1.default.writeFileSync(key, value);
        }
        catch (error) {
            console.error(error);
        }
    }
    appendValue(key, value) {
        try {
            fs_1.default.appendFileSync(key, value);
        }
        catch (error) {
            console.error(error);
        }
    }
    flushData(key) { }
    readValue(key) {
        try {
            return fs_1.default.readFileSync(key);
        }
        catch (error) {
            console.error(error);
            return new Uint8Array();
        }
    }
    loadBlockFileList() {
        try {
            let files = fs_1.default.readdirSync('data/blocks/');
            files = files.filter((file) => file.endsWith('.sai'));
            return files;
        }
        catch (e) {
            console.log('cwd : ', process_1.default.cwd());
            console.error(e);
            return [];
        }
    }
    isExistingFile(key) {
        try {
            let result = fs_1.default.existsSync(key);
            return !!result;
        }
        catch (error) {
            console.error(error);
            return false;
        }
    }
    removeValue(key) {
        try {
            fs_1.default.rmSync(key);
        }
        catch (e) {
            console.error(e);
        }
    }
    disconnectFromPeer(peerIndex) {
        index_node_1.default.getInstance().removeSocket(peerIndex);
    }
    fetchBlockFromPeer(url) {
        console.log('fetching block from peer: ' + url);
        return (0, node_fetch_1.default)(url)
            .then((res) => {
            return res.arrayBuffer();
        })
            .then((buffer) => {
            console.log('block data fetched for ' + url + ' with size : ' + buffer.byteLength);
            return new Uint8Array(buffer);
        })
            .catch((err) => {
            console.error('Error fetching block: ' + url, err);
            throw 'failed fetching block';
        });
    }
    async processApiCall(buffer, msgIndex, peerIndex) {
        // console.log(
        //   "NodeMethods.processApiCall : peer= " + peerIndex + " with size : " + buffer.byteLength
        // );
        const mycallback = async (response_object) => {
            // console.log("response_object ", response_object);
            await index_node_1.default.getInstance().sendApiSuccess(msgIndex, response_object ? Buffer.from(JSON.stringify(response_object), 'utf-8') : Buffer.alloc(0), peerIndex);
        };
        let peer = await this.app.network.getPeer(peerIndex);
        let newtx = new transaction_1.default();
        try {
            // console.log("buffer length : " + buffer.byteLength, buffer);
            newtx.deserialize(buffer);
            newtx.unpackData();
            // console.debug("processing peer tx : ", newtx.msg);
        }
        catch (error) {
            console.error(error);
            newtx.msg = buffer;
        }
        await this.app.modules.handlePeerTransaction(newtx, peer, mycallback);
    }
    sendInterfaceEvent(event, peerIndex, public_key) {
        this.app.connection.emit(event, peerIndex, public_key);
    }
    sendBlockSuccess(hash, blockId) {
        this.app.connection.emit('add-block-success', { hash, blockId });
    }
    sendWalletUpdate() {
        this.app.connection.emit('wallet-updated');
    }
    sendBlockFetchStatus(count) {
        this.app.connection.emit('block-fetch-status', { count: count });
    }
    async saveWallet() {
        if (this.app.options.wallet && this.app.wallet) {
            this.app.options.wallet.publicKey = await this.app.wallet.getPublicKey();
            this.app.options.wallet.privateKey = await this.app.wallet.getPrivateKey();
            this.app.options.wallet.balance = await this.app.wallet.getBalance();
        }
    }
    loadWallet() {
        throw new Error('Method not implemented.');
    }
    saveBlockchain() {
        throw new Error('Method not implemented.');
    }
    loadBlockchain() {
        throw new Error('Method not implemented.');
    }
    getMyServices() {
        let list = new peer_service_list_1.default();
        let result = this.app.network.getServices();
        result.forEach((s) => list.push(s));
        return list;
    }
    sendNewVersionAlert(major, minor, patch, peerIndex) {
        console.error('This is an older version', 'current version: ', this.app.wallet.version, ' expected version: ', major);
    }
    ensureDirExists(path) {
        if (fs_1.default.existsSync(path)) {
            return;
        }
        fs_1.default.mkdirSync(path);
    }
    sendNewChainDetectedEvent() {
        this.app.connection.emit('new-chain-detected');
    }
}
exports.NodeSharedMethods = NodeSharedMethods;
/**
 * Constructor
 */
class Server {
    constructor(app) {
        this.server = {
            host: '',
            port: 0,
            publicKey: '',
            protocol: '',
            name: '',
            url: '',
            block_fetch_url: '',
            endpoint: {
                host: '',
                port: 0,
                protocol: ''
            }
        };
        this.app = app;
        this.blocks_dir = path_1.default.join(__dirname, '../../../data/blocks/');
        this.web_dir = path_1.default.join(__dirname, '../../../web/');
        this.webserver = null;
        //this.io                         = null;
        this.server_file_encoding = 'utf8';
    }
    initializeWebSocketServer() {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ws = require('ws');
        const wss = new ws.WebSocketServer({
            noServer: true,
            path: '/wsopen'
        });
        webserver.on('upgrade', (request, socket, head) => {
            console.debug('connection upgrade ----> ' + request.url);
            const { pathname } = (0, url_1.parse)(request.url);
            if (pathname === '/wsopen') {
                wss.handleUpgrade(request, socket, head, (websocket) => {
                    wss.emit('connection', websocket, request);
                });
            }
        });
        webserver.on('error', (error) => {
            console.error('error on express : ', error);
        });
        wss.on('connection', (socket, request) => {
            const { pathname } = (0, url_1.parse)(request.url);
            console.log('connection established : ', request.headers['x-forwarded-for'] + ' || ' + request.socket.remoteAddress);
            index_node_1.default.getLibInstance()
                .get_next_peer_index()
                .then((peer_index) => {
                console.log('adding new peer : ' +
                    (request.headers['x-forwarded-for'] + request.socket.remoteAddress) +
                    ' as ' +
                    peer_index);
                index_node_1.default.getInstance().addNewSocket(socket, peer_index);
                socket.on('message', (buffer) => {
                    index_node_1.default.getLibInstance().process_msg_buffer_from_peer(new Uint8Array(buffer), peer_index);
                });
                socket.on('close', () => {
                    index_node_1.default.getLibInstance().process_peer_disconnection(peer_index);
                });
                socket.on('error', (error) => {
                    console.error('error on socket : ' + peer_index, error);
                    index_node_1.default.getLibInstance().process_peer_disconnection(peer_index);
                });
                return index_node_1.default.getLibInstance().process_new_peer(peer_index, request.headers['x-forwarded-for'] || request.socket.remoteAddress);
            });
        });
        this.app.modules.onWebSocketServer(webserver);
    }
    initialize() {
        const server_self = this;
        if (this.app.BROWSER === 1) {
            return;
        }
        //
        // update server information from options file
        //
        if (this.app.options.server != null) {
            this.server.host = this.app.options.server.host;
            this.server.port = this.app.options.server.port;
            this.server.protocol = this.app.options.server.protocol;
            this.server.name = this.app.options.server.name || '';
            this.server.sendblks =
                typeof this.app.options.server.sendblks == 'undefined'
                    ? 1
                    : this.app.options.server.sendblks;
            this.server.sendtxs =
                typeof this.app.options.server.sendtxs == 'undefined' ? 1 : this.app.options.server.sendtxs;
            this.server.sendgts =
                typeof this.app.options.server.sendgts == 'undefined' ? 1 : this.app.options.server.sendgts;
            this.server.receiveblks =
                typeof this.app.options.server.receiveblks == 'undefined'
                    ? 1
                    : this.app.options.server.receiveblks;
            this.server.receivetxs =
                typeof this.app.options.server.receivetxs == 'undefined'
                    ? 1
                    : this.app.options.server.receivetxs;
            this.server.receivegts =
                typeof this.app.options.server.receivegts == 'undefined'
                    ? 1
                    : this.app.options.server.receivegts;
        }
        //
        // sanity check
        //
        if (this.server.host === '' || this.server.port === 0) {
            console.log('Not starting local server as no hostname / port in options file');
            return;
        }
        //
        // init endpoint
        //
        if (this.app.options.server.endpoint != null) {
            this.server.endpoint.port = this.app.options.server.endpoint.port;
            this.server.endpoint.host = this.app.options.server.endpoint.host;
            this.server.endpoint.protocol = this.app.options.server.endpoint.protocol;
            this.server.endpoint.publicKey = this.app.options.server.publicKey;
        }
        else {
            const { host, port, protocol, publicKey } = this.server;
            this.server.endpoint = { host, port, protocol, publicKey };
            this.app.options.server.endpoint = {
                host,
                port,
                protocol,
                publicKey
            };
            console.log('SAVE OPTIONS IN SERVER');
            this.app.storage.saveOptions();
        }
        let url = this.server.endpoint.protocol;
        url += '://';
        url += this.server.endpoint.host;
        url += ':';
        url += this.server.endpoint.port;
        // url += "/block/";
        this.server.url = url;
        this.server.block_fetch_url = url;
        //
        // save options
        //
        this.app.options.server = Object.assign(this.app.options.server, this.server);
        console.log('SAVE OPTIONS IN SERVER 2');
        this.app.storage.saveOptions();
        //
        // enable cross origin polling for socket.io
        // - FEB 16 - replaced w/ upgrade to v3
        //
        //io.origins('*:*');
        // body-parser
        expressApp.use(body_parser_1.default.urlencoded({ extended: true }));
        expressApp.use(body_parser_1.default.json());
        /////////////////
        // full blocks //
        /////////////////
        expressApp.get('/blocks/:bhash/:pkey', async (req, res) => {
            const bhash = req.params.bhash;
            if (bhash == null) {
                return;
            }
            try {
                const blk = await this.app.blockchain.getBlock(bhash);
                if (!blk) {
                    console.info("Block block doesn't exist. cannot serve block. hash : " + bhash);
                    return;
                }
                console.info('serving block : ' + blk.file_name);
                const filename = './data/blocks/' + blk.file_name;
                // console.info("### write from line 188 of server.ts.");
                res.writeHead(200, {
                    'Content-Type': 'text/plain',
                    'Content-Transfer-Encoding': 'utf8'
                });
                const src = fs_1.default.createReadStream(filename, { encoding: 'utf8' });
                src.pipe(res);
            }
            catch (err) {
                //
                // file does not exist on disk, check in memory
                //
                //let blk = await this.app.blockchain.returnBlockByHash(bsh);
                console.error('FETCH BLOCKS ERROR SINGLE BLOCK FETCH: ', err);
                console.info('### write from line server.ts:422');
                res.status(400);
                res.end({
                    error: {
                        message: `FAILED SERVER REQUEST: could not find block: ${bhash}`
                    }
                });
            }
        });
        // //////////////////////
        // // full json blocks //
        // //////////////////////
        // app.get("/json-blocks/:bhash/:pkey", (req, res) => {
        //   const bhash = req.params.bhash;
        //   if (bhash == null) {
        //     return;
        //   }
        //
        //   try {
        //     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //     // @ts-ignore
        //     const blk = server_self.app.blockchain.blocks.get(bhash);
        //     if (!blk) {
        //       return;
        //     }
        //     const blkwtx = new Block(server_self.app);
        //     blkwtx.block = JSON.parse(JSON.stringify(blk.block));
        //     blkwtx.transactions = blk.transactions;
        //     blkwtx.app = null;
        //
        //     // console.info("### write from line 232 of server.ts.");
        //     res.writeHead(200, {
        //       "Content-Type": "text/plain",
        //       "Content-Transfer-Encoding": "utf8",
        //     });
        //     res.end(Buffer.from(JSON.stringify(blkwtx), "utf8"), "utf8");
        //   } catch (err) {
        //     //
        //     // file does not exist on disk, check in memory
        //     //
        //     //let blk = await this.app.blockchain.returnBlockByHash(bsh);
        //
        //     console.error("FETCH BLOCKS ERROR SINGLE BLOCK FETCH: ", err);
        //     // console.info("### write from line 188 of server.ts.");
        //     res.status(400);
        //     res.end({
        //       error: {
        //         message: `FAILED SERVER REQUEST: could not find block: ${bhash}`,
        //       },
        //     });
        //   }
        // });
        /////////////////
        // lite-blocks //
        /////////////////
        expressApp.get('/lite-block/:bhash/:pkey?', async (req, res) => {
            if (req.params.bhash == null) {
                return;
            }
            let pkey = await server_self.app.wallet.getPublicKey();
            if (req.params.pkey != null) {
                pkey = req.params.pkey;
                if (pkey.length == 66) {
                    pkey = (0, util_1.toBase58)(pkey);
                }
            }
            const bsh = req.params.bhash;
            let keylist = [];
            let peer = null;
            let peers = await this.app.network.getPeers();
            for (let i = 0; i < peers.length; i++) {
                try {
                    if (peers[i].publicKey === pkey) {
                        peer = peers[i];
                        break;
                    }
                }
                catch (error) {
                    console.error(error);
                }
            }
            if (peer == null) {
                keylist.push(pkey);
            }
            else {
                keylist = peer.keyList;
                if (!keylist.includes(pkey)) {
                    keylist.push(pkey);
                }
            }
            //
            // SHORTCUT hasKeylistTransactions returns (1 for yes, 0 for no, -1 for unknown)
            // if we have this block but there are no transactions for it in the block hashmap
            // then we just fetch the block header from memory and serve that.
            //
            // this avoids the need to run blk.returnLiteBlock because we know there are no
            // transactions and thus no need for lite-clients that are not fully-validating
            // the entire block to calculate the merkle root.
            //
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            //
            const block = await this.app.blockchain.getBlock(bsh);
            if (!block) {
                console.log(`block : ${bsh} doesn't exist...`);
                if (!res.finished) {
                    res.sendStatus(404);
                }
                return;
            }
            if (block.block_type === block_2.BlockType.Full || !block.hasKeylistTxs(keylist)) {
                const liteblock = block.generateLiteBlock(keylist);
                const buffer = Buffer.from(liteblock.serialize());
                if (!res.finished) {
                    res.writeHead(200, {
                        'Content-Type': 'text/plain',
                        'Content-Transfer-Encoding': 'utf8'
                    });
                    return res.end(buffer, 'utf8');
                }
                return;
            }
            console.log('loading block from disk : ' + bsh);
            let methods = new NodeSharedMethods(this.app);
            //
            // TODO - load from disk to ensure we have txs -- slow.
            //
            try {
                let buffer = new Uint8Array();
                let list = methods.loadBlockFileList();
                for (let filename of list) {
                    if (filename.includes(bsh)) {
                        buffer = methods.readValue('./data/blocks/' + filename);
                        break;
                    }
                }
                if (buffer.byteLength == 0) {
                    if (!res.finished) {
                        return res.sendStatus(404);
                    }
                    return;
                }
                let blk = new block_1.default();
                blk.deserialize(buffer);
                const newblk = blk.generateLiteBlock(keylist);
                console.log(`lite block fetch : block  = ${req.params.bhash} key = ${pkey} with txs : ${newblk.transactions.length}`);
                console.log(`liteblock : ${bsh} from disk txs count = : ${newblk.transactions.length}`);
                console.log('valid txs : ' +
                    newblk.transactions.filter((tx) => tx.type !== transaction_2.TransactionType.SPV).length);
                const buffer2 = Buffer.from(newblk.serialize());
                if (!res.finished) {
                    res.writeHead(200, {
                        'Content-Type': 'text/plain',
                        'Content-Transfer-Encoding': 'utf8'
                    });
                    return res.end(buffer2);
                }
                return;
            }
            catch (error) {
                console.log('failed serving lite block : ' + bsh);
                console.error(error);
            }
            try {
                if (!res.finished) {
                    res.sendStatus(400);
                }
                return;
            }
            catch (error) {
                console.error(error);
            }
        });
        expressApp.get('/block/:hash', async (req, res) => {
            try {
                const hash = req.params.hash;
                // console.debug("server giving out block : " + hash);
                if (!hash) {
                    console.warn('hash not provided');
                    if (!res.finished) {
                        return res.sendStatus(400); // Bad request
                    }
                }
                const block = await this.app.blockchain.loadBlockAsync(hash);
                let buffer = block.serialize();
                if (!block) {
                    console.warn('block not found for : ' + hash);
                    if (!res.finished) {
                        return res.sendStatus(404); // Not Found
                    }
                    return;
                }
                console.info('serving block : ' + block.id + '-' + block.hash);
                if (!res.finished) {
                    res.status(200);
                    res.end(buffer);
                }
            }
            catch (err) {
                console.log('ERROR: server cannot feed out block');
                if (!res.finished) {
                    return res.sendStatus(404);
                }
            }
        });
        expressApp.get('/balance/:keys?', async (req, res) => {
            try {
                let keys = [];
                if (req.params.keys) {
                    keys = req.params.keys.split(';');
                }
                keys = keys.map((key) => {
                    if (key.length === 66) {
                        return (0, util_1.toBase58)(key);
                    }
                    return key;
                });
                // console.log('fetching balance snapshot with keys : ', keys);
                const snapshot = await index_node_1.default.getInstance().getBalanceSnapshot(keys);
                res.setHeader('Content-Disposition', 'attachment; filename=' + snapshot.file_name);
                res.end(snapshot.toString());
            }
            catch (error) {
                console.error(error);
                if (!res.finished) {
                    return res.sendStatus(404);
                }
                return;
            }
        });
        // app.get("/json-block/:hash", async (req, res) => {
        //   try {
        //     const hash = req.params.hash;
        //     console.debug("server giving out block : " + hash);
        //
        //     if (!hash) {
        //       console.warn("hash not provided");
        //       return res.sendStatus(400); // Bad request
        //     }
        //
        //     const block = await this.app.blockchain.loadBlockAsync(hash);
        //     if (!block) {
        //       console.warn("block not found for : " + hash);
        //       return res.sendStatus(404); // Not Found
        //     }
        //
        //     let block_to_return = { block: {}, transactions: {} };
        //     if (block?.block) {
        //       block_to_return.block = JSON.parse(JSON.stringify(block.block));
        //     }
        //     if (block?.transactions) {
        //       block_to_return.transactions = JSON.parse(JSON.stringify(block.transactions));
        //     }
        //
        //     let buffer = JSON.stringify(block_to_return).toString("utf-8");
        //     buffer = Buffer.from(buffer, "utf-8");
        //
        //     res.status(200);
        //     console.info("### write from server.ts:637");
        //     console.log("serving block .. : " + hash + " , buffer size : " + buffer.length);
        //     res.end(buffer);
        //   } catch (err) {
        //     console.log("ERROR: server cannot feed out block");
        //   }
        // });
        expressApp.get('/lite-block-disk/:bhash/:pkey?', async (req, res) => {
            if (req.params.bhash == null) {
                return;
            }
            let pkey = await server_self.app.wallet.getPublicKey();
            if (req.params.pkey != null) {
                pkey = req.params.pkey;
                if (pkey.length == 66) {
                    pkey = (0, util_1.toBase58)(pkey);
                }
            }
            const bsh = req.params.bhash;
            let keylist = [];
            let peer = null;
            let peers = await this.app.network.getPeers();
            for (let i = 0; i < peers.length; i++) {
                try {
                    if (peers[i].publicKey === pkey) {
                        peer = peers[i];
                        break;
                    }
                }
                catch (error) {
                    console.error(error);
                }
            }
            if (peer == null) {
                keylist.push(pkey);
            }
            else {
                keylist = peer.keyList;
                if (!keylist.includes(pkey)) {
                    keylist.push(pkey);
                }
            }
            let methods = new NodeSharedMethods(this.app);
            //
            // TODO - load from disk to ensure we have txs -- slow.
            //
            try {
                let buffer = new Uint8Array();
                let list = methods.loadBlockFileList();
                for (let filename of list) {
                    if (filename.includes(bsh)) {
                        buffer = methods.readValue('./data/blocks/' + filename);
                        break;
                    }
                }
                if (buffer.byteLength == 0) {
                    if (!res.finished) {
                        return res.sendStatus(404);
                    }
                    return;
                }
                let blk = new block_1.default();
                blk.deserialize(buffer);
                const newblk = blk.generateLiteBlock(keylist);
                let block = JSON.parse(newblk.toJson());
                var html = '<div class="block-table">';
                html += '<div><h4>id</h4></div><div>' + block.id + '</div>';
                html += '<div><h4>hash</h4></div><div>' + bsh + '</div>';
                html += '<div><h4>creator</h4></div><div>' + block.creator + '</div>';
                html +=
                    '<div><h4>source</h4></div><div><a href="/explorer/blocksource?hash=' +
                        bsh +
                        '">click to view source</a></div>';
                html += '</div>';
                if (block.transactions.length > 0) {
                    let nolan_per_saito = 100000000;
                    html += '<h3>Bundled Transactions:</h3></div>';
                    html += '<div class="block-transactions-table">';
                    html += '<div class="table-header">id</div>';
                    html += '<div class="table-header">sender</div>';
                    html += '<div class="table-header">fee</div>';
                    html += '<div class="table-header">type</div>';
                    html += '<div class="table-header">module</div>';
                    for (var mt = 0; mt < block.transactions.length; mt++) {
                        var tmptx = block.transactions[mt];
                        tmptx.id = mt;
                        var tx_fees = 0;
                        //if (tmptx.fees_total == "") {
                        //
                        // sum inputs
                        //
                        let inputs = 0;
                        if (tmptx.from != null) {
                            for (let v = 0; v < tmptx.from.length; v++) {
                                inputs += tmptx.from[v].amount;
                            }
                        }
                        //
                        // sum outputs
                        //
                        let outputs = 0;
                        for (let v = 0; v < tmptx.to.length; v++) {
                            //
                            // only count non-gt transaction outputs
                            //
                            if (tmptx.to[v].type != 1 && tmptx.to[v].type != 2) {
                                outputs += tmptx.to[v].amount;
                            }
                        }
                        tx_fees = inputs - outputs;
                        //}
                        let tx_from = 'fee tx';
                        if (tmptx.from.length > 0) {
                            tx_from = tmptx.from[0].publicKey;
                        }
                        else if (tmptx.type === 6) {
                            tx_from = 'issuance tx';
                            tx_fees = 0;
                        }
                        else if (tmptx.type === 7) {
                            tx_from = 'block stake tx';
                        }
                        html +=
                            `<div><a onclick="showTransaction('tx-` + tmptx.id + `');">` + mt + `</a></div>`;
                        html +=
                            `<div><a onclick="showTransaction('tx-` + tmptx.id + `');">` + tx_from + `</a></div>`;
                        html += '<div>' + tx_fees * nolan_per_saito + '</div>';
                        html += '<div>' + tmptx.type + '</div>';
                        if (tmptx.type == 0) {
                            if (tmptx.msg?.module) {
                                html += '<div>' + tmptx.msg?.module + '</div>';
                            }
                            else {
                                html += '<div>Money</div>';
                            }
                        }
                        if (tmptx.type == 1) {
                            html += '<div>' + tmptx.msg?.name + '</div>';
                        }
                        if (tmptx.type > 1) {
                            html += '<div> </div>';
                        }
                        html +=
                            '<div class="hidden txbox tx-' + tmptx.id + '">' + JSON.stringify(tmptx) + '</div>';
                    }
                    html += '</div>';
                }
                let obj = JSON.stringify({ html: html });
                if (!res.finished) {
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Content-Transfer-Encoding': 'UTF-8'
                    });
                    return res.end(obj);
                }
                return;
            }
            catch (error) {
                console.log('failed serving lite block : ' + bsh);
                console.error(error);
            }
        });
        /////////
        // web //
        /////////
        expressApp.get('/options', (req, res) => {
            //this.app.storage.saveClientOptions();
            // res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
            // res.setHeader("expires","-1");
            // res.setHeader("pragma","no-cache");
            // @ts-ignore
            res.send(this.app.storage.getClientOptions());
            // const client_options_file = this.web_dir + 'client.options';
            // if (!fs.existsSync(client_options_file)) {
            //     const fd = fs.openSync(client_options_file, 'w');
            //     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            //     // @ts-ignore
            //     fs.writeSync(
            //         fd,
            //         // @ts-ignore
            //         this.app.storage.getClientOptions(),
            //         // @ts-ignore
            //         this.server_file_encoding
            //     );
            //     fs.closeSync(fd);
            // }
            // if (!res.finished) {
            //     return res.sendFile(client_options_file);
            // }
        });
        expressApp.get('/r', (req, res) => {
            if (!res.finished) {
                return res.sendFile(this.web_dir + 'refer.html');
            }
            return;
        });
        // TODO : add a env variable? to enable this testing feature
        if (false) {
            this.provideTesterAPI(expressApp);
        }
        // expressApp.get("/check-build", (req, res) => {
        //   // res.sendFile(this.web_dir);
        //   this.app.modules.webServer(expressApp, express);
        //   res.send()
        // })
        expressApp.get('/saito/saito.js', (req, res) => {
            //
            // may be useful in the future, if we gzip
            // files before releasing for production
            //
            // gzipped, cached
            //
            //res.setHeader("Cache-Control", "public");
            //res.setHeader("Content-Encoding", "gzip");
            //res.setHeader("Content-Length", "368432");
            //res.sendFile(server_self.web_dir + 'saito.js.gz');
            //
            // non-gzipped, cached
            //
            //res.setHeader("Cache-Control", "public");
            //res.setHeader("expires","72000");
            //res.sendFile(server_self.web_dir + '/dist/saito.js');
            //
            // caching in prod
            //
            /*** No longer needed as handled by nginx.
            const caching =
            process.env.NODE_ENV === "prod"
              ? "private max-age=31536000"
              : "private, no-cache, no-store, must-revalidate";
              res.setHeader("Cache-Control", caching);
              res.setHeader("expires", "-1");
              res.setHeader("pragma", "no-cache");
            ****/
            if (!res.finished) {
                return res.sendFile(this.web_dir + '/saito/saito.js');
            }
            return;
        });
        expressApp.get('/stats', async (req, res) => {
            let stat = await index_node_1.default.getLibInstance().get_stats();
            res.send(stat);
        });
        expressApp.get('/stats/peers', async (req, res) => {
            let stat = await index_node_1.default.getLibInstance().get_peer_stats();
            res.send(stat);
        });
        expressApp.get('/stats/congestion', async (req, res) => {
            let stat = await index_node_1.default.getLibInstance().get_congestion_stats();
            res.send(stat);
        });
        //
        // make root directory recursively servable
        expressApp.use(express_1.default.static(this.web_dir));
        //
        /////////////
        // modules //
        /////////////
        //
        // res.write -- have to use res.end()
        // res.send --- is combination of res.write() and res.end()
        //
        this.app.modules.webServer(expressApp, express_1.default);
        // Default for base directory (can be overridden by a module)
        expressApp.get('/', (req, res) => {
            if (!res.finished) {
                return res.sendFile(`${this.web_dir}index_default.html`);
            }
            return;
        });
        expressApp.get('*', (req, res) => {
            if (!res.finished) {
                return res.sendFile(`${this.web_dir}404.html`);
            }
            return;
        });
        this.initializeWebSocketServer();
        webserver.listen(this.server.port, () => {
            console.log('web server is listening');
        });
        this.webserver = webserver;
        this.app.connection.emit('saito-server-listening');
    }
    close() {
        this.webserver.close();
    }
    //
    // servers can fetch open graph graphics (of links in tweets)
    //
    async fetchOpenGraphProperties(link, callback = null) {
        return (0, node_fetch_1.default)(link, { redirect: 'follow', follow: 50 })
            .then((res) => {
            if (res.ok) {
                return res.text();
            }
            else
                throw new Error(`Response status: ${res.status}`);
        })
            .then((data) => {
            let no_tags = {
                title: '',
                description: ''
            };
            let og_tags = {
                'og:title': '',
                'og:description': '',
                'og:url': '',
                'og:image': '',
                'og:site_name': '', //We don't do anything with this
                'saito:description': '',
                'saito:title': ''
            };
            let tw_tags = {
                'twitter:title': '',
                'twitter:description': '',
                'twitter:url': '',
                'twitter:image': '',
                'twitter:site': '', //We don't do anything with this
                'twitter:card': '' //We don't do anything with this
            };
            let has_og = false;
            let has_twitter = false;
            // prettify html - unminify html if minified
            let html = (0, html_prettify_1.default)(data);
            //Useful to check, don't delete until perfect
            //let testReg = /<head>.*<\/head>/gs;
            //console.log(html.match(testReg));
            // parse string html to DOM html
            let dom = node_html_parser_1.default.parse(html);
            try {
                no_tags.title = dom.getElementsByTagName('title')[0].textContent;
            }
            catch (err) { }
            // fetch meta element for og tags
            let meta_tags = dom.getElementsByTagName('meta');
            // loop each meta tag and fetch required og properties
            for (let i = 0; i < meta_tags.length; i++) {
                let property = meta_tags[i].getAttribute('property');
                let content = meta_tags[i].getAttribute('content');
                // get required og properties only, discard others
                if (property in og_tags) {
                    og_tags[property] = content;
                    has_og = true;
                }
                if (property in tw_tags) {
                    tw_tags[property] = content;
                    has_twitter = true;
                }
                if (meta_tags[i].getAttribute('name') === 'description') {
                    no_tags.description = content;
                }
            }
            //
            // Map twitter tags to open graph if only have twitter
            //
            if (has_twitter && !has_og) {
                og_tags['og:title'] = tw_tags['twitter:title'];
                og_tags['og:description'] = tw_tags['twitter:description'];
                og_tags['og:url'] = tw_tags['twitter:url'];
                og_tags['og:image'] = tw_tags['twitter:image'];
                og_tags['og:site_name'] = tw_tags['twitter:site'];
            }
            // fallback to no tags if still blank...
            og_tags['og:title'] = og_tags['og:title'] || no_tags['title'];
            og_tags['og:description'] = og_tags['og:description'] || no_tags['description'];
            if (callback) {
                callback(og_tags);
            }
            return og_tags;
        })
            .catch((err) => {
            //console.error('browser.fetchOpenGraph Error: ', err);
            return '';
        });
    }
    provideTesterAPI(express) {
        express.get('/test-api/block/latest', async (req, res) => {
            let hash = await this.app.blockchain.getLastBlockHash();
            console.log('test-api : fetching latest block : ' + hash);
            let block = await index_node_1.default.getInstance().getBlock(hash);
            if (block) {
                // @ts-ignore
                res.send({ hash: block.hash, id: block.id, previousBlockHash: block.previousBlockHash });
            }
            else {
                console.log('test-api : block not found');
                res.sendStatus(404);
            }
        });
        express.get('/test-api/transfer/:to/:amt', async (req, res) => {
            let to = req.params.to;
            let amt = req.params.amt;
            let tx = await index_node_1.default.getInstance().createTransaction(to, amt, BigInt(0));
            await tx.sign();
            await index_node_1.default.getInstance().propagateTransaction(tx);
            res.send({});
        });
        express.get('/test-api/status', async (req, res) => {
            res.send({});
        });
        express.get('/test-api/balances', async (req, res) => {
            let balances = await index_node_1.default.getInstance().getBalanceSnapshot([]);
            res.send(balances);
        });
    }
}
exports.default = Server;
//# sourceMappingURL=server.js.map