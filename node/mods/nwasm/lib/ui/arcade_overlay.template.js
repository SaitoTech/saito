function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const playPromptTemplate = (title = 'N64 game') => {
  let safe = escapeHtml(title);
  return `
    <div class="nwasm-arcade-play saito-overlay-panel">
      <div class="title">${safe}</div>
      <button type="button" class="saito-button-primary fat play-confirmed">Play</button>
    </div>
  `;
};

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
        <p>You do not currently have any N64 games installed or available.</p>
        <p>Upload a ROM you have access to.</p>
      </div>
    `;
  } else {
    installed_body = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Game</th>
              <th scope="col"><span class="visually-hidden">Launch</span></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  return `
    <div class="nwasm-arcade-overlay">
      <div class="library">
        <section class="installed">
          <div class="section-head">
            <h2 class="section-title">Installed Games</h2>
            <a class="saito-text-link store-link" href="/store">Saito Store</a>
          </div>
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
            <div class="prompt">Drag ROM here</div>
            <div class="hint">or click to browse · .z64 / .n64 / .v64</div>
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

module.exports.playPromptTemplate = playPromptTemplate;
