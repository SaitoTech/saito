const ModTemplate = require('../../lib/templates/modtemplate');
const ArcadeMain = require('./lib/ui/main');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const InviteManager = require('./lib/ui/invites');
const Invite = require('./lib/ui/invite');
const GameWizard = require('./lib/ui/overlays/wizard');
const LoungeOverlay = require('./lib/ui/overlays/lounge');
const AddGameOverlay = require('./lib/ui/overlays/add-game');
const ArcadeGameInfo = require('./lib/ui/overlays/game-info');
const TeaserInstallOverlay = require('./lib/ui/overlays/teaser-install');
const SettingsOverlay = require('./lib/ui/settings_overlay');
const Game = require('./lib/game');
const Transaction = require('../../lib/saito/transaction').default;

const arcadeHome = require('./index');

/**
 * Arcade UI + invite/session controller.
 * Library titles are Game objects (lib/game.js) via addGame().
 * Invite records live in this.invites (see lib/invite-lifecycle.js).
 */
class Arcade extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Arcade';
    this.slug = 'arcade';
    this.sudo = false;
    this.description =
      'Interface for creating and joining games coded for the Saito Open Source Game Engine.';
    this.categories = 'Games Entertainment Appspace';
    this.icon = 'fas fa-gamepad';
    this.styles = ['/arcade/style.css'];
    this.shortlinks_enabled = 1;
    this.affix_callbacks_to = [];
    this.services = [this.app.network.createPeerService(null, 'arcade', '', 'saito')];

    // Library Game objects (displayed as Teasers).
    this.games = [];
    // Active invite / session records.
    this.invites = {};

    this.main = null;
    this.header = null;
    this.show_splash = true;
    this.lounge_overlay = null;
    this.wizard_overlay = null;
    this.add_game_overlay = null;
    this.game_info_overlay = null;
    this.teaser_install_overlay = null;

    this.possibleHome = 1;

    this.social = this.buildSocial({
      twitter: '@SaitoOfficial',
      title: '🟥 Saito Arcade',
      url: '/arcade/',
      description: 'Peer to peer gaming on the blockchain',
      image: 'https://saito.tech/wp-content/uploads/2023/11/arcade-300x300.png'
    });

    app.connection.on('arcade-add-game', () => {
      if (this.add_game_overlay) {
        this.add_game_overlay.render();
      }
    });

    app.connection.on('arcade-notify-player-turn', (game_id, target, status) => {
      for (let game of app.options.games) {
        if (game.id == game_id) {
          game.status = status;
          game.target = target;
          app.storage.saveOptions();
          siteMessage(`It is now your turn in ${game.module}`, 5000);
          this.renderInvites();
        }
      }
    });

    app.connection.on('arcade-gametable-addplayer', (game_id) => {
      let game_tx = this.returnGameTransaction(game_id);
      if (game_tx) {
        this.sendJoinTransaction({ tx: game_tx, game_name: 'open_table' });
      }
    });

    app.connection.on('arcade-gametable-removeplayer', (game_id, player_stats) => {
      let game_tx = this.returnGameTransaction(game_id);
      if (game_tx) {
        this.sendLeaveTransaction(game_tx, player_stats);
      }
    });

    app.connection.on('arcade-game-ready-render-request', (game_details) => {
      this._handleGameReadyNotification(game_details);
    });

    app.connection.on('arcade-continue-game-from-options', async (game_mod) => {
      let id = game_mod.game?.id;
      if (!id) {
        return;
      }

      let game = this.returnGame(id);

      if (!game) {
        let game_tx = await this.createPseudoTransaction(game_mod.game);
        this.addInviteRecord(game_tx, 'closed');
        let newInvite = new Invite(app, this, null, 'short', game_tx, this.publicKey);
        this.render('lounge_overlay', { invite_data: newInvite.invite_data });
        return;
      }

      delete game.tx.msg.time_finished;
      delete game.tx.msg.method;
      delete game.tx.msg.winner;
      game.tx.msg.request = 'paused';

      let newInvite = new Invite(app, this, null, 'short', game.tx, this.publicKey);
      this.render('lounge_overlay', { invite_data: newInvite.invite_data });
    });
  }

  /**
   * Create a Game and store it on this.games.
   * Modules supply data (and optional onClick) via respondTo('arcade-games');
   * Arcade owns the Game object.
   *
   * If game_data.name matches an existing Game, that entry is replaced
   * (supports modules that publish/update library titles after init).
   */
  addGame(game_data = {}) {
    let game = new Game(this.app, this, game_data);
    if (game.name) {
      let idx = this.games.findIndex((g) => g.name === game.name);
      if (idx >= 0) {
        this.games[idx] = game;
        return game;
      }
      this.affix_callbacks_to.push(game.name);
    }
    this.games.push(game);
    return game;
  }

  /**
   * Remove a library Game by name. Used by modules that maintain dynamic
   * title lists (e.g. installed ROMs) without Arcade knowing their domain.
   */
  removeGame(name = '') {
    if (!name) {
      return false;
    }
    let idx = this.games.findIndex((g) => g.name === name);
    if (idx < 0) {
      return false;
    }
    this.games.splice(idx, 1);
    this.affix_callbacks_to = this.affix_callbacks_to.filter((n) => n !== name);
    return true;
  }

  /**
   * Re-render library teasers if the Arcade UI is mounted.
   */
  renderGames() {
    if (!this.app.BROWSER) {
      return;
    }
    if (this.main?.teasers) {
      this.main.teasers.render();
    }
  }

  async initialize(app) {
    await super.initialize(app);

    this.games = [];
    this.affix_callbacks_to = [];

    // League attachment is browser UI only (teaser ranks / game-info).
    // League.respondTo('leagues-for-arcade') calls attachStyleSheets → document.
    let league = null;
    if (app.BROWSER) {
      league = app.modules.returnFirstRespondTo('leagues-for-arcade');
    }

    app.modules.returnModulesRespondingTo('arcade-games').forEach((game_mod) => {
      let pack = {};
      try {
        pack = game_mod.respondTo('arcade-games') || {};
      } catch (_) {
        pack = {};
      }

      let league_id = '';
      if (league) {
        let lid = app.crypto.hash(game_mod.returnName());
        if (league.returnLeague(lid)) {
          league_id = lid;
        }
      }

      let is_teaser = game_mod.teaser === true || game_mod.is_teaser === true;
      this.addGame({
        game_mod,
        name: game_mod.name,
        slug: game_mod.returnSlug ? game_mod.returnSlug() : game_mod.slug || '',
        title: game_mod.returnName ? game_mod.returnName() : game_mod.name,
        image: is_teaser ? game_mod.img || pack.image || '' : pack.image || game_mod.img || '',
        link: game_mod.link || '',
        league_id,
        onClick: typeof pack.onClick === 'function' ? pack.onClick : undefined
      });
    });

    if (!app.options.arcade) {
      app.options.arcade = {};
    }

    this.show_splash = Object.prototype.hasOwnProperty.call(app.options.arcade, 'show-splash')
      ? app.options.arcade['show-splash']
      : true;

    this.games = this.games.sort((a, b) => {
      let b_count = b.game_mod?.sort_priority || 0;
      let a_count = a.game_mod?.sort_priority || 0;

      if (app.options.arcade?.last_game == b.name) {
        return 1;
      }

      if (app.options.arcade[b.name]) {
        b_count += 2 * app.options.arcade[b.name];
      }

      if (app.options.arcade[a.name]) {
        a_count += 2 * app.options.arcade[a.name];
      }

      return b_count - a_count;
    });

    if (this.app.BROWSER == 1) {
      if (this.browser_active && this.app.browser.returnURLParameter('moderator')) {
        this.sudo = true;
      }

      this.lounge_overlay = new LoungeOverlay(this.app, this, null);
      this.wizard_overlay = new GameWizard(this.app, this, null, {});
      this.add_game_overlay = new AddGameOverlay(this.app, this);
      this.game_info_overlay = new ArcadeGameInfo(this.app, this);
      this.teaser_install_overlay = new TeaserInstallOverlay(this.app, this);
      this.settings_overlay = new SettingsOverlay(this.app, this);
      this.renderIntos = this.renderIntos || {};

      this.leagueCallback = app.modules.returnFirstRespondTo('league-membership') || null;

      if (this.app.options.games) {
        this.purge();

        for (let game of this.app.options.games) {
          if (!(game.players.includes(this.publicKey) || game.accepted.includes(this.publicKey))) {
            continue;
          }
          if (game.over) {
            continue;
          }
          if (!game.players.includes(this.publicKey)) {
            continue;
          }
          let game_tx = await this.createPseudoTransaction(game);
          this.addInviteRecord(game_tx, game.over ? 'over' : 'active');
        }
      }

      if (window?.game) {
        let game_tx = new Transaction();
        game_tx.deserialize_from_web(app, window.game);
        this.addInviteRecord(game_tx);
      }

      this.renderInvites();

      setInterval(() => {
        this.purge();
        this.renderInvites();
      }, 90000);
    }
  }

  renderInvites() {
    if (!this.app.BROWSER) {
      return;
    }
    if (this.browser_active) {
      if (this.main) {
        this.main.renderInvites();
      }
    } else if (this.invite_manager) {
      this.invite_manager.render();
    }
  }

  async render(mode = null, data = {}) {
    if (!this.app.BROWSER) {
      return;
    }

    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.header.header_class = 'arcade';
      this.addComponent(this.header);
    }

    if (!this.main) {
      this.main = new ArcadeMain(this.app, this);
      this.addComponent(this.main);
    }

    // Compatibility alias used by arcade2-era UI references
    this.ui = this.main;

    if (!this.chat_components_added) {
      for (const mod of this.app.modules.returnModulesRespondingTo('chat-manager')) {
        let cm = mod.respondTo('chat-manager');
        this.addComponent(cm);
      }
      this.chat_components_added = true;
    }

    // Chat renders in the left sidebar below Home / Settings (not a nav item).
    for (const mod of this.app.modules.returnModulesRespondingTo('chat-manager')) {
      let cm = mod.respondTo('chat-manager');
      if (cm) {
        cm.container = '.arcade-sidebar-left';
        cm.render_manager_to_screen = 1;
      }
    }

    if (this.browser_active) {
      document.body.classList.add('arcade-body');
      await super.render();
    }

    if (mode === 'lounge_overlay') {
      if (this.lounge_overlay && (data.invite_data != null || data.game_id != null)) {
        this.lounge_overlay.invite = data.invite_data != null ? data.invite_data : null;
        this.lounge_overlay.game_id = data.game_id != null ? data.game_id : null;
        this.lounge_overlay.observer_has_archive_data = data.observer_has_archive_data === true;
        this.lounge_overlay.observer_game_module_slug =
          data.game_module_slug != null ? data.game_module_slug : null;
        this.lounge_overlay.render();
      }
    }
  }

  canRenderInto(qs) {
    if (qs === '.redsquare-arcade') {
      return true;
    }
    if (qs === '.arcade-sidebar') {
      return true;
    }
    return false;
  }

  async renderInto(qs) {
    if (qs == '.arcade-sidebar') {
      if (!this.main) return;
      if (!this.renderIntos[qs]) {
        this.styles = ['/arcade/style.css'];
        this.renderIntos[qs] = [];
        this.renderIntos[qs].push(this.main.sidebar);
        this.attachStyleSheets();
      }
    }
    if (qs == '.redsquare-arcade') {
      if (!this.renderIntos[qs]) {
        this.styles = ['/arcade/style.css'];
        this.renderIntos[qs] = [];
        this.invite_manager = new InviteManager(this.app, this, qs);
        this.invite_manager.type = 'short';
        this.renderIntos[qs].push(this.invite_manager);
        this.attachStyleSheets();
      }
    }

    if (this.renderIntos[qs] != null && this.renderIntos[qs].length > 0) {
      for (const comp of this.renderIntos[qs]) {
        await comp.render();
      }
    }
  }

  respondTo(type = '', obj) {
    if (type === 'saito-header') {
      let x = [];
      if (!this.browser_active) {
        this.attachStyleSheets();
        x.push({
          text: 'Arcade',
          icon: this.icon || 'fas fa-gamepad',
          rank: 10,
          type: 'quicklaunch',
          callback: function (app, id) {
            navigateWindow(`/arcade`);
          },
          navigation: '/arcade'
        });
      }
      return x;
    }

    if (type === 'saito-filter-link') {
      if (obj.slug == this.returnSlug()) {
        if (!obj.url.includes('invite')) {
          return {
            info: [],
            no_photo: true
          };
        }
        return {
          info: ['title']
        };
      }
    }

    return super.respondTo(type, obj);
  }

  webServer(app, expressapp, express, alternative_slug = null) {
    const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
    const webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    const arcade_self = this;

    expressapp.use(uri, express.static(webdir));

    expressapp.get(uri, async function (req, res) {
      const endpoint = app?.options?.server?.endpoint || app?.options?.server || {};
      const protocol = (endpoint.protocol || req.protocol || 'https').replace(/:$/, '');
      const host = endpoint.host || req.hostname || req.headers.host;
      const port = endpoint.port ? `:${endpoint.port}` : '';
      let reqBaseURL = `${protocol}://${host}${port}/`;
      let game_data = null;
      let updatedSocial = Object.assign({}, arcade_self.social);

      updatedSocial.url = reqBaseURL + encodeURI(arcade_self.returnSlug());

      if (Object.keys(req.query).length > 0) {
        let query_params = req.query;
        let game = query_params?.game || query_params?.view_game;

        if (typeof game === 'string') {
          let gm = app.modules.returnModuleBySlug(game) || app.modules.returnModule(game);
          if (gm) {
            updatedSocial.title = `Play <em>${gm.returnName()}</em> on the Saito Arcade`;
            updatedSocial.image = `${reqBaseURL + gm.returnSlug()}/img/arcade/arcade-banner-background.png`;
            updatedSocial.description = gm.description;
            delete updatedSocial.url;
          }
        }

        let game_id = query_params?.game_id;
        if (game_id != null) {
          try {
            game_id = decodeURIComponent(game_id);
          } catch (_) {}
        }
        game_data = game_id && arcade_self.invites[game_id] ? arcade_self.invites[game_id].tx : null;
      }

      let html = arcadeHome(app, arcade_self, app.build_number, updatedSocial, game_data);
      if (!res.finished) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(html);
      }
      return;
    });
  }
}

Object.assign(Arcade.prototype, require('./lib/invite-lifecycle'));

module.exports = Arcade;
