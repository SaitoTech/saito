module.exports = () => {
  return `
    <button type="button" class="gamebot-inspector-tab" aria-expanded="false" aria-controls="gamebot-inspector">Context</button>
    <aside id="gamebot-inspector" class="gamebot-inspector" aria-hidden="true">
      <header class="gamebot-inspector-header">
        <button type="button" class="gamebot-inspector-copy">Copy</button>
      </header>
      <div class="gamebot-tree"></div>
      <form class="gamebot-click">
        <label for="gamebot-identifier">Your choice</label>
        <div class="gamebot-row">
          <input id="gamebot-identifier" name="identifier" type="text" autocomplete="off" placeholder="Enter the item identifier" />
          <button class="saito-button-primary" type="submit">Click</button>
        </div>
        <p class="gamebot-click-result"></p>
      </form>
    </aside>
  `;
};
