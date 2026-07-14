module.exports = (sidebar) => {
  const suggestions = (sidebar.suggestions || [])
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

  // Injected into `.sidebar-right > .sidebar` — no outer `.sidebar` wrapper.
  //
  // Ordered module mounts (content owned by each module via canRenderInto/renderInto):
  //   .redsquare-arcade      → Arcade InviteManager (My Games)
  //   .redsquare-leaderboard → League Leaderboard
  //   .redsquare-sidebar     → remaining peers (e.g. Limbo)
  // Who to Follow remains a Sidebar-owned presentation slot until a recommendation
  // module owns it.
  return `
      <!-- Search UI parked: styling kept in sidebar.css; re-enable when search is wired up.
      <div class="sidebar-search">
        <label class="sidebar-search-field">
          <span class="sidebar-search-icon" aria-hidden="true">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <input type="search" placeholder="Search RedSquare" aria-label="Search RedSquare" />
        </label>
      </div>
      -->

      <div class="redsquare-arcade"></div>

      <div class="redsquare-leaderboard"></div>

      <div class="redsquare-sidebar"></div>

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
  `;
};
