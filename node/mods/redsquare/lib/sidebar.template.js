module.exports = (sidebar) => {
  const suggestions = (sidebar.suggestions || [])
    .map(
      (user) => `
        <li class="suggestion">
          <img class="avatar saito-identicon" src="${user.avatar}" alt="${user.name}" />
          <span class="name saito-address">${user.name}</span>
          <span class="handle saito-userline">@${user.handle}</span>
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
  // module owns it. Header/surface classes match Chats + Leaderboard (Saito primitives).
  return `
      <!-- Search UI parked: styling kept in sidebar.css; re-enable when search is wired up.
      <div class="search">
        <label class="search-field">
          <span class="search-icon" aria-hidden="true">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <input type="search" class="saito-input" placeholder="Search RedSquare" aria-label="Search RedSquare" />
        </label>
      </div>
      -->

      <div class="redsquare-arcade"></div>

      <div class="redsquare-leaderboard"></div>

      <div class="redsquare-sidebar"></div>

      <section class="suggestions">
        <h5 class="sidebar-header">
          <div class="sidebar-title">Who to Follow</div>
        </h5>
        <ul class="suggestion-list saito-sidebar-element">
          ${suggestions}
        </ul>
        <a class="more" href="#">Show more</a>
      </section>

      <footer class="footer">
        <a href="https://archive.saito.io/saito.tech/copyright-policy-claims/" target="_blank" rel="noopener noreferrer">Terms of Service @ 2026 Saito</a>
      </footer>
  `;
};
