const PathsScenarios = require('../scenarios');

module.exports = () => {
  let options = PathsScenarios.list().map((scenario) => {
    let selected = scenario.id === "optional" ? " selected" : "";
    return `<option value="${scenario.id}"${selected}>${scenario.label}</option>`;
  }).join("\n            ");
  let html = `
        <label for="deckselect">Scenario:</label>
        <div class="overlay-input">
          <select class="saito-form-select" name="deck" id="deckselect">
            ${options}
          </select>
        </div>
          `;
  return html;
};
