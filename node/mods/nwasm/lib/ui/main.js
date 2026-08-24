const MainTemplate = require('./main.template');
const UploadRomOverlay = require('./overlays/upload-rom');
const LoadRomOverlay = require('./overlays/load-rom');
const SaveGamesOverlay = require('./overlays/save-games');
const ControlsOverlay = require('./overlays/controls');

class NwasmMain {
  constructor(app, mod = null, container = '.nwasm-main') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.games = [];
    this.launching = false;
    this.upload_overlay = new UploadRomOverlay(app, mod);
    this.load_overlay = new LoadRomOverlay(app, mod);
    this.save_overlay = new SaveGamesOverlay(app, mod);
    this.controls_overlay = new ControlsOverlay(app, mod);
  }

  hide() {
    let obj = document.querySelector('.nwasm-main');
    if (obj) {
      obj.style.display = 'none';
    }
    try {
      document.body.classList.add('nwasm-playing');
    } catch (err) {}
    // Active game: restore the emulator game menu and canvas.
    try {
      let menu = document.querySelector('.game-menu');
      if (menu) {
        menu.style.display = '';
      }
      let canvas = document.getElementById('canvas');
      if (canvas) {
        canvas.style.display = '';
      }
    } catch (err) {}
  }

  show() {
    let obj = document.querySelector('.nwasm-main');
    if (obj) {
      obj.style.display = '';
    }
    try {
      document.body.classList.remove('nwasm-playing');
    } catch (err) {}
    this.hide_launcher_menu();
  }

  return_to_launcher() {
    try {
      let canvas = document.getElementById('canvas');
      if (canvas) {
        canvas.style.display = 'none';
      }
    } catch (err) {}

    this.show();
    this.render();
  }

  hide_launcher_menu() {
    // Launcher: hide Chat/Share/Game menu until a ROM is running.
    try {
      if (this.mod?.menu?.hide) {
        this.mod.menu.hide();
        return;
      }
      let menu = document.querySelector('.game-menu');
      if (menu) {
        menu.style.display = 'none';
      }
    } catch (err) {}
  }

  hide_loading() {
    this.load_overlay.hide();
    this.launching = false;
  }

  open_upload() {
    this.mod.uploaded_rom = false;
    this.mod.active_rom_name = '';
    this.upload_overlay.render();
  }

  async open_save_games() {
    if (!this.mod.active_rom_sig && this.mod.active_rom_name) {
      this.mod.active_rom_sig = this.app.crypto.hash(this.mod.active_rom_name);
    }
    await this.save_overlay.render();
  }

  open_controls() {
    this.controls_overlay.render();
  }

  //
  // Find all games available to this user:
  //   1. locally archived ROMs
  //   2. N-WASM ROM NFTs
  //   3. Vault NFTs whose filename indicates an N64 ROM
  //
  // Metadata only — does not download or initialize ROMs.
  //
  async load_games() {
    let games = [];
    let seen = {};
    let mod = this.mod;
    let app = this.app;

    if (!app.options.nwasm) {
      app.options.nwasm = {};
    }
    if (!app.options.nwasm.vault_nft_index || typeof app.options.nwasm.vault_nft_index !== 'object') {
      app.options.nwasm.vault_nft_index = {};
    }
    let vault_nft_index = app.options.nwasm.vault_nft_index;
    let index_dirty = false;

    //
    // Discover by field1 only. Do not use Archive `owner` (access-script hash)
    // and do not require field2 — a mismatched/empty field2 previously made
    // verified saves invisible to the library.
    //
    await new Promise((resolve) => {
      app.storage.loadTransactions(
        {
          field1: mod.name,
          limit: 100
        },
        (txs) => {
          try {
            for (let i = 0; i < (txs || []).length; i++) {
              let tx = txs[i];
              let msg = tx.returnMessage() || {};
              if (msg.request === 'upload savegame') {
                continue;
              }
              if (msg.module && msg.module !== mod.name && msg.module !== 'Nwasm') {
                continue;
              }
              if (!tx.signature || seen[tx.signature]) {
                continue;
              }
              seen[tx.signature] = 1;
              games.push({
                sig: tx.signature,
                title: (msg.title || msg.name || msg.data?.name || 'Untitled ROM').trim(),
                id: msg.id || '',
                source: 'archive',
                rental: false,
                expires_at: null
              });
            }
          } catch (err) {
            console.log('error loading archived Nwasm games for launcher: ' + err);
          }
          resolve();
        },
        'localhost'
      );
    });

    let nfts = app.options?.wallet?.nfts || [];
    let vault_games_by_file = {};
    for (let z = 0; z < nfts.length; z++) {
      let nft_entry = nfts[z];
      let nft_sig = nft_entry?.tx_sig;
      if (!nft_sig || seen[nft_sig]) {
        continue;
      }

      let nft_type = '';
      try {
        nft_type = app.wallet.extractNFTType(nft_entry?.slip3?.utxo_key);
      } catch (err) {
        continue;
      }

      //
      // Direct N-WASM ROM NFTs (minted from Create NFT).
      //
      if (nft_type === 'nwasm-nft-mod') {
        let meta = await new Promise((resolve) => {
          app.storage.loadTransactions(
            { sig: nft_sig },
            (txs) => {
              try {
                if (!txs || txs.length < 1) {
                  resolve(null);
                  return;
                }
                let msg = txs[0].returnMessage() || {};
                resolve({
                  title: msg.title || msg.name || msg.data?.title || msg.data?.name || '',
                  id: msg.id || nft_sig
                });
              } catch (err) {
                resolve(null);
              }
            },
            'localhost'
          );
        });

        seen[nft_sig] = 1;
        games.push({
          sig: nft_sig,
          title: (meta?.title || 'N64 ROM').trim(),
          id: meta?.id || nft_sig,
          source: 'nft',
          rental: false,
          expires_at: null
        });
        continue;
      }

      //
      // Vault-backed ROMs: owned keys (vault-nft-key / vault / vault-nft-rental)
      // and Store rental passes (store-nft-rental). Classify from the mint tx
      // (filename / file_id / expires_at). Do not ask Vault for metadata.
      //
      if (!this.isVaultBackedRomNftType(nft_type)) {
        continue;
      }

      let indexed = vault_nft_index[nft_sig];
      if (indexed?.status === 'skip') {
        continue;
      }

      let file = null;
      let indexed_ok =
        indexed?.status === 'rom' &&
        indexed.file_id &&
        (!this.isRentalNftType(nft_type) || indexed.expires_at != null);
      if (indexed_ok) {
        file = indexed;
      } else {
        let mint = await new Promise((resolve) => {
          app.storage.loadTransactions(
            { sig: nft_sig },
            (txs) => {
              try {
                if (!txs || txs.length < 1) {
                  resolve(null);
                  return;
                }
                resolve(txs[0]);
              } catch (err) {
                resolve(null);
              }
            },
            'localhost'
          );
        });

        if (!mint) {
          continue;
        }

        let msg = mint.returnMessage() || {};
        let data = msg.data && typeof msg.data === 'object' ? msg.data : {};
        let filename = data.filename != null ? String(data.filename) : '';
        let file_id = data.file_id != null ? String(data.file_id) : '';

        if (!file_id || !this.is_n64_rom_filename(filename)) {
          vault_nft_index[nft_sig] = { status: 'skip' };
          index_dirty = true;
          continue;
        }

        let rental_meta = this.vaultRentalMeta(nft_type, data);
        file = {
          status: 'rom',
          nft_id: nft_entry.id || nft_sig,
          tx_sig: nft_sig,
          file_id: file_id,
          filename: filename,
          link: data.link != null ? String(data.link) : '',
          slip1_utxokey: nft_entry?.slip1?.utxo_key || '',
          slip2_utxokey: nft_entry?.slip2?.utxo_key || '',
          slip3_utxokey: nft_entry?.slip3?.utxo_key || '',
          file_access_script: data.file_access_script || null,
          path: Array.isArray(data.path) ? data.path : [],
          nft_type: nft_type,
          rental: rental_meta.rental,
          expires_at: rental_meta.expires_at
        };
        vault_nft_index[nft_sig] = file;
        index_dirty = true;
      }

      seen[nft_sig] = 1;
      if (file.nft_id) {
        seen[file.nft_id] = 1;
      }
      let rental_meta = this.vaultRentalMeta(nft_type, {
        expires_at: file.expires_at,
        file_access_script: file.file_access_script,
        path: file.path
      });
      if (file.rental === true) {
        rental_meta.rental = true;
      }
      if (file.expires_at != null && rental_meta.expires_at == null) {
        rental_meta.expires_at = file.expires_at;
      }
      let game_entry = {
        sig: nft_sig,
        title: this.vault_game_title(file.filename || ''),
        id: file.nft_id || nft_sig,
        source: 'vault',
        vault: file,
        nft_type: nft_type,
        rental: rental_meta.rental,
        expires_at: rental_meta.expires_at
      };
      let file_key = String(file.file_id || '');
      let existing = file_key ? vault_games_by_file[file_key] : null;
      if (!existing || this.vaultEntitlementRank(nft_type) > this.vaultEntitlementRank(existing.nft_type)) {
        vault_games_by_file[file_key || nft_sig] = game_entry;
      } else if (
        this.vaultEntitlementRank(nft_type) === this.vaultEntitlementRank(existing.nft_type) &&
        Number(game_entry.expires_at) > Number(existing.expires_at || 0)
      ) {
        vault_games_by_file[file_key] = game_entry;
      }
    }

    Object.keys(vault_games_by_file).forEach((key) => {
      games.push(vault_games_by_file[key]);
    });

    if (index_dirty) {
      app.storage.saveOptions();
    }

    //
    // Games explicitly registered via Nwasm.addGame() after a successful
    // Library save (Archive / Vault / NFT). Ensures the new entry is present
    // before the next render even when wallet discovery still lags.
    //
    let registered = app.options?.nwasm?.library || [];
    for (let i = 0; i < registered.length; i++) {
      let g = registered[i];
      if (!g?.sig || seen[g.sig]) {
        continue;
      }
      if (g.id && seen[g.id]) {
        continue;
      }
      if (g.vault?.file_id && vault_games_by_file[String(g.vault.file_id)]) {
        continue;
      }
      seen[g.sig] = 1;
      if (g.id) {
        seen[g.id] = 1;
      }
      games.push({
        sig: g.sig,
        title: (g.title || 'Untitled ROM').trim(),
        id: g.id || g.sig,
        source: g.source || 'archive',
        vault: g.vault || null,
        nft_type: g.nft_type || g.vault?.nft_type || '',
        rental: g.rental === true,
        expires_at: g.expires_at != null ? g.expires_at : null
      });
    }

    games.sort((a, b) => a.title.localeCompare(b.title));
    return games;
  }

  isVaultBackedRomNftType(nft_type = '') {
    return (
      nft_type === 'vault-nft-key' ||
      nft_type === 'vault' ||
      nft_type === 'vault-nft-rental' ||
      nft_type === 'store-nft-rental'
    );
  }

  isRentalNftType(nft_type = '') {
    return nft_type === 'vault-nft-rental' || nft_type === 'store-nft-rental';
  }

  vaultEntitlementRank(nft_type = '') {
    if (nft_type === 'vault-nft-key' || nft_type === 'vault') {
      return 3;
    }
    if (nft_type === 'vault-nft-rental') {
      return 2;
    }
    if (nft_type === 'store-nft-rental') {
      return 1;
    }
    return 0;
  }

  // store-nft-rental: mint/transfer data.expires_at is authoritative, then hop.
  // vault-nft-rental: hop expires_at (Vault firstUndelegatedHopFromRental), else data.expires_at.
  vaultRentalMeta(nft_type = '', data = {}) {
    let rental = this.isRentalNftType(nft_type);
    let expires_at = null;
    if (!rental) {
      return { rental: false, expires_at: null };
    }

    let hop_expires = null;
    let vault_mod = this.app.modules.returnModule('Vault');
    if (vault_mod && typeof vault_mod.firstUndelegatedHopFromRental === 'function') {
      try {
        let hop = vault_mod.firstUndelegatedHopFromRental(
          data?.file_access_script,
          data?.path
        );
        if (hop?.expires_at != null && hop.expires_at !== '') {
          hop_expires = Number(hop.expires_at);
        }
      } catch (err) {}
    }

    let data_expires = null;
    if (data?.expires_at != null && data.expires_at !== '') {
      data_expires = Number(data.expires_at);
    }

    if (nft_type === 'store-nft-rental') {
      expires_at = data_expires != null ? data_expires : hop_expires;
    } else {
      expires_at = hop_expires != null ? hop_expires : data_expires;
    }

    if (expires_at != null && !Number.isFinite(expires_at)) {
      expires_at = null;
    }
    return { rental: true, expires_at };
  }

  is_n64_rom_filename(filename = '') {
    let name = String(filename || '');
    return /\.(z64|n64|v64)$/i.test(name) || name.toLowerCase().includes('64');
  }

  vault_game_title(filename = '') {
    let name = String(filename || '').trim();
    return name.replace(/\.(z64|n64|v64)$/i, '').trim() || name || 'N64 ROM';
  }

  async render() {
    this.games = await this.load_games();

    let html = MainTemplate(this.app, this.mod, this.games);

    if (document.querySelector('.nwasm-main')) {
      this.app.browser.replaceElementBySelector(html, '.nwasm-main');
    } else {
      this.app.browser.addElementToSelector(html, this.container);
    }

    this.launching = false;
    this.hide_launcher_menu();
    this.attachEvents();

    // After a different-ROM page reload, resume the library game the user picked.
    let pending_sig = '';
    try {
      let raw = sessionStorage.getItem('nwasm-pending-launch');
      if (raw) {
        sessionStorage.removeItem('nwasm-pending-launch');
        pending_sig = JSON.parse(raw)?.sig || '';
      }
    } catch (err) {
      pending_sig = '';
    }
    if (pending_sig && this.games.some((g) => g.sig === pending_sig)) {
      setTimeout(() => {
        this.launch_game(pending_sig);
      }, 0);
      return;
    }

    // Play Now from the Arcade overlay: ephemeral ROM queued before navigation.
    try {
      let raw = sessionStorage.getItem('nwasm-pending-ephemeral');
      if (raw) {
        sessionStorage.removeItem('nwasm-pending-ephemeral');
        let pending = JSON.parse(raw);
        if (pending?.data) {
          setTimeout(async () => {
            let ab = this.mod.convertBase64ToByteArray(pending.data);
            await this.mod.playEphemeralRom(ab, pending.file_name || 'Selected ROM');
          }, 0);
        }
      }
    } catch (err) {}
  }

  attachEvents() {
    let root = document.querySelector('.nwasm-main');
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-action="upload"]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        this.open_upload();
      };
    });

    root.querySelectorAll('.game').forEach((card) => {
      card.onclick = (e) => {
        e.preventDefault();
        let sig = card.getAttribute('data-sig');
        if (sig) {
          this.launch_game(sig, card);
        }
      };
    });
  }

  //
  // Library card → loading overlay → fetch ROM bytes → extractRom → LoadEmulator.
  // Overlay is dismissed inside LoadEmulator after initAudio (not here).
  //
  async launch_game(sig, card = null) {
    if (this.launching || !sig) {
      return;
    }

    this.launching = true;
    // Used by LoadEmulator when a different ROM requires a cold Module reload.
    this.mod.launch_sig = sig;
    this.mod.clearRentalTimer();

    try {
      sessionStorage.removeItem('nwasm-launched-from-arcade');
    } catch (_) {}

    if (card) {
      card.classList.add('loading');
      card.setAttribute('aria-busy', 'true');
    }

    let game = this.games.find((g) => g.sig === sig);
    let title = game?.title || 'Loading game…';

    this.hide();
    this.load_overlay.render({
      title: title,
      message:
        'Initializing emulator — this can take a while for large ROMs. The page may appear frozen; please wait.'
    });

    // Let the overlay paint before archive/Vault/CPU work freezes the thread.
    let yield_for_paint = async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    };

    let fail_launch = async (message) => {
      alert(message);
      this.hide_loading();
      this.show();
      await this.render();
    };

    await yield_for_paint();

    if (game?.rental) {
      let exp = game.expires_at != null ? Number(game.expires_at) : NaN;
      if (!Number.isFinite(exp) || Date.now() >= exp) {
        await fail_launch('This rental has expired.');
        return;
      }
    }

    try {
      if (game?.source === 'vault') {
        setTimeout(async () => {
          await yield_for_paint();

          let vault_mod = this.app.modules.returnModule('Vault');
          let vault_data = game.vault || null;
          let mint = null;

          // Refresh mint-tx fields for access (slips / file_id); do not ask Vault for metadata.
          let mint_sig = vault_data?.tx_sig || game.sig || '';
          if (mint_sig) {
            try {
              mint = await new Promise((resolve) => {
                this.app.storage.loadTransactions(
                  { sig: mint_sig },
                  (txs) => {
                    resolve(txs && txs.length ? txs[0] : null);
                  },
                  'localhost'
                );
              });
              if (mint) {
                let data = mint.returnMessage()?.data || {};
                let nfts = this.app.options?.wallet?.nfts || [];
                let nft_entry =
                  nfts.find(
                    (n) =>
                      (vault_data?.nft_id && n.id === vault_data.nft_id) || n.tx_sig === mint_sig
                  ) || null;
                vault_data = {
                  nft_id: vault_data?.nft_id || nft_entry?.id || game.id || mint_sig,
                  tx_sig: mint_sig,
                  file_id: data.file_id != null ? String(data.file_id) : vault_data?.file_id || '',
                  filename:
                    data.filename != null ? String(data.filename) : vault_data?.filename || '',
                  link: data.link != null ? String(data.link) : vault_data?.link || '',
                  slip1_utxokey:
                    nft_entry?.slip1?.utxo_key || vault_data?.slip1_utxokey || '',
                  slip2_utxokey:
                    nft_entry?.slip2?.utxo_key || vault_data?.slip2_utxokey || '',
                  slip3_utxokey:
                    nft_entry?.slip3?.utxo_key || vault_data?.slip3_utxokey || '',
                  file_access_script:
                    data.file_access_script || vault_data?.file_access_script || null,
                  path: Array.isArray(data.path) ? data.path : vault_data?.path || [],
                  nft_type: game.nft_type || vault_data?.nft_type || '',
                  expires_at:
                    data.expires_at != null
                      ? Number(data.expires_at)
                      : game.expires_at != null
                        ? Number(game.expires_at)
                        : vault_data?.expires_at
                };
              }
            } catch (err) {
              console.warn('Nwasm: unable to refresh Vault Access Key mint tx:', err);
            }
          }

          if (!vault_mod || !vault_mod.peer || !vault_data?.file_id) {
            await fail_launch(
              !vault_mod?.peer ? 'Vault peer not connected' : 'Vault ROM metadata incomplete'
            );
            return;
          }

          let on_file = (base64) => {
            if (!base64) {
              void fail_launch('Unable to download ROM from Vault');
              return;
            }
            if (this.mod.isRentalExpired(game)) {
              this.mod.clearRentalRomFromMemory();
              void fail_launch('This rental has expired.');
              return;
            }
            try {
              let tx = this.mod.unpackVaultFile(base64, {
                id: game.id || game.sig || '',
                title: game.title || vault_data.filename || '',
                filename: vault_data.filename || ''
              });
              this.mod.extractRom(tx);
              this.mod.armRentalExpiry(game);
            } catch (err) {
              console.log('Error launching Vault ROM: ' + err);
              void fail_launch('Error launching Vault ROM');
            }
          };

          let nft_type = game.nft_type || vault_data.nft_type || '';
          if (nft_type === 'store-nft-rental') {
            if (typeof vault_mod.sendAccessRentalFileRequest !== 'function') {
              await fail_launch('Vault rental access is unavailable');
              return;
            }
            vault_mod.sendAccessRentalFileRequest(
              {
                tx: mint,
                data: {
                  file_id: vault_data.file_id,
                  file_access_script: vault_data.file_access_script,
                  path: vault_data.path || [],
                  expires_at: game.expires_at != null ? game.expires_at : vault_data.expires_at
                },
                file_id: vault_data.file_id,
                file_access_script: vault_data.file_access_script
              },
              on_file
            );
            return;
          }

          if (!vault_data?.nft_id) {
            await fail_launch('Vault ROM metadata incomplete');
            return;
          }

          vault_mod.sendAccessFileRequest(vault_data, null, on_file);
        }, 0);
        return;
      }

      this.app.storage.loadTransactions(
        { sig: sig },
        (txs) => {
          if (!txs || txs.length < 1) {
            void fail_launch('Unable to load this ROM.');
            return;
          }

          setTimeout(async () => {
            await yield_for_paint();
            try {
              if (this.mod.isRentalExpired(game)) {
                this.mod.clearRentalRomFromMemory();
                await fail_launch('This rental has expired.');
                return;
              }
              this.mod.extractRom(txs[0]);
              this.mod.armRentalExpiry(game);
            } catch (err) {
              console.log('Error launching ROM: ' + err);
              await fail_launch('Error launching ROM');
            }
          }, 0);
        },
        'localhost'
      );
    } catch (err) {
      console.log('Error launching ROM: ' + err);
      await fail_launch('Error launching ROM');
    }
  }
}

module.exports = NwasmMain;
