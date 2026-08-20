function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRole(role = '') {
  const text = String(role || '').trim();
  if (!text) {
    return '';
  }
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pot contribution overlay — presentation only.
 * Data: player_names, player_pot, returnPlayerRole(), convertChipsToCrypto().
 */
module.exports = (game_mod) => {
  const pp = game_mod.game.state.player_pot || [];
  const pn = game_mod.game.state.player_names || [];
  const cryptoStaked =
    typeof game_mod.isCryptoStakedGame === 'function'
      ? game_mod.isCryptoStakedGame()
      : typeof game_mod.game.stake === 'string' &&
        !!game_mod.game.crypto &&
        game_mod.game.crypto !== 'CHIPS';

  let html = `
  <form class="saito-overlay-form pot-details-overlay${cryptoStaked ? ' crypto-stake' : ''}" id="pot-details-overlay-root">
    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">Pot Contributions</h2>
    </header>

    <div class="pot-details-list">`;

  for (let i = 0; i < pp.length; i++) {
    const name = escapeHtml(pn[i] || `Player ${i + 1}`);
    const role = formatRole(game_mod.returnPlayerRole(i + 1));
    const amount = pp[i];
    const balanceHtml =
      typeof game_mod.returnChipCryptoBalanceHtml === 'function'
        ? game_mod.returnChipCryptoBalanceHtml(amount)
        : `${amount} ${amount === 1 ? 'CHIP' : 'CHIPS'}`;

    html += `
      <div class="pot-details-row">
        <div class="pot-details-player">
          <div class="pot-details-name">${name}</div>
          ${
            role
              ? `<div class="pot-details-role">${escapeHtml(role)}</div>`
              : `<div class="pot-details-role pot-details-role--empty"></div>`
          }
        </div>
        <div class="pot-details-amount">${balanceHtml}</div>
      </div>`;
  }

  html += `
    </div>
  </form>`;

  return html;
};
