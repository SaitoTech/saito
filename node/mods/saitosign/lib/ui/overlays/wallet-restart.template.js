const { escapeHTML } = require('./publish.escape');

function walletRestartTemplate(name) {
  const who = name ? `<p class="who">${escapeHTML(name)}</p>` : '';
  return `
    <form class="saitosign-identity">
      <p class="title">This document was signed with another wallet</p>
      ${who}
      <p>The signatures and email verification stored for this signer belong to a different wallet. They cannot be used with the wallet that is open now.</p>
      <p>Restarting removes that wallet's key, signatures, and verification for this signer. Other signers stay as they are.</p>
      <div class="actions">
        <button type="button" data-wallet-restart="no">Keep the other wallet</button>
        <button type="button" class="primary" data-wallet-restart="yes">Restart with this wallet</button>
      </div>
    </form>
  `;
}

module.exports = walletRestartTemplate;
