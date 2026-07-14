const RankingsTemplate = require('./rankings.template');

class Rankings {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    // Placeholder data for UI development only.
    this.entries = [
      { game: 'Spider Solitaire', rank: 22 },
      { game: 'Settlers of Saitoa', rank: 38 },
      { game: 'Twilight Struggle', rank: 216 },
      { game: 'Saito Mania', rank: '...' },
      { game: 'Chess', rank: '...' },
      { game: 'Wordblocks', rank: '...' },
      { game: 'Wuziqi', rank: '...' },
      { game: 'Paths of Glory', rank: '...' },
      { game: 'Poker', rank: '...' },
      { game: 'Beleaguered Castle', rank: '...' },
      { game: 'Mahjong', rank: '...' },
      { game: 'Solitrio', rank: '...' },
      { game: 'Quake3', rank: '...' }
    ];
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.app.browser.replaceElementContentBySelector(RankingsTemplate(this), this.container);
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = Rankings;
