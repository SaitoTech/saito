const saito = require('./../../lib/saito/saito');
const OnePlayerGameTemplate = require('../../lib/templates/oneplayer-gametemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const NwasmGameOptionsTemplate = require('./lib/nwasm-game-options.template');
const NwasmUI = require('./lib/ui/main');
const xorInplace = require('buffer-xor/inplace');
const Transaction = require('../../lib/saito/transaction').default;

//
// NWasm
//
// Local ROM archive, emulator, and save-game support.
//
// 	ROMS -- saved as 'Nwasm' modules in the local transaction archive
// 	SAVEGAMES --- saved as 'Nwasm' + hash(title)
//
// Lending/borrowing and peer ROM discovery are intentionally not implemented
// here. Future ownership/permission workflows belong in Vault + scripting.
//
class Nwasm extends OnePlayerGameTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'Nwasm';
    this.slug = 'nwasm';
    this.gamename = 'Nintendo 64';
    this.description = `The Saito Nintendo 64 emulator provides a user-friendly in-browser N64 emulator that allows archiving and playing the N64 games you own directly in your browser. Game files are encrypted so only you can access them and archived in your private transaction store.`;
    this.categories = 'Games Videogame Classic';

    this.ui = new NwasmUI(this.app, this);

    this.active_rom = null;
    this.active_rom_name = '';
    this.active_rom_sig = '';
    // Library sig of the game currently being launched (for different-ROM reload).
    this.launch_sig = '';
    this.active_game = new ArrayBuffer(8);
    this.active_game_img = '';
    this.active_game_saves = [];

    this.active_game_time_played = 0;
    this.active_game_load_ts = 0;
    this.active_game_save_ts = 0;

    this.uploaded_rom = false;
    this.rental_timer = null;
    this.rental_game_sig = null;

    // opt out of index.js
    this.default_html = 0;
  }

  /////////////////////////////////
  // inter-module communications //
  /////////////////////////////////
  respondTo(type = '', obj) {
    if (type === 'saito-create-nft') {
      return {
        title: 'N64 ROM',
        class: ['nwasm-nft-mod'],
        upload_text: 'Upload an N64 ROM you own',
        upload_icon: 'fa-solid fa-compact-disc',
        createData: async (modfile, metadata = {}) => {
          return {
            module: 'Nwasm',
            name: (metadata.title || '').trim(),
            file: modfile
          };
        }
      };
    }

    //
    // Arcade discovers this module via arcade-games. Supply onClick so the
    // Nintendo 64 card opens NWASM's Arcade overlay (not the Game Wizard).
    // Arcade only invokes Game.onClick() — it does not know about this overlay.
    //
    if (type === 'arcade-games') {
      let pack = super.respondTo(type, obj) || {};
      pack.onClick = async () => {
        await this.openArcadeOverlay();
      };
      return pack;
    }

    return super.respondTo(type, obj);
  }

  /**
   * Open the NWASM Arcade library overlay without leaving the Arcade page.
   */
  async openArcadeOverlay() {
    if (!this.app.BROWSER) {
      return;
    }

    this.ensureArcadeStyles();

    if (!this.arcade_overlay) {
      const NwasmArcadeOverlay = require('./lib/ui/overlays/arcade_overlay');
      this.arcade_overlay = new NwasmArcadeOverlay(this.app, this);
    }
    await this.arcade_overlay.open();
  }

  /**
   * Open the Arcade game wizard for an installed ROM (explicit Play launches emulator).
   */
  openRomWizard(sig = '', title = '') {
    if (!this.app.BROWSER || !sig) {
      return;
    }
    this.app.connection.emit('arcade-launch-game-wizard', {
      game: this.name,
      rom_sig: sig,
      rom_title: title || ''
    });
  }

  /**
   * Called from the Arcade game wizard when the user explicitly chooses Play.
   */
  launchFromArcadeWizard(_options = {}, obj = {}) {
    if (obj?.rom_sig) {
      this.launchRomFromArcade(obj.rom_sig);
    }
  }

  ensureArcadeStyles() {
    if (!this.styles.includes('/nwasm/style.css')) {
      this.styles.push('/nwasm/style.css');
    }
    if (!document.querySelector('link[href*="/nwasm/style.css"]')) {
      this.stylesheetAdded = false;
      this.attachStyleSheets();
    }
  }

  /**
   * Launch an installed ROM by navigating into the NWASM player page and
   * resuming via the existing pending-launch path.
   */
  launchRomFromArcade(sig = '') {
    if (!sig) {
      return;
    }
    try {
      sessionStorage.setItem('nwasm-pending-launch', JSON.stringify({ sig: String(sig) }));
      sessionStorage.setItem('nwasm-launched-from-arcade', '1');
    } catch (_) {}
    navigateWindow('/nwasm/');
  }

  /**
   * Play an uploaded ROM immediately (standalone /nwasm/ page).
   */
  async playEphemeralRom(byteArray, file_name = '', raw_file = null) {
    if (!byteArray || !this.ui) {
      return;
    }

    let title = file_name || 'Loading game…';

    this.ui.hide();
    this.ui.load_overlay.render({
      title: title,
      message:
        'Initializing emulator — this can take a while for large ROMs. The page may appear frozen; please wait.'
    });

    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    this.active_rom = raw_file || byteArray;
    this.uploaded_rom = true;
    this.launch_sig = '';
    this.clearRentalTimer();
    this.startPlaying();
    myApp.initializeRom(byteArray, this.app, this);
  }

  /**
   * When Play Now is chosen from the Arcade overlay, queue ROM bytes and
   * navigate into the NWASM player page (same host as library launches).
   */
  queueEphemeralRomFromArcade(file, file_name = '') {
    if (!file) {
      return false;
    }

    try {
      let data = Buffer.from(file, 'binary').toString('base64');
      sessionStorage.setItem(
        'nwasm-pending-ephemeral',
        JSON.stringify({
          data: data,
          file_name: file_name || 'Selected ROM'
        })
      );
      sessionStorage.setItem('nwasm-launched-from-arcade', '1');
    } catch (err) {
      alert('Unable to launch this ROM from Arcade. Add it to your library first, then play.');
      return false;
    }

    if (this.arcade_overlay?.is_open) {
      this.arcade_overlay.close();
    }
    navigateWindow('/nwasm/');
    return true;
  }

  is_nwasm_page() {
    try {
      return String(window.location.pathname || '').includes('/nwasm');
    } catch (_) {
      return false;
    }
  }

  /**
   * Publish installed ROM titles to Arcade as ordinary Game objects with
   * NWASM-owned onClick handlers. Does not block Arcade initialization.
   *
   * When `games` is a full installed list, stale Arcade ROM teasers are pruned.
   * Pass `{ prune: false }` for partial updates (e.g. after registering one ROM).
   */
  syncArcadeGames(games = null, opts = {}) {
    if (!this.app.BROWSER) {
      return;
    }
    let arcade = this.app.modules.returnModule('Arcade');
    if (!arcade || typeof arcade.addGame !== 'function') {
      return;
    }

    let list = Array.isArray(games) ? games : this.ui?.games || [];
    let prune = opts.prune !== false && Array.isArray(games);
    let prefix = 'nwasm-rom-';
    let keep = {};

    for (let i = 0; i < list.length; i++) {
      let g = list[i];
      if (!g?.sig) {
        continue;
      }
      let name = prefix + g.sig;
      keep[name] = 1;
      arcade.addGame({
        name: name,
        title: g.title || 'N64 ROM',
        image: this.returnImage(),
        onClick: async () => {
          this.openRomWizard(g.sig, g.title);
        }
      });
    }

    if (prune && Array.isArray(arcade.games)) {
      let stale = arcade.games
        .filter((g) => g?.name?.startsWith(prefix) && !keep[g.name])
        .map((g) => g.name);
      for (let i = 0; i < stale.length; i++) {
        if (typeof arcade.removeGame === 'function') {
          arcade.removeGame(stale[i]);
        }
      }
    }

    if (typeof arcade.renderGames === 'function') {
      arcade.renderGames();
    }
  }

  async onPeerServiceUp(app, peer, service = {}) {
    //
    // Wire Vault peer connectivity when a Vault service peer is available.
    // Required for existing Vault-backed ROM access; not a Library protocol.
    //
    if (service.service === 'vault') {
      let vault_mod = app.modules.returnModule('Vault');
      if (vault_mod) {
        vault_mod.peer = peer;
        vault_mod.peer_connected = true;
      }
    }
  }

  //
  // when this game initializes it begins to monitor the console log. this is
  // used to provide feedback into the Saito module when the game has loaded
  // and when it is saving or loading files, etc.
  //
  async initialize(app) {
    await super.initialize(app);

    //
    // non-browsers don't monitor the log
    //
    if (app.BROWSER == 0) {
      return;
    }

    //
    // monitor log if browser
    //
    if (this.browser_active == 1) {
      {
        const log = console.log.bind(console);
        console.log = (...args) => {
          if (args.length > 0) {
            if (typeof args[0] === 'string') {
              this.processNwasmLog(args[0], log);
            }
            log(...args);
          }
        };
      }
    }

    //
    // After all modules finish initialize (setTimeout 0), publish installed
    // ROMs to Arcade. Discovery is async and must not block Arcade load.
    //
    setTimeout(async () => {
      try {
        let games = await this.ui.load_games();
        this.ui.games = games;
        this.syncArcadeGames(games);
      } catch (err) {
        console.warn('Nwasm: deferred Arcade sync failed:', err);
      }
    }, 0);
  }

  //////////////////////
  // UI and Rendering //
  //////////////////////
  async render(app) {
    if (!this.browser_active) {
      return;
    }

    //
    // Standard Saito shell (hamburger / account). N-WASM uses a custom
    // index.html and never calls injectGameHTML, so create the header here
    // the same way Arcade/Store do — without wiping the emulator DOM.
    //
    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      this.header.header_class = 'game';
      await this.header.initialize(this.app);
    }

    await super.render(app);

    // OnePlayerGameTemplate may return early when no seat is set; still paint header.
    if (this.header) {
      await this.header.render();
    }

    this.menu.addMenuOption('game-game', 'Game');
    this.menu.addSubMenuOption('game-game', {
      text: 'Upload',
      id: 'game-upload-rom',
      class: 'game-upload-rom',
      callback: function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        game_mod.ui.open_upload();
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Save',
      id: 'game-export',
      class: 'game-export',
      callback: function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        game_mod.exportState();
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Load',
      id: 'game-import',
      class: 'game-import',
      callback: async function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        await game_mod.ui.open_save_games();
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Controls',
      id: 'game-controls',
      class: 'game-controls',
      callback: function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        game_mod.ui.open_controls();
      }
    });

    this.menu.addChatMenu();
    this.menu.render();

    //
    // GameMenu.render() installs a default Export (game JSON) that replaces our
    // emulator Save (same id). Re-assert NWASM Save/Load/Exit after that.
    //
    this.menu.addSubMenuOption('game-game', {
      text: 'Save',
      id: 'game-export',
      class: 'game-export',
      callback: function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        game_mod.exportState();
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Exit',
      id: 'game-exit',
      class: 'game-exit',
      callback: function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        // Stop audio-driven Module._runMainLoop() before leaving the game UI.
        try {
          if (typeof myApp !== 'undefined' && myApp.stopEmulator) {
            myApp.stopEmulator();
          }
        } catch (err) {}
        game_mod.clearRentalTimer();
        game_mod.stopPlaying();

        let from_arcade = false;
        try {
          from_arcade = sessionStorage.getItem('nwasm-launched-from-arcade') === '1';
          if (from_arcade) {
            sessionStorage.removeItem('nwasm-launched-from-arcade');
          }
        } catch (_) {}

        if (from_arcade) {
          navigateWindow('/arcade');
        } else {
          game_mod.ui.return_to_launcher();
        }
      }
    });
    this.menu.render();

    await this.ui.render();
  }

  /////////////////////////
  // Game Engine Support //
  /////////////////////////
  initializeGame(game_id) {
    let nwasm_self = this;

    if (!this.game.state) {
      this.game.state = {};
      this.game.queue = [];
      this.game.queue.push('round');
      this.game.queue.push('READY');
    }

    //
    // when games are saved in the emulator
    //
    this.app.connection.on('nwasm-export-game-save', (savegame) => {
      nwasm_self.active_game = savegame;
      nwasm_self.saveGameFile(savegame);
    });
  }

  handleGameLoop(msg = null) {
    ///////////
    // QUEUE //
    ///////////
    if (this.game.queue.length > 0) {
      let qe = this.game.queue.length - 1;
      let mv = this.game.queue[qe].split('\t');
      let shd_continue = 1;
      if (mv[0] === 'round') {
        this.game.queue.splice(this.game.queue.length - 1, 1);
      }
      if (shd_continue == 0) {
        return 0;
      }
    }
    return 1;
  }

  startPlaying(ts = null) {
    if (ts == null) {
      ts = new Date().getTime();
    }
    this.active_game_load_ts = ts;
    this.active_game_save_ts = ts;

    // Record last-played on the library registry entry when we know which ROM.
    let sig = this.launch_sig || this.active_rom_sig || '';
    if (sig && this.app.options?.nwasm?.library) {
      let entry = this.app.options.nwasm.library.find((g) => g?.sig === sig);
      if (entry) {
        entry.last_played = ts;
        this.app.storage.saveOptions();
      }
    }
  }

  stopPlaying(ts = null) {
    if (ts == null) {
      ts = new Date().getTime();
    }
    this.active_game_time_played += ts - this.active_game_load_ts;
    this.active_game_load_ts = ts;
  }

  isRentalExpired(game = null) {
    if (!game?.rental) {
      return false;
    }
    let exp = game.expires_at != null ? Number(game.expires_at) : NaN;
    return !Number.isFinite(exp) || Date.now() >= exp;
  }

  clearRentalTimer() {
    if (this.rental_timer) {
      clearTimeout(this.rental_timer);
      this.rental_timer = null;
    }
    this.rental_game_sig = null;
  }

  armRentalExpiry(game = null) {
    this.clearRentalTimer();
    if (!game?.rental) {
      return;
    }
    if (this.isRentalExpired(game)) {
      this.expireRental();
      return;
    }
    let exp = Number(game.expires_at);
    this.rental_game_sig = game.sig || this.launch_sig || '';
    this.rental_timer = setTimeout(() => {
      this.expireRental();
    }, Math.max(0, exp - Date.now()));
  }

  clearRentalRomFromMemory() {
    this.active_rom = null;
    this.active_game = null;
    try {
      if (typeof FS !== 'undefined' && FS.analyzePath) {
        let info = FS.analyzePath('custom.v64');
        if (info?.exists) {
          FS.unlink('custom.v64');
        }
      }
    } catch (err) {}
  }

  expireRental() {
    this.clearRentalTimer();
    try {
      if (typeof myApp !== 'undefined') {
        if (typeof myApp.saveStateLocal === 'function') {
          myApp.saveStateLocal();
        }
        if (typeof myApp.exportStateLocal === 'function') {
          myApp.exportStateLocal();
        }
      }
    } catch (err) {
      console.log('Nwasm: rental expiry save failed: ' + err);
    }
    try {
      if (typeof myApp !== 'undefined' && myApp.stopEmulator) {
        myApp.stopEmulator();
      }
    } catch (err) {}
    this.clearRentalRomFromMemory();
    try {
      this.stopPlaying();
    } catch (err) {}
    try {
      if (this.ui?.hide_loading) {
        this.ui.hide_loading();
      }
      if (this.ui?.return_to_launcher) {
        this.ui.return_to_launcher();
      }
    } catch (err) {}
    try {
      alert('This rental has expired.');
    } catch (err) {}
  }

  ////////////////////
  // ROM Management //
  ////////////////////
  //
  // Canonical N-WASM game payload — same object Create NFT stores in txmsg.data:
  //   { module: 'Nwasm', name: ..., file: <data URI> }
  //
  async createGameData(file, file_name = '') {
    let cap = this.respondTo('saito-create-nft');
    if (!cap?.createData) {
      throw new Error('N64 ROM NFT type is unavailable');
    }

    let data_uri = file;
    if (typeof file !== 'string' || file.indexOf('data:') !== 0) {
      let base64 = Buffer.from(file).toString('base64');
      let safe_name = encodeURIComponent(file_name || 'rom.bin');
      data_uri = `data:application/octet-stream;name=${safe_name};base64,${base64}`;
    }

    return await cap.createData(data_uri, { title: file_name });
  }

  //
  // Persist a signed local Archive transaction whose msg.data is the canonical
  // N-WASM game payload (same structure as NFT txmsg.data).
  //
  // Do NOT set Archive `owner` to the wallet public key. Archive.enforce_access_hash
  // treats a non-empty owner as an access-script hash and will refuse to return the
  // row unless a matching access_script is supplied — which breaks load_games().
  // Scope local ROMs with field1/field2 instead.
  //
  async saveGameToArchive(game_data) {
    let name = (game_data?.name || '').trim();
    if (!game_data?.file || !name) {
      throw new Error('Invalid N-WASM game data');
    }

    let publicKey = this.publicKey || (await this.app.wallet.getPublicKey());
    if (!this.publicKey && publicKey) {
      this.publicKey = publicKey;
    }

    let rom_id = this.app.crypto.hash(name);
    let newtx = await this.app.wallet.createUnsignedTransaction();
    newtx.msg = {
      module: this.name,
      id: rom_id,
      type: rom_id,
      title: name,
      name: name,
      request: 'archive insert',
      data: game_data
    };

    await newtx.sign();

    if (!newtx.signature) {
      throw new Error('Failed to sign archive transaction');
    }

    let result = await this.app.storage.saveTransaction(
      newtx,
      {
        field1: this.name,
        field2: publicKey,
        field3: name
      },
      'localhost'
    );

    if (result?.err) {
      let err = result.err;
      throw err instanceof Error ? err : new Error(String(err || 'Archive save failed'));
    }

    //
    // Confirm IndexedDB retained a copy discoverable the same way load_games()
    // queries (field1 = module), not merely by signature.
    //
    let verified = await new Promise((resolve) => {
      this.app.storage.loadTransactions(
        { field1: this.name, limit: 100 },
        (txs) => {
          let found = (txs || []).some((tx) => tx?.signature === newtx.signature);
          resolve(found);
        },
        'localhost'
      );
    });

    if (!verified) {
      throw new Error('Archive save could not be verified — ROM was not retained locally');
    }

    return newtx;
  }

  //
  // Register a game in the N-WASM Library registry after a successful save.
  // load_games() merges this list with Archive / wallet-NFT / Vault discovery.
  //
  // tx should carry the canonical game payload (msg.data = createGameData result,
  // or an NFT mint tx whose msg.data is that object). For Vault-only metadata
  // registration, pass sig + vault and omit tx.
  //
  async addGame(tx = null, meta = {}) {
    if (!this.app.options.nwasm) {
      this.app.options.nwasm = {};
    }
    if (!Array.isArray(this.app.options.nwasm.library)) {
      this.app.options.nwasm.library = [];
    }

    let msg = {};
    try {
      msg = tx?.returnMessage?.() || tx?.msg || {};
    } catch (err) {
      msg = {};
    }

    let sig = (meta.sig || tx?.signature || '').toString();
    let title = (
      meta.title ||
      msg.title ||
      msg.name ||
      msg.data?.name ||
      msg.data?.title ||
      ''
    )
      .toString()
      .trim();
    let id = (meta.id || msg.id || sig || '').toString();
    let source = (meta.source || 'archive').toString();

    if (tx?.signature) {
      try {
        await this.app.storage.saveTransaction(
          tx,
          {
            field1: this.name,
            field2: source,
            field3: title || id || sig
          },
          'localhost'
        );
      } catch (err) {
        console.log('Nwasm.addGame: saveTransaction failed: ' + err);
      }
      sig = tx.signature;
    }

    if (!sig) {
      throw new Error('Cannot register library game without a transaction signature');
    }

    if (!title) {
      title = 'Untitled ROM';
    }

    let entry = {
      sig: sig,
      title: title,
      id: id || sig,
      source: source,
      nft_type: meta.nft_type || meta.vault?.nft_type || '',
      rental: meta.rental === true,
      expires_at: meta.expires_at != null ? meta.expires_at : null
    };
    if (meta.vault) {
      entry.vault = meta.vault;
    }

    let list = this.app.options.nwasm.library;
    let idx = list.findIndex(
      (g) => g?.sig === entry.sig || (entry.id && g?.id && g.id === entry.id)
    );
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], entry);
    } else {
      list.push(entry);
    }

    this.app.storage.saveOptions();

    // Upsert this ROM into Arcade without pruning other titles.
    if (this.app.BROWSER && typeof this.syncArcadeGames === 'function') {
      try {
        if (this.ui?.games && !this.ui.games.some((g) => g.sig === entry.sig)) {
          this.ui.games.push({
            sig: entry.sig,
            title: entry.title,
            id: entry.id,
            source: entry.source,
            vault: entry.vault || null,
            nft_type: entry.nft_type || '',
            last_played: entry.last_played || 0,
            rental: entry.rental === true,
            expires_at: entry.expires_at != null ? entry.expires_at : null
          });
          this.ui.games.sort((a, b) => a.title.localeCompare(b.title));
        }
        this.syncArcadeGames(
          [
            {
              sig: entry.sig,
              title: entry.title,
              id: entry.id,
              source: entry.source,
              vault: entry.vault || null,
              nft_type: entry.nft_type || '',
              last_played: entry.last_played || 0,
              rental: entry.rental === true,
              expires_at: entry.expires_at != null ? entry.expires_at : null
            }
          ],
          { prune: false }
        );
      } catch (err) {
        console.warn('Nwasm: syncArcadeGames after addGame failed:', err);
      }
    }

    // Refresh Arcade library overlay if it is open.
    if (this.arcade_overlay?.is_open) {
      try {
        await this.arcade_overlay.refresh();
      } catch (err) {
        console.warn('Nwasm: arcade overlay refresh failed:', err);
      }
    }

    return entry;
  }

  //
  // After Upload to Vault is confirmed, register the game from the mint tx /
  // upload result — do not ask Vault for metadata.
  //
  async addGameFromVaultResult(ctx = {}, result = {}) {
    let name = (ctx.game_data?.name || ctx.file_name || '').trim() || 'game';
    let filename = (result?.filename || ctx.file_name || `${name}.z64`).trim();
    if (!/\.(z64|n64|v64)$/i.test(filename)) {
      filename = `${filename.replace(/\.[^.]+$/, '') || name}.z64`;
    }

    try {
      await this.app.wallet.updateNFTList();
    } catch (err) {
      console.warn('Nwasm.addGameFromVaultResult: updateNFTList failed:', err);
    }

    let nft_tx = result?.nft_tx || null;
    let nft_id = result?.nft_id || '';
    let tx_sig = nft_tx?.signature || '';
    let nfts = this.app.options?.wallet?.nfts || [];
    let nft_entry =
      nfts.find((n) => (nft_id && n.id === nft_id) || (tx_sig && n.tx_sig === tx_sig)) || null;

    let msg = {};
    try {
      msg = nft_tx?.returnMessage?.() || nft_tx?.msg || {};
    } catch (err) {
      msg = {};
    }
    let data = msg.data && typeof msg.data === 'object' ? msg.data : {};

    let file_id = String(result?.file_id || data.file_id || '');
    filename = String(data.filename || filename);
    nft_id = String(nft_id || nft_entry?.id || '');
    tx_sig = String(tx_sig || nft_entry?.tx_sig || '');

    if (!file_id || (!tx_sig && !nft_tx)) {
      throw new Error(
        'Vault upload confirmed but Access Key mint transaction data is not available to register'
      );
    }

    let file = {
      nft_id: nft_id || tx_sig,
      tx_sig: tx_sig,
      file_id: file_id,
      filename: filename,
      link: data.link != null ? String(data.link) : '',
      slip1_utxokey: nft_entry?.slip1?.utxo_key || '',
      slip2_utxokey: nft_entry?.slip2?.utxo_key || '',
      slip3_utxokey: nft_entry?.slip3?.utxo_key || '',
      file_access_script: data.file_access_script || null
    };

    this.rememberVaultNftIndex(tx_sig || file.nft_id, {
      status: 'rom',
      ...file
    });

    let title = filename.replace(/\.(z64|n64|v64)$/i, '').trim() || name;
    return await this.addGame(nft_tx, {
      source: 'vault',
      title: title,
      id: file.nft_id || tx_sig,
      sig: tx_sig,
      vault: file
    });
  }

  //
  // NWASM-owned classification of Vault NFTs (not Vault's options.vault.files).
  //
  rememberVaultNftIndex(key, entry) {
    if (!key || !entry) {
      return;
    }
    if (!this.app.options.nwasm) {
      this.app.options.nwasm = {};
    }
    if (!this.app.options.nwasm.vault_nft_index || typeof this.app.options.nwasm.vault_nft_index !== 'object') {
      this.app.options.nwasm.vault_nft_index = {};
    }
    this.app.options.nwasm.vault_nft_index[key] = entry;
    this.app.storage.saveOptions();
  }

  async deleteRoms() {
    this.app.storage.deleteTransactions(
      {
        field1: this.name,
        field2: this.publicKey
      },

      () => {
        try {
          alert('Transactions deleted');
        } catch (err) {
          console.log('error running alert when transactions deleted');
        }
      },

      null
    );
  }

  returnAdvancedOptions() {
    return NwasmGameOptionsTemplate(this.app, this);
  }

  //
  // Saito Module gets feedback from the N64 Emulator by monitoring the console log
  // for updates on the state of the program execution (has it initialized? have we
  // saved? etc.).
  //
  // for the love of God don't add console.logs within this function or you'll throw
  // execution into an infinite loop.
  //
  async processNwasmLog(logline = '', log) {
    let x = logline;
    let nwasm_self = this;

    if (logline.indexOf('mupen64plus: ') == 0) {
      x = logline.substring(13);
        if (x.indexOf('Name: ') == 0) {
        x = x.substring(6);
        if (x.indexOf('muopen') > -1) {
          x = x.substring(0, x.indexOf('muopen'));
        }

        let len = x.trim().length;
        if (len > 6) {
          len = 6;
        }

        //
        // ROM title / save lookup only. Loading overlay is dismissed from
        // LoadEmulator after initAudio (first boot and soft-restart).
        //
        if (this.active_rom_name.indexOf(x.trim().substring(0, len)) != 0) {
          this.active_rom_name = x.trim();
          this.active_rom_sig = this.app.crypto.hash(this.active_rom_name);

          //
          // Local persistence is explicit via "Save to Local Archive".
          // Play Game Now must not silently create an archive entry.
          //
          this.uploaded_rom = true;

          //
          // load 5 saved games
          //
          this.app.storage.loadTransactions(
            { field1: 'Nwasm' + this.active_rom_sig, limit: 5 },
            function (txs) {
              try {
                for (let z = 0; z < txs.length; z++) {
                  let newtx = txs[z];
                  nwasm_self.active_game_saves.push(newtx);
                }
              } catch (err) {
                log('error loading Nwasm game...: ' + err);
              }
            }
          );
        }
      }
    }
  }

  //////////////////
  // transactions //
  //////////////////

  //
  // Wrap raw ROM bytes as a temporary tx so extractRom can reuse the
  // archive/local loading path (title seeding, startPlaying, initializeRom).
  // Uses the same msg.data shape as NFT / Archive: { module, name, file }.
  //
  packRom(base64, meta = {}) {
    let title = (meta.title || meta.filename || meta.name || '').trim();
    let file = typeof base64 === 'string' && base64.indexOf('data:') === 0
      ? base64
      : `data:application/octet-stream;base64,${base64}`;
    let tx = new Transaction();
    tx.msg = {
      module: this.name,
      id: meta.id || '',
      title: title,
      name: title,
      data: {
        module: 'Nwasm',
        name: title,
        file: file
      }
    };
    return tx;
  }

  //
  // Vault may return either a legacy raw-ROM payload or a JSON envelope whose
  // `.data` is the canonical N-WASM game object. Converge both onto a tx that
  // extractRom understands.
  //
  unpackVaultFile(base64, meta = {}) {
    try {
      let text = Buffer.from(base64, 'base64').toString('utf8');
      let msg = JSON.parse(text);
      if (msg?.data?.module === 'Nwasm' && msg?.data?.file) {
        let title = (msg.title || msg.name || msg.data.name || meta.title || '').trim();
        let tx = new Transaction();
        tx.msg = {
          module: this.name,
          id: meta.id || '',
          title: title,
          name: title,
          data: msg.data
        };
        return tx;
      }
    } catch (err) {}
    return this.packRom(base64, meta);
  }

  extractRom(tx) {
    let txmsg = tx.returnMessage();
    let secret_key = txmsg.key || '';

    let base64 = txmsg.data;
    if (txmsg.data && typeof txmsg.data === 'object' && txmsg.data.file) {
      base64 = txmsg.data.file;
    }
    if (typeof base64 !== 'string') {
      throw new Error('N-WASM transaction missing ROM file data');
    }
    let rbase64 = base64.split('base64,')[1] ?? base64;
    let ab = '';
    if (secret_key != '') {
      ab = this.convertBase64ToByteArray(this.xorBase64(rbase64, secret_key));
    } else {
      ab = this.convertBase64ToByteArray(rbase64);
    }

    //
    // prevents us saving the file, this is an already uploaded rom
    //
    this.uploaded_rom = true;
    this.active_game_saves = [];

    //
    // Seed title/sig from archive metadata so Load can query saves before the
    // emulator Name log arrives.
    //
    let rom_title = (txmsg.title || txmsg.name || '').trim();
    if (rom_title) {
      this.active_rom_name = rom_title;
      this.active_rom_sig = this.app.crypto.hash(this.active_rom_name);
    }

    this.startPlaying();
    // LoadEmulator: cold callMain | same-ROM soft-reset | different-ROM page reload.
    myApp.initializeRom(ab, this.app, this);
  }

  loadSaveGame(sig) {
    for (let i = 0; i < this.active_game_saves.length; i++) {
      let newtx = this.active_game_saves[i];
      if (sig === newtx.signature) {
        let txmsg = newtx.returnMessage();
        let byteArray = this.convertBase64ToByteArray(txmsg.data);
        this.active_game = byteArray;
        //
        // importEep writes the savestate and unserializes without depending on
        // the IndexedDB lookup inside loadStateLocal.
        //
        myApp.importEep(byteArray);
      }
    }
  }

  loadGameFile() {
    let nwasm_mod = this;

    this.app.storage.loadTransactions(
      { field1: 'Nwasm' + this.active_rom_sig, limit: 1 },
      (txs) => {
        try {
          if (txs.length <= 0) {
            alert('No Saved Games Available');
          }
          let newtx = txs[0];
          let txmsg = newtx.returnMessage();
          let byteArray = nwasm_mod.convertBase64ToByteArray(txmsg.data);
          nwasm_mod.active_game = byteArray;
          nwasm_mod.active_game_time_played = txmsg.time_played;
          nwasm_mod.startPlaying();
          myApp.importEep(byteArray);
        } catch (err) {
          console.log('error loading Nwasm game...: ' + err);
        }
      }
    );
  }

  async saveGameFile(data) {
    let base64data = this.convertByteArrayToBase64(data);
    let screenshot = await this.app.browser.resizeImg(this.active_game_img);

    let newtx = await this.app.wallet.createUnsignedTransaction();

    this.stopPlaying();

    let obj = {
      module: this.name + this.active_rom_sig,
      request: 'upload savegame',
      name: this.active_rom_name.trim(),
      screenshot: screenshot,
      time_played: this.active_game_time_played,
      data: base64data
    };

    newtx.msg = obj;
    await newtx.sign();
    await this.app.storage.saveTransaction(newtx, {
      field1: 'Nwasm' + this.active_rom_sig
    });
    this.active_game_saves.push(newtx);
  }

  /////////////////////
  // data conversion //
  /////////////////////
  convertByteArrayToBase64(data) {
    return Buffer.from(data, 'binary').toString('base64');
  }

  convertBase64ToByteArray(data) {
    let b = Buffer.from(data, 'base64');
    let b2 = new Uint8Array(b.length);
    for (let i = 0; i < b.length; ++i) {
      b2[i] = b[i];
    }
    return b2;
  }

  xorBase64(data, secret_key) {
    let b = Buffer.from(data, 'base64');
    let r = Buffer.from(secret_key, 'utf8');
    return xorInplace(b, r).toString('base64');
  }

  ////////////////////////
  // saving and loading //
  ////////////////////////
  exportState() {
    let nwasm_mod = this;
    this.app.browser.screenshotCanvasElementById('canvas', function (img) {
      nwasm_mod.active_game_img = img;
      myApp.saveStateLocal();
      myApp.exportStateLocal();
    });
  }
}

module.exports = Nwasm;
