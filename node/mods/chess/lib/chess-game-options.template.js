module.exports = (app, mod) => {
  return `
    <div class="overlay-input">
      <label for="player1">Pick Your Color:</label>
      <select class="saito-form-select" id="player1" name="player1">
        <option value="random" default>Random</option>
        <option value="black">Black</option>
        <option value="white">White</option>
      </select>
    </div>
    <div class="overlay-input">
      <label for="lightning">Lightning Mode:</label>
      <select class="saito-form-select" id="lightning" name="lightning">
        <option value="0" default>none</option>
        <option value="2">+2 seconds</option>
        <option value="3">+3 seconds</option>
        <option value="5">+5 seconds</option>
      </select>
    </div>
  `;
};
