const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Document = require('./lib/document');
const {
  looksLikeWebTransaction,
  createPrepareTransaction,
  readPrepareTransaction,
  downloadTransaction
} = require('./lib/transaction');
const Main = require('./lib/ui/main');
const HomePage = require('./index');

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

    this.document = null;
    this.header = null;
    this.main = new Main(app, this);
  }

  async initialize(app) {
    await super.initialize(app);

    if (this.browser_active) {
      this.header = new SaitoHeader(app, this);
      await this.header.initialize(app);
    }
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
        this.useDocument(await Document.restore(this.app, this, data));
      } catch (err) {
        const known = err?.message === 'That file is not a SaitoSign transaction.';
        this.main.fail(known ? err.message : 'That SaitoSign transaction could not be read.');
      }
      return;
    }

    if (Document.isPdf(file) || text.slice(0, 1024).includes('%PDF')) {
      return this.importPdf(file);
    }

    this.main.fail('Choose a PDF or a SaitoSign transaction.');
  }

  async importPdf(file) {
    if (!Document.isPdf(file) && !(await pdfBytes(file))) {
      this.main.fail('Choose a PDF or a SaitoSign transaction.');
      return;
    }

    let next;
    try {
      next = await Document.open(this.app, this, file);
    } catch (err) {
      this.main.fail('That PDF could not be read.');
      return;
    }

    this.useDocument(next);
  }

  async exportDocument() {
    const document = this.document;
    if (!document || !document.edited) {
      return;
    }

    try {
      const tx = await createPrepareTransaction(this.app, document);
      const base = String(document.file?.name || 'document.pdf').replace(/\.pdf$/i, '');
      downloadTransaction(this.app, tx, `${base || 'document'}.saitosign`);
    } catch (err) {
      this.main.fail('That document could not be exported.');
    }
  }

  useDocument(next) {
    const previous = this.document;
    this.document = next;
    if (previous && previous !== next) {
      previous.close();
    }
    this.main.showPrepare();
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
