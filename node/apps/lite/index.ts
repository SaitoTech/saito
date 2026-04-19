import { Saito } from '../../lib/saito/app';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { initialize as initSaito } from 'saito-js/index.web';
import WebSharedMethods from 'saito-js/lib/custom/shared_methods.web';
import PeerServiceList from 'saito-js/lib/peer_service_list';
import S, { LogLevel } from 'saito-js/saito';
import build from '../../dist/build.json';
import mods_config from '../../config/modules.config';
import Blockchain from '../../lib/saito/blockchain';
import Factory from '../../lib/saito/factory';
import Transaction from '../../lib/saito/transaction';
import Wallet from '../../lib/saito/wallet';





class WebMethods extends WebSharedMethods {
  app: Saito;

  constructor(app: Saito) {
    super();
    this.app = app;
  }

  async processApiCall(buffer: Uint8Array, msgIndex: number, publicKey: string): Promise<void> {
    const mycallback = async (response_object) => {
      try {
        await this.app.core.network.api.success(
          Buffer.from(JSON.stringify(response_object), 'utf-8'),
          msgIndex,
          publicKey
        );
      } catch (error) {
        console.error(error);
      }
    };
    let peer = await this.app.network.getPeer(publicKey);
    let newtx = new Transaction();
    try {
      newtx.deserialize(buffer);
      newtx.unpackData();
      // console.debug("processing peer tx : ", newtx.msg);
    } catch (error) {
      console.error(error);
      newtx.msg = buffer;
    }
    await this.app.modules.handlePeerTransaction(newtx, peer, mycallback);
  }

  sendInterfaceEvent(event: string, public_key: string) {
    this.app.connection.emit(event, public_key);
  }

  sendBlockSuccess(hash: string, blockId: bigint) {
    this.app.connection.emit('add-block-success', { hash, blockId });
  }

  sendNewVersionAlert(major: number, minor: number, patch: number, publicKey: string): void {
    console.log(`emit : new-version-detected ${major}:${minor}:${patch}`);
    this.app.connection.emit('new-version-detected', {
      version: `${major}.${minor}.${patch}`,
      publicKey: publicKey
    });
  }

  sendWalletUpdate() {
    this.app.connection.emit('wallet-updated');
  }

  async saveWallet() {
    this.app.options.wallet.publicKey = await this.app.wallet.getPublicKey();
    this.app.options.wallet.privateKey = await this.app.wallet.getPrivateKey();
    this.app.options.wallet.balance = await this.app.wallet.getBalance();
  }

  async loadWallet() {
    throw new Error('Method not implemented.');
  }

  async saveBlockchain() {
    throw new Error('Method not implemented.');
  }

  async loadBlockchain() {
    throw new Error('Method not implemented.');
  }

  getMyServices() {
    let list = new PeerServiceList();
    let result = this.app.network.getServices();
    result.forEach((s) => list.push(s));
    return list;
  }

  ensureDirExists(path: string): void {}

  sendNewChainDetectedEvent(): void {
    this.app.connection.emit('new-chain-detected');
  }
}

async function init() {

  console.log('lite init...');

  const saito = new Saito({ mod_paths: mods_config.lite });
  await saito.storage.initialize();

  saito.options.browser_mode = true;
  saito.options.spv_mode = true;
  saito.build_number = parseInt(build.build_number);
  console.info('Build Number: ' + saito.build_number);

  // saito.storage.convertOptionsBigInt(saito.options);

  //console.log('saito options : ', saito.options);
    
  // Determine log level from options, defaulting to Info
  let logLevel: LogLevel = LogLevel.Info;
  if (saito.options.loglevel !== undefined && saito.options.loglevel !== null) {
    const logLevelValue = saito.options.loglevel;
    // Handle string values (case-insensitive)
    if (typeof logLevelValue === 'string') {
      const normalized = logLevelValue.toLowerCase();
      switch (normalized) {
      case 'error':
        logLevel = LogLevel.Error;
        break;
      case 'warn':
        logLevel = LogLevel.Warn;
        break;
      case 'info':
        logLevel = LogLevel.Info;
        break;
      case 'debug':
        logLevel = LogLevel.Debug;
        break;
      case 'trace':
        logLevel = LogLevel.Trace;
        break;
      default:
        console.warn(`Invalid log level "${logLevelValue}", defaulting to Info`);
        logLevel = LogLevel.Info;
      }
    } 
    // Handle LogLevel enum values directly
    else if (typeof logLevelValue === 'number') {
      const validLevels = [LogLevel.Error, LogLevel.Warn, LogLevel.Info, LogLevel.Debug, LogLevel.Trace];
      if (validLevels.includes(logLevelValue)) {
        logLevel = logLevelValue;
      } else {
        console.warn(`Invalid log level value ${logLevelValue}, defaulting to Info`);
        logLevel = LogLevel.Info;
      }
    } else {
      console.warn(`Invalid log level type, defaulting to Info`);
      logLevel = LogLevel.Info;
    }
  }
    
  try {
    await initSaito(
      saito.options,
      new WebMethods(saito),
      new Factory(),
      saito.options.wallet?.privateKey || '',
      LogLevel.Debug,
      BigInt(1),
      true
    );
  } catch (e) {
    console.error(e);
  }

  // enable it for ATR testing
  // await S.getInstance().disableProducingBlocksByTimer();

  saito.wallet = (await S.getInstance().getWallet()) as Wallet;
  saito.wallet.app = saito;
  saito.blockchain = (await S.getInstance().getBlockchain()) as Blockchain;
  saito.blockchain.app = saito;
  saito.core = S.getInstance().getCore();

  saito.BROWSER = 1;
  saito.SPVMODE = 1;

  if (saito.options?.blockchain?.fork_id) {
    await saito.blockchain.setForkId(saito.options.blockchain.fork_id);
  }

  try {
    await saito.init();
  } catch (e) {
    console.error(e);
  }

  S.getInstance().start();


}


window.onload = async function () {
  // console.log(args, "args")
  try {
    await init();
		
  } catch (error) {
    console.error(error);
  }
};
