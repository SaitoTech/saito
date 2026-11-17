module.exports = () => {
  return `
    <div class="saito-container gamebot-container">
      <div class="gamebot-stage">
        <iframe class="gamebot-game-frame" title="Game"></iframe>
        <section class="gamebot-panel">
          <button type="button" class="saito-button-secondary gamebot-back">Games</button>
          <h2>Context</h2>
          <pre class="gamebot-context"></pre>
          <h2>Clickable items</h2>
          <pre class="gamebot-clickable"></pre>
          <div class="gamebot-clickable-actions"></div>
          <form class="gamebot-manual">
            <label>
              Manual input
              <input name="instruction" autocomplete="off" placeholder="Instruction" />
            </label>
            <button type="submit" class="saito-button-primary">Submit</button>
          </form>
          <p class="gamebot-manual-result"></p>
          <p class="gamebot-notice" role="status"></p>
        </section>
      </div>
    </div>
  `;
};
