module.exports = (rankings) => {
  const rows = (rankings.entries || [])
    .map(
      (entry) => `
        <li class="sidebar-rankings-item">
          <span class="sidebar-rankings-game">${entry.game}</span>
          <span class="sidebar-rankings-rank">${entry.rank}</span>
        </li>
      `
    )
    .join('');

  // Injected into `.sidebar-right > .sidebar > .rankings` — no outer `.rankings` wrapper.
  return `
      <section class="sidebar-panel sidebar-panel-rankings">
        <h3 class="sidebar-panel-title">Rankings</h3>
        <ul class="sidebar-rankings-list">
          ${rows}
        </ul>
      </section>
  `;
};
