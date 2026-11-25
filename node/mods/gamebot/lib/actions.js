// Automatic UI actions. Each handler returns the ordered DOM interactions to
// run, or an empty array when the decision stays with the AI. A control that
// is still present on the following observation is not returned again.
//
// These shortcuts replace AI deliberation. A single menu entry is one of them.
// An empty menu halts the AI until another move arrives.

class Actions {
  constructor(manager) {
    this.manager = manager;
    this.overlay = null;
    this.single = null;
  }

  // The menu has already been limited to a visible overlay. One dismiss
  // control, the close box or the backdrop when nothing else can be clicked,
  // is how the game continues. It is not asked of the AI again while it remains.
  async handleInformationalOverlay(context) {
    const jsdom = this.manager.mod.jsdom;
    const items = Array.isArray(context?.menu) ? context.menu : [];
    if (items.length !== 1 || !items[0]?.identifier) {
      this.overlay = null;
      return [];
    }
    const identifier = String(items[0].identifier).trim();
    const el = identifier ? jsdom.elementFromIdentifier(identifier) : null;
    const dismiss =
      el?.classList?.contains('saito-overlay-closebox') ||
      el?.classList?.contains('saito-overlay-backdrop') ||
      el?.classList?.contains('saito-overlay');
    if (!identifier || !dismiss) {
      this.overlay = null;
      return [];
    }
    if (this.overlay === identifier) {
      return [];
    }
    if (!jsdom.listed.some((item) => item.identifier === identifier)) {
      jsdom.listed.push({
        identifier,
        text: jsdom.elementText(el),
        tag: el.tagName.toLowerCase(),
        element: el
      });
    }
    this.overlay = identifier;
    return [identifier];
  }

  // One menu entry is the move. It is clicked whatever control it is.
  // The same entry is not clicked again on the next observation while it
  // remains, so a click that does not change the menu does not loop.
  async handleSingleMenuOption(context) {
    if (context?.decision === 'strategic_move') {
      return [];
    }
    const menu = context?.menu;
    const items = Array.isArray(menu) ? menu : [];
    if (items.length !== 1 || !items[0]?.identifier) {
      this.single = null;
      return [];
    }
    const identifier = String(items[0].identifier).trim();
    if (!identifier) {
      this.single = null;
      return [];
    }
    if (this.single === identifier || this.overlay === identifier) {
      return [];
    }
    this.single = identifier;
    return [identifier];
  }

  // No menu entry means there is nothing to ask. The context window says the
  // AI is halted, and the examination does not request a response.
  handleEmptyMenu(context) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      return false;
    }
    const menu = context.menu;
    if (Array.isArray(menu) && menu.length > 0) {
      return false;
    }
    context.instructions = 'The AI is halted until another move is received.';
    return true;
  }
}

module.exports = Actions;
