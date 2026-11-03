module.exports = (view = 'home') => {
  if (view === 'generator') {
    return `
      <div class="tscardgen">
        <div class="tscardgen-shell">
          <aside class="tscardgen-controls" aria-label="Card controls"></aside>
          <main class="tscardgen-preview" aria-label="Card preview"></main>
        </div>
        <p class="tscardgen-credit">
          Twilight Struggle is Copyright GMT Games. Generator adapted from work by mootoyoutoo2 / yzemaze.
        </p>
      </div>
    `;
  }

  return `
    <div class="tscardgen tscardgen-home">
      <section class="tscardgen-cta saito-cta">
        <div class="tscardgen-cta-kicker">Twilight Struggle</div>
        <h1 class="tscardgen-cta-title">Card Studio</h1>
        <p class="tscardgen-cta-copy">
          Design optional Twilight Struggle cards and mint them as NFTs in your Saito wallet.
        </p>
        <div class="saito-button-row">
          <button class="saito-button-primary" id="tscardgen-create-btn" type="button">
            Create Twilight Struggle Card
          </button>
          <button class="saito-button-secondary" id="tscardgen-my-cards-btn" type="button">
            See my existing cards...
          </button>
        </div>
      </section>
      <p class="tscardgen-credit">
        Twilight Struggle is Copyright GMT Games. Generator adapted from work by mootoyoutoo2 / yzemaze.
      </p>
    </div>
  `;
};
