"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const block_1 = __importDefault(require("saito-js/lib/block"));
class Block extends block_1.default {
    constructor(data = undefined) {
        super(data);
        // this.lc = false;
        this.force = false; // set to true if "force" loaded -- used to avoid duplicating callbacks
        this.txs_hmap = new Map();
        this.txs_hmap_generated = false;
        this.has_examined_block = false;
    }
}
exports.default = Block;
//# sourceMappingURL=block.js.map