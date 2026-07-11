module.exports = (sidebar) => {
  let trends = sidebar.trends
    .map(
      (trend) => `
        <li class="sidebar-trend">
          <span class="sidebar-trend-category">${trend.category}</span>
          <span class="sidebar-trend-tag">${trend.tag}</span>
          <span class="sidebar-trend-posts">${trend.posts}</span>
        </li>
      `
    )
    .join('');

  let suggestions = sidebar.suggestions
    .map(
      (user) => `
        <li class="sidebar-suggestion">
          <img class="sidebar-suggestion-avatar" src="${user.avatar}" alt="${user.name}" />
          <div class="sidebar-suggestion-info">
            <span class="sidebar-suggestion-name">${user.name}</span>
            <span class="sidebar-suggestion-handle">@${user.handle}</span>
          </div>
          <button class="sidebar-suggestion-follow" type="button">Follow</button>
        </li>
      `
    )
    .join('');

  return `
    <div class="sidebar">
      <div class="sidebar-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" placeholder="Search RedSquare" />
      </div>

      <div class="sidebar-panel">
        <h3>Trends for you</h3>
        <ul class="sidebar-trend-list">
          ${trends}
        </ul>
        <a class="sidebar-more" href="#">Show more</a>
      </div>

      <div class="sidebar-panel">
        <h3>Who to follow</h3>
        <ul class="sidebar-suggestion-list">
          ${suggestions}
        </ul>
        <a class="sidebar-more" href="#">Show more</a>
      </div>

      <div class="sidebar-footer">
        <a href="#">About</a>
        <a href="#">Terms</a>
        <a href="#">Privacy</a>
        <span>© 2026 Saito</span>
      </div>
    </div>
  `;
};
