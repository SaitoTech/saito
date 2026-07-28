'use strict';

import saito from '../saito';
import Storage from '../storage';
import fs from 'fs-extra';
import * as JSON from 'json-bigint';
import path from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

import { Saito } from '../app';
import Block from '../block';
import Slip from '../slip';
import { SlipType } from 'saito-js/lib/slip';

class StorageCore extends Storage {
  public data_dir: any;
  public config_dir: any;
  public dest: any;
  public db: any;
  public dbname: any;
  public loading_active: any;
  public file_encoding_save: any;
  public file_encoding_load: any;
  public app: Saito;

  constructor(app, data?, dest = 'blocks') {
    super(app);

    this.data_dir = data || path.join(__dirname, '../../../data');
    this.config_dir = path.join(__dirname, '../../../config');
    this.dest = dest;
    this.db = [];
    this.dbname = [];
    this.loading_active = false;

    this.file_encoding_save = 'utf8';
    this.file_encoding_load = 'utf8';
    //    this.file_encoding_load    = 'binary';
    //this.file_encoding         = 'binary';
  }

  deleteBlockFromDisk(filename) {
    try {
      return fs.unlinkSync(filename);
    } catch (error) {
      console.error(`failed deleting the block file ${filename} from disk`);
      // console.error(error);
    }
  }

  returnPath() {
    return path;
  }

  returnFileSystem() {
    return fs;
  }

  async returnDatabaseByName(dbname) {
    for (let i = 0; i < this.dbname.length; i++) {
      if (dbname == this.dbname[i]) {
        return this.db[i];
      }
    }
    try {
      const db = await open({
        filename: this.data_dir + '/' + dbname + '.sq3',
        driver: sqlite3.Database
      });

      this.dbname.push(dbname);
      this.db.push(db);

      return this.db[this.db.length - 1];
    } catch (err) {
      console.error('Error creating database for db-name: ' + dbname);
      // console.error(err);
      return null;
    }
  }

  generateBlockFilename(block): string {
    let filename = this.data_dir + '/' + this.dest + '/';
    filename += block.timestamp;
    filename += '-';
    filename += block.hash;
    filename += '.sai';
    return filename;
  }

  async loadBlockFromDisk(filename) {
    try {
      if (fs.existsSync(filename)) {
        const data = fs.readFileSync(filename);
        //       const block = new Block(this.app);
        const block = new Block();
        block.deserialize(data);
        //       block.generateMetadata();
        return block;
      }
    } catch (error) {
      // console.error('Error reading block from disk: ', error);
    }
    return null;
  }

  // async loadBlocksFromDisk(maxblocks = 0) {
  //   this.loading_active = true;
  //
  //   //
  //   // sort files by creation date, and then name
  //   // if two files have the same creation date
  //   //
  //   const dir = `${this.data_dir}/${this.dest}/`;
  //
  //   //
  //   // if this takes a long time, our server can
  //   // just refuse to sync the initial connection
  //   // as when it starts to connect, currently_reindexing
  //   // will be set at 1
  //   //
  //   const files = fs.readdirSync(dir);
  //
  //   //
  //   // "empty" file only
  //   //
  //   if (files.length == 1) {
  //     this.loading_active = false;
  //     return;
  //   }
  //
  //   files.sort(function (a, b) {
  //     // const compres = fs.statSync(dir + a).mtime.getTime() - fs.statSync(dir + b).mtime.getTime();
  //     // if (compres == 0) {
  //     return parseInt(a.split("-")[0]) - parseInt(b.split("-")[0]);
  //     // }
  //     // return compres;
  //   });
  //
  //   for (let i = 0; i < files.length; i++) {
  //     try {
  //       const fileID = files[i];
  //       if (fileID !== "empty" && fileID.includes(".sai")) {
  //         const blk = await this.loadBlockByFilename(dir + fileID);
  //         if (blk == null) {
  //           console.log("block is null: " + fileID);
  //           return null;
  //         }
  //         if (!blk.is_valid) {
  //           console.log("We have saved an invalid block: " + fileID);
  //           return null;
  //         }
  //
  //         await this.app.blockchain.addBlockToBlockchain(blk, true);
  //         console.log("Loaded block " + i + " of " + files.length);
  //       }
  //     } catch (err) {
  //       console.error(err);
  //     }
  //   }
  // }

  /**
   * Saves a block to database and disk and shashmap
   *
   * @param {Block} block block
   */
  // async saveBlock(block: Block): Promise<string> {
  //   try {
  //     const filename = this.generateBlockFilename(block);
  //     if (!fs.existsSync(filename)) {
  //       const fd = fs.openSync(filename, "w");
  //       const buffer = block.serialize();
  //       fs.writeSync(fd, buffer);
  //       fs.fsyncSync(fd);
  //       fs.closeSync(fd);
  //     }
  //     return filename;
  //   } catch (err) {
  //     console.error("ERROR 285029: error saving block to disk ", err);
  //   }
  //   return "";
  // }

  /* deletes block from shashmap and disk */
  // async deleteBlock(bid, bsh, lc) {
  //   const blk = await this.loadBlockByHash(bsh);
  //   if (blk != null) {
  //     //
  //     // delete txs utxoset
  //     //
  //     if (blk.transactions != undefined) {
  //       for (let b = 0; b < blk.transactions.length; b++) {
  //         for (let bb = 0; bb < blk.transactions[b].to.length; bb++) {
  //           this.app.utxoset.delete(blk.transactions[b].to[bb].returnKey());
  //         }
  //       }
  //     }
  //
  //     //
  //     // deleting file
  //     //
  //     const block_filename = await this.returnBlockFilenameByHashPromise(bsh);
  //
  //     fs.unlink(block_filename.toString(), function (err) {
  //       if (err) {
  //         console.error(err);
  //       }
  //     });
  //   }
  // }

  // async loadBlockById(bid) {
  //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //   // @ts-ignore
  //   const bsh = this.app.blockchain.bid_bsh_hmap[bid];
  //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //   // @ts-ignore
  //   const ts = this.app.blockchain.bsh_ts_hmap[bsh];
  //   const filename = ts + "-" + bsh + ".blk";
  //   const blk = await this.loadBlockByFilename(filename);
  //   return blk;
  // }
  //
  async loadBlockByHash(blockHash: string) {
    let block = await this.app.blockchain.getBlock(blockHash);
    if (!block) {
      return null;
    }
    block = await this.loadBlockByFilename(this.data_dir + '/blocks/' + block.file_name);
    return block;
  }

  async loadBlockByFilename(filename: string) {
    try {
      const data = await fs.readFile(filename);
      const block = new Block();
      // console.log("instance : ", block.instance);
      block.deserialize(data);

      // block.generateMetadata();
      // block.generateHashes();
      return block;
    } catch (err) {
      // console.error('Error reading block from disk:', err);
    }

    console.warn('Block not being returned... returning null');
    return null;
  }

  //
  // the options file itself is plaintext json. only the wallet private key is encrypted
  // at rest, and only when SAITO_PASS is set. returns null if no password is available.
  //
  returnOptionsSecret() {
    if (typeof process.env.SAITO_PASS == 'undefined') {
      return null;
    }
    return this.app.crypto.toBase58(
      this.app.crypto.stringToHex(
        'BYTHEPRICKINGOFMYTHUMBSSOMETHINGWICKEDTHISWAYCOMES' + process.env.SAITO_PASS
      )
    );
  }

  isValidPrivateKey(privatekey) {
    return typeof privatekey === 'string' && /^[0-9a-fA-F]{64}$/.test(privatekey);
  }

  //
  // a private key which already looks like a private key is used as-is, anything else is
  // assumed to be ciphertext and needs SAITO_PASS to unlock. mutates the options in place.
  //
  decryptWalletPrivateKey(options) {
    if (!options || !options.wallet) {
      return;
    }

    //
    // camelCasing is what we write, lowercase is kept for options files written by
    // versions predating the WASM switchover
    //
    for (const field of ['privateKey', 'privatekey']) {
      const stored = options.wallet[field];
      if (!stored || this.isValidPrivateKey(stored)) {
        continue;
      }

      const secret = this.returnOptionsSecret();
      if (!secret) {
        throw new Error(
          `the wallet ${field} in the options file is encrypted but SAITO_PASS is not set. ` +
            `set SAITO_PASS to the password it was encrypted with, or replace the ${field} ` +
            `value with a plaintext key.`
        );
      }

      let decrypted = '';
      try {
        decrypted = this.app.crypto.aesDecrypt(stored, secret);
      } catch (err) {
        decrypted = '';
      }
      if (!this.isValidPrivateKey(decrypted)) {
        throw new Error(
          `could not decrypt the wallet ${field} in the options file. SAITO_PASS is most ` +
            `likely incorrect. the options file has not been modified.`
        );
      }

      options.wallet[field] = decrypted;
    }
  }

  /**
   * Load the options file
   */
  async loadOptions() {
    // if (Object.keys(this.app.options).length !== 0) {
    //   return this.app.options;
    // }
    if (fs.existsSync(`${this.config_dir}/options`)) {
      let optionsfile = '';

      // open options file
      try {
        optionsfile = fs
          .readFileSync(`${this.config_dir}/options`, this.file_encoding_load)
          .toString();

        //
        // legacy format : the whole options file was encrypted. we read it here so the node
        // still starts, and the next save rewrites it as plaintext json with only the
        // wallet private key encrypted.
        //
        if (this.app.crypto.isAesEncrypted(optionsfile)) {
          const secret = this.returnOptionsSecret();
          if (!secret) {
            throw new Error(
              'the options file is fully encrypted but SAITO_PASS is not set. set SAITO_PASS ' +
                'to the password it was encrypted with.'
            );
          }
          try {
            optionsfile = this.app.crypto.aesDecrypt(optionsfile, secret);
          } catch (err) {
            optionsfile = '';
          }
          if (!optionsfile) {
            throw new Error(
              'could not decrypt the options file. SAITO_PASS is most likely incorrect. ' +
                'the options file has not been modified.'
            );
          }
          console.warn(
            'loaded a legacy fully encrypted options file. it will be rewritten as plaintext ' +
              'json with only the wallet private key encrypted on the next save.'
          );
        }

        if (!optionsfile) {
          throw new Error('Options file empty!');
        }

        const options = JSON.parse(optionsfile);
        this.decryptWalletPrivateKey(options);

        this.app.options = Object.assign(this.app.options, options);

        // this.convertOptionsBigInt(this.app.options);

        this.app.options.browser_mode = false;
        this.app.options.spv_mode = false;
      } catch (err) {
        // this.app.logger.logError("Error Reading Options File", {message:"", stack: err});
        console.error('Error reading options file: ' + (err?.message || err));
        process.exit();
      }
    } else {
      // default options file
      const defaultOptions = `
        {
          "server": {
            "host": "127.0.0.1",
            "port": 12101,
            "protocol": "http",
            "endpoint": {
              "host": "127.0.0.1",
              "port": 12101,
              "protocol": "http"
            },
            "verification_threads": 4,
            "channel_size": 10000,
            "stat_timer_in_ms": 5000,
            "reconnection_wait_time": 10000,
            "thread_sleep_time_in_ms": 10,
            "block_fetch_batch_size": 10
          },
          "peers": [],
          "spv_mode": false,
          "browser_mode": false,
          "blockchain":{
            "last_block_hash":"0000000000000000000000000000000000000000000000000000000000000000",
            "last_block_id":0,
            "last_timestamp":0,
            "genesis_block_id":0,
            "genesis_timestamp":0,
            "lowest_acceptable_timestamp":0,
            "lowest_acceptable_block_hash":"0000000000000000000000000000000000000000000000000000000000000000",
            "lowest_acceptable_block_id":0,
            "fork_id":"0000000000000000000000000000000000000000000000000000000000000000"
          },
          "wallet": {
          }
        }
      `;
      this.app.options = JSON.parse(defaultOptions);
    }
    return this.app.options;
  }

  async loadRuntimeOptions() {
    if (fs.existsSync(`${this.config_dir}/runtime.config.js`)) {
      //
      // open runtime config file
      //
      try {
        const configfile = fs.readFileSync(
          `${this.config_dir}/runtime.config.js`,
          this.file_encoding_load
        );
        this.app.options.runtime = JSON.parse(configfile.toString());
      } catch (err) {
        // this.app.logger.logError("Error Reading Runtime Config File", {message:"", stack: err});
        // console.error(err);
        process.exit();
      }
    } else {
      //
      // default options file
      //
      this.app.options.runtime = {};
    }
  }

  //
  // returns app.options as it should be written to disk. when SAITO_PASS is set the wallet
  // private key is swapped for its ciphertext in a shallow copy, so the running app keeps
  // holding the plaintext key.
  //
  returnOptionsForSaving() {
    const secret = this.returnOptionsSecret();
    if (!secret || !this.app.options.wallet) {
      return this.app.options;
    }

    const options = Object.assign({}, this.app.options);
    options.wallet = Object.assign({}, options.wallet);

    for (const field of ['privateKey', 'privatekey']) {
      if (this.isValidPrivateKey(options.wallet[field])) {
        options.wallet[field] = this.app.crypto.aesEncrypt(options.wallet[field], secret);
      }
    }

    return options;
  }

  /**
   * Save the options file
   */
  saveOptions() {
    // this.app.options = Object.assign({}, this.app.options);

    let new_wallet_json, new_wallet_hash;

    try {
      // Check hash so we aren't taxing the FS with multiple calls to save options
      new_wallet_json = JSON.stringify(this.app.options);
      new_wallet_hash = this.app.crypto.hash(new_wallet_json);
      if (new_wallet_hash == this?.wallet_options_hash) {
        return;
      }
    } catch (err) {
      // console.error('Problem hashing app.options: ', err);
    }

    if (typeof new_wallet_json !== 'string') {
      return;
    }

    try {
      // the file stays readable json either way -- only the private key is ever ciphertext
      const options_to_save = this.returnOptionsForSaving();

      fs.writeFileSync(
        `${this.config_dir}/options`,
        JSON.stringify(options_to_save, null, 4),
        null
      );

      //Update hash
      this.wallet_options_hash = new_wallet_hash;
    } catch (err) {
      this.wallet_options_hash = null;
      // this.app.logger.logError("Error thrown in storage.saveOptions", {message: "", stack: err});
      // console.error(err);
      return;
    }
  }

  //
  // token issuance functions below
  //
  returnTokenSupplySlipsFromDisk(): any {
    let v: any = [];
    let tokens_issued = 0;
    let filename;
    let contents;
    let slips;
    let s;

    filename = this.data_dir + '/issuance/issuance';
    contents = fs.readFileSync(filename);
    contents = contents.toString();
    slips = contents.split('\n');
    for (let i = 0; i < slips.length; i++) {
      if (slips[i] !== '') {
        s = this.convertIssuanceIntoSlip(slips[i]);
        if (s != null) {
          v.push(s);
        }
      }
    }

    filename = this.data_dir + '/issuance/default';
    contents = fs.readFileSync(filename);
    contents = contents.toString();
    slips = contents.split('\n');
    for (let i = 0; i < slips.length; i++) {
      if (slips[i] !== '') {
        s = this.convertIssuanceIntoSlip(slips[i]);
        if (s != null) {
          v.push(s);
        }
      }
    }

    filename = this.data_dir + '/issuance/earlybirds';
    contents = fs.readFileSync(filename);
    contents = contents.toString();
    slips = contents.split('\n');
    for (let i = 0; i < slips.length; i++) {
      if (slips[i] !== '') {
        s = this.convertIssuanceIntoSlip(slips[i]);
        if (s != null) {
          v.push(s);
        }
      }
    }

    return v;
  }

  convertIssuanceIntoSlip(line = '') {
    let entries = line.split('\t');
    let amount = BigInt(entries[0]);
    let publicKey = entries[1];
    let type = entries[2];
    let slip = new Slip();
    slip.publicKey = publicKey;
    slip.amount = amount;
    if (type === 'VipOutput') {
      slip.type = SlipType.VipOutput;
    }
    if (type === 'Normal') {
      slip.type = SlipType.Normal;
    }
    return slip;
  }

  // overwrite to stop the server from attempting to reset options live
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  resetOptions() {}

  ///////////////////////
  // saveClientOptions //
  ///////////////////////
  //
  // when browsers connect to our server, we check to see
  // if the client.options file exists in our web directory
  // and generate one here if it does not.
  //
  // this is fed out to client browsers and serves as their
  // default options, specifying us as the node to which they
  // should connect and through which they can route their
  // transactions. :D
  //
  async saveClientOptions() {
    if (this.app.BROWSER == 1) {
      return;
    }
    const client_peer = Object.assign({}, this.app.server.server.endpoint, {
      synctype: 'lite'
    });
    //
    // mostly empty, except that we tell them what our latest
    // block_id is and send them information on where our
    // server is located so that they can sync to it.
    //
    const t: any = {};
    t.keys = [];
    t.peers = [];
    t.services = this.app.options.services;
    t.dns = [];
    t.blockchain = this.app.options.blockchain;
    t.registry = this.app.options.registry;
    t.appstore = {};
    t.appstore.default = await this.app.wallet.getPublicKey();
    t.peers.push(client_peer);

    //
    // write file
    //
    try {
      fs.writeFileSync(`${__dirname}/web/client.options`, JSON.stringify(t));
    } catch (err) {
      // console.error(err);
    }
  }

  getClientOptions(): string {
    if (this.app.BROWSER == 1) {
      return '';
    }
    if (this.app.options) {
      if (this.app.options.client_options) {
        return JSON.stringify(this.app.options.client_options, null, 2);
      }
    }

    const client_peer = Object.assign({}, this.app.server.server.endpoint, {
      synctype: 'lite'
    });
    //
    // mostly empty, except that we tell them what our latest
    // block_id is and send them information on where our
    // server is located so that they can sync to it.
    //
    const t: any = {};
    t.keys = [];
    t.peers = [];
    t.services = this.app.options.services;
    t.dns = [];
    t.runtime = this.app.options.runtime;
    t.blockchain = this.app.options.blockchain;
    t.wallet = {};
    t.consensus = this.app.options.consensus;
    t.registry = this.app.options.registry;
    t.homeModule = this.app.options.homeModule;
    //t.appstore             = {};
    //t.appstore.default     = this.app.wallet.getPublicKey();
    t.peers.push(client_peer);

    //
    // return json
    //
    return JSON.stringify(t, null, 2);
  }

  /**
   * TODO: uses a callback and should be moved to await / async promise
   **/
  async returnBlockFilenameByHash(block_hash: string, mycallback) {
    const sql = 'SELECT id, timestamp, block_id FROM blocks WHERE hash = $block_hash';
    const params = { $block_hash: block_hash };

    try {
      const row = await this.db.get(sql, params);
      if (row == undefined) {
        mycallback(null, 'Block not found on this server');
        return;
      }
      const filename = `${row.timestamp}-${block_hash}.blk`;
      mycallback(filename, null);
    } catch (err) {
      // console.error('ERROR getting block filename in storage: ' + err);
      mycallback(null, err);
    }
  }

  returnBlockFilenameByHashPromise(block_hash: string) {
    return new Promise((resolve, reject) => {
      this.returnBlockFilenameByHash(block_hash, (filename, err) => {
        if (err) {
          reject(err);
        }
        resolve(filename);
      }).then((r) => {
        return;
      });
    });
  }

  /**
   *
   * @param {*} sql
   * @param {*} params
   * @param {*} callback
   */
  async runDatabase(sql, params, database, mycallback = null) {
    try {
      const db = await this.returnDatabaseByName(database);
      if (mycallback == null) {
        return await db.run(sql, params);
      } else {
        return await db.run(sql, params, mycallback);
      }
    } catch (err) {
      // console.error('sql : ', sql);
      // console.error(err);
    }
  }

  /**
   *
   * @param {*} sql
   * @param {*} params
   * @param {*} callback
   */
  async executeDatabase(sql, database) {
    try {
      // console.log("executeDatabase : " + sql);
      const db = await this.returnDatabaseByName(database);
      return await db.exec(sql);
    } catch (err) {
      // console.error('db error: ', err);
      // console.warn('failed executing sql : ', sql);
    }
  }

  async queryDatabase(sql, params, database) {
    try {
      // console.log("queryDatabase : " + sql);
      const db = await this.returnDatabaseByName(database);
      const rows = await db.all(sql, params);
      if (rows == undefined) {
        return [];
      }
      return rows;
    } catch (err) {
      // console.error('db error: ', err);
      // console.warn('failed executing sql : ', sql);
      return [];
    }
  }
}

export default StorageCore;
