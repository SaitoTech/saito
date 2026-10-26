const LOW_BALANCE_INTERVAL = 12 * 60 * 60 * 1000;
let lastLowBalanceEmail = 0;

function decimals(app, value) {
  if (typeof app?.browser?.formatDecimals === 'function') {
    return app.browser.formatDecimals(value, true);
  }
  return String(value ?? '');
}

function send(app, message) {
  app.connection?.emit?.('mailrelay-send-email', {
    to: 'migration@saito.tech',
    from: 'Saito Token Migration <info@saito.tech>',
    ishtml: true,
    bcc: 'migration@saito.io',
    ...message
  });
}

function sendLowBalanceEmail(app, balance) {
  const now = Date.now();
  if (lastLowBalanceEmail && now - lastLowBalanceEmail < LOW_BALANCE_INTERVAL) {
    return;
  }
  lastLowBalanceEmail = now;
  send(app, {
    subject: `Low Balance Warning: ${decimals(app, balance)}`,
    text: 'Please deposit more SAITO ASAP',
    ishtml: false
  });
}

function migrationPayload(payment) {
  if (!payment?.payload) {
    return {};
  }
  if (typeof payment.payload === 'object') {
    return payment.payload;
  }
  try {
    return JSON.parse(payment.payload);
  } catch (err) {
    return {};
  }
}

function apeBondReview(payment) {
  const payload = migrationPayload(payment);
  if (payload.migration_type !== 'apebond') {
    return '';
  }
  const unvalidated = String(payment?.inbound_sender || '').split('|')[0];
  const address = /^0x[a-fA-F0-9]{40}$/.test(unvalidated) ? unvalidated : '';
  const shown = address
    ? `<a href="https://etherscan.io/address/${address}">${address}</a>`
    : unvalidated || 'Unavailable';
  return `
      <hr>
      <h2>APE BOND REVIEW REQUIRED</h2>
      <p>Confirm the origin of this ERC20 SAITO on Etherscan before manually paying the Ape Bond bonus.</p>
      <p>FROM ERC20 ADDRESS: ${shown}</p>
      <p>USER EMAIL: ${payload.email || 'Not provided'}</p>
      <p>After paying the bonus, notify the user manually if an email address was provided.</p>
    `;
}

function sendApeBondUserEmail(app, payment) {
  const payload = migrationPayload(payment);
  if (payload.migration_type !== 'apebond' || !payload.email) {
    return;
  }
  const amount = payment?.outbound_amount || payment?.inbound_amount || '';
  send(app, {
    to: payload.email,
    subject: 'Your Saito Ape Bond Migration is Complete',
    html: `
        <div>
          <p>Dear Saitozen,</p>
          <p>${decimals(app, amount)} ERC20 SAITO has been migrated to mainnet SAITO.</p>
          <p>Receiving Saito address: ${payment?.recipient_publickey || ''}</p>
          <p>Your Ape Bond bonus will be paid after the origin of the ERC20 SAITO is confirmed.</p>
          <p>You will be alerted again once the bonus is paid.</p>
          <p>Welcome to the Saitoverse!</p>
          <p>-- The Saito Team</p>
        </div>
      `
  });
}

function sendStatusEmail(app, result, payment, detail = '') {
  const amount = payment?.outbound_amount || payment?.inbound_amount || '';
  const ticker = payment?.inbound_ticker || '';
  const recipient = payment?.recipient_publickey || '';
  const payload = migrationPayload(payment);
  let subject =
    payload.migration_type === 'apebond'
      ? 'Saito Ape Bond Automated Migration Alert'
      : 'Saito Token Automated Migration Alert';
  let html = '';

  if (result === 2) {
    subject += ' (Complete!)';
    html = `<div><p>Saito Automated Migration Complete!</p><hr><p>Migration issued ${decimals(
      app,
      amount
    )} ${ticker} to ${recipient}</p><p>${detail || ''}</p></div>`;
  } else if (result === 1) {
    subject += ' (Submitted)';
    html = `<div><p>Saito Automated Migration Transfer Service</p><hr><p>TICKER: ${ticker}</p><p>AMOUNT: ${decimals(
      app,
      amount
    )}</p><p>FROM: ${payment?.inbound_sender || ''}</p><p>PUBLICKEY: ${recipient}</p><p>EMAIL: ${payment?.email || ''}</p><p>Signed SAITO payout submitted; awaiting on-chain confirmation.</p></div>`;
  } else {
    subject += ' (Error)';
    html = `<div><p>Saito Automated Migration Transfer Service</p><hr><p>TICKER: ${ticker}</p><p>AMOUNT: ${decimals(
      app,
      amount
    )}</p><p>PUBLICKEY: ${recipient}</p><p>EMAIL: ${payment?.email || ''}</p><p>Error: ${detail || ''}</p></div>`;
  }

  html += apeBondReview(payment);
  send(app, { subject, html });
  if (result === 2) {
    sendApeBondUserEmail(app, payment);
  }
}

async function sendFailureNotice(app, publicKey) {
  if (!publicKey || !app?.network?.sendRequestAsTransaction) {
    return;
  }
  app.network.sendRequestAsTransaction('migration failure', { data: null }, null, publicKey);
}

module.exports = {
  sendLowBalanceEmail,
  sendStatusEmail,
  sendFailureNotice
};
