const SidebarTemplate = require('./sidebar.template');
const Rankings = require('./rankings');

class Sidebar {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.rankings = new Rankings(app, mod);

    // Placeholder discovery list — same architecture as the prior Sidebar
    // implementation. No external recommendation module exists in production.
    this.suggestions = [
      { name: 'Saito Network', handle: 'saito', avatar: '/saito/img/dreamscape.png' },
      { name: 'Alice Chen', handle: 'alice', avatar: '/saito/img/tiled-logo.svg' },
      { name: 'Richard P.', handle: 'rp', avatar: '/saito/img/dreamscape.png' }
    ];
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.app.browser.replaceElementContentBySelector(SidebarTemplate(this), this.container);

    this.rankings.render(`${this.container} > .rankings`);

    this.renderModuleMounts();

    this.attachEvents();
  }

  /**
   * Ordered module injection — RedSquare owns sequence; peers own content.
   */
  renderModuleMounts() {
    if (!this.app.modules?.renderInto) {
      return;
    }

    this.app.modules.renderInto('.redsquare-arcade');
    this.app.modules.renderInto('.redsquare-leaderboard');
    this.app.modules.renderInto('.redsquare-sidebar');
  }

  attachEvents() {}
}

module.exports = Sidebar;
