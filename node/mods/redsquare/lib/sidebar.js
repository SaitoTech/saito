const SidebarTemplate = require('./sidebar.template');

class Sidebar {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.trends = [
      { category: 'Technology · Trending', tag: '#Saito', posts: '12.4K posts' },
      { category: 'Web3 · Trending', tag: '#OpenSource', posts: '8,291 posts' },
      { category: 'Trending in Network', tag: '#RedSquare', posts: '3,847 posts' },
      { category: 'Politics · Trending', tag: '#Decentralization', posts: '2,156 posts' },
      { category: 'Trending', tag: '#P2P', posts: '1,903 posts' }
    ];

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
    this.attachEvents();
  }

  attachEvents() {}
}

module.exports = Sidebar;
