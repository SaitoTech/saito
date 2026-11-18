const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Manager = require('./lib/manager');
const AI = require('./lib/ai');
const GameDom = require('./lib/jsdom');
const Main = require('./lib/ui/main');
const GamePage = require('./lib/ui/game');

class GameBot extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'GameBot';
    this.slug = 'gamebot';
    this.description = 'Accepts a game invitation and plays through the game module.';
    this.categories = 'Games Entertainment';
    this.class = 'utility';
    this.icon = 'fas fa-robot';
    this.styles = ['/gamebot/style.css', '/saito/lib/jsonTree/jsonTree.css'];

    this.manager = new Manager(app, this);
    this.ai = new AI(app, this);
    this.jsdom = new GameDom(app, this);
    this.main = new Main(app, this);
    this.game_page = new GamePage(app, this);
    this.header = null;
  }

  async initialize(app) {
    await super.initialize(app);
    this.manager.listen();

    if (app.BROWSER) {
      window.addEventListener('hashchange', () => {
        if (this.browser_active && this.manager.phase === 'splash') {
          this.render();
        }
      });
    }
  }

  async render() {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.addComponent(this.header);
    }

    await super.render();

    if (this.manager.phase === 'loading') {
      this.main.render();
      return;
    }
    if (this.manager.phase === 'game') {
      await this.game_page.mount();
      return;
    }

    const raw = String(window.location.hash || '').replace(/^#/, '');
    const game_id = new URLSearchParams(raw).get('gid');
    if (game_id) {
      await this.recover_game(game_id);
      return;
    }
    this.main.render();
  }

  async recover_game(game_id) {
    if (this.recovering) {
      return;
    }
    this.recovering = true;
    this.manager.phase = 'loading';
    this.main.render();
    try {
      await this.manager.open_game(game_id);
      this.manager.phase = 'game';
      document.querySelector('.gamebot-screen')?.remove();
      await this.game_page.mount();
    } catch (err) {
      this.manager.phase = 'splash';
      this.manager.notice = err.message || 'Could not open that game';
      this.main.render();
    } finally {
      this.recovering = false;
    }
  }

  respondTo(type = '') {
    if (type === 'saito-header') {
      if (this.browser_active) {
        return [];
      }
      this.attachStyleSheets();
      return [
        {
          text: 'GameBot',
          icon: this.icon,
          rank: 20,
          type: 'quicklaunch',
          callback: function (app) {
            navigateWindow('/gamebot');
          },
          navigation: '/gamebot'
        }
      ];
    }
    return super.respondTo(type);
  }
}

module.exports = GameBot;
