import { Saito } from '../../lib/saito/app';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { initialize as initSaito } from 'saito-js/index.web';
import { BrowserSharedMethods } from 'saito-js/shared_methods.browser';
import S, { LogLevel } from 'saito-js/saito';
import build from '../../dist/build.json';
import mods_config from '../../config/modules.config';
import Blockchain from '../../lib/saito/blockchain';
import Factory from '../../lib/saito/factory';
import Wallet from '../../lib/saito/wallet';

async function init() {
  console.log('lite init...');

  const saito = new Saito({ mod_paths: mods_config.lite });
  await saito.storage.initialize();

  {
    const peers = saito.options?.peers;
    const n = Array.isArray(peers) ? peers.length : 0;
    const first = n > 0 ? peers[0] : null;
    const ws =
      first && first.host != null && first.port != null && first.protocol != null
        ? `${first.protocol === 'https' ? 'wss' : 'ws'}://${first.host}:${first.port}/wsopen`
        : null;
    console.log('[SAITO LITE] before WASM init: outbound connect preview', {
      peerCount: n,
      derivedWebSocketUrl: ws,
      wasmWillCallConnectToPeer: !!(ws && n > 0),
      peersPassedToWasm: peers
    });
  }

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
      const validLevels = [
        LogLevel.Error,
        LogLevel.Warn,
        LogLevel.Info,
        LogLevel.Debug,
        LogLevel.Trace
      ];
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
      new BrowserSharedMethods(saito),
      new Factory(),
      saito.options.wallet?.privateKey || '',
      logLevel,
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
