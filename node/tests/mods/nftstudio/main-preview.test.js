const assert = require('node:assert/strict');
const test = require('node:test');
const NFTStudioMain = require('../../../mods/nftstudio/lib/main');
const MainTemplate = require('../../../mods/nftstudio/lib/main.template');

test('JavaScript runs in the application context and awaits salert', async () => {
  const wallet = {};
  const studio = new NFTStudioMain({ wallet }, {});
  const hadSalert = Object.hasOwn(global, 'salert');
  const previousSalert = global.salert;
  const steps = [];
  global.salert = async (message) => {
    steps.push(message);
    await Promise.resolve();
  };
  studio.source = 'await salert("NFT ran"); this.finished = true;';

  try {
    await studio.executeJavascript();
    steps.push('complete');
  } finally {
    if (hadSalert) {
      global.salert = previousSalert;
    } else {
      delete global.salert;
    }
  }

  assert.deepEqual(steps, ['NFT ran', 'complete']);
  assert.equal(wallet.finished, true);
});

test('CSS preview loads Saito and applies the theme to representative elements', () => {
  const studio = new NFTStudioMain({}, {});
  studio.source = ':root { --saito-primary: rebeccapurple; } button { color: white; }';

  const preview = studio.cssPreview();

  assert.match(preview, /href="\/saito\/saito\.css"/);
  assert.match(preview, /data:text\/css;charset=utf-8,/);
  assert.match(preview, /<h1>Heading level one<\/h1>/);
  assert.match(preview, /<form>/);
  assert.match(preview, /class="saito-input"/);
  assert.match(preview, /class="saito-checkbox"/);
  assert.match(preview, /class="saito-button-primary"/);
  assert.match(preview, /<table class="theme-preview-table">/);
  assert.doesNotMatch(preview, /<script>/);
  assert.match(MainTemplate(), /data-action="toggle-preview"[^>]*hidden/);
  assert.match(MainTemplate(), /sandbox=""/);
});

test('file picker stays hidden from the global file input enhancer', () => {
  assert.match(MainTemplate(), /class="file-input treated"[^>]*hidden/);
  assert.doesNotMatch(MainTemplate(), /Choose File/);
});

test('new NFT checks for unsaved changes, resets the document, and focuses the editor', () => {
  const studio = new NFTStudioMain({}, {});
  const confirmations = [];
  const editorCalls = [];
  const previousWindow = global.window;
  global.window = {
    confirm(message) {
      confirmations.push(message);
      return confirmations.length > 1;
    }
  };

  studio.title = 'Work in progress';
  studio.type = 'css';
  studio.source = 'body {}';
  studio.isDirty = true;
  studio.editor = {
    setValue(value) {
      editorCalls.push(['setValue', value]);
    },
    setOption(name, value) {
      editorCalls.push(['setOption', name, value]);
    },
    focus() {
      editorCalls.push(['focus']);
    }
  };
  studio.syncFields = () => editorCalls.push(['syncFields']);
  studio.clearPreview = () => editorCalls.push(['clearPreview']);
  studio.syncLayout = () => editorCalls.push(['syncLayout']);
  studio.validate = () => editorCalls.push(['validate']);
  studio.setDraftStatus = (message) => editorCalls.push(['status', message]);

  try {
    assert.equal(studio.newDocument(), false);
    assert.equal(studio.title, 'Work in progress');
    assert.deepEqual(editorCalls, []);

    assert.equal(studio.newDocument(), true);
    assert.equal(studio.title, '');
    assert.equal(studio.type, 'js');
    assert.equal(studio.source, '');
    assert.equal(studio.isDirty, false);
    assert.deepEqual(editorCalls.at(-1), ['focus']);
    assert.equal(confirmations.length, 2);
  } finally {
    global.window = previousWindow;
  }
});
