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

    this.leaderboard = [
      { rank: 1, name: 'Saito Network', handle: 'saito', score: '12,480' },
      { rank: 2, name: 'Alice Chen', handle: 'alice', score: '9,214' },
      { rank: 3, name: 'Richard P.', handle: 'rp', score: '7,892' },
      { rank: 4, name: 'Bob Martinez', handle: 'bob', score: '6,103' },
      { rank: 5, name: 'Carol Okonkwo', handle: 'carol', score: '5,447' }
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
