module.exports = (app, mod) => {
  return `
    <div class="stack-splash">
      <div class="stack-subscriptions-toggle" id="stack-subscriptions-toggle">
        <i class="fa-solid fa-bars"></i>
      </div>

      <section class="stack-cta-section">
        <div class="stack-cta-image">
          <img src="/stack/img/splash-hero.png" alt="Stack - Publish. Monetize. Own." onerror="this.style.display='none'; this.parentElement.classList.add('stack-cta-image-placeholder');" />
        </div>
        <div class="stack-cta-content">
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
              Get Started
            </button>
          </div>
        </div>
      </section>

      <div class="stack-explore-link">
        <span>or</span>
        <button class="stack-explore-btn" id="stack-explore-btn">
          Explore Available Posts <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </div>
  `;
};
