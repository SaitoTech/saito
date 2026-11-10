const ModTemplate = require('../../lib/templates/modtemplate');
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
  createPrepareTransaction,
  readPrepareTransaction,
  downloadBytes
} = require('./lib/transaction');
const { createZip, readZip, looksLikeZip, isZipFile } = require('./lib/zip');
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

const ARCHIVE_README = 'This is a SaitoSign zip archive. To sign this document, visit sato.io/SaitoSign, and copy the zip file or the SaitoSign file into the UI and follow the instructions.\n';

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
    }

    if (this.browser_active) {
      this.header = new SaitoHeader(app, this);
      await this.header.initialize(app);
      this.listenForRecovery();
      await this.openSavedDocument();
    }
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
      : record;
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

  async openSavedDocument() {
    if (hasPdf(this.document)) {
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
        this.main.fail('That ZIP archive could not be read.');
        return;
      }
      const entries = await readZip(bytes);
      const text = saitosignTextFromZip(entries);
      if (!text) {
        this.main.fail('That ZIP archive does not contain a SaitoSign document.');
        return;
      }
      return this.openSaitoSignText(text);
    } catch (err) {
      this.main.fail(err?.message || 'That ZIP archive could not be read.');
    }
  }

  async openSaitoSignText(text) {
    try {
      const data = readPrepareTransaction(this.app, text);
      if (data.finalized && !verifyFinalization(this.app, data)) {
        throw new Error('The creator signature for this finalized document is invalid.');
      }
      const changed = !documentUnchanged(this.app, data);
      if (changed) {
        stripSignatures(data);
      }
      this.useDocument(await hydrate(data));
      if (changed && typeof salert === 'function') {
        salert('This document has changed. Signatures have been removed and signing must begin again.');
      }
    } catch (err) {
      const known = err?.message === 'That file is not a SaitoSign transaction.';
      const integrityError = err?.message?.includes('creator signature') || err?.message?.includes('creator identity');
      this.main.fail(known || integrityError ? err.message : 'That SaitoSign transaction could not be read.');
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

    this.useDocument(next);
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
      const tx = await createPrepareTransaction(this.app, document);
      const base = String(document.document.name || 'document.pdf').replace(/\.pdf$/i, '') || 'document';
      const saitosignName = `${base}.saitosign`;
      const saitosignBytes = new TextEncoder().encode(tx.serialize_to_web(this.app));
      const files = [
        { name: saitosignName, data: saitosignBytes },
        { name: 'readme.txt', data: new TextEncoder().encode(ARCHIVE_README) },
        ...pdfZipEntries(document)
      ];
      downloadBytes(createZip(files), `${base}.zip`, 'application/zip');
      return true;
    } catch (err) {
      this.main.fail('That document could not be exported.');
      return false;
    }
  }

  useDocument(next) {
    const previous = this.document;
    if (previous && previous !== next) {
      revoke(previous);
    }
    this.document = next;
    rememberVerifiedEmails(this.app, next);
    this.main.showWorkspace();
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

function pdfZipEntries(record) {
  const used = new Set();
  const list = Array.isArray(record?.document?.pdf) ? record.document.pdf : [];
  return list.map((entry, index) => {
    const data = Uint8Array.from(Buffer.from(String(entry?.pdf || ''), 'base64'));
    return {
      name: `PDFs/${safePdfFilename(entry?.name, index, used)}`,
      data
    };
  });
}

function safePdfFilename(original, index, used) {
  let base = String(original || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .trim()
    .replace(/[^\w.\- ()[\]]+/g, '_')
    .replace(/^\.+/, '');
  if (!base) {
    base = `document-${index + 1}.pdf`;
  }
  if (!/\.pdf$/i.test(base)) {
    base = `${base}.pdf`;
  }
  let name = base;
  let suffix = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base.replace(/\.pdf$/i, '')}-${suffix}.pdf`;
    suffix += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function saitosignTextFromZip(entries) {
  const candidates = [];
  const seen = new Set();

  (entries || []).forEach((entry) => {
    const path = zipEntryPath(entry?.name);
    if (!path) {
      return;
    }
    const parts = path.split('/');
    if (parts[0].toLowerCase() === 'pdfs') {
      return;
    }
    const base = parts[parts.length - 1] || '';
    if (/^readme\.txt$/i.test(base)) {
      return;
    }

    const text = new TextDecoder().decode(entry.data).trim();
    if (!/\.saitosign$/i.test(base) && !looksLikeWebTransaction(text)) {
      return;
    }
    const key = path.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({ path, text });
  });

  if (candidates.length > 1) {
    throw new Error('That ZIP archive contains more than one SaitoSign document.');
  }
  if (!candidates.length) {
    return '';
  }
  return candidates[0].text;
}

function zipEntryPath(name) {
  const parts = String(name || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.');
  if (!parts.length || parts.some((part) => part === '..')) {
    return '';
  }
  return parts.join('/');
}

module.exports = SaitoSign;
