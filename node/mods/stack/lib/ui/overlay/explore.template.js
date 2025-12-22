module.exports = (app, mod, posts = []) => {
  return `
    <div class="stack-explore-overlay">
      <div class="stack-explore-sidebar">
        <div class="stack-explore-sidebar-header">
          <h2>Explore</h2>
        </div>
        <div class="stack-explore-sidebar-content">
          <div class="stack-explore-filter-section">
            <h3>Filter</h3>
            <button class="stack-explore-filter-btn active" data-filter="all">
              <i class="fa-solid fa-globe"></i> All Posts
            </button>
            <button class="stack-explore-filter-btn" data-filter="my-posts">
              <i class="fa-solid fa-user"></i> My Posts
            </button>
            <button class="stack-explore-filter-btn" data-filter="free">
              <i class="fa-solid fa-unlock"></i> Free
            </button>
            <button class="stack-explore-filter-btn" data-filter="paid">
              <i class="fa-solid fa-crown"></i> Paid
            </button>
          </div>
          <div class="stack-explore-search-section">
            <h3>Search</h3>
            <input 
              type="text" 
              class="stack-explore-search-input" 
              id="stack-explore-search-input"
              placeholder="Search posts..."
            />
          </div>
        </div>
      </div>
      
      <div class="stack-explore-main">
        <div class="stack-explore-main-header">
          <h2>Publications</h2>
          <p class="stack-explore-subtitle">Discover content from creators on Saito</p>
        </div>

        <div class="stack-explore-content">
          ${posts.length > 0 ? `
            <div class="stack-explore-posts-grid">
              ${posts.map(post => `
                <article class="stack-explore-post-card" data-post-id="${post.id || post.signature || ''}">
                  ${post.image ? `
                    <div class="stack-explore-post-image">
                      <img src="${post.image}" alt="${app.browser.escapeHTML(post.title || 'Post')}" />
                      ${post.tier ? `<span class="stack-post-tier-badge stack-tier-${post.tier}">${post.tier === 'paid' ? '<i class="fa-solid fa-crown"></i> Paid' : 'Free'}</span>` : ''}
                    </div>
                  ` : `
                    <div class="stack-explore-post-image stack-explore-post-image-placeholder">
                      <i class="fa-solid fa-newspaper"></i>
                      ${post.tier ? `<span class="stack-post-tier-badge stack-tier-${post.tier}">${post.tier === 'paid' ? '<i class="fa-solid fa-crown"></i> Paid' : 'Free'}</span>` : ''}
                    </div>
                  `}
                  <div class="stack-explore-post-content">
                    <div class="stack-explore-post-meta">
                      <span class="stack-explore-post-author">${app.browser.escapeHTML(post.author || 'Unknown')}</span>
                      <span class="stack-explore-post-date">${post.date ? `${post.date.month || ''} ${post.date.day || ''}` : ''}</span>
                    </div>
                    <h3 class="stack-explore-post-title">${app.browser.escapeHTML(post.title || 'Untitled Post')}</h3>
                    ${post.excerpt ? `<p class="stack-explore-post-excerpt">${app.browser.escapeHTML(post.excerpt)}</p>` : ''}
                    <button class="stack-explore-read-more-btn">
                      Read More <i class="fa-solid fa-arrow-right"></i>
                    </button>
                  </div>
                </article>
              `).join('')}
            </div>
          ` : `
            <div class="stack-explore-empty">
              <div class="stack-explore-empty-icon">
                <i class="fa-solid fa-magnifying-glass"></i>
              </div>
              <h3>No posts available yet</h3>
              <p>Be the first to publish! Create your own post to get started.</p>
              <button class="stack-btn-primary" id="stack-explore-create-post-btn">
                <i class="fa-solid fa-plus"></i> Create Post
              </button>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
};

