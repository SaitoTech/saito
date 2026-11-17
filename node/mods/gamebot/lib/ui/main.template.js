module.exports = () => {
  return `
    <div class="saito-container gamebot-container">
      <div class="gamebot-main">
        <h1>GameBot</h1>
        <form class="gamebot-accept">
          <label>
            Invite link
            <textarea name="invite_link" rows="4" placeholder="Paste an Arcade invite link"></textarea>
          </label>
          <button type="submit" class="saito-button-primary">Accept</button>
        </form>
        <form class="gamebot-open">
          <label>
            Game id
            <input name="game_id" autocomplete="off" placeholder="Existing game id" />
          </label>
          <button type="submit" class="saito-button-primary">Open Game</button>
        </form>
        <p class="gamebot-notice" role="status"></p>
      </div>
    </div>
  `;
};
