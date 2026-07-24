module.exports = ({ hasStore = false } = {}) => {
	const ownerAction = hasStore ? 'My Listings' : 'Sell Something';

	return `
    <div class="card saito-sidebar-element saito-cta">
      <div class="flip" tabindex="0" aria-label="About Saito Store">
        <div class="front saito-sidebar-element">
          <img class="mark" src="/saito/icons/saito-store-icon-outline.svg" alt="Saito Store" />
        </div>
        <div class="back saito-sidebar-element">
          <div class="copy">
            <h2>Saito Store</h2>
            <p class="subhead">Blockchain-powered<br />e-commerce</p>
            <p class="lede">All listings are on-chain.</p>
            <p class="description">Create your own Store to list NFTs, tokens, assets and more—directly between peers.</p>
            <a class="saito-text-link wiki-link" href="https://wiki.saito.io" target="_blank" rel="noopener noreferrer">
              Explore the Saito e-commerce wiki
              <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
            </a>
          </div>
        </div>
      </div>
      <div class="content">
        <div class="saito-cta-logo logo" role="img" aria-label="Saito Store"></div>
        <p class="subtitle">Peer to Peer e-commerce</p>
        <div class="saito-button-row actions">
          <button class="saito-button-primary" type="button" data-action="browse">Saito Store</button>
          <button class="saito-button-secondary" type="button" data-action="owner">${ownerAction}</button>
        </div>
      </div>
    </div>
  `;
};
