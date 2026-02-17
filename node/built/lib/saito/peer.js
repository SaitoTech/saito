"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const peer_1 = __importDefault(require("saito-js/lib/peer"));
class Peer extends peer_1.default {
    constructor(data, peerIndex) {
        super(data, peerIndex);
    }
}
exports.default = Peer;
//# sourceMappingURL=peer.js.map