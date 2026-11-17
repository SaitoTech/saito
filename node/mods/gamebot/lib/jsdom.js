const fs = require('fs');
const path = require('path');

const JQUERY_PATH = path.join(
  __dirname,
  '../../../web/saito/lib/jquery/jquery-3.2.1.min.js'
);

function loadJsdom() {
  try {
    return require(/* webpackIgnore: true */ 'jsdom').JSDOM;
  } catch (err) {
    return null;
  }
}

function plain(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function eventStub(el) {
  return {
    currentTarget: el,
    target: el,
    clientX: 0,
    clientY: 0,
    preventDefault() {},
    stopPropagation() {}
  };
}

class GameDom {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.captures = new Map();
    this.sessions = new Map();
    this.limitation =
      'The board shows choices the game has attached. A game that draws its board only on its own page still reports context and those choices here.';
  }

  watch(gameMod) {
    if (!gameMod || gameMod.gamebotDomWatched) {
      return;
    }
    gameMod.gamebotDomWatched = true;
    const capture = this.captureFor(gameMod);

    if (gameMod.hud) {
      const hud = gameMod.hud;
      const updateStatus = hud.updateStatus?.bind(hud);
      const updateMenu = hud.updateMenu?.bind(hud);
      const updateCards = hud.updateCards?.bind(hud);

      if (updateStatus) {
        hud.updateStatus = (status) => {
          capture.status = plain(status);
          try {
            return updateStatus(status);
          } finally {
            this.paint(gameMod);
          }
        };
      }
      if (updateMenu) {
        hud.updateMenu = (options, callback) => {
          capture.menu = Array.isArray(options) ? options : [];
          capture.menuCallback = typeof callback === 'function' ? callback : null;
          try {
            return updateMenu(options, callback);
          } finally {
            this.paint(gameMod);
          }
        };
      }
      if (updateCards) {
        hud.updateCards = (cards, callback) => {
          capture.cards = Array.isArray(cards) ? cards : [];
          if (typeof callback === 'function') {
            capture.cardCallback = callback;
          }
          try {
            return updateCards(cards, callback);
          } finally {
            this.paint(gameMod);
          }
        };
      }
    }

    if (gameMod.cardbox?.bindCallback) {
      const cardbox = gameMod.cardbox;
      const bindCallback = cardbox.bindCallback.bind(cardbox);
      cardbox.bindCallback = (callback) => {
        capture.cardCallback = typeof callback === 'function' ? callback : null;
        this.paint(gameMod);
        return bindCallback(callback);
      };
    }
  }

  captureFor(gameMod) {
    const key = gameMod.name || gameMod.slug;
    if (!this.captures.has(key)) {
      this.captures.set(key, {
        status: '',
        menu: [],
        menuCallback: null,
        cards: [],
        cardCallback: null
      });
    }
    return this.captures.get(key);
  }

  sessionFor(gameMod) {
    return this.sessions.get(gameMod?.name || gameMod?.slug) || null;
  }

  mount(gameMod, container) {
    this.watch(gameMod);
    const key = gameMod.name || gameMod.slug;
    const existing = this.sessions.get(key);
    if (existing?.document) {
      this.paint(gameMod);
      return existing;
    }

    const session = this.createSession(container);
    this.sessions.set(key, session);
    this.paint(gameMod);
    return session;
  }

  createSession(container) {
    const JSDOM = loadJsdom();
    if (JSDOM && (typeof window === 'undefined' || !container)) {
      const dom = new JSDOM(
        '<!DOCTYPE html><html><body><div id="gamebot-dom"></div></body></html>',
        { runScripts: 'outside-only', url: 'https://gamebot.invalid/' }
      );
      const view = dom.window;
      this.installJquery(view);
      return { dom, window: view, document: view.document, $: view.$ || null, frame: null };
    }

    if (!container || typeof container.ownerDocument === 'undefined') {
      throw new Error('GameBot has no document for this game');
    }

    const frame = container.ownerDocument.createElement('iframe');
    frame.className = 'gamebot-board-frame';
    frame.setAttribute('title', 'Game board');
    container.replaceChildren(frame);
    const view = frame.contentWindow;
    const document = frame.contentDocument;
    document.open();
    document.write('<!DOCTYPE html><html><head></head><body><div id="gamebot-dom"></div></body></html>');
    document.close();
    this.installJquery(view);
    return { dom: null, window: view, document, $: view.$ || null, frame };
  }

  installJquery(view) {
    if (!view || view.$) {
      return;
    }
    let source = '';
    try {
      source = fs.readFileSync(JQUERY_PATH, 'utf8');
    } catch (err) {
      source = '';
    }
    if (!source) {
      return;
    }
    try {
      view.eval(source);
    } catch (err) {
      return;
    }
  }

  paint(gameMod) {
    const session = this.sessionFor(gameMod);
    if (!session?.document) {
      return;
    }
    const capture = this.captureFor(gameMod);
    const document = session.document;
    const root = document.getElementById('gamebot-dom');
    if (!root) {
      return;
    }

    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent =
      '#gamebot-dom{font:16px/1.4 sans-serif;padding:12px;color:#222}' +
      '#gamebot-dom button{display:block;margin:8px 0;padding:8px 12px;cursor:pointer}' +
      '#gamebot-dom .gamebot-dom-status{margin-bottom:12px}';
    root.append(style);

    const status = document.createElement('div');
    status.className = 'gamebot-dom-status';
    status.textContent = capture.status || gameMod.game?.status || 'No board is attached yet.';
    root.append(status);

    const menu = document.createElement('div');
    menu.className = 'gamebot-dom-menu';
    for (const item of capture.menu) {
      if (!item?.id) {
        continue;
      }
      const button = document.createElement('button');
      button.className = 'option';
      button.id = item.id;
      button.type = 'button';
      button.dataset.gamebotKind = 'menu';
      button.textContent = plain(item.label || item.id);
      button.onclick = this.owned(async () => {
        await this.execute(gameMod, { kind: 'menu', value: item.id, id: 'menu:' + item.id });
        if (gameMod.game?.id) {
          this.mod.manager.captureContext(gameMod.game.id);
        }
      });
      menu.append(button);
    }
    root.append(menu);

    const cards = document.createElement('div');
    cards.className = 'gamebot-dom-cards';
    for (const card of capture.cards) {
      const button = document.createElement('button');
      button.className = 'card';
      button.id = card;
      button.type = 'button';
      button.dataset.gamebotKind = 'card';
      button.textContent = card;
      button.onclick = this.owned(async () => {
        await this.execute(gameMod, { kind: 'card', value: card, id: 'card:' + card });
        if (gameMod.game?.id) {
          this.mod.manager.captureContext(gameMod.game.id);
        }
      });
      cards.append(button);
    }
    root.append(cards);
  }

  interactions(gameMod) {
    if (!gameMod) {
      return [];
    }
    this.watch(gameMod);
    const capture = this.captureFor(gameMod);
    const listed = [];
    const seen = new Set();
    const add = (item) => {
      if (!item.id || seen.has(item.id)) {
        return;
      }
      seen.add(item.id);
      listed.push(item);
    };

    if (capture.menuCallback) {
      for (const item of capture.menu) {
        if (!item?.id) {
          continue;
        }
        add({
          id: 'menu:' + item.id,
          kind: 'menu',
          value: item.id,
          label: plain(item.label || item.id)
        });
      }
    }
    if (capture.cardCallback) {
      for (const card of capture.cards) {
        add({
          id: 'card:' + card,
          kind: 'card',
          value: card,
          label: card
        });
      }
    }

    const session = this.sessionFor(gameMod);
    const document = session?.document;
    if (document) {
      for (const el of document.querySelectorAll('button, .option, .card, [onclick]')) {
        if (!el.id || !this.foreignHandlers(session, el).length) {
          continue;
        }
        const kind = el.dataset.gamebotKind || (el.classList.contains('card') ? 'card' : 'element');
        add({
          id: kind + ':' + el.id,
          kind,
          value: el.id,
          label: plain(el.textContent || el.id)
        });
      }
    }

    return listed;
  }

  owned(handler) {
    handler.gamebotOwned = true;
    return handler;
  }

  handlers(session, el) {
    const found = [];
    if (typeof el.onclick === 'function') {
      found.push(el.onclick);
    }
    const $ = session?.$;
    if ($ && typeof $._data === 'function') {
      const events = $._data(el, 'events');
      const bound = events?.click || events?.mouseup || [];
      for (const item of bound) {
        if (typeof item.handler === 'function') {
          found.push(item.handler);
        }
      }
    }
    return found;
  }

  foreignHandlers(session, el) {
    return this.handlers(session, el).filter((handler) => !handler.gamebotOwned);
  }

  async execute(gameMod, interaction) {
    const capture = this.captureFor(gameMod);
    let result;
    if (interaction.kind === 'menu' && capture.menuCallback) {
      result = capture.menuCallback(interaction.value);
    } else if (interaction.kind === 'card' && capture.cardCallback) {
      result = capture.cardCallback(interaction.value);
    } else {
      const session = this.sessionFor(gameMod);
      const el = session?.document?.getElementById(interaction.value);
      const queue = el ? this.foreignHandlers(session, el) : [];
      if (!queue.length) {
        throw new Error('That interaction is no longer available');
      }
      for (const handler of queue) {
        result = handler.call(el, eventStub(el));
      }
    }
    if (result && typeof result.then === 'function') {
      await result;
    }
    return result;
  }
}

module.exports = GameDom;
