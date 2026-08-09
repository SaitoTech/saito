module.exports = (app, mod) => {
  return `
    <div class="splash">
      <section class="saito-cta">
        <div class="flip">
          <div class="front">
            <img src="/stack/img/splash.png" alt="Stack - Publish. Monetize. Own." onerror="this.parentElement.classList.add('placeholder');" />
          </div>
          <div class="back">
            <div class="panel">
              <h3>Below the surface</h3>
              <p>What looks like a simple publishing tool runs on a peer-to-peer network. Storage, access, and reader support work differently here — by design.</p>
              <ul class="features">
                <li>where are my posts saved</li>
                <li>how do I make subscriptions?</li>
                <li>how do readers pay me</li>
                <li>how can I customize without a server</li>
              </ul>
              <div class="more">
                <a href="#" class="saito-anchor" id="stack-learn-more-back-btn">
                  Learn how Saito Stack works <i class="fa-solid fa-arrow-right"></i>
                </a>
              </div>
            </div>
          </div>
        </div>
        <div class="copy">
          <div class="saito-cta-logo logo" role="img" aria-label="Saito Stack"></div>
          <div class="subtitle">PUBLISH WITHOUT PUBLISHERS</div>
          <p class="description">
            Create a subscription-based blog, use NFTs to limit access, and build your audience on your own terms.
          </p>
          <div class="saito-button-row">
            <button class="saito-button-primary" id="stack-create-post-btn">
              <i class="fa-solid fa-pen"></i> Start Writing
            </button>
            <button class="saito-button-secondary" id="stack-get-started-btn">
              Browse Posts
            </button>
          </div>
        </div>
      </section>
    </div>
  `;
};
