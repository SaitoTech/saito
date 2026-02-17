module.exports = () => {
	let html = `
        <div class="overlay-input">

          <label for="deck">Deck:</label>
          <select name="deck" id="deckselect">
            <option value="original">original</option>
            <option class="is_testing" value="is_testing">testing</option>
          </select>
        </div>
          `;
	return html;
};
