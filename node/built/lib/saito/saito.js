"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const binary_1 = __importDefault(require("./binary"));
// import blockring0 from "./blockring";
const blockchain_1 = __importDefault(require("./blockchain"));
const block_1 = __importDefault(require("./block"));
const browser_1 = __importDefault(require("./browser"));
// import burnfee0 from "./burnfee";
const connection_1 = __importDefault(require("./connection"));
const crypto_1 = __importDefault(require("./crypto"));
// import hop0 from "./hop";
// import goldenticket0 from "./goldenticket";
const keychain_1 = __importDefault(require("./keychain"));
// import miner0 from "./miner";
const modules_1 = __importDefault(require("./modules"));
// import mempool0 from "./mempool";
const network_1 = __importDefault(require("./network"));
// import networkapi from "./networkapi";
const peer_1 = __importDefault(require("./peer"));
const storage_1 = __importDefault(require("./storage"));
const server_1 = __importDefault(require("./server"));
// import utxoset0 from "./utxoset";
const slip_1 = __importDefault(require("./slip"));
const transaction_1 = __importDefault(require("./transaction"));
const wallet_1 = __importDefault(require("./wallet"));
BigInt.prototype.toJSON = function () {
    return this.toString();
};
class SaitoCommon {
}
SaitoCommon.binary = binary_1.default;
SaitoCommon.block = block_1.default;
SaitoCommon.blockchain = blockchain_1.default;
// static blockring = blockring0;
SaitoCommon.browser = browser_1.default;
// static burnfee = burnfee0;
SaitoCommon.connection = connection_1.default;
SaitoCommon.crypto = crypto_1.default;
// static hop = hop0;
// static goldenticket = goldenticket0;
SaitoCommon.keychain = keychain_1.default;
// static miner = miner0;
SaitoCommon.modules = modules_1.default;
// static mempool = mempool0;
SaitoCommon.network = network_1.default;
// static networkApi = networkapi;
SaitoCommon.peer = peer_1.default;
SaitoCommon.storage = storage_1.default;
SaitoCommon.server = server_1.default;
// static utxoset = utxoset0;
SaitoCommon.slip = slip_1.default;
SaitoCommon.transaction = transaction_1.default;
SaitoCommon.wallet = wallet_1.default;
exports.default = SaitoCommon;
//# sourceMappingURL=saito.js.map