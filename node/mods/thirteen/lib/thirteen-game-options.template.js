module.exports = (app, mod) => {
  let html = `
            <h3 class="overlay-title">Thirteen Days</h3>
            <div class="overlay-input">
            <label for="player1">Play as:</label>
            <select class="saito-form-select" name="player1">
              <option value="random">random</option>
              <option value="ussr" default>USSR</option>
              <option value="us">US</option>
            </select>
            </div>
          `;

  return html;
};
