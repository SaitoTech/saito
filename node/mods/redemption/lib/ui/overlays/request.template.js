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

module.exports = function requestTemplate(app, claim) {
  const terms = claim?.terms || {};
  const canRequest = claim?.eligible === true;
  const form = canRequest
    ? `
      <form class="redemption-request-form">
        <label>
          Withdrawal address
          <input name="withdrawal_address" type="text" autocomplete="off" required />
        </label>
        <label>
          Instructions
          <textarea name="instructions" rows="4" placeholder="Optional"></textarea>
        </label>
        <p class="redemption-request-warning">Submitting this request does not send the cryptocurrency. It asks the authorized server to record the claim for a later payout.</p>
        <button class="saito-button-primary" type="submit">Submit redemption request</button>
      </form>
    `
    : `<p class="redemption-request-blocked">This claim cannot be submitted.</p>`;

  return `
    <div class="redemption-request">
      <h2>Redemption request</h2>
      <dl>
        <div><dt>Asset</dt><dd>${escape(app, terms.ticker || 'Unavailable')}</dd></div>
        <div><dt>Amount</dt><dd>${escape(app, terms.amount || 'Unavailable')}</dd></div>
        <div><dt>Server</dt><dd>${escape(app, terms.server_publickey || 'Unavailable')}</dd></div>
        <div><dt>Blocks required</dt><dd>${escape(app, terms.blocks_required || 'Unavailable')}</dd></div>
        <div><dt>Collateral id</dt><dd>${escape(app, terms.collateral_id || 'Unavailable')}</dd></div>
        <div><dt>Status</dt><dd>${escape(app, claim?.status || 'unavailable')}</dd></div>
      </dl>
      <p class="redemption-request-reasons">${escape(app, (claim?.reasons || []).join(', '))}</p>
      ${form}
      <p class="redemption-request-result" role="status"></p>
    </div>
  `;
};
