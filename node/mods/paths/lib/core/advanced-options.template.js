module.exports = () => {
  return `
    <div class="overlay-input">
      <label for="player1">Play as:</label>
      <select class="saito-form-select" id="player1" name="player1">
        <option value="random" selected>random</option>
        <option value="ussr">Protestants</option>
        <option value="us">Papacy</option>
      </select>
    </div>
    <div class="overlay-input">
      <label for="scenario">Scenario:</label>
      <select class="saito-form-select" id="scenario" name="scenario">
        <option value="original">original</option>
      </select>
    </div>
  `;
};
