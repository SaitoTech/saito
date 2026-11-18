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
    this.dispatch_click(current.element);
    this.listed = [];
    return wanted;
  }

  // Synthetic events are not trusted. A browser may ignore the default action
  // of an untrusted click, such as following a link or submitting a form.
  // Listeners still run, including listeners on ancestor elements.
  // mouseup does not cause this DOM to emit click, so click is dispatched once.
  // PointerEvent is not part of every document; pointer actions use mouse
  // events when it is missing. mouseenter and mouseleave do not bubble.
  document_view(el) {
    if (!el || el.nodeType !== 1 || !el.ownerDocument?.defaultView) {
      throw new Error('That element is not in the document');
    }
    return el.ownerDocument.defaultView;
  }

  event_constructor(view, type) {
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

  dispatch_event(el, type, init) {
    const view = this.document_view(el);
    let event_type = type;
    let Ctor = this.event_constructor(view, type);
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

  dispatch_click(el) {
    this.dispatch_event(el, 'mousedown');
    this.dispatch_event(el, 'mouseup');
    this.dispatch_event(el, 'click');
  }

  pointer_down(el) {
    return this.dispatch_event(el, 'pointerdown');
  }

  pointer_up(el) {
    return this.dispatch_event(el, 'pointerup');
  }

  hover(el) {
    this.dispatch_event(el, 'mouseover');
    this.dispatch_event(el, 'mouseenter');
  }

  key(el, key) {
    const name = String(key || '');
    if (!name) {
      throw new Error('A key is required');
    }
    this.dispatch_event(el, 'keydown', { key: name, code: name, bubbles: true });
    this.dispatch_event(el, 'keyup', { key: name, code: name, bubbles: true });
  }

  input_text(el, value) {
    const tag = el?.tagName ? el.tagName.toLowerCase() : '';
    if (tag !== 'input' && tag !== 'textarea') {
      throw new Error('That element does not accept text');
    }
    el.value = String(value ?? '');
    this.dispatch_event(el, 'input', { bubbles: true });
    this.dispatch_event(el, 'change', { bubbles: true });
  }

  select_option(el, value) {
    if (!el || !el.tagName || el.tagName.toLowerCase() !== 'select') {
      throw new Error('That element is not a select control');
    }
    const wanted = String(value ?? '');
    const options = el.options ? Array.from(el.options) : [];
    if (!options.some((option) => option.value === wanted)) {
      throw new Error('That option is not in the select control');
    }
    el.value = wanted;
    this.dispatch_event(el, 'input', { bubbles: true });
    this.dispatch_event(el, 'change', { bubbles: true });
  }

  game_actions() {
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
    const root = this.game_document();
    const nodes = root?.querySelectorAll ? root.querySelectorAll('*') : [];
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!this.is_clickable(el) || el.disabled === true || this.preview_only(el)) {
        continue;
      }
      if (this.is_game_board(el) || el.closest?.(chrome)) {
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
      const identifier = this.element_path(el);
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
    return actions;
  }

  game_document() {
    const game_mod = this.mod.manager?.active_game_mod;
    if (game_mod?.jsdom?.window?.document) {
      return game_mod.jsdom.window.document;
    }
    if (typeof document !== 'undefined' && document.body) {
      return document;
    }
    return null;
  }

  is_clickable(el) {
    if (!this.has_interaction(el)) {
      return false;
    }
    return this.is_interactable(el);
  }

  has_interaction(el) {
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
    if (this.jquery_click(el)) {
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
  // enough. elementFromPoint returning nothing is treated as unmeasured.
  // Delegated listeners are not discovered here. Only elements the existing
  // handler check already accepts are filtered.
  is_interactable(el) {
    if (!el || el.nodeType !== 1) {
      return false;
    }
    const view = el.ownerDocument?.defaultView;
    if (!view || el.isConnected === false) {
      return false;
    }
    if (this.control_disabled(el)) {
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
      const style = this.computed_style(view, node);
      if (style && style.display === 'none') {
        return false;
      }
      if (this.fully_transparent(style)) {
        return false;
      }
      node = node.parentElement;
    }
    const own = this.computed_style(view, el);
    if (own && (own.visibility === 'hidden' || own.visibility === 'collapse')) {
      return false;
    }
    if (own && own.pointerEvents === 'none') {
      return false;
    }
    return this.geometry_reaches(el, view);
  }

  control_disabled(el) {
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

  fully_transparent(style) {
    const value = style && style.opacity;
    if (value === '' || value == null) {
      return false;
    }
    const number = Number(value);
    return Number.isFinite(number) && number === 0;
  }

  computed_style(view, el) {
    if (typeof view.getComputedStyle !== 'function') {
      return null;
    }
    try {
      return view.getComputedStyle(el);
    } catch (err) {
      return null;
    }
  }

  layout_measured(doc) {
    const root = doc.documentElement;
    const root_box = root && typeof root.getBoundingClientRect === 'function' ? root.getBoundingClientRect() : null;
    if (root_box && root_box.width > 0 && root_box.height > 0) {
      return true;
    }
    const body = doc.body;
    const body_box = body && typeof body.getBoundingClientRect === 'function' ? body.getBoundingClientRect() : null;
    return !!(body_box && body_box.width > 0 && body_box.height > 0);
  }

  rect_box(rect) {
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

  intersect_box(a, b) {
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

  clips_overflow(style) {
    if (!style) {
      return false;
    }
    const clips = { hidden: true, scroll: true, auto: true, clip: true };
    return clips[style.overflowX] === true || clips[style.overflowY] === true || clips[style.overflow] === true;
  }

  creates_containing_block(style) {
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

  geometry_reaches(el, view) {
    const doc = el.ownerDocument;
    if (!this.layout_measured(doc) || typeof el.getBoundingClientRect !== 'function') {
      return true;
    }
    const width = Number(view.innerWidth) || doc.documentElement.clientWidth || 0;
    const height = Number(view.innerHeight) || doc.documentElement.clientHeight || 0;
    if (width <= 0 || height <= 0) {
      return true;
    }
    let visible = this.intersect_box(this.rect_box(el.getBoundingClientRect()), {
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height
    });
    if (!visible) {
      return false;
    }
    const own = this.computed_style(view, el);
    let in_fixed = own?.position === 'fixed';
    let node = el.parentElement;
    while (node && node.nodeType === 1 && node !== doc.documentElement) {
      const style = this.computed_style(view, node);
      const block = this.creates_containing_block(style);
      if ((!in_fixed || block) && this.clips_overflow(style)) {
        visible = this.intersect_box(visible, this.rect_box(node.getBoundingClientRect()));
        if (!visible) {
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
    return this.point_reaches(el, doc, visible);
  }

  point_reaches(el, doc, visible) {
    if (typeof doc.elementFromPoint !== 'function') {
      return true;
    }
    const inset_x = Math.min(1, visible.width / 2);
    const inset_y = Math.min(1, visible.height / 2);
    const points = [
      { x: visible.left + visible.width / 2, y: visible.top + visible.height / 2 },
      { x: visible.left + inset_x, y: visible.top + inset_y },
      { x: visible.right - inset_x, y: visible.top + inset_y },
      { x: visible.left + inset_x, y: visible.bottom - inset_y },
      { x: visible.right - inset_x, y: visible.bottom - inset_y }
    ];
    let measured = false;
    for (let i = 0; i < points.length; i++) {
      let hit = null;
      try {
        hit = doc.elementFromPoint(points[i].x, points[i].y);
      } catch (err) {
        return true;
      }
      if (!hit) {
        continue;
      }
      measured = true;
      if (hit === el || el.contains(hit)) {
        return true;
      }
    }
    return !measured;
  }

  // jQuery's .on('click') does not set onclick. The listener is stored on the
  // element and is what a board country uses for placement.
  jquery_click(el) {
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
  preview_only(el) {
    if (typeof el.onclick === 'function' || el.getAttribute?.('onclick')) {
      return false;
    }
    if (this.jquery_click(el)) {
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
  is_game_board(el) {
    const id = el.id || '';
    if (id === 'gameboard' || id === 'game-board') {
      return true;
    }
    return el.classList?.contains('gameboard') === true || el.classList?.contains('game-board') === true;
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
