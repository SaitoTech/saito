import saito_lib from './saito';
import Binary from './binary';
import Mods from './modules';
import Crypto from './crypto';
import Blockchain from './blockchain';
import Connection from './connection';
import Browser from './browser';
import Wallet from './wallet';
import Keychain from './keychain';
import Storage from './storage';
import build from '../../dist/build.json';
import S, { LogLevel } from 'saito-js/saito';

import Network from './network';

const path = require('path');

export function parseLogLevel(logLevel): LogLevel {
  if (logLevel) {
    switch (logLevel) {
      case 'error':
        return LogLevel.Error;
      case 'warn':
        return LogLevel.Warn;
      case 'info':
        return LogLevel.Info;
      case 'debug':
        return LogLevel.Debug;
      case 'trace':
        return LogLevel.Trace;
      default:
        throw new Error('Invalid log level');
    }
  } else {
    return LogLevel.Info;
  }
}

class Saito {
  BROWSER: number;
  SPVMODE: number;
  build_number: number;
  options: any = {};
  modules: Mods;
  binary!: Binary;
  crypto!: Crypto;
  connection!: Connection;
  browser!: Browser;
  storage!: Storage;
  wallet!: Wallet;
  keychain!: Keychain;
  network!: Network;
  blockchain!: Blockchain;
  server: any;
  core: any;

  constructor(config = {}) {
    this.BROWSER = 1;
    this.SPVMODE = 0;
    this.build_number = Number(build.build_number);
    this.options = config;
    this.newSaito();

    // TODO : where does this mod_paths come from?
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.modules = new saito_lib.modules(this, config.mod_paths);

    return this;
  }

  newSaito() {
    this.binary = new Binary(this);
    this.crypto = new Crypto(this);
    this.connection = new Connection();
    this.browser = new Browser(this);
    this.storage = new Storage(this);
    // this.wallet = new Wallet(undefined,this);
    this.keychain = new Keychain(this);
    this.network = new Network(this);
    // this.networkApi = new NetworkAPI(this);
    // this.blockchain = new Blockchain(undefined);
  }

  async init() {
    //    try {
    // await this.storage.initialize();

    console.log('Initializing wallet....');
    await this.wallet.initialize();
    console.log('Initializing keychain....');
    await this.keychain.initialize();

    this.modules.mods = this.modules.mods_list.map((mod_path) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      console.log('Installing: ', mod_path);
      //const Module = require(`../../mods/${mod_path}.js`);
      const Module = require(`../../mods/${mod_path}`);
      const x = new Module(this);
      x.dirname = path.dirname(mod_path);
      return x;
    });

    console.log('Wallet Version: ' + this.wallet.version);

    this.core.wallet.setWalletVersion(
      0,
      Math.floor(this.wallet.version),
      (this.wallet.version * 1000) % 1000
    );

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
  catch(err) {
    console.error(
      'Error occured initializing your Saito install. The most likely cause of this is a module that is throwing an error on initialization. You can debug this by removing modules from your config file to test which ones are causing the problem and restarting.'
    );
    console.error(err);
  }

  async reset(config) {
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

export { Saito };
