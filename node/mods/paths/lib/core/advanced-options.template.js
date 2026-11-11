module.exports = () => {
  return `
    <div class="overlay-input">
      <label for="hand_size">Hand size:</label>
      <select class="saito-form-select" id="hand_size" name="hand_size">
        <option value="7">7</option>
        <option value="8" selected>8</option>
      </select>
    </div>
    <div class="overlay-input">
      <label for="trench_rolls">Modified trench rolls:</label>
      <select class="saito-form-select" id="trench_rolls" name="trench_rolls">
        <option value="no" selected>no</option>
        <option value="yes">yes</option>
      </select>
    </div>
    <div class="overlay-input">
      <label for="guns_event">Guns of August must be played as an event:</label>
      <select class="saito-form-select" id="guns_event" name="guns_event">
        <option value="no" selected>no</option>
        <option value="yes">yes</option>
      </select>
    </div>
  `;
};
