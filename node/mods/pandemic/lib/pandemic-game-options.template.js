module.exports = (app, mod) => {
  let html = `
      <h3 class="overlay-title">${mod.name} Options</h3>
        <div class="overlay-input">
          <label for="difficulty">Difficulty:</label>
          <select class="saito-form-select" name="difficulty">
            <option value="4">easy</option>
            <option value="5" selected default>not so easy</option>
            <option value="6">damn hard</option>
          </select>
        </div>
      
    `;

  //With checkbox
  html += `<ul style="list-style: none;">
              <li><input class="saito-checkbox" type="checkbox" name="generalist" selected/>Generalist</li>
              <li><input class="saito-checkbox" type="checkbox" name="scientist" selected/>Scientist</li>
              <li><input class="saito-checkbox" type="checkbox" name="medic" selected/>Medic</li>
              <li><input class="saito-checkbox" type="checkbox" name="operationsexpert" selected/>Operations Expert</li>
              <li><input class="saito-checkbox" type="checkbox" name="quarantinespecialist" selected/>Quarantine Specialist</li>
              <li><input class="saito-checkbox" type="checkbox" name="researcher" selected/>Researcher</li>
            </ul><p>Player roles will be selected at random from the checked boxes. If there are more players than selected roles, player roles will be assigned at random from any available option</p>`;

  html += ` <div class="overlay-input">
          <label for="theme">Theme:</label>
          <select class="saito-form-select" name="theme">
            <option value="retro" selected default>Retro</option>
            <option value="classic" >Classic</option>
    
          </select>
        </div>`;
  //<option value="modern">Modern</option>

  return html;
};
