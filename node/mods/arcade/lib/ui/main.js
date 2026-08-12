const ArcadeMainTemplate = require('./main.template');
const ArcadeSidebar = require('./sidebar');
const ArcadeTeasers = require('./teasers');

class ArcadeMain {
  constructor(app, mod, container = 'body') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.sidebar = new ArcadeSidebar(app, mod, '.arcade-sidebar');
    this.teasers = new ArcadeTeasers(app, mod, '.teasers');

    let league_hook = app.modules.returnFirstRespondTo('leagues-for-arcade');
    if (league_hook) {
      app.connection.on('league-rankings-render-request', () => {
        this.renderTeaserRanks(league_hook);
      });
    }
  }

  renderTeaserRanks(league_hook) {
    if (!league_hook) {
      league_hook = this.app.modules.returnFirstRespondTo('leagues-for-arcade');
    }
    if (!league_hook) {
      return;
    }

    for (let league of league_hook.returnLeagues()) {
      let card = document.querySelector(`.teaser[data-league="${league.id}"] .footer`);
      if (card) {
        let html = '';
        if (league.rank > 0) {
          html = `<div class="leaderboard-rank arcade-invite-badge">${league.rank}</div>`;
        }
        card.innerHTML = html;
      }
    }
  }

  showInitializer(game_id) {
    if (!this.mod.browser_active) return;
    this.mod.render('lounge_overlay', { game_id });
  }

  async render() {
    if (document.querySelector('.saito-container')) {
      this.app.browser.replaceElementBySelector(
        ArcadeMainTemplate(this.app, this.mod),
        '.saito-container'
      );
    } else {
      this.app.browser.addElementToSelector(ArcadeMainTemplate(this.app, this.mod), this.container);
    }

    this.teasers.render();
    await this.sidebar.render();
    await this.app.modules.renderInto('.arcade-sidebar');

    this.renderTeaserRanks();
    this.app.connection.emit('league-rankings-render-request');
  }

  renderInvites() {
    if (!this.mod.browser_active) return;
    if (!this.sidebar || !this.sidebar.invites) return;
    this.sidebar.renderInvites();
  }
}

module.exports = ArcadeMain;
