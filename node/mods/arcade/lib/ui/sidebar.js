const ArcadeSidebarTemplate = require('./sidebar.template');
const InviteManager = require('./invites');
const ArcadeLeaderboard = require('./leaderboard');

class ArcadeSidebar {
  constructor(app, mod, container) {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.invites = new InviteManager(app, mod, container);
    this.invites.type = 'short';
    this.leaderboard = new ArcadeLeaderboard(app, mod, `${container} .arcade-leaderboard`);
  }

  async render() {
    const el = document.querySelector(this.container);
    if (el) {
      el.innerHTML = ArcadeSidebarTemplate(this.app, this.mod);
    }
    this.invites.render();
    await this.leaderboard.render();
  }

  renderInvites() {
    if (this.invites) {
      if (this.mod && typeof this.mod.purge === 'function') {
        this.mod.purge();
      }
      this.invites.render();
    }
  }
}

module.exports = ArcadeSidebar;
