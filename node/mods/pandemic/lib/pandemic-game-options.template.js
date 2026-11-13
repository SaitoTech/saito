module.exports = (app, mod) => {
  return `
    <div class="overlay-input">
      <label for="difficulty">Difficulty:</label>
      <select class="saito-form-select" id="difficulty" name="difficulty">
        <option value="4">easy</option>
        <option value="5" selected default>not so easy</option>
        <option value="6">damn hard</option>
      </select>
    </div>
    <div class="overlay-input">
      <div class="saito-overlay-form-text">
        <p>Player roles</p>
      </div>
      <div class="advanced-options-checklist">
        <div class="overlay-input">
          <label><input class="saito-checkbox" type="checkbox" name="generalist" /> Generalist</label>
        </div>
        <div class="overlay-input">
          <label><input class="saito-checkbox" type="checkbox" name="scientist" /> Scientist</label>
        </div>
        <div class="overlay-input">
          <label><input class="saito-checkbox" type="checkbox" name="medic" /> Medic</label>
        </div>
        <div class="overlay-input">
          <label><input class="saito-checkbox" type="checkbox" name="operationsexpert" /> Operations Expert</label>
        </div>
        <div class="overlay-input">
          <label><input class="saito-checkbox" type="checkbox" name="quarantinespecialist" /> Quarantine Specialist</label>
        </div>
        <div class="overlay-input">
          <label><input class="saito-checkbox" type="checkbox" name="researcher" /> Researcher</label>
        </div>
      </div>
    </div>
    <div class="saito-overlay-form-text">
      <p>Player roles will be selected at random from the checked boxes. If there are more players than selected roles, player roles will be assigned at random from any available option</p>
    </div>
    <div class="overlay-input">
      <label for="theme">Theme:</label>
      <select class="saito-form-select" id="theme" name="theme">
        <option value="retro" selected default>Retro</option>
        <option value="classic">Classic</option>
      </select>
    </div>
  `;
};
