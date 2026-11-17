module.exports = () => {
  return `
    <div class="saito-container gamebot-container">
      <div class="gamebot-main">
        <h1>GameBot</h1>
        <p class="gamebot-lead">Accept an invitation, then play the installed game by hand.</p>
        <form class="gamebot-accept">
          <label>
            Game invitation
            <textarea name="invitation" rows="4" placeholder="Paste an Arcade invite link or game id"></textarea>
          </label>
          <button type="submit" class="saito-button-primary">Accept</button>
        </form>
        <p class="gamebot-notice" role="status"></p>
        <section class="gamebot-games">
          <h2>Open games</h2>
          <div class="gamebot-game-list"></div>
        </section>
      </div>
    </div>
  `;
};
