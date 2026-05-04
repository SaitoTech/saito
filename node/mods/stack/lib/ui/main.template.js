module.exports = (app, mod) => {
  return `
    <div class="stack-splash">
      <section class="stack-cta-section">
        <div class="stack-cta-image-flip">
          <div class="stack-cta-image-front">
            <img src="/stack/img/splash.png" alt="Stack - Publish. Monetize. Own." onerror="this.style.display='none'; this.parentElement.classList.add('stack-cta-image-placeholder');" />
          </div>
          <div class="stack-cta-image-back">
            <div class="stack-cta-image-back-content">
              <h3>Below the surface</h3>
              <p>What looks like a simple publishing tool runs on a peer-to-peer network. Storage, access, and reader support work differently here — by design.</p>
              <ul class="stack-features-list">
                <li>where are my posts saved</li>
                <li>how do I make subscriptions?</li>
                <li>how do readers pay me</li>
                <li>how can I customize without a server</li>
              </ul>
              <div class="stack-learn-more-link">
                <a href="#" class="stack-learn-more-btn" id="stack-learn-more-back-btn">
                  Learn how Saito Stack works <i class="fa-solid fa-arrow-right"></i>
                </a>
              </div>
            </div>
          </div>
        </div>
        <div class="stack-cta-content">
          <h2 class="stack-cta-title">Publish without Publishers</h2>
          <p class="stack-cta-description">
            Create a subscription-based blog, use NFTs to limit access, and build your audience on your own terms.
          </p>
          <div class="stack-cta-buttons">
            <button class="stack-btn-primary" id="stack-create-post-btn">
              <i class="fa-solid fa-pen"></i> Start Writing
            </button>
            <button class="stack-btn-secondary" id="stack-get-started-btn">
              Browse Posts
            </button>
          </div>
        </div>
      </section>
    </div>
  `;
};
