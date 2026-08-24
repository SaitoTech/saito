module.exports = (app, mod, subs = []) => {
  let pk = mod.exploreOverlay.targetPublicKey;
  let html = `
    <div class="explore">
      <div class="sidebar">
        <div class="header">
          <h2>Explore</h2>
        </div>
        <div class="body">
          <div class="filters">
  `;
  for (let z = 0; z < subs.length; z++) {
    let active = subs[z].publickey == pk ? ' active' : '';

    html += `
            <div class="item${active}" data-filter="${subs[z].publickey}">
              <i class="${subs[z].icon}"></i>
              <span>${subs[z].label}</span>
            </div>
    `;
  }

  html += `
          </div>
          
          <!-- Contextual help note - only shown when subscription list is short (2 or fewer) -->
          <div id="stack-explore-add-subscription-btn" class="help">
            <p>Need help? Explore shows posts from people you follow. <span class="saito-anchor">Subscribe to creators to see their posts here.</span></p>
            <div class="item"><i class="fa-solid fa-user-plus"></i><span>add creator</span></div>
          </div>
        </div>
      <div class="mobile-header">
        <select class="saito-form-select mobile-selector">`;
  for (let z = 0; z < subs.length; z++) {
    let active = subs[z].publickey == pk ? 'selected' : '';
    html += `<option value="${subs[z].publickey}" ${active}>${subs[z].label}</option>`;
  }

  html += `</select>
        <div class="mobile-add">
          <i class="fa-solid fa-user-plus"></i>
        </div>
      </div>


      </div>
      
      <div class="main">
        <div class="header">
          <div class="author" id="stack-explore-author-header">
            <div class="author-stub">
              <div class="avatar"></div>
              <div class="name">Loading...</div>
            </div>
          </div>
          <div id="stack-explore-subscribe-button-container" class="subscribe">
            <button type="button" class="saito-button-primary compact" id="stack-explore-subscribe-btn">
              Subscribe
            </button>
          </div>
          
          <div class="actions">
            <a href="#" class="badge alt-new-post is-hidden" id="stack-explore-new-post-btn">
              <i class="fa-solid fa-plus"></i>
            </a>
            <a href="#" class="badge is-hidden" id="stack-explore-settings-btn">
              <i class="fa-solid fa-gear"></i>
            </a>
            <a href="#" id="stack-explore-author-share" class="badge" aria-label="Share Author" title="Share Author">
              <i class="fa-solid fa-share-nodes"></i>
            </a>
          </div>
        </div>

        <div class="content">
          <div class="grid" id="stack-explore-posts-grid">
            <div class="loading">
              <div class="loading-inner">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Loading posts...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return html;
};
