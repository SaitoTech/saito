const GameTemplate = require('../../lib/templates/gametemplate');
const htmlTemplate = require('./lib/game-html.template');
const Board = require('./lib/ui/board/board');

class Saitoa extends GameTemplate {
  constructor(app) {
    super(app);

    this.name = 'Saitoa';
    this.slug = 'saitoa';
    this.title = 'Settlers of Saitoa';
    this.description =
      'A three-dimensional island of trade and settlement for the Saito Arcade.';
    this.categories = 'Games Boardgame Strategy';
    this.icon = 'fa-solid fa-mountain-sun';

    this.minPlayers = 2;
    this.maxPlayers = 2;

    this.board = new Board(app, this);

    return this;
  }

  async render(app) {
    if (!this.browser_active) {
      return;
    }
    if (this.initialize_game_run) {
      return;
    }

    await this.injectGameHTML(htmlTemplate());
    await super.render(app);

    this.menu.addMenuOption('game-game', 'Game');
    this.menu.addChatMenu();
    this.menu.render();

    this.board.render();
  }

  initializeGame(game_id) {
    if (this.game.initializing == 1) {
      this.game.queue.push('READY');
    }
  }
}

module.exports = Saitoa;
