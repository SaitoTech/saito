// Store correspondence. BuySaito already emails the team when issuance is short.
// These messages are the notices Store sends when a buyer asks to be told
// once that order can finish.

const SAITO_NOTICE_TO = 'buysaito@saito.tech';
const SAITO_NOTICE_CC = 'richard@saito.tech';
const SAITO_NOTICE_FROM = 'Saito Store <info@saito.tech>';
const WITHDRAWAL_NOTICE_TO = 'info@saito.io';
const WITHDRAWAL_NOTICE_BCC = 'migration@saito.tech';

function plain(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();
}

function normalizeWithdrawalEmail(value) {
  const email = plain(value);
  if (!email || email.length > 254 || /[,\s<>]/.test(email)) {
    return '';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return '';
  }
  return email;
}

function deliverWithdrawalEmail(app, message) {
  try {
    if (!app?.connection?.emit) {
      console.error('Store withdrawal email was not sent: mail relay is unavailable');
      return;
    }
    app.connection.emit('mailrelay-send-email', message);
  } catch (err) {
    console.error('Store withdrawal email failed', err);
  }
}

function sendWithdrawalNotices(app, details = {}) {
  const ticker = plain(details.ticker).toUpperCase();
  const publicKey = plain(details.publicKey);
  const address = plain(details.address);
  const amount = plain(details.amount);
  const email = normalizeWithdrawalEmail(details.email);
  const requestedAt = Number(details.requestedAt);
  const when = Number.isFinite(requestedAt) ? new Date(requestedAt).toISOString() : new Date().toISOString();
  const lines = [
    'A SAITO Store withdrawal has been queued and is ready for manual transfer within 24 hours.',
    '',
    `SAITO public key: ${publicKey || 'unavailable'}`,
    `Destination ${ticker || 'address'}: ${address || 'unavailable'}`,
    `Amount: ${amount || 'unavailable'}${ticker ? ` ${ticker}` : ''}`,
    `Email: ${email || 'not provided'}`,
    `Requested: ${when}`
  ];

  deliverWithdrawalEmail(app, {
    to: WITHDRAWAL_NOTICE_TO,
    bcc: WITHDRAWAL_NOTICE_BCC,
    from: SAITO_NOTICE_FROM,
    subject: `New Web3 Withdrawal Request - ${ticker || 'CRYPTO'}`,
    text: lines.join('\n'),
    ishtml: false
  });

  if (!email) {
    return;
  }
  deliverWithdrawalEmail(app, {
    to: email,
    bcc: WITHDRAWAL_NOTICE_BCC,
    from: SAITO_NOTICE_FROM,
    subject: `Your ${ticker || 'crypto'} withdrawal request`,
    text: [
      `Your ${ticker || 'crypto'} withdrawal request is queued.`,
      '',
      `Amount: ${amount || 'unavailable'}${ticker ? ` ${ticker}` : ''}`,
      `Destination: ${address || 'unavailable'}`,
      '',
      'It may take up to 24 hours to send the funds.',
      '',
      'If you need support, email info@saito.io.'
    ].join('\n'),
    ishtml: false
  });
}

function insufficientFundsFollowupText(details = {}) {
  const email = String(details.email || '').trim();
  const title = String(details.title || 'Store item').trim();
  const payment = String(details.payment || '').trim();
  const nftId = String(details.nftId || '').trim();
  const publicKey = String(details.publicKey || '').trim();
  const reservationId = String(details.reservationId || '').trim();

  return [
    'A buyer asked to be emailed when their Store order can be completed.',
    '',
    'Their crypto payment is already recorded. The purchase stays in the BuySaito queue and completes on its own once the server has enough SAITO to issue.',
    '',
    `Buyer email: ${email}`,
    `Item: ${title}`,
    `Payment: ${payment || 'unavailable'}`,
    `NFT: ${nftId || 'unavailable'}`,
    `Buyer public key: ${publicKey || 'unavailable'}`,
    `Reservation: ${reservationId || 'unavailable'}`,
    '',
    'Please contact the buyer at this address when the order completes.'
  ].join('\n');
}

function sendInsufficientFundsFollowup(app, details = {}) {
  const email = String(details.email || '').trim();
  if (!app?.connection?.emit || !email) {
    return false;
  }

  app.connection.emit('mailrelay-send-email', {
    to: SAITO_NOTICE_TO,
    cc: [SAITO_NOTICE_CC, email].join(', '),
    from: SAITO_NOTICE_FROM,
    subject: `Store order waiting on SAITO — ${String(details.title || 'Store item').trim()}`,
    text: insufficientFundsFollowupText(details),
    ishtml: false
  });
  return true;
}

module.exports = {
  SAITO_NOTICE_TO,
  SAITO_NOTICE_CC,
  SAITO_NOTICE_FROM,
  WITHDRAWAL_NOTICE_TO,
  WITHDRAWAL_NOTICE_BCC,
  insufficientFundsFollowupText,
  sendInsufficientFundsFollowup,
  normalizeWithdrawalEmail,
  sendWithdrawalNotices
};
