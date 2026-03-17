const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const sidecarRoot = __dirname;
const saitoJsRoot = path.resolve(sidecarRoot, "../../../../saito-js/dist");
const saitoJsNodeModulesRoot = path.resolve(sidecarRoot, "../../../../saito-js/node_modules");

const { initialize, default: Saito } = require(path.join(saitoJsRoot, "index.node.js"));
const Factory = require(path.join(saitoJsRoot, "lib/factory.js")).default;
const CustomSharedMethods = require(path.join(
  saitoJsRoot,
  "lib/custom/custom_shared_methods.js",
)).default;
const NetworkPeer = require(path.join(saitoJsRoot, "lib/network_peer.js")).default;
const PeerServiceList = require(path.join(saitoJsRoot, "lib/peer_service_list.js")).default;

const WebSocketImpl = globalThis.WebSocket || require(path.join(saitoJsNodeModulesRoot, "ws"));
const fetchImpl = globalThis.fetch || require(path.join(saitoJsNodeModulesRoot, "node-fetch"));

const HOST = process.env.SAITO_SIDECAR_HOST || "127.0.0.1";
const PORT = Number(process.env.SAITO_SIDECAR_PORT || "3001");
const DATA_DIR =
  process.env.SAITO_SIDECAR_DATA_DIR || path.resolve(process.cwd(), ".saito-python");

const state = {
  ready: false,
  started: false,
  error: null,
  initializedAt: null,
  connectRequests: [],
  interfaceEvents: [],
};

let sharedMethodsInstance = null;

class NodeSidecarSharedMethods extends CustomSharedMethods {
  constructor(dataDir) {
    super();
    this.dataDir = dataDir;
  }

  getMyServices() {
    return new PeerServiceList();
  }

  connectToPeer(url) {
    try {
      const socketUrl = toWebSocketUrl(url);
      const socket = new WebSocketImpl(socketUrl);
      socket.binaryType = "arraybuffer";
      const peer = new NetworkPeer(undefined, socketUrl);
      peer.socket = socket;
      state.connectRequests.push(url);

      socket.onmessage = (event) => {
        try {
          const raw = event.data instanceof ArrayBuffer ? Buffer.from(event.data) : Buffer.from(event.data);
          Saito.getRuntimeInstance()
            .process_msg_buffer_from_peer(raw, peer.instance)
            .then((buffer) => {
              if (buffer && buffer.byteLength > 0) {
                socket.send(buffer);
              }
              if (peer.publicKey && !Saito.getInstance().peers.has(peer.publicKey)) {
                Saito.getInstance().peers.set(peer.publicKey, peer);
              }
            })
            .catch((error) => {
              console.error("processing incoming message buffer failed", error);
            });
        } catch (error) {
          console.error("socket.onmessage failed", error);
        }
      };

      socket.onclose = () => {
        try {
          if (peer.publicKey) {
            Saito.getRuntimeInstance().process_peer_disconnection(peer.publicKey);
          }
        } catch (error) {
          console.error("socket.onclose failed", error);
        }
      };

      socket.onerror = (error) => {
        console.error("socket.onerror", error);
        if (peer.publicKey) {
          Saito.getInstance().removeSocket(peer.publicKey);
        }
      };
    } catch (error) {
      console.error("connectToPeer failed", error);
    }
  }

  disconnectFromPeer(publicKey) {
    Saito.getInstance().removeSocket(publicKey);
  }

  async fetchBlockFromPeer(url) {
    const response = await fetchImpl(url);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  ensureDirExists(dirPath) {
    fs.mkdirSync(this.resolvePath(dirPath), { recursive: true });
  }

  writeValue(key, value) {
    const filePath = this.resolvePath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(value));
  }

  appendValue(key, value) {
    const filePath = this.resolvePath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, Buffer.from(value));
  }

  flushData(_key) {}

  readValue(key) {
    const filePath = this.resolvePath(key);
    if (!fs.existsSync(filePath)) {
      return new Uint8Array();
    }
    return new Uint8Array(fs.readFileSync(filePath));
  }

  loadBlockFileList() {
    return [];
  }

  isExistingFile(key) {
    return fs.existsSync(this.resolvePath(key));
  }

  removeValue(key) {
    const filePath = this.resolvePath(key);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }

  sendMessage(publicKey, buffer) {
    const socket = Saito.getInstance().getSocket(publicKey);
    if (socket) {
      socket.send(buffer);
    }
  }

  sendMessageToAll(buffer, exceptions) {
    Saito.getInstance().peers.forEach((peer, key) => {
      if (exceptions.includes(key) || !peer.socket) {
        return;
      }
      peer.socket.send(buffer);
    });
  }

  async processApiCall(_buffer, _msgIndex, _publicKey) {}

  processApiSuccess(_buffer, _msgIndex, _publicKey) {}

  processApiError(_buffer, _msgIndex, _publicKey) {}

  sendInterfaceEvent(event, publicKey) {
    state.interfaceEvents.push({ event, publicKey });
  }

  sendBlockFetchStatus(_count) {}

  sendNewVersionAlert(_major, _minor, _patch, _publicKey) {}

  sendBlockSuccess(_hash, _blockId) {}

  sendWalletUpdate() {}

  saveWallet(_wallet) {}

  loadWallet(_wallet) {}

  saveBlockchain(_blockchain) {}

  loadBlockchain(_blockchain) {}

  sendNewChainDetectedEvent() {}

  resolvePath(key) {
    const stripped = String(key).replace(/^\/+/, "");
    return path.resolve(this.dataDir, stripped);
  }
}

function toWebSocketUrl(url) {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return url;
  }
  if (url.startsWith("http://")) {
    return `ws://${url.slice("http://".length)}`;
  }
  if (url.startsWith("https://")) {
    return `wss://${url.slice("https://".length)}`;
  }
  return `ws://${url}`;
}

async function initializeRuntimeFromEnv() {
  const configJson = process.env.SAITO_CONFIG_JSON || JSON.stringify({});
  const privateKey = process.env.SAITO_PRIVATE_KEY || "";
  const logLevelNum = Number(process.env.SAITO_LOG_LEVEL_NUM || "2");
  const hasteMultiplier = BigInt(process.env.SAITO_HASTE_MULTIPLIER || "1");
  const deleteOldBlocks = (process.env.SAITO_DELETE_OLD_BLOCKS || "false") === "true";

  sharedMethodsInstance = new NodeSidecarSharedMethods(DATA_DIR);
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await initialize(
    JSON.parse(configJson),
    sharedMethodsInstance,
    new Factory(),
    privateKey,
    logLevelNum,
    hasteMultiplier,
    deleteOldBlocks,
  );
  Saito.getInstance().start();
  state.ready = true;
  state.started = true;
  state.initializedAt = new Date().toISOString();
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return writeJson(res, 200, {
        status: state.error ? "error" : "ok",
        ready: state.ready,
        started: state.started,
        error: state.error,
        initialized_at: state.initializedAt,
      });
    }

    if (!state.ready) {
      return writeJson(res, 503, { error: state.error || "runtime not ready" });
    }

    if (req.method === "GET" && url.pathname === "/wallet") {
      const wallet = await Saito.getInstance().getWallet();
      return writeJson(res, 200, {
        public_key: await wallet.getPublicKey(),
        balance: Number(await wallet.getBalance()),
      });
    }

    if (req.method === "GET" && url.pathname === "/blocks/latest-hash") {
      return writeJson(res, 200, {
        hash: await Saito.getInstance().getLatestBlockHash(),
      });
    }

    if (req.method === "POST" && url.pathname === "/transactions/create") {
      const body = await readJsonBody(req);
      const wallet = await Saito.getInstance().getWallet();
      const tx = await Saito.getInstance().createTransaction(
        body.recipient || "",
        BigInt(body.amount || 0),
        BigInt(body.fee || 0),
        Boolean(body.force_merge),
      );
      tx.msg = body.metadata || {};
      await tx.sign();
      return writeJson(res, 200, {
        signature: tx.signature,
        sender: await wallet.getPublicKey(),
        recipient: body.recipient || "",
        amount: Number(body.amount || 0),
        metadata: body.metadata || {},
      });
    }

    if (req.method === "POST" && url.pathname === "/peers/connect") {
      const body = await readJsonBody(req);
      const peerUrl = String(body.peer_url || "");
      if (!peerUrl) {
        return writeJson(res, 400, { error: "peer_url is required" });
      }
      sharedMethodsInstance.connectToPeer(peerUrl);
      return writeJson(res, 202, { status: "connecting", peer_url: peerUrl });
    }

    if (req.method === "GET" && url.pathname === "/peers") {
      return writeJson(res, 200, {
        peers: Array.from(Saito.getInstance().peers.keys()),
        requested: state.connectRequests,
      });
    }

    if (req.method === "POST" && url.pathname === "/shutdown") {
      writeJson(res, 200, { status: "shutting-down" });
      setTimeout(() => {
        server.close(() => process.exit(0));
      }, 10);
      return;
    }

    return writeJson(res, 404, { error: "not found" });
  } catch (error) {
    console.error(error);
    return writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res);
});

initializeRuntimeFromEnv()
  .catch((error) => {
    console.error("failed to initialize sidecar", error);
    state.error = error instanceof Error ? error.message : String(error);
  })
  .finally(() => {
    server.listen(PORT, HOST, () => {
      console.log(`saito-python sidecar listening on http://${HOST}:${PORT}`);
    });
  });