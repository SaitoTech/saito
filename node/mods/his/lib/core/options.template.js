module.exports = () => {
  let html = `
        <div class="overlay-input">

          <label for="deck">Deck:</label>
          <select class="saito-form-select" name="deck" id="deckselect">
            <option value="original">original</option>
            <option class="testing" value="testing">testing</option>
          </select>
        </div>
          `;
  return html;
};
