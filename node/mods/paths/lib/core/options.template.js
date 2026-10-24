module.exports = () => {
  let html = `
        <label for="deckselect">Deck:</label>
        <div class="overlay-input">
          <select class="saito-form-select" name="deck" id="deckselect">
            <option value="original">original</option>
            <option value="optional">optional</option>
          </select>
        </div>
          `;
  return html;
};
