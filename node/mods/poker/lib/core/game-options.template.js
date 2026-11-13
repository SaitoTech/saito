module.exports = (app, mod) => {
  return `
    <div class="overlay-input">
      <label for="blind_mode">Mode:</label>
      <select class="saito-form-select" id="blind_mode" name="blind_mode">
        <option value="static" selected default>static blinds</option>
        <option value="increase">increasing blinds</option>
      </select>
    </div>
    <div class="saito-overlay-form-text">
      <p id="blind_explainer">Small blind is one chip, big blind is two chips throughout the game</p>
    </div>
  `;
};
