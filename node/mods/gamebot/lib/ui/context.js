const ContextTemplate = require('./context.template');
const jsonTree = require('json-tree-viewer');

class Context {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.attached = false;
  }

  // The game replaces document.body. The inspector stays on the document
  // element, above the game layers and below Saito alerts.
  render() {
    let host = document.getElementById('gamebot-inspector-root');
    const created = !host;
    if (!host) {
      host = document.createElement('div');
      host.id = 'gamebot-inspector-root';
      host.innerHTML = ContextTemplate();
    }
    document.documentElement.appendChild(host);
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '100000000';
    host.style.pointerEvents = 'none';
    if (created) {
      this.attachEvents();
    }
    this.update();
    return created;
  }

  attachEvents() {
    if (this.attached) {
      return;
    }
    this.attached = true;
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
        if (!clipboard?.writeText) {
          return;
        }
        await clipboard.writeText(text);
        copy.classList.add('gamebot-copied');
        copy.setAttribute('aria-label', 'Copied');
        clearTimeout(this.copy_timer);
        this.copy_timer = setTimeout(() => {
          copy.classList.remove('gamebot-copied');
          copy.setAttribute('aria-label', 'Copy');
        }, 1200);
      };
    }
    this.mod.manager.on_context = () => {
      this.update();
    };
    const click = document.querySelector('.gamebot-click');
    if (click) {
      click.onsubmit = async (event) => {
        event.preventDefault();
        const field = click.querySelector('[name="identifier"]');
        const result = click.querySelector('.gamebot-click-result');
        const identifier = String(field?.value || '').trim();
        try {
          await this.mod.manager.handleResponse(this.gameId(), identifier);
          if (field) {
            field.value = '';
          }
          if (result) {
            const move = this.mod.manager?.last_move || identifier || '';
            result.textContent = move ? 'last move: ' + move : 'last move:';
          }
        } catch (err) {
          if (result) {
            result.textContent = err.message || 'That item could not be clicked';
          }
        }
      };
    }
  }

  gameId() {
    const raw = String(window.location.hash || '').replace(/^#/, '');
    return new URLSearchParams(raw).get('gid') || this.mod.manager.view?.game_id || '';
  }

  update(context) {
    const view = this.mod.manager.view;
    if (typeof document === 'undefined' || !document.querySelector) {
      return;
    }
    const host = document.querySelector('.gamebot-tree');
    const tab = document.querySelector('.gamebot-inspector-tab');
    if (context === undefined) {
      if (!view) {
        if (tab) {
          tab.classList.remove('gamebot-needs-move');
        }
        return;
      }
      if (view.context_error) {
        if (tab) {
          tab.classList.remove('gamebot-needs-move');
        }
        if (host) {
          host.innerHTML = '';
          host.textContent = view.context_error;
        }
        return;
      }
      context = view.context;
    }

    // Yellow with black text when a menu is waiting for a choice. Black with
    // yellow text while the AI is halted and another move has to arrive first.
    if (tab) {
      const menu = context?.menu;
      tab.classList.toggle('gamebot-needs-move', Array.isArray(menu) && menu.length > 0);
    }
    const result = document.querySelector('.gamebot-click-result');
    if (result) {
      const move = this.mod.manager?.last_move || '';
      result.textContent = move ? 'last move: ' + move : 'last move:';
    }
    if (!host) {
      return;
    }
    host.innerHTML = '';
    if (!context) {
      return;
    }
    try {
      jsonTree.create(context, host);
    } catch (err) {
      host.textContent = err.message || 'The context could not be displayed';
    }
  }
}

module.exports = Context;
