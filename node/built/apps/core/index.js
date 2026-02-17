"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saito_lib = exports.Saito = exports.parseLogLevel = void 0;
const saito_1 = __importDefault(require("../../lib/saito/saito"));
exports.saito_lib = saito_1.default;
const binary_1 = __importDefault(require("../../lib/saito/binary"));
const crypto_1 = __importDefault(require("../../lib/saito/crypto"));
const connection_1 = __importDefault(require("../../lib/saito/connection"));
const browser_1 = __importDefault(require("../../lib/saito/browser"));
const keychain_1 = __importDefault(require("../../lib/saito/keychain"));
const storage_1 = __importDefault(require("../../lib/saito/storage"));
const build_json_1 = __importDefault(require("../../config/build/build.json"));
const saito_2 = __importStar(require("saito-js/saito"));
const network_1 = __importDefault(require("../../lib/saito/network"));
const hash_loader_1 = __importDefault(require("./hash-loader"));
const path = require('path');
// let args =
function parseLogLevel(logLevel) {
    if (logLevel) {
        switch (logLevel) {
            case 'error':
                return saito_2.LogLevel.Error;
            case 'warn':
                return saito_2.LogLevel.Warn;
            case 'info':
                return saito_2.LogLevel.Info;
            case 'debug':
                return saito_2.LogLevel.Debug;
            case 'trace':
                return saito_2.LogLevel.Trace;
            default:
                throw new Error('Invalid log level');
        }
    }
    else {
        return saito_2.LogLevel.Info;
    }
}
exports.parseLogLevel = parseLogLevel;
class Saito {
    constructor(config = {}) {
        this.options = {};
        this.BROWSER = 1;
        this.SPVMODE = 0;
        this.build_number = Number(build_json_1.default.build_number);
        this.options = config;
        this.newSaito();
        // TODO : where does this mod_paths come from?
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.modules = new saito_1.default.modules(this, config.mod_paths);
        return this;
    }
    newSaito() {
        this.binary = new binary_1.default(this);
        this.crypto = new crypto_1.default();
        this.connection = new connection_1.default();
        this.browser = new browser_1.default(this);
        this.storage = new storage_1.default(this);
        // this.wallet = new Wallet(undefined,this);
        this.keychain = new keychain_1.default(this);
        this.network = new network_1.default(this);
        // this.networkApi = new NetworkAPI(this);
        // this.blockchain = new Blockchain(undefined);
    }
    async init() {
        try {
            // await this.storage.initialize();
            //
            // import hashing library here because of complications with both
            // performant blake3 library and less performant blake3-js that neeeds
            // to run in the browser but cannot be deployed via WASM.
            //
            await (0, hash_loader_1.default)(this);
            console.log('initializing wallet....');
            await this.wallet.initialize();
            console.log('initializing keychain....');
            await this.keychain.initialize();
            console.log('mapping modules...');
            this.modules.mods = this.modules.mods_list.map((mod_path) => {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                console.log('Installing: ', mod_path);
                const Module = require(`./../../mods/${mod_path}`);
                const x = new Module(this);
                x.dirname = path.dirname(mod_path);
                return x;
            });
            console.log('setting current version : ' + this.wallet.version);
            await saito_2.default.getInstance().setWalletVersion(0, Math.floor(this.wallet.version), (this.wallet.version * 1000) % 1000);
            // browser sets active module
            await this.browser.initialize(this);
            await this.modules.initialize();
            // blockchain after modules create dbs
            await this.blockchain.initialize();
            this.network.initialize();
            if (this.server) {
                this.server.initialize();
            }
        }
        catch (err) {
            console.error('Error occured initializing your Saito install. The most likely cause of this is a module that is throwing an error on initialization. You can debug this by removing modules from your config file to test which ones are causing the problem and restarting.');
            console.error(err);
        }
    }
    async reset(config) {
        console.log('resetting saito instance');
        this.options = config;
        this.newSaito();
        await this.init();
    }
    shutdown() {
        // TODO : couldn't find close method implementation
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.network.close();
    }
}
exports.Saito = Saito;
//# sourceMappingURL=index.js.map