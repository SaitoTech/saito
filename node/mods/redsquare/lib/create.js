const CreateTemplate = require('./create.template');

/**
 * Sidebar Create — RedSquare's primary post action plus publishing actions
 * supplied by other modules.
 *
 * Extension:
 *   - `registerAction({ id, label, icon?, image?, onClick })` before/after render
 *   - modules may `respondTo('redsquare-create')` with
 *     `{ id, label, icon?, image?, callback(app, mod) }`
 */
class Create {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this._extra_actions = [];
  }

  /**
   * Ordered create actions. RedSquare is always first; module extras follow.
   */
  getActions() {
    const actions = [
      {
        id: 'post',
        label: 'New Tweet',
        image: '/saito/icons/saito-redsquare-icon-solid.svg',
        onClick: () => this.openPost()
      }
    ];

    const seen = new Set(actions.map((a) => a.id));
    const labelOverrides = {
      'stack-publish': 'New Article',
      'vault-share': 'Share File'
    };

    for (const action of this._extra_actions) {
      if (!action?.id || !action?.label || seen.has(action.id)) {
        continue;
      }
      seen.add(action.id);
      actions.push({
        ...action,
        label: labelOverrides[action.id] || action.label
      });
    }

    const peers = this.app.modules?.getRespondTos?.('redsquare-create') || [];
    for (const item of peers) {
      if (!item?.id || !item?.label || seen.has(item.id)) {
        continue;
      }
      const peer =
        this.app.modules?.returnModuleByName?.(item.modname) ||
        this.app.modules?.returnModule?.(item.modname);

      seen.add(item.id);
      actions.push({
        id: item.id,
        label: labelOverrides[item.id] || item.label,
        icon: item.icon || peer?.icon_fa || peer?.icon || 'fa-solid fa-plus',
        image: item.image,
        onClick: () => item.callback?.(this.app, this.mod)
      });
    }

    return actions;
  }

  /**
   * Register an additional create action (e.g. from a peer module at init).
   */
  registerAction(action = {}) {
    if (!action.id || !action.label) {
      return;
    }

    this._extra_actions = this._extra_actions.filter((a) => a.id !== action.id);
    this._extra_actions.push(action);

    if (document.querySelector(this.container)) {
      this.render();
    }
  }

  openPost() {
    this.mod.compose_overlay?.open();
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    if (!document.querySelector(this.container)) {
      return;
    }

    this.app.browser.replaceElementContentBySelector(CreateTemplate(this), this.container);
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(this.container);

    if (!root || root.dataset.createBound === '1') {
      return;
    }

    root.dataset.createBound = '1';

    root.addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-create-toggle]');

      if (toggle && root.contains(toggle)) {
        e.preventDefault();
        this.toggleMenu();
        return;
      }

      const btn = e.target.closest('[data-create]');

      if (!btn || !root.contains(btn)) {
        return;
      }

      e.preventDefault();

      const id = btn.getAttribute('data-create');
      const action = this.getActions().find((a) => a.id === id);

      this.closeMenu();
      action?.onClick?.();
    });

    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeMenu(true);
      }
    });

    root.addEventListener('focusout', (e) => {
      if (!root.contains(e.relatedTarget)) {
        this.closeMenu();
      }
    });
  }

  toggleMenu() {
    const root = document.querySelector(this.container);
    const toggle = root?.querySelector('[data-create-toggle]');
    const menu = root?.querySelector('[data-create-menu]');

    if (!toggle || !menu) {
      return;
    }

    const open = menu.hidden;
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));

    if (open) {
      menu.querySelector('[data-create]')?.focus();
    }
  }

  closeMenu(restoreFocus = false) {
    const root = document.querySelector(this.container);
    const toggle = root?.querySelector('[data-create-toggle]');
    const menu = root?.querySelector('[data-create-menu]');

    if (!toggle || !menu || menu.hidden) {
      return;
    }

    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');

    if (restoreFocus) {
      toggle.focus();
    }
  }
}

module.exports = Create;
