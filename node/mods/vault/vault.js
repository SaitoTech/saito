const saito = require('./../../lib/saito/saito');
const Transaction = require('../../lib/saito/transaction').default;
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const ModTemplate = require('./../../lib/templates/modtemplate');
const VaultMain = require('./lib/ui/main');
const VaultHome = require('./index');
const AccessFileOverlay = require('./lib/ui/overlays/load-nfts.js');
const WitnessOverlay = require('./lib/ui/overlays/witness');
const { buildDefaultAccessScript } = require('./lib/contracts');
const loan = require('./lib/contracts/loan');
const {
  receiveVaultAddFileTransaction
} = require('./lib/transactions/add-file');
const rentalCheckout = require('./lib/transactions/rental-checkout');

function findCheckPathHop(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (String(node.op || '').toUpperCase() === 'CHECKPATHHOP') {
    return node;
  }
  if (Array.isArray(node.args)) {
    for (let i = 0; i < node.args.length; i++) {
      const found = findCheckPathHop(node.args[i]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Same hop selector as FILE_SCRIPT CHECKPATHHOP / checkout:
 * FIRST hop where value.delegated == 0.
 */
function firstUndelegatedHopFromRental(file_access_script, path) {
  let script_obj = file_access_script;
  if (typeof script_obj === 'string') {
    try {
      script_obj = JSON.parse(script_obj);
    } catch (err) {
      script_obj = null;
    }
  }
  const cph = findCheckPathHop(script_obj);
  const creator_pk = cph?.publickey || null;
  const hops = Array.isArray(cph?.witness?.hops)
    ? cph.witness.hops
    : Array.isArray(path)
      ? path
      : [];
  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i] || {};
    let value_obj = null;
    try {
      value_obj = JSON.parse(Buffer.from(String(hop.value || ''), 'base64').toString('utf8'));
    } catch (err) {
      value_obj = null;
    }
    if (value_obj && value_obj.delegated === 0) {
      return {
        creator_pk,
        renter: hop.to || null,
        expires_at: value_obj.expires_at
      };
    }
  }
  return { creator_pk, renter: null, expires_at: null };
}

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

    Object.assign(this, rentalCheckout);

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

  firstUndelegatedHopFromRental(file_access_script, path) {
    return firstUndelegatedHopFromRental(file_access_script, path);
  }

  async initialize(app) {
    if (this.app.BROWSER) {
      const SaitoTransactionMonitor = require('../../lib/saito/ui/saito-transaction-monitor/saito-transaction-monitor');
      this.transaction_monitor = new SaitoTransactionMonitor(this.app, this);
    }

    if (this.browser_active) {
      this.main = new VaultMain(app, this, '.saito-container');
      this.addComponent(this.main);
      this.header = new SaitoHeader(app, this);
      await this.header.initialize(app);
      this.addComponent(this.header);
    }
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
        class: ['vault-nft-key', 'vault-nft-rental'],
        json: {
          txsig: 'YYYYY',
          archive: 'ZZZZZ'
        }
      };
    }

    if (type === 'saito-nft-media') {
      return {
        // Canonical access-key type; "vault" kept for legacy keys already on-chain.
        class: ['vault-nft-key', 'vault-nft-rental', 'vault'],
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
        nft_type !== 'vault-nft-rental' &&
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

    if (txmsg.request === 'vault access rental') {
      try {
        if (!app.core?.scripting?.hash || !app.core?.scripting?.evaluateWithTransaction) {
          mycallback({ status: 'err', err: 'scripting_unavailable' });
          return 0;
        }

        const access_script = txmsg.data.access_script || '';
        const access_hash = txmsg.data.access_hash || '';
        const computed_hash = app.core.scripting.hash(access_script);
        console.log(
          '--------------------------------\nVAULT RENTAL ACCESS REQUEST\n\naccess_hash:\n' +
            access_hash +
            '\n\ncomputed_hash:\n' +
            computed_hash +
            '\n\nLOAN_SCRIPT:\n' +
            (typeof access_script === 'string'
              ? access_script
              : JSON.stringify(access_script, null, 2)) +
            '\n\n--------------------------------'
        );

        let ok = false;
        if (computed_hash === access_hash) {
          ok = await app.core.scripting.evaluateWithTransaction(access_script, tx);
        }
        console.log('[VAULT RENTAL ACCESS] LOAN_SCRIPT eval:', ok ? 'true' : 'false');

        if (!ok) {
          mycallback({ status: 'err', err: 'access_denied_script_failed' });
          return 0;
        }

        const archive_mod = app.modules.returnModule('Archive');
        archive_mod.access_hash = 1;

        const data = {};
        data.owner = access_hash;
        data.access_hash = access_hash;
        data.access_script = access_script;
        data.sig = txmsg.data.data.file_id;
        data.request_tx = tx;

        this.app.storage.loadTransactions(
          data,
          async (txs) => {
            mycallback({ status: 'success', err: '', txs: txs });
          },
          'localhost',
          0
        );
      } catch (err) {
        console.log('[VAULT RENTAL ACCESS] ERROR', err);
        mycallback({ status: 'err', err: JSON.stringify(err) });
      }
      return 1;
    }

    if (txmsg.request === 'vault add file') {
      return await receiveVaultAddFileTransaction(app, this, tx, mycallback);
    }

    if (txmsg.request === 'vault checkout rental') {
      console.log('[VAULT CHECKOUT] Server received checkout transaction', {
        peer_request_sig: tx?.signature || null,
        request: txmsg.request
      });
      console.log('[VAULT CHECKOUT] Dispatching to receiveCheckOutRentalTransaction()');
      return await this.receiveCheckOutRentalTransaction(tx, mycallback);
    }
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

  /**
   * Request the Vault file for a Store rental NFT using the instantiated LOAN_SCRIPT.
   * Does not use FILE_SCRIPT or CHECKOWNNFT. Ordinary keys keep sendAccessFileRequest().
   *
   * @param {object} rental_nft SaitoNFT or { tx / data } with file_id, path, file_access_script
   * @param {function} [mycallback] receives base64 file bytes or null
   */
  async sendAccessRentalFileRequest(rental_nft = null, mycallback = null) {
    if (!this.app.core?.scripting?.hash) {
      console.warn('VAULT: app.core.scripting not available, aborting rental access');
      if (mycallback) {
        mycallback(null);
      }
      return null;
    }
    if (!rental_nft) {
      console.warn('VAULT: sendAccessRentalFileRequest missing rental NFT');
      if (mycallback) {
        mycallback(null);
      }
      return null;
    }

    const data =
      (typeof rental_nft.tx?.returnMessage === 'function'
        ? rental_nft.tx.returnMessage()?.data
        : null) ||
      rental_nft.data ||
      {};
    const file_id = String(data.file_id || rental_nft.file_id || '').trim();
    const path = Array.isArray(data.path) ? data.path : [];
    const file_access_script = data.file_access_script || rental_nft.file_access_script || null;
    const hop = firstUndelegatedHopFromRental(file_access_script, path);
    const creator_pk = hop.creator_pk;
    const renter = hop.renter;
    const expires_at = hop.expires_at;

    if (!file_id || !creator_pk || !renter || expires_at == null) {
      console.warn('VAULT: rental access missing file_id / creator / renter / expires_at', {
        file_id,
        creator_pk,
        renter,
        expires_at
      });
      if (mycallback) {
        mycallback(null);
      }
      return null;
    }

    if (Date.now() >= Number(expires_at)) {
      console.log('[VAULT RENTAL ACCESS] client expiry check: rental expired, not sending');
      if (mycallback) {
        mycallback(null);
      }
      return null;
    }

    const loan_script = loan.instantiate({
      creator_publickey: creator_pk,
      renter_publickey: renter,
      expires_at: expires_at
    });
    const access_script = JSON.stringify(loan_script);
    const access_hash = this.app.core.scripting.hash(access_script);

    console.log('[VAULT LOAN SCRIPT]\n' + JSON.stringify(loan_script, null, 2));
    console.log('[VAULT LOAN SCRIPT HASH]\n' + access_hash);
    console.log('[VAULT RENTAL ACCESS] submitting hash(instantiated LOAN_SCRIPT) as access_hash');

    const payload = {
      request: 'vault access rental',
      access_script: access_script,
      access_hash: access_hash,
      data: { file_id }
    };

    if (!this.peer) {
      console.warn('VAULT: no peer found, cannot send vault access rental');
      if (mycallback) {
        mycallback(null);
      }
      return null;
    }

    this.app.network.sendRequestAsTransaction(
      'vault access rental',
      payload,
      (res) => {
        console.log('[VAULT RENTAL ACCESS] response', res);
        if (!res) {
          if (mycallback) {
            mycallback(null);
          }
          return;
        }
        if (res.status === 'err') {
          console.error('VAULT: rental access error', res);
          if (mycallback) {
            mycallback(null);
          }
          return;
        }

        let txs = [];
        if (res.txs) {
          txs = res.txs;
        } else if (Array.isArray(res)) {
          txs = res;
        }

        if (txs.length > 0) {
          for (let i = 0; i < txs.length; i++) {
            let tx = new Transaction();
            tx.deserialize_from_web(this.app, txs[i]);
            const txmsg = tx.returnMessage();
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
                for (let j = 0; j < len; j++) {
                  bytes[j] = binary.charCodeAt(j);
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
              console.log('VAULT: ERROR while handling rental downloaded file:', err?.message || err);
            }
          }
        } else if (mycallback) {
          mycallback(null);
        }
      },
      this.peer.publicKey,
      true
    );

    siteMessage('Transferring File...', 3000);
    return null;
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
