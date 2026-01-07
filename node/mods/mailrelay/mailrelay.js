const ModTemplate = require('../../lib/templates/modtemplate');
const PeerService = require('saito-js/lib/peer_service').default;

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

    this.services = [];

    app.connection.on('mailrelay-send-email', async (data) => {
      console.log('mailrelay-send-email request');
      if (this.services.length > 0) {
        this.sendMail(data);
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

    this.sendMail(email);
  }

  async handlePeerTransaction(app, tx, peer, callback) {
    if (tx == null) {
      return 0;
    }
    let message = tx.returnMessage();

    if (message.module == this.name) {
      if (message.request == 'send email') {
        this.sendMail(message.data);
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
        this.app.network.sendTransactionWithCallback(newtx, null, p.peerIndex);
        console.log('sent mail request to peer!');
        return false;
      }
    }

    console.warn('No peers offer mailrelay service');

    return newtx;
  }

  //
  // only servers will have this
  //
  sendMail(email) {
    if (this.app.BROWSER) {
      return;
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
      return;
    }

    try {
      let credentials = {};
      if (process.env.SENDGRID) {
        credentials = JSON.parse(process.env.SENDGRID);
      }

      const nodemailer = require('nodemailer');

      let transporter = nodemailer.createTransport(credentials);
      transporter.sendMail(email, (err, info) => {
        if (info) {
          console.log(info.envelope);
          console.log(info.messageId);
        } else {
          console.error(err);
        }
      });
    } catch (err) {
      console.error('Error sending mail: ' + err);
    }
  }

  returnServices() {
    this.services = [];
    if (process.env.SENDGRID) {
      this.services.push(new PeerService(null, 'mailrelay', 'Mail Relay Service'));
    }

    if (this.services.length) {
      console.log('I am a mail relay :)');
    } else {
      console.log('I am not a mail relay :(');
    }
    return this.services;
  }
}

module.exports = MailRelay;
