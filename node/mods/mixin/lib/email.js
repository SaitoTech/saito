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

function sendStatusEmail(app, result, payment, detail = '') {
  const amount = payment?.outbound_amount || payment?.inbound_amount || '';
  const ticker = payment?.inbound_ticker || '';
  const recipient = payment?.recipient_publickey || '';
  let subject = 'Saito Token Automated Migration Alert';
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

  send(app, { subject, html });
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
