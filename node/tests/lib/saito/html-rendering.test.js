const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

process.env.TS_NODE_PROJECT = 'config/build/tsconfig.json';
require('ts-node/register/transpile-only');

const Browser = require('../../../lib/saito/browser').default;
const SaitoLinkPreviewTemplate = require('../../../lib/saito/ui/saito-link-preview/saito-link-preview.template');
const HTMLParser = require('node-html-parser');

const browser = new Browser({});
const originalWindow = global.window;

before(() => {
  global.window = { location: { host: 'saito.io' } };
});

after(() => {
  if (originalWindow === undefined) {
    delete global.window;
  } else {
    global.window = originalWindow;
  }
});

test('allows minimal inline preview formatting and removes XSS payloads', () => {
  const html = browser.sanitizeInlineHtml(
    '<em>Wuziqi</em><strong onclick="alert(1)">safe</strong>' +
      '<img src=x onerror="alert(1)"><script>alert(1)</script>'
  );

  assert.equal(html, '<em>Wuziqi</em><strong>safe</strong>');
});

test('shortens a bare URL label but preserves the complete href', () => {
  const url =
    'https://saito.io/arcade/?game=wuziqi&game_id=fe447bfe7e329ec7fbe4279f395efc9276e228ab899428371584cc19d5bc13a34';
  const html = browser.sanitize(url, true);
  const anchor = HTMLParser.parse(html).querySelector('a');

  assert.equal(anchor.getAttribute('href'), url);
  assert.equal(anchor.textContent, browser.formatUrlForDisplay(url));
  assert.equal(anchor.textContent.endsWith('...'), true);
});

test('shortens a bare www URL after Marked supplies its scheme', () => {
  const label = 'www.saito.io/arcade/?game=wuziqi&game_id=fe447bfe7e329ec7fbe4279f395efc92';
  const html = browser.sanitize(label, true);
  const anchor = HTMLParser.parse(html).querySelector('a');

  assert.equal(anchor.getAttribute('href'), `http://${label}`);
  assert.equal(anchor.textContent, browser.formatUrlForDisplay(label));
});

test('preserves authored Markdown link labels', () => {
  const url = 'https://saito.io/arcade/?game=wuziqi&game_id=fe447bfe7e329ec7fbe4279f395efc92';
  const html = browser.sanitize(`[Play Wuziqi](${url})`, true);
  const anchor = HTMLParser.parse(html).querySelector('a');

  assert.equal(anchor.getAttribute('href'), url);
  assert.equal(anchor.textContent, 'Play Wuziqi');
});

test('repairs legacy anchors closed with a smart quote', () => {
  const url =
    'https://saito.io/stack/i767FqhGcKPzqi7KcWNA8TQoTZeBd8QbWd2mTKNnkfmk/4ab52c8c02a6e9e75fdf82e967f8dcfad60392a5516d5ca7192874ae915eddbf3cf7d8748eaaa61cb9736ef4beffe62578b7b6efb1b74693c32807ce7eb82e1c';
  const html = browser.sanitize(`# <a href="${url}“>Saito Project Update!</a>`, true);
  const root = HTMLParser.parse(html);
  const anchor = root.querySelector('a');

  assert.equal(anchor.getAttribute('href'), url);
  assert.equal(anchor.textContent, 'Saito Project Update!');
  assert.equal(root.textContent, 'Saito Project Update!');
  assert.doesNotMatch(html, /&lt;a href|href=&quot;/i);
});

test('does not repair smart-quoted anchors with unsafe href schemes', () => {
  const html = browser.sanitize(
    '<a href="javascript:alert(1)“>unsafe</a><script>alert(1)</script>',
    true
  );
  const root = HTMLParser.parse(html);

  assert.equal(root.querySelector('a'), null);
  assert.equal(root.querySelector('script'), null);
  assert.match(html, /&lt;a href=/i);
});

test('renders safe preview emphasis, escapes the display URL and keeps the full link target', () => {
  const url = 'https://example.com/arcade/?game=wuziqi&game_id=fe447bfe7e329ec7fbe4279f395efc92';
  const preview = {
    app: { browser },
    mod: {},
    url,
    display_url: 'https://example.com/<img src=x onerror=x>?query=long-value',
    title: 'Play <em>Wuziqi</em><script>alert(1)</script>',
    description: '<strong>Safe description</strong><svg onload="alert(1)"></svg>',
    show_photo: false,
    src: ''
  };
  const root = HTMLParser.parse(SaitoLinkPreviewTemplate(preview));
  const anchor = root.querySelector('a');
  const title = root.querySelector('.saito-link-preview-title');
  const displayUrl = root.querySelector('.saito-link-preview-display_url');

  assert.equal(anchor.getAttribute('href'), url);
  assert.equal(title.innerHTML, 'Play <em>Wuziqi</em>');
  assert.equal(displayUrl.querySelector('img'), null);
  assert.match(displayUrl.innerHTML, /&lt;img/);
  assert.equal(displayUrl.textContent, browser.formatUrlForDisplay(preview.display_url));
  assert.equal(root.querySelector('script'), null);
});

test('continues to reject dangerous post markup and href schemes', () => {
  const html = browser.sanitize(
    '<em>safe</em><img src=x onerror="alert(1)">' +
      '<a href="javascript:alert(1)" onclick="alert(1)">bad link</a>',
    true
  );

  assert.match(html, /<em>safe<\/em>/);
  assert.doesNotMatch(html, /javascript:|onclick|onerror/i);
});
