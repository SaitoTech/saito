const ModTemplate = require('../../lib/templates/modtemplate');
const ArcadeMain = require('./lib/ui/main');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const InviteManager = require('./lib/ui/invites');
const GameWizard = require('./lib/ui/overlays/wizard');
const LoungeOverlay = require('./lib/ui/overlays/lounge');
const AddGameOverlay = require('./lib/ui/overlays/add-game');
const ArcadeGameInfo = require('./lib/ui/overlays/game-info');
const Game = require('./lib/game');

const arcadeHome = require('./index');

/**
 * New Arcade UI shell.
 *
 * Behavioral reference: node/mods/arcade2/
 * Library titles are Game objects (lib/game.js) created via addGame().
 * Teasers render those Games. Full invite/session/peer lifecycle remains
 * in arcade2 until a later port.
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
    this.affix_callbacks_to = [];

    // Library Game objects (displayed as Teasers).
    this.games = [];
    // Active invite / session records (classic Arcade used this.games for these;
    // renamed so this.games can hold library Game objects).
    this.invites = {};

    this.main = null;
    this.header = null;
    this.show_splash = true;
    this.lounge_overlay = null;
    this.wizard_overlay = null;
    this.add_game_overlay = null;
    this.game_info_overlay = null;

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
  }

  /**
   * Create a Game and store it on this.games.
   * Modules supply data (and optional onClick) via respondTo('arcade-games');
   * Arcade owns the Game object.
   */
  addGame(game_data = {}) {
    let game = new Game(this.app, this, game_data);
    this.games.push(game);
    if (game.name) {
      this.affix_callbacks_to.push(game.name);
    }
    return game;
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

      this.addGame({
        game_mod,
        name: game_mod.name,
        slug: game_mod.returnSlug ? game_mod.returnSlug() : game_mod.slug || '',
        title: game_mod.returnName ? game_mod.returnName() : game_mod.name,
        image: pack.image || game_mod.img || '',
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
      this.renderIntos = this.renderIntos || {};

      this.leagueCallback = app.modules.returnFirstRespondTo('league-membership') || null;
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
        cm.container = '.arcade-sidebar';
        cm.render_manager_to_screen = 1;
        this.addComponent(cm);
      }
      this.chat_components_added = true;
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

  /**
   * UI-phase invite creation.
   * Opens the selected game module when single-player; multiplayer invite TX
   * lifecycle remains to be ported from arcade2.
   */
  async makeGameInvite(options, gameType = 'open', invite_obj = {}) {
    let game = options.game;
    let game_mod = this.app.modules.returnModule(game);
    if (!game_mod) {
      console.error('Arcade: makeGameInvite — game module not found', game);
      return;
    }

    let players_needed = options['game-wizard-players-select'];
    if (!players_needed) {
      players_needed = game_mod.minPlayers || 1;
      options['game-wizard-players-select'] = players_needed;
    }

    if (invite_obj.league) {
      options.league_id = invite_obj.league.id;
      options.league_name = invite_obj.league.name;
    }

    if (parseInt(players_needed) === 1 || gameType === 'single' || game_mod.maxPlayers === 1) {
      if (!this.app.options.arcade) {
        this.app.options.arcade = {};
      }
      this.app.options.arcade[game_mod.name] = (this.app.options.arcade[game_mod.name] || 0) + 1;
      this.app.options.arcade.last_game = game_mod.name;
      this.app.storage.saveOptions();

      navigateWindow(`/${game_mod.returnSlug()}/`);
      return;
    }

    siteMessage(
      'Multiplayer invites will be available once the Arcade controller is fully ported.',
      4000
    );
  }

  returnGamesWithFilter(filterObject = {}) {
    let results = [];
    for (let id in this.invites) {
      let record = this.invites[id];
      if (!record) continue;
      let match = true;
      for (let key in filterObject) {
        if (record[key] !== filterObject[key]) {
          match = false;
          break;
        }
      }
      if (match) {
        results.push(record);
      }
    }
    return results;
  }

  purge() {}

  returnGameTransaction(game_id) {
    return this.invites[game_id]?.tx || null;
  }

  returnGame(game_id) {
    return this.invites[game_id] || null;
  }

  isAvailableGame() {
    return false;
  }

  isMyGame(tx) {
    try {
      let msg = tx.returnMessage();
      return (msg.players || []).includes(this.publicKey);
    } catch (err) {
      return false;
    }
  }

  saveOptions() {
    if (!this.app.options.arcade) {
      this.app.options.arcade = {};
    }
    this.app.options.arcade['show-splash'] = this.show_splash;
    this.app.storage.saveOptions();
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

module.exports = Arcade;
