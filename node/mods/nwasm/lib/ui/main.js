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
    let vault_mod = app.modules.returnModule('Vault');

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
                source: 'archive'
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
          source: 'nft'
        });
        continue;
      }

      //
      // Vault access keys: ask Vault for file metadata (cached), then
      // classify playable N64 ROMs by filename.
      //
      if (
        (nft_type === 'vault-nft-key' || nft_type === 'vault') &&
        vault_mod?.returnNftFileMetadata
      ) {
        let file = await vault_mod.returnNftFileMetadata(nft_entry);
        let filename = file?.filename || '';
        if (!file?.file_id || !this.is_n64_rom_filename(filename)) {
          continue;
        }

        seen[nft_sig] = 1;
        if (file.nft_id) {
          seen[file.nft_id] = 1;
        }
        games.push({
          sig: nft_sig,
          title: this.vault_game_title(filename),
          id: file.nft_id || nft_sig,
          source: 'vault',
          vault: file
        });
      }
    }

    //
    // Also surface Vault files from the confirmed Vault NFT→file cache when the
    // mint NFT is not yet visible in wallet.nfts (post-confirmation lag).
    //
    let vault_files = app.options?.vault?.files || {};
    for (let id in vault_files) {
      let file = vault_files[id];
      if (!file?.file_id || !this.is_n64_rom_filename(file.filename || '')) {
        continue;
      }
      let key = file.tx_sig || file.nft_id || id;
      if (!key || seen[key] || (file.nft_id && seen[file.nft_id])) {
        continue;
      }
      seen[key] = 1;
      if (file.nft_id) {
        seen[file.nft_id] = 1;
      }
      games.push({
        sig: key,
        title: this.vault_game_title(file.filename || ''),
        id: file.nft_id || key,
        source: 'vault',
        vault: file
      });
    }

    //
    // Games explicitly registered via Nwasm.addGame() after a successful
    // Library save (Archive / Vault / NFT). Ensures the new entry is present
    // before the next render even when wallet/Vault discovery still lags.
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
      seen[g.sig] = 1;
      if (g.id) {
        seen[g.id] = 1;
      }
      games.push({
        sig: g.sig,
        title: (g.title || 'Untitled ROM').trim(),
        id: g.id || g.sig,
        source: g.source || 'archive',
        vault: g.vault || null
      });
    }

    games.sort((a, b) => a.title.localeCompare(b.title));
    return games;
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

    try {
      if (game?.source === 'vault') {
        setTimeout(async () => {
          await yield_for_paint();

          let vault_mod = this.app.modules.returnModule('Vault');
          let vault_data = game.vault || null;
          if (vault_mod?.returnNftFileMetadata) {
            try {
              vault_data =
                (await vault_mod.returnNftFileMetadata({
                  id: game.vault?.nft_id || game.id,
                  nft_id: game.vault?.nft_id || game.id,
                  tx_sig: game.vault?.tx_sig || game.sig
                })) || vault_data;
            } catch (err) {
              console.warn('Nwasm: unable to refresh Vault Access Key metadata:', err);
            }
          }
          if (!vault_mod || !vault_mod.peer || !vault_data?.file_id || !vault_data?.nft_id) {
            await fail_launch(
              !vault_mod?.peer ? 'Vault peer not connected' : 'Vault ROM metadata incomplete'
            );
            return;
          }

          vault_mod.sendAccessFileRequest(vault_data, null, (base64) => {
            if (!base64) {
              void fail_launch('Unable to download ROM from Vault');
              return;
            }
            try {
              let tx = this.mod.unpackVaultFile(base64, {
                id: game.id || game.sig || '',
                title: game.title || vault_data.filename || '',
                filename: vault_data.filename || ''
              });
              this.mod.extractRom(tx);
            } catch (err) {
              console.log('Error launching Vault ROM: ' + err);
              void fail_launch('Error launching Vault ROM');
            }
          });
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
              this.mod.extractRom(txs[0]);
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
