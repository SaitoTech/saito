const GameTemplate = require('./game.template');
const jsonTree = require('json-tree-viewer');

class GamePage {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.mounted = false;
  }

  async render() {
    await this.mount();
  }

  async mount() {
    this.mod.manager.remove_loading_veil?.();
    const created = this.place_inspector();
    if (created) {
      this.mounted = true;
      this.attachEvents();
    }
    this.draw();
  }

  // The game replaces document.body and paints positioned layers, including
  // the clock at z-index 900000 and the observer bar at 99999999. A panel
  // inside body participates in that same order. Keep the inspector on the
  // document element, above those layers and below Saito alerts.
  place_inspector() {
    let host = document.getElementById('gamebot-inspector-root');
    const created = !host;
    if (!host) {
      host = document.createElement('div');
      host.id = 'gamebot-inspector-root';
      host.innerHTML = GameTemplate();
    }
    document.documentElement.appendChild(host);
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '100000000';
    host.style.pointerEvents = 'none';
    return created;
  }

  game_id() {
    const raw = String(window.location.hash || '').replace(/^#/, '');
    return new URLSearchParams(raw).get('gid') || this.mod.manager.view?.game_id || '';
  }

  attachEvents() {
    const toggle = () => {
      const host = document.getElementById('gamebot-inspector-root');
      const open = host ? host.classList.toggle('gamebot-inspector-open') : false;
      const tab = document.querySelector('.gamebot-inspector-tab');
      const panel = document.getElementById('gamebot-inspector');
      if (tab) {
        tab.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      if (panel) {
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      }
    };
    const tab = document.querySelector('.gamebot-inspector-tab');
    if (tab) {
      tab.onclick = toggle;
    }
    const copy = document.querySelector('.gamebot-inspector-copy');
    if (copy) {
      copy.onclick = async () => {
        const text = JSON.stringify(this.mod.manager.view?.context ?? null, null, 2);
        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;
        if (clipboard?.writeText) {
          await clipboard.writeText(text);
        }
      };
    }

    this.mod.manager.on_context = () => {
      this.draw();
    };

    const click = document.querySelector('.gamebot-click');
    if (click) {
      click.onsubmit = async (event) => {
        event.preventDefault();
        const field = click.querySelector('[name="identifier"]');
        const result = click.querySelector('.gamebot-click-result');
        const identifier = String(field?.value || '').trim();
        try {
          await this.mod.manager.execute_clickable_item(this.game_id(), identifier);
          if (result) {
            result.textContent = identifier;
          }
        } catch (err) {
          if (result) {
            result.textContent = err.message || 'That item could not be clicked';
          }
        }
      };
    }
  }

  draw() {
    const view = this.mod.manager.view;
    const host = document.querySelector('.gamebot-tree');
    if (!host || !view) {
      return;
    }
    host.innerHTML = '';
    if (view.context_error) {
      host.textContent = view.context_error;
      return;
    }
    if (!view.context) {
      return;
    }
    try {
      jsonTree.create(view.context, host);
    } catch (err) {
      host.textContent = err.message || 'The context could not be displayed';
    }
  }
}

module.exports = GamePage;
