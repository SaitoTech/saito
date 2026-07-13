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
          <button class="sidebar-suggestion-follow saito-button-secondary small" type="button" aria-label="Follow ${user.name}">Follow</button>
        </li>
      `
    )
    .join('');

  return `
    <div class="sidebar">
      <div class="sidebar-search">
        <label class="sidebar-search-field">
          <span class="sidebar-search-icon" aria-hidden="true">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <input type="search" placeholder="Search RedSquare" aria-label="Search RedSquare" />
        </label>
      </div>

      <section class="sidebar-panel sidebar-panel-trends">
        <h3 class="sidebar-panel-title">Trends for you</h3>
        <ul class="sidebar-trend-list">
          ${trends}
        </ul>
        <a class="sidebar-more" href="#">Show more</a>
      </section>

      <section class="sidebar-panel sidebar-panel-suggestions">
        <h3 class="sidebar-panel-title">Who to follow</h3>
        <ul class="sidebar-suggestion-list">
          ${suggestions}
        </ul>
        <a class="sidebar-more" href="#">Show more</a>
      </section>

      <footer class="sidebar-footer">
        <a href="#">About</a>
        <a href="#">Terms</a>
        <a href="#">Privacy</a>
        <span>© 2026 Saito</span>
      </footer>
    </div>
  `;
};
