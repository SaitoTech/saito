const MigrationMain = require('../main');
const ApeBondMainTemplate = require('./main.template');

class ApeBondMain extends MigrationMain {
  constructor(app, mod) {
    super(app, mod);
    this.treasury_error = '';
    this.intents = {};
  }

  isActive() {
    if (!this.app.BROWSER) {
      return false;
    }

    return this.mod.urlpath?.[2]?.toLowerCase() === 'apebond';
  }

  async render() {
    if (document.querySelector('.main')) {
      this.app.browser.replaceElementBySelector(
        ApeBondMainTemplate(this.mod, this.treasury_error),
        '.main'
      );
    } else {
      this.app.browser.addElementToDom(ApeBondMainTemplate(this.mod, this.treasury_error));
    }

    this.attachEvents();
  }

  attachEvents() {
    const migrate_button = document.getElementById('apebond-migrate');
    if (!migrate_button) {
      return;
    }

    migrate_button.onclick = () => {
      const email = document.getElementById('apebond-email')?.value?.trim() || '';
      const normalized_email = this.normalizeEmail(email);

      if (email && !normalized_email) {
        salert('Please enter a valid email address or leave the email field empty.');
        return;
      }

      this.startAutomatedMigration({
        migration_type: 'apebond',
        email: normalized_email
      });
    };
  }

  normalizeEmail(email = '') {
    const normalized_email = String(email).trim();
    if (!normalized_email) {
      return '';
    }

    if (normalized_email.length > 254 || /[\r\n]/.test(normalized_email)) {
      return '';
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized_email) ? normalized_email : '';
  }

  isApeBondPayment(payment) {
    return payment?.migration_type === 'apebond';
  }

  escapeHTML(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll(String.fromCharCode(39), '&#039;');
  }

  returnTeamEmailHTML(payment) {
    if (!this.isApeBondPayment(payment)) {
      return '';
    }

    const unvalidated_address = String(payment?.mixin || '').split('|')[0];
    const address = /^0x[a-fA-F0-9]{40}$/.test(unvalidated_address) ? unvalidated_address : '';
    const address_html = address
      ? `<a href="https://etherscan.io/address/${address}">${this.escapeHTML(address)}</a>`
      : this.escapeHTML(String(payment?.mixin || '').split('|')[0] || 'Unavailable');

    return `
      <hr>
      <h2>APE BOND REVIEW REQUIRED</h2>
      <p>Confirm the origin of this ERC20 SAITO on Etherscan before manually paying the Ape Bond bonus.</p>
      <p>FROM ERC20 ADDRESS: ${address_html}</p>
      <p>USER EMAIL: ${this.escapeHTML(payment.email || 'Not provided')}</p>
      <p>After paying the bonus, notify the user manually if an email address was provided.</p>
    `;
  }

  sendUserMigrationConfirmation(payment) {
    if (!this.isApeBondPayment(payment) || !payment.email) {
      return;
    }

    const amount = this.app.wallet.convertNolanToSaito(payment.nolan_received);
    const formatted_amount = this.app.browser.formatDecimals(amount, true);

    this.app.connection.emit('mailrelay-send-email', {
      to: payment.email,
      from: 'Saito Token Migration <info@saito.tech>',
      subject: 'Your Saito Ape Bond Migration is Complete',
      html: `
        <div>
          <p>Dear Saitozen,</p>
          <p>${this.escapeHTML(formatted_amount)} ERC20 SAITO has been migrated to mainnet SAITO.</p>
          <p>Receiving Saito address: ${this.escapeHTML(payment.public_key)}</p>
          <p>Your Ape Bond bonus will be paid after the origin of the ERC20 SAITO is confirmed.</p>
          <p>You will be alerted again once the bonus is paid.</p>
          <p>Welcome to the Saitoverse!</p>
          <p>-- The Saito Team</p>
        </div>
      `,
      ishtml: true
    });
  }
}

module.exports = ApeBondMain;
