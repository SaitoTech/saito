function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = (app, mod, games = []) => {
  let rows = games
    .map((game) => {
      let title = escapeHtml(game.title || 'Untitled ROM');
      let sig = escapeHtml(game.sig || '');
      return `
        <tr class="row" data-sig="${sig}" tabindex="0" role="button">
          <td class="name">${title}</td>
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
        <p>NWASM lets you play legally owned N64 games on Saito, and share and trade saved games and more.</p>
        <p>Upload a ROM to which you have legal access.</p>
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
          <h2 class="section-title">It's Your Games</h2>
          ${installed_body}
        </section>

        <section class="upload-panel">
          <h2 class="section-title">Upload ROM</h2>
          <div
            id="nwasm-arcade-upload"
            class="dropzone"
            role="button"
            tabindex="0"
            aria-label="Upload ROM file">
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
