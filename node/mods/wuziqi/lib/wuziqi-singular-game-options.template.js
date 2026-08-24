module.exports = (app, mod) => {
  let html = `<label for="best_of">Best of:</label>
      <div class="overlay-input">
        <select class="saito-form-select" id="best_of" name="best_of">
          <option value="1">1</option>
          <option value="3" selected>3</option>
          <option value="5">5</option>
          <option value="7">7</option>
          <option value="9">9</option>
          <option value="11">11</option>
          <option value="13">13</option>
          <option value="15">15</option>
        </select>
      </div>`;

  return html;
};
