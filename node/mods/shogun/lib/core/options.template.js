module.exports = (app, mod) => {
  let html = `
    <h3 class="overlay-title">${mod.name} Options</h3>
      <div class="overlay-input">
        <label for="card_set">Prearranged Supplies:</label>
        <select class="saito-form-select" name="card_set">
          <option value="random" selected default>None (Random)</option>
          <option value="firstgame">First Game</option>
          <option value="bigmoney">Big Money</option>
          <option value="interaction">Interaction</option>
          <option value="sizedistortion">Size Distortion</option>
          <option value="villagesquare">Village Square</option>
        </select>
      </div>
      <div class="overlay-input">
        <input class="saito-checkbox" type="checkbox" name="second" />
        <label for"second">Use Second Edition Cards</label>
      </div>
  `;
  return html;
};
