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
