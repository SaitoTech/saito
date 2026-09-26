const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const {
  emptyDocument,
  isPdf,
  revoke,
  openPdf,
  hydrate,
  addUser,
  stripSignatures
} = require('./lib/document');
const {
  looksLikeWebTransaction,
  createPrepareTransaction,
  readPrepareTransaction,
  downloadTransaction
} = require('./lib/transaction');
const Main = require('./lib/ui/main');
const HomePage = require('./index');
const { verifyEmail, myKeychainEmail, rememberVerifiedEmails, documentUnchanged } = require('./lib/auth');
const { loadDraft, clearDraft } = require('./lib/draft');

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
    this.document = emptyDocument();
    this.header = null;
    this.main = new Main(app, this);
  }

  async initialize(app) {
    await super.initialize(app);

    if (this.browser_active) {
      this.header = new SaitoHeader(app, this);
      await this.header.initialize(app);
      await this.openSavedDocument();
    }
  }

  async openSavedDocument() {
    const code = this.app.browser.returnURLParameter('code');
    if (!code || this.document.document.pdf) {
      return;
    }

    const saved = await loadDraft();
    if (!saved || saved.code !== code || !saved.document || !this.signatureVerifies(saved.document, code)) {
      return;
    }

    try {
      this.document = await hydrate(saved.document);
      rememberVerifiedEmails(this.app, this.document);
    } catch (err) {
      this.document = emptyDocument();
    }
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

    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
    }

    this.addComponent(this.header);
    await super.render();
    this.main.render();
  }

  async importFile(file) {
    let text = '';
    try {
      text = await file.text();
    } catch (err) {
      text = '';
    }

    if (looksLikeWebTransaction(text)) {
      try {
        const data = readPrepareTransaction(this.app, text);
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
        this.main.fail(known ? err.message : 'That SaitoSign transaction could not be read.');
      }
      return;
    }

    if (isPdf(file) || text.slice(0, 1024).includes('%PDF')) {
      return this.importPdf(file);
    }

    this.main.fail('Choose a PDF or a SaitoSign transaction.');
  }

  async importPdf(file) {
    if (!isPdf(file) && !(await pdfBytes(file))) {
      this.main.fail('Choose a PDF or a SaitoSign transaction.');
      return;
    }

    let next;
    try {
      next = await openPdf(file);
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
        const index = addUser(next, mine.name);
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
    const document = this.document;
    if (!document.document.pdf || (!options.draft && !document.edited)) {
      return;
    }

    try {
      const tx = await createPrepareTransaction(this.app, document);
      const base = String(document.document.name || 'document.pdf').replace(/\.pdf$/i, '');
      downloadTransaction(this.app, tx, `${base || 'document'}.saitosign`);
    } catch (err) {
      this.main.fail('That document could not be exported.');
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

module.exports = SaitoSign;
