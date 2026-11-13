const ModTemplate = require('../../lib/templates/modtemplate');
const PeerService = require('saito-js/lib/peer_service').default;
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const {
  emptyDocument,
  isPdf,
  hasPdf,
  revoke,
  openPdfs,
  hydrate,
  addUser,
  stripSignatures
} = require('./lib/document');
const {
  looksLikeWebTransaction,
  readPrepareTransaction,
  downloadBytes
} = require('./lib/transaction');
const { readZip, looksLikeZip, isZipFile } = require('./lib/zip');
const { buildDocumentArchive, textFromZip } = require('./lib/archive');
const Main = require('./lib/ui/main');
const HomePage = require('./index');
const { verifyEmail, myKeychainEmail, rememberVerifiedEmails, documentUnchanged, createCreatorProof, verifyCreatorProof, finalizeDocument, verifyFinalization, signingConfigurationError } = require('./lib/auth');
const { loadDraft, saveDraft, clearDraft, claimDraft } = require('./lib/draft');
const {
  recoveryPlan,
  sessionWriter,
  rememberWriter,
  newWriterId,
  walletOwnsKey,
  challengedKey,
  clearVerificationQuery,
  announceHandoff,
  listenForHandoff
} = require('./lib/recovery');
const SaitoSignDatabase = require('./lib/database');
const { handleShareRequest } = require('./lib/share-server');
const { sendShare, payloadForUpload, documentFromStored } = require('./lib/share-client');
const { importFailure } = require('./lib/share-protocol');
const { readShareParameters } = require('./lib/share-access');

function currentShareParameters(app) {
  const located = readShareParameters(
    typeof window === 'undefined' ? '' : window.location.search,
    typeof window === 'undefined' ? '' : window.location.hash
  );
  const id = app?.browser?.returnURLParameter?.('share') || '';
  const token = app?.browser?.returnURLParameter?.('token') || '';
  if (id && token) {
    return { id, token };
  }
  return located;
}

class SaitoSign extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'SaitoSign';
    this.slug = 'saitosign';
    this.description = 'Create, sign, and exchange documents with cryptographic proof.';
    this.categories = 'Utilities Productivity';
    this.status = 'beta';
    this.class = 'app';
    this.icon = 'fa-solid fa-file-signature';

    this.styles = ['/saitosign/style.css'];

    this.dev = 1;
    this.retired = false;
    this.recovery = 'none';
    this.recoveryCode = '';
    this.recoveredUser = null;
    this.document = emptyDocument();
    this.database = null;
    this.header = null;
    this.main = new Main(app, this);
    this.skipWalletTabPrompt(app);
  }

  skipWalletTabPrompt(app) {
    const browser = app?.browser;
    if (!browser || browser.__saitosignTabPrompt || typeof window === 'undefined') {
      return;
    }
    const original = browser.checkForMultipleWindows;
    if (typeof original !== 'function') {
      return;
    }
    browser.__saitosignTabPrompt = true;
    browser.checkForMultipleWindows = function () {
      try {
        const url = new URL(window.location.href);
        const path = url.pathname.replace(/\/+$/, '');
        if (path.endsWith('/saitosign') && url.searchParams.has('code')) {
          return;
        }
      } catch (err) {}
      return original.call(this);
    };
  }

  async initialize(app) {
    await super.initialize(app);

    if (!app.BROWSER) {
      this.database = new SaitoSignDatabase(app, this);
      await this.database.ensureSchema();
      try {
        await this.database.deleteExpiredDocuments();
      } catch (err) {}
    }

    if (this.browser_active) {
      this.header = new SaitoHeader(app, this);
      await this.header.initialize(app);
      this.listenForRecovery();
      const share = currentShareParameters(app);
      if (share.id && share.token) {
        this.receivedBy = 'link';
        this.shareLoad = { status: 'Connecting to the sharing server...', error: '' };
        this.shareWait = setTimeout(() => {
          if (this.shareRequested || hasPdf(this.document) || this.shareGate) {
            return;
          }
          this.reportShareFailure('SaitoSign could not find a sharing server. The server must be running and storing documents.');
        }, 20000);
      }
      await this.openSavedDocument();
    }
  }

  returnServices() {
    if (this.app.BROWSER || !this.database) {
      return [];
    }
    return [new PeerService(null, 'saitosign', this.publicKey)];
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (!app.BROWSER || service.service !== 'saitosign' || !this.browser_active || this.shareRequested) {
      return;
    }
    const share = currentShareParameters(app);
    const id = share.id;
    const token = share.token;
    if (!id || !token) {
      return;
    }
    if (this.share?.id === id && this.receivedBy === 'link' && hasPdf(this.document)) {
      return;
    }
    this.shareRequested = true;
    clearTimeout(this.shareWait);
    this.shareLoad = { status: 'Opening the shared document...', error: '' };
    this.main?.showShareLoad(this.shareLoad);
    await this.openSharedLink(peer);
  }

  listenForRecovery() {
    if (this.listeningForRecovery || typeof window === 'undefined') {
      return;
    }
    this.listeningForRecovery = true;
    listenForHandoff(() => this.retireSession());
  }

  async persistDraft(record) {
    if (this.retired) {
      return false;
    }
    const writerId = sessionWriter();
    const next = writerId
      ? { ...record, handoff: { code: record?.code, writerId } }
      : { ...record };
    if (this.receivedBy === 'link' || this.receivedBy === 'file') {
      next.receivedBy = this.receivedBy;
    }
    try {
      return await saveDraft(next);
    } catch (err) {
      return false;
    }
  }

  freezePersistence() {
    const storage = this.app.storage;
    if (storage) {
      storage.active_tab = 0;
      storage.saveOptions = () => {};
    }
    const wallet = this.app.wallet;
    if (wallet) {
      wallet.saveWallet = async () => {};
      if (typeof wallet.save === 'function') {
        wallet.save = async () => {};
      }
    }
  }

  retireSession() {
    if (this.retired) {
      return;
    }
    this.retired = true;
    this.freezePersistence();
    try {
      this.app.browser?.setActiveTab?.(0);
    } catch (err) {}
    try {
      this.main?.workspace?.publish?.close?.();
    } catch (err) {}
    this.main?.showRetired?.();
    setTimeout(() => {
      try {
        window.close();
      } catch (err) {}
    }, 50);
  }

  reportShareFailure(message) {
    const reason = message || 'The shared document could not be opened.';
    this.shareLoad = { status: '', error: reason };
    this.main?.fail(reason);
    this.main?.showShareLoad(this.shareLoad);
  }

  async openSharedLink(peer) {
    const share = currentShareParameters(this.app);
    const id = share.id;
    const token = share.token;
    if (!id || !token) {
      return;
    }
    if (this.share?.id === id && this.receivedBy === 'link' && hasPdf(this.document)) {
      return;
    }
    let result;
    try {
      result = await sendShare(this.app, { action: 'fetch', document_id: id, token }, 30000, peer?.publicKey);
    } catch (err) {
      this.reportShareFailure(err?.message || 'The shared document could not be requested.');
      return;
    }
    if (!result?.success) {
      this.reportShareFailure(result?.error || 'The shared document could not be opened.');
      return;
    }
    if (result.is_encrypted) {
      this.shareLoad = null;
      this.shareGate = {
        id,
        token,
        payload: result.document,
        serverHash: result.document_hash,
        purpose: result.purpose
      };
      if (document.querySelector('.saito-container')) {
        await this.render();
      }
      return;
    }
    this.share = {
      id,
      token,
      purpose: result.purpose,
      encrypted: false,
      password: '',
      serverHash: result.document_hash,
      pending: false,
      conflict: false
    };
    try {
      this.shareLoad = null;
      this.useDocument(await hydrate(await documentFromStored(this.app, result.document, '')), { receivedBy: 'link' });
    } catch (err) {
      this.reportShareFailure(err?.message || 'Document could not be imported. Open the invitation link again, or ask the sender to share it once more.');
    }
  }

  signingUser() {
    const keys = [];
    const raw = String(this.app.wallet?.publicKey || '').trim();
    if (raw) {
      keys.push(raw);
    }
    if (/^[0-9a-fA-F]+$/.test(raw) && raw.length >= 64 && this.app.crypto?.compressPublicKey) {
      const compressed = this.app.crypto.compressPublicKey(raw);
      if (compressed && !keys.includes(compressed)) {
        keys.push(compressed);
      }
    }
    const users = Array.isArray(this.document?.users) ? this.document.users : [];
    return users.find((user) => keys.includes(String(user?.publickey || '').trim())) || null;
  }

  async syncIfShared() {
    const share = this.share;
    if (!share?.id || !hasPdf(this.document)) {
      return { ok: true, skipped: true };
    }
    const password = share.encrypted ? String(share.password || '') : '';
    if (share.encrypted && !password) {
      return { ok: false, error: 'The password used to open this document is no longer available, so the signed copy cannot be uploaded.' };
    }
    share.conflict = false;
    const signer = this.signingUser();
    let payload;
    try {
      payload = await payloadForUpload(this.app, this.document, password);
    } catch (err) {
      return { ok: false, error: err?.message || 'The signed document could not be prepared for upload.' };
    }
    const result = await sendShare(this.app, {
      action: 'update',
      document_id: share.id,
      token: share.token,
      expected_hash: share.serverHash,
      is_encrypted: payload.is_encrypted,
      document: payload.document,
      signer_name: signer?.name || '',
      signer_email: signer?.email || ''
    });
    if (!result?.success) {
      share.conflict = result?.error === 'conflict';
      return {
        ok: false,
        conflict: share.conflict,
        error: share.conflict
          ? 'A newer version of this document was saved by someone else. Open the invitation link again before uploading.'
          : (result?.error || 'The signatures could not be uploaded.')
      };
    }
    share.serverHash = result.document_hash;
    share.pending = false;
    share.conflict = false;
    return { ok: true, complete: result.complete === true, already_present: result.already_present === true };
  }

  setShareNotice(message) {
    if (!this.main?.workspace) {
      return;
    }
    this.main.workspace.notice = message;
    const root = document.querySelector('.saito-container > .workspace');
    if (root) {
      this.main.workspace.update(root);
    }
  }

  async openSavedDocument() {
    if (hasPdf(this.document) || this.share?.id || this.shareGate || this.shareLoad) {
      return;
    }
    const urlCode = this.app.browser.returnURLParameter('code');
    let saved = null;
    try {
      saved = await loadDraft();
    } catch (err) {
      saved = null;
    }
    const plan = recoveryPlan({
      urlCode,
      writerId: sessionWriter(),
      saved,
      eligible: this.recoveryEligible(saved, urlCode || saved?.code)
    });
    this.recovery = plan.action;
    this.recoveryCode = plan.code || '';
    if (plan.action === 'missing' || plan.action === 'none') {
      return;
    }

    let record = saved;
    if (plan.action === 'claim') {
      const writerId = newWriterId();
      try {
        record = await claimDraft(plan.code, writerId);
      } catch (err) {
        record = null;
      }
      if (!record) {
        this.recovery = 'missing';
        return;
      }
      rememberWriter(writerId, plan.code);
      const user = this.verifiedUser(record.document, plan.code);
      if (user) {
        rememberVerifiedEmails(this.app, record.document);
      }
      announceHandoff(plan.code, writerId);
    }

    try {
      this.document = await hydrate(record.document);
      if (this.document.creator && !verifyCreatorProof(this.app, this.document)) {
        throw new Error('Creator identity could not be verified.');
      }
      if (this.document.finalized && !verifyFinalization(this.app, this.document)) {
        throw new Error('Finalized document signature is invalid.');
      }
      this.recoveredUser = this.verifiedUser(this.document, plan.code);
      this.receivedBy = record.receivedBy === 'link' || record.receivedBy === 'file' ? record.receivedBy : '';
      clearVerificationQuery();
    } catch (err) {
      this.document = emptyDocument();
      this.recovery = 'missing';
      this.recoveredUser = null;
    }
  }

  recoveryEligible(saved, code) {
    if (!saved?.document || !code || saved.code !== code || !this.signatureVerifies(saved.document, code)) {
      return false;
    }
    const user = this.verifiedUser(saved.document, code);
    return Boolean(user && walletOwnsKey(this.app, user.publickey));
  }

  verifiedUser(document, code) {
    const users = Array.isArray(document?.users) ? document.users : [];
    return users.find((user) => {
      const entries = Array.isArray(user?.verifications) ? user.verifications : [];
      return entries.some((entry) => {
        return entry?.signature === code
          && challengedKey(entry.message) === String(user?.publickey || '').trim()
          && this.app.crypto.verifyMessage(entry.message, entry.signature, entry.publickey);
      });
    }) || null;
  }

  signatureVerifies(record, signature) {
    const users = Array.isArray(record?.users) ? record.users : [];
    for (const user of users) {
      const entries = Array.isArray(user.verifications) ? user.verifications : [];
      for (const entry of entries) {
        if (entry.signature !== signature || !entry.message || !entry.publickey) {
          continue;
        }
        if (this.app.crypto.verifyMessage(entry.message, entry.signature, entry.publickey)) {
          return true;
        }
      }
    }
    return false;
  }

  async render() {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }
    if (this.retired) {
      this.main?.showRetired?.();
      return;
    }

    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
    }

    this.addComponent(this.header);
    await super.render();
    this.main.render();
    if (this.shareLoad) {
      this.main.showShareLoad(this.shareLoad);
    }
    if (this.shareGate && !this.shareGate.opened && !hasPdf(this.document)) {
      this.shareGate.opened = true;
      this.main?.workspace?.publish?.openUnlock();
    }
  }

  async importFile(file) {
    let header = new Uint8Array();
    try {
      header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    } catch (err) {
      header = new Uint8Array();
    }
    if (isZipFile(file) || looksLikeZip(header)) {
      return this.importZip(file);
    }

    let text = '';
    try {
      text = await file.text();
    } catch (err) {
      text = '';
    }

    if (looksLikeWebTransaction(text)) {
      return this.openSaitoSignText(text);
    }

    if (isPdf(file) || text.slice(0, 1024).includes('%PDF')) {
      return this.importPdfs([file]);
    }

    this.main.fail('Choose a PDF or a SaitoSign transaction.');
  }

  async importZip(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!looksLikeZip(bytes)) {
        this.main.fail(importFailure('invalid'));
        return;
      }
      const entries = await readZip(bytes);
      const text = textFromZip(entries);
      if (!text) {
        this.main.fail(importFailure('unsupported'));
        return;
      }
      return this.openSaitoSignText(text, { imported: true });
    } catch (err) {
      this.main.fail(err?.message && err.message.includes('more than one') ? err.message : importFailure('failed'));
    }
  }

  async openSaitoSignText(text, options = {}) {
    try {
      const data = readPrepareTransaction(this.app, text);
      if (data.finalized && !verifyFinalization(this.app, data)) {
        throw new Error('The creator signature for this finalized document is invalid.');
      }
      const changed = !documentUnchanged(this.app, data);
      if (changed) {
        stripSignatures(data);
      }
      this.useDocument(await hydrate(data), { receivedBy: 'file' });
      if (changed && typeof salert === 'function') {
        salert('This document has changed. Signatures have been removed and signing must begin again.');
      }
    } catch (err) {
      const known = err?.message === 'That file is not a SaitoSign transaction.';
      const integrityError = err?.message?.includes('creator signature') || err?.message?.includes('creator identity');
      this.main.fail(options.imported ? importFailure('failed') : (known || integrityError ? err.message : 'That SaitoSign transaction could not be read.'));
    }
  }

  async importPdf(file) {
    return this.importPdfs([file]);
  }

  async importPdfs(files) {
    if (this.retired) {
      return;
    }
    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!list.length) {
      this.main.fail('Choose a PDF or a SaitoSign transaction.');
      return;
    }

    for (const file of list) {
      if (!isPdf(file) && !(await pdfBytes(file))) {
        this.main.fail('Choose a PDF or a SaitoSign transaction.');
        return;
      }
    }

    let next;
    try {
      next = await openPdfs(list);
      next.creator = String(this.app.wallet?.publicKey || '').trim();
      await createCreatorProof(this.app, next, next.creator);
    } catch (err) {
      this.main.fail('That PDF could not be read.');
      return;
    }

    try {
      await clearDraft();
    } catch (err) {}

    if (!next.users.length) {
      const mine = myKeychainEmail(this.app);
      if (mine) {
        const index = addUser(next, mine.name, next.creator);
        next.users[index].email = mine.email;
        next.users[index].publickey = mine.publickey;
      }
    }

    this.useDocument(next, { receivedBy: 'new' });
    if (this.main && this.main.workspace && this.main.workspace.publish) {
      this.main.workspace.publish.reset();
    }
  }

  async exportDocument(options = {}) {
    if (this.retired) {
      return false;
    }
    const document = this.document;
    if (!hasPdf(document) || (!options.draft && !document.edited)) {
      return false;
    }

    try {
      if (!options.draft && !document.finalized) {
        const walletKey = String(this.app.wallet?.publicKey || '').trim();
        if (!walletKey || !document.creator || walletKey !== document.creator || !verifyCreatorProof(this.app, document)) {
          this.main.fail('Only the document creator can finalize and export this document.');
          return false;
        }
        if (!(document.actions || []).length) {
          this.main.fail('Add at least one action before finalizing this document.');
          return false;
        }
        const problem = signingConfigurationError(document);
        if (problem) {
          this.main.fail(problem);
          return false;
        }
        const finalized = await finalizeDocument(this.app, document, walletKey);
        if (!finalized) {
          this.main.fail('This document could not be finalized.');
          return false;
        }
      } else if (!options.draft && (!verifyCreatorProof(this.app, document) || !verifyFinalization(this.app, document))) {
        this.main.fail('The finalized document creator signature is invalid.');
        return false;
      }
      const archive = await buildDocumentArchive(this.app, document);
      downloadBytes(archive.bytes, archive.filename, 'application/zip');
      return { ok: true, filename: archive.filename };
    } catch (err) {
      this.main.fail('That document could not be exported.');
      return false;
    }
  }

  useDocument(next, options = {}) {
    const previous = this.document;
    if (previous && previous !== next) {
      revoke(previous);
    }
    if (options.receivedBy === 'link' || options.receivedBy === 'file') {
      this.receivedBy = options.receivedBy;
      if (options.receivedBy === 'file') {
        this.share = null;
        this.shareGate = null;
      }
    } else if (options.receivedBy === 'new') {
      this.receivedBy = '';
    }
    this.document = next;
    rememberVerifiedEmails(this.app, next);
    this.main.showWorkspace();
    if (options.notice && this.main.workspace) {
      this.main.workspace.notice = options.notice;
      const root = document.querySelector('.saito-container > .workspace');
      if (root) {
        this.main.workspace.update(root);
      }
    }
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
    if (!tx) {
      return 0;
    }

    let txmsg;
    try {
      txmsg = tx.returnMessage();
    } catch (err) {
      return 0;
    }

    if (txmsg?.request === 'saitosign share') {
      const result = await handleShareRequest(this, txmsg.data || {}, tx);
      if (mycallback) {
        mycallback(result);
      }
      return 1;
    }

    if (txmsg?.request !== 'saitosign verify email') {
      return super.handlePeerTransaction(app, tx, peer, mycallback);
    }

    const result = await this.receiveVerifyEmail(txmsg.data || {});
    if (mycallback) {
      mycallback(result);
    }
    return 1;
  }

  async receiveVerifyEmail(data) {
    const email = String(data.email || '').trim();
    const publickey = String(data.publickey || data.publicKey || '').trim();
    const mail = this.app.modules.returnModule('MailRelay');
    const canSend = !this.app.BROWSER && mail && Array.isArray(mail.services) && mail.services.length > 0;

    if (!email || !publickey) {
      return { success: false };
    }
    if (!canSend) {
      if (!this.dev) {
        return { success: false };
      }
      const message = `Request received for verification of email ${email} with publickey ${publickey}`;
      const signature = this.app.crypto.signMessage(message, await this.app.wallet.getPrivateKey());
      const serverkey = this.publicKey || (await this.app.wallet.getPublicKey());
      return { success: false, error: signature, publickey: serverkey };
    }

    try {
      const proof = await verifyEmail(this.app, email, publickey);
      const serverkey = this.publicKey || (await this.app.wallet.getPublicKey());
      return {
        success: true,
        publickey: serverkey,
        message: proof.message,
        signature: proof.signature
      };
    } catch (err) {
      return { success: false };
    }
  }

  respondTo(type) {
    if (type === 'saito-header' && !this.browser_active) {
      return [
        {
          text: 'SaitoSign',
          icon: this.icon,
          rank: 45,
          type: 'navigation',
          navigation: '/saitosign',
          callback: function () {
            navigateWindow('/saitosign');
          }
        }
      ];
    }

    return super.respondTo(type);
  }

  webServer(app, expressapp, express) {
    const webdir = `${__dirname}/web`;
    const slug = encodeURI(this.returnSlug());
    const mod_self = this;

    expressapp.get(['/' + slug, '/' + slug + '/'], function (req, res) {
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(HomePage(app, mod_self, app.build_number));
    });

    expressapp.use('/' + slug, express.static(webdir));
  }
}

async function pdfBytes(file) {
  try {
    const text = new TextDecoder('latin1').decode(new Uint8Array(await file.arrayBuffer()));
    return text.slice(0, 1024).includes('%PDF');
  } catch (err) {
    return false;
  }
}

module.exports = SaitoSign;
