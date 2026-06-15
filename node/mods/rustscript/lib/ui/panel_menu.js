const panelMenuMarkup = require('./panel_menu.template');

let openMenu = null;

class PanelMenu {
  static markup(menuId) {
    return panelMenuMarkup(menuId);
  }

  /** Script editor panels — JSON display or interactive editing (header always visible). */
  static shouldShowForScriptPanel() {
    return true;
  }

  /**
   * Witness/status panel — hide menu on passive guidance and summary states.
   * Menus belong on actionable JSON/editing surfaces only.
   */
  static shouldShowForWitnessPanel(phase) {
    const passivePhases = ['script-help', 'required-help', 'script-ready', 'required-complete'];
    return !passivePhases.includes(phase);
  }

  static attach(root, { menuId, onAction }) {
    if (!root) {
      return;
    }

    const menuRoot = root.querySelector(`[data-rs-panel-menu="${menuId}"]`);
    if (!menuRoot || menuRoot.dataset.rsPanelMenuBound === '1') {
      return;
    }
    menuRoot.dataset.rsPanelMenuBound = '1';

    const trigger = menuRoot.querySelector('.rs-panel-menu-trigger');
    const dropdown = menuRoot.querySelector('.rs-panel-menu-dropdown');
    if (!trigger || !dropdown) {
      return;
    }

    const close = () => {
      dropdown.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (openMenu === menuRoot) {
        openMenu = null;
      }
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };

    const onDocClick = (event) => {
      if (!menuRoot.contains(event.target)) {
        close();
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        close();
        trigger.focus();
      }
    };

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = dropdown.hidden;
      if (openMenu && openMenu !== menuRoot) {
        PanelMenu.closeOpen();
      }
      if (willOpen) {
        dropdown.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        openMenu = menuRoot;
        document.addEventListener('click', onDocClick, true);
        document.addEventListener('keydown', onKeyDown, true);
      } else {
        close();
      }
    });

    dropdown.querySelectorAll('[data-action]').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        const action = item.dataset.action;
        close();
        if (typeof onAction === 'function') {
          onAction(action);
        }
      });
    });
  }

  static closeOpen() {
    if (!openMenu) {
      return;
    }
    const trigger = openMenu.querySelector('.rs-panel-menu-trigger');
    const dropdown = openMenu.querySelector('.rs-panel-menu-dropdown');
    if (dropdown) {
      dropdown.hidden = true;
    }
    trigger?.setAttribute('aria-expanded', 'false');
    openMenu = null;
  }
}

module.exports = PanelMenu;
