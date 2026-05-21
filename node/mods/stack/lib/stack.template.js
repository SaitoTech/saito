module.exports = (app, mod) => {
  return `
    <div class="stack-splash">
      <section class="stack-cta-section saito-cta">
        <div class="stack-cta-image-flip">
          <div class="stack-cta-image-front">
            <img src="/stack/img/splash.png" alt="Stack - Publish. Monetize. Own." onerror="this.style.display='none'; this.parentElement.classList.add('stack-cta-image-placeholder');" />
          </div>
          <div class="stack-cta-image-back">
            <div class="stack-cta-image-back-content">
              <h3>Monetize Your Content</h3>
              <p>Set up subscriptions, distribute access keys, and build your community on the decentralized web.</p>
              <ul class="stack-features-list">
                <li><i class="fa-solid fa-check"></i> Subscription management</li>
                <li><i class="fa-solid fa-check"></i> NFT access keys</li>
                <li><i class="fa-solid fa-check"></i> Creator monetization</li>
                <li><i class="fa-solid fa-check"></i> Full ownership</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="stack-cta-content">
          <div class="stack-cta-logo" role="img" aria-label="Saito Stack"></div>
          <div class="stack-cta-subtitle">PUBLISH WITHOUT PUBLISHERS</div>
          <h2 class="stack-cta-title">Publish. Monetize. Own.</h2>
          <p class="stack-cta-description">
            Create your own subscription-based blog, distribute NFTs for access,
            and build your community on Saito.
          </p>
          <div class="stack-cta-buttons">
            <button class="stack-btn-primary" id="stack-create-post-btn">
              <i class="fa-solid fa-plus"></i> Create Post
            </button>
            <button class="stack-btn-secondary" id="stack-get-started-btn">
              Learn More
            </button>
          </div>
        </div>
      </section>
    </div>
  `;
};
