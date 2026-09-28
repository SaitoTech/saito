const assert = require('node:assert/strict');
const test = require('node:test');
const CreateNFT = require('../../../../../../lib/saito/ui/saito-nft/overlays/create-overlay');
const NFTStudio = require('../../../../../../mods/nftstudio/nftstudio');

test('prepopulates and locks NFT type and content defaults', () => {
  const originalDocument = global.document;
  const dropdown = { value: '', disabled: false, dispatchEvent() {} };
  const content = { value: '', readOnly: false };
  const elements = new Map([
    ['#create-nft-type-dropdown', dropdown],
    ['#create-nft-textarea', content]
  ]);
  global.document = {
    querySelector: (selector) => elements.get(selector) || null
  };

  try {
    const overlay = Object.create(CreateNFT.prototype);
    overlay.defaults = {
      type: 'js',
      content: 'return 1;',
      locked: ['type', 'content']
    };
    overlay.setDefaults();

    assert.equal(dropdown.value, 'js');
    assert.equal(dropdown.disabled, true);
    assert.equal(content.value, 'return 1;');
    assert.equal(content.readOnly, true);
  } finally {
    global.document = originalDocument;
  }
});

test('renders module-provided footer actions for the selected NFT type', () => {
  const originalDocument = global.document;
  const children = [];
  const container = {
    replaceChildren() {
      children.length = 0;
    },
    appendChild(child) {
      children.push(child);
    }
  };
  const dropdown = { value: 'js' };
  let context;

  global.document = {
    querySelector(selector) {
      if (selector === '.saito-nft-create .primary .footer .actions') return container;
      if (selector === '#create-nft-type-dropdown') return dropdown;
      return null;
    },
    createElement() {
      return {};
    }
  };

  try {
    const overlay = Object.create(CreateNFT.prototype);
    overlay.nft_type = 'js';
    overlay.app = {
      modules: {
        getRespondTos(type, obj) {
          assert.equal(type, 'saito-nft-create-footer');
          context = obj;
          return obj.type === 'js' ? [{ text: 'NFT Studio', callback() {} }] : [];
        }
      }
    };

    overlay.renderFooterActions();

    assert.equal(context.type, 'js');
    assert.equal(context.overlay, overlay);
    assert.equal(children.length, 1);
    assert.equal(children[0].textContent, 'NFT Studio');
    assert.equal(children[0].className, 'saito-button-secondary');

    overlay.nft_type = 'image';
    overlay.renderFooterActions();
    assert.equal(children.length, 0);
  } finally {
    global.document = originalDocument;
  }
});

test('NFT Studio has no header item and contributes only to JavaScript and CSS creation', () => {
  const studio = Object.create(NFTStudio.prototype);
  studio.appname = 'NFT Studio';
  studio.slug = 'nftstudio';
  const originalNavigateWindow = global.navigateWindow;
  let destination = '';
  global.navigateWindow = (path) => {
    destination = path;
  };

  try {
    assert.equal(studio.respondTo('saito-header'), null);
    assert.equal(studio.respondTo('saito-nft-create-footer', { type: 'image' }), null);
    const javascriptAction = studio.respondTo('saito-nft-create-footer', { type: 'js' });
    assert.equal(javascriptAction.text, 'NFT Studio');
    assert.equal(studio.respondTo('saito-nft-create-footer', { type: 'css' }).text, 'NFT Studio');

    javascriptAction.callback();
    assert.equal(destination, '/nftstudio');
  } finally {
    global.navigateWindow = originalNavigateWindow;
  }
});
