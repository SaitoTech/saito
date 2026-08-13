const saito = require('./../../lib/saito/saito');
const Transaction = require('../../lib/saito/transaction').default;
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const ModTemplate = require('./../../lib/templates/modtemplate');
const VaultMain = require('./lib/ui/main');
const VaultHome = require('./index');
const AccessFileOverlay = require('./lib/ui/overlays/load-nfts.js');
const WitnessOverlay = require('./lib/ui/overlays/witness');
const { buildDefaultAccessScript } = require('./lib/contracts');

class Vault extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'Vault';
    this.name = 'Vault';
    this.slug = 'vault';
    this.dependencies = ['Archive'];
    this.description = 'Storage Vault regulated by NFT Keys';
    this.categories = 'Utility Cryptography Programming';
    this.icon = 'fas fa-vault';

    this.peer_connected = false;
    this.peer = null;

    //
    // vars for users / uploads
    //
    this.file = null;
    this.filename = '';
    this.file_id = null;
    this.mode = 'private';
    this.styles = ['/vault/style.css'];

    this.social = this.buildSocial({
      twitter: '@SaitoOfficial',
      title: 'Vault - Secure Storage',
      url: '/vault',
      description: 'NFT-based cloud storage',
      image: '/vault/img/splash.png'
    });

    this.access_file_overlay = new AccessFileOverlay(this.app, this);
  }

  async initialize(app) {
    if (this.app.BROWSER) {
      const SaitoTransactionMonitor = require('../../lib/saito/ui/saito-transaction-monitor/saito-transaction-monitor');
      this.transaction_monitor = new SaitoTransactionMonitor(this.app, this);
    }

    // Persistent local cache: Vault NFT identity → file metadata.
    if (!this.app.options.vault) {
      this.app.options.vault = {};
    }
    if (!this.app.options.vault.files || typeof this.app.options.vault.files !== 'object') {
      this.app.options.vault.files = {};
    }

    if (this.browser_active) {
      this.main = new VaultMain(app, this, '.saito-container');
      this.addComponent(this.main);
      this.header = new SaitoHeader(app, this);
      await this.header.initialize(app);
      this.addComponent(this.header);
    }
  }

  //
  // Persist generic Vault file metadata for an NFT key.
  // Keyed by NFT id (not filename). Used by any module that needs
  // "what Vault file does this NFT represent?" without reloading the mint tx.
  //
  cacheNftFileMetadata(meta = {}, opts = {}) {
    if (!this.app.options.vault) {
      this.app.options.vault = {};
    }
    if (!this.app.options.vault.files || typeof this.app.options.vault.files !== 'object') {
      this.app.options.vault.files = {};
    }

    let nft_id = meta.nft_id || meta.id;
    if (!nft_id || !meta.file_id) {
      return null;
    }

    let entry = {
      nft_id: nft_id,
      tx_sig: meta.tx_sig || '',
      file_id: meta.file_id || '',
      filename: meta.filename || meta.file_name || '',
      link: meta.link || '',
      slip1_utxokey: meta.slip1_utxokey || '',
      slip2_utxokey: meta.slip2_utxokey || '',
      slip3_utxokey: meta.slip3_utxokey || '',
      file_access_script: meta.file_access_script || null
    };

    let existing = this.app.options.vault.files[nft_id];
    let unchanged =
      existing &&
      existing.file_id === entry.file_id &&
      existing.filename === entry.filename &&
      existing.tx_sig === entry.tx_sig &&
      existing.link === entry.link &&
      existing.slip1_utxokey === entry.slip1_utxokey &&
      existing.slip2_utxokey === entry.slip2_utxokey &&
      existing.slip3_utxokey === entry.slip3_utxokey;

    if (unchanged) {
      return existing;
    }

    this.app.options.vault.files[nft_id] = entry;
    if (opts.save !== false) {
      this.app.storage.saveOptions();
    }
    return entry;
  }

  getCachedNftFileMetadata(nft_id) {
    if (!nft_id) {
      return null;
    }
    return this.app.options?.vault?.files?.[nft_id] || null;
  }

  //
  // Return Vault file metadata for a wallet NFT entry.
  // Uses the local cache when present; otherwise loads the mint tx once,
  // caches the result, and returns it.
  //
  async returnNftFileMetadata(nft_entry) {
    if (!nft_entry) {
      return null;
    }

    let nft_id = nft_entry.id || nft_entry.nft_id || '';
    let tx_sig = nft_entry.tx_sig || '';

    // Prefer live wallet slips over any older cached witness keys.
    let wallet_entry = nft_entry;
    if (!wallet_entry?.slip1?.utxo_key && (nft_id || tx_sig)) {
      const nfts = this.app.options?.wallet?.nfts || [];
      wallet_entry =
        nfts.find((n) => (nft_id && n.id === nft_id) || (tx_sig && n.tx_sig === tx_sig)) ||
        nft_entry;
    }

    let cached = this.getCachedNftFileMetadata(nft_id);
    if (!cached?.file_id && tx_sig && this.app.options?.vault?.files) {
      // Fallback: locate by mint tx signature if the id was remapped.
      for (let id in this.app.options.vault.files) {
        let entry = this.app.options.vault.files[id];
        if (entry?.tx_sig === tx_sig && entry?.file_id) {
          cached = entry;
          break;
        }
      }
    }

    if (cached?.file_id) {
      if (wallet_entry?.slip1?.utxo_key) {
        return this.cacheNftFileMetadata({
          nft_id: cached.nft_id || nft_id || wallet_entry.id || '',
          tx_sig: cached.tx_sig || tx_sig || wallet_entry.tx_sig || '',
          file_id: cached.file_id,
          filename: cached.filename || '',
          link: cached.link || '',
          slip1_utxokey: wallet_entry.slip1.utxo_key,
          slip2_utxokey: wallet_entry.slip2?.utxo_key || cached.slip2_utxokey || '',
          slip3_utxokey: wallet_entry.slip3?.utxo_key || cached.slip3_utxokey || '',
          file_access_script: cached.file_access_script || null
        });
      }
      return cached;
    }

    if (!tx_sig) {
      return null;
    }

    return await new Promise((resolve) => {
      this.app.storage.loadTransactions(
        { sig: tx_sig },
        (txs) => {
          try {
            if (!txs || txs.length < 1) {
              resolve(null);
              return;
            }

            let msg = txs[0].returnMessage() || {};
            let data = msg.data || {};
            if (!data.file_id) {
              resolve(null);
              return;
            }

            let resolved_id = nft_id || '';
            // Prefer the on-chain NFT id from slips when wallet id is absent.
            if (!resolved_id) {
              try {
                const SaitoNFT = require('../../lib/saito/ui/saito-nft/saito-nft');
                let nft = new SaitoNFT(this.app, this, txs[0], wallet_entry);
                resolved_id = nft.id || '';
              } catch (err) {}
            }

            resolve(
              this.cacheNftFileMetadata({
                nft_id: resolved_id || tx_sig,
                tx_sig: tx_sig,
                file_id: data.file_id,
                filename: data.filename || '',
                link: data.link || '',
                slip1_utxokey: wallet_entry?.slip1?.utxo_key || '',
                slip2_utxokey: wallet_entry?.slip2?.utxo_key || '',
                slip3_utxokey: wallet_entry?.slip3?.utxo_key || '',
                file_access_script: data.file_access_script || null
              })
            );
          } catch (err) {
            console.log('VAULT: error loading NFT file metadata: ' + err);
            resolve(null);
          }
        },
        'localhost'
      );
    });
  }

  async render() {
    await super.render();
  }

  /////////////////////////////////
  // inter-module communications //
  /////////////////////////////////
  respondTo(type = '', obj) {
    let this_mod = this;

    if (type === 'redsquare-create') {
      return {
        id: 'vault-share',
        label: 'Share',
        image: '/saito/icons/saito-vault-icon-solid.svg',
        callback: () => {
          this_mod.attachStyleSheets();
          this_mod.access_file_overlay.file_upload_overlay.render();
        }
      };
    }

    //
    // Optional N-WASM library action: store the canonical N-WASM game
    // transaction/message (not a raw-ROM-only payload) behind a Vault key.
    //
    if (type === 'nwasm-library-actions') {
      return {
        id: 'vault-upload',
        title: 'Upload to Vault',
        description: 'Save remotely, use NFT for access control.',
        image: '/nwasm/img/upload_to_vault.png',
        rank: 20,
        callback: async (app, mod, ctx = {}) => {
          let game_data = ctx.game_data;
          if (!game_data?.module || !game_data?.file) {
            throw new Error('Vault upload requires N-WASM game data');
          }

          let wallet_balance = await this_mod.app.wallet.getBalance('SAITO');
          if (wallet_balance === 0n) {
            siteMessage('Insufficient SAITO to Create Vault NFTs...', 3000);
            this_mod.app.connection.emit('saito-purchase-launch');
            throw new Error('Insufficient SAITO for Vault upload');
          }

          this_mod.attachStyleSheets();

          let name = (game_data.name || ctx.file_name || 'game').trim() || 'game';
          //
          // N-WASM library discovery classifies Vault games by ROM-like filename
          // (.z64 / .n64 / .v64). Normalize so titles without an extension still
          // appear after upload.
          //
          let filename = (ctx.file_name || `${name}.z64`).trim();
          if (!/\.(z64|n64|v64)$/i.test(filename)) {
            filename = `${filename.replace(/\.[^.]+$/, '') || name}.z64`;
          }

          //
          // Canonical N-WASM game payload (same structure as NFT / local archive),
          // wrapped so Vault stores the full txmsg-compatible object — not raw ROM only.
          //
          let envelope = {
            module: 'Nwasm',
            title: name,
            name: name,
            data: game_data
          };
          let json = JSON.stringify(envelope);
          let b64 = Buffer.from(json).toString('base64');
          let safe = encodeURIComponent(filename);
          let data_uri = `data:application/json;name=${safe};base64,${b64}`;

          this_mod.file = data_uri;
          this_mod.filename = filename;

          //
          // Wait until CREATE KEY → upload → mint confirmation finishes so the
          // library can refresh with the new Vault game before closing.
          // Return the confirmed metadata so N-WASM.addGameFromVaultResult()
          // receives nft_id / file_id / nft_tx (do not discard the Promise value).
          //
          return await new Promise((resolve, reject) => {
            this_mod.access_file_overlay.file_upload_overlay.render({
              file: data_uri,
              filename: filename,
              prefilled: true,
              library_mode: true,
              onComplete: (result) => resolve(result),
              onError: (err) =>
                reject(err instanceof Error ? err : new Error(String(err || 'Vault upload failed')))
            });
          });
        }
      };
    }

    if (type === 'saito-header') {
      let x = [];
      if (!this.browser_active) {
        this_mod.attachStyleSheets();
        x.push({
          text: 'Vault',
          icon: this.icon,
          rank: 105,
          type: 'quicklaunch',
          callback: function (app, id) {
            //navigateWindow('/vault');
            this_mod.access_file_overlay.render();
          },
          navigation: '/vault'
        });
      }
      return x;
    }

    if (type === 'saito-create-nft') {
      return {
        title: 'NFT Access Key',
        class: ['vault-nft-key', 'vault-nft-rental-key'],
        json: {
          txsig: 'YYYYY',
          archive: 'ZZZZZ'
        }
      };
    }

    if (type === 'saito-nft-media') {
      return {
        // Canonical access-key type; "vault" kept for legacy keys already on-chain.
        class: ['vault-nft-key', 'vault-nft-rental-key', 'vault'],
        returnMediaDisplay(nft) {
          if (!nft?.json) {
            return null;
          }
          try {
            const obj = JSON.parse(nft.json);
            const backgroundImage = obj.file_access_script
              ? '/vault/img/crystal_key_min.png'
              : '/vault/img/jade_key_min.png';
            return {
              backgroundImage,
              innerHtml: `<div class="saito-nft-card-text">${nft.json}</div>`
            };
          } catch (err) {
            return null;
          }
        }
      };
    }

    if (type === 'saito-nft-download') {
      const nft = obj;
      if (!nft || typeof nft.returnType !== 'function') {
        return null;
      }
      const nft_type = nft.returnType();
      if (
        nft_type !== 'vault-nft-key' &&
        nft_type !== 'vault-nft-rental-key' &&
        nft_type !== 'vault'
      ) {
        return null;
      }

      return {
        download: async (app, download_nft) => {
          const ensureTx = () =>
            new Promise((resolve) => {
              if (download_nft.tx) {
                resolve();
                return;
              }
              if (typeof download_nft.fetchTransaction === 'function') {
                download_nft.fetchTransaction(() => resolve());
                return;
              }
              resolve();
            });

          await ensureTx();

          let data = download_nft.tx?.returnMessage?.()?.data;
          if (!data && download_nft.json) {
            try {
              data = JSON.parse(download_nft.json);
            } catch (err) {
              data = null;
            }
          }

          const vault_data = {
            nft_id: download_nft.id,
            file_id: data?.file_id,
            file_access_script: data?.file_access_script || null,
            file_name: data?.filename,
            slip1_utxokey: download_nft.slip1?.utxo_key || '',
            slip2_utxokey: download_nft.slip2?.utxo_key || '',
            slip3_utxokey: download_nft.slip3?.utxo_key || ''
          };

          if (!vault_data.file_id) {
            siteMessage('Vault file not found for this NFT', 2000);
            return;
          }

          if (vault_data.file_access_script) {
            if (!this_mod.nft_download_witness) {
              this_mod.nft_download_witness = new WitnessOverlay(this_mod.app, this_mod);
            }
            const witness = this_mod.nft_download_witness;
            witness.access_script = vault_data.file_access_script;
            witness.vault_entry = vault_data;
            witness.callback = (result) => {
              this_mod.sendAccessFileRequest(vault_data, result.access_script);
            };
            witness.render();
            return;
          }

          await this_mod.sendAccessFileRequest(vault_data);
        }
      };
    }

    //
    // Direct Creator → Renter rental hop (CHECKPATHHOP). Only the Creator
    // writes a hop for this iteration; value carries timestamp/file_id/expires_at.
    // Requires tx.msg.data.expires_at (ms). Binding hash is "" to match rental.js.
    //
    if (type === 'saito-nft-transfer') {
      let this_mod = this;
      return {
        class: ['vault-nft-key', 'vault-nft-rental-key', 'vault'],
        onTransfer: async (nft = null, tx = null, receiver = '') => {
          if (!tx) {
            return tx;
          }
          if (!tx.msg) {
            tx.msg = {};
          }
          if (!tx.msg.data) {
            tx.msg.data = {};
          }

          const expires_at = tx.msg.data.expires_at;
          if (expires_at == null || expires_at === '') {
            // Non-rental vault transfers leave path untouched.
            return tx;
          }

          let file_id = tx.msg.data.file_id || null;
          if (!file_id && nft?.json) {
            try {
              const parsed = typeof nft.json === 'string' ? JSON.parse(nft.json) : nft.json;
              file_id = parsed?.file_id || parsed?.data?.file_id || null;
            } catch (e) {
              file_id = null;
            }
          }
          if (!file_id) {
            throw new Error('Vault rental transfer requires file_id');
          }

          const my_publickey = await this_mod.app.wallet.getPublicKey();
          const creator =
            typeof nft?.returnCreator === 'function' ? nft.returnCreator() : nft?.creator;
          if (!creator || creator !== my_publickey) {
            throw new Error('Vault rental hop must be signed by the Creator in this iteration');
          }

          const value_obj = {
            timestamp: Date.now(),
            file_id: file_id,
            expires_at: Number(expires_at)
          };
          const value_json = JSON.stringify(value_obj);
          const value_b64 = Buffer.from(value_json).toString('base64');
          // Empty binding matches rental contract hash: ""
          const binding_hash = '';
          const canonical_string = `${receiver}|${value_b64}|${binding_hash}`;
          const hash_digest = this_mod.app.crypto.hash(canonical_string);
          const privatekey = await this_mod.app.wallet.getPrivateKey();
          const sig = this_mod.app.crypto.signMessage(hash_digest, privatekey);

          // Direct Creator → Renter only: replace any prior path with this hop.
          tx.msg.data.path = [
            {
              to: receiver,
              value: value_b64,
              sig: sig
            }
          ];
          tx.msg.data.file_id = file_id;

          return tx;
        }
      };
    }

    return null;
  }

  returnServices() {
    let services = [];
    if (!this.app.BROWSER || this.offerService) {
      services.push(this.app.network.createPeerService(null, 'vault', 'Secure File Vault'));
    }
    return services;
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (!this.browser_active) {
      return;
    }
    if (service.service === 'vault') {
      this.peer = peer;
      this.peer_connected = true;
    }
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx == null) {
      return 0;
    }

    let txmsg = tx.returnMessage();

    if (!txmsg.request || !mycallback) {
      return 0;
    }

    if (txmsg.request === 'vault access file') {
      try {
        //
        // run CHECKOWN / CHECKOWNNFT script
        //
        if (!app.core?.scripting?.hash || !app.core?.scripting?.evaluate) {
          console.log('ERROR vault access file 1');
          mycallback({ status: 'err', err: 'scripting_unavailable' });
          return 0;
        }
        console.log('NORMAL vault access file 1');

        let access_script = txmsg.data.access_script || '';
        let access_hash = txmsg.data.access_hash || '';
        let ok = false;

        let computed_hash = app.core.scripting.hash(access_script);
        let hash_match = computed_hash === access_hash;
        console.log(
          '--------------------------------\nVAULT ACCESS REQUEST RECEIVED\n\naccess_hash:\n' +
            access_hash +
            '\n\ncomputed_hash:\n' +
            computed_hash +
            '\n\nhash_match:\n' +
            hash_match +
            '\n\n--------------------------------'
        );
        console.log('NORMAL vault access file 1');

        if (app.core.scripting.hash(access_script) === access_hash) {
          console.log(
            '--------------------------------\nCALLING RUST SCRIPT VALIDATOR\n--------------------------------'
          );
          ok = await app.core.scripting.evaluateWithTransaction(access_script, tx);
          console.log(
            '--------------------------------\nSCRIPT VALIDATION RESULT:\n\n' +
              (ok ? 'true' : 'false') +
              '\n\n--------------------------------'
          );
        }
        console.log('NORMAL vault access file 2');

        if (!ok) {
          console.log('SCRIPT VALIDATION FAILED');
          siteMessage('Supplied Witness Data Incorrect: Access Denied', 2000);
          mycallback({ status: 'err', err: 'access_denied_script_failed' });
          return 0;
        }

        console.log('NORMAL vault access file 3');

        //
        // If script passes, proceed to Archive
        //
        let archive_mod = app.modules.returnModule('Archive');
        archive_mod.access_hash = 1; // ownership restricted

        let data = {};
        data.owner = txmsg.data.access_hash;
        data.access_hash = txmsg.data.access_hash;
        data.access_script = txmsg.data.access_script;
        data.sig = txmsg.data.data.file_id;
        data.request_tx = tx;
        console.log('NORMAL vault access file 4');

        this.app.storage.loadTransactions(
          data,
          async (txs) => {
            mycallback({ status: 'success', err: '', txs: txs });
          },
          'localhost',
          0
        );
      } catch (err) {
        console.log('ERROR processing vault access file...');
        mycallback({ status: 'err', err: JSON.stringify(err) });
      }

      // prevent sending fake response
      return 1;
    }

    if (txmsg.request === 'vault add file') {
      try {
        let archive_mod = app.modules.returnModule('Archive');
        archive_mod.access_hash = 1; // ownership restricted

        let peer_tx = new Transaction();
        peer_tx.deserialize_from_web(this.app, txmsg.data);
        let peer_txmsg = peer_tx.returnMessage();

        let access_hash = peer_txmsg.access_hash || '';

        let data = {};
        data.owner = access_hash;
        data.preserve = 1;

        this.app.storage.saveTransaction(peer_tx, data, 'localhost');
        mycallback({ status: 'success', err: '' });
      } catch (err) {
        console.error('Vault add file error:', err);
        mycallback({ status: 'err', err: JSON.stringify(err) });
      }

      return 1;
    }
  }

  async createVaultAddFileTransaction(nftid = null, access_script_obj = null) {
    let newtx = await this.app.wallet.createUnsignedTransaction();

    try {
      if (!this.app.core?.scripting?.hash) {
        return null;
      }

      if (!nftid) {
        console.warn('Vault: createVaultAddFileTransaction missing nftid');
        return null;
      }

      if (access_script_obj == null) {
        access_script_obj = buildDefaultAccessScript({ nftid });
      }

      let access_script =
        typeof access_script_obj === 'string'
          ? access_script_obj
          : JSON.stringify(access_script_obj);
      let access_hash = this.app.core.scripting.hash(access_script);

      let msg = {
        request: 'vault add file',
        access_script: access_script,
        access_hash: access_hash,
        data: { file: this.file, name: this.filename }
      };

      newtx.msg = msg;
      await newtx.sign();
    } catch (err) {}

    return newtx;
  }

  async sendAccessFileRequest(vault_data = null, access_script_override = null, mycallback = null) {
    if (!this.app.core?.scripting?.hash) {
      console.warn('VAULT: app.core.scripting not available, aborting');
      return null;
    }

    //
    // Standard path builds CHECKOWNNFT from nft utxokeys.
    // Custom keys pass a complete access_script via access_script_override.
    //
    let nftid = null;
    let utxokey1 = null;
    let utxokey2 = null;
    let utxokey3 = null;
    let file_id = null;
    //
    // if called from UI (LoadNFTs click) use provided values
    //
    if (vault_data) {
      nftid = vault_data.nft_id;
      utxokey1 = vault_data.slip1_utxokey;
      utxokey2 = vault_data.slip2_utxokey;
      utxokey3 = vault_data.slip3_utxokey;
      file_id = vault_data.file_id;
    } else {
      nftid = prompt('NFT ID (nftid):');
      utxokey1 = prompt('NFT utxokey1:');
      utxokey2 = prompt('NFT utxokey2:');
      utxokey3 = prompt('NFT utxokey3:');
      file_id = this.file_id;
    }

    if (!nftid || !utxokey1 || !utxokey2 || !utxokey3) {
      console.warn('VAULT: Missing nftid or one of the utxokeys, aborting');
      return null;
    }

    let access_script = '';
    let access_hash = '';

    if (access_script_override) {
      try {
        access_script =
          typeof access_script_override === 'string'
            ? access_script_override
            : JSON.stringify(access_script_override);
        JSON.parse(access_script);
        access_hash = this.app.core.scripting.hash(access_script);
      } catch (err) {
        alert('Error submitting access script: invalid JSON?');
        return;
      }
    } else {
      //
      // Standard CHECKOWNNFT flow
      //
      let access_script_obj = buildDefaultAccessScript({
        nftid,
        utxokey1,
        utxokey2,
        utxokey3
      });

      access_script = JSON.stringify(access_script_obj);
      access_hash = this.app.core.scripting.hash(access_script);
    }

    //
    // if file_id still not set, fall back to this.file_id
    //
    if (!file_id) {
      console.log('VAULT: file_id not set from vault_data, using this.file_id');
      file_id = this.file_id;
    }

    let data = {
      request: 'vault access file',
      access_script: access_script,
      access_hash: access_hash,
      data: { file_id }
    };

    if (this.peer) {
      let computed_hash = this.app.core.scripting.hash(access_script);
      let script_pretty = JSON.stringify(JSON.parse(access_script), null, 2);
      console.log(
        '--------------------------------\nVAULT DOWNLOAD REQUEST\n\naccess_hash:\n' +
          access_hash +
          '\n\nhash(access_script):\n' +
          computed_hash +
          '\n\nscript:\n' +
          script_pretty +
          '\n\nfile_id:\n' +
          file_id +
          '\n\n--------------------------------'
      );

      this.app.network.sendRequestAsTransaction(
        'vault access file',
        data,
        (res) => {
          console.log('$$$');
          console.log('$$$');
          console.log('RECEIVED RESPONSE: ');
          console.log('$$$');
          console.log('$$$');

          // Handle undefined or error responses
          if (!res) {
            console.error('VAULT: No response received (network error or timeout)');
            if (mycallback) {
              mycallback(null); // Pass null to NWASM callback
            }
            return;
          }

          // Check for error status
          if (res.status === 'err') {
            console.error('VAULT: Error from vault:', res);
            if (mycallback) {
              mycallback(null); // Pass null to NWASM callback
            }
            return;
          }

          // Handle case where res might be a Transaction object instead of {status, txs}
          let txs = [];
          if (res.txs) {
            txs = res.txs;
          } else if (Array.isArray(res)) {
            txs = res;
          } else if (res.status === 'success' && res.txs) {
            txs = res.txs;
          }

          if (txs.length > 0) {
            for (let i = 0; i < txs.length; i++) {
              let tx = new Transaction();
              tx.deserialize_from_web(this.app, txs[i]);
              txmsg = tx.returnMessage();

              try {
                let filename = txmsg.data.name;
                if (!filename) {
                  filename = prompt('Enter filename to save:') || 'vault.bin';
                }

                const parts = txmsg.data.file.split(',');
                const header = parts[0];
                const base64Data = parts[1];
                const mime = header.match(/data:(.*);base64/)[1];

                if (mycallback) {
                  mycallback(base64Data);
                } else {
                  const binary = atob(base64Data);
                  const len = binary.length;

                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) {
                    bytes[i] = binary.charCodeAt(i);
                  }

                  const blob = new Blob([bytes], { type: mime });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename || 'download';

                  a.click();
                  URL.revokeObjectURL(url);
                }
              } catch (err) {
                console.log('VAULT: ERROR while handling downloaded file: ' + JSON.stringify(err));
              }
            }
          }
        },
        this.peer.publicKey,
        true
      );

      siteMessage('Transferring File...', 3000);
    } else {
      console.warn('VAULT: no peer found, cannot send vault access request');
    }
  }

  webServer(app, expressapp, express) {
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let vault_self = this;

    expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

      let updatedSocial = Object.assign({}, vault_self.social);

      let html = VaultHome(app, vault_self, app.build_number, updatedSocial);
      if (!res.finished) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(html);
      }
      return;
    });

    expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
  }
}

module.exports = Vault;
