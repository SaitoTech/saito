const Teaser = require('./teaser');

/**
 * Teasers — renders Arcade's Game list as Teaser tiles.
 */
class ArcadeTeasers {
  constructor(app, mod, container) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.teasers = [];
  }

  render() {
    const el = document.querySelector(this.container);
    if (!el) {
      return;
    }

    this.teasers = [];
    let html = '';

    for (let i = 0; i < this.mod.games.length; i++) {
      let game = this.mod.games[i];
      let teaser = new Teaser(this.app, this.mod, game);
      this.teasers.push(teaser);
      html += teaser.renderHTML();
    }

    let add_teaser = new Teaser(this.app, this.mod, null, { is_add_game: true });
    this.teasers.push(add_teaser);
    html += add_teaser.renderHTML();

    el.innerHTML = html;

    Array.from(el.querySelectorAll('.teaser')).forEach((node, idx) => {
      if (this.teasers[idx]) {
        this.teasers[idx].bind(node);
      }
    });
  }
}

module.exports = ArcadeTeasers;
