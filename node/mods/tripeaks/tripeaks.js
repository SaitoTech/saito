const OnePlayerGameTemplate = require('../../lib/templates/oneplayer-gametemplate');
const TriPeaksGameRulesTemplate = require('./lib/tripeaks-game-rules.template');
const htmlTemplate = require('./lib/game-html.template');
const engine = require('./lib/tripeaks-engine');

class TriPeaks extends OnePlayerGameTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'TriPeaks';
    this.slug = 'tripeaks';
    this.gamename = 'TriPeaks Solitaire';
    this.game_length = 8;
    this.description =
      'Clear three overlapping peaks by chaining ranks one higher or lower than the waste card. Fast, combo-driven solitaire.';
    this.categories = 'Games Cardgame One-player';
    this.status = 'Beta';
    this.card_img_dir = '/tripeaks/img/cards';
    this.animationSpeed = 180;
    this.busy = false;
    this.history = [];
  }

  respondTo(type) {
    if (type == 'default-league') {
      let obj = super.respondTo(type);
      obj.ranking_algorithm = 'HSC';
      return obj;
    }
    return super.respondTo(type);
  }

  returnGameRulesHTML() {
    return TriPeaksGameRulesTemplate(this.app, this);
  }

  returnState() {
    let state = super.returnState();
    state.scores = [];
    state.play = null;
    state.snapshot = null;
    return state;
  }

  returnDeck() {
    const deck = {};
    engine.standardDeck().forEach((card) => {
      deck[card] = card;
    });
    return deck;
  }

  initializeGame(game_id) {
    if (!this.game.state) {
      this.game.state = this.returnState();
      this.game.queue = [];
    }

    if (this.browser_active) {
      if (this.game.deck.length == 0) {
        this.newRound();
      }
    } else {
      this.game.queue.push('READY');
    }
  }

  newRound() {
    this.game.queue = [];
    this.game.queue.push('play');
    this.game.queue.push('DEAL\t1\t1\t52');
    this.game.queue.push('SHUFFLE\t1\t1');
    this.game.queue.push('DECK\t1\t' + JSON.stringify(this.returnDeck()));
    this.game.state.play = null;
    this.game.state.snapshot = null;
    this.history = [];
    this.busy = false;
  }

  async render(app) {
    if (!this.browser_active || this.initialize_game_run) {
      return;
    }

    await this.injectGameHTML(htmlTemplate());
    await super.render(app);
    this.preloadImages();

    this.menu.addMenuOption('game-game', 'Game');
    this.menu.addSubMenuOption('game-game', {
      text: 'Start New Game',
      id: 'game-new',
      class: 'game-new',
      callback: (app, game_mod) => {
        game_mod.menu.hideSubMenus();
        game_mod.requestNewDeal();
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Restart Deal',
      id: 'game-restart',
      class: 'game-restart',
      callback: (app, game_mod) => {
        game_mod.menu.hideSubMenus();
        game_mod.restartDeal();
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'How to Play',
      id: 'game-intro',
      class: 'game-intro',
      callback: (app, game_mod) => {
        game_mod.menu.hideSubMenus();
        game_mod.overlay.show(game_mod.returnGameRulesHTML());
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Stats',
      id: 'game-stats',
      class: 'game-stats',
      callback: (app, game_mod) => {
        game_mod.menu.hideSubMenus();
        game_mod.overlay.show(game_mod.returnStatsHTML());
      }
    });
    this.menu.addChatMenu();
    this.menu.render();

    this.sizeBoard();
    window.addEventListener('resize', () => {
      this.sizeBoard();
      this.displayBoard();
    });

    this.attachChromeEvents();
    this.updateScoreboard();
  }

  sizeBoard() {
    const board = document.querySelector('.gameboard');
    if (!board) {
      return;
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    let card_width = Math.floor(Math.min(96, (width - 28) / 6.5, height / 8.2));
    if (height < 600 && width > height) {
      card_width = Math.floor(Math.min(card_width, height / 5.6));
    }
    card_width = Math.max(54, card_width);
    board.style.setProperty('--card-width', card_width + 'px');
    this.card_width = card_width;
  }

  playState() {
    return this.game.state.play;
  }

  cardImageHTML(name, face_up) {
    const front = `<img class="cardFront" src="${this.card_img_dir}/${name}.png" alt="${name}" />`;
    const back = `<img class="cardBack" src="${this.card_img_dir}/red_back.png" alt="" />`;
    if (face_up) {
      return front + back;
    }
    return `<img src="${this.card_img_dir}/red_back.png" alt="" />`;
  }

  dealFromHand() {
    if (!this.game.deck[0] || !this.game.deck[0].hand) {
      return;
    }
    const names = [];
    while (this.game.deck[0].hand.length > 0) {
      const key = this.game.deck[0].hand.pop();
      names.push(this.game.deck[0].cards[key]);
    }
    if (names.length !== 52) {
      return;
    }
    this.game.state.play = engine.deal(names);
    this.game.state.snapshot = engine.cloneState(this.game.state.play);
    this.history = [];
  }

  displayBoard() {
    if (!this.browser_active) {
      return;
    }
    const state = this.playState();
    if (!state) {
      return;
    }

    const tableau = document.querySelector('.tableau');
    const stock_el = document.querySelector('.stock');
    const waste_el = document.querySelector('.waste .pile');
    if (!tableau || !stock_el || !waste_el) {
      return;
    }

    const card_width = this.card_width || 80;
    const x_step = card_width * 0.34;
    const y_step = card_width * 1.53 * 0.28;
    const playable = {};
    engine.legalMoves(state).forEach((idx) => {
      playable[idx] = true;
    });

    let html = '';
    for (let i = 0; i < engine.TABLEAU_SIZE; i++) {
      const slot = state.tableau[i];
      const layout = engine.SLOT_DEFS[i];
      const left = layout.col * x_step;
      const top = layout.row * y_step;
      const classes = ['card'];
      if (slot.removed) {
        classes.push('gone');
      } else if (slot.face_up) {
        classes.push('faceup');
        if (playable[i]) {
          classes.push('playable');
        } else {
          classes.push('blocked');
        }
      } else {
        classes.push('facedown');
      }
      html += `<div class="${classes.join(' ')}" data-index="${i}" style="left:${left}px;top:${top}px;z-index:${layout.row * 10 + i}">`;
      if (!slot.removed) {
        html += this.cardImageHTML(slot.card, slot.face_up);
      }
      html += `</div>`;
    }
    tableau.innerHTML = html;

    const stock_pile = stock_el.querySelector('.pile');
    const stock_count = stock_el.querySelector('.count');
    if (state.stock.length > 0) {
      stock_el.classList.remove('empty');
      stock_pile.innerHTML = `<img src="${this.card_img_dir}/red_back.png" alt="Stock" />`;
      stock_count.textContent = state.stock.length;
    } else {
      stock_el.classList.add('empty');
      stock_pile.innerHTML = '';
      stock_count.textContent = '0';
    }

    const top = engine.wasteTop(state);
    waste_el.innerHTML = top ? this.cardImageHTML(top, true) : '';

    const combo_el = document.querySelector('.meter .combo');
    const peaks_el = document.querySelector('.meter .peaks');
    const remain_el = document.querySelector('.meter .remain');
    if (combo_el) {
      if (state.combo >= 2) {
        combo_el.classList.add('hot');
        combo_el.textContent = `Combo ×${state.combo}`;
      } else {
        combo_el.classList.remove('hot');
        combo_el.textContent = '';
      }
    }
    if (peaks_el) {
      const cleared = state.peaks_cleared.filter(Boolean).length;
      peaks_el.textContent = `Peaks ${cleared}/3`;
    }
    if (remain_el) {
      remain_el.textContent = `${engine.remainingTableau(state)} left`;
    }

    if (state.status === 'play' && engine.legalMoves(state).length === 0 && state.stock.length > 0) {
      stock_el.classList.add('hint');
    } else {
      stock_el.classList.remove('hint');
    }

    this.updateScoreboard();
    this.syncChrome();
    this.attachBoardEvents();
  }

  updateScoreboard() {
    const state = this.playState();
    const score = state ? state.score : 0;
    let status = 'Clear the peaks';
    if (state?.status === 'won') {
      status = 'You win';
    } else if (state?.status === 'lost') {
      status = 'No more moves';
    } else if (state && engine.legalMoves(state).length === 0 && state.stock.length > 0) {
      status = 'Draw from stock';
    }
    this.scoreboard.update(
      `<div class="score">Score: ${score} · ${status}</div>`
    );
  }

  syncChrome() {
    const undo = document.querySelector('.bar .undo');
    const restart = document.querySelector('.bar .restart');
    if (undo) {
      undo.classList.toggle('idle', this.history.length === 0);
    }
    if (restart) {
      restart.classList.toggle('idle', !this.game.state.snapshot);
    }
  }

  attachChromeEvents() {
    const self = this;
    $('.bar .undo').off();
    $('.bar .restart').off();
    $('.bar .fresh').off();
    $('.bar .undo').on('click', () => {
      self.undoMove();
    });
    $('.bar .restart').on('click', () => {
      self.restartDeal();
    });
    $('.bar .fresh').on('click', () => {
      self.requestNewDeal();
    });
  }

  attachBoardEvents() {
    const self = this;
    const tableau = document.querySelector('.tableau');
    const stock = document.querySelector('.stock');
    if (tableau) {
      tableau.onpointerup = (e) => {
        const card = e.target.closest('.card');
        if (!card) {
          return;
        }
        e.preventDefault();
        self.tryPlay(parseInt(card.dataset.index, 10));
      };
    }
    if (stock) {
      stock.onpointerup = (e) => {
        e.preventDefault();
        self.tryDraw();
      };
    }
  }

  pushHistory() {
    this.history.push(engine.cloneState(this.playState()));
    if (this.history.length > 80) {
      this.history.shift();
    }
  }

  tryPlay(index) {
    if (this.busy) {
      return;
    }
    const state = this.playState();
    if (!state || state.status !== 'play') {
      return;
    }
    if (!engine.canPlayIndex(state, index)) {
      return;
    }

    this.busy = true;
    this.pushHistory();
    const result = engine.playIndex(state, index);
    this.prependMove(`take\t${index}`);
    this.saveGame(this.game.id);

    const card_el = document.querySelector(`.tableau .card[data-index="${index}"]`);
    if (card_el) {
      card_el.classList.add('leaving');
    }

    setTimeout(() => {
      this.displayBoard();
      this.busy = false;
      this.afterMove(result);
    }, this.animationSpeed);
  }

  tryDraw() {
    if (this.busy) {
      return;
    }
    const state = this.playState();
    if (!state || state.status !== 'play') {
      return;
    }
    if (!state.stock.length) {
      this.afterMove({ status: state.status });
      return;
    }

    this.busy = true;
    this.pushHistory();
    const result = engine.drawStock(state);
    this.prependMove('draw');
    this.saveGame(this.game.id);
    this.displayBoard();
    this.busy = false;
    this.afterMove(result);
  }

  afterMove(result) {
    const state = this.playState();
    if (!state) {
      return;
    }
    if (state.status === 'won' || result?.status === 'won') {
      this.finishWin();
    }
  }

  finishWin() {
    if (this.busy === 'ending') {
      return;
    }
    this.busy = 'ending';
    this.prependMove('win');
    this.endTurn();
  }

  undoMove() {
    if (this.busy || this.history.length === 0) {
      return;
    }
    this.game.state.play = this.history.pop();
    if (this.moves.length) {
      this.moves.shift();
    }
    this.saveGame(this.game.id);
    this.displayBoard();
  }

  restartDeal() {
    if (!this.game.state.snapshot || this.busy === 'ending') {
      return;
    }
    this.busy = false;
    this.game.state.play = engine.cloneState(this.game.state.snapshot);
    this.history = [];
    this.moves = [];
    this.saveGame(this.game.id);
    this.displayBoard();
  }

  requestNewDeal() {
    if (this.busy === 'ending') {
      return;
    }
    this.busy = false;
    this.prependMove('lose');
    this.endTurn();
  }

  handleGameLoop() {
    this.saveGame(this.game.id);
    if (this.game.queue.length === 0) {
      return 0;
    }

    const qe = this.game.queue.length - 1;
    const mv = this.game.queue[qe].split('\t');

    if (mv[0] === 'lose') {
      this.game.queue.splice(qe, 1);
      let final_score = 0;
      const play = this.playState();
      if (play && play.moves > 0) {
        this.game.state.session.round++;
        this.game.state.session.losses++;
        final_score = play.score;
        this.game.state.scores.push(final_score);
      }
      this.newRound();
      if (final_score > 0) {
        this.game.queue.push(
          `ROUNDOVER\t${JSON.stringify([])}\t${final_score}\t${JSON.stringify([this.publicKey])}`
        );
      }
      return 1;
    }

    if (mv[0] === 'win') {
      this.game.queue.splice(qe, 1);
      this.game.state.session.round++;
      this.game.state.session.wins++;
      const play = this.playState();
      const final_score = play ? play.score : 0;
      this.game.state.scores.push(final_score);
      this.overlay.show(this.returnStatsHTML('Winner!'), () => {
        this.newRound();
        this.game.queue.push(
          `ROUNDOVER\t${JSON.stringify([this.publicKey])}\t${final_score}\t${JSON.stringify([])}`
        );
        this.busy = false;
        this.restartQueue();
      });
      return 0;
    }

    if (mv[0] === 'play') {
      if (this.browser_active) {
        if (!this.playState() && this.game.deck[0]?.hand?.length === 52) {
          this.dealFromHand();
        }
        this.sizeBoard();
        this.displayBoard();
      }
      return 0;
    }

    if (mv[0] === 'take' || mv[0] === 'draw') {
      this.game.queue.splice(qe, 1);
      return 1;
    }

    return 1;
  }

  preloadImages() {
    const names = engine.standardDeck().concat(['red_back']);
    this.preloadImageArray(names, 0);
  }

  preloadImageArray(imageArray, idx = 0) {
    if (imageArray && imageArray.length > idx) {
      const img = new Image();
      img.onload = () => {
        this.preloadImageArray(imageArray, idx + 1);
      };
      img.src = `${this.card_img_dir}/${imageArray[idx]}.png`;
    }
  }
}

module.exports = TriPeaks;
