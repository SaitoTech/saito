import Decimal from 'decimal.js';
import JSON from 'json-bigint';
import BalanceSnapshot from 'saito-js/lib/balance_snapshot';
import SaitoWallet, { WalletSlip } from 'saito-js/lib/wallet';
import S from 'saito-js/saito';
import { Saito } from './app';
import Slip from './slip';
import Transaction from './transaction';
import { TransactionType } from 'saito-js/lib/transaction';

const getUuid = require('uuid-by-string');

const CryptoModule = require('../templates/cryptomodule');
const NFTCryptoModule = require('../templates/nftcryptomodule');

declare function sconfirm(message: string): Promise<boolean>;

interface PreferredTx {
  sig: string;
  ts: number;
}

export default class Wallet extends SaitoWallet {
  public app: Saito;

  publicKey;

  preferred_crypto = 'SAITO';

  // Array of Objects { sig, ts }
  preferred_txs: PreferredTx[] = [];

  default_fee = BigInt(0); // in nolan

  version = 5.677; //saito-js 0.2.137

  nolan_per_saito = 100000000;

  cryptos = new Map<string, any>();
  public saitoCrypto: any;

  public async createUnsignedTransactionWithDefaultFee(
    publicKey = '',
    amount = BigInt(0),
    default_fee = this.default_fee
  ): Promise<Transaction> {
    if (publicKey == '') {
      publicKey = await this.getPublicKey();
    }

    try {
      return await this.createUnsignedTransaction(publicKey, amount, default_fee);
    } catch (err: any) {
      const msg = err?.message || String(err);
      const fee_blocked =
        default_fee > BigInt(0) &&
        typeof msg === 'string' &&
        msg.includes('insufficient SAITO balance');
      //
      // problem was not fee
      //
      if (!fee_blocked) {
        throw err;
      }
      //
      // maybe it is just fee
      //
      this.default_fee = BigInt(0);
      if (!this.app.options.wallet) {
        this.app.options.wallet = {};
      }
      this.app.options.wallet.default_fee = '0';
      this.app.storage.saveOptions();
      return await this.createUnsignedTransaction(publicKey, amount, BigInt(0));
    }
  }

  public async createUnsignedTransaction(
    publicKey = '',
    amount = BigInt(0),
    fee = BigInt(0),
    force_merge = false
  ): Promise<Transaction> {
    if (publicKey == '') {
      publicKey = await this.getPublicKey();
    }
    return this.app.core.wallet.createTransaction(publicKey, amount, fee, force_merge);
  }

  public async createUnsignedTransactionWithMultiplePayments(
    keys: string[],
    amounts: bigint[],
    fee: bigint = this.default_fee
  ): Promise<Transaction> {
    return this.app.core.wallet.createTransactionWithMultiplePayments(keys, amounts, fee);
  }

  public async getNFTList(): Promise<String> {
    return S.getInstance().getNftList();
  }

  public async getBalance(ticker = 'SAITO'): Promise<bigint> {
    if (ticker === 'SAITO') {
      return this.instance.get_balance();
    }
    return BigInt(0);
  }

  async initialize() {
    console.info(
      '[INIT_TRACE] wallet initialize begin app_option_slips=' +
        (this.app.options.wallet?.slips?.length ?? 0)
    );
    let privateKey = await this.getPrivateKey();
    let publicKey = await this.getPublicKey();
    let wallet_self = this;

    ////////////////
    // new wallet //
    ////////////////
    if (!privateKey || !publicKey) {
      await this.resetWallet();
      privateKey = await this.getPrivateKey();
      publicKey = await this.getPublicKey();
    }

    this.publicKey = publicKey;
    console.log('Initialize Wallet -- ', publicKey);

    // set default fee from options
    let storedFee = this.app.options.wallet.default_fee;
    this.default_fee = !storedFee ? BigInt(0) : BigInt(storedFee);

    ////////////////////////////////////////////////////////
    // add ghost crypto module so Saito interface available
    ////////////////////////////////////////////////////////
    //
    // this is a convenience class that allows the GameEngine and other modules to
    // interact with Saito in the same way that they interact with other web3 crypto
    // modules.
    //
    // most of the functions here are shells since they do not need to process the
    // underlying payments, and instead rely on events that are broadcast from
    // Saito-Core in order to know when payments / nfts have arrived and been
    // processed.
    //
    class SaitoCrypto extends CryptoModule {
      constructor(app, publicKey) {
        super(app, 'SAITO');
        this.name = 'Saito';
        this.description = 'Saito';
        this.balance = '0.0';
        this.address = publicKey;

        // It is easier to flag native cryptos than web3 (especially if we add some outside mixin)
        // Also applies to nftcryptomodule
        this.chain_id = 'NATIVE';

        //
        // Saito-Core emits events that receive updates on transactions and NFTs that
        // are received on-chain. This helper function assists
        //
        const parseInterfacePayload = (payload: unknown): Record<string, unknown> => {
          if (payload == null || payload === '') {
            return {};
          }
          if (typeof payload === 'string') {
            try {
              return JSON.parse(payload) as Record<string, unknown>;
            } catch {
              return {};
            }
          }
          if (typeof payload === 'object') {
            return { ...(payload as Record<string, unknown>) };
          }
          return {};
        };

        app.connection.on('on-transaction-sent', (payload: unknown) => {
          const p = parseInterfacePayload(payload);
          // Add filter (until WASM is fixed)
          if (p.sender == this.publicKey) {
            if (Number(p.amount) > 0) {
              console.log('************** transaction-sent **************', p);
              p.amount = app.wallet.convertNolanToSaito(p.amount).toString();
              app.connection.emit('on-payment-sent', p);
            }
          }
        });

        // Map transaction-received event from WASM to UI-focused event
        app.connection.on('on-transaction-received', (payload: unknown) => {
          const p = parseInterfacePayload(payload);

          // Ignore transactions that I sent
          if (p.sender !== this.publicKey) {
            console.log('*************** transaction-received ***********', payload);
            if (!p.ticker) {
              p.ticker = 'SAITO';
            }
            p.amount = app.wallet.convertNolanToSaito(p.amount).toString();

            app.connection.emit('on-payment-received', p);
          }
        });

        app.connection.on('on-nft-sent', async (payload: unknown) => {
          const p = parseInterfacePayload(payload);
          console.log('*************** nft-sent ***********', p);
          if (p.ticker || this.app.wallet.extractNFTType(p.slip3_utxo) == 'token') {
            p.amount = p.amount?.toString();
            app.connection.emit('on-payment-sent', p);
          }
        });

        app.connection.on('on-nft-received', async (payload: unknown) => {
          const p = parseInterfacePayload(payload);
          p.amount = p.amount?.toString();
          let is_payment = p?.ticker || this.app.wallet.extractNFTType(p.slip3_utxo) == 'token';

          // This needs to be out here so we catch newly-minted nfts
          if (is_payment) {
            await wallet_self.addNFTToWallet(p.nft_id, p.ticker);
          }

          if (p.sender !== this.publicKey) {
            console.log('*************** nft-received ***********', p);
            if (is_payment) {
              app.connection.emit('on-payment-received', p);
            }
          }
        });

        this.options.isActivated = true;
      }

      //
      // Check if I have a net change in slips amounts...
      //
      shouldAffixCallbackToModule(modname, tx = null) {
        if (this.app.BROWSER) {
          if (tx.isTo(this.address) || tx.isFrom(this.address)) {
            if (tx.type == TransactionType.Bound) {
              return 1;
            }
            if (tx.type == TransactionType.Normal) {
              let to_amount = 0;
              let from_amount = 0;
              for (let i = 0; i < tx.to.length; i++) {
                if (tx.to[i].publicKey == this.address) {
                  to_amount += Number(tx.to[i].amount);
                }
              }
              for (let i = 0; i < tx.from.length; i++) {
                if (tx.from[i].publicKey == this.address) {
                  from_amount += Number(tx.from[i].amount);
                }
              }
              if (to_amount !== from_amount) {
                return 1;
              }
            }
          }
        }

        return super.shouldAffixCallbackToModule(modname, tx);
      }

      //
      // This overwrites the function in cryptomodule because we don't need to process the txmsg
      // we will rely on slip update events emanating from the WASM
      //
      async onConfirmation(blk, tx, conf) {}

      isActivated() {
        return true;
      }

      returnPrivateKey() {
        return this.app.wallet.getPrivateKey(); // return Promise
      }

      checkWithdrawalFeeForAddress(
        address = '',
        mycallback: ((fee: string) => void) | null = null
      ) {
        if (mycallback) {
          mycallback(this.app.wallet.convertNolanToSaito(this.app.wallet.default_fee));
        }
      }

      //
      // Build a ledger of payments in real time
      //
      savePaymentTransaction(tx, txmsg = null) {
        if (!txmsg) {
          txmsg = tx.returnMessage();
        }

        if (!this.app.BROWSER || !txmsg) {
          return;
        }

        if (txmsg.request !== 'crypto payment' || txmsg.module !== this.name) {
          return;
        }

        console.log('Save SAITO payment transaction in ledger...');

        const obj = {
          counter_party: { publicKey: '' },
          timestamp: tx.timestamp,
          amount: 0,
          trans_hash: tx.signature,
          type: '',
          memo: txmsg.memo || txmsg.request || txmsg.module
        };

        // I am the sender and this is a "send"
        if (tx.isFrom(this.publicKey) && (!tx.isTo(this.publicKey) || tx.to.length > 1)) {
          obj.counter_party.publicKey = txmsg.to;
          obj.type = 'send';
          obj.amount = -txmsg.amount;
        } else if (tx.isTo(this.publicKey)) {
          // I am the receiver and this a "receive"
          obj.counter_party.publicKey = txmsg.from;
          obj.type = 'receive';
          obj.amount = txmsg.amount;
        }

        if (!obj.type) {
          return;
        }

        /*
          we think this should be useful in real time, but if we import the private key, 
          we end up rerunning a bunch of lite blocks and then duplicating chunks of transactions
        */
        if (obj.timestamp < this.history_update_ts) {
          console.warn('Pushing an earlier (or same ts) payment record in SAITO history!');
          // console.log(tx);
        } else {
          this.history.push(obj);
          this.history_update_ts = obj.timestamp + 1;
        }

        // Cache history in local forage
        this.save();
      }

      //
      // Pull a ledger of payments from an archive (memento) that builds
      // a database of blocks, transactions, and slips
      //
      async fetchHistory(ts = null, callback = null) {
        // This is more complicated than need be, but the idea
        // is that we have a button to manually check the remote archive
        // for missing ledger entries... so we want to be able to override the standard
        // history_update_ts,... but only once.
        // the min_ts gets set by calling this once and then afterwards we only query new stuff
        if (ts == null) {
          ts = this.history_update_ts;
        } else if (this.min_ts) {
          ts = this.min_ts;
        }

        console.log(`[Memento] Checking for missed SAITO transactions since ${new Date(ts)}`);

        const mycallback = (rows) => {
          let timestamp = 0;
          console.log(`Memento returned ${rows.length} historical transactions`);

          if (rows?.length) {
            for (let r of rows) {
              // Ignore 0-payment records (which shouldn't exist anyways)
              if (Number(r.amount) == 0) {
                continue;
              }
              timestamp = r.timestamp;

              let amount = this.app.wallet.convertNolanToSaito(BigInt(r.amount));
              const obj = {
                counter_party: { address: '', publicKey: '' },
                timestamp,
                amount,
                type: '',
                trans_hash: r.tx_sig,
                memo: 'memento'
              };

              if (r.from_key == this.publicKey) {
                obj.counter_party.address = obj.counter_party.publicKey = r.to_key;
                obj.type = 'send';
                obj.amount = -obj.amount;
              } else {
                // I am the receiver
                obj.counter_party.address = obj.counter_party.publicKey = r.from_key;
                obj.type = 'receive';
              }

              // This has been restructured to allow insertion of older transactions
              if (timestamp > this.history_update_ts) {
                this.history.push(obj);
              } else {
                for (let i = 0; i < this.history.length; i++) {
                  // Or insert if a missed transaction
                  if (this.history[i].timestamp > timestamp) {
                    this.history.splice(i, 1);
                    break;
                  } else if (this.history[i].timestamp === timestamp) {
                    // Check if duplicate
                    if (this.history[i].amount == obj.amount) {
                      // Is it sufficient that the timestamp and amount are the same
                      // Should we also check the counter party?
                      break;
                    }
                  }
                }
              }

              this.history_update_ts = Math.max(this.history_update_ts, timestamp) + 1;
            }

            this.save();
          }

          this.min_ts = this.history_update_ts;

          if (callback) {
            callback(this.history);
          }
        };

        // Request data from SQL database in Memento
        await this.app.network.sendRequestAsTransaction(
          'memento',
          {
            publicKey: this.publicKey,
            offset: ts
          },
          mycallback
        );
      }

      /**
       * SAITO [cryptomodule] implementation for sending
       */
      async sendPayment(
        amount: string,
        to_address: string,
        unique_hash: string = '',
        memo: string = ''
      ) {
        // TEMP_DIAG_POKER_AUTH: cryptomodule.sendPayment outbound trace (SAITO)
        const trunc = (s) =>
          typeof s === 'string' && s.length > 14 ? `${s.slice(0, 8)}...${s.slice(-6)}` : s;
        console.info('[TEMP_DIAG_POKER_AUTH] cryptomod(SAITO).sendPayment invoked', {
          amount,
          to_address: trunc(to_address),
          unique_hash: trunc(unique_hash),
          memo: trunc(memo)
        });

        let nolan_amount = this.app.wallet.convertSaitoToNolan(amount);
        let current_balance = await this.getAvailableBalance();
        console.info('[TEMP_DIAG_POKER_AUTH] balance check', {
          current_balance: trunc(String(current_balance)),
          amount
        });

        if (Number(current_balance) - Number(amount) < 0) {
          console.info('[TEMP_DIAG_POKER_AUTH] insufficient balance check FAILED');
          throw new Error('sendPayment: Attempting to send payment with insufficient balance');
        }

        console.info('[TEMP_DIAG_POKER_AUTH] validateAddress about to run', {
          to_address: trunc(to_address)
        });
        if (!this.validateAddress(to_address)) {
          console.info('[TEMP_DIAG_POKER_AUTH] validateAddress check FAILED');
          throw new Error('sendPayment: Attempting to send payment to invalid public key');
        }

        let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
          to_address,
          nolan_amount
        );
        console.info('[TEMP_DIAG_POKER_AUTH] transaction construction', {
          newtx_created: newtx != null,
          signature_pre_sign: newtx?.signature
        });

        newtx.msg = {
          module: this.name,
          request: 'crypto payment',
          amount,
          from: this.publicKey,
          to: to_address,
          hash: unique_hash,
          memo
        };
        console.info('[TEMP_DIAG_POKER_AUTH] transaction msg set', {
          request: newtx?.msg?.request,
          tx_hash: trunc(newtx?.msg?.hash)
        });

        console.info('[TEMP_DIAG_POKER_AUTH] signing (signAndEncryptTransaction) about to run');
        await this.app.wallet.signAndEncryptTransaction(newtx);
        console.info('[TEMP_DIAG_POKER_AUTH] signing complete', {
          signature_post_sign: newtx?.signature
        });

        const pendingBefore = await this.app.wallet.getPendingTransactions();
        console.info('[TEMP_DIAG_POKER_AUTH] pending state BEFORE propagateTransaction', {
          pending_count: pendingBefore?.length,
          pending_signatures_sample: pendingBefore
            ?.slice(0, 5)
            ?.map((pt) => pt?.sig || pt?.signature || pt?.hash)
            ?.filter(Boolean)
        });

        console.info('[TEMP_DIAG_POKER_AUTH] propagateTransaction about to run', {
          signature: trunc(newtx?.signature)
        });
        await this.app.network.propagateTransaction(newtx);
        console.info('[TEMP_DIAG_POKER_AUTH] propagateTransaction completed successfully', {
          signature: trunc(newtx?.signature)
        });

        const pendingAfter = await this.app.wallet.getPendingTransactions();
        console.info('[TEMP_DIAG_POKER_AUTH] pending state AFTER propagateTransaction', {
          pending_count: pendingAfter?.length,
          pending_signatures_sample: pendingAfter
            ?.slice(0, 5)
            ?.map((pt) => pt?.sig || pt?.signature || pt?.hash)
            ?.filter(Boolean)
        });

        return newtx.signature;
      }

      async sendPayments(amounts: bigint[], to_addresses: string[]) {
        const CHUNK_SIZE = 100;
        const signatures: string[] = [];
        for (let i = 0; i < amounts.length; i += CHUNK_SIZE) {
          const amountsChunk = amounts.slice(i, i + CHUNK_SIZE);
          const addressesChunk = to_addresses.slice(i, i + CHUNK_SIZE);
          let newTx = await this.app.wallet.createUnsignedTransactionWithMultiplePayments(
            addressesChunk,
            amountsChunk
          );
          await this.app.wallet.signAndEncryptTransaction(newTx);
          await this.app.network.propagateTransaction(newTx);
          signatures.push(newTx.signature);
        }

        // Return all transaction signatures
        return signatures.join(', ');
      }

      validateAddress(address) {
        return this.app.crypto.isPublicKey(address);
      }

      returnLogos() {
        return { img: '/saito/img/saito-icon.png', alt_img: '/saito/img/logo.png' };
      }

      async getAvailableBalance() {
        let x = await this.app.core.wallet.getAvailableBalance();
        return this.app.wallet.convertNolanToSaito(x);
      }

      async getPendingBalance() {
        let x = await this.app.core.wallet.getPendingBalance();
        return this.app.wallet.convertNolanToSaito(x);
      }

      async fetchBalance() {
        this.balance = await this.getAvailableBalance();
        return this.balance;
      }
    }

    this.saitoCrypto = new SaitoCrypto(this.app, this.publicKey);

    if (this.app.options.wallet != null) {
      /////////////
      // upgrade //
      /////////////
      if (this.app.options.wallet.version < this.version) {
        if (this.app.BROWSER == 1) {
          console.log('upgrading wallet version to : ' + this.version);
          let tmpprivkey = this.app.options.wallet.privateKey;
          let tmppubkey = this.app.options.wallet.publicKey;

          //
          // Note: since WASM switch over, we use camelCasing for the keys
          // These are two checks to make sure outdated wallets are still compatible
          //
          if (this.app.options.wallet.privatekey) {
            tmpprivkey = this.app.options.wallet.privatekey;
          }

          if (this.app.options.wallet.publickey) {
            tmppubkey = this.app.options.wallet.publickey;
          }

          let mixin = this.app.options.mixin;
          let crypto = this.app.options.crypto;

          // save contacts(keys)
          let keys = this.app.options.keys;
          let chats = this.app.options.chat;
          let leagues = this.app.options.leagues;

          // save theme options
          let theme = this.app.options.theme;

          // keep moderated whitelists & blacklists
          let modtools = this.app.options.modtools;

          // keep user's game preferences
          let gameprefs = this.app.options.gameprefs;

          // specify before reset to avoid archives reset problem
          await this.setPrivateKey(tmpprivkey);
          await this.setPublicKey(tmppubkey);

          // let modules purge stuff
          await this.onUpgrade('upgrade');

          // re-specify after reset
          await this.setPrivateKey(tmpprivkey);
          await this.setPublicKey(tmppubkey);

          // this.app.options.wallet = this.wallet;
          this.app.options.wallet.preferred_crypto = this.preferred_crypto;
          //this.app.options.wallet.preferred_txs = this.preferred_txs;
          this.app.options.wallet.version = this.version;
          this.app.options.wallet.default_fee = this.default_fee.toString();
          this.app.options.wallet.slips = [];

          // if (this.app.options.wallet.slips) {
          //    let slips = this.app.options.wallet.slips.map(
          //        (json: any) => {
          //            let slip = new WalletSlip();
          //            slip.copyFrom(json);
          //            return slip;
          //        }
          //    );
          //    console.log("preserving slips over a wallet reset... : "+slips.length);
          //    await this.addSlips(slips);
          // }
          // reset games and restore game settings
          this.app.options.games = [];
          this.app.options.gameprefs = gameprefs;

          // keep mixin
          this.app.options.mixin = mixin;
          this.app.options.crypto = crypto;

          // keep contacts (keys)
          this.app.options.keys = keys;
          this.app.options.chat = chats;
          this.app.options.leagues = leagues;

          // keep theme
          this.app.options.theme = theme;

          // restore white and black lists
          this.app.options.modtools = modtools;

          await this.reset(true);
          await this.saveWallet();

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          alert('Saito Upgrade: Wallet Version: ' + this.version);
        } else {
          // purge old slips
          this.app.options.wallet.version = this.version;
          this.app.options.wallet.slips = [];

          this.app.storage.saveOptions();
        }
      } else {
        if (typeof this.app.options.wallet.preferred_crypto != 'undefined') {
          this.preferred_crypto = this.app.options.wallet.preferred_crypto;
        }
        if (this.app.options.wallet.slips) {
          console.info(
            '[LOAD_TRACE] loading wallet app_option_slips=' + this.app.options.wallet.slips.length
          );
          let slips = this.app.options.wallet.slips.map((json: any) => {
            let slip = new WalletSlip();
            slip.copyFrom(json);
            return slip;
          });
          console.log('preserving slips without a wallet reset..... : ' + slips.length);
          await this.addSlips(slips);
          console.info('[LOAD_TRACE] loaded wallet restored_slips=' + slips.length);
        }
      }

      //
      // filter and resend pending txs
      //

      let pending_txs: Array<any>;

      if (this.app.BROWSER) {
        pending_txs = (await this.app.storage.getLocalForageItem('pending_txs')) || [];
      } else {
        pending_txs = this.app.options?.pending_txs || [];
      }

      delete this.app.options.pending_txs;

      console.info(`Recovered ${pending_txs.length} saved pending transaction(s)`);

      for (let i = pending_txs.length - 1, k = 0; i >= 0; i--, k++) {
        try {
          const serializedTx =
            typeof pending_txs[i] === 'string' ? pending_txs[i] : JSON.stringify(pending_txs[i]);

          if (!serializedTx) {
            console.error(`Ignoring malformed saved pending transaction at index ${i}`);
            continue;
          }

          const newtx = new Transaction();
          newtx.deserialize_from_web(this.app, serializedTx);

          if (!newtx.signature || newtx.from.length === 0) {
            console.error(`Ignoring malformed saved pending transaction at index ${i}`);
            continue;
          }

          if (newtx.timestamp > new Date().getTime() - 85000000) {
            await this.app.wallet.addTransactionToPending(newtx, false);
          }
        } catch (err) {
          console.error(`Failed to restore pending transaction at index ${i}:`, err);
        }
      }

      this.app.connection.on('wallet-updated', async () => {
        const { persisted } = await this.updateNFTList();
        if (
          persisted &&
          this.app.BROWSER &&
          typeof (globalThis as unknown as { siteMessage?: Function }).siteMessage === 'function'
        ) {
          (globalThis as unknown as { siteMessage: Function }).siteMessage(
            'NFT updated in wallet',
            3000
          );
        }
      });

      this.app.connection.on('keychain-updated', () => {
        this.setKeyList(this.app.keychain.returnWatchedPublicKeys());
      });
    }

    await this.saitoCrypto.initialize(this.app);

    //
    // add nfts back to rust wallet
    //
    await this.addNFTList();
    console.info(
      '[INIT_TRACE] wallet initialize complete app_option_slips=' +
        (this.app.options.wallet?.slips?.length ?? 0)
    );
    console.info(
      '[LOAD_TRACE] wallet initialization complete app_option_slips=' +
        (this.app.options.wallet?.slips?.length ?? 0)
    );
  }

  constructor(wallet: any) {
    super(wallet);
    this.saitoCrypto = null;
  }

  /**
   * Generates a new keypair, wipes all local browser persistence, loads fresh
   * options, and saves the new wallet. Used by Nuke for a full local reset.
   */
  async resetWallet() {
    //
    // This creates the new key pair
    //
    await this.reset(false);

    if (this.app.options.blockchain) {
      await this.app.blockchain.resetBlockchain();
    }

    if (this.app.BROWSER) {
      // Single implementation of browser wipe (formerly Clear Cache + Nuke clears).
      await this.app.storage.resetBrowserInstallation();
      await this.app.storage.loadFreshOptions();
    } else {
      await this.app.storage.resetOptions();
    }

    //
    // keychain
    //
    if (this.app.options.keys) {
      this.app.options.keys = [];
    }

    this.app.options.invites = [];
    this.app.options.games = [];

    // wallet backup
    if (!this.app.options.wallet) {
      this.app.options.wallet = {};
    }

    this.app.options.wallet.backup_required = false;

    // in-game crypto transfer preferences
    if (!this.app.options.gameprefs) {
      this.app.options.gameprefs = {};
    }

    this.preferred_crypto = 'SAITO';

    await this.saveWallet();
  }

  /**
   * Saves the current wallet state to local storage.
   */
  async saveWallet() {
    if (!this.app.options.wallet) {
      this.app.options.wallet = {};
    }

    this.app.options.wallet.preferred_crypto = this.preferred_crypto;
    this.app.options.wallet.preferred_txs = this.preferred_txs;
    this.app.options.wallet.version = this.version;
    this.app.options.wallet.default_fee = this.default_fee.toString();

    const pendingTransactions = await this.getPendingTransactions();
    const pending_txs: string[] = [];

    for (let i = 0; i < pendingTransactions.length; i++) {
      try {
        const serializedTx = (pendingTransactions[i] as Transaction).serialize_to_web(this.app);
        if (serializedTx) {
          pending_txs.push(serializedTx);
        }
      } catch (err) {
        console.error(`Failed to serialize pending transaction at index ${i}:`, err);
      }
    }

    if (pending_txs.length !== pendingTransactions.length) {
      console.error(
        `Skipped ${pendingTransactions.length - pending_txs.length} malformed pending transaction(s) while saving wallet`
      );
    }

    if (this.app.BROWSER) {
      await this.app.storage.setLocalForageItem('pending_txs', pending_txs);
    } else {
      this.app.options.pending_txs = pending_txs;
    }

    let slips = await this.getSlips();
    this.app.options.wallet.slips = slips.map((slip) => slip.toJson());

    await this.save();
    this.app.storage.saveOptions();
  }

  /////////////////////////
  // WEB3 CRYPTO MODULES //
  /////////////////////////

  returnInstalledCryptos(filter = true) {
    const cryptoModules: (typeof CryptoModule)[] =
      this.app.modules.returnModulesBySubType(CryptoModule);
    if (this.saitoCrypto !== null) {
      cryptoModules.push(this.saitoCrypto);
    }

    cryptoModules.sort((a, b) => {
      if (!a.isActivated() && b.isActivated()) {
        return 1;
      }
      if (a.ticker == this.preferred_crypto) {
        return -1;
      }
      if (b.ticker == this.preferred_crypto) {
        return 1;
      }

      return Number(b.returnDisplayBalance()) - Number(a.returnDisplayBalance());
    });

    if (filter) {
      return cryptoModules.filter((m) => !m.hide_me);
    } else {
      return cryptoModules;
    }
  }

  returnActivatedCryptos() {
    const allMods = this.returnInstalledCryptos();
    const activeMods: (typeof CryptoModule)[] = [];
    for (let i = 0; i < allMods.length; i++) {
      if (allMods[i].isActivated()) {
        activeMods.push(allMods[i]);
      }
    }
    return activeMods;
  }

  returnCryptoModuleByTicker(ticker = '') {
    const mods = this.returnInstalledCryptos(false);
    for (let i = 0; i < mods.length; i++) {
      // be case insensitive, just in case
      if (mods[i].ticker.toUpperCase() === ticker.toUpperCase()) {
        return mods[i];
      }
    }
    return null;
  }

  /**
   *
   * @return 1 if successful, 0 if not. Catches the Module not found error and displays it
   */
  async setPreferredCrypto(ticker) {
    try {
      const current_crypto = this.returnPreferredCrypto();
      if (current_crypto?.startPolling) {
        current_crypto.stopPolling();
      }

      let c_mod = this.returnCryptoModuleByTicker(ticker);
      this.preferred_crypto = ticker.toUpperCase();
      console.log('Activating cryptomod: ' + ticker);
      await c_mod.activate();

      this.saveWallet();
      return 1;
    } catch (err) {
      // console.error(err);
    }
    return 0;
  }

  returnPreferredCrypto() {
    try {
      let m = this.returnCryptoModuleByTicker(this.preferred_crypto);
      if (m == null) {
        this.preferred_crypto = 'SAITO';
        if (this.app.options?.wallet) {
          this.app.options.wallet.preferred_crypto = 'SAITO';
        }
        m = this.returnCryptoModuleByTicker('SAITO');
      }
      return m;
    } catch (err) {
      if (err.startsWith('Module Not Found:')) {
        console.warn(`Preferred crypto (${this.preferred_crypto}) not installed!`);
        //Shouldn't need to await because native crypto is seemless
        this.preferred_crypto = 'SAITO';
        return this.returnCryptoModuleByTicker('SAITO');
      } else {
        throw err;
      }
    }
  }

  returnPreferredCryptoTicker() {
    return this?.preferred_crypto || 'SAITO';
  }

  returnPreferredCryptoAddress() {
    let preferred_crypto = this.returnPreferredCrypto();
    return preferred_crypto.returnAddress();
  }

  returnCryptoAddressByTicker(ticker = 'SAITO') {
    try {
      if (ticker === 'SAITO') {
        return this.publicKey;
      } else {
        const cmod = this.returnCryptoModuleByTicker(ticker);
        if (cmod) {
          return cmod.returnAddress();
        }
        console.log(`Crypto Module (${ticker}) not found`);
      }
    } catch (err) {
      // console.error(err);
    }
    return '';
  }

  async returnAvailableCryptosAssociativeArray() {
    console.log('into wallet.returnAvailableCryptosAssociativeArray()');

    let cryptos = {};

    let ticker;
    try {
      let mods = this.returnActivatedCryptos();
      for (let i = 0; i < mods.length; i++) {
        ticker = mods[i].ticker;
        let address = mods[i].formatAddress();
        let balance = await mods[i].getAvailableBalance();

        if (!cryptos[ticker]) {
          cryptos[ticker] = { address, balance };
        }

        if (parseFloat(balance) > 0) {
          mods[i].save();
        }
      }
    } catch (err) {
      // console.error(err);
      console.log(ticker);
    }
    console.log('done wallet.returnAvailableCryptosAssociativeArray()');
    return cryptos;
  }

  saveAvailableCryptosAssociativeArray(publicKey, cryptos) {
    for (let ticker in cryptos) {
      this.app.keychain.addCryptoAddress(publicKey, ticker, cryptos[ticker].address);
    }
    this.app.keychain.saveKeys();
  }

  async returnPreferredCryptoBalance() {
    const cryptomod = this.returnPreferredCrypto();
    return cryptomod.getAvailableBalance();
  }

  /**
   * General WALLET function
   * Sends payments to the addresses provided if this user is the corresponding
   * sender. Will not send if similar payment was found after the given timestamp.
   * @param {String} ticker - Ticker of install crypto module
   * @param {Array} senders - Array of addresses -- in web3 currency
   * @param {Array} receivers - Array of addresses -- in web3 curreny
   * @param {Array} amounts - Array of amounts to send
   * @param {Function} mycallback - ({hash: {String}}) -> {...}
   * @param {String} public key of recipient so we can inform them of the payment
   * @param {String} memo -- an optional field for module code to provide clarifying information
   */
  async sendPayment(
    ticker,
    senders = [],
    receivers = [],
    amounts = [],
    unique_hash = '',
    mycallback: ((response: { err?: string; hash?: string; rtnObj?: any }) => void) | null = null,
    saito_public_key = null,
    memo = ''
  ) {
    // TEMP_DIAG_POKER_AUTH: wallet.sendPayment outbound trace (general crypto send wrapper)
    const trunc = (s) =>
      typeof s === 'string' && s.length > 14 ? `${s.slice(0, 8)}...${s.slice(-6)}` : s;
    console.info('[TEMP_DIAG_POKER_AUTH] wallet.sendPayment invoked', {
      ticker,
      sender_crypto: trunc(senders?.[0]),
      receiver_crypto: trunc(receivers?.[0]),
      amount: amounts?.[0],
      unique_hash: trunc(unique_hash),
      saito_public_key: trunc(saito_public_key),
      memo: trunc(memo)
    });

    if (senders.length !== 1 || receivers.length !== 1 || amounts.length !== 1) {
      // We have no code which exercises multiple senders/receivers so can't implement it yet.
      console.info('[TEMP_DIAG_POKER_AUTH] wallet.sendPayment length validation FAILED', {
        senders_len: senders?.length,
        receivers_len: receivers?.length,
        amounts_len: amounts?.length
      });
      console.error('sendPayment ERROR: Only supports one transaction');
      // console.log(senders, receivers, amounts);
      if (mycallback) {
        mycallback({ err: 'Only supports one transaction' });
      }
      return;
    }

    let rtnObj: any = {};

    //
    // This check is to prevent double paying in a game do to a refresh
    //
    if (!this.doesPreferredCryptoTransactionExist(unique_hash)) {
      console.log(
        '[wallet.ts -- sendPayment] preferred crypto transaction does not already exist',
        saito_public_key
      );
      try {
        const cryptomod = this.returnCryptoModuleByTicker(ticker);
        console.info('[TEMP_DIAG_POKER_AUTH] wallet.sendPayment cryptomod resolved', {
          cryptomod_name: cryptomod?.name,
          cryptomod_ticker: cryptomod?.ticker,
          cryptomod_chain_id: cryptomod?.chain_id
        });
        for (let i = 0; i < senders.length; i++) {
          //
          // DEBUGGING - sender is address to which we send the crypto
          //       - not our own publickey
          //

          if (senders[i] === cryptomod.formatAddress()) {
            // Need to save before we await, otherwise there is a race condition
            console.info('[TEMP_DIAG_POKER_AUTH] wallet.sendPayment sender address MATCH', {
              sender: trunc(senders[i]),
              cryptomod_formatAddress: trunc(cryptomod.formatAddress())
            });
            await this.savePreferredCryptoTransaction(unique_hash);
            console.info(
              '[TEMP_DIAG_POKER_AUTH] wallet.sendPayment saved preferred crypto transaction',
              {
                unique_hash: trunc(unique_hash)
              }
            );
            try {
              console.info(
                '[TEMP_DIAG_POKER_AUTH] wallet.sendPayment calling cryptomod.sendPayment',
                {
                  amount: amounts[i],
                  receiver: trunc(receivers[i]),
                  unique_hash: trunc(unique_hash)
                }
              );
              const hash = await cryptomod.sendPayment(amounts[i], receivers[i], unique_hash, memo);
              console.info(
                '[TEMP_DIAG_POKER_AUTH] wallet.sendPayment cryptomod.sendPayment returned',
                {
                  hash: trunc(hash)
                }
              );
              //
              // hash is "" if unsuccessful, trace_id if successful
              //
              if (hash === '') {
                console.info(
                  '[TEMP_DIAG_POKER_AUTH] wallet.sendPayment cryptomod returned empty hash (treat as unsuccessful)'
                );
                this.deletePreferredCryptoTransaction(unique_hash);
              }

              // chain_id covers native SAITO and native NFTs
              // ticker !== 'SAITO'
              if (cryptomod.chain_id !== 'NATIVE') {
                if (saito_public_key) {
                  //
                  // duplicate the "crypto payment" for non-native off chain transactions
                  //

                  console.log(
                    '************ sendPayment [non-SAITO] -- add metadata transaction ******'
                  );
                  await cryptomod.sendPaymentTransaction(
                    saito_public_key,
                    senders[i],
                    receivers[i],
                    amounts[i],
                    hash || unique_hash,
                    memo
                  );
                }
              }

              if (mycallback) {
                console.info(
                  '[TEMP_DIAG_POKER_AUTH] wallet.sendPayment invoking mycallback with success',
                  {
                    hash: trunc(hash)
                  }
                );
                mycallback({ hash: hash });
              }
              return { hash: hash };
            } catch (err) {
              console.error(err);
              // it failed, delete the transaction
              this.deletePreferredCryptoTransaction(unique_hash);
              rtnObj = { err: err instanceof Error ? err.message : String(err) };
              console.info(
                '[TEMP_DIAG_POKER_AUTH] wallet.sendPayment cryptomod.sendPayment threw',
                {
                  err: typeof rtnObj?.err === 'string' ? trunc(rtnObj.err) : rtnObj?.err
                }
              );
            }
          } else {
            console.log(cryptomod.name);
            console.log(senders[i], cryptomod.formatAddress());
            console.info('[TEMP_DIAG_POKER_AUTH] wallet.sendPayment sender address MISMATCH', {
              sender: trunc(senders[i]),
              cryptomod_formatAddress: trunc(cryptomod.formatAddress())
            });
            rtnObj = { err: 'wrong address' };
          }
        }
      } catch (err) {
        rtnObj = { err: err instanceof Error ? err.message : String(err) };
        console.info('[TEMP_DIAG_POKER_AUTH] wallet.sendPayment outer try/catch threw', {
          err: typeof rtnObj?.err === 'string' ? trunc(rtnObj.err) : rtnObj?.err
        });
      }
    } else {
      rtnObj = { err: 'already sent' };
      console.info(
        '[TEMP_DIAG_POKER_AUTH] wallet.sendPayment preferred tx already exists -> already sent'
      );
    }

    // console.error('sendPayment ERROR: ', rtnObj);

    if (mycallback) {
      console.info('[TEMP_DIAG_POKER_AUTH] wallet.sendPayment invoking mycallback with rtnObj', {
        has_err: rtnObj?.err != null,
        err: typeof rtnObj?.err === 'string' ? trunc(rtnObj.err) : rtnObj?.err,
        hash: rtnObj?.hash != null ? trunc(rtnObj.hash) : undefined
      });
      mycallback(rtnObj);
    }
    return rtnObj;
  }

  /**
   * Sends payments to the addresses provided if this user is the corresponding
   * sender. Will not send if similar payment was found after the given timestamp.
   * @param {Array} senders - Array of addresses -- in web3 currency
   * @param {Array} receivers - Array of addresses -- in web3 curreny
   * @param {Array} amounts - Array of amounts to send
   * @param {Int} timestamp - Timestamp of time after which payment should be made
   * @param {Function} mycallback - ({hash: {String}}) -> {...}
   * @param {String} ticker - Ticker of install crypto module
   */
  async sendPayments(
    senders = [],
    receivers = [],
    amounts = [],
    timestamp,
    unique_hash = '',
    mycallback: ((response: { err?: string; hash?: string }) => void) | null = null,
    ticker
  ) {
    console.log('wallet sendPayment 2');
    // validate inputs
    if (senders.length != receivers.length || senders.length != amounts.length) {
      // mycallback({err: "Lengths of senders, receivers, and amounts must be the same"});
      return;
    }

    if (!this.doesPreferredCryptoTransactionExist(unique_hash)) {
      try {
        const cryptomod = this.returnCryptoModuleByTicker(ticker);
        await this.savePreferredCryptoTransaction(unique_hash);

        let amounts_to_send: bigint[] = [];
        let to_addresses = [];
        for (let i = 0; i < senders.length; i++) {
          amounts_to_send.push(BigInt(amounts[i]));
          to_addresses.push(receivers[i]);
        }
        const hash = await cryptomod.sendPayments(amounts_to_send, to_addresses);
        //
        // hash is "" if unsuccessful, trace_id if successful
        //
        if (hash === '') {
          this.deletePreferredCryptoTransaction(unique_hash);
        }

        if (mycallback) {
          mycallback({ hash: hash });
        }
        return;
      } catch (err) {
        // it failed, delete the transaction
        // console.log('sendPayments ERROR: payment failed....\n' + err);
        this.deletePreferredCryptoTransaction(unique_hash);
        if (mycallback) {
          mycallback({ err: err });
        }
        return;
      }
    } else {
      console.log('sendPayment ERROR: already sent');
      //mycallback({err: "already sent"});
    }
  }

  /**
   * Checks that a payment has been received if the current user is the receiver.
   * @param {String} ticker - Ticker of install crypto module
   * @param {Array} senders - Array of addresses
   * @param {Array} receivers - Array of addresses
   * @param {Array} amounts - Array of amounts to send
   * @param {Function} mycallback - (Array of {address: {String}, balance: {Int}}) -> {...}
   * @param {String} (optional) public key of sender
   */
  async receivePayment(ticker: string, sender: string, amount: string, unique_hash = '') {
    const cryptomod = this.returnCryptoModuleByTicker(ticker);
    if (cryptomod) {
      await cryptomod.receivePayment(amount, sender, unique_hash);
    } else {
      console.error('Cannot receive payment to uninstalled crypto module!');
    }
  }

  async savePreferredCryptoTransaction(unique_tx_hash) {
    this.preferred_txs.push({
      sig: unique_tx_hash,
      ts: new Date().getTime()
    });

    // trim old transactions
    for (let i = this.preferred_txs.length - 1; i >= 0; i--) {
      if (this.preferred_txs[i].ts < new Date().getTime() - 100000000) {
        this.preferred_txs.splice(i, 1);
      }
    }

    await this.saveWallet();

    return 1;
  }

  doesPreferredCryptoTransactionExist(unique_tx_hash) {
    for (let i = 0; i < this.preferred_txs.length; i++) {
      if (this.preferred_txs[i].sig === unique_tx_hash) {
        return 1;
      }
    }
    return 0;
  }

  deletePreferredCryptoTransaction(unique_tx_hash) {
    console.log('Deleting preferred crypto transaction');

    for (let i = 0; i < this.preferred_txs.length; i++) {
      if (this.preferred_txs[i].sig === unique_tx_hash) {
        this.preferred_txs.splice(i, 1);
      }
    }
  }

  private async isSlipInPendingTransactions(input: Slip): Promise<boolean> {
    let pending = await this.getPendingTransactions();
    for (let i = 0; i < pending.length; i++) {
      let ptx = pending[i];
      for (let ii = 0; ii < ptx.from.length; ii++) {
        if (input.utxoKey === ptx.from[ii].utxoKey) {
          return true;
        }
      }
    }
    return false;
  }

  async getPendingTransactions() {
    return this.getPendingTxs();
  }

  /////////////////////
  // END WEB3 CRYPTO //
  /////////////////////

  //////////////////
  // UI Functions //
  //////////////////

  //
  // We can use this function to selectively exclude some things from the "wallet"
  // for backup purposes
  //
  exportWallet() {
    this.app.options.wallet.ts = Date.now();

    let newObj = JSON.parse(JSON.stringify(this.app.options));

    delete newObj.games;

    return JSON.stringify(newObj, null, 2);
  }

  /**
   * Serialized the user's wallet to JSON and downloads it to their local machine
   */
  async backupWallet() {
    try {
      if (this.app.BROWSER == 1) {
        let publicKey = await this.getPublicKey();

        delete this.app.options.wallet.backup_required;
        this.app.connection.emit('saito-header-update-message');

        //let content = JSON.stringify(this.app.options);
        let pom = document.createElement('a');
        pom.setAttribute('type', 'hidden');
        pom.setAttribute(
          'href',
          'data:application/json;utf-8,' + encodeURIComponent(this.exportWallet())
        );
        pom.setAttribute('download', `saito-wallet-${publicKey}.json`);
        document.body.appendChild(pom);
        pom.click();
        pom.remove();

        await this.saveWallet();
      }
    } catch (err) {
      // console.log('Error backing-up wallet: ' + err);
    }
  }

  /**
   * If the to field of the transaction contains a pubkey which has previously negotiated a diffie-hellman
   * key exchange, encrypt the message part of message, attach it to the transaction, and resign the transaction
   * @param {Transaction}
   * @return {Transaction}
   */
  async signAndEncryptTransaction(tx: Transaction, recipient = '') {
    if (tx == null) {
      return null;
    }

    //
    // convert tx.msg to base64 tx.ms
    //
    // if the transaction is of excessive length, we cut the message and
    // continue blank. so be careful kids as there are some hardcoded
    // limits in NodeJS!
    //
    try {
      // Empty placeholder protects data in case encryption fails to fire
      let encryptedMessage = '';

      // if recipient input has a shared secret in keychain
      if (this.app.keychain.hasSharedSecret(recipient)) {
        encryptedMessage = this.app.keychain.encryptMessage(recipient, tx.msg);
      }
      // if tx sendee's public address has shared secret
      else if (this.app.keychain.hasSharedSecret(tx.to[0].publicKey)) {
        encryptedMessage = this.app.keychain.encryptMessage(tx.to[0].publicKey, tx.msg);
      }

      if (encryptedMessage) {
        tx.msg = encryptedMessage;
      } else {
        //console.warn("Not encrypting transaction because don't have shared key with recipient");
      }

      //
      // nov 25 2022 - eliminate base64 formatting for TXS
      //
      //tx.m = Buffer.from(
      //  this.app.crypto.stringToBase64(JSON.stringify(tx.msg)),
      //  "base64"
      //);
      tx.data = Buffer.from(JSON.stringify(tx.msg), 'utf-8');
    } catch (err) {
      // console.log('####################');
      // console.log('### OVERSIZED TX ###');
      // console.log('###   -revert-   ###');
      // console.log('####################');
      // console.log(err);
      tx.msg = {};
    }

    await tx.sign();

    return tx;
  }

  public async fetchBalanceSnapshot(key: string) {
    const balanceUrl = '/balance/' + key;
    try {
      console.log('fetching balance snapshot for key : ' + key);
      console.log('[BALANCE FETCH] requesting snapshot URL:', balanceUrl);
      let response = await fetch(balanceUrl);
      if (!response.ok) {
        console.log(
          `[BALANCE FETCH] non-OK response status=${response.status} statusText=${response.statusText} url=${balanceUrl}`
        );
      }
      let data = await response.text();
      let snapshot = BalanceSnapshot.fromString(data);
      if (snapshot) {
        const expectedBalance = snapshot.rows.reduce((total, row) => {
          const cols = row.split(' ');
          if (cols.length < 5) {
            return total;
          }
          try {
            return total + BigInt(cols[4]);
          } catch (_err) {
            return total;
          }
        }, BigInt(0));
        console.log(
          `[BALANCE FETCH] snapshot parsed file=${snapshot.file_name} rows=${snapshot.rows.length} expected_balance_nolan=${expectedBalance.toString()}`
        );
        const beforeSlipCount = (await this.getSlips()).length;
        await S.getInstance().updateBalanceFrom(snapshot);
        const afterSlipCount = (await this.getSlips()).length;
        console.log(
          `[BALANCE FETCH] wallet slips updated before=${beforeSlipCount} after=${afterSlipCount} added=${Math.max(
            0,
            afterSlipCount - beforeSlipCount
          )}`
        );
      } else {
        console.log(`[BALANCE FETCH] snapshot parse failed url=${balanceUrl}`);
      }
    } catch (error) {
      console.log('[BALANCE FETCH] request/update failed:', error);
    }
  }

  //
  // temporarily disabled
  //
  public async addTransactionToPending(tx: Transaction, save = true) {
    await S.getInstance().addPendingTx(tx);

    if (save) {
      await this.saveWallet();
    }
  }

  public async onUpgrade(type = '', privatekey = '', decrypted_wallet = null) {
    let publicKey = await this.getPublicKey();

    if (type == 'nuke') {
      if (this.app.BROWSER) {
        let ok = await sconfirm(
          'Delete all existing data and restore this browser to a fresh state?'
        );
        if (!ok) {
          return false;
        }

        const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const hasSaito = (await this.getBalance('SAITO')) > BigInt(0);

        if (!isLocalhost && hasSaito) {
          ok = await sconfirm(
            'Warning: this wallet contains SAITO. If you have not backed up your wallet, deleting its data may cause you to lose these funds. Continue?'
          );
          if (!ok) {
            return false;
          }
        }
      }

      await this.resetWallet();
      publicKey = await this.getPublicKey();
    } else if (type == 'import') {
      //
      // wallet file used for importing
      //
      if (decrypted_wallet != null) {
        try {
          let wobj = JSON.parse(decrypted_wallet);

          // Implicit Nuke: clear stale local state before installing the file.
          await this.resetWallet();

          await this.setPublicKey(wobj.wallet.publicKey);
          await this.setPrivateKey(wobj.wallet.privateKey);
          wobj.wallet.version = this.version;
          wobj.wallet.inputs = [];
          wobj.wallet.outputs = [];
          wobj.wallet.spends = [];
          wobj.games = [];
          this.app.options = wobj;
        } catch (err) {
          // console.error(err);
          return err;
        }

        publicKey = await this.getPublicKey();
      } else if (privatekey != '') {
        //
        // privatekey used for wallet importing
        //
        try {
          // Implicit Nuke: wipe slips, pending txs, IndexedDB, and module state
          // so leftover data from the previous key cannot block spends.
          await this.resetWallet();

          publicKey = this.app.crypto.generatePublicKey(privatekey);
          await this.setPublicKey(publicKey);
          await this.setPrivateKey(privatekey);
          if (!this.app.options.wallet) {
            this.app.options.wallet = {};
          }
          this.app.options.wallet.version = this.version;
          this.app.options.wallet.inputs = [];
          this.app.options.wallet.outputs = [];
          this.app.options.wallet.spends = [];
          this.app.options.wallet.pending = [];
          this.app.options.wallet.slips = [];

          // Do not rehydrate options from IndexedDB for this key — resetWallet
          // already cleared local persistence; restoring would reintroduce
          // the stale state that prevents the imported key from sending.
        } catch (err) {
          // console.error(err);
          return err;
        }
      } else {
        console.error('Cannot import a wallet without a private key or json file!');
      }
    } else if (type == 'upgrade') {
      // purge old slips
      this.app.options.wallet.slips = [];
    }

    await this.app.modules.onUpgrade(type, privatekey, decrypted_wallet);

    await this.app.blockchain.resetBlockchain();

    await this.fetchBalanceSnapshot(publicKey);

    // console.log(JSON.parse(JSON.stringify(this.app.options.wallet)));
    await this.saveWallet();
    return true;
  }

  public convertSaitoToNolan(amount = '0.0') {
    let nolan = 0;
    let num = Decimal(amount);
    if (Number(amount) > 0) {
      nolan = Number(num.times(this.nolan_per_saito).toFixed(0)); // 100,000,000
    }

    return BigInt(nolan);
  }

  public convertNolanToSaito(amount = BigInt(0)) {
    let string = '0.00';
    let num = 0;
    let bigint_divider = 100000000n;

    if (typeof amount == 'bigint') {
      // convert bigint to number
      num = Number((amount * 100000000n) / bigint_divider) / 100000000;
      // convert number to string
      string = num.toString();
    } else {
      try {
        let nolan = BigInt(amount);
        num = Number((nolan * 100000000n) / bigint_divider) / 100000000;
        // convert number to string
        string = num.toString();
      } catch (err) {
        console.error(
          `convertNolanToSaito: Type ` +
            typeof amount +
            ` provided. BigInt required, failed to convert --`,
          err
        );
      }
    }

    return string;
  }

  public async setKeyList(keylist: string[]): Promise<void> {
    return await this.instance.set_key_list(keylist);
  }

  public async disableProducingBlocksByTimer() {
    return S.getInstance().disableProducingBlocksByTimer();
  }

  public async produceBlockWithGt(txs?: Transaction[]) {
    return S.getInstance().produceBlockWithGt(txs);
  }

  public async produceBlockWithoutGt(txs?: Transaction[]) {
    return S.getInstance().produceBlockWithoutGt(txs);
  }

  /**
   * Update wallet’s nft list
   * @param {Object[]} nft_list  an array of NFT objects
   */
  async saveNFTList(nft_list) {
    if (!Array.isArray(nft_list)) {
      throw new Error('saveNFTList expects an array of NFTs');
    }
    this.app.options.wallet.nfts = nft_list;
    await this.saveWallet();
  }

  /**
   * Update rust wallet nft struct
   */
  async addNFTList() {
    if (!this.app.options.wallet.nfts) {
      this.app.options.wallet.nfts = [];
    }
    let nfts = this.app.options.wallet.nfts;

    if (nfts.length > 0) {
      for (let i = 0; i < nfts.length; i++) {
        let nft = nfts[i];

        let slip1_utxokey = nft.slip1.utxo_key;
        let slip2_utxokey = nft.slip2.utxo_key;
        let slip3_utxokey = nft.slip3.utxo_key;
        let id = nft.id;
        let tx_sig = nft.tx_sig;
        let ticker = nft.ticker || '';

        //
        // Nft is improper, but requires rationalization elsewhere
        //
        this.addNft(slip1_utxokey, slip2_utxokey, slip3_utxokey, id, tx_sig, ticker);
      }
    }
  }

  async updateNFTList(): Promise<{
    updated: any[];
    rebroadcast: any[];
    persisted: boolean;
  }> {
    //
    //  fetch on-chain
    //
    const raw = await this.app.wallet.getNFTList();
    const nfts: Array<{
      id: string;
      slip1: any;
      slip2: any;
      slip3: any;
      tx_sig: string;
      ticker?: string;
    }> = typeof raw === 'string' ? JSON.parse(raw) : raw;

    //
    // snapshot local
    //
    const local = (this.app.options.wallet.nfts as typeof nfts) ?? [];

    //
    // ensure intents bag exists and keep a stable ref
    //
    const intents: Record<string, number> = (this.app.options.wallet.nftMergeIntents ||=
      {} as Record<string, number>);
    let intentsMutated = false;

    //
    //  helpers
    //
    const groupByKey = (arr: typeof nfts) => {
      const g: Record<string, typeof nfts> = Object.create(null);
      for (const it of arr) {
        if (!it || typeof it.id !== 'string') continue;
        (g[it.id] ??= []).push(it);
      }
      return g;
    };

    const stripSlipLike = (it: any) => {
      const { slip1, slip2, slip3, tx_sig, ticker, ...rest } = it ?? {};
      return rest;
    };
    const signature = (it: any) => JSON.stringify(stripSlipLike(it));

    const isSlipOnlyChange = (A: any[], B: any[]) => {
      const countMap = (arr: any[]) => {
        const m = new Map<string, number>();
        for (const it of arr) {
          const s = signature(it);
          m.set(s, (m.get(s) ?? 0) + 1);
        }
        return m;
      };
      const mA = countMap(A);
      const mB = countMap(B);
      const allKeys = new Set([...mA.keys(), ...mB.keys()]);
      for (const k of allKeys) {
        if ((mA.get(k) ?? 0) !== (mB.get(k) ?? 0)) return false;
      }
      return true;
    };

    const amt = (x: any): bigint => {
      const a = x?.slip2?.amount ?? 0;
      return BigInt(typeof a === 'string' ? a : Number(a));
    };

    const hasUserMergeIntent = (id: string) => {
      const ts = intents[id];
      const TTL = 2 * 60_000; // 2 minutes
      return !!ts && Date.now() - ts <= TTL;
    };

    const clearMergeIntent = (id: string) => {
      if (id in intents) {
        delete intents[id];
        intentsMutated = true;
      }
    };

    //  build maps
    //
    //
    const L = groupByKey(local);
    const C = groupByKey(nfts);
    const keys = new Set([...Object.keys(L), ...Object.keys(C)]);

    //
    //  types
    //
    const updated: any[] = [];
    const rebroadcast: any[] = [];

    //
    //  classify
    //
    for (const k of keys) {
      const l = L[k] ?? [];
      const c = C[k] ?? [];

      if (l.length !== c.length) {
        // rebroadcast-style MERGE: N>1 -> 1 and amounts consolidated
        if (l.length > 1 && c.length === 1) {
          const sumLocal = l.reduce((s, it) => s + amt(it), 0n);
          const curAmt = amt(c[0]);

          if (sumLocal === curAmt) {
            if (hasUserMergeIntent(k)) {
              updated.push(...c); // user-initiated
            } else {
              rebroadcast.push(...c); // network rebroadcast consolidation
            }
            clearMergeIntent(k);
            continue;
          }
        }

        updated.push(...c);
        continue;
      }

      if (c.length === 0) continue;

      if (isSlipOnlyChange(l, c)) {
        rebroadcast.push(...c);
      } else {
        updated.push(...c);
      }
    }

    //
    //  persist
    //
    const hasChanges = updated.length;
    let persisted = false;
    this.app.options.wallet.nfts = nfts;
    await this.app.wallet.saveNFTList(nfts);

    if (hasChanges > 0) {
      // re-attach the same intents object in case saveNFTList mutates options internally
      this.app.options.wallet.nftMergeIntents = intents;
      persisted = true;
    }

    //
    // if (!hasChanges && intentsMutated) {
    //   await this.app.wallet.saveOptions?.();
    // }

    return { updated, rebroadcast, persisted };
  }

  /**
   *
   *  Create an NFT
   *
   */
  public async createMintNFTTransaction(
    num,
    deposit,
    tx_msg,
    fee,
    receipient_publicKey,
    nft_type
  ): Promise<Transaction> {
    return this.app.core.wallet.createBoundTransaction(
      num,
      deposit,
      tx_msg,
      fee,
      receipient_publicKey,
      nft_type
    );
  }

  /**
   * Advanced / manual shard NFT transfer (legacy bound-transaction path).
   */
  public async createNFTShardTransaction(nft, receipient_publicKey) {
    await nft.fetchTransaction();

    return this.app.core.wallet.createSendBoundTransaction(
      BigInt(nft.amount),
      nft.slip1.utxo_key,
      nft.slip2.utxo_key,
      nft.slip3.utxo_key,
      receipient_publicKey,
      nft.txmsg
    );
  }

  /**
   * Default amount-based NFT send (wallet selects shards; tx_msg carried on transaction.data).
   */
  public async createNFTTransaction(
    nft,
    recipient_public_key,
    amount,
    fee = BigInt(0),
    saito_deposit = BigInt(0),
    tx_msg?: object
  ) {
    await nft.fetchTransaction();

    console.log('<<<<<<******', tx_msg);
    const msg = Object.assign(tx_msg, nft.txmsg || {});
    console.log(msg, '*****>>>>>>>>');

    return this.app.core.wallet.createNFTTransaction(
      recipient_public_key,
      BigInt(amount),
      nft.id,
      fee,
      saito_deposit,
      msg
    );
  }

  /**
   *
   *  Split an NFT
   *
   */
  public async createSplitNFTTransaction(nft, leftCount, rightCount): Promise<Transaction> {
    await nft.fetchTransaction();

    return this.app.core.wallet.createSplitBoundTransaction(
      nft.slip1.utxo_key,
      nft.slip2.utxo_key,
      nft.slip3.utxo_key,
      leftCount,
      rightCount,
      nft.txmsg
    );
  }

  /**
   *
   *  Atomize an NFT
   *
   */
  public async createAtomizeNFTTransaction(nft: any): Promise<Transaction> {
    await nft.fetchTransaction();

    return this.app.core.wallet.createAtomizeBoundTransaction(
      nft.slip1.utxo_key,
      nft.slip2.utxo_key,
      nft.slip3.utxo_key,
      nft.txmsg
    );
  }

  /**
   *
   *  Merge an NFT
   *
   */
  public async createMergeNFTTransaction(nft): Promise<Transaction> {
    await nft.fetchTransaction();

    return this.app.core.wallet.createMergeBoundTransaction(nft.id, nft.txmsg);
  }

  /**
   *
   *  Remove an NFT
   *
   *
   */
  public async createRemoveNFTTransaction(nft) {
    return this.app.core.wallet.createRemoveBoundTransaction(
      nft.slip1.utxo_key,
      nft.slip2.utxo_key,
      nft.slip3.utxo_key,
      nft.txmsg
    );
  }

  //
  // we can't run this on init, so we call it from modules.ts so that
  // the modules exist by the time we want the NFTs to be able to interact
  // with them...
  //
  public async loadNFTs() {
    if (this.app.BROWSER && this.app.browser.returnURLParameter('nonfts')) {
      console.warn('NFT loading disabled by nonfts URL parameter');
      return;
    }

    try {
      await this.updateNFTList();

      let nft_balance_by_id = {};

      if (this.app.options.wallet.nfts) {
        for (let z = 0; z < this.app.options.wallet.nfts.length; z++) {
          let nft = this.app.options.wallet.nfts[z];
          let nft_sig = nft.tx_sig;
          let nft_type = this.extractNFTType(nft.slip3.utxo_key);

          //
          // check balance (will be used for wallet)
          //
          try {
            let amt = BigInt(nft.slip1.amount);
            if (amt > 0n) {
              if (!nft_balance_by_id[nft.id]) {
                nft_balance_by_id[nft.id] = 0n;
              }
              nft_balance_by_id[nft.id] += amt;
            }
          } catch (err) {
            console.warn('Invalid NFT amount:', nft.amount);
          }

          //
          // we only load "enabled" NFTS
          //
          if (this.app.options?.permissions?.nfts) {
            if (this.app.options.permissions.nfts.includes(nft_sig)) {
              this.app.storage.loadTransactions(
                { sig: nft_sig },
                async (txs) => {
                  for (let zz = 0; zz < txs.length; zz++) {
                    let txmsg = txs[zz].returnMessage();

                    if (txmsg.data?.image) {
                    }
                    if (txmsg.data?.js) {
                      try {
                        let fn = new Function(`return (async () => { ${txmsg.data.js} })()`);
                        await fn.call(this);
                      } catch (err) {
                        // console.error(
                        //   `NFT module execution failed [${txmsg.sig || 'unknown'}]:`,
                        //   err
                        // );
                      }
                    }
                    if (txmsg.data?.css) {
                      const style = document.createElement('style');
                      style.textContent = txmsg.data.css;
                      document.head.appendChild(style);
                    }
                  }
                },
                'localhost'
              );
            }
          }
        }

        //
        // make spendable as other tokens
        //
        for (let nft_id in nft_balance_by_id) {
          let total = nft_balance_by_id[nft_id];
          if (total <= 0n) {
            continue;
          }

          let ticker = '';

          for (let z = 0; z < this.app.options.wallet.nfts.length; z++) {
            let nft = this.app.options.wallet.nfts[z];
            if (nft.id == nft_id) {
              ticker = nft.ticker?.trim();

              /*
              // IMPORTANT NOTE - TODO
              We need a test for the NFT type here. This code will treat every NFT like a token, 
              which may be a desired result (especially, since ticker is now hardcoded in every NFT object)
              But, if that is the case, then there is no reason to have a defined "token"-type NFT

              Proposed solutions: 
              1) add a type test here
              2) use ticker as a quick and dirty is nft a token test
                2a) in creation overlay, make ticker a mandatory field
                2b) in creatino overylay, cut-paste the following auto ticker generator
              */
              //if (!ticker) {
              //  ticker = `NFT-${this.app.crypto.hash(nft_id).slice(0, 6)}`;
              //}
            }
          }

          if (this.returnCryptoModuleByTicker(ticker) || ticker == '') {
            continue;
          }

          await this.addNFTToWallet(nft_id, ticker);

          console.log(`NFT crypto module installed: ${ticker} (balance ${total.toString()})`);
        }

        // IMPORTANT NOTE - TODO
        // We need to emit an event here to trigger a cryptoRender so that the installed token-NFTs display in the
        // Saito-HEADER
      }
    } catch (err) {
      console.log('Error: load nfts');
    }
  }

  public async addNFTToWallet(nft_id, ticker) {
    // I don't think we want this when loading our saved NFT-tokens...
    //await this.updateNFTList();

    if (this.returnCryptoModuleByTicker(ticker)) {
      return;
    }
    let mod = new NFTCryptoModule(this.app, nft_id, {
      ticker,
      name: ticker
    });
    this.app.modules.mods.push(mod);
    await mod.initialize(this.app);
  }

  public async onNewBoundTransaction(tx: Transaction) {
    try {
      if (tx.isTo(this.app.wallet.publicKey)) {
        console.log('%%% NFT %%%');
        tx.printSlips();
        console.log('%%% %%% %%%');

        if (tx.to[1] && tx.to[1].publicKey == this.app.wallet.publicKey) {
          console.log('%%% yeah, it is for me!');
          let nft_list = this.app.options.wallet.nfts || [];
          let nft_id = this.computeNFTIdFromTx(tx);

          nft_list.forEach(function (nft) {
            if (nft.tx_sig == tx.signature) {
              console.log('Have nft saved locally');
              if (nft_id !== nft.id) {
                console.warn('Nft id mismatch!!!');
                nft_id = nft.id;
              }
            }
          });

          let txmsg = tx.returnMessage();
          let field1 = txmsg.module || 'NFT';

          if (nft_id)
            this.app.storage.loadTransactions(
              { field4: nft_id },
              (txs) => {
                if (txs.length) {
                  console.log('%%% nft already in local archives' + nft_id);
                } else {
                  console.log('%%% saving nft transaction: ' + nft_id);
                  this.app.storage.saveTransaction(
                    tx,
                    { field1, field4: nft_id, preserve: 1 },
                    'localhost'
                  );
                }
              },
              'localhost',
              0
            );
        }
      }
    } catch (err) {
      // console.error('Error while saving NFT tx to archive in wallet.ts: ', err);
    }
  }

  public extractNFTType(hex = '') {
    if (!hex || hex.length < 66 || !/^[0-9a-fA-F]+$/.test(hex)) {
      return '';
    }
    hex = hex.slice(0, 66);
    const bytes = new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
    if (bytes.length !== 33) {
      return '';
    }
    const typeBytes = bytes.slice(17); // bytes[17..33)
    const decoder = new TextDecoder();
    const text = decoder.decode(typeBytes).replace(/\x00+$/, '');
    return text;
  }

  //
  // We need a way to get nft_id from NFT tx.
  //
  // If the NFT belongs to us we can simply get nft_id
  // from storage (app.options.wallet.nfts[i].id). But in cases
  // where NFT doesnt belong to us (e.g listed on assetstore) we
  // need to compute nft_id based on the NFT tx we have.
  //
  // This situation isnt unqiue to assetstore, other mods will be
  // creating NFT objects based on NFT tx so doesnt makes sense for this
  // method below to be placed in assetstore.
  //

  //
  // Ideal way would be to let rust comoute this by sending NFT tx
  // to rust. For now temporarily JS is handling this.
  //

  // Derive an NFT id from a tx
  public computeNFTIdFromTx(tx: Transaction) {
    if (!tx) {
      return null;
    }

    // Prefer outputs; fall back to inputs
    let s3 = (tx?.to && tx.to[2]) || (tx?.from && tx.from[2]);
    if (!s3 || !s3.publicKey) {
      return null;
    }

    let pk: any = s3.publicKey;
    let bytes = null;

    // Normalize to Uint8Array
    if (pk instanceof Uint8Array || (typeof Buffer !== 'undefined' && pk instanceof Buffer)) {
      bytes = new Uint8Array(pk);
    } else if (typeof pk === 'string') {
      if (/^[0-9a-fA-F]{66}$/.test(pk)) {
        // Hex (33 bytes = 66 hex chars)
        bytes = this.app.crypto.hexToBytes(pk);
      } else {
        // Assume Base58 (Saito-style pubkey encoding)
        bytes = this.app.crypto.base58ToBytes(pk);
      }
    } else if (pk && typeof pk === 'object' && pk.data) {
      bytes = new Uint8Array(pk?.data || pk);
    }

    if (!bytes) {
      return null;
    }

    // Some encoders may prepend a 0x00; tolerate 34→33
    if (bytes.length === 34 && bytes[0] === 0) {
      bytes = bytes.slice(1);
    }
    if (bytes.length !== 33) {
      return null;
    }

    // Return as hex string
    return Array.from(bytes)
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
