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
const server_1 = __importStar(require("../lib/saito/core/server"));
const storage_core_1 = __importDefault(require("../lib/saito/core/storage-core"));
const index_1 = require("../apps/core/index");
const index_node_1 = __importStar(require("saito-js/index.node"));
const modules_config_js_1 = __importDefault(require("../config/modules.config.js"));
const process_1 = __importDefault(require("process"));
const factory_1 = __importDefault(require("../lib/saito/factory"));
function getCommandLineArg(key) {
    const prefix = key + '=';
    const arg = process_1.default.argv.find((arg) => arg.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : null;
}
async function initSaito() {
    Error.stackTraceLimit = 20;
    const app = new index_1.Saito({
        mod_paths: modules_config_js_1.default.core
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    app.storage = new storage_core_1.default(app);
    app.BROWSER = 0;
    app.SPVMODE = 0;
    // set basedir
    global.__webdir = __dirname + '/lib/saito/web/';
    await app.storage.initialize();
    let privateKey = app.options.wallet?.privateKey || '';
    let logLevelArg = getCommandLineArg('l') || getCommandLineArg('loglevel');
    let envLogLevel = process_1.default.env.SAITO_LOG_LEVEL;
    let logLevel = (0, index_1.parseLogLevel)(logLevelArg || envLogLevel || 'info');
    await (0, index_node_1.initialize)(app.options, new server_1.NodeSharedMethods(app), new factory_1.default(), privateKey, logLevel, BigInt(1), true).then(() => {
        console.log('saito wasm lib initialized');
    });
    // enable it for ATR testing
    //await S.getInstance().disableProducingBlocksByTimer();
    app.wallet = (await index_node_1.default.getInstance().getWallet());
    app.wallet.app = app;
    app.blockchain = (await index_node_1.default.getInstance().getBlockchain());
    app.blockchain.app = app;
    app.server = new server_1.default(app);
    await app.init();
    if (app.options.blockchain?.fork_id) {
        await app.blockchain.setForkId(app.options.blockchain.fork_id);
    }
    index_node_1.default.getInstance().start();
    const { protocol, host, port } = app.options.server;
    const localServer = `${protocol}://${host}:${port}`;
    console.log(`

                                           
                     ◼◼◼                   
                  ◼◼   ◼ ◼◼                
               ◼◼◼      ◼  ◼◼◼             
            ◼◼◼          ◼    ◼◼◼          
         ◼◼◼              ◼      ◼◼◼       
       ◼◼◼                 ◼       ◼◼◼     
    ◼◼◼                     ◼         ◼◼◼  
   ◼◼◼                       ◼         ◼◼◼ 
   ◼  ◼◼◼                     ◼     ◼◼◼  ◼ 
   ◼     ◼◼◼                   ◼  ◼◼◼    ◼ 
   ◼       ◼◼◼                 ◼◼◼       ◼ 
   ◼        ◼ ◼◼◼           ◼◼◼          ◼ 
   ◼       ◼     ◼◼◼     ◼◼◼             ◼
   ◼      ◼         ◼◼ ◼◼                ◼ 
   ◼     ◼            ◼                  ◼ 
   ◼    ◼             ◼                  ◼ 
   ◼   ◼              ◼                  ◼ 
   ◼  ◼               ◼                  ◼ 
   ◼ ◼                ◼                  ◼ 
   ◼◼                 ◼                  ◼ 
   ◼◼                 ◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼ 
    ◼◼◼               ◼               ◼◼◼  
       ◼◼◼            ◼            ◼◼◼     
         ◼◼◼          ◼          ◼◼◼       
            ◼◼◼       ◼       ◼◼◼          
               ◼◼◼    ◼    ◼◼◼             
                  ◼◼  ◼  ◼◼                
                     ◼◼◼                   
                                           
    ################################################################

    Welcome to Saito

    address: ${await app.wallet.getPublicKey()}
    balance: ${await app.wallet.getBalance()}
    local module server: ${localServer}

    ################################################################

    This is the address and balance of your computer on the Saito network. Once Saito
    is running it will generate tokens automatically over time. The more transactions
    you process the greater the chance that you will be rewarded for the work.

    For inquiries please visit our website: https://saito.io

  `);
    function shutdownSaito() {
        console.log('Shutting down Saito');
        app.server.close();
        app.network.close();
    }
    /////////////////////
    // Cntl-C to Close //
    /////////////////////
    process_1.default.on('SIGTERM', function () {
        shutdownSaito();
        console.log('Network Shutdown');
        process_1.default.exit(0);
    });
    process_1.default.on('SIGINT', function () {
        shutdownSaito();
        console.log('Network Shutdown');
        process_1.default.exit(0);
    });
}
initSaito().catch((e) => console.error(e));
//# sourceMappingURL=start.js.map