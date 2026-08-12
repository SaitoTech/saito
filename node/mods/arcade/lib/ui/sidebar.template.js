module.exports = (app, mod) => {
  return `
    <div class="sidebar-stack">
      <h5 class="saito-sidebar-header">
        <div class="title">My Games</div>
      </h5>
      <div class="invites arcade-invites"></div>
    </div>
    <div class="arcade-leaderboard redsquare-leaderboard"></div>
  `;
};
