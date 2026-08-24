/**
 * Add Game chooser — three destination cards, no nested Arcade overlays.
 *
 * Free → Saito Wiki Applications
 * Sale / Rent → Saito Store
 */
const AddGameOverlayTemplate = require('./add-game.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

const WIKI_APPLICATIONS_URL = 'https://wiki.saito.io/applications';

class AddGameOverlay {
  constructor(app, mod = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  /**
   * Home options. Append a fourth entry later without redesigning the grid.
   * Upload ROM belongs on an NWASM-provided game card, not here.
   */
  returnHomeOptions() {
    return [
      {
        id: 'free',
        title: 'Free Games',
        description: 'Browse and install free peer-to-peer games.',
        image: '/saito/img/doom.jpg',
        view: 'free'
      },
      {
        id: 'sale',
        title: 'Games for Sale',
        description: 'Purchase games from creators on Saito.',
        image: '/arcade/img/add_game.png',
        view: 'sale'
      },
      {
        id: 'rent',
        title: 'Games for Rent',
        description: 'Play premium titles with flexible access.',
        image: '/arcade/img/rent_game.png',
        view: 'rent'
      }
    ];
  }

  render() {
    let options = this.returnHomeOptions();
    this.overlay.show(
      AddGameOverlayTemplate({
        view: 'home',
        options,
        count: options.length
      })
    );
    this.attachEvents(options);
  }

  close() {
    this.overlay.hide();
  }

  openStore() {
    if (this.app.modules.returnModule('Store')) {
      this.close();
      navigateWindow('/store', 200);
      return;
    }
    siteMessage('The Saito Store is not available on this node.', 3000);
  }

  openWikiApplications() {
    this.close();
    window.location.assign(WIKI_APPLICATIONS_URL);
  }

  attachEvents(options = []) {
    let root = document.querySelector('.arcade-add-game');
    if (!root) {
      return;
    }

    root.querySelectorAll('.choice').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        let id = btn.getAttribute('data-action');
        let option = options.find((o) => o.id === id) || { id };
        this.selectHomeOption(option);
      };
    });
  }

  selectHomeOption(option = {}) {
    this.app.connection.emit('arcade-add-game-select', option);

    if (option.view === 'free' || option.id === 'free') {
      this.openWikiApplications();
      return;
    }

    if (
      option.view === 'sale' ||
      option.id === 'sale' ||
      option.view === 'rent' ||
      option.id === 'rent'
    ) {
      this.openStore();
    }
  }
}

module.exports = AddGameOverlay;
