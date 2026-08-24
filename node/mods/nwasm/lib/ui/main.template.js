function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = (app, mod, games = []) => {
  let cards = games
    .map((game) => {
      let title = escapeHtml(game.title || 'Untitled ROM');
      let source = escapeHtml(game.source || 'archive');
      let sig = escapeHtml(game.sig || '');
      return `
        <button type="button" class="game" data-sig="${sig}" data-source="${source}">
          <div class="art" aria-hidden="true"></div>
          <div class="title">${title}</div>
        </button>
      `;
    })
    .join('');

  let upload_card = `
    <button type="button" class="upload" data-action="upload">
      <div class="art" aria-hidden="true"></div>
      <div class="title">Upload a ROM</div>
    </button>
  `;

  return `
    <div class="nwasm-main" id="nwasm-main">
      <header class="hero">
        <div class="brand">N-WASM</div>
        <div class="tagline">Nintendo 64 emulator for games you own</div>
      </header>

      <div class="games">
        ${cards}
        ${upload_card}
      </div>

      <footer class="footer">
        <a href="https://wiki.saito.io" target="_blank" rel="noopener noreferrer">Learn more about N-WASM</a>
        <span class="sep" aria-hidden="true">·</span>
        <a href="/store">Visit the Saito Store</a>
      </footer>
    </div>
  `;
};
