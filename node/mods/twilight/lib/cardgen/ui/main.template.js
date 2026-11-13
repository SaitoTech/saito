const creditFooter = `
  <footer class="tscardgen-footer">
    <p class="tscardgen-credit">
      Twilight Struggle is copyright GMT Games, built on <a href="http://yzemaze.de/tscardgen/TwilightStruggleCardGenerator.html" target="_blank" rel="noopener noreferrer">Twilight Struggle Card Generator</a>, from <a href="https://github.com/MooToYouToo" target="_blank" rel="noopener noreferrer">MutuYutu</a> and <a href="https://github.com/yzemaze" target="_blank" rel="noopener noreferrer">Wyzzymaze</a>.
    </p>
  </footer>
`;

module.exports = (view = 'home', workspace = 'image') => {
  if (view === 'generator') {
    const image_active = workspace === 'image' ? ' active' : '';
    const code_active = workspace === 'code' ? ' active' : '';
    return `
      <div class="tscardgen tscardgen-generator" data-workspace="${workspace}">
        <div class="tscardgen-shell">
          <div class="tscardgen-brand">
            <p class="ts-form-kicker">Twilight Struggle</p>
            <h1 class="ts-form-title">Card Generator</h1>
          </div>
          <div class="tscardgen-header-tools">
            <div
              class="tscardgen-save-status"
              data-role="save-status"
              aria-live="polite"
              aria-atomic="true"
            ></div>
            <button type="button" class="tscardgen-new-card-btn" data-action="new-card">
              New Card
            </button>
            <nav class="tscardgen-workspace-nav" aria-label="Workspace">
              <button type="button" class="tscardgen-workspace-btn${image_active}" data-workspace="image">
                Image
              </button>
              <button type="button" class="tscardgen-workspace-btn${code_active}" data-workspace="code">
                Code
              </button>
            </nav>
          </div>
          <div class="tscardgen-rule" role="presentation"></div>
          <aside class="tscardgen-controls" aria-label="Card controls"></aside>
          <aside class="tscardgen-sidebar" aria-label="Card sidebar"></aside>
        </div>
        ${creditFooter}
      </div>
    `;
  }

  return `
    <div class="tscardgen tscardgen-home">
      <section class="tscardgen-cta saito-cta">
        <div class="tscardgen-cta-kicker">Twilight Struggle</div>
        <h1 class="tscardgen-cta-title">Card Studio</h1>
        <p class="tscardgen-cta-copy">
          Build Twilight Struggle Cards. Play with them online.
        </p>
        <div class="saito-button-row tscardgen-cta-actions">
          <button class="saito-button-primary tscardgen-cta-btn" id="tscardgen-create-btn" type="button">
            Create Cards
          </button>
          <button class="saito-button-secondary tscardgen-cta-btn" id="tscardgen-my-cards-btn" type="button">
            View Cards
          </button>
        </div>
      </section>
      ${creditFooter}
    </div>
  `;
};
