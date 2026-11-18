// Loaded only by a headless GameTemplate. The lite bundle must not parse this
// file: jsdom depends on https-proxy-agent, which requires Node's assert.

module.exports = function install(game, game_id) {
  if (game.uses_jsdom != 1 || game.game?.id !== game_id) {
    return;
  }

  if (game.jsdom) {
    game.jsdom.window.close();
    game.jsdom = null;
  }

  // jquery exports a per-window factory only when it is first evaluated
  // with no document. Require it before installing this window. Calling
  // the factory then returns a new jQuery for this document. A module
  // that already holds another jQuery keeps that reference.
  let saved_window = global.window;
  let saved_document = global.document;
  global.window = undefined;
  global.document = undefined;
  let jquery = require('jquery');
  if (typeof jquery !== 'function' || jquery.fn) {
    let jquery_path = require.resolve('jquery');
    delete require.cache[jquery_path];
    jquery = require('jquery');
  }
  global.window = saved_window;
  global.document = saved_document;

  const { JSDOM } = require('jsdom');
  let dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/'
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;

  if (typeof jquery === 'function' && !jquery.fn) {
    jquery = jquery(dom.window);
  }
  global.$ = jquery;
  global.jQuery = jquery;
  dom.window.$ = jquery;
  dom.window.jQuery = jquery;
  game.jsdom = dom;
};
