const fs = require('node:fs');
const path = require('node:path');
const { Saito } = require('../../lib/saito/app');
const { default: S, initialize } = require('saito-js/index.node');
const { LogLevel } = require('saito-js/saito');
const { ServerSharedMethods } = require('saito-js/shared_methods.server');
const Factory = require('../../lib/saito/factory').default;
const Transaction = require('../../lib/saito/transaction').default;
const RunnerStorage = require('./storage');
const installPresentation = require('./presentation');
const { GAMES, supportsPlayers } = require('./config');

class RunnerSharedMethods extends ServerSharedMethods {
  file(key) {
    const root = this.app.storage.directory;
    const filename = path.resolve(root, key);
    if (!filename.startsWith(root + path.sep)) throw Error('Core storage path escapes runner directory');
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    return filename;
  }
  writeValue(key, value) { super.writeValue(this.file(key), value); }
  appendValue(key, value) { super.appendValue(this.file(key), value); }
  readValue(key) { return super.readValue(this.file(key)); }
  isExistingFile(key) { return super.isExistingFile(this.file(key)); }
  removeValue(key) { return super.removeValue(this.file(key)); }
  loadBlockFileList() { return []; }
  ensureDirExists(key) { fs.mkdirSync(this.file(key), { recursive: true, mode: 0o700 }); }
  async saveWallet() { await super.saveWallet(); this.app.storage.saveOptions(); }
  saveBlockchain() { this.app.storage.saveOptions(); }
}

async function createRuntime(config, { offline = false, send, monitor = false, chat = false, discover = false, coordinated = false } = {}) {
  if (S.getLibInstance()) throw Error('Use a separate process for each native player runtime');
  const app = new Saito({ mod_paths: [] });
  app.BROWSER = 0;
  app.SPVMODE = 1;
  app.HEADLESS = true;
  app.connection.on('runner-error', error => { app.runnerFailure = error; });
  app.storage = new RunnerStorage(app, config.dataDir);
  const saved = app.storage.load();
  const url = new URL(config.peer);
  const origin = `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`;
  let remote = {};
  if (!offline) {
    const response = await fetch(origin + '/options', { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`Bootstrap /options: HTTP ${response.status}`);
    remote = await response.json();
  }
  app.options = { ...saved, consensus: remote.consensus || saved.consensus,
    peers: offline ? [] : [{ host: url.hostname, port: Number(url.port || (url.protocol === 'wss:' ? 443 : 80)),
      protocol: url.protocol === 'wss:' ? 'https' : 'http', synctype: 'lite' }],
    browser_mode: true, spv_mode: true, runnerOrigin: origin,
    wallet: saved.wallet || {}, games: saved.games || [], arcade: saved.arcade || {},
    gameprefs: saved.gameprefs || {}, modules: saved.modules || [],
    server: { host: 'localhost', port: 0, protocol: 'http', endpoint: { host: '', port: 0, protocol: 'http' } }
  };
  if (!app.options.wallet.privateKey) {
    const key = require('node:crypto').createECDH('secp256k1');
    key.generateKeys();
    app.options.wallet.privateKey = key.getPrivateKey('hex');
    app.storage.saveOptions();
  }
  await initialize(app.options, new RunnerSharedMethods(app), new Factory(),
    app.options.wallet.privateKey || '', LogLevel.Error, BigInt(1), true);
  app.wallet = await S.getInstance().getWallet();
  app.wallet.app = app;
  app.blockchain = await S.getInstance().getBlockchain();
  app.blockchain.app = app;
  app.core = S.getInstance().getCore();
  await app.wallet.initialize();
  await app.keychain.initialize();
  app.options.wallet.publicKey = await app.wallet.getPublicKey();
  app.options.wallet.privateKey = await app.wallet.getPrivateKey();
  app.storage.saveOptions();
  // URL parsing belongs to browser navigation, not the player's network runtime.
  app.browser.returnURLParameter = () => null;
  let mod, adapter;
  if (!monitor) {
    const Game = require('../../mods/' + GAMES[config.game]);
    mod = new Game(app);
    installPresentation(mod);
    const accept = mod.initializeGameFromAcceptTransaction.bind(mod);
    mod.initializeGameFromAcceptTransaction = async tx => {
      const message = tx.returnMessage();
      if (coordinated && message.game_id !== app.options.runnerMulti?.id) throw Error('Acceptance does not match this seat’s assigned game');
      if (message.game !== config.game || Number(message.players_needed) !== (config.players ?? 2) || !supportsPlayers(message.game, Number(message.players_needed)) || (message.options?.stake && Number(message.options.stake) !== 0) ||
          message.options?.async_dealing || Number(message.options?.turn_limit || 0) !== 0) {
        throw Error('Unsupported game invitation options');
      }
      if (config.game === 'Twilight' && message.options?.deck && message.options.deck !== 'original') {
        throw Error('Twilight runner currently supports the original deck');
      }
      if (config.game === 'PathsOfGlory' && ((message.options?.deck && message.options.deck !== 'original') ||
          (message.options?.scenario && message.options.scenario !== 'original'))) {
        throw Error('Paths of Glory runner supports the original campaign only');
      }
      return accept(tx);
    };
    const Adapter = require('./games/' + config.game.toLowerCase());
    adapter = new Adapter(mod);
  }
  const Relay = require('../../mods/relay/relay');
  const relay = new Relay(app);
  const Arcade = require('../../mods/arcade/arcade');
  const arcade = new Arcade(app);
  if (coordinated) {
    const receiveAccept = arcade.receiveAcceptTransaction.bind(arcade);
    arcade.receiveAcceptTransaction = async tx => {
      const id = tx.returnMessage().game_id, reservation = app.options.runnerMulti;
      if (!id || id !== reservation?.id) return;
      // A returning seat may discover an active table before it saved the accept.
      // This wallet already authorized that invitation. Let the normal engine
      // validate the players' invite signatures and initialize its missing state.
      const record = arcade.returnGame(id);
      if ((reservation.joined || reservation.role === 'host') && !app.options.games.some(g => g.id === id) &&
        record?.tx.returnMessage().request === 'active') record.tx.msg.request = 'accepted';
      return receiveAccept(tx);
    };
  }
  for (const method of ['render', 'renderInvites', 'notifyPeers', 'showShareLink', 'onConnectionUnstable', 'onPeerHandshakeComplete']) arcade[method] = () => {};
  arcade.receiveOpenTransaction = async tx => { arcade.addInviteRecord(tx); };
  const chatClient = chat ? new (require('./chat'))(app) : null;
  app.modules.mods = [relay, arcade, mod, chatClient].filter(Boolean);
  for (const module of app.modules.mods) await module.initialize(app);
  app.modules.is_initialized = true;
  // Install client lifecycle events without server installation, SQL or UI startup.
  app.connection.on('on_peer_handshake_complete', async id => {
    try {
      const peer = await app.network.getPeerByPeerId(id);
      await app.wallet.setKeyList(app.keychain.returnWatchedPublicKeys());
      await app.modules.onPeerHandshakeComplete(peer, id);
    } catch (error) { app.connection.emit('runner-error', error); }
  });
  app.connection.on('on_peer_services_up', async id => {
    try { await app.modules.onPeerServicesUp(await app.network.getPeerByPeerId(id)); }
    catch (error) { app.connection.emit('runner-error', error); }
  });
  app.network.getServices = () => []; // A player does not advertise server services.
  // All network intake is serialized, including messages arriving while Codex thinks.
  const dispatch = app.modules.handlePeerTransaction.bind(app.modules);
  let incoming = Promise.resolve();
  const context = new (require('node:async_hooks').AsyncLocalStorage)();
  app.modules.handlePeerTransaction = (...args) => {
    if (context.getStore()) return dispatch(...args); // Relay unwraps recursively.
    const result = incoming.then(() => context.run(true, () => dispatch(...args)));
    incoming = result.catch(error => { app.connection.emit('runner-error', error); });
    return result;
  };
  const runExclusive = async callback => {
    if (context.getStore()) return callback();
    const result = incoming.then(() => context.run(true, callback));
    incoming = result.catch(error => app.connection.emit('runner-error', error));
    return result;
  };
  for (const module of app.modules.mods) {
    const confirmation = module.onConfirmation.bind(module);
    module.onConfirmation = (...args) => runExclusive(() => confirmation(...args));
  }
  // Checkpoint after processing, including an opponent's popped placement command.
  if (mod) {
    const startQueue = mod.startQueue.bind(mod);
    mod.startQueue = async (...args) => {
      try {
        const result = await startQueue(...args);
        mod.saveGame(mod.game.id);
        return result;
      } catch (error) {
        app.connection.emit('runner-error', error);
        throw error;
      }
    };
  }
  if (send) {
    app.network.propagateTransaction = async tx => send(tx.toJson());
    relay.sendRelayMessage = async () => {};
  }
  // Persist signed sends before either relay or on-chain delivery can happen.
  const stage = tx => {
    const msg = tx.returnMessage();
    if (![config.game, 'Arcade'].includes(msg.module)) return;
    app.options.runnerOutbox ||= {};
    app.options.runnerOutbox[tx.signature] = tx.toJson();
    if (msg.module === config.game && mod?.game?.runnerDraft) {
      delete mod.game.runnerDraft;
      delete mod.game.runnerTwilight;
      if (config.game === 'Twilight') mod.game.runnerTwilightWait = true;
      delete mod.game.runnerPaths;
      if (config.game === 'PathsOfGlory') mod.game.runnerPathsWait = true;
      mod.saveGame(mod.game.id);
    }
    app.storage.saveOptions();
  };
  const pending = app.wallet.addTransactionToPending.bind(app.wallet);
  app.wallet.addTransactionToPending = async (tx, save = true) => { stage(tx); return pending(tx, save); };
  const propagate = app.network.propagateTransaction.bind(app.network);
  app.network.propagateTransaction = async tx => { stage(tx); await propagate(tx); };
  const receive = async json => {
    const tx = new Transaction(undefined, json);
    const msg = tx.returnMessage();
    if (msg.module === 'Arcade') {
      const outer = new Transaction();
      outer.msg = { request: 'arcade spv update', data: tx.toJson() };
      return app.modules.handlePeerTransaction(outer, { publicKey: tx.from[0].publicKey });
    }
    const outer = new Transaction();
    outer.msg = { request: msg.module === 'Chat' ? 'chat relay' : msg.request === 'game' ? 'game relay gamemove' : 'game relay update', data: tx.toJson() };
    return app.modules.handlePeerTransaction(outer, { publicKey: tx.from[0].publicKey });
  };
  const retransmit = async () => {
    for (const [signature, json] of Object.entries(app.options.runnerOutbox || {})) {
      const tx = new Transaction(undefined, json), msg = tx.returnMessage();
      const finished = app.options.games.find(g => g.over &&
        (g.id === msg.game_id || (msg.module === 'Arcade' && g.id === tx.signature)));
      if (finished) { delete app.options.runnerOutbox[signature]; continue; }
      if (msg.module === 'Arcade' && mod?.game?.players_set && mod.game.step.game > 2) {
        delete app.options.runnerOutbox[signature];
        continue;
      }
      if (msg.module === config.game && mod?.game?.id === msg.game_id &&
          (mod.game.step?.players?.[mod.publicKey] >= msg.step?.game || mod.game.over)) {
        delete app.options.runnerOutbox[signature];
        continue;
      }
      await propagate(tx);
      if (!offline) app.connection.emit('relay-send-message', {
        recipient: msg.module === 'Arcade' ? 'PEERS' : mod.game.accepted,
        request: msg.module === 'Arcade' ? 'arcade spv update' : 'game relay gamemove', data: tx.toJson()
      });
    }
    app.storage.saveOptions();
  };
  const runtime = { app, mod, adapter, arcade, chat: chatClient, receive, retransmit, runExclusive, core: S.getInstance() };
  if (discover) runtime.discovery = require('./discovery')(runtime);
  if (!offline) S.getInstance().start();
  return runtime;
}
module.exports = { createRuntime };
