const GameTemplate = require('./game.template');
const Context = require('./context');

// The GameBot screen around a game. The game module still owns and renders
// the board. This component loads the browser pieces that render needs and
// owns the context inspector.
class Game {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.context = new Context(app, mod);
  }

  async render() {
    this.remove_loading_veil();
    this.context.render();
    this.context.attachEvents();
  }

  async present(game_mod, game_id, mode) {
    if (!game_mod || !this.app.BROWSER) {
      return;
    }
    if (typeof game_mod.activateModule === 'function') {
      game_mod.activateModule();
    } else {
      game_mod.browser_active = 1;
    }
    this.set_game_hash(game_id);

    // Saved games are restored only by Manager.loadGame. A game that does not
    // exist yet is created here; that is not a load.
    if (!game_mod.game || game_mod.game.id !== game_id) {
      let existing = mode === 'open';
      if (mode === 'accept' && typeof game_mod.doesGameExistLocally === 'function') {
        existing = await game_mod.doesGameExistLocally(game_id);
      }
      if (existing) {
        await this.mod.manager.loadGame(game_id);
      } else if (mode === 'accept' && typeof game_mod.newGame === 'function') {
        game_mod.game = game_mod.newGame(game_id);
      }
    }

    await this.load_scripts();
    await this.load_styles(game_mod);
    if (game_mod.initialize_game_run != 1 && typeof game_mod.render === 'function') {
      await game_mod.render(this.app);
    }
    this.show_loading_veil();

    // The saved game is already loaded and the board markup is in the document.
    // initializeGameQueue() is the normal startup. Setting initialize_game_run
    // first would make that function return before the queue runs.
    if (
      mode === 'open' &&
      Number(game_mod.game?.initializing) !== 1 &&
      typeof game_mod.initializeGameQueue === 'function'
    ) {
      await game_mod.initializeGameQueue(game_id);
    }
  }

  // The first render can run before the seat number is known. Once the queue
  // has assigned it, rebuild the game chrome without wiping the injected board.
  async refresh_chrome(game_mod) {
    if (!this.app.BROWSER || !game_mod?.game || typeof game_mod.render !== 'function') {
      return;
    }
    if (Number(game_mod.game.player) <= 0 || !game_mod.menu) {
      return;
    }
    if (game_mod.game_template_injected != 1) {
      return;
    }
    game_mod.menu.options = [];
    game_mod.menu.sub_options = [];
    game_mod.menu.icons = [];
    const previous = game_mod.initialize_game_run;
    game_mod.initialize_game_run = 0;
    try {
      await game_mod.render(this.app);
    } finally {
      game_mod.initialize_game_run = previous || 1;
    }
  }

  // Scripts from the game page head. jQuery must exist before a game's
  // initializeGame() runs; Twilight Struggle calls $ there.
  shared_scripts() {
    return [
      '/saito/lib/jquery/jquery-3.2.1.min.js',
      '/saito/lib/jquery/jquery-ui.min.js',
      '/saito/lib/hammer/hammer.min.js'
    ];
  }

  async load_scripts() {
    if (!this.app.BROWSER || typeof document === 'undefined' || !document.head) {
      return [];
    }
    const view = document.defaultView;
    const loads = view && !/jsdom/i.test(view.navigator?.userAgent || '');
    const added = [];
    for (const src of this.shared_scripts()) {
      const present = Array.from(document.scripts).some((script) => {
        return (script.getAttribute('src') || '').includes(src);
      });
      if (present) {
        continue;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      const ready = loads
        ? new Promise((resolve) => {
            script.onload = () => resolve();
            script.onerror = () => resolve();
          })
        : Promise.resolve();
      document.head.appendChild(script);
      await ready;
      added.push(src);
    }
    return added;
  }

  shared_stylesheets(game_mod) {
    const slug = game_mod?.returnSlug?.() || game_mod?.slug || '';
    const sheets = [
      '/saito/lib/jquery/jquery-ui.min.css',
      '/saito/lib/font-awesome-6/css/fontawesome.min.css',
      '/saito/lib/font-awesome-6/css/all.css',
      '/arcade/style.css',
      '/saito/game.css'
    ];
    if (slug) {
      sheets.push('/' + slug + '/style.css');
    }
    const extra = Array.isArray(game_mod?.styles) ? game_mod.styles : [];
    for (const sheet of extra) {
      if (!sheet || String(sheet).includes('/gamebot/')) {
        continue;
      }
      if (!sheets.includes(sheet)) {
        sheets.push(sheet);
      }
    }
    return sheets;
  }

  async load_styles(game_mod) {
    if (!this.app.BROWSER || typeof document === 'undefined' || !document.head || !game_mod) {
      return [];
    }
    const slug = game_mod.returnSlug?.() || game_mod.slug || '';
    if (slug && document.documentElement) {
      document.documentElement.classList.add('game', slug);
    }
    const present = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((el) => el.getAttribute('href') || '');
    const added = [];
    const waits = [];
    for (const href of this.shared_stylesheets(game_mod)) {
      if (present.some((current) => current.includes(href))) {
        continue;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href + '?v=' + (this.app.build_number || '');
      link.setAttribute('data-game-module', slug);
      const view = document.defaultView;
      const loads_styles = view && !/jsdom/i.test(view.navigator?.userAgent || '');
      waits.push(loads_styles
        ? new Promise((resolve) => {
            link.onload = () => resolve();
            link.onerror = () => resolve();
          })
        : Promise.resolve());
      document.head.appendChild(link);
      added.push(href);
      present.push(link.href);
    }
    await Promise.all(waits);
    return added;
  }

  set_game_hash(game_id) {
    if (typeof window === 'undefined' || !window.location || !game_id) {
      return;
    }
    const next = 'gid=' + encodeURIComponent(game_id);
    if (String(window.location.hash || '').replace(/^#/, '') === next) {
      return;
    }
    window.location.hash = next;
  }

  show_loading_veil() {
    if (typeof document === 'undefined' || !document.body || document.getElementById('gamebot-loading')) {
      return;
    }
    document.body.insertAdjacentHTML('beforeend', GameTemplate());
  }

  remove_loading_veil() {
    if (typeof document === 'undefined') {
      return;
    }
    document.getElementById('gamebot-loading')?.remove();
  }
}

module.exports = Game;
