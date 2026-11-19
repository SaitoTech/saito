const { cardboxMenuActive } = require('./hud');

// Automatic UI actions. Each handler returns the ordered DOM interactions to
// run, or an empty array when the decision stays with the AI. A control that
// is still present on the following observation is not returned again.
//
// These shortcuts replace AI deliberation. They do not click the board.

class Actions {
  constructor(manager) {
    this.manager = manager;
    this.overlay = null;
    this.single = null;
  }

  // A shown Saito overlay whose only control is its close box. The scoring
  // result is this shape: the player can read it, and the close box is how
  // the game continues. The close box is not part of the normal menu, so it
  // is added to the click list before the click.
  async handleInformationalOverlay(context) {
    const jsdom = this.manager.mod.jsdom;
    const root = jsdom.gameDocument();
    let close = null;
    if (root?.querySelectorAll) {
      const overlays = root.querySelectorAll('.saito-overlay');
      for (let i = 0; i < overlays.length && !close; i++) {
        const overlay = overlays[i];
        if (!jsdom.isShown(overlay)) {
          continue;
        }
        const closes = overlay.querySelectorAll('.saito-overlay-closebox');
        let box = null;
        for (let c = 0; c < closes.length; c++) {
          if (jsdom.isShown(closes[c])) {
            box = closes[c];
            break;
          }
        }
        if (!box) {
          continue;
        }
        const nodes = overlay.querySelectorAll('*');
        let other = false;
        for (let n = 0; n < nodes.length; n++) {
          const el = nodes[n];
          if (el === box || box.contains(el)) {
            continue;
          }
          if (jsdom.isClickable(el)) {
            other = true;
            break;
          }
        }
        if (!other) {
          close = box;
        }
      }
    }
    if (!close) {
      this.overlay = null;
      return [];
    }
    const identifier = jsdom.elementPath(close);
    if (!identifier || this.overlay === identifier) {
      return [];
    }
    if (!jsdom.listed.some((item) => item.identifier === identifier)) {
      jsdom.listed.push({
        identifier,
        text: jsdom.elementText(close),
        tag: close.tagName.toLowerCase(),
        element: close
      });
    }
    this.overlay = identifier;
    return [identifier];
  }

  // One menu entry is unambiguous when it is the engine acknowledge control
  // or the only control in a visible card-box menu. Several options, and a
  // single ordinary board control, stay for the AI.
  async handleSingleMenuOption(context) {
    const menu = context?.menu;
    const items = Array.isArray(menu) ? menu : [];
    if (items.length !== 1 || !items[0]?.identifier) {
      this.single = null;
      return [];
    }
    const identifier = String(items[0].identifier).trim();
    if (!identifier || !this.singleOptionIsDetermined(items[0], identifier)) {
      this.single = null;
      return [];
    }
    if (this.single === identifier) {
      return [];
    }
    this.single = identifier;
    return [identifier];
  }

  singleOptionIsDetermined(item, identifier) {
    if (String(item?.id || '') === 'confirmit') {
      return true;
    }
    const el = this.manager.mod.jsdom.elementFromIdentifier(identifier);
    if (el?.classList?.contains('acknowledge')) {
      return true;
    }
    return cardboxMenuActive(this.manager.mod.jsdom);
  }
}

module.exports = Actions;
