const ModTemplate = require('../../lib/templates/modtemplate');
const PeerService = require('saito-js/lib/peer_service').default;
const MailRelayAdmin = require('./lib/admin/mailrelay-admin');
const {
  parseSendgridConfig,
  resolveSendgridTransport,
  redactSendgridConfig
} = require('./lib/config');

class MailRelay extends ModTemplate {
  constructor(app) {
    super(app);

    this.description = 'Module to relay Saito email messages onto the legacy email system.';
    this.categories = 'Communications Utilities';

    this.name = 'MailRelay';
    this.slug = 'mailrelay';
    this.deascription =
      'Adds support for integrating on-chain messages with legacy off-chain email notifications';
    this.categories = 'Core Utilities';
    this.class = 'utility';
    this.status = 'prod';

    this.services = [];

    app.connection.on('mailrelay-send-email', async (data) => {
      console.log('mailrelay-send-email request');
      if (this.services.length > 0) {
        Promise.resolve(this.sendMail(data)).catch((err) => console.error(err));
      } else {
        this.sendMailRelayTransaction(data);
      }
    });
  }

  async initialize(app) {
    //For testing only, no need to initialize module
    await super.initialize(app);

    // browsers will not have server endpoint coded
    if (app.BROWSER) {
      return;
    }

    this.ensureMailRelayService();

    if (this.services.length) {
      console.log('I am a mail relay :)');
    } else {
      console.log('I am not a mail relay :(');
    }

    // add an email
    let email = {
      to: 'richard@saito.tech',
      from: 'network@saito.tech',
      subject: 'Saito Network Initialised',
      text: ''
    };

    if (app.options.server.endpoint != null) {
      email.text = app.options.server.endpoint.host + ' has spun up.';
    } else {
      email.text = 'Just a quick note to let you know that test net just spun up.';
    }

    Promise.resolve(this.sendMail(email)).catch((err) => console.error(err));
  }

  async handlePeerTransaction(app, tx, peer, callback) {
    if (tx == null) {
      return 0;
    }
    let message = tx.returnMessage();

    if (message.module == this.name) {
      if (message.request == 'send email') {
        Promise.resolve(this.sendMail(message.data)).catch((err) => console.error(err));
        return 1;
      }
    }

    return super.handlePeerTransaction(app, tx, peer, callback);
  }

  async sendMailRelayTransaction(email) {
    let newtx = await this.app.wallet.createUnsignedTransaction();

    newtx.msg = {
      module: this.name,
      request: 'send email',
      data: email
    };
    await newtx.sign();

    console.log('trying to send email to mail relay...');

    let peers = await this.app.network.getPeers();
    for (let p of peers) {
      if (p.hasService('mailrelay')) {
        this.app.network.sendTransactionWithCallback(newtx, null, p.publicKey);
        console.log('sent mail request to peer!');
        return false;
      }
    }

    console.warn('No peers offer mail relay service');
    console.log('unsent email: ', email);

    return newtx;
  }

  //
  // only servers will have this
  //
  sendMail(email) {
    if (this.app.BROWSER) {
      return Promise.resolve(false);
    }

    console.info('sending email...', email);

    //array of attahments in formats as defined here
    // ref: https://github.com/guileen/node-sendmail/blob/master/examples/attachmentFile.js

    if (email.attachments == undefined) {
      email.attachments = '';
    }
    if (email.ishtml == undefined) {
      email.ishtml = false;
    }
    if (email.bcc == undefined) {
      email.bcc = '';
    }
    if (email.cc == undefined) {
      email.cc = '';
    }
    if (email.text == undefined) {
      email.text = '';
    }
    if (email.subject == undefined) {
      email.subject = '';
    }
    if (email.html == undefined) {
      email.html = '';
    }
    // Put body of email in correct field
    if (email.ishtml) {
      email.html = email.html || email.text;
      email.text = '';
    } else {
      email.text = email.text || email.html;
      email.html = '';
    }
    // Default to from Saito
    if (!email.from) {
      email.from = 'network@saito';
    }

    if (!email.to) {
      console.error('Invalid email: ', email);
      return Promise.reject(new Error('The invitation email has no recipient.'));
    }

    let transport;
    try {
      transport = this.sendgridTransport();
    } catch (err) {
      console.error('Error sending mail: ' + err);
      return Promise.reject(err);
    }
    if (!transport) {
      return Promise.reject(new Error('The mail relay has no SendGrid transport configured.'));
    }

    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport(transport.config);
      return new Promise((resolve, reject) => {
        transporter.sendMail(email, (err, info) => {
          if (err) {
            console.error(err);
            reject(err);
            return;
          }
          if (info) {
            console.log(info.envelope);
            console.log(info.messageId);
          }
          resolve(info || true);
        });
      });
    } catch (err) {
      console.error('Error sending mail: ' + err);
      return Promise.reject(err);
    }
  }

  returnServices() {
    return this.services;
  }

  /**
   * Prefer process.env.SENDGRID. When it is absent, use the transport stored
   * at app.options.sendgrid.config.
   */
  sendgridTransport() {
    return resolveSendgridTransport(process.env.SENDGRID, this.app?.options);
  }

  ensureMailRelayService() {
    if (this.app.BROWSER || this.services.length > 0) {
      return;
    }
    let transport = null;
    try {
      transport = this.sendgridTransport();
    } catch (err) {
      console.error('Error reading SendGrid configuration: ' + err);
      return;
    }
    if (!transport) {
      return;
    }
    this.services.push(new PeerService(null, 'mailrelay', 'Mail Relay Service'));
  }

  adminSnapshot() {
    const transport = this.sendgridTransport();
    if (!transport) {
      return { configured: false, active: false, source: '', config: null };
    }
    this.ensureMailRelayService();
    return {
      configured: true,
      active: this.services.length > 0,
      source: transport.source,
      config: redactSendgridConfig(transport.config)
    };
  }

  saveSendgridConfig(raw) {
    if (process.env.SENDGRID && String(process.env.SENDGRID).trim()) {
      throw new Error('SendGrid is already supplied by the server environment');
    }

    const config = parseSendgridConfig(raw);
    if (
      !this.app.options.sendgrid ||
      typeof this.app.options.sendgrid !== 'object' ||
      Array.isArray(this.app.options.sendgrid)
    ) {
      this.app.options.sendgrid = {};
    }
    this.app.options.sendgrid.config = config;
    if (this.app.storage?.saveOptions) {
      this.app.storage.saveOptions();
    }
    this.ensureMailRelayService();
    return this.adminSnapshot();
  }

  respondTo(type = '') {
    if (type === 'admin-config') {
      return {
        id: this.returnSlug(),
        name: this.name,
        getConfig: async () => this.adminSnapshot(),
        updateConfig: async (data = {}) => {
          if (data.action === 'save-config') {
            return this.saveSendgridConfig(data.config);
          }
          throw new Error('Unknown SendGrid configuration action');
        }
      };
    }

    if (type === 'admin-sidebar') {
      if (!this.app.BROWSER) {
        return null;
      }
      return {
        id: 'sendgrid',
        name: 'Sendgrid',
        render: () => {
          if (!this.admin_ui) {
            this.admin_ui = new MailRelayAdmin(this.app, this);
          }
          this.admin_ui.render();
        }
      };
    }

    return super.respondTo(type);
  }
}

module.exports = MailRelay;
