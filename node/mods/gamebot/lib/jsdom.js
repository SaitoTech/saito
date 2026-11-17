class GameDom {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.listed = [];
  }

  get_clickable_items() {
    const root = this.game_document();
    if (!root?.querySelectorAll) {
      this.listed = [];
      return [];
    }

    const found = [];
    const nodes = root.querySelectorAll('*');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!this.is_clickable(el)) {
        continue;
      }
      const text = String(el.innerText || el.textContent || el.value || '')
        .replace(/\s+/g, ' ')
        .trim();
      const around = String(el.parentElement?.innerText || el.parentElement?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
      found.push({
        identifier: this.element_path(el),
        text,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute?.('type') || '',
        role: el.getAttribute?.('role') || '',
        name: el.getAttribute?.('name') || el.getAttribute?.('aria-label') || '',
        classes: el.classList ? Array.from(el.classList) : [],
        disabled: el.disabled === true,
        context: around,
        element: el
      });
    }

    this.listed = found;
    return found.map((item) => {
      return {
        identifier: item.identifier,
        text: item.text,
        tag: item.tag,
        type: item.type,
        role: item.role,
        name: item.name,
        classes: item.classes,
        disabled: item.disabled,
        context: item.context
      };
    });
  }

  async execute_click(identifier) {
    const wanted = String(identifier || '').trim();
    if (!wanted) {
      throw new Error('Choose a listed control');
    }
    const previous = this.listed.find((item) => item.identifier === wanted);
    if (!previous) {
      throw new Error('That control is not in the current list. Examine the game again.');
    }

    const current_items = [];
    const root = this.game_document();
    const nodes = root?.querySelectorAll ? root.querySelectorAll('*') : [];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!this.is_clickable(el)) {
        continue;
      }
      current_items.push({
        identifier: this.element_path(el),
        text: String(el.innerText || el.textContent || el.value || '')
          .replace(/\s+/g, ' ')
          .trim(),
        tag: el.tagName.toLowerCase(),
        element: el
      });
    }
    const current = current_items.find((item) => item.identifier === wanted);
    if (!current || current.tag !== previous.tag || current.text !== previous.text) {
      throw new Error('That control changed since it was listed');
    }
    current.element.click();
    this.listed = [];
    return wanted;
  }

  game_document() {
    const game_mod = this.mod.manager?.active_game_mod;
    if (game_mod?.jsdom?.window?.document) {
      return game_mod.jsdom.window.document;
    }
    if (typeof document !== 'undefined') {
      const frame = document.querySelector('iframe.gamebot-game-frame');
      if (frame?.contentDocument?.body) {
        return frame.contentDocument;
      }
    }
    return null;
  }

  is_clickable(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (!tag || tag === 'script' || tag === 'style' || tag === 'html' || tag === 'head' || tag === 'body') {
      return false;
    }
    if (tag === 'button' || tag === 'a' || tag === 'select' || tag === 'textarea' || tag === 'label' || tag === 'summary') {
      return true;
    }
    if (tag === 'input') {
      return el.getAttribute('type') !== 'hidden';
    }
    const role = el.getAttribute?.('role') || '';
    if (role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab' || role === 'checkbox' || role === 'option') {
      return true;
    }
    if (el.getAttribute?.('onclick') || typeof el.onclick === 'function') {
      return true;
    }
    const symbols = Object.getOwnPropertySymbols(el);
    for (const symbol of symbols) {
      const impl = el[symbol];
      if (impl?._eventListeners?.click?.length) {
        return true;
      }
    }
    return false;
  }

  element_path(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(part + '#' + node.id);
        break;
      }
      const parent = node.parentElement;
      if (!parent) {
        parts.unshift(part);
        break;
      }
      const same = [];
      for (const child of parent.children) {
        if (child.tagName === node.tagName) {
          same.push(child);
        }
      }
      if (same.length > 1) {
        part += ':nth(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join('>');
  }
}

module.exports = GameDom;
