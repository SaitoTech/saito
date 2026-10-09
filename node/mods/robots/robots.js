const OnePlayerGameTemplate = require('../../lib/templates/oneplayer-gametemplate');
const GameHomePage = require('../../lib/templates/gametemplate-src/index');
const RobotsGame = require('./lib/robots-game');
const RobotsUI = require('./lib/ui/main');
const RulesTemplate = require('./lib/ui/rules.template');
const Art = require('./lib/art');
const TeleportPayments = require('./lib/teleport-payments');
const RobotsLeaderboard = require('./lib/leaderboard');
const LevelSaves = require('./lib/level-saves');

class Robots extends OnePlayerGameTemplate {
  constructor(app) {
    super(app);
    this.name = 'Robots';
    this.slug = 'robots';
    this.gamename = 'Terminator';
    this.title = 'Terminators (Run Sarah Run)';
    this.description =
      'Outwit the Terminators as Sarah Connor in an 8-bit reimagining of BSD and GNOME Robots. Every step costs. Make every fire count.';
    this.categories = 'Games Arcade One-player';
    this.publisher_message =
      'An unofficial fan game with original SVG pixel art. Inspired by BSD robots and GNOME Robots.';
    this.status = 'beta';
    this.class = 'app';
    this.version = '0.3.0';
    this.game_length = 10;
    this.statistical_unit = 'wave';
    this.styles = [];
    this.main = new RobotsUI(app, this);
    this.teleportPayments = new TeleportPayments(app, this);
    this.leaderboard = new RobotsLeaderboard(app, this);
    this.levelSaves = new LevelSaves(app, this);
  }

  respondTo(type, obj = null) {
    const response = super.respondTo(type, obj);
    if (type === 'default-league') response.ranking_algorithm = 'HSC';
    return response;
  }

  async initialize(app) {
    await super.initialize(app);
    await this.leaderboard.configure();
    if (app.BROWSER) {
      try {
        await this.levelSaves.load();
      } catch (error) {
        console.warn('Robots checkpoint load failed:', error);
      }
      this.levelSaves.flush();
      app.connection.on('league-data-loaded', () => this.leaderboard.configure());
      app.connection.on('league-leaderboard-loaded', (game) => {
        if (game === this.name && this.browser_active) this.main.update();
      });
    }
  }

  returnImage() {
    return Art.dataURI(Art.thumbnail());
  }
  returnBanner() {
    return Art.dataURI(Art.banner());
  }
  returnGameRulesHTML() {
    if (this.app.BROWSER) this.main.ensureStyles();
    return RulesTemplate();
  }

  initializeGame() {
    const newRun = !this.game.state;
    if (!this.game.state) {
      this.game.state = super.returnState();
      this.game.state.run = RobotsGame.newRun((n) => this.rollDice(n) - 1);
      this.game.state.session.round++;
      this.game.queue = ['robots-play', 'READY'];
    } else if (!this.game.queue.length) {
      this.game.queue.push('robots-play');
    }
    // Infer progress for older saves without sending historical results again.
    const run = this.game.state.run;
    if (run.clearedWaves === undefined) {
      run.clearedWaves = Math.max(0, run.wave - (run.status === 'cleared' ? 0 : 1));
      run.leaderboardPoints = RobotsGame.leaderboardPoints(run.clearedWaves);
    }
    // Existing saves now use the paid safe-teleport rule too.
    this.game.state.run.safeJumps = 0;
    this.saveGame(this.game.id);
    if (newRun) this.levelSaves.capture();
  }

  async onConfirmation(blk, tx, conf) {
    if (this.app.BROWSER && tx.returnMessage().checkpoint) {
      await this.levelSaves.confirm(tx, conf);
    }
    if (tx.returnMessage().request === 'level-save') return;
    if (tx.returnMessage().request === TeleportPayments.REQUEST) {
      if (this.teleportPayments.confirm(tx, conf) && this.browser_active) {
        this.main.update();
      }
      return;
    }
    return super.onConfirmation(blk, tx, conf);
  }

  async onPeerServiceUp(app, peer, service = {}) {
    await super.onPeerServiceUp(app, peer, service);
    if (app.BROWSER && service.service === 'archive') {
      try {
        await this.levelSaves.connect(peer);
      } catch (error) {
        console.warn('Robots checkpoint sync failed:', error);
      }
    }
  }

  async render(app) {
    if (!this.browser_active || this.initialize_game_run) return;
    await this.main.render();
    await super.render(app);
    this.menu.addMenuOption('game-game', 'Game');
    this.menu.addSubMenuOption('game-game', {
      text: 'How to Play',
      id: 'robots-rules',
      callback: () => {
        this.menu.hideSubMenus();
        this.overlay.show(this.returnGameRulesHTML());
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Leaderboard',
      id: 'robots-leaderboard',
      callback: () => {
        this.menu.hideSubMenus();
        this.leaderboard.show();
      }
    });
    this.menu.addChatMenu();
    this.menu.addSubMenuOption('game-game', {
      text: 'Resume Saved Level',
      id: 'robots-resume',
      callback: async () => {
        this.menu.hideSubMenus();
        await this.main.resumeLevel();
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Retry Level Sync',
      id: 'robots-sync',
      callback: () => {
        this.menu.hideSubMenus();
        this.levelSaves.flush();
      }
    });
    this.menu.render();
    this.main.mount();
  }

  handleGameLoop() {
    const command = this.game.queue[this.game.queue.length - 1];
    if (command === 'robots-play') {
      if (this.browser_active) this.main.update();
      return 0;
    }
    if (!command?.startsWith('robots\t')) return 0;
    this.game.queue.pop();
    let action;
    try {
      action = JSON.parse(command.slice(7));
    } catch (_) {
      return 1;
    }
    if (!action || typeof action !== 'object') return 1;
    const state = this.game.state;
    const random = (n) => this.rollDice(n) - 1;
    let result = {};
    if (action.type === 'paid-safe') {
      result = this.teleportPayments.consume(action, random);
    } else if (action.type === 'safe') {
      result = { message: 'SAFE TELEPORT COSTS 1 SAITO' };
    } else if (action.type === 'new') {
      state.run = RobotsGame.newRun(random);
      state.session.round++;
      this.levelSaves.capture();
    } else if (action.type === 'next' && state.run.status === 'cleared') {
      RobotsGame.nextWave(state.run, random);
      this.levelSaves.capture();
    } else {
      result = RobotsGame.act(state.run, action, random);
      if (result.accepted && state.run.status === 'dead') state.session.losses++;
    }
    if (result.accepted && state.run.status === 'cleared') {
      this.leaderboard.recordClear(state.run);
      this.levelSaves.capture();
    }
    const best = this.loadGamePreference('Robots_best') || 0;
    if (state.run.score > best) this.saveGamePreference('Robots_best', state.run.score);
    this.saveGame(this.game.id);
    if (this.browser_active) this.main.update(result.message);
    // Keep the input marker in place; stop here so a rejected-move notice remains visible.
    return this.game.queue[this.game.queue.length - 1] === 'robots-play' ? 0 : 1;
  }

  // Reuse the standard game shell while replacing its conventional HTTP asset paths.
  returnHomePage(baseURL, includeLoader = false) {
    const social = { ...this.social, url: baseURL + this.slug, image: this.returnImage() };
    return GameHomePage(this.app, this, this.app.build_number, social, includeLoader)
      .replace(/<link[^>]+href="\/robots\/style\.css[^>]+>/g, '')
      .replaceAll('/robots/img/arcade/arcade.jpg', this.returnImage())
      .replaceAll('/robots/img/arcade/arcade-banner-background.png', this.returnBanner());
  }

  returnDefaultHTML() {
    return super
      .returnDefaultHTML()
      .replaceAll('/robots/img/arcade/arcade.jpg', this.returnImage());
  }

  createSplashScreen() {
    return super
      .createSplashScreen()
      .replaceAll('/robots/img/arcade/arcade.jpg', this.returnImage())
      .replaceAll('/robots/img/arcade/arcade-banner-background.png', this.returnBanner())
      .replaceAll('/robots/img/arcade/menu-img.gif', Art.dataURI(Art.background()));
  }

  webServer(app, expressapp) {
    expressapp.get('/robots', (req, res) => {
      if (!res.finished)
        res.type('html').send(this.returnHomePage(`${req.protocol}://${req.headers.host}/`, true));
    });
  }
}
module.exports = Robots;
