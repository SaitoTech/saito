/**
 * Add Game overlay — stack-based navigation.
 *
 * Views:
 *   home  → large visual options (3 today; 4-ready)
 *   free  → deeper browse of installable / free games
 *   sale  → placeholder for future Store purchase flow
 *   rent  → placeholder for future rental flow
 *
 * No NWASM / Upload ROM / purchase / rental implementation here.
 */
const AddGameOverlayTemplate = require('./add-game.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class AddGameOverlay {
  constructor(app, mod = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.stack = [];
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
        image: '/saito/img/dreamscape.png',
        view: 'free'
      },
      {
        id: 'sale',
        title: 'Games for Sale',
        description: 'Purchase games from creators on Saito.',
        image: '/saito/img/doom.jpg',
        view: 'sale'
      },
      {
        id: 'rent',
        title: 'Games for Rent',
        description: 'Play premium titles with flexible access.',
        image: '/arcade/img/arcade-hero.png',
        view: 'rent'
      }
    ];
  }

  returnInstallableGames() {
    if (!this.mod?.games) {
      return [];
    }
    return this.mod.games.filter(
      (g) => g.game_mod?.teaser === true || g.game_mod?.is_teaser === true
    );
  }

  render() {
    this.stack = [{ view: 'home' }];
    this.renderStack();
  }

  push(frame) {
    this.stack.push(frame);
    this.renderStack();
  }

  back() {
    if (this.stack.length > 1) {
      this.stack.pop();
      this.renderStack();
      return;
    }
    this.close();
  }

  close() {
    this.stack = [];
    this.overlay.hide();
  }

  current() {
    return this.stack[this.stack.length - 1] || { view: 'home' };
  }

  renderStack() {
    let frame = this.current();
    let model = this.buildViewModel(frame);
    this.overlay.show(AddGameOverlayTemplate(model));
    this.attachEvents(model);
  }

  buildViewModel(frame) {
    let can_back = this.stack.length > 1;

    if (frame.view === 'home') {
      let options = this.returnHomeOptions();
      return {
        view: 'home',
        title: 'Add Game',
        canBack: can_back,
        options,
        count: options.length
      };
    }

    if (frame.view === 'free') {
      let games = this.returnInstallableGames().map((g) => ({
        id: g.name,
        title: g.title || g.name,
        image: g.image || '',
        href: g.link || ''
      }));
      return {
        view: 'free',
        title: 'Free Games',
        subtitle: games.length
          ? 'Choose a game to install.'
          : 'No installable free games are available on this node right now.',
        canBack: true,
        games
      };
    }

    if (frame.view === 'sale') {
      return {
        view: 'sale',
        title: 'Games for Sale',
        subtitle: 'Store purchase flow will connect here. No purchase logic is active yet.',
        canBack: true,
        placeholder: true,
        cta: this.app.modules.returnModule('Store') ? 'Open Store' : null
      };
    }

    if (frame.view === 'rent') {
      return {
        view: 'rent',
        title: 'Games for Rent',
        subtitle: 'Rental flow will connect here. No rental logic is active yet.',
        canBack: true,
        placeholder: true,
        cta: this.app.modules.returnModule('Store') ? 'Open Store' : null
      };
    }

    return {
      view: frame.view,
      title: 'Add Game',
      canBack: can_back,
      placeholder: true,
      subtitle: 'This view is not implemented yet.'
    };
  }

  attachEvents(model) {
    let root = document.querySelector('.arcade-add-game');
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-nav="back"]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        this.back();
      };
    });

    root.querySelectorAll('[data-nav="close"]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        this.close();
      };
    });

    if (model.view === 'home') {
      root.querySelectorAll('.choice').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          let id = btn.getAttribute('data-action');
          let option = (model.options || []).find((o) => o.id === id);
          this.selectHomeOption(option || { id });
        };
      });
      return;
    }

    if (model.view === 'free') {
      root.querySelectorAll('.game-choice').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          let id = btn.getAttribute('data-id');
          let href = btn.getAttribute('data-href') || '';
          this.app.connection.emit('arcade-add-game-select', { id: 'free-game', game: id });
          if (href) {
            let ok = confirm(
              'Do you want to install this game? This will take you to the app download site:'
            );
            if (ok) {
              this.close();
              navigateWindow(href, 300);
            }
          } else {
            siteMessage('No install link is available for this game.', 2500);
          }
        };
      });
      return;
    }

    root.querySelectorAll('[data-nav="store"]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        this.app.connection.emit('arcade-add-game-select', { id: model.view });
        if (this.app.modules.returnModule('Store')) {
          this.close();
          navigateWindow('/store', 200);
        } else {
          siteMessage('The Saito Store is not available on this node.', 3000);
        }
      };
    });
  }

  selectHomeOption(option = {}) {
    this.app.connection.emit('arcade-add-game-select', option);

    if (option.view === 'free' || option.id === 'free') {
      this.push({ view: 'free' });
      return;
    }
    if (option.view === 'sale' || option.id === 'sale') {
      this.push({ view: 'sale' });
      return;
    }
    if (option.view === 'rent' || option.id === 'rent') {
      this.push({ view: 'rent' });
      return;
    }

    // Unknown option: keep overlay open and show a stub frame.
    this.push({ view: option.id || 'unknown' });
  }
}

module.exports = AddGameOverlay;
