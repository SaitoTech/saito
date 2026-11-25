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
  return game.returnOptions().map((item) => item.identifier);
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
  const at = (x, y) => {
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
  doc.elementFromPoint = at;
  doc.elementsFromPoint = (x, y) => {
    const found = at(x, y);
    return found ? [found] : [];
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

  test('a visible button stays available under a pointer-events none layer', () => {
    const { dom, game, document } = page('<button id="end">Finish attacking →</button><div id="veil" style="pointer-events:none"></div>');
    const end = document.getElementById('end');
    const veil = document.getElementById('veil');
    use_layout(dom, new Map([
      [end, box(600, 40, 160, 48)],
      [veil, box(0, 0, 800, 600)]
    ]), () => veil);
    dom.window.document.elementsFromPoint = () => [veil, end];
    expect(ids(game)).toContain('button#end');
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

  test('an empty overlay does not replace a board country', () => {
    const { game, document } = page(
      '<div id="saito-overlay1" class="saito-overlay" style="display:block"></div><div id="yugoslavia" class="country">1 1</div>'
    );
    document.getElementById('yugoslavia').onclick = () => {};
    const menu = game.returnContext({ menu: [] }).menu.map((item) => item.identifier);
    expect(menu).toContain('div#yugoslavia');
  });

  test('a zero-height parent stays when a child is visible', () => {
    const { dom, game, document } = page(
      '<div id="poland" class="country"><div class="ussr">3</div></div><div id="empty" class="country"><div class="ussr">0</div></div><div id="austria" class="country"><div class="ussr">1</div></div>'
    );
    const poland = document.getElementById('poland');
    const empty = document.getElementById('empty');
    const austria = document.getElementById('austria');
    const tile = poland.querySelector('.ussr');
    const hidden = empty.querySelector('.ussr');
    const away = austria.querySelector('.ussr');
    poland.onclick = () => {};
    empty.onclick = () => {};
    austria.onclick = () => {};
    hidden.style.display = 'none';
    use_layout(dom, new Map([
      [poland, box(10, 10, 202, 0)],
      [tile, box(110, 10, 100, 100)],
      [empty, box(10, 200, 202, 0)],
      [hidden, box(110, 200, 100, 100)],
      [austria, box(10, 400, 202, 0)],
      [away, box(900, 400, 100, 100)]
    ]));
    const found = ids(game);
    expect(found).toContain('div#poland');
    expect(found).not.toContain('div.ussr');
    expect(found).not.toContain('div#empty');
    expect(found).not.toContain('div#austria');
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

  test('fortify lists the enabled skip control, SVG countries, and delegated hits', () => {
    const html = [
      '<div id="gamebot-inspector-root">',
      '<button type="button" class="gamebot-inspector-tab">Context</button>',
      '<aside id="gamebot-inspector" class="gamebot-inspector"></aside>',
      '</div>',
      '<main id="board">',
      '<svg id="map">',
      '<g id="alaska" class="conquest-territory" data-territory="alaska" role="button" tabindex="0"><path id="alaska-shape" class="conquest-country"></path><text>Alaska</text></g>',
      '<g id="siam" class="conquest-territory" data-territory="siam" role="button" tabindex="0"><polygon id="siam-shape"></polygon><text>Siam</text></g>',
      '</svg>',
      '<button id="skip" data-do="skip_movement">Skip fortification</button>',
      '<button id="waiting" data-do="skip_movement" disabled>Skip fortification</button>',
      '<button id="advance" hidden>Advance</button>',
      '<button id="buried" style="display:none">Buried</button>',
      '<button id="finish">Finish attacking →</button>',
      '<button id="finish-wait" disabled>Finish attacking →</button>',
      '<div id="real-cover"></div>',
      '<button id="covered">Covered command</button>',
      '</main>'
    ].join('');
    const { dom, game, document } = page(html);
    const board = document.getElementById('board');
    const selected = [];
    board.addEventListener('click', (event) => {
      const territory = event.target.closest('[data-territory]');
      if (territory) {
        selected.push(territory.id);
      }
    });
    const alaska = document.getElementById('alaska');
    const siam = document.getElementById('siam');
    const alaskaShape = document.getElementById('alaska-shape');
    const siamShape = document.getElementById('siam-shape');
    const skip = document.getElementById('skip');
    const finish = document.getElementById('finish');
    const covered = document.getElementById('covered');
    const cover = document.getElementById('real-cover');
    const inspector = document.getElementById('gamebot-inspector');
    expect(typeof alaska.onclick).not.toBe('function');
    expect(typeof siam.onclick).not.toBe('function');

    const alaskaBox = box(20, 40, 140, 90);
    const siamBox = box(200, 40, 120, 80);
    use_layout(dom, new Map([
      [alaska, alaskaBox],
      [alaskaShape, alaskaBox],
      [siam, siamBox],
      [siamShape, siamBox],
      [skip, box(560, 500, 180, 48)],
      [finish, box(560, 420, 180, 48)],
      [covered, box(40, 500, 160, 40)],
      [cover, box(40, 500, 160, 40)],
      [inspector, box(0, 0, 400, 600)]
    ]));
    document.elementsFromPoint = (x, y) => {
      if (x >= 560) {
        return y >= 480 ? [skip] : [finish];
      }
      if (y >= 480) {
        return [cover];
      }
      if (x < 180) {
        return [inspector, alaskaShape, alaska];
      }
      return [siamShape, siam];
    };

    const menu = game.gameActions();
    const ids = menu.map((item) => item.id);
    expect(menu.length).toBeGreaterThan(0);
    expect(menu).toEqual(expect.arrayContaining([
      { id: 'skip', label: 'Skip fortification', identifier: 'button#skip' },
      { id: 'alaska', label: 'Alaska', identifier: 'g#alaska' },
      { id: 'siam', label: 'Siam', identifier: 'g#siam' },
      { id: 'finish', label: 'Finish attacking →', identifier: 'button#finish' }
    ]));
    expect(ids).not.toContain('waiting');
    expect(ids).not.toContain('advance');
    expect(ids).not.toContain('buried');
    expect(ids).not.toContain('finish-wait');
    expect(ids).not.toContain('covered');
    expect(ids).not.toContain('gamebot-inspector');

    alaskaShape.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    expect(selected).toEqual(['alaska']);
  });

  test('the operator overlay alone does not empty a fortify menu', () => {
    const { dom, game, document } = page(
      '<div id="gamebot-inspector-root"><aside id="gamebot-inspector" class="gamebot-inspector"></aside></div><button id="skip">Skip fortification</button><svg id="map"><g id="india" role="button"><path id="india-shape"></path><text>India</text></g></svg>'
    );
    const skip = document.getElementById('skip');
    const india = document.getElementById('india');
    const shape = document.getElementById('india-shape');
    const inspector = document.getElementById('gamebot-inspector');
    const root = document.getElementById('gamebot-inspector-root');
    use_layout(dom, new Map([
      [skip, box(600, 40, 160, 48)],
      [india, box(40, 40, 120, 80)],
      [shape, box(40, 40, 120, 80)],
      [inspector, box(0, 0, 800, 600)],
      [root, box(0, 0, 800, 600)]
    ]));
    document.elementsFromPoint = () => [root, inspector];
    const ids = game.gameActions().map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['skip', 'india']));
  });
});
