// Store correspondence. BuySaito already emails the team when issuance is short.
// These messages are the notices Store sends when a buyer asks to be told
// once that order can finish.

const SAITO_NOTICE_TO = 'buysaito@saito.tech';
const SAITO_NOTICE_CC = 'richard@saito.tech';
const SAITO_NOTICE_FROM = 'Saito Store <info@saito.tech>';

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
  insufficientFundsFollowupText,
  sendInsufficientFundsFollowup
};
