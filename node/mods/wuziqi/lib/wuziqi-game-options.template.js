module.exports = (app, mod) => {
  return `
    <div class="overlay-input">
      <label for="board_size">Board Size:</label>
      <select class="saito-form-select" id="board_size" name="board_size">
        <option value="9">9</option>
        <option value="11">11</option>
        <option value="13" selected>13</option>
        <option value="15">15</option>
        <option value="17">17</option>
        <option value="19">19</option>
        <option value="21">21</option>
        <option value="23">23</option>
        <option value="25">25</option>
      </select>
    </div>
    <div class="overlay-input">
      <label for="clock">Round time limit:</label>
      <select class="saito-form-select" id="clock" name="clock">
        <option value="0" default>no clock</option>
        <option value="1">1 minute</option>
        <option value="3">3 minutes</option>
        <option value="5">5 minutes</option>
        <option value="10">10 minutes</option>
      </select>
    </div>
  `;
};
