function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRentalExpiry(ts) {
  let d = new Date(Number(ts));
  if (!Number.isFinite(d.getTime())) {
    return '';
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

module.exports = (app, mod, games = []) => {
  let rows = games
    .map((game) => {
      let title = escapeHtml(game.title || 'Untitled ROM');
      let sig = escapeHtml(game.sig || '');
      let expiry = '';
      if (game.rental && game.expires_at != null) {
        let label = formatRentalExpiry(game.expires_at);
        if (label) {
          expiry = `Expires: ${escapeHtml(label)}`;
        }
      }
      return `
        <tr class="row" data-sig="${sig}" tabindex="0" role="button">
          <td class="name">${title}</td>
          <td class="expires">${expiry}</td>
          <td class="action">
            <button type="button" class="saito-button-primary compact launch" data-sig="${sig}">
              Play
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  let installed_body = '';
  if (!games.length) {
    installed_body = `
      <div class="empty">
        <p>Upload and play your legal N64 ROMs.</p>
        <p>Looking for games? <a class="saito-text-link" href="/store">Visit the Saito Store</a>.</p>
      </div>
    `;
  } else {
    installed_body = `
      <div class="table-wrap">
        <table class="table">
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  return `
    <div class="nwasm-arcade-overlay">
      <div class="library">
        <section class="installed">
          <h2 class="section-title">Your Games</h2>
          ${installed_body}
        </section>

        <section class="upload-panel">
          <h2 class="section-title">Upload Legal N64 ROM</h2>
          <div
            id="nwasm-arcade-upload"
            class="dropzone"
            role="button"
            tabindex="0"
            aria-label="Upload Legal N64 ROM">
            <div class="prompt">Drag and drop a ROM to which you have legal access.</div>
            <div class="state" hidden>
              <div class="saito-spinner" aria-hidden="true"></div>
              <div class="status">Preparing upload…</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
};
