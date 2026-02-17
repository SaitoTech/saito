"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const factory_1 = __importDefault(require("saito-js/lib/factory"));
const block_1 = __importDefault(require("./block"));
const peer_1 = __importDefault(require("./peer"));
const slip_1 = __importDefault(require("./slip"));
const transaction_1 = __importDefault(require("./transaction"));
const wallet_1 = __importDefault(require("./wallet"));
const blockchain_1 = __importDefault(require("./blockchain"));
class Factory extends factory_1.default {
    constructor() {
        super();
    }
    createBlock(data) {
        return new block_1.default(data);
    }
    createTransaction(data) {
        return new transaction_1.default(data);
    }
    createSlip(data) {
        return new slip_1.default(data);
    }
    createPeer(data) {
        return new peer_1.default(data);
    }
    createWallet(data) {
        return new wallet_1.default(data);
    }
    createBlockchain(data) {
        return new blockchain_1.default(data);
    }
}
exports.default = Factory;
//# sourceMappingURL=factory.js.map