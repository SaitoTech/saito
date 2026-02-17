"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const saito_1 = __importDefault(require("saito-js/saito"));
exports.default = async (saito) => {
    saito.hash = (data) => saito_1.default.hash(data);
    // if (!saito.BROWSER) {
    //   // eslint-disable-next-line @typescript-eslint/no-var-requires
    //   const blake3 = require("blake3");
    //   saito.hash = (data) => {
    //     return blake3.hash(data).toString("hex");
    //   };
    // } else {
    //   const blake3 = await import("blake3/browser");
    //   saito.hash = (data) => {
    //     // console.log(blake3);
    //     // console.log(data);
    //     return blake3.hash(data).toString("hex");
    //   };
    //
    // }
};
//# sourceMappingURL=hash-loader.js.map