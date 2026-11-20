class GameDom {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.listed = [];
  }

  returnOptions() {
    const root = this.gameDocument();
    if (!root?.querySelectorAll) {
      this.listed = [];
      return [];
    }

    const found = [];
    const nodes = root.querySelectorAll('*');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!this.isClickable(el)) {
        continue;
      }
      if (el.closest?.('.gamebot-inspector, .gamebot-inspector-tab, .gamebot-loading, .gamebot-screen')) {
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
        identifier: this.elementPath(el),
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

  // The operator copies from the context menu. The tree shows JSON strings
  // with quotes, and a menu entry also has an id and a label. Any one of
  // those is the same control.
  normalizeChoice(value) {
    let text = String(value ?? '').trim();
    if (text.endsWith(',')) {
      text = text.slice(0, -1).trim();
    }
    if (text.length >= 2) {
      const open = text[0];
      const close = text[text.length - 1];
      if ((open === '"' && close === '"') || (open === "'" && close === "'")) {
        text = text.slice(1, -1).trim();
      }
    }
    return text;
  }

  currentMenu() {
    const menu = this.mod.manager?.view?.context?.menu;
    return Array.isArray(menu) ? menu : [];
  }

  matchingMenuItem(wanted) {
    const exact = [];
    const labels = [];
    const menu = this.currentMenu();
    for (let i = 0; i < menu.length; i++) {
      const item = menu[i];
      if (!item || typeof item !== 'object') {
        continue;
      }
      const identifier = this.normalizeChoice(item.identifier);
      const id = this.normalizeChoice(item.id);
      const label = this.normalizeChoice(item.label);
      if ((identifier && identifier === wanted) || (id && id === wanted)) {
        exact.push(item);
      } else if (label && label === wanted) {
        labels.push(item);
      }
    }
    if (exact.length > 0) {
      return exact[0];
    }
    if (labels.length === 1) {
      return labels[0];
    }
    return null;
  }

  elementText(el) {
    return String(el?.innerText || el?.textContent || el?.value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  elementFromIdentifier(identifier) {
    const root = this.gameDocument();
    if (!root?.querySelectorAll || !identifier) {
      return null;
    }
    const hash = identifier.indexOf('#');
    const chain = identifier.indexOf('>');
    if (hash > 0 && (chain === -1 || hash < chain) && typeof root.getElementById === 'function') {
      const id = identifier.slice(hash + 1).split('>')[0];
      const by_id = root.getElementById(id);
      if (by_id && this.elementPath(by_id) === identifier) {
        return by_id;
      }
    }
    const nodes = root.querySelectorAll('*');
    for (let i = 0; i < nodes.length; i++) {
      if (this.elementPath(nodes[i]) === identifier) {
        return nodes[i];
      }
    }
    return null;
  }

  async executeClick(identifier) {
    const wanted = this.normalizeChoice(identifier);
    if (!wanted) {
      throw new Error('Choose a listed control');
    }
    const menu_item = this.matchingMenuItem(wanted);
    const target = this.normalizeChoice(menu_item?.identifier) || wanted;
    const previous = this.listed.find((item) => item.identifier === target || item.identifier === wanted);
    if (!previous && !menu_item) {
      throw new Error('That control is not in the current list. Examine the game again.');
    }

    const el = this.elementFromIdentifier(target);
    if (!el) {
      throw new Error('That control changed since it was listed');
    }
    const text = this.elementText(el);
    const tag = el.tagName.toLowerCase();
    if (previous && (previous.tag !== tag || previous.text !== text)) {
      throw new Error('That control changed since it was listed');
    }
    this.dispatchClick(el);
    this.listed = [];
    return target;
  }

  // Synthetic events are not trusted. A browser may ignore the default action
  // of an untrusted click, such as following a link or submitting a form.
  // Listeners still run, including listeners on ancestor elements.
  // mouseup does not cause this DOM to emit click, so click is dispatched once.
  // PointerEvent is not part of every document; pointer actions use mouse
  // events when it is missing. mouseenter and mouseleave do not bubble.
  documentView(el) {
    if (!el || el.nodeType !== 1 || !el.ownerDocument?.defaultView) {
      throw new Error('That element is not in the document');
    }
    return el.ownerDocument.defaultView;
  }

  eventConstructor(view, type) {
    if (type.indexOf('pointer') === 0) {
      return typeof view.PointerEvent === 'function' ? view.PointerEvent : null;
    }
    if (type === 'keydown' || type === 'keyup') {
      return view.KeyboardEvent;
    }
    if (type === 'input' || type === 'change') {
      return view.Event;
    }
    return view.MouseEvent;
  }

  dispatchEvent(el, type, init) {
    const view = this.documentView(el);
    let event_type = type;
    let Ctor = this.eventConstructor(view, type);
    if (type.indexOf('pointer') === 0 && !Ctor) {
      const mouse_type = {
        pointerdown: 'mousedown',
        pointerup: 'mouseup',
        pointermove: 'mousemove',
        pointerover: 'mouseover',
        pointerout: 'mouseout',
        pointerenter: 'mouseenter',
        pointerleave: 'mouseleave'
      };
      event_type = mouse_type[type];
      if (!event_type) {
        throw new Error('This document cannot dispatch a ' + type + ' event');
      }
      Ctor = view.MouseEvent;
    }
    if (typeof Ctor !== 'function') {
      throw new Error('This document cannot dispatch a ' + type + ' event');
    }
    const composed = event_type !== 'mouseenter' && event_type !== 'mouseleave' && event_type !== 'pointerenter' && event_type !== 'pointerleave';
    let event;
    try {
      event = new Ctor(event_type, Object.assign({
        bubbles: composed,
        cancelable: true,
        view,
        clientX: 0,
        clientY: 0,
        button: 0
      }, init || {}));
    } catch (err) {
      throw new Error('This document cannot dispatch a ' + type + ' event');
    }
    el.dispatchEvent(event);
    return event_type;
  }

  dispatchClick(el) {
    this.dispatchEvent(el, 'mousedown');
    this.dispatchEvent(el, 'mouseup');
    this.dispatchEvent(el, 'click');
  }

  pointerDown(el) {
    return this.dispatchEvent(el, 'pointerdown');
  }

  pointerUp(el) {
    return this.dispatchEvent(el, 'pointerup');
  }

  hover(el) {
    this.dispatchEvent(el, 'mouseover');
    this.dispatchEvent(el, 'mouseenter');
  }

  key(el, key) {
    const name = String(key || '');
    if (!name) {
      throw new Error('A key is required');
    }
    this.dispatchEvent(el, 'keydown', { key: name, code: name, bubbles: true });
    this.dispatchEvent(el, 'keyup', { key: name, code: name, bubbles: true });
  }

  inputText(el, value) {
    const tag = el?.tagName ? el.tagName.toLowerCase() : '';
    if (tag !== 'input' && tag !== 'textarea') {
      throw new Error('That element does not accept text');
    }
    el.value = String(value ?? '');
    this.dispatchEvent(el, 'input', { bubbles: true });
    this.dispatchEvent(el, 'change', { bubbles: true });
  }

  selectOption(el, value) {
    if (!el || !el.tagName || el.tagName.toLowerCase() !== 'select') {
      throw new Error('That element is not a select control');
    }
    const wanted = String(value ?? '');
    const options = el.options ? Array.from(el.options) : [];
    if (!options.some((option) => option.value === wanted)) {
      throw new Error('That option is not in the select control');
    }
    el.value = wanted;
    this.dispatchEvent(el, 'input', { bubbles: true });
    this.dispatchEvent(el, 'change', { bubbles: true });
  }

  returnContext(context) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      return context;
    }
    const overlay_menu = this.overlayActions();
    if (overlay_menu) {
      context.menu = overlay_menu;
      return context;
    }
    if (!Array.isArray(context.menu) || context.menu.length === 0) {
      context.menu = this.gameActions();
    }
    return context;
  }

  // A visible Saito overlay covers the board. The menu is the controls inside
  // it. The overlay shell and the backdrop are ways to dismiss it, so they are
  // omitted while a real control, including the close box, is available.
  overlayActions() {
    const root = this.gameDocument();
    if (!root?.querySelectorAll) {
      return null;
    }
    const overlays = [];
    const found_overlays = root.querySelectorAll('.saito-overlay');
    for (let i = 0; i < found_overlays.length; i++) {
      const overlay = found_overlays[i];
      if (overlay.classList?.contains('saito-overlay-backdrop')) {
        continue;
      }
      if (this.isShown(overlay)) {
        overlays.push(overlay);
      }
    }
    if (!overlays.length) {
      return null;
    }
    const controls = [];
    const seen = {};
    for (let i = 0; i < overlays.length; i++) {
      const overlay = overlays[i];
      const closes = overlay.querySelectorAll('.saito-overlay-closebox');
      for (let c = 0; c < closes.length; c++) {
        if (this.hasInteraction(closes[c])) {
          controls.push(closes[c]);
        }
      }
      const nodes = overlay.querySelectorAll('*');
      for (let n = 0; n < nodes.length; n++) {
        const el = nodes[n];
        if (el.classList?.contains('saito-overlay-closebox') || el.closest?.('.saito-overlay-closebox')) {
          continue;
        }
        if (!this.isShown(el) || !this.hasInteraction(el) || this.previewOnly(el)) {
          continue;
        }
        controls.push(el);
      }
    }
    const leaves = controls.filter((el) => !controls.some((other) => other !== el && el.contains(other)));
    const chosen = [];
    for (let i = 0; i < leaves.length; i++) {
      const identifier = this.elementPath(leaves[i]);
      if (identifier && !seen[identifier]) {
        seen[identifier] = true;
        chosen.push(leaves[i]);
      }
    }
    if (!chosen.length) {
      const backs = root.querySelectorAll('.saito-overlay-backdrop');
      for (let i = 0; i < backs.length; i++) {
        if (this.isShown(backs[i]) && this.hasInteraction(backs[i])) {
          chosen.push(backs[i]);
          break;
        }
      }
    }
    if (!chosen.length) {
      for (let i = 0; i < overlays.length; i++) {
        if (this.hasInteraction(overlays[i])) {
          chosen.push(overlays[i]);
          break;
        }
      }
    }
    const actions = [];
    const found = [];
    for (let i = 0; i < chosen.length; i++) {
      const el = chosen[i];
      const text = String(el.innerText || el.textContent || el.value || '')
        .replace(/\s+/g, ' ')
        .trim();
      const identifier = this.elementPath(el);
      if (!identifier) {
        continue;
      }
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
    this.listed = found;
    return actions;
  }

  gameActions() {
    const incidental = {
      game: true,
      info: true,
      chat: true,
      difficulty: true,
      settings: true,
      menu: true,
      help: true,
      observer: true,
      log: true,
      rules: true
    };
    const chrome = [
      '#saito-header',
      '.game-menu',
      '.gamebot-inspector',
      '.gamebot-inspector-tab',
      '.game-observer-hud',
      '#game_board_sizer',
      '.game_board_sizer',
      '.game-board-sizer-step',
      '.game-board-sizer-center',
      '.hud-back-button',
      '#cardbox-exit',
      '.cardbox-exit',
      '#cardbox-exit-background',
      '.cardbox-exit-background',
      '.saito-header-hamburger-contents',
      '#log-wrapper',
      '#log',
      '#mobile-log-tab',
      '.mobile-log-tab',
      '.game-minimap',
      '.saito-overlay-closebox',
      '#game-menu-close',
      '#game-menu-toggle',
      '.saito-cta-loader-shell',
      '#game-help',
      '.hud-notice'
    ].join(', ');
    const actions = [];
    const seen = {};
    const found = [];
    const root = this.gameDocument();
    const nodes = root?.querySelectorAll ? root.querySelectorAll('*') : [];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!this.isClickable(el) || el.disabled === true || this.previewOnly(el)) {
        continue;
      }
      if (this.isGameBoard(el) || el.closest?.(chrome)) {
        continue;
      }
      const tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'label') {
        continue;
      }
      const text = String(el.innerText || el.textContent || el.value || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (incidental[text.toLowerCase()]) {
        continue;
      }
      const identifier = this.elementPath(el);
      if (!identifier || seen[identifier]) {
        continue;
      }
      seen[identifier] = true;
      const label = text || el.getAttribute?.('aria-label') || el.id || identifier;
      found.push({
        identifier,
        text,
        tag,
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
    this.listed = found;
    this.recordActionTrace(nodes, actions);
    return actions;
  }

  // Shown in the document. Geometry and pointer-events are left to the
  // clickable-control check so a container can hold a visible menu.
  isShown(el) {
    if (!el || el.nodeType !== 1) {
      return false;
    }
    const view = el.ownerDocument?.defaultView;
    if (!view || el.isConnected === false) {
      return false;
    }
    let node = el;
    while (node && node.nodeType === 1) {
      if (node.hidden === true || node.hasAttribute?.('hidden')) {
        return false;
      }
      if (node.getAttribute?.('aria-hidden') === 'true') {
        return false;
      }
      if (node.inert === true || node.hasAttribute?.('inert')) {
        return false;
      }
      const style = this.computedStyle(view, node);
      if (style && style.display === 'none') {
        return false;
      }
      if (this.fullyTransparent(style)) {
        return false;
      }
      node = node.parentElement;
    }
    const own = this.computedStyle(view, el);
    return !(own && (own.visibility === 'hidden' || own.visibility === 'collapse'));
  }

  // Temporary discovery trace. It records why a visible control was left out of
  // the menu, including a disabled button that is still painted.
  recordActionTrace(nodes, actions) {
    if (!this.trace_actions) {
      return;
    }
    const rows = [];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const text = String(el.innerText || el.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
      const action = el.getAttribute?.('data-do') || '';
      const tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (tag !== 'button' && !action && !/finish attacking/i.test(text)) {
        continue;
      }
      rows.push(this.describeCandidate(el, text));
    }
    this.action_trace = rows;
    const finish = rows.filter((row) => row.action === 'end_attack' || /finish attacking/i.test(row.text));
    const excluded = {};
    for (let i = 0; i < rows.length; i++) {
      const reason = rows[i].excluded_by || 'included';
      excluded[reason] = (excluded[reason] || 0) + 1;
    }
    if (typeof console !== 'undefined' && console.info) {
      console.info('[gamebot] menu discovery', {
        menu: actions.map((item) => item.label),
        counts: excluded,
        finish
      });
    }
  }

  describeCandidate(el, text) {
    const view = el.ownerDocument?.defaultView;
    const style = this.computedStyle(view, el);
    const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    const box = rect ? { width: rect.width, height: rect.height, top: rect.top, left: rect.left } : null;
    return {
      tag: el.tagName ? el.tagName.toLowerCase() : '',
      text: text || '',
      action: el.getAttribute?.('data-do') || '',
      identifier: this.elementPath(el),
      disabled: el.disabled === true,
      disabled_attribute: el.hasAttribute?.('disabled') === true,
      display: style?.display || '',
      visibility: style?.visibility || '',
      opacity: style?.opacity || '',
      pointer_events: style?.pointerEvents || '',
      box,
      hasInteraction: this.hasInteraction(el),
      passes_visibility: this.isInteractable(el),
      own_listener: typeof el.onclick === 'function' || !!el.getAttribute?.('onclick'),
      delegated: true,
      excluded_by: this.exclusionReason(el, text)
    };
  }

  exclusionReason(el, text) {
    if (!this.hasInteraction(el)) {
      return 'hasInteraction';
    }
    const unavailable = this.interactableFailure(el);
    if (unavailable) {
      return unavailable;
    }
    if (el.disabled === true) {
      return 'gameActions.disabled';
    }
    if (this.previewOnly(el)) {
      return 'previewOnly';
    }
    const chrome = [
      '#saito-header',
      '.game-menu',
      '.gamebot-inspector',
      '.gamebot-inspector-tab',
      '.game-observer-hud',
      '#game_board_sizer',
      '.game_board_sizer',
      '.game-board-sizer-step',
      '.game-board-sizer-center',
      '.hud-back-button',
      '#cardbox-exit',
      '.cardbox-exit',
      '#cardbox-exit-background',
      '.cardbox-exit-background',
      '.saito-header-hamburger-contents',
      '#log-wrapper',
      '#log',
      '#mobile-log-tab',
      '.mobile-log-tab',
      '.game-minimap',
      '.saito-overlay-closebox',
      '#game-menu-close',
      '#game-menu-toggle',
      '.saito-cta-loader-shell',
      '#game-help',
      '.hud-notice'
    ].join(', ');
    if (this.isGameBoard(el) || el.closest?.(chrome)) {
      return 'chrome';
    }
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'label') {
      return 'form control';
    }
    const incidental = {
      game: true,
      info: true,
      chat: true,
      difficulty: true,
      settings: true,
      menu: true,
      help: true,
      observer: true,
      log: true,
      rules: true
    };
    if (incidental[String(text || '').toLowerCase()]) {
      return 'incidental label';
    }
    return '';
  }

  interactableFailure(el) {
    if (!el || el.nodeType !== 1) {
      return 'not an element';
    }
    const view = el.ownerDocument?.defaultView;
    if (!view || el.isConnected === false) {
      return 'not connected';
    }
    if (this.controlDisabled(el)) {
      return 'controlDisabled';
    }
    let node = el;
    while (node && node.nodeType === 1) {
      const where = node.tagName ? node.tagName.toLowerCase() : 'node';
      if (node.hidden === true || node.hasAttribute?.('hidden')) {
        return 'hidden on ' + where;
      }
      if (node.getAttribute?.('aria-hidden') === 'true') {
        return 'aria-hidden on ' + where;
      }
      if (node.inert === true || node.hasAttribute?.('inert')) {
        return 'inert on ' + where;
      }
      const style = this.computedStyle(view, node);
      if (style && style.display === 'none') {
        return 'display none on ' + where;
      }
      if (this.fullyTransparent(style)) {
        return 'opacity 0 on ' + where;
      }
      node = node.parentElement;
    }
    const own = this.computedStyle(view, el);
    if (own && (own.visibility === 'hidden' || own.visibility === 'collapse')) {
      return 'visibility ' + own.visibility;
    }
    if (own && own.pointerEvents === 'none') {
      return 'pointer-events none';
    }
    if (!this.geometryReaches(el, view)) {
      return 'geometry:' + (this._geometry_reason || 'rejected');
    }
    return '';
  }

  gameDocument() {
    const game_mod = this.mod.manager?.active_game_mod;
    if (game_mod?.jsdom?.window?.document) {
      return game_mod.jsdom.window.document;
    }
    if (typeof document !== 'undefined' && document.body) {
      return document;
    }
    return null;
  }

  isClickable(el) {
    if (!this.hasInteraction(el)) {
      return false;
    }
    return this.isInteractable(el);
  }

  hasInteraction(el) {
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
    if (typeof el.onmouseup === 'function' || typeof el.onmousedown === 'function') {
      return true;
    }
    if (this.jqueryClick(el)) {
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

  // A handler is not an action unless a player can see the element and land a
  // click on it. Visibility uses the computed style of the element and its
  // ancestors. Geometry uses the viewport, clipping ancestors, and a few
  // sample points. offsetParent is not used: fixed elements often have none.
  //
  // When the document reports no root layout box, geometry is skipped and the
  // element stays. A headless document does not distinguish a real box from an
  // unmeasured one. Occlusion samples the visible area; one clear point is
  // enough. A layer with pointer-events: none is not a cover: the player can
  // see and click through it, but some documents still return it from
  // elementFromPoint. That layer must not empty the menu.
  //
  // The GameBot inspector is the operator's overlay, not a game cover. A hit
  // on it is ignored so an open drawer cannot erase the actions underneath.
  // The click may land on a descendant (an SVG path inside a territory) while
  // the listener lives on an ancestor. Those targets are already accepted by
  // hasInteraction when they are buttons, links, or role=button widgets.
  // A listener whose own box has no area stays when a child is visible: the
  // click lands on the child and reaches the listener.
  isInteractable(el) {
    if (!el || el.nodeType !== 1) {
      return false;
    }
    const view = el.ownerDocument?.defaultView;
    if (!view || el.isConnected === false) {
      return false;
    }
    if (this.controlDisabled(el)) {
      return false;
    }
    let node = el;
    while (node && node.nodeType === 1) {
      if (node.hidden === true || node.hasAttribute?.('hidden')) {
        return false;
      }
      if (node.getAttribute?.('aria-hidden') === 'true') {
        return false;
      }
      if (node.inert === true || node.hasAttribute?.('inert')) {
        return false;
      }
      const style = this.computedStyle(view, node);
      if (style && style.display === 'none') {
        return false;
      }
      if (this.fullyTransparent(style)) {
        return false;
      }
      node = node.parentElement;
    }
    const own = this.computedStyle(view, el);
    if (own && (own.visibility === 'hidden' || own.visibility === 'collapse')) {
      return false;
    }
    if (own && own.pointerEvents === 'none') {
      return false;
    }
    return this.geometryReaches(el, view);
  }

  controlDisabled(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const control = tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'option' || tag === 'optgroup';
    if (!control) {
      return false;
    }
    if (el.disabled === true || el.hasAttribute?.('disabled')) {
      return true;
    }
    let fieldset = el.parentElement;
    while (fieldset && fieldset.nodeType === 1) {
      if (fieldset.tagName && fieldset.tagName.toLowerCase() === 'fieldset' && (fieldset.disabled === true || fieldset.hasAttribute('disabled'))) {
        const legends = fieldset.children || [];
        for (let i = 0; i < legends.length; i++) {
          const legend = legends[i];
          if (legend.tagName && legend.tagName.toLowerCase() === 'legend' && legend.contains(el)) {
            return false;
          }
        }
        return true;
      }
      fieldset = fieldset.parentElement;
    }
    return false;
  }

  fullyTransparent(style) {
    const value = style && style.opacity;
    if (value === '' || value == null) {
      return false;
    }
    const number = Number(value);
    return Number.isFinite(number) && number === 0;
  }

  computedStyle(view, el) {
    if (typeof view.getComputedStyle !== 'function') {
      return null;
    }
    try {
      return view.getComputedStyle(el);
    } catch (err) {
      return null;
    }
  }

  layoutMeasured(doc) {
    const root = doc.documentElement;
    const root_box = root && typeof root.getBoundingClientRect === 'function' ? root.getBoundingClientRect() : null;
    if (root_box && root_box.width > 0 && root_box.height > 0) {
      return true;
    }
    const body = doc.body;
    const body_box = body && typeof body.getBoundingClientRect === 'function' ? body.getBoundingClientRect() : null;
    return !!(body_box && body_box.width > 0 && body_box.height > 0);
  }

  rectBox(rect) {
    if (!rect) {
      return null;
    }
    const left = Number(rect.left) || 0;
    const top = Number(rect.top) || 0;
    const right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + (Number(rect.width) || 0);
    const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + (Number(rect.height) || 0);
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) {
      return null;
    }
    return { left, top, right, bottom, width, height };
  }

  intersectBox(a, b) {
    if (!a || !b) {
      return null;
    }
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    if (right - left <= 0 || bottom - top <= 0) {
      return null;
    }
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  // The listener can have no border box of its own. Floated children still
  // paint and still deliver the click, so their boxes stand in for the parent.
  layoutBox(el) {
    const own = this.rectBox(el.getBoundingClientRect());
    if (own || typeof el.querySelectorAll !== 'function') {
      return own;
    }
    const nodes = el.querySelectorAll('*');
    let box = null;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!this.isShown(node)) {
        continue;
      }
      const part = typeof node.getBoundingClientRect === 'function' ? this.rectBox(node.getBoundingClientRect()) : null;
      if (!part) {
        continue;
      }
      if (!box) {
        box = part;
        continue;
      }
      const left = Math.min(box.left, part.left);
      const top = Math.min(box.top, part.top);
      const right = Math.max(box.right, part.right);
      const bottom = Math.max(box.bottom, part.bottom);
      box = { left, top, right, bottom, width: right - left, height: bottom - top };
    }
    return box;
  }

  clipsOverflow(style) {
    if (!style) {
      return false;
    }
    const clips = { hidden: true, scroll: true, auto: true, clip: true };
    return clips[style.overflowX] === true || clips[style.overflowY] === true || clips[style.overflow] === true;
  }

  createsContainingBlock(style) {
    if (!style) {
      return false;
    }
    if (style.transform && style.transform !== 'none') {
      return true;
    }
    if (style.filter && style.filter !== 'none') {
      return true;
    }
    if (style.perspective && style.perspective !== 'none') {
      return true;
    }
    if (style.contain && style.contain !== 'none') {
      return true;
    }
    const will = String(style.willChange || '');
    return will.indexOf('transform') !== -1 || will.indexOf('filter') !== -1 || will.indexOf('perspective') !== -1;
  }

  geometryReaches(el, view) {
    this._geometry_reason = '';
    const doc = el.ownerDocument;
    if (!this.layoutMeasured(doc) || typeof el.getBoundingClientRect !== 'function') {
      return true;
    }
    const width = Number(view.innerWidth) || doc.documentElement.clientWidth || 0;
    const height = Number(view.innerHeight) || doc.documentElement.clientHeight || 0;
    if (width <= 0 || height <= 0) {
      return true;
    }
    let visible = this.intersectBox(this.layoutBox(el), {
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height
    });
    if (!visible) {
      this._geometry_reason = 'outside viewport';
      return false;
    }
    const own = this.computedStyle(view, el);
    let in_fixed = own?.position === 'fixed';
    let node = el.parentElement;
    while (node && node.nodeType === 1 && node !== doc.documentElement) {
      const style = this.computedStyle(view, node);
      const block = this.createsContainingBlock(style);
      if ((!in_fixed || block) && this.clipsOverflow(style)) {
        visible = this.intersectBox(visible, this.rectBox(node.getBoundingClientRect()));
        if (!visible) {
          const where = node.id || (node.className && String(node.className).split(' ')[0]) || node.tagName;
          this._geometry_reason = 'clipped by ' + where;
          return false;
        }
      }
      if (block) {
        in_fixed = false;
      }
      if (style?.position === 'fixed') {
        in_fixed = true;
      }
      node = node.parentElement;
    }
    const reaches = this.pointReaches(el, doc, visible);
    if (!reaches) {
      this._geometry_reason = 'covered';
    }
    return reaches;
  }

  receivesHits(view, node) {
    const style = this.computedStyle(view, node);
    return !style || style.pointerEvents !== 'none';
  }

  hitStack(doc, x, y) {
    try {
      if (typeof doc.elementsFromPoint === 'function') {
        const stack = doc.elementsFromPoint(x, y);
        if (stack && stack.length) {
          return Array.from(stack);
        }
      }
      if (typeof doc.elementFromPoint !== 'function') {
        return null;
      }
      const hit = doc.elementFromPoint(x, y);
      return hit ? [hit] : [];
    } catch (err) {
      return null;
    }
  }

  // The inspector sits above the board so the operator can read the menu.
  // It is not part of the game, and executeClick does not depend on it
  // being out of the way.
  isOperatorOverlay(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    if (node.id === 'gamebot-inspector-root') {
      return true;
    }
    return typeof node.closest === 'function' && node.closest('#gamebot-inspector-root') != null;
  }

  samplePoints(el, visible) {
    const inset_x = Math.min(1, visible.width / 2);
    const inset_y = Math.min(1, visible.height / 2);
    const points = [
      { x: visible.left + visible.width / 2, y: visible.top + visible.height / 2 },
      { x: visible.left + inset_x, y: visible.top + inset_y },
      { x: visible.right - inset_x, y: visible.top + inset_y },
      { x: visible.left + inset_x, y: visible.bottom - inset_y },
      { x: visible.right - inset_x, y: visible.bottom - inset_y }
    ];
    // An irregular country can have a bounding box whose center is ocean.
    // The painted shape is the click target, so sample that shape as well.
    const shapes = el.querySelectorAll ? el.querySelectorAll('path, polygon, polyline, rect, circle, ellipse') : [];
    let added = 0;
    for (let i = 0; i < shapes.length && added < 3; i++) {
      const shape = shapes[i];
      if (shape.getAttribute?.('aria-hidden') === 'true' || shape.closest?.('[aria-hidden="true"]')) {
        continue;
      }
      if (typeof shape.getBoundingClientRect !== 'function') {
        continue;
      }
      const rect = shape.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      points.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      added += 1;
    }
    return points;
  }

  // 'hit' means a point lands on the control or a descendant of it.
  // 'covered' means some other game element is in front.
  // 'clear' means the only nodes at that point are the operator overlay or
  // layers that do not receive hits.
  stackReaches(el, view, stack) {
    for (let n = 0; n < stack.length; n++) {
      const node = stack[n];
      if (this.isOperatorOverlay(node) || !this.receivesHits(view, node)) {
        continue;
      }
      if (node === el || (typeof el.contains === 'function' && el.contains(node))) {
        return 'hit';
      }
      return 'covered';
    }
    return 'clear';
  }

  pointReaches(el, doc, visible) {
    if (typeof doc.elementFromPoint !== 'function' && typeof doc.elementsFromPoint !== 'function') {
      return true;
    }
    const view = doc.defaultView;
    const points = this.samplePoints(el, visible);
    let covered = false;
    for (let i = 0; i < points.length; i++) {
      const stack = this.hitStack(doc, points[i].x, points[i].y);
      if (stack === null) {
        return true;
      }
      const reached = this.stackReaches(el, view, stack);
      if (reached === 'hit') {
        return true;
      }
      if (reached === 'covered') {
        covered = true;
      }
    }
    return !covered;
  }

  // jQuery's .on('click') does not set onclick. The listener is stored on the
  // element and is what a board country uses for placement.
  jqueryClick(el) {
    const jq = el.ownerDocument?.defaultView?.jQuery || el.ownerDocument?.defaultView?.$;
    if (typeof jq?._data !== 'function') {
      return false;
    }
    let events = null;
    try {
      events = jq._data(el, 'events');
    } catch (err) {
      return false;
    }
    return Array.isArray(events?.click) && events.click.length > 0;
  }

  // A cardbox mouseup with no live callback only opens the card image.
  // onclick, a jQuery click, or a cardbox callback remains an action.
  previewOnly(el) {
    if (typeof el.onclick === 'function' || el.getAttribute?.('onclick')) {
      return false;
    }
    if (this.jqueryClick(el)) {
      return false;
    }
    if (typeof el.onmouseup !== 'function' && typeof el.onmousedown !== 'function') {
      return false;
    }
    const cardbox = this.mod.manager?.active_game_mod?.cardbox;
    const types = cardbox?.card_types;
    if (!Array.isArray(types)) {
      return false;
    }
    let matched = false;
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      if (!type?.css || !el.classList?.contains(type.css)) {
        continue;
      }
      matched = true;
      const live = type.action ? cardbox.callback || type.mycallback : type.mycallback;
      if (typeof live === 'function') {
        return false;
      }
    }
    return matched;
  }

  // The board surface itself is not a move. Countries and other controls
  // inside it remain available.
  isGameBoard(el) {
    const id = el.id || '';
    if (id === 'gameboard' || id === 'game-board') {
      return true;
    }
    return el.classList?.contains('gameboard') === true || el.classList?.contains('game-board') === true;
  }

  // A later board render can fill an empty menu. This refreshes the actions
  // already on display. It does not start an examination or an AI decision.
  watchBoard() {
    if (this.board_watch || typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    const view = document.defaultView;
    const Observer = view?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (!root || typeof Observer !== 'function') {
      return;
    }
    this.board_watch = new Observer(() => {
      const menu = this.mod.manager?.view?.context?.menu;
      if (!Array.isArray(menu) || menu.length > 0 || this.refresh_queued) {
        return;
      }
      this.refresh_queued = true;
      const refresh = () => {
        this.refresh_queued = false;
        this.mod.manager?.refreshEmptyMenu?.();
      };
      if (typeof view?.requestAnimationFrame === 'function') {
        view.requestAnimationFrame(refresh);
      } else if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(refresh);
      } else {
        setTimeout(refresh, 0);
      }
    });
    this.board_watch.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'hidden', 'aria-hidden', 'class', 'style']
    });
  }

  elementPath(el) {
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
