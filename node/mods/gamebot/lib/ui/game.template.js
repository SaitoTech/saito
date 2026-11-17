module.exports = () => {
  return `
    <div class="saito-container gamebot-container">
      <div class="gamebot-game">
        <section class="gamebot-board-column">
          <div class="gamebot-game-toolbar">
            <button type="button" class="saito-button-secondary gamebot-back">Games</button>
            <h1 class="gamebot-game-heading"></h1>
          </div>
          <div class="gamebot-board"></div>
          <p class="gamebot-board-note"></p>
        </section>
        <section class="gamebot-log-column">
          <h2>Context</h2>
          <div class="gamebot-log"></div>
          <p class="gamebot-decision"></p>
          <div class="gamebot-interactions"></div>
          <form class="gamebot-response">
            <label>
              Manual response
              <input name="response" autocomplete="off" placeholder="Number or interaction id" />
            </label>
            <button type="submit" class="saito-button-primary">Submit</button>
          </form>
          <p class="gamebot-notice" role="status"></p>
        </section>
      </div>
    </div>
  `;
};
