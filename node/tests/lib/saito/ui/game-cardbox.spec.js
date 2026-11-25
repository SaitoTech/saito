const GameCardbox = require('../../../../lib/saito/ui/game-cardbox/game-cardbox');

function element(rect) {
  return {
    isConnected: true,
    style: { display: 'block', zIndex: '', width: '' },
    innerHTML: '',
    getBoundingClientRect() {
      return rect;
    }
  };
}

describe('GameCardbox hover dismiss', () => {
  let nodes;
  let box;

  beforeEach(() => {
    box = element({ left: 0, top: 0, right: 10, bottom: 10 });
    nodes = {
      'game-cardbox': box,
      'cardbox-card': element({ left: 0, top: 0, right: 10, bottom: 10 })
    };
    global.document = {
      getElementById(id) {
        return nodes[id] || null;
      },
      addEventListener() {}
    };
  });

  function cardbox() {
    return new GameCardbox({}, { returnCardImage() { return '<img>'; } });
  }

  test('hides a hover popup after its card is removed and the pointer moves more than 10px', () => {
    let cb = cardbox();
    let card = element({ left: 0, top: 0, right: 40, bottom: 40 });
    cb.hover_el = card;
    cb.hover_anchor = { x: 10, y: 10 };

    card.isConnected = false;
    cb.onHoverMouseMove({ clientX: 16, clientY: 10 });
    expect(box.style.display).toBe('block');

    cb.onHoverMouseMove({ clientX: 21, clientY: 10 });
    expect(box.style.display).toBe('none');
    expect(cb.hover_el).toBe(null);
  });

  test('keeps the popup while the pointer remains over the card', () => {
    let cb = cardbox();
    let card = element({ left: 0, top: 0, right: 80, bottom: 80 });
    cb.hover_el = card;
    cb.hover_anchor = { x: 10, y: 10 };

    cb.onHoverMouseMove({ clientX: 40, clientY: 40 });

    expect(box.style.display).toBe('block');
    expect(cb.hover_anchor).toEqual({ x: 40, y: 40 });
  });

  test('does not hide a locked popup when the pointer moves', () => {
    let cb = cardbox();
    let card = element({ left: 0, top: 0, right: 20, bottom: 20 });
    card.isConnected = false;
    cb.hover_el = card;
    cb.hover_anchor = { x: 0, y: 0 };
    cb.cardbox_lock = 1;

    cb.onHoverMouseMove({ clientX: 40, clientY: 40 });

    expect(box.style.display).toBe('block');
    expect(cb.cardbox_lock).toBe(1);
  });

  test('remembers the card element when an unlocked popup is shown', () => {
    let cb = cardbox();
    cb.last_pointer = { x: 12, y: 8 };
    let card = element({ left: 0, top: 0, right: 30, bottom: 30 });
    nodes['card-1'] = card;

    cb.showCardboxHTML('card-1', '<img>');

    expect(cb.hover_el).toBe(card);
    expect(cb.hover_anchor).toEqual({ x: 12, y: 8 });
    expect(box.style.display).toBe('block');
  });
});

describe('GameCardbox returnContext', () => {
  function node(id, tag, text) {
    return {
      id,
      tagName: tag,
      style: { display: 'block' },
      textContent: text,
      onclick: null,
      querySelectorAll() {
        return [];
      }
    };
  }

  let nodes;
  let previous;

  beforeEach(() => {
    nodes = {
      'game-cardbox': node('game-cardbox', 'DIV', ''),
      'cardbox-menu': node('cardbox-menu', 'DIV', 'select'),
      'cardbox-exit': node('cardbox-exit', 'DIV', '×')
    };
    previous = global.document;
    global.document = {
      getElementById(id) {
        return nodes[id] || null;
      }
    };
  });

  afterEach(() => {
    global.document = previous;
  });

  test('a locked menu with a callback is the only option', () => {
    const cb = new GameCardbox({}, {});
    cb.cardbox_lock = 1;
    nodes['cardbox-menu'].onclick = () => {};
    nodes['cardbox-exit'].onclick = () => {};

    expect(cb.returnContext()).toEqual({
      menu: [{ id: 'cardbox-menu', label: 'select', identifier: 'div#cardbox-menu' }]
    });
  });

  test('buttons inside the menu are the options', () => {
    const headline = node('headline', 'BUTTON', 'Headline');
    const submit = node('submit', 'BUTTON', 'Submit');
    headline.onclick = () => {};
    submit.onclick = () => {};
    nodes['cardbox-menu'].querySelectorAll = () => [headline, submit];
    const cb = new GameCardbox({}, {});
    cb.cardbox_lock = 1;

    expect(cb.returnContext().menu.map((entry) => entry.id)).toEqual(['headline', 'submit']);
  });

  test('a hidden menu, an unlocked box, and a preview return no options', () => {
    const cb = new GameCardbox({}, {});
    nodes['cardbox-menu'].onclick = () => {};

    expect(cb.returnContext()).toEqual({ menu: [] });

    cb.cardbox_lock = 1;
    nodes['cardbox-menu'].style.display = 'none';
    expect(cb.returnContext()).toEqual({ menu: [] });

    nodes['cardbox-menu'].style.display = 'block';
    nodes['cardbox-menu'].onclick = null;
    expect(cb.returnContext()).toEqual({ menu: [] });
  });
});
