const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

jest.mock('../../../lib/templates/modtemplate', () =>
  class ModTemplate {
    constructor(app) {
      this.app = app;
      this.publicKey = app.publicKey;
      this.browser_active = false;
    }
    async initialize() {}
    addComponent() {}
    async render() {}
    returnName() {
      return this.name;
    }
    returnSlug() {
      return this.slug;
    }
    buildSocial(social) {
      return { ...social };
    }
    async handlePeerTransaction() {
      return 0;
    }
  }
);
jest.mock('../../../lib/saito/ui/saito-header/saito-header', () => class SaitoHeader {});
jest.mock('../../../lib/saito/ui/saito-overlay/saito-overlay', () => class SaitoOverlay {});
jest.mock('../../../lib/saito/transaction', () => ({
  default: class Transaction {}
}));

const Bugs = require('../../../mods/bugs/bugs');
const BugsDatabase = require('../../../mods/bugs/lib/database');
const { COMPLETED_RETENTION_MS } = require('../../../mods/bugs/lib/constants');
const { isPrunableCompletedBug, midpointWeight, shouldApplyEvent } = require('../../../mods/bugs/lib/ordering');
const { canCreateBug, canUpdateBug } = require('../../../mods/bugs/lib/policy');
const { verifyTransactionSignatureHash } = require('../../../mods/bugs/lib/signature');
const BugEditorTemplate = require('../../../mods/bugs/lib/overlays/bug-editor.template');
const BugsIndex = require('../../../mods/bugs/index');
const BugsMain = require('../../../mods/bugs/lib/main');
const BugsMainTemplate = require('../../../mods/bugs/lib/main.template');
const {
  containsBugHashtag,
  isRootTweetMessage,
  validateBugsMessage
} = require('../../../mods/bugs/lib/validation');

const ALICE = 'A'.repeat(44);
const BOB = 'B'.repeat(44);
const ROOT = 'c'.repeat(128);
const SOURCE = 'd'.repeat(128);
const TX1 = 'e'.repeat(128);
const TX2 = 'f'.repeat(128);
const TX3 = '1'.repeat(128);
const CAROL = 'G'.repeat(44);

function app(overrides = {}) {
  return {
    BROWSER: true,
    publicKey: ALICE,
    options: {},
    crypto: {
      isPublicKey: (key) => /^[A-Z]{44}$/.test(key),
      verifyHashSignature: jest.fn().mockReturnValue(true)
    },
    storage: { saveOptions: jest.fn().mockResolvedValue(undefined) },
    connection: { on: jest.fn(), emit: jest.fn() },
    modules: { returnFirstRespondTo: jest.fn() },
    network: { createPeerService: jest.fn() },
    ...overrides
  };
}

function transaction(message, options = {}) {
  return {
    signature: options.signature || TX1,
    timestamp: options.timestamp || 1000,
    from: [{ publicKey: options.signer || ALICE }],
    returnMessage: () => message,
    getHashForSignature: () => 'signed-hash'
  };
}

function validCreate(overrides = {}) {
  return {
    module: 'Bugs',
    request: 'create bug',
    data: {
      bug_id: ROOT,
      root_tx_sig: ROOT,
      source_tx_sig: SOURCE,
      title: 'Broken submit button',
      status: 'open',
      severity: 'high',
      priority: 'urgent',
      weight: 100,
      reporter_publickey: ALICE,
      assignee_publickey: '',
      ...overrides
    }
  };
}

function openSqlite() {
  const db = new sqlite3.Database(':memory:');
  const storage = {
    runDatabase(sql, params) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ changes: this.changes, lastID: this.lastID });
        });
      });
    },
    queryDatabase(sql, params) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
      });
    }
  };
  return { db, storage };
}

async function installSchema(db) {
  const schema = fs.readFileSync(path.join(__dirname, '../../../mods/bugs/sql/bugs.sql'), 'utf8');
  await new Promise((resolve, reject) => db.exec(schema, (err) => (err ? reject(err) : resolve())));
}

describe('activation and extension responses', () => {
  test('/bugs route is registered without prior activation', () => {
    const mod = new Bugs(app());
    const registrations = [];
    const staticHandler = jest.fn();
    const expressapp = {
      get: (route) => registrations.push(['get', route]),
      use: (route, handler) => registrations.push(['use', route, handler])
    };
    const express = { static: jest.fn().mockReturnValue(staticHandler) };

    mod.webServer(mod.app, expressapp, express);

    expect(express.static).toHaveBeenCalledWith(expect.stringMatching(/mods\/bugs\/web$/));
    expect(registrations).toEqual([
      ['use', '/bugs', staticHandler],
      ['get', '/bugs'],
      ['get', '/bugs/:bug_id']
    ]);
  });

  test('visiting enables Bugs using normal saved options', async () => {
    const mockApp = app();
    const mod = new Bugs(mockApp);
    await expect(mod.enableForUser()).resolves.toBe(true);
    expect(mockApp.options.bugs.enabled).toBe(true);
    expect(mockApp.storage.saveOptions).toHaveBeenCalledTimes(1);
  });

  test('menu and RedSquare actions are hidden before activation and exposed after', () => {
    const mockApp = app();
    const mod = new Bugs(mockApp);
    expect(mod.respondTo('saito-header')).toEqual([]);
    expect(mod.respondTo('redsquare-create')).toBeNull();
    expect(mod.respondTo('redsquare-tweet-menu')).toBeNull();
    mockApp.options.bugs = { enabled: true };
    expect(mod.respondTo('saito-header')[0].text).toBe('Bugs');
    expect(mod.respondTo('redsquare-create').label).toBe('Create Bug');
    expect(mod.respondTo('redsquare-tweet-menu').text).toBe('Capture as Bug');
  });

  test('registers RedSquare service peers while Bugs is the active module', async () => {
    const mockApp = app();
    const mod = new Bugs(mockApp);
    const peer = { publicKey: BOB };
    mod.browser_active = true;
    mod.redsquare = { registerPeer: jest.fn().mockResolvedValue(true) };
    mod.main = { refreshCurrentView: jest.fn().mockResolvedValue(undefined) };

    await mod.onPeerServiceUp(mockApp, peer, { service: 'redsquare' });

    expect(mod.redsquare.registerPeer).toHaveBeenCalledWith(peer);
    expect(mod.main.refreshCurrentView).toHaveBeenCalledTimes(1);
  });
});

describe('browser presentation and route preservation', () => {
  const bug = {
    root_tx_sig: ROOT,
    source_tx_sig: SOURCE,
    title: 'Broken submit button',
    status: 'open',
    severity: 'high',
    priority: 'urgent',
    reporter_publickey: ALICE,
    added_by_publickey: ALICE,
    assignee_publickey: BOB,
    created_at: 1000,
    updated_at: 2000,
    reply_count: 2,
    weight: 100,
    tracked: 1
  };
  const editable = { canCurrentUserEdit: () => true, discoveredCandidates: new Map(), clientBugs: new Map() };

  test('the Bugs loader has module branding and its catch line', () => {
    const mockApp = app({
      browser: { escapeHTML: (value) => value }
    });
    const html = BugsIndex(mockApp, {
      social: { description: 'Bug tracking' },
      categories: 'Utilities',
      returnName: () => 'Bugs'
    }, 1);

    expect(html).toContain('fa-solid fa-bug');
    expect(html).toContain('<span>Saito Bugs</span>');
    expect(html).toContain('There Will Be Bugs');
    expect(html).toContain('href="/redsquare/style.css?v=1"');
    expect(html).not.toContain('saito-chat-icon');
  });

  test('Bugs attaches RedSquare component styles for embedded threads and composers', () => {
    const mod = new Bugs(app());

    expect(mod.styles).toEqual([
      '/saito/saito.css',
      '/redsquare/style.css',
      '/bugs/style.css'
    ]);
  });

  test('the list uses separate active/completed selectors and does not expose transaction signatures', () => {
    const html = BugsMainTemplate.list(
      {
        bugs: [bug],
        loading: false,
        error: '',
        filters: {
          view: 'active',
          status: '',
          severity: '',
          priority: '',
          assignee_publickey: '',
          reporter_publickey: '',
          search: '',
          sort: 'weight'
        }
      },
      editable
    );

    expect(html.match(/class="bugs-view-input saito-checkbox"/g)).toHaveLength(2);
    expect(html).toContain('class="bugs-view-toggle" role="group"');
    expect(html).not.toContain('<fieldset class="bugs-view-toggle"');
    expect(html).toContain('data-view="active"');
    expect(html).toContain('data-view="completed"');
    expect(html).toContain('name="reporter_publickey"');
    expect(html).toContain('<option value="weight">Manual</option>');
    expect(html).toContain('class="bug-row-edit saito-button-secondary small"');
    expect(html).toContain('1970/01/01');
    expect(html).not.toContain('Transaction-driven');
    expect(html).not.toContain(`${ROOT.slice(0, 12)}…`);
  });

  test('the detail uses uniform header actions and signed metadata controls', () => {
    const html = BugsMainTemplate.detail(bug, editable);

    expect(html).toContain('class="bug-detail-status saito-form-select"');
    expect(html).toContain('class="bug-detail-severity saito-form-select"');
    expect(html).toContain('class="bug-detail-priority saito-form-select"');
    expect(html).toContain('value="in_progress"');
    expect(html).toContain('class="bug-detail-back saito-button-square"');
    expect(html).toContain('class="bug-detail-edit saito-button-square"');
    expect(html).toContain('class="bug-detail-delete saito-button-square"');
    expect(html).toContain('class="bug-detail-open-redsquare saito-button-square"');
    expect(html.indexOf('bug-detail-back')).toBeLessThan(html.indexOf(`<h1>${bug.title}</h1>`));
    expect(html.indexOf('bug-detail-edit')).toBeLessThan(
      html.indexOf('bug-detail-delete')
    );
    expect(html.indexOf('bug-detail-delete')).toBeLessThan(
      html.indexOf('bug-detail-open-redsquare')
    );
    expect(html).not.toContain('bug-detail-header-actions');
    expect(html).not.toContain('bug-detail-controls');
    expect(html).not.toContain('Workflow');
    expect(html).not.toContain('> All bugs</button>');
    expect(html).not.toContain('> Edit Bug</button>');
    expect(html).not.toContain('data-action="move-up"');
    expect(html).not.toContain('data-action="move-down"');
    expect(html.match(/1970\/01\/01/g)).toHaveLength(2);
    expect(html).not.toContain(`>${ROOT}<`);
  });

  test('browser fallback filters both views and the RedSquare creator', () => {
    const mod = new Bugs(app());
    mod.clientBugs.set(ROOT, bug);
    mod.clientBugs.set(SOURCE, {
      ...bug,
      root_tx_sig: SOURCE,
      status: 'completed',
      reporter_publickey: BOB
    });

    expect(mod.filterClientBugs({ view: 'all' })).toHaveLength(2);
    expect(mod.filterClientBugs({ view: 'all', reporter_publickey: ALICE })).toEqual([bug]);
    expect(mod.filterClientBugs({ view: 'completed', reporter_publickey: BOB })).toHaveLength(1);
  });

  test('a projection update refreshes the current detail instead of returning to the list', async () => {
    const main = Object.create(BugsMain.prototype);
    main.detailId = jest.fn().mockReturnValue(ROOT);
    main.renderDetail = jest.fn().mockResolvedValue(undefined);
    main.refresh = jest.fn().mockResolvedValue(undefined);

    await main.refreshCurrentView();

    expect(main.renderDetail).toHaveBeenCalledWith(ROOT);
    expect(main.refresh).not.toHaveBeenCalled();
  });

  test('a capture update does not render Bugs into the active RedSquare page', async () => {
    const previousWindow = global.window;
    const listeners = {};
    global.window = { location: { pathname: '/redsquare' } };
    const main = new BugsMain(
      {
        connection: {
          on: (event, callback) => {
            listeners[event] = callback;
          }
        }
      },
      {}
    );
    main.refreshCurrentView = jest.fn().mockResolvedValue(undefined);

    try {
      await listeners['bugs-updated']();
      expect(main.refreshCurrentView).not.toHaveBeenCalled();

      global.window.location.pathname = '/bugs';
      await listeners['bugs-updated']();
      expect(main.refreshCurrentView).toHaveBeenCalledTimes(1);
    } finally {
      global.window = previousWindow;
    }
  });

  test('RedSquare soft navigation is completed with a page load when Bugs remains mounted', async () => {
    const previousDocument = global.document;
    const previousWindow = global.window;
    const bugsView = { isConnected: true };
    const reload = jest.fn();
    global.document = { querySelector: () => bugsView };
    global.window = { location: { pathname: `/bugs/${ROOT}`, reload } };
    const main = Object.create(BugsMain.prototype);
    main.mod = {
      redsquare: {
        openThread: jest.fn(async () => {
          global.window.location.pathname = `/redsquare/tweet/${SOURCE}`;
        })
      }
    };

    try {
      await main.openInRedSquare(bug);
      expect(main.mod.redsquare.openThread).toHaveBeenCalledWith(ROOT, SOURCE);
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      global.document = previousDocument;
      global.window = previousWindow;
    }
  });
});

describe('capture overlay and transaction signatures', () => {
  test('capture editor uses standard Saito overlay and form controls', () => {
    const html = BugEditorTemplate('capture', { title: 'Broken submit button' }, true);

    expect(html).toContain('class="saito-overlay-form bugs-editor bugs-editor-form"');
    expect(html).toContain('class="saito-overlay-form-header-title"');
    expect(html).toContain('class="saito-input"');
    expect(html).toContain('class="saito-form-select"');
    expect(html).toContain('class="saito-textarea"');
    expect(html).toContain('class="saito-button-row bugs-editor-actions"');
  });

  test('transaction verification checks the Saito signing hash without hashing it again', () => {
    const secp256k1 = require('secp256k1');
    const Base58 = require('base-58');
    const privateKey = Buffer.alloc(32, 7);
    const hash = Buffer.alloc(32, 9);
    const signature = secp256k1.sign(hash, privateKey).signature;
    const signer = Base58.encode(Buffer.from(secp256k1.publicKeyCreate(privateKey, true)));
    const tx = {
      signature: Buffer.from(signature).toString('hex'),
      generateHashForSignature: jest.fn(),
      getHashForSignature: () => hash
    };

    expect(verifyTransactionSignatureHash(tx, signer)).toBe(true);
    expect(tx.generateHashForSignature).toHaveBeenCalledTimes(1);
    tx.signature = Buffer.alloc(64, 1).toString('hex');
    expect(verifyTransactionSignatureHash(tx, signer)).toBe(false);
  });
});

describe('RedSquare detection and content separation', () => {
  test('matches #bug as a hashtag, not a substring', () => {
    expect(containsBugHashtag('Crash on save #bug')).toBe(true);
    expect(containsBugHashtag('#BUG: upload failure')).toBe(true);
    expect(containsBugHashtag('debugger')).toBe(false);
    expect(containsBugHashtag('word#bug')).toBe(false);
  });

  test('only a RedSquare root is an independent hashtag candidate', () => {
    const root = { module: 'RedSquare', request: 'create tweet', data: { text: '#bug' } };
    const reply = {
      module: 'RedSquare',
      request: 'create tweet',
      data: { text: '#bug', parent_id: SOURCE, thread_id: ROOT }
    };
    expect(isRootTweetMessage(root)).toBe(true);
    expect(isRootTweetMessage(reply)).toBe(false);
  });

  test('capture metadata validates without copying tweet content or images', () => {
    const message = validCreate({ text: 'must not persist', images: ['image-data'] });
    const result = validateBugsMessage(app(), message);
    expect(result.valid).toBe(true);
    expect(result.data.text).toBeUndefined();
    expect(result.data.images).toBeUndefined();
    expect(result.data.source_tx_sig).toBe(SOURCE);
  });

  test('accepts hexadecimal Saito transaction signatures as RedSquare references', () => {
    const withZeroes = `0${'a'.repeat(127)}`;
    expect(
      validateBugsMessage(
        app(),
        validCreate({
          bug_id: withZeroes,
          root_tx_sig: withZeroes,
          source_tx_sig: withZeroes
        })
      )
    ).toMatchObject({ valid: true });
    expect(
      validateBugsMessage(
        app(),
        validCreate({
          bug_id: 'C'.repeat(64),
          root_tx_sig: 'C'.repeat(64),
          source_tx_sig: 'D'.repeat(64)
        })
      )
    ).toMatchObject({ valid: false, error: 'Invalid RedSquare transaction reference' });
  });

  test('Bugs replies delegate to the RedSquare capability with parent and root', async () => {
    const mod = new Bugs(app());
    mod.redsquare = { composeReply: jest.fn().mockResolvedValue({ signature: TX1 }) };
    await mod.replyToBug({ root_tx_sig: ROOT, source_tx_sig: SOURCE }, 'More detail');
    expect(mod.redsquare.composeReply).toHaveBeenCalledWith({
      root_tx_sig: ROOT,
      parent_tx_sig: SOURCE,
      text: 'More detail',
      publishImmediately: true
    });
  });

  test('a local #bug root is discovered and auto-captured, while a reply is not', async () => {
    const mockApp = app({ options: { bugs: { enabled: true } } });
    const mod = new Bugs(mockApp);
    mod.submitCreate = jest.fn().mockResolvedValue({ signature: TX2 });
    mod.redsquare = { resolveReplyRoot: jest.fn().mockResolvedValue(ROOT) };
    const rootTx = transaction({
      module: 'RedSquare',
      request: 'create tweet',
      data: { text: '#bug Upload fails' }
    });
    const replyTx = transaction(
      {
        module: 'RedSquare',
        request: 'create tweet',
        data: { text: '#bug Me too', parent_id: SOURCE, thread_id: ROOT }
      },
      { signature: TX2 }
    );

    await mod.processRedSquareTransaction(rootTx);
    await mod.processRedSquareTransaction(replyTx);

    expect(mod.discoveredCandidates.has(TX1)).toBe(true);
    expect(mod.discoveredCandidates.has(TX2)).toBe(false);
    expect(mod.submitCreate).toHaveBeenCalledTimes(1);
    expect(mod.submitCreate).toHaveBeenCalledWith(
      expect.objectContaining({ root_tx_sig: TX1, source_tx_sig: TX1 })
    );
  });

  test('a third-party #bug root remains a discoverable candidate until accepted', async () => {
    const mockApp = app({ options: { bugs: { enabled: true } } });
    const mod = new Bugs(mockApp);
    mod.submitCreate = jest.fn();
    await mod.processRedSquareTransaction(
      transaction(
        {
          module: 'RedSquare',
          request: 'create tweet',
          data: { text: '#bug Third-party report' }
        },
        { signer: BOB }
      )
    );
    expect(mod.discoveredCandidates.get(TX1)).toMatchObject({ reporter_publickey: BOB });
    expect(mod.submitCreate).not.toHaveBeenCalled();
  });

  test('a RedSquare reply updates only disposable activity fields for a tracked bug', async () => {
    const mod = new Bugs(app());
    mod.clientBugs.set(ROOT, { root_tx_sig: ROOT, tracked: 1, reply_count: 2, updated_at: 100 });
    mod.redsquare = { resolveReplyRoot: jest.fn() };
    await mod.processRedSquareTransaction(
      transaction(
        {
          module: 'RedSquare',
          request: 'create tweet',
          data: { text: 'A normal reply', parent_id: SOURCE, thread_id: ROOT }
        },
        { signature: TX2, timestamp: 500 }
      )
    );
    expect(mod.clientBugs.get(ROOT)).toMatchObject({ reply_count: 3, updated_at: 500 });
    expect(mod.clientBugs.get(ROOT).text).toBeUndefined();
  });
});

describe('signed handler and delivery behavior', () => {
  test('local, direct, and confirmed delivery reconcile the exact transaction once', async () => {
    const mod = new Bugs(app());
    mod.redsquare = { available: () => false };
    const tx = transaction(validCreate());

    expect(await mod.processBugsTransaction(tx, { direct: true })).toMatchObject({
      accepted: true,
      applied: true,
      duplicate: false
    });
    expect(
      await mod.processBugsTransaction(tx, { block_id: 12, tx_ordinal: 3, confirmed: true })
    ).toMatchObject({ accepted: true, duplicate: true });
    expect(mod.clientBugs.get(ROOT).latest_metadata_block_id).toBe(12);
    expect(mod.clientBugs.get(ROOT).processed_signatures).toEqual([TX1]);
  });

  test('the handler accepts signed mutations from other users and rejects bad signatures', async () => {
    const mockApp = app();
    const mod = new Bugs(mockApp);
    mod.redsquare = { available: () => false };
    await mod.processBugsTransaction(transaction(validCreate()), { direct: true });

    mod.publicKey = BOB;
    mockApp.options.bugs = { administrator_publickey: BOB };
    const otherUserUpdate = transaction(
      {
        module: 'Bugs',
        request: 'update bug',
        data: {
          bug_id: ROOT,
          action: 'set-status',
          status: 'completed',
          previous_metadata_tx_sig: TX1
        }
      },
      { signature: TX2, signer: CAROL }
    );
    await expect(mod.processBugsTransaction(otherUserUpdate)).resolves.toMatchObject({
      accepted: true,
      applied: true
    });
    expect(mod.clientBugs.get(ROOT).status).toBe('completed');

    mockApp.crypto.verifyHashSignature.mockReturnValue(false);
    await expect(
      mod.processBugsTransaction(
        transaction(validCreate({ bug_id: SOURCE, root_tx_sig: SOURCE }), {
          signature: TX3
        })
      )
    ).resolves.toMatchObject({ accepted: false, error: 'Invalid Bugs transaction signature' });
  });

  test('a resolvable RedSquare capability rejects a mismatched source reference', async () => {
    const mod = new Bugs(app());
    mod.redsquare = {
      available: () => true,
      resolveTweet: jest.fn().mockResolvedValue({
        root_tx_sig: ROOT,
        source_tx_sig: TX2,
        reporter_publickey: ALICE
      })
    };
    await expect(mod.processBugsTransaction(transaction(validCreate()))).resolves.toMatchObject({
      accepted: false,
      error: expect.stringContaining('do not resolve')
    });
  });

  test('a signed optimistic update is the same transaction sent directly and on-chain', async () => {
    const direct = jest.fn();
    const propagate = jest.fn().mockResolvedValue(undefined);
    const unsigned = {
      signature: '',
      timestamp: 2000,
      from: [{ publicKey: ALICE }],
      msg: null,
      addTo: jest.fn(),
      sign: jest.fn(async function () {
        this.signature = TX2;
      }),
      returnMessage() {
        return this.msg;
      },
      getHashForSignature: () => 'signed-hash',
      serialize_to_web: () => 'serialized-signed-transaction'
    };
    const mockApp = app({
      wallet: {
        createUnsignedTransactionWithDefaultFee: jest.fn().mockResolvedValue(unsigned)
      },
      network: {
        sendRequestAsTransaction: direct,
        propagateTransaction: propagate,
        createPeerService: jest.fn()
      }
    });
    const mod = new Bugs(mockApp);
    mod.clientBugs.set(ROOT, {
      root_tx_sig: ROOT,
      tracked: 1,
      status: 'open',
      added_by_publickey: ALICE,
      reporter_publickey: ALICE,
      reporter_verified: 0,
      latest_metadata_tx_sig: TX1,
      latest_metadata_block_id: 8,
      processed_signatures: [TX1]
    });

    await mod.submitUpdate(ROOT, 'untrack');

    expect(unsigned.msg.data.previous_metadata_tx_sig).toBe(TX1);
    expect(mod.clientBugs.get(ROOT).tracked).toBe(0);
    expect(direct).toHaveBeenCalledWith(
      'bugs transaction',
      { transaction: 'serialized-signed-transaction' },
      null,
      undefined,
      true
    );
    expect(propagate).toHaveBeenCalledWith(unsigned);
  });

  test('an out-of-order provisional mutation waits for its signed predecessor', async () => {
    const mod = new Bugs(app());
    mod.redsquare = { available: () => false };
    await mod.processBugsTransaction(transaction(validCreate()), {
      block_id: 1,
      confirmed: true
    });
    const second = transaction(
      {
        module: 'Bugs',
        request: 'update bug',
        data: {
          bug_id: ROOT,
          action: 'set-priority',
          priority: 'urgent',
          previous_metadata_tx_sig: TX2
        }
      },
      { signature: TX3, timestamp: 3000 }
    );
    const first = transaction(
      {
        module: 'Bugs',
        request: 'update bug',
        data: {
          bug_id: ROOT,
          action: 'set-status',
          status: 'in_progress',
          previous_metadata_tx_sig: TX1
        }
      },
      { signature: TX2, timestamp: 2000 }
    );

    await expect(mod.processBugsTransaction(second, { direct: true })).resolves.toMatchObject({
      accepted: false,
      deferred: true
    });
    await expect(mod.processBugsTransaction(first, { direct: true })).resolves.toMatchObject({
      accepted: true,
      applied: true
    });
    expect(mod.clientBugs.get(ROOT)).toMatchObject({
      status: 'in_progress',
      priority: 'urgent',
      latest_metadata_tx_sig: TX3
    });
    expect(mod.pendingEvents.size).toBe(0);
  });
});

describe('validation, authority, ordering and retention', () => {
  test.each([
    ['set-status', 'status', 'completed'],
    ['set-severity', 'severity', 'critical'],
    ['set-priority', 'priority', 'urgent'],
    ['set-weight', 'weight', 250],
    ['set-assignee', 'assignee_publickey', BOB],
    ['untrack', null, null]
  ])('%s is represented by a valid signed-mutation payload', (action, field, value) => {
    const data = { bug_id: ROOT, action };
    if (field) data[field] = value;
    expect(validateBugsMessage(app(), { module: 'Bugs', request: 'update bug', data }).valid).toBe(
      true
    );
  });

  test('creation restrictions do not restrict signed updates to existing bugs', () => {
    const policy = { administrator: BOB, maintainers: [], allowedAdders: [], requireMaintainerForAdd: false };
    expect(canCreateBug(policy, ALICE, ALICE)).toBe(true);
    expect(canUpdateBug(policy, ALICE, { added_by_publickey: ALICE, reporter_verified: 0 })).toBe(true);
    expect(canCreateBug({ ...policy, requireMaintainerForAdd: true }, ALICE, ALICE)).toBe(false);
    expect(canUpdateBug(policy, ALICE, { added_by_publickey: BOB, reporter_publickey: ALICE, reporter_verified: 0 })).toBe(true);
    expect(canUpdateBug(policy, ALICE, { added_by_publickey: BOB, reporter_publickey: ALICE, reporter_verified: 1 })).toBe(true);
    expect(canUpdateBug(policy, CAROL, { added_by_publickey: ALICE })).toBe(true);
    expect(canUpdateBug(policy, '', { added_by_publickey: ALICE })).toBe(false);
    expect(canUpdateBug(policy, ALICE, null)).toBe(false);
  });

  test('a browser wallet can edit another user\'s bug without being the administrator', () => {
    const mod = new Bugs(app({ publicKey: CAROL }));
    expect(
      mod.canCurrentUserEdit({
        added_by_publickey: ALICE,
        reporter_publickey: BOB,
        reporter_verified: 1
      })
    ).toBe(true);
  });

  test('confirmed ordering wins over direct delivery and sparse midpoint avoids rebalancing', () => {
    const current = {
      latest_metadata_tx_sig: TX2,
      latest_metadata_block_id: 0,
      latest_metadata_tx_ordinal: 0,
      latest_metadata_timestamp: 200
    };
    expect(shouldApplyEvent(current, { tx_sig: TX1, block_id: 10, tx_ordinal: 1, tx_timestamp: 100 })).toBe(true);
    expect(midpointWeight(100, 200)).toBe(150);
    expect(midpointWeight(100, 101)).toBeNull();
  });

  test('manual reordering signs only the moved bug while a sparse midpoint is available', async () => {
    const mod = new Bugs(app());
    mod.clientBugs.set(ROOT, { root_tx_sig: ROOT, tracked: 1, weight: 100 });
    mod.clientBugs.set(SOURCE, { root_tx_sig: SOURCE, tracked: 1, weight: 200 });
    mod.clientBugs.set(TX1, { root_tx_sig: TX1, tracked: 1, weight: 300 });
    mod.submitUpdate = jest.fn().mockResolvedValue({ signature: TX2 });

    await mod.moveBug(TX1, SOURCE, [ROOT, SOURCE, TX1]);

    expect(mod.submitUpdate).toHaveBeenCalledTimes(1);
    expect(mod.submitUpdate).toHaveBeenCalledWith(TX1, 'set-weight', 150);
  });

  test('completed metadata becomes pruning-eligible after six months and reopening clears it', () => {
    const now = Date.now();
    expect(isPrunableCompletedBug({ status: 'completed', completed_at: now - COMPLETED_RETENTION_MS }, now)).toBe(true);
    expect(isPrunableCompletedBug({ status: 'open', completed_at: 0 }, now)).toBe(false);
  });
});

describe('SQL materialised projection', () => {
  let db;
  let storage;
  let projection;

  beforeEach(async () => {
    ({ db, storage } = openSqlite());
    await installSchema(db);
    projection = new BugsDatabase({ storage }, { completedRetentionMs: COMPLETED_RETENTION_MS });
  });

  afterEach(() => db.close());

  test('create is projected once and duplicate direct/on-chain delivery reconciles confirmation', async () => {
    const validation = validateBugsMessage(app(), validCreate());
    const direct = {
      tx_sig: TX1,
      bug_id: ROOT,
      request: 'create bug',
      action: '',
      signer: ALICE,
      block_id: 0,
      tx_ordinal: 0,
      tx_timestamp: 1000
    };
    expect(await projection.applyAcceptedEvent(validation, direct, true)).toMatchObject({ applied: true, duplicate: false });
    expect(await projection.applyAcceptedEvent(validation, { ...direct, block_id: 12, tx_ordinal: 3 }, true)).toMatchObject({ duplicate: true });
    const bug = await projection.getBug(ROOT);
    expect(bug.latest_metadata_block_id).toBe(12);
    expect((await projection.query('SELECT * FROM bug_events')).length).toBe(1);
  });

  test('status, severity, priority, weight, assignment and untracking only change through events', async () => {
    await projection.applyAcceptedEvent(validateBugsMessage(app(), validCreate()), {
      tx_sig: TX1,
      bug_id: ROOT,
      request: 'create bug',
      action: '',
      signer: ALICE,
      block_id: 1,
      tx_ordinal: 0,
      tx_timestamp: 1000
    });
    const mutations = [
      ['set-status', 'status', 'completed'],
      ['set-severity', 'severity', 'critical'],
      ['set-priority', 'priority', 'urgent'],
      ['set-weight', 'weight', 250],
      ['set-assignee', 'assignee_publickey', BOB],
      ['untrack', null, null]
    ];
    for (let i = 0; i < mutations.length; i++) {
      const [action, field, value] = mutations[i];
      const data = { bug_id: ROOT, action };
      if (field) data[field] = value;
      const validation = validateBugsMessage(app(), { module: 'Bugs', request: 'update bug', data });
      await projection.applyAcceptedEvent(validation, {
        tx_sig: `${'G'.repeat(62)}${String(i + 1).padStart(2, '1')}`,
        bug_id: ROOT,
        request: 'update bug',
        action,
        signer: ALICE,
        block_id: i + 2,
        tx_ordinal: 0,
        tx_timestamp: 2000 + i
      });
    }
    const bug = await projection.getBug(ROOT);
    expect(bug).toMatchObject({
      status: 'completed',
      severity: 'critical',
      priority: 'urgent',
      weight: 250,
      assignee_publickey: BOB,
      tracked: 0
    });
    expect(bug.completed_at).toBe(2000);
    expect((await projection.query('SELECT * FROM bug_events')).length).toBe(7);
  });

  test('active/completed filtering and pruning query use derived completion time', async () => {
    const old = Date.now() - COMPLETED_RETENTION_MS - 1;
    const completed = validateBugsMessage(app(), validCreate({ status: 'completed' }));
    await projection.applyAcceptedEvent(completed, {
      tx_sig: TX1,
      bug_id: ROOT,
      request: 'create bug',
      action: '',
      signer: ALICE,
      block_id: 1,
      tx_ordinal: 0,
      tx_timestamp: old
    });
    expect(await projection.listBugs({ view: 'active' })).toHaveLength(0);
    expect(await projection.listBugs({ view: 'completed' })).toHaveLength(1);
    expect(await projection.listBugs({ view: 'all' })).toHaveLength(1);
    expect(await projection.listBugs({ view: 'all', reporter_publickey: ALICE })).toHaveLength(1);
    expect(await projection.listBugs({ view: 'all', reporter_publickey: BOB })).toHaveLength(0);
    expect(await projection.listPrunable(Date.now())).toHaveLength(1);
  });
});
