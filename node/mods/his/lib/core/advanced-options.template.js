module.exports = () => {
  return `
    <div class="overlay-input">
      <label for="player1">Play as:</label>
      <select class="saito-form-select" id="player1" name="player1">
        <option value="random" selected>random</option>
        <option value="protestant">Protestants</option>
        <option value="papacy">Papacy</option>
      </select>
    </div>
    <div class="overlay-input">
      <label for="scenario">Scenario:</label>
      <select class="saito-form-select" id="scenario" name="scenario">
        <option value="original">original</option>
        <option value="1517" selected>1517 - long game</option>
        <option value="1532">1532 - short game</option>
        <option value="tournament">1532 - tournament</option>
        <option value="is_testing">TESTING</option>
      </select>
    </div>
  `;
};
