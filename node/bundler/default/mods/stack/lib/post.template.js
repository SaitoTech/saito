module.exports = (app, mod, post) => {
  const author = post.author || 'Unknown';
  const date = post.timestamp ? new Date(post.timestamp).toLocaleDateString() : '';
  const tierBadge = post.subscription_tier === 'paid' 
    ? '<span class="stack-tier-badge stack-tier-paid">Paid</span>'
    : '<span class="stack-tier-badge stack-tier-free">Free</span>';

  return `
    <div class="stack-post" data-post-sig="${post.signature}">
      <div class="stack-post-header">
        <div class="stack-post-meta">
          <span class="stack-post-author">${author.slice(0, 8)}...</span>
          <span class="stack-post-date">${date}</span>
          ${tierBadge}
        </div>
      </div>
      <div class="stack-post-content">
        <h2 class="stack-post-title">${post.title || 'Untitled'}</h2>
        ${post.excerpt ? `<p class="stack-post-excerpt">${post.excerpt}</p>` : ''}
        <div class="stack-post-body">${post.content || ''}</div>
        ${post.tags && post.tags.length > 0 ? `
          <div class="stack-post-tags">
            ${post.tags.map(tag => `<span class="stack-tag">${tag}</span>`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="stack-post-actions">
        <button class="stack-btn stack-btn-link" data-action="read-more">
          Read More
        </button>
      </div>
    </div>
  `;
};

