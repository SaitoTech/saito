module.exports = (sidebar) => {
  const suggestions = (sidebar.suggestions || [])
    .map(
      (user) => `
        <li class="suggestion">
          <img class="avatar" src="${user.avatar}" alt="${user.name}" />
          <div class="info">
            <span class="name">${user.name}</span>
            <span class="handle">@${user.handle}</span>
          </div>
          <button class="follow saito-button-secondary small" type="button" aria-label="Follow ${user.name}">Follow</button>
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
      <div class="search">
        <label class="search-field">
          <span class="search-icon" aria-hidden="true">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <input type="search" placeholder="Search RedSquare" aria-label="Search RedSquare" />
        </label>
      </div>
      -->

      <div class="redsquare-arcade"></div>

      <div class="redsquare-leaderboard"></div>

      <div class="redsquare-sidebar"></div>

      <section class="panel suggestions">
        <h3 class="panel-title">Who to follow</h3>
        <ul class="suggestion-list">
          ${suggestions}
        </ul>
        <a class="more" href="#">Show more</a>
      </section>

      <footer class="footer">
        <a href="#">About</a>
        <a href="#">Terms</a>
        <a href="#">Privacy</a>
        <span>© 2026 Saito</span>
      </footer>
  `;
};
