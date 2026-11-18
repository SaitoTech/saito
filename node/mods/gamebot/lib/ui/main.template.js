module.exports = (notice = '') => {
  const message = notice ? String(notice) : '';
  return `
    <div class="gamebot-screen gamebot-main">
      <h1>AI GameBot Development</h1>
      <p>Please provide an invite link for the GameBot to accept, or provide the game ID for a game that has already been initialized and created.</p>
      <form class="gamebot-accept">
        <label for="gamebot-invite">Invite link</label>
        <div class="gamebot-row">
          <input id="gamebot-invite" name="invite_link" type="text" autocomplete="off" placeholder="Invite link" />
          <button class="saito-button-primary" type="submit">Accept Invite</button>
        </div>
      </form>
      <form class="gamebot-open">
        <label for="gamebot-game-id">Game ID</label>
        <div class="gamebot-row">
          <input id="gamebot-game-id" name="game_id" type="text" autocomplete="off" placeholder="Game ID" />
          <button class="saito-button-secondary" type="submit">Open Game</button>
        </div>
      </form>
      <p class="gamebot-notice">${message}</p>
    </div>
  `;
};

module.exports.loading = () => {
  return `
    <div class="gamebot-screen gamebot-loading">
      <p>Loading</p>
    </div>
  `;
};
