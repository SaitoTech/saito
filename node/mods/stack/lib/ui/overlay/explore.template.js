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
    let label = app.browser.escapeHTML(subs[z].label);
    let address = subs[z].isAddress
      ? ` class="saito-address" data-id="${subs[z].publickey}" data-disable="true"`
      : '';

    html += `
            <div class="item${active}" data-filter="${subs[z].publickey}">
              <i class="${subs[z].icon}"></i>
              <span${address}>${label}</span>
            </div>
    `;
  }

  html += `
          </div>
          
          <div class="help">
            <button type="button" id="stack-explore-add-subscription-btn" class="saito-button-secondary">+ Follow Account</button>
          </div>
        </div>
      <div class="mobile-header">
        <select class="saito-form-select mobile-selector">`;
  for (let z = 0; z < subs.length; z++) {
    let active = subs[z].publickey == pk ? 'selected' : '';
    let address = subs[z].isAddress
      ? ` class="saito-address" data-id="${subs[z].publickey}" data-disable="true"`
      : '';
    html += `<option value="${subs[z].publickey}"${address} ${active}>${app.browser.escapeHTML(subs[z].label)}</option>`;
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
          <div class="actions">
            <a href="#" class="badge is-hidden" id="stack-explore-plus-btn">
              <i class="fa-solid fa-plus"></i>
            </a>
            <a href="#" class="badge is-hidden" id="stack-explore-settings-btn">
              <i class="fa-solid fa-gear"></i>
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
