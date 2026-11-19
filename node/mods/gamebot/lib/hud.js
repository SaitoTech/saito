const GameHUD2 = require('../../../lib/saito/ui/game-hud2/game-hud2');

let jsdom = null;

function use(dom) {
  jsdom = dom;
}

function install() {
  if (GameHUD2.prototype.returnContext.__gamebot) {
    return;
  }
  const original = GameHUD2.prototype.returnContext;
  function returnContext() {
    const reported = original.call(this);
    if (!jsdom || !reported || typeof reported !== 'object' || Array.isArray(reported)) {
      return reported;
    }
    if (Array.isArray(reported.menu) && reported.menu.length > 0) {
      return reported;
    }
    const root = this.mod?.jsdom?.window?.document || (typeof document !== 'undefined' ? document : null);
    const options = cardboxMenuActions(root);
    if (options && options.length > 0) {
      reported.menu = options;
    }
    return reported;
  }
  returnContext.__gamebot = true;
  GameHUD2.prototype.returnContext = returnContext;
}

function cardboxMenuActive(dom) {
  if (!dom?.gameDocument) {
    return false;
  }
  return visibleCardboxMenus(dom, dom.gameDocument()).length > 0;
}

function visibleCardboxMenus(dom, root) {
  if (!root?.querySelectorAll || !dom) {
    return [];
  }
  const menus = [];
  const boxes = root.querySelectorAll('#game-cardbox, .game-cardbox');
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (!dom.isShown(box)) {
      continue;
    }
    const found = box.querySelectorAll('#cardbox-menu, .cardbox-menu');
    for (let n = 0; n < found.length; n++) {
      if (dom.isShown(found[n])) {
        menus.push(found[n]);
      }
    }
  }
  return menus;
}

function cardboxMenuActions(root) {
  if (!jsdom) {
    return null;
  }
  const menus = visibleCardboxMenus(jsdom, root);
  if (!menus.length) {
    return null;
  }
  const clickable = [];
  for (let i = 0; i < menus.length; i++) {
    const menu = menus[i];
    if (menuControl(menu)) {
      clickable.push(menu);
    }
    const nodes = menu.querySelectorAll('*');
    for (let n = 0; n < nodes.length; n++) {
      if (menuControl(nodes[n])) {
        clickable.push(nodes[n]);
      }
    }
  }
  const leaves = clickable.filter((el) => !clickable.some((other) => other !== el && el.contains(other)));
  const actions = [];
  const found = [];
  const seen = {};
  for (let i = 0; i < leaves.length; i++) {
    const el = leaves[i];
    const text = String(el.innerText || el.textContent || el.value || '')
      .replace(/\s+/g, ' ')
      .trim();
    const identifier = jsdom.elementPath(el);
    if (!identifier || seen[identifier]) {
      continue;
    }
    seen[identifier] = true;
    const label = text || el.getAttribute?.('aria-label') || el.id || identifier;
    found.push({
      identifier,
      text,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute?.('type') || '',
      role: el.getAttribute?.('role') || '',
      name: el.getAttribute?.('name') || el.getAttribute?.('aria-label') || '',
      classes: el.classList ? Array.from(el.classList) : [],
      disabled: false,
      context: '',
      element: el
    });
    actions.push({
      id: el.id || identifier,
      label,
      identifier
    });
  }
  jsdom.listed = found;
  return actions;
}

function menuControl(el) {
  if (!jsdom.isClickable(el) || el.disabled === true || jsdom.previewOnly(el)) {
    return false;
  }
  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'label') {
    return false;
  }
  return el.closest?.('#cardbox-exit, .cardbox-exit, #cardbox-exit-background, .cardbox-exit-background') == null;
}

module.exports = {
  use,
  install,
  cardboxMenuActive
};
