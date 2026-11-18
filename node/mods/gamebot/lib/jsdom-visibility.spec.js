// The lite-client bundle parses every file in this module. The jsdom import
// stays inside eval('require') so webpack does not follow it into Node's assert.
const { JSDOM } = eval('require')('jsdom');
const GameDom = require('./jsdom');

function page(html) {
  const dom = new JSDOM('<!DOCTYPE html><body>' + html + '</body></html>');
  const game = new GameDom({}, { manager: { active_game_mod: { jsdom: { window: dom.window } } } });
  return { dom, game, document: dom.window.document };
}

function ids(game) {
  return game.get_clickable_items().map((item) => item.identifier);
}

function box(left, top, width, height) {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  };
}

function use_layout(dom, boxes, hit) {
  const view = dom.window;
  const doc = view.document;
  view.innerWidth = 800;
  view.innerHeight = 600;
  const viewport = box(0, 0, 800, 600);
  doc.documentElement.getBoundingClientRect = () => viewport;
  doc.body.getBoundingClientRect = () => viewport;
  view.Element.prototype.getBoundingClientRect = function () {
    return boxes.get(this) || box(0, 0, 0, 0);
  };
    doc.elementFromPoint = (x, y) => {
    if (hit) {
      return hit(x, y);
    }
    let found = null;
    let area = Infinity;
    for (const [el, rect] of boxes) {
      if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) {
        const size = rect.width * rect.height;
        if (size < area) {
          found = el;
          area = size;
        }
      }
    }
    return found;
  };
}

describe('visible interactions', () => {
  test('a visible button is included', () => {
    const { game } = page('<button id="play">Play</button>');
    expect(ids(game)).toContain('button#play');
  });

  test('display none on the button or an ancestor is excluded', () => {
    const { game } = page(
      '<button id="gone" style="display:none">Gone</button><div id="wrap" style="display:none"><button id="child">Child</button></div>'
    );
    const found = ids(game);
    expect(found).not.toContain('button#gone');
    expect(found).not.toContain('button#child');
  });

  test('visibility hidden and opacity 0 are excluded', () => {
    const { game } = page(
      '<button id="hid" style="visibility:hidden">Hidden</button><button id="fade" style="opacity:0">Fade</button><div style="opacity:0"><button id="nested">Nested</button></div>'
    );
    const found = ids(game);
    expect(found).not.toContain('button#hid');
    expect(found).not.toContain('button#fade');
    expect(found).not.toContain('button#nested');
  });

  test('a button outside the viewport is excluded and a partial one stays', () => {
    const { dom, game, document } = page('<button id="off">Off</button><button id="part">Part</button>');
    const off = document.getElementById('off');
    const part = document.getElementById('part');
    const boxes = new Map([
      [off, box(900, 10, 80, 30)],
      [part, box(-40, 10, 80, 30)]
    ]);
    use_layout(dom, boxes);
    const found = ids(game);
    expect(found).not.toContain('button#off');
    expect(found).toContain('button#part');
  });

  test('a button clipped entirely by an ancestor is excluded', () => {
    const { dom, game, document } = page(
      '<div id="clip" style="overflow:hidden"><button id="below">Below</button></div>'
    );
    const clip = document.getElementById('clip');
    const below = document.getElementById('below');
    use_layout(dom, new Map([
      [clip, box(0, 0, 100, 40)],
      [below, box(0, 200, 80, 30)]
    ]));
    expect(ids(game)).not.toContain('button#below');
  });

  test('pointer-events none and a disabled control are excluded', () => {
    const { game } = page(
      '<button id="dead" style="pointer-events:none">Dead</button><button id="off" disabled>Off</button><fieldset disabled><button id="set">Set</button><legend><button id="legend">Legend</button></legend></fieldset>'
    );
    const found = ids(game);
    expect(found).not.toContain('button#dead');
    expect(found).not.toContain('button#off');
    expect(found).not.toContain('button#set');
    expect(found).toContain('button#legend');
  });

  test('a covered button is excluded and a corner that can be clicked stays', () => {
    const { dom, game, document } = page('<button id="under">Under</button><button id="edge">Edge</button><div id="cover"></div>');
    const under = document.getElementById('under');
    const edge = document.getElementById('edge');
    const cover = document.getElementById('cover');
    use_layout(dom, new Map([
      [under, box(10, 10, 100, 40)],
      [edge, box(10, 80, 100, 40)],
      [cover, box(10, 10, 100, 120)]
    ]), (x, y) => {
      if (y >= 80 && x < 30) {
        return edge;
      }
      return cover;
    });
    const found = ids(game);
    expect(found).not.toContain('button#under');
    expect(found).toContain('button#edge');
  });

  test('a fixed button is included without reading offsetParent', () => {
    const { dom, game, document } = page('<button id="pin" style="position:fixed">Pin</button>');
    const pin = document.getElementById('pin');
    Object.defineProperty(pin, 'offsetParent', {
      get() {
        throw new Error('offsetParent');
      }
    });
    use_layout(dom, new Map([[pin, box(20, 20, 80, 30)]]));
    expect(ids(game)).toContain('button#pin');
  });

  test('a visible map region stays and a delegated child follows existing discovery', () => {
    const { dom, game, document } = page('<svg id="map"><g id="country"></g><g id="quiet"></g></svg><div id="board"><span id="label">Label</span><button id="move">Move</button></div>');
    const country = document.getElementById('country');
    const quiet = document.getElementById('quiet');
    const board = document.getElementById('board');
    const move = document.getElementById('move');
    country.addEventListener('click', () => {});
    board.addEventListener('click', () => {});
    use_layout(dom, new Map([
      [country, box(30, 30, 80, 50)],
      [quiet, box(120, 30, 80, 50)],
      [board, box(0, 0, 400, 300)],
      [move, box(220, 180, 70, 30)]
    ]));
    const found = ids(game);
    expect(found).toContain('g#country');
    expect(found).not.toContain('g#quiet');
    expect(found).not.toContain('span#label');
    expect(found).toContain('button#move');
  });
});
