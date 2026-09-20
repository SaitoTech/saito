const GameTemplate = require('../../lib/templates/gametemplate');
const Engine = require('./lib/engine');
const Map = require('./lib/map');
const Options = require('./lib/game-options.template');

/** Saito owns transport, persistence and encrypted cards; Engine owns the rules. */
class Conquest extends GameTemplate {
  constructor(app) {
    super(app);
    this.name = 'Conquest';
    this.slug = 'conquest';
    this.gamename = 'Conquest';
    this.title = 'Conquest · An atlas of ambition';
    this.description = 'A brush-painted world of strategy. Classic world conquest for two to six players, with automatic bookkeeping and animated battles.';
    this.categories = 'Games Boardgame Strategy';
    this.minPlayers = 2;
    this.maxPlayers = 6;
    this.game_length = 90;
    this.icon = 'fa-solid fa-earth-americas';
    this.styles.push('/conquest/style.css');
    this.confirm_moves = 0;
    this.can_play_async = 0;
    this.insert_rankings = true;
    this.conquestUI = null;
    this.conquestSending = false;
    this.conquestError = '';
    this.responseSent = new Set();
  }

  returnGameOptionsHTML() { return Options(); }
  returnAdvancedOptions() { return Options(); }
  returnImage() { return '/conquest/img/cover.svg'; }
  returnBanner() { return '/conquest/img/cover.svg'; }

  async render(app) {
    if (!this.browser_active) return;
    if (!document.getElementById('conquest-root')) {
      await this.injectGameHTML('<main id="conquest-root" aria-label="Conquest game"></main>');
    }
    await super.render(app);
    window.ConquestMap = Map;
    window.ConquestEngine = Engine;
    // The generic script loader does not guarantee dependency order.
    if (!window.THREE) await this.attachScript('/conquest/js/vendor/three.min.js');
    if (!window.ConquestScene) await this.attachScript('/conquest/js/scene.js');
    if (!window.ConquestUI) await this.attachScript('/conquest/js/ui.js');
    this.mountConquest();
  }

  mountConquest() {
    if (!this.browser_active || typeof window === 'undefined' || !window.ConquestUI || !this.game.state) return;
    const root = document.getElementById('conquest-root');
    if (!root) return;
    if (!this.conquestUI || this.conquestUI.element !== root) {
      this.conquestUI?.destroy();
      this.conquestUI = new window.ConquestUI(root, {
        getState: () => this.viewState(),
        getPlayer: () => this.game.player || -1,
        getPlayerName: id => this.playerName(id),
        getStatus: () => this.conquestStatus(),
        dispatch: action => this.submitAction(action)
      });
    }
    this.conquestUI.render();
  }

  playerName(id) {
    if (!id) return 'Neutral';
    const key = this.game.players[id - 1];
    return this.app.keychain?.returnUsername(key) || `Player ${id}`;
  }

  viewState() {
    const state = JSON.parse(JSON.stringify(this.game.state));
    for (const player of state.players) {
      player.cards = player.id === this.game.player ? [...(this.game.deck?.[0]?.hand || [])] : [];
    }
    state.networkBusy = this.conquestSending || !!this.game.conquestRandom || !!state.cardDraw || !!state.cardTransfer;
    return state;
  }

  conquestStatus() {
    if (this.conquestError) return this.conquestError;
    if (this.game.conquestRandom) return 'Resolving the battle with both players…';
    if (this.game.state?.cardTransfer) return 'Collecting the defeated army’s cards…';
    if (this.game.state?.cardDraw) return 'Dealing your private territory card…';
    if (this.conquestSending) return 'Sending move…';
    return '';
  }

  initializeGame() {
    if (!this.game.conquestInitialized) {
      this.initializeDice();
      this.game.conquestRevision = 0;
      this.game.conquestKnownHands = {};
      this.game.state = Engine.createGame({
        players: this.game.players.length,
        setup: this.game.options?.conquest_setup === 'quick' ? 'quick' : 'classic',
        externalCards: true
      }, sides => this.rollDice(sides));
      this.game.conquestInitialized = true;
      this.game.queue = this.game.queue || [];
      this.game.queue.push('CONQUEST_WAIT');
      this.game.queue.push('READY');
      this.game.queue.push(`DECKANDENCRYPT\t1\t${this.game.players.length}\t${JSON.stringify(Engine.cards)}`);
      this.saveGame(this.game.id);
    }
    this.game.target = this.game.state.currentPlayer;
    this.mountConquest();
  }

  /** Signatures bind commands to a game and a monotonically increasing revision. */
  async signEnvelope(kind, data) {
    const payload = JSON.stringify({ kind, game: this.game.id, revision: this.game.conquestRevision,
      player: this.game.player, ...data });
    return { payload, signature: await this.app.crypto.signMessage(payload, await this.app.wallet.getPrivateKey()) };
  }

  verifyEnvelope(envelope, kind) {
    if (!envelope || typeof envelope.payload !== 'string' || envelope.payload.length > 16000) throw Error('Invalid move envelope.');
    const data = JSON.parse(envelope.payload);
    if (data.kind !== kind || data.game !== this.game.id || data.revision !== this.game.conquestRevision ||
        !Number.isInteger(data.player) || data.player < 1 || data.player > this.game.players.length ||
        !this.app.crypto.verifyMessage(envelope.payload, envelope.signature, this.game.players[data.player - 1])) {
      throw Error('Invalid or stale move signature.');
    }
    return data;
  }

  async broadcast(kind, data) {
    const envelope = await this.signEnvelope(kind, data);
    this.addMove(`${kind}\t${JSON.stringify(envelope)}`);
    await this.endTurn(this.game.state.currentPlayer);
  }

  randomSecret() {
    // generateKeys uses the wallet crypto implementation's secure random source.
    return this.app.crypto.hash(this.app.crypto.generateKeys());
  }

  needsRandom(action) { return action.type === 'attack' || action.type === 'blitz'; }

  validateAction(player, action) {
    if (player !== this.game.state.currentPlayer || !action || typeof action.type !== 'string') throw Error('It is not your turn.');
    if (this.game.state.cardDraw || this.game.state.cardTransfer) throw Error('Wait for the cards to finish.');
    // Validate against a clone, with a constant roll: this must not advance game.dice.
    const next = Engine.applyAction(this.game.state, { ...action, player }, () => 1);
    if (action.type === 'trade') {
      const ids = action.cards;
      const deck = this.game.deck?.[0];
      if (!Array.isArray(ids) || ids.some(id => !Engine.cards[id] || deck?.discards?.[id])) throw Error('Those cards are not available.');
      for (const [owner, known] of Object.entries(this.game.conquestKnownHands || {})) {
        if (Number(owner) !== player && ids.some(id => known.includes(id))) throw Error('That card belongs to another player.');
      }
      if (player === this.game.player && ids.some(id => !deck?.hand.includes(id))) throw Error('You do not hold those cards.');
    }
    return next;
  }

  async submitAction(action) {
    if (this.conquestSending || this.game.conquestRandom || this.game.over) throw Error('A move is already being resolved.');
    this.validateAction(this.game.player, action);
    this.conquestError = '';
    this.conquestSending = true;
    this.mountConquest();
    try {
      if (this.needsRandom(action)) {
        const secret = this.randomSecret();
        this.game.conquestSecret = { revision: this.game.conquestRevision, secret };
        this.saveGame(this.game.id); // Persist BEFORE sending, so reload can reveal.
        await this.broadcast('CONQUEST_COMMIT', { action, commitment: this.app.crypto.hash(secret) });
      } else {
        await this.broadcast('CONQUEST_ACTION', { action });
      }
    } catch (error) {
      this.conquestSending = false;
      this.conquestError = error.message;
      this.mountConquest();
      throw error;
    }
  }

  randomPeer(player, action) {
    const defender = this.game.state.territories[action.to]?.owner;
    if (defender > 0 && defender !== player) return defender;
    return this.game.state.players.find(p => p.id !== player && !p.eliminated)?.id;
  }

  async servicePending() {
    const pending = this.game.conquestRandom;
    if (pending) {
      if (!pending.entropy && this.game.player === pending.peer) {
        const key = `entropy:${pending.id}`;
        if (!this.responseSent.has(key)) {
          this.responseSent.add(key);
          this.game.conquestEntropy = this.game.conquestEntropy?.id === pending.id ? this.game.conquestEntropy : { id: pending.id, value: this.randomSecret() };
          this.saveGame(this.game.id);
          await this.broadcast('CONQUEST_ENTROPY', { id: pending.id, value: this.game.conquestEntropy.value });
        }
      } else if (pending.entropy && this.game.player === pending.player) {
        const key = `reveal:${pending.id}`;
        if (!this.responseSent.has(key)) {
          if (this.game.conquestSecret?.revision !== this.game.conquestRevision) throw Error('Battle secret missing. Restore this game from the device that sent the attack.');
          this.responseSent.add(key);
          await this.broadcast('CONQUEST_REVEAL', { id: pending.id, secret: this.game.conquestSecret.secret });
        }
      }
    }
    const transfer = this.game.state.cardTransfer;
    if (transfer && this.game.player === transfer.from) {
      const key = `transfer:${this.game.conquestRevision}`;
      if (!this.responseSent.has(key)) {
        this.responseSent.add(key);
        await this.broadcast('CONQUEST_TRANSFER', { cards: [...this.game.deck[0].hand] });
      }
    }
  }

  async applyAction(player, action) {
    this.validateAction(player, action);
    const next = Engine.applyAction(this.game.state, { ...action, player }, sides => this.rollDice(sides));
    if (action.type === 'trade') {
      const deck = this.game.deck[0];
      for (const id of action.cards) {
        deck.discards[id] = Engine.cards[id];
        deck.hand = deck.hand.filter(card => card !== id);
        for (const hand of Object.values(this.game.conquestKnownHands)) {
          const i = hand.indexOf(id);
          if (i >= 0) hand.splice(i, 1);
        }
      }
    }
    this.game.state = next;
    this.game.conquestRevision++;
    this.game.target = next.currentPlayer;
    this.conquestSending = false;
    this.conquestError = '';
    this.responseSent.clear();
    if (next.cardTransfer?.count === 0) next.cardTransfer = null;
    if (next.cardDraw) {
      const draw = next.cardDraw;
      const deck = this.game.deck[0];
      if (deck.crypt.length + Object.keys(deck.discards).length < draw.count) {
        next.players.find(p => p.id === draw.player).cardCount -= draw.count;
        next.cardDraw = null;
      } else {
        this.game.queue.push('CONQUEST_DRAWN');
        this.game.queue.push(`SAFEDEAL\t1\t${draw.player}\t${draw.count}`);
      }
    }
    this.saveGame(this.game.id);
    this.mountConquest();
    if (next.winner && !this.game.over && !this.game.terminating) {
      await this.triggerGameOver([this.game.players[next.winner - 1]], 'world conquest');
    }
  }

  async handleGameLoop() {
    const command = this.game.queue[this.game.queue.length - 1];
    if (!command) return 0;
    const [kind, json] = command.split('\t');
    if (!kind.startsWith('CONQUEST_')) return 0;
    if (kind === 'CONQUEST_WAIT') {
      this.game.target = this.game.state.currentPlayer;
      try { await this.servicePending(); } catch (error) { this.conquestError = error.message; }
      this.mountConquest();
      return 0;
    }
    this.game.queue.pop();
    try {
      if (kind === 'CONQUEST_DRAWN') {
        this.game.state.cardDraw = null;
        this.conquestSending = false;
      } else {
        const envelope = JSON.parse(json);
        const data = this.verifyEnvelope(envelope, kind);
        if (kind === 'CONQUEST_ACTION') {
          if (this.game.conquestRandom || this.needsRandom(data.action)) throw Error('This move requires a committed battle roll.');
          await this.applyAction(data.player, data.action);
        } else if (kind === 'CONQUEST_COMMIT') {
          if (this.game.conquestRandom || !this.needsRandom(data.action) || !/^[a-f0-9]{64}$/i.test(data.commitment)) throw Error('Invalid battle commitment.');
          this.validateAction(data.player, data.action);
          this.game.conquestRandom = { id: this.app.crypto.hash(envelope.payload), player: data.player,
            peer: this.randomPeer(data.player, data.action), commitment: data.commitment, action: data.action };
          this.conquestSending = false;
        } else if (kind === 'CONQUEST_ENTROPY') {
          const pending = this.game.conquestRandom;
          if (!pending || data.id !== pending.id || data.player !== pending.peer || pending.entropy || !/^[a-f0-9]{64}$/i.test(data.value)) throw Error('Invalid battle contribution.');
          pending.entropy = data.value;
        } else if (kind === 'CONQUEST_REVEAL') {
          const pending = this.game.conquestRandom;
          if (!pending || !pending.entropy || data.id !== pending.id || data.player !== pending.player ||
              typeof data.secret !== 'string' || this.app.crypto.hash(data.secret) !== pending.commitment) throw Error('Invalid battle reveal.');
          this.game.dice = this.app.crypto.hash(`${this.game.id}:${pending.id}:${data.secret}:${pending.entropy}`);
          this.game.conquestRandom = null;
          delete this.game.conquestSecret;
          delete this.game.conquestEntropy;
          await this.applyAction(data.player, pending.action);
        } else if (kind === 'CONQUEST_TRANSFER') {
          this.acceptTransfer(data);
        } else {
          throw Error('Unknown Conquest command.');
        }
      }
    } catch (error) {
      this.conquestError = error.message;
      this.conquestSending = false;
      console.warn('Conquest rejected command:', error.message);
    }
    this.saveGame(this.game.id);
    this.mountConquest();
    return 1;
  }

  acceptTransfer(data) {
    const transfer = this.game.state.cardTransfer;
    const deck = this.game.deck[0];
    if (!transfer || data.player !== transfer.from || !Array.isArray(data.cards) || data.cards.length !== transfer.count ||
        new Set(data.cards).size !== data.cards.length || data.cards.some(id => !Engine.cards[id] || deck.discards[id])) throw Error('Invalid captured hand.');
    for (const [owner, hand] of Object.entries(this.game.conquestKnownHands)) {
      if (Number(owner) !== transfer.from && data.cards.some(id => hand.includes(id))) throw Error('Captured hand contains another player’s cards.');
    }
    if (this.game.player === transfer.to) {
      if (data.cards.some(id => deck.hand.includes(id))) throw Error('Captured hand duplicates your own cards.');
      deck.hand.push(...data.cards);
    }
    if (this.game.player === transfer.from) deck.hand = [];
    this.game.conquestKnownHands[transfer.to] = [...(this.game.conquestKnownHands[transfer.to] || []), ...data.cards];
    this.game.conquestKnownHands[transfer.from] = [];
    this.game.state.cardTransfer = null;
    this.responseSent.clear();
  }

  webServer(app, expressapp, express) {
    expressapp.get('/conquest/demo', (req, res) => res.sendFile(`${__dirname}/web/index.html`));
    for (const file of ['map.js', 'engine.js']) {
      expressapp.get(`/conquest/lib/${file}`, (req, res) => res.sendFile(`${__dirname}/lib/${file}`));
    }
    super.webServer(app, expressapp, express);
  }
}

module.exports = Conquest;
