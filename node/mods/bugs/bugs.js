const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Transaction = require('../../lib/saito/transaction').default;

const index = require('./index');
const BugsDatabase = require('./lib/database');
const BugsMain = require('./lib/main');
const BugEditor = require('./lib/overlays/bug-editor');
const RedSquareBridge = require('./lib/redsquare');
const { COMPLETED_RETENTION_MS, DEFAULT_WEIGHT } = require('./lib/constants');
const { midpointWeight, shouldApplyEvent } = require('./lib/ordering');
const { canCreateBug, canUpdateBug, returnPolicy } = require('./lib/policy');
const { verifyTransactionSignatureHash } = require('./lib/signature');
const { containsBugHashtag, isRootTweetMessage, validateBugsMessage } = require('./lib/validation');

class Bugs extends ModTemplate {
  constructor(app) {
    super(app);
    this.app = app;
    this.name = 'Bugs';
    this.slug = 'bugs';
    this.appname = 'Bugs';
    this.description = 'Transaction-driven bug tracking over RedSquare threads';
    this.categories = 'Utilities Development';
    this.icon_fa = 'fa-solid fa-bug';
    this.possibleHome = 0;
    this.styles = [
      '/saito/saito.css',
      '/redsquare/style.css',
      '/bugs/base-candidates.css',
      '/bugs/bugs.css',
      '/bugs/bug-detail.css'
    ];
    this.completedRetentionMs = COMPLETED_RETENTION_MS;
    this.clientBugs = new Map();
    this.discoveredCandidates = new Map();
    this.maxDiscoveredCandidates = 500;
    this.pendingEvents = new Map();
    this.maxPendingEvents = 2000;
    this.maxClientEventsPerBug = 500;
    this.processing = new Map();
    this.autoCapturePending = new Set();
    this.database = null;
    this.redsquare = null;
    this.main = null;
    this.editor = null;
    this.header = null;
    this.serverPeer = '';
    this.restored = false;
    this.restoring = false;
    this.social = this.buildSocial({
      twitter: '@SaitoOfficial',
      title: 'Saito Bugs',
      url: '/bugs',
      description: this.description,
      image: 'https://saito.tech/wp-content/uploads/2022/04/saito_card.png'
    });
  }

  async initialize(app) {
    await super.initialize(app);
    this.redsquare = new RedSquareBridge(app, this);
    if (app.BROWSER) {
      this.editor = new BugEditor(app, this);
      this.main = new BugsMain(app, this);
    } else {
      this.database = new BugsDatabase(app, this);
      setTimeout(
        () => this.restoreProjection().catch((err) => console.error('[Bugs] restore failed', err)),
        0
      );
    }
  }

  async render() {
    if (!this.app.BROWSER || !this.browser_active) return;
    await this.enableForUser();
    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.addComponent(this.header);
    }
    await super.render(this.app, this);
    await this.main.render();
    if (new URLSearchParams(window.location.search).get('create') === '1') {
      window.history.replaceState({}, '', '/bugs');
      this.editor.open('create');
    }
  }

  async enableForUser() {
    this.app.options ||= {};
    this.app.options.bugs ||= {};
    if (this.app.options.bugs.enabled === true) return false;
    this.app.options.bugs.enabled = true;
    await this.app.storage.saveOptions();
    this.app.connection.emit('saito-header-update-message', {
      msg: 'Bugs has been added to your applications',
      timeout: 2500
    });
    return true;
  }

  isEnabled() {
    return this.app.options?.bugs?.enabled === true;
  }

  respondTo(type, obj = null) {
    if (type === 'saito-header') {
      if (!this.isEnabled() || this.browser_active) return [];
      return [
        {
          text: 'Bugs',
          icon: this.icon_fa,
          rank: 95,
          type: 'navigation',
          callback: () => navigateWindow('/bugs')
        }
      ];
    }

    if (type === 'redsquare-create' && this.isEnabled()) {
      return {
        id: 'bugs-create',
        label: 'Create Bug',
        icon: this.icon_fa,
        callback: () => {
          if (this.editor) this.editor.open('create');
          else navigateWindow('/bugs?create=1');
        }
      };
    }

    // This response is ready for the extension point specified in docs/todo.md.
    if (type === 'redsquare-tweet-menu' && this.isEnabled()) {
      return {
        id: 'bugs-capture',
        text: 'Capture as Bug',
        icon: this.icon_fa,
        callback: (context) => this.openCapture(context)
      };
    }

    if (type === 'bugs-api') {
      return {
        capture: (context) => this.openCapture(context),
        isTracked: (rootTxSig) => this.clientBugs.get(rootTxSig)?.tracked === 1,
        open: (rootTxSig) => navigateWindow(`/bugs/${encodeURIComponent(rootTxSig)}`)
      };
    }

    return null;
  }

  returnServices() {
    if (this.app.BROWSER) return [];
    return [this.app.network.createPeerService(null, 'bugs', 'Bugs Workflow Projection')];
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (!app.BROWSER) return;

    if (service.service === 'redsquare') {
      await this.redsquare.registerPeer(peer);
      if (this.browser_active) await this.main.refreshCurrentView();
    }

    if (service.service === 'bugs') {
      this.serverPeer ||= peer.publicKey;
      if (this.browser_active) await this.main.refreshCurrentView();
    }
  }

  shouldAffixCallbackToModule(moduleName) {
    return moduleName === this.name || moduleName === 'RedSquare' ? 1 : 0;
  }

  async onConfirmation(blk, tx, conf) {
    if (Number(conf) !== 0) return;
    const message = tx.returnMessage();
    if (message.module === this.name) {
      await this.processBugsTransaction(tx, this.blockContext(blk, tx));
    } else if (message.module === 'RedSquare' && message.request === 'create tweet') {
      await this.processRedSquareTransaction(tx);
    }
  }

  blockContext(blk, tx) {
    const transactions = blk?.transactions || [];
    const ordinal = transactions.findIndex((candidate) => candidate.signature === tx.signature);
    return {
      block_id: Number(blk?.id || 0),
      tx_ordinal: ordinal < 0 ? 0 : ordinal,
      confirmed: true,
      blk
    };
  }

  async handlePeerTransaction(app, tx, peer, callback = null) {
    const message = tx.returnMessage();
    if (message.request === 'bugs transaction') {
      try {
        const inner = new Transaction();
        inner.deserialize_from_web(app, message.data?.transaction);
        if (!this.verifyTransactionSignature(inner))
          throw new Error('Invalid inner transaction signature');
        const result = await this.processBugsTransaction(inner, { direct: true });
        callback?.(result);
      } catch (err) {
        callback?.({ accepted: false, error: err.message || String(err) });
      }
      return 1;
    }
    if (message.request === 'bugs query' && !app.BROWSER && callback) {
      callback(await this.database.listBugs(message.data || {}));
      return 1;
    }
    if (message.request === 'bugs get' && !app.BROWSER && callback) {
      callback(await this.database.getBug(String(message.data?.root_tx_sig || '').slice(0, 128)));
      return 1;
    }
    return super.handlePeerTransaction(app, tx, peer, callback);
  }

  verifyTransactionSignature(tx) {
    try {
      const signer = this.returnSigner(tx);
      if (typeof this.app.crypto.verifyHashSignature === 'function') {
        return Boolean(
          signer &&
            tx.signature &&
            this.app.crypto.verifyHashSignature(tx.getHashForSignature(), tx.signature, signer)
        );
      }
      return verifyTransactionSignatureHash(tx, signer);
    } catch (err) {
      return false;
    }
  }

  returnSigner(tx) {
    return tx?.from?.[0]?.publicKey || tx?.from?.[0]?.publickey || '';
  }

  returnTimestamp(tx) {
    const timestamp = Number(tx?.timestamp ?? tx?.ts);
    return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : Date.now();
  }

  authorityPolicy() {
    // The module public key is the node administrator only on the server. A
    // browser wallet must not silently grant itself administrator authority.
    return returnPolicy(this.app, this.app.BROWSER ? '' : this.publicKey);
  }

  async processBugsTransaction(tx, context = {}) {
    if (!tx?.signature) return { accepted: false, error: 'Unsigned Bugs transaction' };
    if (this.processing.has(tx.signature)) {
      const result = await this.processing.get(tx.signature);
      if (Number(context.block_id || 0) > 0) {
        return this.processBugsTransaction(tx, context);
      }
      return result;
    }
    this.pendingEvents.delete(tx.signature);
    const task = this._processBugsTransaction(tx, context).finally(() =>
      this.processing.delete(tx.signature)
    );
    this.processing.set(tx.signature, task);
    return task;
  }

  async _processBugsTransaction(tx, context) {
    if (!this.verifyTransactionSignature(tx)) {
      return { accepted: false, error: 'Invalid Bugs transaction signature' };
    }
    const validation = validateBugsMessage(this.app, tx.returnMessage());
    if (!validation.valid) return { accepted: false, error: validation.error };
    const signer = this.returnSigner(tx);
    if (!signer) return { accepted: false, error: 'Missing transaction signer' };

    const event = {
      tx_sig: tx.signature,
      bug_id: validation.data.bug_id,
      request: validation.request,
      action: validation.data.action || '',
      previous_metadata_tx_sig: validation.data.previous_metadata_tx_sig || '',
      signer,
      block_id: Number(context.block_id || 0),
      tx_ordinal: Number(context.tx_ordinal || 0),
      tx_timestamp: this.returnTimestamp(tx)
    };
    const existing = this.app.BROWSER
      ? this.clientBugs.get(event.bug_id)
      : await this.database.getBug(event.bug_id);
    const policy = this.authorityPolicy();
    let reporterVerified = false;
    if (validation.request === 'create bug') {
      let reference;
      try {
        reference = await this.verifyRedSquareReference(validation.data);
      } catch (err) {
        return { accepted: false, error: err.message || 'Invalid RedSquare reference' };
      }
      reporterVerified = Boolean(reference?.verified);
      if (
        reference?.verified &&
        reference.reporter_publickey !== validation.data.reporter_publickey
      ) {
        return { accepted: false, error: 'Reporter does not match the referenced RedSquare tweet' };
      }
      if (existing && !canUpdateBug(policy, signer, existing)) {
        return { accepted: false, error: 'Signer is not authorised to re-track this bug' };
      }
      if (!existing && !canCreateBug(policy, signer, validation.data.reporter_publickey)) {
        return { accepted: false, error: 'Signer is not authorised to add this bug' };
      }
    } else if (!canUpdateBug(policy, signer, existing)) {
      if (!existing) {
        this.deferTransaction(tx, context);
        return { accepted: false, deferred: true, error: 'Bug create transaction has not arrived' };
      }
      return { accepted: false, error: 'Signer is not authorised to update this bug' };
    }

    if (
      existing &&
      event.block_id === 0 &&
      event.previous_metadata_tx_sig &&
      event.previous_metadata_tx_sig !== existing.latest_metadata_tx_sig
    ) {
      this.deferTransaction(tx, context);
      return { accepted: false, deferred: true, error: 'Metadata predecessor has not arrived' };
    }

    const result = this.app.BROWSER
      ? this.applyClientEvent(validation, event, reporterVerified)
      : await this.database.applyAcceptedEvent(validation, event, reporterVerified);

    if (result.accepted) {
      if (validation.request === 'create bug') {
        this.discoveredCandidates.delete(event.bug_id);
      }
      if (!this.app.BROWSER && !context.restoring)
        await this.archiveTransaction(tx, validation, context);
      this.app.connection.emit('bugs-updated', event.bug_id);
      if (result.applied) await this.retryPendingEvents(event.bug_id);
    }
    return result;
  }

  deferTransaction(tx, context) {
    if (this.pendingEvents.size >= this.maxPendingEvents) {
      console.warn('[Bugs] pending event queue full; dropping oldest deferred transaction');
      this.pendingEvents.delete(this.pendingEvents.keys().next().value);
    }
    this.pendingEvents.set(tx.signature, { tx, context });
  }

  async verifyRedSquareReference(data) {
    if (!this.redsquare.available('resolveTweet')) return { verified: false };
    const resolved = await this.redsquare.resolveTweet({
      root_tx_sig: data.root_tx_sig,
      source_tx_sig: data.source_tx_sig
    });
    if (
      !resolved ||
      resolved.root_tx_sig !== data.root_tx_sig ||
      resolved.source_tx_sig !== data.source_tx_sig
    ) {
      throw new Error('RedSquare references do not resolve to the supplied thread');
    }
    return { ...resolved, verified: true };
  }

  applyClientEvent(validation, event, reporterVerified = false) {
    const current = this.clientBugs.get(event.bug_id);
    if (
      current?.latest_metadata_tx_sig === event.tx_sig ||
      current?.processed_signatures?.includes(event.tx_sig)
    ) {
      if (
        current.latest_metadata_tx_sig === event.tx_sig &&
        Number(current.latest_metadata_block_id || 0) === 0 &&
        event.block_id > 0
      ) {
        current.latest_metadata_block_id = event.block_id;
        current.latest_metadata_tx_ordinal = event.tx_ordinal;
      }
      return { accepted: true, applied: false, duplicate: true };
    }
    if (current && !shouldApplyEvent(current, event)) {
      current.processed_signatures = this.appendClientEvent(current, event.tx_sig);
      return { accepted: true, applied: false, duplicate: false };
    }
    const processed = this.appendClientEvent(current, event.tx_sig);
    if (validation.request === 'create bug') {
      const data = validation.data;
      const bug = {
        ...(current || {}),
        ...data,
        added_by_publickey: event.signer,
        reporter_verified: reporterVerified ? 1 : current?.reporter_verified || 0,
        tracked: 1,
        reply_count: current?.reply_count || 0,
        created_at: current?.created_at || event.tx_timestamp,
        updated_at: event.tx_timestamp,
        completed_at: data.status === 'completed' ? event.tx_timestamp : 0,
        latest_metadata_tx_sig: event.tx_sig,
        latest_metadata_previous_tx_sig: event.previous_metadata_tx_sig || '',
        latest_metadata_block_id: event.block_id,
        latest_metadata_tx_ordinal: event.tx_ordinal,
        latest_metadata_timestamp: event.tx_timestamp,
        processed_signatures: processed
      };
      this.clientBugs.set(event.bug_id, bug);
    } else {
      const bug = { ...current, processed_signatures: processed, updated_at: event.tx_timestamp };
      const data = validation.data;
      const field = {
        'set-title': 'title',
        'set-status': 'status',
        'set-severity': 'severity',
        'set-priority': 'priority',
        'set-weight': 'weight',
        'set-assignee': 'assignee_publickey',
        untrack: 'tracked',
        retrack: 'tracked'
      }[data.action];
      bug[field] = data.action === 'untrack' ? 0 : data.action === 'retrack' ? 1 : data[field];
      if (data.action === 'set-status')
        bug.completed_at = data.status === 'completed' ? event.tx_timestamp : 0;
      bug.latest_metadata_tx_sig = event.tx_sig;
      bug.latest_metadata_previous_tx_sig = event.previous_metadata_tx_sig || '';
      bug.latest_metadata_block_id = event.block_id;
      bug.latest_metadata_tx_ordinal = event.tx_ordinal;
      bug.latest_metadata_timestamp = event.tx_timestamp;
      this.clientBugs.set(event.bug_id, bug);
    }
    return { accepted: true, applied: true, duplicate: false };
  }

  appendClientEvent(current, txSig) {
    const signatures = [...(current?.processed_signatures || []), txSig];
    return [...new Set(signatures)].slice(-this.maxClientEventsPerBug);
  }

  async retryPendingEvents(bugId) {
    const retry = [...this.pendingEvents.entries()].filter(([, pending]) => {
      const msg = pending.tx.returnMessage();
      return (msg.data?.bug_id || msg.data?.root_tx_sig) === bugId;
    });
    for (const [signature, pending] of retry) {
      this.pendingEvents.delete(signature);
      await this.processBugsTransaction(pending.tx, pending.context);
    }
  }

  async archiveTransaction(tx, validation, context) {
    tx.optional ||= {};
    tx.optional.bugs_block_id = Number(context.block_id || 0);
    tx.optional.bugs_tx_ordinal = Number(context.tx_ordinal || 0);
    await this.app.storage.saveTransaction(
      tx,
      {
        field1: 'Bugs',
        field2: validation.data.bug_id,
        field3: validation.request,
        block_id: Number(context.block_id || 0)
      },
      'localhost',
      context.confirmed ? context.blk : null
    );
    if (context.confirmed) {
      await this.app.storage.updateTransaction(
        tx,
        {
          field1: 'Bugs',
          field2: validation.data.bug_id,
          field3: validation.request,
          block_id: Number(context.block_id || 0)
        },
        'localhost',
        1
      );
    }
  }

  async restoreProjection() {
    if (this.restored || this.restoring || this.app.BROWSER) return;
    this.restoring = true;
    const limit = 1000;
    let createdEarlierThan = 0;
    try {
      while (true) {
        const query = { field1: 'Bugs', limit };
        if (createdEarlierThan > 0) query.created_earlier_than = createdEarlierThan;
        const transactions = await new Promise((resolve) => {
          this.app.storage.loadTransactions(query, resolve, 'localhost');
        });
        const page = Array.isArray(transactions) ? transactions : [];
        page.sort((a, b) => this.returnTimestamp(b) - this.returnTimestamp(a));
        for (const tx of page) {
          await this.processBugsTransaction(tx, {
            restoring: true,
            block_id: Number(tx.optional?.bugs_block_id || 0),
            tx_ordinal: Number(tx.optional?.bugs_tx_ordinal || 0)
          });
        }
        if (page.length < limit) break;
        const nextCursor = Math.min(...page.map((tx) => this.returnTimestamp(tx)));
        if (
          !Number.isSafeInteger(nextCursor) ||
          nextCursor <= 0 ||
          nextCursor === createdEarlierThan
        )
          break;
        createdEarlierThan = nextCursor;
      }
      this.restored = true;
    } finally {
      this.restoring = false;
    }
  }

  async processRedSquareTransaction(tx) {
    const message = tx.returnMessage();
    const data = message.data || {};
    const root = isRootTweetMessage(message);
    if (!root) {
      const rootTxSig =
        data.thread_id || (await this.redsquare.resolveReplyRoot(tx).catch(() => ''));
      if (!rootTxSig) return;
      if (this.app.BROWSER) {
        const bug = this.clientBugs.get(rootTxSig);
        if (bug?.tracked === 1) {
          bug.reply_count = Number(bug.reply_count || 0) + 1;
          bug.updated_at = Math.max(Number(bug.updated_at || 0), this.returnTimestamp(tx));
          this.app.connection.emit('bugs-updated', rootTxSig);
        }
      } else {
        await this.database.noteReply(rootTxSig, this.returnTimestamp(tx));
      }
      return;
    }
    if (!containsBugHashtag(data.text)) return;
    const reporter = this.returnSigner(tx);
    const candidate = {
      root_tx_sig: tx.signature,
      source_tx_sig: tx.signature,
      reporter_publickey: reporter,
      title: this.titleFromTweet(data.text)
    };
    if (
      !this.discoveredCandidates.has(tx.signature) &&
      this.discoveredCandidates.size >= this.maxDiscoveredCandidates
    ) {
      this.discoveredCandidates.delete(this.discoveredCandidates.keys().next().value);
    }
    this.discoveredCandidates.set(tx.signature, candidate);
    this.app.connection.emit('bugs-candidate-discovered', tx.signature);
    if (
      this.app.BROWSER &&
      this.isEnabled() &&
      reporter === this.publicKey &&
      !this.clientBugs.has(tx.signature) &&
      !this.autoCapturePending.has(tx.signature)
    ) {
      this.autoCapturePending.add(tx.signature);
      try {
        await this.submitCreate(candidate);
      } finally {
        this.autoCapturePending.delete(tx.signature);
      }
    }
  }

  titleFromTweet(text) {
    const line = String(text || '')
      .split(/\r?\n/)
      .map((value) => value.replace(/(^|\s)#bug(?=$|[\s.,!?;:()[\]{}])/gi, ' ').trim())
      .find(Boolean);
    return (line || 'Bug report').slice(0, 180);
  }

  async createSignedTransaction(request, data, recipients = []) {
    const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.publicKey);
    tx.msg = { module: this.name, request, data };
    for (const publicKey of new Set(recipients.filter(Boolean))) {
      if (publicKey !== this.publicKey) tx.addTo(publicKey);
    }
    await tx.sign();
    if (!tx.signature) throw new Error('Unable to sign Bugs transaction');
    return tx;
  }

  async submitCreate(data) {
    const payload = {
      bug_id: data.root_tx_sig,
      root_tx_sig: data.root_tx_sig,
      source_tx_sig: data.source_tx_sig || data.root_tx_sig,
      title: data.title,
      status: data.status || 'open',
      severity: data.severity || 'medium',
      priority: data.priority || 'normal',
      weight: Number.isSafeInteger(Number(data.weight))
        ? Number(data.weight)
        : await this.nextWeight(),
      reporter_publickey: data.reporter_publickey || '',
      assignee_publickey: data.assignee_publickey || '',
      note_tx_sig: data.note_tx_sig || '',
      previous_metadata_tx_sig: this.clientBugs.get(data.root_tx_sig)?.latest_metadata_tx_sig || ''
    };
    const tx = await this.createSignedTransaction('create bug', payload, [
      payload.reporter_publickey,
      payload.assignee_publickey
    ]);
    return this.deliverSignedTransaction(tx);
  }

  async submitUpdate(rootTxSig, action, value = null) {
    const bug = this.clientBugs.get(rootTxSig);
    const payload = {
      bug_id: rootTxSig,
      action,
      previous_metadata_tx_sig: bug?.latest_metadata_tx_sig || ''
    };
    const key = {
      'set-title': 'title',
      'set-status': 'status',
      'set-severity': 'severity',
      'set-priority': 'priority',
      'set-weight': 'weight',
      'set-assignee': 'assignee_publickey'
    }[action];
    if (key) payload[key] = value;
    const tx = await this.createSignedTransaction('update bug', payload, [
      bug?.reporter_publickey,
      action === 'set-assignee' ? value : bug?.assignee_publickey
    ]);
    return this.deliverSignedTransaction(tx);
  }

  async deliverSignedTransaction(tx) {
    const before = this.app.BROWSER ? new Map(this.clientBugs) : null;
    const local = await this.processBugsTransaction(tx, { optimistic: true });
    if (!local.accepted) throw new Error(local.error || 'Bugs transaction was rejected locally');
    try {
      const serialized = tx.serialize_to_web(this.app);
      this.app.network.sendRequestAsTransaction(
        'bugs transaction',
        { transaction: serialized },
        null,
        this.serverPeer || undefined,
        true
      );
      await this.app.network.propagateTransaction(tx);
      return tx;
    } catch (err) {
      if (before) this.clientBugs = before;
      this.app.connection.emit('bugs-updated');
      throw err;
    }
  }

  async createBugFromComposer(metadata) {
    const result = await this.redsquare.composeRoot({
      text: '',
      images: true,
      prompt: 'Describe the bug'
    });
    if (result?.signature || result?.tx) {
      const resolved = await this.normalizeTweetContext(result.tx || result);
      return this.submitCreate({ ...metadata, ...resolved });
    }
    return result;
  }

  async openCapture(context) {
    if (!this.editor) return navigateWindow('/bugs');
    const values = await this.normalizeTweetContext(context);
    return this.editor.open('capture', values);
  }

  async captureTweet(context, metadata) {
    const reference = await this.normalizeTweetContext(context);
    let noteTxSig = '';
    if (metadata.note) {
      const note = await this.redsquare.composeReply({
        root_tx_sig: reference.root_tx_sig,
        parent_tx_sig: reference.source_tx_sig,
        text: metadata.note,
        publishImmediately: true
      });
      noteTxSig = note?.signature || note?.tx?.signature || '';
    }
    return this.submitCreate({ ...metadata, ...reference, note_tx_sig: noteTxSig });
  }

  async normalizeTweetContext(context) {
    if (context?.root_tx_sig && context?.source_tx_sig) return context;
    if (context?.transaction || context?.tx || context?.signature) {
      const tx = context.transaction || context.tx || context;
      const msg = tx.returnMessage?.() || context.message || {};
      const data = msg.data || {};
      return {
        root_tx_sig: data.thread_id || tx.signature || context.signature,
        source_tx_sig: tx.signature || context.signature,
        reporter_publickey: this.returnSigner(tx) || context.reporter_publickey || '',
        title: context.title || this.titleFromTweet(data.text)
      };
    }
    return this.redsquare.resolveTweet(context);
  }

  async replyToBug(bug, text = '') {
    return this.redsquare.composeReply({
      root_tx_sig: bug.root_tx_sig,
      parent_tx_sig: bug.source_tx_sig,
      text,
      publishImmediately: Boolean(text)
    });
  }

  async requestInformation(bug) {
    const reply = await this.redsquare.composeReply({
      root_tx_sig: bug.root_tx_sig,
      parent_tx_sig: bug.source_tx_sig,
      prompt: 'What additional information is required?'
    });
    if (!reply) return null;
    return this.submitUpdate(bug.root_tx_sig, 'set-status', 'needs_information');
  }

  async updateBugFields(rootTxSig, current, values) {
    const changes = [
      ['set-title', 'title'],
      ['set-status', 'status'],
      ['set-severity', 'severity'],
      ['set-priority', 'priority'],
      ['set-assignee', 'assignee_publickey']
    ];
    const transactions = [];
    for (const [action, field] of changes) {
      if (String(current[field] || '') !== String(values[field] || '')) {
        transactions.push(await this.submitUpdate(rootTxSig, action, values[field] || ''));
      }
    }
    return transactions;
  }

  async handleWorkflowAction(bug, action, value) {
    try {
      if (action === 'edit') return this.editor.open('edit', bug);
      if (action === 'request-information') return this.requestInformation(bug);
      if (action === 'move-up' || action === 'move-down') {
        const list = await this.loadBugs({
          view: bug.status === 'completed' ? 'completed' : 'active',
          sort: 'weight'
        });
        const index = list.findIndex((row) => row.root_tx_sig === bug.root_tx_sig);
        const target = list[index + (action === 'move-up' ? -1 : 1)];
        if (target)
          return this.moveBug(
            bug.root_tx_sig,
            target.root_tx_sig,
            list.map((row) => row.root_tx_sig)
          );
        return null;
      }
      if (action === 'untrack') {
        if (
          !(await sconfirm(
            'Remove this bug from Bugs? The RedSquare thread will remain unchanged.'
          ))
        )
          return null;
        return this.submitUpdate(bug.root_tx_sig, 'untrack');
      }
      return this.submitUpdate(bug.root_tx_sig, action, value);
    } catch (err) {
      this.showError(err);
      return null;
    }
  }

  async moveBug(movedId, targetId, orderedIds = []) {
    const list = orderedIds.length
      ? orderedIds.map((id) => this.clientBugs.get(id)).filter(Boolean)
      : [...this.clientBugs.values()]
          .filter((bug) => bug.tracked === 1)
          .sort((a, b) => Number(a.weight) - Number(b.weight));
    const from = list.findIndex((bug) => bug.root_tx_sig === movedId);
    const target = list.findIndex((bug) => bug.root_tx_sig === targetId);
    if (from < 0 || target < 0 || from === target) return null;
    const [moved] = list.splice(from, 1);
    const insertion = list.findIndex((bug) => bug.root_tx_sig === targetId);
    list.splice(from < target ? insertion + 1 : insertion, 0, moved);
    const index = list.findIndex((bug) => bug.root_tx_sig === movedId);
    const weight = midpointWeight(list[index - 1]?.weight, list[index + 1]?.weight, DEFAULT_WEIGHT);
    if (weight != null) return this.submitUpdate(movedId, 'set-weight', weight);

    // Sparse slots are exhausted. Rebalancing is uncommon and every changed
    // weight still has its own signed, independently valid Bugs transaction.
    for (let i = 0; i < list.length; i++) {
      const desired = (i + 1) * 100;
      if (Number(list[i].weight) !== desired) {
        await this.submitUpdate(list[i].root_tx_sig, 'set-weight', desired);
      }
    }
    return true;
  }

  async nextWeight() {
    const rows = [...this.clientBugs.values()];
    return rows.length
      ? Math.max(...rows.map((bug) => Number(bug.weight || 0))) + 100
      : DEFAULT_WEIGHT;
  }

  canCurrentUserEdit(bug) {
    return canUpdateBug(this.authorityPolicy(), this.publicKey, bug);
  }

  async loadBugs(filters = {}) {
    if (!this.app.BROWSER) return this.database.listBugs(filters);
    const rows = await this.peerRequest('bugs query', filters).catch(() => null);
    if (Array.isArray(rows)) {
      for (const bug of rows) this.clientBugs.set(bug.root_tx_sig, bug);
      return rows;
    }
    return this.filterClientBugs(filters);
  }

  async loadBug(rootTxSig) {
    if (!this.app.BROWSER) return this.database.getBug(rootTxSig);
    const row = await this.peerRequest('bugs get', { root_tx_sig: rootTxSig }).catch(() => null);
    if (row?.root_tx_sig) this.clientBugs.set(row.root_tx_sig, row);
    return row || this.clientBugs.get(rootTxSig) || null;
  }

  peerRequest(request, data) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Bugs service did not respond')), 6000);
      this.app.network.sendRequestAsTransaction(
        request,
        data,
        (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        this.serverPeer || undefined
      );
    });
  }

  filterClientBugs(filters = {}) {
    const rows = [...this.clientBugs.values()]
      .filter((bug) => bug.tracked === 1)
      .filter((bug) =>
        filters.view === 'all'
          ? true
          : filters.view === 'completed'
            ? bug.status === 'completed'
            : bug.status !== 'completed'
      )
      .filter((bug) => !filters.status || bug.status === filters.status)
      .filter((bug) => !filters.severity || bug.severity === filters.severity)
      .filter((bug) => !filters.priority || bug.priority === filters.priority)
      .filter(
        (bug) =>
          !filters.assignee_publickey || bug.assignee_publickey === filters.assignee_publickey
      )
      .filter(
        (bug) =>
          !filters.reporter_publickey || bug.reporter_publickey === filters.reporter_publickey
      )
      .filter(
        (bug) => !filters.search || bug.title.toLowerCase().includes(filters.search.toLowerCase())
      );
    const rank = (values, value) => values.indexOf(value);
    const sort = {
      updated: (a, b) => Number(b.updated_at) - Number(a.updated_at),
      created: (a, b) => Number(b.created_at) - Number(a.created_at),
      severity: (a, b) =>
        rank(['critical', 'high', 'medium', 'low'], a.severity) -
        rank(['critical', 'high', 'medium', 'low'], b.severity),
      priority: (a, b) =>
        rank(['urgent', 'high', 'normal', 'low'], a.priority) -
        rank(['urgent', 'high', 'normal', 'low'], b.priority),
      weight: (a, b) => Number(a.weight) - Number(b.weight)
    }[filters.sort || 'weight'];
    return rows.sort(sort || ((a, b) => Number(a.weight) - Number(b.weight)));
  }

  showError(error) {
    const message = error?.message || String(error);
    this.app.connection.emit('saito-header-update-message', { msg: message, timeout: 5000 });
  }

  webServer(app, expressapp, express) {
    const webdir = `${__dirname}/web`;
    const mod = this;
    const page = (req, res) => {
      const social = {
        ...mod.social,
        url: `${req.protocol}://${req.headers.host}${req.originalUrl}`
      };
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(index(app, mod, app.build_number, social));
    };
    expressapp.use('/bugs', express.static(webdir));
    expressapp.get('/bugs', page);
    expressapp.get('/bugs/:bug_id', page);
  }
}

module.exports = Bugs;
