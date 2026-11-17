const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Manager = require('./lib/manager');
const GameBotAI = require('./lib/ai');
const BrowserDom = require('./lib/browser-dom');
const Main = require('./lib/ui/main');
const GamePage = require('./lib/ui/game');

class GameBot extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'GameBot';
    this.slug = 'gamebot';
    this.description = 'Manual runner for playing installed Saito games through their existing interfaces.';
    this.categories = 'Games Entertainment';
    this.class = 'utility';
    this.icon = 'fas fa-robot';
    this.styles = ['/gamebot/style.css'];

    this.manager = new Manager(app, this);
    this.ai = new GameBotAI(app, this);
    // The browser build must not import lib/jsdom.js. That file loads the
    // jsdom package, which the lite bundle cannot resolve.
    this.dom = new BrowserDom(app, this);
    this.main = new Main(app, this);
    this.game = new GamePage(app, this);
    this.header = null;

    return this;
  }

  async initialize(app) {
    await super.initialize(app);
    if (!app.BROWSER) {
      this.dom = await loadServerDom(app, this);
    }
    await this.manager.initialize();

    this.manager.onChange = () => {
      if (this.browser_active && !this.manager.gameIdFromHash()) {
        this.main.render();
      }
    };

    if (app.BROWSER) {
      window.addEventListener('hashchange', () => {
        if (this.browser_active) {
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

    if (this.manager.gameIdFromHash()) {
      this.game.render();
    } else {
      this.main.render();
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

// webpackIgnore on import() keeps this file out of the lite graph.
// The same comment on require() is ignored unless commonjs magic comments are enabled.
async function loadServerDom(app, mod) {
  try {
    const loaded = await import(/* webpackIgnore: true */ './lib/jsdom.js');
    const GameDom = loaded.default || loaded;
    return new GameDom(app, mod);
  } catch (err) {
    console.error('GameBot could not load the server DOM', err);
    return new BrowserDom(app, mod);
  }
}

module.exports = GameBot;
