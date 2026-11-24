module.exports = () => {
  return `
    <button type="button" class="gamebot-inspector-tab" aria-expanded="false" aria-controls="gamebot-inspector">Context</button>
    <aside id="gamebot-inspector" class="gamebot-inspector" aria-hidden="true">
      <header class="gamebot-inspector-header">
        <button type="button" class="gamebot-inspector-copy" aria-label="Copy">
          <svg class="gamebot-copy-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"></rect>
            <path d="M6 16H5.5A1.5 1.5 0 0 1 4 14.5v-9A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V6" fill="none" stroke="currentColor" stroke-width="2"></path>
          </svg>
          <svg class="gamebot-copied-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5 9.5 17 19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
      </header>
      <div class="gamebot-tree"></div>
      <form class="gamebot-click">
        <label for="gamebot-identifier">Your choice</label>
        <div class="gamebot-row">
          <input id="gamebot-identifier" name="identifier" type="text" autocomplete="off" placeholder="Enter the item identifier" />
          <button class="saito-button-primary" type="submit">Click</button>
        </div>
        <p class="gamebot-click-result">last move:</p>
      </form>
    </aside>
  `;
};
