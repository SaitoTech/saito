const SaitoNFTCardTemplate = require('../../../../lib/saito/ui/saito-nft/saito-nft-card.template');

function escape(app, value) {
  const text = String(value ?? '');
  if (app?.browser?.escapeHTML) {
    return app.browser.escapeHTML(text);
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusLabel(status) {
  const labels = {
    eligible: 'Eligible',
    invalid: 'Invalid',
    immature: 'Not yet mature',
    unverified: 'Signature unverified',
    pending: 'Pending',
    redeemed: 'Redeemed',
    unavailable: 'Not ready'
  };
  return labels[status] || 'Not ready';
}

function maturityText(claim) {
  if (claim?.remaining_blocks == null) {
    return 'Remaining blocks unavailable';
  }
  if (claim.remaining_blocks === '0') {
    return 'Mature';
  }
  return `${claim.remaining_blocks} blocks remaining`;
}

module.exports = function redemptionCardTemplate(app, mod, nft, claim = {}) {
  const terms = claim.terms || {};
  const ticker = terms.ticker || 'Unavailable';
  const amount = terms.amount || 'Unavailable';
  const server = terms.server_publickey || 'Unavailable';
  const extra = `
    <div class="redemption-nft-card-claim">
      <div class="redemption-nft-card-asset">${escape(app, ticker)} ${escape(app, amount)}</div>
      <div class="redemption-nft-card-server">Server ${escape(app, server)}</div>
      <div class="redemption-nft-card-status" data-status="${escape(app, claim.status || 'unavailable')}">${escape(app, statusLabel(claim.status))}</div>
      <div class="redemption-nft-card-maturity">${escape(app, maturityText(claim))}</div>
    </div>
  `;

  return SaitoNFTCardTemplate(app, mod, nft)
    .replace('class="saito-nft-card"', 'class="saito-nft-card redemption-nft-card"')
    .replace('</article>', `${extra}</article>`);
};
